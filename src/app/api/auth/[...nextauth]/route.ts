import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { extractClientIp, rateLimit } from '@/lib/rate-limiter';
import { audit, extractRequestMeta } from '@/lib/audit';

const handler = NextAuth(authOptions);

// IP-based login brute-force protection: 10 attempts per 15 minutes per IP
// Applied at the route level so we have access to the Request object.
// This is IP-keyed (not email-keyed) to prevent account-lockout DoS —
// an attacker cannot lock out a victim who uses a different IP.
const LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, maxRequests: 10 };

export async function POST(request: NextRequest) {
  // Rate limit ALL POST requests to the auth endpoint (signin, callback, etc.)
  const ip = extractClientIp(request);
  const loginResult = rateLimit(`auth:${ip}`, LOGIN_LIMIT);
  if (!loginResult.allowed) {
    // Return 429 before NextAuth even processes the request
    return NextResponse.json(
      { error: 'Too many authentication attempts. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(loginResult.retryAfterMs / 1000)) },
      },
    );
  }

  // Pass through to NextAuth and audit successful sign-in
  const response = await handler(request);

  // Audit successful login (status 200 on POST means sign-in succeeded)
  if (request.method === 'POST' && response.status === 200) {
    const meta = extractRequestMeta(request);
    // Fire-and-forget — don't block the response
    audit({ action: 'user.login.success', resource: 'session', ...meta }).catch(() => {});
  }

  return response;
}

export async function GET(request: NextRequest) {
  return handler(request);
}