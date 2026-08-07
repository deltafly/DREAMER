import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, verifyWorkspaceAccess } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { audit, extractRequestMeta } from '@/lib/audit';

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  plan: z.enum(['free', 'pro', 'team']).optional(),
});

export const GET = withHandler(async (
  _request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const userId = await requireAuth();
  const { id } = await (context?.params ?? Promise.resolve({ id: '' }));
  const workspaceId = Number(id);

  if (isNaN(workspaceId)) {
    throw new ValidationError('Invalid workspace ID');
  }

  const role = await verifyWorkspaceAccess(userId, workspaceId);

  const memberCount = await db.workspaceMember.count({
    where: { workspaceId },
  });

  // Compute stats
  const [
    ledgerCount,
    factCount,
    decisionCount,
    disputeCount,
    sparkCount,
    insightCount,
  ] = await Promise.all([
    db.ledger.count({ where: { workspaceId } }),
    db.fact.count({ where: { workspaceId } }),
    db.decision.count({ where: { workspaceId } }),
    db.dispute.count({ where: { workspaceId, status: 'open' } }),
    db.spark.count({ where: { workspaceId, rating: 1 } }),
    db.insight.count({ where: { workspaceId, dismissed: false } }),
  ]);

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, slug: true, plan: true, createdAt: true },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  return NextResponse.json({
    id: workspaceId,
    name: workspace.name,
    slug: workspace.slug,
    plan: workspace.plan,
    role,
    memberCount,
    createdAt: workspace.createdAt,
    stats: {
      layers: {
        l1: ledgerCount,
        l2: factCount + decisionCount,
        l3: 1, // briefs don't need a count for the overview
      },
      agents: 5, // seeded count
      disputes: disputeCount,
      dreamer: {
        sparks: sparkCount,
      },
      brain: {
        insights: insightCount,
      },
    },
  });
});

export const PATCH = withHandler(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const userId = await requireAuth();
  const { id } = await (context?.params ?? Promise.resolve({ id: '' }));
  const workspaceId = Number(id);

  if (isNaN(workspaceId)) {
    throw new ValidationError('Invalid workspace ID');
  }

  const role = await verifyWorkspaceAccess(userId, workspaceId);

  // Only owner or admin can update
  if (role !== 'owner' && role !== 'admin') {
    throw new ForbiddenError('Only owner or admin can update workspace');
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const workspace = await db.workspace.update({
    where: { id: workspaceId },
    data: parsed.data,
  });

  return NextResponse.json({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    plan: workspace.plan,
    createdAt: workspace.createdAt,
  });
});

export const DELETE = withHandler(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const userId = await requireAuth();
  const { id } = await (context?.params ?? Promise.resolve({ id: '' }));
  const workspaceId = Number(id);

  if (isNaN(workspaceId)) {
    throw new ValidationError('Invalid workspace ID');
  }

  const role = await verifyWorkspaceAccess(userId, workspaceId);

  // Only owner can delete
  if (role !== 'owner') {
    throw new ForbiddenError('Only the workspace owner can delete it');
  }

  // Audit before delete
  await audit({
    userId,
    action: 'workspace.deleted',
    resource: 'workspace',
    details: `Workspace ID: ${workspaceId}`,
    ...extractRequestMeta(request),
  });

  // Delete workspace (cascade handles members and all content)
  await db.workspace.delete({
    where: { id: workspaceId },
  });

  return NextResponse.json({ success: true });
});