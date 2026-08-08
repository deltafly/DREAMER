import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { complete } from '@/lib/llm-client';
import {
  DreamerBatchSchema,
  injectionGuard,
  joinUntrusted,
  newNonce,
  parseLLMJson,
  wrapUntrusted,
} from '@/lib/llm-safety';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const VALID_LABELS = ['supports', 'contradicts', 'extends', 'related', 'causes', 'requires'] as const;
const SPARK_KINDS = ['analogy', 'contradiction', 'opportunity', 'risk', 'missing-link', 'optimization'] as const;
const BUDGET = 30;
const EPSILON = 0.15;
const PAIRS_PER_LLM_CALL = 5; // AI-4: batch 5 pairs into one LLM call (30→6 calls)
const FACTS_PER_TOPIC_CAP = 20; // MEM-2: cap facts loaded per topic

interface TopicPair {
  topicA: string;
  topicB: string;
  weight: number;
}

/** ε-greedy topic pair selection using SparkWeight bandit state.
 *  Optimized: O(n²) CPU total (no materialized pair array), O(budget) memory.
 *  For large topic counts (>MAX_TOPICS), only the top topics by fact count are used. */
const MAX_TOPICS = 50;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function selectPairs(workspaceId: number, budget: number): Promise<TopicPair[]> {
  const topicCounts = await db.fact.groupBy({
    by: ['topic'],
    where: { stale: false, supersededBy: null, workspaceId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  let topics = topicCounts.map(t => t.topic);
  if (topics.length < 2) return [];

  if (topics.length > MAX_TOPICS) {
    topics = topics.slice(0, MAX_TOPICS);
  }

  const weights = await db.sparkWeight.findMany({ where: { workspaceId } });
  const weightMap = new Map(weights.map(w => [w.topicPair, w]));
  const totalTrials = weights.reduce((s, w) => s + w.trials, 0) || 1;

  const ucbWeight = (key: string): number => {
    const bw = weightMap.get(key);
    if (bw && bw.trials > 0) {
      return (bw.hits / bw.trials) + Math.sqrt(Math.log(totalTrials) / bw.trials);
    }
    return 0.5;
  };

  const selected: TopicPair[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < budget; i++) {
    let pick: TopicPair | null = null;

    if (Math.random() < EPSILON) {
      for (let attempt = 0; attempt < topics.length * 2; attempt++) {
        const a = topics[Math.floor(Math.random() * topics.length)];
        const b = topics[Math.floor(Math.random() * topics.length)];
        if (a === b) continue;
        const key = pairKey(a, b);
        if (usedKeys.has(key)) continue;
        const bw = weightMap.get(key);
        if (bw && bw.trials > 0) continue;
        pick = { topicA: a, topicB: b, weight: ucbWeight(key) };
        break;
      }
      if (!pick) {
        for (let attempt = 0; attempt < topics.length * 2; attempt++) {
          const a = topics[Math.floor(Math.random() * topics.length)];
          const b = topics[Math.floor(Math.random() * topics.length)];
          if (a === b) continue;
          const key = pairKey(a, b);
          if (usedKeys.has(key)) continue;
          pick = { topicA: a, topicB: b, weight: ucbWeight(key) };
          break;
        }
      }
    } else {
      let bestWeight = -Infinity;
      for (let ti = 0; ti < topics.length; ti++) {
        const a = topics[ti];
        for (let tj = ti + 1; tj < topics.length; tj++) {
          const b = topics[tj];
          const key = pairKey(a, b);
          if (usedKeys.has(key)) continue;
          const w = ucbWeight(key);
          if (w > bestWeight) {
            bestWeight = w;
            pick = { topicA: a, topicB: b, weight: w };
          }
        }
      }
    }

    if (!pick) break;
    usedKeys.add(pairKey(pick.topicA, pick.topicB));
    selected.push(pick);
  }

  return selected;
}

/**
 * AI-4: Batch collide multiple topic pairs in a single LLM call.
 * Instead of 1 LLM call per pair (30 calls), we batch 5 pairs per call (6 calls).
 * This cuts LLM cost by ~80% with minimal quality impact.
 */
async function collideTopicsBatch(
  pairs: TopicPair[],
  factsByTopic: Map<string, { id: number; entity: string; attribute: string; statement: string }[]>,
  workspaceId: number,
): Promise<{
  sparks: { insight: string; kind: string; score: number; seedRef: string; pairedRef: string; topicA: string; topicB: string }[];
  associations: { factA: number; factB: number; label: string; strength: number; description: string | null }[];
}> {
  // Fact statements originate from attacker-controlled ledger text, so the
  // whole payload is fenced. Pair indices and topic names stay outside the
  // fence — otherwise injected text could invent a "PAIR 7" and steer results.
  const nonce = newNonce();
  const allowedFactIds = new Set<number>();
  const topicBlocks = pairs.map((pair, idx) => {
    const factsA = (factsByTopic.get(pair.topicA) || []).slice(0, FACTS_PER_TOPIC_CAP);
    const factsB = (factsByTopic.get(pair.topicB) || []).slice(0, FACTS_PER_TOPIC_CAP);
    [...factsA, ...factsB].forEach(f => allowedFactIds.add(f.id));
    const render = (facts: typeof factsA) =>
      facts.map(f => `[${f.id}] ${f.entity}/${f.attribute}: ${f.statement}`).join('\n') || '(none)';
    return `PAIR ${idx} — TOPIC A: ${JSON.stringify(pair.topicA)} · TOPIC B: ${JSON.stringify(pair.topicB)}\n` +
      wrapUntrusted(`TOPIC A facts:\n${render(factsA)}\n\nTOPIC B facts:\n${render(factsB)}`, nonce);
  });
  const topicBlocksText = joinUntrusted(topicBlocks);

  try {
    // Cross-topic association is the one genuinely creative call in the
    // system, so it runs at higher effort and temperature than extraction.
    const response = await complete({
      context: 'dreamer.collide',
      effort: 'medium',
      temperature: 0.7,
      system: `${injectionGuard(nonce)}

You are the OneBrainer Dreamer — an associative thinking engine. You receive MULTIPLE pairs of topics and must find sparks and associations for EACH pair independently.

Output ONLY valid JSON:
{
  "results": [
    {
      "pairIndex": <number 0-based>,
      "sparks": [{"insight": "one sentence", "kind": "analogy|contradiction|opportunity|risk|missing-link|optimization", "score": 0.0-1.0, "seedFactId": <number>, "pairedFactId": <number>}],
      "associations": [{"factA": <id>, "factB": <id>, "label": "supports|contradicts|extends|related|causes|requires", "strength": 0.1-1.0, "description": "brief"}]
    }
  ]
}

Rules:
- Each pairIndex must correspond to the numbered pair in the input
- SPARKS should be SURPRISING and USEFUL — not obvious restatements
- kind: analogy=similar pattern, contradiction=opposing, opportunity=untapped potential, risk=danger, missing-link=gap, optimization=efficiency
- Maximum 3 sparks and 5 associations PER PAIR
- If no meaningful connections exist for a pair, return empty arrays for it
- fact IDs must be actual IDs from the input facts`,
      user: `Process these ${pairs.length} topic pairs:\n\n${topicBlocksText}`,
    });

    // Schema validation replaces the hand-rolled filters below: enums, score
    // clamping and per-pair caps are all enforced by DreamerBatchSchema.
    const result = parseLLMJson(
      response.text,
      DreamerBatchSchema,
      'dreamer.collide',
    );
    if (!result) return { sparks: [], associations: [] };
    const batchResults = result.results;

    const allSparks: { insight: string; kind: string; score: number; seedRef: string; pairedRef: string; topicA: string; topicB: string }[] = [];
    const allAssocs: { factA: number; factB: number; label: string; strength: number; description: string | null }[] = [];

    for (const batchResult of batchResults) {
      const pair = pairs[batchResult.pairIndex];
      if (!pair) continue;

      // Sparks may only cite facts that were actually in this prompt.
      const sparks = batchResult.sparks
        .filter(s => allowedFactIds.has(s.seedFactId) && allowedFactIds.has(s.pairedFactId))
        .map(s => ({
          insight: s.insight,
          kind: s.kind,
          score: s.score,
          seedRef: `facts:${s.seedFactId}`,
          pairedRef: `facts:${s.pairedFactId}`,
          topicA: pair.topicA,
          topicB: pair.topicB,
        }));

      // Same containment for associations — an id we never sent is discarded
      // rather than written, which keeps cross-workspace links impossible.
      const associations = batchResult.associations
        .filter(a => a.factA !== a.factB && allowedFactIds.has(a.factA) && allowedFactIds.has(a.factB))
        .map(a => ({
          factA: Math.min(a.factA, a.factB),
          factB: Math.max(a.factA, a.factB),
          label: a.label,
          strength: Math.min(Math.max(a.strength, 0.1), 1),
          description: a.description ?? null,
        }));

      allSparks.push(...sparks);
      allAssocs.push(...associations);
    }

    return { sparks: allSparks, associations: allAssocs };
  } catch {
    logger.warn('Dreamer batched LLM collision failed', { pairs: pairs.length, workspaceId });
    return { sparks: [], associations: [] };
  }
}

export async function runDreamer(workspaceId: number): Promise<{ success: boolean; summary: string; [key: string]: unknown }> {
  const runStart = now();

  try {
    const pairs = await selectPairs(workspaceId, BUDGET);

    if (pairs.length === 0) {
      return {
        success: true,
        summary: 'Not enough topics with facts to run Dreamer (need at least 2).',
        pairsSelected: 0,
        sparksCreated: 0,
        associationsCreated: 0,
        duration: 0,
      };
    }

    const allTopics = new Set<string>();
    for (const p of pairs) {
      allTopics.add(p.topicA);
      allTopics.add(p.topicB);
    }

    // MEM-2: Cap facts per topic to prevent memory bloat
    const factsByTopic = new Map<string, { id: number; entity: string; attribute: string; statement: string }[]>();
    for (const topic of allTopics) {
      const facts = await db.fact.findMany({
        where: { topic, stale: false, supersededBy: null, workspaceId },
        orderBy: { id: 'desc' },
        take: FACTS_PER_TOPIC_CAP,
      });
      factsByTopic.set(topic, facts);
    }

    // Pre-load existing association keys for the selected topics
    const selectedFactIds = new Set<number>();
    for (const [, facts] of factsByTopic.entries()) {
      facts.forEach(f => selectedFactIds.add(f.id));
    }
    const relevantAssocs = selectedFactIds.size > 0
      ? await db.association.findMany({
          where: {
            workspaceId,
            OR: Array.from(selectedFactIds).slice(0, 500).map(id => ({ factIdA: id })),
          },
        })
      : [];
    const existingAssocKeys = new Set(
      relevantAssocs
        .filter(a => selectedFactIds.has(a.factIdA) && selectedFactIds.has(a.factIdB))
        .map(a => `${a.factIdA}-${a.factIdB}-${a.label}`)
    );

    let totalSparks = 0;
    let totalAssocs = 0;
    let llmCallsMade = 0;

    // AI-4: Batch pairs into groups of PAIRS_PER_LLM_CALL for fewer LLM calls
    for (let batchStart = 0; batchStart < pairs.length; batchStart += PAIRS_PER_LLM_CALL) {
      const batchPairs = pairs.slice(batchStart, batchStart + PAIRS_PER_LLM_CALL);

      const { sparks, associations } = await collideTopicsBatch(batchPairs, factsByTopic, workspaceId);
      llmCallsMade++;

      for (const spark of sparks) {
        try {
          await db.spark.create({
            data: {
              createdAt: runStart,
              seedRef: (spark as { seedRef: string }).seedRef,
              pairedRef: (spark as { pairedRef: string }).pairedRef,
              seedTopic: (spark as { topicA: string }).topicA,
              pairedTopic: (spark as { topicB: string }).topicB,
              insight: (spark as { insight: string }).insight,
              kind: (spark as { kind: string }).kind,
              score: (spark as { score: number }).score,
              workspaceId,
            },
          });
          totalSparks++;
        } catch {
          // Skip on error
        }
      }

      for (const assoc of associations) {
        const key = `${assoc.factA}-${assoc.factB}-${assoc.label}`;
        if (existingAssocKeys.has(key)) continue;

        try {
          await db.association.create({
            data: {
              factIdA: assoc.factA,
              factIdB: assoc.factB,
              label: assoc.label,
              strength: assoc.strength,
              createdBy: 'dreamer',
              createdAt: runStart,
              description: assoc.description || null,
              workspaceId,
            },
          });
          existingAssocKeys.add(key);
          totalAssocs++;
        } catch {
          // Skip on FK violation or duplicate
        }
      }

      // Update bandit weights for this batch
      for (const pair of batchPairs) {
        const topicPair = pairKey(pair.topicA, pair.topicB);
        await db.sparkWeight.upsert({
          where: { workspaceId_topicPair: { workspaceId, topicPair } },
          update: { trials: { increment: 1 } },
          create: { workspaceId, topicPair, trials: 1, hits: 0 },
        });
      }
    }

    const duration = Date.now() - new Date(runStart).getTime();
    const summary = `Dreamer: ${pairs.length} pairs in ${llmCallsMade} LLM calls, ${totalSparks} sparks, ${totalAssocs} cross-topic associations. Budget=${BUDGET}, epsilon=${EPSILON}, batch=${PAIRS_PER_LLM_CALL}. ${duration}ms.`;

    return {
      success: true,
      summary,
      pairsSelected: pairs.length,
      llmCallsMade,
      sparksCreated: totalSparks,
      associationsCreated: totalAssocs,
      duration,
      pairs: pairs.map(p => ({
        topicA: p.topicA,
        topicB: p.topicB,
        weight: Math.round(p.weight * 100) / 100,
      })),
    };
  } catch (error) {
    return { success: false, summary: 'Dreamer failed', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}