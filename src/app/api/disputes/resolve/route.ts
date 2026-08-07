import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const resolveSchema = z.object({
  id: z.number().int().positive(),
  ruling: z.string().min(10, 'Ruling must be at least 10 characters'),
  winner: z.enum(['existing', 'incoming']),
});

export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const body = await request.json().catch(() => ({}));
  const parsed = resolveSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.issues);
  }

  const { id, ruling, winner } = parsed.data;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const dispute = await db.dispute.findFirst({ where: { id, workspaceId } });
  if (!dispute) {
    throw new NotFoundError('Dispute');
  }
  if (dispute.status === 'resolved') {
    throw new ConflictError('Dispute already resolved');
  }

  // Resolve the dispute
  const resolved = await db.dispute.update({
    where: { id },
    data: {
      status: 'resolved',
      ruling,
      resolvedAt: now,
    },
  });

  // Supersede the losing fact/decision
  if (winner === 'incoming' && dispute.existingRef.startsWith('facts:')) {
    const factId = parseInt(dispute.existingRef.split(':')[1]);
    // Find the "incoming" fact (most recent unprocessed for this topic)
    const latestFact = await db.fact.findFirst({
      where: { topic: dispute.topic, supersededBy: null, workspaceId },
      orderBy: { id: 'desc' },
    });
    if (latestFact && factId) {
      await db.fact.update({
        where: { id: factId },
        data: { supersededBy: latestFact.id },
      });
    }
  } else if (winner === 'existing' && dispute.existingRef.startsWith('facts:')) {
    const factId = parseInt(dispute.existingRef.split(':')[1]);
    const latestFact = await db.fact.findFirst({
      where: { topic: dispute.topic, supersededBy: null, workspaceId },
      orderBy: { id: 'desc' },
    });
    if (latestFact && latestFact.id !== factId) {
      await db.fact.update({
        where: { id: latestFact.id },
        data: { supersededBy: factId },
      });
    }
  }

  // Mark the topic brief as dirty
  await db.brief.updateMany({
    where: { topic: dispute.topic, workspaceId },
    data: { dirty: true },
  });

  return NextResponse.json(resolved);
});