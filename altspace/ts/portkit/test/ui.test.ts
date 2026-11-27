// UI panels (ui.ts): a game describes BS.UIPanel panels of UI Kit controls under kit objects; the page builds them
// through the real adapter (BsPlatform.createPanel) on the fake app, which records every panel, element and property
// and lets a test press and change elements as a player would.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Behaviour, el, validateBindings, type UiPanel } from "../src/index.ts";
import { RulesBench } from "../src/testing.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { enter, inst, makeGame, untilStarted } from "./games.ts";

class Board extends Behaviour {
  panel!: UiPanel;
  presses = 0;
  changes: unknown[] = [];
  override Start(): void {
    this.panel = this.UI.Panel({
      id: "board",
      anchor: "boardAnchor",
      size: [1.2, 0.6],
      position: [0, 0.5, 0],
      rotation: [0, 180, 0],
      root: el("KitSurface", { id: "page", variant: "page", padding: "s4", class: "alt-column" }, [
        el("KitText", { id: "title", text: "Scores", variant: "title" }),
        el("KitButton", { id: "press", text: "Press", variant: "secondary", style: { width: 160 } }),
        el("KitToggle", { id: "mute", label: "Mute", checked: false }),
        el("VisualElement", { id: "rows", class: ["alt", "alt-column"] }),
      ]),
    });
    this.panel.Get("press").OnClick(() => {
      this.presses++;
      this.panel.Get("title").text = `Pressed ${this.presses}`;
    });
    this.panel.Get("mute").OnChange((value) => this.changes.push(value));
  }
}

const CLASSES = { Board };

function uiGame(slug = "ui") {
  return makeGame({ slug, objects: ["boardAnchor", "other"], behaviours: [{ id: "b", type: "Board", object: "boardAnchor" }], definition: { behaviours: CLASSES } });
}

async function one(seed = 501) {
  const room = new FakeRoom({ seed });
  const g = uiGame();
  const a = enter(room, [g]);
  await untilStarted(room, [a], "ui");
  await room.run(200);
  return { room, a, board: inst(a, "ui").behaviour<Board>("b") };
}

test("a panel made in Start is a BS.UIPanel on its own object under the anchor, with every element named by its id", async () => {
  const { a } = await one();
  const panel = a.panel("ui", "0", "board")!;
  assert.ok(panel && panel.alive, "the app has the panel");
  const object = panel.gameObject!;
  assert.equal(object.name, "pk1ui:ui:0:board");
  assert.equal(object.path.endsWith("/Root/boardAnchor/pk1ui:ui:0:board"), true, object.path);
  assert.deepEqual([object.local!.position.y, object.local!.rotation.y], [0.5, 180]);
  // 400 px to the metre by default: 1.2 x 0.6 m is 480 x 240 px, drawn at 100 px/m by the SDK, so the object is scaled 0.25
  assert.deepEqual(panel.resolution, { x: 480, y: 240 });
  assert.equal(object.local!.scale.x, 0.25);
  assert.equal(object.layer, 5);
  assert.deepEqual(panel.all.map((e) => `${e.type}:${e.name}`), ["VisualElement:__root", "KitSurface:page", "KitText:title", "KitButton:press", "KitToggle:mute", "VisualElement:rows"]);
  const page = a.ui("ui", "0", "board", "page");
  assert.equal(page.parent!.name, "__root");
  assert.equal(page.props.get("variant"), "page");
  assert.deepEqual([...page.classes], ["alt-column"]);
  assert.equal(a.ui("ui", "0", "board", "press").styles.get("width"), "160px");
  assert.equal(a.uiText("ui", "0", "board", "title"), "Scores");
  assert.equal(a.ui("ui", "0", "board", "mute").props.get("checked"), false);
  assert.ok(a.uiShown("ui", "0", "board", "title"));
  assert.deepEqual(a.logged("warn").concat(a.logged("error")), []);
});

test("a press reaches the game's OnClick; what the handler sets is sent once, at the end of the tick", async () => {
  const { room, a, board } = await one();
  const ui = inst(a, "ui").ui;
  const before = ui.stats.ops;
  assert.equal(a.uiClick("ui", "0", "board", "press"), true);
  await room.run(200);
  assert.equal(board.presses, 1);
  assert.equal(a.uiText("ui", "0", "board", "title"), "Pressed 1");
  assert.equal(ui.stats.ops - before, 1, "one set: the title");

  // three changes in one turn are one op; a value already sent is not sent again; idle ticks send nothing
  const title = board.panel.Get("title");
  const at = ui.stats.ops;
  title.text = "a";
  title.text = "b";
  title.text = "Pressed 1";
  await room.run(500);
  assert.equal(ui.stats.ops - at, 0, "back to what the app has: nothing to send");
  title.text = "x";
  title.text = "y";
  await room.run(200);
  assert.equal(ui.stats.ops - at, 1);
  assert.equal(a.uiText("ui", "0", "board", "title"), "y");
});

test("a hidden or disabled element takes no press; a toggle's change reaches the game with its value and is not echoed back", async () => {
  const { room, a, board } = await one();
  const press = board.panel.Get("press");
  press.enabled = false;
  await room.run(100);
  assert.equal(a.uiClick("ui", "0", "board", "press"), false);
  press.enabled = true;
  press.visible = false;
  await room.run(100);
  assert.equal(a.uiShown("ui", "0", "board", "press"), false);
  assert.equal(a.uiClick("ui", "0", "board", "press"), false);
  press.visible = true;
  await room.run(100);
  assert.equal(a.uiClick("ui", "0", "board", "press"), true);
  await room.run(100);
  assert.equal(board.presses, 1);

  const ui = inst(a, "ui").ui;
  const at = ui.stats.ops;
  assert.equal(a.uiChange("ui", "0", "board", "mute", true), true);
  await room.run(200);
  assert.deepEqual(board.changes, [true]);
  assert.equal(board.panel.Get("mute").checked, true, "the game's element holds the player's value");
  assert.equal(ui.stats.ops - at, 0, "the player's value is not sent back");
  board.panel.Get("mute").checked = false; // the script sets it back: that is sent
  await room.run(200);
  assert.equal(a.ui("ui", "0", "board", "mute").props.get("checked"), false);
});

test("panel.visible hides the whole panel by its top element (the panel's object stays on) and shows it again with its elements", async () => {
  const { room, a, board } = await one();
  board.panel.visible = false;
  await room.run(100);
  assert.equal(a.uiShown("ui", "0", "board", "title"), false);
  assert.equal(a.uiClick("ui", "0", "board", "press"), false);
  assert.equal(a.panel("ui", "0", "board")!.gameObject!.active, true);
  board.panel.visible = true;
  await room.run(100);
  assert.equal(a.uiShown("ui", "0", "board", "title"), true);
  assert.equal(a.uiClick("ui", "0", "board", "press"), true);
});

test("elements can be added and removed while the game runs; an id comes free again once its element is gone", async () => {
  const { room, a, board } = await one();
  const rows = board.panel.Get("rows");
  for (let i = 0; i < 3; i++) rows.Append(el("KitListRow", { id: `row${i}`, title: `Player ${i}`, subtitle: String(i * 10) }));
  await room.run(100);
  assert.deepEqual(a.ui("ui", "0", "board", "rows").children.map((c) => c.name), ["row0", "row1", "row2"]);
  assert.equal(a.uiText("ui", "0", "board", "row1"), "Player 1");
  board.panel.Get("row1").Destroy();
  rows.Append(el("KitListRow", { id: "row1", title: "Back" }));
  await room.run(100);
  assert.deepEqual(a.ui("ui", "0", "board", "rows").children.map((c) => c.name), ["row0", "row2", "row1"]);
  assert.equal(a.uiText("ui", "0", "board", "row1"), "Back");
  // made and removed in the same tick: whatever it was given before it went is not sent
  const tmp = rows.Append(el("KitText", { id: "tmp", text: "gone" }));
  tmp.text = "still gone";
  tmp.Destroy();
  await room.run(100);
  assert.equal(a.panel("ui", "0", "board")!.element("tmp"), null);
});

test("mistakes fail loudly: an unknown control, an unknown property, a duplicate id, a missing element", async () => {
  const { room, a, board } = await one();
  assert.throws(() => board.panel.Get("rows").Append(el("KitSpaceship", {})), /no UI element type 'KitSpaceship'/);
  assert.throws(() => board.panel.Get("rows").Append(el("KitText", { id: "title" })), /already has an element 'title'/);
  assert.throws(() => board.panel.Get("nope"), /no element 'nope'/);
  board.panel.Get("title").Set("colour", "red");
  await room.run(100);
  assert.ok(a.logged("warn").some((l) => /KitText 'title' has no property 'colour'/.test(l)), a.logged("warn").join("\n"));
  assert.equal(a.ui("ui", "0", "board", "title").props.has("colour"), false);
  assert.throws(() => inst(a, "ui").ui.Panel({ id: "board", anchor: "other", size: [1, 1], root: [] }), /already a panel 'board'/);
});

test("switching a panel's anchor off is reported, and the fake app destroys the panel as the SDK does", async () => {
  const { room, a } = await one();
  inst(a, "ui").objects.get("boardAnchor")!.SetActive(false);
  await room.run(200);
  assert.ok(a.logged("error").some((l) => /panel 'board': its anchor 'boardAnchor'.*switched off/.test(l)), a.logged("error").join("\n"));
  assert.equal(a.panel("ui", "0", "board")!.alive, false);
  assert.ok(a.notes.some((n) => /pk1ui:ui:0:board destroyed/.test(n)), a.notes.join("\n"));
});

test("two instances keep their panels apart; a panel goes with its instance", async () => {
  const room = new FakeRoom({ seed: 502 });
  const g = uiGame();
  const a = enter(room, [g], { elements: [{ slug: "ui", attributes: { room: "east" } }, { slug: "ui", attributes: { room: "west" } }] });
  await untilStarted(room, [a], "ui", "east");
  await untilStarted(room, [a], "ui", "west");
  await room.run(200);
  assert.ok(a.panel("ui", "east", "board")!.alive && a.panel("ui", "west", "board")!.alive);
  a.uiClick("ui", "east", "board", "press");
  await room.run(200);
  assert.equal(a.uiText("ui", "east", "board", "title"), "Pressed 1");
  assert.equal(a.uiText("ui", "west", "board", "title"), "Scores");
  inst(a, "ui", "west").dispose();
  await room.run(200);
  assert.equal(a.panel("ui", "west", "board")!.alive, false);
  assert.equal(a.panel("ui", "east", "board")!.alive, true);
});

test("an anchor that is not a kit object found on the page: a warning, and the game's handles still work", async () => {
  const room = new FakeRoom({ seed: 503 });
  const g = makeGame({ slug: "ui", objects: ["other"], behaviours: [{ id: "b", type: "Board", object: "other" }], definition: { behaviours: CLASSES } });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "ui");
  await room.run(200);
  assert.ok(a.logged("warn").some((l) => /panel 'board': its anchor 'boardAnchor' is not a kit object/.test(l)));
  const board = inst(a, "ui").behaviour<Board>("b");
  board.panel.Get("title").text = "still fine";
  assert.equal(board.panel.Get("title").text, "still fine");
  assert.equal(a.panel("ui", "0", "board"), null);
});

test("a rules bench gives behaviours panels that hold what the game set (nothing is shown)", () => {
  const bindings = validateBindings({
    schema: 1,
    slug: "ui",
    bundles: { windows: "", android: "" },
    objects: { boardAnchor: { path: "Root/boardAnchor", sync: "none", grab: false, click: false, seat: false } },
    refs: [],
    behaviours: [{ id: "b", type: "Board", object: "boardAnchor" }],
    events: [],
  });
  const bench = new RulesBench({ slug: "ui", behaviours: CLASSES }, bindings).start();
  const board = bench.behaviour<Board>("b");
  assert.equal(board.panel.Get("title").text, "Scores");
  assert.equal(bench.ui.GetPanel("board"), board.panel);
});
