/**
 * In-memory password reset token store.
 * Production should use DB or Redis — this is a dev-friendly default.
 */

const resetTokens = new Map<string, { userId: number; expiresAt: number }>();

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens) {
    if (data.expiresAt < now) resetTokens.delete(token);
  }
}, 10 * 60 * 1000);

export function setResetToken(token: string, userId: number, expiresAt: number): void {
  resetTokens.set(token, { userId, expiresAt });
}

export function consumeResetToken(token: string): { userId: number } | null {
  const data = resetTokens.get(token);
  if (!data) return null;
  if (data.expiresAt < Date.now()) {
    resetTokens.delete(token);
    return null;
  }
  resetTokens.delete(token); // One-time use
  return { userId: data.userId };
}