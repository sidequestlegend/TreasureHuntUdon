// treasure-hunt: TreasureHuntUdon (https://github.com/HoshouNeko/TreasureHuntUdon, MIT, (c) 2024 Hoshou Neko)
// on the portkit runtime. The classes bindings.json names by `type`; the build bundles this with bindings.json
// into pk-treasure-hunt.js. HiScoreElement.cs is not ported (used by nothing).

import type { GameDefinition, GameInstance } from "../portkit/src/index.ts";
import { PersistancePrize } from "./PersistancePrize.ts";
import { PersonalScoreList } from "./PersonalScoreList.ts";
import { GetCounts } from "./PlayerData.ts";
import { Scoreboard } from "./Scoreboard.ts";
import { KINDS } from "./Settings.ts";
import { TreasureHuntController } from "./TreasureHuntController.ts";
import { TreasureReturner } from "./TreasureReturner.ts";

const game: GameDefinition = {
  slug: "treasure-hunt",
  behaviours: { TreasureHuntController, TreasureReturner, Scoreboard, PersonalScoreList, PersistancePrize },
  debug: (instance: GameInstance) => debugHooks(instance),
};

/** Readers for Play-mode tests (window.__pk1.debug["treasure-hunt:<inst>"]): the hunt as this page holds it. */
function debugHooks(instance: GameInstance): Record<string, unknown> {
  const byType = <T>(type: string) => instance.behaviour(instance.bindings.behaviours.find((b) => b.type === type)!.id) as unknown as T;
  const controller = () => byType<TreasureHuntController>("TreasureHuntController");
  const me = () => instance.networking.LocalPlayer;
  return {
    pathOf: (key: string) => instance.bindings.objects[key]?.path ?? "",
    refIndex: (key: string) => instance.bindings.refs.indexOf(key),
    me: () => ({ sid: me().sid, uid: me().uid, name: me().displayName }),
    players: () => instance.networking.GetPlayers().map((p) => ({ sid: p.sid, uid: p.uid, name: p.displayName })),
    /** The pool as synced, and what this page shows of it. */
    hunt: () => {
      const c = controller();
      const slots = c.PoolSlots;
      return {
        active: c.isTreasureActive.slice(),
        shown: c.isTreasureActive.map((_, i) => c.IsShown(i)),
        positions: c.treasurePositions.map((p) => [p.x, p.y, p.z]),
        serials: c.spawnSerial.slice(),
        foundBy: c.foundBy.slice(),
        slots,
        wrapperPaths: slots.map((s) => instance.bindings.objects[`wrapper${s}`]?.path ?? ""),
        buttonPaths: slots.map((s) => instance.bindings.objects[`button${s}`]?.path ?? ""),
        zones: c.settings.zones.map((z) => ({ n: z.number, center: [z.center.x, z.center.y, z.center.z], size: [z.size.x, z.size.y, z.size.z], rotation: [z.rotation.x, z.rotation.y, z.rotation.z] })),
        findDistance: c.settings.findDistance,
        spawns: c.spawns,
        findsRequested: c.findsRequested,
        findsCredited: c.findsCredited,
        returnsRefused: c.returnsRefused,
        reachRefused: c.reachRefused,
        pickEffectsPlayed: c.pickEffectsPlayed,
        referee: instance.networking.IsReferee,
      };
    },
    /** The referee's last reach check: whose head, where its app put it, how far from the treasure, and the verdict. */
    headCheck: () => {
      const h = controller().lastHeadCheck;
      return h ? { sid: h.sid, index: h.index, head: h.head ? [h.head.x, h.head.y, h.head.z] : null, distance: Number.isFinite(h.distance) ? h.distance : -1, allowed: h.allowed, ok: h.ok } : null;
    },
    /** What a modified page would do: ask the referee for treasure `i` without this page's own reach check. */
    forceReturn: (i: number) => {
      const c = controller();
      (c as unknown as { SendCommand(method: string, ...args: unknown[]): void }).SendCommand("ReturnItem", i, c.spawnSerial[i]);
    },
    /** Saved counts of every player present, as this page reads them. */
    counts: () => instance.networking.GetPlayers().map((p) => ({ name: p.displayName, sid: p.sid, ...GetCounts(instance.perUser, p) })),
    kinds: () => KINDS.slice(),
    /** Where the runtime measures click reach from: the local head and hands as last reported, or the last teleport. */
    reach: () => {
      const inner = instance as unknown as { poses: { head: { position: { x: number; y: number; z: number } } } | null; position: { x: number; y: number; z: number } | null };
      const v = (p: { x: number; y: number; z: number } | null | undefined) => (p ? [p.x, p.y, p.z] : null);
      return { head: v(inner.poses?.head.position), position: v(inner.position) };
    },
    prizeShown: () => byType<PersistancePrize>("PersistancePrize").IsShown,
  };
}

export default game;
