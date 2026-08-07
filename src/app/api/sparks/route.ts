import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const topicFilter = searchParams.get('topic');
  const ratedFilter = searchParams.get('rated');
  const deliveredFilter = searchParams.get('delivered');
  const kindFilter = searchParams.get('kind');

  const where: Record<string, unknown> = { workspaceId };

  if (topicFilter) {
    where.OR = [{ seedTopic: topicFilter }, { pairedTopic: topicFilter }];
  }
  if (ratedFilter === 'true') {
    where.rating = { not: null };
  }
  if (deliveredFilter === 'true') {
    where.deliveredAt = { not: null };
  }
  if (kindFilter) {
    where.kind = kindFilter;
  }

  const sparks = await db.spark.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Aggregate stats — always computed across ALL sparks (not filtered)
  const [total, delivered, undelivered, rated, hits, kindGroups, scoreResult] =
    await Promise.all([
      db.spark.count({ where: { workspaceId } }),
      db.spark.count({ where: { deliveredAt: { not: null }, workspaceId } }),
      db.spark.count({ where: { deliveredAt: null, workspaceId } }),
      db.spark.count({ where: { rating: { not: null }, workspaceId } }),
      db.spark.count({ where: { rating: 1, workspaceId } }),
      db.spark.groupBy({ by: ['kind'], where: { workspaceId }, _count: { id: true } }),
      db.spark.aggregate({ where: { workspaceId }, _avg: { score: true } }),
    ]);

  const byKind: Record<string, number> = {};
  for (const g of kindGroups) {
    byKind[g.kind] = g._count.id;
  }

  const hitRate = rated > 0 ? Math.round((hits / rated) * 100) / 100 : 0;

  return NextResponse.json({
    sparks,
    stats: {
      total,
      delivered,
      undelivered,
      rated,
      hitRate,
      byKind,
      avgScore: scoreResult._avg.score
        ? Math.round(scoreResult._avg.score * 100) / 100
        : 0,
    },
  });
});