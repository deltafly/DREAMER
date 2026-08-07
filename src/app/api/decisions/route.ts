import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { parsePagination } from '@/lib/pagination';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic');
  const status = searchParams.get('status');

  const where: Record<string, unknown> = {
    workspaceId,
    ...(topic && { topic }),
    ...(status && { status }),
  };

  const { limit, offset } = parsePagination(searchParams);

  const [decisions, total] = await Promise.all([
    db.decision.findMany({
      where,
      orderBy: { decidedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.decision.count({ where }),
  ]);

  return NextResponse.json({ data: decisions, total, limit, offset });
});