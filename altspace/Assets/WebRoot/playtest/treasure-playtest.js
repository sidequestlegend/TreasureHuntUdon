// Rungs 3 and 4: the treasure hunt in editor Play mode, driven through the SDK's desktop player with the port kit's
// input (InputSim: a mouse of the test's own; the SDK casts its own rays and raises the click itself), and checked in
// Unity with the kit's probe command. Not part of the snippet: the test page loads it before the snippet.
//
// window.__thPlan: "single" (one player: treasures spawn in the zones, a click within reach finds one, the lists
// update, a reload keeps the finds) or "multi" (two Local Multiplayer players: the same treasures on both, a find by
// one disappears for the other and credits only the finder, the scoreboard shows both, late join by reload).
(function () {
  "use strict";
  const KEY = "treasure-hunt:0";
  const HOLDER = "pk1:treasure-hunt:0";
  const say = (kind, what, detail) => console.log("PKTEST " + kind + " " + what + (detail !== undefined ? ": " + detail : ""));
  let passed = 0;
  let failed = 0;
  const check = (ok, what, detail) => {
    if (ok) passed++;
    else failed++;
    say(ok ? "PASS" : "FAIL", what, detail);
    return ok;
  };
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
      const id = "t" + ++count;
      replies.set(id, resolve);
      console.log("PKTEST CMD " + id + " " + line);
      setTimeout(() => {
        if (replies.delete(id)) resolve("error: no reply");
      }, ms || 30000);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms, step) {
    const end = Date.now() + ms;
    for (;;) {
      let value = false;
      try {
        value = test();
      } catch (e) {
        value = false;
      }
      if (value) return value;
      if (Date.now() > end) return false;
      await sleep(step || 100);
    }
  }
  const debug = () => window.__pk1 && window.__pk1.debug && window.__pk1.debug[KEY];
  const hunt = () => debug().hunt();
  const probe = (what, path, extra) => cmd("probe " + HOLDER + " " + what + " " + path.replace(/ /g, "%20") + (extra ? " " + extra : ""));
  const pathOf = (key) => debug().pathOf(key);
  const fmt = (v) => v.map((n) => Number(n).toFixed(3)).join(" ");
  const activeIdx = () => hunt().active.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const kinds = ["Coin", "Gem", "Star"];
  const kindOfSlot = (slot) => (slot >= 18 ? "Star" : slot >= 12 ? "Gem" : "Coin");

  /** Is a world point inside one of the zones (rotation as Unity's Euler ZXY, here the zones are not rotated)? */
  function inZone(p) {
    return hunt().zones.some((z) => {
      if (z.rotation.some((r) => r !== 0)) return false;
      return [0, 1, 2].every((a) => Math.abs(p[a] - z.center[a]) <= z.size[a] / 2 + 0.002);
    });
  }

  function teleportNear(p, back) {
    // stand `back` metres in front of the treasure (towards -z), facing it; the head is about 1.6 m above the feet
    const scene = window.BS.Scene.GetInstance();
    scene.TeleportTo(new window.BS.Vector3(p[0], Math.max(0, p[1] - 1.55), p[2] - back), 0, true);
  }

  /** Finds treasure `i` with the desktop mouse: teleports close, looks at its click target and clicks it. */
  async function findTreasure(i, label) {
    const h = hunt();
    const p = h.positions[i];
    teleportNear(p, 0.35);
    await sleep(1500);
    const pos = await probe("pos", h.buttonPaths[i]);
    await cmd("look " + pos);
    await sleep(300);
    const r = await cmd("click " + pos);
    say("INFO", label + " click", r + "; reach from " + JSON.stringify(debug().reach()));
    return r.startsWith("ok");
  }

  /** The texts of one score list as Unity shows them: "name score" for each row switched on. */
  async function boardRows(l) {
    const out = [];
    for (let r = 0; r < 4; r++) {
      const on = await probe("active", pathOf(`row${l}_${r}`));
      if (on !== "True") continue;
      out.push((await probe("text", pathOf(`rowName${l}_${r}`))) + " " + (await probe("text", pathOf(`rowScore${l}_${r}`))));
    }
    return out;
  }
  async function personalRows() {
    const out = [];
    for (let r = 0; r < 3; r++) {
      if ((await probe("active", pathOf(`pRow${r}`))) !== "True") continue;
      out.push((await probe("text", pathOf(`pRowName${r}`))) + " " + (await probe("text", pathOf(`pRowScore${r}`))));
    }
    return out;
  }

  async function waitStarted() {
    const ok = await until(() => debug() && debug().hunt && hunt().zones, 120000, 250);
    check(!!ok, "the kit loads from a hand-written bs-snippet and the instance starts", ok ? "" : "no debug hooks after 120 s");
    if (!ok) return false;
    say("INFO", "reach is measured from " + JSON.stringify(debug().reach()));
    return true;
  }

  /** Every treasure out is inside a zone, and Unity shows it there. */
  async function checkSpawned(label) {
    const h = hunt();
    const out = activeIdx();
    const lines = [];
    let ok = out.length > 0;
    for (const i of out) {
      const p = h.positions[i];
      const unity = (await probe("pos", h.wrapperPaths[i])).split(" ").map(Number);
      const active = await probe("active", h.wrapperPaths[i]);
      const same = Math.hypot(unity[0] - p[0], unity[1] - p[1], unity[2] - p[2]) < 0.01;
      ok = ok && inZone(p) && same && active === "True";
      lines.push(`#${i} ${kindOfSlot(h.slots[i])} at ${fmt(p)} (Unity ${fmt(unity)}, active ${active}, in a zone ${inZone(p)})`);
    }
    check(ok, label, lines.join("; "));
  }

  // ---- one player ------------------------------------------------------------------------------------------------
  const reloaded = () => {
    try {
      return sessionStorage.getItem("thTestReloaded") === "1";
    } catch (e) {
      return false;
    }
  };

  async function single() {
    if (!(await waitStarted())) return;
    const me = debug().me();
    if (reloaded()) {
      // after the reload: the finds made before it are back on both boards, read from this device's storage
      let saved = {};
      try {
        saved = JSON.parse(sessionStorage.getItem("thTestCounts") || "{}");
      } catch (e) {
        /* nothing */
      }
      const back = await until(() => debug().counts().find((c) => c.sid === me.sid), 20000, 250);
      const counts = back || {};
      check(kinds.every((k) => counts[k] === saved[k]) && kinds.some((k) => saved[k] > 0), "a reload keeps the finds (this device's saved data)", `before ${JSON.stringify(saved)}, after ${JSON.stringify(counts)}`);
      await sleep(2500); // the lists are built 1 s after start
      const rows = await personalRows();
      check(kinds.every((k, n) => rows[n] === `${k} ${saved[k]}`), "the personal list shows them again after the reload (Unity)", JSON.stringify(rows));
      const k = kinds.find((x) => saved[x] > 0);
      const board = await boardRows(kinds.indexOf(k));
      check(board[0] === `${me.name} ${saved[k]}`, "the scoreboard shows them again after the reload (Unity)", JSON.stringify(board));
      await until(() => debug().prizeShown(), 5000, 200);
      let unity = await probe("active", pathOf("prizeContainer"));
      for (let n = 0; n < 10 && unity !== "True"; n++) {
        await sleep(300);
        unity = await probe("active", pathOf("prizeContainer"));
      }
      check(debug().prizeShown() && unity === "True", "the unlocked prize is still shown after the reload", `page ${debug().prizeShown()}, Unity ${unity}, players ${debug().players().length}, counts ${JSON.stringify(debug().counts())}`);
      try {
        sessionStorage.removeItem("thTestReloaded");
      } catch (e) {
        /* nothing */
      }
      return;
    }

    // the boards
    await sleep(2500);
    const titles = [await probe("text", pathOf("listTitle0")), await probe("text", pathOf("listTitle1")), await probe("text", pathOf("listTitle2"))];
    check(titles.join(",") === "Coin,Gem,Star", "the scoreboard has a list per treasure kind (relay op text)", titles.join(", "));
    const found = await probe("text", "PersonalScoreList/BG/MenuName");
    const before = await personalRows();
    check(found === "found:" && before.join(",") === "Coin 0,Gem 0,Star 0", "the personal list starts at zero", `${found} ${JSON.stringify(before)}`);
    const credits = await probe("text", "Credits/Text");
    check(/saved on this device only/.test(credits), "the credits say finds are saved on this device only", credits.slice(0, 120));

    // treasures appear inside the zones, up to the cap
    const three = await until(() => activeIdx().length === 3, 20000, 200);
    check(!!three, "treasures spawn until max-active (3) are out", JSON.stringify(activeIdx()));
    await sleep(800);
    await checkSpawned("every treasure is inside a spawn zone, and Unity shows it at its synced position");
    const spin = await probe("active", hunt().wrapperPaths[activeIdx()[0]]);
    say("INFO", "first treasure's wrapper active in Unity: " + spin);
    await cmd("shot spawned 0 1.6 0 0 1.4 1.4 70");

    // out of reach: from where the player stands now (a metre and more away) a click does nothing, when the runtime knows
    // where the player is
    const target = activeIdx()[0];
    const far = hunt().positions[target];
    teleportNear(far, 1.6);
    await sleep(1500);
    const reach = debug().reach();
    const from = reach.head || reach.position;
    const pos = await probe("pos", hunt().buttonPaths[target]);
    await cmd("look " + pos);
    const req = hunt().findsRequested;
    const r = await cmd("click " + pos);
    await sleep(1500);
    if (from) {
      const d = Math.hypot(from[0] - far[0], from[1] - far[1], from[2] - far[2]);
      check(hunt().findsRequested === req && hunt().active[target], "a click from out of reach finds nothing", `${d.toFixed(2)} m from ${fmt(from)}; click ${r}`);
    } else {
      say("INFO", "out-of-reach click not judged: the page has no head pose or position yet (every click counts then)", "click " + r + ", requested " + (hunt().findsRequested - req));
    }

    // a find within reach
    const before2 = hunt();
    const i = activeIdx().find((x) => !before2.foundBy[x]) ?? activeIdx()[0];
    const kind = kindOfSlot(before2.slots[i]);
    await findTreasure(i, "find " + kind);
    const credited = await until(() => hunt().findsCredited === 1, 8000, 100);
    const counts = debug().counts().find((c) => c.sid === me.sid) || {};
    check(!!credited && counts[kind] === 1, "a click within reach finds the treasure and credits it once", `${kind} #${i}; counts ${JSON.stringify(counts)}; foundBy ${hunt().foundBy[i] === me.sid}`);
    let gone = await probe("active", before2.wrapperPaths[i]);
    for (let n = 0; n < 10 && gone !== "False"; n++) {
      await sleep(200);
      gone = await probe("active", before2.wrapperPaths[i]);
    }
    const respawned = hunt().active[i] && hunt().serials[i] !== before2.serials[i];
    check(gone === "False" || respawned, "the found treasure disappears in Unity", `active ${gone}; page shows it ${hunt().shown[i]}; respawned ${respawned}`);
    check(hunt().pickEffectsPlayed >= 1, "the pick effect plays (particles and the pick sound through the relay)", `effects ${hunt().pickEffectsPlayed}`);
    await sleep(1500);
    const rows = await personalRows();
    check(rows[kinds.indexOf(kind)] === `${kind} 1`, "the personal list counts the find (Unity)", JSON.stringify(rows));
    const board = await boardRows(kinds.indexOf(kind));
    check(board[0] === `${me.name} 1`, "the scoreboard counts the find (Unity)", JSON.stringify(board));
    // prize-cost="1": any find unlocks the prize
    const prize = await until(() => debug().prizeShown(), 4000, 200);
    const shown = await probe("active", pathOf("prizeContainer"));
    check(!!prize && shown === "True", "the find reaches the prize's cost: the prize shows (and the win sound plays)", `container active ${shown}`);
    await cmd("shot found 0 1.6 0 0 1.4 1.4 70");

    // reload: the finds must come back from this device's saved data
    await until(() => activeIdx().length === 3, 6000, 200);
    try {
      sessionStorage.setItem("thTestReloaded", "1");
      sessionStorage.setItem("thTestCounts", JSON.stringify(debug().counts().find((c) => c.sid === me.sid)));
    } catch (e) {
      /* no storage: the reload test cannot run */
    }
    say("INFO", "page result before the reload " + passed + " passed, " + failed + " failed");
    say("INFO", "reloading the page");
    await sleep(500);
    location.reload();
    await sleep(120000);
  }

  // ---- two players -----------------------------------------------------------------------------------------------
  // Both pages run this. The page whose session id sorts first finds a treasure; the other watches, then reloads its page
  // (late join). Checkpoints go between the pages as one-shots, which the runtime ignores (not its envelope).
  const heard = [];
  function channel() {
    const scene = window.BS.Scene.GetInstance();
    scene.On("one-shot", (e) => {
      const data = e && e.detail && e.detail.data;
      if (typeof data !== "string" || data.indexOf("thTest") < 0) return;
      try {
        heard.push(JSON.parse(data));
      } catch (x) {
        /* not ours */
      }
    });
    return (message) => scene.OneShot(JSON.stringify(Object.assign({ thTest: 1 }, message)));
  }
  const view = () => {
    const h = hunt();
    return { digest: debug().digest(), active: activeIdx(), positions: activeIdx().map((i) => fmt(h.positions[i])) };
  };
  /** Waits until the pool is at the cap on this page and a little longer (no write in flight), then says so. */
  async function settled(send, step) {
    await until(() => activeIdx().length === 3, 30000, 200);
    await sleep(2000);
    send(Object.assign({ kind: "view", step }, view()));
    const theirs = await until(() => heard.find((m) => m.kind === "view" && m.step === step), 60000, 200);
    return theirs;
  }

  async function multi() {
    if (!(await waitStarted())) return;
    const send = channel();
    const two = await until(() => debug().players().length >= 2, 90000, 500);
    check(!!two, "two players in the room", JSON.stringify(debug().players()));
    if (!two) return;
    const me = debug().me();
    const back = reloaded();
    const others = debug().players().filter((p) => p.sid !== me.sid);
    const finder = back ? false : me.sid < others[0].sid;
    say("INFO", me.name + (finder ? " finds" : " watches") + (back ? " (back after a reload)" : ""));
    const other = others[0].name;

    if (back) {
      const theirs = await settled(send, "late");
      const mine = view();
      check(!!theirs && theirs.digest === mine.digest && theirs.active.join() === mine.active.join(),
        "after reloading its page the watcher sees the same treasures (late join; digests match)", theirs ? `${mine.digest} / ${theirs.digest}; ${mine.positions.join(", ")}` : "no word from the finder");
      await sleep(2500);
      let k = "Coin";
      try {
        k = sessionStorage.getItem("thTestKind") || k;
      } catch (e) {
        /* nothing */
      }
      const board = await boardRows(kinds.indexOf(k));
      check(board[0] === `${other} 1` && board[1] === `${me.name} 0`, "after the reload the scoreboard still shows both players", JSON.stringify(board));
      try {
        sessionStorage.removeItem("thTestReloaded");
      } catch (e) {
        /* nothing */
      }
      send({ kind: "done" });
      return;
    }

    // 1. both see the same treasures
    const theirs = await settled(send, "start");
    const mine = view();
    check(!!theirs && theirs.digest === mine.digest && theirs.active.join() === mine.active.join() && theirs.positions.join() === mine.positions.join(),
      "both players see the same treasures at the same places (digests match)", theirs ? `${mine.digest} / ${theirs.digest}; ${mine.positions.join(", ")}` : "no word from the other page");
    await checkSpawned("this page shows every treasure inside a zone, in Unity");

    // 2. the finder finds one; it disappears for the other, and only the finder is credited
    let kindName = "";
    if (finder) {
      const i = activeIdx()[0];
      const h = hunt();
      const kind = kindOfSlot(h.slots[i]);
      kindName = kind;
      send({ kind: "finding", index: i, serial: h.serials[i], kindName: kind });
      await sleep(500);
      await findTreasure(i, "find " + kind);
      const credited = await until(() => hunt().findsCredited === 1, 8000, 100);
      check(!!credited, "the finder's click finds the treasure and the finder is credited", `${kind} #${i}`);
      send({ kind: "found", index: i, kindName: kind });
      const seen = await until(() => heard.find((m) => m.kind === "seen"), 30000, 200);
      check(!!seen && seen.hidden && seen.credited === 0, "the treasure disappeared for the other player, who was not credited", seen ? JSON.stringify(seen) : "no word");
    } else {
      const finding = await until(() => heard.find((m) => m.kind === "finding"), 60000, 200);
      if (!finding) return void check(false, "the other player finds a treasure", "no word");
      const i = finding.index;
      kindName = finding.kindName;
      const path = hunt().wrapperPaths[i];
      const hidden = await until(() => !hunt().shown[i] || hunt().serials[i] !== finding.serial, 15000, 100);
      let unity = await probe("active", path);
      if (unity !== "False" && hunt().serials[i] === finding.serial) unity = await probe("active", path);
      check(!!hidden && (unity === "False" || hunt().serials[i] !== finding.serial), "a find by the other player hides the treasure here too (Unity)", `#${i} active ${unity}`);
      await until(() => heard.find((m) => m.kind === "found"), 15000, 200);
      check(hunt().findsCredited === 0 && hunt().pickEffectsPlayed >= 1, "this player is not credited, and sees the pick effect", `credited ${hunt().findsCredited}, effects ${hunt().pickEffectsPlayed}`);
      send({ kind: "seen", hidden: !!hidden, credited: hunt().findsCredited, effects: hunt().pickEffectsPlayed });
    }

    // 3. both scoreboards show both players; the counts are the finder's 1 and the watcher's 0
    await sleep(2500);
    const counts = debug().counts();
    const finderName = finder ? me.name : other;
    const watcherName = finder ? other : me.name;
    const byName = (n) => counts.find((c) => c.name === n) || {};
    check(byName(finderName)[kindName] === 1 && byName(watcherName)[kindName] === 0, "only the finder's saved count went up, as this page reads both", JSON.stringify(counts));
    const board = await boardRows(kinds.indexOf(kindName));
    check(board.length === 2 && board[0] === `${finderName} 1` && board[1] === `${watcherName} 0`, "the scoreboard shows both players, highest first (Unity)", JSON.stringify(board));
    const pRows = await personalRows();
    check(pRows[kinds.indexOf(kindName)] === `${kindName} ${finder ? 1 : 0}`, "the personal list shows this player's own count only (Unity)", JSON.stringify(pRows));

    // 4. the watcher reloads its page (late join)
    if (!finder) {
      try {
        sessionStorage.setItem("thTestReloaded", "1");
        sessionStorage.setItem("thTestKind", kindName);
      } catch (e) {
        /* no storage: the reload test cannot run */
      }
      say("INFO", "page result before the reload " + passed + " passed, " + failed + " failed");
      say("INFO", "the watcher reloads its page");
      await sleep(500);
      location.reload();
      await sleep(120000);
      return;
    }
    const theirsLate = await settled(send, "late");
    check(!!theirsLate, "the watcher came back after its reload", theirsLate ? theirsLate.digest : "no word");
    await until(() => heard.find((m) => m.kind === "done"), 30000, 200);
  }

  // A fresh run starts from no saved finds on this device (an earlier run's would otherwise count); a reload keeps them.
  function forgetSavedFinds() {
    try {
      if (sessionStorage.getItem("thTestReloaded") === "1") return 0;
      const gone = Object.keys(localStorage).filter((k) => k.indexOf("pk1.treasure-hunt.") === 0);
      for (const k of gone) localStorage.removeItem(k);
      return gone.length;
    } catch (e) {
      return -1;
    }
  }
  say("INFO", "saved data cleared before the run: " + forgetSavedFinds() + " keys");

  window.__thRun = async function (plan) {
    try {
      if (plan === "single") await single();
      else if (plan === "multi") await multi();
    } catch (e) {
      check(false, "the test ran to its end", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
    }
    say("INFO", "page result " + passed + " passed, " + failed + " failed");
    console.log("PKTEST DONE");
  };
  if (window.__thPlan) window.__thRun(window.__thPlan);
})();
