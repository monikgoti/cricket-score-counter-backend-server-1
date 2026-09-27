"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackEvent = exports.isLocalRequest = void 0;
const mongoose_1 = require("mongoose");
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const getUtcDayString = (date) => date.toISOString().slice(0, 10);
// Matches "localhost", "127.0.0.1", "::1", optionally with a port -- used to
// keep local development/testing traffic out of the real analytics.
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i;
const extractHost = (value) => {
    if (value.includes("://")) {
        try {
            return new URL(value).host;
        }
        catch (_a) {
            return value;
        }
    }
    return value;
};
// Checks the caller's Origin/Referer (the frontend's own address, when
// running on localhost) and the Host header (when the API itself is hit
// directly on localhost, e.g. via curl during local testing).
const isLocalRequest = (req) => {
    const candidates = [req.headers.origin, req.headers.referer, req.headers.host];
    return candidates.some((value) => typeof value === "string" && LOCAL_HOST_PATTERN.test(extractHost(value)));
};
exports.isLocalRequest = isLocalRequest;
// Fire-and-forget: analytics must never break the request it's attached to,
// so failures are logged and swallowed rather than surfaced to the caller.
// Local/dev traffic (see isLocalRequest) is dropped entirely so it never
// shows up in the real daily numbers.
const trackEvent = (req, input) => {
    if ((0, exports.isLocalRequest)(req)) {
        return;
    }
    const { type, userId, sessionId, path, metadata } = input;
    AnalyticsEvent_1.AnalyticsEvent.create({
        type,
        day: getUtcDayString(new Date()),
        userId: userId && mongoose_1.Types.ObjectId.isValid(userId)
            ? new mongoose_1.Types.ObjectId(userId)
            : undefined,
        sessionId,
        path,
        metadata,
    }).catch((error) => {
        console.error(`Failed to record analytics event "${type}"`, error);
    });
};
exports.trackEvent = trackEvent;
//# sourceMappingURL=analytics.js.map