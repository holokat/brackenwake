# Render a contact sheet of an exported glb, so a pose can be looked at
# instead of taken on trust. Renders the FILE, not the scene that made it, so
# anything the exporter dropped shows up here.
#
#   blender --background --python tools/blender/preview.py -- \
#       public/models/mmo/human-medium.glb /tmp/out idle:0 walk:0.25 swing:0.30
#
# Each shot is <clip>:<seconds> and lands in <out>/<name>-<clip>-<seconds>.png.
# "bind" as a clip renders the rest pose. A shot may end in :side for the
# profile view.

import bpy
import math
import os
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
src = os.path.abspath(argv[0])
out = os.path.abspath(argv[1])
shots = argv[2:] or ['bind:0']
os.makedirs(out, exist_ok=True)
name = os.path.splitext(os.path.basename(src))[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src)

arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']

# measure what came in, so the camera frames whatever size the thing is
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
dg = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
        hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
mid = (lo + hi) / 2
span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)

# A ground plane at z = 0, so a model that floats or sinks shows it instead of
# leaving the eye to guess from the framing. Twice caught me reading a render
# wrong where the numbers were right.
gm = bpy.data.meshes.new('ground')
r = max(span, 1.0) * 3
d = max(span, 1.0) * 0.012          # a slab, not a plane: the side camera sits
                                    # level with it and a plane is edge on and
                                    # invisible, which is no use at all
gm.from_pydata(
    [(-r, -r, -d), (r, -r, -d), (r, r, -d), (-r, r, -d), (-r, -r, 0), (r, -r, 0), (r, r, 0), (-r, r, 0)],
    [], [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
gm.update()
ground = bpy.data.objects.new('ground', gm)
bpy.context.collection.objects.link(ground)

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = span * 1.35
cam = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam)
sc.camera = cam

sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x = 300
sc.render.resolution_y = 400
sc.render.film_transparent = False
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'VERTEX'          # show COLOR_0, which is where the palette is
sh.show_shadows = False
sh.show_cavity = True


def place(side):
    if side:
        cam.location = (mid.x + span * 3, mid.y, mid.z)
        cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    else:
        cam.location = (mid.x, mid.y - span * 3, mid.z)
        cam.rotation_euler = (math.radians(90), 0, 0)


def find_action(clip):
    for a in bpy.data.actions:
        if a.name == clip or a.name.endswith('|' + clip) or a.name.startswith(clip):
            return a
    return None


for shot in shots:
    bits = shot.split(':')
    clip, seconds = bits[0], float(bits[1])
    side = len(bits) > 2 and bits[2] == 'side'
    if arm:
        if arm.animation_data is None:
            arm.animation_data_create()
        for t in list(arm.animation_data.nla_tracks):
            t.mute = True
        act = None if clip == 'bind' else find_action(clip)
        arm.animation_data.action = act
        if act is not None and hasattr(arm.animation_data, 'action_slot') and len(act.slots):
            arm.animation_data.action_slot = act.slots[0]
        if act is None:
            for pb in arm.pose.bones:
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.location = (0, 0, 0)
    sc.frame_set(round(seconds * sc.render.fps))
    place(side)
    sc.render.filepath = os.path.join(out, '%s-%s-%s%s.png' % (name, clip, ('%.2f' % seconds), '-side' if side else ''))
    bpy.ops.render.render(write_still=True)
    print('rendered', sc.render.filepath)
