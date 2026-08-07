import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { withHandler } from '@/lib/api-handler';
import { ForbiddenError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';
import { audit, extractRequestMeta } from '@/lib/audit';

export const POST = withHandler(async (request: NextRequest) => {
  checkRateLimit(request, { windowMs: 3_600_000, maxRequests: 3 });

  const userId = await requireAuth();

  // Block demo account from erasure
  if (userId === 1) {
    throw new ForbiddenError('Demo account cannot be erased');
  }

  // Get workspace IDs for this user
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const { ipAddress, userAgent } = extractRequestMeta(request);

  // B1.2 FIX: Wrap all deletions in a transaction
  // If any step fails, the entire operation rolls back — no partial data loss
  await db.$transaction(async (tx) => {
    await tx.consent.deleteMany({ where: { userId } });
    await tx.dataExport.deleteMany({ where: { userId } });
    await tx.auditLog.deleteMany({ where: { userId } });
    await tx.workspaceMember.deleteMany({ where: { userId } });
    // Delete global Contest records created by this user (Contest is NOT workspace-scoped)
    await tx.contest.deleteMany({ where: { createdBy: userId } });
    // Workspace-scoped data cascades via onDelete: Cascade on Workspace
    await tx.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await tx.user.delete({ where: { id: userId } });
  });

  logger.info('GDPR erase completed', { userId, workspaceCount: workspaceIds.length });

  await audit({
    userId,
    action: 'gdpr.erase.completed',
    resource: 'user',
    details: `Deleted workspaces: ${workspaceIds.length}`,
    ipAddress,
    userAgent,
  });

  return NextResponse.json({
    success: true,
    message: 'All data has been permanently deleted',
  });
});