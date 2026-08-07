// ===== TYPES =====
// Extracted from brain-tab.tsx — shared by all brain/ section components

export interface BrainQueryResult {
  fact: {
    id: number;
    topic: string;
    entity: string;
    attribute: string;
    statement: string;
    confidence: string;
    stale: boolean;
  };
  activation: number;
  isSeed: boolean;
  reason: string;
}

export interface NeuralResponse {
  totalActivated: number;
  seedFacts: number;
  spreadFacts: number;
  associationsFired: number;
  hebbianUpdates: number;
  iterations: number;
  activationThreshold: number;
}

export interface GraphNode {
  id: string;
  label: string;
  topic: string;
  type: string;
  stale: boolean;
  confidence: number;
  factCount: number;
  activationScore: number;
  lastActivatedAt: string | null;
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

export interface BrainGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
}

export interface BrainInsight {
  id: number;
  createdAt: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  topics: string[];
  actionable: boolean;
  dismissed: boolean;
}

export interface KnowledgeGap {
  topic: string;
  entity: string;
  missing: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface NeuralStats {
  topology: { nodes: number; edges: number; density: number; avgConnectivity: number; maxPossibleEdges: number };
  activation: { activeFacts: number; totalFacts: number; coverage: number; avgActivation: number; peakActivation: number; mostActivatedFactId: number | null };
  plasticity: { index: number; lastDayFires: number; totalFires: number; avgFireCount: number; neverFired: number };
  weights: { avg: number; min: number; max: number; distribution: { dormant: number; weak: number; medium: number; strong: number; peak: number } };
  labels: Record<string, number>;
  health: { score: number; label: string };
  queries: { total: number };
  topAssociations: { label: string; weight: number; fireCount: number; lastFired: string | null }[];
  activityByDay: Record<string, { count: number; totalActivation: number }>;
  recentActivity: { id: number; factId: number; activation: number; source: string; iteration: number; triggeredBy: string | null; createdAt: string }[];
  mostActivatedFacts: { id: number; entity: string; attribute: string; topic: string; statement: string; activationScore: number; lastActivatedAt: string | null }[];
  activationDist: { dormant: number; low: number; medium: number; high: number; peak: number };
  topicConnectivity: { pair: string; count: number }[];
}

// Layout node for force simulation
export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  activationScore: number;
}