/**
 * OneBrainer Benchmark Harness
 *
 * Measures brain/query recall against a question set with known answers.
 * Pipeline: evidence sessions → ledger (backdated) → librarian → brain/query → LLM judge.
 *
 * Design goals:
 * - Efficient: single librarian run for all evidence, then per-question query+judge
 * - Observable: per-question breakdown by type (single_session / multi_session / temporal)
 * - Honest: LLM judge scores 0.0-1.0, not just binary correct/incorrect
 * - Cheap: gpt-4o-mini for both extraction and judge, ~$0.50 for 50 questions
 */

import { db } from '@/lib/db';
import { executeBrainQuery, type BrainQueryResult } from '@/lib/brain-query';
import { runLibrarian } from '@/lib/librarian';

// ===== Types =====

export interface EvidenceSession {
  topic: string;
  content: string;
  ts: string; // backdated, e.g. "2025-01-15 14:30"
  kind?: string;
}

export interface BenchmarkQuestion {
  id: string;
  type: 'single_session' | 'multi_session' | 'temporal';
  question: string;
  expectedAnswer: string;
  evidenceSessions: EvidenceSession[];
}

export interface JudgeVerdict {
  correct: boolean;
  score: number; // 0.0–1.0
  reason: string;
}

export interface QuestionResult {
  questionId: string;
  question: string;
  type: string;
  factsReturned: number;
  seedFacts: number;
  spreadFacts: number;
  expansionEnabled: boolean;
  expansionSucceeded: boolean;
  topStatements: string[]; // top 5 fact statements for debugging
  judgeVerdict: JudgeVerdict;
  timingMs: {
    query: number;
    judge: number;
  };
}

export interface BenchmarkReport {
  id: string;
  workspaceId: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  error?: string;
  ingestion: {
    sessions: number;
    ledgerEntries: number;
    librarianFacts: number;
    librarianDecisions: number;
    librarianAssociations: number;
    librarianMs: number;
  };
  results: QuestionResult[];
  summary: {
    total: number;
    correct: number;
    avgScore: number;
    byType: Record<string, { total: number; correct: number; avgScore: number }>;
  };
}

// ===== Lazy ZAI loader =====
let _zai: Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>> | null = null;
async function getZAI() {
  if (!_zai) {
    const mod = await import('z-ai-web-dev-sdk');
    _zai = await mod.default.create();
  }
  return _zai;
}

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ===== Judge =====

const JUDGE_SYSTEM_PROMPT = `You are an evaluator for a knowledge retrieval system. You will receive:
1. A QUESTION
2. The EXPECTED ANSWER (ground truth)
3. RETRIEVED FACTS from the system

Your job: determine if the retrieved facts contain SUFFICIENT INFORMATION to correctly answer the question.

Scoring:
- 1.0 = The expected answer is directly present or clearly derivable from the facts
- 0.7 = Most of the answer is present, minor details missing
- 0.5 = Partially present — some relevant facts but key information missing
- 0.3 = Tangentially related but insufficient to answer
- 0.0 = Completely irrelevant or missing

Be GENEROUS with 0.5+ if the facts are on-topic and contain relevant information, even if not perfectly matching the expected answer. The goal is to measure recall, not exact phrasing.

Output ONLY valid JSON: {"correct": boolean, "score": 0.0-1.0, "reason": "one sentence explanation"}`;

async function judgeResult(
  question: string,
  expectedAnswer: string,
  facts: BrainQueryResult['results'],
): Promise<JudgeVerdict> {
  const zai = await getZAI();

  const factsText = facts.length === 0
    ? '(No facts returned)'
    : facts.map((r, i) => `${i + 1}. [${r.fact.topic}] ${r.fact.entity}/${r.fact.attribute}: ${r.fact.statement} (activation: ${r.activation})`).join('\n');

  const response = await zai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nEXPECTED ANSWER: ${expectedAnswer}\n\nRETRIEVED FACTS:\n${factsText}`,
      },
    ],
    temperature: 0.0,
    max_tokens: 300,
  });

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return { correct: false, score: 0, reason: 'Judge returned empty response' };

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { correct: false, score: 0, reason: 'Judge returned invalid JSON' };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      correct: !!parsed.correct,
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : 'No reason given',
    };
  } catch {
    return { correct: false, score: 0, reason: 'Judge JSON parse failed' };
  }
}

// ===== Main Benchmark Runner =====

export async function runBenchmark(
  workspaceId: number,
  questions: BenchmarkQuestion[],
  options?: { queryLimit?: number },
): Promise<BenchmarkReport> {
  const reportId = `bench-${Date.now()}`;
  const startTime = now();
  const report: BenchmarkReport = {
    id: reportId,
    workspaceId,
    status: 'running',
    startedAt: startTime,
    ingestion: { sessions: 0, ledgerEntries: 0, librarianFacts: 0, librarianDecisions: 0, librarianAssociations: 0, librarianMs: 0 },
    results: [],
    summary: { total: questions.length, correct: 0, avgScore: 0, byType: {} },
  };

  try {
    // ===== PHASE 1: INGESTION =====
    let totalEntries = 0;
    for (const q of questions) {
      for (const session of q.evidenceSessions) {
        await db.ledger.create({
          data: {
            ts: session.ts.replace('T', ' ').padEnd(19, '0').slice(0, 19),
            topic: session.topic,
            content: session.content,
            kind: session.kind || 'digest',
            agentId: 'benchmark-harness',
            processed: false,
            workspaceId,
          },
        });
        totalEntries++;
      }
    }
    report.ingestion.sessions = questions.reduce((acc, q) => acc + q.evidenceSessions.length, 0);
    report.ingestion.ledgerEntries = totalEntries;

    // ===== PHASE 2: LIBRARIAN (single run for all evidence) =====
    const libStart = Date.now();
    const libResult = await runLibrarian(workspaceId);
    const libMs = Date.now() - libStart;
    report.ingestion.librarianMs = libMs;
    report.ingestion.librarianFacts = (libResult.factsExtracted as number) ?? 0;
    report.ingestion.librarianDecisions = (libResult.decisionsExtracted as number) ?? 0;
    report.ingestion.librarianAssociations = (libResult.associationsCreated as number) ?? 0;

    // ===== PHASE 3: QUERY + JUDGE per question =====
    for (const q of questions) {
      const queryStart = Date.now();
      const queryResult = await executeBrainQuery(workspaceId, q.question, {
        limit: options?.queryLimit ?? 10,
      });
      const queryMs = Date.now() - queryStart;

      const judgeStart = Date.now();
      const verdict = await judgeResult(q.question, q.expectedAnswer, queryResult.results);
      const judgeMs = Date.now() - judgeStart;

      const result: QuestionResult = {
        questionId: q.id,
        question: q.question,
        type: q.type,
        factsReturned: queryResult.results.length,
        seedFacts: queryResult.neural.seedFacts,
        spreadFacts: queryResult.neural.spreadFacts,
        expansionEnabled: queryResult.neural.lazyLoaded,
        expansionSucceeded: queryResult.neural.lazyLoaded,
        topStatements: queryResult.results.slice(0, 5).map(r => r.fact.statement),
        judgeVerdict: verdict,
        timingMs: { query: queryMs, judge: judgeMs },
      };
      report.results.push(result);
    }

    // ===== PHASE 4: AGGREGATE =====
    let correct = 0;
    let totalScore = 0;
    const byType: Record<string, { total: number; correct: number; totalScore: number }> = {};

    for (const r of report.results) {
      if (r.judgeVerdict.correct) correct++;
      totalScore += r.judgeVerdict.score;

      if (!byType[r.type]) byType[r.type] = { total: 0, correct: 0, totalScore: 0 };
      byType[r.type].total++;
      if (r.judgeVerdict.correct) byType[r.type].correct++;
      byType[r.type].totalScore += r.judgeVerdict.score;
    }

    report.summary.correct = correct;
    report.summary.avgScore = report.results.length > 0 ? Math.round((totalScore / report.results.length) * 1000) / 1000 : 0;
    for (const [type, data] of Object.entries(byType)) {
      report.summary.byType[type] = {
        total: data.total,
        correct: data.correct,
        avgScore: Math.round((data.totalScore / data.total) * 1000) / 1000,
      };
    }

    report.status = 'completed';
    report.endedAt = now();
  } catch (error) {
    report.status = 'failed';
    report.endedAt = now();
    report.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return report;
}