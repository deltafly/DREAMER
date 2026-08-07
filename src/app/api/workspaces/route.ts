import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { seedWorkspace } from '@/lib/seed-workspace';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';
import { audit, extractRequestMeta } from '@/lib/audit';

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
});

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export const GET = withHandler(async (_request: NextRequest) => {
  const userId = await requireAuth();

  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          createdAt: true,
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    plan: m.workspace.plan,
    role: m.role,
    createdAt: m.workspace.createdAt,
  }));

  return NextResponse.json(workspaces);
});

export const POST = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { name } = parsed.data;
  const slug = generateSlug(name);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      plan: 'free',
      ownerId: userId,
      createdAt: now,
    },
  });

  await db.workspaceMember.create({
    data: {
      userId,
      workspaceId: workspace.id,
      role: 'owner',
      joinedAt: now,
    },
  });

  // Seed the workspace with demo data
  await seedWorkspace(workspace.id, db);

  // Audit log
  await audit({
    userId,
    action: 'workspace.created',
    resource: 'workspace',
    details: `Workspace: ${workspace.name} (ID: ${workspace.id})`,
    ...extractRequestMeta(request),
  });

  return NextResponse.json(
    {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      createdAt: workspace.createdAt,
    },
    { status: 201 }
  );
});