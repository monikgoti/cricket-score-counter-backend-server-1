"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv").config();
const express_1 = __importDefault(require("express"));
const http = __importStar(require("http"));
const database_1 = require("./config/database");
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const playerRoutes_1 = __importDefault(require("./routes/playerRoutes"));
const playerTeamRoutes_1 = __importDefault(require("./routes/playerTeamRoutes"));
const promoBannerRoutes_1 = __importDefault(require("./routes/promoBannerRoutes"));
const publicPlayerRoutes_1 = __importDefault(require("./routes/publicPlayerRoutes"));
const savedMatchRoutes_1 = __importDefault(require("./routes/savedMatchRoutes"));
const statsRoutes_1 = __importDefault(require("./routes/statsRoutes"));
const tournamentRoutes_1 = __importDefault(require("./routes/tournamentRoutes"));
const constant_1 = require("./utils/constant");
const socketState_1 = require("./utils/socketState");
const socket_io_1 = require("socket.io");
const gameScores = new Map();
const gameScoresClient = new Map();
const formatOvers = (over, ball) => {
    const safeOver = Number.isFinite(over) ? over : 0;
    const safeBall = Number.isFinite(ball) ? ball : 0;
    return `${safeOver}.${safeBall}`;
};
const formatRate = (rate) => {
    if (!Number.isFinite(rate)) {
        return "0.0";
    }
    return rate.toFixed(1);
};
const buildStatusText = (payload) => {
    const score = typeof payload.score === "number" ? payload.score : null;
    const targetScore = typeof payload.targetScore === "number" ? payload.targetScore : null;
    const remainingBalls = typeof payload.remainingBalls === "number" ? payload.remainingBalls : null;
    const targetOvers = typeof payload.targetOvers === "number" ? payload.targetOvers : null;
    const currentOver = typeof payload.currentOver === "number" ? payload.currentOver : null;
    const currentBallOfOver = typeof payload.currentBallOfOver === "number"
        ? payload.currentBallOfOver
        : null;
    if (score === null) {
        return null;
    }
    const ballsFaced = currentOver !== null && currentBallOfOver !== null
        ? currentOver * 6 + currentBallOfOver
        : null;
    if (targetScore && targetScore > 0) {
        if (remainingBalls === null) {
            const needs = targetScore - score;
            return needs > 0 ? `Needs ${needs}` : "Won";
        }
        const needs = targetScore - score;
        if (needs <= 0) {
            return "Won";
        }
        if (remainingBalls <= 0) {
            return "Final Over";
        }
        if (remainingBalls <= 6) {
            return "Last 6 balls";
        }
        if (remainingBalls <= 12) {
            return `Needs ${needs} in ${remainingBalls}`;
        }
        const rrr = (needs * 6) / remainingBalls;
        return `RRR ${formatRate(rrr)}`;
    }
    if (ballsFaced && ballsFaced > 0) {
        const crr = (score * 6) / ballsFaced;
        return `CRR ${formatRate(crr)}`;
    }
    if (targetOvers && targetOvers > 0 && remainingBalls === 0) {
        return "Final Over";
    }
    return null;
};
const buildLiveUpdateFromScore = (payload) => {
    const teamName = Array.isArray(payload.teams) && typeof payload.teams[0] === "string"
        ? payload.teams[0]
        : null;
    const score = typeof payload.score === "number" ? payload.score : null;
    const wickets = typeof payload.wickets === "number" ? payload.wickets : null;
    const currentOver = typeof payload.currentOver === "number" ? payload.currentOver : null;
    const currentBallOfOver = typeof payload.currentBallOfOver === "number"
        ? payload.currentBallOfOver
        : null;
    const statusText = buildStatusText(payload);
    if (teamName === null ||
        score === null ||
        wickets === null ||
        currentOver === null ||
        currentBallOfOver === null) {
        return null;
    }
    // The scorer broadcasts its current snapshot the moment a match's
    // scoring screen finishes loading (openers picked, ready for ball one) --
    // not only after each ball -- so the very first broadcast for every
    // single match is 0/0 (0.0), before a single ball has actually been
    // bowled. Without this check, that placeholder state (or a match
    // abandoned right after starting, whose last-known state is still this
    // same zero snapshot since it never sent another update) sits in
    // `gameScores` and surfaces on the home page's "live" ticker looking
    // like an active match, when there's nothing live about it yet.
    const hasFacedAnyBalls = currentOver > 0 || currentBallOfOver > 0;
    if (!hasFacedAnyBalls && score === 0 && wickets === 0) {
        return null;
    }
    const oversText = formatOvers(currentOver, currentBallOfOver);
    const scoreText = `${teamName} ${score}/${wickets} (${oversText})`;
    if (statusText) {
        return `${scoreText}  •  ${statusText}`;
    }
    return scoreText;
};
const toLiveUpdateText = (payload) => {
    if (typeof payload === "string") {
        return payload.trim().length > 0 ? payload : null;
    }
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const candidateKeys = [
        "liveUpdateText",
        "homePageText",
        "summary",
        "scoreSummary",
        "statusText",
        "displayText",
        "scoreText",
        "text",
    ];
    for (const key of candidateKeys) {
        const value = payload[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return buildLiveUpdateFromScore(payload);
};
const getLiveUpdatesPayload = () => {
    const liveUpdates = [];
    for (const [gameId, score] of gameScores.entries()) {
        const text = toLiveUpdateText(score);
        if (text) {
            liveUpdates.push({ gameId, text });
        }
    }
    return liveUpdates;
};
const app = (0, express_1.default)();
const server = http.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
    },
});
(0, socketState_1.setSocketServer)(io);
const broadcastActiveUsersCount = () => {
    io.emit(constant_1.SocketIOEvents.ACTIVE_USERS_COUNT, JSON.stringify({ count: io.engine.clientsCount }));
};
app.get("/", (req, res) => {
    res.send("Socket.IO server is running!");
});
app.use(express_1.default.json({ limit: "50mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Refresh-Token");
    res.header("Access-Control-Expose-Headers", "X-Access-Token");
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});
app.use("/api/v1/auth", authRoutes_1.default);
app.use("/api/v1/players", playerRoutes_1.default);
app.use("/api/v1/player-teams", playerTeamRoutes_1.default);
app.use("/api/v1/promo-banner", promoBannerRoutes_1.default);
app.use("/api/v1/public-players", publicPlayerRoutes_1.default);
app.use("/api/v1/matches", savedMatchRoutes_1.default);
app.use("/api/v1/tournaments", tournamentRoutes_1.default);
app.use("/api/v1/stats", statsRoutes_1.default);
app.use("/api/v1/analytics", analyticsRoutes_1.default);
io.on("connection", (socket) => {
    socket.id && console.log(`New client connected: ${socket.id}`);
    broadcastActiveUsersCount();
    // On game join
    socket.on(constant_1.SocketIOClientEvents.GAME_JOIN, (roomID) => {
        socket.join(roomID);
        if (gameScores.has(roomID)) {
            socket.emit(constant_1.SocketIOEvents.GAME_SCORE_UPDATED, JSON.stringify(gameScores.get(roomID)));
        }
    });
    // On game end
    socket.on(constant_1.SocketIOClientEvents.GAME_END, (roomID) => {
        socket.leave(roomID);
        if (gameScores.has(roomID)) {
            gameScores.delete(roomID);
            gameScoresClient.delete(socket.id);
        }
    });
    // On game score update
    socket.on(constant_1.SocketIOClientEvents.GAME_SCORE_UPDATE, (data) => {
        const { gameId } = data || {};
        if (gameId) {
            gameScores.set(gameId, data);
            gameScoresClient.set(socket.id, gameId);
            io.to(gameId).emit(constant_1.SocketIOEvents.GAME_SCORE_UPDATED, JSON.stringify(data));
        }
    });
    // On live updates request (home screen)
    socket.on(constant_1.SocketIOClientEvents.LIVE_UPDATES, () => {
        const liveUpdates = getLiveUpdatesPayload();
        socket.emit(constant_1.SocketIOEvents.LIVE_UPDATES, JSON.stringify(liveUpdates));
    });
    // On home page view, send all running matches
    socket.on(constant_1.SocketIOClientEvents.HOME_PAGE_VIEW, () => {
        const liveUpdates = getLiveUpdatesPayload();
        socket.emit(constant_1.SocketIOEvents.LIVE_UPDATES, JSON.stringify(liveUpdates));
    });
    socket.on("disconnect", (reason) => {
        const gameId = gameScoresClient.get(socket.id);
        console.log("gameScoresClient", gameScoresClient);
        console.log("gameId", gameId);
        if (gameId) {
            gameScores.delete(gameId);
        }
        gameScoresClient.delete(socket.id);
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
        broadcastActiveUsersCount();
    });
});
const PORT = process.env.PORT || 3000;
(0, database_1.connectDatabase)()
    .then(() => {
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
})
    .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map