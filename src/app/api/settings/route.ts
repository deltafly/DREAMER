import { getWorkspaceId, requireAuth, verifyWorkspaceAccess } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, ForbiddenError } from '@/lib/errors';

const DEFAULTS = {
  dreamerEnabled: false,
  dreamerSchedule: '0 3 * * *',
  librarianEnabled: false,
  librarianSchedule: '0 */4 * * *',
  timezone: 'Europe/Budapest',
};

function validateCronFormat(expr: string): { valid: boolean; error?: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return { valid: false, error: `Expected 5-6 fields, got ${parts.length}` };
  }
  const cronChars = /^[0-9*,\/\-?]+$/;
  for (const part of parts) {
    if (!cronChars.test(part)) {
      return { valid: false, error: `Invalid field: "${part}"` };
    }
  }
  return { valid: true };
}

function validateTimezone(tz: string): { valid: boolean; error?: string } {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return { valid: true };
  } catch {
    return { valid: false, error: `Invalid timezone: "${tz}". Use IANA format (e.g. "Europe/Budapest").` };
  }
}

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const existing = await db.workspaceSettings.findUnique({ where: { workspaceId } }).catch(() => null);

  if (existing) return NextResponse.json(existing);

  // Return defaults without creating — avoids Turbopack crash on create
  const nowISO = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return NextResponse.json({
    workspaceId,
    ...DEFAULTS,
    dreamerLastRunAt: null,
    dreamerNextRunAt: null,
    librarianLastRunAt: null,
    librarianNextRunAt: null,
    createdAt: nowISO,
    updatedAt: nowISO,
  });
});

const updateSettingsSchema = z.object({
  dreamerEnabled: z.boolean().optional(),
  librarianEnabled: z.boolean().optional(),
  dreamerSchedule: z.string().optional(),
  librarianSchedule: z.string().optional(),
  timezone: z.string().optional(),
});

export const PATCH = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const userId = await requireAuth();
  const role = await verifyWorkspaceAccess(userId, workspaceId);
  if (role === 'member') {
    throw new ForbiddenError('Csak owner vagy admin módosíthatja a beállításokat');
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (data.dreamerSchedule !== undefined) {
    const c = validateCronFormat(data.dreamerSchedule);
    if (!c.valid) throw new ValidationError(`Invalid dreamer schedule: ${c.error}`);
    updates.dreamerSchedule = data.dreamerSchedule;
  }
  if (data.dreamerEnabled !== undefined) {
    updates.dreamerEnabled = data.dreamerEnabled;
  }
  if (data.librarianSchedule !== undefined) {
    const c = validateCronFormat(data.librarianSchedule);
    if (!c.valid) throw new ValidationError(`Invalid librarian schedule: ${c.error}`);
    updates.librarianSchedule = data.librarianSchedule;
  }
  if (data.librarianEnabled !== undefined) {
    updates.librarianEnabled = data.librarianEnabled;
  }
  if (data.timezone !== undefined) {
    const c = validateTimezone(data.timezone);
    if (!c.valid) throw new ValidationError(c.error!);
    updates.timezone = data.timezone;
  }

  // Upsert: update if exists, create if not (create only happens on first PATCH)
  const existing = await db.workspaceSettings.findUnique({ where: { workspaceId } }).catch(() => null);

  let result;
  if (existing) {
    result = await db.workspaceSettings.update({ where: { workspaceId }, data: updates });
  } else {
    result = await db.workspaceSettings.create({
      data: { workspaceId, ...DEFAULTS, createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19), updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19), ...updates },
    });
  }

  return NextResponse.json(result);
});