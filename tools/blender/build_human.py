# The starter character: one 1.80 m body plan in three builds.
#
#   blender --background --python tools/blender/build_human.py
#
# Writes public/models/mmo/human-slim.glb, human-medium.glb, human-heavy.glb.
#
# The body plan is player.js's, to the centimetre, so the Blender human can
# stand in for the procedural rig without the camera or the gait code noticing:
# hip pivot 0.90, knee 0.50, ankle 0.12, shoulders 1.40 at x 0.27, skull
# 1.53 to 1.78, hair topping out at 1.80. Feet on z = 0 in Blender, which is
# y = 0 in the glb. The three builds differ in girth and shoulder width only;
# every build is exactly 1.80 m tall and carries the same nineteen bones under
# the same names, so one set of clips drives all three.
#
# In the clip data below, positive rx always means FORWARD, for a bone that
# stands up and for a bone that hangs down alike. rigkit.pose flips the sign
# from the bone's rest direction. A bent knee is therefore a negative rx on
# lowerleg, because a knee folds backward.

import math
import os
import sys

sys.dont_write_bytecode = True      # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                    # noqa: E402
import rigkit as rk                           # noqa: E402

FPS = 30
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'mmo')
OUT = os.path.normpath(OUT)

# player.js PALETTE, unchanged. Five slots and no more; models.js setTint
# addresses them by these names.
PALETTE = {
    'skin': 0xd8a071,
    'hair': 0x3a2a1c,
    'tunic': 0x5c7d52,
    'trousers': 0x4a4034,
    'boots': 0x2b2420,
}

BUILDS = {
    'slim':   dict(girth=0.84, shoulder=0.245, belly=0.88, neck=0.90),
    'medium': dict(girth=1.00, shoulder=0.270, belly=1.00, neck=1.00),
    'heavy':  dict(girth=1.32, shoulder=0.300, belly=1.48, neck=1.18),
}

HIP_Z, KNEE_Z, ANKLE_Z, SHOULDER_Z = 0.90, 0.50, 0.12, 1.40
HIP_HALF = 0.115


def armature_spec(sx):
    s = []
    s.append(('hips', (0, 0, HIP_Z), (0, 0, 1.04), None, False))
    s.append(('spine', (0, 0, 1.04), (0, 0, 1.22), 'hips', True))
    s.append(('chest', (0, 0, 1.22), (0, 0, 1.42), 'spine', True))
    s.append(('neck', (0, 0, 1.42), (0, 0, 1.54), 'chest', True))
    s.append(('head', (0, 0, 1.54), (0, 0, 1.76), 'neck', True))
    for side, k in (('L', 1), ('R', -1)):
        s.append(('shoulder_' + side, (0.05 * k, 0, SHOULDER_Z), (sx * k, 0, SHOULDER_Z), 'chest', False))
        s.append(('upperarm_' + side, (sx * k, 0, 1.38), (sx * k, 0, 1.10), 'shoulder_' + side, False))
        s.append(('lowerarm_' + side, (sx * k, 0, 1.10), (sx * k, 0, 0.84), 'upperarm_' + side, True))
        s.append(('hand_' + side, (sx * k, 0, 0.84), (sx * k, 0, 0.72), 'lowerarm_' + side, True))
        s.append(('upperleg_' + side, (HIP_HALF * k, 0, HIP_Z), (HIP_HALF * k, 0, KNEE_Z), 'hips', False))
        s.append(('lowerleg_' + side, (HIP_HALF * k, 0, KNEE_Z), (HIP_HALF * k, 0, ANKLE_Z), 'upperleg_' + side, True))
        s.append(('foot_' + side, (HIP_HALF * k, 0, ANKLE_Z), (HIP_HALF * k, -0.19, 0.03), 'lowerleg_' + side, True))
    return s


def build_body(cfg):
    w, sx, belly, neck = cfg['girth'], cfg['shoulder'], cfg['belly'], cfg['neck']
    b = rk.Body(PALETTE)
    # trunk
    b.box((0, 0, 0.96), (0.32 * w, 0.22 * w, 0.17), 'trousers', 'hips')
    b.box((0, 0, 1.05), (0.37 * w, 0.25 * w, 0.07), 'boots', 'spine')          # belt, in the boot leather
    b.limb((0, 0, 1.04), (0, 0, 1.23), (0.155 * w * belly, 0.105 * w * belly),
           (0.175 * w, 0.112 * w), 'tunic', 'spine')
    b.limb((0, 0, 1.23), (0, 0, 1.45), (0.175 * w, 0.112 * w),
           (0.215 * w, 0.126 * w), 'tunic', 'chest')
    b.box((0, 0, 1.42), (0.40 * w, 0.24 * w, 0.08), 'tunic', 'chest')          # yoke across the shoulders
    # head
    b.limb((0, 0, 1.41), (0, 0, 1.55), 0.058 * neck, 0.055 * neck, 'skin', 'neck')
    b.box((0, 0.005, 1.65), (0.23, 0.22, 0.25), 'skin', 'head')
    b.box((0, 0.005, 1.775), (0.25, 0.235, 0.05), 'hair', 'head')              # crown, top at 1.80
    b.box((0, 0.105, 1.70), (0.255, 0.05, 0.15), 'hair', 'head')               # hair at the back
    b.box((0, -0.10, 1.735), (0.235, 0.045, 0.05), 'hair', 'head')             # fringe
    for side, k in (('L', 1), ('R', -1)):
        b.box((0.062 * k, -0.108, 1.665), (0.045, 0.02, 0.032), 'hair', 'head')
        # arm
        b.box(((sx - 0.02) * k, 0, 1.395), (0.14, 0.19 * w, 0.13), 'tunic', 'shoulder_' + side)
        b.limb((sx * k, 0, 1.38), (sx * k, 0, 1.10), 0.070 * w, 0.060 * w, 'tunic', 'upperarm_' + side)
        b.limb((sx * k, 0, 1.10), (sx * k, 0, 0.84), 0.058 * w, 0.050 * w, 'skin', 'lowerarm_' + side)
        b.box((sx * k, -0.01, 0.78), (0.095, 0.085, 0.13), 'skin', 'hand_' + side)
        # leg
        b.limb((HIP_HALF * k, 0, 0.92), (HIP_HALF * k, 0, KNEE_Z), 0.100 * w, 0.086 * w, 'trousers', 'upperleg_' + side)
        b.limb((HIP_HALF * k, 0, KNEE_Z), (HIP_HALF * k, 0, 0.13), 0.082 * w, 0.068 * w, 'trousers', 'lowerleg_' + side)
        b.box((HIP_HALF * k, -0.045, 0.06), (0.155, 0.30, 0.12), 'boots', 'foot_' + side)
    return b


# --- the clips ------------------------------------------------------------
#
# leg(thigh, shin, foot) and arm(upper, lower) keep the tables readable.

def leg(side, thigh, shin, foot):
    return {'upperleg_' + side: (thigh, 0, 0), 'lowerleg_' + side: (shin, 0, 0), 'foot_' + side: (foot, 0, 0)}


def arm(side, upper, lower, out=0.0):
    k = 1 if side == 'L' else -1
    return {'upperarm_' + side: (upper, -out * k, 0), 'lowerarm_' + side: (lower, 0, 0)}


def merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


# idle, 2 s, a slow breath and a shift of weight
IDLE = [
    (0.0, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0),
                {'hips': (0, 0, 0, 0, 0, 0), 'chest': (0, 0, 0), 'head': (0, 0, 0)})),
    (0.5, merge(arm('L', 6, 11, 8), arm('R', 6, 11, 8), leg('L', 0, -3, 0), leg('R', 0, -3, 0),
                {'hips': (0, 0, 1.5, 0, 0, 0.008), 'chest': (-2.0, 0, 0), 'head': (1.2, 0, -1.5), 'spine': (0.8, 0, 0)})),
    (1.0, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0),
                {'hips': (0, 0, 0, 0, 0, 0), 'chest': (0, 0, 0), 'head': (0, 0, 0)})),
    (1.5, merge(arm('L', 1, 6, 6), arm('R', 1, 6, 6), leg('L', 0, -3, 0), leg('R', 0, -3, 0),
                {'hips': (0, 0, -1.5, 0, 0, -0.006), 'chest': (1.2, 0, 0), 'head': (-1.0, 0, 1.5), 'spine': (-0.5, 0, 0)})),
    (2.0, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0),
                {'hips': (0, 0, 0, 0, 0, 0), 'chest': (0, 0, 0), 'head': (0, 0, 0)})),
]

# walk, 1 s, one full two step cycle. The right leg runs half a cycle behind.
_WALK_LEG = [(26, -8, 4), (2, -4, 0), (-20, -12, -8), (14, -50, 8)]
_WALK_ARM = [(-20, 14), (0, 18), (20, 24), (0, 18)]


def _cycle(table, i):
    return table[i % len(table)]


def walk_keys(period, lift, arm_gain=1.0, lean=0.0, hip_bob=(-0.015, 0.010)):
    keys = []
    n = 4
    for i in range(n + 1):
        t = period * i / n
        lt = _cycle(_WALK_LEG, i)
        rt = _cycle(_WALK_LEG, i + 2)
        la = _cycle(_WALK_ARM, i)
        ra = _cycle(_WALK_ARM, i + 2)
        bob = hip_bob[0] if i % 2 == 0 else hip_bob[1]
        yaw = 4.0 if i % 4 == 1 else (-4.0 if i % 4 == 3 else 0.0)
        keys.append((t, merge(
            leg('L', lt[0] * lift, lt[1] * lift, lt[2]),
            leg('R', rt[0] * lift, rt[1] * lift, rt[2]),
            arm('L', la[0] * arm_gain, la[1] * arm_gain, 7),
            arm('R', ra[0] * arm_gain, ra[1] * arm_gain, 7),
            {'hips': (0, 0, -yaw, 0, 0, bob), 'spine': (lean * 0.6, 0, yaw),
             'chest': (lean * 0.4, 0, yaw * 0.5), 'head': (-lean * 0.5, 0, 0)},
        )))
    return keys


WALK = walk_keys(1.0, 1.0, 1.0, 0.0)
RUN = walk_keys(0.6, 1.30, 1.9, 16.0, hip_bob=(-0.07, 0.02))

# swing, 0.5 s, right arm overhead to forward, the body turning into the blow
SWING = [
    (0.00, merge(arm('L', 8, 30, 10), arm('R', 25, 50, 6), leg('L', 8, -6, 0), leg('R', -6, -4, 0),
                 {'spine': (0, 0, -8), 'chest': (0, 0, -6), 'head': (0, 0, -4), 'hips': (0, 0, -4, 0, 0, 0)})),
    (0.15, merge(arm('L', -6, 40, 14), arm('R', 178, 60, 10), leg('L', 12, -8, 0), leg('R', -8, -6, 0),
                 {'spine': (-6, 0, -22), 'chest': (-4, 0, -18), 'head': (-4, 0, -8), 'hips': (0, 0, -10, 0, 0, -0.01)})),
    (0.30, merge(arm('L', 24, 34, 16), arm('R', 58, 10, 4), leg('L', 13, -8, 3), leg('R', -10, -7, -3),
                 {'spine': (14, 0, 14), 'chest': (8, 0, 12), 'head': (6, 0, 6), 'hips': (0, 0, 8, 0, 0, -0.03)})),
    (0.50, merge(arm('L', 8, 30, 10), arm('R', 25, 50, 6), leg('L', 8, -6, 0), leg('R', -6, -4, 0),
                 {'spine': (0, 0, -8), 'chest': (0, 0, -6), 'head': (0, 0, -4), 'hips': (0, 0, -4, 0, 0, 0)})),
]

# cast, 0.8 s, the hand goes up and then out
CAST = [
    (0.00, merge(arm('L', 4, 12, 8), arm('R', 6, 16, 8), leg('L', 0, -4, 0), leg('R', 0, -4, 0), {})),
    (0.30, merge(arm('L', 10, 40, 16), arm('R', 150, -70, 12), leg('L', 4, -8, 0), leg('R', -4, -8, 0),
                 {'spine': (-6, 0, -4), 'chest': (-6, 0, 0), 'head': (-8, 0, 0), 'hips': (0, 0, 0, 0, 0, -0.02)})),
    (0.55, merge(arm('L', -12, 30, 18), arm('R', 95, -5, 6), leg('L', 12, -9, 3), leg('R', -8, -6, -3),
                 {'spine': (12, 0, 2), 'chest': (8, 0, 0), 'head': (4, 0, 0), 'hips': (0, 0, 0, 0, 0, -0.02)})),
    (0.80, merge(arm('L', 4, 12, 8), arm('R', 6, 16, 8), leg('L', 0, -4, 0), leg('R', 0, -4, 0), {})),
]

# hurt, 0.3 s, one flinch back and a recovery
HURT = [
    (0.00, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0), {})),
    (0.10, merge(arm('L', 26, 60, 22), arm('R', 22, 55, 20), leg('L', 10, -14, -4), leg('R', 7, -12, -3),
                 {'spine': (-18, 0, 5), 'chest': (-12, 0, 4), 'head': (-20, 0, 6), 'hips': (0, 0, 0, 0, 0.03, -0.03)})),
    (0.30, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0), {})),
]

# die, 1.2 s. A body falling forward pivots about its ANKLES, not its hips.
# Driving the hips down by hand put the boots 0.34 m under the floor through
# the whole middle of the fall (measured frame by frame), so the hip is placed
# by the arithmetic instead: rotate the body by p about the ankle line at
# z = 0.12, and the hip lands where a rigid 0.78 m leg puts it. The feet are
# counter rotated by -p so the soles stay flat on the ground the whole way
# down, which is also what makes it read as falling rather than sinking.

ANKLE_TO_HIP = HIP_Z - ANKLE_Z          # 0.78


def toppled(p, knee=0.0, foot_extra=0.0):
    d = {'hips': rk.topple(p, HIP_Z, ANKLE_Z)}
    for side in ('L', 'R'):
        d.update(leg(side, knee, -knee * 1.6, -p - knee * -0.6 + foot_extra))
    return d


DIE = [
    (0.00, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), toppled(0), {})),
    (0.18, merge(arm('L', 30, 50, 26), arm('R', 26, 46, 24), toppled(-9, knee=6),
                 {'spine': (-20, 0, 6), 'chest': (-14, 0, 4), 'head': (-25, 0, 8)})),
    (0.45, merge(arm('L', 34, 40, 30), arm('R', 30, 36, 28), toppled(26, knee=10),
                 {'spine': (10, 0, -3), 'chest': (7, 0, -2), 'head': (-14, 0, -4)})),
    (0.80, merge(arm('L', 24, 26, 52), arm('R', 20, 22, 50), toppled(62, knee=8),
                 {'spine': (8, 0, 0), 'chest': (5, 0, 0), 'head': (-12, 0, 2)})),
    (1.20, merge(arm('L', 0, 12, 78), arm('R', -4, 10, 74), toppled(88, knee=3),
                 {'spine': (3, 0, 0), 'chest': (2, 0, 0), 'head': (-14, 0, 6)})),
]

# jump, 0.7 s, crouch, launch, tuck, land
JUMP = [
    (0.00, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0), {})),
    (0.12, merge(arm('L', -35, 20, 10), arm('R', -35, 20, 10), leg('L', 34, -62, 20), leg('R', 34, -62, 20),
                 {'spine': (18, 0, 0), 'chest': (10, 0, 0), 'head': (-8, 0, 0), 'hips': (0, 0, 0, 0, 0, -0.14)})),
    (0.26, merge(arm('L', 100, 10, 14), arm('R', 100, 10, 14), leg('L', -10, -5, -30), leg('R', -10, -5, -30),
                 {'spine': (-4, 0, 0), 'chest': (-2, 0, 0), 'head': (2, 0, 0), 'hips': (0, 0, 0, 0, 0, 0.10)})),
    (0.42, merge(arm('L', 40, 40, 20), arm('R', 40, 40, 20), leg('L', 55, -85, 10), leg('R', 55, -85, 10),
                 {'spine': (10, 0, 0), 'chest': (6, 0, 0), 'head': (-4, 0, 0), 'hips': (0, 0, 0, 0, 0, 0.16)})),
    (0.56, merge(arm('L', 25, 30, 16), arm('R', 25, 30, 16), leg('L', 36, -58, 16), leg('R', 36, -58, 16),
                 {'spine': (20, 0, 0), 'chest': (12, 0, 0), 'head': (-10, 0, 0), 'hips': (0, 0, 0, 0, 0, -0.12)})),
    (0.70, merge(arm('L', 3, 8, 7), arm('R', 3, 8, 7), leg('L', 0, -3, 0), leg('R', 0, -3, 0), {})),
]

CLIPS = [('idle', IDLE), ('walk', WALK), ('run', RUN), ('swing', SWING),
         ('cast', CAST), ('hurt', HURT), ('die', DIE), ('jump', JUMP)]


def build(name, cfg):
    rk.reset_scene(FPS)
    body = build_body(cfg)
    arm_ob = rk.build_armature('human', armature_spec(cfg['shoulder']))
    mesh_obs = body.build('human-' + name)
    rk.bind(mesh_obs, arm_ob)
    rk.rest_pose(arm_ob)
    actions = [rk.make_action(arm_ob, cn, keys, FPS) for cn, keys in CLIPS]
    spans = rk.measure_clips(arm_ob, mesh_obs, actions, FPS)
    rk.stash(arm_ob, actions)
    path = os.path.join(OUT, 'human-%s.glb' % name)
    rk.export_glb(path, FPS)
    out = rk.report('human-' + name, body, arm_ob, actions, path, FPS)
    print('%-16s %s' % ('', '  '.join('%s[%.2f..%.2f end %.2f..%.2f]' % (k, v['min_z'], v['max_z'], v['end_min_z'], v['end_max_z'])
                                      for k, v in spans.items())))
    return out


def main():
    print('building humans into', OUT)
    for name, cfg in BUILDS.items():
        build(name, cfg)


if __name__ == '__main__':
    main()
