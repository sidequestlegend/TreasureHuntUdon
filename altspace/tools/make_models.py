"""Makes the treasure hunt's models in Blender, from nothing: a coin, three gems, a star and a cheese wedge.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --python altspace/tools/make_models.py

writes altspace/Assets/Kit/Models/Treasures.fbx (Coin, Gem1, Gem2, Gem3, Star) and Cheese.fbx (Cheese).

They replace upstream's Models/Treasures.fbx and Models/Cheese.fbx, whose origin could not be established (no author
in the files; Treasures.fbx was exported from a "VMC Props.blend"). Written for this port; same licence as the port
(MIT). Sizes are in metres, Y up in Unity (the axis change is baked into the meshes, so every object comes in with no
rotation and scale 1): a 16 cm coin standing on its edge, gems about 15 cm across, a 16 cm star standing up, a
30 cm cheese wedge. Each object's origin is the middle of what it draws, so it spins in place.
"""
import math
import os

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "Assets", "Kit", "Models")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgba):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m


def finish(name, bm, mat, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def ring(bm, radius, z, n, phase=0.0, y_up=False):
    """n vertices on a circle in the XY plane at height z (or, y_up, in the XZ plane at depth z)."""
    verts = []
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        x, y = radius * math.cos(a), radius * math.sin(a)
        verts.append(bm.verts.new((x, z, y) if y_up else (x, y, z)))
    return verts


def bridge(bm, a, b):
    n = len(a)
    for k in range(n):
        bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))


def cone(bm, ring_verts, apex):
    tip = bm.verts.new(apex)
    n = len(ring_verts)
    for k in range(n):
        bm.faces.new((ring_verts[k], ring_verts[(k + 1) % n], tip))


def coin(gold):
    """A disc standing on its edge (its faces look along Blender's Y), with a raised rim on both sides."""
    bm = bmesh.new()
    n = 48
    r, rim, half, inner_half = 0.08, 0.068, 0.006, 0.0045
    # from the front face's centre outwards: centre, inner rim, rim top, edge, and back the same way
    layers = [
        (0.0, -inner_half), (rim, -inner_half), (rim, -half), (r, -half),
        (r, half), (rim, half), (rim, inner_half), (0.0, inner_half),
    ]
    rings = []
    for radius, y in layers:
        rings.append(None if radius == 0.0 else ring(bm, radius, y, n, y_up=True))
    front, back = bm.verts.new((0, -inner_half, 0)), bm.verts.new((0, inner_half, 0))
    for k in range(n):
        bm.faces.new((front, rings[1][(k + 1) % n], rings[1][k]))
        bm.faces.new((back, rings[6][k], rings[6][(k + 1) % n]))
    for i in range(1, 6):
        bridge(bm, rings[i], rings[i + 1])
    return finish("Coin", bm, gold)


def brilliant(name, diamond, n, width, crown, pavilion, table, girdle=0.006, phase=0.0):
    """A cut gem: a flat table on top, a crown down to the girdle, a pavilion to a point. Height along Blender Z."""
    bm = bmesh.new()
    r = width / 2
    top = ring(bm, r * table, crown, n, phase)
    g_hi = ring(bm, r, girdle / 2, n, phase + math.pi / n)
    g_lo = ring(bm, r, -girdle / 2, n, phase + math.pi / n)
    bm.faces.new(top)
    bridge(bm, top, g_hi)
    bridge(bm, g_hi, g_lo)
    cone(bm, g_lo, (0, 0, -pavilion))
    obj = finish(name, bm, diamond)
    # origin in the middle of the stone's height
    mid = (crown - pavilion) / 2
    obj.data.transform(__import__("mathutils").Matrix.Translation((0, 0, -mid)))
    return obj


def emerald(name, diamond, w, d, crown, pavilion, step=0.25):
    """A step cut: an octagon (a rectangle with cut corners), two steps up to the table, a short pavilion to a ridge."""
    bm = bmesh.new()

    def octagon(sx, sy, z, cut):
        pts = [(sx, sy - cut), (sx - cut, sy), (-sx + cut, sy), (-sx, sy - cut), (-sx, -sy + cut), (-sx + cut, -sy), (sx - cut, -sy), (sx, -sy + cut)]
        return [bm.verts.new((x, y, z)) for x, y in pts]

    sx, sy, cut = w / 2, d / 2, min(w, d) * 0.18
    girdle_hi = octagon(sx, sy, 0.003, cut)
    girdle_lo = octagon(sx, sy, -0.003, cut)
    mid = octagon(sx * (1 - step), sy * (1 - step), crown * 0.6, cut * (1 - step))
    top = octagon(sx * (1 - 2 * step), sy * (1 - 2 * step), crown, cut * (1 - 2 * step))
    bm.faces.new(top)
    bridge(bm, top, mid)
    bridge(bm, mid, girdle_hi)
    bridge(bm, girdle_hi, girdle_lo)
    low = octagon(sx * 0.35, sy * 0.15, -pavilion, cut * 0.2)
    bridge(bm, girdle_lo, low)
    bm.faces.new(list(reversed(low)))
    obj = finish(name, bm, diamond)
    obj.data.transform(__import__("mathutils").Matrix.Translation((0, 0, -(crown - pavilion) / 2)))
    return obj


def star(gold):
    """A five-pointed star standing up (faces along Blender's Y), its faces raised to a ridge in the middle."""
    bm = bmesh.new()
    outer, inner, thick, bulge = 0.08, 0.034, 0.008, 0.014
    rim_front, rim_back = [], []
    for k in range(10):
        a = math.pi / 2 + math.pi * k / 5
        r = outer if k % 2 == 0 else inner
        x, z = r * math.cos(a), r * math.sin(a)
        rim_front.append(bm.verts.new((x, -thick, z)))
        rim_back.append(bm.verts.new((x, thick, z)))
    c_front, c_back = bm.verts.new((0, -thick - bulge, 0)), bm.verts.new((0, thick + bulge, 0))
    for k in range(10):
        bm.faces.new((c_front, rim_front[(k + 1) % 10], rim_front[k]))
        bm.faces.new((c_back, rim_back[k], rim_back[(k + 1) % 10]))
    bridge(bm, rim_front, rim_back)
    # origin in the middle of the star's height
    obj = finish("Star", bm, gold)
    zs = [v.co.z for v in obj.data.vertices]
    obj.data.transform(__import__("mathutils").Matrix.Translation((0, 0, -(max(zs) + min(zs)) / 2)))
    return obj


def cheese(yellow):
    """An eighth of a cheese wheel: a wedge with a rounded rind, lying flat."""
    bm = bmesh.new()
    r, h, n, spread = 0.3, 0.09, 10, math.radians(45)
    bottom = [bm.verts.new((0, 0, 0))]
    top = [bm.verts.new((0, 0, h))]
    for k in range(n + 1):
        a = -spread / 2 + spread * k / n
        bottom.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0)))
        top.append(bm.verts.new((r * math.cos(a), r * math.sin(a), h)))
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    m = len(bottom)
    for k in range(m):
        bm.faces.new((bottom[k], bottom[(k + 1) % m], top[(k + 1) % m], top[k]))
    obj = finish("Cheese", bm, yellow)
    xs = [v.co.x for v in obj.data.vertices]
    obj.data.transform(__import__("mathutils").Matrix.Translation((-(max(xs) + min(xs)) / 2, 0, -h / 2)))
    return obj


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"MESH"}, apply_unit_scale=True,
                             apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True, axis_forward="-Z", axis_up="Y",
                             mesh_smooth_type="FACE", add_leaf_bones=False, bake_anim=False, path_mode="STRIP")
    print("wrote", os.path.normpath(path), [o.name for o in objects])


def main():
    os.makedirs(OUT, exist_ok=True)
    reset()
    gold = material("Gold", (1.0, 0.78, 0.25, 1.0))
    diamond = material("Diamond", (0.7, 0.95, 1.0, 0.55))
    treasures = [
        coin(gold),
        brilliant("Gem1", diamond, 8, 0.15, 0.035, 0.07, 0.55),
        brilliant("Gem2", diamond, 5, 0.15, 0.04, 0.06, 0.5, phase=math.pi / 2),
        emerald("Gem3", diamond, 0.15, 0.11, 0.04, 0.05),
        star(gold),
    ]
    for o in treasures:
        print(o.name, tuple(round(d, 4) for d in o.dimensions), len(o.data.polygons), "faces")
    export(os.path.join(OUT, "Treasures.fbx"), treasures)
    reset()
    wedge = cheese(material("Cheese", (0.92, 0.73, 0.22, 1.0)))
    print(wedge.name, tuple(round(d, 4) for d in wedge.dimensions), len(wedge.data.polygons), "faces")
    export(os.path.join(OUT, "Cheese.fbx"), [wedge])


main()
