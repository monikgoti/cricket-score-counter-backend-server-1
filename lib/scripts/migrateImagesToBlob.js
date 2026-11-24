"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time move of images stored in MongoDB to Vercel Blob.
 *
 *   npm run build
 *   node lib/scripts/migrateImagesToBlob.js          # dry run: only counts
 *   node lib/scripts/migrateImagesToBlob.js --apply  # does the move
 *
 * Needs MONGODB_URI and BLOB_READ_WRITE_TOKEN in the environment (.env works).
 * Safe to run more than once: images already moved are skipped. Old
 * /api/v1/media/<id> and /tournaments/<id>/logo links keep working either
 * way, since those endpoints redirect to the Blob copy.
 */
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const MediaImage_1 = require("../models/MediaImage");
const Tournament_1 = require("../models/Tournament");
const TournamentTeam_1 = require("../models/TournamentTeam");
const SavedPlayerTeam_1 = require("../models/SavedPlayerTeam");
const blobStorage_1 = require("../utils/blobStorage");
const mediaController_1 = require("../controllers/mediaController");
const apply = process.argv.includes("--apply");
const run = async () => {
    var _a, e_1, _b, _c, _d, e_2, _e, _f;
    if (!(0, blobStorage_1.isBlobStorageEnabled)())
        throw new Error("Set BLOB_READ_WRITE_TOKEN first.");
    await (0, database_1.connectDatabase)();
    console.log(apply ? "Moving images to Vercel Blob…" : "Dry run (add --apply to move images).");
    // Team logos uploaded through /media/images.
    let teamImages = 0;
    let linksUpdated = 0;
    try {
        for (var _g = true, _h = __asyncValues(MediaImage_1.MediaImage.find({ data: { $exists: true, $ne: null } }).select("+data")), _j; _j = await _h.next(), _a = _j.done, !_a; _g = true) {
            _c = _j.value;
            _g = false;
            const image = _c;
            teamImages += 1;
            if (!apply || !image.data)
                continue;
            const url = await (0, blobStorage_1.putImageDataUrl)(image.data, `team-logos/${String(image.owner)}`);
            const oldPath = (0, mediaController_1.mediaPath)(image._id);
            const [a, b] = await Promise.all([
                TournamentTeam_1.TournamentTeam.updateMany({ logoUrl: oldPath }, { $set: { logoUrl: url } }),
                SavedPlayerTeam_1.SavedPlayerTeam.updateMany({ logoUrl: oldPath }, { $set: { logoUrl: url } }),
            ]);
            linksUpdated += a.modifiedCount + b.modifiedCount;
            await MediaImage_1.MediaImage.updateOne({ _id: image._id }, { $set: { url }, $unset: { data: 1 } });
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_g && !_a && (_b = _h.return)) await _b.call(_h);
        }
        finally { if (e_1) throw e_1.error; }
    }
    // Tournament logos stored on the tournament itself.
    let tournamentLogos = 0;
    try {
        for (var _k = true, _l = __asyncValues(Tournament_1.Tournament.find({ logoData: { $exists: true, $ne: null } }).select("+logoData")), _m; _m = await _l.next(), _d = _m.done, !_d; _k = true) {
            _f = _m.value;
            _k = false;
            const tournament = _f;
            tournamentLogos += 1;
            if (!apply || !tournament.logoData)
                continue;
            const url = await (0, blobStorage_1.putImageDataUrl)(tournament.logoData, `tournament-logos/${String(tournament._id)}`);
            await Tournament_1.Tournament.updateOne({ _id: tournament._id }, { $set: { logoUrl: url, logoVersion: 0 }, $unset: { logoData: 1 } });
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (!_k && !_d && (_e = _l.return)) await _e.call(_l);
        }
        finally { if (e_2) throw e_2.error; }
    }
    console.log(`${apply ? "Moved" : "Would move"} ${teamImages} team logo(s) and ${tournamentLogos} tournament logo(s).` +
        (apply ? ` Updated ${linksUpdated} team link(s).` : ""));
};
run()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(() => mongoose_1.default.disconnect());
//# sourceMappingURL=migrateImagesToBlob.js.map