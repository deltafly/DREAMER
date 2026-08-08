import { db } from '@/lib/db';
import { requireAuth, verifyWorkspaceAccess } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';
import { audit, extractRequestMeta } from '@/lib/audit';
import { KEY_DISCLOSURE_NOTICE, generateAgentKey, hashAgentKey } from '@/lib/agent-keys';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Replace an agent's API key.
 *
 * A credential you cannot replace is a credential you cannot contain. Before
 * this existed, an agent key that leaked could only be dealt with by editing
 * the database by hand — which in practice means it was never dealt with.
 *
 * The old key stops working the moment this returns. The new one is in the
 * response and nowhere else.
 */
export const POST = withHandler(async (request: NextRequest, context) => {
  // Rotation is cheap to call and invalidates a working credential, so it is
  // limited more tightly than an ordinary write.
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 5 });

  const userId = await requireAuth();

  const params = await context?.params;
  const agentRowId = parseInt(params?.id ?? '', 10);
  if (isNaN(agentRowId)) {
    throw new ValidationError('Invalid agent ID');
  }

  const agent = await db.agent.findUnique({
    where: { id: agentRowId },
    select: { id: true, agentId: true, role: true, workspaceId: true },
  });
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  // Membership is checked against the agent's own workspace, not one supplied
  // by the caller — otherwise the id in the path would select the target and
  // the caller would select the permission.
  const role = await verifyWorkspaceAccess(userId, agent.workspaceId);
  if (role !== 'owner' && role !== 'admin') {
    throw new ForbiddenError('Only owner or admin can rotate agent keys');
  }

  const key = generateAgentKey();
  await db.agent.update({
    where: { id: agent.id },
    data: { keyHash: hashAgentKey(key) },
  });

  await audit({
    userId,
    action: 'agent.key_rotated',
    resource: 'agent',
    // The key itself never reaches the audit log.
    details: `Rotated key for agent ${agent.agentId} in workspace ${agent.workspaceId}`,
    ...extractRequestMeta(request),
  });

  return NextResponse.json({
    id: agent.id,
    agentId: agent.agentId,
    role: agent.role,
    key,
    notice: KEY_DISCLOSURE_NOTICE,
  });
});
