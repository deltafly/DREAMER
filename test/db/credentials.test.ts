/**
 * Agent keys and password reset tokens, against a real database.
 *
 * Both were changed on 2026-08-09 for the same reason: a credential that is a
 * constant, or that lives in process memory, is not a credential. The unit
 * tests cover the maths and the source-tree scan; these cover what actually
 * happens to rows — issuing, verifying, rotating, expiring, and cascading away
 * with their owner.
 *
 * Run with `bun run test:db`.
 */

import { createReporter, createTestDatabase } from '../helpers/test-db';

const ctx = createTestDatabase('credentials');
const { check, finish } = createReporter();

const { db } = await import('@/lib/db');
const { hashAgentKey, issueAgentKeys, generateAgentKey } = await import('@/lib/agent-keys');
const { seedWorkspace } = await import('@/lib/seed-workspace');
const { setResetToken, consumeResetToken, purgeExpiredResetTokens } =
  await import('@/lib/reset-tokens');

const TS = '2025-01-01 00:00:00';
const HOUR = 60 * 60 * 1000;

/** What the MCP route does with a presented Bearer token (mcp/route.ts). */
async function authenticate(rawKey: string) {
  return db.agent.findFirst({
    where: { keyHash: hashAgentKey(rawKey) },
    select: { agentId: true, role: true, workspaceId: true },
  });
}

try {
  for (const id of [1, 2]) {
    await db.user.create({
      data: { id, email: `user${id}@test.local`, name: `U${id}`, passwordHash: 'x', createdAt: TS },
    });
    await db.workspace.create({
      data: { id, name: `W${id}`, slug: `w${id}`, plan: 'free', ownerId: id, createdAt: TS },
    });
  }

  // ===== 1. Seeding issues distinct keys per workspace =====
  console.log('\nagent keys are per workspace');

  const seededOne = await seedWorkspace(1, db);
  const seededTwo = await seedWorkspace(2, db);

  const keysOne = seededOne.agentKeys.map(k => k.key);
  const keysTwo = seededTwo.agentKeys.map(k => k.key);

  check('seeding returns a key for every agent it creates',
    seededOne.agentKeys.length === (await db.agent.count({ where: { workspaceId: 1 } })));
  check('two workspaces share no key at all', keysOne.every(k => !keysTwo.includes(k)));

  const storedHashes = (await db.agent.findMany({ select: { keyHash: true } })).map(a => a.keyHash);
  check('every stored hash is distinct', new Set(storedHashes).size === storedHashes.length);
  check('no plaintext key is stored',
    storedHashes.every(h => h.startsWith('sha256:') && ![...keysOne, ...keysTwo].some(k => h.includes(k))));

  // The literal that used to be written into seed-workspace.ts. A database
  // seeded by the current code must not answer to it.
  const OLD_HARDCODED = `sha256:${'9ab3f1d5e35869c2a0c98a5536c406e0431a1906de0758b85caa5a200a968c9f'}`;
  check('the previously hardcoded hash matches no row',
    (await db.agent.count({ where: { keyHash: OLD_HARDCODED } })) === 0);

  // ===== 2. Verification and tenant scope =====
  console.log('\nkey verification');

  const owner = seededOne.agentKeys.find(k => k.role === 'owner')!;
  const authed = await authenticate(owner.key);
  check('a seeded key authenticates', authed !== null);
  check('into its own workspace', authed?.workspaceId === 1);
  check('carrying its role', authed?.role === 'owner');
  check('no workspace-1 key ever resolves into workspace 2',
    (await Promise.all(keysOne.map(authenticate))).every(a => a?.workspaceId === 1));
  check('an unissued key authenticates nothing', (await authenticate(generateAgentKey())) === null);

  // ===== 3. Rotation =====
  console.log('\nrotation');

  const target = await db.agent.findFirst({ where: { workspaceId: 1, agentId: owner.agentId } });
  const replacement = generateAgentKey();
  await db.agent.update({ where: { id: target!.id }, data: { keyHash: hashAgentKey(replacement) } });

  check('the replacement key works', (await authenticate(replacement))?.workspaceId === 1);
  check('the replaced key stops working', (await authenticate(owner.key)) === null);
  check('the other agents are untouched',
    (await Promise.all(
      seededOne.agentKeys.filter(k => k.agentId !== owner.agentId).map(k => authenticate(k.key)),
    )).every(a => a !== null));
  check('the other workspace is untouched',
    (await Promise.all(keysTwo.map(authenticate))).every(a => a?.workspaceId === 2));

  // ===== 4. Reset tokens survive outside the process =====
  console.log('\npassword reset tokens');

  const token = `token-${generateAgentKey()}`;
  await setResetToken(token, 1, Date.now() + 30 * 60 * 1000);

  const rows = await db.passwordResetToken.findMany({ where: { userId: 1 } });
  check('the token is persisted, not held in memory', rows.length === 1);
  check('the emailed token itself is not stored', rows[0].tokenHash !== token);
  check('what is stored is a sha256 digest', /^[0-9a-f]{64}$/.test(rows[0].tokenHash));

  check('a valid token redeems to its user', (await consumeResetToken(token))?.userId === 1);
  check('and cannot be redeemed twice', (await consumeResetToken(token)) === null);

  const expired = `token-${generateAgentKey()}`;
  await setResetToken(expired, 1, Date.now() - HOUR);
  check('an expired token does not redeem', (await consumeResetToken(expired)) === null);

  const first = `token-${generateAgentKey()}`;
  const second = `token-${generateAgentKey()}`;
  await setResetToken(first, 2, Date.now() + HOUR);
  await setResetToken(second, 2, Date.now() + HOUR);
  check('requesting a new link works', (await consumeResetToken(second))?.userId === 2);
  check('and invalidates the previous one', (await consumeResetToken(first)) === null);

  await setResetToken(`token-${generateAgentKey()}`, 1, Date.now() - HOUR);
  check('purging removes expired rows', (await purgeExpiredResetTokens()) >= 1);

  // ===== 5. Deleting a user takes their credentials =====
  console.log('\ncascade');

  await setResetToken(`token-${generateAgentKey()}`, 2, Date.now() + HOUR);
  await db.workspace.delete({ where: { id: 2 } });
  await db.user.delete({ where: { id: 2 } });
  check('a deleted user leaves no redeemable token',
    (await db.passwordResetToken.count({ where: { userId: 2 } })) === 0);
  check('a deleted workspace leaves no usable agent key',
    (await Promise.all(keysTwo.map(authenticate))).every(a => a === null));
} finally {
  await db.$disconnect().catch(() => {});
  ctx.cleanup();
}

finish();
