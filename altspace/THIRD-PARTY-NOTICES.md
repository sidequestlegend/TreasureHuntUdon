# Third-party notices: treasure-hunt (Altspace port)

The port (`altspace/`: the kit builder, the TypeScript rules, the generated art) is MIT, as the upstream repository is.
`Assets/Kit/THIRD-PARTY-NOTICES.md` is the short form that goes into every kit bundle, with the full licence texts it
names: `Assets/Kit/Licenses/TreasureHuntUdon-LICENSE.txt` (upstream MIT). The kit carries no font: since the UI Toolkit
pass (PORT.md 11.8) its boards are panels the page builds with the app's own UI Kit, which draws with the app's font, so
Lilita One, its atlas and TextMesh Pro's Liberation Sans are no longer in the bundle. The built script
`pk-treasure-hunt.js` starts with the upstream MIT notice (`ts/script-header.txt`), then portkit's own.

## Upstream

**TreasureHuntUdon** by Hoshou Neko, https://github.com/HoshouNeko/TreasureHuntUdon, MIT License,
Copyright (c) 2024 Hoshou Neko (`LICENSE` at the repository root; copied to `Assets/Kit/Licenses/TreasureHuntUdon-LICENSE.txt`). The rules in `ts/src/` are a translation of its
scripts; the boards' layout follows its prefabs, and the kit's pick effect and rotator animation are copied from them
(`Assets/Tresure Hunt/Prefabs/Treasure hunt.prefab`, `Animations/Star.controller`, `Animations/Treasure_Rotator.anim`).

## Bundled

| What | Source | Licence | Replaces (upstream file, and why) |
|---|---|---|---|
| `Assets/Kit/Audio/Pick.wav`, `Win.wav` | made for this port by `tools/make_sounds.py` (synthesised; no samples) | MIT (this port) | `Audio/Pick Audio.wav`, `Win Audio.wav`: Epic Stock Media "Advanced Game Sounds" (2016), a commercial library |
| `Assets/Kit/Models/Treasures.fbx` (coin, three gems, star), `Cheese.fbx` | made for this port by `tools/make_models.py` (Blender 5.2, headless) | MIT (this port) | `Models/Treasures.fbx`, `Models/Cheese.fbx`: no author in the files (Treasures.fbx was exported from a "VMC Props.blend"); their origin could not be established |
| `Assets/Kit/Textures/GoldMatcap.png`, `DiamondMatcap.png` | drawn by the kit builder | MIT (this port) | `Textures/IMG_0373.jpg`, `68.png` (matcaps): origin unknown |
| `Assets/Kit/Shaders/TreasureMatcap.shader` | written for this port | MIT (this port) | the locked Poiyomi Toon shaders and `Gold.mat`, `Diamond.mat` (built-in pipeline) |
| `Assets/Kit/Textures/SoftDot.png`, the materials in `Assets/Kit/Materials/` | made by the kit builder | MIT (this port) | `Pick Particle.mat`, `Pick Particle Trail.mat`, `ZoneOutline.mat`, `cheese.mat` (built-in pipeline; cheese.mat's textures are missing from the repository) |

The kit builder refuses to build a kit that still refers to any of the replaced upstream files. Upstream's Revamped font
(Chequered Ink, all rights reserved) and its UI sprites (origin unknown) are not replaced any more: the boards that used
them are UI Kit panels now. Until the UI Toolkit pass the kit carried Lilita One (SIL OFL 1.1, Copyright (c) 2011 Juan
Montoreano) and rounded-rectangle sprites drawn by the builder in their place.

## Not bundled

The portkit runtime in the script (`ts/portkit/`) is MIT (`ts/portkit/LICENSE`). The Creator SDK, its UI Kit and the font
it draws with, URP and Visual Scripting are the app's own and are not in the bundle.

Not affiliated with VRChat.
