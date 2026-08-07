import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';
import { parsePagination } from '@/lib/pagination';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const CreateFactSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(100, 'Topic too long'),
  entity: z.string().min(1, 'Entity is required').max(200, 'Entity too long'),
  attribute: z.string().min(1, 'Attribute is required').max(200, 'Attribute too long'),
  statement: z.string().min(1, 'Statement is required').max(5000, 'Statement too long'),
  confidence: z.enum(['low', 'medium', 'high', 'verified']).optional().default('medium'),
  source: z.string().max(500).optional(),
});

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic');
  const includeStale = searchParams.get('stale') === 'true';
  const includeSuperseded = searchParams.get('superseded') === 'true';

  const where: Record<string, unknown> = {
    workspaceId,
    ...(topic && { topic }),
    ...(!includeSuperseded && { supersededBy: null }),
    ...(!includeStale && { stale: false }),
  };

  const { limit, offset } = parsePagination(searchParams);

  const [facts, total] = await Promise.all([
    db.fact.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.fact.count({ where }),
  ]);

  return NextResponse.json({ data: facts, total, limit, offset });
});

export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const body = await request.json().catch(() => ({}));
  const parsed = CreateFactSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.issues);
  }

  const { topic, entity, attribute, statement, confidence, source } = parsed.data;

  const fact = await db.fact.create({
    data: {
      topic,
      entity: entity.slice(0, 100),
      attribute: attribute.slice(0, 50),
      statement: statement.slice(0, 1000),
      confidence,
      source: source || 'mcp-tool',
      workspaceId,
      validFrom: new Date().toISOString(),
    },
  });

  return NextResponse.json(fact, { status: 201 });
});