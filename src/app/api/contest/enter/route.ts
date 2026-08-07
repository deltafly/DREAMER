import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorkspaceId, requireAuth } from '@/lib/auth-helpers';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError } from '@/lib/errors';

const enterSchema = z.object({
  contestId: z.number().int().positive(),
});

// POST /api/contest/enter
export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const userId = await requireAuth();

  const body = await request.json();
  const parsed = enterSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const { contestId } = parsed.data;

  // Verify contest exists
  const contest = await db.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new NotFoundError('Contest');
  }

  // Calculate initial score based on workspace stats
  const [facts, decisions, associations, insights] = await Promise.all([
    db.fact.count({
      where: { workspaceId, stale: false, supersededBy: null },
    }),
    db.decision.count({
      where: { workspaceId, status: 'active' },
    }),
    db.association.count({
      where: { workspaceId },
    }),
    db.insight.count({
      where: { workspaceId, dismissed: false },
    }),
  ]);

  const score = facts * 2 + decisions * 3 + associations * 5 + insights * 1;

  // Upsert the entry
  const entry = await db.contestEntry.upsert({
    where: {
      contestId_workspaceId: { contestId, workspaceId },
    },
    create: {
      contestId,
      workspaceId,
      score,
      submittedAt: new Date().toISOString(),
      metadata: JSON.stringify({ facts, decisions, associations, insights }),
    },
    update: {
      score,
      metadata: JSON.stringify({ facts, decisions, associations, insights }),
    },
  });

  return NextResponse.json({ entry, score });
});