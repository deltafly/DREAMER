/**
 * Brain query engine, against a database built from the migrations.
 *
 * This is the test that was missing on 2026-08-08, when three raw statements in
 * brain-query.ts referenced tables the migrations do not create and every query
 * failed at runtime with "no such table". Nothing else in the pipeline could see
 * it: the strings are not type-checked, and no test ever executed them.
 *
 * So the first assertion here is the dullest one in the repo — that a query
 * returns anything at all. That is precisely the assertion that was missing.
 *
 * Run with `bun run test:db` (needs the prisma CLI; no network, no API key).
 */

import { createReporter, createTestDatabase, seedWorkspaceFixture } from '../helpers/test-db';

const ctx = createTestDatabase('brain-query');
const { check, finish } = createReporter();

// Imported after the database exists, so the client binds to it.
const { db } = await import('@/lib/db');
const { executeBrainQuery } = await import('@/lib/brain-query');

try {
  // Workspace 1: a keyword-matching fact, a fact reachable only by spreading,
  // and an unrelated one that must stay dark.
  await seedWorkspaceFixture(db, {
    workspaceId: 1,
    userId: 1,
    email: 'one@test.local',
    facts: [
      { id: 1, topic: 'infra', entity: 'database', attribute: 'engine', statement: 'The service uses PostgreSQL as its primary database.' },
      { id: 2, topic: 'infra', entity: 'snapshots', attribute: 'window', statement: 'Nightly snapshots run at 02:00 UTC.' },
      { id: 3, topic: 'billing', entity: 'invoicing', attribute: 'provider', statement: 'Invoices are issued through Barion.' },
      { id: 4, topic: 'infra', entity: 'database', attribute: 'retired-engine', statement: 'The service used MySQL as its database.', supersededBy: 1 },
      { id: 5, topic: 'infra', entity: 'database', attribute: 'old-note', statement: 'Database notes that are out of date.', stale: true },
    ],
    associations: [{ factIdA: 1, factIdB: 2, label: 'same-subsystem', weight: 0.8 }],
  });

  // Workspace 2 holds a fact that matches the same words, to prove the query
  // cannot reach across tenants.
  await seedWorkspaceFixture(db, {
    workspaceId: 2,
    userId: 2,
    email: 'two@test.local',
    facts: [
      { id: 10, topic: 'infra', entity: 'database', attribute: 'engine', statement: 'Another tenant also uses a database engine.' },
    ],
  });

  // ===== 1. It runs =====
  console.log('\nthe query executes');

  const result = await executeBrainQuery(1, 'Which database engine did we pick?');
  check('a query returns results (the raw statements resolve)', result.results.length > 0,
    'no results — the seed statement matched nothing, which is how the 2026-08-08 outage looked');
  check('the keyword-matched fact comes back', result.results.some(r => r.fact.id === 1));

  // ===== 2. Spreading activation =====
  console.log('\nspreading activation');

  const spread = result.results.find(r => r.fact.id === 2);
  check('a fact with no keyword match is reached through an association', spread !== undefined);
  check('and it is reported as reached rather than seeded', spread?.isSeed === false);
  check('its activation is below the seed it came from',
    (spread?.activation ?? 1) < (result.results.find(r => r.fact.id === 1)?.activation ?? 0));
  check('an unrelated fact stays dark', !result.results.some(r => r.fact.id === 3));
  check('the reason explains how it was reached',
    (spread?.reason ?? '').includes('same-subsystem'));

  // ===== 3. Only live knowledge is seeded =====
  console.log('\nsuperseded and stale facts');

  check('a superseded fact is never returned', !result.results.some(r => r.fact.id === 4));
  check('a stale fact is never returned', !result.results.some(r => r.fact.id === 5));

  // ===== 4. Tenant isolation =====
  console.log('\ntenant isolation');

  check('a query never returns another workspace\'s facts',
    !result.results.some(r => r.fact.id === 10));

  const otherTenant = await executeBrainQuery(2, 'Which database engine did we pick?');
  check('the other workspace sees only its own', otherTenant.results.every(r => r.fact.id === 10));

  // ===== 5. Hebbian learning writes back =====
  console.log('\nhebbian learning');

  const association = await db.association.findFirst({ where: { workspaceId: 1 } });
  check('the fired association was strengthened (the batched UPDATE resolves)',
    (association?.fireCount ?? 0) === 1 && (association?.activationWeight ?? 0) > 0.8,
    `fireCount=${association?.fireCount} weight=${association?.activationWeight}`);
  check('the association records when it last fired', association?.lastFiredAt !== null);

  const seededFact = await db.fact.findUnique({ where: { id: 1 } });
  check('the activation score was written back', (seededFact?.activationScore ?? 0) > 0);
  check('and the fact records when it was last activated', seededFact?.lastActivatedAt !== null);

  const untouched = await db.fact.findUnique({ where: { id: 3 } });
  check('an unactivated fact keeps a zero score', untouched?.activationScore === 0);

  // ===== 6. The query is logged =====
  console.log('\nquery log');

  const logged = await db.brainQuery.findMany({ where: { workspaceId: 1 } });
  check('the query was recorded', logged.length === 1);
  check('with the facts it returned', (logged[0]?.returnedIds ?? '').includes('1'));

  const activity = await db.neuralActivity.findMany({ where: { workspaceId: 1 } });
  check('neural activity was recorded for the returned facts',
    activity.length === result.results.length);

  // ===== 7. Seeding is reported honestly =====
  console.log('\nseeding report');

  check('with no embedding model configured, the strategy is keyword',
    result.seeding.strategy === 'keyword');
  check('the keyword seed count is real', result.seeding.keywordSeeds > 0);
  check('nothing claims a semantic contribution', result.seeding.semanticSeeds === 0);

  // ===== 8. A query that matches nothing =====
  console.log('\nempty result');

  const nothing = await executeBrainQuery(1, 'xylophone quarterly parakeet');
  check('an unmatched query returns nothing rather than failing',
    nothing.results.length === 0);
  check('and still reports its seeding honestly', nothing.seeding.keywordSeeds === 0);
} finally {
  await db.$disconnect().catch(() => {});
  ctx.cleanup();
}

finish();
