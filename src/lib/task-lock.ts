/**
 * In-memory task overlap protection.
 *
 * Prevents concurrent execution of expensive tasks (dreamer, librarian, plasticity)
 * within the same workspace. Works for single-process deployments (SQLite).
 *
 * In multi-process deployments (future), this should be replaced with DB-based locks.
 */

import { logger } from '@/lib/logger';

const activeLocks = new Map<string, { acquiredAt: number; taskName: string }>();

/** Max lock duration in ms (10 minutes). Safety net against stuck locks. */
const MAX_LOCK_DURATION_MS = 10 * 60 * 1000;

/**
 * Try to acquire a task lock for a workspace.
 * Returns true if lock was acquired, false if task is already running.
 */
export function acquireTaskLock(
  workspaceId: number,
  taskName: string,
): boolean {
  const key = `${workspaceId}:${taskName}`;

  // Check for stale lock (safety net)
  const existing = activeLocks.get(key);
  if (existing) {
    const age = Date.now() - existing.acquiredAt;
    if (age > MAX_LOCK_DURATION_MS) {
      logger.warn(`Stale task lock detected, force-releasing`, {
        key,
        taskName,
        ageMs: age,
      });
      activeLocks.delete(key);
    } else {
      return false; // Still active
    }
  }

  activeLocks.set(key, { acquiredAt: Date.now(), taskName });
  logger.debug(`Task lock acquired`, { key, taskName });
  return true;
}

/**
 * Release a task lock.
 */
export function releaseTaskLock(
  workspaceId: number,
  taskName: string,
): void {
  const key = `${workspaceId}:${taskName}`;
  const existed = activeLocks.delete(key);
  if (existed) {
    logger.debug(`Task lock released`, { key, taskName });
  }
}

/**
 * Check if a task is currently running (without acquiring).
 */
export function isTaskRunning(
  workspaceId: number,
  taskName: string,
): boolean {
  const key = `${workspaceId}:${taskName}`;
  const existing = activeLocks.get(key);
  if (!existing) return false;

  // Check for stale lock
  if (Date.now() - existing.acquiredAt > MAX_LOCK_DURATION_MS) {
    activeLocks.delete(key);
    return false;
  }

  return true;
}

/**
 * Get all currently active locks (for diagnostics / health check).
 */
export function getActiveLocks(): Array<{
  key: string;
  taskName: string;
  acquiredAt: number;
  ageMs: number;
}> {
  return Array.from(activeLocks.entries()).map(([key, val]) => ({
    key,
    taskName: val.taskName,
    acquiredAt: val.acquiredAt,
    ageMs: Date.now() - val.acquiredAt,
  }));
}

/**
 * Run a task with automatic lock acquisition and release.
 * Returns { success: false, reason: 'already_running' } if lock cannot be acquired.
 */
export async function withTaskLock<T>(
  workspaceId: number,
  taskName: string,
  fn: () => Promise<T>,
): Promise<T | { success: false; reason: 'already_running' }> {
  if (!acquireTaskLock(workspaceId, taskName)) {
    logger.warn(`Task ${taskName} skipped for workspace ${workspaceId}: already running`);
    return { success: false, reason: 'already_running' as const };
  }

  try {
    return await fn();
  } finally {
    releaseTaskLock(workspaceId, taskName);
  }
}