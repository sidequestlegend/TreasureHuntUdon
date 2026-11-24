// Set-up shared by the scenario tests: the game on a fake room, and ways to look at one player's page.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Player } from "../portkit/src/index.ts";
import type { FakeClient, FakeRoomOptions } from "../portkit/src/platform/fake.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import game from "../src/index.ts";
import type { PersistancePrize } from "../src/PersistancePrize.ts";
import type { PersonalScoreList } from "../src/PersonalScoreList.ts";
import type { Scoreboard } from "../src/Scoreboard.ts";
import type { TreasureHuntController } from "../src/TreasureHuntController.ts";

export const SLUG = "treasure-hunt";
export { game };

export function bindings(): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL("../bindings.json", import.meta.url)), "utf8"));
}

export function makeWorld(options: FakeRoomOptions = {}): TestWorld {
  return new TestWorld(game, bindings(), options);
}

export const controller = (w: TestWorld, c: FakeClient, inst = "0") => w.behaviour<TreasureHuntController>(c, "controller", inst);
export const scoreboard = (w: TestWorld, c: FakeClient, inst = "0") => w.behaviour<Scoreboard>(c, "scoreboard", inst);
export const personal = (w: TestWorld, c: FakeClient, inst = "0") => w.behaviour<PersonalScoreList>(c, "personal", inst);
export const prize = (w: TestWorld, c: FakeClient, inst = "0") => w.behaviour<PersistancePrize>(c, "prize", inst);

/** Pool indexes whose treasure is out, as this client holds the synced flags. */
export function activeIndexes(w: TestWorld, c: FakeClient, inst = "0"): number[] {
  const flags = controller(w, c, inst).isTreasureActive;
  return flags.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
}

/** The bindings key of the return button of pool index `i`. */
export function buttonOf(w: TestWorld, c: FakeClient, i: number, inst = "0"): string {
  return `button${controller(w, c, inst).PoolSlots[i]}`;
}

/** Runs until some treasure is out (as `c` sees it) and returns its pool index. */
export async function waitForTreasure(w: TestWorld, c: FakeClient, inst = "0", maxMs = 20000): Promise<number> {
  const ok = await w.room.runUntil(() => activeIndexes(w, c, inst).length > 0, maxMs);
  if (!ok) throw new Error("no treasure spawned in time");
  return activeIndexes(w, c, inst)[0]!;
}

/** This client's view of another client as a Player. */
export function playerOf(w: TestWorld, viewer: FakeClient, who: FakeClient, inst = "0"): Player {
  const p = w.instance(viewer, inst).networking.GetPlayers().find((x) => x.sid === who.sid);
  if (!p) throw new Error(`${viewer.name} does not see ${who.name}`);
  return p;
}

/** A saved count as `viewer` reads it for `who` (PlayerData.GetInt). */
export function countOf(w: TestWorld, viewer: FakeClient, who: FakeClient, kind: string, inst = "0"): number {
  return w.instance(viewer, inst).perUser.GetInt(playerOf(w, viewer, who, inst), kind);
}

/** Whether a kit object is active on this client: through the relay (refs) or the page (everything else). */
export function isActive(c: FakeClient, key: string, inst = "0"): boolean {
  const viaGraph = c.graph(SLUG, inst).active.get(key);
  if (viaGraph !== undefined) return viaGraph;
  return c.object(SLUG, inst, key).active;
}

/** The scoreboard rows of list `l` as the kit shows them: "name score" per visible row. */
export function boardRows(c: FakeClient, l: number, inst = "0"): string[] {
  const out: string[] = [];
  const text = c.graph(SLUG, inst).text;
  for (let r = 0; r < 16; r++) {
    if (!isActive(c, `row${l}_${r}`, inst)) continue;
    out.push(`${text.get(`rowName${l}_${r}`) ?? ""} ${text.get(`rowScore${l}_${r}`) ?? ""}`);
  }
  return out;
}

/** The personal list as the kit shows it. */
export function personalRows(c: FakeClient, inst = "0"): string[] {
  const out: string[] = [];
  const text = c.graph(SLUG, inst).text;
  for (let r = 0; r < 3; r++) {
    if (!isActive(c, `pRow${r}`, inst)) continue;
    out.push(`${text.get(`pRowName${r}`) ?? ""} ${text.get(`pRowScore${r}`) ?? ""}`);
  }
  return out;
}
