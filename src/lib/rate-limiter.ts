// src/lib/rate-limiter.ts
// In-memory sliding window rate limiter
// Map<key, { timestamps: number[] }>
//
// Counters live in this process, which is only correct while there is exactly
// one. Behind two instances each keeps its own tally, so the effective limit is
// the configured one multiplied by the instance count — and a restart clears it
// entirely. That is a real ceiling on how this can be deployed, not a detail:
// the app stores its data in a single SQLite file and cannot be scaled out
// anyway. See "Single instance only" in docs/DEPLOYMENT.md.
//
// A shared store (Redis, or a table) is what lifts that ceiling, and it should
// arrive together with the move off SQLite rather than before it.

import { RateLimitError } from '@/lib/errors';

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number;  // time window (default 60000 = 1 min)
  maxRequests: number;  // max requests in window (default 30)
}

/**
 * Extract a trustworthy client IP from the request.
 *
 * Priority:
 *  1. x-real-ip        — set by the reverse proxy (Caddy), not spoofable by client
 *  2. x-forwarded-for  — rightmost entry (last proxy that appended), not the leftmost
 *  3. 'unknown'        — fallback when nothing is available
 */
export function extractClientIp(request: Request): string {
  // x-real-ip is set by the proxy itself — most trustworthy
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // x-forwarded-for: "client, proxy1, proxy2" — rightmost is the last proxy
  // In a single-proxy setup (Caddy), the rightmost entry is the real client IP
  // added by Caddy, not spoofable.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const entries = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    if (entries.length > 0) {
      return entries[entries.length - 1];
    }
  }

  return 'unknown';
}

/**
 * Check AND increment the rate limit counter.
 * Use for standard request limiting.
 */
export function rateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; retryAfterMs: number } {
  const windowMs = config.windowMs ?? 60_000;
  const maxRequests = config.maxRequests ?? 30;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Sliding window: remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

// Convenience function to use in API routes
export function checkRateLimit(
  request: Request,
  config?: Partial<RateLimitConfig>
): void {
  // Use IP + path as key
  const ip = extractClientIp(request);
  const path = new URL(request.url).pathname;
  const key = `${ip}:${path}`;

  const result = rateLimit(key, config);
  if (!result.allowed) {
    throw new RateLimitError(`Rate limited. Retry after ${Math.ceil(result.retryAfterMs / 1000)}s`);
  }
}