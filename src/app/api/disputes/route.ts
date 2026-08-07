import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { parsePagination } from '@/lib/pagination';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const { limit, offset } = parsePagination(searchParams);

  const where = { workspaceId };

  const [disputes, total] = await Promise.all([
    db.dispute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.dispute.count({ where }),
  ]);

  return NextResponse.json({ data: disputes, total, limit, offset });
});