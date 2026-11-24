// The snippet markup the kit builder exports (TreasureHuntKitBuilder.SnippetSettings / SnippetGizmos) against what the
// script reads (Settings.ts): every setting the script reads is declared, with the script's own default, and every
// place a creator puts by hand has a handle (REVIEW-FINDINGS.md, treasure-hunt 3; PORT.md 8.1, 8.2).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { KIT_ZONE_PREVIEWS, MAX_ZONES, readSettings } from "../src/Settings.ts";

const builder = readFileSync(fileURLToPath(new URL("../../Assets/Kit/Editor/TreasureHuntKitBuilder.cs", import.meta.url)), "utf8");

/** The ("name", "value") pairs of SnippetSettings, as C# literals or the zone loop the builder writes them with. */
function declared(): Map<string, string> {
  const block = builder.slice(builder.indexOf("SnippetSettings =>"), builder.indexOf("SnippetGizmos =>"));
  assert.ok(block.length > 0, "SnippetSettings and SnippetGizmos are in the builder");
  const out = new Map<string, string>();
  for (const m of block.matchAll(/\("([a-z0-9-]+)",\s*"([^"]*)"\)/g)) out.set(m[1]!, m[2]!);
  return out;
}

/** The attribute names readSettings asks for. */
function read(): string[] {
  const names: string[] = [];
  readSettings({ get: (name: string) => void names.push(name) } as unknown as ReadonlyMap<string, string>);
  return names;
}

/** Accepted on a hand-edited element, not declared: PORT.md 10.1 row 4 (left out). */
const UNDECLARED = ["prize-object"];

test("the markup declares every setting the script reads: zone1 to zone8 with size and rotation, and scale", () => {
  const markup = declared();
  for (let n = 1; n <= 8; n++) for (const suffix of ["", "-size", "-rotation"]) assert.ok(markup.has(`zone${n}${suffix}`), `zone${n}${suffix} is declared`);
  assert.equal(markup.get("scale"), "1");
  assert.equal(MAX_ZONES, KIT_ZONE_PREVIEWS, "the script reads as many zones as the kit can preview");
  const missing = read().filter((name) => !markup.has(name) && !UNDECLARED.includes(name));
  assert.deepEqual([...new Set(missing)], []);
  const unknown = [...markup.keys()].filter((name) => !read().includes(name) && name !== "room");
  assert.deepEqual(unknown, [], "nothing declared that the script ignores");
});

test("the declared defaults are the script's own defaults; spare zones are off until given a size", () => {
  const markup = declared();
  assert.deepEqual(readSettings(markup), readSettings(new Map()));
  assert.equal(readSettings(markup).zones.length, 3);
  assert.deepEqual(readSettings(new Map([["zone9", "1 1 1"], ["zone9-size", "1 1 1"]])).zones.map((z) => z.number), [1, 2, 3], "zone9 is not read");
});

test("each zone, the personal list and the prize have a position handle in the markup", () => {
  const block = builder.slice(builder.indexOf("SnippetGizmos =>"));
  const handle = (attribute: string) => block.includes(`"<bs-gizmo type=\\"position\\" attribute=\\"${attribute}\\"/>"`);
  for (let n = 1; n <= 8; n++) assert.ok(handle(`zone${n}`), `zone${n}`);
  assert.ok(handle("personal-list"));
  assert.ok(handle("prize-position"));
  // the three default zones are drawn at their default size (a gizmo's size is a literal: PORT.md 8.2)
  for (const [n, size] of [[1, "1.377 0.792 0.642"], [2, "0.728 0.418 0.339"], [3, "1.343 0.772 0.626"]] as const)
    assert.ok(block.includes(`"<bs-gizmo type=\\"box\\" attribute=\\"zone${n}\\" size=\\"${size}\\"/>"`), `zone${n} box`);
});
