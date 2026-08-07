/**
 * CORS utility for API routes.
 *
 * Adds permissive same-origin CORS headers to API responses.
 * The browser same-origin policy already protects most routes,
 * but explicit CORS headers ensure correct behavior for:
 * - Server-side rendered pages making API calls
 * - Future mobile/desktop clients
 *
 * Usage in API routes:
 *   import { withCors } from '@/lib/cors';
 *   export const GET = withCors(handler);
 *
 * Or apply manually:
 *   const response = NextResponse.json(data);
 *   return withCorsHeaders(response, request);
 */

import { NextRequest, NextResponse } from 'next/server';

const API_ALLOWED_ORIGINS = process.env.API_ALLOWED_ORIGINS
  ? process.env.API_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : process.env.NODE_ENV === 'production'
    ? [] // Production: must be explicitly configured
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

function getAllowedOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin') || '';
  if (API_ALLOWED_ORIGINS.includes('*')) return '*';
  if (API_ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow same-origin requests (no Origin header or matching)
  return '';
}

/**
 * Add CORS headers to an existing response.
 */
export function withCorsHeaders(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const allowed = getAllowedOrigin(request);
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', allowed);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Id, X-Real-IP');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24h preflight cache
  return response;
}

/**
 * Handle OPTIONS preflight request.
 * Call this in an exported OPTIONS handler.
 */
export function handlePreflight(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return withCorsHeaders(response, request);
}