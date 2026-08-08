import { db } from '@/lib/db';
import { z } from 'zod';
import { TABLES } from '@/lib/sql-tables';
import { logger } from '@/lib/logger';
import { embedOne, embeddingsEnabled } from '@/lib/embeddings';
import { semanticSeeds } from '@/lib/fact-vectors';

// ===== Configuration =====
const SEED_ASSOCIATION_BATCH = 200; // max associations to load per batch

// Raw SQL below names its tables as text — see src/lib/sql-tables.ts for why
// these are constants rather than literals.
const FACT_TABLE = TABLES.fact;
const ASSOCIATION_TABLE = TABLES.association;

// ===== Input Schema =====
const BrainQueryInput = z.object({
  context: z.string().min(2).max(5000),
  limit: z.number().int().min(1).max(50).optional().default(10),
  iterations: z.number().int().min(1).max(5).optional().default(3),
  activationThreshold: z.number().min(0).max(1).optional().default(0.05),
});

// ===== Return Type =====
export interface BrainQueryResult {
  results: {
    fact: {
      id: number;
      topic: string;
      entity: string;
      attribute: string;
      statement: string;
      confidence: string;
    };
    activation: number;
    isSeed: boolean;
    reason: string;
  }[];
  neural: {
    totalActivated: number;
    seedFacts: number;
    spreadFacts: number;
    associationsFired: number;
    hebbianUpdates: number;
    iterations: number;
    activationThreshold: number;
    lazyLoaded: boolean;
  };
  /**
   * How the seed set was built. Reported rather than assumed: whether the
   * semantic path actually contributed is the difference between measuring
   * hybrid retrieval and measuring keyword retrieval with extra steps.
   */
  seeding: {
    strategy: 'keyword' | 'hybrid';
    keywordSeeds: number;
    /** Seeds found by meaning, including ones the keyword pass also found. */
    semanticSeeds: number;
    /** Seeds the keyword pass alone would have missed entirely. */
    semanticOnlySeeds: number;
    vectorsScanned: number;
    /** Set when the semantic path was configured but did not run. */
    semanticError?: string;
  };
}

// ===== Stop Words =====
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'she', 'him', 'her', 'his', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom',
]);

/**
 * SECURITY-CRITICAL: this tokeniser is what makes the raw SQL below safe.
 *
 * The split pattern is a strict character ALLOW-LIST — a token can only ever consist of
 * [a-z0-9áéíóöőúüű], so a quote, backslash, semicolon or comment marker can never survive
 * into the interpolated LIKE clause in the seed query.
 *
 * Do NOT widen this regex without first converting that query to parameterised bindings.
 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-z0-9áéíóöőúüű]+/).filter(Boolean);
  const unique = new Set<string>();
  for (const token of tokens) {
    if (token.length > 1 && !STOP_WORDS.has(token)) {
      unique.add(token);
    }
  }
  return Array.from(unique);
}

/**
 * SPREADING ACTIVATION NEURAL QUERY (Optimized v2)
 *
 * Key optimizations over v1:
 * - MEM-1: Lazy association loading — only loads facts/assocs that get activated,
 *   not the entire graph. DB-level keyword filtering for seeds.
 * - AI-2: Batched Hebbian updates via raw SQL (N+1 → 1 query)
 * - AI-3: Batched fact activation updates via raw SQL (N+1 → 1 query)
 *
 * Pipeline:
 * 1. DB-level keyword match → seed fact IDs (LIMIT 200)
 * 2. Load only seed facts + their associations into memory
 * 3. Score seeds, iterate spreading (lazy-load new neighbor facts/assocs per iteration)
 * 4. Batch Hebbian + activation updates
 */
export async function executeBrainQuery(
  workspaceId: number,
  context: string,
  options?: { limit?: number; iterations?: number; activationThreshold?: number },
): Promise<BrainQueryResult> {
  const parsed = BrainQueryInput.safeParse({ context, ...options });
  if (!parsed.success) {
    throw new Error(`Invalid brain query input: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  }

  const { limit, iterations, activationThreshold } = parsed.data;
  const keywords = extractKeywords(context);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // ===== Lazy loading infrastructure =====
  // Instead of loading ALL facts + ALL associations into memory,
  // we only load what's needed as the spreading progresses.

  type FactRow = {
    id: number;
    topic: string;
    entity: string;
    attribute: string;
    statement: string;
    confidence: string;
  };

  type AdjEntry = {
    neighborId: number;
    association: { id: number; label: string; activationWeight: number; strength: number; fireCount: number; factIdA: number; factIdB: number };
  };

  const adjacency = new Map<number, AdjEntry[]>();
  const factMap = new Map<number, FactRow>();
  const loadedFactIds = new Set<number>();
  const allLoadedAssocIds = new Set<number>();

  /** Load facts by IDs (batched, skips already-loaded) */
  async function loadFacts(ids: number[]) {
    const toLoad = ids.filter(id => !loadedFactIds.has(id));
    if (toLoad.length === 0) return;
    const cap = Math.min(toLoad.length, SEED_ASSOCIATION_BATCH * 2);
    const batch = toLoad.slice(0, cap);
    const rows = await db.fact.findMany({
      where: { id: { in: batch }, workspaceId },
    });
    for (const f of rows) {
      factMap.set(f.id, f as FactRow);
      loadedFactIds.add(f.id);
    }
  }

  /** Load associations for given fact IDs, then load any unloaded neighbor facts */
  async function loadAssociationsFor(factIds: number[]) {
    const toLoad = factIds.filter(id => !adjacency.has(id));
    if (toLoad.length === 0) return;
    const batch = toLoad.slice(0, SEED_ASSOCIATION_BATCH);
    const assocs = await db.association.findMany({
      where: {
        workspaceId,
        OR: [
          { factIdA: { in: batch } },
          { factIdB: { in: batch } },
        ],
      },
    });

    const neighborIds = new Set<number>();
    for (const assoc of assocs) {
      if (!allLoadedAssocIds.has(assoc.id)) {
        allLoadedAssocIds.add(assoc.id);
        if (!adjacency.has(assoc.factIdA)) adjacency.set(assoc.factIdA, []);
        if (!adjacency.has(assoc.factIdB)) adjacency.set(assoc.factIdB, []);
        (adjacency.get(assoc.factIdA)!).push({ neighborId: assoc.factIdB, association: assoc });
        (adjacency.get(assoc.factIdB)!).push({ neighborId: assoc.factIdA, association: assoc });
        if (loadedFactIds.has(assoc.factIdA)) neighborIds.add(assoc.factIdB);
        if (loadedFactIds.has(assoc.factIdB)) neighborIds.add(assoc.factIdA);
      }
    }
    if (neighborIds.size > 0) {
      await loadFacts(Array.from(neighborIds));
    }
  }

  // ===== SEED: DB-level keyword filtering =====
  // Instead of loading ALL facts and scanning in JS, we use SQL LIKE
  // to find only the facts that match at least one keyword.
  // This is O(matching_facts) instead of O(all_facts) in memory.

  const escapedKws = keywords.map(kw => kw.replace(/'/g, "''"));
  const kwConditions = escapedKws
    .map(kw => `(
      LOWER(topic) LIKE '%${kw}%' OR
      LOWER(entity) LIKE '%${kw}%' OR
      LOWER(attribute) LIKE '%${kw}%' OR
      LOWER(statement) LIKE '%${kw}%'
    )`)
    .join(' OR ');

  let seedFactIds: number[] = [];
  if (kwConditions) {
    // RAW SQL 1/3 — safe by construction: every `kw` comes from extractKeywords()'s
    // character allow-list, and `workspaceId` is a number resolved by getWorkspaceId().
    // Prisma cannot parameterise a variable-length OR/LIKE chain, hence the raw call.
    const rows = await db.$queryRawUnsafe<{ id: number }[]>(
      `SELECT id FROM ${FACT_TABLE} WHERE supersededBy IS NULL AND stale = 0 AND workspaceId = ${workspaceId} AND (${kwConditions}) LIMIT 200`
    );
    seedFactIds = rows.map(r => r.id);
  }

  // Load seed facts and their initial associations
  await loadFacts(seedFactIds);
  await loadAssociationsFor(seedFactIds);

  // === PHASE 1: SEED ACTIVATION ===
  const activation = new Map<number, number>();
  const seedReasons = new Map<number, string[]>();
  const traversedAssociations = new Set<number>();

  for (const factId of seedFactIds) {
    const fact = factMap.get(factId);
    if (!fact) continue;

    let score = 0;
    const reasons: string[] = [];

    const topicLower = fact.topic.toLowerCase();
    for (const kw of keywords) {
      if (topicLower.includes(kw) || kw.includes(topicLower)) {
        score += 3;
        reasons.push(`Topic "${fact.topic}" matches "${kw}"`);
        break;
      }
    }

    const entityLower = fact.entity.toLowerCase().replace(/-/g, ' ').replace(/\//g, ' ');
    for (const kw of keywords) {
      if (entityLower.includes(kw) || kw.includes(entityLower)) {
        score += 2;
        reasons.push(`Entity "${fact.entity}" matches "${kw}"`);
        break;
      }
    }

    const attrLower = fact.attribute.toLowerCase().replace(/-/g, ' ');
    for (const kw of keywords) {
      if (attrLower.includes(kw) || kw.includes(attrLower)) {
        score += 1;
        reasons.push(`Attribute "${fact.attribute}" matches "${kw}"`);
        break;
      }
    }

    const statementLower = fact.statement.toLowerCase();
    let keywordHits = 0;
    for (const kw of keywords) {
      if (statementLower.includes(kw)) keywordHits += 1;
    }
    if (keywordHits > 0) {
      score += keywordHits;
      reasons.push(`Statement has ${keywordHits} keyword match(es)`);
    }

    if (score > 0) {
      const normalizedActivation = Math.min(score / 10, 1.0);
      activation.set(fact.id, normalizedActivation);
      seedReasons.set(fact.id, reasons);
    }
  }

  const keywordSeedCount = seedReasons.size;

  // === PHASE 1b: SEMANTIC SEEDING (optional) ===
  // The keyword pass above is exact and blind: it cannot match a fact that says
  // the same thing in different words, and because seeding happens *before*
  // spreading, the graph never gets a chance to recover what was never lit.
  // When embeddings are configured, a second pass seeds by meaning and the two
  // sets are merged. Keyword matches are kept as they are — a shared term is
  // stronger evidence than a close vector, and this is exactly what embeddings
  // are worst at.
  const seeding: BrainQueryResult['seeding'] = {
    strategy: 'keyword',
    keywordSeeds: keywordSeedCount,
    semanticSeeds: 0,
    semanticOnlySeeds: 0,
    vectorsScanned: 0,
  };

  if (embeddingsEnabled()) {
    try {
      const queryVector = await embedOne(context, 'brain.query');
      const { seeds, scanned, truncated } = await semanticSeeds(workspaceId, queryVector, limit * 3);

      seeding.strategy = 'hybrid';
      seeding.semanticSeeds = seeds.length;
      seeding.vectorsScanned = scanned;
      if (truncated) {
        seeding.semanticError = `Only the first ${scanned} vectors were compared`;
      }

      await loadFacts(seeds.map(s => s.factId));

      for (const seed of seeds) {
        const fact = factMap.get(seed.factId);
        if (!fact) continue;

        const reason =
          `Semantically close to the query (similarity ${seed.similarity.toFixed(3)})`;

        if (seedReasons.has(seed.factId)) {
          // Found both ways. Keep the stronger signal rather than adding them:
          // agreement between two seed methods is not twice the evidence.
          const existing = activation.get(seed.factId) ?? 0;
          if (seed.activation > existing) activation.set(seed.factId, seed.activation);
          seedReasons.get(seed.factId)!.push(reason);
        } else {
          seeding.semanticOnlySeeds++;
          activation.set(seed.factId, seed.activation);
          seedReasons.set(seed.factId, [reason]);
        }
      }

      await loadAssociationsFor(seeds.map(s => s.factId));
    } catch (error) {
      // Degrade to keyword-only rather than failing the query. The caller gets
      // a usable answer and `seeding` says plainly that it is the narrower one.
      const message = error instanceof Error ? error.message : String(error);
      seeding.semanticError = message;
      logger.warn('Semantic seeding unavailable — falling back to keyword seeding', {
        workspaceId,
        error: message,
      });
    }
  }

  // === PHASE 2: SPREADING ACTIVATION (multi-iteration) ===
  const spreadReasons = new Map<number, string[]>();

  for (let iter = 0; iter < iterations; iter++) {
    // Lazy-load associations for all currently active facts before spreading
    const activeIds = Array.from(activation.keys());
    await loadAssociationsFor(activeIds);

    const newActivation = new Map<number, number>(activation);

    for (const [factId, currentActivation] of activation) {
      const neighbors = adjacency.get(factId);
      if (!neighbors) continue;

      for (const { neighborId, association } of neighbors) {
        const signalStrength = currentActivation * association.activationWeight;
        const prev = newActivation.get(neighborId) ?? 0;
        newActivation.set(neighborId, prev + signalStrength * 0.3);
        traversedAssociations.add(association.id);

        if (!seedReasons.has(neighborId)) {
          const fact = factMap.get(factId);
          const nf = factMap.get(neighborId);
          if (fact && nf) {
            const existingReasons = spreadReasons.get(neighborId) ?? [];
            existingReasons.push(
              `[iter ${iter + 1}] Activated via "${association.label}" from "${fact.entity}" (signal: ${(signalStrength * 0.3).toFixed(3)})`
            );
            spreadReasons.set(neighborId, existingReasons);
          }
        }
      }
    }

    // Normalize activations to prevent explosion (keep max at 1.0)
    let maxAct = 0;
    for (const v of newActivation.values()) {
      if (v > maxAct) maxAct = v;
    }
    if (maxAct > 1.0) {
      for (const [k, v] of newActivation) {
        newActivation.set(k, v / maxAct);
      }
    }

    activation.clear();
    for (const [k, v] of newActivation) {
      activation.set(k, v);
    }
  }

  // === PHASE 3: FILTER & SORT ===
  type NeuralResult = {
    factId: number;
    topic: string;
    entity: string;
    attribute: string;
    statement: string;
    confidence: string;
    activation: number;
    isSeed: boolean;
    iterationsReached: number;
    reasons: string[];
  };

  const results: NeuralResult[] = [];

  for (const [factId, act] of activation) {
    if (act < activationThreshold) continue;
    const fact = factMap.get(factId);
    if (!fact) continue;

    const isSeed = seedReasons.has(factId);
    const reasons = isSeed ? seedReasons.get(factId)! : (spreadReasons.get(factId) ?? []);

    results.push({
      factId: fact.id,
      topic: fact.topic,
      entity: fact.entity,
      attribute: fact.attribute,
      statement: fact.statement,
      confidence: fact.confidence,
      activation: Math.round(act * 1000) / 1000,
      isSeed,
      iterationsReached: isSeed ? 0 : iterations,
      reasons,
    });
  }

  results.sort((a, b) => b.activation - a.activation);
  const topResults = results.slice(0, limit);

  // === PHASE 4: HEBBIAN LEARNING (BATCHED — AI-2 + AI-3) ===
  // v1 had N+1 individual UPDATE calls. v2 uses batched raw SQL.
  const hebbianUpdates: { id: number; oldWeight: number; newWeight: number }[] = [];

  if (traversedAssociations.size > 0) {
    for (const assocId of traversedAssociations) {
      let assoc: AdjEntry['association'] | undefined;
      for (const [, entries] of adjacency) {
        assoc = entries.find(e => e.association.id === assocId)?.association;
        if (assoc) break;
      }
      if (!assoc) continue;

      const boost = 0.02 * assoc.activationWeight;
      const newWeight = Math.min(assoc.activationWeight + boost, 1.0);
      hebbianUpdates.push({ id: assoc.id, oldWeight: assoc.activationWeight, newWeight });
    }

    // Batch Hebbian: single SQL with CASE expression
    if (hebbianUpdates.length > 0) {
      const cases = hebbianUpdates
        .map(u => `WHEN ${u.id} THEN ${u.newWeight.toFixed(6)}`)
        .join(' ');
      const ids = hebbianUpdates.map(u => u.id).join(',');
      // RAW SQL 2/3 — safe by construction: every interpolated value is a number computed
      // in this function (association ids, clamped float weights, an ISO timestamp).
      // Raw is used to collapse an N+1 update into a single batched CASE statement.
      await db.$executeRawUnsafe(
        `UPDATE ${ASSOCIATION_TABLE} SET activationWeight = CASE id ${cases} END, fireCount = fireCount + 1, lastFiredAt = '${timestamp}' WHERE id IN (${ids})`
      );
    }
  }

  // Batch fact activation score updates
  if (topResults.length > 0) {
    const factCases = topResults
      .map(r => `WHEN ${r.factId} THEN ${r.activation.toFixed(6)}`)
      .join(' ');
    const factIds = topResults.map(r => r.factId).join(',');
    // RAW SQL 3/3 — safe by construction: fact ids and activation floats are both computed
    // internally. Same rationale as above — one batched CASE instead of N updates.
    await db.$executeRawUnsafe(
      `UPDATE ${FACT_TABLE} SET activationScore = CASE id ${factCases} END, lastActivatedAt = '${timestamp}' WHERE id IN (${factIds})`
    );
  }

  // Log neural activity for stats (already batched via createMany — good)
  const activityEntries = topResults.map(r => ({
    factId: r.factId,
    activation: r.activation,
    source: r.isSeed ? 'seed' : 'spread',
    iteration: r.iterationsReached,
    triggeredBy: context.slice(0, 200),
    createdAt: timestamp,
    workspaceId,
  }));

  if (activityEntries.length > 0) {
    await db.neuralActivity.createMany({ data: activityEntries });
  }

  // Log the query
  await db.brainQuery.create({
    data: {
      queriedAt: timestamp,
      context,
      returnedIds: JSON.stringify(topResults.map(r => r.factId)),
      workspaceId,
    },
  });

  return {
    results: topResults.map(r => ({
      fact: {
        id: r.factId,
        topic: r.topic,
        entity: r.entity,
        attribute: r.attribute,
        statement: r.statement,
        confidence: r.confidence,
      },
      activation: r.activation,
      isSeed: r.isSeed,
      reason: r.reasons.join('; '),
    })),
    neural: {
      totalActivated: activation.size,
      seedFacts: seedReasons.size,
      spreadFacts: activation.size - seedReasons.size,
      associationsFired: traversedAssociations.size,
      hebbianUpdates: hebbianUpdates.length,
      iterations,
      activationThreshold,
      lazyLoaded: true,
    },
    seeding,
  };
}