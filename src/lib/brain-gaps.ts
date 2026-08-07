import { db } from '@/lib/db';

// ===== Types =====
export type Gap = {
  topic: string;
  entity?: string;
  missing: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
};

export interface KnowledgeGapsResult {
  gaps: Gap[];
}

/**
 * KNOWLEDGE GAPS ANALYSIS
 *
 * Identifies gaps in the knowledge base across topics:
 * - Topics with facts but no decisions
 * - Stale facts needing review
 * - Sparse knowledge topics
 * - Open threads without recent activity
 * - Missing preferences for entity-rich topics
 * - Decisions without outcomes after 30+ days
 */
export async function getKnowledgeGaps(workspaceId: number): Promise<KnowledgeGapsResult> {
  const now = new Date();
  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  // Gather all data
  const [facts, decisions, preferences, projectStates, ledgerEntries] =
    await Promise.all([
      db.fact.findMany({ where: { supersededBy: null, workspaceId } }),
      db.decision.findMany({ where: { status: 'active', workspaceId } }),
      db.preference.findMany({ where: { active: true, workspaceId } }),
      db.projectState.findMany({ where: { workspaceId } }),
      db.ledger.findMany({ where: { workspaceId }, orderBy: { ts: 'desc' } }),
    ]);

  // Group facts by topic
  const factsByTopic = new Map<string, typeof facts>();
  for (const f of facts) {
    const existing = factsByTopic.get(f.topic) ?? [];
    existing.push(f);
    factsByTopic.set(f.topic, existing);
  }

  const decisionsByTopic = new Map<string, typeof decisions>();
  for (const d of decisions) {
    const existing = decisionsByTopic.get(d.topic) ?? [];
    existing.push(d);
    decisionsByTopic.set(d.topic, existing);
  }

  const prefsByScope = new Map<string, typeof preferences>();
  for (const p of preferences) {
    const existing = prefsByScope.get(p.scope) ?? [];
    existing.push(p);
    prefsByScope.set(p.scope, existing);
  }

  const stateByTopic = new Map<string, typeof projectStates>();
  for (const s of projectStates) {
    const existing = stateByTopic.get(s.topic) ?? [];
    existing.push(s);
    stateByTopic.set(s.topic, existing);
  }

  // Get all unique topics from ledger
  const allLedgerTopics = new Set(ledgerEntries.map(l => l.topic));
  // Merge all known topics
  const allTopics = new Set<string>();
  for (const t of allLedgerTopics) allTopics.add(t);
  for (const t of factsByTopic.keys()) allTopics.add(t);
  for (const t of decisionsByTopic.keys()) allTopics.add(t);
  for (const t of prefsByScope.keys()) allTopics.add(t);
  for (const t of stateByTopic.keys()) allTopics.add(t);

  // Get entities mentioned in facts per topic
  const entitiesByTopic = new Map<string, Set<string>>();
  for (const f of facts) {
    const entities = entitiesByTopic.get(f.topic) ?? new Set<string>();
    entities.add(f.entity);
    entitiesByTopic.set(f.topic, entities);
  }

  // Get topics from preferences
  const prefTopics = new Set(prefsByScope.keys());

  const gaps: Gap[] = [];

  for (const topic of allTopics) {
    const topicFacts = factsByTopic.get(topic) ?? [];
    const topicDecisions = decisionsByTopic.get(topic) ?? [];
    const topicPrefs = prefsByScope.get(topic) ?? [];
    const topicState = stateByTopic.get(topic) ?? [];
    const topicEntities = entitiesByTopic.get(topic) ?? new Set();

    // Active (non-stale) facts
    const activeFacts = topicFacts.filter(f => !f.stale);
    const staleFacts = topicFacts.filter(f => f.stale);

    // Has facts but no decisions
    if (activeFacts.length > 0 && topicDecisions.length === 0) {
      gaps.push({
        topic,
        missing: 'No architectural decisions recorded',
        severity: 'medium',
        suggestion: `Topic "${topic}" has ${activeFacts.length} fact(s) but no decisions. Consider recording architectural choices and their rationale.`,
      });
    }

    // Has stale facts
    if (staleFacts.length > 0) {
      const staleEntities = staleFacts.map(f => f.entity);
      gaps.push({
        topic,
        missing: `${staleFacts.length} stale fact(s) need review`,
        severity: staleFacts.some(f => f.reviewAt && f.reviewAt < nowStr) ? 'high' : 'medium',
        suggestion: `${staleFacts.length} fact(s) for ${staleEntities.join(', ')} are marked stale and need review or update.`,
      });
    }

    // Sparse knowledge: 1-2 active facts
    if (activeFacts.length > 0 && activeFacts.length <= 2) {
      gaps.push({
        topic,
        missing: `Sparse knowledge — only ${activeFacts.length} fact(s)`,
        severity: activeFacts.length === 1 ? 'high' : 'medium',
        suggestion: `Topic "${topic}" has only ${activeFacts.length} active fact(s). Consider enriching with more extracted knowledge.`,
      });
    }

    // Open project state threads but no recent ledger entries
    const openThreads = topicState.filter(s => s.key.startsWith('open-thread:'));
    if (openThreads.length > 0) {
      const recentLedger = ledgerEntries.filter(
        l => l.topic === topic && l.ts > thirtyDaysAgo,
      );
      if (recentLedger.length === 0) {
        gaps.push({
          topic,
          missing: `${openThreads.length} open thread(s) without recent activity`,
          severity: 'medium',
          suggestion: `${openThreads.length} open project state thread(s) exist for "${topic}" but no ledger entries in the last 30 days. Threads may be stale.`,
        });
      }
    }

    // Preferences exist but few facts
    if (topicPrefs.length > 0 && activeFacts.length > 0 && activeFacts.length <= 3) {
      gaps.push({
        topic,
        missing: 'Preferences exist but limited factual knowledge',
        severity: 'low',
        suggestion: `Topic "${topic}" has ${topicPrefs.length} preference(s) but only ${activeFacts.length} fact(s). Preferences may not be grounded in enough factual context.`,
      });
    }

    // Zero facts for a topic that exists in the system
    if (topicFacts.length === 0) {
      const hasLedger = allLedgerTopics.has(topic);
      const hasState = topicState.length > 0;
      if (hasLedger || hasState) {
        gaps.push({
          topic,
          missing: `Zero facts for topic with existing data`,
          severity: 'high',
          suggestion: `Topic "${topic}" has ledger/state entries but no extracted facts. Run the Librarian to extract knowledge from raw entries.`,
        });
      }
    }
  }

  // Cross-topic gaps: Facts mention an entity but no preferences for that topic
  for (const [topic, entities] of entitiesByTopic) {
    if (!prefTopics.has(topic) && entities.size > 0) {
      gaps.push({
        topic,
        missing: `No preferences defined for topic with ${entities.size} entit(ies)`,
        severity: 'low',
        suggestion: `Topic "${topic}" has facts about ${Array.from(entities).join(', ')} but no working preferences. Consider adding workflow preferences.`,
      });
    }
  }

  // Decisions without outcomes older than 30 days
  for (const decision of decisions) {
    if (!decision.outcome && decision.decidedAt < thirtyDaysAgo) {
      gaps.push({
        topic: decision.topic,
        missing: `Decision "${decision.decision.slice(0, 50)}…" has no outcome after 30+ days`,
        severity: 'medium',
        suggestion: `This decision was made on ${decision.decidedAt} but has no recorded outcome. Consider reviewing and documenting the result.`,
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  gaps.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  return { gaps };
}