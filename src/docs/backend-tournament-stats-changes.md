# Backend Changes: Tournament Team Stats

Apply these changes in `cricket-score-counter-backend-server`. The frontend now
expects tournament calculations to be backend-owned and persisted in the
database after a tournament match is completed.

## 1. Tournament mode

Add a persisted `squadMode` field to the tournament model and request validation.
Use `teams_only` as the default.

```ts
type TournamentSquadMode = "teams_only" | "with_players";

squadMode: {
  type: String,
  enum: ["teams_only", "with_players"],
  default: "teams_only",
},
```

Include `squadMode` in tournament create/update payloads and in
`serializeTournament`:

```ts
squadMode: tournament.squadMode ?? "teams_only",
```

For `teams_only` tournaments, team creation should accept an empty or omitted
`players` array. For `with_players` tournaments, keep the player validations.

## 2. Team statistics model

Keep team stats on `TournamentTeam.statistics`; these values are what the
frontend renders for points table and team cards.

Add cumulative legal-ball counters so NRR remains accurate across multiple
matches:

```ts
ballsFaced: number;
ballsBowled: number;
```

Add defaults in the statistics schema:

```ts
ballsFaced: { type: Number, default: 0, min: 0 },
ballsBowled: { type: Number, default: 0, min: 0 },
```

Also include these fields in `defaultStatistics`, `normalizeStatistics`, and
the team serializer:

```ts
ballsFaced: team.statistics.ballsFaced ?? 0,
ballsBowled: team.statistics.ballsBowled ?? 0,
```

No player run/wicket aggregates are required for tournaments.

## 3. Complete match calculation

In `completeTournamentMatch`, keep storing `snapshot` on the match, but calculate
and persist team statistics on the backend before responding.

Add helpers near the existing statistics helpers:

```ts
const getEventTotalRuns = (event: any) =>
  event?.extra_type === "no-ball-extra"
    ? Number(event.value ?? 0) + 1
    : Number(event?.value ?? 0);

const isLegalDelivery = (event: any) =>
  event?.type !== "wide" && event?.extra_type !== "no-ball-extra";

const summarizeSnapshotInning = (snapshot: any, teamName: string) => {
  const overs = snapshot?.recentEventsByTeams?.[teamName] ?? {};
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;

  Object.values(overs).forEach((events: any) => {
    if (!Array.isArray(events)) return;
    events.forEach((event) => {
      runs += getEventTotalRuns(event);
      if (event?.type === "wicket") wickets += 1;
      if (isLegalDelivery(event)) legalBalls += 1;
    });
  });

  return { runs, wickets, legalBalls };
};

const getNetRunRate = (
  runsFor: number,
  ballsFaced: number,
  runsAgainst: number,
  ballsBowled: number,
) => {
  const battingRate = ballsFaced > 0 ? runsFor / (ballsFaced / 6) : 0;
  const bowlingRate = ballsBowled > 0 ? runsAgainst / (ballsBowled / 6) : 0;
  return Number((battingRate - bowlingRate).toFixed(3));
};
```

Replace the existing match-completion team stat increment block with
snapshot-derived updates:

```ts
const snapshot = req.body?.snapshot;
const team1 = teamById.get(team1Id);
const team2 = teamById.get(team2Id);

if (!team1 || !team2) {
  res.status(400).json({ message: "Match teams were not found" });
  return;
}

const team1Inning = summarizeSnapshotInning(snapshot, team1.name);
const team2Inning = summarizeSnapshotInning(snapshot, team2.name);
const isTie = !winnerTeamId || winnerTeamName === "Tied";

team1.statistics.matchesPlayed += 1;
team2.statistics.matchesPlayed += 1;

if (isTie) {
  team1.statistics.ties += 1;
  team2.statistics.ties += 1;
  team1.statistics.points += 1;
  team2.statistics.points += 1;
} else if (winnerTeamId === team1Id) {
  team1.statistics.wins += 1;
  team1.statistics.points += 2;
  team2.statistics.losses += 1;
} else {
  team2.statistics.wins += 1;
  team2.statistics.points += 2;
  team1.statistics.losses += 1;
}

team1.statistics.runsFor += team1Inning.runs;
team1.statistics.runsAgainst += team2Inning.runs;
team1.statistics.wicketsLost += team1Inning.wickets;
team1.statistics.wicketsTaken += team2Inning.wickets;
team1.statistics.ballsFaced += team1Inning.legalBalls;
team1.statistics.ballsBowled += team2Inning.legalBalls;
team1.statistics.netRunRate = getNetRunRate(
  team1.statistics.runsFor,
  team1.statistics.ballsFaced,
  team1.statistics.runsAgainst,
  team1.statistics.ballsBowled,
);

team2.statistics.runsFor += team2Inning.runs;
team2.statistics.runsAgainst += team1Inning.runs;
team2.statistics.wicketsLost += team2Inning.wickets;
team2.statistics.wicketsTaken += team1Inning.wickets;
team2.statistics.ballsFaced += team2Inning.legalBalls;
team2.statistics.ballsBowled += team1Inning.legalBalls;
team2.statistics.netRunRate = getNetRunRate(
  team2.statistics.runsFor,
  team2.statistics.ballsFaced,
  team2.statistics.runsAgainst,
  team2.statistics.ballsBowled,
);

await Promise.all([match.save(), team1.save(), team2.save()]);
```

Remove the older `TournamentTeam.updateOne(...)` match-completion stat update to
avoid double counting.

## 4. API response contract

The frontend reads these fields:

```ts
tournament.squadMode;
team.statistics.matchesPlayed;
team.statistics.wins;
team.statistics.losses;
team.statistics.ties;
team.statistics.points;
team.statistics.runsFor;
team.statistics.runsAgainst;
team.statistics.wicketsTaken;
team.statistics.wicketsLost;
team.statistics.ballsFaced;
team.statistics.ballsBowled;
team.statistics.netRunRate;
```

Legacy compact `team.stats` can remain, but it should be derived from
`team.statistics` so old clients keep working.
