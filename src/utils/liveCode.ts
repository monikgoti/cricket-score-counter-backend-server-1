import { randomInt } from "crypto";
import { TournamentMatch, type ITournamentMatch } from "../models/TournamentMatch";

// No 0/O or 1/I, so a code read out loud or typed from a screenshot works.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Permanent live-watch code for a tournament match: "T" + 6 characters.
 * Casual matches use random 6-character codes, so a 7-character "T…" code
 * can never clash with one of those.
 */
export const generateLiveCode = (): string => {
  let code = "T";
  for (let i = 0; i < 6; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
};

export const isTournamentLiveCode = (value: string): boolean => /^T[A-Z0-9]{6}$/.test(value);

/** Gives older matches (started before live codes existed) a code. */
export const ensureLiveCodes = async (matches: ITournamentMatch[]): Promise<void> => {
  await Promise.all(
    matches
      .filter((match) => !match.liveCode)
      .map(async (match) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const code = generateLiveCode();
          try {
            const result = await TournamentMatch.updateOne(
              { _id: match._id, liveCode: { $exists: false } },
              { $set: { liveCode: code } },
            );
            if (result.modifiedCount) match.liveCode = code;
            else {
              const fresh = await TournamentMatch.findById(match._id).select("liveCode").lean();
              match.liveCode = fresh?.liveCode;
            }
            return;
          } catch (error: any) {
            if (error?.code !== 11000) throw error; // code taken: try another
          }
        }
      }),
  );
};
