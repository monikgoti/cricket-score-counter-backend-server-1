"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregatePerformances = exports.emptyCareerStats = exports.getPlayerPerformance = exports.extractInnings = exports.computeInnings = exports.formatOvers = exports.bowlerRunsOf = exports.batterRunsOf = exports.eventTotalRuns = exports.isLegalBall = exports.normalizeName = void 0;
const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const normalizeName = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
exports.normalizeName = normalizeName;
const isLegalBall = (e) => e.type !== "wide" &&
    e.type !== "no-ball" &&
    e.type !== "no-ball-extra" &&
    e.type !== "penalty" &&
    e.extra_type !== "no-ball-extra";
exports.isLegalBall = isLegalBall;
const eventTotalRuns = (e) => e.extra_type === "no-ball-extra" ? num(e.value) + 1 : num(e.value);
exports.eventTotalRuns = eventTotalRuns;
const batterRunsOf = (e) => e.type === "run" || (e.type === "wicket" && num(e.value) > 0) ? num(e.value) : 0;
exports.batterRunsOf = batterRunsOf;
const bowlerRunsOf = (e) => e.type === "bye" || e.type === "leg-bye" || e.type === "penalty"
    ? 0
    : (0, exports.eventTotalRuns)(e);
exports.bowlerRunsOf = bowlerRunsOf;
const isBowlerWicket = (e) => e.type === "wicket" &&
    e.extra_type !== "no-ball-extra" &&
    e.wicketType !== "run-out";
const formatOvers = (legalBalls, ballsPerOver = 6) => `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
exports.formatOvers = formatOvers;
const sortedOverEntries = (overs) => Object.keys(overs || {})
    .map((key) => ({ key, index: Number(key) }))
    .sort((a, b) => a.index - b.index)
    .map(({ key }) => (Array.isArray(overs[key]) ? overs[key] : []));
/** Builds a full innings breakdown from one team's batting event log. */
const computeInnings = (overs, battingTeam, bowlingTeam, ballsPerOver = 6) => {
    const batting = new Map();
    const bowling = new Map();
    const fielding = new Map();
    const partnerships = [];
    const fallOfWickets = [];
    const overSummaries = [];
    let runs = 0;
    let wickets = 0;
    let legalBalls = 0;
    let batterRunsTotal = 0;
    let current = null;
    // Consecutive bowler wickets per bowler (any other delivery resets it).
    const wicketStreak = new Map();
    const batter = (name) => {
        let line = batting.get(name);
        if (!line) {
            line = { name, position: batting.size + 1, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: false };
            batting.set(name, line);
        }
        return line;
    };
    const bowler = (name) => {
        let line = bowling.get(name);
        if (!line) {
            line = { name, balls: 0, runs: 0, wickets: 0, dots: 0, maidens: 0, wides: 0, noBalls: 0, wicketTypes: {}, hatTricks: 0 };
            bowling.set(name, line);
        }
        return line;
    };
    const fielder = (name) => {
        let line = fielding.get(name);
        if (!line) {
            line = { name, catches: 0, runOuts: 0 };
            fielding.set(name, line);
        }
        return line;
    };
    const closePartnership = (unbroken) => {
        if (current) {
            current.unbroken = unbroken;
            partnerships.push(current);
            current = null;
        }
    };
    sortedOverEntries(overs).forEach((events, overIndex) => {
        let overRuns = 0;
        let overWickets = 0;
        const perBowlerInOver = new Map();
        events.forEach((e) => {
            var _a, _b, _c, _d, _e;
            if (!e || typeof e !== "object")
                return;
            const total = (0, exports.eventTotalRuns)(e);
            const bRuns = (0, exports.batterRunsOf)(e);
            const legal = (0, exports.isLegalBall)(e);
            runs += total;
            overRuns += total;
            batterRunsTotal += bRuns;
            if (legal)
                legalBalls += 1;
            const striker = typeof e.striker === "string" ? e.striker.trim() : "";
            const nonStriker = typeof e.nonStriker === "string" ? e.nonStriker.trim() : "";
            if (striker) {
                const s = batter(striker);
                if (nonStriker)
                    batter(nonStriker);
                s.runs += bRuns;
                if (e.type === "run" && num(e.value) === 4)
                    s.fours += 1;
                if (e.type === "run" && num(e.value) === 6)
                    s.sixes += 1;
                if (legal) {
                    s.balls += 1;
                    if (bRuns === 0)
                        s.dots += 1;
                }
                // Partnership tracking: a new stand starts whenever the pair changes.
                const pairKey = [striker, nonStriker].map(exports.normalizeName).sort().join("|");
                const cur = current;
                const curKey = cur
                    ? [cur.batter1, cur.batter2].map(exports.normalizeName).sort().join("|")
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
                const p = current;
                p.runs += total;
                p.extras += total - bRuns;
                if (legal)
                    p.balls += 1;
                if ((0, exports.normalizeName)(p.batter1) === (0, exports.normalizeName)(striker)) {
                    p.batter1Runs += bRuns;
                    if (legal)
                        p.batter1Balls += 1;
                }
                else {
                    p.batter2Runs += bRuns;
                    if (legal)
                        p.batter2Balls += 1;
                }
            }
            const bowlerName = typeof e.bowler === "string" ? e.bowler.trim() : "";
            if (bowlerName) {
                const b = bowler(bowlerName);
                const conceded = (0, exports.bowlerRunsOf)(e);
                b.runs += conceded;
                if (legal) {
                    b.balls += 1;
                    if (total === 0)
                        b.dots += 1;
                }
                if (e.type === "wide")
                    b.wides += 1;
                if (e.type === "no-ball" || e.type === "no-ball-extra" || e.extra_type === "no-ball-extra")
                    b.noBalls += 1;
                if (isBowlerWicket(e)) {
                    b.wickets += 1;
                    const kind = e.wicketType || "bowled";
                    b.wicketTypes = (_a = b.wicketTypes) !== null && _a !== void 0 ? _a : {};
                    b.wicketTypes[kind] = ((_b = b.wicketTypes[kind]) !== null && _b !== void 0 ? _b : 0) + 1;
                    const streak = ((_c = wicketStreak.get(bowlerName)) !== null && _c !== void 0 ? _c : 0) + 1;
                    wicketStreak.set(bowlerName, streak);
                    if (streak === 3)
                        b.hatTricks = ((_d = b.hatTricks) !== null && _d !== void 0 ? _d : 0) + 1;
                }
                else {
                    wicketStreak.set(bowlerName, 0);
                }
                const o = (_e = perBowlerInOver.get(bowlerName)) !== null && _e !== void 0 ? _e : { legal: 0, conceded: 0 };
                o.conceded += conceded;
                if (legal)
                    o.legal += 1;
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
                    if (bowlerName && e.wicketType !== "run-out")
                        line.bowler = bowlerName;
                    if (e.wicketType === "caught") {
                        line.fielder = by || bowlerName;
                    }
                    else if (e.wicketType === "run-out" && by) {
                        line.fielder = by;
                    }
                }
                if (e.wicketType === "caught" && (by || bowlerName))
                    fielder(by || bowlerName).catches += 1;
                if (e.wicketType === "run-out" && by)
                    fielder(by).runOuts += 1;
                fallOfWickets.push({
                    wicket: wickets,
                    score: runs,
                    overs: (0, exports.formatOvers)(legalBalls, ballsPerOver),
                    batter: outName,
                });
                closePartnership(false);
            }
        });
        perBowlerInOver.forEach((o, name) => {
            if (o.legal >= ballsPerOver && o.conceded === 0)
                bowler(name).maidens += 1;
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
exports.computeInnings = computeInnings;
const ballsPerOverOf = (snapshot) => (snapshot === null || snapshot === void 0 ? void 0 : snapshot.matchLengthMode) === "balls" ? 5 : 6;
/** Both regulation innings of a snapshot, in batting order. Super overs are ignored. */
const extractInnings = (snapshot) => {
    var _a;
    if (!snapshot || typeof snapshot !== "object")
        return [];
    const teams = Array.isArray(snapshot.teams)
        ? snapshot.teams.filter((t) => typeof t === "string")
        : [];
    const byTeam = ((_a = snapshot.recentEventsByTeams) !== null && _a !== void 0 ? _a : {});
    const bpo = ballsPerOverOf(snapshot);
    return teams.slice(0, 2).flatMap((team, i) => {
        var _a;
        const overs = byTeam[team];
        if (!overs || Object.keys(overs).length === 0)
            return [];
        return [(0, exports.computeInnings)(overs, team, (_a = teams[1 - i]) !== null && _a !== void 0 ? _a : "", bpo)];
    });
};
exports.extractInnings = extractInnings;
const findByName = (lines, name) => lines.find((l) => (0, exports.normalizeName)(l.name) === name);
/**
 * One player's contribution to a match, or null if they didn't take part.
 * A player counts as having played if they're in the team roster or appear
 * anywhere in the ball-by-ball log.
 */
const getPlayerPerformance = (snapshot, teamName, playerName, innings = (0, exports.extractInnings)(snapshot)) => {
    var _a, _b, _c, _d, _e;
    if (!snapshot)
        return null;
    const teamKey = (0, exports.normalizeName)(teamName);
    const playerKey = (0, exports.normalizeName)(playerName);
    if (!teamKey || !playerKey)
        return null;
    const teams = Array.isArray(snapshot.teams)
        ? snapshot.teams.filter((t) => typeof t === "string")
        : [];
    const team = teams.find((t) => (0, exports.normalizeName)(t) === teamKey);
    if (!team)
        return null;
    const opponent = (_a = teams.find((t) => t !== team)) !== null && _a !== void 0 ? _a : "";
    const battingInnings = innings.find((i) => (0, exports.normalizeName)(i.battingTeam) === teamKey);
    const bowlingInnings = innings.find((i) => (0, exports.normalizeName)(i.bowlingTeam) === teamKey);
    const batting = battingInnings ? findByName(battingInnings.batting, playerKey) : undefined;
    const bowling = bowlingInnings ? findByName(bowlingInnings.bowling, playerKey) : undefined;
    const field = bowlingInnings ? findByName(bowlingInnings.fielding, playerKey) : undefined;
    const roster = ((_b = snapshot.playerRosterByTeam) !== null && _b !== void 0 ? _b : {});
    const rosterKey = Object.keys(roster).find((k) => (0, exports.normalizeName)(k) === teamKey);
    const rosterList = rosterKey && Array.isArray(roster[rosterKey]) ? roster[rosterKey] : [];
    const inRoster = rosterList.some((p) => (0, exports.normalizeName)(p) === playerKey);
    if (!inRoster && !batting && !bowling && !field)
        return null;
    const winner = typeof snapshot.winningTeam === "string" ? snapshot.winningTeam.trim() : "";
    let result = "none";
    if (winner) {
        if ((0, exports.normalizeName)(winner) === teamKey)
            result = "won";
        else if (/^tied?$/i.test(winner))
            result = "tied";
        else if (teams.some((t) => (0, exports.normalizeName)(t) === (0, exports.normalizeName)(winner)))
            result = "lost";
    }
    return {
        team,
        opponent,
        result,
        batting: batting ? Object.assign({}, batting) : undefined,
        bowling: bowling && bowling.balls + bowling.wides + bowling.noBalls > 0
            ? Object.assign(Object.assign({}, bowling), { wicketTypes: Object.assign({}, ((_c = bowling.wicketTypes) !== null && _c !== void 0 ? _c : {})) }) : undefined,
        fielding: { catches: (_d = field === null || field === void 0 ? void 0 : field.catches) !== null && _d !== void 0 ? _d : 0, runOuts: (_e = field === null || field === void 0 ? void 0 : field.runOuts) !== null && _e !== void 0 ? _e : 0 },
    };
};
exports.getPlayerPerformance = getPlayerPerformance;
const round = (value, places = 2) => {
    const f = 10 ** places;
    return Math.round(value * f) / f;
};
const emptyCareerStats = () => ({
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
exports.emptyCareerStats = emptyCareerStats;
/** Sums any number of match performances into career-style figures. */
const aggregatePerformances = (perfs) => {
    const s = (0, exports.emptyCareerStats)();
    let hasBest = false;
    perfs.forEach((p) => {
        s.matches += 1;
        if (p.result === "won")
            s.wins += 1;
        if (p.result === "lost")
            s.losses += 1;
        const bat = p.batting;
        if (bat) {
            const b = s.batting;
            b.innings += 1;
            if (!bat.out)
                b.notOuts += 1;
            b.runs += bat.runs;
            b.balls += bat.balls;
            b.fours += bat.fours;
            b.sixes += bat.sixes;
            b.dots += bat.dots;
            if (bat.runs > b.highest || (bat.runs === b.highest && !bat.out)) {
                b.highest = bat.runs;
                b.highestNotOut = !bat.out;
            }
            if (bat.runs >= 100)
                b.hundreds += 1;
            else if (bat.runs >= 50)
                b.fifties += 1;
            else if (bat.runs >= 30)
                b.thirties += 1;
            if (bat.out && bat.runs === 0)
                b.ducks += 1;
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
            if (bowl.wickets >= 5)
                w.fiveWickets += 1;
            else if (bowl.wickets >= 3)
                w.threeWickets += 1;
            if (!hasBest ||
                bowl.wickets > w.bestWickets ||
                (bowl.wickets === w.bestWickets && bowl.runs < w.bestRuns)) {
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
exports.aggregatePerformances = aggregatePerformances;
//# sourceMappingURL=matchStats.js.map