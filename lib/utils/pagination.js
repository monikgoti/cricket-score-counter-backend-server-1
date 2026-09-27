"use strict";
// Shared query-param pagination helpers used by any list endpoint (tournaments,
// match history, etc). Kept intentionally small/generic -- callers own how
// they fetch/sort/count, this just standardizes parsing the request and
// shaping the response's `pagination` block.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPaginationMeta = exports.parsePagination = void 0;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const parsePositiveInt = (value, fallback) => {
    const parsed = typeof value === "string"
        ? Number.parseInt(value, 10)
        : typeof value === "number"
            ? value
            : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};
// Reads `?page=` / `?limit=` off an Express `req.query`-shaped object.
// `limit` is clamped to [1, MAX_LIMIT] so a client can't force an
// unbounded/huge fetch; `page` defaults to 1 for anything invalid/missing.
const parsePagination = (query, defaults = {}) => {
    var _a, _b;
    const page = parsePositiveInt(query === null || query === void 0 ? void 0 : query.page, (_a = defaults.page) !== null && _a !== void 0 ? _a : DEFAULT_PAGE);
    const rawLimit = parsePositiveInt(query === null || query === void 0 ? void 0 : query.limit, (_b = defaults.limit) !== null && _b !== void 0 ? _b : DEFAULT_LIMIT);
    const limit = Math.min(rawLimit, MAX_LIMIT);
    return { page, limit, skip: (page - 1) * limit };
};
exports.parsePagination = parsePagination;
const buildPaginationMeta = (total, { page, limit }) => {
    const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
    return {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
    };
};
exports.buildPaginationMeta = buildPaginationMeta;
//# sourceMappingURL=pagination.js.map