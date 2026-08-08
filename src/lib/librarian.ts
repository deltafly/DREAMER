import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { complete, describeLLM } from '@/lib/llm-client';
import {
  AssociationListSchema,
  LibrarianExtractionSchema,
  injectionGuard,
  joinUntrusted,
  newNonce,
  parseLLMJson,
  wrapUntrusted,
  type LibrarianExtraction,
} from '@/lib/llm-safety';
import { syncFactEmbeddings } from '@/lib/fact-vectors';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
};

async function rebuildBrief(topic: string, workspaceId: number) {
  // v2 delta-brief: kuralt only contains facts, active decisions, project state, preferences
  // Disputes and reviews are served via ESEDÉKES in the brief API, not baked into the markdown
  const [facts, decisions, preferences, states] = await Promise.all([
    db.fact.findMany({
      where: { topic, supersededBy: null, stale: false, workspaceId },
      orderBy: { id: 'asc' },
    }),
    db.decision.findMany({
      where: { topic, status: { in: ['active', 'completed'] }, workspaceId },
      orderBy: { decidedAt: 'desc' },
    }),
    db.preference.findMany({
      where: { active: true, OR: [{ scope: 'global' }, { scope: topic }], workspaceId },
    }),
    db.projectState.findMany({ where: { topic, workspaceId } }),
  ]);

  let md = `# ${topic} — Knowledge Brief\n\n`;
  md += `> Built: ${now()} · ${facts.length} facts · ${decisions.length} decisions · ${states.length} active state keys\n\n`;

  // Active decisions
  if (decisions.length > 0) {
    md += `## Active Decisions\n`;
    decisions.forEach(d => {
      md += `- **${d.decision}** — ${d.rationale}\n`;
      if (d.outcome) md += `  Outcome: ${d.outcome}\n`;
    });
    md += '\n';
  }

  if (facts.length > 0) {
    md += `## Key Facts\n`;
    facts.forEach(f => {
      md += `- **${f.entity}** (${f.attribute}, ${f.confidence}): ${f.statement}\n`;
    });
    md += '\n';
  }

  if (states.length > 0) {
    md += `## Current State\n`;
    states.forEach(s => { md += `- **${s.key}**: ${s.value}\n`; });
    md += '\n';
  }

  const topicPrefs = preferences.filter(p => p.scope === topic);
  if (topicPrefs.length > 0) {
    md += `## Preferences\n`;
    topicPrefs.forEach(p => { md += `- ${p.statement}\n`; });
    md += '\n';
  }

  await db.brief.upsert({
    where: { workspaceId_topic: { workspaceId, topic } },
    update: { content: md.trim(), builtAt: now(), dirty: false },
    create: { workspaceId, topic, content: md.trim(), builtAt: now(), dirty: false },
  });
}

// The extraction shape is defined once, as a Zod schema, in @/lib/llm-safety.
// Deriving the type from the validator keeps "what we accept" and "what we
// believe we have" from drifting apart.
type LLMExtraction = LibrarianExtraction;

/** Auto-associate newly extracted facts with existing facts via LLM */
async function autoAssociate(
  newFactTopics: string[],
  workspaceId: number,
): Promise<number> {
  if (newFactTopics.length === 0) return 0;

  // AI-5: Only load new facts from this run + a capped set of relevant existing facts.
  // Sending ALL existing facts to the LLM wastes tokens and degrades quality.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const newFacts = await db.fact.findMany({ where: { validFrom: { gte: fiveMinAgo }, workspaceId } });

  if (newFacts.length === 0) return 0;

  // Gather topics from new facts, then load top 50 existing facts from same topics
  const newTopics = new Set(newFacts.map(f => f.topic));
  const existingFacts = await db.fact.findMany({
    where: {
      stale: false,
      supersededBy: null,
      workspaceId,
      validFrom: { lt: fiveMinAgo },
      topic: { in: Array.from(newTopics) },
    },
    orderBy: { id: 'desc' },
    take: 50, // AI-5: cap to prevent token bloat
  });

  if (existingFacts.length === 0) return 0;

  // Get existing association keys only for the relevant fact IDs
  const relevantIds = [...newFacts, ...existingFacts].map(f => f.id);
  const existingAssocs = await db.association.findMany({
    where: {
      workspaceId,
      OR: [
        { factIdA: { in: relevantIds } },
        { factIdB: { in: relevantIds } },
      ],
    },
  });
  const existingKeys = new Set(existingAssocs.map(a => `${a.factIdA}-${a.factIdB}-${a.label}`));

  // Fact text is attacker-influenced (it was extracted from ledger content),
  // so this second-order call is fenced exactly like the first-order one.
  const nonce = newNonce();
  const factLine = (f: { id: number; entity: string; attribute: string; statement: string }) =>
    `[id:${f.id}] ${f.entity}/${f.attribute}: ${f.statement}`;
  const newFactsText = wrapUntrusted(newFacts.map(factLine).join('\n'), nonce);
  const existingFactsText = wrapUntrusted(existingFacts.map(factLine).join('\n'), nonce);

  try {
    const response = await complete({
      context: 'librarian.autoAssociate',
      effort: 'low',
      temperature: 0.2,
      system: `${injectionGuard(nonce)}

You are a knowledge graph builder. Find meaningful connections between NEW facts and EXISTING facts.
The [id:N] prefixes are trusted; only ids present in the input may be referenced.
Output ONLY valid JSON array of associations:
[{"factA": <id from new>, "factB": <id from existing>, "label": "supports|contradicts|extends|related|causes|requires", "strength": 0.1-1.0, "description": "brief explanation"}]

Rules:
- label must be one of: supports, contradicts, extends, related, causes, requires
- strength: 1.0 = very strong, 0.1 = weak
- Only suggest connections that are genuinely meaningful
- A new fact about the same entity as an existing fact almost always gets "extends" or "related"
- If one fact enables another, use "causes" or "requires"
- If they say opposite things, use "contradicts"
- Maximum 10 associations`,
      user: `NEW facts (recently extracted):
${newFactsText}

EXISTING facts (already in knowledge base):
${existingFactsText}`,
    });

    const associations = parseLLMJson(
      response.text,
      AssociationListSchema,
      'librarian.autoAssociate',
    );
    if (!associations) return 0;

    // The model may only wire together facts we actually showed it. Without
    // this the reply could name any fact id in the database — including rows
    // belonging to another workspace — and the FK constraint would accept it.
    const allowedIds = new Set([...newFacts, ...existingFacts].map(f => f.id));

    let created = 0;
    for (const assoc of associations) {
      if (!allowedIds.has(assoc.factA) || !allowedIds.has(assoc.factB)) {
        logger.warn('Discarded association referencing an out-of-scope fact id', {
          context: 'librarian.autoAssociate',
          factA: assoc.factA,
          factB: assoc.factB,
          workspaceId,
        });
        continue;
      }
      if (assoc.factA === assoc.factB) continue;

      // Normalize IDs: ensure smaller is A
      const idA = Math.min(assoc.factA, assoc.factB);
      const idB = Math.max(assoc.factA, assoc.factB);
      const key = `${idA}-${idB}-${assoc.label}`;
      if (existingKeys.has(key)) continue;

      try {
        await db.association.create({
          data: {
            factIdA: idA,
            factIdB: idB,
            label: assoc.label,
            strength: assoc.strength,
            createdBy: 'librarian-auto',
            createdAt: now(),
            description: assoc.description ?? null,
            workspaceId,
          },
        });
        created++;
      } catch {
        // Duplicate or FK violation — skip
      }
    }
    return created;
  } catch {
    logger.warn('Auto-association LLM call failed, skipping', { workspaceId });
    return 0;
  }
}

/** Heuristic fallback extraction when LLM is unavailable */
async function heuristicExtraction(
  entry: { id: number; content: string; topic: string; ts: string; source?: string | null; [key: string]: unknown },
  result: { factsExtracted: number; decisionsExtracted: number; disputesCreated: number },
  dirtyTopics: Set<string>,
  workspaceId: number,
) {
  const content = entry.content as string;

  // Decision detection
  if (entry.kind === 'decision' || /decided to|decision:/i.test(content)) {
    const decisionMatch = content.match(/(?:decided to|decision:)\s*(.+?)(?:\.|\n)/i);
    if (decisionMatch) {
      await db.decision.create({
        data: {
          topic: entry.topic ?? 'unknown',
          decision: decisionMatch[1].trim(),
          rationale: 'Extracted from session digest',
          decidedAt: entry.ts as string,
          status: 'active',
          reviewAt: daysFromNow(60),
          workspaceId,
        },
      });
      result.decisionsExtracted++;
      dirtyTopics.add(entry.topic ?? 'unknown');
    }
  }

  // Fact detection — simple heuristic
  const factPattern = /(?:uses?|implements?|configured|deployed|completed)\s+(.+)/gi;
  const matches = [...content.matchAll(factPattern)];

  if (matches.length > 0) {
    const statement = matches[0][0].replace(/\.$/, '').trim();
    if (statement.length >= 15 && statement.length <= 200) {
      const entityGuess = entry.topic ?? 'unknown';
      const attrGuess = matches[0][1]?.split(' ')[0]?.toLowerCase() || 'general';

      const collision = await db.fact.findFirst({
        where: { entity: entityGuess, attribute: attrGuess.slice(0, 50), supersededBy: null, workspaceId },
      });

      if (collision) {
        await db.dispute.create({
          data: {
            createdAt: now(),
            topic: entry.topic ?? 'unknown',
            existingRef: `facts:${collision.id}`,
            incoming: `From ledger:${entry.id} — "${statement}"`,
            detectedBy: 'key-collision',
            status: 'open',
            workspaceId,
          },
        });
        result.disputesCreated++;
      } else {
        await db.fact.create({
          data: {
            topic: entry.topic,
            entity: entityGuess,
            attribute: attrGuess.slice(0, 50),
            statement,
            confidence: 'medium',
            source: `ledger:${entry.id}`,
            validFrom: entry.ts as string,
            reviewAt: daysFromNow(60),
            workspaceId,
          },
        });
        result.factsExtracted++;
      }
      dirtyTopics.add(entry.topic ?? 'unknown');
    }
  }
}

/** Process LLM extraction results into the database */
async function processLLMExtraction(
  extraction: LLMExtraction,
  entries: { id: number; ts: string }[],
  result: { factsExtracted: number; decisionsExtracted: number; disputesCreated: number },
  dirtyTopics: Set<string>,
  workspaceId: number,
) {
  const sourceRefs = entries.map(e => `ledger:${e.id}`).join(', ');

  /**
   * Knowledge is dated from its evidence, not from the moment we happened to
   * extract it. The LLM does not attribute each fact to a single entry, so the
   * batch is dated by its most recent entry: the fact holds as of the latest
   * evidence that produced it.
   *
   * Using the wall clock here would flatten any imported history into one
   * instant, which is exactly what breaks the supersede chain — it decides
   * which fact replaced which by reading this ordering back.
   *
   * `reviewAt` deliberately stays on the wall clock below. It is an
   * operational due-date, not a claim about the past; deriving it from the
   * evidence would dump an entire archive into the review queue on import.
   */
  const evidenceTs = entries.reduce(
    (latest, e) => (e.ts && e.ts > latest ? e.ts : latest),
    entries[0]?.ts ?? now(),
  );

  // Process facts
  for (const fact of extraction.facts) {
    const collision = await db.fact.findFirst({
      where: {
        topic: fact.topic,
        entity: fact.entity,
        attribute: fact.attribute,
        supersededBy: null,
        stale: false,
        workspaceId,
      },
    });

    if (collision) {
      await db.dispute.create({
        data: {
          createdAt: now(),
          topic: fact.topic,
          existingRef: `facts:${collision.id}`,
          incoming: `LLM extracted: "${fact.statement}" (from ${sourceRefs})`,
          detectedBy: 'key-collision',
          status: 'open',
          workspaceId,
        },
      });
      result.disputesCreated++;
    } else {
      await db.fact.create({
        data: {
          topic: fact.topic,
          entity: fact.entity,
          attribute: fact.attribute,
          statement: fact.statement,
          confidence: fact.confidence || 'medium',
          source: sourceRefs,
          validFrom: evidenceTs,
          reviewAt: daysFromNow(fact.review_days || 60),
          workspaceId,
        },
      });
      result.factsExtracted++;
    }
    dirtyTopics.add(fact.topic);
  }

  // Process decisions
  for (const dec of extraction.decisions) {
    await db.decision.create({
      data: {
        topic: dec.topic,
        decision: dec.decision,
        rationale: dec.rationale || 'Not recorded in digest',
        decidedAt: evidenceTs,
        status: 'active',
        reviewAt: daysFromNow(dec.review_days || 60),
        workspaceId,
      },
    });
    result.decisionsExtracted++;
    dirtyTopics.add(dec.topic);
  }

  // Process state changes — upsert
  for (const sc of extraction.state_changes) {
    await db.projectState.upsert({
      where: { workspaceId_topic_key: { workspaceId, topic: sc.topic, key: sc.key } },
      update: { value: sc.value, updatedAt: now() },
      create: {
        workspaceId,
        topic: sc.topic,
        key: sc.key,
        value: sc.value,
        updatedAt: now(),
        expiresAt: daysFromNow(180),
      },
    });
    dirtyTopics.add(sc.topic);
  }

  // Process suspected disputes
  for (const disp of extraction.disputes_suspected) {
    await db.dispute.create({
      data: {
        createdAt: now(),
        topic: disp.topic,
        existingRef: 'llm-suspected',
        incoming: disp.description,
        detectedBy: 'llm-suspicion',
        status: 'open',
        workspaceId,
      },
    });
    result.disputesCreated++;
    dirtyTopics.add(disp.topic);
  }
}

export async function runLibrarian(workspaceId: number): Promise<{ success: boolean; summary: string; [key: string]: unknown }> {
  const runStart = now();

  const run = await db.librarianRun.create({
    data: { startedAt: runStart, status: 'running', workspaceId },
  });

  const result = { factsExtracted: 0, decisionsExtracted: 0, disputesCreated: 0, briefsRebuilt: 0, staleFlagged: 0, associationsCreated: 0 };

  try {
    const dirtyTopics = new Set<string>();

    // 1. Ingest unprocessed ledger rows
    const unprocessed = await db.ledger.findMany({
      where: { processed: false, workspaceId },
      orderBy: { ts: 'asc' },
    });

    // Try LLM-powered extraction
    let llmUsed = false;

    if (unprocessed.length > 0) {
      // Ledger content is fully attacker-controlled. Fence each entry with a
      // per-run nonce so injected text cannot escape into the instruction
      // channel, and keep the trusted metadata OUTSIDE the fence so it cannot
      // be forged from within the content.
      const nonce = newNonce();
      const entriesText = joinUntrusted(
        unprocessed.map(e =>
          `Entry id=${e.id} topic=${JSON.stringify(e.topic)} kind=${JSON.stringify(e.kind)}\n` +
          wrapUntrusted(e.content, nonce),
        ),
      );

      try {
        const response = await complete({
          context: 'librarian.extract',
          effort: 'low',
          temperature: 0.1,
          system: `${injectionGuard(nonce)}

You are the OneBrainer Librarian. Extract structured knowledge from session digests.
Output ONLY valid JSON matching this schema:
{
  "facts": [{"topic":"string","entity":"string","attribute":"string","statement":"one sentence string","confidence":"high|medium|low","review_days": 60}],
  "decisions": [{"topic":"string","decision":"string","rationale":"string or 'Not recorded'","review_days": 60}],
  "state_changes": [{"topic":"string","key":"string","value":"string"}],
  "disputes_suspected": [{"topic":"string","description":"string"}],
  "open_threads": [{"topic":"string","thread":"string"}]
}
Rules:
- FACT = assertion about the world/system that will be true for weeks. Must have entity+attribute. NOT opinions or temporary state.
- DECISION = explicit choice between alternatives, with rationale. If rationale missing, write "Not recorded in digest".
- If unsure, omit it. Better to miss a fact than fabricate one.
- review_days: volatile=30, structural=180, default=60
- Maximum 50 facts, 25 of everything else, across the whole reply.`,
          user: `Process these session digests:\n\n${entriesText}`,
        });

        // Validate before anything reaches the database. A reply that does not
        // match the contract is discarded wholesale and we fall back to the
        // heuristic path — a compromised model cannot widen its own schema.
        const extraction = parseLLMJson(
          response.text,
          LibrarianExtractionSchema,
          'librarian.extract',
        );
        if (!extraction) throw new Error('LLM extraction failed validation');

        const sourceEntries = unprocessed.map(e => ({ id: e.id, ts: e.ts }));
        await processLLMExtraction(extraction, sourceEntries, result, dirtyTopics, workspaceId);
        llmUsed = true;
      } catch (llmError) {
        // LLM failed — fall back to heuristic extraction
        console.warn('LLM extraction failed, falling back to heuristic:', llmError);
        for (const entry of unprocessed) {
          await heuristicExtraction(entry, result, dirtyTopics, workspaceId);
        }
      }

      // AI-1: Batch mark all entries as processed (1 query instead of N)
      if (unprocessed.length > 0) {
        await db.ledger.updateMany({
          where: { id: { in: unprocessed.map(e => e.id) } },
          data: { processed: true },
        });
      }
    }

    // 2. Auto-associate newly extracted facts with existing knowledge
    if (llmUsed && result.factsExtracted > 0) {
      const assocCount = await autoAssociate([...dirtyTopics], workspaceId);
      result.associationsCreated = assocCount;
    }

    // 3. Maintenance — flag stale facts
    const staleFacts = await db.fact.findMany({
      where: { reviewAt: { lte: now() }, stale: false, supersededBy: null, workspaceId },
    });
    for (const fact of staleFacts) {
      await db.fact.update({ where: { id: fact.id }, data: { stale: true } });
      result.staleFlagged++;
      dirtyTopics.add(fact.topic);
    }

    // 4. MEM-4: Neural activity retention cleanup
    // Delete neural activity older than 30 days to prevent unbounded table growth
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const deleted = await db.neuralActivity.deleteMany({
      where: { workspaceId, createdAt: { lt: thirtyDaysAgo } },
    });
    if (deleted.count > 0) {
      // Also clean up old brain queries older than 90 days
      await db.brainQuery.deleteMany({
        where: { workspaceId, queriedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19) } },
      });
    }

    // 4b. Bring fact vectors up to date, if the semantic path is configured.
    // Runs after staleness flagging so freshly stale facts are skipped, and
    // never throws — a provider outage leaves the vectors for the next run
    // while queries carry on with keyword seeding.
    const embeddingSync = await syncFactEmbeddings(workspaceId);

    // 5. Rebuild dirty briefs
    const disputeTopics = await db.dispute.findMany({ where: { status: 'open', workspaceId }, select: { topic: true }, distinct: ['topic'] });
    for (const t of disputeTopics) dirtyTopics.add(t.topic);

    for (const topic of dirtyTopics) {
      await rebuildBrief(topic, workspaceId);
      result.briefsRebuilt++;
    }

    const method = llmUsed ? `LLM (${describeLLM()})` : 'heuristic';
    const embeddingNote = embeddingSync.model
      ? ` Embedded ${embeddingSync.embedded} facts${embeddingSync.pending > 0 ? `, ${embeddingSync.pending} pending` : ''}${embeddingSync.error ? ` (failed: ${embeddingSync.error})` : ''}.`
      : '';
    const summary = `Processed ${unprocessed.length} entries via ${method}. Extracted ${result.factsExtracted} facts, ${result.decisionsExtracted} decisions. ${result.disputesCreated} disputes. ${result.associationsCreated} auto-associations. Rebuilt ${result.briefsRebuilt} briefs. Flagged ${result.staleFlagged} stale.${embeddingNote}`;

    await db.librarianRun.update({
      where: { id: run.id },
      data: {
        endedAt: now(),
        status: 'completed',
        summary,
        factsExtracted: result.factsExtracted,
        decisionsExtracted: result.decisionsExtracted,
        disputesCreated: result.disputesCreated,
        briefsRebuilt: result.briefsRebuilt,
        staleFlagged: result.staleFlagged,
      },
    });

    return { success: true, runId: run.id, ...result, summary, method };
  } catch (error) {
    await db.librarianRun.update({
      where: { id: run.id },
      data: {
        endedAt: now(),
        status: 'failed',
        summary: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    return { success: false, summary: 'Librarian failed', error: error instanceof Error ? error.message : 'Unknown' };
  }
}