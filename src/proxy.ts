import { NextRequest, NextResponse } from 'next/server';

/**
 * Security proxy — adds defense-in-depth headers to all responses.
 *
 * This does NOT do auth enforcement. Each API route handles its own auth
 * via requireAuth() / getWorkspaceId(). A global auth gate with a
 * PUBLIC_ROUTES whitelist was considered and rejected: whitelists are
 * fragile (they caused the contest auth bugs), and route-level auth is
 * already consistently applied across all 49 routes.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // === Content Security Policy ===
  // Strict CSP: only allow same-origin scripts and styles
  // 'unsafe-inline' for styles is needed by Tailwind/shadcn runtime
  // 'unsafe-eval' is needed by Next.js development mode
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-eval needed by Next.js dev
    "style-src 'self' 'unsafe-inline'",                 // Tailwind/shadcn
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // Prevent MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking — only allow same-origin framing
  response.headers.set('X-Frame-Options', 'DENY');

  // Strict Transport Security — 1 year, include subdomains, preload-eligible
  if (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // Referrer Policy — send origin only on cross-origin
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy — restrict browser features we don't use
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), speaker-selection=(), payment=()',
  );

  // X-DNS-Prefetch-Control
  response.headers.set('X-DNS-Prefetch-Control', 'on');

  return response;
}

// Run on all routes except _next/static, _next/image, favicon, etc.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};