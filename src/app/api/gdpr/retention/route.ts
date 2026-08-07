import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (_request: NextRequest) => {
  const userId = await requireAuth();

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const where = { workspaceId: { in: workspaceIds } };

  const [ledgerCount, factsCount, decisionsCount, preferencesCount, disputesCount, briefsCount, agentsCount, sparksCount, associationsCount, insightsCount, auditLogsCount] =
    await Promise.all([
      db.ledger.count({ where: { ...where, ts: { lt: ninetyDaysAgo } } }),
      db.fact.count({ where: { ...where, validFrom: { lt: ninetyDaysAgo } } }),
      db.decision.count({ where: { ...where, decidedAt: { lt: ninetyDaysAgo } } }),
      db.preference.count({ where }),
      db.dispute.count({ where: { ...where, createdAt: { lt: ninetyDaysAgo } } }),
      db.brief.count({ where }),
      db.agent.count({ where }),
      db.spark.count({ where: { ...where, createdAt: { lt: ninetyDaysAgo } } }),
      db.association.count({ where: { ...where, createdAt: { lt: ninetyDaysAgo } } }),
      db.insight.count({ where: { ...where, createdAt: { lt: ninetyDaysAgo } } }),
      db.auditLog.count({ where: { userId, createdAt: { lt: ninetyDaysAgo } } }),
    ]);

  const summary = {
    ledger: ledgerCount,
    facts: factsCount,
    decisions: decisionsCount,
    preferences: preferencesCount,
    disputes: disputesCount,
    briefs: briefsCount,
    agents: agentsCount,
    sparks: sparksCount,
    associations: associationsCount,
    insights: insightsCount,
    auditLogs: auditLogsCount,
  };

  const total = Object.values(summary).reduce((sum, v) => sum + v, 0);

  return NextResponse.json({ summary, total });
});

export const POST = withHandler(async (_request: NextRequest) => {
  const userId = await requireAuth();

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Delete AuditLog entries older than 90 days for this user
  const auditDeleteResult = await db.auditLog.deleteMany({
    where: {
      userId,
      createdAt: { lt: ninetyDaysAgo },
    },
  });

  // Mark DataExport as expired if past expiresAt
  const expiredExports = await db.dataExport.findMany({
    where: {
      userId,
      status: 'completed',
      expiresAt: { lt: now },
    },
    select: { id: true },
  });

  // Batch update instead of loop
  if (expiredExports.length > 0) {
    await db.dataExport.updateMany({
      where: {
        id: { in: expiredExports.map((e) => e.id) },
      },
      data: {
        status: 'expired',
        filePath: null,
      },
    });
  }

  const deleted = auditDeleteResult.count + expiredExports.length;

  logger.info('GDPR retention purge completed', { userId, deleted });

  return NextResponse.json({ deleted });
});