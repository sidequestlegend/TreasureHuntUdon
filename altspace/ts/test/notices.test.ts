// The licence notices that ship (REVIEW-FINDINGS.md, treasure-hunt 5): the upstream's copyright line in the bundle's
// notices, every licence text they name in Assets/Kit/Licenses (which the kit packs), and the upstream MIT notice at the
// top of the built script (script-header.txt). Since the UI Toolkit pass the kit carries no font (its boards are UI Kit
// panels the page builds): no font file may be in the kit, and the bundle's notices must not claim one.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const kitNotices = readFileSync(at("../../Assets/Kit/THIRD-PARTY-NOTICES.md"), "utf8");
const repoNotices = readFileSync(at("../../THIRD-PARTY-NOTICES.md"), "utf8");
const licences = at("../../Assets/Kit/Licenses/");

test("the notices name the upstream's copyright line; the kit ships no font and its notices claim none", () => {
  assert.ok(kitNotices.includes("Copyright (c) 2024 Hoshou Neko"), "bundle notices");
  assert.ok(repoNotices.includes("Copyright (c) 2024 Hoshou Neko"), "THIRD-PARTY-NOTICES.md");
  for (const font of ["Lilita", "Liberation", "Revamped"]) assert.ok(!kitNotices.includes(font), `bundle notices name ${font}`);
  const fontFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fontFiles(dir + e.name + "/") : /\.(ttf|otf)$|SDF\.asset$/i.test(e.name) ? [dir + e.name] : []));
  assert.deepEqual(fontFiles(at("../../Assets/Kit/")), [], "font files in Assets/Kit");
});

test("every licence text the notices name is in Assets/Kit/Licenses, whole", () => {
  const named = [...kitNotices.matchAll(/Licenses\/([A-Za-z0-9 ._-]+\.txt)/g)].map((m) => m[1]!);
  assert.ok(named.length >= 1, `named: ${named}`);
  for (const file of named) assert.ok(existsSync(licences + file), `${file} is in Assets/Kit/Licenses`);
  const files = readdirSync(licences).filter((f) => f.endsWith(".txt"));
  for (const file of files) assert.ok(named.includes(file), `${file} is named in the notices`);
  const text = (file: string) => readFileSync(licences + file, "utf8");
  const mit = files.find((f) => /TreasureHunt/i.test(f))!;
  assert.match(text(mit), /Copyright \(c\) 2024 Hoshou Neko[\s\S]*Permission is hereby granted[\s\S]*THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.deepEqual(files, [mit], "only the upstream's licence text is packed");
});

test("the built script starts with the upstream's MIT notice (script-header.txt)", () => {
  const header = readFileSync(at("../script-header.txt"), "utf8");
  assert.match(header, /Copyright \(c\) 2024 Hoshou Neko/);
  assert.match(header, /Permission is hereby granted/);
  assert.ok(!header.includes("*/") && /^[\x20-\x7e\r\n\t]*$/.test(header), "plain ASCII, no comment end");
});
