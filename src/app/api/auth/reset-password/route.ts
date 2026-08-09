import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ValidationError, NotFoundError } from '@/lib/errors';
import bcrypt from 'bcryptjs';
import { consumeResetToken } from '@/lib/reset-tokens';
import { passwordSchema } from '@/lib/password';
import { audit, extractRequestMeta } from '@/lib/audit';

const ResetSchema = z.object({
  token: z.string().min(1, 'Token hiányzik'),
  password: passwordSchema,
});

export const POST = withHandler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const parsed = ResetSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);

  const { token, password } = parsed.data;
  const data = await consumeResetToken(token);

  if (!data) {
    throw new ValidationError('Érvénytelen vagy lejárt token');
  }

  const user = await db.user.findUnique({ where: { id: data.userId } });
  if (!user) throw new NotFoundError('User');

  const hash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { id: data.userId },
    data: { passwordHash: hash, sessionVersion: { increment: 1 } },
  });

  const meta = extractRequestMeta(request);
  await audit({
    userId: data.userId,
    action: 'user.password.reset_completed',
    resource: 'user',
    details: 'Password changed via reset token',
    ...meta,
  });

  return NextResponse.json({ message: 'Jelszó sikeresen megváltoztatva' });
});