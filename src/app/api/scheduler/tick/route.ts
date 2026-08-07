import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getScheduler } from '@/lib/scheduler';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { acquireTaskLock, releaseTaskLock } from '@/lib/task-lock';
import { withHandler } from '@/lib/api-handler';
import { AuthError, ForbiddenError } from '@/lib/errors';

export const POST = withHandler(async (request: NextRequest) => {
  // ─── Auth: Bearer token check (timing-safe comparison) ────────────────
  const schedulerSecret = process.env.SCHEDULER_SECRET;

  if (!schedulerSecret) {
    throw new ForbiddenError('SCHEDULER_SECRET not configured');
  }

  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${schedulerSecret}`;

  if (
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    throw new AuthError('Invalid or missing authorization');
  }

  // ─── Reload scheduler to pick up latest settings ──────────────────────
  const scheduler = getScheduler();
  await scheduler.reloadAll();

  const now = new Date();
  const ran: Array<{ workspaceId: number; task: string; summary: string }> = [];

  const allSettings = await db.workspaceSettings.findMany();

  for (const settings of allSettings) {
    const { workspaceId, dreamerEnabled, dreamerNextRunAt, librarianEnabled, librarianNextRunAt } = settings;

    // ── Dreamer ─────────────────────────────────────────────────────
    if (dreamerEnabled && dreamerNextRunAt) {
      const nextRunDate = new Date(dreamerNextRunAt);
      if (nextRunDate <= now) {
        if (!acquireTaskLock(workspaceId, 'dreamer')) {
          logger.debug(`Scheduler/Tick: dreamer already running for workspace ${workspaceId}`);
        } else {
          try {
            logger.info(`Scheduler/Tick: running dreamer for workspace ${workspaceId}`);
            const { runDreamer } = await import('@/lib/dreamer');
            const result = await runDreamer(workspaceId);
            const lastRunAt = new Date().toISOString();

            const jobKey = `${workspaceId}:dreamer`;
            const job = scheduler.jobs.get(jobKey);
            const nextRun = job?.nextRun()?.toISOString() ?? null;

            await db.workspaceSettings.update({
              where: { workspaceId },
              data: {
                dreamerLastRunAt: lastRunAt,
                ...(nextRun ? { dreamerNextRunAt: nextRun } : {}),
                updatedAt: lastRunAt,
              },
            });

            const summary =
              result && typeof result === 'object' && 'summary' in result
                ? String((result as { summary: unknown }).summary)
                : 'completed';

            ran.push({ workspaceId, task: 'dreamer', summary });
          } catch (error) {
            logger.error(`Scheduler/Tick: dreamer error for workspace ${workspaceId}`, {
              err: error instanceof Error ? error.message : String(error),
            });
            ran.push({
              workspaceId,
              task: 'dreamer',
              summary: `error: ${error instanceof Error ? error.message : String(error)}`,
            });
          } finally {
            releaseTaskLock(workspaceId, 'dreamer');
          }
        }
      }
    }

    // ── Librarian ───────────────────────────────────────────────────
    if (librarianEnabled && librarianNextRunAt) {
      const nextRunDate = new Date(librarianNextRunAt);
      if (nextRunDate <= now) {
        if (!acquireTaskLock(workspaceId, 'librarian')) {
          logger.debug(`Scheduler/Tick: librarian already running for workspace ${workspaceId}`);
        } else {
          try {
            logger.info(`Scheduler/Tick: running librarian for workspace ${workspaceId}`);
            const { runLibrarian } = await import('@/lib/librarian');
            const result = await runLibrarian(workspaceId);
            const lastRunAt = new Date().toISOString();

            const jobKey = `${workspaceId}:librarian`;
            const job = scheduler.jobs.get(jobKey);
            const nextRun = job?.nextRun()?.toISOString() ?? null;

            await db.workspaceSettings.update({
              where: { workspaceId },
              data: {
                librarianLastRunAt: lastRunAt,
                ...(nextRun ? { librarianNextRunAt: nextRun } : {}),
                updatedAt: lastRunAt,
              },
            });

            const summary =
              result && typeof result === 'object' && 'summary' in result
                ? String((result as { summary: unknown }).summary)
                : 'completed';

            ran.push({ workspaceId, task: 'librarian', summary });
          } catch (error) {
            logger.error(`Scheduler/Tick: librarian error for workspace ${workspaceId}`, {
              err: error instanceof Error ? error.message : String(error),
            });
            ran.push({
              workspaceId,
              task: 'librarian',
              summary: `error: ${error instanceof Error ? error.message : String(error)}`,
            });
          } finally {
            releaseTaskLock(workspaceId, 'librarian');
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true, ran });
});