import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, AuthError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-helpers';

const CONTEST_KINDS = [
  'knowledge-completeness',
  'freshness-challenge',
  'association-density',
  'decision-outcome',
  'weekly-quiz',
] as const;

const createContestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  kind: z.enum(CONTEST_KINDS),
  startsAt: z.string().min(1, 'startsAt is required'),
  endsAt: z.string().min(1, 'endsAt is required'),
  prize: z.string().optional(),
  rules: z.string().optional(),
});

// GET /api/contest/contests?status=active
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  }

  const contests = await db.contest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      _count: {
        select: {
          entries: true,
          challenges: true,
        },
      },
    },
  });

  return NextResponse.json({ contests });
});

// POST /api/contest/contests
export const POST = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  const body = await request.json();
  const parsed = createContestSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const contest = await db.contest.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      kind: parsed.data.kind,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      prize: parsed.data.prize ?? null,
      rules: parsed.data.rules ?? null,
      status: 'active',
      createdBy: userId,
      createdAt: new Date().toISOString(),
    },
    include: {
      _count: {
        select: {
          entries: true,
          challenges: true,
        },
      },
    },
  });

  return NextResponse.json(contest, { status: 201 });
});