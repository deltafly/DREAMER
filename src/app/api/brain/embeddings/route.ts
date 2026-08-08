import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { withTaskLock } from '@/lib/task-lock';
import { ConflictError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';
import { z } from 'zod';
import { describeEmbeddings, embeddingsEnabled } from '@/lib/embeddings';
import { embeddingCoverage, syncFactEmbeddings } from '@/lib/fact-vectors';

/**
 * FACT EMBEDDINGS — semantic seed coverage
 *
 * The Librarian keeps vectors current as it extracts, so this endpoint exists
 * for the two cases it does not cover: a knowledge base that predates the
 * semantic path being switched on, and a change of embedding model, which
 * invalidates every stored vector at once.
 *
 * Entirely optional. With EMBEDDING_MODEL unset there is nothing to do and the
 * brain seeds queries by keyword, as it always has.
 */

const backfillSchema = z.object({
  /** Facts to embed in this call. Repeat until `pending` reaches zero. */
  limit: z.number().int().min(1).max(500).optional(),
});

export const GET = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);
  const coverage = await embeddingCoverage(workspaceId);

  return NextResponse.json({
    enabled: embeddingsEnabled(),
    provider: describeEmbeddings(),
    facts: coverage.facts,
    embedded: coverage.embedded,
    pending: Math.max(coverage.facts - coverage.embedded, 0),
    seeding: embeddingsEnabled() ? 'hybrid' : 'keyword',
  });
});

export const POST = withHandler(async (request: NextRequest) => {
  // Each call is a batch of embedding requests to a third-party endpoint, so it
  // is rate limited more tightly than an ordinary write.
  checkRateLimit(request, { windowMs: 60_000, maxRequests: 10 });

  const workspaceId = await getWorkspaceId(request);
  const body = await request.json().catch(() => ({}));
  const parsed = backfillSchema.safeParse(body);
  const limit = parsed.success ? parsed.data.limit : undefined;

  if (!embeddingsEnabled()) {
    return NextResponse.json({
      enabled: false,
      provider: describeEmbeddings(),
      embedded: 0,
      upToDate: 0,
      pending: 0,
      model: null,
      message:
        'Embeddings are not configured. Set EMBEDDING_MODEL (and EMBEDDING_BASE_URL for a ' +
        'non-OpenAI host, such as http://localhost:11434/v1 for Ollama). Queries continue ' +
        'to seed by keyword until then.',
    });
  }

  // Sharing the librarian lock keeps a backfill from racing the Librarian's own
  // sync over the same rows.
  const result = await withTaskLock(workspaceId, 'librarian', () =>
    syncFactEmbeddings(workspaceId, { limit }),
  );
  // withTaskLock returns the lock-refusal sentinel instead of running fn.
  if ('success' in result) {
    throw new ConflictError('The Librarian is already running — try again once it finishes');
  }

  return NextResponse.json({
    enabled: true,
    provider: describeEmbeddings(),
    embedded: result.embedded,
    upToDate: result.upToDate,
    pending: result.pending,
    model: result.model,
    message: result.error ?? null,
  });
});
