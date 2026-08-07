'use client';

import { motion } from 'framer-motion';
import { Database, Scale, Clock, CheckCircle2, XCircle, Archive, GitPullRequestArrow } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { Fact, Decision, Stats } from './types';
import { timeAgo, topicColor, confidenceColor, statusColor } from './helpers';

interface KnowledgeTabProps {
  facts: Fact[];
  decisions: Decision[];
  factTopic: string;
  decisionStatus: string;
  stats: Stats | null;
  onFactTopicChange: (topic: string) => void;
  onDecisionStatusChange: (status: string) => void;
  onOpenReviewDialog: (decision: Decision) => void;
}

export function KnowledgeTab({ facts, decisions, factTopic, decisionStatus, stats, onFactTopicChange, onDecisionStatusChange, onOpenReviewDialog }: KnowledgeTabProps) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="facts" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="bg-muted/40 border border-border/40 p-0.5 h-8 rounded-lg">
            <TabsTrigger value="facts" className="text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md font-medium"><Database className="h-3 w-3" />Facts</TabsTrigger>
            <TabsTrigger value="decisions" className="text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md font-medium"><Scale className="h-3 w-3" />Decisions</TabsTrigger>
          </TabsList>
          <select className="h-8 text-xs border border-border/40 rounded-lg bg-background px-2.5 font-medium" value={factTopic} onChange={(e) => onFactTopicChange(e.target.value)}>
            <option value="all">All topics</option>
            {stats?.layers.l2.facts.byTopic.map(t => <option key={t.topic} value={t.topic}>{t.topic}</option>)}
          </select>
        </div>
        <TabsContent value="facts">
          <Card className="border-border/40"><CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="divide-y divide-border/30">
                {facts.map(f => (
                  <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {f.stale ? (
                          <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20" title="Stale"><Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /></div>
                        ) : (
                          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20" title="Live"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(f.topic)}`}>{f.topic}</Badge>
                          <Badge variant="outline" className={`text-[10px] font-medium ${confidenceColor(f.confidence)}`}>{f.confidence}</Badge>
                          {f.stale && <Badge variant="outline" className="text-[10px] font-medium border-amber-500/20 text-amber-600 bg-amber-500/5">stale</Badge>}
                          {f.reviewAt && <span className="text-[10px] text-muted-foreground ml-auto font-mono">review: {timeAgo(f.reviewAt)}</span>}
                        </div>
                        <p className="text-xs leading-relaxed font-medium">{f.statement}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground font-mono">
                          <span className="bg-muted/30 px-1.5 py-0.5 rounded">{f.entity}</span>
                          <span>/</span>
                          <span className="bg-muted/30 px-1.5 py-0.5 rounded">{f.attribute}</span>
                          {f.source && <span className="text-muted-foreground/50">src: {f.source}</span>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {facts.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">No facts found</div>}
              </div>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="decisions">
          <div className="flex items-center gap-1.5 mb-3">
            {['all', 'active', 'completed', 'failed', 'superseded'].map(s => (
              <Button key={s} variant={decisionStatus === s ? 'default' : 'outline'} size="sm"
                className={`h-7 text-[11px] capitalize font-medium ${decisionStatus === s ? '' : 'hover:bg-muted/50'}`}
                onClick={() => onDecisionStatusChange(s)}>{s}</Button>
            ))}
          </div>
          <Card className="border-border/40"><CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="divide-y divide-border/30">
                {decisions.map(d => (
                  <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ring-1 ${statusColor(d.status)}`}>
                          {d.status === 'active' && <Scale className="h-3.5 w-3.5" />}
                          {d.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {d.status === 'failed' && <XCircle className="h-3.5 w-3.5" />}
                          {d.status === 'superseded' && <Archive className="h-3.5 w-3.5" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(d.topic)}`}>{d.topic}</Badge>
                          <Badge variant="outline" className={`text-[10px] font-medium ${statusColor(d.status)}`}>{d.status}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(d.decidedAt)}</span>
                        </div>
                        <p className="text-xs font-bold">{d.decision}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed"><span className="font-medium">Rationale:</span> {d.rationale}</p>
                        {d.outcome && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/20 space-y-1">
                            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Outcome</p>
                            <p className="text-[11px] text-foreground/80 leading-relaxed">{d.outcome}</p>
                            {d.lesson && <p className="text-[11px] text-amber-700 dark:text-amber-500 italic">Lesson: {d.lesson}</p>}
                          </div>
                        )}
                        {d.reviewAt && d.status === 'active' && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <p className="text-[10px] text-muted-foreground font-mono">Review due: {timeAgo(d.reviewAt)}</p>
                            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 font-medium"
                              onClick={() => onOpenReviewDialog(d)}>
                              <GitPullRequestArrow className="h-3 w-3" />Review
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {decisions.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">No decisions found</div>}
              </div>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}