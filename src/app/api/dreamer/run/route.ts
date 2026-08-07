import { getWorkspaceId, requireAuth, verifyWorkspaceAccess } from '@/lib/auth-helpers';
import { runDreamer } from '@/lib/dreamer';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withTaskLock, isTaskRunning } from '@/lib/task-lock';
import { ConflictError, ForbiddenError } from '@/lib/errors';
import { withHandler } from '@/lib/api-handler';
import { checkRateLimit } from '@/lib/rate-limiter';

export const POST = withHandler(async (request: NextRequest) => {
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 5 });

  const workspaceId = await getWorkspaceId(request);
  const userId = await requireAuth();
  const role = await verifyWorkspaceAccess(userId, workspaceId);
  if (role === 'member') {
    throw new ForbiddenError('Csak owner vagy admin indíthatja a Dreamert');
  }

  const result = await withTaskLock(workspaceId, 'dreamer', () =>
    runDreamer(workspaceId),
  );

  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    throw new ConflictError('Dreamer is already running for this workspace');
  }

  return NextResponse.json(result, {
    status: (result as Record<string, unknown>)?.success ? 200 : 500,
  });
});

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  const [recentSparks, weights, topicCount] = await Promise.all([
    db.spark.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.sparkWeight.findMany({ where: { workspaceId } }),
    db.fact.groupBy({
      by: ['topic'],
      where: { stale: false, supersededBy: null, workspaceId },
      _count: { id: true },
    }),
  ]);

  const possiblePairs = (topicCount.length * (topicCount.length - 1)) / 2;
  const exploredPairs = weights.filter((w) => w.trials > 0).length;

  const topPairs = weights
    .filter((w) => w.trials >= 2)
    .sort((a, b) => b.hits / b.trials - a.hits / a.trials)
    .slice(0, 5)
    .map((w) => ({
      pair: w.topicPair,
      hitRate:
        w.trials > 0 ? Math.round((w.hits / w.trials) * 100) / 100 : 0,
      trials: w.trials,
    }));

  return NextResponse.json({
    ready: true,
    isRunning: isTaskRunning(workspaceId, 'dreamer'),
    topics: topicCount.map((t) => ({ topic: t.topic, factCount: t._count.id })),
    possiblePairs,
    exploredPairs,
    coverage:
      possiblePairs > 0
        ? Math.round((exploredPairs / possiblePairs) * 100) / 100
        : 0,
    topPairs,
    recentSparks,
  });
});