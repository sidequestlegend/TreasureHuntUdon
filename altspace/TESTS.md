# treasure-hunt: test evidence

Everything here ran on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor: first on 2026-11-24, then
again on 2026-11-25 after the fix pass (re-sync to portkit 812f285 and the review's findings, `REVIEW-FINDINGS.md`),
and again on 2026-11-25 after the re-sync to portkit c971100 (the numbers below are this re-sync's; "Re-sync to
c971100" says what changed). Nothing ran in the Altspace app, on a Quest, or with controllers (rung 5: not
run; worlds stay Private).

How to run each rung again:

```
cd altspace/ts && npm test                                                        rungs 0 and 1
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Prefabs"                writes ts/bindings.json (then npm run build)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Bundles" 900
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                        rung 2 (Logs/portkit_check.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json treasure-hunt   rung 3 (deactivates a leftover Player 2)
portkit/tools/playtest.sh altspace altspace/playtest/multi.json treasure-hunt    rung 4 (activates Player 2, waits for it)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Take Photos"; ... "PortKit/Kit/Export Artifacts"   -> dist/
```

The art is made by `python altspace/tools/make_sounds.py` and
`"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python altspace/tools/make_models.py`.

## Re-sync to c971100

- `portkit/tools/sync.sh treasure-hunt`; `npm test` 34/34 before any game change and after.
- **Workarounds dropped:** the game's relay op `userHead` (`TreasureHuntKitBuilder.RelayOps`, deleted) and its handler
  `OnUserHead` / `ExpireHeadChecks`: the referee now calls `this.Networking.HeadOf(CallingPlayer, 2)` (kit op `pkHead`,
  the same Get User State; null for 0 0 0 or no answer in 2 s, which refuses the find). The finder's own check
  `if (!this.Input.Position) return false` is now `this.Input.InReach(p, find-distance, false)`, and the definition sets
  `reachWhenUnknown: false`. `test/helpers.ts`: the fake-room handler for `userHead` and its `INSTANCES` guess are deleted
  (the kit's fake room answers `pkHead` from `client.head`; `heads: "none"` sets `room.headAnswers = false`).
- **Kept, on purpose:** `GizmoSize` and `PhotoBounds`. Built without them, the kit's new uGUI-aware footprint measured
  this kit as 1.5 x 0.89 x 0 m centred on the root: the photo came out closer and off-centre (the Star list at the right
  edge) and the box gizmo became `1.5 0.2 0.0` (no depth, 1.1 m narrower than the panels). Restored, the photo is
  byte-identical to the fix pass's and the gizmo is `2.6 0.9 0.2` again (kit gaps).
- **Tests:** every trust test kept and now runs on the kit's `HeadOf`/`InReach`; test 23 also checks that the referee
  asked its app once per forged request through op `pkHead` (3 of 3).
- **Play-mode test script:** the first rung 3 run passed 21/21; the second failed 2 (the click hit a treasure standing
  0.09 m off the line in front of the target, so another index was credited and the target stayed out). The script now
  finds the frontmost treasure out (lowest z; it approaches from -z), so nothing can stand in front of it; the checks
  themselves are unchanged. The two runs of each rung below are after that change.

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **34 tests, 34 pass, 0 fail**, on the kit builder's `bindings.json` (23 before the fix
pass). Vectors are hand-derived from the C# (no dotnet golden run for this game; PORT.md 11.3). The kit's fake room
answers `Networking.HeadOf` (op `pkHead`) as the app's Get User State would: the named session's head as the room knows
it, 0 0 0 for none, a frame later (before the re-sync to c971100 the game's own op `userHead`, answered by
`test/helpers.ts`). Every new test failed before its fix (run against the old code first):

| Finding | Test | Before the fix |
|---|---|---|
| 1, referee reach check | trust: "a modified client 50 m away ... collects nothing"; "the referee's reach check has slack ... and no more" | 3 of 3 collected from 50 m; a find with the head 3.5 m away credited |
| 2, fail closed with no position | trust: "no position known: a click finds nothing"; "the referee fails closed: no head ... or no answer at all" | the click with no position counted; the find with no head credited |
| 3, markup | markup: three tests (every setting the script reads is declared with its default, `zone1`-`zone8` and `scale`; the gizmos) | the markup had `zone1`-`zone3` only and no `scale`; the script read 32 zones |
| 5, licences | notices: copyright lines of every font, the licence texts in `Assets/Kit/Licenses` | Liberation Sans's lines missing; no Licenses folder |
| 6, highest serial | trust: "an older copy of the hunt's state written back does not credit a find again" | the old copy, written back as a newer write, credited the find a third time |

The scenarios that click now step up to the treasure first (`findAt`: a pose 0.3 m from it), since a page that knows no
position finds nothing. The reviewer's probe (`threview/probe/probe.test.ts`) now prints `no-pose click credited: 0`,
`honest far click credited: 0`, `bypass: sent 3 credited 0 refused 3`.

```
ok 1 - bindings.json is the kit builder's, valid, and every type is a class of the game
ok 2 - the markup declares every setting the script reads: zone1 to zone8 with size and rotation, and scale
ok 3 - the declared defaults are the script's own defaults; spare zones are off until given a size
ok 4 - each zone, the personal list and the prize have a position handle in the markup
ok 5 - the notices name each font's copyright line and the upstream's
ok 6 - every licence text the notices name is in Assets/Kit/Licenses, whole
ok 7 - the built script starts with the upstream's MIT notice (script-header.txt)
ok 8 - treasures appear inside the zones, never more than max-active, and every player sees the same
ok 9 - a find: the finder is credited once, the treasure hides for everyone with one pick effect each
ok 10 - two players find the same treasure at once: it is credited once, whoever is referee
ok 11 - a click out of reach, or with treasure-hunt off, finds nothing
ok 12 - the spawner leaves and another player takes over the spawning
ok 13 - a late joiner sees the treasures that are out at once, with no pick effects for older finds
ok 14 - finds persist across a page reload on the same device, and not on another device
ok 15 - the scoreboard lists the players present, highest first, and follows joins, leaves and finds
ok 16 - seventeen players: sixteen rows per list are shown, without error
ok 17 - the prize: unlocked by a player's saved total, shown while an eligible player is present, one win sound
ok 18 - prize threshold and points come from the settings
ok 19 - two hunts in one room stay separate: state, finds, saved counts and boards
ok 20 - bad settings: both timers 0 spawn one at a time (at least 0.25 s apart), no zones spawn nothing, no errors
ok 21 - budget: one synced slot, a small leaf, and writes well under the room's 20 per second
ok 22 - sounds and the rotator go through the relay: the pick and win sounds are audio ops on kit objects; animated=false switches the animators off
ok 23 - a modified client 50 m away that sends ReturnItem itself collects nothing: the referee checks the finder's head
ok 24 - the referee's reach check has slack for a moving head and an arm's length, and no more
ok 25 - no position known: a click finds nothing (fail closed on the finder's page)
ok 26 - the referee fails closed: no head for the finder in its app, or no answer at all, refuses the find
ok 27 - an older copy of the hunt's state written back does not credit a find again (highest serial per treasure)
ok 28 - THC:204-236 the n-th hidden treasure is chosen, n = Random.Range(0, hidden count); all out gives -1
ok 29 - THC:239-249 a point in the box: half the unit collider each way, then the zone's TransformPoint
ok 30 - spawn boxes: 2,000 points stay inside their box, rotated ones included, and spread over it
ok 31 - pool order (THP item 2): coins, then gems, then the star; kit slots coins 0-11, gems 12-17, stars 18-21
ok 32 - settings (PORT.md 8.1): prefab values by default, untrusted input clamped, zero-size zones dropped
ok 33 - PP:66-82 scoring: counts times points against the cost (29, 30, 31; missing keys read 0)
ok 34 - SB:408-431 upstream's order is wrong from four players; the port sorts highest first, ties in join order
```

## Rung 2: the kit in edit mode (`PortKit/Kit/Check`)

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS treasure-hunt bindings: 223 objects resolve by path; hash matches (52572c10b5939322d04b83de8437e5d9909f0b27)
PASS treasure-hunt android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 913/2715, behaviours 898, scripts 14, ...
PASS treasure-hunt windows bundle: PASS Kind=Pass Reasons=[] Reports=[] ...
DONE
```

Kit build (`Logs/portkit_kits.txt`): 600 objects, 223 bound (1 synced, 1 grabbable, 22 clickable), 196 refs,
26 behaviours; relay graph 620 units, 52 distinct members, all on the allow list of 29,061, and the SDK's graph check
finds no node the app will not run; relay ops `clock, pkHead, text, active, ..., rbLaunch, spawn, despawn` (the kit's
`pkHead` in place of the game's `userHead`). The bundles gained 3 objects, 2 behaviours and 1 script (14): the
`BSPlayerEvents` with made events the kit now puts on the one grabbable (the cheese); "no reference to the upstream sounds, font, sprites, matcaps, models or Poiyomi materials"
(the builder refuses a kit that has one). The bindings hash did not change. Bundles: **Android 1,400 KiB, Windows 1,844 KiB** (1,399 and 1,841 KiB on
812f285; 1,381 and 1,825 KiB before the fix pass), each with the notices and the licence texts `LilitaOne-OFL.txt`,
`TreasureHuntUdon-LICENSE.txt`, `LiberationSans - OFL.txt` (`Logs/portkit_bundles.txt`).

Artifacts (`PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): `android/treasure-hunt`,
`windows/treasure-hunt`, `pk-treasure-hunt.js`, `treasure-hunt.jpg`, `licenses/treasure-hunt/` (the three licence
texts, each with its sha1 in the manifest), `treasure-hunt.snippet.html` (the game's
settings with their defaults, `position="1.217 0.901 1.359"`, `scale="1"`, `zone1` to `zone8`, and the gizmos of PORT.md 8.2), `manifest.json` (checks android PASS, windows PASS,
bindings `52572c10b5939322d04b83de8437e5d9909f0b27`). The rung 3 and 4 runs below used the same bundle files
(`Library/PortKit/kits`, byte-identical to `dist/`).

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="treasure-hunt" ... max-active="3" timer-min="0" timer-max="1" prize-cost="1"
show-zones="true">` with three spawn zones 1.4 to 2.3 m in front of the player, the built script and the Windows bundle
from the test's local server, and `Assets/WebRoot/playtest/treasure-playtest.js`, which clears this device's saved
finds, drives the desktop player with portkit's InputSim (the SDK casts its own ray and raises the click) and reads
Unity back with the `probe` command. The page reloads itself half way. **RESULT 21 passed, 0 failed; 0 console error
lines**, twice in a row on the c971100 bundles (`playtest.sh --keep-play`; `playtest/evidence_single.txt`, the second
run). New in the fix pass:
the out-of-reach click is made from where the player arrived, with no teleport first; the referee's head reading is
compared with the camera; a find sent past the page's own check from 6 m away (`forceReturn`, a debug hook that exists
only on test pages) is refused.

```
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS the scoreboard has a list per treasure kind (relay op text): Coin, Gem, Star
PASS the personal list starts at zero: found: ["Coin 0","Gem 0","Star 0"]
PASS the credits say finds are saved on this device only: ...
PASS treasures spawn until max-active (3) are out: [4,6,8]
PASS every treasure is inside a spawn zone, and Unity shows it at its synced position: #4 Coin at 1.282 1.584 2.346 (Unity 1.282 1.584 2.346, active True, in a zone true); ...
PASS the page knows where the player is from the start, without a teleport or a move: {"head":null,"position":[0,1.6,0]}; camera 0.000 1.600 0.000
PASS a click from out of reach finds nothing: 2.67 m from 0.000 1.600 0.000; click ok screen 643,421 of 1285x842
PASS a click within reach finds the treasure and credits it once: Gem #6; counts {... "Coin":0,"Gem":1,"Star":0}; foundBy true
PASS the referee checked the find against the head its app reports (Networking.HeadOf: relay op pkHead, Get User State): {"sid":"rsess_3431...","index":6,"head":[1.007,1.6,1.791],"distance":0.368,"allowed":3.2,"ok":true}; camera 1.007 1.600 1.791; 0.00 m apart
PASS the found treasure disappears in Unity: active False 210 ms after the credit; page shows it false; respawned false
PASS the pick effect plays (particles and the pick sound through the relay): effects 1
PASS the personal list counts the find (Unity): ["Coin 0","Gem 1","Star 0"]
PASS the scoreboard counts the find (Unity): ["Main Editor 1"]
PASS the find reaches the prize's cost: the prize shows (and the win sound plays): container active True
PASS a find sent from 6 m away past the page's own check is refused by the referee: {"index":1,"head":[-0.005,1.6,-4.301],"distance":6.0011,"allowed":3.2,"ok":false}
(the page reloads)
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS a reload keeps the finds (this device's saved data): before {... "Gem":1 ...}, after {... "Gem":1 ...} (a new session id)
PASS the personal list shows them again after the reload (Unity): ["Coin 0","Gem 1","Star 0"]
PASS the scoreboard shows them again after the reload (Unity): ["Main Editor 1"]
PASS the unlocked prize is still shown after the reload: page true, Unity True, players 1
```

What the runs found on the way:

- (re-sync to c971100) In the three single-player runs whose find hit its target, the first probe after the credit
  still saw the treasure on in Unity and the next, 200 ms later, saw it off (212, 223, 210 ms; on 812f285 the first
  probe already saw it off, 4 ms). The test re-probes for 2 s, so it passes; the cause is not pinned down (the
  multi-player hide on the watching page stays at 7 ms after its page hid it). Noted as a change, not a failure.

- **The start position now arrives without a move** (`reach is measured from {"head":null,"position":[0,1.6,0]}`, the
  camera at 0 1.6 0): the runtime's start reading (a throwaway head attachment) works in Play mode, so the test no
  longer teleports first. Before the re-sync it read `{"head":null,"position":null}` and every click counted.
- **Get User State gives the head the camera is at**, for the local player (rung 3) and for a remote orb avatar (rung 4),
  0.00 m apart at the 3-decimal precision the test prints.
- (first pass) Unity follows the page a moment later; the test re-probes for up to 2 s. Every object the script switches
  is in refs, after the prize container stayed off after a reload in one run of three.

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone open the same page. The page that is **not** the referee finds a
treasure (teleported in reach, real mouse click), so the referee checks a remote player's head; the referee watches,
then reloads its page (late join). Between the two, the finder sends a find from 6 m away past its own check, and the
referee must refuse it from its own app's head reading. Checkpoints (each page's state digest, the treasures it shows,
the referee's reach checks) go between the pages as one-shots, which the runtime ignores. In both runs the main editor
was the referee and Player 2 the finder. **RESULT 27 passed, 0 failed; 0 console error lines**, twice in a row on the
c971100 bundles (`playtest/evidence_multi.txt`, the second run).

```
[both]   PASS two players in the room: Main Editor, Player 2
[both]   PASS both players see the same treasures at the same places (digests match): 48abceaa / 48abceaa; -1.293 1.375 2.301, -1.149 1.402 2.336, 0.105 1.562 1.474
[both]   PASS this page shows every treasure inside a zone, in Unity: ...
[finder] PASS the finder's click finds the treasure and the finder is credited: Star #8
[ref]    PASS a find by the other player hides the treasure here too (Unity): #8 active False 7 ms after the page hid it
[ref]    PASS this player is not credited, and sees the pick effect: credited 0, effects 1
[finder] PASS the treasure disappeared for the other player, who was not credited
[finder] PASS the referee (the other page) checked the find against this player's head as its own app shows it: {"index":8,"head":[0.105,1.612,1.124],"distance":0.354,"allowed":3.2,"ok":true}; this camera 0.105 1.612 1.124; 0.00 m apart
[ref]    PASS as the referee, this page refuses the far find (its app's head reading of the other player): {"index":1,"head":[-1.293,1.6,-3.699],"distance":6.0042,"allowed":3.2,"ok":false}
[finder] PASS the referee refuses a find this page sends from 6 m away, from this player's head as its own app shows it: ... 0.00 m apart
[finder] PASS the refused find credits nothing: credited 1
[both]   PASS only the finder's saved count went up, as this page reads both
[both]   PASS the scoreboard shows both players, highest first (Unity): ["Player 2 1","Main Editor 0"]
[both]   PASS the personal list shows this player's own count only (Unity)
(the referee reloads its page; Player 2 becomes the referee)
[ref]    PASS after reloading its page the watcher sees the same treasures (late join; digests match): 179637ee / 179637ee
[ref]    PASS after the reload the scoreboard still shows both players: ["Player 2 1","Main Editor 0"]
[finder] PASS the watcher came back after its reload: 179637ee
```

Artifacts (`PortKit/Kit/Take Photos`, `PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): android 1,433,243
bytes (1,432,728 on 812f285), windows 1,888,189 (1,885,513), script 412,401 (400,517: the kit's new code), photo
(byte-identical to 812f285's, `PhotoBounds`), markup (box gizmo `2.6 0.9 0.2`), `licenses/treasure-hunt/` (3 texts);
manifest checks android PASS, windows PASS, bindings `52572c10b5939322d04b83de8437e5d9909f0b27`. The rung 3 and 4 runs
used the same bundle files (`Library/PortKit/kits`, byte-identical to `dist/`).

## Kit gaps (portkit was not edited)

| Gap | Where | Workaround here | Proposed fix |
|---|---|---|---|
| (first pass) An object outside `refs` switched by two roads | `portkit/ts/src/host.ts` | every switched object in `refs` | **done in the kit** (f3eaaa1, SetActive by one road) |
| (first pass) No `KitStage.Clips` | `KitBuilder.cs` | the builder's own helper | **done in the kit** (d8f370d); the helper is deleted |
| (first pass) No game gizmos in the markup | `KitArtifacts.cs` | none | **done in the kit** (`SnippetGizmos`, d8f370d); used |
| (first pass) The photo shows objects the kit keeps on for the page | `KitArtifacts.cs` | none | **done in the kit** (d8f370d) |
| No runtime API for where a **remote** player is | `portkit/ts/src/platform/bs.ts`, `unity/Editor/Graphs/RelayGraph.cs` | (was) the game's own relay op `userHead` | **done in the kit** (f7547fb: `Networking.HeadOf`, op `pkHead`); the game's op is deleted |
| A game's relay op handler in the fake room is not told which instance a record is for | `portkit/ts/src/platform/fake.ts` | (was) the `INSTANCES` guess in `test/helpers.ts` | **done in the kit** (f7547fb); the handler itself is gone (the kit answers `pkHead`) |
| The footprint and the photo count `Renderer`s only (a uGUI-only kit gets a 0 x 0 x 0 footprint) | `portkit/unity/Editor/Kit/KitArtifacts.cs` (`Drawn`) | `GizmoSize` and `PhotoBounds` | **done in the kit** (f7547fb), but see the next row: kept here |
| `Drawn` measures this kit's panels as 1.5 x 0.89 x 0 m centred on the root (`dist/manifest.json` footprint: centre 0 -0.08 0, size 1.5 0.89 0.003), while the three lists reach about 1.3 m right of the root and 0.8 m left (the photo with `PhotoBounds`). Without the overrides the photo is framed off-centre and closer, the Star list at the edge, and the box gizmo is `1.5 0.2 0.0`: a flat panel gives depth 0 | `portkit/unity/Editor/Kit/KitArtifacts.cs` (`Drawn`, `Markup`) | `GizmoSize` and `PhotoBounds` kept | find why the lists' graphics are missed or misplaced (a guess: measured before the canvases are laid out; call `Canvas.ForceUpdateCanvases()` on the measured copy first) and give a flat footprint a minimum depth in the box gizmo (e.g. 0.2 m, as its height) |
| `InReach` lets every click count while no position is known (README, Input) | `portkit/ts/src/instance.ts` | (was) the game checks `Input.Position` first | **done in the kit** (f7547fb: `InReach(p, d, false)`, `reachWhenUnknown`); used |

## What remains unverified

See PORT.md 11.7: `Networking.HeadOf` in the app (Play mode only, as the game's own op was); everything in the app and on a Quest (laser clicks, reach from real hands, the referee's head reading
of real avatars and its lag, the matcap shader on Quest, hearing the sounds, frame time, `localStorage` on Quest); in
Play mode, grabbing the cheese, the rotation itself, rotated zones, two hunts in one page, a referee leaving mid-find and
more than two players (Node only); the gizmos drawn in a creator's Scene view (only the exported markup was read).
