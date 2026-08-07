import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const topic = searchParams.get('topic');

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  const factsWhere: Record<string, unknown>[] = [
    { workspaceId },
    { supersededBy: null },
    { stale: false },
    { statement: { contains: q } },
  ];
  if (topic) factsWhere.push({ topic });

  const decisionsWhere: Record<string, unknown>[] = [
    { workspaceId },
    { OR: [{ decision: { contains: q } }, { rationale: { contains: q } }] },
  ];
  if (topic) decisionsWhere.push({ topic });

  const ledgerWhere: Record<string, unknown> = { workspaceId, content: { contains: q } };

  const [facts, decisions, ledgerEntries] = await Promise.all([
    db.fact.findMany({
      where: { AND: factsWhere },
      take: 10,
      orderBy: { id: 'desc' },
    }),
    db.decision.findMany({
      where: { AND: decisionsWhere },
      take: 10,
      orderBy: { decidedAt: 'desc' },
    }),
    db.ledger.findMany({
      where: ledgerWhere,
      take: 10,
      orderBy: { ts: 'desc' },
    }),
  ]);

  const results = [
    ...facts.map(f => ({ type: 'fact' as const, id: f.id, topic: f.topic, snippet: f.statement, meta: `${f.entity} / ${f.attribute} (${f.confidence})`, ts: f.validFrom })),
    ...decisions.map(d => ({ type: 'decision' as const, id: d.id, topic: d.topic, snippet: d.decision, meta: `status: ${d.status}`, ts: d.decidedAt })),
    ...ledgerEntries.map(l => ({ type: 'ledger' as const, id: l.id, topic: l.topic, snippet: l.content.slice(0, 200) + (l.content.length > 200 ? '…' : ''), meta: `${l.kind} by ${l.agentId}`, ts: l.ts })),
  ];

  return NextResponse.json({ results, query: q });
});