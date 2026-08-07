'use client';

import { Shield, Activity, Sparkles, Bot } from 'lucide-react';
import type { Variants } from 'framer-motion';

export const timeAgo = (dateStr: string) => {
  if (!dateStr) return '—';
  const now = new Date();
  const then = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(then.getTime())) return '—';
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
};

export const formatDuration = (start: string, end?: string) => {
  const s = new Date(start.replace(' ', 'T'));
  const e = end ? new Date(end.replace(' ', 'T')) : new Date();
  const diffSec = Math.floor((e.getTime() - s.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  return `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
};

export const confidenceColor = (c: string) => {
  switch (c) {
    case 'high': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'medium': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    case 'low': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    default: return '';
  }
};

export const statusColor = (s: string) => {
  switch (s) {
    case 'active': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'completed': return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
    case 'failed': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'superseded': return 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20';
    default: return '';
  }
};

export const topicColors: Record<string, string> = {
  'mcos-engine': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  'onebrainer': 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  'personal': 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  'system': 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
};
export const topicColor = (t: string) => topicColors[t] || 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';

export const topicDotColor: Record<string, string> = {
  'mcos-engine': 'bg-orange-500',
  'onebrainer': 'bg-violet-500',
  'personal': 'bg-teal-500',
};

export const tryFormatJSON = (content: string): string => {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch { return content; }
};

export const roleIcon = (role: string) => {
  switch (role) {
    case 'owner': return <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case 'orchestrator': return <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
    case 'librarian': return <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />;
    default: return <Bot className="h-4 w-4 text-zinc-500" />;
  }
};

export const roleBg = (role: string) => {
  switch (role) {
    case 'owner': return 'bg-amber-500/5 border-amber-500/20';
    case 'orchestrator': return 'bg-sky-500/5 border-sky-500/20';
    case 'librarian': return 'bg-violet-500/5 border-violet-500/20';
    default: return 'bg-zinc-500/5 border-zinc-500/20';
  }
};

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

// ===== CHART COLORS =====
export const chartColors = {
  facts: '#f97316',
  decisions: '#8b5cf6',
  disputes: '#eab308',
  briefs: '#22c55e',
  stale: '#ef4444',
};