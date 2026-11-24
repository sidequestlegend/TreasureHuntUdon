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
  for (const id of ["controller", "scoreboard", "personal", "prize", "r0", "r21"]) assert.ok(ids.includes(id), id);
  assert.equal(b.behaviours.filter((x) => x.type === "TreasureReturner").length, KIT_SLOTS);
  for (let k = 0; k < KIT_SLOTS; k++) {
    assert.equal(b.objects[`button${k}`]!.click, true);
    assert.equal(b.objects[`wrapper${k}`]!.active, false, "every treasure starts hidden (THC:97-101)");
  }
  assert.equal(b.objects.prizeCheese!.grab, true);
  assert.equal(b.objects.prizeCheese!.sync, "transform");
  assert.equal(b.objects.prizeContainer!.active, false);
  // Texts, particles, the animator switch and both sounds (the relay's audio op) go through the relay graph.
  for (const key of ["listTitle0", "rowName2_15", "pRowScore2", "pick3", "wrapper21", "winSound"]) assert.ok(b.refs.includes(key), key);
});
