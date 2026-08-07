'use client';

import { motion } from 'framer-motion';
import {
  Flame, Loader2, Eye, Target, TrendingUp, AlertTriangle, Link2,
  ThumbsUp, ThumbsDown, EyeOff, Sparkles,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Stats, Spark, DreamerStats } from './types';
import { timeAgo, topicColor } from './helpers';
import { EmptyState } from '@/components/empty-state';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

export interface DreamerTabProps {
  sparks: Spark[];
  sparkStats: DreamerStats | null;
  sparkFilter: string;
  sparkKindFilter: string;
  isRunningDreamer: boolean;
  dreamerResult: string | null;
  stats: Stats | null;
  onSparkFilterChange: (v: string) => void;
  onSparkKindFilterChange: (v: string) => void;
  onRunDreamer: () => void;
  onRateSpark: (id: number, hit: boolean) => void;
}

export function DreamerTab({
  sparks,
  sparkStats,
  sparkFilter,
  sparkKindFilter,
  isRunningDreamer,
  dreamerResult,
  stats,
  onSparkFilterChange,
  onSparkKindFilterChange,
  onRunDreamer,
  onRateSpark,
}: DreamerTabProps) {
  return (
    <div className="space-y-4">
      {/* Run Dreamer button */}
      <div className="flex items-center gap-3">
        <Button onClick={onRunDreamer} disabled={isRunningDreamer} className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white border-0 font-medium text-xs h-9 px-4">
          {isRunningDreamer ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Colliding topics...</> : <><Flame className="h-3.5 w-3.5" />Run Dreamer</>}
        </Button>
        {dreamerResult && <p className="text-[11px] text-muted-foreground max-w-2xl truncate">{dreamerResult}</p>}
      </div>
      <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Sparks', value: sparkStats?.totalSparks ?? 0, sub: `${sparkStats?.delivered ?? 0} delivered`, icon: <Flame className="h-4 w-4 text-orange-500" />, accent: 'from-orange-500/5 to-transparent' },
            { label: 'Pending', value: sparkStats?.pending ?? 0, sub: 'awaiting delivery', icon: <Eye className="h-4 w-4 text-sky-500" />, accent: 'from-sky-500/5 to-transparent' },
            { label: 'Hit Rate', value: sparkStats ? `${Math.round((sparkStats.hitRate || 0) * 100)}%` : '—', sub: `${sparkStats?.hits ?? 0} / ${sparkStats?.rated ?? 0} rated`, icon: <Target className="h-4 w-4 text-emerald-500" />, accent: 'from-emerald-500/5 to-transparent' },
            { label: 'Avg Score', value: sparkStats ? sparkStats.avgScore.toFixed(2) : '—', sub: 'threshold: 0.70', icon: <TrendingUp className="h-4 w-4 text-violet-500" />, accent: 'from-violet-500/5 to-transparent' },
            { label: 'Kill Gate', value: '6w / 10%', sub: sparkStats && sparkStats.rated > 0 ? `${Math.round((sparkStats.hitRate || 0) * 100)}% — ${sparkStats.hitRate >= 0.1 ? '✓ safe' : '⚠ risk'}` : 'insufficient data', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, accent: 'from-amber-500/5 to-transparent' },
          ].map((card, i) => (
            <motion.div key={i} variants={itemVariants}>
              <Card className="border-border/40 hover:shadow-md transition-shadow overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-0 hover:opacity-100 transition-opacity pointer-events-none`} />
                <CardContent className="p-4 relative">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-muted-foreground font-medium">{card.label}</p>
                    {card.icon}
                  </div>
                  <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                  <p className="text-[10px] mt-1 text-muted-foreground">{card.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Bandit Loop + Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bandit Weights */}
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center"><Link2 className="h-3.5 w-3.5 text-violet-500" /></div>
                <div><CardTitle className="text-sm">Bandit Loop</CardTitle><CardDescription className="text-[11px]">ε-greedy topic-pair weights</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats?.dreamer?.topPairs && stats.dreamer.topPairs.length > 0 ? stats.dreamer.topPairs.map((pair) => (
                <div key={pair.topicPair} className="p-2.5 rounded-lg bg-muted/20 border border-border/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px] font-medium">{pair.topicPair.split('|')[0]}</Badge>
                      <span className="text-[9px] text-muted-foreground">↔</span>
                      <Badge variant="outline" className="text-[9px] font-medium">{pair.topicPair.split('|')[1]}</Badge>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">{pair.trials} trials</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(100, (pair.hitRate || 0) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400">{Math.round((pair.hitRate || 0) * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="text-emerald-600 dark:text-emerald-400">✓ {pair.hits} hits</span>
                    <span className="text-red-500">✗ {pair.trials - pair.hits} misses</span>
                  </div>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground text-center py-4">No topic-pair data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Spark History */}
          <Card className="lg:col-span-2 border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center"><Flame className="h-3.5 w-3.5 text-orange-500" /></div>
                  <div><CardTitle className="text-sm">Spark History</CardTitle><CardDescription className="text-[11px]">Cross-topic associative insights</CardDescription></div>
                </div>
                <div className="flex items-center gap-1.5">
                  <select className="h-7 text-[11px] border border-border/40 rounded-lg bg-background px-2 font-medium" value={sparkFilter} onChange={(e) => onSparkFilterChange(e.target.value)}>
                    <option value="all">All topics</option>
                    <option value="mcos-engine">mcos-engine</option>
                    <option value="onebrainer">onebrainer</option>
                    <option value="personal">personal</option>
                  </select>
                  <select className="h-7 text-[11px] border border-border/40 rounded-lg bg-background px-2 font-medium" value={sparkKindFilter} onChange={(e) => onSparkKindFilterChange(e.target.value)}>
                    <option value="all">All kinds</option>
                    <option value="mechanism-transfer">mechanism-transfer</option>
                    <option value="analogy">analogy</option>
                    <option value="hidden-contradiction">hidden-contradiction</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <div className="divide-y divide-border/30">
                  {sparks.map(s => (
                    <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ring-1 ${
                            s.rating === 1 ? 'bg-emerald-500/10 ring-emerald-500/20' :
                            s.rating === 0 ? 'bg-red-500/10 ring-red-500/20' :
                            s.deliveredAt ? 'bg-sky-500/10 ring-sky-500/20' :
                            'bg-orange-500/10 ring-orange-500/20'
                          }`}>
                            {s.rating === 1 ? <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> :
                             s.rating === 0 ? <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> :
                             s.deliveredAt ? <Eye className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" /> :
                             <EyeOff className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(s.seedTopic)}`}>{s.seedTopic}</Badge>
                            <span className="text-[10px] text-muted-foreground">→</span>
                            <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(s.pairedTopic)}`}>{s.pairedTopic}</Badge>
                            <Badge variant="outline" className="text-[10px] font-medium bg-orange-500/5 border-orange-500/15 text-orange-700 dark:text-orange-400">{s.kind}</Badge>
                            <Badge variant="outline" className="text-[10px] font-bold">{s.score.toFixed(2)}</Badge>
                            <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(s.createdAt)}</span>
                          </div>
                          <p className="text-xs leading-relaxed font-medium">{s.insight}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {s.rating === null && (
                              <>
                                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-medium"
                                  onClick={() => onRateSpark(s.id, true)}>
                                  <ThumbsUp className="h-3 w-3" />Hit
                                </Button>
                                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/10 font-medium"
                                  onClick={() => onRateSpark(s.id, false)}>
                                  <ThumbsDown className="h-3 w-3" />Miss
                                </Button>
                              </>
                            )}
                            {s.rating !== null && (
                              <span className={`text-[10px] font-medium ${s.rating === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {s.rating === 1 ? '✓ Hit' : '✗ Miss'}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {s.deliveredAt ? `Delivered ${timeAgo(s.deliveredAt)}` : 'Pending delivery'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {sparks.length === 0 && <EmptyState icon={Sparkles} title="Még nem álmodtunk" description="A Dreamer cross-topic asszociációkat generál. Indítsd el a Run Dreamer gombbal." />}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}