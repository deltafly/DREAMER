/**
 * Shared pagination helper for API routes.
 * Parses limit/offset from URL search params with safe defaults.
 */

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawLimit = parseInt(searchParams.get('limit') || '', 10);
  const rawOffset = parseInt(searchParams.get('offset') || '', 10);

  return {
    limit: Number.isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(Math.max(rawLimit, 1), MAX_LIMIT),
    offset: Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0),
  };
}

/**
 * Standard paginated response shape.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}