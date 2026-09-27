"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSummaryStats = exports.getDailyStats = exports.trackClientEvent = void 0;
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const analytics_1 = require("../utils/analytics");
const isAnalyticsEventType = (value) => typeof value === "string" &&
    AnalyticsEvent_1.ANALYTICS_EVENT_TYPES.includes(value);
// Public endpoint (mounted with optionalAuth): records a client-side event,
// today only PAGE_VIEW, but any known event type is accepted so the
// frontend can add more without a backend change.
const trackClientEvent = async (req, res) => {
    var _a, _b, _c, _d, _e;
    try {
        const type = (_a = req.body) === null || _a === void 0 ? void 0 : _a.type;
        if (!isAnalyticsEventType(type)) {
            res.status(400).json({ message: "A valid event type is required" });
            return;
        }
        const sessionId = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.sessionId) === "string" ? req.body.sessionId : undefined;
        const path = typeof ((_c = req.body) === null || _c === void 0 ? void 0 : _c.path) === "string" ? req.body.path : undefined;
        const metadata = ((_d = req.body) === null || _d === void 0 ? void 0 : _d.metadata) && typeof req.body.metadata === "object"
            ? req.body.metadata
            : undefined;
        (0, analytics_1.trackEvent)(req, {
            type,
            userId: (_e = req.user) === null || _e === void 0 ? void 0 : _e.id,
            sessionId,
            path,
            metadata,
        });
        res.status(204).send();
    }
    catch (error) {
        console.error("Track analytics event error", error);
        res.status(500).json({ message: "Unable to record event" });
    }
};
exports.trackClientEvent = trackClientEvent;
const parseDayCount = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(90, Math.max(1, Math.round(parsed)));
};
const getUtcDayString = (date) => date.toISOString().slice(0, 10);
const getLastNDayStrings = (days) => {
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        date.setUTCDate(date.getUTCDate() - i);
        result.push(getUtcDayString(date));
    }
    return result;
};
// GET /api/v1/analytics/daily?days=30 -- admin only.
const getDailyStats = async (req, res) => {
    var _a;
    try {
        const days = parseDayCount((_a = req.query) === null || _a === void 0 ? void 0 : _a.days, 30);
        const dayStrings = getLastNDayStrings(days);
        const fromDay = dayStrings[0];
        const [countsByDayAndType, activeVisitorRows] = await Promise.all([
            AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { day: { $gte: fromDay } } },
                { $group: { _id: { day: "$day", type: "$type" }, count: { $sum: 1 } } },
            ]),
            // Dedupe by the browser's persistent sessionId only (not userId) --
            // one real visitor can sign up, log out, and log into a different
            // account within the same visit, and keying on whichever of
            // userId/sessionId happened to be set would count that single visit
            // as several different "active users". sessionId is attached to every
            // client-tracked PAGE_VIEW regardless of auth state, so it stays the
            // same person's stable identity all the way through.
            AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { day: { $gte: fromDay }, sessionId: { $nin: [null, ""] } } },
                { $group: { _id: { day: "$day", sessionId: "$sessionId" } } },
                { $group: { _id: "$_id.day", count: { $sum: 1 } } },
            ]),
        ]);
        const buckets = new Map();
        dayStrings.forEach((day) => {
            buckets.set(day, {
                day,
                activeUsers: 0,
                newSignups: 0,
                logins: 0,
                tournamentsCreated: 0,
                matchesStarted: 0,
                matchesCompleted: 0,
                pageViews: 0,
                promoBannerViews: 0,
                promoBannerClicks: 0,
            });
        });
        const typeToField = {
            USER_SIGNUP: "newSignups",
            USER_LOGIN: "logins",
            TOURNAMENT_CREATED: "tournamentsCreated",
            MATCH_STARTED: "matchesStarted",
            MATCH_COMPLETED: "matchesCompleted",
            PAGE_VIEW: "pageViews",
            PROMO_BANNER_VIEW: "promoBannerViews",
            PROMO_BANNER_CLICK: "promoBannerClicks",
        };
        countsByDayAndType.forEach((row) => {
            const bucket = buckets.get(row._id.day);
            const field = typeToField[row._id.type];
            if (bucket && field) {
                bucket[field] += row.count;
            }
        });
        activeVisitorRows.forEach((row) => {
            const bucket = buckets.get(row._id);
            if (bucket) {
                bucket.activeUsers = row.count;
            }
        });
        res.status(200).json({
            days: dayStrings.map((day) => buckets.get(day)),
        });
    }
    catch (error) {
        console.error("Get daily analytics error", error);
        res.status(500).json({ message: "Unable to fetch analytics" });
    }
};
exports.getDailyStats = getDailyStats;
// GET /api/v1/analytics/summary -- admin only. Today / last 7 / last 30 day
// totals plus the most-viewed pages in the last 7 days.
const getSummaryStats = async (req, res) => {
    try {
        const today = getUtcDayString(new Date());
        const last7 = getLastNDayStrings(7)[0];
        const last30 = getLastNDayStrings(30)[0];
        const buildRangeTotals = async (fromDay) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const rows = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { day: { $gte: fromDay } } },
                { $group: { _id: "$type", count: { $sum: 1 } } },
            ]);
            const totals = {};
            rows.forEach((row) => {
                totals[row._id] = row.count;
            });
            // See the matching comment in getDailyStats -- dedupe by sessionId
            // only, so one visitor's auth-state changes during a visit don't
            // fragment into multiple "active users".
            const distinctVisitors = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { day: { $gte: fromDay }, sessionId: { $nin: [null, ""] } } },
                { $group: { _id: "$sessionId" } },
                { $count: "count" },
            ]);
            return {
                activeUsers: (_b = (_a = distinctVisitors[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0,
                newSignups: (_c = totals.USER_SIGNUP) !== null && _c !== void 0 ? _c : 0,
                logins: (_d = totals.USER_LOGIN) !== null && _d !== void 0 ? _d : 0,
                tournamentsCreated: (_e = totals.TOURNAMENT_CREATED) !== null && _e !== void 0 ? _e : 0,
                matchesStarted: (_f = totals.MATCH_STARTED) !== null && _f !== void 0 ? _f : 0,
                matchesCompleted: (_g = totals.MATCH_COMPLETED) !== null && _g !== void 0 ? _g : 0,
                pageViews: (_h = totals.PAGE_VIEW) !== null && _h !== void 0 ? _h : 0,
                promoBannerViews: (_j = totals.PROMO_BANNER_VIEW) !== null && _j !== void 0 ? _j : 0,
                promoBannerClicks: (_k = totals.PROMO_BANNER_CLICK) !== null && _k !== void 0 ? _k : 0,
            };
        };
        const [todayTotals, last7Totals, last30Totals, topPages, topBanners] = await Promise.all([
            buildRangeTotals(today),
            buildRangeTotals(last7),
            buildRangeTotals(last30),
            AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { day: { $gte: last7 }, type: "PAGE_VIEW", path: { $ne: null } } },
                { $group: { _id: "$path", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
            AnalyticsEvent_1.AnalyticsEvent.aggregate([
                {
                    $match: {
                        day: { $gte: last7 },
                        type: "PROMO_BANNER_CLICK",
                        "metadata.bannerId": { $nin: [null, ""] },
                    },
                },
                {
                    $group: {
                        _id: "$metadata.bannerId",
                        title: { $first: "$metadata.title" },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
        ]);
        res.status(200).json({
            today: todayTotals,
            last7Days: last7Totals,
            last30Days: last30Totals,
            topPages: topPages.map((row) => ({ path: row._id, views: row.count })),
            topBanners: topBanners.map((row) => ({
                bannerId: row._id,
                title: row.title || row._id,
                clicks: row.count,
            })),
        });
    }
    catch (error) {
        console.error("Get analytics summary error", error);
        res.status(500).json({ message: "Unable to fetch analytics summary" });
    }
};
exports.getSummaryStats = getSummaryStats;
//# sourceMappingURL=analyticsController.js.map