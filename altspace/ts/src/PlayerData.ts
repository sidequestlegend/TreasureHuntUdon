// Port-only (PORT.md section 7 row 3): what stands in for VRChat's PlayerData.
//
// PORT.md planned a stand-in of about 90 lines. The runtime now provides it (portkit/src/peruser.ts, reached as
// `this.PlayerData` with upstream's call shape: GetInt(player, key), SetInt(key, value), OnPlayerRestored,
// OnPlayerDataUpdated). What is left here is this game's use of it:
//
//   where              localStorage  pk1.treasure-hunt.<inst>.<uid>.playerdata   (this device only)
//                      user state    pk1.treasure-hunt.<inst>.d                  (what everyone present reads)
//   keys               "Coin", "Gem", "Star"   int, the number found (TR:28-30, as upstream: the treasure's name)
//                      "prize"                 bool, the prize was unlocked (stands in for PP:33's persisted flag)
//
// The keys carry the instance key through their prefix, so two hunts in one world keep separate totals
// (PORT.md 10.1 row 16). Upstream's keys are world-wide.
//
// What is lost against VRChat (PORT.md 3.4): totals belong to this device, not the account.

import type { Player, PlayerDataView } from "../portkit/src/index.ts";
import { KINDS, type Kind } from "./Settings.ts";

/** The prize flag. Not a treasure name, so it cannot collide with a count. */
export const PRIZE_KEY = "prize";

/** The saved count of one kind for a player (a missing key reads 0, as PlayerData.GetInt does upstream). */
export function GetCount(data: PlayerDataView, player: Player, kind: Kind): number {
  return Math.max(0, data.GetInt(player, kind));
}

/** All three counts of a player. */
export function GetCounts(data: PlayerDataView, player: Player): Record<Kind, number> {
  const out = {} as Record<Kind, number>;
  for (const kind of KINDS) out[kind] = GetCount(data, player, kind);
  return out;
}

/** TR:29-30: the local player's count of `kind` goes up by one. */
export function AddFind(data: PlayerDataView, localPlayer: Player, kind: Kind): number {
  const currentValue = GetCount(data, localPlayer, kind);
  data.SetInt(kind, currentValue + 1);
  return currentValue + 1;
}

export function HasPrize(data: PlayerDataView, player: Player): boolean {
  return data.GetBool(player, PRIZE_KEY);
}
