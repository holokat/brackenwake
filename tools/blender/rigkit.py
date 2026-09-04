# rigkit: the shared parts of the Brackenwake model builders.
#
# Run under Blender: blender --background --python tools/blender/build_human.py
#
# Conventions, all of which the exported glb inherits.
#
#   Blender is Z up and a character faces -Y. The glTF exporter's Y-up
#   conversion maps blender (x, y, z) -> gltf (x, z, -y), so a body built
#   facing -Y in Blender comes out facing +Z in the game, which is what
#   player.js means by forward. Feet on z = 0 in Blender is feet on y = 0
#   in the glb. Metres throughout.
#
#   Every mesh is a set of tapered rectangular prisms. Twelve triangles each,
#   flat shaded, one bone per prism at weight 1. That is what makes the
#   silhouette read at distance and keeps the triangle count in the hundreds.
#
#   Colour lives in a POINT colour attribute (COLOR_0 in the glb). Each
#   material is a Principled node whose Base Color is wired straight from that
#   attribute, so the exporter writes baseColorFactor = white and the game gets
#   a white material per slot that it can overwrite with a flat colour. That is
#   how models.js setTint recolours skin, hair, tunic, trousers and boots
#   without touching geometry.
#
#   Poses are written in ARMATURE space, not bone space. pose() converts.
#   Positive rx always means "forward" for a bone that stands up and for a bone
#   that hangs down alike: the sign is flipped per bone from its rest direction
#   so that clip data never has to know which way a bone points.

import bpy
import math
import os
from mathutils import Vector, Matrix, Euler

DEG = math.pi / 180.0


# --- colour ---------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    r = ((h >> 16) & 255) / 255.0
    g = ((h >> 8) & 255) / 255.0
    b = (h & 255) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# --- scene ----------------------------------------------------------------

def reset_scene(fps=30):
    """An empty scene: no camera, no light, no cube. The glb inherits that."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = fps
    sc.render.fps_base = 1.0
    sc.frame_start = 0
    sc.frame_end = 250
    return sc


# --- geometry -------------------------------------------------------------

class Body:
    """Accumulates prisms into one mesh, remembering each vertex's colour slot
    and the bone that carries it."""

    def __init__(self, palette):
        self.palette = palette           # slot name -> 0xRRGGBB
        self.slots = []                  # slot names, in material index order
        self.v = []                      # Vector per vertex
        self.vcol = []                   # (r,g,b,a) linear per vertex
        self.vbone = []                  # bone name per vertex
        self.faces = []                  # tuples of vertex indices
        self.fmat = []                   # material index per face

    def slot_index(self, slot):
        if slot not in self.slots:
            if slot not in self.palette:
                raise KeyError('slot %r has no palette colour' % slot)
            self.slots.append(slot)
        return self.slots.index(slot)

    def _push(self, corners, slot, bone):
        mi = self.slot_index(slot)
        col = hex_linear(self.palette[slot])
        base = len(self.v)
        for c in corners:
            self.v.append(Vector(c))
            self.vcol.append(col)
            self.vbone.append(bone)
        # corners are 0..3 bottom ring, 4..7 top ring, both wound the same way
        b = base
        quads = [
            (b + 0, b + 1, b + 2, b + 3),          # bottom cap
            (b + 7, b + 6, b + 5, b + 4),          # top cap
            (b + 0, b + 4, b + 5, b + 1),
            (b + 1, b + 5, b + 6, b + 2),
            (b + 2, b + 6, b + 7, b + 3),
            (b + 3, b + 7, b + 4, b + 0),
        ]
        for q in quads:
            self.faces.append(q)
            self.fmat.append(mi)

    def box(self, center, size, slot, bone, top=None, top_off=(0.0, 0.0)):
        """Axis aligned box. `top` scales the top face (sx, sy), `top_off`
        slides it, which is how a slouch or a taper is cut."""
        cx, cy, cz = center
        sx, sy, sz = size
        tx, ty = (top if top else (1.0, 1.0))
        ox, oy = top_off
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        bot = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
               (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz)]
        tp = [(cx + ox - hx * tx, cy + oy - hy * ty, cz + hz),
              (cx + ox + hx * tx, cy + oy - hy * ty, cz + hz),
              (cx + ox + hx * tx, cy + oy + hy * ty, cz + hz),
              (cx + ox - hx * tx, cy + oy + hy * ty, cz + hz)]
        self._push(bot + tp, slot, bone)

    def limb(self, p0, p1, r0, r1, slot, bone):
        """A tapered prism from p0 to p1. r may be a number or (ru, rv). For a
        vertical limb ru is the x half width and rv the y half width."""
        p0, p1 = Vector(p0), Vector(p1)
        d = (p1 - p0)
        if d.length < 1e-6:
            raise ValueError('limb of zero length on bone %s' % bone)
        d.normalize()
        helper = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        u = (helper - d * helper.dot(d)).normalized()
        v = d.cross(u).normalized()
        r0 = (r0, r0) if isinstance(r0, (int, float)) else r0
        r1 = (r1, r1) if isinstance(r1, (int, float)) else r1
        ring = lambda p, r: [p - u * r[0] - v * r[1], p + u * r[0] - v * r[1],
                             p + u * r[0] + v * r[1], p - u * r[0] + v * r[1]]
        self._push(ring(p0, r0) + ring(p1, r1), slot, bone)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def min_z(self):
        return min(p.z for p in self.v)

    def extent(self):
        lo = Vector((min(p.x for p in self.v), min(p.y for p in self.v), min(p.z for p in self.v)))
        hi = Vector((max(p.x for p in self.v), max(p.y for p in self.v), max(p.z for p in self.v)))
        return lo, hi

    def build(self, name):
        """One mesh OBJECT per colour slot, not one mesh with five material
        slots.

        Blender 5.2's glTF exporter writes real COLOR_0 data only for the
        first primitive of a multi-material mesh; every later primitive comes
        out solid white. Measured on a three box mesh: box one exported
        0.69,0.35,0.17 and boxes two and three exported 1,1,1, under every
        combination of export_vertex_color and export_all_vertex_colors.
        Splitting by slot gives each object a single material, so each is the
        first primitive of its own mesh and keeps its colours. The draw call
        count is the same either way, one per material, and the armature is
        still a single skin shared by all the objects."""
        obs = []
        for mi, slot in enumerate(self.slots):
            keep = [i for i, f in enumerate(self.faces) if self.fmat[i] == mi]
            remap = {}
            verts, cols, bones, faces = [], [], [], []
            for fi in keep:
                face = []
                for vi in self.faces[fi]:
                    if vi not in remap:
                        remap[vi] = len(verts)
                        verts.append(tuple(self.v[vi]))
                        cols.append(self.vcol[vi])
                        bones.append(self.vbone[vi])
                    face.append(remap[vi])
                faces.append(face)
            obs.append(self._one(name + '_' + slot, slot, verts, cols, bones, faces))
        return obs

    def _one(self, name, slot, verts, cols, bones, faces):
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.update()
        me.materials.append(make_material(slot))
        for poly in me.polygons:
            poly.material_index = 0
            try:
                poly.use_smooth = False
            except AttributeError:
                pass
        ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(cols):
            ca.data[i].color = c
        me.validate(verbose=False)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        # every prism is a closed box, so a recalculate gives outward normals
        # whatever order _push happened to wind the caps in
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        # groups by bone, rigid, weight 1
        groups = {}
        for i, bone in enumerate(bones):
            groups.setdefault(bone, []).append(i)
        for bone, idx in groups.items():
            g = ob.vertex_groups.new(name=bone)
            g.add(idx, 1.0, 'REPLACE')
        return ob


def make_material(slot):
    m = bpy.data.materials.get(slot)
    if m:
        return m
    m = bpy.data.materials.new(slot)
    m.use_nodes = True
    m.use_backface_culling = True        # doubleSided false in the glb
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.92
    bsdf.inputs['Metallic'].default_value = 0.0
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    attr.location = (-320, 260)
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    return m


# --- armature -------------------------------------------------------------

def build_armature(name, spec):
    """spec: list of (bone, head, tail, parent_or_None, connect)."""
    arm = bpy.data.armatures.new(name + 'Rig')
    ob = bpy.data.objects.new(name + 'Rig', arm)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    made = {}
    for bone, head, tail, parent, connect in spec:
        eb = arm.edit_bones.new(bone)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        eb.roll = 0.0
        eb.use_deform = True
        if parent:
            eb.parent = made[parent]
            eb.use_connect = bool(connect)
        made[bone] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def bind(mesh_obs, arm_ob):
    """Parent every slot object to the one armature. They share a skin."""
    if not isinstance(mesh_obs, (list, tuple)):
        mesh_obs = [mesh_obs]
    for ob in mesh_obs:
        ob.parent = arm_ob
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm_ob
        mod.use_vertex_groups = True
    return mesh_obs


# --- posing ---------------------------------------------------------------

def bone_sign(pb):
    """+1 for a bone that stands up, -1 for one that hangs down. Applied to rx
    so that positive always reads as 'forward' in clip data."""
    d = (pb.bone.tail_local - pb.bone.head_local)
    return -1.0 if d.z < -1e-6 else 1.0


def pose(pb, rx=0.0, ry=0.0, rz=0.0, loc=None):
    """Rotate a bone by armature-space degrees. See the sign note at the top."""
    M = pb.bone.matrix_local.to_3x3().normalized()
    R = Euler((rx * bone_sign(pb) * DEG, ry * DEG, rz * DEG), 'XYZ').to_matrix()
    pb.rotation_quaternion = (M.transposed() @ R @ M).to_quaternion()
    if loc is not None:
        pb.location = M.transposed() @ Vector(loc)
    else:
        pb.location = Vector((0, 0, 0))


def topple(p, hip_z, ankle_z):
    """The hips tuple for a body pitched p degrees forward about its ankle
    line. A body falls over its feet, so placing the hip by hand is how the
    boots end up under the floor; this puts it where a rigid leg would."""
    a = p * DEG
    reach = hip_z - ankle_z
    return (p, 0, 0, 0, -reach * math.sin(a), ankle_z + reach * math.cos(a) - hip_z)


def rest_pose(arm_ob):
    for pb in arm_ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = Vector((0, 0, 0))
        pb.scale = Vector((1, 1, 1))


def make_action(arm_ob, name, keys, fps=30):
    """keys: [(seconds, {bone: (rx, ry, rz) or (rx, ry, rz, lx, ly, lz)}), ...]
    Every bone is keyed at every keyframe, so nothing leaks between clips."""
    if arm_ob.animation_data is None:
        arm_ob.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm_ob.animation_data.action = act
    _assign_slot(arm_ob, act)
    names = [pb.name for pb in arm_ob.pose.bones]
    for seconds, poses in keys:
        frame = round(seconds * fps)
        rest_pose(arm_ob)
        for bone, vals in poses.items():
            if bone not in names:
                raise KeyError('clip %s poses unknown bone %r' % (name, bone))
            pb = arm_ob.pose.bones[bone]
            rx, ry, rz = vals[0], vals[1], vals[2]
            loc = tuple(vals[3:6]) if len(vals) >= 6 else None
            pose(pb, rx, ry, rz, loc)
        for pb in arm_ob.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('location', frame=frame)
    arm_ob.animation_data.action = None
    rest_pose(arm_ob)
    return act


def _assign_slot(arm_ob, act):
    """Blender 4.4 and later route an action through a slot. Older builds have
    no such thing, so this is best effort either way."""
    ad = arm_ob.animation_data
    if not hasattr(ad, 'action_slot'):
        return
    try:
        slot = act.slots[0] if len(act.slots) else act.slots.new('OBJECT', 'Rig')
    except TypeError:
        slot = act.slots.new(id_type='OBJECT', name='Rig')
    ad.action_slot = slot


def stash(arm_ob, actions):
    """Park each action on a muted NLA track so the exporter finds them all."""
    ad = arm_ob.animation_data
    for act in actions:
        track = ad.nla_tracks.new()
        track.name = act.name
        start = int(act.frame_range[0])
        track.strips.new(act.name, start, act)
        track.mute = True


# --- export ---------------------------------------------------------------

def export_glb(path, fps=30):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    want = dict(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        # NOT export_image_format='NONE': it stops the exporter evaluating the
        # node tree at all, so the Color Attribute link is lost and every
        # material comes out as Blender's default 0.8 grey with no COLOR_0.
        # Nothing here has a texture, and the validator proves it.
        export_vertex_color='MATERIAL',
        export_all_vertex_colors=False,
        export_skins=True,
        export_def_bones=False,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_frame_range=False,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_bake_animation=False,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_current_frame=False,
        export_nla_strips=True,
        export_morph=False,
        use_selection=False,
        export_hierarchy_full_collections=False,
    )
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kwargs = {k: v for k, v in want.items() if k in props}
    dropped = sorted(set(want) - set(kwargs))
    if dropped:
        print('  note: this Blender ignores', ', '.join(dropped))
    bpy.ops.export_scene.gltf(**kwargs)
    return path


def measure_clips(arm_ob, mesh_obs, actions, fps=30):
    """Play every clip through the real deform stack and read the lowest and
    highest point of the posed mesh each frame. This is how a pose is checked,
    rather than by looking at the numbers that produced it: a die that ends a
    foot in the air and a walk whose boots sink through the floor both show up
    here as a number."""
    sc = bpy.context.scene
    ad = arm_ob.animation_data or arm_ob.animation_data_create()
    was = [t.mute for t in ad.nla_tracks]
    for t in ad.nla_tracks:
        t.mute = True
    out = {}
    for act in actions:
        ad.action = act
        _assign_slot(arm_ob, act)
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        lo, hi, end_lo, end_hi = 1e9, -1e9, None, None
        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            flo, fhi = 1e9, -1e9
            for ob in mesh_obs:
                ev = ob.evaluated_get(dg)
                me = ev.to_mesh()
                for v in me.vertices:
                    w = ev.matrix_world @ v.co
                    flo = min(flo, w.z)
                    fhi = max(fhi, w.z)
                ev.to_mesh_clear()
            lo, hi = min(lo, flo), max(hi, fhi)
            if f == f1:
                end_lo, end_hi = flo, fhi
        # end_max_z is the one that catches a corpse floating with a hand on
        # the ground: end_min_z alone said 0.00 while the body hung at 0.35.
        out[act.name] = dict(min_z=lo, max_z=hi, end_min_z=end_lo, end_max_z=end_hi)
    ad.action = None
    rest_pose(arm_ob)
    for t, m in zip(ad.nla_tracks, was):
        t.mute = m
    sc.frame_set(0)
    return out


def report(name, body, arm_ob, actions, path, fps=30):
    lo, hi = body.extent()
    size = hi - lo
    clips = ', '.join('%s %.2fs' % (a.name, (a.frame_range[1] - a.frame_range[0]) / fps) for a in actions)
    kb = os.path.getsize(path) / 1024.0
    print('%-16s %4d tris  %2d bones  x %.2f y %.2f z %.2f  minz %+.3f  %6.1f KB'
          % (name, body.tris(), len(arm_ob.pose.bones), size.x, size.y, size.z, lo.z, kb))
    print('%-16s clips: %s' % ('', clips))
    return dict(name=name, tris=body.tris(), bones=len(arm_ob.pose.bones),
                size=(size.x, size.y, size.z), min_z=lo.z, kb=kb)
