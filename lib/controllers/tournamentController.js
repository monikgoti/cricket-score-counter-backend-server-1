"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeTournamentMatch = exports.completeTournamentMatchFromSavedMatch = exports.startTournamentMatch = exports.recalculateTournamentTeamStatistics = exports.deleteTournamentTeam = exports.updateTournamentTeamStatistics = exports.updateTournamentTeamPlayers = exports.updateTournamentTeam = exports.getTournamentMatchesList = exports.getTournamentTeams = exports.createTournamentTeam = exports.deleteTournament = exports.updateTournament = exports.getTournament = exports.getTournaments = exports.createTournament = void 0;
const mongoose_1 = require("mongoose");
const Tournament_1 = require("../models/Tournament");
const TournamentMatch_1 = require("../models/TournamentMatch");
const TournamentTeam_1 = require("../models/TournamentTeam");
const SavedPlayerTeam_1 = require("../models/SavedPlayerTeam");
const analytics_1 = require("../utils/analytics");
const pagination_1 = require("../utils/pagination");
const normalizeText = (value) => typeof value === "string" ? value.trim() : "";
const normalizeOptionalText = (value) => {
    const text = normalizeText(value);
    return text || undefined;
};
const parseDate = (value) => {
    if (typeof value !== "string" && !(value instanceof Date)) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const parsePositiveNumber = (value) => {
    const numberValue = typeof value === "number" ? value : Number.parseFloat(String(value !== null && value !== void 0 ? value : ""));
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
        return null;
    }
    return numberValue;
};
const isTournamentFormat = (value) => typeof value === "string" &&
    Tournament_1.TOURNAMENT_FORMATS.includes(value);
const isBallType = (value) => typeof value === "string" && Tournament_1.BALL_TYPES.includes(value);
const isTournamentStatus = (value) => typeof value === "string" &&
    Tournament_1.TOURNAMENT_STATUSES.includes(value);
const isTournamentSquadMode = (value) => typeof value === "string" &&
    Tournament_1.TOURNAMENT_SQUAD_MODES.includes(value);
const normalizePlayers = (players) => {
    if (!Array.isArray(players)) {
        return [];
    }
    const seen = new Set();
    const normalizedPlayers = [];
    players.forEach((player) => {
        var _a;
        const name = typeof player === "string"
            ? normalizeText(player)
            : normalizeText(player === null || player === void 0 ? void 0 : player.name);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) {
            return;
        }
        seen.add(key);
        const playerId = typeof player === "object" &&
            player !== null &&
            mongoose_1.Types.ObjectId.isValid(normalizeText(player.playerId))
            ? new mongoose_1.Types.ObjectId(normalizeText(player.playerId))
            : undefined;
        normalizedPlayers.push({
            playerId,
            username: typeof player === "object" && player !== null
                ? (_a = normalizeOptionalText(player.username)) === null || _a === void 0 ? void 0 : _a.toLowerCase()
                : undefined,
            name,
            role: typeof player === "object" && player !== null
                ? normalizeOptionalText(player.role)
                : undefined,
            contactNumber: typeof player === "object" && player !== null
                ? normalizeOptionalText(player.contactNumber)
                : undefined,
        });
    });
    return normalizedPlayers;
};
const defaultStatistics = () => ({
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    noResults: 0,
    points: 0,
    runsFor: 0,
    runsAgainst: 0,
    wicketsTaken: 0,
    wicketsLost: 0,
    ballsFaced: 0,
    ballsBowled: 0,
    netRunRate: 0,
});
const defaultPlayerStatistics = () => ({
    matchesPlayed: 0,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    wickets: 0,
    ballsBowled: 0,
    runsConceded: 0,
});
const normalizeStatistics = (statistics) => {
    var _a, _b, _c;
    const defaults = defaultStatistics();
    if (!statistics || typeof statistics !== "object") {
        return defaults;
    }
    const compactStats = statistics;
    const expandedStatistics = Object.assign(Object.assign({}, compactStats), { matchesPlayed: (_a = compactStats.matchesPlayed) !== null && _a !== void 0 ? _a : compactStats.played, wins: (_b = compactStats.wins) !== null && _b !== void 0 ? _b : compactStats.won, losses: (_c = compactStats.losses) !== null && _c !== void 0 ? _c : compactStats.lost });
    const statKeys = Object.keys(defaults);
    return statKeys.reduce((acc, key) => {
        const value = Number(expandedStatistics[key]);
        acc[key] = Number.isFinite(value) ? value : defaults[key];
        return acc;
    }, defaults);
};
const getEventTotalRuns = (event) => {
    var _a;
    const value = Number((_a = event === null || event === void 0 ? void 0 : event.value) !== null && _a !== void 0 ? _a : 0);
    const safeValue = Number.isFinite(value) ? value : 0;
    return (event === null || event === void 0 ? void 0 : event.extra_type) === "no-ball-extra" ? safeValue + 1 : safeValue;
};
const isLegalDelivery = (event) => (event === null || event === void 0 ? void 0 : event.type) !== "wide" && (event === null || event === void 0 ? void 0 : event.extra_type) !== "no-ball-extra";
const summarizeSnapshotInning = (snapshot, teamName) => {
    var _a, _b;
    const overs = (_b = (_a = snapshot === null || snapshot === void 0 ? void 0 : snapshot.recentEventsByTeams) === null || _a === void 0 ? void 0 : _a[teamName]) !== null && _b !== void 0 ? _b : {};
    let runs = 0;
    let wickets = 0;
    let legalBalls = 0;
    Object.values(overs).forEach((events) => {
        if (!Array.isArray(events))
            return;
        events.forEach((event) => {
            runs += getEventTotalRuns(event);
            if ((event === null || event === void 0 ? void 0 : event.type) === "wicket")
                wickets += 1;
            if (isLegalDelivery(event))
                legalBalls += 1;
        });
    });
    return { runs, wickets, legalBalls };
};
const parseNonNegativeNumber = (value) => {
    const numberValue = typeof value === "number" ? value : Number.parseFloat(String(value !== null && value !== void 0 ? value : ""));
    if (!Number.isFinite(numberValue) || numberValue < 0) {
        return null;
    }
    return numberValue;
};
const parseOversToBalls = (value) => {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const [overText, ballText = "0"] = String(value).split(".");
    const overs = Number.parseInt(overText, 10);
    const balls = Number.parseInt(ballText, 10);
    if (!Number.isFinite(overs) ||
        !Number.isFinite(balls) ||
        overs < 0 ||
        balls < 0 ||
        balls > 5) {
        return null;
    }
    return overs * 6 + balls;
};
const normalizeInningSummary = (value) => {
    var _a, _b, _c, _d;
    if (!value || typeof value !== "object") {
        return null;
    }
    const runs = parseNonNegativeNumber((_a = value.runs) !== null && _a !== void 0 ? _a : value.score);
    const wickets = parseNonNegativeNumber(value.wickets);
    const legalBalls = (_d = parseNonNegativeNumber((_c = (_b = value.legalBalls) !== null && _b !== void 0 ? _b : value.balls) !== null && _c !== void 0 ? _c : value.ballsFaced)) !== null && _d !== void 0 ? _d : parseOversToBalls(value.overs);
    if (runs === null && wickets === null && legalBalls === null) {
        return null;
    }
    return {
        runs: runs !== null && runs !== void 0 ? runs : 0,
        wickets: wickets !== null && wickets !== void 0 ? wickets : 0,
        legalBalls: legalBalls !== null && legalBalls !== void 0 ? legalBalls : 0,
    };
};
const getInningFromCollection = (collection, teamId, teamName) => {
    var _a;
    if (!collection) {
        return null;
    }
    if (Array.isArray(collection)) {
        const row = collection.find((item) => {
            var _a;
            return String((_a = item === null || item === void 0 ? void 0 : item.teamId) !== null && _a !== void 0 ? _a : "") === teamId ||
                normalizeText(item === null || item === void 0 ? void 0 : item.teamName).toLowerCase() === teamName.toLowerCase();
        });
        return normalizeInningSummary(row);
    }
    if (typeof collection === "object") {
        return ((_a = normalizeInningSummary(collection[teamId])) !== null && _a !== void 0 ? _a : normalizeInningSummary(collection[teamName]));
    }
    return null;
};
const summarizeMatchInning = (source, teamId, teamName, side) => {
    var _a, _b, _c, _d;
    const manualSummary = (_d = (_c = (_b = (_a = normalizeInningSummary(source === null || source === void 0 ? void 0 : source[`${side}Inning`])) !== null && _a !== void 0 ? _a : normalizeInningSummary(source === null || source === void 0 ? void 0 : source[`${side}Score`])) !== null && _b !== void 0 ? _b : normalizeInningSummary(source === null || source === void 0 ? void 0 : source[`${side}Stats`])) !== null && _c !== void 0 ? _c : getInningFromCollection(source === null || source === void 0 ? void 0 : source.innings, teamId, teamName)) !== null && _d !== void 0 ? _d : getInningFromCollection(source === null || source === void 0 ? void 0 : source.teamScores, teamId, teamName);
    if (manualSummary) {
        return manualSummary;
    }
    return summarizeSnapshotInning(source, teamName);
};
const buildMatchStatSource = (body) => {
    var _a, _b, _c, _d, _e, _f;
    if ((body === null || body === void 0 ? void 0 : body.snapshot) && typeof body.snapshot === "object") {
        return Object.assign(Object.assign({}, body.snapshot), { innings: (_a = body.innings) !== null && _a !== void 0 ? _a : body.snapshot.innings, teamScores: (_b = body.teamScores) !== null && _b !== void 0 ? _b : body.snapshot.teamScores, team1Inning: (_c = body.team1Inning) !== null && _c !== void 0 ? _c : body.snapshot.team1Inning, team2Inning: (_d = body.team2Inning) !== null && _d !== void 0 ? _d : body.snapshot.team2Inning, team1Score: (_e = body.team1Score) !== null && _e !== void 0 ? _e : body.snapshot.team1Score, team2Score: (_f = body.team2Score) !== null && _f !== void 0 ? _f : body.snapshot.team2Score });
    }
    return {
        innings: body === null || body === void 0 ? void 0 : body.innings,
        teamScores: body === null || body === void 0 ? void 0 : body.teamScores,
        team1Inning: body === null || body === void 0 ? void 0 : body.team1Inning,
        team2Inning: body === null || body === void 0 ? void 0 : body.team2Inning,
        team1Score: body === null || body === void 0 ? void 0 : body.team1Score,
        team2Score: body === null || body === void 0 ? void 0 : body.team2Score,
        recentEventsByTeams: body === null || body === void 0 ? void 0 : body.recentEventsByTeams,
    };
};
const getNetRunRate = (runsFor, ballsFaced, runsAgainst, ballsBowled) => {
    const battingRate = ballsFaced > 0 ? runsFor / (ballsFaced / 6) : 0;
    const bowlingRate = ballsBowled > 0 ? runsAgainst / (ballsBowled / 6) : 0;
    return Number((battingRate - bowlingRate).toFixed(3));
};
const normalizePlayerKey = (value) => normalizeText(value).toLowerCase();
const addPlayerScorecardStats = (team, scorecard) => {
    if (!scorecard || typeof scorecard !== "object" || !team.players.length) {
        return;
    }
    const playerByName = new Map(team.players.map((player) => [normalizePlayerKey(player.name), player]));
    const touched = new Set();
    const batting = scorecard.batting && typeof scorecard.batting === "object"
        ? scorecard.batting
        : {};
    const bowling = scorecard.bowling && typeof scorecard.bowling === "object"
        ? scorecard.bowling
        : {};
    Object.entries(batting).forEach(([playerName, rawStats]) => {
        var _a;
        const player = playerByName.get(normalizePlayerKey(playerName));
        if (!player || !rawStats || typeof rawStats !== "object") {
            return;
        }
        const stats = rawStats;
        const current = Object.assign(Object.assign({}, defaultPlayerStatistics()), ((_a = player.statistics) !== null && _a !== void 0 ? _a : {}));
        current.runs += Number(stats.runs) || 0;
        current.ballsFaced += Number(stats.balls) || 0;
        current.fours += Number(stats.fours) || 0;
        current.sixes += Number(stats.sixes) || 0;
        player.statistics = current;
        touched.add(normalizePlayerKey(player.name));
    });
    Object.entries(bowling).forEach(([playerName, rawStats]) => {
        var _a;
        const player = playerByName.get(normalizePlayerKey(playerName));
        if (!player || !rawStats || typeof rawStats !== "object") {
            return;
        }
        const stats = rawStats;
        const current = Object.assign(Object.assign({}, defaultPlayerStatistics()), ((_a = player.statistics) !== null && _a !== void 0 ? _a : {}));
        current.wickets += Number(stats.wickets) || 0;
        current.ballsBowled += Number(stats.balls) || 0;
        current.runsConceded += Number(stats.runsConceded) || 0;
        player.statistics = current;
        touched.add(normalizePlayerKey(player.name));
    });
    touched.forEach((key) => {
        var _a, _b, _c;
        const player = playerByName.get(key);
        if (!player)
            return;
        player.statistics = Object.assign(Object.assign(Object.assign({}, defaultPlayerStatistics()), ((_a = player.statistics) !== null && _a !== void 0 ? _a : {})), { matchesPlayed: ((_c = (_b = player.statistics) === null || _b === void 0 ? void 0 : _b.matchesPlayed) !== null && _c !== void 0 ? _c : 0) + 1 });
    });
};
const ensureAuthenticated = (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return null;
    }
    return req.user.id;
};
const findOwnedTournament = async (tournamentId, userId) => {
    if (!mongoose_1.Types.ObjectId.isValid(tournamentId)) {
        return null;
    }
    return Tournament_1.Tournament.findOne({
        _id: new mongoose_1.Types.ObjectId(tournamentId),
        organizer: new mongoose_1.Types.ObjectId(userId),
    });
};
const findOwnedTournamentTeam = async (teamId, tournamentId, userId) => {
    if (!mongoose_1.Types.ObjectId.isValid(teamId)) {
        return null;
    }
    return TournamentTeam_1.TournamentTeam.findOne({
        _id: new mongoose_1.Types.ObjectId(teamId),
        tournament: tournamentId,
        organizer: new mongoose_1.Types.ObjectId(userId),
    });
};
const findOwnedTournamentTeamsByIds = async (tournamentId, userId, teamIds) => {
    const objectIds = teamIds
        .filter((teamId) => mongoose_1.Types.ObjectId.isValid(teamId))
        .map((teamId) => new mongoose_1.Types.ObjectId(teamId));
    if (!objectIds.length) {
        return [];
    }
    return TournamentTeam_1.TournamentTeam.find({
        _id: { $in: objectIds },
        tournament: tournamentId,
        organizer: new mongoose_1.Types.ObjectId(userId),
    });
};
const buildPairKey = (team1Id, team2Id) => [team1Id, team2Id].sort().join(":");
const getValidMatchTeamId = (value, team1Id, team2Id) => {
    const teamId = normalizeText(value);
    return teamId === team1Id || teamId === team2Id ? teamId : "";
};
const getBattingFirstTeamId = (body, team1Id, team2Id) => {
    const explicitBattingFirstTeamId = getValidMatchTeamId(body === null || body === void 0 ? void 0 : body.battingFirstTeamId, team1Id, team2Id);
    if (explicitBattingFirstTeamId) {
        return explicitBattingFirstTeamId;
    }
    const tossWinnerTeamId = getValidMatchTeamId(body === null || body === void 0 ? void 0 : body.tossWinnerTeamId, team1Id, team2Id);
    const tossDecision = normalizeText(body === null || body === void 0 ? void 0 : body.tossDecision);
    if (!tossWinnerTeamId || (tossDecision !== "bat" && tossDecision !== "bowl")) {
        return "";
    }
    if (tossDecision === "bat") {
        return tossWinnerTeamId;
    }
    return tossWinnerTeamId === team1Id ? team2Id : team1Id;
};
const syncMissingTeamLogos = async (teams) => {
    const teamsMissingLogo = teams.filter((team) => !team.logoUrl);
    if (!teamsMissingLogo.length) {
        return;
    }
    const teamsWithSourceId = teamsMissingLogo.filter((team) => team.sourceTeamId);
    const teamsWithoutSourceId = teamsMissingLogo.filter((team) => !team.sourceTeamId);
    const sourceTeamById = new Map();
    if (teamsWithSourceId.length) {
        const sourceTeamIds = [
            ...new Set(teamsWithSourceId.map((team) => String(team.sourceTeamId))),
        ];
        const sourceTeams = await SavedPlayerTeam_1.SavedPlayerTeam.find({
            _id: { $in: sourceTeamIds },
        });
        sourceTeams.forEach((sourceTeam) => sourceTeamById.set(String(sourceTeam._id), sourceTeam));
    }
    // Older teams registered before sourceTeamId was tracked: fall back to a
    // name + owner match against the organizer's saved teams.
    const nameMatchByTeamId = new Map();
    if (teamsWithoutSourceId.length) {
        const organizerIds = [
            ...new Set(teamsWithoutSourceId.map((team) => String(team.organizer))),
        ];
        const candidateSavedTeams = await SavedPlayerTeam_1.SavedPlayerTeam.find({
            owner: { $in: organizerIds.map((id) => new mongoose_1.Types.ObjectId(id)) },
        });
        const savedTeamByOwnerAndName = new Map();
        candidateSavedTeams.forEach((savedTeam) => {
            savedTeamByOwnerAndName.set(`${String(savedTeam.owner)}::${savedTeam.name.toLowerCase()}`, savedTeam);
        });
        teamsWithoutSourceId.forEach((team) => {
            const match = savedTeamByOwnerAndName.get(`${String(team.organizer)}::${team.name.toLowerCase()}`);
            if (match) {
                nameMatchByTeamId.set(String(team._id), match);
            }
        });
    }
    const updates = [];
    teamsMissingLogo.forEach((team) => {
        var _a;
        const sourceTeam = (_a = sourceTeamById.get(String(team.sourceTeamId))) !== null && _a !== void 0 ? _a : nameMatchByTeamId.get(String(team._id));
        if (!(sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam.logoUrl)) {
            return;
        }
        team.logoUrl = sourceTeam.logoUrl;
        const setFields = { logoUrl: sourceTeam.logoUrl };
        if (!team.sourceTeamId) {
            team.sourceTeamId = sourceTeam._id;
            setFields.sourceTeamId = sourceTeam._id;
        }
        updates.push(TournamentTeam_1.TournamentTeam.updateOne({ _id: team._id }, { $set: setFields }));
    });
    if (updates.length) {
        await Promise.all(updates);
    }
};
const getTournamentTeamDocs = async (tournamentId, userId) => {
    const teams = await TournamentTeam_1.TournamentTeam.find({
        tournament: tournamentId,
        organizer: new mongoose_1.Types.ObjectId(userId),
    }).sort({ "statistics.points": -1, "statistics.netRunRate": -1, name: 1 });
    await syncMissingTeamLogos(teams);
    return teams;
};
const getTournamentMatches = async (tournamentId, userId) => TournamentMatch_1.TournamentMatch.find({
    tournament: tournamentId,
    organizer: new mongoose_1.Types.ObjectId(userId),
}).sort({ createdAt: -1 });
const resolveTournamentMatch = async (tournamentId, userId, matchIdentifier, body) => {
    const identifier = normalizeText(matchIdentifier);
    const scorerMatchId = normalizeText(body === null || body === void 0 ? void 0 : body.scorerMatchId) ||
        normalizeText(body === null || body === void 0 ? void 0 : body.clientMatchId) ||
        normalizeText(body === null || body === void 0 ? void 0 : body.gameId) ||
        identifier;
    if (mongoose_1.Types.ObjectId.isValid(identifier)) {
        const match = await TournamentMatch_1.TournamentMatch.findOne({
            _id: new mongoose_1.Types.ObjectId(identifier),
            tournament: tournamentId,
            organizer: new mongoose_1.Types.ObjectId(userId),
        });
        if (match)
            return match;
    }
    if (scorerMatchId) {
        const match = await TournamentMatch_1.TournamentMatch.findOne({
            scorerMatchId,
            tournament: tournamentId,
            organizer: new mongoose_1.Types.ObjectId(userId),
        }).sort({ updatedAt: -1 });
        if (match)
            return match;
    }
    const team1Id = normalizeText(body === null || body === void 0 ? void 0 : body.team1Id);
    const team2Id = normalizeText(body === null || body === void 0 ? void 0 : body.team2Id);
    if (mongoose_1.Types.ObjectId.isValid(team1Id) &&
        mongoose_1.Types.ObjectId.isValid(team2Id) &&
        team1Id !== team2Id) {
        const pairKey = buildPairKey(team1Id, team2Id);
        return TournamentMatch_1.TournamentMatch.findOne({
            tournament: tournamentId,
            organizer: new mongoose_1.Types.ObjectId(userId),
            pairKey,
            status: { $ne: "completed" },
        }).sort({ updatedAt: -1 });
    }
    return null;
};
const resolveTournamentMatchFromSavedMatchPayload = async (userId, body) => {
    var _a, _b;
    const tournamentId = normalizeText(body === null || body === void 0 ? void 0 : body.tournamentId);
    const matchIdentifier = (_b = (_a = body === null || body === void 0 ? void 0 : body.tournamentMatchId) !== null && _a !== void 0 ? _a : body === null || body === void 0 ? void 0 : body.clientMatchId) !== null && _b !== void 0 ? _b : body === null || body === void 0 ? void 0 : body.matchId;
    const userObjectId = new mongoose_1.Types.ObjectId(userId);
    if (mongoose_1.Types.ObjectId.isValid(tournamentId)) {
        const tournament = await findOwnedTournament(tournamentId, userId);
        if (!tournament) {
            return null;
        }
        return {
            tournament,
            match: await resolveTournamentMatch(tournament._id, userId, matchIdentifier, body),
        };
    }
    const identifier = normalizeText(matchIdentifier);
    if (mongoose_1.Types.ObjectId.isValid(identifier)) {
        const match = await TournamentMatch_1.TournamentMatch.findOne({
            _id: new mongoose_1.Types.ObjectId(identifier),
            organizer: userObjectId,
        });
        if (match) {
            const tournament = await findOwnedTournament(String(match.tournament), userId);
            return tournament ? { tournament, match } : null;
        }
    }
    const scorerMatchId = normalizeText(body === null || body === void 0 ? void 0 : body.scorerMatchId) ||
        normalizeText(body === null || body === void 0 ? void 0 : body.clientMatchId) ||
        normalizeText(body === null || body === void 0 ? void 0 : body.gameId);
    if (!scorerMatchId) {
        return null;
    }
    const match = await TournamentMatch_1.TournamentMatch.findOne({
        organizer: userObjectId,
        scorerMatchId,
    }).sort({ updatedAt: -1 });
    console.log('match', match);
    if (!match) {
        return null;
    }
    const tournament = await findOwnedTournament(String(match.tournament), userId);
    return tournament ? { tournament, match } : null;
};
const serializeMatch = (match, teamById) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    const team1Id = String(match.team1);
    const team2Id = String(match.team2);
    const winnerTeamId = match.winnerTeam ? String(match.winnerTeam) : "";
    const tossWinnerTeamId = match.tossWinnerTeam
        ? String(match.tossWinnerTeam)
        : "";
    const battingFirstTeamId = match.battingFirstTeam
        ? String(match.battingFirstTeam)
        : "";
    return {
        id: String(match._id),
        tournamentId: String(match.tournament),
        team1Id,
        team2Id,
        team1Name: (_b = (_a = teamById.get(team1Id)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "",
        team2Name: (_d = (_c = teamById.get(team2Id)) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : "",
        status: match.status,
        tossWinnerTeamId,
        tossWinnerTeamName: tossWinnerTeamId
            ? (_f = (_e = teamById.get(tossWinnerTeamId)) === null || _e === void 0 ? void 0 : _e.name) !== null && _f !== void 0 ? _f : ""
            : "",
        tossDecision: (_g = match.tossDecision) !== null && _g !== void 0 ? _g : "",
        battingFirstTeamId,
        battingFirstTeamName: battingFirstTeamId
            ? (_j = (_h = teamById.get(battingFirstTeamId)) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : ""
            : "",
        winnerTeamId,
        winnerTeamName: winnerTeamId
            ? (_l = (_k = teamById.get(winnerTeamId)) === null || _k === void 0 ? void 0 : _k.name) !== null && _l !== void 0 ? _l : ""
            : "",
        resultText: (_m = match.resultText) !== null && _m !== void 0 ? _m : "",
        scorerMatchId: (_o = match.scorerMatchId) !== null && _o !== void 0 ? _o : "",
        snapshot: (_p = match.snapshot) !== null && _p !== void 0 ? _p : null,
        startedAt: (_q = match.startedAt) !== null && _q !== void 0 ? _q : "",
        completedAt: (_r = match.completedAt) !== null && _r !== void 0 ? _r : "",
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
    };
};
const serializeTournament = async (tournament, userId, includeDetails = false) => {
    var _a, _b, _c;
    const teams = includeDetails
        ? await getTournamentTeamDocs(tournament._id, userId)
        : [];
    const matches = includeDetails
        ? await getTournamentMatches(tournament._id, userId)
        : [];
    const teamsCount = includeDetails
        ? teams.length
        : await TournamentTeam_1.TournamentTeam.countDocuments({
            tournament: tournament._id,
        });
    const teamById = new Map(teams.map((team) => [String(team._id), team]));
    return {
        id: String(tournament._id),
        name: tournament.name,
        organizerName: tournament.organizerName,
        startDate: tournament.startDate,
        endDate: tournament.endDate,
        location: tournament.location,
        logoUrl: (_a = tournament.logoUrl) !== null && _a !== void 0 ? _a : "",
        ballType: tournament.ballType,
        customBallType: (_b = tournament.customBallType) !== null && _b !== void 0 ? _b : "",
        oversPerMatch: tournament.oversPerMatch,
        format: tournament.format,
        squadMode: (_c = tournament.squadMode) !== null && _c !== void 0 ? _c : "teams_only",
        status: tournament.status,
        teamsCount,
        teams: teams.map(serializeTeam),
        matches: matches.map((match) => serializeMatch(match, teamById)),
        createdAt: tournament.createdAt,
        updatedAt: tournament.updatedAt,
    };
};
const serializeTeam = (team) => {
    var _a, _b, _c;
    const statistics = typeof ((_a = team.statistics) === null || _a === void 0 ? void 0 : _a.toObject) === "function"
        ? team.statistics.toObject()
        : JSON.parse(JSON.stringify((_b = team.statistics) !== null && _b !== void 0 ? _b : {}));
    const mergedStatistics = Object.assign(Object.assign({}, defaultStatistics()), statistics);
    const stats = {
        played: mergedStatistics.matchesPlayed,
        won: mergedStatistics.wins,
        lost: mergedStatistics.losses,
        points: mergedStatistics.points,
        netRunRate: mergedStatistics.netRunRate,
    };
    return {
        id: String(team._id),
        tournamentId: String(team.tournament),
        name: team.name,
        logoUrl: (_c = team.logoUrl) !== null && _c !== void 0 ? _c : "",
        captainName: team.captainName,
        contactNumber: team.contactNumber,
        players: team.players.map((player) => {
            var _a, _b, _c, _d, _e, _f, _g;
            return ({
                id: String(player._id),
                playerId: player.playerId ? String(player.playerId) : "",
                username: (_a = player.username) !== null && _a !== void 0 ? _a : "",
                name: player.name,
                role: (_b = player.role) !== null && _b !== void 0 ? _b : "",
                contactNumber: (_c = player.contactNumber) !== null && _c !== void 0 ? _c : "",
                statistics: Object.assign(Object.assign({}, defaultPlayerStatistics()), ((_g = (_f = (_e = (_d = player.statistics) === null || _d === void 0 ? void 0 : _d.toObject) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : player.statistics) !== null && _g !== void 0 ? _g : {})),
            });
        }),
        playerCount: team.players.length,
        stats,
        statistics: mergedStatistics,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
    };
};
const applyMatchStatsToTeams = (match, teamById) => {
    var _a, _b;
    const team1Id = String(match.team1);
    const team2Id = String(match.team2);
    const team1 = teamById.get(team1Id);
    const team2 = teamById.get(team2Id);
    if (!team1 || !team2) {
        return;
    }
    const source = (_a = match.snapshot) !== null && _a !== void 0 ? _a : {};
    const team1Inning = summarizeMatchInning(source, team1Id, team1.name, "team1");
    const team2Inning = summarizeMatchInning(source, team2Id, team2.name, "team2");
    const winnerTeamId = match.winnerTeam ? String(match.winnerTeam) : "";
    const isTie = !winnerTeamId;
    team1.statistics.matchesPlayed += 1;
    team2.statistics.matchesPlayed += 1;
    if (isTie) {
        team1.statistics.ties += 1;
        team2.statistics.ties += 1;
        team1.statistics.points += 1;
        team2.statistics.points += 1;
    }
    else if (winnerTeamId === team1Id) {
        team1.statistics.wins += 1;
        team1.statistics.points += 2;
        team2.statistics.losses += 1;
    }
    else if (winnerTeamId === team2Id) {
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
    team1.statistics.netRunRate = getNetRunRate(team1.statistics.runsFor, team1.statistics.ballsFaced, team1.statistics.runsAgainst, team1.statistics.ballsBowled);
    team2.statistics.runsFor += team2Inning.runs;
    team2.statistics.runsAgainst += team1Inning.runs;
    team2.statistics.wicketsLost += team2Inning.wickets;
    team2.statistics.wicketsTaken += team1Inning.wickets;
    team2.statistics.ballsFaced += team2Inning.legalBalls;
    team2.statistics.ballsBowled += team1Inning.legalBalls;
    team2.statistics.netRunRate = getNetRunRate(team2.statistics.runsFor, team2.statistics.ballsFaced, team2.statistics.runsAgainst, team2.statistics.ballsBowled);
    const playerScorecards = (_b = source === null || source === void 0 ? void 0 : source.playerScorecardByTeam) !== null && _b !== void 0 ? _b : {};
    addPlayerScorecardStats(team1, playerScorecards[team1.name]);
    addPlayerScorecardStats(team2, playerScorecards[team2.name]);
};
const recalculateTournamentStatistics = async (tournamentId, userId) => {
    const teams = await TournamentTeam_1.TournamentTeam.find({
        tournament: tournamentId,
        organizer: new mongoose_1.Types.ObjectId(userId),
    });
    const matches = await TournamentMatch_1.TournamentMatch.find({
        tournament: tournamentId,
        organizer: new mongoose_1.Types.ObjectId(userId),
        status: "completed",
    }).sort({ completedAt: 1, createdAt: 1 });
    const teamById = new Map(teams.map((team) => [String(team._id), team]));
    teams.forEach((team) => {
        team.statistics = defaultStatistics();
        team.players = team.players.map((player) => (Object.assign(Object.assign({}, player), { statistics: defaultPlayerStatistics() })));
    });
    matches.forEach((match) => applyMatchStatsToTeams(match, teamById));
    teams.forEach((team) => {
        team.markModified("statistics");
        team.markModified("players");
    });
    await Promise.all(teams.map((team) => team.save()));
    return teams.sort((teamA, teamB) => {
        const pointsDiff = teamB.statistics.points - teamA.statistics.points;
        if (pointsDiff !== 0)
            return pointsDiff;
        const nrrDiff = teamB.statistics.netRunRate - teamA.statistics.netRunRate;
        if (nrrDiff !== 0)
            return nrrDiff;
        return teamA.name.localeCompare(teamB.name);
    });
};
const createTournament = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const name = normalizeText((_a = req.body) === null || _a === void 0 ? void 0 : _a.name);
        const organizerName = normalizeText((_b = req.body) === null || _b === void 0 ? void 0 : _b.organizerName);
        const startDate = parseDate((_c = req.body) === null || _c === void 0 ? void 0 : _c.startDate);
        const endDate = parseDate((_d = req.body) === null || _d === void 0 ? void 0 : _d.endDate);
        const location = normalizeText((_e = req.body) === null || _e === void 0 ? void 0 : _e.location);
        const ballType = (_f = req.body) === null || _f === void 0 ? void 0 : _f.ballType;
        const oversPerMatch = parsePositiveNumber((_g = req.body) === null || _g === void 0 ? void 0 : _g.oversPerMatch);
        const format = (_h = req.body) === null || _h === void 0 ? void 0 : _h.format;
        const squadMode = (_k = (_j = req.body) === null || _j === void 0 ? void 0 : _j.squadMode) !== null && _k !== void 0 ? _k : "teams_only";
        if (!name ||
            !organizerName ||
            !startDate ||
            !endDate ||
            !location ||
            !isBallType(ballType) ||
            !oversPerMatch ||
            !isTournamentFormat(format) ||
            !isTournamentSquadMode(squadMode)) {
            res.status(400).json({
                message: "Name, organizer name, start/end dates, location, ball type, overs per match, format, and squad mode are required",
            });
            return;
        }
        if (endDate < startDate) {
            res.status(400).json({ message: "End date must be after start date" });
            return;
        }
        if (ballType === "custom" && !normalizeText((_l = req.body) === null || _l === void 0 ? void 0 : _l.customBallType)) {
            res.status(400).json({ message: "Custom ball type is required" });
            return;
        }
        const tournament = await Tournament_1.Tournament.create({
            organizer: new mongoose_1.Types.ObjectId(userId),
            name,
            organizerName,
            startDate,
            endDate,
            location,
            logoUrl: normalizeOptionalText((_m = req.body) === null || _m === void 0 ? void 0 : _m.logoUrl),
            ballType,
            customBallType: ballType === "custom"
                ? normalizeText((_o = req.body) === null || _o === void 0 ? void 0 : _o.customBallType)
                : undefined,
            oversPerMatch,
            format,
            squadMode,
            status: "draft",
        });
        (0, analytics_1.trackEvent)(req, {
            type: "TOURNAMENT_CREATED",
            userId,
            metadata: { tournamentId: String(tournament._id), name: tournament.name },
        });
        res.status(201).json({
            tournament: await serializeTournament(tournament, userId, true),
        });
    }
    catch (error) {
        console.error("Create tournament error", error);
        res.status(500).json({ message: "Unable to create tournament" });
    }
};
exports.createTournament = createTournament;
const getTournaments = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const query = {
            organizer: new mongoose_1.Types.ObjectId(userId),
        };
        if (isTournamentStatus(req.query.status)) {
            query.status = req.query.status;
        }
        // GET /api/v1/tournaments?page=1&limit=20 -- page/limit are optional;
        // omitting them keeps the old page-1-of-20 default so existing callers
        // still work, they just stop getting everything past the first page.
        const pagination = (0, pagination_1.parsePagination)(req.query);
        const [total, tournaments] = await Promise.all([
            Tournament_1.Tournament.countDocuments(query),
            Tournament_1.Tournament.find(query)
                .sort({ startDate: -1, createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit),
        ]);
        res.status(200).json({
            tournaments: await Promise.all(tournaments.map((tournament) => serializeTournament(tournament, userId, true))),
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("Get tournaments error", error);
        res.status(500).json({ message: "Unable to load tournaments" });
    }
};
exports.getTournaments = getTournaments;
const getTournament = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const teams = await TournamentTeam_1.TournamentTeam.find({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
        }).sort({ createdAt: 1 });
        await syncMissingTeamLogos(teams);
        res.status(200).json({
            tournament: await serializeTournament(tournament, userId, true),
            teams: teams.map(serializeTeam),
        });
    }
    catch (error) {
        console.error("Get tournament error", error);
        res.status(500).json({ message: "Unable to load tournament" });
    }
};
exports.getTournament = getTournament;
const updateTournament = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const updates = {};
        if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) !== undefined)
            updates.name = normalizeText(req.body.name);
        if (((_b = req.body) === null || _b === void 0 ? void 0 : _b.organizerName) !== undefined) {
            updates.organizerName = normalizeText(req.body.organizerName);
        }
        if (((_c = req.body) === null || _c === void 0 ? void 0 : _c.location) !== undefined) {
            updates.location = normalizeText(req.body.location);
        }
        if (((_d = req.body) === null || _d === void 0 ? void 0 : _d.logoUrl) !== undefined) {
            updates.logoUrl = normalizeOptionalText(req.body.logoUrl);
        }
        if (((_e = req.body) === null || _e === void 0 ? void 0 : _e.oversPerMatch) !== undefined) {
            const oversPerMatch = parsePositiveNumber(req.body.oversPerMatch);
            if (!oversPerMatch) {
                res.status(400).json({ message: "Overs per match must be greater than 0" });
                return;
            }
            updates.oversPerMatch = oversPerMatch;
        }
        if (((_f = req.body) === null || _f === void 0 ? void 0 : _f.format) !== undefined) {
            if (!isTournamentFormat(req.body.format)) {
                res.status(400).json({ message: "Tournament format is not supported" });
                return;
            }
            updates.format = req.body.format;
        }
        if (((_g = req.body) === null || _g === void 0 ? void 0 : _g.squadMode) !== undefined) {
            if (!isTournamentSquadMode(req.body.squadMode)) {
                res.status(400).json({ message: "Tournament squad mode is not supported" });
                return;
            }
            updates.squadMode = req.body.squadMode;
        }
        if (((_h = req.body) === null || _h === void 0 ? void 0 : _h.ballType) !== undefined) {
            if (!isBallType(req.body.ballType)) {
                res.status(400).json({ message: "Ball type is not supported" });
                return;
            }
            updates.ballType = req.body.ballType;
        }
        if (((_j = req.body) === null || _j === void 0 ? void 0 : _j.customBallType) !== undefined) {
            updates.customBallType = normalizeOptionalText(req.body.customBallType);
        }
        if (((_k = req.body) === null || _k === void 0 ? void 0 : _k.status) !== undefined) {
            if (!isTournamentStatus(req.body.status)) {
                res.status(400).json({ message: "Tournament status is not supported" });
                return;
            }
            updates.status = req.body.status;
        }
        if (((_l = req.body) === null || _l === void 0 ? void 0 : _l.startDate) !== undefined) {
            const startDate = parseDate(req.body.startDate);
            if (!startDate) {
                res.status(400).json({ message: "Start date is invalid" });
                return;
            }
            updates.startDate = startDate;
        }
        if (((_m = req.body) === null || _m === void 0 ? void 0 : _m.endDate) !== undefined) {
            const endDate = parseDate(req.body.endDate);
            if (!endDate) {
                res.status(400).json({ message: "End date is invalid" });
                return;
            }
            updates.endDate = endDate;
        }
        const nextStartDate = (_o = updates.startDate) !== null && _o !== void 0 ? _o : tournament.startDate;
        const nextEndDate = (_p = updates.endDate) !== null && _p !== void 0 ? _p : tournament.endDate;
        if (nextEndDate < nextStartDate) {
            res.status(400).json({ message: "End date must be after start date" });
            return;
        }
        const nextBallType = (_q = updates.ballType) !== null && _q !== void 0 ? _q : tournament.ballType;
        const nextCustomBallType = (_r = updates.customBallType) !== null && _r !== void 0 ? _r : tournament.customBallType;
        if (nextBallType === "custom" && !nextCustomBallType) {
            res.status(400).json({ message: "Custom ball type is required" });
            return;
        }
        Object.assign(tournament, updates);
        await tournament.save();
        res.status(200).json({
            tournament: await serializeTournament(tournament, userId, true),
        });
    }
    catch (error) {
        console.error("Update tournament error", error);
        res.status(500).json({ message: "Unable to update tournament" });
    }
};
exports.updateTournament = updateTournament;
const deleteTournament = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        await TournamentMatch_1.TournamentMatch.deleteMany({ tournament: tournament._id });
        await TournamentTeam_1.TournamentTeam.deleteMany({ tournament: tournament._id });
        await tournament.deleteOne();
        res.status(200).json({ message: "Tournament deleted" });
    }
    catch (error) {
        console.error("Delete tournament error", error);
        res.status(500).json({ message: "Unable to delete tournament" });
    }
};
exports.deleteTournament = deleteTournament;
const createTournamentTeam = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const sourceTeamId = normalizeText((_a = req.body) === null || _a === void 0 ? void 0 : _a.sourceTeamId);
        const sourceTeam = mongoose_1.Types.ObjectId.isValid(sourceTeamId)
            ? await SavedPlayerTeam_1.SavedPlayerTeam.findOne({
                _id: new mongoose_1.Types.ObjectId(sourceTeamId),
                owner: new mongoose_1.Types.ObjectId(userId),
            })
            : null;
        const sourcePlayers = (_b = sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam.players.map((player) => ({
            playerId: player.playerId,
            username: player.username,
            name: player.name,
            role: player.role,
            contactNumber: player.contactNumber,
        }))) !== null && _b !== void 0 ? _b : [];
        const name = normalizeText((_c = req.body) === null || _c === void 0 ? void 0 : _c.name) || (sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam.name) || "";
        const captainName = normalizeText((_d = req.body) === null || _d === void 0 ? void 0 : _d.captainName) ||
            (sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam.captainName) ||
            ((_e = sourcePlayers[0]) === null || _e === void 0 ? void 0 : _e.name) ||
            "";
        const contactNumber = normalizeText((_f = req.body) === null || _f === void 0 ? void 0 : _f.contactNumber) ||
            (sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam.contactNumber) ||
            (sourceTeam ? "N/A" : "");
        const players = normalizePlayers(Array.isArray((_g = req.body) === null || _g === void 0 ? void 0 : _g.players) && req.body.players.length
            ? req.body.players
            : sourcePlayers);
        if (!name || !captainName || !contactNumber) {
            res.status(400).json({
                message: "Team name, captain name, and contact number are required",
            });
            return;
        }
        if (((_h = tournament.squadMode) !== null && _h !== void 0 ? _h : "teams_only") === "with_players" && !players.length) {
            res.status(400).json({
                message: "At least one player is required for this tournament",
            });
            return;
        }
        const team = await TournamentTeam_1.TournamentTeam.create({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
            sourceTeamId: sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam._id,
            name,
            logoUrl: (_k = normalizeOptionalText((_j = req.body) === null || _j === void 0 ? void 0 : _j.logoUrl)) !== null && _k !== void 0 ? _k : sourceTeam === null || sourceTeam === void 0 ? void 0 : sourceTeam.logoUrl,
            captainName,
            contactNumber,
            players,
            statistics: normalizeStatistics((_l = req.body) === null || _l === void 0 ? void 0 : _l.statistics),
        });
        res.status(201).json({ team: serializeTeam(team) });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            res.status(409).json({ message: "Team already exists in this tournament" });
            return;
        }
        console.error("Create tournament team error", error);
        res.status(500).json({ message: "Unable to create team" });
    }
};
exports.createTournamentTeam = createTournamentTeam;
const getTournamentTeams = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const teams = await TournamentTeam_1.TournamentTeam.find({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
        }).sort({ "statistics.points": -1, "statistics.netRunRate": -1, name: 1 });
        await syncMissingTeamLogos(teams);
        res.status(200).json({ teams: teams.map(serializeTeam) });
    }
    catch (error) {
        console.error("Get tournament teams error", error);
        res.status(500).json({ message: "Unable to load teams" });
    }
};
exports.getTournamentTeams = getTournamentTeams;
const getTournamentMatchesList = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const query = {
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
        };
        const status = normalizeText(req.query.status);
        if (["scheduled", "in_progress", "completed"].includes(status)) {
            query.status = status;
        }
        const [teams, matches] = await Promise.all([
            getTournamentTeamDocs(tournament._id, userId),
            TournamentMatch_1.TournamentMatch.find(query).sort({ completedAt: -1, createdAt: -1 }),
        ]);
        const teamById = new Map(teams.map((team) => [String(team._id), team]));
        res.status(200).json({
            matches: matches.map((match) => serializeMatch(match, teamById)),
        });
    }
    catch (error) {
        console.error("Get tournament matches error", error);
        res.status(500).json({ message: "Unable to load matches" });
    }
};
exports.getTournamentMatchesList = getTournamentMatchesList;
const mergeTournamentPlayers = (existingPlayers, incomingPlayers) => {
    const existingByPlayerId = new Map();
    const existingByName = new Map();
    existingPlayers.forEach((player) => {
        if (player.playerId) {
            existingByPlayerId.set(String(player.playerId), player);
        }
        existingByName.set(normalizePlayerKey(player.name), player);
    });
    return incomingPlayers.map((incoming) => {
        var _a;
        const existing = (incoming.playerId &&
            existingByPlayerId.get(String(incoming.playerId))) ||
            existingByName.get(normalizePlayerKey(incoming.name));
        return Object.assign(Object.assign({}, incoming), { _id: existing === null || existing === void 0 ? void 0 : existing._id, statistics: (_a = existing === null || existing === void 0 ? void 0 : existing.statistics) !== null && _a !== void 0 ? _a : defaultPlayerStatistics() });
    });
};
const updateTournamentTeam = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const team = await findOwnedTournamentTeam(req.params.teamId, tournament._id, userId);
        if (!team) {
            res.status(404).json({ message: "Team not found" });
            return;
        }
        if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) !== undefined)
            team.name = normalizeText(req.body.name);
        if (((_b = req.body) === null || _b === void 0 ? void 0 : _b.logoUrl) !== undefined) {
            team.logoUrl = normalizeOptionalText(req.body.logoUrl);
        }
        if (((_c = req.body) === null || _c === void 0 ? void 0 : _c.captainName) !== undefined) {
            team.captainName = normalizeText(req.body.captainName);
        }
        if (((_d = req.body) === null || _d === void 0 ? void 0 : _d.contactNumber) !== undefined) {
            team.contactNumber = normalizeText(req.body.contactNumber);
        }
        if (((_e = req.body) === null || _e === void 0 ? void 0 : _e.players) !== undefined) {
            const players = normalizePlayers(req.body.players);
            if (((_f = tournament.squadMode) !== null && _f !== void 0 ? _f : "teams_only") === "with_players" && !players.length) {
                res.status(400).json({
                    message: "At least one player is required for this tournament",
                });
                return;
            }
            team.players = mergeTournamentPlayers(team.players, players);
        }
        if (((_g = req.body) === null || _g === void 0 ? void 0 : _g.statistics) !== undefined || ((_h = req.body) === null || _h === void 0 ? void 0 : _h.stats) !== undefined) {
            team.statistics = normalizeStatistics((_j = req.body.statistics) !== null && _j !== void 0 ? _j : req.body.stats);
        }
        if (!team.name || !team.captainName || !team.contactNumber) {
            res.status(400).json({
                message: "Team name, captain name, and contact number are required",
            });
            return;
        }
        await team.save();
        res.status(200).json({ team: serializeTeam(team) });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            res.status(409).json({ message: "Team already exists in this tournament" });
            return;
        }
        console.error("Update tournament team error", error);
        res.status(500).json({ message: "Unable to update team" });
    }
};
exports.updateTournamentTeam = updateTournamentTeam;
const updateTournamentTeamPlayers = async (req, res) => {
    var _a;
    try {
        req.body = Object.assign(Object.assign({}, req.body), { players: (_a = req.body) === null || _a === void 0 ? void 0 : _a.players });
        await (0, exports.updateTournamentTeam)(req, res);
    }
    catch (error) {
        console.error("Update tournament team players error", error);
        res.status(500).json({ message: "Unable to update team players" });
    }
};
exports.updateTournamentTeamPlayers = updateTournamentTeamPlayers;
const updateTournamentTeamStatistics = async (req, res) => {
    var _a, _b, _c, _d;
    try {
        req.body = Object.assign(Object.assign({}, req.body), { statistics: (_d = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.statistics) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.stats) !== null && _d !== void 0 ? _d : req.body });
        await (0, exports.updateTournamentTeam)(req, res);
    }
    catch (error) {
        console.error("Update tournament team statistics error", error);
        res.status(500).json({ message: "Unable to update team statistics" });
    }
};
exports.updateTournamentTeamStatistics = updateTournamentTeamStatistics;
const deleteTournamentTeam = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const team = await findOwnedTournamentTeam(req.params.teamId, tournament._id, userId);
        if (!team) {
            res.status(404).json({ message: "Team not found" });
            return;
        }
        await TournamentMatch_1.TournamentMatch.deleteMany({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
            $or: [{ team1: team._id }, { team2: team._id }],
        });
        await team.deleteOne();
        await recalculateTournamentStatistics(tournament._id, userId);
        res.status(200).json({ message: "Team deleted" });
    }
    catch (error) {
        console.error("Delete tournament team error", error);
        res.status(500).json({ message: "Unable to delete team" });
    }
};
exports.deleteTournamentTeam = deleteTournamentTeam;
const recalculateTournamentTeamStatistics = async (req, res) => {
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const teams = await recalculateTournamentStatistics(tournament._id, userId);
        const completedMatches = await TournamentMatch_1.TournamentMatch.find({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
            status: "completed",
        }).sort({ completedAt: -1, createdAt: -1 });
        const teamById = new Map(teams.map((team) => [String(team._id), team]));
        res.status(200).json({
            message: "Points table synced",
            teams: teams.map(serializeTeam),
            completedMatches: completedMatches.map((match) => serializeMatch(match, teamById)),
            completedMatchesCount: completedMatches.length,
            tournament: await serializeTournament(tournament, userId, true),
        });
    }
    catch (error) {
        console.error("Recalculate tournament statistics error", error);
        res.status(500).json({ message: "Unable to recalculate statistics" });
    }
};
exports.recalculateTournamentTeamStatistics = recalculateTournamentTeamStatistics;
const startTournamentMatch = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const team1Id = normalizeText((_a = req.body) === null || _a === void 0 ? void 0 : _a.team1Id);
        const team2Id = normalizeText((_b = req.body) === null || _b === void 0 ? void 0 : _b.team2Id);
        if (!mongoose_1.Types.ObjectId.isValid(team1Id) ||
            !mongoose_1.Types.ObjectId.isValid(team2Id) ||
            team1Id === team2Id) {
            res.status(400).json({ message: "Two valid different teams are required" });
            return;
        }
        const teams = await TournamentTeam_1.TournamentTeam.find({
            _id: {
                $in: [new mongoose_1.Types.ObjectId(team1Id), new mongoose_1.Types.ObjectId(team2Id)],
            },
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
        });
        if (teams.length !== 2) {
            res.status(400).json({ message: "Both teams must belong to tournament" });
            return;
        }
        const pairKey = buildPairKey(team1Id, team2Id);
        const tossWinnerTeamId = getValidMatchTeamId((_c = req.body) === null || _c === void 0 ? void 0 : _c.tossWinnerTeamId, team1Id, team2Id);
        const tossDecision = normalizeText((_d = req.body) === null || _d === void 0 ? void 0 : _d.tossDecision);
        const battingFirstTeamId = getBattingFirstTeamId(req.body, team1Id, team2Id);
        if ((((_e = req.body) === null || _e === void 0 ? void 0 : _e.tossWinnerTeamId) && !tossWinnerTeamId) ||
            (((_f = req.body) === null || _f === void 0 ? void 0 : _f.tossDecision) &&
                tossDecision !== "bat" &&
                tossDecision !== "bowl") ||
            (((_g = req.body) === null || _g === void 0 ? void 0 : _g.battingFirstTeamId) && !battingFirstTeamId)) {
            res.status(400).json({
                message: "Toss winner, toss decision, and batting first team must match the fixture teams",
            });
            return;
        }
        const startedAt = new Date();
        let match = await TournamentMatch_1.TournamentMatch.findOne({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
            pairKey,
            status: { $ne: "completed" },
        });
        if (match) {
            match.status = "in_progress";
            match.startedAt = (_h = match.startedAt) !== null && _h !== void 0 ? _h : startedAt;
            match.scorerMatchId =
                normalizeText((_j = req.body) === null || _j === void 0 ? void 0 : _j.scorerMatchId) ||
                    normalizeText((_k = req.body) === null || _k === void 0 ? void 0 : _k.clientMatchId) ||
                    normalizeText((_l = req.body) === null || _l === void 0 ? void 0 : _l.gameId) ||
                    match.scorerMatchId;
            match.tossWinnerTeam = tossWinnerTeamId
                ? new mongoose_1.Types.ObjectId(tossWinnerTeamId)
                : match.tossWinnerTeam;
            match.tossDecision =
                tossDecision === "bat" || tossDecision === "bowl"
                    ? tossDecision
                    : match.tossDecision;
            match.battingFirstTeam = battingFirstTeamId
                ? new mongoose_1.Types.ObjectId(battingFirstTeamId)
                : match.battingFirstTeam;
            await match.save();
        }
        else {
            match = await TournamentMatch_1.TournamentMatch.create({
                tournament: tournament._id,
                organizer: new mongoose_1.Types.ObjectId(userId),
                team1: new mongoose_1.Types.ObjectId(team1Id),
                team2: new mongoose_1.Types.ObjectId(team2Id),
                pairKey,
                status: "in_progress",
                scorerMatchId: normalizeText((_m = req.body) === null || _m === void 0 ? void 0 : _m.scorerMatchId) ||
                    normalizeText((_o = req.body) === null || _o === void 0 ? void 0 : _o.clientMatchId) ||
                    normalizeText((_p = req.body) === null || _p === void 0 ? void 0 : _p.gameId) ||
                    undefined,
                tossWinnerTeam: tossWinnerTeamId
                    ? new mongoose_1.Types.ObjectId(tossWinnerTeamId)
                    : undefined,
                tossDecision: tossDecision === "bat" || tossDecision === "bowl"
                    ? tossDecision
                    : undefined,
                battingFirstTeam: battingFirstTeamId
                    ? new mongoose_1.Types.ObjectId(battingFirstTeamId)
                    : undefined,
                startedAt,
            });
            (0, analytics_1.trackEvent)(req, {
                type: "MATCH_STARTED",
                userId,
                metadata: {
                    matchId: String(match._id),
                    tournamentId: String(tournament._id),
                    mode: "tournament",
                },
            });
        }
        const teamById = new Map(teams.map((team) => [String(team._id), team]));
        res.status(200).json({
            match: serializeMatch(match, teamById),
            redirectTo: `/tournaments/${String(tournament._id)}`,
        });
    }
    catch (error) {
        console.error("Start tournament match error", error);
        res.status(500).json({ message: "Unable to start match" });
    }
};
exports.startTournamentMatch = startTournamentMatch;
const completeTournamentMatchFromSavedMatch = async (userId, body, req) => {
    var _a, _b;
    const resolved = await resolveTournamentMatchFromSavedMatchPayload(userId, body);
    if (!resolved) {
        return null;
    }
    const { tournament } = resolved;
    let { match } = resolved;
    if (!match) {
        const team1Id = normalizeText(body === null || body === void 0 ? void 0 : body.team1Id);
        const team2Id = normalizeText(body === null || body === void 0 ? void 0 : body.team2Id);
        if (!mongoose_1.Types.ObjectId.isValid(team1Id) ||
            !mongoose_1.Types.ObjectId.isValid(team2Id) ||
            team1Id === team2Id) {
            return null;
        }
        const teams = await findOwnedTournamentTeamsByIds(tournament._id, userId, [team1Id, team2Id]);
        if (teams.length !== 2) {
            return null;
        }
        match = await TournamentMatch_1.TournamentMatch.create({
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
            team1: new mongoose_1.Types.ObjectId(team1Id),
            team2: new mongoose_1.Types.ObjectId(team2Id),
            pairKey: buildPairKey(team1Id, team2Id),
            status: "in_progress",
            scorerMatchId: normalizeText(body === null || body === void 0 ? void 0 : body.scorerMatchId) ||
                normalizeText(body === null || body === void 0 ? void 0 : body.clientMatchId) ||
                normalizeText(body === null || body === void 0 ? void 0 : body.gameId) ||
                undefined,
            startedAt: new Date(),
        });
        (0, analytics_1.trackEvent)(req, {
            type: "MATCH_STARTED",
            userId,
            metadata: {
                matchId: String(match._id),
                tournamentId: String(tournament._id),
                mode: "tournament",
            },
        });
    }
    const teams = await TournamentTeam_1.TournamentTeam.find({
        _id: { $in: [match.team1, match.team2] },
        tournament: tournament._id,
        organizer: new mongoose_1.Types.ObjectId(userId),
    });
    const teamById = new Map(teams.map((team) => [String(team._id), team]));
    const team1Id = String(match.team1);
    const team2Id = String(match.team2);
    let winnerTeamId = normalizeText(body === null || body === void 0 ? void 0 : body.winnerTeamId);
    const winnerTeamName = normalizeText(body === null || body === void 0 ? void 0 : body.winnerTeamName);
    if (!winnerTeamId && winnerTeamName && winnerTeamName !== "Tied") {
        const winnerByName = [...teamById.values()].find((team) => team.name.toLowerCase() === winnerTeamName.toLowerCase());
        winnerTeamId = winnerByName ? String(winnerByName._id) : "";
    }
    const isCompleted = (body === null || body === void 0 ? void 0 : body.status) === "completed";
    const hasResult = Boolean(winnerTeamId ||
        winnerTeamName ||
        normalizeText(body === null || body === void 0 ? void 0 : body.resultText) ||
        (body === null || body === void 0 ? void 0 : body.team1Inning) ||
        (body === null || body === void 0 ? void 0 : body.team2Inning));
    if (!isCompleted && !hasResult) {
        match.status = match.status === "completed" ? "completed" : "in_progress";
        match.resultText = normalizeText(body === null || body === void 0 ? void 0 : body.resultText);
        match.scorerMatchId =
            normalizeText(body === null || body === void 0 ? void 0 : body.scorerMatchId) ||
                normalizeText(body === null || body === void 0 ? void 0 : body.clientMatchId) ||
                normalizeText(body === null || body === void 0 ? void 0 : body.gameId) ||
                match.scorerMatchId;
        match.snapshot = buildMatchStatSource(body);
        match.startedAt = (_a = match.startedAt) !== null && _a !== void 0 ? _a : new Date();
        await match.save();
        return {
            match: serializeMatch(match, teamById),
            teams: teams.map(serializeTeam),
            tournament: await serializeTournament(tournament, userId, true),
            redirectTo: `/tournaments/${String(tournament._id)}`,
        };
    }
    const isTie = !winnerTeamId || winnerTeamName === "Tied";
    if (!isTie && winnerTeamId !== team1Id && winnerTeamId !== team2Id) {
        return null;
    }
    match.status = "completed";
    match.winnerTeam = isTie ? undefined : new mongoose_1.Types.ObjectId(winnerTeamId);
    match.resultText = normalizeText(body === null || body === void 0 ? void 0 : body.resultText);
    match.scorerMatchId =
        normalizeText(body === null || body === void 0 ? void 0 : body.scorerMatchId) ||
            normalizeText(body === null || body === void 0 ? void 0 : body.clientMatchId) ||
            normalizeText(body === null || body === void 0 ? void 0 : body.gameId) ||
            match.scorerMatchId;
    match.snapshot = buildMatchStatSource(body);
    match.startedAt = (_b = match.startedAt) !== null && _b !== void 0 ? _b : new Date();
    match.completedAt = new Date();
    await match.save();
    (0, analytics_1.trackEvent)(req, {
        type: "MATCH_COMPLETED",
        userId,
        metadata: {
            matchId: String(match._id),
            tournamentId: String(tournament._id),
            mode: "tournament",
        },
    });
    const recalculatedTeams = await recalculateTournamentStatistics(tournament._id, userId);
    const recalculatedTeamById = new Map(recalculatedTeams.map((team) => [String(team._id), team]));
    return {
        match: serializeMatch(match, recalculatedTeamById),
        teams: recalculatedTeams.map(serializeTeam),
        tournament: await serializeTournament(tournament, userId, true),
        redirectTo: `/tournaments/${String(tournament._id)}`,
    };
};
exports.completeTournamentMatchFromSavedMatch = completeTournamentMatchFromSavedMatch;
const completeTournamentMatch = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    try {
        const userId = ensureAuthenticated(req, res);
        if (!userId)
            return;
        const tournament = await findOwnedTournament(req.params.tournamentId, userId);
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        let match = await resolveTournamentMatch(tournament._id, userId, req.params.matchId, req.body);
        if (!match) {
            const team1Id = normalizeText((_a = req.body) === null || _a === void 0 ? void 0 : _a.team1Id);
            const team2Id = normalizeText((_b = req.body) === null || _b === void 0 ? void 0 : _b.team2Id);
            if (!mongoose_1.Types.ObjectId.isValid(team1Id) ||
                !mongoose_1.Types.ObjectId.isValid(team2Id) ||
                team1Id === team2Id) {
                res.status(404).json({ message: "Match not found" });
                return;
            }
            const teams = await findOwnedTournamentTeamsByIds(tournament._id, userId, [team1Id, team2Id]);
            if (teams.length !== 2) {
                res.status(400).json({ message: "Both teams must belong to tournament" });
                return;
            }
            match = await TournamentMatch_1.TournamentMatch.create({
                tournament: tournament._id,
                organizer: new mongoose_1.Types.ObjectId(userId),
                team1: new mongoose_1.Types.ObjectId(team1Id),
                team2: new mongoose_1.Types.ObjectId(team2Id),
                pairKey: buildPairKey(team1Id, team2Id),
                status: "in_progress",
                scorerMatchId: normalizeText((_c = req.body) === null || _c === void 0 ? void 0 : _c.scorerMatchId) ||
                    normalizeText((_d = req.body) === null || _d === void 0 ? void 0 : _d.clientMatchId) ||
                    normalizeText((_e = req.body) === null || _e === void 0 ? void 0 : _e.gameId) ||
                    undefined,
                startedAt: new Date(),
            });
            (0, analytics_1.trackEvent)(req, {
                type: "MATCH_STARTED",
                userId,
                metadata: {
                    matchId: String(match._id),
                    tournamentId: String(tournament._id),
                    mode: "tournament",
                },
            });
        }
        const teams = await TournamentTeam_1.TournamentTeam.find({
            _id: { $in: [match.team1, match.team2] },
            tournament: tournament._id,
            organizer: new mongoose_1.Types.ObjectId(userId),
        });
        const teamById = new Map(teams.map((team) => [String(team._id), team]));
        const statSource = buildMatchStatSource(req.body);
        let winnerTeamId = normalizeText((_f = req.body) === null || _f === void 0 ? void 0 : _f.winnerTeamId);
        const winnerTeamName = normalizeText((_g = req.body) === null || _g === void 0 ? void 0 : _g.winnerTeamName);
        const team1Id = String(match.team1);
        const team2Id = String(match.team2);
        if (!winnerTeamId && winnerTeamName && winnerTeamName !== "Tied") {
            const winnerByName = [...teamById.values()].find((team) => team.name.toLowerCase() === winnerTeamName.toLowerCase());
            winnerTeamId = winnerByName ? String(winnerByName._id) : "";
        }
        const isTie = !winnerTeamId || winnerTeamName === "Tied";
        if (!isTie && winnerTeamId !== team1Id && winnerTeamId !== team2Id) {
            res.status(400).json({ message: "Winner team must be part of this match" });
            return;
        }
        if (!teamById.get(team1Id) || !teamById.get(team2Id)) {
            res.status(400).json({ message: "Match teams were not found" });
            return;
        }
        match.status = "completed";
        match.winnerTeam = isTie ? undefined : new mongoose_1.Types.ObjectId(winnerTeamId);
        match.resultText = normalizeText((_h = req.body) === null || _h === void 0 ? void 0 : _h.resultText);
        match.scorerMatchId =
            normalizeText((_j = req.body) === null || _j === void 0 ? void 0 : _j.scorerMatchId) ||
                normalizeText((_k = req.body) === null || _k === void 0 ? void 0 : _k.clientMatchId) ||
                normalizeText((_l = req.body) === null || _l === void 0 ? void 0 : _l.gameId) ||
                match.scorerMatchId;
        match.snapshot = statSource;
        match.startedAt = (_m = match.startedAt) !== null && _m !== void 0 ? _m : new Date();
        match.completedAt = new Date();
        await match.save();
        (0, analytics_1.trackEvent)(req, {
            type: "MATCH_COMPLETED",
            userId,
            metadata: {
                matchId: String(match._id),
                tournamentId: String(tournament._id),
                mode: "tournament",
            },
        });
        const recalculatedTeams = await recalculateTournamentStatistics(tournament._id, userId);
        const recalculatedTeamById = new Map(recalculatedTeams.map((team) => [String(team._id), team]));
        res.status(200).json({
            match: serializeMatch(match, recalculatedTeamById),
            teams: recalculatedTeams.map(serializeTeam),
            tournament: await serializeTournament(tournament, userId, true),
            redirectTo: `/tournaments/${String(tournament._id)}`,
        });
    }
    catch (error) {
        console.error("Complete tournament match error", error);
        res.status(500).json({ message: "Unable to complete match" });
    }
};
exports.completeTournamentMatch = completeTournamentMatch;
//# sourceMappingURL=tournamentController.js.map