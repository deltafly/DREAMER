import { db } from '@/lib/db';

// ===== Types =====
export interface GraphNode {
  id: string;
  label: string;
  topic: string;
  type: 'fact' | 'decision' | 'preference';
  stale: boolean;
  confidence: string;
  factCount: number;
  activationScore: number;
  lastActivatedAt: string | null;
  color: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
  activationWeight: number;
  fireCount: number;
  lastFiredAt: string | null;
}

export interface GraphCluster {
  topic: string;
  count: number;
  color: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
}

// ===== Constants =====
export const CLUSTER_COLORS = [
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#ca8a04', // yellow
  '#16a34a', // green
  '#e11d48', // rose
  '#9333ea', // purple
];

/**
 * GET KNOWLEDGE GRAPH
 *
 * Builds a knowledge graph from facts, decisions, preferences, and associations.
 * Nodes are merged by entity (multiple facts for same entity = one node).
 * Pure read-only computation.
 */
export async function getKnowledgeGraph(workspaceId: number): Promise<GraphResult> {
  // Fetch all non-stale facts, decisions, preferences, and associations
  const [facts, decisions, preferences, associations] = await Promise.all([
    db.fact.findMany({
      where: { supersededBy: null, stale: false, workspaceId },
      select: { id: true, topic: true, entity: true, confidence: true, stale: true, activationScore: true, lastActivatedAt: true },
    }),
    db.decision.findMany({
      where: { status: 'active', workspaceId },
    }),
    db.preference.findMany({
      where: { active: true, workspaceId },
    }),
    db.association.findMany({
      where: { workspaceId },
      include: {
        factA: { select: { id: true, topic: true, entity: true, stale: true } },
        factB: { select: { id: true, topic: true, entity: true, stale: true } },
      },
    }),
  ]);

  // === NODES ===
  // Merge facts by entity (multiple facts for same entity = one node with factCount)
  const nodeMap = new Map<string, GraphNode>();

  // Confidence ordering for representative confidence
  const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

  for (const fact of facts) {
    const nodeId = `fact:${fact.entity}`;
    const existing = nodeMap.get(nodeId);
    if (existing) {
      existing.factCount += 1;
      // Keep the highest confidence
      if (
        (confidenceOrder[fact.confidence] ?? 0) >
        (confidenceOrder[existing.confidence] ?? 0)
      ) {
        existing.confidence = fact.confidence;
      }
    } else {
      nodeMap.set(nodeId, {
        id: nodeId,
        label: fact.entity,
        topic: fact.topic,
        type: 'fact',
        stale: false,
        confidence: fact.confidence,
        factCount: 1,
        activationScore: fact.activationScore ?? 0,
        lastActivatedAt: fact.lastActivatedAt ?? null,
        color: '',
      });
    }
  }

  // Decision nodes
  for (const decision of decisions) {
    const nodeId = `decision:${decision.id}`;
    nodeMap.set(nodeId, {
      id: nodeId,
      label: decision.decision.length > 40
        ? decision.decision.slice(0, 37) + '…'
        : decision.decision,
      topic: decision.topic,
      type: 'decision',
      stale: false,
      confidence: 'high',
      factCount: 0,
      activationScore: 0,
      lastActivatedAt: null,
      color: '',
    });
  }

  // Preference nodes
  for (const pref of preferences) {
    const nodeId = `pref:${pref.id}`;
    nodeMap.set(nodeId, {
      id: nodeId,
      label: pref.statement.length > 40
        ? pref.statement.slice(0, 37) + '…'
        : pref.statement,
      topic: pref.scope,
      type: 'preference',
      stale: false,
      confidence: 'high',
      factCount: 0,
      activationScore: 0,
      lastActivatedAt: null,
      color: '',
    });
  }

  const nodes = Array.from(nodeMap.values());

  // === EDGES ===
  const edges: GraphEdge[] = [];

  for (const assoc of associations) {
    // Only include edges where at least one fact is non-stale
    if (assoc.factA.stale && assoc.factB.stale) continue;

    // Build edge from fact entity nodes
    const factAEntity = facts.find(f => f.id === assoc.factIdA)?.entity;
    const factBEntity = facts.find(f => f.id === assoc.factIdB)?.entity;

    if (factAEntity && factBEntity) {
      // Skip self-loops
      if (factAEntity === factBEntity) continue;

      edges.push({
        source: `fact:${factAEntity}`,
        target: `fact:${factBEntity}`,
        label: assoc.label,
        strength: assoc.strength,
        activationWeight: assoc.activationWeight,
        fireCount: assoc.fireCount,
        lastFiredAt: assoc.lastFiredAt,
      });
    }
  }

  // === CLUSTERS ===
  // Group nodes by topic, assign colors
  const topicGroups = new Map<string, number>();
  let colorIndex = 0;

  for (const node of nodes) {
    if (!topicGroups.has(node.topic)) {
      topicGroups.set(node.topic, colorIndex % CLUSTER_COLORS.length);
      colorIndex++;
    }
  }

  const clusters = Array.from(topicGroups.entries()).map(
    ([topic, idx]) => ({
      topic,
      count: nodes.filter(n => n.topic === topic).length,
      color: CLUSTER_COLORS[idx],
    }),
  );

  // Add topic color to nodes
  const nodesWithColor = nodes.map(node => ({
    ...node,
    color: CLUSTER_COLORS[topicGroups.get(node.topic) ?? 0],
  }));

  return {
    nodes: nodesWithColor,
    edges,
    clusters,
  };
}