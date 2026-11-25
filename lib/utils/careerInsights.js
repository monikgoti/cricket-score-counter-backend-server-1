"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCareerInsights = exports.computeHeadToHead = exports.computeAnalysis = exports.computeHighlights = exports.computeAchievements = exports.sortChronologically = void 0;
const matchStats_1 = require("./matchStats");
const HIGHLIGHT_LIMIT = 5;
const HEAD_TO_HEAD_LIMIT = 30;
const round = (value, places = 2) => {
    const f = 10 ** places;
    return Math.round(value * f) / f;
};
const ratio = (a, b, places = 2) => (b > 0 ? round(a / b, places) : null);
const pct = (a, b) => (b > 0 ? round((a * 100) / b, 1) : null);
const timeOf = (row) => {
    const t = new Date(row.date).getTime();
    return Number.isFinite(t) ? t : 0;
};
/** Oldest first; ties keep their original order. */
const sortChronologically = (rows) => rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => timeOf(a.row) - timeOf(b.row) || a.index - b.index)
    .map((x) => x.row);
exports.sortChronologically = sortChronologically;
const refOf = (row) => ({
    matchId: row.matchId,
    date: row.date,
    opponent: row.opponent,
    source: row.source,
    tournamentName: row.tournamentName,
});
const FEATS = [
    { id: "first-fifty", category: "batting", tier: "silver", title: "Half-century", description: "Scored 50 or more in an innings", test: (p) => { var _a, _b; return ((_b = (_a = p.batting) === null || _a === void 0 ? void 0 : _a.runs) !== null && _b !== void 0 ? _b : 0) >= 50; } },
    { id: "century", category: "batting", tier: "platinum", title: "Century", description: "Scored 100 or more in an innings", test: (p) => { var _a, _b; return ((_b = (_a = p.batting) === null || _a === void 0 ? void 0 : _a.runs) !== null && _b !== void 0 ? _b : 0) >= 100; } },
    { id: "six-hitter", category: "batting", tier: "silver", title: "Six machine", description: "Hit 5 or more sixes in an innings", test: (p) => { var _a, _b; return ((_b = (_a = p.batting) === null || _a === void 0 ? void 0 : _a.sixes) !== null && _b !== void 0 ? _b : 0) >= 5; } },
    {
        id: "blitz",
        category: "batting",
        tier: "gold",
        title: "Blitz",
        description: "30+ runs at a strike rate of 200 or more",
        test: (p) => !!p.batting && p.batting.runs >= 30 && p.batting.balls >= 10 && p.batting.runs * 100 >= p.batting.balls * 200,
    },
    { id: "three-fer", category: "bowling", tier: "bronze", title: "Three-wicket haul", description: "Took 3 or more wickets in a match", test: (p) => { var _a, _b; return ((_b = (_a = p.bowling) === null || _a === void 0 ? void 0 : _a.wickets) !== null && _b !== void 0 ? _b : 0) >= 3; } },
    { id: "five-fer", category: "bowling", tier: "platinum", title: "Five-wicket haul", description: "Took 5 or more wickets in a match", test: (p) => { var _a, _b; return ((_b = (_a = p.bowling) === null || _a === void 0 ? void 0 : _a.wickets) !== null && _b !== void 0 ? _b : 0) >= 5; } },
    { id: "hat-trick", category: "bowling", tier: "platinum", title: "Hat-trick", description: "Three wickets in three consecutive balls", test: (p) => { var _a, _b; return (_b = (_a = p.bowling) === null || _a === void 0 ? void 0 : _a.hatTricks) !== null && _b !== void 0 ? _b : 0; } },
    { id: "maiden", category: "bowling", tier: "bronze", title: "Maiden over", description: "Bowled an over without conceding a run", test: (p) => { var _a, _b; return (_b = (_a = p.bowling) === null || _a === void 0 ? void 0 : _a.maidens) !== null && _b !== void 0 ? _b : 0; } },
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
        test: (p) => { var _a, _b, _c, _d; return ((_b = (_a = p.batting) === null || _a === void 0 ? void 0 : _a.runs) !== null && _b !== void 0 ? _b : 0) >= 30 && ((_d = (_c = p.bowling) === null || _c === void 0 ? void 0 : _c.wickets) !== null && _d !== void 0 ? _d : 0) >= 2; },
    },
    {
        id: "player-of-the-match",
        category: "allround",
        tier: "gold",
        title: "Match winner",
        description: "50+ runs or 3+ wickets in a winning cause",
        test: (p) => { var _a, _b, _c, _d; return p.result === "won" && (((_b = (_a = p.batting) === null || _a === void 0 ? void 0 : _a.runs) !== null && _b !== void 0 ? _b : 0) >= 50 || ((_d = (_c = p.bowling) === null || _c === void 0 ? void 0 : _c.wickets) !== null && _d !== void 0 ? _d : 0) >= 3); },
    },
];
const MILESTONES = [
    { id: "matches", category: "matches", unit: "matches", targets: [10, 25, 50, 100, 200], value: (s) => s.matches },
    { id: "runs", category: "batting", unit: "career runs", targets: [100, 500, 1000, 2500, 5000], value: (s) => s.batting.runs },
    { id: "wickets", category: "bowling", unit: "career wickets", targets: [10, 25, 50, 100, 200], value: (s) => s.bowling.wickets },
    { id: "sixes", category: "batting", unit: "sixes", targets: [10, 25, 50, 100], value: (s) => s.batting.sixes },
    { id: "fours", category: "batting", unit: "fours", targets: [25, 50, 100, 250], value: (s) => s.batting.fours },
    { id: "catches", category: "fielding", unit: "catches", targets: [10, 25, 50, 100], value: (s) => s.fielding.catches },
    { id: "wins", category: "team", unit: "wins", targets: [5, 10, 25, 50, 100], value: (s) => s.wins },
];
const tierFor = (index, total) => {
    if (index >= total - 1)
        return "platinum";
    if (index >= total - 2)
        return "gold";
    if (index >= 1)
        return "silver";
    return "bronze";
};
const WIN_STREAK_TARGETS = [3, 5, 10];
const winStreakTitle = (n) => `${n} wins in a row`;
/**
 * Achievements earned (with the match where each was first reached) and the
 * next milestone in every series. Expects rows in any order.
 */
const computeAchievements = (input) => {
    const rows = (0, exports.sortChronologically)(input);
    const achievements = [];
    FEATS.forEach((feat) => {
        let count = 0;
        let first = null;
        rows.forEach((row) => {
            const hit = feat.test(row.perf);
            const times = typeof hit === "number" ? hit : hit ? 1 : 0;
            if (times > 0) {
                count += times;
                if (!first)
                    first = row;
            }
        });
        if (first) {
            achievements.push(Object.assign({ id: feat.id, category: feat.category, tier: feat.tier, title: feat.title, description: feat.description, count }, refOf(first)));
        }
    });
    // Career milestones: replay the career and record the match that crossed each target.
    const nextMilestones = [];
    const reached = new Map();
    const running = [];
    rows.forEach((row) => {
        running.push(row.perf);
        const s = (0, matchStats_1.aggregatePerformances)(running);
        MILESTONES.forEach((m) => {
            const v = m.value(s);
            m.targets.forEach((target) => {
                const key = `${m.id}-${target}`;
                if (v >= target && !reached.has(key))
                    reached.set(key, row);
            });
        });
    });
    const total = (0, matchStats_1.aggregatePerformances)(rows.map((r) => r.perf));
    MILESTONES.forEach((m) => {
        m.targets.forEach((target, i) => {
            const row = reached.get(`${m.id}-${target}`);
            if (row) {
                achievements.push(Object.assign({ id: `${m.id}-${target}`, category: m.category, tier: tierFor(i, m.targets.length), title: `${target} ${m.unit}`, description: `Reached ${target} ${m.unit}`, count: 1 }, refOf(row)));
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
                achievements.push(Object.assign({ id, category: "team", tier: tierFor(i, WIN_STREAK_TARGETS.length), title: winStreakTitle(target), description: `Won ${target} matches in a row`, count: 1 }, refOf(row)));
            }
        });
    });
    achievements.sort((a, b) => { var _a, _b; return ((_a = b.date) !== null && _a !== void 0 ? _a : "").localeCompare((_b = a.date) !== null && _b !== void 0 ? _b : ""); });
    nextMilestones.sort((a, b) => b.current / b.target - a.current / a.target);
    return { achievements, nextMilestones };
};
exports.computeAchievements = computeAchievements;
// ------------------------------------------------------------ highlights
const longestRun = (flags) => {
    let best = 0;
    let cur = 0;
    flags.forEach((f) => {
        cur = f ? cur + 1 : 0;
        best = Math.max(best, cur);
    });
    return best;
};
const computeHighlights = (input) => {
    const rows = (0, exports.sortChronologically)(input);
    const bestInnings = rows
        .filter((r) => r.perf.batting)
        .map((r) => {
        const b = r.perf.batting;
        return Object.assign(Object.assign({}, refOf(r)), { runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, notOut: !b.out });
    })
        .sort((a, b) => b.runs - a.runs || Number(b.notOut) - Number(a.notOut) || a.balls - b.balls)
        .slice(0, HIGHLIGHT_LIMIT);
    const bestBowling = rows
        .filter((r) => r.perf.bowling && r.perf.bowling.balls > 0)
        .map((r) => {
        const w = r.perf.bowling;
        return Object.assign(Object.assign({}, refOf(r)), { wickets: w.wickets, runs: w.runs, balls: w.balls, maidens: w.maidens });
    })
        .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs || b.balls - a.balls)
        .slice(0, HIGHLIGHT_LIMIT);
    const topPartnerships = rows
        .flatMap((r) => { var _a; return ((_a = r.partnerships) !== null && _a !== void 0 ? _a : []).map((p) => (Object.assign(Object.assign({}, refOf(r)), p))); })
        .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
        .slice(0, HIGHLIGHT_LIMIT);
    const results = rows.map((r) => r.perf.result === "won");
    let currentWinStreak = 0;
    for (let i = results.length - 1; i >= 0 && results[i]; i -= 1)
        currentWinStreak += 1;
    const byYear = new Map();
    rows.forEach((r) => {
        var _a;
        const t = timeOf(r);
        if (!t)
            return;
        const year = new Date(t).getUTCFullYear();
        byYear.set(year, [...((_a = byYear.get(year)) !== null && _a !== void 0 ? _a : []), r.perf]);
    });
    return {
        bestInnings,
        bestBowling,
        topPartnerships,
        streaks: {
            longestWinStreak: longestRun(results),
            currentWinStreak,
            longestDoubleFigureStreak: longestRun(rows.filter((r) => r.perf.batting).map((r) => r.perf.batting.runs >= 10)),
            longestWicketStreak: longestRun(rows.filter((r) => r.perf.bowling && r.perf.bowling.balls > 0).map((r) => r.perf.bowling.wickets > 0)),
        },
        seasons: Array.from(byYear.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([year, perfs]) => ({ year, stats: (0, matchStats_1.aggregatePerformances)(perfs) })),
        firstMatch: rows.length ? refOf(rows[0]) : null,
    };
};
exports.computeHighlights = computeHighlights;
// ------------------------------------------------------------ analysis
const POSITION_GROUPS = [
    { key: "top", label: "Top order (1–3)", test: (p) => p <= 3 },
    { key: "middle", label: "Middle order (4–7)", test: (p) => p >= 4 && p <= 7 },
    { key: "lower", label: "Lower order (8+)", test: (p) => p >= 8 },
];
const SCORE_BANDS = [
    { label: "0–9", min: 0, max: 9 },
    { label: "10–29", min: 10, max: 29 },
    { label: "30–49", min: 30, max: 49 },
    { label: "50–99", min: 50, max: 99 },
    { label: "100+", min: 100, max: Infinity },
];
const resultSplit = (perfs) => {
    const s = (0, matchStats_1.aggregatePerformances)(perfs);
    return {
        matches: s.matches,
        battingAverage: s.batting.average,
        strikeRate: s.batting.strikeRate,
        runsPerMatch: ratio(s.batting.runs, s.matches),
        wickets: s.bowling.wickets,
        economy: s.bowling.economy,
    };
};
const computeAnalysis = (rows) => {
    const perfs = rows.map((r) => r.perf);
    const bats = perfs.flatMap((p) => (p.batting ? [p.batting] : []));
    const bowls = perfs.flatMap((p) => (p.bowling && p.bowling.balls + p.bowling.wides + p.bowling.noBalls > 0 ? [p.bowling] : []));
    const dismissals = {};
    bats.filter((b) => b.out).forEach((b) => {
        var _a;
        const kind = b.wicketType || "bowled";
        dismissals[kind] = ((_a = dismissals[kind]) !== null && _a !== void 0 ? _a : 0) + 1;
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
    const wicketTypes = {};
    bowls.forEach((w) => {
        var _a;
        Object.entries((_a = w.wicketTypes) !== null && _a !== void 0 ? _a : {}).forEach(([k, v]) => {
            var _a;
            wicketTypes[k] = ((_a = wicketTypes[k]) !== null && _a !== void 0 ? _a : 0) + v;
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
exports.computeAnalysis = computeAnalysis;
// ------------------------------------------------------------ head-to-head
const groupRows = (rows, keyOf) => {
    const groups = new Map();
    rows.forEach((r) => {
        var _a;
        const name = keyOf(r).trim();
        if (!name)
            return;
        const key = name.toLowerCase();
        const g = (_a = groups.get(key)) !== null && _a !== void 0 ? _a : { name, perfs: [] };
        g.perfs.push(r.perf);
        groups.set(key, g);
    });
    return Array.from(groups.values())
        .map(({ name, perfs }) => {
        const s = (0, matchStats_1.aggregatePerformances)(perfs);
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
const computeHeadToHead = (rows) => ({
    opponents: groupRows(rows, (r) => r.opponent),
    teams: groupRows(rows, (r) => r.team),
});
exports.computeHeadToHead = computeHeadToHead;
/** Everything the profile shows for one scope (all / tournament / friendly). */
const computeCareerInsights = (rows) => ({
    highlights: (0, exports.computeHighlights)(rows),
    analysis: (0, exports.computeAnalysis)(rows),
    headToHead: (0, exports.computeHeadToHead)(rows),
});
exports.computeCareerInsights = computeCareerInsights;
//# sourceMappingURL=careerInsights.js.map