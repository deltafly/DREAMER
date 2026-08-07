import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  const preferences = await db.preference.findMany({
    where: { active: true, workspaceId },
    orderBy: { id: 'asc' },
  });

  return NextResponse.json(preferences);
});