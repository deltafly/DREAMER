'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, Scale, GitPullRequestArrow, PenLine, Inbox,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { Stats, Dispute, Decision } from './types';
import { timeAgo, topicColor } from './helpers';
import { EmptyState } from '@/components/empty-state';

export interface DisputesTabProps {
  disputes: Dispute[];
  stats: Stats | null;
  resolveDialogOpen: boolean;
  resolveTarget: Dispute | null;
  resolveRuling: string;
  resolveWinner: 'existing' | 'incoming';
  isResolving: boolean;
  reviewDialogOpen: boolean;
  reviewTarget: Decision | null;
  reviewOutcome: string;
  reviewLesson: string;
  isSubmittingReview: boolean;
  logDialogOpen: boolean;
  logTopic: string;
  logContent: string;
  logKind: string;
  isSubmittingLog: boolean;
  onOpenResolveDialog: (d: Dispute) => void;
  onResolveRulingChange: (v: string) => void;
  onResolveWinnerChange: (v: 'existing' | 'incoming') => void;
  onSetResolveDialogOpen: (v: boolean) => void;
  onResolve: () => void;
  onOpenReviewDialog: (d: Decision) => void;
  onReviewOutcomeChange: (v: string) => void;
  onReviewLessonChange: (v: string) => void;
  onSetReviewDialogOpen: (v: boolean) => void;
  onSubmitReview: () => void;
  onSetLogDialogOpen: (v: boolean) => void;
  onLogTopicChange: (v: string) => void;
  onLogContentChange: (v: string) => void;
  onLogKindChange: (v: string) => void;
  onSubmitLog: () => void;
}

export function DisputesTab({
  disputes,
  resolveDialogOpen,
  resolveTarget,
  resolveRuling,
  resolveWinner,
  isResolving,
  reviewDialogOpen,
  reviewTarget,
  reviewOutcome,
  reviewLesson,
  isSubmittingReview,
  logDialogOpen,
  logTopic,
  logContent,
  logKind,
  isSubmittingLog,
  onOpenResolveDialog,
  onResolveRulingChange,
  onResolveWinnerChange,
  onSetResolveDialogOpen,
  onResolve,
  onOpenReviewDialog,
  onReviewOutcomeChange,
  onReviewLessonChange,
  onSetReviewDialogOpen,
  onSubmitReview,
  onSetLogDialogOpen,
  onLogTopicChange,
  onLogContentChange,
  onLogKindChange,
  onSubmitLog,
}: DisputesTabProps) {
  const openDisputes = disputes.filter(d => d.status === 'open');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border/40 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
            <CardContent className="p-4 space-y-4">
              <h3 className="text-xs font-bold">Inbox Summary</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3.5 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{openDisputes.length}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Open</p>
                </div>
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3.5 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{disputes.filter(d => d.status === 'resolved').length}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Resolved</p>
                </div>
              </div>
              {disputes.length > 0 && (
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(disputes.filter(d => d.status === 'resolved').length / disputes.length) * 100}%` }} />
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4">
              <h3 className="text-xs font-bold mb-3">Detection Methods</h3>
              <div className="space-y-2">
                {['key-collision', 'librarian-semantic'].map(method => {
                  const count = disputes.filter(d => d.detectedBy === method).length;
                  return (
                    <div key={method} className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-muted/20">
                      <span className="text-muted-foreground font-medium">{method}</span>
                      <Badge variant="outline" className="text-[10px] font-bold">{count}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-2 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">All Disputes</CardTitle>
            <CardDescription className="text-[11px]">Workflow objects, not errors — resolve with explicit ruling</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="divide-y divide-border/30">
                {disputes.map(d => (
                  <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={`p-4 transition-colors ${d.status === 'open' ? 'hover:bg-amber-500/[0.03]' : 'hover:bg-muted/20'}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {d.status === 'open' ? (
                          <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(d.topic)}`}>{d.topic}</Badge>
                          <Badge variant="outline" className="text-[10px] font-medium">{d.detectedBy}</Badge>
                          <Badge variant="outline" className={`text-[10px] font-medium ${d.status === 'open' ? 'border-amber-500/20 text-amber-600 bg-amber-500/5' : 'border-emerald-500/20 text-emerald-600 bg-emerald-500/5'}`}>{d.status}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(d.createdAt)}</span>
                        </div>
                        <div className="rounded-lg border border-red-500/10 bg-red-500/[0.03] p-2.5 mb-2">
                          <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-0.5">Existing ({d.existingRef})</p>
                          <p className="text-[11px] text-foreground/70 line-clamp-3 leading-relaxed">{d.existingRef}</p>
                        </div>
                        <div className="rounded-lg border border-sky-500/10 bg-sky-500/[0.03] p-2.5 mb-2">
                          <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mb-0.5">Incoming</p>
                          <p className="text-[11px] text-foreground/70 line-clamp-3 leading-relaxed">{d.incoming}</p>
                        </div>
                        {d.ruling && (
                          <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] p-2.5 mb-2">
                            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">Ruling</p>
                            <p className="text-[11px] text-foreground/70 leading-relaxed">{d.ruling}</p>
                          </div>
                        )}
                        {d.status === 'open' && (
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-medium"
                            onClick={() => onOpenResolveDialog(d)}><Scale className="h-3 w-3 mr-1" />Resolve Dispute</Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {disputes.length === 0 && <EmptyState icon={Inbox} title="Nincs nyitott vita" description="A tudásréteg tiszta — nincsenek ütközések." />}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      <Dialog open={resolveDialogOpen} onOpenChange={onSetResolveDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-sm font-bold">Resolve Dispute #{resolveTarget?.id}</DialogTitle>
            <DialogDescription className="text-[11px]">Topic: {resolveTarget?.topic} · Detected: {resolveTarget?.detectedBy}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-border/30 p-3 bg-muted/20"><p className="text-[10px] text-muted-foreground font-bold mb-1">Existing ({resolveTarget?.existingRef})</p><p className="text-xs text-foreground/80">{resolveTarget?.existingRef}</p></div>
            <div className="rounded-lg border border-border/30 p-3 bg-muted/20"><p className="text-[10px] text-muted-foreground font-bold mb-1">Incoming</p><p className="text-xs text-foreground/80">{resolveTarget?.incoming}</p></div>
            <Separator />
            <div><label className="text-xs font-bold mb-2 block">Winner</label>
              <div className="flex gap-2">
                <Button variant={resolveWinner === 'existing' ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs font-medium" onClick={() => onResolveWinnerChange('existing')}>Existing</Button>
                <Button variant={resolveWinner === 'incoming' ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs font-medium" onClick={() => onResolveWinnerChange('incoming')}>Incoming</Button>
              </div>
            </div>
            <div><label className="text-xs font-bold mb-1.5 block">Ruling (min 10 chars)</label>
              <Textarea className="text-xs min-h-[80px]" placeholder="Explain the reasoning…" value={resolveRuling} onChange={(e) => onResolveRulingChange(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onSetResolveDialogOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={resolveRuling.length < 10 || isResolving} onClick={onResolve}>
              {isResolving ? <div className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1.5" /> : <Scale className="h-3.5 w-3.5 mr-1.5" />}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={onSetReviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Review Decision</DialogTitle>
            <DialogDescription className="text-[11px]">Close the calibration loop — what actually happened?</DialogDescription>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border/30 p-3 bg-muted/20">
                <p className="text-[10px] text-muted-foreground font-bold mb-1">Decision</p>
                <p className="text-xs font-medium">{reviewTarget.decision}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{reviewTarget.rationale}</p>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Outcome <span className="text-red-500">*</span></label>
                <Textarea className="text-xs min-h-[72px]" placeholder="What actually happened? Was the decision successful?" value={reviewOutcome} onChange={(e) => onReviewOutcomeChange(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Lesson <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Textarea className="text-xs min-h-[48px]" placeholder="What would you do differently?" value={reviewLesson} onChange={(e) => onReviewLessonChange(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onSetReviewDialogOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!reviewOutcome.trim() || isSubmittingReview} onClick={onSubmitReview}>
              {isSubmittingReview && <div className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1.5" />}
              <GitPullRequestArrow className="h-3.5 w-3.5 mr-1.5" />Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Entry Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={onSetLogDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Log New Entry</DialogTitle>
            <DialogDescription className="text-[11px]">Write to L1 Ledger — the Librarian will process it on the next run.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Topic <span className="text-red-500">*</span></label>
                <select className="h-9 w-full text-xs border border-border/40 rounded-lg bg-background px-2.5 font-medium" value={logTopic} onChange={(e) => onLogTopicChange(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="mcos-engine">mcos-engine</option>
                  <option value="onebrainer">onebrainer</option>
                  <option value="personal">personal</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Kind</label>
                <select className="h-9 w-full text-xs border border-border/40 rounded-lg bg-background px-2.5 font-medium" value={logKind} onChange={(e) => onLogKindChange(e.target.value)}>
                  <option value="digest">digest</option>
                  <option value="decision">decision</option>
                  <option value="event">event</option>
                  <option value="note">note</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">Content <span className="text-red-500">*</span></label>
              <Textarea className="text-xs min-h-[120px]" placeholder="Describe what happened, what was decided, or what you observed…" value={logContent} onChange={(e) => onLogContentChange(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">{logContent.length} chars</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onSetLogDialogOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!logTopic.trim() || !logContent.trim() || isSubmittingLog} onClick={onSubmitLog}>
              {isSubmittingLog && <div className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1.5" />}
              <PenLine className="h-3.5 w-3.5 mr-1.5" />Log Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}