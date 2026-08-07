'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Zap, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';
import type { BrainQueryResult, NeuralResponse } from './types';
import { EXAMPLE_QUERIES, getTopicBadgeClass, containerVariants, itemVariants } from './constants';
import { RelevanceBar } from './relevance-bar';
import { ConfidenceIndicator } from './confidence-indicator';

export function AskBrainSection({ searchQuery, onQueryDone }: { searchQuery: string; onQueryDone?: () => void }) {
  const wsId = useWorkspaceId();
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
      const res = await fetch(wsUrl('/api/brain/query', wsId), {
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
  }, [query, onQueryDone, wsId]);

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