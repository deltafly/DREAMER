import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';

const consentSchema = z.object({
  kind: z.string().min(1),
  granted: z.boolean(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export const GET = withHandler(async (_request: NextRequest) => {
  const userId = await requireAuth();

  const consents = await db.consent.findMany({
    where: { userId },
    orderBy: { grantedAt: 'desc' },
  });

  return NextResponse.json({ consents });
});

export const POST = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  const body = await request.json();
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten());
  }

  const { kind, granted, ipAddress, userAgent } = parsed.data;
  const now = new Date().toISOString();

  const consent = await db.consent.upsert({
    where: {
      userId_kind: { userId, kind },
    },
    create: {
      userId,
      kind,
      granted,
      grantedAt: now,
      revokedAt: granted ? null : now,
      ipAddress,
      userAgent,
    },
    update: {
      granted,
      revokedAt: granted ? null : now,
      ipAddress,
      userAgent,
    },
  });

  await db.auditLog.create({
    data: {
      userId,
      action: granted ? 'consent.granted' : 'consent.revoked',
      resource: 'consent',
      details: `Consent for "${kind}" ${granted ? 'granted' : 'revoked'}`,
      ipAddress,
      userAgent,
      createdAt: now,
    },
  });

  return NextResponse.json({ consent });
});