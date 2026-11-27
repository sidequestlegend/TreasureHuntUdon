// Rung 0: bindings.json, as the kit builder (Assets/Kit/Editor/TreasureHuntKitBuilder.cs) wrote it, is valid, its hash
// is its own, and it binds every field the classes expect.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { canonicalJson, validateBindings } from "../portkit/src/index.ts";
import { KIT_SLOTS } from "../src/Settings.ts";
import { bindings, game } from "./helpers.ts";

test("bindings.json is the kit builder's, valid, and every type is a class of the game", () => {
  const json = bindings() as Record<string, unknown>;
  assert.equal(json.provisional, undefined, "the provisional bindings are gone: the kit builder writes this file");
  const { hash, ...rest } = json;
  assert.equal(hash, createHash("sha1").update(canonicalJson(rest), "utf8").digest("hex"), "the hash is the document's own");
  const b = validateBindings(json);
  for (const behaviour of b.behaviours) assert.ok(game.behaviours[behaviour.type], behaviour.type);
  const ids = b.behaviours.map((x) => x.id);
  for (const id of ["controller", "scoreboard", "personal", "prize", "credits", "r0", "r21"]) assert.ok(ids.includes(id), id);
  assert.equal(b.behaviours.filter((x) => x.type === "TreasureReturner").length, KIT_SLOTS);
  for (let k = 0; k < KIT_SLOTS; k++) {
    assert.equal(b.objects[`button${k}`]!.click, true);
    assert.equal(b.objects[`wrapper${k}`]!.active, false, "every treasure starts hidden (THC:97-101)");
  }
  assert.equal(b.objects.prizeCheese!.grab, true);
  assert.equal(b.objects.prizeCheese!.sync, "transform");
  assert.equal(b.objects.prizeContainer!.active, false);
  // Particles, the animator switch and both sounds (the relay's audio op) go through the relay graph.
  for (const key of ["pick3", "wrapper21", "winSound"]) assert.ok(b.refs.includes(key), key);
  // The boards are UI Toolkit panels the page builds (PORT.md 11.8): the kit has an anchor for each where upstream's canvas
  // sat, bound, on from the start (a panel under an object that goes off is destroyed by the app), and no uGUI left for the
  // relay to drive: no list, row or text keys at all.
  const anchors = { scoreboard: "Scoreboard", personalList: "PersonalScoreList", credits: "Credits" };
  for (const [key, path] of Object.entries(anchors)) {
    assert.equal(b.objects[key]?.path, path, key);
    assert.notEqual(b.objects[key]!.active, false, `${key} starts on`);
    assert.ok(!b.refs.includes(key), `${key} is not switched by the relay`);
  }
  assert.deepEqual(Object.keys(b.objects).filter((k) => /^(list|listTitle|row|rowName|rowScore|pRow|pRowName|pRowScore)\d/.test(k)), []);
});
