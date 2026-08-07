import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError } from '@/lib/errors';

// GET /api/contest/leaderboard?contestId=1
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const contestId = Number(searchParams.get('contestId'));

  if (isNaN(contestId) || contestId <= 0) {
    throw new ValidationError('Valid contestId query param is required');
  }

  const contest = await db.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new NotFoundError('Contest');
  }

  const entries = await db.contestEntry.findMany({
    where: { contestId },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { score: 'desc' },
  });

  const leaderboard = entries.map((entry, index) => ({
    rank: index + 1,
    workspaceId: entry.workspaceId,
    score: entry.score,
    submittedAt: entry.submittedAt,
  }));

  return NextResponse.json({ leaderboard });
});