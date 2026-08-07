import { getWorkspaceId } from '@/lib/auth-helpers';
import { getKnowledgeGaps } from '@/lib/brain-gaps';
import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const data = await getKnowledgeGaps(workspaceId);
  return NextResponse.json(data);
});