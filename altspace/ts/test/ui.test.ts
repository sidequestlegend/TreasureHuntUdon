// The boards as UI Toolkit panels (PORT.md 11.8): built by the page with portkit's UI layer on the kit's three anchors,
// read here through the fake app's record of every panel, element and property (portkit fake.ts), and pressed as a
// player would (client.uiClick).

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "../portkit/src/index.ts";
import { CREDITS_ABOUT, CREDITS_SAVED, type Credits } from "../src/Credits.ts";
import { boardRows, boardTitle, findAt, makeWorld, personalRows, SLUG, waitForTreasure } from "./helpers.ts";

const FAST = { "timer-min": "0.5", "timer-max": "1" };

test("three panels where upstream's canvases sat: the board, the personal list and the credits, each under its kit anchor", async () => {
  const w = makeWorld({ seed: 61 });
  const ann = w.join({ name: "Ann", elements: [FAST] });
  await w.settle();
  await w.run(1500);
  const expected = { board: ["Scoreboard", 1.6, 0.73, 540], personal: ["PersonalScoreList", 0.3, 0.24, 600], credits: ["Credits", 1.5, 0.16, 600] } as const;
  for (const [id, [anchor, width, height, ppm]] of Object.entries(expected)) {
    const panel = ann.panel(SLUG, "0", id);
    assert.ok(panel && panel.alive, id);
    const object = panel.gameObject!;
    assert.ok(object.path.endsWith(`/${anchor}/pk1ui:${SLUG}:0:${id}`), object.path);
    assert.deepEqual(panel.resolution, { x: Math.round(width * ppm), y: Math.round(height * ppm) }, id);
    assert.ok(Math.abs(object.local!.scale.x - 100 / ppm) < 1e-9, `${id} scale`);
    assert.deepEqual([object.local!.position.x, object.local!.position.y, object.local!.position.z], [0, 0, 0], `${id} is centred on its anchor`);
  }
  // No board text goes through the relay any more: the graph is asked for no `text` op at all.
  assert.equal(ann.graph(SLUG).text.size, 0);
  assert.equal(ann.graph(SLUG).records.filter((r) => r.op === "text").length, 0);
  assert.deepEqual(w.problems(), []);
});

test("the board shows only the lists of kinds in the pool, titled in pool order; rows a player sees, no more than sixteen", async () => {
  const w = makeWorld({ seed: 62 });
  const ann = w.join({ name: "Ann", elements: [{ ...FAST, stars: "0" }] });
  await w.settle();
  await w.run(1500);
  assert.deepEqual([0, 1, 2].map((l) => boardTitle(ann, l)), ["Coin", "Gem", null]);
  assert.deepEqual(boardRows(ann, 0), ["Ann 0"]);
  assert.deepEqual(boardRows(ann, 2), []);
  assert.equal(ann.uiShown(SLUG, "0", "board", "row0_1"), false);
  assert.deepEqual(personalRows(ann), ["Coin 0", "Gem 0"]);
  assert.equal(ann.uiText(SLUG, "0", "personal", "title"), "found:");
});

test("a find changes only what it changes on the boards: one score on the board, one on the personal list", async () => {
  const w = makeWorld({ seed: 63 });
  const attrs = { ...FAST, "max-active": "1" };
  const ann = w.join({ name: "Ann", elements: [attrs] });
  const bob = w.join({ name: "Bob", elements: [attrs] });
  await w.settle();
  await w.run(2500);
  const ui = w.instance(bob, "0").ui;
  const before = ui.stats.ops;
  const i = await waitForTreasure(w, ann);
  assert.ok(findAt(w, ann, i));
  await w.run(2500);
  // On Bob's page: Ann's row in her kind's list goes to the top with a 1 (a name and a score each in the first two rows at
  // most), nothing on his own personal list. Far fewer than a redraw of 48 rows.
  const sent = ui.stats.ops - before;
  assert.ok(sent > 0 && sent <= 6, `ops sent on Bob's page: ${sent}`);
  assert.ok(personalRows(ann).some((r) => / 1$/.test(r)), personalRows(ann).join(","));
  assert.deepEqual(personalRows(bob), ["Coin 0", "Gem 0", "Star 0"]);
});

test("the credits: shown by default with the saved-on-this-device line; credits=false hides them; each viewer can fold them", async () => {
  const w = makeWorld({ seed: 64 });
  const ann = w.join({ name: "Ann", elements: [FAST] });
  const bob = w.join({ name: "Bob", elements: [FAST] });
  await w.settle();
  await w.run(1500);
  for (const c of [ann, bob]) {
    assert.equal(c.uiText(SLUG, "0", "credits", "saved"), CREDITS_SAVED);
    assert.ok(/saved on this device only/.test(CREDITS_SAVED));
    assert.equal(c.uiText(SLUG, "0", "credits", "about"), CREDITS_ABOUT);
    assert.ok(c.uiShown(SLUG, "0", "credits", "about"));
  }
  // Ann folds hers: the attribution goes, the line about saving stays, and Bob's are untouched.
  assert.ok(ann.uiClick(SLUG, "0", "credits", "fold"));
  await w.run(300);
  assert.equal(w.behaviour<Credits>(ann, "credits").folded, true);
  assert.equal(ann.uiShown(SLUG, "0", "credits", "about"), false);
  assert.equal(ann.uiShown(SLUG, "0", "credits", "saved"), true);
  assert.equal(ann.ui(SLUG, "0", "credits", "fold").props.get("icon"), "chevron-down");
  assert.equal(bob.uiShown(SLUG, "0", "credits", "about"), true);
  assert.ok(ann.uiClick(SLUG, "0", "credits", "fold"));
  await w.run(300);
  assert.equal(ann.uiShown(SLUG, "0", "credits", "about"), true);

  const w2 = makeWorld({ seed: 65 });
  const cat = w2.join({ name: "Cat", elements: [{ ...FAST, credits: "false" }] });
  await w2.settle();
  await w2.run(1500);
  assert.equal(cat.uiShown(SLUG, "0", "credits", "saved"), false);
  assert.equal(cat.uiClick(SLUG, "0", "credits", "fold"), false, "a hidden panel takes no press");
  assert.equal(cat.panel(SLUG, "0", "credits")!.gameObject!.active, true, "hidden by its top element, its object stays on");
  assert.deepEqual(w.problems().concat(w2.problems()), []);
});

test("the personal list's panel goes where the personal-list setting puts its anchor", async () => {
  const w = makeWorld({ seed: 66 });
  const ann = w.join({ name: "Ann", elements: [{ ...FAST, "personal-list": "-2 1.2 3", "personal-list-rotation": "0 30 0" }] });
  await w.settle();
  await w.run(1500);
  const anchor = ann.object(SLUG, "0", "personalList");
  assert.ok(anchor.truePosition.sub(new Vector3(-2, 1.2, 3)).magnitude < 1e-6, String(anchor.truePosition));
  const panel = ann.panel(SLUG, "0", "personal")!;
  assert.equal(panel.gameObject!.path, `${anchor.path}/pk1ui:${SLUG}:0:personal`);
});
