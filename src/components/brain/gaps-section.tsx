'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Eye, RefreshCw, TrendingUp, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';
import type { KnowledgeGap } from './types';
import { GAP_SEVERITY, getTopicBadgeClass, containerVariants, itemVariants } from './constants';

export function KnowledgeGapsSection() {
  const wsId = useWorkspaceId();
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch(wsUrl('/api/brain/gaps', wsId));
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setGaps(data.gaps || []);
    } catch {
      toast.error('Failed to load knowledge gaps');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  }, [wsId]);
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