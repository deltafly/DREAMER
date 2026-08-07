import { getWorkspaceId } from '@/lib/auth-helpers';
import { executeBrainQuery } from '@/lib/brain-query';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';

// Bounds must match BrainQueryInput in src/lib/brain-query.ts. If they drift, an
// out-of-range value passes this schema and then throws inside the engine, which
// surfaces as a 500 instead of a 400.
const brainQuerySchema = z.object({
  query: z.string().min(2).max(5000),
  limit: z.number().int().min(1).max(50).optional(),
  iterations: z.number().int().min(1).max(5).optional(),
  activationThreshold: z.number().min(0).max(1).optional(),
});

export const POST = withHandler(async (request: NextRequest) => {
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 20 });

  const workspaceId = await getWorkspaceId(request);
  const body = await request.json().catch(() => ({}));
  const parsed = brainQuerySchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const { query, limit, iterations, activationThreshold } = parsed.data;
  const result = await executeBrainQuery(workspaceId, query, {
    limit,
    iterations,
    activationThreshold,
  });
  return NextResponse.json(result);
});