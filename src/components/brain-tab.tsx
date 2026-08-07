'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, Search, Sparkles, AlertTriangle, Eye, Lightbulb, X, RefreshCw,
  Network, ChevronRight, Zap, Target, TrendingUp, Activity, Flame, Database,
  Moon, BookOpen, Clock, Play, Loader2, Calendar, Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ===== TYPES =====

interface BrainQueryResult {
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

interface NeuralResponse {
  totalActivated: number;
  seedFacts: number;
  spreadFacts: number;
  associationsFired: number;
  hebbianUpdates: number;
  iterations: number;
  activationThreshold: number;
}

interface GraphNode {
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

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
  activationWeight: number;
  fireCount: number;
  lastFiredAt: string | null;
}

interface GraphCluster {
  topic: string;
  count: number;
  color: string;
}

interface BrainGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
}

interface BrainInsight {
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

interface KnowledgeGap {
  topic: string;
  entity: string;
  missing: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

// Layout node for force simulation
interface NeuralStats {
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

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  activationScore: number;
}

// ===== CONSTANTS =====

const TOPIC_COLORS: Record<string, string> = {
  'mcos-engine': '#f97316',
  'onebrainer': '#a855f7',
  'personal': '#14b8a6',
  'infrastructure': '#ef4444',
  'security': '#f59e0b',
  'design': '#ec4899',
  'performance': '#10b981',
  'integration': '#f97316',
  'deployment': '#8b5cf6',
};

const TOPIC_BG: Record<string, string> = {
  'mcos-engine': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  'onebrainer': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  'personal': 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  'infrastructure': 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  'security': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'design': 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  'performance': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'integration': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  'deployment': 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
};

const DEFAULT_TOPIC_COLOR = '#71717a';

function getTopicColor(topic: string): string {
  return TOPIC_COLORS[topic] || DEFAULT_TOPIC_COLOR;
}

function getTopicBadgeClass(topic: string): string {
  return TOPIC_BG[topic] || 'bg-muted text-muted-foreground border-border';
}

const EDGE_STYLES: Record<string, { stroke: string; dasharray: string; markerEnd?: string }> = {
  supports: { stroke: '#10b981', dasharray: 'none' },
  contradicts: { stroke: '#ef4444', dasharray: '6 4' },
  extends: { stroke: '#f59e0b', dasharray: 'none' },
  related: { stroke: '#71717a', dasharray: '3 3' },
  causes: { stroke: '#f97316', dasharray: 'none', markerEnd: 'url(#arrowOrange)' },
  requires: { stroke: '#14b8a6', dasharray: 'none', markerEnd: 'url(#arrowTeal)' },
};

const EXAMPLE_QUERIES = [
  'How do we handle webhooks?',
  'What decisions were made about the database?',
  'What do I know about rate limiting?',
];

const SEVERITY_CONFIG = {
  critical: { icon: '🔴', color: 'text-rose-600 dark:text-rose-400', border: 'border-l-rose-500', bg: 'bg-rose-500/5' },
  warning: { icon: '⚠️', color: 'text-amber-600 dark:text-amber-400', border: 'border-l-amber-500', bg: 'bg-amber-500/5' },
  info: { icon: '💡', color: 'text-emerald-600 dark:text-emerald-400', border: 'border-l-emerald-500', bg: 'bg-emerald-500/5' },
} as const;

const GAP_SEVERITY = {
  low: { color: 'border-l-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  medium: { color: 'border-l-amber-500', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  high: { color: 'border-l-rose-500', badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
} as const;

// ===== ANIMATION VARIANTS =====

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

// ===== FORCE-DIRECTED LAYOUT =====

function runForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): LayoutNode[] {
  const layoutNodes: LayoutNode[] = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(width, height) * 0.35;
    return {
      ...n,
      x: width / 2 + r * Math.cos(angle),
      y: height / 2 + r * Math.sin(angle),
      vx: 0,
      vy: 0,
      connections: 0,
    };
  });

  // Count connections per node
  for (const edge of edges) {
    const src = layoutNodes.find((n) => n.id === edge.source);
    const tgt = layoutNodes.find((n) => n.id === edge.target);
    if (src) src.connections++;
    if (tgt) tgt.connections++;
  }

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const iterations = 120;
  const repulsion = 2000;
  const attraction = 0.008;
  const centerPull = 0.01;
  const damping = 0.85;
  const cx = width / 2;
  const cy = height / 2;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Repulsion between all node pairs
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const a = layoutNodes[i];
        const b = layoutNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        dist = Math.max(dist, 1);
        const force = (repulsion * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      let dx = tgt.x - src.x;
      let dy = tgt.y - src.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      dist = Math.max(dist, 1);
      const force = dist * attraction * edge.strength * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }

    // Center pull
    for (const node of layoutNodes) {
      node.vx += (cx - node.x) * centerPull * alpha;
      node.vy += (cy - node.y) * centerPull * alpha;
    }

    // Apply velocity with damping and bounds
    const pad = 30;
    for (const node of layoutNodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(pad, Math.min(width - pad, node.x));
      node.y = Math.max(pad, Math.min(height - pad, node.y));
    }
  }

  return layoutNodes;
}

// ===== CONFIDENCE INDICATOR =====

function ConfidenceIndicator({ confidence }: { confidence: string }) {
  const value = confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.6 : 0.3;
  const color =
    value >= 0.8
      ? 'bg-emerald-500'
      : value >= 0.5
        ? 'bg-amber-500'
        : 'bg-rose-500';
  const label =
    value >= 0.8 ? 'High' : value >= 0.5 ? 'Medium' : 'Low';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color === 'bg-emerald-500' ? '#10b981' : color === 'bg-amber-500' ? '#f59e0b' : '#ef4444' }} />
      <span className="text-[10px] text-muted-foreground">{label} ({Math.round(value * 100)}%)</span>
    </div>
  );
}

// ===== RELEVANCE BAR =====

function RelevanceBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.min(Math.round((score / maxScore) * 100), 100) : 0;
  const barColor =
    pct >= 75
      ? 'bg-emerald-500'
      : pct >= 50
        ? 'bg-amber-500'
        : 'bg-rose-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ===== SECTION 1: ASK BRAIN =====

function AskBrainSection({ searchQuery, onQueryDone }: { searchQuery: string; onQueryDone?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BrainQueryResult[]>([]);
  const [neural, setNeural] = useState<NeuralResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (searchQuery && !query) {
      setQuery(searchQuery);
    }
  }, [searchQuery, query]);

  const handleQuery = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setQueried(true);
    try {
      const res = await fetch('/api/brain/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), limit: 8 }),
      });
      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();
      setResults(data.results || []);
      setNeural(data.neural || null);
      onQueryDone?.();
      if (!data.results?.length) {
        toast.info('No matching memories found');
      }
    } catch {
      toast.error('Failed to query brain');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, onQueryDone]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleQuery();
      }
    },
    [handleQuery]
  );

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Brain className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Ask Brain</CardTitle>
              <CardDescription className="text-[11px]">Neural query · spreading activation</CardDescription>
            </div>
          </div>
          {results.length > 0 && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {results.length} results
            </Badge>
          )}
          {neural && (
            <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400">
              {neural.associationsFired} synapses
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Neural textarea */}
        <div className="relative">
          <div className="neural-input-glow absolute -inset-px rounded-lg opacity-0 transition-opacity duration-500 pointer-events-none" />
          <Textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you working on? Ask the brain..."
            className="resize-none min-h-[72px] bg-card/50 border-border/60 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20 rounded-lg text-sm placeholder:text-muted-foreground/50"
            disabled={loading}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground/40">Enter ↵</span>
          </div>
        </div>

        <Button
          onClick={handleQuery}
          disabled={loading || !query.trim()}
          className="w-full relative overflow-hidden bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-700 dark:hover:bg-emerald-800 transition-all duration-300 group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <span className="relative flex items-center gap-2">
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {loading ? 'Querying Brain...' : 'Query Brain'}
          </span>
        </Button>

        {/* Results */}
        <AnimatePresence mode="wait">
          {!queried && !loading ? (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2 pt-1"
            >
              <p className="text-[11px] text-muted-foreground/60 font-medium mb-2">Try asking:</p>
              {EXAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(q);
                    textareaRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/60 border border-border/30 hover:border-emerald-500/30 transition-all duration-200 group"
                >
                  <span className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">
                    &ldquo;{q}&rdquo;
                  </span>
                </button>
              ))}
            </motion.div>
          ) : loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 pt-1"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 p-3 rounded-lg bg-muted/20">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
              ))}
            </motion.div>
          ) : results.length > 0 ? (
            <motion.div
              key="results"
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              className="space-y-2 pt-1"
            >
              <ScrollArea className="max-h-[280px] scroll-fade">
                <div className="space-y-2 pr-2">
                  {results.map((r, i) => (
                    <motion.div
                      key={r.fact.id}
                      variants={itemVariants}
                      className="p-3 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/30 hover:border-emerald-500/20 transition-all duration-200 group"
                    >
                      <p className="text-xs leading-relaxed text-foreground/90 mb-2">{r.fact.statement}</p>
                      <RelevanceBar score={r.activation} maxScore={results[0]?.activation || 1} />
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {r.isSeed && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            ⚡ seed
                          </Badge>
                        )}
                        {!r.isSeed && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            🔗 spread
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-dashed border-muted-foreground/30 text-muted-foreground">
                          {(r.activation * 100).toFixed(0)}%
                        </Badge>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${getTopicBadgeClass(r.fact.topic)}`}>
                          {r.fact.topic}
                        </Badge>
                        <ConfidenceIndicator confidence={r.fact.confidence} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-6 text-center"
            >
              <Search className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/60">No matching memories found</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">Try rephrasing your query</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Neural activity summary */}
        {neural && queried && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 space-y-1.5"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Neural Activity</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{neural.seedFacts}</div>
                <div className="text-[9px] text-muted-foreground">Seeds</div>
              </div>
              <div>
                <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{neural.spreadFacts}</div>
                <div className="text-[9px] text-muted-foreground">Spread</div>
              </div>
              <div>
                <div className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">{neural.hebbianUpdates}</div>
                <div className="text-[9px] text-muted-foreground">Hebbian</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1 border-t border-amber-500/10">
              <span>{neural.iterations} iterations · threshold {neural.activationThreshold}</span>
              <span>{neural.totalActivated} total activated</span>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== SECTION 2: KNOWLEDGE GRAPH =====

function KnowledgeGraphSection() {
  const [graph, setGraph] = useState<BrainGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    async function fetchGraph() {
      try {
        const res = await fetch('/api/brain/graph');
        if (!res.ok) throw new Error('Failed to fetch graph');
        const data = await res.json();
        if (!cancelled) setGraph(data);
      } catch {
        if (!cancelled) toast.error('Failed to load knowledge graph');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGraph();
    return () => { cancelled = true; };
  }, []);

  // Compute layout when graph data arrives
  useEffect(() => {
    if (!graph || !graph.nodes.length) return;
    const w = 500;
    const h = 360;
    const laid = runForceLayout(graph.nodes, graph.edges, w, h);
    const laidWithActivation = laid.map(ln => {
      const gn = graph.nodes.find(n => n.id === ln.id);
      return { ...ln, activationScore: gn?.activationScore ?? 0 };
    });
    setLayoutNodes(laidWithActivation);
  }, [graph]);

  const handleMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const node = layoutNodes.find((n) => n.id === nodeId);
      if (!node) return;
      const scaleX = 500 / svgRect.width;
      const scaleY = 360 / svgRect.height;
      setDragOffset({
        x: e.clientX - node.x / scaleX,
        y: e.clientY - node.y / scaleY,
      });
      setDragging(nodeId);
      setHoveredNode(nodeId);
    },
    [layoutNodes]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !svgRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const scaleX = 500 / svgRect.width;
      const scaleY = 360 / svgRect.height;
      const nx = (e.clientX - svgRect.left) * scaleX - dragOffset.x * scaleX + dragOffset.x;
      const ny = (e.clientY - svgRect.top) * scaleY - dragOffset.y * scaleY + dragOffset.y;
      setLayoutNodes((prev) =>
        prev.map((n) =>
          n.id === dragging ? { ...n, x: Math.max(25, Math.min(475, (e.clientX - svgRect.left) * scaleX)), y: Math.max(25, Math.min(335, (e.clientY - svgRect.top) * scaleY)) } : n
        )
      );
    },
    [dragging, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const connectedNodeIds = hoveredNode
    ? new Set([
        hoveredNode,
        ...graph?.edges
          .filter((e) => e.source === hoveredNode || e.target === hoveredNode)
          .flatMap((e) => [e.source, e.target]) ?? [],
      ])
    : null;

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Graph</CardTitle>
              <CardDescription className="text-[11px]">Loading connections...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[360px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Graph</CardTitle>
              <CardDescription className="text-[11px]">No connections yet</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] flex items-center justify-center">
            <div className="text-center">
              <Network className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/50">No graph data available</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">Facts need associations to form a graph</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Graph</CardTitle>
              <CardDescription className="text-[11px]">
                {graph.nodes.length} nodes · {graph.edges.length} connections
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {graph.clusters?.slice(0, 4).map((c) => (
              <Badge key={c.topic} variant="outline" className="text-[9px] px-1.5 py-0" style={{ borderColor: c.color + '40', color: c.color }}>
                {c.topic} ({c.count})
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Graph Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          {[
            { label: 'supports', style: EDGE_STYLES.supports },
            { label: 'contradicts', style: EDGE_STYLES.contradicts },
            { label: 'extends', style: EDGE_STYLES.extends },
            { label: 'related', style: EDGE_STYLES.related },
            { label: 'causes', style: EDGE_STYLES.causes },
            { label: 'requires', style: EDGE_STYLES.requires },
          ].map(({ label, style }) => (
            <div key={label} className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line x1="0" y1="4" x2="16" y2="4" stroke={style.stroke} strokeWidth="2" strokeDasharray={style.dasharray === 'none' ? undefined : style.dasharray} />
                {(label === 'causes' || label === 'requires') && (
                  <polygon points="16,1 20,4 16,7" fill={style.stroke} />
                )}
              </svg>
              <span className="text-[9px] text-muted-foreground/70">{label}</span>
            </div>
          ))}
        </div>

        {/* SVG Graph */}
        <div ref={containerRef} className="w-full rounded-lg bg-muted/10 border border-border/30 overflow-hidden" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <svg
            ref={svgRef}
            viewBox="0 0 500 360"
            className="w-full h-auto"
            style={{ minHeight: 280 }}
            onMouseMove={handleMouseMove}
          >
            <defs>
              <marker id="arrowOrange" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#f97316" />
              </marker>
              <marker id="arrowTeal" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#14b8a6" />
              </marker>
              {/* SVG Glow Filter */}
              <filter id="neuralGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="synapseGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              </filter>
            </defs>

            {/* Edges */}
            {graph.edges.map((edge, i) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;
              const style = EDGE_STYLES[edge.label] || EDGE_STYLES.related;
              const isHighlighted = hoveredNode
                ? edge.source === hoveredNode || edge.target === hoveredNode
                : true;
              const opacity = hoveredNode ? (isHighlighted ? 0.9 : 0.08) : 0.5;
              // Neural: edge thickness based on dynamic activationWeight, not static strength
              const strokeWidth = Math.max(0.5, (edge.activationWeight ?? edge.strength) * 3);
              // Fired edges glow brighter
              const hasFired = (edge.fireCount ?? 0) > 0;

              return (
                <g key={`edge-${i}`}>
                  {isHighlighted && (edge.label === 'causes' || edge.label === 'requires') && (
                    <line
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={style.stroke} strokeWidth={0.5} opacity={0.3 * opacity}
                    />
                  )}
                  {/* Glow for fired synapses — uses SVG filter for real glow */}
                  {hasFired && isHighlighted && (
                    <line
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={style.stroke} strokeWidth={strokeWidth + 3} opacity={0.2}
                      filter="url(#synapseGlow)"
                    />
                  )}
                  <line
                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke={style.stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={style.dasharray === 'none' ? undefined : style.dasharray}
                    strokeOpacity={opacity}
                    markerEnd={style.markerEnd}
                    className={isHighlighted && hoveredNode ? 'edge-flow' : ''}
                  />
                  {/* Fire count badge on hovered edges */}
                  {isHighlighted && hoveredNode && hasFired && (
                    <g>
                      <circle cx={(src.x + tgt.x) / 2} cy={(src.y + tgt.y) / 2} r={7} fill="white" opacity={0.9} />
                      <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2 + 3} textAnchor="middle" className="text-[7px] font-bold" fill={style.stroke}>
                        {edge.fireCount}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {layoutNodes.map((node) => {
              const color = getTopicColor(node.topic);
              const baseRadius = Math.max(6, Math.min(18, 6 + node.connections * 2.5));
              // Neural: size boosted by activationScore (active neurons appear bigger)
              const activationBonus = (node.activationScore ?? 0) * 8;
              const radius = Math.max(6, Math.min(22, baseRadius + activationBonus));
              const isHovered = hoveredNode === node.id;
              const isConnected = connectedNodeIds?.has(node.id);
              const dimmed = hoveredNode && !isConnected;
              const stale = node.stale;
              // Neural: activation glow intensity
              const activationGlow = node.activationScore ?? 0;
              const hasActivation = activationGlow > 0.01;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  opacity={dimmed ? 0.15 : 1}
                  onMouseDown={(e) => handleMouseDown(node.id, e)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => { if (!dragging) setHoveredNode(null); }}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ transition: 'opacity 0.2s ease' }}
                >
                  {/* Neural activation glow — uses SVG filter for real glow */}
                  {hasActivation && (
                    <circle
                      r={radius + 4 + activationGlow * 8}
                      fill={color}
                      opacity={activationGlow * 0.35}
                      filter="url(#neuralGlow)"
                    >
                      <animate attributeName="r" values={`${radius + 3 + activationGlow * 6};${radius + 6 + activationGlow * 12};${radius + 3 + activationGlow * 6}`} dur="2.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values={`${activationGlow * 0.35};${activationGlow * 0.15};${activationGlow * 0.35}`} dur="2.5s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Glow effect on hover */}
                  {isHovered && (
                    <circle r={radius + 8} fill={color} opacity={0.12}>
                      <animate attributeName="r" values={`${radius + 6};${radius + 12};${radius + 6}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.12;0.05;0.12" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Pulse ring for stale nodes */}
                  {stale && (
                    <circle r={radius + 4} fill="none" stroke="#ef4444" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 2">
                      <animate attributeName="r" values={`${radius + 2};${radius + 7};${radius + 2}`} dur="3s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Node circle */}
                  <circle
                    r={radius}
                    fill={color}
                    opacity={isHovered ? 0.95 : 0.75}
                    stroke={isHovered ? '#fff' : color}
                    strokeWidth={isHovered ? 2 : 1}
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    <animate
                      attributeName="r"
                      values={`${radius};${radius + 0.8};${radius}`}
                      dur={`${3 + (node.connections % 3)}s`}
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* Inner dot for confidence */}
                  <circle r={Math.max(2, radius * 0.35)} fill="white" opacity={node.confidence >= 0.7 ? 0.7 : 0.3} />

                  {/* Label — enhanced on hover with activation info */}
                  {isHovered && (
                    <g>
                      <rect
                        x={-55}
                        y={radius + 5}
                        width={110}
                        height={32}
                        rx={4}
                        fill={isDark ? 'oklch(0.15 0 0 / 95%)' : 'oklch(1 0 0 / 97%)'}
                        stroke={color}
                        strokeWidth={0.6}
                        strokeOpacity={0.5}
                      />
                      <text y={radius + 14} textAnchor="middle" className="pointer-events-none select-none" fill={isDark ? '#e5e7eb' : '#1f2937'} style={{ fontSize: '8px', fontWeight: 600 }}>
                        {node.label}
                      </text>
                      <text y={radius + 25} textAnchor="middle" className="pointer-events-none select-none font-mono" fill={isDark ? '#9ca3af' : '#6b7280'} style={{ fontSize: '7px' }}>
                        {node.confidence} · {node.connections}conn{node.activationScore > 0.01 ? ` · ${(node.activationScore * 100).toFixed(0)}%act` : ''}{node.stale ? ' · STALE' : ''}
                      </text>
                    </g>
                  )}
                  {/* Compact label for connected (not hovered) nodes */}
                  {!isHovered && isConnected && (
                    <g>
                      <rect
                        x={-node.label.length * 3.2 - 4}
                        y={radius + 4}
                        width={node.label.length * 6.4 + 8}
                        height={14}
                        rx={3}
                        fill={isDark ? 'oklch(0.2 0 0 / 90%)' : 'oklch(1 0 0 / 95%)'}
                        stroke={color}
                        strokeWidth={0.5}
                        strokeOpacity={0.4}
                      />
                      <text
                        y={radius + 13}
                        textAnchor="middle"
                        className="text-[8px] font-medium pointer-events-none select-none"
                        fill={isDark ? 'oklch(0.9 0 0)' : 'oklch(0.2 0 0)'}
                        style={{ fontSize: '8px' }}
                      >
                        {node.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== SECTION 3: BRAIN INSIGHTS =====

function BrainInsightsSection() {
  const [insights, setInsights] = useState<BrainInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchInsights() {
      try {
        // POST to trigger generation (idempotent — deduplicates by title+kind)
        const res = await fetch('/api/brain/insights', { method: 'POST' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) setInsights(data.insights || []);
      } catch {
        // Fallback to GET (read-only) if POST fails
        try {
          const res = await fetch('/api/brain/insights');
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (!cancelled) setInsights(data.insights || []);
        } catch {
          if (!cancelled) toast.error('Failed to load insights');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchInsights();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = useCallback(async (id: number) => {
    try {
      const res = await fetch('/api/brain/insights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, dismissed: true }),
      });
      if (!res.ok) throw new Error('Failed to dismiss');
      setInsights((prev) => prev.filter((i) => i.id !== id));
      toast.success('Insight dismissed');
    } catch {
      toast.error('Failed to dismiss insight');
    }
  }, []);

  const visibleInsights = insights.filter((i) => !i.dismissed);
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const sorted = [...visibleInsights].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const counts = {
    critical: visibleInsights.filter((i) => i.severity === 'critical').length,
    warning: visibleInsights.filter((i) => i.severity === 'warning').length,
    info: visibleInsights.filter((i) => i.severity === 'info').length,
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Brain Insights</CardTitle>
              <CardDescription className="text-[11px]">Loading...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 p-3 rounded-lg bg-muted/20">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Brain Insights</CardTitle>
              <CardDescription className="text-[11px]">Auto-generated observations</CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {counts.critical > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-rose-500/30 text-rose-600 dark:text-rose-400">
                🔴 {counts.critical}
              </Badge>
            )}
            {counts.warning > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400">
                ⚠️ {counts.warning}
              </Badge>
            )}
            {counts.info > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                💡 {counts.info}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="py-6 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/50">No insights yet</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Insights will appear as the knowledge base grows</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px] scroll-fade">
            <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-2 pr-2">
              {sorted.map((insight, idx) => {
                const config = SEVERITY_CONFIG[insight.severity];
                return (
                  <motion.div
                    key={insight.id}
                    variants={itemVariants}
                    className={`relative p-3 rounded-lg border border-border/30 hover:border-border/60 transition-all duration-200 ${config.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="text-sm shrink-0 mt-0.5">{config.icon}</span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-foreground/90 leading-tight">{insight.title}</h4>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{insight.description}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {insight.topics.map((t) => (
                              <Badge key={t} variant="outline" className={`text-[9px] px-1.5 py-0 ${getTopicBadgeClass(t)}`}>
                                {t}
                              </Badge>
                            ))}
                            {insight.actionable && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                <Target className="h-2 w-2 mr-0.5" /> Actionable
                              </Badge>
                            )}
                            <span className="text-[9px] text-muted-foreground/40 ml-auto">{new Date(insight.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDismiss(insight.id)}
                        className="shrink-0 h-5 w-5 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ===== SECTION 4: KNOWLEDGE GAPS =====

function KnowledgeGapsSection() {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch('/api/brain/gaps');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setGaps(data.gaps || []);
    } catch {
      toast.error('Failed to load knowledge gaps');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    toast.info('Running gap analysis...');
    // Re-fetch after a brief delay (the API should generate fresh gaps)
    await new Promise((r) => setTimeout(r, 800));
    await fetchGaps();
    toast.success('Gap analysis complete');
  }, [fetchGaps]);

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...gaps].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const highCount = gaps.filter((g) => g.severity === 'high').length;
  const medCount = gaps.filter((g) => g.severity === 'medium').length;
  const lowCount = gaps.filter((g) => g.severity === 'low').length;

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Gaps</CardTitle>
              <CardDescription className="text-[11px]">Loading...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 p-3 rounded-lg bg-muted/20">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Knowledge Gaps</CardTitle>
              <CardDescription className="text-[11px]">What the brain doesn&apos;t know</CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-7 px-2.5 gap-1"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            <RefreshCw className={`h-3 w-3 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary stats */}
        {gaps.length > 0 && (
          <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">{gaps.length} gap{gaps.length !== 1 ? 's' : ''} detected</span>
            </div>
            <div className="flex gap-1.5 ml-auto">
              {highCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                  {highCount} high
                </span>
              )}
              {medCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                  {medCount} medium
                </span>
              )}
              {lowCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  {lowCount} low
                </span>
              )}
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="py-6 text-center">
            <TrendingUp className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/50">No gaps detected</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Your knowledge base looks comprehensive</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[280px] scroll-fade">
            <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-2 pr-2">
              {sorted.map((gap, idx) => {
                const severity = GAP_SEVERITY[gap.severity];
                return (
                  <motion.div
                    key={`${gap.topic}-${gap.entity}-${idx}`}
                    variants={itemVariants}
                    className={`p-3 rounded-lg border border-border/30 hover:border-border/60 border-l-2 ${severity.color} transition-all duration-200 group`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${getTopicBadgeClass(gap.topic)}`}>
                            {gap.topic}
                          </Badge>
                          {gap.entity && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/50 text-muted-foreground">
                              {gap.entity}
                            </Badge>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${severity.badge}`}>
                            {gap.severity}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/90 font-medium leading-tight">{gap.missing}</p>
                        {gap.suggestion && (
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed flex items-start gap-1">
                            <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-emerald-500/70" />
                            <span>{gap.suggestion}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ===== SECTION 5: NEURAL STATS =====

function NeuralStatsSection({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<NeuralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [decaying, setDecaying] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/brain/neural-stats');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStats(data);
    } catch {
      toast.error('Failed to load neural stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);

  const handleDecay = useCallback(async () => {
    setDecaying(true);
    try {
      const res = await fetch('/api/brain/plasticity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: false }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast.success(`Decay applied: ${data.summary.decayed} weakened, ${data.summary.strengthened} LTP-protected`);
      await fetchStats();
    } catch {
      toast.error('Plasticity decay failed');
    } finally {
      setDecaying(false);
    }
  }, [fetchStats]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-rose-600 dark:text-rose-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Neural Network</CardTitle>
              <CardDescription className="text-[11px]">Loading...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent><Skeleton className="h-32 w-full rounded-lg" /></CardContent>
      </Card>
    );
  }

  // Pre-compute derived data — using plain computation, not useMemo, because
  // this runs after early return guard
  const activityDays = (() => {
    const days: { date: string; label: string; count: number; activation: number }[] = [];
    const byDay = stats?.activityByDay;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('hu-HU', { weekday: 'short' });
      const data = byDay?.[dateStr];
      days.push({ date: dateStr, label, count: data?.count ?? 0, activation: data?.totalActivation ?? 0 });
    }
    return days;
  })();

  const sortedLabels = Object.entries(stats?.labels || {}).sort(([, a], [, b]) => b - a);

  if (!stats) return null;

  const healthColor = stats.health.score >= 80 ? 'text-emerald-500' : stats.health.score >= 50 ? 'text-amber-500' : 'text-rose-500';
  const healthBg = stats.health.score >= 80 ? 'bg-emerald-500/10 border-emerald-500/20' : stats.health.score >= 50 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20';

  const maxActivity = Math.max(...activityDays.map(d => d.count), 1);

  // Weight distribution for visual bars
  const weightDist = stats.weights.distribution;
  const totalWeights = weightDist.dormant + weightDist.weak + weightDist.medium + weightDist.strong + weightDist.peak;
  const weightBars = [
    { label: 'Dormant', value: weightDist.dormant, color: 'bg-slate-300 dark:bg-slate-600' },
    { label: 'Weak', value: weightDist.weak, color: 'bg-amber-300 dark:bg-amber-600' },
    { label: 'Medium', value: weightDist.medium, color: 'bg-blue-400 dark:bg-blue-500' },
    { label: 'Strong', value: weightDist.strong, color: 'bg-emerald-400 dark:bg-emerald-500' },
    { label: 'Peak', value: weightDist.peak, color: 'bg-violet-500 dark:bg-violet-400' },
  ];

  // Activation distribution for sparkline
  const actDist = stats.activationDist || { dormant: 0, low: 0, medium: 0, high: 0, peak: 0 };
  const totalFacts = stats.activation.totalFacts || 1;
  const actDistBars = [
    { label: 'Dormant', value: actDist.dormant, color: 'bg-slate-300 dark:bg-slate-600', pct: (actDist.dormant / totalFacts) * 100 },
    { label: 'Low', value: actDist.low, color: 'bg-amber-300 dark:bg-amber-600', pct: (actDist.low / totalFacts) * 100 },
    { label: 'Medium', value: actDist.medium, color: 'bg-orange-400 dark:bg-orange-500', pct: (actDist.medium / totalFacts) * 100 },
    { label: 'High', value: actDist.high, color: 'bg-emerald-400 dark:bg-emerald-500', pct: (actDist.high / totalFacts) * 100 },
    { label: 'Peak', value: actDist.peak, color: 'bg-violet-500 dark:bg-violet-400', pct: (actDist.peak / totalFacts) * 100 },
  ];

  // Coverage ring SVG props
  const coveragePct = stats.activation.coverage * 100;
  const coverageColor = coveragePct >= 70 ? '#10b981' : coveragePct >= 40 ? '#f59e0b' : '#ef4444';
  const coverageStrokeDash = 2 * Math.PI * 18;
  const coverageStrokeOffset = coverageStrokeDash * (1 - stats.activation.coverage);

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Neural Network</CardTitle>
              <CardDescription className="text-[11px]">Synaptic health &amp; plasticity</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] font-mono tabular-nums text-muted-foreground">
              {stats.queries.total} queries
            </Badge>
            <Button size="sm" variant="outline" className="text-[10px] h-7 px-2.5 gap-1" onClick={handleDecay} disabled={decaying}>
              <Flame className={`h-3 w-3 ${decaying ? 'animate-pulse' : ''}`} />
              {decaying ? 'Decaying...' : 'Run Decay'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Health Score + Coverage Ring */}
        <div className={`p-3 rounded-lg border ${healthBg} flex items-center gap-4`}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Activity className={`h-4 w-4 ${healthColor} shrink-0`} />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground">Network Health</div>
              <div className={`text-lg font-bold tabular-nums ${healthColor}`}>{stats.health.score}%</div>
              <div className="text-[9px] text-muted-foreground">
                density {stats.topology.density} · coverage {(stats.activation.coverage * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          {/* Coverage Ring */}
          <div className="shrink-0 relative">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
              <circle
                cx="26" cy="26" r="18" fill="none"
                stroke={coverageColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={coverageStrokeDash}
                strokeDashoffset={coverageStrokeOffset}
                transform="rotate(-90 26 26)"
                className="transition-all duration-700"
              />
              <text x="26" y="28" textAnchor="middle" className="text-[9px] font-bold fill-foreground tabular-nums">
                {coveragePct.toFixed(0)}%
              </text>
            </svg>
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-muted-foreground whitespace-nowrap">coverage</div>
          </div>
          <div className="text-right shrink-0">
            <Badge variant="outline" className="text-[10px] capitalize">{stats.health.label}</Badge>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              {stats.plasticity.lastDayFires} fires/24h
            </div>
          </div>
        </div>

        {/* 7-Day Activity Sparkline */}
        <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
          <div className="text-[10px] font-semibold text-muted-foreground mb-2">7-Day Neural Activity</div>
          <div className="flex items-end gap-1.5 h-12">
            {activityDays.map((day) => {
              const height = Math.max(2, (day.count / maxActivity) * 100);
              const hasActivity = day.count > 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] tabular-nums text-muted-foreground">{day.count || ''}</span>
                  <div
                    className={`w-full rounded-sm transition-all ${hasActivity ? 'bg-gradient-to-t from-violet-500/60 to-violet-400/30' : 'bg-muted/50'}`}
                    style={{ height: `${height}%`, minHeight: 2 }}
                  />
                  <span className="text-[7px] text-muted-foreground">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Topology</span>
            </div>
            <div className="text-sm font-bold tabular-nums">{stats.topology.nodes} nodes</div>
            <div className="text-[10px] text-muted-foreground">{stats.topology.edges} edges · density {stats.topology.density}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">Plasticity</span>
            </div>
            <div className="text-sm font-bold tabular-nums">{(stats.plasticity.index * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground">{stats.plasticity.totalFires} fires · {stats.plasticity.neverFired} dormant</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Activation</span>
            </div>
            <div className="text-sm font-bold tabular-nums">{stats.activation.activeFacts}/{stats.activation.totalFacts} facts</div>
            <div className="text-[10px] text-muted-foreground">avg {(stats.activation.avgActivation * 100).toFixed(0)}% · peak {(stats.activation.peakActivation * 100).toFixed(0)}%</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="h-3 w-3 text-violet-500" />
              <span className="text-[10px] text-muted-foreground">Weights</span>
            </div>
            <div className="text-sm font-bold tabular-nums">{stats.weights.avg.toFixed(2)} avg</div>
            <div className="text-[10px] text-muted-foreground">range {stats.weights.min.toFixed(2)}–{stats.weights.max.toFixed(2)}</div>
          </div>
        </div>

        {/* Weight Distribution Visual Bar */}
        {totalWeights > 0 && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] font-semibold text-muted-foreground mb-2">Weight Distribution</div>
            <div className="flex h-3 rounded-full overflow-hidden gap-px">
              {weightBars.map((bar) => (
                <div
                  key={bar.label}
                  className={`${bar.color} transition-all`}
                  style={{ width: `${(bar.value / totalWeights) * 100}%` }}
                  title={`${bar.label}: ${bar.value}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
              {weightBars.map((bar) => (
                <span key={bar.label} className="text-[8px] text-muted-foreground">
                  {bar.label} <span className="font-medium tabular-nums">{bar.value}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Activation Distribution */}
        {stats.activation.totalFacts > 0 && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] font-semibold text-muted-foreground mb-2">Fact Activation Distribution</div>
            <div className="flex h-3 rounded-full overflow-hidden gap-px">
              {actDistBars.map((bar) => (
                <div
                  key={bar.label}
                  className={`${bar.color} transition-all`}
                  style={{ width: `${bar.pct}%` }}
                  title={`${bar.label}: ${bar.value}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
              {actDistBars.map((bar) => (
                <span key={bar.label} className="text-[8px] text-muted-foreground">
                  {bar.label} <span className="font-medium tabular-nums">{bar.value}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Most Activated Facts */}
        {stats.mostActivatedFacts && stats.mostActivatedFacts.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] font-semibold text-muted-foreground mb-1.5">Most Activated Neurons</div>
            <div className="space-y-1.5">
              {stats.mostActivatedFacts.slice(0, 4).map((f, i) => {
                const factColor = getTopicColor(f.topic);
                return (
                  <div key={f.id} className="flex items-center gap-2 p-1.5 rounded bg-muted/10 border border-border/10">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: factColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-foreground/90 truncate">{f.entity}/{f.attribute}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{f.statement}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-10 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: factColor }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(f.activationScore * 100, 100)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="text-[9px] tabular-nums font-medium w-8 text-right" style={{ color: factColor }}>
                        {(f.activationScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Topic Connectivity Map */}
        {stats.topicConnectivity && stats.topicConnectivity.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] font-semibold text-muted-foreground mb-1.5">Cross-Topic Pathways</div>
            <div className="space-y-1">
              {stats.topicConnectivity.slice(0, 4).map((conn, i) => {
                const [topicA, topicB] = conn.pair.split(' ↔ ');
                const colorA = getTopicColor(topicA);
                const colorB = getTopicColor(topicB);
                return (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/10 border border-border/10">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorA }} />
                      <span className="text-[9px] font-medium truncate">{topicA}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 px-1">
                      <div className="w-4 h-px" style={{ background: `linear-gradient(to right, ${colorA}, ${colorB})` }} />
                      <span className="text-[8px] font-mono tabular-nums text-muted-foreground">{conn.count}</span>
                      <div className="w-4 h-px" style={{ background: `linear-gradient(to right, ${colorB}, ${colorA})` }} />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
                      <span className="text-[9px] font-medium truncate">{topicB}</span>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorB }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Label Distribution */}
        {sortedLabels.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] font-semibold text-muted-foreground mb-2">Association Types</div>
            <div className="flex flex-wrap gap-1.5">
              {sortedLabels.map(([label, count]) => {
                const style = EDGE_STYLES[label as keyof typeof EDGE_STYLES];
                const stroke = style?.stroke || '#94a3b8';
                return (
                  <div key={label} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 border border-border/10">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stroke }} />
                    <span className="text-[9px] font-medium">{label}</span>
                    <span className="text-[8px] text-muted-foreground tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Synapses */}
        {stats.topAssociations.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1.5">Most Exercised Synapses</div>
            <div className="space-y-1">
              {stats.topAssociations.slice(0, 5).map((a, i) => {
                const style = EDGE_STYLES[a.label as keyof typeof EDGE_STYLES];
                const stroke = style?.stroke || '#94a3b8';
                return (
                  <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/10 border border-border/10">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground w-4">#{i + 1}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stroke }} />
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{a.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Mini weight bar */}
                      <div className="w-12 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${a.weight * 100}%`, backgroundColor: stroke }} />
                      </div>
                      <span className="text-[10px] tabular-nums font-medium w-8 text-right">{a.weight.toFixed(2)}</span>
                      <span className="text-[9px] text-muted-foreground w-6 text-right">{a.fireCount}×</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Neural Activity Feed */}
        {stats.recentActivity && stats.recentActivity.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1.5">Recent Neural Activity</div>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {stats.recentActivity.map((act) => (
                <div key={act.id} className="flex items-center gap-2 p-1.5 rounded bg-muted/10 border border-border/10 text-[10px]">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: act.activation > 0.5 ? '#a855f7' : act.activation > 0.2 ? '#f59e0b' : '#94a3b8',
                    }}
                  />
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {new Date(act.createdAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="truncate">
                    Fact <span className="font-mono text-muted-foreground">#{act.factId}</span>
                    {act.triggeredBy && (
                      <span className="text-muted-foreground"> via {act.triggeredBy}</span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground">
                    {(act.activation * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== DREAM & SCHEDULE SECTION =====

const DREAMER_PRESETS = [
  { label: 'Minden éjjel 3:00', value: '0 3 * * *' },
  { label: 'Kétnaponta hajnalban', value: '0 3 */2 * *' },
  { label: '6 óránként', value: '0 */6 * * *' },
  { label: 'Hetente vasárnap éjjel', value: '0 2 * * 0' },
  { label: 'Havonta 1-jén', value: '0 3 1 * *' },
  { label: 'Egyéni (cron)', value: '__custom__' },
];

const LIBRARIAN_PRESETS = [
  { label: '4 óránként', value: '0 */4 * * *' },
  { label: '6 óránként', value: '0 */6 * * *' },
  { label: '8 óránként', value: '0 */8 * * *' },
  { label: 'Naponta éjjel', value: '0 2 * * *' },
  { label: 'Naponta délben', value: '0 12 * * *' },
  { label: 'Egyéni (cron)', value: '__custom__' },
];

const COMMON_TIMEZONES = [
  { label: 'Europe/Budapest', value: 'Europe/Budapest' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Berlin', value: 'Europe/Berlin' },
  { label: 'US/Eastern', value: 'US/Eastern' },
  { label: 'US/Pacific', value: 'US/Pacific' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: 'UTC', value: 'UTC' },
];

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Soha';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('hu-HU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function DreamAndScheduleSection() {
  const queryClient = useQueryClient();

  // Fetch settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: () => fetch('/api/settings').then(r => r.json()),
    staleTime: 10_000,
  });

  // Local UI state only for transient interactions
  const [customDreamerCron, setCustomDreamerCron] = useState('');
  const [customLibrarianCron, setCustomLibrarianCron] = useState('');
  const [showCustomDreamer, setShowCustomDreamer] = useState(false);
  const [showCustomLibrarian, setShowCustomLibrarian] = useState(false);

  // Derive from server state
  const dreamerEnabled = settings?.dreamerEnabled ?? false;
  const librarianEnabled = settings?.librarianEnabled ?? false;
  const dreamerSchedule = settings?.dreamerSchedule ?? '0 3 * * *';
  const librarianSchedule = settings?.librarianSchedule ?? '0 */4 * * *';
  const timezone = settings?.timezone ?? 'Europe/Budapest';

  const isDreamerCustom = !DREAMER_PRESETS.find(p => p.value === dreamerSchedule);
  const isLibrarianCustom = !LIBRARIAN_PRESETS.find(p => p.value === librarianSchedule);

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Settings update failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      queryClient.invalidateQueries({ queryKey: ['sparks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['neural-stats'] });
    },
  });

  // Manual trigger mutations
  const runDreamerManual = useMutation({
    mutationFn: () => fetch('/api/dreamer/run', { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      toast.success(data.summary || 'Dreamer futás befejeződött');
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      queryClient.invalidateQueries({ queryKey: ['sparks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err: Error) => toast.error(`Dreamer hiba: ${err.message}`),
  });

  const runLibrarianManual = useMutation({
    mutationFn: () => fetch('/api/librarian', { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      toast.success(data.summary || 'Librarian futás befejeződött');
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err: Error) => toast.error(`Librarian hiba: ${err.message}`),
  });

  const handleDreamerScheduleChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomDreamer(true);
      setCustomDreamerCron(dreamerSchedule);
      return;
    }
    setShowCustomDreamer(false);
    updateSettings.mutate({ dreamerSchedule: value });
  };

  const handleLibrarianScheduleChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomLibrarian(true);
      setCustomLibrarianCron(librarianSchedule);
      return;
    }
    setShowCustomLibrarian(false);
    updateSettings.mutate({ librarianSchedule: value });
  };

  const handleCustomDreamerApply = () => {
    if (customDreamerCron.trim()) {
      updateSettings.mutate({ dreamerSchedule: customDreamerCron.trim() });
    }
  };

  const handleCustomLibrarianApply = () => {
    if (customLibrarianCron.trim()) {
      updateSettings.mutate({ librarianSchedule: customLibrarianCron.trim() });
    }
  };

  if (settingsLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isUpdating = updateSettings.isPending;
  const dreamerRunning = runDreamerManual.isPending;
  const librarianRunning = runLibrarianManual.isPending;

  // The Select value must be one of the preset values or '__custom__'
  const dreamerSelectValue = isDreamerCustom ? '__custom__' : dreamerSchedule;
  const librarianSelectValue = isLibrarianCustom ? '__custom__' : librarianSchedule;
  const showDreamerCustomInput = showCustomDreamer || isDreamerCustom;
  const showLibrarianCustomInput = showCustomLibrarian || isLibrarianCustom;

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center ring-2 ring-violet-500/10">
                <Moon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
                  Álom és ütemezés
                  {settings?.dreamerEnabled || settings?.librarianEnabled ? (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 bg-violet-500/5 border-violet-500/20 text-violet-600 dark:text-violet-400">
                      AKTÍV
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-muted-foreground">
                      INAKTÍV
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-[11px] mt-0.5">
                  A Dreamer és Librarian automatikus, ütemezett futtatása
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ─── Dreamer Card ─── */}
            <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-violet-500/5 to-transparent space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <Label htmlFor="dreamer-toggle" className="text-xs font-semibold cursor-pointer">
                    Éjszakai álom (Dreamer)
                  </Label>
                </div>
                <Switch
                  id="dreamer-toggle"
                  checked={dreamerEnabled}
                  onCheckedChange={(checked) => updateSettings.mutate({ dreamerEnabled: checked })}
                  disabled={isUpdating}
                />
              </div>

              {/* Schedule selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ütemezés</Label>
                <Select value={dreamerSelectValue} onValueChange={handleDreamerScheduleChange} disabled={isUpdating}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Válassz ütemezést..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DREAMER_PRESETS.map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showDreamerCustomInput && (
                  <div className="flex gap-1.5">
                    <Input
                      value={customDreamerCron}
                      onChange={e => setCustomDreamerCron(e.target.value)}
                      placeholder="0 3 * * *"
                      className="h-7 text-xs font-mono"
                      onKeyDown={e => e.key === 'Enter' && handleCustomDreamerApply()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px] shrink-0"
                      onClick={handleCustomDreamerApply}
                      disabled={isUpdating || !customDreamerCron.trim()}
                    >
                      Mentés
                    </Button>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Clock className="h-3 w-3" />
                      <span>Utolsó: {formatRelativeTime(settings?.dreamerLastRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.dreamerLastRunAt)}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Calendar className="h-3 w-3" />
                      <span>Következő: {formatRelativeTime(settings?.dreamerNextRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.dreamerNextRunAt)}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Manual trigger */}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5 border-violet-500/20 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
                onClick={() => runDreamerManual.mutate()}
                disabled={dreamerRunning}
              >
                {dreamerRunning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Álmodik...</>
                ) : (
                  <><Play className="h-3 w-3" /> Álmodj most</>
                )}
              </Button>
            </div>

            {/* ─── Librarian Card ─── */}
            <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-amber-500/5 to-transparent space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-500" />
                  <Label htmlFor="librarian-toggle" className="text-xs font-semibold cursor-pointer">
                    Automatikus rendezés (Librarian)
                  </Label>
                </div>
                <Switch
                  id="librarian-toggle"
                  checked={librarianEnabled}
                  onCheckedChange={(checked) => updateSettings.mutate({ librarianEnabled: checked })}
                  disabled={isUpdating}
                />
              </div>

              {/* Schedule selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ütemezés</Label>
                <Select value={librarianSelectValue} onValueChange={handleLibrarianScheduleChange} disabled={isUpdating}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Válassz ütemezést..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LIBRARIAN_PRESETS.map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showLibrarianCustomInput && (
                  <div className="flex gap-1.5">
                    <Input
                      value={customLibrarianCron}
                      onChange={e => setCustomLibrarianCron(e.target.value)}
                      placeholder="0 */4 * * *"
                      className="h-7 text-xs font-mono"
                      onKeyDown={e => e.key === 'Enter' && handleCustomLibrarianApply()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px] shrink-0"
                      onClick={handleCustomLibrarianApply}
                      disabled={isUpdating || !customLibrarianCron.trim()}
                    >
                      Mentés
                    </Button>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Clock className="h-3 w-3" />
                      <span>Utolsó: {formatRelativeTime(settings?.librarianLastRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.librarianLastRunAt)}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Calendar className="h-3 w-3" />
                      <span>Következő: {formatRelativeTime(settings?.librarianNextRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.librarianNextRunAt)}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Manual trigger */}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5 border-amber-500/20 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                onClick={() => runLibrarianManual.mutate()}
                disabled={librarianRunning}
              >
                {librarianRunning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Rendez...</>
                ) : (
                  <><Play className="h-3 w-3" /> Rendezd most</>
                )}
              </Button>
            </div>
          </div>

          {/* ─── Timezone ─── */}
          <Separator className="my-1" />
          <div className="flex items-center gap-3">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">Időzóna</Label>
            <Select value={timezone} onValueChange={(v) => updateSettings.mutate({ timezone: v })} disabled={isUpdating}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mutation error display */}
          <AnimatePresence>
            {updateSettings.isError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-red-500 bg-red-500/10 rounded-lg p-2.5"
              >
                {updateSettings.error instanceof Error ? updateSettings.error.message : 'Hiba a mentésnél'}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

// ===== MAIN BRAIN TAB =====

export function BrainTab({ searchQuery }: { searchQuery: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleQueryDone = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* Header banner */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 overflow-hidden bg-gradient-to-r from-emerald-500/5 via-amber-500/5 to-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 ring-2 ring-emerald-500/10">
              <Brain className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
                <span className="bg-gradient-to-r from-emerald-600 via-amber-600 to-emerald-600 bg-clip-text text-transparent dark:from-emerald-400 dark:via-amber-400 dark:to-emerald-400">
                  The Brain
                </span>
                <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  LIVE
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </Badge>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Neural knowledge graph with spreading activation, Hebbian learning, and synaptic plasticity.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top-left: Ask Brain */}
        <motion.div variants={itemVariants}>
          <AskBrainSection searchQuery={searchQuery} onQueryDone={handleQueryDone} />
        </motion.div>

        {/* Top-right: Knowledge Graph */}
        <motion.div variants={itemVariants}>
          <KnowledgeGraphSection />
        </motion.div>

        {/* Bottom-left: Brain Insights */}
        <motion.div variants={itemVariants}>
          <BrainInsightsSection />
        </motion.div>

        {/* Bottom-right: Knowledge Gaps */}
        <motion.div variants={itemVariants}>
          <KnowledgeGapsSection />
        </motion.div>
      </div>

      {/* Neural Stats - Full Width */}
      <motion.div variants={itemVariants}>
        <NeuralStatsSection refreshKey={refreshKey} />
      </motion.div>

      {/* Dream & Schedule - Full Width */}
      <motion.div variants={itemVariants}>
        <DreamAndScheduleSection />
      </motion.div>
    </motion.div>
  );
}
