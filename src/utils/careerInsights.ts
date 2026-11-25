// Pure, dependency-free career insights built on top of matchStats.ts.
//
// Takes a player's match-by-match performances and derives everything the
// profile page shows beyond the raw career totals: achievements and
// milestones, highlights and records, batting/bowling analysis, and
// head-to-head records.
//
// THIS FILE IS MIRRORED VERBATIM in the backend at
// cricket-score-counter-backend-server/src/utils/careerInsights.ts — keep the
// two copies identical so the app and the API always agree.

import {
  aggregatePerformances,
  type CareerStats,
  type PlayerMatchPerformance,
} from "./matchStats";

export type MatchSourceKind = "tournament" | "friendly";

export interface CareerPartnership {
  partner: string;
  wicket: number;
  runs: number;
  balls: number;
  ownRuns: number;
  unbroken: boolean;
}

/** One match the player took part in. */
export interface CareerMatchRow {
  matchId: string;
  source: MatchSourceKind;
  /** ISO date. */
  date: string;
  team: string;
  opponent: string;
  tournamentId?: string;
  tournamentName?: string;
  perf: PlayerMatchPerformance;
  partnerships?: CareerPartnership[];
}

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";
export type AchievementCategory = "batting" | "bowling" | "fielding" | "allround" | "matches" | "team";

interface MatchRef {
  matchId: string;
  date: string;
  opponent: string;
  source: MatchSourceKind;
  tournamentName?: string;
}

export interface Achievement extends Partial<MatchRef> {
  id: string;
  category: AchievementCategory;
  tier: AchievementTier;
  title: string;
  description: string;
  /** How many times a repeatable feat was achieved. */
  count: number;
}

export interface MilestoneProgress {
  id: string;
  category: AchievementCategory;
  title: string;
  current: number;
  target: number;
}

export interface InningsHighlight extends MatchRef {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  notOut: boolean;
}

export interface BowlingHighlight extends MatchRef {
  wickets: number;
  runs: number;
  balls: number;
  maidens: number;
}

export interface PartnershipHighlight extends MatchRef, CareerPartnership {}

export interface CareerHighlights {
  bestInnings: InningsHighlight[];
  bestBowling: BowlingHighlight[];
  topPartnerships: PartnershipHighlight[];
  streaks: {
    longestWinStreak: number;
    currentWinStreak: number;
    /** Consecutive innings with 10 or more runs. */
    longestDoubleFigureStreak: number;
    /** Consecutive bowling innings with at least one wicket. */
    longestWicketStreak: number;
  };
  seasons: Array<{ year: number; stats: CareerStats }>;
  firstMatch: MatchRef | null;
}

interface SplitLine {
  innings: number;
  runs: number;
  average: number | null;
  strikeRate: number | null;
}

export interface CareerAnalysis {
  batting: {
    innings: number;
    dismissals: Record<string, number>;
    runsFromFours: number;
    runsFromSixes: number;
    runsRunning: number;
    /** Share of runs scored in boundaries, 0–100. */
    boundaryPct: number | null;
    dotPct: number | null;
    ballsPerBoundary: number | null;
    averagePosition: number | null;
    byPosition: Array<SplitLine & { key: "top" | "middle" | "lower"; label: string }>;
    scoreBands: Array<{ label: string; count: number }>;
    /** 30+ scores turned into 50+, 0–100. */
    conversionPct: number | null;
  };
  bowling: {
    innings: number;
    wicketTypes: Record<string, number>;
    dotPct: number | null;
    wides: number;
    noBalls: number;
    extrasPerOver: number | null;
    maidens: number;
    ballsPerWicket: number | null;
    wicketBands: Array<{ label: string; count: number }>;
  };
  /** How the player performs in matches the team won vs lost. */
  inWins: ResultSplit;
  inLosses: ResultSplit;
}

interface ResultSplit {
  matches: number;
  battingAverage: number | null;
  strikeRate: number | null;
  runsPerMatch: number | null;
  wickets: number;
  economy: number | null;
}

export interface HeadToHeadRow {
  name: string;
  matches: number;
  wins: number;
  losses: number;
  runs: number;
  battingAverage: number | null;
  strikeRate: number | null;
  highest: number;
  highestNotOut: boolean;
  wickets: number;
  bowlingAverage: number | null;
  economy: number | null;
  best: string;
}

export interface CareerInsights {
  highlights: CareerHighlights;
  analysis: CareerAnalysis;
  headToHead: {
    opponents: HeadToHeadRow[];
    teams: HeadToHeadRow[];
  };
}

const HIGHLIGHT_LIMIT = 5;
const HEAD_TO_HEAD_LIMIT = 30;

const round = (value: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};
const ratio = (a: number, b: number, places = 2) => (b > 0 ? round(a / b, places) : null);
const pct = (a: number, b: number) => (b > 0 ? round((a * 100) / b, 1) : null);

const timeOf = (row: CareerMatchRow) => {
  const t = new Date(row.date).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Oldest first; ties keep their original order. */
export const sortChronologically = (rows: CareerMatchRow[]) =>
  rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => timeOf(a.row) - timeOf(b.row) || a.index - b.index)
    .map((x) => x.row);

const refOf = (row: CareerMatchRow): MatchRef => ({
  matchId: row.matchId,
  date: row.date,
  opponent: row.opponent,
  source: row.source,
  tournamentName: row.tournamentName,
});

// ------------------------------------------------------------ achievements

interface FeatDef {
  id: string;
  category: AchievementCategory;
  tier: AchievementTier;
  title: string;
  description: string;
  test: (p: PlayerMatchPerformance) => boolean | number;
}

const FEATS: FeatDef[] = [
  { id: "first-fifty", category: "batting", tier: "silver", title: "Half-century", description: "Scored 50 or more in an innings", test: (p) => (p.batting?.runs ?? 0) >= 50 },
  { id: "century", category: "batting", tier: "platinum", title: "Century", description: "Scored 100 or more in an innings", test: (p) => (p.batting?.runs ?? 0) >= 100 },
  { id: "six-hitter", category: "batting", tier: "silver", title: "Six machine", description: "Hit 5 or more sixes in an innings", test: (p) => (p.batting?.sixes ?? 0) >= 5 },
  {
    id: "blitz",
    category: "batting",
    tier: "gold",
    title: "Blitz",
    description: "30+ runs at a strike rate of 200 or more",
    test: (p) => !!p.batting && p.batting.runs >= 30 && p.batting.balls >= 10 && p.batting.runs * 100 >= p.batting.balls * 200,
  },
  { id: "three-fer", category: "bowling", tier: "bronze", title: "Three-wicket haul", description: "Took 3 or more wickets in a match", test: (p) => (p.bowling?.wickets ?? 0) >= 3 },
  { id: "five-fer", category: "bowling", tier: "platinum", title: "Five-wicket haul", description: "Took 5 or more wickets in a match", test: (p) => (p.bowling?.wickets ?? 0) >= 5 },
  { id: "hat-trick", category: "bowling", tier: "platinum", title: "Hat-trick", description: "Three wickets in three consecutive balls", test: (p) => p.bowling?.hatTricks ?? 0 },
  { id: "maiden", category: "bowling", tier: "bronze", title: "Maiden over", description: "Bowled an over without conceding a run", test: (p) => p.bowling?.maidens ?? 0 },
  {
    id: "miser",
    category: "bowling",
    tier: "silver",
    title: "Miser",
    description: "Bowled 2+ overs at an economy of 4 or less",
    test: (p) => !!p.bowling && p.bowling.balls >= 12 && p.bowling.runs * 6 <= p.bowling.balls * 4,
  },
  {
    id: "safe-hands",
    category: "fielding",
    tier: "silver",
    title: "Safe hands",
    description: "Took 3 or more catches in a match",
    test: (p) => p.fielding.catches >= 3,
  },
  {
    id: "all-round-show",
    category: "allround",
    tier: "gold",
    title: "All-round show",
    description: "30+ runs and 2+ wickets in the same match",
    test: (p) => (p.batting?.runs ?? 0) >= 30 && (p.bowling?.wickets ?? 0) >= 2,
  },
  {
    id: "player-of-the-match",
    category: "allround",
    tier: "gold",
    title: "Match winner",
    description: "50+ runs or 3+ wickets in a winning cause",
    test: (p) => p.result === "won" && ((p.batting?.runs ?? 0) >= 50 || (p.bowling?.wickets ?? 0) >= 3),
  },
];

interface MilestoneSeries {
  id: string;
  category: AchievementCategory;
  unit: string;
  targets: number[];
  value: (s: CareerStats) => number;
}

const MILESTONES: MilestoneSeries[] = [
  { id: "matches", category: "matches", unit: "matches", targets: [10, 25, 50, 100, 200], value: (s) => s.matches },
  { id: "runs", category: "batting", unit: "career runs", targets: [100, 500, 1000, 2500, 5000], value: (s) => s.batting.runs },
  { id: "wickets", category: "bowling", unit: "career wickets", targets: [10, 25, 50, 100, 200], value: (s) => s.bowling.wickets },
  { id: "sixes", category: "batting", unit: "sixes", targets: [10, 25, 50, 100], value: (s) => s.batting.sixes },
  { id: "fours", category: "batting", unit: "fours", targets: [25, 50, 100, 250], value: (s) => s.batting.fours },
  { id: "catches", category: "fielding", unit: "catches", targets: [10, 25, 50, 100], value: (s) => s.fielding.catches },
  { id: "wins", category: "team", unit: "wins", targets: [5, 10, 25, 50, 100], value: (s) => s.wins },
];

const tierFor = (index: number, total: number): AchievementTier => {
  if (index >= total - 1) return "platinum";
  if (index >= total - 2) return "gold";
  if (index >= 1) return "silver";
  return "bronze";
};

const WIN_STREAK_TARGETS = [3, 5, 10];

const winStreakTitle = (n: number) => `${n} wins in a row`;

/**
 * Achievements earned (with the match where each was first reached) and the
 * next milestone in every series. Expects rows in any order.
 */
export const computeAchievements = (
  input: CareerMatchRow[],
): { achievements: Achievement[]; nextMilestones: MilestoneProgress[] } => {
  const rows = sortChronologically(input);
  const achievements: Achievement[] = [];

  FEATS.forEach((feat) => {
    let count = 0;
    let first: CareerMatchRow | null = null;
    rows.forEach((row) => {
      const hit = feat.test(row.perf);
      const times = typeof hit === "number" ? hit : hit ? 1 : 0;
      if (times > 0) {
        count += times;
        if (!first) first = row;
      }
    });
    if (first) {
      achievements.push({ id: feat.id, category: feat.category, tier: feat.tier, title: feat.title, description: feat.description, count, ...refOf(first) });
    }
  });

  // Career milestones: replay the career and record the match that crossed each target.
  const nextMilestones: MilestoneProgress[] = [];
  const reached = new Map<string, CareerMatchRow>();
  const running: PlayerMatchPerformance[] = [];
  rows.forEach((row) => {
    running.push(row.perf);
    const s = aggregatePerformances(running);
    MILESTONES.forEach((m) => {
      const v = m.value(s);
      m.targets.forEach((target) => {
        const key = `${m.id}-${target}`;
        if (v >= target && !reached.has(key)) reached.set(key, row);
      });
    });
  });
  const total = aggregatePerformances(rows.map((r) => r.perf));
  MILESTONES.forEach((m) => {
    m.targets.forEach((target, i) => {
      const row = reached.get(`${m.id}-${target}`);
      if (row) {
        achievements.push({
          id: `${m.id}-${target}`,
          category: m.category,
          tier: tierFor(i, m.targets.length),
          title: `${target} ${m.unit}`,
          description: `Reached ${target} ${m.unit}`,
          count: 1,
          ...refOf(row),
        });
      }
    });
    const current = m.value(total);
    const next = m.targets.find((t) => current < t);
    if (next !== undefined) {
      nextMilestones.push({ id: `${m.id}-${next}`, category: m.category, title: `${next} ${m.unit}`, current, target: next });
    }
  });

  // Win streaks.
  let streak = 0;
  rows.forEach((row) => {
    streak = row.perf.result === "won" ? streak + 1 : 0;
    WIN_STREAK_TARGETS.forEach((target, i) => {
      const id = `win-streak-${target}`;
      if (streak === target && !achievements.some((a) => a.id === id)) {
        achievements.push({
          id,
          category: "team",
          tier: tierFor(i, WIN_STREAK_TARGETS.length),
          title: winStreakTitle(target),
          description: `Won ${target} matches in a row`,
          count: 1,
          ...refOf(row),
        });
      }
    });
  });

  achievements.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  nextMilestones.sort((a, b) => b.current / b.target - a.current / a.target);
  return { achievements, nextMilestones };
};

// ------------------------------------------------------------ highlights

const longestRun = (flags: boolean[]) => {
  let best = 0;
  let cur = 0;
  flags.forEach((f) => {
    cur = f ? cur + 1 : 0;
    best = Math.max(best, cur);
  });
  return best;
};

export const computeHighlights = (input: CareerMatchRow[]): CareerHighlights => {
  const rows = sortChronologically(input);

  const bestInnings: InningsHighlight[] = rows
    .filter((r) => r.perf.batting)
    .map((r) => {
      const b = r.perf.batting!;
      return { ...refOf(r), runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, notOut: !b.out };
    })
    .sort((a, b) => b.runs - a.runs || Number(b.notOut) - Number(a.notOut) || a.balls - b.balls)
    .slice(0, HIGHLIGHT_LIMIT);

  const bestBowling: BowlingHighlight[] = rows
    .filter((r) => r.perf.bowling && r.perf.bowling.balls > 0)
    .map((r) => {
      const w = r.perf.bowling!;
      return { ...refOf(r), wickets: w.wickets, runs: w.runs, balls: w.balls, maidens: w.maidens };
    })
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs || b.balls - a.balls)
    .slice(0, HIGHLIGHT_LIMIT);

  const topPartnerships: PartnershipHighlight[] = rows
    .flatMap((r) => (r.partnerships ?? []).map((p) => ({ ...refOf(r), ...p })))
    .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, HIGHLIGHT_LIMIT);

  const results = rows.map((r) => r.perf.result === "won");
  let currentWinStreak = 0;
  for (let i = results.length - 1; i >= 0 && results[i]; i -= 1) currentWinStreak += 1;

  const byYear = new Map<number, PlayerMatchPerformance[]>();
  rows.forEach((r) => {
    const t = timeOf(r);
    if (!t) return;
    const year = new Date(t).getUTCFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), r.perf]);
  });

  return {
    bestInnings,
    bestBowling,
    topPartnerships,
    streaks: {
      longestWinStreak: longestRun(results),
      currentWinStreak,
      longestDoubleFigureStreak: longestRun(rows.filter((r) => r.perf.batting).map((r) => r.perf.batting!.runs >= 10)),
      longestWicketStreak: longestRun(
        rows.filter((r) => r.perf.bowling && r.perf.bowling.balls > 0).map((r) => r.perf.bowling!.wickets > 0),
      ),
    },
    seasons: Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, perfs]) => ({ year, stats: aggregatePerformances(perfs) })),
    firstMatch: rows.length ? refOf(rows[0]) : null,
  };
};

// ------------------------------------------------------------ analysis

const POSITION_GROUPS = [
  { key: "top" as const, label: "Top order (1–3)", test: (p: number) => p <= 3 },
  { key: "middle" as const, label: "Middle order (4–7)", test: (p: number) => p >= 4 && p <= 7 },
  { key: "lower" as const, label: "Lower order (8+)", test: (p: number) => p >= 8 },
];

const SCORE_BANDS = [
  { label: "0–9", min: 0, max: 9 },
  { label: "10–29", min: 10, max: 29 },
  { label: "30–49", min: 30, max: 49 },
  { label: "50–99", min: 50, max: 99 },
  { label: "100+", min: 100, max: Infinity },
];

const resultSplit = (perfs: PlayerMatchPerformance[]): ResultSplit => {
  const s = aggregatePerformances(perfs);
  return {
    matches: s.matches,
    battingAverage: s.batting.average,
    strikeRate: s.batting.strikeRate,
    runsPerMatch: ratio(s.batting.runs, s.matches),
    wickets: s.bowling.wickets,
    economy: s.bowling.economy,
  };
};

export const computeAnalysis = (rows: CareerMatchRow[]): CareerAnalysis => {
  const perfs = rows.map((r) => r.perf);
  const bats = perfs.flatMap((p) => (p.batting ? [p.batting] : []));
  const bowls = perfs.flatMap((p) => (p.bowling && p.bowling.balls + p.bowling.wides + p.bowling.noBalls > 0 ? [p.bowling] : []));

  const dismissals: Record<string, number> = {};
  bats.filter((b) => b.out).forEach((b) => {
    const kind = b.wicketType || "bowled";
    dismissals[kind] = (dismissals[kind] ?? 0) + 1;
  });
  const runs = bats.reduce((n, b) => n + b.runs, 0);
  const balls = bats.reduce((n, b) => n + b.balls, 0);
  const fours = bats.reduce((n, b) => n + b.fours, 0);
  const sixes = bats.reduce((n, b) => n + b.sixes, 0);
  const dots = bats.reduce((n, b) => n + b.dots, 0);
  const positioned = bats.filter((b) => b.position > 0);

  const byPosition = POSITION_GROUPS.map((g) => {
    const group = bats.filter((b) => g.test(b.position));
    const r = group.reduce((n, b) => n + b.runs, 0);
    const bl = group.reduce((n, b) => n + b.balls, 0);
    const outs = group.filter((b) => b.out).length;
    return { key: g.key, label: g.label, innings: group.length, runs: r, average: ratio(r, outs), strikeRate: bl > 0 ? round((r * 100) / bl) : null };
  }).filter((g) => g.innings > 0);

  const thirtyPlus = bats.filter((b) => b.runs >= 30).length;
  const fiftyPlus = bats.filter((b) => b.runs >= 50).length;

  const wicketTypes: Record<string, number> = {};
  bowls.forEach((w) => {
    Object.entries(w.wicketTypes ?? {}).forEach(([k, v]) => {
      wicketTypes[k] = (wicketTypes[k] ?? 0) + v;
    });
  });
  const bBalls = bowls.reduce((n, w) => n + w.balls, 0);
  const bDots = bowls.reduce((n, w) => n + w.dots, 0);
  const wides = bowls.reduce((n, w) => n + w.wides, 0);
  const noBalls = bowls.reduce((n, w) => n + w.noBalls, 0);
  const wkts = bowls.reduce((n, w) => n + w.wickets, 0);

  return {
    batting: {
      innings: bats.length,
      dismissals,
      runsFromFours: fours * 4,
      runsFromSixes: sixes * 6,
      runsRunning: Math.max(0, runs - fours * 4 - sixes * 6),
      boundaryPct: pct(fours * 4 + sixes * 6, runs),
      dotPct: pct(dots, balls),
      ballsPerBoundary: ratio(balls, fours + sixes, 1),
      averagePosition: positioned.length ? round(positioned.reduce((n, b) => n + b.position, 0) / positioned.length, 1) : null,
      byPosition,
      scoreBands: SCORE_BANDS.map((band) => ({
        label: band.label,
        count: bats.filter((b) => b.runs >= band.min && b.runs <= band.max).length,
      })),
      conversionPct: pct(fiftyPlus, thirtyPlus),
    },
    bowling: {
      innings: bowls.length,
      wicketTypes,
      dotPct: pct(bDots, bBalls),
      wides,
      noBalls,
      extrasPerOver: bBalls > 0 ? round(((wides + noBalls) * 6) / bBalls) : null,
      maidens: bowls.reduce((n, w) => n + w.maidens, 0),
      ballsPerWicket: ratio(bBalls, wkts, 1),
      wicketBands: [
        { label: "0 wkts", count: bowls.filter((w) => w.wickets === 0).length },
        { label: "1 wkt", count: bowls.filter((w) => w.wickets === 1).length },
        { label: "2 wkts", count: bowls.filter((w) => w.wickets === 2).length },
        { label: "3+ wkts", count: bowls.filter((w) => w.wickets >= 3).length },
      ],
    },
    inWins: resultSplit(perfs.filter((p) => p.result === "won")),
    inLosses: resultSplit(perfs.filter((p) => p.result === "lost")),
  };
};

// ------------------------------------------------------------ head-to-head

const groupRows = (rows: CareerMatchRow[], keyOf: (r: CareerMatchRow) => string): HeadToHeadRow[] => {
  const groups = new Map<string, { name: string; perfs: PlayerMatchPerformance[] }>();
  rows.forEach((r) => {
    const name = keyOf(r).trim();
    if (!name) return;
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { name, perfs: [] };
    g.perfs.push(r.perf);
    groups.set(key, g);
  });
  return Array.from(groups.values())
    .map(({ name, perfs }) => {
      const s = aggregatePerformances(perfs);
      return {
        name,
        matches: s.matches,
        wins: s.wins,
        losses: s.losses,
        runs: s.batting.runs,
        battingAverage: s.batting.average,
        strikeRate: s.batting.strikeRate,
        highest: s.batting.highest,
        highestNotOut: s.batting.highestNotOut,
        wickets: s.bowling.wickets,
        bowlingAverage: s.bowling.average,
        economy: s.bowling.economy,
        best: s.bowling.innings ? `${s.bowling.bestWickets}/${s.bowling.bestRuns}` : "",
      };
    })
    .sort((a, b) => b.matches - a.matches || b.runs - a.runs || a.name.localeCompare(b.name))
    .slice(0, HEAD_TO_HEAD_LIMIT);
};

export const computeHeadToHead = (rows: CareerMatchRow[]) => ({
  opponents: groupRows(rows, (r) => r.opponent),
  teams: groupRows(rows, (r) => r.team),
});

/** Everything the profile shows for one scope (all / tournament / friendly). */
export const computeCareerInsights = (rows: CareerMatchRow[]): CareerInsights => ({
  highlights: computeHighlights(rows),
  analysis: computeAnalysis(rows),
  headToHead: computeHeadToHead(rows),
});
