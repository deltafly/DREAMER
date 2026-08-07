import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorkspaceId, requireAuth } from '@/lib/auth-helpers';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError } from '@/lib/errors';

const scoreSchema = z.object({
  contestId: z.number().int().positive(),
});

// POST /api/contest/score
export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const userId = await requireAuth();

  const body = await request.json().catch(() => ({}));
  const parsed = scoreSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.issues);
  }

  const { contestId } = parsed.data;

  // Verify contest exists
  const contest = await db.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new NotFoundError('Contest');
  }

  // Gather all workspace stats in parallel
  const [liveFacts, staleFacts, activeDecisions, associations, insights, deliveredSparks, uniqueTopics] =
    await Promise.all([
      // Total facts (live, non-stale, not superseded)
      db.fact.count({
        where: { workspaceId, stale: false, supersededBy: null },
      }),
      // Stale facts count (for freshness check)
      db.fact.count({
        where: { workspaceId, stale: true, supersededBy: null },
      }),
      // Active decisions
      db.decision.count({
        where: { workspaceId, status: 'active' },
      }),
      // All associations
      db.association.count({
        where: { workspaceId },
      }),
      // Non-dismissed insights
      db.insight.count({
        where: { workspaceId, dismissed: false },
      }),
      // Delivered sparks
      db.spark.count({
        where: { workspaceId, deliveredAt: { not: null } },
      }),
      // Unique topics in facts
      db.fact.groupBy({
        where: { workspaceId, stale: false, supersededBy: null },
        by: ['topic'],
      }),
    ]);

  // Calculate score breakdown
  const factsScore = liveFacts * 2;
  const decisionsScore = activeDecisions * 3;
  const associationsScore = associations * 5;
  const insightsScore = insights * 1;
  const sparksScore = deliveredSparks * 4;
  const breadthScore = uniqueTopics.length * 10;
  const freshnessBonus = staleFacts === 0 ? 50 : 0;

  const totalScore =
    factsScore +
    decisionsScore +
    associationsScore +
    insightsScore +
    sparksScore +
    breadthScore +
    freshnessBonus;

  const breakdown = {
    facts: { count: liveFacts, points: factsScore, per: 2 },
    decisions: { count: activeDecisions, points: decisionsScore, per: 3 },
    associations: { count: associations, points: associationsScore, per: 5 },
    insights: { count: insights, points: insightsScore, per: 1 },
    sparks: { count: deliveredSparks, points: sparksScore, per: 4 },
    breadth: { count: uniqueTopics.length, points: breadthScore, per: 10 },
    freshnessBonus: { count: staleFacts === 0 ? 1 : 0, points: freshnessBonus, per: 50 },
  };

  // Upsert the entry
  const entry = await db.contestEntry.upsert({
    where: {
      contestId_workspaceId: { contestId, workspaceId },
    },
    create: {
      contestId,
      workspaceId,
      score: totalScore,
      submittedAt: new Date().toISOString(),
      metadata: JSON.stringify(breakdown),
    },
    update: {
      score: totalScore,
      metadata: JSON.stringify(breakdown),
    },
  });

  // Calculate rank: count how many entries have a higher score
  const higherCount = await db.contestEntry.count({
    where: {
      contestId,
      score: { gt: totalScore },
    },
  });
  const rank = higherCount + 1;

  // Update rank for all entries in this contest
  const allEntries = await db.contestEntry.findMany({
    where: { contestId },
    orderBy: { score: 'desc' },
  });

  // Batch update ranks
  await Promise.all(
    allEntries.map((e, index) =>
      db.contestEntry.update({
        where: { id: e.id },
        data: { rank: index + 1 },
      })
    )
  );

  return NextResponse.json({ score: totalScore, rank, breakdown });
});