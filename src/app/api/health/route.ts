import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getActiveLocks } from '@/lib/task-lock';
import { withHandler } from '@/lib/api-handler';

const START_TIME = Date.now();

export const GET = withHandler(async (_request: NextRequest) => {
  // Quick DB connectivity check
  await db.fact.count({ take: 1 });

  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  const activeLocks = getActiveLocks();

  return NextResponse.json({
    status: 'ok',
    version: '5.2.0',
    uptime,
    db: 'connected',
    checks: { factTableAccessible: true },
    activeTaskLocks: activeLocks.length > 0 ? activeLocks : undefined,
  });
});