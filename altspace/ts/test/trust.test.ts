// What a page cannot do to the hunt, and where the port has to fail closed (REVIEW-FINDINGS.md, treasure-hunt 1, 2, 6).

import assert from "node:assert/strict";
import { test } from "node:test";
import { statePrefix, Vector3 } from "../portkit/src/index.ts";
import { activeIndexes, buttonOf, controller, countOf, findAt, makeWorld, SLUG, waitForTreasure } from "./helpers.ts";

const FAST = { "timer-min": "0.5", "timer-max": "0.5", "max-active": "3" };
const SLOW = { "timer-min": "4", "timer-max": "5" };
const referee = (w: ReturnType<typeof makeWorld>, clients: ReturnType<ReturnType<typeof makeWorld>["join"]>[]) => clients.find((c) => w.instance(c, "0").networking.IsReferee)!;
const total = (w: ReturnType<typeof makeWorld>, viewer: Parameters<typeof countOf>[1], who: Parameters<typeof countOf>[2]) =>
  countOf(w, viewer, who, "Coin") + countOf(w, viewer, who, "Gem") + countOf(w, viewer, who, "Star");

test("a modified client 50 m away that sends ReturnItem itself collects nothing: the referee checks the finder's head", async () => {
  const w = makeWorld({ seed: 6 });
  const ann = w.join({ name: "Ann", elements: [FAST] });
  const bob = w.join({ name: "Bob", elements: [FAST] });
  await w.settle();
  assert.ok(await w.room.runUntil(() => activeIndexes(w, bob).length >= 3, 20000));
  await w.run(300);
  const c = controller(w, bob);
  const out = activeIndexes(w, bob);
  bob.pose(c.treasurePositions[out[0]!]!.add(new Vector3(50, 0, 0)));
  await w.run(200);
  // The honest path refuses the click on Bob's own page.
  assert.equal(c.RequestReturn(c.PoolSlots[out[0]!]!), false);
  // A modified page skips its own check and asks the referee for every treasure out.
  for (const k of out) (c as unknown as { SendCommand(m: string, ...a: unknown[]): void }).SendCommand("ReturnItem", k, c.spawnSerial[k]);
  await w.run(3000);
  for (const k of out) assert.equal(controller(w, ann).isTreasureActive[k], true, `treasure ${k} is still out`);
  assert.equal(total(w, ann, bob), 0);
  assert.equal(c.findsCredited, 0);
  const ref = controller(w, referee(w, [ann, bob]));
  assert.equal(ref.reachRefused, out.length);
  assert.ok(ref.lastHeadCheck && !ref.lastHeadCheck.ok && ref.lastHeadCheck.distance > 45, JSON.stringify(ref.lastHeadCheck));
  // Bob walks up to one: now it counts.
  assert.ok(findAt(w, bob, out[0]!));
  await w.run(2000);
  assert.equal(total(w, ann, bob), 1);
  assert.ok(w.agree());
  assert.deepEqual(w.problems(), []);
});

test("the referee's reach check has slack for a moving head and an arm's length, and no more", async () => {
  const w = makeWorld({ seed: 7 });
  const ann = w.join({ name: "Ann", elements: [SLOW] });
  const bob = w.join({ name: "Bob", elements: [SLOW] });
  await w.settle();
  const i = await waitForTreasure(w, bob);
  await w.run(300);
  const c = controller(w, bob);
  const at = c.treasurePositions[i]!;
  // The click from 0.5 m; by the time the referee looks, the head has moved on 2.9 m (within 0.7 + 2.5).
  assert.ok(findAt(w, bob, i, "0", new Vector3(0, 0, 0.5)));
  bob.pose(at.add(new Vector3(0, 0, 2.9)));
  await w.run(2000);
  assert.equal(total(w, ann, bob), 1);
  // The next one: the head is 3.5 m away when the referee looks.
  await w.room.runUntil(() => activeIndexes(w, bob).length > 0, 20000);
  await w.run(300);
  const j = activeIndexes(w, bob)[0]!;
  assert.ok(findAt(w, bob, j, "0", new Vector3(0, 0, 0.5)));
  bob.pose(c.treasurePositions[j]!.add(new Vector3(0, 0, 3.5)));
  await w.run(2000);
  assert.equal(total(w, ann, bob), 1, "refused beyond find-distance + 2.5 m");
  // Refused: Bob's own page shows the treasure again once its prediction runs out.
  await w.run(2000);
  assert.equal(c.IsShown(j), true);
  assert.deepEqual(w.problems(), []);
});

test("no position known: a click finds nothing (fail closed on the finder's page)", async () => {
  const w = makeWorld({ seed: 5 });
  const ann = w.join({ name: "Ann", elements: [FAST] });
  await w.settle();
  const i = await waitForTreasure(w, ann);
  assert.equal(ann.head, null, "the app never told this page where the player is");
  assert.equal((w.instance(ann) as unknown as { position: unknown }).position, null);
  ann.click(SLUG, "0", buttonOf(w, ann, i));
  await w.run(1500);
  assert.equal(controller(w, ann).findsRequested, 0);
  assert.equal(controller(w, ann).findsCredited, 0);
  assert.equal(controller(w, ann).isTreasureActive[i], true);
  // Once the page knows where the player is, a click in reach counts.
  assert.ok(findAt(w, ann, i));
  await w.run(1500);
  assert.equal(controller(w, ann).findsCredited, 1);
});

test("the referee fails closed: no head for the finder in its app, or no answer at all, refuses the find", async () => {
  // The app knows the finder but not their head yet (Get User State gives 0 0 0).
  const w = makeWorld({ seed: 8 });
  const ann = w.join({ name: "Ann", elements: [SLOW] });
  const bob = w.join({ name: "Bob", elements: [SLOW] });
  await w.settle();
  const i = await waitForTreasure(w, bob);
  await w.run(300);
  bob.teleported(controller(w, bob).treasurePositions[i]!.add(new Vector3(0, 0, 0.3)));
  assert.equal(bob.head, null);
  assert.ok(bob.click(SLUG, "0", buttonOf(w, bob, i)));
  await w.run(2500);
  assert.equal(controller(w, bob).findsRequested, 1, "Bob's page sent the find (it knows where Bob was put)");
  assert.equal(total(w, ann, bob), 0);
  const ref = controller(w, referee(w, [ann, bob]));
  assert.equal(ref.reachRefused, 1);
  assert.equal(ref.lastHeadCheck?.head, null);

  // A kit without the op (or an app that never answers): refused after the wait.
  const silent = makeWorld({ seed: 9, heads: "none" });
  const cat = silent.join({ name: "Cat", elements: [SLOW] });
  await silent.settle();
  const j = await waitForTreasure(silent, cat);
  assert.ok(findAt(silent, cat, j));
  await silent.run(1000);
  assert.equal(controller(silent, cat).findsCredited, 0, "nothing yet");
  await silent.run(2000);
  assert.equal(controller(silent, cat).findsCredited, 0);
  assert.equal(controller(silent, cat).reachRefused, 1);
  assert.equal(controller(silent, cat).isTreasureActive[j], true);
  assert.ok(cat.logged("warn").some((l) => l.includes("no head position")));
});

test("an older copy of the hunt's state written back does not credit a find again (highest serial per treasure)", async () => {
  const w = makeWorld({ seed: 10 });
  // one treasure in the pool: every spawn is pool index 0, with a new serial
  const attrs = { "timer-min": "0.5", "timer-max": "0.5", coins: "1", gems: "0", stars: "0", "max-active": "1" };
  const ann = w.join({ name: "Ann", elements: [attrs] });
  const bob = w.join({ name: "Bob", elements: [attrs] });
  await w.settle();
  const key = statePrefix(SLUG, "0") + ".v.controller";
  let first: unknown = null;
  for (let n = 1; n <= 2; n++) {
    const i = await waitForTreasure(w, bob);
    assert.equal(i, 0);
    assert.ok(findAt(w, bob, i));
    assert.ok(await w.room.runUntil(() => controller(w, bob).findsCredited === n, 5000));
    if (n === 1) first = w.room.stateSnapshot()[key];
  }
  assert.equal(countOf(w, bob, bob, "Coin"), 2);
  // Another page writes the leaf from after the first find back (Bob's find of spawn 1, flag down), numbered as a newer
  // write of the controller's owner: public state has no writer check.
  const old = JSON.parse(first as string) as { n: number };
  old.n = (JSON.parse(w.room.stateSnapshot()[key] as string) as { n: number }).n + 1;
  (w.instance(ann) as unknown as { platform: { stateSet(path: string, value: string): void } }).platform.stateSet(key, JSON.stringify(old));
  await w.run(300);
  assert.equal(controller(w, bob).spawnSerial[0], 1, "Bob's page took the old copy");
  assert.equal(controller(w, bob).findsCredited, 2);
  assert.equal(countOf(w, ann, bob, "Coin"), 2);
});
