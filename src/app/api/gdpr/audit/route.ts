import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  const url = request.nextUrl;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

  const where = { userId };

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total });
});