import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ topic: string }> }
) {
  const workspaceId = await getWorkspaceId(request);
  const { topic } = await params;

  const brief = await db.brief.findFirst({
    where: { workspaceId, topic },
  });

  if (!brief) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  const [szikra, openDisputes, upcomingReviews, farok] = await Promise.all([
    // SZIKRA: highest-score undelivered spark for this topic
    db.spark.findFirst({
      where: {
        workspaceId,
        deliveredAt: null,
        OR: [{ seedTopic: topic }, { pairedTopic: topic }],
      },
      orderBy: { score: 'desc' },
    }),
    // ESEDÉKES — open disputes
    db.dispute.findMany({
      where: { topic, status: 'open', workspaceId },
      orderBy: { createdAt: 'desc' },
    }),
    // ESEDÉKES — overdue / upcoming decision reviews
    db.decision.findMany({
      where: {
        topic,
        status: 'active',
        reviewAt: { lte: thirtyDaysFromNow },
        workspaceId,
      },
      orderBy: { reviewAt: 'asc' },
    }),
    // FAROK: unprocessed ledger entries for this topic
    db.ledger.findMany({
      where: { topic, processed: false, workspaceId },
      orderBy: { ts: 'asc' },
    }),
  ]);

  return NextResponse.json({
    topic: brief.topic,
    builtAt: brief.builtAt,
    dirty: brief.dirty,
    szikra: szikra
      ? {
          id: szikra.id,
          insight: szikra.insight,
          kind: szikra.kind,
          score: szikra.score,
          createdAt: szikra.createdAt,
        }
      : null,
    esedekes: {
      openDisputes,
      upcomingReviews,
    },
    kuralt: brief.content,
    farok: farok.map((e) => ({
      id: e.id,
      ts: e.ts,
      agentId: e.agentId,
      kind: e.kind,
      content: e.content,
      processed: e.processed,
    })),
  });
}