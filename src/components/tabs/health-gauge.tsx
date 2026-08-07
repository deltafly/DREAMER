'use client';

import React from 'react';

export function HealthGauge({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'oklch(0.7 0.17 160)' : score >= 50 ? 'oklch(0.8 0.16 85)' : 'oklch(0.65 0.2 25)';
  const label = score >= 80 ? 'Healthy' : score >= 50 ? 'Warning' : 'Critical';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="oklch(0.9 0 0)" strokeWidth="5" className="dark:stroke-oklch(0.3 0 0)" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="health-gauge-circle" style={{ '--target-offset': offset } as React.CSSProperties} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black tracking-tight">{score}</span>
        <span className="text-[8px] text-muted-foreground font-medium">{label}</span>
      </div>
    </div>
  );
}