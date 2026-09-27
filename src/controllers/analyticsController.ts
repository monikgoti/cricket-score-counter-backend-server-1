import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  ANALYTICS_EVENT_TYPES,
  AnalyticsEvent,
  type AnalyticsEventType,
} from "../models/AnalyticsEvent";
import { trackEvent } from "../utils/analytics";

const isAnalyticsEventType = (value: unknown): value is AnalyticsEventType =>
  typeof value === "string" &&
  (ANALYTICS_EVENT_TYPES as readonly string[]).includes(value);

// Public endpoint (mounted with optionalAuth): records a client-side event,
// today only PAGE_VIEW, but any known event type is accepted so the
// frontend can add more without a backend change.
export const trackClientEvent = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const type = req.body?.type;
    if (!isAnalyticsEventType(type)) {
      res.status(400).json({ message: "A valid event type is required" });
      return;
    }

    const sessionId =
      typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined;
    const path = typeof req.body?.path === "string" ? req.body.path : undefined;
    const metadata =
      req.body?.metadata && typeof req.body.metadata === "object"
        ? (req.body.metadata as Record<string, unknown>)
        : undefined;

    trackEvent(req, {
      type,
      userId: req.user?.id,
      sessionId,
      path,
      metadata,
    });

    res.status(204).send();
  } catch (error) {
    console.error("Track analytics event error", error);
    res.status(500).json({ message: "Unable to record event" });
  }
};

const parseDayCount = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(90, Math.max(1, Math.round(parsed)));
};

const getUtcDayString = (date: Date): string => date.toISOString().slice(0, 10);

const getLastNDayStrings = (days: number): string[] => {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    date.setUTCDate(date.getUTCDate() - i);
    result.push(getUtcDayString(date));
  }
  return result;
};

type DailyBucket = {
  day: string;
  activeUsers: number;
  newSignups: number;
  logins: number;
  tournamentsCreated: number;
  matchesStarted: number;
  matchesCompleted: number;
  pageViews: number;
  promoBannerViews: number;
  promoBannerClicks: number;
};

// GET /api/v1/analytics/daily?days=30 -- admin only.
export const getDailyStats = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const days = parseDayCount(req.query?.days, 30);
    const dayStrings = getLastNDayStrings(days);
    const fromDay = dayStrings[0];

    const [countsByDayAndType, activeVisitorRows] = await Promise.all([
      AnalyticsEvent.aggregate<{ _id: { day: string; type: string }; count: number }>([
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
      AnalyticsEvent.aggregate<{ _id: string; count: number }>([
        { $match: { day: { $gte: fromDay }, sessionId: { $nin: [null, ""] } } },
        { $group: { _id: { day: "$day", sessionId: "$sessionId" } } },
        { $group: { _id: "$_id.day", count: { $sum: 1 } } },
      ]),
    ]);

    const buckets = new Map<string, DailyBucket>();
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

    const typeToField: Partial<Record<AnalyticsEventType, keyof DailyBucket>> = {
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
      const field = typeToField[row._id.type as AnalyticsEventType];
      if (bucket && field) {
        (bucket[field] as number) += row.count;
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
  } catch (error) {
    console.error("Get daily analytics error", error);
    res.status(500).json({ message: "Unable to fetch analytics" });
  }
};

// GET /api/v1/analytics/summary -- admin only. Today / last 7 / last 30 day
// totals plus the most-viewed pages in the last 7 days.
export const getSummaryStats = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const today = getUtcDayString(new Date());
    const last7 = getLastNDayStrings(7)[0];
    const last30 = getLastNDayStrings(30)[0];

    const buildRangeTotals = async (fromDay: string) => {
      const rows = await AnalyticsEvent.aggregate<{
        _id: string;
        count: number;
      }>([
        { $match: { day: { $gte: fromDay } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]);
      const totals: Record<string, number> = {};
      rows.forEach((row) => {
        totals[row._id] = row.count;
      });

      // See the matching comment in getDailyStats -- dedupe by sessionId
      // only, so one visitor's auth-state changes during a visit don't
      // fragment into multiple "active users".
      const distinctVisitors = await AnalyticsEvent.aggregate<{ count: number }>([
        { $match: { day: { $gte: fromDay }, sessionId: { $nin: [null, ""] } } },
        { $group: { _id: "$sessionId" } },
        { $count: "count" },
      ]);

      return {
        activeUsers: distinctVisitors[0]?.count ?? 0,
        newSignups: totals.USER_SIGNUP ?? 0,
        logins: totals.USER_LOGIN ?? 0,
        tournamentsCreated: totals.TOURNAMENT_CREATED ?? 0,
        matchesStarted: totals.MATCH_STARTED ?? 0,
        matchesCompleted: totals.MATCH_COMPLETED ?? 0,
        pageViews: totals.PAGE_VIEW ?? 0,
        promoBannerViews: totals.PROMO_BANNER_VIEW ?? 0,
        promoBannerClicks: totals.PROMO_BANNER_CLICK ?? 0,
      };
    };

    const [todayTotals, last7Totals, last30Totals, topPages, topBanners] =
      await Promise.all([
        buildRangeTotals(today),
        buildRangeTotals(last7),
        buildRangeTotals(last30),
        AnalyticsEvent.aggregate<{ _id: string; count: number }>([
          { $match: { day: { $gte: last7 }, type: "PAGE_VIEW", path: { $ne: null } } },
          { $group: { _id: "$path", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        AnalyticsEvent.aggregate<{
          _id: string;
          title: string | null;
          count: number;
        }>([
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
  } catch (error) {
    console.error("Get analytics summary error", error);
    res.status(500).json({ message: "Unable to fetch analytics summary" });
  }
};
