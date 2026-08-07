import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  const runs = await db.librarianRun.findMany({
    where: { workspaceId },
    orderBy: { id: 'desc' },
    take: 20,
  });

  return NextResponse.json(runs);
});