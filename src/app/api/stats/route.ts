import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  const [
    ledgerCount,
    ledgerUnprocessed,
    factCount,
    liveFactCount,
    staleFactCount,
    decisionCount,
    activeDecisionCount,
    preferenceCount,
    activeStateCount,
    openDisputeCount,
    resolvedDisputeCount,
    briefCount,
    dirtyBriefCount,
    agentCount,
    librarianRunCount,
    lastRun,
  ] = await Promise.all([
    db.ledger.count({ where: { workspaceId } }),
    db.ledger.count({ where: { processed: false, workspaceId } }),
    db.fact.count({ where: { workspaceId } }),
    db.fact.count({ where: { supersededBy: null, stale: false, workspaceId } }),
    db.fact.count({ where: { stale: true, supersededBy: null, workspaceId } }),
    db.decision.count({ where: { workspaceId } }),
    db.decision.count({ where: { status: 'active', workspaceId } }),
    db.preference.count({ where: { active: true, workspaceId } }),
    db.projectState.count({ where: { workspaceId } }),
    db.dispute.count({ where: { status: 'open', workspaceId } }),
    db.dispute.count({ where: { status: 'resolved', workspaceId } }),
    db.brief.count({ where: { workspaceId } }),
    db.brief.count({ where: { dirty: true, workspaceId } }),
    db.agent.count({ where: { workspaceId } }),
    db.librarianRun.count({ where: { workspaceId } }),
    db.librarianRun.findFirst({ where: { workspaceId }, orderBy: { id: 'desc' } }),
  ]);

  // Facts by topic
  const factsByTopic = await db.fact.groupBy({
    by: ['topic'],
    where: { supersededBy: null, stale: false, workspaceId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Decisions by status
  const decisionsByStatus = await db.decision.groupBy({
    by: ['status'],
    where: { workspaceId },
    _count: { id: true },
  });

  // Ledger by topic
  const ledgerByTopic = await db.ledger.groupBy({
    by: ['topic'],
    where: { workspaceId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Recent librarian runs (last 7)
  const recentRuns = await db.librarianRun.findMany({
    where: { workspaceId },
    orderBy: { id: 'desc' },
    take: 7,
  });

  // Disputes needing review
  const disputesNeedingReview = await db.decision.count({
    where: {
      status: 'active',
      reviewAt: { lte: new Date().toISOString().replace('T', ' ').slice(0, 19) },
      workspaceId,
    },
  });

  // Stale ratio
  const staleRatio = liveFactCount > 0
    ? Math.round((staleFactCount / (liveFactCount + staleFactCount)) * 100)
    : 0;

  // --- Dreamer / spark statistics ---
  const [
    dreamerTotal,
    dreamerDelivered,
    dreamerPending,
    dreamerRated,
    dreamerHits,
    dreamerKindGroups,
    dreamerScoreResult,
    sparkWeights,
  ] = await Promise.all([
    db.spark.count({ where: { workspaceId } }),
    db.spark.count({ where: { deliveredAt: { not: null }, workspaceId } }),
    db.spark.count({ where: { deliveredAt: null, workspaceId } }),
    db.spark.count({ where: { rating: { not: null }, workspaceId } }),
    db.spark.count({ where: { rating: 1, workspaceId } }),
    db.spark.groupBy({ by: ['kind'], where: { workspaceId }, _count: { id: true } }),
    db.spark.aggregate({ where: { workspaceId }, _avg: { score: true } }),
    db.sparkWeight.findMany({ where: { workspaceId }, orderBy: { trials: 'desc' }, take: 5 }),
  ]);

  const byKind: Record<string, number> = {};
  for (const g of dreamerKindGroups) {
    byKind[g.kind] = g._count.id;
  }

  const topPairs = sparkWeights.map((sw) => ({
    topicPair: sw.topicPair,
    trials: sw.trials,
    hits: sw.hits,
    hitRate: sw.trials > 0 ? Math.round((sw.hits / sw.trials) * 100) / 100 : 0,
  }));

  const dreamerHitRate =
    dreamerRated > 0
      ? Math.round((dreamerHits / dreamerRated) * 100) / 100
      : 0;

  return NextResponse.json({
    dreamer: {
      totalSparks: dreamerTotal,
      delivered: dreamerDelivered,
      pending: dreamerPending,
      rated: dreamerRated,
      hits: dreamerHits,
      hitRate: dreamerHitRate,
      avgScore: dreamerScoreResult._avg.score
        ? Math.round(dreamerScoreResult._avg.score * 100) / 100
        : 0,
      byKind,
      topPairs,
    },
    layers: {
      l1: { total: ledgerCount, unprocessed: ledgerUnprocessed, byTopic: ledgerByTopic },
      l2: {
        facts: { total: factCount, live: liveFactCount, stale: staleFactCount, staleRatio, byTopic: factsByTopic },
        decisions: { total: decisionCount, active: activeDecisionCount, byStatus: decisionsByStatus },
        preferences: preferenceCount,
        projectState: activeStateCount,
      },
      l3: { total: briefCount, dirty: dirtyBriefCount },
    },
    disputes: { open: openDisputeCount, resolved: resolvedDisputeCount },
    agents: agentCount,
    librarian: {
      totalRuns: librarianRunCount,
      lastRun,
      recentRuns,
    },
    decisionsNeedingReview: disputesNeedingReview,
    health: {
      staleRatio,
      unprocessedLedger: ledgerUnprocessed,
      openDisputes: openDisputeCount,
      dirtyBriefs: dirtyBriefCount,
    },
  });
});