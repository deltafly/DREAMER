import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-helpers';

const updateContestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  prize: z.string().nullable().optional(),
  rules: z.string().nullable().optional(),
});

// GET /api/contest/contests/[id] — auth required (entries may contain workspace names)
export const GET = withHandler(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  await requireAuth();
  const { id } = await (context?.params ?? Promise.resolve({ id: '' }));
  const contestId = Number(id);

  if (isNaN(contestId)) {
    throw new ValidationError('Invalid contest ID');
  }

  const contest = await db.contest.findUnique({
    where: { id: contestId },
  });

  if (!contest) {
    throw new NotFoundError('Contest');
  }

  const [challenges, entries] = await Promise.all([
    db.challenge.findMany({
      where: { contestId },
      orderBy: { id: 'asc' },
      take: 200,
    }),
    db.contestEntry.findMany({
      where: { contestId },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { score: 'desc' },
      take: 200,
    }),
  ]);

  return NextResponse.json({ contest, challenges, entries });
});

// PATCH /api/contest/contests/[id] — only the creator can modify
export const PATCH = withHandler(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const userId = await requireAuth();
  const { id } = await (context?.params ?? Promise.resolve({ id: '' }));
  const contestId = Number(id);

  if (isNaN(contestId)) {
    throw new ValidationError('Invalid contest ID');
  }

  const body = await request.json();
  const parsed = updateContestSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const existing = await db.contest.findUnique({ where: { id: contestId } });
  if (!existing) {
    throw new NotFoundError('Contest');
  }

  // Ownership guard: only the creator can modify
  if (existing.createdBy !== userId) {
    throw new ForbiddenError('Only the contest creator can modify this contest');
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.endsAt !== undefined) updateData.endsAt = parsed.data.endsAt;
  if (parsed.data.prize !== undefined) updateData.prize = parsed.data.prize;
  if (parsed.data.rules !== undefined) updateData.rules = parsed.data.rules;

  const contest = await db.contest.update({
    where: { id: contestId },
    data: updateData,
  });

  return NextResponse.json({ contest });
});

// DELETE /api/contest/contests/[id] — only the creator can delete
export const DELETE = withHandler(async (
  _request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const userId = await requireAuth();
  const { id } = await (context?.params ?? Promise.resolve({ id: '' }));
  const contestId = Number(id);

  if (isNaN(contestId)) {
    throw new ValidationError('Invalid contest ID');
  }

  const existing = await db.contest.findUnique({ where: { id: contestId } });
  if (!existing) {
    throw new NotFoundError('Contest');
  }

  // Ownership guard: only the creator can delete
  if (existing.createdBy !== userId) {
    throw new ForbiddenError('Only the contest creator can delete this contest');
  }

  // Delete in transaction — entries and challenges cascade via schema onDelete: Cascade
  await db.contest.delete({
    where: { id: contestId },
  });

  return NextResponse.json({ success: true });
});