'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, Copy, Download, Lightbulb, Shield, Database, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

import type { BriefListItem, DeltaBrief, Stats, Dispute, Decision } from './types';
import { timeAgo, topicColor } from './helpers';

interface BriefsTabProps {
  briefs: BriefListItem[];
  selectedBrief: DeltaBrief | null;
  stats: Stats | null;
  onSelectBrief: (topic: string) => void;
  refreshAll: () => void;
}

const exportBrief = (topic: string, content: string) => {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `brief-${topic}-${new Date().toISOString().slice(0,10)}.md`;
  a.click(); URL.revokeObjectURL(url);
  toast.success('Brief exported', { description: `${topic} brief downloaded as markdown.` });
};

export function BriefsTab({ briefs, selectedBrief, stats, onSelectBrief, refreshAll }: BriefsTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Topics</CardTitle>
            <CardDescription className="text-[11px]">Delta-brief: curated + raw tail</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {briefs.map(b => (
                <button key={b.topic} onClick={() => onSelectBrief(b.topic)}
                  className={`w-full text-left p-2.5 rounded-lg transition-all duration-200 flex items-center justify-between gap-2 group ${
                    selectedBrief?.topic === b.topic
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                      : 'hover:bg-muted/50 hover:shadow-sm'
                  }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 transition-colors ${selectedBrief?.topic === b.topic ? 'bg-primary-foreground' : b.dirty ? 'bg-orange-500' : 'bg-emerald-500'}`} />
                    <span className="text-xs font-semibold truncate">{b.topic}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {b.dirty && <Badge variant="outline" className={`text-[8px] px-1 h-3.5 font-bold ${selectedBrief?.topic === b.topic ? 'border-primary-foreground/30 text-primary-foreground' : 'border-orange-500/20 text-orange-600'}`}>dirty</Badge>}
                    <span className={`text-[10px] ${selectedBrief?.topic === b.topic ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{timeAgo(b.builtAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Delta Brief Viewer */}
        <Card className="lg:col-span-3 border-border/40">
          {selectedBrief ? (<>
            <CardHeader className="pb-2 border-b border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">Delta-Brief: {selectedBrief.topic}</CardTitle>
                    <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(selectedBrief.topic)}`}>L3</Badge>
                    {selectedBrief.dirty && <Badge variant="outline" className="text-[10px] font-medium border-orange-500/20 text-orange-600">needs rebuild</Badge>}
                  </div>
                  <CardDescription className="text-[11px] mt-1">Built {timeAgo(selectedBrief.builtAt)} · {selectedBrief.farok?.length ?? 0} unprocessed in tail</CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={() => { navigator.clipboard.writeText(selectedBrief.kuralt ?? ''); toast.success('Kurált trunk copied'); }}>
                    <Copy className="h-3 w-3" />Copy
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={() => exportBrief(selectedBrief.topic, selectedBrief.kuralt ?? '')}>
                    <Download className="h-3 w-3" />Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4 p-1">
                  {/* SZIKRA */}
                  {selectedBrief.szikra && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                      <div className="rounded-xl border border-orange-500/25 bg-gradient-to-r from-orange-500/5 via-amber-500/5 to-orange-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-6 w-6 rounded-lg bg-orange-500/15 flex items-center justify-center">
                            <Lightbulb className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-orange-700 dark:text-orange-400">SZIKRA</p>
                            <p className="text-[9px] text-muted-foreground">Dreamer insight · score {selectedBrief.szikra.score.toFixed(2)} · {selectedBrief.szikra.kind}</p>
                          </div>
                          <Badge variant="outline" className="ml-auto text-[9px] font-medium bg-orange-500/5 border-orange-500/20 text-orange-600">{selectedBrief.szikra.kind}</Badge>
                        </div>
                        <p className="text-xs leading-relaxed text-foreground/90">{selectedBrief.szikra.insight}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                          <span>{timeAgo(selectedBrief.szikra.createdAt)}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ESEDÉKES */}
                  {(selectedBrief.esedekes?.openDisputes?.length > 0 || selectedBrief.esedekes?.upcomingReviews?.length > 0) && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg bg-amber-500/15 flex items-center justify-center">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">ESEDÉKES — Pending Items</p>
                        </div>
                        {selectedBrief.esedekes.openDisputes.map((d: Dispute) => (
                          <div key={d.id} className="ml-2 pl-3 border-l-2 border-amber-500/30">
                            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Dispute #{d.id} ({d.detectedBy})</p>
                            <p className="text-[11px] text-foreground/80 line-clamp-2 mt-0.5">{d.incoming}</p>
                          </div>
                        ))}
                        {selectedBrief.esedekes.upcomingReviews.map((d: Decision) => (
                          <div key={d.id} className="ml-2 pl-3 border-l-2 border-violet-500/30">
                            <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">Review: {d.decision.slice(0, 60)}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Due: {d.reviewAt ? timeAgo(d.reviewAt) : '—'}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* KURÁLT */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">KURÁLT — Curated Trunk (Librarian-approved)</p>
                    </div>
                    <div className="rounded-xl border border-border/30 bg-muted/10 p-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:my-2
                        prose-p:text-xs prose-li:text-xs prose-strong:text-xs prose-code:text-[11px]
                        prose-h1:text-base prose-h2:text-sm prose-h3:text-[13px]
                        prose-headings:font-bold prose-a:text-violet-600 dark:prose-a:text-violet-400
                        [&_blockquote]:border-l-2 [&_blockquote]:border-violet-500/30 [&_blockquote]:pl-3 [&_blockquote]:italic
                        [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                        <ReactMarkdown>{selectedBrief.kuralt}</ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>

                  {/* FAROK */}
                  {(selectedBrief.farok?.length ?? 0) > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-6 w-6 rounded-lg bg-sky-500/15 flex items-center justify-center">
                          <Database className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                        </div>
                        <p className="text-[11px] font-bold text-sky-700 dark:text-sky-400">FAROK — Raw Tail (unprocessed, not yet curated)</p>
                        <Badge variant="outline" className="text-[9px] font-medium border-sky-500/20 text-sky-600 bg-sky-500/5">{selectedBrief.farok?.length ?? 0} entries</Badge>
                      </div>
                      <div className="rounded-xl border border-dashed border-sky-500/20 bg-sky-500/[0.02] divide-y divide-sky-500/10">
                        {(selectedBrief.farok ?? []).map((entry) => (
                          <div key={entry.id} className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[9px] font-medium capitalize">{entry.kind}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{entry.agentId}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(entry.ts)}</span>
                            </div>
                            <p className="text-[11px] text-foreground/70 leading-relaxed line-clamp-4">{entry.content}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {(selectedBrief.farok?.length ?? 0) === 0 && !selectedBrief.szikra && (!selectedBrief.esedekes?.openDisputes || selectedBrief.esedekes.openDisputes.length === 0) && (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Fully up to date — no pending items, no raw tail</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </>) : (
            <CardContent className="flex items-center justify-center h-64">
              <p className="text-sm text-muted-foreground">Select a topic to view its delta-brief</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}