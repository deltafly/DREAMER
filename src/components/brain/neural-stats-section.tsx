'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Flame, Database, Zap, Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';
import { NeuralStats } from './types';
import { getTopicColor, EDGE_STYLES } from './constants';

// ===== SECTION 5: NEURAL STATS =====

export function NeuralStatsSection({ refreshKey }: { refreshKey: number }) {
  const wsId = useWorkspaceId();
  const [stats, setStats] = useState<NeuralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [decaying, setDecaying] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(wsUrl('/api/brain/neural-stats', wsId));
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStats(data);
    } catch {
      toast.error('Failed to load neural stats');
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);

  const handleDecay = useCallback(async () => {
    setDecaying(true);
    try {
      const res = await fetch(wsUrl('/api/brain/plasticity', wsId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: false }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast.success(`Decay applied: ${data.summary.decayed} weakened, ${data.summary.strengthened} LTP-protected`);
      await fetchStats();
    } catch {
      toast.error('Plasticity decay failed');
    } finally {
      setDecaying(false);
    }
  }, [fetchStats, wsId]);

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