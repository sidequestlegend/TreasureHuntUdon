// Writes a PROVISIONAL bindings.json from PORT.md's object model (section 5 and 7), so the rules can run on the
// fake room before the kit builder exists. The kit builder (Assets/Kit/Editor/TreasureHuntKitBuilder.cs, not
// written yet) replaces this file with the real one; the object paths below are what it is asked to build.
//
//   node --disable-warning=ExperimentalWarning tools/provisional-bindings.ts   (from altspace/ts)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KIND_OF = (slot: number) => (slot >= 18 ? "Star" : slot >= 12 ? "Gem" : "Coin");
const SLOTS = 22;
const EFFECTS = 4;
const ZONES = 8;
const LISTS = 3;
const ROWS = 16;
const PERSONAL_ROWS = 3;

export function provisionalBindings(): Record<string, unknown> {
  const objects: Record<string, { path: string; sync: string; grab: boolean; click: boolean; seat: boolean }> = {};
  const refs: string[] = [];
  const add = (key: string, path: string, opts: { click?: boolean; grab?: boolean; sync?: string; ref?: boolean } = {}) => {
    objects[key] = { path, sync: opts.sync ?? "none", grab: opts.grab === true, click: opts.click === true, seat: false };
    if (opts.ref) refs.push(key);
  };
  const obj = (key: string) => ({ $obj: key });
  const comp = (key: string, kind: string) => ({ $comp: key, kind });

  // Treasures: wrapper (Container_Parent clone) > Rotator (Animator) > treasure mesh > return button (THC:84-117).
  for (let k = 0; k < SLOTS; k++) {
    const kind = KIND_OF(k);
    add(`wrapper${k}`, `Treasures/T${k}`);
    add(`rotator${k}`, `Treasures/T${k}/Rotator`, { ref: true });
    add(`button${k}`, `Treasures/T${k}/Rotator/${kind}/Button`, { click: true });
  }
  // Pick effects: particles through the relay, the sound through the page (own clip list, outside refs).
  for (let e = 0; e < EFFECTS; e++) {
    add(`pick${e}`, `Effects/Pick${e}`, { ref: true });
    add(`pickAudio${e}`, `Effects/Pick${e}/Audio`);
  }
  for (let z = 0; z < ZONES; z++) add(`zone${z}`, `Zones/Zone${z}`);
  // Scoreboard (the kit root's own place): three lists of sixteen rows.
  for (let l = 0; l < LISTS; l++) {
    add(`list${l}`, `Scoreboard/HiScoreLists/List${l}`);
    add(`listTitle${l}`, `Scoreboard/HiScoreLists/List${l}/BG/MenuName`, { ref: true });
    for (let r = 0; r < ROWS; r++) {
      const row = `Scoreboard/HiScoreLists/List${l}/List/Row${r}`;
      add(`row${l}_${r}`, row);
      add(`rowName${l}_${r}`, `${row}/PlayerNameImg/PlayerNameTxt`, { ref: true });
      add(`rowScore${l}_${r}`, `${row}/PlayerScoreImg/PlayerScoreTxt`, { ref: true });
    }
  }
  add("personalList", "PersonalScoreList");
  for (let r = 0; r < PERSONAL_ROWS; r++) {
    const row = `PersonalScoreList/List/Row${r}`;
    add(`pRow${r}`, row);
    add(`pRowName${r}`, `${row}/PlayerNameImg/PlayerNameTxt`, { ref: true });
    add(`pRowScore${r}`, `${row}/PlayerScoreImg/PlayerScoreTxt`, { ref: true });
  }
  add("prize", "Prize");
  add("winSound", "Prize/WinSound");
  add("prizeContainer", "Prize/Container");
  add("prizeCheese", "Prize/Container/Cheese", { grab: true, sync: "transform" });
  add("credits", "Credits");

  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const behaviours: unknown[] = [
    {
      id: "controller",
      type: "TreasureHuntController",
      object: null,
      fields: {
        wrappers: range(SLOTS).map((k) => obj(`wrapper${k}`)),
        rotators: range(SLOTS).map((k) => comp(`rotator${k}`, "Animator")),
        returners: range(SLOTS).map((k) => ({ $beh: `r${k}` })),
        zonePreviews: range(ZONES).map((z) => obj(`zone${z}`)),
        pickEffects: range(EFFECTS).map((e) => obj(`pick${e}`)),
        pickParticles: range(EFFECTS).map((e) => comp(`pick${e}`, "ParticleSystem")),
        pickAudio: range(EFFECTS).map((e) => comp(`pickAudio${e}`, "AudioSource")),
        credits: obj("credits"),
      },
    },
    ...range(SLOTS).map((k) => ({
      id: `r${k}`,
      type: "TreasureReturner",
      object: `button${k}`,
      fields: { treasureHuntController: { $beh: "controller" }, slot: k, treasureName: KIND_OF(k) },
    })),
    {
      id: "scoreboard",
      type: "Scoreboard",
      object: null,
      fields: {
        treasuresPool: { $beh: "controller" },
        listRoots: range(LISTS).map((l) => obj(`list${l}`)),
        listTitles: range(LISTS).map((l) => comp(`listTitle${l}`, "TMP")),
        rowObjects: range(LISTS * ROWS).map((i) => obj(`row${Math.floor(i / ROWS)}_${i % ROWS}`)),
        rowNames: range(LISTS * ROWS).map((i) => comp(`rowName${Math.floor(i / ROWS)}_${i % ROWS}`, "TMP")),
        rowScores: range(LISTS * ROWS).map((i) => comp(`rowScore${Math.floor(i / ROWS)}_${i % ROWS}`, "TMP")),
        rowsPerList: ROWS,
      },
    },
    {
      id: "personal",
      type: "PersonalScoreList",
      object: "personalList",
      fields: {
        treasuresPool: { $beh: "controller" },
        rowObjects: range(PERSONAL_ROWS).map((r) => obj(`pRow${r}`)),
        rowNames: range(PERSONAL_ROWS).map((r) => comp(`pRowName${r}`, "TMP")),
        rowScores: range(PERSONAL_ROWS).map((r) => comp(`pRowScore${r}`, "TMP")),
      },
    },
    {
      id: "prize",
      type: "PersistancePrize",
      object: "prize",
      fields: { prizeContainer: obj("prizeContainer"), winAudioSource: comp("winSound", "AudioSource") },
    },
  ];

  return {
    schema: 1,
    slug: "treasure-hunt",
    hash: "",
    provisional:
      "Hand-made from PORT.md's object model by tools/provisional-bindings.ts, not by the kit builder. Paths, refs and keys are what the kit builder is asked to produce; it overwrites this file.",
    root: "treasure-hunt",
    bundles: { windows: "", android: "" },
    objects,
    refs,
    behaviours,
    events: [],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL("../bindings.json", import.meta.url));
  writeFileSync(out, JSON.stringify(provisionalBindings(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
