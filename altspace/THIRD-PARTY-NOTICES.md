# Third-party notices: treasure-hunt (Altspace port)

The port (`altspace/`: the kit builder, the TypeScript rules, the generated art) is MIT, as the upstream repository is.
`Assets/Kit/THIRD-PARTY-NOTICES.md` is the copy that goes into every kit bundle.

## Upstream

**TreasureHuntUdon** by Hoshou Neko, https://github.com/HoshouNeko/TreasureHuntUdon, MIT License,
Copyright (c) 2024 Hoshou Neko (`LICENSE` at the repository root). The rules in `ts/src/` are a translation of its
scripts; the kit's boards, rows, pick effect and rotator animation are copied from its prefabs
(`Assets/Tresure Hunt/Prefabs/Treasure hunt.prefab`, `Animations/Star.controller`, `Animations/Treasure_Rotator.anim`).

## Bundled

| What | Source | Licence | Replaces (upstream file, and why) |
|---|---|---|---|
| `Assets/Kit/Fonts/LilitaOne-Regular.ttf` and the atlas drawn from it (`HuntDisplay SDF.asset`, named apart from the font because the OFL reserves the name for unmodified versions) | Lilita One by Juan Montoreano, https://github.com/google/fonts/tree/main/ofl/lilitaone (upstream https://github.com/googlefonts/lilitaone), downloaded 2026-11-24, sha1 `70b4f26a4787952f7f45290cd963049ebd5a6501` | SIL Open Font License 1.1, Reserved Font Name "Lilita"; the licence text is `Assets/Kit/Fonts/LilitaOne-OFL.txt` | `Textures/Revamped.otf`, `Revamped SDF.asset`: "Typeface by Chequered Ink. (c) 2020. All Rights Reserved" |
| Liberation Sans SDF (fallback for characters Lilita One lacks) | TextMesh Pro essentials | SIL Open Font License 1.1 | (none) |
| `Assets/Kit/Audio/Pick.wav`, `Win.wav` | made for this port by `tools/make_sounds.py` (synthesised; no samples) | MIT (this port) | `Audio/Pick Audio.wav`, `Win Audio.wav`: Epic Stock Media "Advanced Game Sounds" (2016), a commercial library |
| `Assets/Kit/Models/Treasures.fbx` (coin, three gems, star), `Cheese.fbx` | made for this port by `tools/make_models.py` (Blender 5.2, headless) | MIT (this port) | `Models/Treasures.fbx`, `Models/Cheese.fbx`: no author in the files (Treasures.fbx was exported from a "VMC Props.blend"); their origin could not be established |
| `Assets/Kit/Textures/PanelFill.png`, `PanelFrame.png`, `PanelShine.png` | drawn by the kit builder | MIT (this port) | `Textures/45 Fill Beveled.png`, `45 Frame Beveled.png`, `45 Shine Beveled.png`: origin unknown |
| `Assets/Kit/Textures/GoldMatcap.png`, `DiamondMatcap.png` | drawn by the kit builder | MIT (this port) | `Textures/IMG_0373.jpg`, `68.png` (matcaps): origin unknown |
| `Assets/Kit/Shaders/TreasureMatcap.shader` | written for this port | MIT (this port) | the locked Poiyomi Toon shaders and `Gold.mat`, `Diamond.mat` (built-in pipeline) |
| `Assets/Kit/Textures/SoftDot.png`, the materials in `Assets/Kit/Materials/` | made by the kit builder | MIT (this port) | `Pick Particle.mat`, `Pick Particle Trail.mat`, `ZoneOutline.mat`, `cheese.mat` (built-in pipeline; cheese.mat's textures are missing from the repository) |

The kit builder refuses to build a kit that still refers to any of the replaced upstream files.

## Not bundled

The portkit runtime in the script (`ts/portkit/`) is MIT (`ts/portkit/LICENSE`). The Creator SDK, URP, TextMesh Pro and
Visual Scripting are the app's own and are not in the bundle.

Not affiliated with VRChat.
