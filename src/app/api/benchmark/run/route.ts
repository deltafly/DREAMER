import { getWorkspaceId, requireAuth, verifyWorkspaceAccess } from '@/lib/auth-helpers';
import { runBenchmark, type BenchmarkQuestion } from '@/lib/benchmark';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withHandler } from '@/lib/api-handler';
import { ValidationError } from '@/lib/errors';
import { ForbiddenError } from '@/lib/errors';

const QuestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['single_session', 'multi_session', 'temporal']),
  question: z.string().min(1),
  expectedAnswer: z.string().min(1),
  evidenceSessions: z.array(z.object({
    topic: z.string().min(1),
    content: z.string().min(1),
    ts: z.string().min(1),
    kind: z.string().optional(),
  })).min(1),
});

const BenchmarkRunSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(200),
  queryLimit: z.number().int().min(1).max(50).optional(),
});

/**
 * POST /api/benchmark/run
 *
 * Runs a benchmark: ingests evidence → librarian → brain/query → LLM judge.
 * Requires owner or admin role.
 *
 * This is an expensive endpoint (LLM calls for librarian + judge per question).
 * Rate limited to 1 run per 5 minutes.
 */
const lastRunByWorkspace = new Map<number, number>();
const RUN_COOLDOWN_MS = 5 * 60 * 1000;

export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const userId = await requireAuth();
  const role = await verifyWorkspaceAccess(userId, workspaceId);

  if (role === 'member') {
    throw new ForbiddenError('Csak owner vagy admin indíthatja a benchmark-ot');
  }

  // Cooldown check
  const lastRun = lastRunByWorkspace.get(workspaceId) ?? 0;
  if (Date.now() - lastRun < RUN_COOLDOWN_MS) {
    const remainingSec = Math.ceil((RUN_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
    throw new ValidationError('Benchmark cooldown active', [
      { message: `Várj még ${remainingSec} másodpercet a következő futás előtt`, path: [] },
    ]);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = BenchmarkRunSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid benchmark input', parsed.error.issues);
  }

  const { questions, queryLimit } = parsed.data;

  // Mark cooldown
  lastRunByWorkspace.set(workspaceId, Date.now());

  // Run benchmark
  const report = await runBenchmark(workspaceId, questions as BenchmarkQuestion[], {
    queryLimit,
  });

  return NextResponse.json(report);
});