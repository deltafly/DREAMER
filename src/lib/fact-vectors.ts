import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { now } from '@/lib/time';
import {
  decodeVector,
  embedTexts,
  embeddingModel,
  encodeVector,
  factEmbeddingText,
  fingerprint,
  seedActivation,
  similarity,
} from '@/lib/embeddings';

/**
 * Storage and lookup for fact vectors.
 *
 * Kept apart from embeddings.ts, which knows nothing about the database — that
 * split is what makes the vector maths testable without provisioning anything.
 */

/**
 * Upper bound on vectors compared in a single query.
 *
 * Similarity is computed in process rather than in the database, because SQLite
 * has no vector type. That is fine at the scale the distilled layer reaches —
 * facts are curated, not logged — but it is linear, so it needs a ceiling.
 * Exceeding it is reported rather than silently trimmed: a seed set that
 * quietly stopped covering the workspace would look like a retrieval quality
 * problem and be debugged as one for a long time.
 */
const MAX_VECTORS_SCANNED = 20_000;

/** Facts embedded per Librarian run before deferring the rest to the next one. */
const MAX_PER_SYNC = 500;

export interface SemanticSeed {
  factId: number;
  /** Raw cosine similarity, for the query's reported reasoning. */
  similarity: number;
  /** Similarity rescaled above the floor onto 0..1, to sit alongside keyword scores. */
  activation: number;
}

/**
 * Rank a workspace's fact vectors against a query vector.
 *
 * Only facts that are still current are considered — the same condition the
 * keyword seed applies, so the two paths cannot disagree about what counts as
 * live knowledge.
 */
export async function semanticSeeds(
  workspaceId: number,
  queryVector: Float32Array,
  limit: number,
): Promise<{ seeds: SemanticSeed[]; scanned: number; truncated: boolean }> {
  const model = embeddingModel();
  if (!model || queryVector.length === 0) return { seeds: [], scanned: 0, truncated: false };

  const rows = await db.factEmbedding.findMany({
    where: {
      workspaceId,
      // Vectors from a different model are not comparable with this query's.
      model,
      fact: { supersededBy: null, stale: false },
    },
    select: { factId: true, vector: true },
    take: MAX_VECTORS_SCANNED + 1,
  });

  const truncated = rows.length > MAX_VECTORS_SCANNED;
  const scanned = truncated ? MAX_VECTORS_SCANNED : rows.length;
  if (truncated) {
    logger.warn('Semantic seed scan hit its ceiling — results cover part of the workspace only', {
      workspaceId,
      scanned,
      ceiling: MAX_VECTORS_SCANNED,
    });
  }

  const scored: SemanticSeed[] = [];
  for (let i = 0; i < scanned; i++) {
    const score = similarity(queryVector, decodeVector(rows[i].vector));
    const activation = seedActivation(score);
    if (activation === 0) continue;
    scored.push({ factId: rows[i].factId, similarity: score, activation });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return { seeds: scored.slice(0, limit), scanned, truncated };
}

export interface SyncResult {
  embedded: number;
  upToDate: number;
  pending: number;
  model: string | null;
  error?: string;
}

/**
 * Bring the vector table in line with the fact table.
 *
 * Embeds facts that have no vector, and re-embeds those whose text or model has
 * changed since their vector was made. Superseded and stale facts are skipped —
 * nothing seeds from them, so paying to embed them would be waste.
 *
 * Never throws. A provider outage leaves the vectors for the next run and the
 * query falls back to keyword seeding in the meantime; a failed backfill must
 * not take down the Librarian run that called it.
 */
export async function syncFactEmbeddings(
  workspaceId: number,
  options?: { limit?: number },
): Promise<SyncResult> {
  const model = embeddingModel();
  if (!model) return { embedded: 0, upToDate: 0, pending: 0, model: null };

  const limit = Math.max(1, Math.min(options?.limit ?? MAX_PER_SYNC, MAX_PER_SYNC));

  try {
    const facts = await db.fact.findMany({
      where: { workspaceId, supersededBy: null, stale: false },
      select: {
        id: true,
        topic: true,
        entity: true,
        attribute: true,
        statement: true,
        embedding: { select: { fingerprint: true } },
      },
    });

    const outdated: { id: number; text: string; fingerprint: string }[] = [];
    let upToDate = 0;

    for (const fact of facts) {
      const text = factEmbeddingText(fact);
      const want = fingerprint(text, model);
      if (fact.embedding?.fingerprint === want) {
        upToDate++;
      } else {
        outdated.push({ id: fact.id, text, fingerprint: want });
      }
    }

    const batch = outdated.slice(0, limit);
    const pending = outdated.length - batch.length;
    if (batch.length === 0) {
      return { embedded: 0, upToDate, pending: 0, model };
    }

    const vectors = await embedTexts(batch.map(f => f.text), 'facts.embed');
    const createdAt = now();

    for (let i = 0; i < batch.length; i++) {
      const vector = vectors[i];
      const data = {
        workspaceId,
        model,
        dim: vector.length,
        vector: encodeVector(vector),
        fingerprint: batch[i].fingerprint,
        createdAt,
      };
      await db.factEmbedding.upsert({
        where: { factId: batch[i].id },
        create: { factId: batch[i].id, ...data },
        update: data,
      });
    }

    logger.info('Fact embeddings synced', {
      workspaceId,
      model,
      embedded: batch.length,
      upToDate,
      pending,
    });
    return { embedded: batch.length, upToDate, pending, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Fact embedding sync failed — queries fall back to keyword seeding', {
      workspaceId,
      error: message,
    });
    return { embedded: 0, upToDate: 0, pending: 0, model, error: message };
  }
}

/** How much of the workspace is currently embedded, for status endpoints. */
export async function embeddingCoverage(workspaceId: number): Promise<{
  facts: number;
  embedded: number;
  model: string | null;
}> {
  const model = embeddingModel();
  const [facts, embedded] = await Promise.all([
    db.fact.count({ where: { workspaceId, supersededBy: null, stale: false } }),
    model
      ? db.factEmbedding.count({
          where: { workspaceId, model, fact: { supersededBy: null, stale: false } },
        })
      : Promise.resolve(0),
  ]);
  return { facts, embedded, model };
}
