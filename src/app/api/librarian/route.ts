import { getWorkspaceId, requireAuth, verifyWorkspaceAccess } from '@/lib/auth-helpers';
import { runLibrarian } from '@/lib/librarian';
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
    throw new ForbiddenError('Csak owner vagy admin indíthatja a Librarian-t');
  }

  const result = await withTaskLock(workspaceId, 'librarian', () =>
    runLibrarian(workspaceId),
  );

  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    throw new ConflictError('Librarian is already running for this workspace');
  }

  return NextResponse.json(result, {
    status: (result as Record<string, unknown>)?.success ? 200 : 500,
  });
});

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  const [lastRun, unprocessed] = await Promise.all([
    db.librarianRun.findFirst({
      where: { workspaceId },
      orderBy: { id: 'desc' },
    }),
    db.ledger.count({
      where: { processed: false, workspaceId },
    }),
  ]);

  return NextResponse.json({
    lastRun,
    unprocessedEntries: unprocessed,
    ready: lastRun?.status !== 'running',
    isRunning: isTaskRunning(workspaceId, 'librarian'),
  });
});