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

  const [agents, total] = await Promise.all([
    db.agent.findMany({
      where,
      // Selected explicitly so keyHash stays out of the response. It is only a
      // hash, but it is the stored form of a credential and an offline target;
      // listing agents is no reason to hand it to every workspace member.
      select: { id: true, agentId: true, role: true, workspaceId: true },
      orderBy: { id: 'asc' },
      take: limit,
      skip: offset,
    }),
    db.agent.count({ where }),
  ]);

  // Replace N+1 enrichment with a single groupBy query
  const ledgerStats = await db.ledger.groupBy({
    by: ['agentId'],
    where: { workspaceId },
    _count: { id: true },
    _max: { ts: true },
  });

  const statsMap = new Map(ledgerStats.map(s => [s.agentId, { count: s._count.id, lastTs: s._max.ts }]));

  const enriched = agents.map(a => {
    const stats = statsMap.get(a.agentId);
    return {
      ...a,
      ledgerEntries: stats?.count || 0,
      lastActivity: stats?.lastTs || null,
    };
  });

  return NextResponse.json({ data: enriched, total, limit, offset });
});