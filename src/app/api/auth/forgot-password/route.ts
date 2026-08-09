import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import crypto from 'crypto';
import { purgeExpiredResetTokens, setResetToken } from '@/lib/reset-tokens';
import { checkRateLimit } from '@/lib/rate-limiter';
import { audit, extractRequestMeta } from '@/lib/audit';
import { isDevMode } from '@/lib/runtime-mode';

const ForgotSchema = z.object({
  email: z.string().email('Érvénytelen email cím'),
});

export const POST = withHandler(async (request: NextRequest) => {
  checkRateLimit(request, { windowMs: 3_600_000, maxRequests: 5 });

  const body = await request.json().catch(() => ({}));
  const parsed = ForgotSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);

  const { email } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    // Don't reveal if email exists — always return success
    return NextResponse.json({ message: 'Ha az email létezik, jelszó-visszaállító linket küldtünk' });
  }

  // Generate reset token
  const token = crypto.randomBytes(32).toString('hex');
  await setResetToken(token, user.id, Date.now() + 30 * 60 * 1000); // 30 min

  // Housekeeping, on the one route that creates these rows.
  await purgeExpiredResetTokens();

  const meta = extractRequestMeta(request);
  await audit({
    userId: user.id,
    action: 'user.password.reset_requested',
    resource: 'user',
    details: 'Password reset token generated',
    ...meta,
  });

  // In production: send email with reset link
  // For now: return the token in dev mode.
  // Handing the token back over the API is account takeover for anyone who
  // knows an email address, so it is gated on development being declared
  // outright rather than on production not being detected.
  const isDev = isDevMode();

  return NextResponse.json({
    message: 'Ha az email létezik, jelszó-visszaállító linket küldtünk',
    ...(isDev && { devToken: token, devResetUrl: `/reset-password?token=${token}` }),
  });
});