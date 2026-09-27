import type { Request } from "express";
import { Types } from "mongoose";
import { AnalyticsEvent, type AnalyticsEventType } from "../models/AnalyticsEvent";

export type TrackEventInput = {
  type: AnalyticsEventType;
  userId?: string | Types.ObjectId;
  sessionId?: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

const getUtcDayString = (date: Date): string => date.toISOString().slice(0, 10);

// Matches "localhost", "127.0.0.1", "::1", optionally with a port -- used to
// keep local development/testing traffic out of the real analytics.
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i;

const extractHost = (value: string): string => {
  if (value.includes("://")) {
    try {
      return new URL(value).host;
    } catch {
      return value;
    }
  }
  return value;
};

// Checks the caller's Origin/Referer (the frontend's own address, when
// running on localhost) and the Host header (when the API itself is hit
// directly on localhost, e.g. via curl during local testing).
export const isLocalRequest = (req: Request): boolean => {
  const candidates = [req.headers.origin, req.headers.referer, req.headers.host];
  return candidates.some(
    (value) =>
      typeof value === "string" && LOCAL_HOST_PATTERN.test(extractHost(value)),
  );
};

// Fire-and-forget: analytics must never break the request it's attached to,
// so failures are logged and swallowed rather than surfaced to the caller.
// Local/dev traffic (see isLocalRequest) is dropped entirely so it never
// shows up in the real daily numbers.
export const trackEvent = (req: Request, input: TrackEventInput): void => {
  if (isLocalRequest(req)) {
    return;
  }

  const { type, userId, sessionId, path, metadata } = input;

  AnalyticsEvent.create({
    type,
    day: getUtcDayString(new Date()),
    userId:
      userId && Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : undefined,
    sessionId,
    path,
    metadata,
  }).catch((error) => {
    console.error(`Failed to record analytics event "${type}"`, error);
  });
};
