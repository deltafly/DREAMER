import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { withHandler } from '@/lib/api-handler';

interface AchievementDef {
  badge: string;
  title: string;
  description: string;
  points: number;
  check: (stats: Record<string, number>) => boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    badge: 'first-fact',
    title: 'First Fact',
    description: 'Recorded your first fact',
    points: 10,
    check: (stats) => stats.liveFacts >= 1,
  },
  {
    badge: 'knowledge-builder',
    title: 'Knowledge Builder',
    description: 'Accumulated 10+ live facts',
    points: 50,
    check: (stats) => stats.liveFacts >= 10,
  },
  {
    badge: 'decision-maker',
    title: 'Decision Maker',
    description: 'Made 5+ active decisions',
    points: 30,
    check: (stats) => stats.activeDecisions >= 5,
  },
  {
    badge: 'well-connected',
    title: 'Well Connected',
    description: 'Created 10+ associations',
    points: 40,
    check: (stats) => stats.associations >= 10,
  },
  {
    badge: 'brain-awake',
    title: 'Brain Awake',
    description: 'Generated 5+ non-dismissed insights',
    points: 25,
    check: (stats) => stats.insights >= 5,
  },
  {
    badge: 'spark-igniter',
    title: 'Spark Igniter',
    description: 'Delivered 5+ sparks',
    points: 35,
    check: (stats) => stats.deliveredSparks >= 5,
  },
  {
    badge: 'contender',
    title: 'Contender',
    description: 'Entered any contest',
    points: 20,
    check: (stats) => stats.contestEntries >= 1,
  },
  {
    badge: 'knowledge-complete',
    title: 'Knowledge Complete',
    description: 'Has facts in 5+ unique topics',
    points: 60,
    check: (stats) => stats.uniqueTopics >= 5,
  },
  {
    badge: 'fresh-mind',
    title: 'Fresh Mind',
    description: 'No stale facts in workspace',
    points: 15,
    check: (stats) => stats.staleFacts === 0 && stats.liveFacts > 0,
  },
];

// GET /api/contest/achievements
export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  const achievements = await db.achievement.findMany({
    where: { workspaceId },
    orderBy: { earnedAt: 'desc' },
  });

  return NextResponse.json({ achievements });
});

// POST /api/contest/achievements
export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  // Gather all stats in parallel
  const [liveFacts, staleFacts, activeDecisions, associations, insights, deliveredSparks, contestEntries, topicGroups] =
    await Promise.all([
      db.fact.count({
        where: { workspaceId, stale: false, supersededBy: null },
      }),
      db.fact.count({
        where: { workspaceId, stale: true, supersededBy: null },
      }),
      db.decision.count({
        where: { workspaceId, status: 'active' },
      }),
      db.association.count({
        where: { workspaceId },
      }),
      db.insight.count({
        where: { workspaceId, dismissed: false },
      }),
      db.spark.count({
        where: { workspaceId, deliveredAt: { not: null } },
      }),
      db.contestEntry.count({
        where: { workspaceId },
      }),
      db.fact.groupBy({
        where: { workspaceId, stale: false, supersededBy: null },
        by: ['topic'],
      }),
    ]);

  const stats: Record<string, number> = {
    liveFacts,
    staleFacts,
    activeDecisions,
    associations,
    insights,
    deliveredSparks,
    contestEntries,
    uniqueTopics: topicGroups.length,
  };

  // Get existing badge names to avoid duplicates
  const existing = await db.achievement.findMany({
    where: { workspaceId },
    select: { badge: true },
  });
  const existingBadges = new Set(existing.map((a) => a.badge));

  // Check which new achievements to award
  const now = new Date().toISOString();
  const newAchievements: AchievementDef[] = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (!existingBadges.has(def.badge) && def.check(stats)) {
      newAchievements.push(def);
    }
  }

  // Create new achievements
  const created = await Promise.all(
    newAchievements.map((def) =>
      db.achievement.create({
        data: {
          workspaceId,
          badge: def.badge,
          title: def.title,
          description: def.description,
          earnedAt: now,
        },
      })
    )
  );

  // Get total counts
  const totalAchievements = existing.length + created.length;
  const totalPoints = ACHIEVEMENT_DEFS.reduce((sum, def) => {
    if (existingBadges.has(def.badge) || newAchievements.some((n) => n.badge === def.badge)) {
      return sum + def.points;
    }
    return sum;
  }, 0);

  return NextResponse.json({
    newAchievements: created,
    totalAchievements,
    totalPoints,
  });
});