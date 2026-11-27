using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UIElements;

namespace PortKit
{
    /// <summary>
    /// Play-mode test commands for the UI Toolkit panels a page script makes (BS.UIPanel with BS.UIKit* controls, as
    /// portkit's ui.ts builds them): find a panel by its GameObject's name and an element in it by its name, read the
    /// element, and click it through the SDK's desktop pointer (InputSim's mouse, so the EventSystem and the panel's own
    /// raycaster do the rest, as for a person at the editor).
    ///
    ///   uipanel &lt;panel&gt;                       the panel: active, world position, rotation, scale, size in pixels and metres
    ///   uilist &lt;panel&gt;                        the named elements in it: name, type, shown, enabled
    ///   uiprobe &lt;panel&gt; &lt;element&gt; &lt;what&gt;     exists | shown | enabled | text | prop &lt;name&gt; | pos | rect
    ///   uiclick &lt;panel&gt; &lt;element&gt;            turn the camera to the element, point at its middle, check the pointer would hit it, click
    ///   uipoint &lt;panel&gt; &lt;element&gt;            the same without the click (hover)
    ///
    /// &lt;panel&gt; is the panel GameObject's name (portkit: `pk1ui:&lt;slug&gt;:&lt;inst&gt;:&lt;panel id&gt;`), &lt;element&gt; the
    /// element's name (portkit gives every element its id as its name). %20 in either is a space.
    /// "text" reads a kit control's text, else its title, value or label; "prop" any public property by name.
    /// "shown" is false when the element or an ancestor has display none or visibility hidden, or the panel's object is off.
    /// A world point on a panel: UI Toolkit lays the panel out in pixels (y down) and draws it in its GameObject's space at
    /// the panel settings' pixels per unit, about the document's pivot. uiclick tries the pivot and axis conventions in
    /// turn and keeps the first whose screen point the EventSystem's raycast resolves to that element (or one inside it),
    /// so a mapping that is wrong is reported, not clicked.
    /// </summary>
    [InitializeOnLoad]
    public static class UiPanels
    {
        static UiPanels()
        {
            KitPlayTest.Commands["uipanel"] = (a, reply) => { reply(PanelInfo(a)); return null; };
            KitPlayTest.Commands["uilist"] = (a, reply) => { reply(List(a)); return null; };
            KitPlayTest.Commands["uiprobe"] = (a, reply) => { reply(Probe(a)); return null; };
            KitPlayTest.Commands["uiclick"] = (a, reply) => Click(a, reply, 1);
            KitPlayTest.Commands["uipoint"] = (a, reply) => Click(a, reply, 0);
            KitPlayTest.Commands["uiscan"] = (a, reply) => { reply(Scan(a)); return null; };
        }

        static string F(float v) => v.ToString("F3", CultureInfo.InvariantCulture);
        static string V(Vector3 v) => $"{F(v.x)} {F(v.y)} {F(v.z)}";
        static string Unescape(string s) => s.Replace("%20", " ");

        /// <summary>The UIDocument on the GameObject of that name in a loaded scene, inactive ones included.</summary>
        public static UIDocument FindPanel(string name)
        {
            name = Unescape(name);
            return Resources.FindObjectsOfTypeAll<UIDocument>().FirstOrDefault(d => d != null && d.gameObject.name == name && d.gameObject.scene.IsValid());
        }

        public static VisualElement FindElement(UIDocument doc, string name)
        {
            var root = doc != null ? doc.rootVisualElement : null;
            return root?.Q(Unescape(name));
        }

        static bool Shown(UIDocument doc, VisualElement e)
        {
            if (!doc.gameObject.activeInHierarchy || !doc.isActiveAndEnabled) return false;
            for (var at = e; at != null; at = at.parent)
                if (at.resolvedStyle.display == DisplayStyle.None || at.resolvedStyle.visibility == Visibility.Hidden) return false;
            return true;
        }

        static string Prop(VisualElement e, string name)
        {
            var p = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (p == null || !p.CanRead) return null;
            var v = p.GetValue(e);
            return v is float f ? F(f) : v is double d ? d.ToString("0.###", CultureInfo.InvariantCulture) : v?.ToString() ?? "";
        }

        static string Text(VisualElement e)
        {
            foreach (var name in new[] { "text", "title", "value", "label" })
            {
                var v = Prop(e, name);
                if (v != null) return v;
            }
            return e is TextElement t ? t.text : null;
        }

        static string PanelInfo(string[] a)
        {
            if (a.Length < 1) return "error: uipanel <panel>";
            var doc = FindPanel(a[0]);
            if (doc == null)
            {
                var named = Resources.FindObjectsOfTypeAll<GameObject>().Where(g => g.name == Unescape(a[0])).ToList();
                var docs = Resources.FindObjectsOfTypeAll<UIDocument>().Where(d => d != null && d.gameObject.scene.IsValid()).Select(d => d.gameObject.name + (d.gameObject.activeInHierarchy ? "" : "(off)")).Take(30);
                return "error: no panel " + a[0] + " [documents: " + string.Join(", ", docs) + "]" + $" ({named.Count} objects so named: " + string.Join(", ", named.Select(g => $"active {g.activeInHierarchy} scene {g.scene.IsValid()} components {string.Join("+", g.GetComponents<Component>().Select(c => c == null ? "null" : c.GetType().Name))}")) + ")";
            }
            var t = doc.transform;
            var root = doc.rootVisualElement;
            float ppu = PixelsPerUnit(doc);
            var size = root != null ? root.layout.size : Vector2.zero;
            var box = doc.GetComponent<BoxCollider>();
            return $"active {doc.gameObject.activeInHierarchy} at {V(t.position)} rot {V(t.eulerAngles)} scale {V(t.lossyScale)} parent {(t.parent != null ? t.parent.name : "(none)")} " +
                   $"layout {F(size.x)}x{F(size.y)} ppu {F(ppu)} worldsize {F(doc.worldSpaceSize.x)}x{F(doc.worldSpaceSize.y)} pivot {PivotName(doc)} layer {doc.gameObject.layer}" +
                   (box != null ? $" collider {V(box.bounds.center)} size {V(box.bounds.size)}" : " no box collider");
        }

        /// <summary>The panel settings' pixels per world unit (internal in this Unity: read by reflection; 100 when unknown).</summary>
        public static float PixelsPerUnit(UIDocument doc)
        {
            var ps = doc != null ? doc.panelSettings : null;
            if (ps == null) return 100f;
            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            object v = typeof(PanelSettings).GetProperty("pixelsPerUnit", flags)?.GetValue(ps) ?? typeof(PanelSettings).GetField("m_PixelsPerUnit", flags)?.GetValue(ps);
            return v is float f && f > 0 ? f : 100f;
        }

        static string PivotName(UIDocument doc)
        {
            var p = typeof(UIDocument).GetProperty("pivot", BindingFlags.Public | BindingFlags.Instance);
            return p != null ? p.GetValue(doc)?.ToString() ?? "?" : "(no pivot)";
        }

        static string List(string[] a)
        {
            if (a.Length < 1) return "error: uilist <panel>";
            var doc = FindPanel(a[0]);
            if (doc == null || doc.rootVisualElement == null) return "error: no panel " + a[0];
            var named = new List<string>();
            doc.rootVisualElement.Query<VisualElement>().ForEach(e =>
            {
                if (!string.IsNullOrEmpty(e.name) && !e.name.StartsWith("unity-", StringComparison.Ordinal))
                    named.Add($"{e.name}:{e.GetType().Name}{(Shown(doc, e) ? "" : ":hidden")}{(e.enabledInHierarchy ? "" : ":disabled")}");
            });
            return named.Count + " " + string.Join(", ", named.Take(80));
        }

        static string Probe(string[] a)
        {
            if (a.Length < 3) return "error: uiprobe <panel> <element> <what>";
            var doc = FindPanel(a[0]);
            if (a[2] == "exists" && doc == null) return "False";
            if (doc == null) return "error: no panel " + a[0];
            var e = FindElement(doc, a[1]);
            if (a[2] == "exists") return (e != null).ToString();
            if (e == null) return "error: no element " + a[1] + " in " + a[0];
            switch (a[2])
            {
                case "shown": return Shown(doc, e).ToString();
                case "enabled": return e.enabledInHierarchy.ToString();
                case "text": return Text(e) ?? "error: no text";
                case "prop": return a.Length > 3 ? Prop(e, a[3]) ?? "error: no property " + a[3] : "error: prop <name>";
                case "rect": var r = e.worldBound; return $"{F(r.x)} {F(r.y)} {F(r.width)} {F(r.height)}";
                case "pos":
                    var at = WorldPoint(doc, e, out string how);
                    return at.HasValue ? V(at.Value) + " " + how : "error: " + how;
                default: return "error: no such probe";
            }
        }

        /// <summary>
        /// Where the middle of an element is in the world: the mapping that the EventSystem's raycast confirms (the
        /// element, or one inside it, is what the pointer would hit there), else null with what each mapping hit.
        /// </summary>
        public static Vector3? WorldPoint(UIDocument doc, VisualElement e, out string how)
        {
            var cam = Camera.main;
            var r = e.worldBound;
            var size = doc.rootVisualElement.layout.size;
            float ppu = PixelsPerUnit(doc);
            var tried = new List<string>();
            // As seen in SDK 4.0.29 Play mode (spike, treasure hunt): a world-space panel's worldBound is already in its
            // GameObject's local units, centred on the object, y up. The other mappings are kept as fallbacks.
            foreach (var ySign in new[] { 1f, -1f })
            {
                var direct = doc.transform.TransformPoint(new Vector3(r.center.x, ySign * r.center.y, 0f));
                if (cam == null) { how = "no camera"; return direct; }
                var got = HitAt(cam, direct);
                if (got != null && (got == e || e.Contains(got))) { how = ySign > 0 ? "(bound as local)" : "(bound as local, y flipped)"; return direct; }
                tried.Add($"bound as local y{(ySign > 0 ? "+" : "-")} hit {(got == null ? "nothing" : (string.IsNullOrEmpty(got.name) ? got.GetType().Name : got.name))}");
            }
            foreach (var (pivotName, px, py) in new[] { ("centre", 0.5f, 0.5f), ("top-left", 0f, 0f), ("bottom-left", 0f, 1f) })
                foreach (var ySign in new[] { -1f, 1f })
                    foreach (var xSign in new[] { 1f, -1f })
                    {
                        var local = new Vector3(xSign * (r.center.x - px * size.x) / ppu, ySign * (r.center.y - py * size.y) / ppu, 0f);
                        var world = doc.transform.TransformPoint(local);
                        string label = $"{pivotName} x{(xSign > 0 ? "+" : "-")} y{(ySign > 0 ? "+" : "-")}";
                        if (cam == null) { how = "no camera"; return world; }
                        var hit = HitAt(cam, world);
                        if (hit != null && (hit == e || e.Contains(hit))) { how = "(" + label + ")"; return world; }
                        tried.Add($"{label} hit {(hit == null ? "nothing" : (string.IsNullOrEmpty(hit.name) ? hit.GetType().Name : hit.name))}");
                    }
            how = $"no mapping hits the element (bound {Rect(r)}, root {Rect(doc.rootVisualElement.worldBound)}) from this camera: " + string.Join("; ", tried);
            return null;
        }

        /// <summary>
        /// Diagnostic: casts the pointer at a grid of points over the panel's rectangle (centred on its object, worldSpaceSize
        /// at the panel settings' pixels per unit) and says, per element hit, the middle of where it was hit in the object's
        /// local axes (metres before scale) and its worldBound.
        /// </summary>
        static string Scan(string[] a)
        {
            var doc = a.Length > 0 ? FindPanel(a[0]) : null;
            if (doc == null) return "error: no panel";
            var cam = Camera.main;
            float ppu = PixelsPerUnit(doc);
            var size = doc.worldSpaceSize / ppu;
            var hits = new Dictionary<VisualElement, (Vector2 sum, int n)>();
            const int nx = 40, ny = 24;
            for (int i = 0; i < nx; i++)
                for (int j = 0; j < ny; j++)
                {
                    var local = new Vector3((i + 0.5f) / nx * size.x * 1.2f - size.x * 0.6f, (j + 0.5f) / ny * size.y * 1.2f - size.y * 0.6f, 0f);
                    var hit = HitAt(cam, doc.transform.TransformPoint(local));
                    if (hit == null) continue;
                    hits.TryGetValue(hit, out var acc);
                    hits[hit] = (acc.sum + new Vector2(local.x, local.y), acc.n + 1);
                }
            return string.Join("; ", hits.Select(h => $"{(string.IsNullOrEmpty(h.Key.name) ? h.Key.GetType().Name : h.Key.name)} n{h.Value.n} at {F(h.Value.sum.x / h.Value.n)},{F(h.Value.sum.y / h.Value.n)} bound {Rect(h.Key.worldBound)}")) +
                   $" | root bound {Rect(doc.rootVisualElement.worldBound)} size {F(size.x)}x{F(size.y)}";
        }

        static string Rect(Rect r) => $"{F(r.x)},{F(r.y)} {F(r.width)}x{F(r.height)}";

        static readonly List<RaycastResult> results = new List<RaycastResult>();

        /// <summary>What UI Toolkit element the EventSystem's raycast finds under the screen point of a world point, nearest first.</summary>
        static VisualElement HitAt(Camera cam, Vector3 world)
        {
            var es = EventSystem.current;
            var screen = cam.WorldToScreenPoint(world);
            if (es == null || screen.z <= 0f) return null;
            var data = new PointerEventData(es) { position = new Vector2(screen.x, screen.y) };
            results.Clear();
            es.RaycastAll(data, results);
            foreach (var res in results.OrderBy(x => x.distance))
                if (res.document != null && res.element != null) return res.element;
            return null;
        }

        static IEnumerator Click(string[] a, Action<string> reply, int mode)
        {
            if (a.Length < 2) { reply("error: uiclick <panel> <element>"); yield break; }
            UIDocument doc = null;
            VisualElement e = null;
            // the page may still be building the panel: look for up to 3 s
            double until = EditorApplication.timeSinceStartup + 3;
            while (true)
            {
                doc = FindPanel(a[0]);
                e = doc != null ? FindElement(doc, a[1]) : null;
                if (e != null && e.worldBound.width > 0 || EditorApplication.timeSinceStartup > until) break;
                yield return null;
            }
            if (doc == null) { reply("error: no panel " + a[0]); yield break; }
            if (e == null) { reply("error: no element " + a[1] + " in " + a[0]); yield break; }
            if (!Shown(doc, e)) { reply("error: " + a[1] + " is not shown"); yield break; }
            // look at it first, as a person would (a panel can be anywhere around the player)
            var look = InputSim.LookAt(doc.transform.TransformPoint(new Vector3(e.worldBound.center.x, e.worldBound.center.y, 0f)), _ => { });
            while (look.MoveNext()) yield return null;
            var at = WorldPoint(doc, e, out string how);
            if (!at.HasValue) { reply("error: " + how); yield break; }
            string answer = null;
            var inner = InputSim.PointAt(at.Value, text => answer = text, mode);
            while (inner.MoveNext()) yield return null;
            reply((answer ?? "error: no answer") + $" at {V(at.Value)} {how}");
        }
    }
}
