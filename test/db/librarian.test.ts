/**
 * The Librarian's ingestion pass, against a real database and with no LLM.
 *
 * With no provider configured the extraction call fails and the pipeline falls
 * back to heuristics, which is exactly the path worth pinning down here: it runs
 * on every deployment that has not set a key, and it is the path that decides
 * what ends up in the canonical layer when the model is unavailable.
 *
 * The property this exists for is the timeline. `Fact.validFrom` is derived from
 * the ledger entry that produced it, and the supersede chain reads that ordering
 * back to decide which fact replaced which — so a fact dated by the wall clock
 * instead of its evidence corrupts the chain silently, with no error anywhere.
 *
 * Run with `bun run test:db`.
 */

import { createReporter, createTestDatabase } from '../helpers/test-db';

const ctx = createTestDatabase('librarian');
const { check, finish } = createReporter();

// No provider: the LLM path must fail and hand over to the heuristics.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;
delete process.env.LLM_PROVIDER;
delete process.env.EMBEDDING_MODEL;

const { db } = await import('@/lib/db');
const { runLibrarian } = await import('@/lib/librarian');

const TS = '2025-01-01 00:00:00';

try {
  await db.user.create({
    data: { id: 1, email: 'u@test.local', name: 'U', passwordHash: 'x', createdAt: TS },
  });
  await db.workspace.create({
    data: { id: 1, name: 'W', slug: 'w', plan: 'free', ownerId: 1, createdAt: TS },
  });

  // Two backdated entries, months apart. Anything that dates knowledge by the
  // clock rather than by its evidence will collapse these into today.
  await db.ledger.create({
    data: {
      ts: '2024-03-15 09:30:00',
      agentId: 'test',
      topic: 'infra',
      kind: 'digest',
      content: 'The team decided to use PostgreSQL for the primary store. The service uses PostgreSQL 16 in production.',
      processed: false,
      workspaceId: 1,
    },
  });
  await db.ledger.create({
    data: {
      ts: '2024-09-02 14:00:00',
      agentId: 'test',
      topic: 'infra',
      kind: 'digest',
      content: 'The service uses Redis for the rate limiter counters.',
      processed: false,
      workspaceId: 1,
    },
  });

  const result = await runLibrarian(1);

  // ===== 1. It completes without a provider =====
  console.log('\nrun without an LLM provider');

  check('the run succeeds', result.success === true);
  check('and says how it ran', String(result.summary).includes('heuristic'));

  const run = await db.librarianRun.findFirst({ where: { workspaceId: 1 } });
  check('the run is recorded as completed', run?.status === 'completed');

  // ===== 2. Ledger entries are consumed exactly once =====
  console.log('\nledger consumption');

  const unprocessed = await db.ledger.count({ where: { workspaceId: 1, processed: false } });
  check('every entry is marked processed', unprocessed === 0);

  const second = await runLibrarian(1);
  check('a second run finds nothing left to do',
    (second.factsExtracted as number) === 0);

  // ===== 3. Knowledge is dated from its evidence =====
  console.log('\ntimeline');

  const facts = await db.fact.findMany({ where: { workspaceId: 1 } });
  check('facts were extracted', facts.length > 0);

  const today = new Date().toISOString().slice(0, 10);
  check('no fact is dated today',
    facts.every(f => !f.validFrom.startsWith(today)),
    facts.map(f => `${f.entity}=${f.validFrom}`).join(', '));
  check('every fact is dated from a ledger entry',
    facts.every(f => f.validFrom === '2024-03-15 09:30:00' || f.validFrom === '2024-09-02 14:00:00'));

  const decisions = await db.decision.findMany({ where: { workspaceId: 1 } });
  if (decisions.length > 0) {
    check('decisions are dated from their evidence too',
      decisions.every(d => !d.decidedAt.startsWith(today)),
      decisions.map(d => d.decidedAt).join(', '));
  } else {
    check('decisions are dated from their evidence too (none extracted)', true);
  }

  // reviewAt is an operational due date, not a claim about the past — it is
  // supposed to be in the future even for imported history, or an archive would
  // arrive pre-stale.
  check('review dates are still in the future',
    facts.every(f => !f.reviewAt || f.reviewAt > new Date().toISOString().slice(0, 10)));

  // ===== 4. Everything stays in its workspace =====
  console.log('\ntenant scope');

  check('nothing was written outside workspace 1',
    (await db.fact.count({ where: { workspaceId: { not: 1 } } })) === 0 &&
    (await db.decision.count({ where: { workspaceId: { not: 1 } } })) === 0);

  // ===== 5. Embeddings stay switched off =====
  console.log('\nembeddings');

  check('no vectors are produced when EMBEDDING_MODEL is unset',
    (await db.factEmbedding.count()) === 0);
  check('and the summary does not claim any',
    !String(result.summary).includes('Embedded'));
} finally {
  await db.$disconnect().catch(() => {});
  ctx.cleanup();
}

finish();
