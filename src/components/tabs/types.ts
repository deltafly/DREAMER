export interface DreamerStats {
  totalSparks: number; delivered: number; pending: number;
  rated: number; hits: number; hitRate: number; avgScore: number;
  byKind: Record<string, number>;
  topPairs: { topicPair: string; trials: number; hits: number; hitRate: number }[];
}

export interface Spark {
  id: number; createdAt: string; seedRef: string; pairedRef: string;
  seedTopic: string; pairedTopic: string; insight: string;
  kind: string; score: number; deliveredAt: string | null; rating: number | null;
}

export interface SparkWeight {
  topicPair: string; trials: number; hits: number;
}

export interface DeltaBrief {
  topic: string; builtAt: string; dirty: boolean;
  szikra: { id: number; insight: string; kind: string; score: number; createdAt: string } | null;
  esedekes: { openDisputes: Dispute[]; upcomingReviews: Decision[] };
  kuralt: string;
  farok: { id: number; ts: string; agentId: string; kind: string; content: string; processed: boolean }[];
}

export interface Stats {
  layers: {
    l1: { total: number; unprocessed: number; byTopic: { topic: string; _count: { id: number } }[] };
    l2: {
      facts: { total: number; live: number; stale: number; staleRatio: number; byTopic: { topic: string; _count: { id: number } }[] };
      decisions: { total: number; active: number; byStatus: { status: string; _count: { id: number } }[] };
      preferences: number;
      projectState: number;
    };
    l3: { total: number; dirty: number };
  };
  disputes: { open: number; resolved: number };
  agents: number;
  librarian: {
    totalRuns: number;
    lastRun: LibrarianRun | null;
    recentRuns: LibrarianRun[];
  };
  decisionsNeedingReview: number;
  health: { staleRatio: number; unprocessedLedger: number; openDisputes: number; dirtyBriefs: number };
  dreamer: DreamerStats;
}

export interface LibrarianRun {
  id: number; startedAt: string; endedAt: string | null;
  status: string; summary: string | null;
  factsExtracted: number; decisionsExtracted: number;
  disputesCreated: number; briefsRebuilt: number; staleFlagged: number;
}

// Brief list item (simple — detail fetched on demand)
export interface BriefListItem {
  topic: string; content: string; builtAt: string; dirty: boolean;
}

export interface Dispute {
  id: number; createdAt: string; topic: string;
  existingRef: string; incoming: string;
  detectedBy: string; status: string;
  ruling?: string; resolvedAt?: string;
}

export interface Fact {
  id: number; topic: string; entity: string; attribute: string;
  statement: string; confidence: string; source?: string;
  validFrom: string; reviewAt?: string; stale: boolean; supersededBy: number | null;
}

export interface Decision {
  id: number; topic: string; decision: string; rationale: string;
  decidedAt: string; status: string; reviewAt?: string;
  outcome?: string; lesson?: string;
}

export interface LedgerEntry {
  id: number; ts: string; agentId: string; topic: string;
  kind: string; content: string; processed: boolean;
}

export interface SearchResult {
  type: 'fact' | 'decision' | 'ledger';
  id: number; topic: string; snippet: string; meta: string; ts: string;
}

export interface Preference { id: number; scope: string; statement: string; active: boolean; }

export interface AgentInfo {
  // No keyHash: the API deliberately does not serve it. Nothing in the UI ever
  // read it, and a stored credential has no business reaching the client.
  id: string; agentId: string; role: string;
  ledgerEntries: number; lastActivity: string | null;
}

export interface TimelineItem {
  type: 'ledger' | 'librarian' | 'dispute_resolved';
  id: string; ts: string; topic: string; kind: string;
  agent: string; summary: string; meta: string;
}