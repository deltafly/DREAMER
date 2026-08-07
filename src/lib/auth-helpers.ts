import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuthError, ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const IS_DEV = process.env.NODE_ENV !== 'production';

interface SessionUser {
  userId: number;
  email: string;
  name: string;
}

async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;
    const raw = session.user as Record<string, unknown>;
    const userId = raw.userId as number | undefined;
    if (!userId || typeof userId !== 'number') return null;
    return { userId, email: session.user.email, name: session.user.name || '' };
  } catch {
    return null;
  }
}

/**
 * Require authentication and return the authenticated user ID.
 * Throws AuthError if not authenticated.
 */
export async function requireAuth(): Promise<number> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError('Not authenticated');
  }
  return user.userId;
}

/**
 * Get the workspace ID for the current request.
 *
 * PRODUCTION: Requires authentication. Workspace must belong to user.
 * DEVELOPMENT: Falls back to query/header param or workspace 1 for ease of development.
 *
 * Throws AuthError if not authenticated (production) or workspace not found.
 */
export async function getWorkspaceId(request: NextRequest): Promise<number> {
  const user = await getSessionUser();

  // In production, auth is mandatory
  if (!user && !IS_DEV) {
    throw new AuthError('Not authenticated');
  }

  // 1. Check query param
  const queryWs = request.nextUrl.searchParams.get('workspace');
  if (queryWs) {
    const wsId = Number(queryWs);
    if (!isNaN(wsId) && wsId > 0) {
      if (user) {
        await verifyWorkspaceAccess(user.userId, wsId);
      } else if (!IS_DEV) {
        throw new AuthError('Not authenticated');
      }
      return wsId;
    }
  }

  // 2. Check header
  const headerWs = request.headers.get('x-workspace-id');
  if (headerWs) {
    const wsId = Number(headerWs);
    if (!isNaN(wsId) && wsId > 0) {
      if (user) {
        await verifyWorkspaceAccess(user.userId, wsId);
      } else if (!IS_DEV) {
        throw new AuthError('Not authenticated');
      }
      return wsId;
    }
  }

  // 3. Authenticated user's first workspace
  if (user) {
    const membership = await db.workspaceMember.findFirst({
      where: { userId: user.userId },
      select: { workspaceId: true },
      orderBy: { joinedAt: 'asc' },
    });
    if (membership) return membership.workspaceId;
    throw new ForbiddenError('No workspace found. Create a workspace first.');
  }

  // 4. DEV FALLBACK: Allow unauthenticated access to workspace 1
  //    This is ONLY active when NODE_ENV !== 'production'
  if (IS_DEV) {
    logger.debug('DEV MODE: Unauthenticated access using default workspace', {
      method: request.method,
      url: request.url,
    });
    return 1;
  }

  throw new AuthError('Not authenticated');
}

/**
 * Verify user has access to a workspace.
 * Returns the user's role.
 * Throws ForbiddenError if no access.
 */
export async function verifyWorkspaceAccess(
  userId: number,
  workspaceId: number
): Promise<string> {
  const membership = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true },
  });

  if (!membership) {
    throw new ForbiddenError(`No access to workspace ${workspaceId}`);
  }

  return membership.role;
}