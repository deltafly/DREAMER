import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const limit = 50;

  // Combined activity: ledger entries + librarian runs + dispute resolutions
  const [ledgerEntries, librarianRuns, disputeResolutions] = await Promise.all([
    db.ledger.findMany({
      where: { workspaceId },
      orderBy: { ts: 'desc' },
      take: limit,
    }),
    db.librarianRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
    db.dispute.findMany({
      where: { status: 'resolved', workspaceId },
      orderBy: { resolvedAt: 'desc' },
      take: 10,
    }),
  ]);

  // Merge into unified timeline
  const timeline = [
    ...ledgerEntries.map(e => ({
      type: 'ledger' as const,
      id: `ledger-${e.id}`,
      ts: e.ts,
      topic: e.topic,
      kind: e.kind,
      agent: e.agentId,
      summary: e.content.slice(0, 120) + (e.content.length > 120 ? '…' : ''),
      meta: e.processed ? 'processed' : 'pending',
    })),
    ...librarianRuns.map(r => ({
      type: 'librarian' as const,
      id: `librarian-${r.id}`,
      ts: r.startedAt,
      topic: 'system',
      kind: r.status,
      agent: 'librarian',
      summary: r.summary || `Run #${r.id}`,
      meta: `${r.factsExtracted}f ${r.decisionsExtracted}d ${r.disputesCreated}dis ${r.briefsRebuilt}b ${r.staleFlagged}s`,
    })),
    ...disputeResolutions.map(d => ({
      type: 'dispute_resolved' as const,
      id: `dispute-${d.id}`,
      ts: d.resolvedAt || d.createdAt,
      topic: d.topic,
      kind: 'resolved',
      agent: 'owner',
      summary: d.ruling || `Dispute #${d.id} resolved`,
      meta: d.detectedBy,
    })),
  ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);

  return NextResponse.json(timeline);
});