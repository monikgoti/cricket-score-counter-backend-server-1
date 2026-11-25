"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const exploreController_1 = require("../controllers/exploreController");
// Login-free discovery: public players and tournaments. A token, when sent,
// lets organizers and squad players open their private tournaments too.
const router = (0, express_1.Router)();
router.use(authMiddleware_1.optionalAuth);
router.get("/players", exploreController_1.explorePlayers);
router.get("/tournaments", exploreController_1.exploreTournaments);
router.get("/tournaments/:tournamentId", exploreController_1.getPublicTournament);
router.get("/tournaments/:tournamentId/player-stats", exploreController_1.getPublicTournamentPlayerStats);
router.get("/tournaments/:tournamentId/matches/:matchId", exploreController_1.getPublicTournamentScorecard);
exports.default = router;
//# sourceMappingURL=exploreRoutes.js.map