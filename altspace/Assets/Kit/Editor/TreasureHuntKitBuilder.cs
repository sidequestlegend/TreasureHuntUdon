// The treasure-hunt kit: TreasureHuntUdon's "Treasure hunt" and "Persistance Prize" prefabs (HoshouNeko, MIT) made into
// a kit the snippet script loads. What changes against upstream, and why, is in altspace/PORT.md (sections 10 and 11).
//
// Upstream builds its pool at run time (wrappers, return buttons, score rows, pick effects); the page cannot make
// objects the relay can reach, so the kit holds them ready: 22 treasures (12 coins, 6 gems, 4 stars), four pick
// effects, three score lists of sixteen rows, a personal list of three rows, eight zone previews, the prize and a
// credits panel. The layout of every board, row and effect is copied from the upstream prefab; what upstream drew with
// that cannot be shipped (PORT.md section 1: the Epic Stock Media sounds, the Revamped font, the UI sprites, the
// matcaps, the models, the Poiyomi materials) is replaced by what tools/make_sounds.py, tools/make_models.py and this
// builder make, and the font Lilita One (SIL OFL 1.1). The build refuses a kit that still depends on any of those files.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using PortKit;
using TMPro;
using Unity.VisualScripting;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace TreasureHunt
{
    public sealed class TreasureHuntKitBuilder : KitBuilder
    {
        const string Upstream = "Assets/Upstream/Assets/Tresure Hunt";
        const string HuntPrefab = Upstream + "/Prefabs/Treasure hunt.prefab";
        const string StarController = Upstream + "/Animations/Star.controller";
        const string Kit = "Assets/Kit";
        const string MaterialFolder = Kit + "/Materials";
        const string TextureFolder = Kit + "/Textures";
        const string FontFolder = Kit + "/Fonts";
        const string ModelFolder = Kit + "/Models";

        /// <summary>Settings.ts: coins in slots 0-11, gems 12-17, stars 18-21.</summary>
        static readonly (string kind, int copies)[] Kinds = { ("Coin", 12), ("Gem", 6), ("Star", 4) };
        const int Effects = 4, Zones = 8, Lists = 3, Rows = 16, PersonalRows = 3;

        /// <summary>Upstream files the kit must not depend on (PORT.md section 1: not licensed for redistribution, or of unknown origin).</summary>
        static readonly string[] Banned =
        {
            "/Audio/Pick Audio.wav", "/Audio/Win Audio.wav", "/Textures/Revamped.otf", "/Textures/Revamped SDF.asset",
            "/Textures/45 Fill Beveled.png", "/Textures/45 Frame Beveled.png", "/Textures/45 Shine Beveled.png", "/Textures/68.png",
            "/Textures/IMG_0373.jpg", "/Models/Treasures.fbx", "/Models/Cheese.fbx", "/Materials/Gold.mat", "/Materials/Diamond.mat",
            "/Materials/cheese.mat", "/Materials/Pick Particle.mat", "/Materials/Pick Particle Trail.mat", "/Materials/ZoneOutline.mat",
        };

        public override string Slug => "treasure-hunt";
        public override string Title => "Treasure Hunt";
        public override string Summary => "Treasures spawn in places you choose; click one when you are close to find it. Finds are saved on this device.";
        public override string Description =>
            "A treasure hunt: coins, gems and stars appear one by one at random spots inside spawn boxes the world's creator places. " +
            "Walk up and click one to find it: it vanishes for everyone and counts for you. A personal list shows your own finds, a " +
            "scoreboard everyone's who is here, and a prize unlocks for players whose finds reach the prize's cost. Finds are saved " +
            "on this device only. A port of TreasureHuntUdon by Hoshou Neko (https://github.com/HoshouNeko/TreasureHuntUdon, MIT).";
        /// <summary>The kit root is the scoreboard (PORT.md 8.1): where it sat in upstream's demo.</summary>
        public override string SnippetPosition => "1.217 0.901 1.359";
        public override IReadOnlyList<(string name, string value)> SnippetSettings => new[]
        {
            ("room", ""), ("treasure-hunt", "true"), ("animated", "true"), ("max-active", "5"), ("timer-min", "0"), ("timer-max", "5"),
            ("coins", "5"), ("gems", "3"), ("stars", "1"), ("coin-points", "1"), ("gem-points", "5"), ("star-points", "10"),
            ("prize-cost", "30"), ("prize", "true"), ("prize-position", "0.913 0.708 0.759"), ("prize-rotation", "0 0 0"),
            ("personal-list", "0.75 0.898 1.359"), ("personal-list-rotation", "0 0 0"), ("find-distance", "0.7"),
            ("zone1", "-0.154 0.553 1.579"), ("zone1-size", "1.377 0.792 0.642"), ("zone1-rotation", "0 0 0"),
            ("zone2", "-0.557 0.910 2.554"), ("zone2-size", "0.728 0.418 0.339"), ("zone2-rotation", "0 0 0"),
            ("zone3", "0.763 1.352 2.458"), ("zone3-size", "1.343 0.772 0.626"), ("zone3-rotation", "0 0 0"),
            ("show-zones", "false"), ("credits", "true"),
        };

        TMP_FontAsset font;

        protected override void Compose(KitStage stage)
        {
            var hunt = AssetDatabase.LoadAssetAtPath<GameObject>(HuntPrefab) ?? throw new Exception($"no upstream prefab at {HuntPrefab}: run the importer");
            Transform U(string path) => hunt.transform.Find(path) ?? throw new Exception($"the upstream prefab has no '{path}'");
            var root = stage.Root.transform;

            PrepareModels();
            var mats = Materials();
            var sprites = Sprites();
            font = Font();
            var audio = Clips();

            // ---- treasures: Container_Parent (Animator, Rotator) per kit slot, the treasure inside, a click target on it ----
            var treasures = stage.Create("Treasures", root);
            var controller = AssetDatabase.LoadAssetAtPath<RuntimeAnimatorController>(StarController) ?? throw new Exception("no rotator controller");
            var meshes = AssetDatabase.LoadAllAssetsAtPath($"{ModelFolder}/Treasures.fbx").OfType<Mesh>().ToDictionary(m => m.name);
            var wrappers = new JArray();
            var rotators = new JArray();
            var buttons = new List<GameObject>();
            int slot = 0;
            foreach (var (kind, copies) in Kinds)
                for (int c = 0; c < copies; c++, slot++)
                {
                    var wrapper = stage.Copy(U("Prefabs/Container_Parent").gameObject, treasures.transform, $"T{slot}");
                    Place(wrapper.transform, Vector3.zero);
                    var animator = wrapper.GetComponent<Animator>();
                    animator.runtimeAnimatorController = controller;
                    animator.cullingMode = AnimatorCullingMode.CullCompletely;               // nobody sees it turn: it need not turn
                    var rotator = wrapper.transform.Find("Rotator");
                    string meshName = kind == "Gem" ? $"Gem{c % 3 + 1}" : kind;                  // upstream's three gem cuts, in turn
                    var treasure = stage.Create(kind, rotator);
                    treasure.AddComponent<MeshFilter>().sharedMesh = meshes.TryGetValue(meshName, out var mesh) ? mesh : throw new Exception($"no mesh {meshName}");
                    var renderer = treasure.AddComponent<MeshRenderer>();
                    renderer.sharedMaterial = kind == "Gem" ? mats["Diamond"] : mats["Gold"];
                    renderer.shadowCastingMode = ShadowCastingMode.Off;
                    renderer.receiveShadows = false;
                    // upstream's return button: an invisible sphere the size of the treasure (THC:252-268); clicked on the UI layer
                    var button = stage.Create("Button", treasure.transform);
                    var sphere = button.AddComponent<SphereCollider>();
                    sphere.center = mesh.bounds.center;
                    sphere.radius = Mathf.Max(mesh.bounds.extents.x, mesh.bounds.extents.y, mesh.bounds.extents.z) * 1.15f;
                    stage.Object(wrapper, key: $"wrapper{slot}");
                    stage.Ref(wrapper);                                                           // animEnabled goes through the relay
                    stage.Object(button, key: $"button{slot}", click: true);
                    wrapper.SetActive(false);                                                     // upstream hides every wrapper (THC:97-101)
                    wrappers.Add(stage.ObjectValue(wrapper));
                    rotators.Add(stage.ComponentValue(wrapper, "Animator"));
                    buttons.Add(button);
                }

            // ---- pick effects: four copies of Pick_Treasure_Animation, played from a pool instead of instantiated ----
            var effects = stage.Create("Effects", root);
            var pickEffects = new JArray();
            var pickParticles = new JArray();
            var pickAudio = new JArray();
            for (int e = 0; e < Effects; e++)
            {
                var pick = stage.Copy(U("Prefabs/Pick_Treasure_Animation").gameObject, effects.transform, $"Pick{e}");
                pick.transform.localPosition = Vector3.zero;
                pick.transform.localRotation = Quaternion.identity;
                var ps = pick.GetComponent<ParticleSystem>();
                var main = ps.main;
                main.playOnAwake = false;
                main.stopAction = ParticleSystemStopAction.None;                                  // upstream destroyed the copy; this one is reused
                var psr = pick.GetComponent<ParticleSystemRenderer>();
                psr.sharedMaterial = mats["Particle"];
                psr.trailMaterial = mats["ParticleTrail"];
                var source = pick.GetComponent<AudioSource>();
                source.playOnAwake = false;
                source.clip = null;
                Clips(stage, pick, audio["Pick"]);
                stage.Object(pick, key: $"pick{e}");
                stage.Ref(pick);                                                                  // particles and the audio op
                pickEffects.Add(stage.ObjectValue(pick));
                pickParticles.Add(stage.ComponentValue(pick, "ParticleSystem"));
                pickAudio.Add(stage.ComponentValue(pick, "AudioSource"));
            }

            // ---- zone previews (show-zones): upstream's outline cubes ----
            var zones = stage.Create("Zones", root);
            var zonePreviews = new JArray();
            for (int z = 0; z < Zones; z++)
            {
                var cube = stage.Primitive(PrimitiveType.Cube, $"Zone{z}", zones.transform);
                Object.DestroyImmediate(cube.GetComponent<Collider>());
                var r = cube.GetComponent<MeshRenderer>();
                r.sharedMaterial = mats["ZoneOutline"];
                r.shadowCastingMode = ShadowCastingMode.Off;
                r.receiveShadows = false;
                stage.Object(cube, key: $"zone{z}");
                cube.SetActive(false);
                zonePreviews.Add(stage.ObjectValue(cube));
            }

            // ---- the scoreboard: the kit root is its place; three lists of sixteen rows made from the upstream templates ----
            var board = stage.Copy(U("Scoreboard").gameObject, root, "Scoreboard");
            Place(board.transform, Vector3.zero);
            board.transform.localScale = U("Scoreboard").localScale;
            foreach (var template in board.transform.Find("HiScoreLists").Cast<Transform>().ToList()) Object.DestroyImmediate(template.gameObject);   // editor-only templates (item 38)
            Object.DestroyImmediate(board.transform.Find("Cube")?.gameObject);
            var lists = board.transform.Find("HiScoreLists");
            var listRoots = new JArray();
            var listTitles = new JArray();
            var rowObjects = new JArray();
            var rowNames = new JArray();
            var rowScores = new JArray();
            for (int l = 0; l < Lists; l++)
            {
                var list = stage.Copy(U("Prefabs/HiScoreList").gameObject, lists, $"List{l}");
                Place(list.transform, Vector3.zero);
                var title = list.transform.Find("BG/MenuName").gameObject;
                stage.Object(list, key: $"list{l}");
                stage.Object(title, key: $"listTitle{l}");
                stage.Ref(title);
                listRoots.Add(stage.ObjectValue(list));
                listTitles.Add(stage.ComponentValue(title, "TMP"));
                for (int r = 0; r < Rows; r++)
                {
                    var (row, name, score) = Row(stage, U("Prefabs/EntryElement").gameObject, list.transform.Find("List"), r, $"row{l}_{r}", $"rowName{l}_{r}", $"rowScore{l}_{r}");
                    rowObjects.Add(stage.ObjectValue(row));
                    rowNames.Add(stage.ComponentValue(name, "TMP"));
                    rowScores.Add(stage.ComponentValue(score, "TMP"));
                }
            }

            // ---- the personal list ("found:"), three rows ----
            var personal = stage.Copy(U("PersonalScoreList").gameObject, root, "PersonalScoreList");
            Place(personal.transform, new Vector3(0.75f - 1.217f, 0.898f - 0.901f, 0f));
            personal.transform.localScale = U("PersonalScoreList").localScale;
            var pRows = new JArray();
            var pNames = new JArray();
            var pScores = new JArray();
            for (int r = 0; r < PersonalRows; r++)
            {
                var (row, name, score) = Row(stage, U("Prefabs/EntryElement").gameObject, personal.transform.Find("List"), r, $"pRow{r}", $"pRowName{r}", $"pRowScore{r}");
                pRows.Add(stage.ObjectValue(row));
                pNames.Add(stage.ComponentValue(name, "TMP"));
                pScores.Add(stage.ComponentValue(score, "TMP"));
            }

            // ---- the prize (Persistance Prize.prefab, PORT.md 5.2): the win sound and the container with the cheese ----
            var prize = stage.Create("Prize", root);
            Place(prize.transform, new Vector3(0.913f - 1.217f, 0.708f - 0.901f, 0.759f - 1.359f));
            var winSound = stage.Create("WinSound", prize.transform);
            var win = winSound.AddComponent<AudioSource>();
            win.playOnAwake = false;
            win.spatialBlend = 1f;
            win.minDistance = 1f;
            win.maxDistance = 10f;
            Clips(stage, winSound, audio["Win"]);
            stage.Object(winSound, key: "winSound");
            stage.Ref(winSound);
            var container = stage.Create("Container", prize.transform);
            var cheese = stage.Create("Cheese", container.transform);
            cheese.AddComponent<MeshFilter>().sharedMesh = AssetDatabase.LoadAllAssetsAtPath($"{ModelFolder}/Cheese.fbx").OfType<Mesh>().First();
            cheese.AddComponent<MeshRenderer>().sharedMaterial = mats["Cheese"];
            var body = cheese.AddComponent<Rigidbody>();
            body.isKinematic = true;                                                              // upstream: kinematic, a pickup that stays where it is let go
            body.useGravity = false;
            stage.Object(cheese, key: "prizeCheese", sync: "transform", grab: true);
            stage.Object(container, key: "prizeContainer");
            container.SetActive(false);

            // ---- credits ----
            var credits = Credits(stage, root);

            // ---- every Image drawn with a replacement sprite; every text with Lilita One ----
            Reskin(stage.Root, sprites);

            // ---- behaviours (plain: their fields are this kit's objects, not upstream's) ----
            var controllerFields = new JObject
            {
                ["wrappers"] = wrappers,
                ["rotators"] = rotators,
                ["returners"] = new JArray(),                                                     // filled below, once the returners exist
                ["zonePreviews"] = zonePreviews,
                ["pickEffects"] = pickEffects,
                ["pickParticles"] = pickParticles,
                ["pickAudio"] = pickAudio,
                ["credits"] = stage.ObjectValue(credits),
            };
            var controllerToken = stage.Behaviour(treasures, "TreasureHuntController", controllerFields);   // (the stage keeps this JObject)
            stage.Object(treasures, key: "treasures");
            var returners = new JArray();
            slot = 0;
            foreach (var (kind, copies) in Kinds)
                for (int c = 0; c < copies; c++, slot++)
                {
                    var token = stage.Behaviour(buttons[slot], "TreasureReturner", new JObject
                    {
                        ["treasureHuntController"] = stage.BehaviourValue(controllerToken),
                        ["slot"] = slot,
                        ["treasureName"] = kind,
                    });
                    returners.Add(stage.BehaviourValue(token));
                }
            controllerFields["returners"] = returners;

            stage.Object(board, key: "scoreboard");
            stage.Behaviour(board, "Scoreboard", new JObject
            {
                ["treasuresPool"] = stage.BehaviourValue(controllerToken),
                ["listRoots"] = listRoots,
                ["listTitles"] = listTitles,
                ["rowObjects"] = rowObjects,
                ["rowNames"] = rowNames,
                ["rowScores"] = rowScores,
                ["rowsPerList"] = Rows,
            });
            stage.Object(personal, key: "personalList");
            stage.Behaviour(personal, "PersonalScoreList", new JObject
            {
                ["treasuresPool"] = stage.BehaviourValue(controllerToken),
                ["rowObjects"] = pRows,
                ["rowNames"] = pNames,
                ["rowScores"] = pScores,
            });
            stage.Object(prize, key: "prize");
            stage.Behaviour(prize, "PersistancePrize", new JObject
            {
                ["prizeContainer"] = stage.ObjectValue(container),
                ["winAudioSource"] = stage.ComponentValue(winSound, "AudioSource"),
            });

            // ---- the boards are read only: no uGUI raycasting, no VRChat UI-shape colliders, nothing on VRChat's layers ----
            foreach (var raycaster in stage.Root.GetComponentsInChildren<UnityEngine.UI.GraphicRaycaster>(true)) Object.DestroyImmediate(raycaster);
            foreach (var t in new[] { board.transform, personal.transform })
                foreach (var box in t.GetComponentsInChildren<BoxCollider>(true)) Object.DestroyImmediate(box);
            foreach (var t in stage.Root.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = 0;
        }

        protected override void Finishing(KitStage stage)
        {
            // the kit must not draw with, play or carry anything PORT.md section 1 rules out
            var bad = new List<string>();
            foreach (var r in stage.Root.GetComponentsInChildren<Component>(true))
            {
                if (r == null) continue;
                var so = new SerializedObject(r);
                var p = so.GetIterator();
                while (p.Next(true))
                {
                    if (p.propertyType != SerializedPropertyType.ObjectReference || p.objectReferenceValue == null) continue;
                    string path = AssetDatabase.GetAssetPath(p.objectReferenceValue);
                    if (Banned.Any(b => path.EndsWith(b, StringComparison.OrdinalIgnoreCase))) bad.Add($"{r.gameObject.name}.{r.GetType().Name}.{p.propertyPath} -> {path}");
                }
            }
            if (bad.Count > 0) throw new Exception("the kit still uses upstream files that cannot ship: " + string.Join("; ", bad.Take(12)));
            stage.Report.AppendLine("   no reference to the upstream sounds, font, sprites, matcaps, models or Poiyomi materials");
        }

        // ------------------------------------------------------------------ pieces

        static void Place(Transform t, Vector3 local)
        {
            t.localPosition = local;
            t.localRotation = Quaternion.identity;
            if (!(t is RectTransform)) t.localScale = Vector3.one;
        }

        static (GameObject row, GameObject name, GameObject score) Row(KitStage stage, GameObject template, Transform list, int r, string rowKey, string nameKey, string scoreKey)
        {
            var row = stage.Copy(template, list, $"Row{r}");
            row.transform.localPosition = Vector3.zero;
            row.transform.localRotation = Quaternion.identity;
            row.transform.localScale = Vector3.one;
            var name = row.transform.Find("PlayerNameImg/PlayerNameTxt").gameObject;
            var score = row.transform.Find("PlayerScoreImg/PlayerScoreTxt").gameObject;
            name.GetComponent<TMP_Text>().text = "";
            score.GetComponent<TMP_Text>().text = "";
            stage.Object(row, key: rowKey);
            stage.Object(name, key: nameKey);
            stage.Object(score, key: scoreKey);
            stage.Ref(name);
            stage.Ref(score);
            row.SetActive(false);                                                                  // shown when a player fills it
            return (row, name, score);
        }

        /// <summary>
        /// A clip list on `holder` the page and the relay can play (README "audio" op): BS Audio Source with the clips, and
        /// the same list as the holder's PkClips variable, which the relay graph reads. The holder joins refs.
        /// </summary>
        static void Clips(KitStage stage, GameObject holder, params AudioClip[] clips)
        {
            if (holder.GetComponent<AudioSource>() == null) holder.AddComponent<AudioSource>().playOnAwake = false;
            var bsAudio = holder.GetComponent(GraphTypes.Find("BS.BSAudioSource")) ?? holder.AddComponent(GraphTypes.Find("BS.BSAudioSource"));
            var so = new SerializedObject(bsAudio);
            var list = so.FindProperty("clips");
            list.arraySize = clips.Length;
            for (int i = 0; i < clips.Length; i++) list.GetArrayElementAtIndex(i).objectReferenceValue = clips[i];
            var playOnAwake = so.FindProperty("playOnAwake");
            if (playOnAwake != null) playOnAwake.boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
            var variables = holder.GetComponent<Variables>() ?? holder.AddComponent<Variables>();
            var mirror = new AotList();
            foreach (var clip in clips) mirror.Add(clip);
            variables.declarations.Set(RelayGraph.ClipsVariable, mirror);
            stage.Ref(holder);
        }

        GameObject Credits(KitStage stage, Transform root)
        {
            var panel = stage.Create("Credits", root);
            var rect = panel.AddComponent<RectTransform>();
            rect.sizeDelta = new Vector2(1500f, 150f);
            rect.localPosition = new Vector3(0f, -0.45f, 0f);
            rect.localScale = Vector3.one * 0.001f;
            var canvas = panel.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var bg = stage.Create("BG", panel.transform);
            var bgRect = bg.AddComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.sizeDelta = Vector2.zero;
            bg.AddComponent<UnityEngine.UI.Image>().color = new Color(0.16f, 0.08f, 0.25f, 0.85f);
            var body = stage.Create("Text", panel.transform);
            var text = body.AddComponent<TextMeshProUGUI>();
            text.rectTransform.anchorMin = Vector2.zero;
            text.rectTransform.anchorMax = Vector2.one;
            text.rectTransform.sizeDelta = new Vector2(-30f, -16f);
            text.fontSize = 19;
            text.color = Color.white;
            text.alignment = TextAlignmentOptions.Left;
            text.textWrappingMode = TextWrappingModes.Normal;
            text.text = CreditsText;
            stage.Object(panel, key: "credits");
            return panel;
        }

        const string CreditsText =
            "<b>Treasure Hunt</b>: find the coins, gems and stars that appear around here: walk up close and click one. " +
            "<b>Your finds are saved on this device only</b> (another device, or clearing the app's data, starts from zero).\n" +
            "A port of TreasureHuntUdon by Hoshou Neko (github.com/HoshouNeko/TreasureHuntUdon, MIT). Models, sounds, sprites and " +
            "matcaps made for this port (MIT). Font: Lilita One by Juan Montoreano, and Liberation Sans (both SIL Open Font License 1.1). " +
            "Not affiliated with VRChat.";

        void Reskin(GameObject root, Dictionary<string, Sprite> sprites)
        {
            foreach (var image in root.GetComponentsInChildren<UnityEngine.UI.Image>(true))
            {
                if (image.sprite == null) continue;
                string name = image.sprite.name;
                image.sprite = name.Contains("Frame") ? sprites["Frame"] : name.Contains("Shine") ? sprites["Shine"] : sprites["Fill"];
            }
            foreach (var text in root.GetComponentsInChildren<TMP_Text>(true))
            {
                text.font = font;
                text.fontSharedMaterial = font.material;
            }
        }

        // ------------------------------------------------------------------ assets made here

        static void PrepareModels()
        {
            foreach (var path in new[] { $"{ModelFolder}/Treasures.fbx", $"{ModelFolder}/Cheese.fbx" })
            {
                var importer = AssetImporter.GetAtPath(path) as ModelImporter ?? throw new Exception($"no model at {path}: run tools/make_models.py");
                bool changed = importer.materialImportMode != ModelImporterMaterialImportMode.None || importer.importAnimation || importer.isReadable
                               || !importer.bakeAxisConversion || importer.globalScale != 1f;
                importer.materialImportMode = ModelImporterMaterialImportMode.None;
                importer.importAnimation = false;
                importer.isReadable = false;
                importer.bakeAxisConversion = true;
                importer.globalScale = 1f;
                importer.useFileScale = true;
                importer.importCameras = false;
                importer.importLights = false;
                if (changed) importer.SaveAndReimport();
            }
        }

        Dictionary<string, AudioClip> Clips()
        {
            var clips = new Dictionary<string, AudioClip>();
            foreach (var name in new[] { "Pick", "Win" })
            {
                string path = $"{Kit}/Audio/{name}.wav";
                var importer = AssetImporter.GetAtPath(path) as AudioImporter ?? throw new Exception($"no sound at {path}: run tools/make_sounds.py");
                var settings = importer.defaultSampleSettings;
                if (settings.compressionFormat != AudioCompressionFormat.Vorbis || !importer.forceToMono)
                {
                    settings.compressionFormat = AudioCompressionFormat.Vorbis;
                    settings.quality = 0.7f;
                    settings.loadType = AudioClipLoadType.DecompressOnLoad;
                    importer.defaultSampleSettings = settings;
                    importer.forceToMono = true;
                    importer.SaveAndReimport();
                }
                clips[name] = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
            }
            return clips;
        }

        TMP_FontAsset Font()
        {
            var source = AssetDatabase.LoadAssetAtPath<Font>($"{FontFolder}/LilitaOne-Regular.ttf") ?? throw new Exception("the font is missing");
            var chars = new System.Text.StringBuilder();
            for (int c = 32; c < 127; c++) chars.Append((char)c);
            for (int c = 160; c < 256; c++) chars.Append((char)c);
            var asset = KitText.StaticFontAsset(source, chars.ToString(), $"{FontFolder}/LilitaOne SDF.asset", 64, 1024);
            var fallback = KitText.DefaultFont();                                                  // names in other scripts: Liberation Sans, as far as it goes
            if (fallback != null) asset.fallbackFontAssetTable = new List<TMP_FontAsset> { fallback };
            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();
            return asset;
        }

        static Dictionary<string, Material> Materials()
        {
            Directory.CreateDirectory(MaterialFolder);
            var matcap = Shader.Find("TreasureHunt/Matcap") ?? throw new Exception("the matcap shader did not compile");
            var lit = Shader.Find("Universal Render Pipeline/Lit") ?? throw new Exception("URP Lit not found");
            var unlit = Shader.Find("Universal Render Pipeline/Unlit") ?? throw new Exception("URP Unlit not found");
            var particles = Shader.Find("Universal Render Pipeline/Particles/Unlit") ?? throw new Exception("URP Particles/Unlit not found");

            var gold = Save(new Material(matcap) { name = "Gold" });
            gold.SetTexture("_MatCap", MatcapTexture("GoldMatcap", gold: true));
            gold.SetColor("_Color", Color.white);

            var diamond = Save(new Material(matcap) { name = "Diamond" });
            diamond.SetTexture("_MatCap", MatcapTexture("DiamondMatcap", gold: false));
            diamond.SetColor("_Color", new Color(1f, 1f, 1f, 0.6f));                               // upstream: alpha 0.553, no depth write
            diamond.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            diamond.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            diamond.SetFloat("_ZWrite", 0f);
            diamond.SetOverrideTag("RenderType", "Transparent");
            diamond.renderQueue = (int)RenderQueue.Transparent;

            var cheese = Save(new Material(lit) { name = "Cheese" });                             // upstream's flat colour (PORT.md 6)
            cheese.SetColor("_BaseColor", new Color(0.92f, 0.73f, 0.22f));
            cheese.SetFloat("_Smoothness", 0.3f);
            BaseShaderGUI.SetMaterialKeywords(cheese, UnityEditor.Rendering.Universal.ShaderGUI.LitGUI.SetMaterialKeywords);

            var zone = Save(new Material(unlit) { name = "ZoneOutline" });                        // upstream: 0.69, 1, 0.96 at alpha 0.106
            zone.SetColor("_BaseColor", new Color(0.69f, 1f, 0.96f, 0.16f));
            zone.SetFloat("_Surface", 1f);
            zone.SetFloat("_Blend", 0f);
            BaseShaderGUI.SetMaterialKeywords(zone);

            var dot = SoftDot();
            var particle = Save(new Material(particles) { name = "PickParticle" });
            particle.SetTexture("_BaseMap", dot);
            particle.SetColor("_BaseColor", Color.white);
            particle.SetFloat("_Surface", 1f);
            particle.SetFloat("_Blend", 2f);                                                       // additive: sparkles
            BaseShaderGUI.SetMaterialKeywords(particle, UnityEditor.Rendering.Universal.ShaderGUI.ParticleGUI.SetMaterialKeywords);
            var trail = Save(new Material(particles) { name = "PickParticleTrail" });
            trail.SetTexture("_BaseMap", dot);
            trail.SetColor("_BaseColor", new Color(1f, 1f, 1f, 0.7f));
            trail.SetFloat("_Surface", 1f);
            trail.SetFloat("_Blend", 2f);
            BaseShaderGUI.SetMaterialKeywords(trail, UnityEditor.Rendering.Universal.ShaderGUI.ParticleGUI.SetMaterialKeywords);

            var made = new Dictionary<string, Material>
            {
                ["Gold"] = gold, ["Diamond"] = diamond, ["Cheese"] = cheese, ["ZoneOutline"] = zone, ["Particle"] = particle, ["ParticleTrail"] = trail,
            };
            foreach (var m in made.Values) { m.enableInstancing = false; EditorUtility.SetDirty(m); }
            AssetDatabase.SaveAssets();
            return made;
        }

        static Material Save(Material m)
        {
            string path = $"{MaterialFolder}/{m.name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing == null)
            {
                AssetDatabase.CreateAsset(m, path);
                return m;
            }
            existing.shader = m.shader;
            existing.CopyPropertiesFromMaterial(m);
            existing.shaderKeywords = m.shaderKeywords;
            existing.renderQueue = -1;
            return existing;
        }

        // ---- textures, drawn here (PORT.md 11.6: upstream's sprites and matcaps have no known origin) ----

        static Texture2D SaveTexture(Texture2D texture, string name, Action<TextureImporter> setup)
        {
            Directory.CreateDirectory(TextureFolder);
            string path = $"{TextureFolder}/{name}.png";
            File.WriteAllBytes(path, texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.maxTextureSize = 256;
            importer.textureCompression = TextureImporterCompression.Compressed;
            setup(importer);
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        /// <summary>
        /// A matcap: the colour of a lit sphere seen from the front, for every direction its surface can face. Gold: warm
        /// ramp with a soft key light and a hot highlight. Diamond: cool and bright, with banded reflections that sparkle
        /// as the facets turn.
        /// </summary>
        static Texture2D MatcapTexture(string name, bool gold)
        {
            const int size = 128;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var key = new Vector3(-0.45f, 0.6f, 0.66f).normalized;
            var rim = new Vector3(0.6f, -0.5f, 0.62f).normalized;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float nx = (x + 0.5f) / size * 2f - 1f, ny = (y + 0.5f) / size * 2f - 1f;
                    float rr = nx * nx + ny * ny;
                    if (rr > 1f) { float k = 1f / Mathf.Sqrt(rr); nx *= k; ny *= k; rr = 1f; }
                    var n = new Vector3(nx, ny, Mathf.Sqrt(1f - rr));
                    float diffuse = Mathf.Clamp01(Vector3.Dot(n, key));
                    float spec = Mathf.Pow(Mathf.Clamp01(Vector3.Dot(Vector3.Reflect(-key, n), Vector3.forward)), 24f);
                    float back = Mathf.Pow(Mathf.Clamp01(Vector3.Dot(n, rim)), 3f);
                    Color c;
                    if (gold)
                    {
                        var dark = new Color(0.36f, 0.2f, 0.03f);
                        var mid = new Color(0.95f, 0.68f, 0.18f);
                        var light = new Color(1f, 0.92f, 0.55f);
                        c = Color.Lerp(dark, mid, Mathf.SmoothStep(0f, 1f, diffuse * 1.2f));
                        c = Color.Lerp(c, light, back * 0.6f);
                        c += new Color(1f, 0.97f, 0.85f) * spec;
                    }
                    else
                    {
                        float bands = 0.5f + 0.5f * Mathf.Sin((n.x * 3.1f + n.y * 5.3f) * 3.2f);
                        var deep = new Color(0.35f, 0.55f, 0.85f);
                        var pale = new Color(0.85f, 0.97f, 1f);
                        c = Color.Lerp(deep, pale, Mathf.Clamp01(diffuse * 0.8f + bands * 0.35f));
                        c += new Color(0.9f, 1f, 1f) * (spec * 1.4f + back * 0.35f);
                    }
                    c.a = 1f;
                    texture.SetPixel(x, y, c);
                }
            texture.Apply();
            return SaveTexture(texture, name, importer =>
            {
                importer.textureType = TextureImporterType.Default;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.mipmapEnabled = false;
                importer.sRGBTexture = true;
            });
        }

        static Texture2D SoftDot()
        {
            const int size = 64;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2f - 1f, dy = (y + 0.5f) / size * 2f - 1f;
                    float a = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy));
                    a = a * a * (3f - 2f * a);
                    texture.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                }
            texture.Apply();
            return SaveTexture(texture, "SoftDot", importer =>
            {
                importer.textureType = TextureImporterType.Default;
                importer.alphaIsTransparency = true;
                importer.wrapMode = TextureWrapMode.Clamp;
            });
        }

        /// <summary>
        /// Panel sprites in place of upstream's "45 Fill / Frame / Shine Beveled" (256 px, sliced): a rounded rectangle, its
        /// outline, and a soft highlight across its top. White, so upstream's tints colour them as before.
        /// </summary>
        static Dictionary<string, Sprite> Sprites()
        {
            const int size = 128, radius = 36, border = 44;
            var made = new Dictionary<string, Sprite>();
            foreach (var kind in new[] { "Fill", "Frame", "Shine" })
            {
                var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
                for (int y = 0; y < size; y++)
                    for (int x = 0; x < size; x++)
                    {
                        // signed distance to a rounded rectangle 2 px in from the edge
                        float px = Mathf.Abs(x + 0.5f - size / 2f) - (size / 2f - 2f - radius);
                        float py = Mathf.Abs(y + 0.5f - size / 2f) - (size / 2f - 2f - radius);
                        float outside = new Vector2(Mathf.Max(px, 0f), Mathf.Max(py, 0f)).magnitude + Mathf.Min(Mathf.Max(px, py), 0f) - radius;
                        float inside = Mathf.Clamp01(0.5f - outside);
                        float a;
                        if (kind == "Fill") a = inside;
                        else if (kind == "Frame") a = inside * Mathf.Clamp01(outside + 7.5f);               // a 7 px ring
                        else a = inside * Mathf.Clamp01((y / (float)size - 0.55f) * 2.2f) * 0.6f;           // light on the top part
                        texture.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                    }
                texture.Apply();
                SaveTexture(texture, $"Panel{kind}", importer =>
                {
                    importer.textureType = TextureImporterType.Sprite;
                    importer.spriteImportMode = SpriteImportMode.Single;
                    importer.spriteBorder = new Vector4(border, border, border, border);
                    importer.spritePixelsPerUnit = 100;
                    importer.alphaIsTransparency = true;
                    importer.mipmapEnabled = false;
                    importer.wrapMode = TextureWrapMode.Clamp;
                });
                made[kind] = AssetDatabase.LoadAssetAtPath<Sprite>($"{TextureFolder}/Panel{kind}.png");
            }
            return made;
        }
    }
}
