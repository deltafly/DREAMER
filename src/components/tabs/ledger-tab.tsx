'use client';

import { motion } from 'framer-motion';
import {
  Database, MessageSquare, Scale, Zap, FileText, Sparkles, ChevronDown, Inbox,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Stats, LedgerEntry, Preference } from './types';
import { timeAgo, topicColor, tryFormatJSON } from './helpers';
import { EmptyState } from '@/components/empty-state';

export interface LedgerTabProps {
  ledger: LedgerEntry[];
  preferences: Preference[];
  stats: Stats | null;
  expandedLedger: number | null;
  ledgerKindFilter: string;
  onSetExpandedLedger: (id: number | null) => void;
  onLedgerKindFilterChange: (v: string) => void;
}

export function LedgerTab({
  ledger,
  stats,
  expandedLedger,
  ledgerKindFilter,
  onSetExpandedLedger,
  onLedgerKindFilterChange,
}: LedgerTabProps) {
  const filteredLedger = ledgerKindFilter === 'all' ? ledger : ledger.filter(e => e.kind === ledgerKindFilter);

  return (
    <div className="space-y-4">
      <Card className="border-border/40 card-glow">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">L1 — Raw Ledger</CardTitle>
              <CardDescription className="text-[11px]">Append-only session digests · {ledger.length} most recent</CardDescription>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-medium"><Database className="h-3 w-3 mr-1" />{stats?.layers.l1.total} total</Badge>
              {stats && stats.layers.l1.unprocessed > 0 && <Badge variant="outline" className="text-[10px] font-medium border-sky-500/20 text-sky-600">{stats.layers.l1.unprocessed} pending</Badge>}
            </div>
          </div>
          {/* Kind filters */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {['all', 'digest', 'decision', 'event', 'note', 'seed'].map(k => (
              <Button key={k} variant={ledgerKindFilter === k ? 'default' : 'outline'} size="sm"
                className={`h-7 text-[11px] capitalize font-medium ${ledgerKindFilter === k ? '' : 'hover:bg-muted/50'}`}
                onClick={() => onLedgerKindFilterChange(k)}>{k}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <div className="divide-y divide-border/30">
              {filteredLedger.map(entry => (
                <motion.div key={entry.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/20 transition-colors">
                  <div className="p-4 cursor-pointer" onClick={() => onSetExpandedLedger(expandedLedger === entry.id ? null : entry.id)}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ring-1 ${
                          entry.kind === 'digest' ? 'bg-sky-500/10 ring-sky-500/20' :
                          entry.kind === 'decision' ? 'bg-violet-500/10 ring-violet-500/20' :
                          entry.kind === 'event' ? 'bg-orange-500/10 ring-orange-500/20' :
                          entry.kind === 'seed' ? 'bg-emerald-500/10 ring-emerald-500/20' :
                          'bg-zinc-500/10 ring-zinc-500/20'
                        }`}>
                          {entry.kind === 'digest' && <MessageSquare className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
                          {entry.kind === 'decision' && <Scale className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
                          {entry.kind === 'event' && <Zap className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />}
                          {entry.kind === 'note' && <FileText className="h-3.5 w-3.5 text-zinc-500" />}
                          {entry.kind === 'seed' && <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <Badge variant="outline" className={`text-[10px] font-medium ${topicColor(entry.topic)}`}>{entry.topic}</Badge>
                          <Badge variant="outline" className="text-[10px] font-medium capitalize">{entry.kind}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">{entry.agentId}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(entry.ts)}</span>
                          {!entry.processed && <Badge variant="outline" className="text-[9px] border-sky-500/20 text-sky-600 bg-sky-500/5 font-bold badge-animate">unprocessed</Badge>}
                          <motion.div animate={{ rotate: expandedLedger === entry.id ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                          </motion.div>
                        </div>
                        <p className={`text-[11px] text-foreground/80 leading-relaxed ${expandedLedger === entry.id ? '' : 'line-clamp-3'}`}>{entry.content}</p>
                        {expandedLedger === entry.id && entry.kind === 'digest' && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3">
                            <div className="rounded-lg bg-muted/30 border border-border/20 p-3">
                              <p className="text-[10px] font-bold text-muted-foreground mb-1.5">Structured Digest</p>
                              <pre className="text-[10px] text-foreground/70 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{tryFormatJSON(entry.content)}</pre>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              {filteredLedger.length === 0 && (
                <EmptyState icon={Inbox} title="Még nincs naplóbejegyzés" description="Próbálj meg egy másik szűrőt vagy írj új bejegyzést a Log Entry gombbal." />
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}