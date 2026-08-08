import { createHash } from 'node:crypto';
import { logger } from '@/lib/logger';
import { LLMUnavailableError } from '@/lib/llm-client';

/**
 * Optional semantic embeddings for the L2 fact layer.
 *
 * The brain seeds a query by matching words. That is cheap and exact, and it
 * misses anything phrased differently — ask about "the payment provider" and a
 * fact that says "Barion" never lights up, so spreading activation never gets
 * the chance to reach anything downstream of it. The seed is upstream of the
 * graph, and the graph cannot return what was never seeded.
 *
 * This module adds a second way in: a vector per fact, so a query can seed by
 * meaning as well. It does not replace the keyword seed — the two are merged,
 * because exact term matches are precisely what a vector is worst at.
 *
 * Three properties keep it honest:
 *
 *   Optional. Nothing happens unless EMBEDDING_MODEL is set. With it unset the
 *   query behaves exactly as it did before, so `clone it and run it for free`
 *   stays true and no key is required to see the system work.
 *
 *   Cheap. Only the distilled layer is embedded — facts are one sentence each,
 *   embedded once when written, not per query. A query costs one vector.
 *
 *   Local-friendly. Any OpenAI-compatible /embeddings endpoint serves it,
 *   including an Ollama on localhost, so the semantic path costs nothing to
 *   run either. Anthropic has no embeddings API, which is why this is
 *   configured separately from the completion provider rather than following it.
 */

/** Batch size per request. Small enough for local servers with modest limits. */
const EMBED_BATCH = 64;

/** Refuse absurd vectors rather than storing them. */
const MAX_DIM = 8192;

/** Model in use, or null when the semantic path is switched off. */
export function embeddingModel(): string | null {
  return process.env.EMBEDDING_MODEL?.trim() || null;
}

export function embeddingsEnabled(): boolean {
  return embeddingModel() !== null;
}

/** Endpoint and credential, falling back to the completion provider's settings. */
function endpoint(): { baseUrl: string; apiKey: string | undefined } {
  const baseUrl = (
    process.env.EMBEDDING_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');
  const apiKey = process.env.EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  return { baseUrl, apiKey };
}

/** Model and host in effect, for health checks and run summaries. */
export function describeEmbeddings(): string {
  const model = embeddingModel();
  if (!model) return 'disabled';
  return `${model} @ ${endpoint().baseUrl}`;
}

// ===== Vector helpers =====

/**
 * Scale to unit length, so a similarity is a plain dot product.
 *
 * A zero vector cannot be normalised; it is returned unchanged and scores zero
 * against everything, which is the correct behaviour for an empty embedding.
 */
export function normalise(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  if (sumSquares === 0) return vector;

  const scale = 1 / Math.sqrt(sumSquares);
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] * scale;
  return out;
}

/**
 * Cosine similarity, assuming both vectors were normalised on the way in.
 *
 * Returns 0 for a length mismatch rather than throwing: vectors from two
 * different models are not comparable, and a stale row should drop out of the
 * ranking rather than break a query someone is waiting on.
 */
export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Similarity below which a match is not worth seeding.
 *
 * Embeddings return a ranking, never a decision — the nearest vector to a
 * question about billing is still *something* even in a workspace that has
 * never discussed billing. Without a floor, every query seeds its full quota of
 * loosely related facts and then spreads activation out from them.
 */
export const SEMANTIC_FLOOR = 0.25;

/**
 * Map a similarity onto the 0..1 activation scale the keyword seeds use.
 *
 * Rescaled from the floor rather than used raw, so a match that barely clears
 * the floor enters the network weakly instead of at 0.25 — the spreading step
 * multiplies this value, so an inflated seed lights up its whole neighbourhood.
 *
 * Returns 0 below the floor, which callers read as "do not seed".
 */
export function seedActivation(similarityScore: number): number {
  if (similarityScore < SEMANTIC_FLOOR) return 0;
  return Math.min((similarityScore - SEMANTIC_FLOOR) / (1 - SEMANTIC_FLOOR), 1);
}

/**
 * Pack for the Bytes column: Float32, little-endian, platform-independent.
 *
 * The return type is pinned to a plain ArrayBuffer rather than ArrayBufferLike
 * because Prisma's Bytes field will not accept a possibly-shared buffer.
 */
export function encodeVector(vector: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(vector.length * 4));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < vector.length; i++) view.setFloat32(i * 4, vector[i], true);
  return bytes;
}

/** Unpack a stored vector. Returns an empty vector for a truncated row. */
export function decodeVector(bytes: Uint8Array): Float32Array {
  if (bytes.length % 4 !== 0) return new Float32Array(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

// ===== What gets embedded =====

/**
 * The text that stands for a fact.
 *
 * Entity and attribute are included alongside the statement because they carry
 * meaning the sentence often leaves implicit — a statement like "1000 requests
 * per minute" is far more locatable as "rate-limiter / pro-tier-limit".
 */
export function factEmbeddingText(fact: {
  topic: string;
  entity: string;
  attribute: string;
  statement: string;
}): string {
  return `${fact.topic} / ${fact.entity} / ${fact.attribute}: ${fact.statement}`;
}

/**
 * Identifies the exact text and model a stored vector came from.
 *
 * A vector is only valid for the text it was made from. When a fact is edited
 * or the model changes, the fingerprint changes, and the row is re-embedded
 * instead of silently answering with a vector for a sentence that no longer
 * exists.
 *
 * The two parts are joined with a NUL so no pair of them can collide by moving
 * the boundary between them. Written as an escape rather than a raw byte, which
 * would make this source file count as binary.
 */
export function fingerprint(text: string, model: string): string {
  return createHash('sha256').update(`${model}\u0000${text}`).digest('hex').slice(0, 32);
}

// ===== Provider call =====

interface EmbeddingResponse {
  data?: { index?: number; embedding?: number[] }[];
}

/** One request. Returns vectors in the order the inputs were given. */
async function embedBatch(texts: string[], model: string, context: string): Promise<Float32Array[]> {
  const { baseUrl, apiKey } = endpoint();

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new LLMUnavailableError(
      `Embedding endpoint returned ${response.status}: ${detail.slice(0, 200)}`,
      'openai',
    );
  }

  const body = (await response.json()) as EmbeddingResponse;
  const rows = body.data;
  if (!Array.isArray(rows) || rows.length !== texts.length) {
    throw new LLMUnavailableError(
      `Embedding endpoint returned ${rows?.length ?? 0} vectors for ${texts.length} inputs`,
      'openai',
    );
  }

  // The response carries an explicit index; servers are not required to
  // preserve request order, so re-order rather than trusting the array.
  const ordered = new Array<Float32Array>(texts.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const position = typeof row.index === 'number' ? row.index : i;
    const values = row.embedding;

    if (!Array.isArray(values) || values.length === 0) {
      throw new LLMUnavailableError('Embedding endpoint returned an empty vector', 'openai');
    }
    if (values.length > MAX_DIM) {
      throw new LLMUnavailableError(
        `Embedding endpoint returned ${values.length} dimensions, above the ${MAX_DIM} limit`,
        'openai',
      );
    }
    if (position < 0 || position >= texts.length) {
      throw new LLMUnavailableError(`Embedding endpoint returned index ${position} out of range`, 'openai');
    }
    ordered[position] = normalise(Float32Array.from(values));
  }

  for (let i = 0; i < ordered.length; i++) {
    if (!ordered[i]) {
      throw new LLMUnavailableError(`Embedding endpoint skipped input ${i}`, 'openai');
    }
  }

  logger.debug('Embedded batch', { context, model, count: texts.length, dim: ordered[0].length });
  return ordered;
}

/**
 * Embed a list of texts, in batches, preserving order.
 *
 * Throws `LLMUnavailableError` when embeddings are switched off or the endpoint
 * misbehaves. Callers degrade rather than fail: the query falls back to keyword
 * seeding, the Librarian finishes its run and leaves the vectors for next time.
 */
export async function embedTexts(texts: string[], context: string): Promise<Float32Array[]> {
  const model = embeddingModel();
  if (!model) {
    throw new LLMUnavailableError(
      'Embeddings are not configured. Set EMBEDDING_MODEL (and EMBEDDING_BASE_URL for a ' +
        'non-OpenAI host, such as http://localhost:11434/v1 for Ollama). See .env.example.',
      'none',
    );
  }
  if (texts.length === 0) return [];

  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH), model, context)));
  }
  return out;
}

/** Convenience for the single-vector case (a query). */
export async function embedOne(text: string, context: string): Promise<Float32Array> {
  const [vector] = await embedTexts([text], context);
  return vector;
}
