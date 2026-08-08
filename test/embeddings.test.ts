/**
 * Vector maths and configuration tests for src/lib/embeddings.ts
 *
 * Framework-free and offline: nothing here calls an embedding endpoint, so the
 * suite still runs with no key, no network and no database. The provider call
 * itself is not exercised; what is exercised is everything that decides what a
 * stored vector means, which is where a silent wrong answer would come from.
 *
 * A corrupted vector does not throw. It ranks badly, and bad ranking looks
 * exactly like a retrieval-quality problem — so encode/decode and similarity
 * are pinned down here rather than trusted.
 */

import {
  SEMANTIC_FLOOR,
  decodeVector,
  describeEmbeddings,
  embedTexts,
  embeddingModel,
  embeddingsEnabled,
  encodeVector,
  factEmbeddingText,
  fingerprint,
  normalise,
  seedActivation,
  similarity,
} from '../src/lib/embeddings';

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}`);
  }
}

function close(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) < tolerance;
}

// ===== 1. Normalisation =====
console.log('\nnormalisation');

const unit = normalise(Float32Array.from([3, 4]));
check('scales to unit length', close(Math.hypot(unit[0], unit[1]), 1));
check('preserves direction', close(unit[0] / unit[1], 3 / 4));
check('an already-normal vector is a fixed point',
  close(normalise(Float32Array.from([1, 0, 0]))[0], 1));

const zero = normalise(Float32Array.from([0, 0, 0]));
check('a zero vector is returned rather than producing NaN',
  [...zero].every(v => v === 0));

// ===== 2. Similarity =====
console.log('\nsimilarity');

const a = normalise(Float32Array.from([1, 2, 3]));
check('a vector is identical to itself', close(similarity(a, a), 1));
check('orthogonal vectors score zero',
  close(similarity(Float32Array.from([1, 0]), Float32Array.from([0, 1])), 0));
check('opposed vectors score minus one',
  close(similarity(Float32Array.from([1, 0]), Float32Array.from([-1, 0])), -1));

// Vectors from two different models have different widths and are meaningless
// to compare. Scoring zero drops the stale row out of the ranking; throwing
// would take down a live query over a leftover database row.
check('a length mismatch scores zero, and does not throw',
  similarity(Float32Array.from([1, 0, 0]), Float32Array.from([1, 0])) === 0);

// ===== 3. Storage round trip =====
console.log('\nstorage round trip');

const original = normalise(Float32Array.from([0.5, -0.25, 0.125, 1, -1, 0]));
const restored = decodeVector(encodeVector(original));
check('length survives', restored.length === original.length);
check('every value survives exactly',
  [...original].every((v, i) => v === restored[i]));
check('a round-tripped vector is still identical to itself',
  close(similarity(original, restored), 1));

// Float32 is the storage format, so a Float64 input is expected to lose the
// tail. Pinned here so the loss is a known quantity rather than a surprise.
const precise = Float32Array.from([Math.PI]);
check('float32 precision is preserved to about seven digits',
  close(decodeVector(encodeVector(precise))[0], Math.PI, 1e-6));

check('a truncated row decodes to an empty vector, not garbage',
  decodeVector(new Uint8Array([1, 2, 3])).length === 0);
check('an empty vector round-trips',
  decodeVector(encodeVector(new Float32Array(0))).length === 0);

// Byte order is fixed rather than platform-dependent, so a database file stays
// readable when it moves between machines.
const known = encodeVector(Float32Array.from([1]));
check('little-endian byte order is pinned',
  known[0] === 0 && known[1] === 0 && known[2] === 128 && known[3] === 63);

// ===== 4. Seed activation =====
console.log('\nseed activation');

check('below the floor does not seed', seedActivation(SEMANTIC_FLOOR - 0.01) === 0);
check('at the floor the seed is weakest', close(seedActivation(SEMANTIC_FLOOR), 0));
check('a perfect match seeds at full strength', close(seedActivation(1), 1));
check('the scale is monotonic', seedActivation(0.9) > seedActivation(0.6));
check('the scale never exceeds one', seedActivation(1.5) === 1);
check('a negative similarity does not seed', seedActivation(-0.8) === 0);

// ===== 5. What gets embedded =====
console.log('\nembedded text and fingerprint');

const fact = {
  topic: 'mcos-engine',
  entity: 'rate-limiter',
  attribute: 'pro-tier-limit',
  statement: 'Pro tier rate limit is 1000 requests per minute.',
};
const text = factEmbeddingText(fact);
check('the embedded text carries entity and attribute, not just the sentence',
  text.includes('rate-limiter') && text.includes('pro-tier-limit') && text.includes('1000 requests'));

check('the same text and model give the same fingerprint',
  fingerprint(text, 'model-a') === fingerprint(text, 'model-a'));
check('an edited fact changes the fingerprint',
  fingerprint(text, 'model-a') !== fingerprint(text + ' Updated.', 'model-a'));
// Vectors from different models are not comparable, so a model switch has to
// invalidate every row rather than leaving a mix behind.
check('a different model changes the fingerprint',
  fingerprint(text, 'model-a') !== fingerprint(text, 'model-b'));

// ===== 6. Configuration =====
console.log('\nconfiguration');

const savedModel = process.env.EMBEDDING_MODEL;
const savedBase = process.env.EMBEDDING_BASE_URL;

delete process.env.EMBEDDING_MODEL;
check('unset means disabled', embeddingsEnabled() === false);
check('unset reports no model', embeddingModel() === null);
check('description says disabled', describeEmbeddings() === 'disabled');

// The whole point of the opt-in: with nothing configured, a caller gets a clear
// error rather than a silent request to api.openai.com without a key.
let refused = false;
try {
  await embedTexts(['anything'], 'test');
} catch (error) {
  refused = error instanceof Error && error.message.includes('EMBEDDING_MODEL');
}
check('embedding without configuration refuses, and says what to set', refused);

process.env.EMBEDDING_MODEL = '  nomic-embed-text  ';
check('configured means enabled', embeddingsEnabled() === true);
check('the model name is trimmed', embeddingModel() === 'nomic-embed-text');

process.env.EMBEDDING_BASE_URL = 'http://localhost:11434/v1/';
check('the description names model and host',
  describeEmbeddings() === 'nomic-embed-text @ http://localhost:11434/v1');

check('embedding nothing makes no request', (await embedTexts([], 'test')).length === 0);

process.env.EMBEDDING_MODEL = '   ';
check('a whitespace-only model counts as unset', embeddingsEnabled() === false);

if (savedModel === undefined) delete process.env.EMBEDDING_MODEL;
else process.env.EMBEDDING_MODEL = savedModel;
if (savedBase === undefined) delete process.env.EMBEDDING_BASE_URL;
else process.env.EMBEDDING_BASE_URL = savedBase;

// ===== Summary =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
