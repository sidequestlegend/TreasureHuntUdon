// Rung 0: the provisional bindings.json is valid, is what tools/provisional-bindings.ts writes, and binds
// every field the classes expect.

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBindings } from "../portkit/src/index.ts";
import { KIT_SLOTS } from "../src/Settings.ts";
import { provisionalBindings } from "../tools/provisional-bindings.ts";
import { bindings, game } from "./helpers.ts";

test("bindings.json is the provisional object model, valid, and every type is a class of the game", () => {
  const json = bindings() as Record<string, unknown>;
  assert.deepEqual(json, provisionalBindings(), "run `npm run bindings` after changing the generator");
  assert.match(String(json.provisional), /not by the kit builder/);
  const b = validateBindings(json);
  for (const behaviour of b.behaviours) assert.ok(game.behaviours[behaviour.type], behaviour.type);
  assert.equal(b.behaviours.filter((x) => x.type === "TreasureReturner").length, KIT_SLOTS);
  for (let k = 0; k < KIT_SLOTS; k++) assert.equal(b.objects[`button${k}`]!.click, true);
  assert.equal(b.objects.prizeCheese!.grab, true);
  assert.equal(b.objects.prizeCheese!.sync, "transform");
  // Texts and particles go through the relay; actives, positions and clips through the page.
  for (const key of ["listTitle0", "rowName2_15", "pRowScore2", "pick3", "rotator21"]) assert.ok(b.refs.includes(key), key);
  for (const key of ["wrapper0", "winSound", "pickAudio0"]) assert.ok(!b.refs.includes(key), key);
});
