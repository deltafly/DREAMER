'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { containerVariants, itemVariants } from './constants';
import { AskBrainSection } from './ask-brain-section';
import { KnowledgeGraphSection } from './knowledge-graph-section';
import { BrainInsightsSection } from './insights-section';
import { KnowledgeGapsSection } from './gaps-section';
import { NeuralStatsSection } from './neural-stats-section';
import { DreamAndScheduleSection } from './dream-schedule-section';

// Re-export types for convenience
export type {
  BrainQueryResult, NeuralResponse, GraphNode, GraphEdge, GraphCluster, BrainGraph, BrainInsight, KnowledgeGap, NeuralStats, LayoutNode,
} from './types';

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

export { BrainTab as default };