import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';
import { audit, extractRequestMeta } from '@/lib/audit';

export const POST = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  const now = new Date().toISOString();

  const dataExport = await db.dataExport.create({
    data: {
      userId,
      status: 'pending',
      requestedAt: now,
    },
  });

  return NextResponse.json(dataExport, { status: 201 });
});

export const GET = withHandler(async (request: NextRequest) => {
  const userId = await requireAuth();

  // Check for pending exports older than 1 minute — auto-generate them
  const pendingExports = await db.dataExport.findMany({
    where: { userId, status: 'pending' },
  });

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

  for (const exp of pendingExports) {
    if (exp.requestedAt < oneMinuteAgo) {
      await generateExport(userId, exp.id, request);
    }
  }

  const exports_ = await db.dataExport.findMany({
    where: { userId },
    orderBy: { requestedAt: 'desc' },
  });

  return NextResponse.json({ exports: exports_ });
});

async function generateExport(userId: number, exportId: number, request: NextRequest) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const workspaces = await db.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, name: true, slug: true, plan: true, createdAt: true },
  });

  const where = { workspaceId: { in: workspaceIds } };

  // Global contests created by this user
  const userContests = await db.contest.findMany({
    where: { createdBy: userId },
  });
  const contestIds = userContests.map((c) => c.id);

  const [
    ledger, facts, decisions, preferences, disputes, briefs, agents, sparks, associations, insights, consent,
    contestEntries, achievements, projectStates, neuralActivity, brainQueries, librarianRuns, sparkWeights,
    workspaceSettings, workspaceMembers, challenges,
  ] = await Promise.all([
    db.ledger.findMany({ where }),
    db.fact.findMany({ where }),
    db.decision.findMany({ where }),
    db.preference.findMany({ where }),
    db.dispute.findMany({ where }),
    db.brief.findMany({ where }),
    db.agent.findMany({ where }),
    db.spark.findMany({ where }),
    db.association.findMany({ where }),
    db.insight.findMany({ where }),
    db.consent.findMany({ where: { userId } }),
    db.contestEntry.findMany({ where }),
    db.achievement.findMany({ where }),
    db.projectState.findMany({ where }),
    db.neuralActivity.findMany({ where }),
    db.brainQuery.findMany({ where }),
    db.librarianRun.findMany({ where }),
    db.sparkWeight.findMany({ where }),
    db.workspaceSettings.findMany({ where }),
    // Fetch all workspace members for the user's workspaces (team structure)
    db.workspaceMember.findMany({
      where: { workspaceId: { in: workspaceIds } },
    }),
    // Challenges for contests created by this user
    contestIds.length > 0 ? db.challenge.findMany({ where: { contestId: { in: contestIds } } }) : Promise.resolve([]),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    user,
    workspaces,
    workspaceMembers,
    ledger,
    facts,
    decisions,
    preferences,
    disputes,
    briefs,
    agents,
    sparks,
    associations,
    insights,
    consent,
    projectStates,
    neuralActivity,
    brainQueries,
    librarianRuns,
    sparkWeights,
    workspaceSettings,
    contestEntries,
    achievements,
    // Global contest data
    contests: userContests,
    challenges,
  };

  // Write export to a real file instead of storing JSON in filePath column
  const exportDir = path.join(process.cwd(), 'db', 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const timestamp = Date.now();
  const fileName = `export_${exportId}_${timestamp}.json`;
  const filePath = path.join(exportDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.dataExport.update({
    where: { id: exportId },
    data: {
      status: 'completed',
      completedAt: now.toISOString(),
      expiresAt,
      filePath,
    },
  });

  const { ipAddress, userAgent } = extractRequestMeta(request);
  await audit({
    userId,
    action: 'gdpr.export.completed',
    resource: 'data_export',
    details: `Export ID: ${exportId}`,
    ipAddress,
    userAgent,
  });
}