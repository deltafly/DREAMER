// ===== CONFIDENCE INDICATOR =====
// Extracted from brain-tab.tsx — uses CSS animate-pulse, no framer-motion needed

export function ConfidenceIndicator({ confidence }: { confidence: string }) {
  const value = confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.6 : 0.3;
  const color =
    value >= 0.8
      ? 'bg-emerald-500'
      : value >= 0.5
        ? 'bg-amber-500'
        : 'bg-rose-500';
  const label =
    value >= 0.8 ? 'High' : value >= 0.5 ? 'Medium' : 'Low';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color === 'bg-emerald-500' ? '#10b981' : color === 'bg-amber-500' ? '#f59e0b' : '#ef4444' }} />
      <span className="text-[10px] text-muted-foreground">{label} ({Math.round(value * 100)}%)</span>
    </div>
  );
}