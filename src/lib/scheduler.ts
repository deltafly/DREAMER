import { Cron } from 'croner';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { acquireTaskLock, releaseTaskLock } from '@/lib/task-lock';

// Lazy loaders — avoid pulling in z-ai-web-dev-sdk at module eval time
type TaskFn = (workspaceId: number) => Promise<unknown>;
let _dreamerFn: TaskFn | null = null;
let _librarianFn: TaskFn | null = null;

async function getDreamerFn(): Promise<TaskFn> {
  if (!_dreamerFn) {
    const mod = await import('@/lib/dreamer');
    _dreamerFn = mod.runDreamer;
  }
  return _dreamerFn;
}

async function getLibrarianFn(): Promise<TaskFn> {
  if (!_librarianFn) {
    const mod = await import('@/lib/librarian');
    _librarianFn = mod.runLibrarian;
  }
  return _librarianFn;
}

// ─── Production guard ─────────────────────────────────────────────────────
// croner creates native timers that crash Turbopack dev server.
// The scheduler only creates Cron jobs in production.
// In dev, the manual "Álmodj most" / "Rendezd most" buttons still work
// via the direct API routes — only automated scheduling is disabled.

const isDev = process.env.NODE_ENV !== 'production';

interface SchedulerInstance {
  jobs: Map<string, Cron>;
  started: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reload: (workspaceId: number) => Promise<void>;
  reloadAll: () => Promise<void>;
}

// ─── Singleton guard (survives Next.js hot-reload) ─────────────────────────

const SCHEDULER_KEY = '__oneBrainerScheduler' as const;

function createScheduler(): SchedulerInstance {
  const jobs: Map<string, Cron> = new Map();

  /** Run a task with overlap protection (via task-lock), DB timestamp updates, and error tolerance */
  const executeTask = async (
    workspaceId: number,
    taskName: 'dreamer' | 'librarian',
    fn: (workspaceId: number) => Promise<unknown>,
  ) => {
    // Shared overlap protection via task-lock (also used by API routes)
    if (!acquireTaskLock(workspaceId, taskName)) {
      logger.warn(`Scheduler skipped ${taskName} for workspace ${workspaceId}: already running`);
      return null;
    }

    try {
      logger.info(`Scheduler running ${taskName} for workspace ${workspaceId}`);

      const result = await fn(workspaceId);
      const now = new Date().toISOString();

      // Update lastRunAt in DB
      const updateData: Record<string, string> = { updatedAt: now };
      if (taskName === 'dreamer') {
        updateData.dreamerLastRunAt = now;
      } else {
        updateData.librarianLastRunAt = now;
      }

      await db.workspaceSettings.update({
        where: { workspaceId },
        data: updateData,
      });

      const summary =
        result && typeof result === 'object' && 'summary' in result
          ? (result as { summary: string }).summary
          : 'completed';

      logger.info(`Scheduler ${taskName} for workspace ${workspaceId}: ${summary}`);
      return result;
    } catch (error) {
      logger.error(`Scheduler error running ${taskName} for workspace ${workspaceId}`, {
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      releaseTaskLock(workspaceId, taskName);
    }
  };

  /** Register a single cron job for a workspace+task */
  const registerJob = (
    workspaceId: number,
    taskName: 'dreamer' | 'librarian',
    schedule: string,
    timezone: string,
  ) => {
    if (isDev) {
      logger.debug(`Scheduler dev mode: skipping ${taskName} cron for workspace ${workspaceId} (manual triggers still work)`);
      return;
    }

    const jobKey = `${workspaceId}:${taskName}`;

    // Remove existing job for this key if any
    const existing = jobs.get(jobKey);
    if (existing) {
      existing.stop();
      jobs.delete(jobKey);
    }

    try {
      const taskFn = taskName === 'dreamer' ? getDreamerFn : getLibrarianFn;

      const job = new Cron(
        schedule,
        {
          timezone: timezone || 'UTC',
          protect: false, // we handle overlap ourselves
        },
        async () => {
          const fn = await taskFn();
          await executeTask(workspaceId, taskName, fn);
        },
      );

      jobs.set(jobKey, job);

      // Compute and store nextRunAt
      const nextRun = job.nextRun();
      if (nextRun) {
        const nextRunISO = nextRun.toISOString();
        const updateData: Record<string, string> = {};
        if (taskName === 'dreamer') {
          updateData.dreamerNextRunAt = nextRunISO;
        } else {
          updateData.librarianNextRunAt = nextRunISO;
        }

        db.workspaceSettings
          .update({
            where: { workspaceId },
            data: updateData,
          })
          .catch((err) => {
            logger.error(`Scheduler failed to update nextRunAt for ${jobKey}`, {
              err: err instanceof Error ? err.message : String(err),
            });
          });
      }

      logger.info(`Scheduler registered ${taskName} job for workspace ${workspaceId}`, {
        schedule,
        timezone,
        nextRun: nextRun?.toISOString() ?? 'none',
      });
    } catch (error) {
      logger.error(`Scheduler failed to register ${taskName} job for workspace ${workspaceId}`, {
        err: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** Register all cron jobs for a single workspace from its DB settings */
  const registerWorkspaceJobs = async (settings: {
    workspaceId: number;
    dreamerEnabled: boolean;
    dreamerSchedule: string;
    librarianEnabled: boolean;
    librarianSchedule: string;
    timezone: string;
  }) => {
    const {
      workspaceId,
      dreamerEnabled,
      dreamerSchedule,
      librarianEnabled,
      librarianSchedule,
      timezone,
    } = settings;

    if (dreamerEnabled && dreamerSchedule) {
      registerJob(workspaceId, 'dreamer', dreamerSchedule, timezone);
    }

    if (librarianEnabled && librarianSchedule) {
      registerJob(workspaceId, 'librarian', librarianSchedule, timezone);
    }
  };

  /** Stop all cron jobs for a given workspace */
  const stopWorkspaceJobs = (workspaceId: number) => {
    for (const key of ['dreamer', 'librarian'] as const) {
      const jobKey = `${workspaceId}:${key}`;
      const job = jobs.get(jobKey);
      if (job) {
        job.stop();
        jobs.delete(jobKey);
        logger.debug(`Scheduler stopped ${key} job for workspace ${workspaceId}`);
      }
    }
  };

  // ─── Public API ───────────────────────────────────────────────────────

  const instance: SchedulerInstance = {
    jobs,
    started: false,

    async start() {
      if (this.started) {
        logger.debug('Scheduler already started, skipping');
        return;
      }

      logger.info('Scheduler starting...');

      try {
        const allSettings = await db.workspaceSettings.findMany();

        for (const settings of allSettings) {
          await registerWorkspaceJobs(settings);
        }

        this.started = true;
        logger.info(`Scheduler started with ${this.jobs.size} cron job(s) across ${allSettings.length} workspace(s)`);
      } catch (error) {
        logger.error('Scheduler failed to start', {
          err: error instanceof Error ? error.message : String(error),
        });
      }
    },

    stop() {
      logger.info(`Scheduler stopping ${this.jobs.size} job(s)...`);

      for (const [key, job] of this.jobs) {
        try {
          job.stop();
        } catch (e) {
          logger.error(`Scheduler error stopping job ${key}`, {
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }

      this.jobs.clear();
      this.started = false;
      logger.info('Scheduler stopped');
    },

    async reload(workspaceId: number) {
      logger.info(`Scheduler reloading workspace ${workspaceId}`);

      // 1. Stop existing jobs for this workspace
      stopWorkspaceJobs(workspaceId);

      // 2. Re-read settings from DB
      try {
        const settings = await db.workspaceSettings.findUnique({
          where: { workspaceId },
        });

        if (!settings) {
          logger.debug(`Scheduler no settings for workspace ${workspaceId}, skipping`);
          return;
        }

        // 3. Register new jobs if enabled
        await registerWorkspaceJobs(settings);
        logger.info(`Scheduler reloaded workspace ${workspaceId}: ${jobs.size} total job(s) active`);
      } catch (error) {
        logger.error(`Scheduler failed to reload workspace ${workspaceId}`, {
          err: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async reloadAll() {
      logger.info('Scheduler reloading all...');

      // Stop everything
      for (const [key, job] of this.jobs) {
        try {
          job.stop();
        } catch (e) {
          logger.error(`Scheduler error stopping job ${key}`, {
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }
      this.jobs.clear();

      // Re-read all settings and register
      try {
        const allSettings = await db.workspaceSettings.findMany();

        for (const settings of allSettings) {
          await registerWorkspaceJobs(settings);
        }

        this.started = true;
        logger.info(`Scheduler reloaded: ${this.jobs.size} job(s) across ${allSettings.length} workspace(s)`);
      } catch (error) {
        logger.error('Scheduler failed to reload all', {
          err: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };

  return instance;
}

// ─── Singleton accessor ─────────────────────────────────────────────────────

declare global {
  var __oneBrainerScheduler: SchedulerInstance | undefined;
}

export function getScheduler(): SchedulerInstance {
  if (!globalThis.__oneBrainerScheduler) {
    globalThis.__oneBrainerScheduler = createScheduler();
    // Auto-start on first access (lazy init)
    // Use setImmediate to avoid blocking the caller
    setImmediate(() => {
      globalThis.__oneBrainerScheduler!.start().catch((e) => {
        logger.error('Scheduler lazy start failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      });
    });
  }
  return globalThis.__oneBrainerScheduler;
}