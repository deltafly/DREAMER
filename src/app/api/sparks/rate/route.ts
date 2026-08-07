import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RateBody = z.object({
  id: z.number().int().positive(),
  hit: z.boolean(),
});

export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const body = await request.json().catch(() => ({}));
  const parsed = RateBody.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.issues);
  }

  const { id, hit } = parsed.data;

  const spark = await db.spark.findFirst({ where: { id, workspaceId } });
  if (!spark) {
    throw new NotFoundError('Spark');
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Compute the sorted topic pair key
  const pair = [spark.seedTopic, spark.pairedTopic].sort();
  const topicPair = pair.join('|');

  // Update spark rating + deliveredAt
  const updated = await db.spark.update({
    where: { id },
    data: {
      rating: hit ? 1 : 0,
      deliveredAt: spark.deliveredAt ?? now,
    },
  });

  // Upsert spark_weights: increment trials, increment hits if hit=true
  await db.sparkWeight.upsert({
    where: { workspaceId_topicPair: { workspaceId, topicPair } },
    update: {
      trials: { increment: 1 },
      ...(hit ? { hits: { increment: 1 } } : {}),
    },
    create: {
      workspaceId,
      topicPair,
      trials: 1,
      hits: hit ? 1 : 0,
    },
  });

  return NextResponse.json(updated);
});