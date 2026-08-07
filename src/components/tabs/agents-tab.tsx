'use client';

import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AgentInfo, TimelineItem } from './types';
import { roleIcon, roleBg, timeAgo } from './helpers';
import { EmptyState } from '@/components/empty-state';

export interface AgentsTabProps {
  agents: AgentInfo[];
  timeline: TimelineItem[];
}

export function AgentsTab({ agents }: AgentsTabProps) {
  if (agents.length === 0) {
    return <EmptyState icon={Users} title="Még nincs regisztrált agent" description="Az agentek a ledger-bejegyzések alapján automatikusan regisztrálódnak." />;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(a => (
          <motion.div key={a.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
            <Card className={`border-border/40 overflow-hidden hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300 ${roleBg(a.role)}`}>
              <div className="h-1 bg-gradient-to-r from-violet-500 to-orange-500 opacity-40" />
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ring-1 ${roleBg(a.role)}`}>
                    {roleIcon(a.role)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{a.id}</p>
                    <Badge variant="outline" className="text-[10px] font-medium mt-0.5 capitalize">{a.role}</Badge>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/20 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Ledger entries</span>
                    <span className="font-bold">{a.ledgerEntries}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Last activity</span>
                    <span className="font-medium text-muted-foreground">{a.lastActivity ? timeAgo(a.lastActivity) : 'Never'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}