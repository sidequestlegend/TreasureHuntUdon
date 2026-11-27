// Spike (UI toolkit stage 1): a BS.UIPanel with UI Kit controls, made by a page script and parented under a kit
// object; does it show, follow its anchor, update, and does a desktop-pointer click on a UIKitButton reach the script?
// Raw page API only (no portkit UI layer yet). Not part of the snippet.
(function () {
  "use strict";
  const KEY = "treasure-hunt:0";
  const HOLDER = "pk1:treasure-hunt:0";
  const PANEL = "pk1ui:spike:0:p";
  const say = (kind, what, detail) => console.log("PKTEST " + kind + " " + what + (detail !== undefined ? ": " + detail : ""));
  const check = (ok, what, detail) => (say(ok ? "PASS" : "FAIL", what, detail), ok);
  const replies = new Map();
  let count = 0;
  window.__pktest = Object.assign(window.__pktest || {}, {
    reply(id, text) {
      const resolve = replies.get(id);
      if (resolve) {
        replies.delete(id);
        resolve(text);
      }
    },
  });
  const cmd = (line, ms) =>
    new Promise((resolve) => {
      const id = "s" + ++count;
      replies.set(id, resolve);
      console.log("PKTEST CMD " + id + " " + line);
      setTimeout(() => {
        if (replies.delete(id)) resolve("error: no reply");
      }, ms || 30000);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms) {
    const end = Date.now() + ms;
    for (;;) {
      let v = false;
      try {
        v = await test();
      } catch (e) {
        v = false;
      }
      if (v) return v;
      if (Date.now() > end) return false;
      await sleep(150);
    }
  }
  const info = async () => {
    const text = await cmd("uipanel " + PANEL);
    const m = /at (\S+) (\S+) (\S+)/.exec(text);
    return { text, pos: m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null };
  };

  async function run() {
    const ready = await until(() => window.__pk1 && window.__pk1.debug && window.__pk1.debug[KEY], 120000);
    if (!check(!!ready, "the treasure hunt started (its kit is loaded)")) return;
    const BS = window.BS;
    const scene = BS.Scene.GetInstance();
    const objs = () => Object.values(scene.objects || {});
    const holder = objs().find((o) => o.name === HOLDER);
    const root = objs().find((o) => holder && String(o.parent) === String(holder.unityId) && o.name === "treasure-hunt(Clone)");
    if (!check(!!root, "the kit root is a page object", root && root.name)) return;
    say("INFO", "BS has", ["UIPanel", "UIKitSurface", "UIKitText", "UIKitButton", "UIKitToggle", "UIKitSlider"].map((n) => n + ":" + typeof BS[n]).join(" "));

    // 1. a page-made object under a kit object, by the constructor's `parent`
    const go = new BS.GameObject({ name: PANEL, parent: root, localPosition: new BS.Vector3(0, 0.45, -0.2), localScale: new BS.Vector3(0.25, 0.25, 0.25) });
    await go.Async();
    check(String(go.parent) === String(root.unityId), "a page-made GameObject is created under the kit object (config.parent)", "parent " + go.parent + ", root " + root.unityId);

    const panel = await go.AddComponent(new BS.UIPanel({ resolution: new BS.Vector2(400, 240) }));
    const surface = new BS.UIKitSurface(panel);
    surface.name = "surface";
    surface.padding = "s4";
    const title = new BS.UIKitText(panel, surface);
    title.name = "title";
    title.text = "Spike";
    title.variant = "heading";
    const btn = new BS.UIKitButton(panel, surface);
    btn.name = "btn";
    btn.text = "Press";
    let clicks = 0;
    btn.OnClick(() => {
      clicks++;
      title.text = "Pressed " + clicks;
    });
    const tog = new BS.UIKitToggle(panel, surface);
    tog.name = "tog";
    tog.label = "Switch";
    const changes = [];
    tog.OnChange((e) => changes.push(e && e.value));

    await sleep(1500);
    let p = await info();
    say("INFO", "panel", p.text);
    say("INFO", "elements", await cmd("uilist " + PANEL));
    check(/^active True/.test(p.text), "the panel shows (its object is on, under the kit root)", p.text);
    const t0 = await until(async () => (await cmd("uiprobe " + PANEL + " title text")) === "Spike", 5000);
    check(!!t0, "the kit text shows what the script set", await cmd("uiprobe " + PANEL + " title text"));
    say("INFO", "btn pos", await cmd("uiprobe " + PANEL + " btn pos"));
    await cmd("shot ui_spike 0 1.8 1.2 0 1.9 3 50");
    say("INFO", "scan", await cmd("uiscan " + PANEL));

    // 2. a click through the SDK's desktop pointer
    let r = await cmd("uiclick " + PANEL + " btn");
    say("INFO", "uiclick", r);
    check(await until(() => clicks === 1, 4000), "a desktop-pointer click on a UIKitButton reaches the script's OnClick", "clicks " + clicks + "; " + r);
    check(await until(async () => (await cmd("uiprobe " + PANEL + " title text")) === "Pressed 1", 4000), "the text the click handler set shows in Unity", await cmd("uiprobe " + PANEL + " title text"));

    r = await cmd("uiclick " + PANEL + " tog");
    check(await until(() => changes.length === 1, 4000), "a click on a UIKitToggle raises OnChange with its value", JSON.stringify(changes) + "; " + r);

    // 3. the panel follows its anchor
    const before = p.pos;
    await root.SetPosition(new BS.Vector3(0.5, 1.45, 3.2));
    const moved = await until(async () => {
      const q = await info();
      return q.pos && Math.abs(q.pos[0] - before[0] - 0.5) < 0.01 ? q : false;
    }, 5000);
    check(!!moved, "the panel follows its kit object when that moves", (moved ? moved.text : "") + " (before " + before + ")");
    r = await cmd("uiclick " + PANEL + " btn");
    check(await until(() => clicks === 2, 4000), "a click on the moved panel still reaches the script", "clicks " + clicks + "; " + r);

    // 4. visible / enabled / panel off
    btn.enabled = false;
    await sleep(500);
    check((await cmd("uiprobe " + PANEL + " btn enabled")) === "False", "enabled = false greys the button out in Unity");
    r = await cmd("uiclick " + PANEL + " btn");
    await sleep(800);
    check(clicks === 2, "a click on a disabled button does not reach the script", "clicks " + clicks + "; " + r);
    btn.enabled = true;
    btn.visible = false;
    await sleep(500);
    check((await cmd("uiprobe " + PANEL + " btn shown")) === "False", "visible = false hides the button in Unity");
    btn.visible = true;
    // 4a. hiding the whole panel by its top element (what the UI layer does for panel.visible)
    surface.visible = false;
    await sleep(500);
    check((await cmd("uiprobe " + PANEL + " title shown")) === "False", "visible = false on the top element hides the whole panel");
    surface.visible = true;
    await sleep(500);
    r = await cmd("uiclick " + PANEL + " btn");
    check(await until(() => clicks === 3, 4000), "shown again, its button still takes a click", "clicks " + clicks + "; " + r);

    // 4b. the anchor (a kit object) switched off and on: does the panel under it survive, elements and all?
    const prizeObj = objs().find((o) => String(o.parent) === String(root.unityId) && o.name === "Prize");
    const B = "pk1ui:spike:0:b";
    const gb = new BS.GameObject({ name: B, parent: prizeObj, localPosition: new BS.Vector3(0, 0.6, 0), localScale: new BS.Vector3(0.2, 0.2, 0.2) });
    await gb.Async();
    const pb = await gb.AddComponent(new BS.UIPanel({ resolution: new BS.Vector2(200, 120) }));
    const bb = new BS.UIKitButton(pb);
    bb.name = "bb";
    bb.text = "B";
    let bclicks = 0;
    bb.OnClick(() => bclicks++);
    await sleep(1200);
    say("INFO", "panel B", await cmd("uipanel " + B));
    await cmd("look 1.41 1.3 0.76");
    r = await cmd("uiclick " + B + " bb");
    check(await until(() => bclicks === 1, 4000), "a panel under a bound kit object (Prize) takes a click", r);
    await prizeObj.SetActive(false);
    await sleep(600);
    say("INFO", "panel B, anchor off", await cmd("uipanel " + B));
    check((await cmd("uiprobe " + B + " bb shown")) !== "True", "the anchor switched off hides the panel under it", await cmd("uiprobe " + B + " bb shown"));
    await prizeObj.SetActive(true);
    await sleep(1200);
    say("INFO", "panel B, anchor on again", (await cmd("uipanel " + B)) + " | " + (await cmd("uilist " + B)));
    r = await cmd("uiclick " + B + " bb");
    check(await until(() => bclicks === 2, 4000), "after its anchor is switched off and on, the panel keeps its elements and takes a click", "clicks " + bclicks + "; " + r);

    // 4c. the relay graph's `active` op (how portkit's GameObject.SetActive switches kit objects) on the anchor
    const relay = (op, key, arg) => scene.SendToVisualScripting("pk1", "treasure-hunt:0|" + op + "|" + window.__pk1.debug[KEY].refIndex(key) + "|" + arg);
    relay("active", "prizeContainer", "1");
    await sleep(800);
    const C = "pk1ui:spike:0:c";
    const cont = objs().find((o) => String(o.parent) === String(prizeObj.unityId) && o.name === "Container");
    const gc = new BS.GameObject({ name: C, parent: cont, localPosition: new BS.Vector3(0, 0.3, 0), localScale: new BS.Vector3(0.2, 0.2, 0.2) });
    await gc.Async();
    const pc = await gc.AddComponent(new BS.UIPanel({ resolution: new BS.Vector2(200, 120) }));
    const cb = new BS.UIKitButton(pc);
    cb.name = "cb";
    cb.text = "C";
    let cclicks = 0;
    cb.OnClick(() => cclicks++);
    await sleep(1200);
    await cmd("look 1.41 1.0 0.76");
    say("INFO", "panel C", await cmd("uipanel " + C));
    r = await cmd("uiclick " + C + " cb");
    check(await until(() => cclicks === 1, 4000), "a panel under the prize container takes a click", r);
    relay("active", "prizeContainer", "0");
    await sleep(800);
    say("INFO", "panel C, anchor off by the relay", await cmd("uipanel " + C));
    relay("active", "prizeContainer", "1");
    await sleep(1200);
    say("INFO", "panel C, anchor on again by the relay", (await cmd("uipanel " + C)) + " | " + (await cmd("uilist " + C)));
    r = await cmd("uiclick " + C + " cb");
    check(await until(() => cclicks === 2, 4000), "after the relay switches its anchor off and on, the panel keeps its elements and takes a click", "clicks " + cclicks + "; " + r);
    await cmd("look 0 1.9 3");

    // 5. many panels on a page (the SDK warns past panel 19)
    const extra = [];
    for (let i = 0; i < 22; i++) {
      const g = new BS.GameObject({ name: "pk1ui:spike:0:x" + i, parent: root, localPosition: new BS.Vector3(-1 + (i % 11) * 0.2, -0.4 - Math.floor(i / 11) * 0.2, -0.2), localScale: new BS.Vector3(0.1, 0.1, 0.1) });
      extra.push(g.Async().then(() => g.AddComponent(new BS.UIPanel({ resolution: new BS.Vector2(160, 100) }))).then((pnl) => {
        const b = new BS.UIKitButton(pnl);
        b.name = "b";
        b.text = String(i);
        return { g, pnl, b };
      }));
    }
    const made = await Promise.all(extra);
    let hits = 0;
    made[21].b.OnClick(() => hits++);
    await sleep(1500);
    r = await cmd("uiclick pk1ui:spike:0:x21 b");
    check(await until(() => hits === 1, 4000), "the 23rd panel on the page still works (a click reaches it)", r);
    await cmd("shot ui_spike_many 0 1.4 0.4 0 1.6 3 60");
    // 4d. the panel's own object switched off and on
    say("INFO", "before panel off", await cmd("uipanel " + PANEL));
    await go.SetActive(false);
    await sleep(600);
    say("INFO", "panel off", await cmd("uipanel " + PANEL));
    try {
      await go.SetActive(true);
    } catch (e) {
      say("INFO", "SetActive(true) on the panel's object threw", String(e));
    }
    await sleep(1200);
    say("INFO", "panel on again", (await cmd("uipanel " + PANEL)) + " | " + (await cmd("uilist " + PANEL)));
    r = await cmd("uiclick " + PANEL + " btn");
    check(await until(() => clicks === 4, 4000), "after the panel's own object is switched off and on, a click still works", "clicks " + clicks + "; " + r);

    say("DONE");
  }
  run().catch((e) => {
    say("FAIL", "spike threw", String(e && e.stack ? e.stack : e));
    say("DONE");
  });
})();
