// Shared query-param pagination helpers used by any list endpoint (tournaments,
// match history, etc). Kept intentionally small/generic -- callers own how
// they fetch/sort/count, this just standardizes parsing the request and
// shaping the response's `pagination` block.

export type PaginationParams = {
  page: number;
  limit: number;
  skip: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const parsed =
    typeof value === "string"
      ? Number.parseInt(value, 10)
      : typeof value === "number"
      ? value
      : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

// Reads `?page=` / `?limit=` off an Express `req.query`-shaped object.
// `limit` is clamped to [1, MAX_LIMIT] so a client can't force an
// unbounded/huge fetch; `page` defaults to 1 for anything invalid/missing.
export const parsePagination = (
  query: Record<string, unknown> | undefined,
  defaults: { page?: number; limit?: number } = {},
): PaginationParams => {
  const page = parsePositiveInt(query?.page, defaults.page ?? DEFAULT_PAGE);
  const rawLimit = parsePositiveInt(
    query?.limit,
    defaults.limit ?? DEFAULT_LIMIT,
  );
  const limit = Math.min(rawLimit, MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

export const buildPaginationMeta = (
  total: number,
  { page, limit }: PaginationParams,
): PaginationMeta => {
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
};
