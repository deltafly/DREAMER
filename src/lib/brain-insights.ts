import { db } from '@/lib/db';

// ===== Types =====
export type InsightKind = 'pattern' | 'contradiction' | 'gap' | 'trend' | 'suggestion';

export interface InsightResult {
  id: number;
  createdAt: string;
  kind: string;
  severity: string;
  title: string;
  description: string;
  topics: string[];
  actionable: boolean;
  dismissed: boolean;
  workspaceId: number;
}

export interface InsightsResult {
  generated: boolean;
  insights: InsightResult[];
}

/**
 * GET INSIGHTS (read-only)
 *
 * Returns all insights for a workspace without any side-effects.
 */
export async function getInsights(workspaceId: number): Promise<InsightsResult> {
  const allInsights = await db.insight.findMany({
    where: { workspaceId },
    orderBy: [
      { severity: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return {
    generated: false,
    insights: allInsights.map(i => ({
      ...i,
      topics: JSON.parse(i.topics),
    })),
  };
}

/**
 * GENERATE INSIGHTS
 *
 * Analyzes the knowledge base and creates insight records for patterns,
 * contradictions, gaps, trends, and suggestions. Only creates insights
 * that don't already exist (deduped by title+kind).
 *
 * This function has side-effects: it creates insight records in the DB.
 */
export async function generateInsights(workspaceId: number): Promise<InsightsResult> {
  const now = new Date();
  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  // Gather all data needed for insight generation
  const [facts, decisions, preferences, unprocessedLedger, existingInsights] =
    await Promise.all([
      db.fact.findMany({ where: { supersededBy: null, workspaceId } }),
      db.decision.findMany({ where: { workspaceId } }),
      db.preference.findMany({ where: { active: true, workspaceId } }),
      db.ledger.count({ where: { processed: false, workspaceId } }),
      db.insight.findMany({ where: { workspaceId } }),
    ]);

  // Build a set of (title, kind) to avoid duplicates
  const existingKeys = new Set(
    existingInsights.map(i => `${i.title}::${i.kind}`),
  );

  // Helper to create insight only if it doesn't exist
  async function createInsightIfNew(data: {
    kind: string;
    severity: string;
    title: string;
    description: string;
    topics: string[];
    actionable?: boolean;
  }) {
    const key = `${data.title}::${data.kind}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);

    await db.insight.create({
      data: {
        createdAt: nowStr,
        kind: data.kind,
        severity: data.severity,
        title: data.title,
        description: data.description,
        topics: JSON.stringify(data.topics),
        actionable: data.actionable ?? false,
        workspaceId,
      },
    });
  }

  // === PATTERN INSIGHTS ===

  // 1. Sprint velocity trend (from facts with velocity data)
  const velocityFacts = facts.filter(
    f => f.entity === 'sprint-velocity' && f.attribute === 'current' && !f.stale,
  );
  if (velocityFacts.length > 0) {
    const vf = velocityFacts[0];
    // Parse "Sprint 4 delivered 38 story points, up from 32 in Sprint 3."
    const match = vf.statement.match(/(\d+)\s*story points.*?(\d+)/);
    if (match) {
      const current = parseInt(match[1]);
      const previous = parseInt(match[2]);
      if (current > 0 && previous > 0) {
        const pctChange = ((current - previous) / previous * 100).toFixed(1);
        const direction = current > previous ? 'up' : 'down';
        await createInsightIfNew({
          kind: 'pattern',
          severity: 'info',
          title: `Sprint velocity trending ${direction}`,
          description: `Sprint velocity: ${previous} → ${current} points (${pctChange}% ${direction === 'up' ? 'increase' : 'decrease'}). ${direction === 'up' ? 'Trend suggests team is accelerating.' : 'Trend suggests a slowdown — investigate blockers.'}`,
          topics: [vf.topic],
        });
      }
    }
  }

  // 2. Same-source fact consolidation
  const sourceGroups = new Map<string, number>();
  for (const f of facts) {
    if (f.stale || !f.source) continue;
    const count = sourceGroups.get(f.source) ?? 0;
    sourceGroups.set(f.source, count + 1);
  }
  for (const [source, count] of sourceGroups) {
    if (count >= 3) {
      // Find what entity/topic these share
      const sourceFacts = facts.filter(f => f.source === source && !f.stale);
      const entities = new Set(sourceFacts.map(f => f.entity));
      const topic = sourceFacts[0]?.topic ?? 'unknown';
      const entityList = Array.from(entities).slice(0, 3).join(', ');
      await createInsightIfNew({
        kind: 'pattern',
        severity: 'info',
        title: `${count} ${entityList} facts from same source`,
        description: `${count} facts for ${entityList} all sourced from ${source}. Consider consolidating into a single comprehensive fact.`,
        topics: [topic],
      });
    }
  }

  // 3. Decision density by topic
  const decisionsByTopic = new Map<string, number>();
  for (const d of decisions) {
    if (d.supersededBy) continue;
    const count = decisionsByTopic.get(d.topic) ?? 0;
    decisionsByTopic.set(d.topic, count + 1);
  }
  const sortedDecisionTopics = Array.from(decisionsByTopic.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  if (sortedDecisionTopics.length > 0) {
    const leader = sortedDecisionTopics[0];
    const topicList = sortedDecisionTopics.map(([t, c]) => `${t}: ${c}`).join(', ');
    await createInsightIfNew({
      kind: 'trend',
      severity: 'info',
      title: `Decision density: ${leader[0]} leads`,
      description: `${topicList}. ${leader[0]} has the most decisions, suggesting it is the most actively architected topic.`,
      topics: sortedDecisionTopics.map(([t]) => t),
    });
  }

  // === CONTRADICTION INSIGHTS ===

  // Find facts where same entity+attribute but different statements (one should be stale)
  const activeFacts = facts.filter(f => !f.stale && f.supersededBy === null);
  const staleFacts = facts.filter(f => f.stale && f.supersededBy === null);

  // Check stale facts against active facts with same entity+attribute
  for (const sf of staleFacts) {
    const conflict = activeFacts.find(
      af =>
        af.entity === sf.entity &&
        af.attribute === sf.attribute &&
        af.statement !== sf.statement,
    );
    if (conflict) {
      await createInsightIfNew({
        kind: 'contradiction',
        severity: 'critical',
        title: `${sf.entity} fact is stale — possible contradiction`,
        description: `Stale fact about ${sf.entity}/${sf.attribute} ("${sf.statement.slice(0, 80)}…") conflicts with active fact ("${conflict.statement.slice(0, 80)}…"). Verify which is correct and resolve.`,
        topics: [sf.topic],
        actionable: true,
      });
    }
  }

  // Also check active facts for contradictions within same entity+attribute
  const entityAttrGroups = new Map<string, typeof activeFacts>();
  for (const f of activeFacts) {
    const key = `${f.entity}::${f.attribute}`;
    const group = entityAttrGroups.get(key) ?? [];
    group.push(f);
    entityAttrGroups.set(key, group);
  }
  for (const [key, group] of entityAttrGroups) {
    if (group.length > 1) {
      const statements = new Set(group.map(f => f.statement));
      if (statements.size > 1) {
        const [entity, attribute] = key.split('::');
        const topics = [...new Set(group.map(f => f.topic))];
        await createInsightIfNew({
          kind: 'contradiction',
          severity: 'critical',
          title: `Multiple active facts for ${entity}/${attribute}`,
          description: `${group.length} active facts share entity="${entity}" and attribute="${attribute}" but have different statements. One may need to be superseded or stale-flagged.`,
          topics,
          actionable: true,
        });
      }
    }
  }

  // === GAP INSIGHTS (auto-created from knowledge gaps) ===

  // Topics with zero facts
  const topicsWithFacts = new Set(facts.filter(f => !f.stale).map(f => f.topic));
  const allTopics = new Set<string>();
  for (const f of facts) allTopics.add(f.topic);
  for (const d of decisions) allTopics.add(d.topic);
  for (const p of preferences) allTopics.add(p.scope);

  for (const topic of allTopics) {
    if (!topicsWithFacts.has(topic)) {
      await createInsightIfNew({
        kind: 'gap',
        severity: 'warning',
        title: `Topic "${topic}" has zero active facts`,
        description: `The ${topic} topic exists in the system but has no active facts. Consider seeding knowledge or running the Librarian on available ledger entries.`,
        topics: [topic],
        actionable: true,
      });
    }
  }

  // No deployment/infrastructure facts if topic has many facts
  for (const topic of topicsWithFacts) {
    const topicFacts = facts.filter(f => f.topic === topic && !f.stale);
    if (topicFacts.length >= 5) {
      const entities = topicFacts.map(f => f.entity);
      const hasInfra = entities.some(
        e =>
          e.includes('deploy') ||
          e.includes('infra') ||
          e.includes('ci') ||
          e.includes('cd') ||
          e.includes('docker') ||
          e.includes('kubernetes') ||
          e.includes('hosting'),
      );
      if (!hasInfra) {
        await createInsightIfNew({
          kind: 'gap',
          severity: 'warning',
          title: `No deployment or infrastructure facts for ${topic}`,
          description: `Knowledge base has ${topicFacts.length} ${topic} facts but none about deployment, CI/CD, or infrastructure.`,
          topics: [topic],
        });
      }
    }
  }

  // === SUGGESTION INSIGHTS ===

  // Decisions without outcomes older than 30 days
  for (const d of decisions) {
    if (d.supersededBy) continue;
    if (!d.outcome && d.decidedAt < thirtyDaysAgo) {
      const ageDays = Math.floor(
        (now.getTime() - new Date(d.decidedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      await createInsightIfNew({
        kind: 'suggestion',
        severity: 'info',
        title: `Decision "${d.decision.slice(0, 40)}…" is ${ageDays}d old without outcome`,
        description: `Decision made ${ageDays} days ago has no recorded outcome. Consider reviewing the decision status and documenting results.`,
        topics: [d.topic],
        actionable: true,
      });
    }
  }

  // Decisions with review date approaching
  for (const d of decisions) {
    if (d.supersededBy || !d.reviewAt) continue;
    const reviewDate = new Date(d.reviewAt);
    const daysUntilReview = Math.floor(
      (reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntilReview >= 0 && daysUntilReview <= 7) {
      await createInsightIfNew({
        kind: 'suggestion',
        severity: 'info',
        title: `Decision review upcoming in ${daysUntilReview} day(s)`,
        description: `Decision "${d.decision.slice(0, 40)}…" has a review scheduled in ${daysUntilReview} day(s). Prepare calibration data.`,
        topics: [d.topic],
      });
    }
  }

  // Unprocessed ledger entries
  if (unprocessedLedger > 0) {
    await createInsightIfNew({
      kind: 'suggestion',
      severity: 'info',
      title: `${unprocessedLedger} unprocessed ledger entries may contain new knowledge`,
      description: `${unprocessedLedger} ledger ${unprocessedLedger === 1 ? 'entry' : 'entries'} ${unprocessedLedger === 1 ? 'is' : 'are'} unprocessed. Running the Librarian could extract new facts and decisions.`,
      topics: ['mcos-engine', 'onebrainer', 'personal'],
      actionable: true,
    });
  }

  // Well-documented topic (positive pattern)
  for (const topic of topicsWithFacts) {
    const count = facts.filter(f => f.topic === topic && !f.stale).length;
    if (count >= 5) {
      const entities = new Set(
        facts.filter(f => f.topic === topic && !f.stale).map(f => f.entity),
      );
      const entityList = Array.from(entities).join(', ');
      await createInsightIfNew({
        kind: 'pattern',
        severity: 'info',
        title: `${topic} is well-documented`,
        description: `${count} facts cover ${topic} across ${entities.size} entities (${entityList}) — good coverage.`,
        topics: [topic],
      });
    }
  }

  // Return newly generated insights
  return {
    generated: true,
    insights: (await getInsights(workspaceId)).insights,
  };
}

/**
 * DISMISS INSIGHT
 *
 * Marks an insight as dismissed or undismissed.
 */
export async function dismissInsight(workspaceId: number, insightId: number, dismissed: boolean): Promise<InsightResult> {
  const insight = await db.insight.findFirst({ where: { id: insightId, workspaceId } });
  if (!insight) {
    throw new Error('Insight not found');
  }

  const updated = await db.insight.update({
    where: { id: insightId },
    data: { dismissed },
  });

  return {
    ...updated,
    topics: JSON.parse(updated.topics),
  };
}