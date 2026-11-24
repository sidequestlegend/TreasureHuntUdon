// The licence notices that ship (REVIEW-FINDINGS.md, treasure-hunt 5): every font's copyright line in the bundle's
// notices, every licence text they name in Assets/Kit/Licenses (which the kit packs; Liberation Sans's comes from
// TextMesh Pro), and the upstream MIT notice at the top of the built script (script-header.txt).

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const kitNotices = readFileSync(at("../../Assets/Kit/THIRD-PARTY-NOTICES.md"), "utf8");
const repoNotices = readFileSync(at("../../THIRD-PARTY-NOTICES.md"), "utf8");
const licences = at("../../Assets/Kit/Licenses/");

const COPYRIGHTS = [
  "Copyright (c) 2024 Hoshou Neko",
  "Copyright (c) 2011 Juan Montoreano",
  "Digitized data copyright (c) 2010 Google Corporation",
  "Copyright (c) 2012 Red Hat, Inc.",
];

test("the notices name each font's copyright line and the upstream's", () => {
  for (const line of COPYRIGHTS) {
    assert.ok(kitNotices.includes(line), `bundle notices: ${line}`);
    assert.ok(repoNotices.includes(line), `THIRD-PARTY-NOTICES.md: ${line}`);
  }
});

test("every licence text the notices name is in Assets/Kit/Licenses, whole", () => {
  const named = [...kitNotices.matchAll(/Licenses\/([A-Za-z0-9 ._-]+\.txt)/g)].map((m) => m[1]!);
  assert.ok(named.length >= 2, `named: ${named}`);
  for (const file of named) assert.ok(existsSync(licences + file), `${file} is in Assets/Kit/Licenses`);
  const files = readdirSync(licences).filter((f) => f.endsWith(".txt"));
  for (const file of files) assert.ok(named.includes(file), `${file} is named in the notices`);
  const text = (file: string) => readFileSync(licences + file, "utf8");
  const mit = files.find((f) => /TreasureHunt/i.test(f))!;
  assert.match(text(mit), /Copyright \(c\) 2024 Hoshou Neko[\s\S]*Permission is hereby granted[\s\S]*THE SOFTWARE IS PROVIDED "AS IS"/);
  const lilita = files.find((f) => f.startsWith("LilitaOne"))!;
  assert.ok(lilita, "Lilita One's OFL");
  assert.match(text(lilita), /Copyright \(c\) 2011 Juan Montoreano[\s\S]*SIL OPEN FONT LICENSE Version 1\.1[\s\S]*PERMISSION & CONDITIONS[\s\S]*DISCLAIMER/);
  // Liberation Sans's OFL is TextMesh Pro's own file, which the kit packs whenever the prefab uses the font (portkit README,
  // "Licences"); the notices say so by its name.
  assert.ok(kitNotices.includes("LiberationSans - OFL.txt"));
});

test("the built script starts with the upstream's MIT notice (script-header.txt)", () => {
  const header = readFileSync(at("../script-header.txt"), "utf8");
  assert.match(header, /Copyright \(c\) 2024 Hoshou Neko/);
  assert.match(header, /Permission is hereby granted/);
  assert.ok(!header.includes("*/") && /^[\x20-\x7e\r\n\t]*$/.test(header), "plain ASCII, no comment end");
});
