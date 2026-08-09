import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { now, toCanonical } from '@/lib/time';

/**
 * Password reset tokens.
 *
 * These were a module-level Map, which is fine until any of three ordinary
 * things happen: the process restarts and every reset link already sitting in
 * someone's inbox stops working; a second instance starts and never sees the
 * first one's tokens; or something reads process memory and walks away with
 * live credentials in plaintext.
 *
 * Now they live in the database, and only as hashes. The token that goes out in
 * the email is never written down anywhere — reading this table gives an
 * attacker nothing usable, for the same reason a password column stores a hash.
 */

/**
 * The stored form of a token.
 *
 * Plain SHA-256 with no salt or stretching, which is the right choice here and
 * would be wrong for a password: the token is 32 random bytes, so there is no
 * dictionary to run and nothing to slow down. Lookup has to be a single indexed
 * equality, which a per-row salt would make impossible.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Record a freshly issued token.
 *
 * Any earlier token for the same user is dropped. Requesting a new reset link
 * should invalidate the previous one — otherwise every request a user makes
 * while confused leaves another working key to their account lying in an inbox.
 */
export async function setResetToken(
  token: string,
  userId: number,
  expiresAt: number,
): Promise<void> {
  await db.passwordResetToken.deleteMany({ where: { userId } });
  await db.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: toCanonical(new Date(expiresAt)),
      createdAt: now(),
    },
  });
}

/**
 * Redeem a token, or return null if it is unknown, expired or already used.
 *
 * The row is deleted on success, which is what makes it single-use. A replayed
 * token is therefore indistinguishable from one that never existed, which is
 * the correct amount of information to give back.
 */
export async function consumeResetToken(token: string): Promise<{ userId: number } | null> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record) return null;

  // Delete first, so a token cannot be redeemed twice by two requests arriving
  // together: whichever delete removes no rows loses the race.
  const { count } = await db.passwordResetToken.deleteMany({ where: { id: record.id } });
  if (count === 0) return null;

  if (record.expiresAt < now()) return null;

  return { userId: record.userId };
}

/**
 * Drop expired rows.
 *
 * Called opportunistically when a token is issued rather than on a timer. A
 * `setInterval` in a module keeps a handle alive for the life of the process
 * and runs once per instance, which is the wrong shape for a request-scoped
 * runtime — and an expired row is harmless in the meantime, since redemption
 * checks the expiry itself.
 */
export async function purgeExpiredResetTokens(): Promise<number> {
  const { count } = await db.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: now() } },
  });
  return count;
}
