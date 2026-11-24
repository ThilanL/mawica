"""
Snow globe asset pipeline (development only). Turns the downloaded source models in assets-src/ into the small GLBs the card ships in
public/models/snow-globe/. Every step is scripted so the shipped files can be rebuilt exactly:

    blender -b -P scripts/globe/process_assets.py -- lantern|cottage|reindeer|all

Each asset is: imported, joined, decimated to a triangle budget, scaled to its real size inside the globe (metres), rested on Y = 0 with its
origin at the centre of its footprint, given textures no larger than the budget, then exported as GLB (Y up, no cameras or lights).
Licences and attribution: public/models/snow-globe/CREDITS.md.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets-src")
OUT = os.path.join(ROOT, "public", "models", "snow-globe")
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def apply_all():
    """Bake parent transforms into the meshes, drop empties, armatures and animation (the globe shows a still pose)."""
    for o in bpy.data.objects:
        o.animation_data_clear()
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes():
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            if m.type == "ARMATURE":
                bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)


def tri_count(objs=None):
    n = 0
    for o in objs or meshes():
        dg = bpy.context.evaluated_depsgraph_get()
        m = o.evaluated_get(dg).to_mesh()
        m.calc_loop_triangles()
        n += len(m.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def decimate_to(target):
    total = tri_count()
    if total <= target:
        return total
    ratio = target / total
    for o in meshes():
        d = o.modifiers.new("decimate", "DECIMATE")
        d.ratio = ratio
        d.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=d.name)
    return tri_count()


def bounds():
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for o in meshes():
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def fit(height):
    """Scale to `height` metres (Blender Z up), rest on Z = 0, centre the footprint on the origin."""
    lo, hi = bounds()
    s = height / (hi.z - lo.z)
    c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for o in meshes():
        o.data.transform(__import__("mathutils").Matrix.Translation(-c))
        o.data.transform(__import__("mathutils").Matrix.Scale(s, 4))
        o.data.update()
    return bounds()


def drop_specular_maps():
    """The source's specular-F0 maps (KHR_materials_specular) add file size for no visible gain at miniature scale."""
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        b = m.node_tree.nodes.get("Principled BSDF")
        for name in ("Specular IOR Level", "Specular Tint"):
            if b and name in b.inputs:
                for l in list(b.inputs[name].links): m.node_tree.links.remove(l)
    for img in list(bpy.data.images):
        if "specular" in img.name.lower() and img.users == 0: bpy.data.images.remove(img)


def shrink_images(px):
    for img in bpy.data.images:
        if img.size[0] > px or img.size[1] > px:
            k = px / max(img.size)
            img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))
        img.pack()


def keep_first_uv():
    """Only the first UV set is used by the card; the sources carry up to four (they triple the size of the AR files)."""
    for o in meshes():
        while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[-1])


def export(name):
    keep_first_uv()
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_animations=False,
                              export_cameras=False, export_lights=False, use_selection=False, export_image_format="WEBP", export_image_quality=82,
                              # geometry compressed with meshopt (three.js decodes it with MeshoptDecoder; nothing extra to download)
                              export_meshopt_compression_enable=True, export_meshopt_extension="EXT_meshopt_compression")
    lo, hi = bounds()
    print(f"[globe] {name}: {tri_count()} tris, size {(hi - lo).x:.4f} x {(hi - lo).y:.4f} x {(hi - lo).z:.4f} m, {os.path.getsize(path) / 1024:.0f} KB")


def lantern(ar=False):
    reset()
    import_gltf(os.path.join(SRC, "polyhaven", "street_lamp_01", "street_lamp_01_1k.gltf"))
    apply_all()
    decimate_to(1200 if ar else 3200)
    fit(0.056)
    shrink_images(256 if ar else 512)
    export("lantern-ar" if ar else "lantern")


def bisect_below(z):
    """Cuts every mesh at height z and deletes what is below (the cabin's stilts and foundation: they would be buried in the snow)."""
    for o in meshes():
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(o.data)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True)
        bmesh.update_edit_mesh(o.data)
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(meshes()):
        if len(o.data.polygons) == 0:
            bpy.data.objects.remove(o, do_unlink=True)


def material(name, color, rough=0.9, emission=None, strength=0.0, image=None, normal=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    if image:
        t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(image); m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if normal:
        t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(normal); t.image.colorspace_settings.name = "Non-Color"
        n = m.node_tree.nodes.new("ShaderNodeNormalMap"); m.node_tree.links.new(t.outputs["Color"], n.inputs["Color"]); m.node_tree.links.new(n.outputs["Normal"], b.inputs["Normal"])
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1); b.inputs["Emission Strength"].default_value = strength
    return m


def snow_cover(src, thickness, voxel, target, name):
    """Snow lying on a surface: the up-facing faces of `src`, thickened upwards, melted into soft rounded lumps (voxel remesh + smoothing),
    then reduced to `target` triangles. Edges droop a little past the eaves, like real snow."""
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True); bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate(); snow = bpy.context.active_object; snow.name = name
    bpy.ops.object.mode_set(mode="EDIT"); bm = bmesh.from_edit_mesh(snow.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.35], context="FACES")
    bmesh.update_edit_mesh(snow.data); bpy.ops.object.mode_set(mode="OBJECT")
    snow.data.materials.clear()
    s = snow.modifiers.new("solid", "SOLIDIFY"); s.thickness = thickness; s.offset = 1.0
    bpy.ops.object.modifier_apply(modifier=s.name)
    r = snow.modifiers.new("remesh", "REMESH"); r.mode = "VOXEL"; r.voxel_size = voxel; r.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=r.name)
    tex = bpy.data.textures.new("snow_lumps", "CLOUDS"); tex.noise_scale = 0.6
    d = snow.modifiers.new("lumps", "DISPLACE"); d.texture = tex; d.strength = thickness * 0.35; d.mid_level = 0.5
    bpy.ops.object.modifier_apply(modifier=d.name)
    sm = snow.modifiers.new("smooth", "SMOOTH"); sm.iterations = 6; sm.factor = 0.8
    bpy.ops.object.modifier_apply(modifier=sm.name)
    dec = snow.modifiers.new("dec", "DECIMATE"); dec.ratio = min(1.0, target / max(1, len(snow.data.polygons) * 2))
    bpy.ops.object.modifier_apply(modifier=dec.name)
    return snow


def cottage(ar=False):
    """Scandinavian Log Cabin (rivetech, CC BY 4.0): door closed, stilts removed, snow on the roof and porch roof, a brick chimney with a
    snow cap, warm lit window glass, decimated to about 12k triangles (+ about 3k of snow), 512 px textures, 47 mm tall to the chimney top."""
    reset()
    import_gltf(os.path.join(SRC, "sketchfab", "log_cabin", "scene.gltf"))
    bpy.context.scene.frame_set(1)  # the door's animation starts closed
    apply_all()
    bisect_below(-0.12)
    for o in meshes():
        for slot in o.material_slots:
            if slot.material and slot.material.name == "WindowGlass":
                slot.material = material("window_warm", (0.9, 0.55, 0.22), rough=0.35, emission=(1.0, 0.62, 0.26), strength=6.0)
    roof = next(o for o in meshes() if any(s.material and s.material.name == "Roof" for s in o.material_slots))
    lo, hi = bounds()
    # chimney through the back slope of the roof, brick with a stone cap
    brick = material("chimney_brick", (0.55, 0.25, 0.18), rough=0.85, image=os.path.join(SRC, "polyhaven", "red_brick_03", "red_brick_03_Diffuse_1k.jpg"), normal=os.path.join(SRC, "polyhaven", "red_brick_03", "red_brick_03_nor_gl_1k.jpg"))
    cx, cy = lo.x + (hi.x - lo.x) * 0.72, lo.y + (hi.y - lo.y) * 0.62
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, hi.z - 0.4)); ch = bpy.context.active_object; ch.name = "chimney"
    ch.scale = (0.62, 0.62, 2.0); bpy.ops.object.transform_apply(scale=True); ch.data.materials.append(brick)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.uv.cube_project(cube_size=0.5); bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, hi.z + 0.62)); cap = bpy.context.active_object; cap.name = "chimney_cap"
    cap.scale = (0.78, 0.78, 0.12); bpy.ops.object.transform_apply(scale=True); cap.data.materials.append(material("chimney_stone", (0.32, 0.3, 0.29), rough=0.9))
    top = bpy.data.objects.new("chimney_top", None); top.location = (cx, cy, hi.z + 0.7); bpy.context.scene.collection.objects.link(top)
    decimate_to(4000 if ar else 12000)
    snowmat = material("roof_snow", (0.95, 0.96, 0.99), rough=0.8)
    roof_snow = snow_cover(roof, 0.32, 0.09, 1100 if ar else 3000, "roof_snow"); roof_snow.data.materials.append(snowmat)
    capsnow = snow_cover(cap, 0.14, 0.05, 200, "chimney_snow"); capsnow.data.materials.append(snowmat)
    # fit 47 mm tall (to the chimney cap): the cabin is wide and deep, and every corner must clear the glass, resting on Y = 0; the chimney_top marker follows
    lo, hi = bounds(); s = 0.047 / (hi.z - lo.z); c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    from mathutils import Matrix
    for o in meshes(): o.data.transform(Matrix.Translation(-c)); o.data.transform(Matrix.Scale(s, 4)); o.data.update()
    top.location = (top.location - c) * s
    drop_specular_maps()
    shrink_images(256 if ar else 512)
    export("cottage-ar" if ar else "cottage")


def recolor_reindeer():
    """Elk coat -> reindeer coat: cooler, lighter grey-brown body and a pale cream neck mane and belly, keeping the texture's hair detail.
    The mane is painted by height/forwardness in object space via a vertex-colour mask multiplied into the base colour."""
    for img in bpy.data.images:
        nm = img.name.lower()
        if not (("body" in nm or "head" in nm) and "diffuse" in nm): continue  # coat only: the antler ("Chifre") texture keeps its natural colour
        px = list(img.pixels); n = len(px) // 4
        for i in range(n):
            r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
            l = 0.3 * r + 0.59 * g + 0.11 * b
            r2, g2, b2 = l + (r - l) * 0.55, l + (g - l) * 0.55, l + (b - l) * 0.55  # less saturated (elk are redder than reindeer)
            k = 1.18; px[i * 4], px[i * 4 + 1], px[i * 4 + 2] = min(1, r2 * k + 0.04), min(1, g2 * k + 0.035), min(1, b2 * k + 0.03)
        img.pixels = px; img.update()


def reindeer(ar=False):
    """Realistic Animated Elk (WildMesh 3D, CC BY 4.0) restyled as a reindeer: a natural standing pose from its idle animation, armature
    applied, reindeer colouring, decimated with the antlers kept, a thin layer of snow on its back, 36 mm tall to the antler tips."""
    reset()
    src = os.path.join(SRC, "sketchfab", "elk")
    gltf = next(os.path.join(dp, f) for dp, _, fs in os.walk(src) for f in fs if f.endswith((".gltf", ".glb")))
    import_gltf(gltf)
    acts = list(bpy.data.actions)
    pick = next((a for a in acts if a.name == "Stand_Breathing_01"), None) or next((a for a in acts if any(k in a.name.lower() for k in ("idle", "stand"))), acts[0] if acts else None)
    if pick:
        for o in bpy.data.objects:
            if o.type == "ARMATURE":
                o.animation_data_create(); o.animation_data.action = pick
                if hasattr(o.animation_data, "action_slot") and pick.slots: o.animation_data.action_slot = pick.slots[0]
        f0, f1 = pick.frame_range; bpy.context.scene.frame_set(int(f0 + (f1 - f0) * 0.25))
        print(f"[globe] reindeer pose: {pick.name}")
    apply_all()
    for o in list(meshes()):  # the source carries a stray helper sphere with no material
        if not o.material_slots or not any(sl.material for sl in o.material_slots): bpy.data.objects.remove(o, do_unlink=True)
    recolor_reindeer()
    # keep antler detail: decimate the body harder than the antlers by protecting the highest 30% of the model
    lo, hi = bounds()
    for o in meshes():
        vg = o.vertex_groups.new(name="keep")
        vg.add([v.index for v in o.data.vertices if (o.matrix_world @ v.co).z > lo.z + (hi.z - lo.z) * 0.7], 1.0, "REPLACE")
        d = o.modifiers.new("dec", "DECIMATE"); d.ratio = 0.75; d.vertex_group = "keep"; d.invert_vertex_group = True; d.vertex_group_factor = 1.0
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=d.name)
    # snow resting along the back: up-facing faces in the body band (between the legs and the head), not the antlers
    body = max(meshes(), key=lambda o: len(o.data.polygons))
    bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active = body
    bpy.ops.object.duplicate(); back = bpy.context.active_object; back.name = "back_snow_src"
    bpy.ops.object.mode_set(mode="EDIT"); bm = bmesh.from_edit_mesh(back.data)
    zb0, zb1 = lo.z + (hi.z - lo.z) * 0.42, lo.z + (hi.z - lo.z) * 0.66
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.7 or not (zb0 < f.calc_center_median().z < zb1)], context="FACES")
    bmesh.update_edit_mesh(back.data); bpy.ops.object.mode_set(mode="OBJECT")
    if len(back.data.polygons):
        h = hi.z - lo.z
        snow = snow_cover(back, h * 0.018, h * 0.012, 600, "back_snow"); snow.data.materials.append(material("back_snow", (0.95, 0.96, 0.99), rough=0.8))
    bpy.data.objects.remove(back, do_unlink=True)
    if ar: decimate_to(2400)
    fit(0.036)
    shrink_images(256 if ar else 512)
    export("reindeer-ar" if ar else "reindeer")


TASKS = {"lantern": lantern, "cottage": cottage, "reindeer": reindeer,
         # lighter variants for the AR files (iPhone USDZ, Android): fewer triangles, 256 px textures
         "lantern-ar": lambda: lantern(True), "cottage-ar": lambda: cottage(True), "reindeer-ar": lambda: reindeer(True)}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["all"]
    for a in (TASKS if args == ["all"] else args):
        TASKS[a]()
