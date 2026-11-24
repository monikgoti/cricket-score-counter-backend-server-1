import { Types } from "mongoose";
import { PlayerIdentity, type IPlayerIdentity } from "../models/PlayerIdentity";
import { Notification, type NotificationType } from "../models/Notification";

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,22}[a-z0-9])$/;

const toUsernameBase = (name: string) => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : `player.${Date.now().toString(36)}`;
};

export const generateUniqueUsername = async (name: string) => {
  const base = toUsernameBase(name);
  let username = base;
  let suffix = 1;
  while (await PlayerIdentity.exists({ username })) {
    suffix += 1;
    username = `${base}.${suffix}`;
  }
  return username;
};

/** Path the app uses to load a player's photo (cache-busted by version). */
export const avatarPath = (player: Pick<IPlayerIdentity, "_id" | "avatarVersion">) =>
  player.avatarVersion ? `/api/v1/players/${String(player._id)}/avatar?v=${player.avatarVersion}` : "";

/**
 * Fields that are safe to show anyone. Never includes the phone number or the
 * owning account.
 */
export const serializePublicPlayer = (player: IPlayerIdentity | (Record<string, any> & { _id: unknown })) => ({
  id: String(player._id),
  name: player.name as string,
  username: player.username as string,
  role: (player.role as string) ?? "",
  city: (player.city as string) ?? "",
  battingStyle: (player.battingStyle as string) ?? "",
  bowlingStyle: (player.bowlingStyle as string) ?? "",
  registered: Boolean(player.user),
  avatarUrl: avatarPath(player as IPlayerIdentity),
});

/** Follows claim merges so an old record id always resolves to the live profile. */
export const resolveLiveIdentity = async (
  id: Types.ObjectId | string,
): Promise<IPlayerIdentity | null> => {
  let current = await PlayerIdentity.findById(id);
  for (let hops = 0; current?.mergedInto && hops < 5; hops += 1) {
    current = await PlayerIdentity.findById(current.mergedInto);
  }
  return current;
};

export const notify = async (
  userId: Types.ObjectId | string | undefined | null,
  type: NotificationType,
  title: string,
  body: string,
  link?: string,
  data?: Record<string, unknown>,
) => {
  if (!userId) return;
  try {
    await Notification.create({ user: userId, type, title, body, link, data });
  } catch (error) {
    // Notifications are best-effort; never fail the main action over one.
    console.error("notify failed", error);
  }
};

/**
 * Tells registered players they were added to a squad. `previousIds` are the
 * player ids on the roster before the change, so only new additions are
 * notified, and the organizer is never notified about themselves.
 */
export const notifyAddedPlayers = async (
  previousIds: Set<string>,
  playerIds: Array<Types.ObjectId | string | undefined>,
  actorUserId: string,
  message: { type: NotificationType; title: string; body: string; link: string; data?: Record<string, unknown> },
) => {
  const added = Array.from(
    new Set(playerIds.filter(Boolean).map(String).filter((id) => !previousIds.has(id))),
  );
  if (!added.length) return;
  const owners = await PlayerIdentity.find({ _id: { $in: added }, user: { $exists: true } })
    .select("user")
    .lean();
  await Promise.all(
    owners
      .filter((o) => o.user && String(o.user) !== actorUserId)
      .map((o) => notify(o.user, message.type, message.title, message.body, message.link, message.data)),
  );
};
