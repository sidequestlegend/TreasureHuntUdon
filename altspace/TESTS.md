# treasure-hunt: test evidence

Everything here ran on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor: first on 2026-11-24, then
again on 2026-11-25 after the fix pass (re-sync to portkit 812f285 and the review's findings, `REVIEW-FINDINGS.md`;
the numbers below are the fix pass's). Nothing ran in the Altspace app, on a Quest, or with controllers (rung 5: not
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

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **34 tests, 34 pass, 0 fail**, on the kit builder's `bindings.json` (23 before the fix
pass). Vectors are hand-derived from the C# (no dotnet golden run for this game; PORT.md 11.3). The fake room answers
the game's relay op `userHead` as the app's Get User State would (`test/helpers.ts`: the named session's head as the
room knows it, 0 0 0 for none, a frame later). Every new test failed before its fix (run against the old code first):

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
PASS treasure-hunt android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 910/2712, behaviours 896, scripts 13, ...
PASS treasure-hunt windows bundle: PASS Kind=Pass Reasons=[] Reports=[] ...
DONE
```

Kit build (`Logs/portkit_kits.txt`): 600 objects, 223 bound (1 synced, 1 grabbable, 22 clickable), 196 refs,
26 behaviours; relay graph 52 distinct members (49 before: the game's op `userHead`, the SDK's Get User State unit),
all on the allow list of 29,061, and the SDK's graph check finds no node the app will not run; relay ops end
`..., despawn, userHead`; "no reference to the upstream sounds, font, sprites, matcaps, models or Poiyomi materials"
(the builder refuses a kit that has one). The bindings hash did not change. Bundles: Android 1,399 KiB, Windows
1,841 KiB (before the fix pass 1,381 and 1,825 KiB: the two licence texts and the op), each with the notices and the
licence texts `LilitaOne-OFL.txt`, `TreasureHuntUdon-LICENSE.txt`, `LiberationSans - OFL.txt` (`Logs/portkit_bundles.txt`).

Artifacts (`PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): `android/treasure-hunt`,
`windows/treasure-hunt`, `pk-treasure-hunt.js`, `treasure-hunt.jpg`, `treasure-hunt.snippet.html` (the game's
settings with their defaults, `position="1.217 0.901 1.359"`, `scale="1"`, `zone1` to `zone8`, and the gizmos of PORT.md 8.2), `manifest.json` (checks android PASS, windows PASS,
bindings `52572c10b5939322d04b83de8437e5d9909f0b27`). The rung 3 and 4 runs below used the same bundle files
(`Library/PortKit/kits`, byte-identical to `dist/`).

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="treasure-hunt" ... max-active="3" timer-min="0" timer-max="1" prize-cost="1"
show-zones="true">` with three spawn zones 1.4 to 2.3 m in front of the player, the built script and the Windows bundle
from the test's local server, and `Assets/WebRoot/playtest/treasure-playtest.js`, which clears this device's saved
finds, drives the desktop player with portkit's InputSim (the SDK casts its own ray and raises the click) and reads
Unity back with the `probe` command. The page reloads itself half way. **RESULT 21 passed, 0 failed; 0 console error
lines**, twice in a row on the rebuilt bundles (`playtest/evidence_single.txt`, the second run). New in the fix pass:
the out-of-reach click is made from where the player arrived, with no teleport first; the referee's head reading is
compared with the camera; a find sent past the page's own check from 6 m away (`forceReturn`, a debug hook that exists
only on test pages) is refused.

```
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS the scoreboard has a list per treasure kind (relay op text): Coin, Gem, Star
PASS the personal list starts at zero: found: ["Coin 0","Gem 0","Star 0"]
PASS the credits say finds are saved on this device only: ...
PASS treasures spawn until max-active (3) are out: [2,7,8]
PASS every treasure is inside a spawn zone, and Unity shows it at its synced position: #2 Coin at 0.220 1.451 1.610 (Unity 0.220 1.451 1.610, active True, in a zone true); ...
PASS the page knows where the player is from the start, without a teleport or a move: {"head":null,"position":[0,1.6,0]}; camera 0.000 1.600 0.000
PASS a click from out of reach finds nothing: 1.63 m from 0.000 1.600 0.000; click ok screen 643,421 of 1285x842
PASS a click within reach finds the treasure and credits it once: Coin #2; counts {... "Coin":1,"Gem":0,"Star":0}; foundBy true
PASS the referee checked the find against the head its app reports (relay op userHead, Get User State): {"sid":"rsess_5803...","index":2,"head":[0.22,1.6,1.26],"distance":0.380,"allowed":3.2,"ok":true}; camera 0.220 1.600 1.260; 0.00 m apart
PASS the found treasure disappears in Unity: active False 4 ms after the credit; page shows it false; respawned false
PASS the pick effect plays (particles and the pick sound through the relay): effects 1
PASS the personal list counts the find (Unity): ["Coin 1","Gem 0","Star 0"]
PASS the scoreboard counts the find (Unity): ["Main Editor 1"]
PASS the find reaches the prize's cost: the prize shows (and the win sound plays): container active True
PASS a find sent from 6 m away past the page's own check is refused by the referee: {"index":3,"head":[-1.025,1.679,-3.873],"distance":6.0002,"allowed":3.2,"ok":false}
(the page reloads)
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS a reload keeps the finds (this device's saved data): before {... "Coin":1 ...}, after {... "Coin":1 ...} (a new session id)
PASS the personal list shows them again after the reload (Unity): ["Coin 1","Gem 0","Star 0"]
PASS the scoreboard shows them again after the reload (Unity): ["Main Editor 1"]
PASS the unlocked prize is still shown after the reload: page true, Unity True, players 1
```

What the runs found on the way:

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
rebuilt bundles (`playtest/evidence_multi.txt`, the second run).

```
[both]   PASS two players in the room: Main Editor, Player 2
[both]   PASS both players see the same treasures at the same places (digests match): 84985324 / 84985324; 1.402 1.382 2.326, 1.579 1.564 2.242, 1.445 1.607 2.328
[both]   PASS this page shows every treasure inside a zone, in Unity: ...
[finder] PASS the finder's click finds the treasure and the finder is credited: Coin #2
[ref]    PASS a find by the other player hides the treasure here too (Unity): #2 active False 8 ms after the page hid it
[ref]    PASS this player is not credited, and sees the pick effect: credited 0, effects 1
[finder] PASS the treasure disappeared for the other player, who was not credited
[finder] PASS the referee (the other page) checked the find against this player's head as its own app shows it: {"index":2,"head":[1.402,1.6,1.976],"distance":0.412,"allowed":3.2,"ok":true}; this camera 1.402 1.600 1.976; 0.00 m apart
[ref]    PASS as the referee, this page refuses the far find (its app's head reading of the other player): {"index":5,"head":[1.579,1.614,-3.758],"distance":6.0002,"allowed":3.2,"ok":false}
[finder] PASS the referee refuses a find this page sends from 6 m away, from this player's head as its own app shows it: ... this camera 1.579 1.614 -3.758; 0.00 m apart
[finder] PASS the refused find credits nothing: credited 1
[both]   PASS only the finder's saved count went up, as this page reads both
[both]   PASS the scoreboard shows both players, highest first (Unity): ["Player 2 1","Main Editor 0"]
[both]   PASS the personal list shows this player's own count only (Unity)
(the referee reloads its page; Player 2 becomes the referee)
[ref]    PASS after reloading its page the watcher sees the same treasures (late join; digests match): 434a49b6 / 434a49b6
[ref]    PASS after the reload the scoreboard still shows both players: ["Player 2 1","Main Editor 0"]
[finder] PASS the watcher came back after its reload: 434a49b6
```

Artifacts (`PortKit/Kit/Take Photos`, `PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): android 1,432,728
bytes, windows 1,885,513, script 400,517, photo, markup; manifest checks android PASS, windows PASS, bindings
`52572c10b5939322d04b83de8437e5d9909f0b27`. The rung 3 and 4 runs used the same bundle files.

## Kit gaps (portkit was not edited)

| Gap | Where | Workaround here | Proposed fix |
|---|---|---|---|
| (first pass) An object outside `refs` switched by two roads | `portkit/ts/src/host.ts` | every switched object in `refs` | **done in the kit** (f3eaaa1, SetActive by one road) |
| (first pass) No `KitStage.Clips` | `KitBuilder.cs` | the builder's own helper | **done in the kit** (d8f370d); the helper is deleted |
| (first pass) No game gizmos in the markup | `KitArtifacts.cs` | none | **done in the kit** (`SnippetGizmos`, d8f370d); used |
| (first pass) The photo shows objects the kit keeps on for the page | `KitArtifacts.cs` | none | **done in the kit** (d8f370d) |
| No runtime API for where a **remote** player is. The page only hears the local player's poses; a referee that must check a claim against another player's position has nothing it can trust | `portkit/ts/src/platform/bs.ts`, `unity/Editor/Graphs/RelayGraph.cs` | the game's own relay op `userHead` (the SDK's Get User State unit, answered as a graph-to-page event) and a fake-room handler in `test/helpers.ts` | a kit op and API, e.g. `this.Networking.HeadOf(player): Promise<Vector3 \| null>`, with the relay op in `RelayGraph.Standard` and the fake room answering from `client.head` |
| A game's relay op handler in the fake room is not told which instance a record is for | `portkit/ts/src/platform/fake.ts` (`relayOps` handler: `{op, target, args}`, client) | `test/helpers.ts` finds the instance whose graph recorded that `args` array | pass the instance key (or the parsed payload key) to the handler |
| The footprint and the photo count `Renderer`s only, so a kit that starts as uGUI alone (this one: every treasure, row and the prize start off) gets a 0 x 0 x 0 footprint, a 0.0 x 0.2 x 0.0 box gizmo and "nothing to photograph" | `portkit/unity/Editor/Kit/KitArtifacts.cs` (`Drawn`) | `GizmoSize` and `PhotoBounds` set in the builder | count the world corners of `RectTransform`s under a world-space `Canvas` (and `CanvasRenderer`s) in `Drawn` |
| `InReach` lets every click count while no position is known (README, Input) | `portkit/ts/src/instance.ts` `nearestDistance` returns 0 | the game checks `Input.Position` first | an option for games that must fail closed, or `InReach` false with no position (a breaking change; the start reading now makes it rare) |

## What remains unverified

See PORT.md 11.7: everything in the app and on a Quest (laser clicks, reach from real hands, the referee's head reading
of real avatars and its lag, the matcap shader on Quest, hearing the sounds, frame time, `localStorage` on Quest); in
Play mode, grabbing the cheese, the rotation itself, rotated zones, two hunts in one page, a referee leaving mid-find and
more than two players (Node only); the gizmos drawn in a creator's Scene view (only the exported markup was read).
