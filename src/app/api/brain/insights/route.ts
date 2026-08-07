import { getWorkspaceId } from '@/lib/auth-helpers';
import { getInsights, generateInsights, dismissInsight } from '@/lib/brain-insights';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError, NotFoundError } from '@/lib/errors';

const dismissInsightSchema = z.object({
  id: z.number().int().positive(),
  dismissed: z.boolean(),
});

/**
 * GET /api/brain/insights — Read-only. Returns existing insights.
 */
export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const data = await getInsights(workspaceId);
  return NextResponse.json(data);
});

/**
 * POST /api/brain/insights — Triggers insight generation (side-effect).
 * Analyzes the knowledge base and creates new insight records.
 */
export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const data = await generateInsights(workspaceId);
  return NextResponse.json(data, { status: 201 });
});

/**
 * PATCH /api/brain/insights — Dismiss or undismiss an insight.
 */
export const PATCH = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const body = await request.json();
  const parsed = dismissInsightSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
  }

  const { id, dismissed } = parsed.data;

  try {
    const updated = await dismissInsight(workspaceId, id, dismissed);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Insight not found') {
      throw new NotFoundError('Insight not found');
    }
    throw e;
  }
});