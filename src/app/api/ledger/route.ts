import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { parsePagination } from '@/lib/pagination';

const CreateLedgerSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(200, 'Topic too long'),
  content: z.string().min(1, 'Content is required'),
  kind: z.string().max(50).optional(),
  agentId: z.string().max(100).optional(),
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

  const { topic, content, kind, agentId } = parsed.data;

  const entry = await db.ledger.create({
    data: {
      ts: new Date().toISOString().replace('T', ' ').slice(0, 19),
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