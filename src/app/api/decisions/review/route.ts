import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError } from '@/lib/errors';

const reviewDecisionSchema = z.object({
  id: z.number().int().positive(),
  outcome: z.string().min(1),
  lesson: z.string().optional(),
});

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const body = await request.json();
  const parsed = reviewDecisionSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const { id, outcome, lesson } = parsed.data;

  const decision = await db.decision.findFirst({ where: { id, workspaceId } });

  if (!decision) {
    throw new NotFoundError('Decision');
  }

  // Determine status based on outcome text
  let status = decision.status;
  if (/(fail|abandon|revert|undo|rolled back|cancelled|canceled)/i.test(outcome)) {
    status = 'failed';
  } else if (/(done|completed|success|implemented|resolved|shipped|delivered)/i.test(outcome)) {
    status = 'completed';
  }

  const updated = await db.decision.update({
    where: { id },
    data: {
      outcome,
      outcomeAt: now(),
      lesson: lesson || null,
      status,
    },
  });

  return NextResponse.json(updated);
});