import { db } from '@/lib/db';

async function main() {
  console.log('🌱 Seeding contest data...');

  // Clean up existing contest data first
  await db.achievement.deleteMany({ where: { workspaceId: 1 } });
  await db.contestEntry.deleteMany({ where: { workspaceId: 1 } });
  await db.challenge.deleteMany();
  await db.contest.deleteMany();

  const now = new Date();
  const isoNow = now.toISOString();
  const future7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Contest 1: Knowledge Completeness (active) ──
  const contest1 = await db.contest.create({
    data: {
      title: 'Knowledge Completeness Sprint',
      description: 'Build the most comprehensive knowledge base across multiple topics. Score based on fact count, topic breadth, and freshness.',
      kind: 'knowledge-completeness',
      status: 'active',
      startsAt: isoNow,
      endsAt: future30,
      prize: 'Pro Plan — 3 months free',
      rules: 'Score = live_facts×2 + decisions×3 + associations×5 + insights×1 + breadth×10 + freshness_bonus(50)',
      createdAt: isoNow,
    },
  });

  await db.challenge.createMany({
    data: [
      {
        contestId: contest1.id,
        title: 'Fact Frenzy',
        description: 'Add 20+ non-stale facts to your knowledge base',
        kind: 'volume',
        points: 200,
      },
      {
        contestId: contest1.id,
        title: 'Topic Explorer',
        description: 'Have facts in at least 8 different topics',
        kind: 'breadth',
        points: 300,
      },
      {
        contestId: contest1.id,
        title: 'Fresh Keeper',
        description: 'Maintain zero stale facts — review and update promptly',
        kind: 'freshness',
        points: 150,
      },
    ],
  });

  // ── Contest 2: Association Density (active) ──
  const contest2 = await db.contest.create({
    data: {
      title: 'Neural Link Builder',
      description: 'Create the densest web of associations between facts. Challenge yourself to connect ideas across domains.',
      kind: 'association-density',
      status: 'active',
      startsAt: isoNow,
      endsAt: future7,
      prize: 'Exclusive badge + featured workspace',
      rules: 'Associations are weighted 5× in scoring. Bonus for cross-topic links.',
      createdAt: isoNow,
    },
  });

  await db.challenge.createMany({
    data: [
      {
        contestId: contest2.id,
        title: 'Link Master',
        description: 'Create 30+ associations between your facts',
        kind: 'volume',
        points: 250,
      },
      {
        contestId: contest2.id,
        title: 'Bridge Builder',
        description: 'Create associations between facts in 5+ different topic pairs',
        kind: 'cross-topic',
        points: 350,
      },
      {
        contestId: contest2.id,
        title: 'Dense Cluster',
        description: 'Create 10+ associations for a single topic',
        kind: 'density',
        points: 200,
      },
      {
        contestId: contest2.id,
        title: 'New Connection',
        description: 'Add your first 5 associations ever',
        kind: 'starter',
        points: 100,
      },
    ],
  });

  // ── Contest 3: Weekly Quiz (completed) ──
  const contest3 = await db.contest.create({
    data: {
      title: 'Weekly Decision Review',
      description: 'Review and calibrate your past decisions. Update outcomes and capture lessons learned.',
      kind: 'weekly-quiz',
      status: 'completed',
      startsAt: past7,
      endsAt: isoNow,
      prize: 'Decision dashboard upgrade',
      rules: 'Score based on decisions with outcomes recorded and lessons documented.',
      createdAt: past7,
    },
  });

  await db.challenge.createMany({
    data: [
      {
        contestId: contest3.id,
        title: 'Outcome Hunter',
        description: 'Record outcomes for 10+ decisions',
        kind: 'outcomes',
        points: 200,
      },
      {
        contestId: contest3.id,
        title: 'Lesson Learner',
        description: 'Document lessons for 5+ decisions',
        kind: 'lessons',
        points: 250,
      },
      {
        contestId: contest3.id,
        title: 'Calibration Check',
        description: 'Review and update status of 15+ decisions',
        kind: 'calibration',
        points: 300,
      },
    ],
  });

  // ── Enter workspace 1 into all contests ──
  for (const contest of [contest1, contest2, contest3]) {
    await db.contestEntry.upsert({
      where: {
        contestId_workspaceId: { contestId: contest.id, workspaceId: 1 },
      },
      create: {
        contestId: contest.id,
        workspaceId: 1,
        score: 0,
        submittedAt: isoNow,
      },
      update: {
        submittedAt: isoNow,
      },
    });
  }

  // ── Award 3 initial achievements for workspace 1 ──
  await db.achievement.createMany({
    data: [
      {
        workspaceId: 1,
        badge: 'first-fact',
        title: 'First Fact',
        description: 'Recorded your first fact',
        earnedAt: isoNow,
      },
      {
        workspaceId: 1,
        badge: 'decision-maker',
        title: 'Decision Maker',
        description: 'Made 5+ active decisions',
        earnedAt: isoNow,
      },
      {
        workspaceId: 1,
        badge: 'contender',
        title: 'Contender',
        description: 'Entered any contest',
        earnedAt: isoNow,
      },
    ],
  });

  console.log('✅ Seed complete!');
  console.log(`   - Created ${3} contests (${2} active, 1 completed)`);
  console.log(`   - Created 10 challenges across all contests`);
  console.log(`   - Entered workspace 1 into all contests`);
  console.log(`   - Awarded 3 achievements to workspace 1`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());