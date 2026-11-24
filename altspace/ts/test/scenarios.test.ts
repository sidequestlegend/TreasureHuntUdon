// Rung 1, several players on the fake room with virtual time (PORT.md 9.2).

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafBudget, statePrefix, Vector3 } from "../portkit/src/index.ts";
import { storagePrefix } from "../portkit/src/names.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import type { TestWorld } from "../portkit/src/testing.ts";
import { readSettings, zoneRotation } from "../src/Settings.ts";
import {
  activeIndexes,
  boardRows,
  buttonOf,
  controller,
  countOf,
  game,
  isActive,
  makeWorld,
  personalRows,
  prize,
  scoreboard,
  SLUG,
  waitForTreasure,
} from "./helpers.ts";

const FAST = { "timer-min": "0.5", "timer-max": "1" };
/** The next spawn comes 4-5 s after the first: a found treasure cannot be out again while a test looks. */
const SLOW = { "timer-min": "4", "timer-max": "5" };

const totalFinds = (w: TestWorld, viewer: FakeClient, who: FakeClient, inst = "0") =>
  countOf(w, viewer, who, "Coin", inst) + countOf(w, viewer, who, "Gem", inst) + countOf(w, viewer, who, "Star", inst);

const referee = (w: TestWorld, clients: FakeClient[], inst = "0") => clients.find((c) => w.instance(c, inst).networking.IsReferee)!;

/** Saved counts on a device, as an earlier visit would have left them. */
function seedDevice(w: TestWorld, device: string, uid: string, data: Record<string, unknown>, inst = "0"): void {
  w.room.device(device).set(storagePrefix(SLUG, inst, uid) + "playerdata", JSON.stringify(data));
}

test("treasures appear inside the zones, never more than max-active, and every player sees the same", async () => {
  const w = makeWorld({ seed: 11 });
  const attrs = { ...FAST, "max-active": "3", "zone2-rotation": "0 45 0" };
  const clients = [w.join({ name: "Ann", elements: [attrs] }), w.join({ name: "Bob", elements: [attrs] })];
  await w.settle();
  const settings = readSettings(new Map(Object.entries(attrs)));
  for (let t = 0; t < 30; t++) {
    await w.run(1000);
    for (const c of clients) assert.ok(activeIndexes(w, c).length <= 3);
  }
  await w.run(500);
  const ann = controller(w, clients[0]!);
  assert.equal(activeIndexes(w, clients[0]!).length, 3, "the cap is reached");
  for (const i of activeIndexes(w, clients[0]!)) {
    const p = ann.treasurePositions[i]!;
    const inside = settings.zones.some((z) => {
      const local = zoneRotation(z).inverse.rotate(p.sub(z.center));
      return Math.abs(local.x) <= z.size.x / 2 + 0.001 && Math.abs(local.y) <= z.size.y / 2 + 0.001 && Math.abs(local.z) <= z.size.z / 2 + 0.001;
    });
    assert.ok(inside, `treasure ${i} at ${p} is in no zone`);
    // The page put the wrapper there and shows it, on both clients.
    for (const c of clients) {
      const slot = controller(w, c).PoolSlots[i]!;
      assert.ok(isActive(c, `wrapper${slot}`));
      assert.ok(Vector3.Distance(c.object(SLUG, "0", `wrapper${slot}`).truePosition, p) < 1e-6);
    }
  }
  assert.ok(w.agree());
  assert.deepEqual(w.problems(), []);
});

test("a find: the finder is credited once, the treasure hides for everyone with one pick effect each", async () => {
  const w = makeWorld({ seed: 12 });
  const [ann, bob, cat] = [w.join({ name: "Ann", elements: [SLOW] }), w.join({ name: "Bob", elements: [SLOW] }), w.join({ name: "Cat", elements: [SLOW] })];
  await w.settle();
  const i = await waitForTreasure(w, bob);
  await w.run(300);
  const kind = controller(w, bob).PoolKinds()[i]!;
  const effectsBefore = [ann, bob, cat].map((c) => controller(w, c).pickEffectsPlayed);
  assert.ok(bob.click(SLUG, "0", buttonOf(w, bob, i)));
  // The finder's own page hides it at once.
  assert.equal(controller(w, bob).IsShown(i), false);
  await w.run(2000);
  for (const c of [ann, bob, cat]) {
    assert.equal(controller(w, c).isTreasureActive[i], false);
    assert.equal(controller(w, c).IsShown(i), false);
    assert.equal(isActive(c, `wrapper${controller(w, c).PoolSlots[i]}`), false);
    assert.equal(countOf(w, c, bob, kind), 1, `${c.name} reads Bob's ${kind}`);
    assert.equal(totalFinds(w, c, ann), 0);
  }
  assert.deepEqual([ann, bob, cat].map((c, n) => controller(w, c).pickEffectsPlayed - effectsBefore[n]!), [1, 1, 1]);
  // The pick effect's particles went through the relay graph.
  assert.ok(ann.graph(SLUG).events.some((e) => e.op === "particles" && e.args[0] === "play"));
  assert.equal(controller(w, bob).findsCredited, 1);
  // Bob's own "found:" panel and everyone's board.
  assert.ok(personalRows(bob).includes(`${kind} 1`));
  const list = ["Coin", "Gem", "Star"].indexOf(kind);
  assert.equal(boardRows(cat, list)[0], "Bob 1");
  assert.ok(w.agree());
  assert.deepEqual(w.problems(), []);
});

test("two players find the same treasure at once: it is credited once, whoever is referee", async () => {
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    const w = makeWorld({ seed });
    const clients = [w.join({ name: "Ann", elements: [SLOW] }), w.join({ name: "Bob", elements: [SLOW] }), w.join({ name: "Cat", elements: [SLOW] })];
    await w.settle();
    const i = await waitForTreasure(w, clients[2]!);
    await w.run(300);
    // Half the runs the referee is one of the two finders, half it is not.
    const ref = referee(w, clients);
    const others = clients.filter((c) => c !== ref);
    const finders = seed % 2 === 0 ? [ref, others[0]!] : others;
    if (seed % 4 === 1) finders.reverse();
    for (const f of finders) assert.ok(f.click(SLUG, "0", buttonOf(w, f, i)));
    await w.run(3000);
    const credits = finders.map((f) => totalFinds(w, clients[0]!, f));
    assert.equal(credits[0]! + credits[1]!, 1, `seed ${seed}: credits ${credits}`);
    for (const c of clients) {
      assert.equal(controller(w, c).isTreasureActive[i], false);
      // Every client agrees who it was, and only that client counted it.
      for (const f of finders) assert.equal(totalFinds(w, c, f), credits[finders.indexOf(f)]);
      assert.equal(controller(w, c).pickEffectsPlayed >= 1, true);
    }
    assert.equal(finders.reduce((n, f) => n + controller(w, f).findsCredited, 0), 1);
    // Both requests reached the referee; the second was for a treasure already found.
    assert.equal(finders.reduce((n, f) => n + controller(w, f).findsRequested, 0), 2);
    assert.equal(controller(w, referee(w, clients)).returnsRefused, 1);
    // The loser's own page showed it gone at once and did not show it again.
    for (const f of finders) assert.equal(controller(w, f).IsShown(i), false);
    assert.ok(w.agree());
    assert.deepEqual(w.problems(), []);
  }
});

test("a click out of reach, or with treasure-hunt off, finds nothing", async () => {
  const w = makeWorld({ seed: 13 });
  const ann = w.join({ name: "Ann", elements: [FAST] });
  await w.settle();
  const i = await waitForTreasure(w, ann);
  const at = controller(w, ann).treasurePositions[i]!;
  ann.pose(at.add(new Vector3(0, 0, 0.9))); // 0.9 m away; find-distance is 0.7
  await w.run(200);
  ann.click(SLUG, "0", buttonOf(w, ann, i));
  await w.run(1500);
  assert.equal(controller(w, ann).isTreasureActive[i], true);
  assert.equal(totalFinds(w, ann, ann), 0);
  ann.pose(at.add(new Vector3(0, 0, 0.5)));
  await w.run(200);
  ann.click(SLUG, "0", buttonOf(w, ann, i));
  await w.run(1500);
  assert.equal(totalFinds(w, ann, ann), 1, "within 0.7 m it counts");

  const off = makeWorld({ seed: 14 });
  const bob = off.join({ name: "Bob", elements: [{ ...FAST, "treasure-hunt": "false" }] });
  await off.settle();
  const j = await waitForTreasure(off, bob);
  bob.click(SLUG, "0", buttonOf(off, bob, j));
  await off.run(2000);
  assert.equal(controller(off, bob).isTreasureActive[j], true, "a plain random spawner: nothing can be found (item 6)");
  assert.equal(totalFinds(off, bob, bob), 0);
});

test("the spawner leaves and another player takes over the spawning", async () => {
  const w = makeWorld({ seed: 15 });
  const attrs = { "timer-min": "1", "timer-max": "2", "max-active": "9" };
  const clients = [w.join({ name: "Ann", elements: [attrs] }), w.join({ name: "Bob", elements: [attrs] }), w.join({ name: "Cat", elements: [attrs] })];
  await w.settle();
  await w.room.runUntil(() => activeIndexes(w, clients[1]!).length >= 2, 20000);
  const spawner = referee(w, clients);
  assert.ok(w.instance(spawner).networking.IsOwner(controller(w, spawner)));
  assert.ok(controller(w, spawner).spawns >= 2);
  const rest = clients.filter((c) => c !== spawner);
  w.leave(spawner);
  const before = activeIndexes(w, rest[0]!).length;
  await w.run(15000);
  const next = referee(w, rest);
  assert.ok(next, "a new referee");
  assert.ok(w.instance(next).networking.IsOwner(controller(w, next)), "it owns the controller");
  assert.ok(controller(w, next).spawns > 0, "and spawns");
  assert.ok(activeIndexes(w, rest[0]!).length > before, `more treasures out: ${before} -> ${activeIndexes(w, rest[0]!).length}`);
  // A find still works after the hand-over.
  const finder = rest.find((c) => c !== next)!;
  const i = activeIndexes(w, finder)[0]!;
  finder.click(SLUG, "0", buttonOf(w, finder, i));
  await w.run(2000);
  assert.equal(totalFinds(w, next, finder), 1);
  assert.ok(w.agree());
  assert.deepEqual(w.problems(), []);
});

test("a late joiner sees the treasures that are out at once, with no pick effects for older finds", async () => {
  const w = makeWorld({ seed: 16 });
  const attrs = { "timer-min": "0.3", "timer-max": "0.6" };
  const ann = w.join({ name: "Ann", elements: [attrs] });
  await w.settle();
  await w.room.runUntil(() => activeIndexes(w, ann).length === 5, 20000);
  // One found and gone before Cat arrives.
  const gone = activeIndexes(w, ann)[0]!;
  ann.click(SLUG, "0", buttonOf(w, ann, gone));
  await w.run(100);
  const out = activeIndexes(w, ann);
  const cat = w.join({ name: "Cat", elements: [attrs] });
  await w.room.runUntil(() => w.started(cat), 20000);
  // Straight after start, before any further spawn could have been sent.
  const seen = controller(w, cat);
  for (const i of out) {
    assert.equal(seen.IsShown(i), true, `treasure ${i} is shown to Cat`);
    const slot = seen.PoolSlots[i]!;
    assert.ok(isActive(cat, `wrapper${slot}`));
    assert.ok(Vector3.Distance(cat.object(SLUG, "0", `wrapper${slot}`).truePosition, controller(w, ann).treasurePositions[i]!) < 1e-6);
  }
  assert.equal(seen.IsShown(gone), activeIndexes(w, ann).includes(gone));
  assert.equal(seen.pickEffectsPlayed, 0);
  await w.settle();
  await w.run(1000);
  assert.ok(w.agree());
  assert.deepEqual(w.problems(), []);
});

test("finds persist across a page reload on the same device, and not on another device", async () => {
  const w = makeWorld({ seed: 17 });
  const ann = w.join({ uid: "ann", name: "Ann", device: "anns-quest", elements: [FAST] });
  const bob = w.join({ uid: "bob", name: "Bob", elements: [FAST] });
  await w.settle();
  const kinds: string[] = [];
  for (let n = 0; n < 3; n++) {
    const i = await waitForTreasure(w, ann);
    kinds.push(controller(w, ann).PoolKinds()[i]!);
    ann.click(SLUG, "0", buttonOf(w, ann, i));
    await w.run(1500);
  }
  const expected = (kind: string) => kinds.filter((k) => k === kind).length;
  assert.equal(totalFinds(w, bob, ann), 3);

  // Reload: the page goes away and comes back on the same device.
  w.leave(ann);
  await w.run(5000);
  assert.ok(!boardRows(bob, 0).some((r) => r.startsWith("Ann")), "gone from the board while away");
  const back = w.join({ uid: "ann", name: "Ann", device: "anns-quest", elements: [FAST] });
  await w.settle();
  await w.run(2000);
  for (const kind of ["Coin", "Gem", "Star"]) {
    assert.equal(countOf(w, back, back, kind), expected(kind));
    assert.equal(countOf(w, bob, back, kind), expected(kind), `Bob reads Ann's ${kind}`);
    assert.ok(personalRows(back).includes(`${kind} ${expected(kind)}`));
  }
  assert.ok(boardRows(bob, 0).includes(`Ann ${expected("Coin")}`));

  // The same account on another device starts from nothing: saving is per device (PORT.md 3.4).
  w.leave(back);
  await w.run(5000);
  const elsewhere = w.join({ uid: "ann", name: "Ann", device: "anns-pc", elements: [FAST] });
  await w.settle();
  await w.run(2000);
  assert.equal(totalFinds(w, bob, elsewhere), 0);
  assert.deepEqual(personalRows(elsewhere), ["Coin 0", "Gem 0", "Star 0"]);
  assert.deepEqual(w.problems(), []);
});

test("the scoreboard lists the players present, highest first, and follows joins, leaves and finds", async () => {
  const w = makeWorld({ seed: 18 });
  seedDevice(w, "d-ann", "ann", { Coin: 2, Star: 1 });
  seedDevice(w, "d-bob", "bob", { Coin: 5 });
  seedDevice(w, "d-cat", "cat", { Coin: 5, Gem: 4 });
  const attrs = { ...FAST, "max-active": "1" };
  const ann = w.join({ uid: "ann", name: "Ann", device: "d-ann", elements: [attrs] });
  const bob = w.join({ uid: "bob", name: "Bob", device: "d-bob", elements: [attrs] });
  const cat = w.join({ uid: "cat", name: "Cat", device: "d-cat", elements: [attrs] });
  await w.settle();
  await w.run(2500);
  for (const c of [ann, bob, cat]) {
    // Titles in pool order (SB:315-325); rows highest first, ties in join order.
    assert.deepEqual([0, 1, 2].map((l) => c.graph(SLUG).text.get(`listTitle${l}`)), ["Coin", "Gem", "Star"]);
    assert.deepEqual(boardRows(c, 0), ["Bob 5", "Cat 5", "Ann 2"]);
    assert.deepEqual(boardRows(c, 1), ["Cat 4", "Ann 0", "Bob 0"]);
    assert.deepEqual(boardRows(c, 2), ["Ann 1", "Bob 0", "Cat 0"]);
  }
  assert.deepEqual(personalRows(cat), ["Coin 5", "Gem 4", "Star 0"]);

  // Dan joins with nothing saved: a row of zeros at the bottom of each list.
  const dan = w.join({ uid: "dan", name: "Dan", elements: [attrs] });
  await w.settle();
  await w.run(2500);
  for (const c of [ann, dan]) assert.deepEqual(boardRows(c, 0), ["Bob 5", "Cat 5", "Ann 2", "Dan 0"]);

  // Cat leaves: her rows go.
  w.leave(cat);
  await w.run(5000);
  for (const c of [ann, bob, dan]) assert.deepEqual(boardRows(c, 1), ["Ann 0", "Bob 0", "Dan 0"]);

  // Ann finds one: her row moves for everyone.
  const i = await waitForTreasure(w, ann);
  const kind = controller(w, ann).PoolKinds()[i]!;
  ann.click(SLUG, "0", buttonOf(w, ann, i));
  await w.run(2500);
  const list = ["Coin", "Gem", "Star"].indexOf(kind);
  const expectAnn = { Coin: 3, Gem: 1, Star: 2 }[kind as "Coin" | "Gem" | "Star"];
  for (const c of [bob, dan]) assert.ok(boardRows(c, list).includes(`Ann ${expectAnn}`), `${c.name}: ${boardRows(c, list)}`);
  assert.deepEqual(scoreboard(w, dan).Rows("Coin").map((e) => e.name), ["Bob", "Ann", "Dan"]);
  assert.deepEqual(w.problems(), []);
});

test("seventeen players: sixteen rows per list are shown, without error", async () => {
  const w = makeWorld({ seed: 19 });
  const clients: FakeClient[] = [];
  for (let n = 0; n < 17; n++) clients.push(w.join({ name: `P${String(n).padStart(2, "0")}`, elements: [{ "timer-min": "5", "timer-max": "10" }] }));
  await w.settle("0", 60000);
  await w.run(3000);
  assert.equal(boardRows(clients[0]!, 0).length, 16);
  assert.equal(scoreboard(w, clients[0]!).dataBase.get("Coin")!.length, 17);
  assert.deepEqual(w.problems(), []);
});

test("the prize: unlocked by a player's saved total, shown while an eligible player is present, one win sound", async () => {
  const w = makeWorld({ seed: 20 });
  const attrs = { ...FAST, "prize-cost": "10", "coin-points": "10", "gem-points": "10", "star-points": "10" };
  const ann = w.join({ uid: "ann", name: "Ann", device: "anns-quest", elements: [attrs] });
  const bob = w.join({ uid: "bob", name: "Bob", elements: [attrs] });
  await w.settle();
  await w.run(1500);
  for (const c of [ann, bob]) {
    assert.equal(prize(w, c).IsShown, false);
    assert.equal(isActive(c, "prizeContainer"), false);
  }
  const i = await waitForTreasure(w, ann);
  ann.click(SLUG, "0", buttonOf(w, ann, i));
  ann.pose(new Vector3(0.2, 1.6, 0.4)); // where Ann's head is when the find is recorded
  await w.run(2500);
  for (const c of [ann, bob]) {
    assert.equal(prize(w, c).winSequences, 1, `${c.name} heard one win`);
    assert.ok(prize(w, c).lastWinPosition!.equals(new Vector3(0.2, 1.6, 0.4)), "at the winner's head (PP:104)");
    assert.equal(prize(w, c).IsShown, true);
    assert.equal(isActive(c, "prizeContainer"), true);
  }
  // A second find does not sound again (the flag is set, PP:95).
  const j = await waitForTreasure(w, ann);
  ann.click(SLUG, "0", buttonOf(w, ann, j));
  await w.run(2500);
  assert.equal(prize(w, bob).winSequences, 1);

  // A later arrival sees the prize while Ann is here.
  const cat = w.join({ uid: "cat", name: "Cat", elements: [attrs] });
  await w.settle();
  await w.run(2000);
  assert.equal(prize(w, cat).IsShown, true);
  assert.equal(prize(w, cat).winSequences, 0);

  // Ann leaves: nobody present is eligible, so it hides. She comes back: it shows, with no second win.
  w.leave(ann);
  await w.run(5000);
  for (const c of [bob, cat]) assert.equal(prize(w, c).IsShown, false);
  const back = w.join({ uid: "ann", name: "Ann", device: "anns-quest", elements: [attrs] });
  await w.settle();
  await w.run(2500);
  for (const c of [bob, cat, back]) {
    assert.equal(prize(w, c).IsShown, true);
    assert.equal(isActive(c, "prizeContainer"), true);
  }
  assert.equal(prize(w, bob).winSequences, 1);
  assert.equal(prize(w, back).winSequences, 0);
  assert.deepEqual(w.problems(), []);
});

test("prize threshold and points come from the settings", async () => {
  const w = makeWorld({ seed: 27 });
  seedDevice(w, "d-ann", "ann", { Coin: 3, Gem: 1 }); // 3x1 + 1x5 = 8 with the prefab points
  seedDevice(w, "d-bob", "bob", { Coin: 3, Gem: 1 });
  const ann = w.join({ uid: "ann", name: "Ann", device: "d-ann", elements: [{ "prize-cost": "9" }] });
  await w.settle();
  await w.run(2000);
  assert.equal(prize(w, ann).IsShown, false, "8 < 9");
  const w2 = makeWorld({ seed: 28 });
  seedDevice(w2, "d-bob", "bob", { Coin: 3, Gem: 1 });
  const bob = w2.join({ uid: "bob", name: "Bob", device: "d-bob", elements: [{ "prize-cost": "9", "gem-points": "6" }] });
  await w2.settle();
  await w2.run(2000);
  assert.equal(prize(w2, bob).IsShown, true, "3 + 6 = 9: unlocked on the first load (item 41)");
  assert.equal(prize(w2, bob).winSequences, 1);
});

test("two hunts in one room stay separate: state, finds, saved counts and boards", async () => {
  const w = makeWorld({ seed: 29 });
  const north = { room: "north", ...FAST };
  const south = { room: "south", ...FAST, zone1: "10 1 10", "zone1-size": "1 1 1", "zone2-size": "0 0 0", "zone3-size": "0 0 0" };
  const ann = w.join({ uid: "ann", name: "Ann", device: "d-ann", elements: [north, south] });
  const bob = w.join({ uid: "bob", name: "Bob", elements: [north, south] });
  await w.settle("north");
  await w.settle("south");
  const i = await waitForTreasure(w, ann, "north");
  await waitForTreasure(w, ann, "south");
  const southBefore = controller(w, bob, "south").isTreasureActive.slice();
  ann.click(SLUG, "north", buttonOf(w, ann, i, "north"));
  await w.run(2000);
  assert.equal(totalFinds(w, bob, ann, "north"), 1);
  assert.equal(totalFinds(w, bob, ann, "south"), 0);
  // The south hunt only spawns in its own box, far from the north zones.
  for (const j of activeIndexes(w, bob, "south")) assert.ok(Vector3.Distance(controller(w, bob, "south").treasurePositions[j]!, new Vector3(10, 1, 10)) < 1);
  for (const j of activeIndexes(w, bob, "north")) assert.ok(Vector3.Distance(controller(w, bob, "north").treasurePositions[j]!, new Vector3(10, 1, 10)) > 5);
  // The north find hid nothing in the south.
  for (let j = 0; j < southBefore.length; j++) if (southBefore[j]) assert.equal(controller(w, bob, "south").isTreasureActive[j], true);
  // Keys are apart in the room, in user state and on the device.
  const keys = w.room.stateKeys("pk1.");
  assert.ok(keys.some((k) => k.startsWith(statePrefix(SLUG, "north") + ".v.controller")));
  assert.ok(keys.some((k) => k.startsWith(statePrefix(SLUG, "south") + ".v.controller")));
  const saved = [...w.room.device("d-ann").keys()].filter((k) => k.endsWith("playerdata"));
  assert.deepEqual(saved.sort(), [storagePrefix(SLUG, "north", "ann") + "playerdata", storagePrefix(SLUG, "south", "ann") + "playerdata"].sort());
  assert.ok(w.agree("north") && w.agree("south"));
  assert.deepEqual(w.problems(), []);
});

test("bad settings: both timers 0 spawn one at a time (at least 0.25 s apart), no zones spawn nothing, no errors", async () => {
  const w = makeWorld({ seed: 30 });
  const ann = w.join({ name: "Ann", elements: [{ "timer-min": "0", "timer-max": "0", "max-active": "9" }] });
  await w.settle();
  const times: number[] = [];
  let last = 0;
  for (let t = 0; t < 80; t++) {
    await w.run(50);
    const n = activeIndexes(w, ann).length;
    if (n > last) times.push(w.room.now);
    assert.ok(n - last <= 1, "one spawn per cycle");
    last = n;
  }
  assert.equal(activeIndexes(w, ann).length, 9, "the whole pool is out within 4 s");
  for (let k = 1; k < times.length; k++) assert.ok(times[k]! - times[k - 1]! >= 250 - 1e-6);
  await w.run(2000); // pool exhausted: upstream indexed -1 here (item 20)
  assert.deepEqual(w.problems(), []);

  const empty = makeWorld({ seed: 31 });
  const bob = empty.join({ name: "Bob", elements: [{ ...FAST, "zone1-size": "0 1 1", "zone2-size": "0 0 0", "zone3-size": "1 1 0", coins: "99" }] });
  await empty.settle();
  await empty.run(10000);
  assert.equal(activeIndexes(empty, bob).length, 0);
  assert.equal(controller(empty, bob).isTreasureActive.length, 12 + 3 + 1, "coins clamped to the kit's 12");
  assert.equal(bob.logged("warn").filter((l) => l.includes("no spawn zone")).length, 1);
  assert.deepEqual(empty.problems(), []);
});

test("budget: one synced slot, a small leaf, and writes well under the room's 20 per second", async () => {
  const w = makeWorld({ seed: 32 });
  const budget = leafBudget(w.bindings, (type) => {
    const cls = game.behaviours[type];
    return cls ? { synced: (cls.synced ?? []).length, perPlayer: cls.perPlayer === true } : null;
  });
  assert.equal(budget.slots, 1);
  assert.ok(budget.spaceLeaves <= 5);
  assert.ok(budget.userLeavesPerPlayer <= 6);

  // The largest pool, the shortest cycle, and finds as fast as they come.
  const attrs = { coins: "12", gems: "6", stars: "4", "max-active": "22", "timer-min": "0", "timer-max": "0" };
  const ann = w.join({ name: "Ann", elements: [attrs] });
  const bob = w.join({ name: "Bob", elements: [attrs] });
  await w.settle();
  const before = w.room.stats.stateBatches;
  const start = w.room.now;
  for (let t = 0; t < 40; t++) {
    await w.run(250);
    const out = activeIndexes(w, bob);
    if (out.length && t % 2 === 0) bob.click(SLUG, "0", buttonOf(w, bob, out[0]!));
  }
  const seconds = (w.room.now - start) / 1000;
  const perSecond = (w.room.stats.stateBatches - before) / seconds;
  assert.ok(perSecond < 10, `${perSecond.toFixed(1)} state writes per second`);
  assert.equal(w.room.stats.rateLimited, 0);
  const leaf = w.room.stateSnapshot()[statePrefix(SLUG, "0") + ".v.controller"];
  assert.ok(typeof leaf === "string" && leaf.length < 4096, `leaf is ${String(leaf).length} bytes`);
  assert.ok(controller(w, ann).isTreasureActive.length === 22);
  // Spawning goes on every 0.25 s until the pool is full, so a write can be in flight at any moment: compare once
  // the pool is out (nobody finds any more) and the last write has arrived.
  assert.ok(await w.room.runUntil(() => activeIndexes(w, ann).length === 22 && activeIndexes(w, bob).length === 22, 20000));
  await w.run(1000);
  assert.ok(w.agree());
  assert.deepEqual(w.problems(), []);
});
