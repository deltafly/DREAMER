'use client';

// ===== RELEVANCE BAR =====
// Extracted from brain-tab.tsx — uses framer-motion for animated bar width

import { motion } from 'framer-motion';

export function RelevanceBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.min(Math.round((score / maxScore) * 100), 100) : 0;
  const barColor =
    pct >= 75
      ? 'bg-emerald-500'
      : pct >= 50
        ? 'bg-amber-500'
        : 'bg-rose-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}