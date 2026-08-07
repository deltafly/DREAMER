'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Database, Shield, Scale, BookOpen, Sparkles, Flame,
  ArrowUpDown, CheckCircle2, Clock, Layers, Heart, Hash, Settings, Activity,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

import type { Stats, TimelineItem, Preference, Dispute } from './types';
import { timeAgo, formatDuration, topicColor, topicDotColor, statusColor, containerVariants, itemVariants, chartColors } from './helpers';
import { AnimatedCounter } from './animated-counter';
import { HealthGauge } from './health-gauge';

interface OverviewTabProps {
  stats: Stats | null;
  timeline: TimelineItem[];
  preferences: Preference[];
  disputes: Dispute[];
  lastRefresh: string;
  onNavigateToTab: (tab: string) => void;
}

export function OverviewTab({ stats, timeline, preferences, disputes, lastRefresh, onNavigateToTab }: OverviewTabProps) {
  const healthScore = useMemo(() => {
    if (!stats) return 0;
    return Math.round(
      ((100 - stats.layers.l2.facts.staleRatio) * 0.30) +
      (stats.layers.l1.total > 0 ? ((stats.layers.l1.total - stats.health.unprocessedLedger) / stats.layers.l1.total * 100) * 0.25 : 25) +
      (stats.disputes.open === 0 ? 100 : Math.max(0, 100 - stats.disputes.open * 20)) * 0.25 +
      (stats.layers.l3.dirty === 0 ? 100 : Math.max(0, 100 - stats.layers.l3.dirty * 25)) * 0.20
    );
  }, [stats]);

  const topicPieData = useMemo(() => {
    return (stats?.layers.l1.byTopic || []).map(t => ({
      name: t.topic, value: t._count.id,
      fill: t.topic === 'mcos-engine' ? '#f97316' : t.topic === 'onebrainer' ? '#8b5cf6' : t.topic === 'personal' ? '#14b8a6' : '#71717a',
    }));
  }, [stats]);

  const librarianChartData = useMemo(() => {
    return (stats?.librarian.recentRuns || []).reverse().map(r => ({
      name: `#${r.id}`,
      facts: r.factsExtracted,
      decisions: r.decisionsExtracted,
      disputes: r.disputesCreated,
      briefs: r.briefsRebuilt,
      stale: r.staleFlagged,
    }));
  }, [stats]);

  return (
    <div className="space-y-6">
      {!stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} className="border-border/50"><CardContent className="p-4"><Skeleton className="h-3 w-20 mb-2" /><Skeleton className="h-8 w-12" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
          {/* Health Banner */}
          {(stats.health.openDisputes > 0 || stats.health.staleRatio > 15 || stats.health.unprocessedLedger > 5) && (
            <motion.div variants={itemVariants}>
              <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5 overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-500 to-orange-500" />
                <CardContent className="p-3 pl-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 ring-2 ring-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Attention needed</p>
                    <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 truncate">
                      {[stats.health.openDisputes > 0 && `${stats.health.openDisputes} open dispute${stats.health.openDisputes > 1 ? 's' : ''}`, stats.health.staleRatio > 15 && `${stats.health.staleRatio}% stale`, stats.health.unprocessedLedger > 5 && `${stats.health.unprocessedLedger} unprocessed`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] border-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-medium"
                    onClick={() => onNavigateToTab('disputes')}>Review <ChevronRight className="h-3 w-3 ml-1" /></Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {[
              { label: 'L1 Entries', value: stats.layers.l1.total, sub: stats.layers.l1.unprocessed > 0 ? `${stats.layers.l1.unprocessed} unprocessed` : 'All processed ✓', subGood: stats.layers.l1.unprocessed === 0, icon: <Database className="h-4 w-4 text-sky-500" />, accent: 'from-sky-500/5 to-transparent', tab: 'ledger' as const },
              { label: 'L2 Facts', value: stats.layers.l2.facts.live, sub: `${stats.layers.l2.facts.stale} stale`, subGood: stats.layers.l2.facts.stale <= 2, icon: <Shield className="h-4 w-4 text-violet-500" />, accent: 'from-violet-500/5 to-transparent', tab: 'knowledge' as const },
              { label: 'Decisions', value: stats.layers.l2.decisions.active, sub: `${stats.layers.l2.decisions.total} total`, subGood: true, icon: <Scale className="h-4 w-4 text-emerald-500" />, accent: 'from-emerald-500/5 to-transparent', tab: 'knowledge' as const },
              { label: 'L3 Briefs', value: stats.layers.l3.total, sub: stats.layers.l3.dirty > 0 ? `${stats.layers.l3.dirty} dirty` : 'All fresh ✓', subGood: stats.layers.l3.dirty === 0, icon: <BookOpen className="h-4 w-4 text-emerald-500" />, accent: 'from-emerald-500/5 to-transparent', tab: 'briefs' as const },
              { label: 'Disputes', value: stats.disputes.open, sub: `${stats.disputes.resolved} resolved`, subGood: stats.disputes.open < 3, icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, accent: 'from-amber-500/5 to-transparent', tab: 'disputes' as const },
              { label: 'Librarian', value: stats.librarian.totalRuns, sub: stats.librarian.lastRun ? `Last: ${timeAgo(stats.librarian.lastRun.startedAt)}` : 'No runs', subGood: true, icon: <Sparkles className="h-4 w-4 text-violet-500" />, accent: 'from-violet-500/5 to-transparent', tab: 'overview' as const },
              { label: 'Dreamer', value: stats.dreamer?.totalSparks ?? 0, sub: stats.dreamer ? `${Math.round((stats.dreamer.hitRate || 0) * 100)}% hit rate` : '—', subGood: (stats.dreamer?.hitRate ?? 0) >= 0.1, icon: <Flame className="h-4 w-4 text-orange-500" />, accent: 'from-orange-500/5 to-transparent', tab: 'dreamer' as const },
            ].map((card, i) => (
              <motion.div key={i} variants={itemVariants}>
                <Card onClick={() => onNavigateToTab(card.tab)} className="border-border/40 hover:border-border/70 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300 group overflow-hidden cursor-pointer gradient-border-hover card-glow">
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
                  <CardContent className="p-4 relative">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] text-muted-foreground font-medium">{card.label}</p>
                      {card.icon}
                    </div>
                    <p className="text-2xl font-black tracking-tight"><AnimatedCounter value={card.value} /></p>
                    <p className={`text-[10px] mt-1 ${card.subGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{card.sub}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Architecture + Librarian */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3 border-border/40 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-muted/30 to-transparent">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center"><Layers className="h-3.5 w-3.5 text-violet-500" /></div>
                  <div><CardTitle className="text-sm">Memory Architecture</CardTitle><CardDescription className="text-[11px]">Three-layer curated knowledge system</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-3">
                {/* L1 Block */}
                <motion.div variants={itemVariants}
                  className="relative rounded-xl border border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/[0.07] p-3.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center">
                        <Database className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">L1 — Ledger</p>
                        <p className="text-[10px] text-muted-foreground">Raw session digests · append-only</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{stats.layers.l1.total}</p>
                      <p className="text-[10px] text-muted-foreground">entries</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-1.5 flex-wrap">
                    {stats.layers.l1.byTopic.map(t => (
                      <Badge key={t.topic} variant="outline" className={`text-[10px] font-medium ${topicColor(t.topic)}`}>{t.topic}: {t._count.id}</Badge>
                    ))}
                  </div>
                  <div className="flex justify-center my-2.5">
                    <div className="flex flex-col items-center gap-0.5 text-muted-foreground/40">
                      <ArrowUpDown className="h-4 w-4 flow-arrow" />
                      <span className="text-[9px] font-medium">Librarian distills</span>
                    </div>
                  </div>
                </motion.div>

                {/* L2 Block */}
                <motion.div variants={itemVariants}
                  className="relative rounded-xl border border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/[0.07] p-3.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/15 flex items-center justify-center">
                        <Shield className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">L2 — Canonical</p>
                        <p className="text-[10px] text-muted-foreground">Curated facts, decisions, preferences</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { v: stats.layers.l2.facts.live, l: 'facts', c: 'text-sky-600 dark:text-sky-400' },
                      { v: stats.layers.l2.decisions.active, l: 'decisions', c: 'text-violet-600 dark:text-violet-400' },
                      { v: stats.layers.l2.preferences, l: 'preferences', c: 'text-amber-600 dark:text-amber-400' },
                      { v: stats.layers.l2.projectState, l: 'state keys', c: 'text-emerald-600 dark:text-emerald-400' },
                    ].map((s, si) => (
                      <div key={si} className="rounded-lg bg-background/60 dark:bg-background/40 backdrop-blur-sm p-2 text-center border border-border/30">
                        <p className={`text-sm font-bold ${s.c}`}>{s.v}</p>
                        <p className="text-[9px] text-muted-foreground font-medium">{s.l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center my-2.5">
                    <div className="flex flex-col items-center gap-0.5 text-muted-foreground/40">
                      <ArrowUpDown className="h-4 w-4 flow-arrow-delayed" />
                      <span className="text-[9px] font-medium">Librarian assembles</span>
                    </div>
                  </div>
                </motion.div>

                {/* L3 Block */}
                <motion.div variants={itemVariants}
                  className="relative rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/[0.07] p-3.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
                        <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">L3 — Briefs</p>
                        <p className="text-[10px] text-muted-foreground">Assembled context documents</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.layers.l3.total}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {stats.layers.l3.dirty === 0 ? 'All fresh' : `${stats.layers.l3.dirty} dirty`}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Dreamer Block */}
                <motion.div variants={itemVariants}
                  className="relative rounded-xl border border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/[0.07] p-3.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-orange-500/10 dark:bg-orange-500/15 flex items-center justify-center">
                        <Flame className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">Dreamer</p>
                        <p className="text-[10px] text-muted-foreground">Associative engine · max 1 spark/day</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{stats.dreamer?.totalSparks ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">sparks</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-1.5 flex-wrap">
                    {stats.dreamer?.byKind && Object.entries(stats.dreamer.byKind).map(([kind, count]) => (
                      <Badge key={kind} variant="outline" className="text-[10px] font-medium bg-orange-500/5 border-orange-500/15 text-orange-700 dark:text-orange-400">
                        {kind}: {count}
                      </Badge>
                    ))}
                    {stats.dreamer && (
                      <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/5 border-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        hit rate: {Math.round((stats.dreamer.hitRate || 0) * 100)}%
                      </Badge>
                    )}
                  </div>
                </motion.div>

                {/* Freshness bar */}
                <motion.div variants={itemVariants}>
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Fact freshness</span>
                      <span className={`text-[11px] font-bold ${stats.layers.l2.facts.staleRatio <= 20 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {100 - stats.layers.l2.facts.staleRatio}% fresh
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${100 - stats.layers.l2.facts.staleRatio}%` }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                        style={{ backgroundColor: stats.layers.l2.facts.staleRatio <= 20 ? 'var(--color-emerald-500)' : 'var(--color-amber-500)' }} />
                    </div>
                  </div>
                </motion.div>
              </CardContent>
            </Card>

            {/* Librarian panel */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-border/40">
                <CardHeader className="pb-2 bg-gradient-to-r from-violet-500/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center"><Sparkles className="h-3.5 w-3.5 text-violet-500" /></div>
                    <div><CardTitle className="text-sm">Librarian Runs</CardTitle><CardDescription className="text-[11px]">Nightly distillation pipeline</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px] pr-1">
                    <div className="space-y-1.5">
                      {stats.librarian.recentRuns.map((run) => (
                        <div key={run.id} className="rounded-lg border border-border/30 p-2.5 hover:bg-muted/30 transition-colors group">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              {run.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <div className="h-3.5 w-3.5 border-2 border-violet-400/30 border-t-violet-500 rounded-full animate-spin" />}
                              <span className="text-[11px] font-semibold">Run #{run.id}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{timeAgo(run.startedAt)}</span>
                          </div>
                          <div className="grid grid-cols-5 gap-1 mb-1">
                            {[{ v: run.factsExtracted, l: 'facts', c: 'text-sky-600 dark:text-sky-400' }, { v: run.decisionsExtracted, l: 'dec.', c: 'text-violet-600 dark:text-violet-400' }, { v: run.disputesCreated, l: 'disp.', c: 'text-amber-600 dark:text-amber-400' }, { v: run.briefsRebuilt, l: 'briefs', c: 'text-emerald-600 dark:text-emerald-400' }, { v: run.staleFlagged, l: 'stale', c: 'text-red-600 dark:text-red-400' }].map((m, mi) => (
                              <div key={mi} className="text-center">
                                <p className={`text-xs font-bold ${m.c}`}>{m.v}</p>
                                <p className="text-[8px] text-muted-foreground font-medium">{m.l}</p>
                              </div>
                            ))}
                          </div>
                          {run.endedAt && (
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                              <Clock className="h-3 w-3" /><span>{formatDuration(run.startedAt, run.endedAt)}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Mini chart */}
              {librarianChartData.length > 0 && (
                <Card className="border-border/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Run Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={librarianChartData} barCategoryGap="20%" barGap={2}>
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' }} />
                        <Bar dataKey="facts" stackId="a" fill={chartColors.facts} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="decisions" stackId="a" fill={chartColors.decisions} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="disputes" stackId="a" fill={chartColors.disputes} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* System Health */}
            <Card className="border-border/40 card-glow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-rose-500" />
                  <CardTitle className="text-sm">System Health</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <HealthGauge score={healthScore} />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] w-full">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Fact freshness</span><span className="font-bold">{100 - (stats?.layers.l2.facts.staleRatio ?? 0)}%</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Ledger processed</span><span className="font-bold">{stats ? Math.round(((stats.layers.l1.total - stats.health.unprocessedLedger) / Math.max(1, stats.layers.l1.total)) * 100) : 0}%</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Disputes</span><span className="font-bold">{stats?.disputes.open ?? 0} open</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Briefs</span><span className="font-bold">{stats?.layers.l3.dirty === 0 ? '✓ fresh' : `${stats?.layers.l3.dirty} dirty`}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Topic Distribution Pie */}
            {topicPieData.length > 0 && (
              <Card className="border-border/40 card-glow">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-violet-500" />
                    <CardTitle className="text-sm">Topic Distribution</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={topicPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
                        {topicPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/40 card-glow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Decision Outcomes</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats.layers.l2.decisions.byStatus.map(ds => {
                  const pct = stats.layers.l2.decisions.total > 0 ? Math.round((ds._count.id / stats.layers.l2.decisions.total) * 100) : 0;
                  return (
                    <div key={ds.status} className="flex items-center gap-3">
                      <Badge variant="outline" className={`text-[10px] w-24 justify-center font-medium badge-animate ${statusColor(ds.status)}`}>{ds.status}</Badge>
                      <div className="flex-1"><Progress value={pct} className="h-2" /></div>
                      <span className="text-xs font-bold w-8 text-right">{ds._count.id}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/40 card-glow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Active Preferences</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-48 scroll-fade">
                  <div className="space-y-1.5">
                    {preferences.map(p => (
                      <div key={p.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                        <Badge variant="outline" className="text-[9px] mt-0.5 h-4 px-1.5 shrink-0 font-medium">{p.scope}</Badge>
                        <p className="text-[11px] text-foreground/80 leading-relaxed">{p.statement}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card className="border-border/40 card-glow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Recent Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-48 scroll-fade">
                  <div className="space-y-0">
                    {timeline.slice(0, 15).map((item, i) => (
                      <div key={item.id} className="flex gap-2.5 py-2 relative">
                        {i < 14 && <div className="absolute left-[5px] top-8 bottom-0 w-px bg-border/40" />}
                        <div className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ring-2 ring-background ${
                          item.type === 'librarian' ? 'bg-violet-500' :
                          item.type === 'dispute_resolved' ? 'bg-emerald-500' :
                          topicDotColor[item.topic] || 'bg-zinc-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground">{item.agent}</span>
                            <Badge variant="outline" className={`text-[8px] px-1 h-3 ${topicColor(item.topic)}`}>{item.topic}</Badge>
                            <span className="text-[9px] text-muted-foreground/50 ml-auto">{timeAgo(item.ts)}</span>
                          </div>
                          <p className="text-[11px] text-foreground/70 line-clamp-2 leading-relaxed">{item.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}
    </div>
  );
}