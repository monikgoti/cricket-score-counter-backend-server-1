"use strict";
// List endpoints (match history, tournaments) used to send every match's
// full scorer snapshot -- every ball event with every field, both teams'
// player scorecards, rosters, super overs, etc. -- even though the list UIs
// only show a one-line score per team. That was the single largest chunk of
// outbound bandwidth on the REST side.
//
// Clients that only need the list view can ask for `?view=summary`, and get
// a trimmed snapshot that still has everything the list screens read:
//   - teams / winningTeam / matchLengthMode / score fields
//   - recentEventsByTeams, with each ball reduced to the three fields the
//     score summary is computed from (type, value, extra_type)
// The full snapshot is still served by GET /matches/:id (which the scorecard
// and "resume" screens use), and callers that don't pass `view=summary`
// (older app versions) get exactly the same response as before.
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSummarySnapshot = exports.wantsSummaryView = void 0;
const SUMMARY_SNAPSHOT_KEYS = [
    "gameId",
    "teams",
    "winningTeam",
    "matchLengthMode",
    "targetScore",
    "targetOvers",
    "totalBalls",
    "score",
    "wickets",
    "currentOver",
    "currentBallOfOver",
];
const SUMMARY_EVENT_KEYS = ["type", "value", "extra_type"];
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const wantsSummaryView = (query) => isPlainObject(query) && query.view === "summary";
exports.wantsSummaryView = wantsSummaryView;
const pickKeys = (source, keys) => {
    const result = {};
    for (const key of keys) {
        if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
};
const summarizeEventsByTeam = (value) => {
    if (!isPlainObject(value))
        return {};
    const result = {};
    for (const [team, overs] of Object.entries(value)) {
        if (!isPlainObject(overs))
            continue;
        const summarizedOvers = {};
        for (const [over, events] of Object.entries(overs)) {
            summarizedOvers[over] = Array.isArray(events)
                ? events.map((event) => isPlainObject(event) ? pickKeys(event, SUMMARY_EVENT_KEYS) : event)
                : events;
        }
        result[team] = summarizedOvers;
    }
    return result;
};
const toSummarySnapshot = (snapshot) => {
    if (!isPlainObject(snapshot))
        return snapshot !== null && snapshot !== void 0 ? snapshot : null;
    return Object.assign(Object.assign({}, pickKeys(snapshot, SUMMARY_SNAPSHOT_KEYS)), { recentEventsByTeams: summarizeEventsByTeam(snapshot.recentEventsByTeams) });
};
exports.toSummarySnapshot = toSummarySnapshot;
//# sourceMappingURL=snapshotSummary.js.map