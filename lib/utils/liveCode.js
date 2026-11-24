"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLiveCodes = exports.isTournamentLiveCode = exports.generateLiveCode = void 0;
const crypto_1 = require("crypto");
const TournamentMatch_1 = require("../models/TournamentMatch");
// No 0/O or 1/I, so a code read out loud or typed from a screenshot works.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/**
 * Permanent live-watch code for a tournament match: "T" + 6 characters.
 * Casual matches use random 6-character codes, so a 7-character "T…" code
 * can never clash with one of those.
 */
const generateLiveCode = () => {
    let code = "T";
    for (let i = 0; i < 6; i += 1)
        code += ALPHABET[(0, crypto_1.randomInt)(ALPHABET.length)];
    return code;
};
exports.generateLiveCode = generateLiveCode;
const isTournamentLiveCode = (value) => /^T[A-Z0-9]{6}$/.test(value);
exports.isTournamentLiveCode = isTournamentLiveCode;
/** Gives older matches (started before live codes existed) a code. */
const ensureLiveCodes = async (matches) => {
    await Promise.all(matches
        .filter((match) => !match.liveCode)
        .map(async (match) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const code = (0, exports.generateLiveCode)();
            try {
                const result = await TournamentMatch_1.TournamentMatch.updateOne({ _id: match._id, liveCode: { $exists: false } }, { $set: { liveCode: code } });
                if (result.modifiedCount)
                    match.liveCode = code;
                else {
                    const fresh = await TournamentMatch_1.TournamentMatch.findById(match._id).select("liveCode").lean();
                    match.liveCode = fresh === null || fresh === void 0 ? void 0 : fresh.liveCode;
                }
                return;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) !== 11000)
                    throw error; // code taken: try another
            }
        }
    }));
};
exports.ensureLiveCodes = ensureLiveCodes;
//# sourceMappingURL=liveCode.js.map