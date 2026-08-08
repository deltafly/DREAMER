import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { parsePagination } from '@/lib/pagination';
import { normalizeTimestamp, now } from '@/lib/time';

const CreateLedgerSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(200, 'Topic too long'),
  content: z.string().min(1, 'Content is required'),
  kind: z.string().max(50).optional(),
  agentId: z.string().max(100).optional(),
  /**
   * When the entry actually happened. Omit it and the entry is stamped now.
   *
   * This exists so history can be imported truthfully. The ledger is the
   * timeline the whole system reasons over: `Fact.validFrom` is derived from
   * it, and the supersede chain uses that ordering to decide which fact
   * replaced which. Stamping an imported archive with the wall clock collapses
   * that timeline into a single instant and the chain resolves arbitrarily.
   */
  ts: z
    .string()
    .max(40)
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const normalized = normalizeTimestamp(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Invalid ts — expected a date or timestamp such as "2025-01-15", "2025-01-15 14:30" or an ISO 8601 value, and not more than 24 hours in the future',
        });
        return z.NEVER;
      }
      return normalized;
    }),
});

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic');
  const agentId = searchParams.get('agentId');
  const kind = searchParams.get('kind');
  const { limit, offset } = parsePagination(searchParams);

  const where: Record<string, unknown> = {
    workspaceId,
    ...(topic && { topic }),
    ...(agentId && { agentId }),
    ...(kind && { kind }),
  };

  const entries = await db.ledger.findMany({
    where,
    orderBy: { ts: 'desc' },
    take: limit,
    skip: offset,
  });

  return NextResponse.json({ data: entries, limit, offset });
});

export const POST = withHandler(async (request: NextRequest) => {
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 30 });

  const workspaceId = await getWorkspaceId(request);
  const body = await request.json().catch(() => ({}));
  const parsed = CreateLedgerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.issues);
  }

  const { topic, content, kind, agentId, ts } = parsed.data;

  const entry = await db.ledger.create({
    data: {
      ts: ts ?? now(),
      agentId: agentId || 'claude-web',
      topic,
      kind: kind || 'digest',
      content,
      processed: false,
      workspaceId,
    },
  });

  return NextResponse.json(entry);
});