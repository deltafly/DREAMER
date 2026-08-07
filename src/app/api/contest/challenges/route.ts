import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-helpers';

const createChallengeSchema = z.object({
  contestId: z.number().int().positive(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  kind: z.string().min(1, 'Kind is required'),
  points: z.number().int().min(1).default(100),
});

// GET /api/contest/challenges?contestId=1
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const contestId = Number(searchParams.get('contestId'));

  if (isNaN(contestId) || contestId <= 0) {
    throw new ValidationError('Valid contestId query param is required');
  }

  const challenges = await db.challenge.findMany({
    where: { contestId },
    orderBy: { id: 'asc' },
    take: 100,
  });

  return NextResponse.json({ challenges });
});

// POST /api/contest/challenges — only the contest creator can add challenges
export const POST = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  const body = await request.json();
  const parsed = createChallengeSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const { contestId, title, description, kind, points } = parsed.data;

  // Verify contest exists and the user is the creator
  const contest = await db.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new NotFoundError('Contest');
  }

  if (contest.createdBy !== userId) {
    throw new ForbiddenError('Only the contest creator can add challenges');
  }

  const challenge = await db.challenge.create({
    data: {
      contestId,
      title,
      description,
      kind,
      points,
    },
  });

  return NextResponse.json(challenge, { status: 201 });
});