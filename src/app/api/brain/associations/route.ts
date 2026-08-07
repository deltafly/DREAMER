import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic');

  const where: Record<string, unknown> = { workspaceId };
  if (topic) {
    where.factA = { topic };
  }

  const associations = await db.association.findMany({
    where,
    include: {
      factA: true,
      factB: true,
    },
    orderBy: { strength: 'desc' },
    take: 200,
  });

  return NextResponse.json({
    associations: associations.map(a => ({
      id: a.id,
      factA: {
        id: a.factA.id,
        topic: a.factA.topic,
        entity: a.factA.entity,
        attribute: a.factA.attribute,
        statement: a.factA.statement,
        confidence: a.factA.confidence,
        stale: a.factA.stale,
        validFrom: a.factA.validFrom,
        reviewAt: a.factA.reviewAt,
      },
      factB: {
        id: a.factB.id,
        topic: a.factB.topic,
        entity: a.factB.entity,
        attribute: a.factB.attribute,
        statement: a.factB.statement,
        confidence: a.factB.confidence,
        stale: a.factB.stale,
        validFrom: a.factB.validFrom,
        reviewAt: a.factB.reviewAt,
      },
      label: a.label,
      strength: a.strength,
      description: a.description,
      createdBy: a.createdBy,
    })),
  });
});