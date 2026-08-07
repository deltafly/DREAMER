/**
 * API route handler wrapper.
 * Provides consistent error handling, structured responses,
 * and request lifecycle logging for all API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// Maximum request body size: 1MB (protects against oversized payloads)
const MAX_BODY_SIZE_BYTES = 1 * 1024 * 1024;

type HandlerFunction<T = unknown> = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse<T>>;

interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function successResponse<T>(data: T, status: number, requestId: string): NextResponse {
  const body: ApiResponse<T> = {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
  return NextResponse.json(body, { status });
}

function errorResponse(error: unknown, requestId: string): NextResponse {
  if (isAppError(error)) {
    logger.warn(error.message, {
      code: error.code,
      statusCode: error.statusCode,
      requestId,
      details: error.details,
    });

    const body: ApiResponse = {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      meta: { timestamp: new Date().toISOString(), requestId },
    };
    return NextResponse.json(body, { status: error.statusCode });
  }

  // Unhandled error — log full stack, return generic message
  const message = error instanceof Error ? error.message : 'Unknown error';
  logger.error('Unhandled API error', {
    message,
    requestId,
    stack: error instanceof Error ? error.stack : undefined,
  });

  const body: ApiResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    meta: { timestamp: new Date().toISOString(), requestId },
  };
  return NextResponse.json(body, { status: 500 });
}

/**
 * Wraps an API route handler with error handling, logging, and request ID tracking.
 *
 * Usage:
 *   export const GET = withHandler(async (req) => {
 *     const data = await db.fact.findMany(...);
 *     return NextResponse.json(data);
 *   });
 */
export function withHandler<T = unknown>(
  handler: HandlerFunction<T>,
): HandlerFunction<T> {
  return (async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const requestId = generateRequestId();
    const { method, url } = request;
    const path = new URL(url).pathname;

    const startMs = Date.now();

    try {
      // P1: Request body size check for POST/PUT/PATCH
      if (method !== 'GET' && method !== 'DELETE' && method !== 'HEAD') {
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE_BYTES) {
          throw new ValidationError(
            `Request body too large. Maximum size is ${MAX_BODY_SIZE_BYTES / 1024}KB.`
          );
        }
      }

      const result = await handler(request, context);

      // If the handler already returned a NextResponse, wrap it
      // But only if it's not already wrapped (check for our meta field)
      if (result.status >= 400) {
        // Already an error response from handler — pass through but log
        logger.warn(`${method} ${path} → ${result.status}`, { requestId, duration: Date.now() - startMs });
        return result;
      }

      const duration = Date.now() - startMs;
      if (duration > 1000) {
        logger.warn(`Slow request: ${method} ${path} took ${duration}ms`, { requestId });
      } else {
        logger.info(`${method} ${path} → ${result.status}`, { requestId, duration });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startMs;
      logger.error(`${method} ${path} → ERROR`, { requestId, duration, err: error instanceof Error ? error.message : String(error) });
      return errorResponse(error, requestId);
    }
  }) as HandlerFunction<T>;
}