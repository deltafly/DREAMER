import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { ValidationError, AuthError, NotFoundError } from '@/lib/errors';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limiter';
import { passwordSchema } from '@/lib/password';

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const GET = withHandler(async () => {
  const userId = await requireAuth();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('User');
  return NextResponse.json(user);
});

export const PATCH = withHandler(async (request: NextRequest): Promise<NextResponse> => {
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 10 });

  const userId = await requireAuth();
  const body = await request.json().catch(() => ({}));

  // Check if it's a password change
  if (body.currentPassword && body.newPassword) {
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) throw new AuthError('Hibás jelenlegi jelszó');

    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        sessionVersion: { increment: 1 },  // Invalidates all existing JWT sessions
      },
    });

    // Audit log
    const { audit, extractRequestMeta } = await import('@/lib/audit');
    const meta = extractRequestMeta(request);
    await audit({
      userId,
      action: 'user.password.changed',
      resource: 'user',
      details: 'Password changed via profile settings',
      ...meta,
    });

    return NextResponse.json({ message: 'Jelszó sikeresen megváltoztatva. Minden másik session érvénytelenítve.' });
  }

  // Profile update
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);

  if (!parsed.data.name) throw new ValidationError('Name is required');

  const user = await db.user.update({
    where: { id: userId },
    data: { name: parsed.data.name },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json(user);
});