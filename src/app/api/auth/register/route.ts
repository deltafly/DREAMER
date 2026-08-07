import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { seedWorkspace } from '@/lib/seed-workspace';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, ConflictError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';
import { passwordSchema } from '@/lib/password';
import { audit, extractRequestMeta } from '@/lib/audit';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  password: passwordSchema,
});

export const POST = withHandler(async (request: NextRequest) => {
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 10 });

  const body = await request.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid input', parsed.error.issues);
  }

  const { email, name, password } = parsed.data;

  // Check if user already exists
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError('A user with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    },
  });

  // Generate slug from email
  const emailPrefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
  const slug = `${emailPrefix}-brain`;

  // Create default workspace
  const workspace = await db.workspace.create({
    data: {
      name: 'My Brain',
      slug,
      plan: 'free',
      ownerId: user.id,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    },
  });

  // Create workspace membership
  await db.workspaceMember.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      role: 'owner',
      joinedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    },
  });

  // Seed the workspace with demo data
  await seedWorkspace(workspace.id, db);

  // Audit log
  await audit({
    userId: user.id,
    action: 'user.registered',
    resource: 'user',
    details: `New user registered: ${user.email}`,
    ...extractRequestMeta(request),
  });

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
      },
    },
    { status: 201 }
  );
});