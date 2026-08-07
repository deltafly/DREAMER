import { SEED_QUESTIONS } from '@/lib/benchmark-seed';
import { NextResponse } from 'next/server';

/**
 * GET /api/benchmark/seed
 *
 * Returns the 10 built-in seed questions for benchmark testing.
 * These are synthetic LongMemEval-style questions across 3 types.
 * POST the returned array to /api/benchmark/run to execute.
 */
export async function GET() {
  return NextResponse.json({
    count: SEED_QUESTIONS.length,
    types: {
      single_session: SEED_QUESTIONS.filter(q => q.type === 'single_session').length,
      multi_session: SEED_QUESTIONS.filter(q => q.type === 'multi_session').length,
      temporal: SEED_QUESTIONS.filter(q => q.type === 'temporal').length,
    },
    questions: SEED_QUESTIONS,
  });
}