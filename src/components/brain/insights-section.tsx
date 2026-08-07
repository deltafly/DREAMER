'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Sparkles, Target, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';
import type { BrainInsight } from './types';
import { SEVERITY_CONFIG, getTopicBadgeClass, containerVariants, itemVariants } from './constants';

export function BrainInsightsSection() {
  const wsId = useWorkspaceId();
  const [insights, setInsights] = useState<BrainInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchInsights() {
      try {
        // POST to trigger generation (idempotent — deduplicates by title+kind)
        const res = await fetch(wsUrl('/api/brain/insights', wsId), { method: 'POST' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) setInsights(data.insights || []);
      } catch {
        // Fallback to GET (read-only) if POST fails
        try {
          const res = await fetch(wsUrl('/api/brain/insights', wsId));
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
  }, [wsId]);

  const handleDismiss = useCallback(async (id: number) => {
    try {
      const res = await fetch(wsUrl('/api/brain/insights', wsId), {
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
  }, [wsId]);

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