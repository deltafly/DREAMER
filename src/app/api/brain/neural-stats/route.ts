import { getWorkspaceId } from '@/lib/auth-helpers';
import { getNeuralStats } from '@/lib/brain-stats';
import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const data = await getNeuralStats(workspaceId);
  return NextResponse.json(data);
});