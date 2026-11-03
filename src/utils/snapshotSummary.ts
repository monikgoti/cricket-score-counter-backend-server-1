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
] as const;

const SUMMARY_EVENT_KEYS = ["type", "value", "extra_type"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const wantsSummaryView = (query: unknown): boolean =>
  isPlainObject(query) && query.view === "summary";

const pickKeys = (
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
};

const summarizeEventsByTeam = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [team, overs] of Object.entries(value)) {
    if (!isPlainObject(overs)) continue;
    const summarizedOvers: Record<string, unknown> = {};
    for (const [over, events] of Object.entries(overs)) {
      summarizedOvers[over] = Array.isArray(events)
        ? events.map((event) =>
            isPlainObject(event) ? pickKeys(event, SUMMARY_EVENT_KEYS) : event,
          )
        : events;
    }
    result[team] = summarizedOvers;
  }
  return result;
};

export const toSummarySnapshot = (snapshot: unknown): unknown => {
  if (!isPlainObject(snapshot)) return snapshot ?? null;
  return {
    ...pickKeys(snapshot, SUMMARY_SNAPSHOT_KEYS),
    recentEventsByTeams: summarizeEventsByTeam(snapshot.recentEventsByTeams),
  };
};
