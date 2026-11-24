# treasure-hunt: test evidence

Everything here ran on 2026-11-24 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor. Nothing ran
in the Altspace app, on a Quest, or with controllers (rung 5: not run; worlds stay Private).

How to run each rung again:

```
cd altspace/ts && npm test                                                        rungs 0 and 1
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Prefabs"                writes ts/bindings.json (then npm run build)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Bundles" 900
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                        rung 2 (Logs/portkit_check.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json treasure-hunt   rung 3 (Player 2 not active)
portkit/tools/remote.sh altspace menu "PortKit/Multiplayer/Activate Player 2"
portkit/tools/playtest.sh altspace altspace/playtest/multi.json treasure-hunt    rung 4
```

The art is made by `python altspace/tools/make_sounds.py` and
`"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python altspace/tools/make_models.py`.

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **23 tests, 23 pass, 0 fail**, on the kit builder's `bindings.json`. Vectors are
hand-derived from the C# (no dotnet golden run for this game; PORT.md 11.3).

```
ok 1 - bindings.json is the kit builder's, valid, and every type is a class of the game
ok 2 - treasures appear inside the zones, never more than max-active, and every player sees the same
ok 3 - a find: the finder is credited once, the treasure hides for everyone with one pick effect each
ok 4 - two players find the same treasure at once: it is credited once, whoever is referee
ok 5 - a click out of reach, or with treasure-hunt off, finds nothing
ok 6 - the spawner leaves and another player takes over the spawning
ok 7 - a late joiner sees the treasures that are out at once, with no pick effects for older finds
ok 8 - finds persist across a page reload on the same device, and not on another device
ok 9 - the scoreboard lists the players present, highest first, and follows joins, leaves and finds
ok 10 - seventeen players: sixteen rows per list are shown, without error
ok 11 - the prize: unlocked by a player's saved total, shown while an eligible player is present, one win sound
ok 12 - prize threshold and points come from the settings
ok 13 - two hunts in one room stay separate: state, finds, saved counts and boards
ok 14 - bad settings: both timers 0 spawn one at a time (at least 0.25 s apart), no zones spawn nothing, no errors
ok 15 - budget: one synced slot, a small leaf, and writes well under the room's 20 per second
ok 16 - sounds and the rotator go through the relay: the pick and win sounds are audio ops on kit objects; animated=false switches the animators off
ok 17 - THC:204-236 the n-th hidden treasure is chosen, n = Random.Range(0, hidden count); all out gives -1
ok 18 - THC:239-249 a point in the box: half the unit collider each way, then the zone's TransformPoint
ok 19 - spawn boxes: 2,000 points stay inside their box, rotated ones included, and spread over it
ok 20 - pool order (THP item 2): coins, then gems, then the star; kit slots coins 0-11, gems 12-17, stars 18-21
ok 21 - settings (PORT.md 8.1): prefab values by default, untrusted input clamped, zero-size zones dropped
ok 22 - PP:66-82 scoring: counts times points against the cost (29, 30, 31; missing keys read 0)
ok 23 - SB:408-431 upstream's order is wrong from four players; the port sorts highest first, ties in join order
```

## Rung 2: the kit in edit mode (`PortKit/Kit/Check`)

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS treasure-hunt bindings: 223 objects resolve by path; hash matches (52572c10b5939322d04b83de8437e5d9909f0b27)
PASS treasure-hunt android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 910/2709, behaviours 896, scripts 13, ...
PASS treasure-hunt windows bundle: PASS Kind=Pass Reasons=[] Reports=[] ...
DONE
```

Kit build (`Logs/portkit_kits.txt`): 600 objects, 223 bound (1 synced, 1 grabbable, 22 clickable), 196 refs,
26 behaviours; relay graph 49 distinct members, all on the allow list of 29,061; "no reference to the upstream sounds,
font, sprites, matcaps, models or Poiyomi materials" (the builder refuses a kit that has one). Bundles: Android
1,381 KiB, Windows 1,825 KiB, each with the third-party notices (MIT, and the OFL text for the font) inside.

Artifacts (`PortKit/Kit/Export Artifacts`, `altspace/dist/`, not committed): `android/treasure-hunt`,
`windows/treasure-hunt`, `pk-treasure-hunt.js`, `treasure-hunt.jpg`, `treasure-hunt.snippet.html` (the game's
settings with their defaults, `position="1.217 0.901 1.359"`), `manifest.json` (checks android PASS, windows PASS,
bindings `52572c10b5939322d04b83de8437e5d9909f0b27`). The rung 3 and 4 runs below used the same bundle files
(`Library/PortKit/kits`, byte-identical to `dist/`).

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="treasure-hunt" ... max-active="3" timer-min="0" timer-max="1" prize-cost="1"
show-zones="true">` with three spawn zones 1.4 to 2.3 m in front of the player, the built script and the Windows bundle
from the test's local server, and `Assets/WebRoot/playtest/treasure-playtest.js`, which clears this device's saved
finds, drives the desktop player with portkit's InputSim (the SDK casts its own ray and raises the click) and reads
Unity back with the `probe` command. The page reloads itself half way. **RESULT 18 passed, 0 failed; 0 console error
lines**, twice in a row on the final bundles (`playtest/evidence_single.txt`, screenshot
`playtest/evidence_single_found.jpg`).

```
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS the scoreboard has a list per treasure kind (relay op text): Coin, Gem, Star
PASS the personal list starts at zero: found: ["Coin 0","Gem 0","Star 0"]
PASS the credits say finds are saved on this device only: <b>Treasure Hunt</b>: find the coins, gems and stars ... <b>Your finds are saved on this device only</b> ...
PASS treasures spawn until max-active (3) are out: [3,6,7]
PASS every treasure is inside a spawn zone, and Unity shows it at its synced position: #3 Coin at -1.588 1.484 2.305 (Unity -1.588 1.484 2.305, active True, in a zone true); #6 Gem at 1.135 1.453 2.265 (...); #7 Gem at -0.449 1.551 1.696 (...)
PASS a click from out of reach finds nothing: 1.60 m from -1.588 1.600 0.705; click ok screen 643,421 of 1285x842
PASS a click within reach finds the treasure and credits it once: Coin #3; counts {"Coin":1,"Gem":0,"Star":0}; foundBy true
PASS the found treasure disappears in Unity: active False 208 ms after the credit; page shows it false; respawned false
PASS the pick effect plays (particles and the pick sound through the relay): effects 1
PASS the personal list counts the find (Unity): ["Coin 1","Gem 0","Star 0"]
PASS the scoreboard counts the find (Unity): ["Main Editor 1"]
PASS the find reaches the prize's cost: the prize shows (and the win sound plays): container active True
(the page reloads)
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS a reload keeps the finds (this device's saved data): before {"Coin":1,"Gem":0,"Star":0}, after {"Coin":1,"Gem":0,"Star":0} (a new session id)
PASS the personal list shows them again after the reload (Unity): ["Coin 1","Gem 0","Star 0"]
PASS the scoreboard shows them again after the reload (Unity): ["Main Editor 1"]
PASS the unlocked prize is still shown after the reload: page true, Unity True, players 1
```

What the runs found on the way:

- **Reach on the desktop.** The page knows no head pose in Play mode until the player moves (`reach is measured from
  {"head":null,"position":null}` at start), and the runtime counts every click then. The test teleports the player
  (`scene.TeleportTo`), after which the runtime measures from there: from 1.60 m a click was refused, from 0.35 m it
  counted.
- **Unity follows the page a moment later.** A probe sent right after the page hid a treasure read `active True` once;
  the test now re-probes for up to 2 s, and Unity showed the hide 208 ms after the credit.
- **The prize container stayed off after a reload in one run of three** (page: shown; Unity: off) while it and the
  score rows were outside the relay's refs. Probable cause: an object outside refs is switched by the page once the
  page has found it and through the relay (by path) before that, so the runtime's first "switch off what upstream had
  off" and the script's later "on" take two roads and can arrive out of order. With every object the script switches
  in refs (one road), four runs since passed (see kit gaps).

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone (`PortKit/Multiplayer/Activate Player 2`) open the same page. The
page whose session id sorts first finds a treasure (teleported in reach, real mouse click), the other watches, then the
watcher reloads its page (late join). Checkpoints (each page's state digest and the treasures it shows) go between them
as one-shots, which the runtime ignores. In these runs the clone's session sorted first, so Player 2 found and the main
editor watched and reloaded. **RESULT 23 passed, 0 failed; 0 console error lines**, twice in a row on the final
bundles (`playtest/evidence_multi.txt`; an earlier build, before every switched object was in refs, also passed 23 of
23).

```
[both]   PASS two players in the room: Main Editor, Player 2
[both]   PASS both players see the same treasures at the same places (digests match): cfce76d9 / cfce76d9; -0.197 1.619 1.734, -1.420 1.531 2.299, 1.293 1.446 2.154
[both]   PASS this page shows every treasure inside a zone, in Unity: #3 Coin at -0.197 1.619 1.734 (Unity -0.197 1.619 1.734, active True, in a zone true); ...
[finder] PASS the finder's click finds the treasure and the finder is credited: Coin #3
[watch]  PASS a find by the other player hides the treasure here too (Unity): #3 active False 214 ms after the page hid it
[watch]  PASS this player is not credited, and sees the pick effect: credited 0, effects 1
[finder] PASS the treasure disappeared for the other player, who was not credited: {"kind":"seen","hidden":true,"credited":0,"effects":1}
[both]   PASS only the finder's saved count went up, as this page reads both: Main Editor Coin 0, Player 2 Coin 1
[both]   PASS the scoreboard shows both players, highest first (Unity): ["Player 2 1","Main Editor 0"]
[finder] PASS the personal list shows this player's own count only (Unity): ["Coin 1","Gem 0","Star 0"]
[watch]  PASS the personal list shows this player's own count only (Unity): ["Coin 0","Gem 0","Star 0"]
(the watcher reloads its page)
[watch]  PASS after reloading its page the watcher sees the same treasures (late join; digests match): 181e538e / 181e538e
[watch]  PASS after the reload the scoreboard still shows both players: ["Player 2 1","Main Editor 0"]
[finder] PASS the watcher came back after its reload: 181e538e
```

## Kit gaps (portkit was not edited)

| Gap | Where | Workaround here | Proposed fix |
|---|---|---|---|
| An object outside `refs` is switched on and off by two roads (the page's own `SetActive` once the page has found it, the relay by path before), so two calls can arrive in Unity out of order: seen as the prize container left off after a reload | `portkit/ts/src/host.ts` `setActive` (and `instance.ts`, the first switch-off of `"active": false` objects) | every object the script switches is in `refs` (`stage.Ref` in the builder) | in `host.ts`, give an object key one road for its whole life: while the page has not found it, keep the latest value and apply it through `fallbackActive` when the object is found (or always use the relay's `@path` for objects outside refs) |
| No public way to give a plain behaviour's object a clip list the relay's `audio` op can play: `PkClips` is only written when a stand-in's `AudioClip` field is encoded | `portkit/unity/Editor/Kit/KitBuilder.cs` (`Reference`, the `AudioClip` case) | the builder's own `Clips(stage, holder, clips)` (BS Audio Source list + `PkClips` + `Ref`) | lift that into `KitStage.Clips(GameObject holder, params AudioClip[] clips)` and use it from `Reference` too |
| The snippet markup gets only the kit's position and box gizmos; a game cannot add its own (the zones, the personal list and the prize position of PORT.md 8.2) | `portkit/unity/Editor/Kit/KitArtifacts.cs` lines 82-83 | none: the exported markup has no zone gizmos | `KitBuilder.SnippetGizmos` (a list of `<bs-gizmo ...>` lines), appended after the two built-in ones |
| `PortKit/Kit/Take Photos` shows objects the kit saves on only for the page's sake (22 treasures stacked at the root, every score row) | `portkit/unity/Editor/Kit/KitArtifacts.cs` (photo) | none (cosmetic) | switch off the bound objects written `"active": false` in the photo's copy |

## What remains unverified

See PORT.md 11.7: everything in the app and on a Quest (laser clicks, reach from real hands, the matcap shader on
Quest, hearing the sounds, frame time, `localStorage` on Quest); in Play mode, grabbing the cheese, the rotation
itself, rotated zones, two hunts in one page, a referee leaving and more than two players (Node only); the zone
gizmos; an independent review against the checklist.
