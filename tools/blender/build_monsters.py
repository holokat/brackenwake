# The six starter monsters.
#
#   blender --background --python tools/blender/build_monsters.py
#
# Writes public/models/mmo/monster-{skeleton,goblin,rat,zombie,spider,bat}.glb.
#
# Same conventions as build_human.py: Blender Z up, the creature faces -Y so it
# comes out of the exporter facing +Z, feet on z = 0, metres, one mesh object
# per colour slot (Blender 5.2 loses COLOR_0 on every primitive after the first
# of a multi material mesh, see rigkit.Body.build).
#
# Each monster carries six clips: idle, walk, attack, hurt, die, and one
# special that is its own. Positive rx is forward for every bone, whichever way
# the bone points; rigkit.pose flips the sign.
#
# The three uprights (skeleton, goblin, zombie) share the human bone names, so
# a biped clip table is written once and retuned per monster: the skeleton is
# stiff and jerky, the goblin quick and low, the zombie slow and lopsided. The
# rat, the spider and the bat have their own rigs and their own tables.

import math
import os
import sys

sys.dont_write_bytecode = True      # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rigkit as rk                           # noqa: E402

FPS = 30
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'mmo'))

DUR = dict(idle=2.0, walk=1.0, attack=0.6, hurt=0.3, die=1.2, special=0.8)


def merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


# --- the uprights: skeleton, goblin, zombie -------------------------------

def biped_bones(hip, knee, ankle, shoulder, headtop, half, sx, lean=0.0):
    """Shared bone names with the human, minus neck, shoulder and hand.

    `lean` is METRES of forward offset at shoulder height, not an angle and not
    a ratio: read as an angle it put the goblin's chest 2.28 m in front of its
    hips and the zombie's 6 m out, which the clip measurement caught as a body
    swinging between z -8.7 and +9.2. It tips the spine forward in the REST
    pose, which is how the zombie slouches with no pose holding it there."""
    def fwd(z, base):
        return -lean * (z - base) / max(1e-6, shoulder - hip)
    s = [('hips', (0, 0, hip), (0, 0, hip + (shoulder - hip) * 0.4), None, False)]
    mid = hip + (shoulder - hip) * 0.4
    s.append(('spine', (0, 0, mid), (0, fwd(shoulder, hip), shoulder), 'hips', True))
    s.append(('chest', (0, fwd(shoulder, hip), shoulder), (0, fwd(shoulder, hip) * 1.3, shoulder + (headtop - shoulder) * 0.35), 'spine', True))
    ny = fwd(shoulder, hip) * 1.3
    s.append(('head', (0, ny, shoulder + (headtop - shoulder) * 0.35), (0, ny * 1.1, headtop), 'chest', True))
    elbow = shoulder - (shoulder - hip) * 0.55
    wrist = shoulder - (shoulder - hip) * 1.05
    for side, k in (('L', 1), ('R', -1)):
        s.append(('upperarm_' + side, (sx * k, ny, shoulder - 0.02), (sx * k, ny, elbow), 'chest', False))
        s.append(('lowerarm_' + side, (sx * k, ny, elbow), (sx * k, ny, wrist), 'upperarm_' + side, True))
        s.append(('upperleg_' + side, (half * k, 0, hip), (half * k, 0, knee), 'hips', False))
        s.append(('lowerleg_' + side, (half * k, 0, knee), (half * k, 0, ankle), 'upperleg_' + side, True))
        s.append(('foot_' + side, (half * k, 0, ankle), (half * k, -ankle * 1.6 - 0.06, ankle * 0.25), 'lowerleg_' + side, True))
    return s


def bleg(side, thigh, shin, foot):
    return {'upperleg_' + side: (thigh, 0, 0), 'lowerleg_' + side: (shin, 0, 0), 'foot_' + side: (foot, 0, 0)}


def barm(side, upper, lower, out=0.0):
    k = 1 if side == 'L' else -1
    return {'upperarm_' + side: (upper, -out * k, 0), 'lowerarm_' + side: (lower, 0, 0)}


_LEG = [(24, -8, 4), (2, -4, 0), (-18, -12, -8), (12, -46, 8)]
_ARM = [(-16, 20), (0, 24), (16, 28), (0, 24)]


def biped_walk(period, gain, arm_gain, bob, lean=0.0, drag=None):
    """drag names a leg that never lifts, which is the zombie's limp."""
    keys = []
    for i in range(5):
        lt = _LEG[i % 4]
        rt = _LEG[(i + 2) % 4]
        if drag == 'R':
            rt = (rt[0] * 0.35, -6, -4)
        la, ra = _ARM[i % 4], _ARM[(i + 2) % 4]
        z = bob[0] if i % 2 == 0 else bob[1]
        keys.append((period * i / 4, merge(
            bleg('L', lt[0] * gain, lt[1] * gain, lt[2]),
            bleg('R', rt[0] * gain, rt[1] * gain, rt[2]),
            barm('L', la[0] * arm_gain, la[1] * arm_gain, 8),
            barm('R', ra[0] * arm_gain, ra[1] * arm_gain, 8),
            {'hips': (0, 0, 0, 0, 0, z), 'spine': (lean, 0, 0), 'chest': (lean * 0.5, 0, 0)},
        )))
    return keys


def biped_clips(cfg):
    hip, ankle = cfg['hip'], cfg['ankle']
    stand = merge(barm('L', cfg['arm_rest'], cfg['elbow_rest'], 8), barm('R', cfg['arm_rest'], cfg['elbow_rest'], 8),
                  bleg('L', 0, -3, 0), bleg('R', 0, -3, 0), {'hips': (0, 0, 0, 0, 0, 0)})

    pitch = cfg.get('die_pitch', 88)

    def top(p, knee=0.0):
        d = {'hips': rk.topple(p, hip, ankle)}
        for side in ('L', 'R'):
            d.update(bleg(side, knee, -knee * 1.6, -p + knee * 0.6))
        return d

    idle = [
        (0.0, stand),
        (0.5, merge(stand, barm('L', cfg['arm_rest'] + 4, cfg['elbow_rest'] + 5, 9), barm('R', cfg['arm_rest'] + 4, cfg['elbow_rest'] + 5, 9),
                    {'hips': (0, 0, 1.5, 0, 0, 0.010), 'chest': (-2, 0, 0), 'head': (2, 0, -2)})),
        (1.0, stand),
        (1.5, merge(stand, barm('L', cfg['arm_rest'] - 3, cfg['elbow_rest'] - 2, 7), barm('R', cfg['arm_rest'] - 3, cfg['elbow_rest'] - 2, 7),
                    {'hips': (0, 0, -1.5, 0, 0, -0.008), 'chest': (1, 0, 0), 'head': (-2, 0, 2)})),
        (2.0, stand),
    ]
    walk = biped_walk(1.0, cfg['stride'], cfg['arm_swing'], cfg['bob'], cfg.get('walk_lean', 0.0), cfg.get('drag'))
    attack = [
        (0.00, merge(stand, barm('R', 20, 45, 6), {'spine': (0, 0, -7), 'chest': (0, 0, -6)})),
        (0.18, merge(stand, barm('R', 165, 55, 10), barm('L', -8, 35, 14), bleg('L', 10, -8, 2), bleg('R', -7, -6, -2),
                     {'spine': (-6, 0, -20), 'chest': (-4, 0, -16), 'head': (-4, 0, -8), 'hips': (0, 0, -9, 0, 0, -0.01)})),
        (0.36, merge(stand, barm('R', 60, 8, 4), barm('L', 22, 30, 16), bleg('L', 13, -9, 3), bleg('R', -10, -8, -3),
                     {'spine': (14, 0, 13), 'chest': (8, 0, 11), 'head': (6, 0, 5), 'hips': (0, 0, 8, 0, 0, -0.02)})),
        (0.60, merge(stand, barm('R', 20, 45, 6), {'spine': (0, 0, -7), 'chest': (0, 0, -6)})),
    ]
    hurt = [
        (0.00, stand),
        (0.10, merge(stand, barm('L', 26, 58, 22), barm('R', 22, 54, 20), bleg('L', 9, -13, -3), bleg('R', 6, -11, -3),
                     {'spine': (-18, 0, 5), 'chest': (-12, 0, 4), 'head': (-20, 0, 6), 'hips': (0, 0, 0, 0, 0.025, -0.025)})),
        (0.30, stand),
    ]
    die = [
        (0.00, merge(stand, top(0))),
        (0.18, merge(stand, barm('L', 30, 48, 26), barm('R', 26, 44, 24), top(-9, 6),
                     {'spine': (-20, 0, 6), 'chest': (-14, 0, 4), 'head': (-25, 0, 8)})),
        (0.45, merge(stand, barm('L', 34, 38, 30), barm('R', 30, 34, 28), top(26, 10),
                     {'spine': (10, 0, -3), 'chest': (7, 0, -2), 'head': (-14, 0, -4)})),
        (0.80, merge(stand, barm('L', 24, 24, 52), barm('R', 20, 20, 50), top(pitch * 0.70, 8),
                     {'spine': (8, 0, 0), 'chest': (5, 0, 0), 'head': (-12, 0, 2)})),
        (1.20, merge(stand, barm('L', 0, 12, 78), barm('R', -4, 10, 74), top(pitch, 3),
                     {'spine': (3, 0, 0), 'chest': (2, 0, 0), 'head': (-14, 0, 6)})),
    ]
    return dict(idle=idle, walk=walk, attack=attack, hurt=hurt, die=die), stand


# --- skeleton -------------------------------------------------------------

SKELETON = dict(hip=0.92, knee=0.52, ankle=0.11, shoulder=1.44, headtop=1.80,
                half=0.10, sx=0.22, arm_rest=4, elbow_rest=14, stride=1.0,
                arm_swing=0.9, bob=(-0.012, 0.010))
SKELETON_PAL = {'bone': 0xd8d2be, 'metal': 0x8f9298, 'cloth': 0x4a4a52, 'dark': 0x141014}


def skeleton_body():
    b = rk.Body(SKELETON_PAL)
    b.box((0, 0, 0.97), (0.24, 0.15, 0.14), 'bone', 'hips')                     # pelvis
    for i, z in enumerate((1.08, 1.18, 1.28)):                                   # spine knuckles
        b.box((0, 0.01, z), (0.08, 0.08, 0.07), 'bone', 'spine' if z < 1.2 else 'chest')
    for z in (1.24, 1.32, 1.40):                                                 # ribs
        b.box((0, 0, z), (0.30 - (z - 1.24) * 0.3, 0.17, 0.045), 'bone', 'chest')
    b.box((0, 0, 1.44), (0.30, 0.16, 0.05), 'bone', 'chest')                      # collar
    b.limb((0, 0, 1.44), (0, 0, 1.56), 0.035, 0.033, 'bone', 'chest')             # neck
    b.box((0, 0.005, 1.68), (0.19, 0.20, 0.24), 'bone', 'head')                   # skull
    b.box((0, -0.04, 1.575), (0.16, 0.13, 0.07), 'bone', 'head')                  # jaw
    b.box((0, 0, 1.79), (0.19, 0.19, 0.02), 'bone', 'head')                       # crown, top at 1.80
    b.box((0, 0, 0.90), (0.29, 0.19, 0.26), 'cloth', 'hips')                      # a rag at the waist, so the ribs stay visible
    for side, k in (('L', 1), ('R', -1)):
        b.box((0.062 * k, -0.098, 1.70), (0.05, 0.02, 0.045), 'dark', 'head')     # eye socket
        b.limb((0.22 * k, 0, 1.42), (0.22 * k, 0, 1.15), 0.036, 0.032, 'bone', 'upperarm_' + side)
        b.limb((0.22 * k, 0, 1.15), (0.22 * k, 0, 0.88), 0.032, 0.028, 'bone', 'lowerarm_' + side)
        b.box((0.22 * k, -0.01, 0.83), (0.07, 0.06, 0.09), 'bone', 'lowerarm_' + side)
        b.limb((0.10 * k, 0, 0.92), (0.10 * k, 0, 0.52), 0.048, 0.040, 'bone', 'upperleg_' + side)
        b.limb((0.10 * k, 0, 0.52), (0.10 * k, 0, 0.12), 0.040, 0.034, 'bone', 'lowerleg_' + side)
        b.box((0.10 * k, -0.055, 0.05), (0.11, 0.24, 0.10), 'bone', 'foot_' + side)
    # a sword in the right hand and a shield strapped to the left forearm
    b.box((-0.22, -0.03, 0.90), (0.05, 0.13, 0.05), 'metal', 'lowerarm_R')        # cross guard
    b.limb((-0.22, -0.03, 0.92), (-0.22, -0.03, 1.44), (0.022, 0.045), (0.010, 0.030), 'metal', 'lowerarm_R')
    b.box((0.28, -0.02, 0.98), (0.05, 0.30, 0.38), 'metal', 'lowerarm_L')
    return b


def skeleton_clips():
    clips, stand = biped_clips(SKELETON)
    # special: the shield comes up and the body turns behind it
    clips['special'] = [
        (0.00, merge(stand, {'spine': (0, 0, 0)})),
        (0.20, merge(stand, barm('L', 96, 82, 40), barm('R', 14, 60, 4), bleg('L', 8, -10, 2), bleg('R', -6, -8, -2),
                     {'spine': (10, 0, 22), 'chest': (6, 0, 18), 'head': (8, 0, 14), 'hips': (0, 0, 14, 0, 0, -0.03)})),
        (0.58, merge(stand, barm('L', 100, 86, 42), barm('R', 14, 60, 4), bleg('L', 8, -10, 2), bleg('R', -6, -8, -2),
                     {'spine': (11, 0, 23), 'chest': (7, 0, 19), 'head': (9, 0, 15), 'hips': (0, 0, 15, 0, 0, -0.035)})),
        (0.80, merge(stand, {'spine': (0, 0, 0)})),
    ]
    return clips


# --- goblin ---------------------------------------------------------------

GOBLIN = dict(hip=0.62, knee=0.34, ankle=0.08, shoulder=1.00, headtop=1.30,
              half=0.085, sx=0.19, arm_rest=6, elbow_rest=26, stride=1.15,
              arm_swing=1.2, bob=(-0.02, 0.016), lean=0.05)
GOBLIN_PAL = {'skin': 0x6f8f4a, 'cloth': 0x7a4a2a, 'metal': 0x9aa0a6, 'dark': 0x161410}


def goblin_body():
    b = rk.Body(GOBLIN_PAL)
    b.box((0, 0, 0.66), (0.26, 0.19, 0.16), 'cloth', 'hips')
    b.limb((0, 0, 0.72), (0, -0.04, 1.02), (0.145, 0.105), (0.155, 0.115), 'skin', 'spine')
    b.box((0, -0.05, 1.00), (0.30, 0.20, 0.09), 'cloth', 'chest')                 # a strap of hide
    b.limb((0, -0.05, 1.00), (0, -0.06, 1.09), 0.045, 0.042, 'skin', 'chest')      # neck
    b.box((0, -0.055, 1.20), (0.24, 0.24, 0.22), 'skin', 'head')                   # the head is too big
    b.box((0, -0.17, 1.16), (0.11, 0.08, 0.08), 'skin', 'head')                    # snout
    b.box((0, -0.055, 1.30), (0.22, 0.22, 0.02), 'skin', 'head')                   # crown, top at 1.31
    for side, k in (('L', 1), ('R', -1)):
        b.box((0.15 * k, -0.03, 1.22), (0.10, 0.05, 0.16), 'skin', 'head')         # ear
        b.box((0.06 * k, -0.168, 1.235), (0.05, 0.02, 0.035), 'dark', 'head')      # eye
        b.limb((0.19 * k, -0.05, 0.98), (0.19 * k, -0.05, 0.79), 0.048, 0.042, 'skin', 'upperarm_' + side)
        b.limb((0.19 * k, -0.05, 0.79), (0.19 * k, -0.05, 0.58), 0.042, 0.036, 'skin', 'lowerarm_' + side)
        b.box((0.19 * k, -0.06, 0.53), (0.08, 0.07, 0.09), 'skin', 'lowerarm_' + side)
        b.limb((0.085 * k, 0, 0.63), (0.085 * k, 0, 0.34), 0.065, 0.052, 'skin', 'upperleg_' + side)
        b.limb((0.085 * k, 0, 0.34), (0.085 * k, 0, 0.09), 0.052, 0.042, 'skin', 'lowerleg_' + side)
        b.box((0.085 * k, -0.05, 0.04), (0.10, 0.22, 0.08), 'skin', 'foot_' + side)
    b.box((-0.19, -0.10, 0.50), (0.03, 0.05, 0.16), 'metal', 'lowerarm_R')         # the knife it throws
    return b


def goblin_clips():
    clips, stand = biped_clips(GOBLIN)
    # special: winds the knife back over the shoulder and throws it
    clips['special'] = [
        (0.00, merge(stand, barm('R', 20, 40, 6))),
        (0.26, merge(stand, barm('R', 150, 95, 16), barm('L', 40, 20, 20), bleg('L', 12, -10, 2), bleg('R', -8, -8, -2),
                     {'spine': (-8, 0, -26), 'chest': (-5, 0, -20), 'head': (-2, 0, -10), 'hips': (0, 0, -12, 0, 0, -0.01)})),
        (0.44, merge(stand, barm('R', 78, 4, 6), barm('L', -20, 24, 24), bleg('L', 16, -12, 4), bleg('R', -12, -10, -4),
                     {'spine': (16, 0, 18), 'chest': (10, 0, 14), 'head': (6, 0, 8), 'hips': (0, 0, 10, 0, 0, -0.03)})),
        (0.80, merge(stand, barm('R', 20, 40, 6))),
    ]
    return clips


# --- zombie ---------------------------------------------------------------

ZOMBIE = dict(hip=0.88, knee=0.48, ankle=0.10, shoulder=1.42, headtop=1.80,
              half=0.115, sx=0.26, arm_rest=52, elbow_rest=22, stride=0.55,
              arm_swing=0.25, bob=(-0.03, 0.008), lean=0.20, drag='R', die_pitch=80)
ZOMBIE_PAL = {'skin': 0x7f8a63, 'cloth': 0x4a4438, 'dark': 0x241c18, 'wound': 0x6a2a26}


def zombie_body():
    # built with the slouch already in the rest pose, so the crown sits at 1.80
    # while the body itself is nearer 1.95 laid out straight
    b = rk.Body(ZOMBIE_PAL)
    b.box((0, 0, 0.94), (0.32, 0.22, 0.17), 'cloth', 'hips')
    b.limb((0, 0, 1.02), (0, -0.10, 1.24), (0.15, 0.10), (0.17, 0.11), 'cloth', 'spine')
    b.limb((0, -0.10, 1.24), (0, -0.20, 1.44), (0.17, 0.11), (0.20, 0.12), 'cloth', 'chest')
    b.box((0, -0.20, 1.42), (0.36, 0.22, 0.08), 'cloth', 'chest')
    b.box((0, -0.15, 1.30), (0.10, 0.13, 0.12), 'wound', 'chest')                  # something took a bite
    b.limb((0, -0.21, 1.42), (0, -0.25, 1.53), 0.052, 0.050, 'skin', 'chest')       # neck, thrown forward
    b.box((0, -0.28, 1.66), (0.22, 0.22, 0.24), 'skin', 'head')
    b.box((0, -0.28, 1.785), (0.23, 0.22, 0.03), 'dark', 'head')                    # matted hair, top at 1.80
    b.box((0, -0.39, 1.62), (0.13, 0.05, 0.07), 'skin', 'head')                     # slack jaw
    for side, k in (('L', 1), ('R', -1)):
        b.box((0.06 * k, -0.388, 1.70), (0.05, 0.02, 0.035), 'dark', 'head')        # eye
        b.limb((0.26 * k, -0.20, 1.40), (0.26 * k, -0.20, 1.12), 0.065, 0.056, 'cloth', 'upperarm_' + side)
        b.limb((0.26 * k, -0.20, 1.12), (0.26 * k, -0.20, 0.86), 0.055, 0.046, 'skin', 'lowerarm_' + side)
        b.box((0.26 * k, -0.21, 0.80), (0.09, 0.08, 0.12), 'skin', 'lowerarm_' + side)
        b.limb((0.115 * k, 0, 0.90), (0.115 * k, 0, 0.48), 0.095, 0.080, 'cloth', 'upperleg_' + side)
        b.limb((0.115 * k, 0, 0.48), (0.115 * k, 0, 0.11), 0.078, 0.062, 'skin', 'lowerleg_' + side)
        b.box((0.115 * k, -0.04, 0.05), (0.14, 0.26, 0.10), 'dark', 'foot_' + side)
    return b


def zombie_clips():
    clips, stand = biped_clips(ZOMBIE)
    # special: both arms come up and close on whatever is in front
    clips['special'] = [
        (0.00, merge(stand, barm('L', 52, 22, 8), barm('R', 52, 22, 8))),
        (0.30, merge(stand, barm('L', 96, 14, 26), barm('R', 96, 14, 26), bleg('L', 8, -8, 2), bleg('R', 6, -6, 2),
                     {'spine': (-6, 0, 0), 'chest': (-4, 0, 0), 'head': (6, 0, 0), 'hips': (0, 0, 0, 0, 0, -0.02)})),
        (0.50, merge(stand, barm('L', 88, 40, 6), barm('R', 88, 40, 6), bleg('L', 12, -12, 3), bleg('R', 9, -9, 3),
                     {'spine': (12, 0, 0), 'chest': (8, 0, 0), 'head': (10, 0, 0), 'hips': (0, 0, 0, 0, 0, -0.05)})),
        (0.80, merge(stand, barm('L', 52, 22, 8), barm('R', 52, 22, 8))),
    ]
    return clips


# --- giant rat ------------------------------------------------------------
#
# Half a metre nose to tail tip along Blender Y, which is the glb's Z.

RAT_PAL = {'fur': 0x6b5a4a, 'dark': 0x2a2018, 'skin': 0xb08878}
RAT_LEGS = [('legF_L', 1, -0.085), ('legF_R', -1, -0.085), ('legB_L', 1, 0.055), ('legB_R', -1, 0.055)]


def rat_bones():
    s = [('body', (0, 0.10, 0.155), (0, -0.02, 0.16), None, False)]
    s.append(('chest', (0, -0.02, 0.16), (0, -0.10, 0.16), 'body', True))
    s.append(('head', (0, -0.10, 0.16), (0, -0.19, 0.15), 'chest', True))
    s.append(('tail', (0, 0.10, 0.155), (0, 0.30, 0.13), 'body', False))
    for name, k, y in RAT_LEGS:
        s.append((name, (0.062 * k, y, 0.135), (0.062 * k, y, 0.0), 'body', False))
    return s


def rat_body():
    b = rk.Body(RAT_PAL)
    b.limb((0, 0.12, 0.15), (0, -0.02, 0.16), (0.075, 0.075), (0.082, 0.082), 'fur', 'body')
    b.limb((0, -0.02, 0.16), (0, -0.10, 0.16), (0.082, 0.082), (0.062, 0.062), 'fur', 'chest')
    b.box((0, -0.145, 0.157), (0.10, 0.09, 0.09), 'fur', 'head')
    b.box((0, -0.198, 0.142), (0.05, 0.03, 0.045), 'skin', 'head')                  # snout, nose at -0.213
    b.limb((0, 0.10, 0.155), (0, 0.29, 0.125), 0.018, 0.008, 'skin', 'tail')
    for k in (1, -1):
        b.box((0.045 * k, -0.115, 0.215), (0.055, 0.015, 0.05), 'fur', 'head')      # ear
        b.box((0.035 * k, -0.183, 0.168), (0.025, 0.015, 0.02), 'dark', 'head')     # eye
    for name, k, y in RAT_LEGS:
        b.limb((0.062 * k, y, 0.14), (0.062 * k, y, 0.03), 0.024, 0.018, 'fur', name)
        b.box((0.062 * k, y - 0.02, 0.015), (0.045, 0.07, 0.03), 'skin', name)
    return b


def rat_step(fl, fr, bl, br):
    return {'legF_L': (fl, 0, 0), 'legF_R': (fr, 0, 0), 'legB_L': (bl, 0, 0), 'legB_R': (br, 0, 0)}


def rat_clips():
    stand = merge(rat_step(0, 0, 0, 0), {'body': (0, 0, 0, 0, 0, 0)})
    idle = [
        (0.0, stand),
        (0.5, merge(stand, {'body': (0, 0, 0, 0, 0, 0.008), 'head': (-4, 0, 5), 'tail': (0, 0, 12)})),
        (1.0, merge(stand, {'head': (2, 0, 0), 'tail': (0, 0, -4)})),
        (1.5, merge(stand, {'body': (0, 0, 0, 0, 0, -0.006), 'head': (-3, 0, -6), 'tail': (0, 0, -14)})),
        (2.0, stand),
    ]
    # a trot: diagonal pairs together
    walk = [
        (0.00, merge(rat_step(28, -24, -24, 28), {'body': (0, 0, 0, 0, 0, 0.006), 'tail': (0, 0, 8)})),
        (0.25, merge(rat_step(0, 0, 0, 0), {'body': (0, 0, 0, 0, 0, -0.004), 'tail': (0, 0, 0)})),
        (0.50, merge(rat_step(-24, 28, 28, -24), {'body': (0, 0, 0, 0, 0, 0.006), 'tail': (0, 0, -8)})),
        (0.75, merge(rat_step(0, 0, 0, 0), {'body': (0, 0, 0, 0, 0, -0.004), 'tail': (0, 0, 0)})),
        (1.00, merge(rat_step(28, -24, -24, 28), {'body': (0, 0, 0, 0, 0, 0.006), 'tail': (0, 0, 8)})),
    ]
    attack = [
        (0.00, stand),
        (0.20, merge(rat_step(-30, -30, 10, 10), {'body': (-16, 0, 0, 0, 0.03, 0.02), 'head': (-14, 0, 0), 'chest': (-8, 0, 0)})),
        (0.36, merge(rat_step(34, 34, -14, -14), {'body': (14, 0, 0, 0, -0.05, 0.01), 'head': (16, 0, 0), 'chest': (10, 0, 0)})),
        (0.60, stand),
    ]
    hurt = [
        (0.00, stand),
        (0.10, merge(rat_step(-14, -14, -14, -14), {'body': (0, 0, 0, 0, 0.03, -0.05), 'head': (-18, 0, 8), 'tail': (0, 0, 20)})),
        (0.30, stand),
    ]
    die = [
        (0.00, stand),
        (0.25, merge(rat_step(-20, -20, -18, -18), {'body': (0, 0, 0, 0, 0.02, -0.06), 'head': (-16, 0, 10)})),
        (0.70, merge(rat_step(-70, -70, -66, -66), {'body': (0, 62, 0, 0, 0, -0.075), 'head': (-10, 0, 24), 'tail': (0, 0, 30)})),
        (1.20, merge(rat_step(-84, -84, -80, -80), {'body': (0, 88, 0, 0, 0, -0.085), 'head': (-6, 0, 30), 'tail': (0, 0, 36)})),
    ]
    # special: a bite lunge, further and lower than the standing attack
    special = [
        (0.00, stand),
        (0.24, merge(rat_step(-40, -40, 16, 16), {'body': (-22, 0, 0, 0, 0.05, 0.03), 'head': (-20, 0, 0), 'chest': (-12, 0, 0)})),
        (0.46, merge(rat_step(46, 46, -22, -22), {'body': (20, 0, 0, 0, -0.09, 0.00), 'head': (24, 0, 0), 'chest': (14, 0, 0)})),
        (0.80, stand),
    ]
    return dict(idle=idle, walk=walk, attack=attack, hurt=hurt, die=die, special=special)


# --- giant spider ---------------------------------------------------------
#
# 1.2 m across the legs, which is the glb's X.

SPIDER_PAL = {'chitin': 0x2e2a33, 'joint': 0x4a4450, 'eye': 0xc03a30}
SPIDER_ROWS = [(-0.075, 0.30), (-0.025, 0.10), (0.025, -0.10), (0.075, -0.30)]   # y offset, yaw of the leg


def spider_leg_points(i, k):
    y, yaw = SPIDER_ROWS[i]
    a = math.radians(yaw)
    root = (0.075 * k, y, 0.30)
    knee = (0.30 * k, y + math.sin(a) * 0.22, 0.44)
    foot = (0.575 * k, y + math.sin(a) * 0.52, 0.0)
    return root, knee, foot


def spider_bones():
    s = [('body', (0, 0.02, 0.30), (0, -0.16, 0.30), None, False),
         ('abdomen', (0, 0.02, 0.30), (0, 0.30, 0.33), 'body', False)]
    for i in range(4):
        for side, k in (('L', 1), ('R', -1)):
            root, knee, foot = spider_leg_points(i, k)
            s.append(('leg%d_%s' % (i + 1, side), root, knee, 'body', False))
            s.append(('foot%d_%s' % (i + 1, side), knee, foot, 'leg%d_%s' % (i + 1, side), True))
    return s


def spider_body():
    b = rk.Body(SPIDER_PAL)
    b.limb((0, 0.04, 0.30), (0, -0.17, 0.29), (0.115, 0.085), (0.075, 0.055), 'chitin', 'body')
    b.limb((0, 0.02, 0.30), (0, 0.30, 0.32), (0.13, 0.115), (0.055, 0.05), 'chitin', 'abdomen')
    b.box((0, -0.21, 0.285), (0.10, 0.06, 0.06), 'chitin', 'body')                  # fangs block
    for k in (1, -1):
        b.box((0.035 * k, -0.235, 0.30), (0.03, 0.02, 0.028), 'eye', 'body')
        b.box((0.075 * k, -0.215, 0.315), (0.026, 0.02, 0.024), 'eye', 'body')
    for i in range(4):
        for side, k in (('L', 1), ('R', -1)):
            root, knee, foot = spider_leg_points(i, k)
            b.limb(root, knee, 0.030, 0.024, 'joint', 'leg%d_%s' % (i + 1, side))
            b.limb(knee, foot, 0.024, 0.012, 'chitin', 'foot%d_%s' % (i + 1, side))
    return b


def spider_legs(f, lift=0.0, curl=0.0, phase=(0, 1, 0, 1)):
    """f is the forward swing in degrees, applied +f to the legs whose phase is
    0 and -f to the rest, which is the alternating tetrapod gait every spider
    walks on. lift raises the swinging half."""
    d = {}
    for i in range(4):
        on = phase[i] == 0
        for side, k in (('L', 1), ('R', -1)):
            s = 1 if (on if side == 'L' else not on) else -1
            up = lift if s > 0 else 0.0
            d['leg%d_%s' % (i + 1, side)] = (0, -up * k, -f * s * k)
            # curl draws the foot UP and in, which is what a dying spider does.
            # With the sign the other way every curl folded the legs THROUGH
            # the floor: the die clip measured 0.19 m under the ground.
            d['foot%d_%s' % (i + 1, side)] = (0, (up * 0.6 - curl) * k, 0)
    return d


def spider_clips():
    stand = merge(spider_legs(0), {'body': (0, 0, 0, 0, 0, 0)})
    idle = [
        (0.0, stand),
        (0.5, merge(spider_legs(0, 0, 4), {'body': (0, 0, 0, 0, 0, 0.012), 'abdomen': (-3, 0, 0)})),
        (1.0, stand),
        (1.5, merge(spider_legs(0, 0, -3), {'body': (0, 0, 0, 0, 0, -0.010), 'abdomen': (2, 0, 0)})),
        (2.0, stand),
    ]
    walk = [
        (0.00, merge(spider_legs(16, 0), {'body': (0, 0, 0, 0, 0, 0.008)})),
        (0.25, merge(spider_legs(0, 14), {'body': (0, 0, 0, 0, 0, -0.006)})),
        (0.50, merge(spider_legs(-16, 0), {'body': (0, 0, 0, 0, 0, 0.008)})),
        (0.75, merge(spider_legs(0, 14, 0, (1, 0, 1, 0)), {'body': (0, 0, 0, 0, 0, -0.006)})),
        (1.00, merge(spider_legs(16, 0), {'body': (0, 0, 0, 0, 0, 0.008)})),
    ]
    rear = {}
    for side, k in (('L', 1), ('R', -1)):
        for i in (0, 1):
            rear['leg%d_%s' % (i + 1, side)] = (0, -44 * k, -22 * k)
            rear['foot%d_%s' % (i + 1, side)] = (0, -30 * k, 0)
    attack = [
        (0.00, stand),
        (0.22, merge(stand, rear, {'body': (-26, 0, 0, 0, 0, 0.10), 'abdomen': (14, 0, 0)})),
        (0.40, merge(stand, {'body': (18, 0, 0, 0, -0.06, -0.02), 'abdomen': (-10, 0, 0)})),
        (0.60, stand),
    ]
    hurt = [
        (0.00, stand),
        (0.10, merge(spider_legs(0, 0, 22), {'body': (0, 0, 0, 0, 0.03, -0.07), 'abdomen': (10, 0, 0)})),
        (0.30, stand),
    ]
    die = [
        (0.00, stand),
        (0.30, merge(spider_legs(0, 0, 26), {'body': (0, 0, 0, 0, 0, -0.05), 'abdomen': (8, 0, 0)})),
        (0.75, merge(spider_legs(0, 0, 48), {'body': (0, 14, 12, 0, 0, -0.12), 'abdomen': (12, 0, 0)})),
        (1.20, merge(spider_legs(0, 0, 62), {'body': (0, 22, 18, 0, 0, -0.16), 'abdomen': (16, 0, 0)})),
    ]
    # special: the abdomen tips up and spits a web, front legs off the ground
    special = [
        (0.00, stand),
        (0.30, merge(stand, rear, {'body': (-12, 0, 0, 0, 0, 0.06), 'abdomen': (-34, 0, 0)})),
        (0.55, merge(stand, rear, {'body': (-16, 0, 0, 0, 0, 0.07), 'abdomen': (-46, 0, 0)})),
        (0.80, stand),
    ]
    return dict(idle=idle, walk=walk, attack=attack, hurt=hurt, die=die, special=special)


# --- cave bat -------------------------------------------------------------
#
# 0.4 m across the wings, which is the glb's X.

BAT_PAL = {'fur': 0x3a2e2e, 'membrane': 0x584050, 'eye': 0xd0a020}


def bat_bones():
    s = [('body', (0, 0.05, 0.20), (0, -0.03, 0.20), None, False),
         ('head', (0, -0.03, 0.20), (0, -0.09, 0.21), 'body', True)]
    for side, k in (('L', 1), ('R', -1)):
        s.append(('wing_' + side, (0.025 * k, 0, 0.205), (0.11 * k, 0.01, 0.205), 'body', False))
        s.append(('tip_' + side, (0.11 * k, 0.01, 0.205), (0.20 * k, 0.03, 0.20), 'wing_' + side, True))
    return s


def bat_body():
    b = rk.Body(BAT_PAL)
    b.limb((0, 0.07, 0.19), (0, -0.03, 0.205), (0.038, 0.038), (0.042, 0.042), 'fur', 'body')
    b.box((0, -0.062, 0.207), (0.062, 0.055, 0.058), 'fur', 'head')
    b.box((0, -0.092, 0.196), (0.028, 0.02, 0.022), 'fur', 'head')                  # muzzle
    for side, k in (('L', 1), ('R', -1)):
        b.box((0.026 * k, -0.045, 0.245), (0.026, 0.014, 0.05), 'fur', 'head')      # ear
        b.box((0.020 * k, -0.088, 0.212), (0.016, 0.012, 0.014), 'eye', 'head')
        b.limb((0.025 * k, 0, 0.205), (0.11 * k, 0.01, 0.205), (0.014, 0.014), (0.011, 0.011), 'fur', 'wing_' + side)
        b.box((0.068 * k, 0.012, 0.204), (0.086, 0.075, 0.006), 'membrane', 'wing_' + side)
        b.limb((0.11 * k, 0.01, 0.205), (0.20 * k, 0.03, 0.20), (0.010, 0.010), (0.006, 0.006), 'fur', 'tip_' + side)
        b.box((0.155 * k, 0.028, 0.202), (0.09, 0.055, 0.006), 'membrane', 'tip_' + side)
        b.limb((0.03 * k, 0.075, 0.19), (0.032 * k, 0.095, 0.0), 0.011, 0.007, 'fur', 'body')     # leg, to the ground
    return b


def bat_wings(inner, outer, sweep=0.0):
    d = {}
    for side, k in (('L', 1), ('R', -1)):
        d['wing_' + side] = (0, -inner * k, -sweep * k)
        d['tip_' + side] = (0, -outer * k, 0)
    return d


def bat_clips():
    stand = merge(bat_wings(0, 0), {'body': (0, 0, 0, 0, 0, 0)})
    # a bat at rest still beats its wings, so idle is a slow hover
    idle = [
        (0.00, merge(bat_wings(22, 16), {'body': (0, 0, 0, 0, 0, 0.010)})),
        (0.50, merge(bat_wings(-26, -18), {'body': (0, 0, 0, 0, 0, -0.010)})),
        (1.00, merge(bat_wings(22, 16), {'body': (0, 0, 0, 0, 0, 0.010)})),
        (1.50, merge(bat_wings(-26, -18), {'body': (0, 0, 0, 0, 0, -0.010)})),
        (2.00, merge(bat_wings(22, 16), {'body': (0, 0, 0, 0, 0, 0.010)})),
    ]
    walk = [
        (0.00, merge(bat_wings(40, 30), {'body': (-6, 0, 0, 0, 0, 0.022)})),
        (0.25, merge(bat_wings(0, 0), {'body': (0, 0, 0, 0, 0, 0.000)})),
        (0.50, merge(bat_wings(-42, -30), {'body': (6, 0, 0, 0, 0, -0.022)})),
        (0.75, merge(bat_wings(0, 0), {'body': (0, 0, 0, 0, 0, 0.000)})),
        (1.00, merge(bat_wings(40, 30), {'body': (-6, 0, 0, 0, 0, 0.022)})),
    ]
    attack = [
        (0.00, merge(bat_wings(20, 14), {'body': (0, 0, 0, 0, 0, 0)})),
        (0.20, merge(bat_wings(52, 40, 16), {'body': (-18, 0, 0, 0, 0.03, 0.035), 'head': (-12, 0, 0)})),
        (0.38, merge(bat_wings(-20, -14, -10), {'body': (24, 0, 0, 0, -0.045, -0.01), 'head': (18, 0, 0)})),
        (0.60, merge(bat_wings(20, 14), {'body': (0, 0, 0, 0, 0, 0)})),
    ]
    hurt = [
        (0.00, stand),
        (0.10, merge(bat_wings(-34, -26, -18), {'body': (0, 0, 0, 0, 0.03, -0.03), 'head': (-16, 0, 10)})),
        (0.30, stand),
    ]
    die = [
        (0.00, merge(bat_wings(18, 12), {'body': (0, 0, 0, 0, 0, 0)})),
        (0.35, merge(bat_wings(-30, -40, -20), {'body': (0, 0, 22, 0, 0, -0.06), 'head': (-10, 0, 12)})),
        (0.80, merge(bat_wings(-32, -38, -30), {'body': (0, 0, 34, 0, 0, -0.075), 'head': (-4, 0, 20)})),
        (1.20, merge(bat_wings(-36, -42, -34), {'body': (0, 0, 42, 0, 0, -0.090), 'head': (0, 0, 24)})),
    ]
    # special: folds the wings and dives
    special = [
        (0.00, merge(bat_wings(16, 12), {'body': (0, 0, 0, 0, 0, 0)})),
        (0.28, merge(bat_wings(58, 46, 10), {'body': (-22, 0, 0, 0, 0, 0.05), 'head': (-16, 0, 0)})),
        (0.52, merge(bat_wings(-46, -52, -24), {'body': (34, 0, 0, 0, -0.05, -0.03), 'head': (26, 0, 0)})),
        (0.80, merge(bat_wings(16, 12), {'body': (0, 0, 0, 0, 0, 0)})),
    ]
    return dict(idle=idle, walk=walk, attack=attack, hurt=hurt, die=die, special=special)


# --- the run --------------------------------------------------------------

MONSTERS = [
    ('skeleton', skeleton_body, lambda: biped_bones(**{k: SKELETON[k] for k in ('hip', 'knee', 'ankle', 'shoulder', 'headtop', 'half', 'sx')}), skeleton_clips),
    ('goblin', goblin_body, lambda: biped_bones(lean=GOBLIN['lean'], **{k: GOBLIN[k] for k in ('hip', 'knee', 'ankle', 'shoulder', 'headtop', 'half', 'sx')}), goblin_clips),
    ('rat', rat_body, rat_bones, rat_clips),
    ('zombie', zombie_body, lambda: biped_bones(lean=ZOMBIE['lean'], **{k: ZOMBIE[k] for k in ('hip', 'knee', 'ankle', 'shoulder', 'headtop', 'half', 'sx')}), zombie_clips),
    ('spider', spider_body, spider_bones, spider_clips),
    ('bat', bat_body, bat_bones, bat_clips),
]

ORDER = ['idle', 'walk', 'attack', 'hurt', 'die', 'special']


def build(mid, body_fn, bones_fn, clips_fn):
    rk.reset_scene(FPS)
    body = body_fn()
    arm_ob = rk.build_armature(mid, bones_fn())
    mesh_obs = body.build('monster-' + mid)
    rk.bind(mesh_obs, arm_ob)
    rk.rest_pose(arm_ob)
    clips = clips_fn()
    missing = [c for c in ORDER if c not in clips]
    if missing:
        raise KeyError('%s is missing clips: %s' % (mid, missing))
    actions = []
    for cn in ORDER:
        keys = clips[cn]
        want = DUR[cn]
        got = keys[-1][0]
        if abs(got - want) > 1e-6:
            raise ValueError('%s %s ends at %.2f s, the spec says %.2f' % (mid, cn, got, want))
        actions.append(rk.make_action(arm_ob, cn, keys, FPS))
    spans = rk.measure_clips(arm_ob, mesh_obs, actions, FPS)
    rk.stash(arm_ob, actions)
    path = os.path.join(OUT, 'monster-%s.glb' % mid)
    rk.export_glb(path, FPS)
    out = rk.report('monster-' + mid, body, arm_ob, actions, path, FPS)
    print('%-16s %s' % ('', '  '.join('%s[%.2f..%.2f end %.2f..%.2f]' % (k, v['min_z'], v['max_z'], v['end_min_z'], v['end_max_z'])
                                      for k, v in spans.items())))
    return out


def main():
    print('building monsters into', OUT)
    for mid, body_fn, bones_fn, clips_fn in MONSTERS:
        build(mid, body_fn, bones_fn, clips_fn)


if __name__ == '__main__':
    main()
