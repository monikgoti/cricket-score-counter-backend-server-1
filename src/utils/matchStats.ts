// Pure, dependency-free cricket statistics engine.
//
// Turns the ball-by-ball event log stored in every match snapshot into rich
// innings breakdowns (batting/bowling/fielding lines, partnerships, fall of
// wickets, over-by-over runs) and aggregates a player's performances into
// career-style figures.
//
// THIS FILE IS MIRRORED VERBATIM in the backend at
// cricket-score-counter-backend-server/src/utils/matchStats.ts — keep the two
// copies identical so the app and the API always agree on every number.
// The scoring rules match utils/scorecard.ts (legal deliveries, batter runs,
// bowler runs conceded).

export interface StatEvent {
  type: string;
  extra_type?: string;
  value: number;
  striker?: string;
  nonStriker?: string;
  bowler?: string;
  outBatsman?: string;
  wicketType?: string;
  dismissalBy?: string;
}

export type OversMap = { [over: string]: StatEvent[] | undefined };

export interface BattingLine {
  name: string;
  position: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  out: boolean;
  wicketType?: string;
  bowler?: string;
  fielder?: string;
}

export interface BowlingLine {
  name: string;
  balls: number;
  runs: number;
  wickets: number;
  dots: number;
  maidens: number;
  wides: number;
  noBalls: number;
}

export interface FieldingLine {
  name: string;
  catches: number;
  runOuts: number;
}

export interface Partnership {
  number: number;
  batter1: string;
  batter2: string;
  runs: number;
  balls: number;
  batter1Runs: number;
  batter1Balls: number;
  batter2Runs: number;
  batter2Balls: number;
  extras: number;
  unbroken: boolean;
}

export interface FallOfWicket {
  wicket: number;
  score: number;
  overs: string;
  batter: string;
}

export interface OverSummary {
  over: number;
  runs: number;
  wickets: number;
  cumulativeRuns: number;
}

export interface InningsStats {
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  ballsPerOver: number;
  extras: number;
  batting: BattingLine[];
  bowling: BowlingLine[];
  fielding: FieldingLine[];
  partnerships: Partnership[];
  fallOfWickets: FallOfWicket[];
  overs: OverSummary[];
}

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeName = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const isLegalBall = (e: StatEvent) =>
  e.type !== "wide" &&
  e.type !== "no-ball" &&
  e.type !== "no-ball-extra" &&
  e.type !== "penalty" &&
  e.extra_type !== "no-ball-extra";

export const eventTotalRuns = (e: StatEvent) =>
  e.extra_type === "no-ball-extra" ? num(e.value) + 1 : num(e.value);

export const batterRunsOf = (e: StatEvent) =>
  e.type === "run" || (e.type === "wicket" && num(e.value) > 0) ? num(e.value) : 0;

export const bowlerRunsOf = (e: StatEvent) =>
  e.type === "bye" || e.type === "leg-bye" || e.type === "penalty"
    ? 0
    : eventTotalRuns(e);

const isBowlerWicket = (e: StatEvent) =>
  e.type === "wicket" &&
  e.extra_type !== "no-ball-extra" &&
  e.wicketType !== "run-out";

export const formatOvers = (legalBalls: number, ballsPerOver = 6) =>
  `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;

const sortedOverEntries = (overs: OversMap) =>
  Object.keys(overs || {})
    .map((key) => ({ key, index: Number(key) }))
    .sort((a, b) => a.index - b.index)
    .map(({ key }) => (Array.isArray(overs[key]) ? (overs[key] as StatEvent[]) : []));

/** Builds a full innings breakdown from one team's batting event log. */
export const computeInnings = (
  overs: OversMap,
  battingTeam: string,
  bowlingTeam: string,
  ballsPerOver = 6,
): InningsStats => {
  const batting = new Map<string, BattingLine>();
  const bowling = new Map<string, BowlingLine>();
  const fielding = new Map<string, FieldingLine>();
  const partnerships: Partnership[] = [];
  const fallOfWickets: FallOfWicket[] = [];
  const overSummaries: OverSummary[] = [];

  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let batterRunsTotal = 0;
  let current: Partnership | null = null;

  const batter = (name: string) => {
    let line = batting.get(name);
    if (!line) {
      line = { name, position: batting.size + 1, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: false };
      batting.set(name, line);
    }
    return line;
  };
  const bowler = (name: string) => {
    let line = bowling.get(name);
    if (!line) {
      line = { name, balls: 0, runs: 0, wickets: 0, dots: 0, maidens: 0, wides: 0, noBalls: 0 };
      bowling.set(name, line);
    }
    return line;
  };
  const fielder = (name: string) => {
    let line = fielding.get(name);
    if (!line) {
      line = { name, catches: 0, runOuts: 0 };
      fielding.set(name, line);
    }
    return line;
  };
  const closePartnership = (unbroken: boolean) => {
    if (current) {
      current.unbroken = unbroken;
      partnerships.push(current);
      current = null;
    }
  };

  sortedOverEntries(overs).forEach((events, overIndex) => {
    let overRuns = 0;
    let overWickets = 0;
    const perBowlerInOver = new Map<string, { legal: number; conceded: number }>();

    events.forEach((e) => {
      if (!e || typeof e !== "object") return;
      const total = eventTotalRuns(e);
      const bRuns = batterRunsOf(e);
      const legal = isLegalBall(e);
      runs += total;
      overRuns += total;
      batterRunsTotal += bRuns;
      if (legal) legalBalls += 1;

      const striker = typeof e.striker === "string" ? e.striker.trim() : "";
      const nonStriker = typeof e.nonStriker === "string" ? e.nonStriker.trim() : "";

      if (striker) {
        const s = batter(striker);
        if (nonStriker) batter(nonStriker);
        s.runs += bRuns;
        if (e.type === "run" && num(e.value) === 4) s.fours += 1;
        if (e.type === "run" && num(e.value) === 6) s.sixes += 1;
        if (legal) {
          s.balls += 1;
          if (bRuns === 0) s.dots += 1;
        }

        // Partnership tracking: a new stand starts whenever the pair changes.
        const pairKey = [striker, nonStriker].map(normalizeName).sort().join("|");
        const cur = current as Partnership | null;
        const curKey = cur
          ? [cur.batter1, cur.batter2].map(normalizeName).sort().join("|")
          : "";
        if (!cur || curKey !== pairKey) {
          closePartnership(false);
          current = {
            number: partnerships.length + 1,
            batter1: striker,
            batter2: nonStriker,
            runs: 0, balls: 0,
            batter1Runs: 0, batter1Balls: 0,
            batter2Runs: 0, batter2Balls: 0,
            extras: 0, unbroken: true,
          };
        }
        const p = current as unknown as Partnership;
        p.runs += total;
        p.extras += total - bRuns;
        if (legal) p.balls += 1;
        if (normalizeName(p.batter1) === normalizeName(striker)) {
          p.batter1Runs += bRuns;
          if (legal) p.batter1Balls += 1;
        } else {
          p.batter2Runs += bRuns;
          if (legal) p.batter2Balls += 1;
        }
      }

      const bowlerName = typeof e.bowler === "string" ? e.bowler.trim() : "";
      if (bowlerName) {
        const b = bowler(bowlerName);
        const conceded = bowlerRunsOf(e);
        b.runs += conceded;
        if (legal) {
          b.balls += 1;
          if (total === 0) b.dots += 1;
        }
        if (e.type === "wide") b.wides += 1;
        if (e.type === "no-ball" || e.type === "no-ball-extra" || e.extra_type === "no-ball-extra") b.noBalls += 1;
        if (isBowlerWicket(e)) b.wickets += 1;
        const o = perBowlerInOver.get(bowlerName) ?? { legal: 0, conceded: 0 };
        o.conceded += conceded;
        if (legal) o.legal += 1;
        perBowlerInOver.set(bowlerName, o);
      }

      if (e.type === "wicket") {
        wickets += 1;
        overWickets += 1;
        const outName = (typeof e.outBatsman === "string" && e.outBatsman.trim()) || striker;
        const by = typeof e.dismissalBy === "string" ? e.dismissalBy.trim() : "";
        if (outName) {
          const line = batter(outName);
          line.out = true;
          line.wicketType = e.wicketType || "bowled";
          if (bowlerName && e.wicketType !== "run-out") line.bowler = bowlerName;
          if (e.wicketType === "caught") {
            line.fielder = by || bowlerName;
          } else if (e.wicketType === "run-out" && by) {
            line.fielder = by;
          }
        }
        if (e.wicketType === "caught" && (by || bowlerName)) fielder(by || bowlerName).catches += 1;
        if (e.wicketType === "run-out" && by) fielder(by).runOuts += 1;
        fallOfWickets.push({
          wicket: wickets,
          score: runs,
          overs: formatOvers(legalBalls, ballsPerOver),
          batter: outName,
        });
        closePartnership(false);
      }
    });

    perBowlerInOver.forEach((o, name) => {
      if (o.legal >= ballsPerOver && o.conceded === 0) bowler(name).maidens += 1;
    });
    overSummaries.push({
      over: overIndex + 1,
      runs: overRuns,
      wickets: overWickets,
      cumulativeRuns: runs,
    });
  });
  closePartnership(true);

  return {
    battingTeam,
    bowlingTeam,
    runs,
    wickets,
    legalBalls,
    ballsPerOver,
    extras: runs - batterRunsTotal,
    batting: Array.from(batting.values()),
    bowling: Array.from(bowling.values()),
    fielding: Array.from(fielding.values()),
    partnerships,
    fallOfWickets,
    overs: overSummaries,
  };
};

export interface SnapshotLike {
  teams?: unknown;
  matchLengthMode?: unknown;
  winningTeam?: unknown;
  recentEventsByTeams?: unknown;
  playerRosterByTeam?: unknown;
}

const ballsPerOverOf = (snapshot: SnapshotLike) =>
  snapshot?.matchLengthMode === "balls" ? 5 : 6;

/** Both regulation innings of a snapshot, in batting order. Super overs are ignored. */
export const extractInnings = (snapshot: SnapshotLike | null | undefined): InningsStats[] => {
  if (!snapshot || typeof snapshot !== "object") return [];
  const teams = Array.isArray(snapshot.teams)
    ? (snapshot.teams as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const byTeam = (snapshot.recentEventsByTeams ?? {}) as Record<string, OversMap>;
  const bpo = ballsPerOverOf(snapshot);
  return teams.slice(0, 2).flatMap((team, i) => {
    const overs = byTeam[team];
    if (!overs || Object.keys(overs).length === 0) return [];
    return [computeInnings(overs, team, teams[1 - i] ?? "", bpo)];
  });
};

export type MatchResult = "won" | "lost" | "tied" | "none";

export interface PlayerMatchPerformance {
  team: string;
  opponent: string;
  result: MatchResult;
  batting?: BattingLine;
  bowling?: BowlingLine;
  fielding: { catches: number; runOuts: number };
}

const findByName = <T extends { name: string }>(lines: T[], name: string) =>
  lines.find((l) => normalizeName(l.name) === name);

/**
 * One player's contribution to a match, or null if they didn't take part.
 * A player counts as having played if they're in the team roster or appear
 * anywhere in the ball-by-ball log.
 */
export const getPlayerPerformance = (
  snapshot: SnapshotLike | null | undefined,
  teamName: string,
  playerName: string,
  innings: InningsStats[] = extractInnings(snapshot),
): PlayerMatchPerformance | null => {
  if (!snapshot) return null;
  const teamKey = normalizeName(teamName);
  const playerKey = normalizeName(playerName);
  if (!teamKey || !playerKey) return null;

  const teams = Array.isArray(snapshot.teams)
    ? (snapshot.teams as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const team = teams.find((t) => normalizeName(t) === teamKey);
  if (!team) return null;
  const opponent = teams.find((t) => t !== team) ?? "";

  const battingInnings = innings.find((i) => normalizeName(i.battingTeam) === teamKey);
  const bowlingInnings = innings.find((i) => normalizeName(i.bowlingTeam) === teamKey);
  const batting = battingInnings ? findByName(battingInnings.batting, playerKey) : undefined;
  const bowling = bowlingInnings ? findByName(bowlingInnings.bowling, playerKey) : undefined;
  const field = bowlingInnings ? findByName(bowlingInnings.fielding, playerKey) : undefined;

  const roster = (snapshot.playerRosterByTeam ?? {}) as Record<string, unknown>;
  const rosterKey = Object.keys(roster).find((k) => normalizeName(k) === teamKey);
  const rosterList = rosterKey && Array.isArray(roster[rosterKey]) ? (roster[rosterKey] as unknown[]) : [];
  const inRoster = rosterList.some((p) => normalizeName(p) === playerKey);

  if (!inRoster && !batting && !bowling && !field) return null;

  const winner = typeof snapshot.winningTeam === "string" ? snapshot.winningTeam.trim() : "";
  let result: MatchResult = "none";
  if (winner) {
    if (normalizeName(winner) === teamKey) result = "won";
    else if (/^tied?$/i.test(winner)) result = "tied";
    else if (teams.some((t) => normalizeName(t) === normalizeName(winner))) result = "lost";
  }

  return {
    team,
    opponent,
    result,
    batting: batting ? { ...batting } : undefined,
    bowling: bowling && bowling.balls + bowling.wides + bowling.noBalls > 0 ? { ...bowling } : undefined,
    fielding: { catches: field?.catches ?? 0, runOuts: field?.runOuts ?? 0 },
  };
};

export interface CareerStats {
  matches: number;
  wins: number;
  losses: number;
  batting: {
    innings: number;
    notOuts: number;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    dots: number;
    highest: number;
    highestNotOut: boolean;
    average: number | null;
    strikeRate: number | null;
    thirties: number;
    fifties: number;
    hundreds: number;
    ducks: number;
  };
  bowling: {
    innings: number;
    balls: number;
    runs: number;
    wickets: number;
    maidens: number;
    dots: number;
    bestWickets: number;
    bestRuns: number;
    average: number | null;
    economy: number | null;
    strikeRate: number | null;
    threeWickets: number;
    fiveWickets: number;
  };
  fielding: { catches: number; runOuts: number };
}

const round = (value: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

export const emptyCareerStats = (): CareerStats => ({
  matches: 0,
  wins: 0,
  losses: 0,
  batting: {
    innings: 0, notOuts: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0,
    highest: 0, highestNotOut: false, average: null, strikeRate: null,
    thirties: 0, fifties: 0, hundreds: 0, ducks: 0,
  },
  bowling: {
    innings: 0, balls: 0, runs: 0, wickets: 0, maidens: 0, dots: 0,
    bestWickets: 0, bestRuns: 0, average: null, economy: null, strikeRate: null,
    threeWickets: 0, fiveWickets: 0,
  },
  fielding: { catches: 0, runOuts: 0 },
});

/** Sums any number of match performances into career-style figures. */
export const aggregatePerformances = (perfs: PlayerMatchPerformance[]): CareerStats => {
  const s = emptyCareerStats();
  let hasBest = false;
  perfs.forEach((p) => {
    s.matches += 1;
    if (p.result === "won") s.wins += 1;
    if (p.result === "lost") s.losses += 1;
    const bat = p.batting;
    if (bat) {
      const b = s.batting;
      b.innings += 1;
      if (!bat.out) b.notOuts += 1;
      b.runs += bat.runs;
      b.balls += bat.balls;
      b.fours += bat.fours;
      b.sixes += bat.sixes;
      b.dots += bat.dots;
      if (bat.runs > b.highest || (bat.runs === b.highest && !bat.out)) {
        b.highest = bat.runs;
        b.highestNotOut = !bat.out;
      }
      if (bat.runs >= 100) b.hundreds += 1;
      else if (bat.runs >= 50) b.fifties += 1;
      else if (bat.runs >= 30) b.thirties += 1;
      if (bat.out && bat.runs === 0) b.ducks += 1;
    }
    const bowl = p.bowling;
    if (bowl) {
      const w = s.bowling;
      w.innings += 1;
      w.balls += bowl.balls;
      w.runs += bowl.runs;
      w.wickets += bowl.wickets;
      w.maidens += bowl.maidens;
      w.dots += bowl.dots;
      if (bowl.wickets >= 5) w.fiveWickets += 1;
      else if (bowl.wickets >= 3) w.threeWickets += 1;
      if (
        !hasBest ||
        bowl.wickets > w.bestWickets ||
        (bowl.wickets === w.bestWickets && bowl.runs < w.bestRuns)
      ) {
        hasBest = true;
        w.bestWickets = bowl.wickets;
        w.bestRuns = bowl.runs;
      }
    }
    s.fielding.catches += p.fielding.catches;
    s.fielding.runOuts += p.fielding.runOuts;
  });
  const b = s.batting;
  const dismissals = b.innings - b.notOuts;
  b.average = dismissals > 0 ? round(b.runs / dismissals) : null;
  b.strikeRate = b.balls > 0 ? round((b.runs * 100) / b.balls) : null;
  const w = s.bowling;
  w.average = w.wickets > 0 ? round(w.runs / w.wickets) : null;
  w.economy = w.balls > 0 ? round((w.runs * 6) / w.balls) : null;
  w.strikeRate = w.wickets > 0 ? round(w.balls / w.wickets, 1) : null;
  return s;
};
