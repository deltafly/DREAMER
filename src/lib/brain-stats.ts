import { db } from '@/lib/db';

// ===== Return Type =====
export interface NeuralStatsResult {
  topology: {
    nodes: number;
    edges: number;
    density: number;
    avgConnectivity: number;
    maxPossibleEdges: number;
  };
  activation: {
    activeFacts: number;
    totalFacts: number;
    coverage: number;
    avgActivation: number;
    peakActivation: number;
    mostActivatedFactId: number | null;
  };
  plasticity: {
    index: number;
    lastDayFires: number;
    totalFires: number;
    avgFireCount: number;
    neverFired: number;
  };
  weights: {
    avg: number;
    min: number;
    max: number;
    distribution: { dormant: number; weak: number; medium: number; strong: number; peak: number };
  };
  labels: Record<string, number>;
  health: {
    score: number;
    label: string;
  };
  queries: { total: number };
  activityByDay: Record<string, { count: number; totalActivation: number }>;
  topAssociations: {
    label: string;
    weight: number;
    fireCount: number;
    lastFired: string | null;
  }[];
  recentActivity: {
    id: number;
    factId: number;
    activation: number;
    source: string;
    iteration: number;
    triggeredBy: string;
    createdAt: string;
    workspaceId: number;
  }[];
  mostActivatedFacts: {
    id: number;
    entity: string;
    attribute: string;
    topic: string;
    statement: string;
    activationScore: number;
    lastActivatedAt: string | null;
  }[];
  activationDist: { dormant: number; low: number; medium: number; high: number; peak: number };
  topicConnectivity: { pair: string; count: number }[];
}

/**
 * NEURAL STATS — Network health & activity metrics
 *
 * Returns a comprehensive view of the brain's neural state:
 * - Network topology (nodes, edges, density)
 * - Activation distribution (how "awake" the brain is)
 * - Plasticity metrics (how much the network is changing)
 * - Recent activity patterns
 * - Association health (fire counts, weight distribution)
 */
export async function getNeuralStats(workspaceId: number): Promise<NeuralStatsResult> {
  // Basic network topology
  const [factCount, associationCount, totalQueries] = await Promise.all([
    db.fact.count({ where: { supersededBy: null, stale: false, workspaceId } }),
    db.association.count({ where: { workspaceId } }),
    db.brainQuery.count({ where: { workspaceId } }),
  ]);

  // Association weight distribution
  const associations = await db.association.findMany({
    where: { workspaceId },
    select: { activationWeight: true, fireCount: true, lastFiredAt: true, label: true },
  });

  const avgWeight = associations.length > 0
    ? associations.reduce((s, a) => s + a.activationWeight, 0) / associations.length
    : 0;
  const maxWeight = associations.length > 0
    ? Math.max(...associations.map(a => a.activationWeight))
    : 0;
  const minWeight = associations.length > 0
    ? Math.min(...associations.map(a => a.activationWeight))
    : 0;

  // Weight histogram buckets
  const weightBuckets = { dormant: 0, weak: 0, medium: 0, strong: 0, peak: 0 };
  for (const a of associations) {
    if (a.activationWeight < 0.15) weightBuckets.dormant++;
    else if (a.activationWeight < 0.35) weightBuckets.weak++;
    else if (a.activationWeight < 0.6) weightBuckets.medium++;
    else if (a.activationWeight < 0.85) weightBuckets.strong++;
    else weightBuckets.peak++;
  }

  // Label distribution
  const labelCounts: Record<string, number> = {};
  for (const a of associations) {
    labelCounts[a.label] = (labelCounts[a.label] || 0) + 1;
  }

  // Fire count stats
  const firedAssociations = associations.filter(a => a.fireCount > 0);
  const avgFireCount = firedAssociations.length > 0
    ? firedAssociations.reduce((s, a) => s + a.fireCount, 0) / firedAssociations.length
    : 0;
  const totalFires = associations.reduce((s, a) => s + a.fireCount, 0);
  const neverFired = associations.filter(a => a.fireCount === 0).length;

  // Fact activation stats
  const facts = await db.fact.findMany({
    where: { supersededBy: null, stale: false, workspaceId },
    select: { activationScore: true, lastActivatedAt: true, id: true, entity: true, attribute: true, topic: true, statement: true },
  });

  const activeFacts = facts.filter(f => f.activationScore > 0);
  const avgActivation = activeFacts.length > 0
    ? activeFacts.reduce((s, f) => s + f.activationScore, 0) / activeFacts.length
    : 0;
  const peakActivation = activeFacts.length > 0
    ? Math.max(...activeFacts.map(f => f.activationScore))
    : 0;
  const mostActivatedFact = activeFacts.length > 0
    ? activeFacts.reduce((best, f) => f.activationScore > best.activationScore ? f : best, activeFacts[0])
    : null;

  // Most activated facts (top 5)
  const mostActivatedFacts = [...facts]
    .sort((a, b) => b.activationScore - a.activationScore)
    .slice(0, 5)
    .map(f => ({
      id: f.id,
      entity: f.entity,
      attribute: f.attribute,
      topic: f.topic,
      statement: f.statement,
      activationScore: Math.round(f.activationScore * 1000) / 1000,
      lastActivatedAt: f.lastActivatedAt,
    }));

  // Activation distribution histogram
  const activationDist = { dormant: 0, low: 0, medium: 0, high: 0, peak: 0 };
  for (const f of facts) {
    if (f.activationScore < 0.05) activationDist.dormant++;
    else if (f.activationScore < 0.25) activationDist.low++;
    else if (f.activationScore < 0.5) activationDist.medium++;
    else if (f.activationScore < 0.8) activationDist.high++;
    else activationDist.peak++;
  }

  // Topic connectivity: which topics are linked via associations
  const associationDetails = await db.association.findMany({
    where: { workspaceId },
    select: { factIdA: true, factIdB: true },
  });
  const factTopics = new Map(facts.map(f => [f.id, f.topic]));
  const topicPairs: Record<string, number> = {};
  for (const assoc of associationDetails) {
    const topicA = factTopics.get(assoc.factIdA);
    const topicB = factTopics.get(assoc.factIdB);
    if (topicA && topicB && topicA !== topicB) {
      const key = [topicA, topicB].sort().join(' ↔ ');
      topicPairs[key] = (topicPairs[key] || 0) + 1;
    }
  }
  const topicConnectivity = Object.entries(topicPairs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([pair, count]) => ({ pair, count }));

  // Network density: actual edges / max possible edges
  const maxEdges = factCount * (factCount - 1) / 2;
  const density = maxEdges > 0 ? associationCount / maxEdges : 0;

  // Connectivity: average connections per fact
  const avgConnectivity = factCount > 0 ? (associationCount * 2) / factCount : 0;

  // Recent neural activity (last 50)
  const recentActivity = await db.neuralActivity.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Activity per day (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentLogs = await db.neuralActivity.findMany({
    where: {
      workspaceId,
      createdAt: { gte: sevenDaysAgo.toISOString().replace('T', ' ').slice(0, 19) },
    },
  });

  const activityByDay: Record<string, { count: number; totalActivation: number }> = {};
  for (const log of recentLogs) {
    const day = log.createdAt.slice(0, 10);
    if (!activityByDay[day]) activityByDay[day] = { count: 0, totalActivation: 0 };
    activityByDay[day].count++;
    activityByDay[day].totalActivation += log.activation;
  }

  // Top fired associations (most "exercised" synapses)
  const topAssociations = associations
    .sort((a, b) => b.fireCount - a.fireCount)
    .slice(0, 5)
    .map(a => ({
      label: a.label,
      weight: Math.round(a.activationWeight * 1000) / 1000,
      fireCount: a.fireCount,
      lastFired: a.lastFiredAt,
    }));

  // PLASTICITY INDEX: how much the network is actively changing
  // High plasticity = lots of recent firing = actively learning
  const lastDayFires = associations.filter(a => {
    if (!a.lastFiredAt) return false;
    return (Date.now() - new Date(a.lastFiredAt).getTime()) < 24 * 60 * 60 * 1000;
  }).length;

  const plasticityIndex = associations.length > 0
    ? Math.min(lastDayFires / associations.length * 3, 1.0) // Scale to 0-1
    : 0;

  // NETWORK HEALTH: composite score
  // Factors: density (not too sparse, not too dense), plasticity, activation coverage
  const densityHealth = density > 0.05 && density < 0.5 ? 1 : density > 0 ? 0.5 : 0;
  const activationCoverage = factCount > 0 ? activeFacts.length / factCount : 0;
  const networkHealth = Math.round(
    (densityHealth * 0.3 + plasticityIndex * 0.4 + activationCoverage * 0.3) * 100
  );

  return {
    topology: {
      nodes: factCount,
      edges: associationCount,
      density: Math.round(density * 1000) / 1000,
      avgConnectivity: Math.round(avgConnectivity * 10) / 10,
      maxPossibleEdges: maxEdges,
    },
    activation: {
      activeFacts: activeFacts.length,
      totalFacts: factCount,
      coverage: Math.round(activationCoverage * 100) / 100,
      avgActivation: Math.round(avgActivation * 1000) / 1000,
      peakActivation: Math.round(peakActivation * 1000) / 1000,
      mostActivatedFactId: mostActivatedFact?.id ?? null,
    },
    plasticity: {
      index: Math.round(plasticityIndex * 100) / 100,
      lastDayFires,
      totalFires,
      avgFireCount: Math.round(avgFireCount * 10) / 10,
      neverFired,
    },
    weights: {
      avg: Math.round(avgWeight * 1000) / 1000,
      min: Math.round(minWeight * 1000) / 1000,
      max: Math.round(maxWeight * 1000) / 1000,
      distribution: weightBuckets,
    },
    labels: labelCounts,
    health: {
      score: networkHealth,
      label: networkHealth >= 80 ? 'healthy' : networkHealth >= 50 ? 'moderate' : networkHealth >= 25 ? 'needs-attention' : 'dormant',
    },
    queries: { total: totalQueries },
    activityByDay,
    topAssociations,
    recentActivity: recentActivity.slice(0, 10),
    mostActivatedFacts,
    activationDist,
    topicConnectivity,
  };
}