/**
 * Centralized audit logging service.
 *
 * Provides a simple `audit()` function that writes to the AuditLog table.
 * Designed to be called from any API route or service.
 *
 * Usage:
 *   import { audit } from '@/lib/audit';
 *   await audit({ userId, action: 'user.login.success', resource: 'session' });
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AuditParams {
  userId?: number | null;
  action: string;
  resource: string;
  details?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write an audit log entry. Fire-and-forget — errors are logged but never thrown.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        details: params.details ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Audit logging must never break the main flow
    logger.error('Audit log write failed', {
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Extract IP and User-Agent from a NextRequest for audit logging.
 */
export function extractRequestMeta(request: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: request.headers.get('x-real-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown',
    userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? 'unknown',
  };
}