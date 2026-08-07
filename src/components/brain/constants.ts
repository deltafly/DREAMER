// ===== CONSTANTS =====
// Extracted from brain-tab.tsx — shared by all brain/ section components

export const TOPIC_COLORS: Record<string, string> = {
  'mcos-engine': '#f97316',
  'onebrainer': '#a855f7',
  'personal': '#14b8a6',
  'infrastructure': '#ef4444',
  'security': '#f59e0b',
  'design': '#ec4899',
  'performance': '#10b981',
  'integration': '#f97316',
  'deployment': '#8b5cf6',
};

export const TOPIC_BG: Record<string, string> = {
  'mcos-engine': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  'onebrainer': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  'personal': 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  'infrastructure': 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  'security': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'design': 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  'performance': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'integration': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  'deployment': 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
};

export const DEFAULT_TOPIC_COLOR = '#71717a';

export function getTopicColor(topic: string): string {
  return TOPIC_COLORS[topic] || DEFAULT_TOPIC_COLOR;
}

export function getTopicBadgeClass(topic: string): string {
  return TOPIC_BG[topic] || 'bg-muted text-muted-foreground border-border';
}

export const EDGE_STYLES: Record<string, { stroke: string; dasharray: string; markerEnd?: string }> = {
  supports: { stroke: '#10b981', dasharray: 'none' },
  contradicts: { stroke: '#ef4444', dasharray: '6 4' },
  extends: { stroke: '#f59e0b', dasharray: 'none' },
  related: { stroke: '#71717a', dasharray: '3 3' },
  causes: { stroke: '#f97316', dasharray: 'none', markerEnd: 'url(#arrowOrange)' },
  requires: { stroke: '#14b8a6', dasharray: 'none', markerEnd: 'url(#arrowTeal)' },
};

export const EXAMPLE_QUERIES = [
  'How do we handle webhooks?',
  'What decisions were made about the database?',
  'What do I know about rate limiting?',
];

export const SEVERITY_CONFIG = {
  critical: { icon: '🔴', color: 'text-rose-600 dark:text-rose-400', border: 'border-l-rose-500', bg: 'bg-rose-500/5' },
  warning: { icon: '⚠️', color: 'text-amber-600 dark:text-amber-400', border: 'border-l-amber-500', bg: 'bg-amber-500/5' },
  info: { icon: '💡', color: 'text-emerald-600 dark:text-emerald-400', border: 'border-l-emerald-500', bg: 'bg-emerald-500/5' },
} as const;

export const GAP_SEVERITY = {
  low: { color: 'border-l-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  medium: { color: 'border-l-amber-500', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  high: { color: 'border-l-rose-500', badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
} as const;

// ===== ANIMATION VARIANTS =====

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
} as const;

export const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;