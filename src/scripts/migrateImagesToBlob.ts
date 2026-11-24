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
import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database";
import { MediaImage } from "../models/MediaImage";
import { Tournament } from "../models/Tournament";
import { TournamentTeam } from "../models/TournamentTeam";
import { SavedPlayerTeam } from "../models/SavedPlayerTeam";
import { isBlobStorageEnabled, putImageDataUrl } from "../utils/blobStorage";
import { mediaPath } from "../controllers/mediaController";

const apply = process.argv.includes("--apply");

const run = async () => {
  if (!isBlobStorageEnabled()) throw new Error("Set BLOB_READ_WRITE_TOKEN first.");
  await connectDatabase();
  console.log(apply ? "Moving images to Vercel Blob…" : "Dry run (add --apply to move images).");

  // Team logos uploaded through /media/images.
  let teamImages = 0;
  let linksUpdated = 0;
  for await (const image of MediaImage.find({ data: { $exists: true, $ne: null } }).select("+data")) {
    teamImages += 1;
    if (!apply || !image.data) continue;
    const url = await putImageDataUrl(image.data, `team-logos/${String(image.owner)}`);
    const oldPath = mediaPath(image._id);
    const [a, b] = await Promise.all([
      TournamentTeam.updateMany({ logoUrl: oldPath }, { $set: { logoUrl: url } }),
      SavedPlayerTeam.updateMany({ logoUrl: oldPath }, { $set: { logoUrl: url } }),
    ]);
    linksUpdated += a.modifiedCount + b.modifiedCount;
    await MediaImage.updateOne({ _id: image._id }, { $set: { url }, $unset: { data: 1 } });
  }

  // Tournament logos stored on the tournament itself.
  let tournamentLogos = 0;
  for await (const tournament of Tournament.find({ logoData: { $exists: true, $ne: null } }).select("+logoData")) {
    tournamentLogos += 1;
    if (!apply || !tournament.logoData) continue;
    const url = await putImageDataUrl(tournament.logoData, `tournament-logos/${String(tournament._id)}`);
    await Tournament.updateOne(
      { _id: tournament._id },
      { $set: { logoUrl: url, logoVersion: 0 }, $unset: { logoData: 1 } },
    );
  }

  console.log(
    `${apply ? "Moved" : "Would move"} ${teamImages} team logo(s) and ${tournamentLogos} tournament logo(s).` +
      (apply ? ` Updated ${linksUpdated} team link(s).` : ""),
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
