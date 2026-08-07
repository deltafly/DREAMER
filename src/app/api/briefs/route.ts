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

  const [briefs, total] = await Promise.all([
    db.brief.findMany({
      where,
      orderBy: { builtAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.brief.count({ where }),
  ]);

  return NextResponse.json({ data: briefs, total, limit, offset });
});