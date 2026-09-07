// studio/src/animation/recipes/types.ts
import * as THREE from "three";
var degrees = (value) => THREE.MathUtils.degToRad(value);
function rotation(x = 0, y = 0, z = 0) {
  return [degrees(x), degrees(y), degrees(z)];
}

// studio/src/animation/recipes/standingJumpRecipes.ts
function jumpArmSwing(elevation, elbowFlex) {
  return {
    LeftShoulder: rotation(0.4, 0, -1.6),
    RightShoulder: rotation(0.2, 0, 1.35),
    LeftArm: rotation(-23.5, -2, -elevation),
    RightArm: rotation(-24.5, 3, elevation),
    LeftForeArm: rotation(0, -6, -elbowFlex),
    RightForeArm: rotation(0, 6, elbowFlex),
    LeftHand: rotation(0, 1.5, -1),
    RightHand: rotation(0, -1.2, 1.4)
  };
}
var STANDING_JUMP_RECIPES = [
  {
    id: "jump-launch",
    basePose: "relaxed",
    frames: [
      { time: 0 },
      {
        time: 0.09,
        rotations: {
          ...jumpArmSwing(-18, 16),
          Hips: rotation(6, 0, -0.6),
          Spine: rotation(3, 0, 0.3),
          Spine1: rotation(7, 0, -0.4),
          LeftUpLeg: rotation(18),
          RightUpLeg: rotation(19),
          LeftLeg: rotation(-35),
          RightLeg: rotation(-38),
          LeftFoot: rotation(8),
          RightFoot: rotation(8)
        },
        positions: { Hips: [0, -0.034, -0.032] }
      },
      {
        time: 0.22,
        rotations: {
          ...jumpArmSwing(42, 28),
          Hips: rotation(15, 0, -0.4),
          Spine: rotation(8, 0, 0.4),
          Spine1: rotation(15, 0, -0.5),
          Spine2: rotation(8, 0, 0.2),
          Head: rotation(-7),
          LeftUpLeg: rotation(55),
          RightUpLeg: rotation(57),
          LeftLeg: rotation(-88),
          RightLeg: rotation(-92),
          LeftFoot: rotation(14),
          RightFoot: rotation(14)
        },
        positions: { Hips: [0, -0.18, -0.07] }
      },
      {
        time: 0.28,
        rotations: {
          ...jumpArmSwing(104, 32),
          Hips: rotation(10, 0, -0.3),
          Spine: rotation(5, 0, 0.2),
          Spine1: rotation(10, 0, -0.3),
          Spine2: rotation(5, 0, 0.1),
          Head: rotation(-5),
          LeftUpLeg: rotation(34),
          RightUpLeg: rotation(36),
          LeftLeg: rotation(-54),
          RightLeg: rotation(-58),
          LeftFoot: rotation(6),
          RightFoot: rotation(6)
        },
        positions: { Hips: [0, -0.049, -0.05] }
      },
      {
        time: 0.34,
        rotations: {
          ...jumpArmSwing(137, 22),
          Hips: rotation(3, 0, -0.2),
          Spine: rotation(1, 0, 0.1),
          Spine1: rotation(3, 0, -0.2),
          LeftUpLeg: rotation(8),
          RightUpLeg: rotation(10),
          LeftLeg: rotation(-12),
          RightLeg: rotation(-15),
          LeftFoot: rotation(-5),
          RightFoot: rotation(-5),
          LeftToeBase: rotation(10),
          RightToeBase: rotation(10),
          Head: rotation(-3)
        },
        positions: { Hips: [0, 0.014, -0.018] }
      },
      {
        time: 0.46,
        rotations: {
          ...jumpArmSwing(150, 18),
          Hips: rotation(-2, 0, 0),
          Spine: rotation(-2, 0, 0),
          Spine1: rotation(-3, 0, 0),
          LeftUpLeg: rotation(5),
          RightUpLeg: rotation(7),
          LeftLeg: rotation(-9),
          RightLeg: rotation(-12),
          LeftFoot: rotation(-10),
          RightFoot: rotation(-10),
          LeftToeBase: rotation(6),
          RightToeBase: rotation(6),
          Head: rotation(-2)
        },
        positions: { Hips: [0, 0.2, 0] }
      }
    ]
  },
  {
    id: "jump-air",
    basePose: "relaxed",
    frames: [
      {
        time: 0,
        rotations: {
          ...jumpArmSwing(150, 18),
          Hips: rotation(-2, 0, 0),
          Spine: rotation(-2, 0, 0),
          Spine1: rotation(-3, 0, 0),
          LeftUpLeg: rotation(5),
          RightUpLeg: rotation(7),
          LeftLeg: rotation(-9),
          RightLeg: rotation(-12),
          LeftFoot: rotation(-10),
          RightFoot: rotation(-10),
          LeftToeBase: rotation(6),
          RightToeBase: rotation(6),
          Head: rotation(-2)
        },
        positions: { Hips: [0, 0.2, 0] }
      },
      {
        time: 0.16,
        rotations: {
          ...jumpArmSwing(153, 22),
          Hips: rotation(-1, 0, 0),
          Spine: rotation(-1, 0, 0),
          Spine1: rotation(-2, 0, 0),
          LeftUpLeg: rotation(3),
          RightUpLeg: rotation(5),
          LeftLeg: rotation(-6),
          RightLeg: rotation(-8),
          LeftFoot: rotation(-7),
          RightFoot: rotation(-7),
          Head: rotation(-1)
        },
        positions: { Hips: [0, 0.36, 4e-3] }
      },
      {
        time: 0.32,
        rotations: {
          ...jumpArmSwing(148, 28),
          Hips: rotation(0, 0, 0),
          Spine: rotation(0, 0, 0),
          Spine1: rotation(-1, 0, 0),
          LeftUpLeg: rotation(4),
          RightUpLeg: rotation(5),
          LeftLeg: rotation(-7),
          RightLeg: rotation(-9),
          LeftFoot: rotation(-4),
          RightFoot: rotation(-4),
          Head: rotation(0)
        },
        positions: { Hips: [0, 0.4, 6e-3] }
      },
      {
        time: 0.46,
        rotations: {
          ...jumpArmSwing(122, 32),
          Hips: rotation(1, 0, 0),
          Spine: rotation(1, 0, 0),
          Spine1: rotation(1, 0, 0),
          LeftUpLeg: rotation(7),
          RightUpLeg: rotation(9),
          LeftLeg: rotation(-12),
          RightLeg: rotation(-15),
          LeftFoot: rotation(0),
          RightFoot: rotation(0),
          Head: rotation(1)
        },
        positions: { Hips: [0, 0.37, 8e-3] }
      },
      {
        time: 0.56,
        rotations: {
          ...jumpArmSwing(90, 35),
          Hips: rotation(1.5, 0, 0),
          Spine: rotation(1.5, 0, 0),
          Spine1: rotation(2, 0, 0),
          LeftUpLeg: rotation(10),
          RightUpLeg: rotation(12),
          LeftLeg: rotation(-18),
          RightLeg: rotation(-21),
          LeftFoot: rotation(4),
          RightFoot: rotation(4),
          Head: rotation(1)
        },
        positions: { Hips: [0, 0.29, 0.01] }
      },
      {
        time: 0.66,
        rotations: {
          ...jumpArmSwing(62, 36),
          Hips: rotation(2, 0, 0),
          Spine: rotation(2, 0, 0),
          Spine1: rotation(3, 0, 0),
          LeftUpLeg: rotation(14),
          RightUpLeg: rotation(16),
          LeftLeg: rotation(-25),
          RightLeg: rotation(-29),
          LeftFoot: rotation(8),
          RightFoot: rotation(8),
          Head: rotation(1)
        },
        positions: { Hips: [0, 0.18, 0.012] }
      }
    ]
  },
  {
    id: "land-soft",
    basePose: "relaxed",
    frames: [
      {
        time: 0,
        rotations: {
          ...jumpArmSwing(62, 36),
          Hips: rotation(2, 0, 0),
          Spine: rotation(2, 0, 0),
          Spine1: rotation(3, 0, 0),
          LeftUpLeg: rotation(14),
          RightUpLeg: rotation(16),
          LeftLeg: rotation(-25),
          RightLeg: rotation(-29),
          LeftFoot: rotation(8),
          RightFoot: rotation(8)
        },
        positions: { Hips: [0, 0.04, 0.02] }
      },
      {
        time: 0.1,
        rotations: {
          ...jumpArmSwing(74, 38),
          Hips: rotation(8, 0, -0.3),
          Spine: rotation(5, 0, 0.2),
          Spine1: rotation(9, 0, -0.3),
          LeftUpLeg: rotation(31),
          RightUpLeg: rotation(33),
          LeftLeg: rotation(-61),
          RightLeg: rotation(-65),
          LeftFoot: rotation(11),
          RightFoot: rotation(11)
        },
        positions: { Hips: [0, -0.09, -0.02] }
      },
      {
        time: 0.18,
        rotations: {
          ...jumpArmSwing(88, 42),
          Hips: rotation(15, 0, -0.4),
          Spine: rotation(9, 0, 0.3),
          Spine1: rotation(15, 0, -0.4),
          Spine2: rotation(7, 0, 0.2),
          Head: rotation(-7),
          LeftUpLeg: rotation(52),
          RightUpLeg: rotation(54),
          LeftLeg: rotation(-92),
          RightLeg: rotation(-96),
          LeftFoot: rotation(14),
          RightFoot: rotation(14)
        },
        positions: { Hips: [0, -0.17, -0.065] }
      },
      {
        time: 0.34,
        rotations: {
          ...jumpArmSwing(66, 34),
          Hips: rotation(10, 0, -0.5),
          Spine: rotation(6, 0, 0.3),
          Spine1: rotation(10, 0, -0.4),
          LeftUpLeg: rotation(39),
          RightUpLeg: rotation(42),
          LeftLeg: rotation(-77),
          RightLeg: rotation(-83),
          LeftFoot: rotation(10),
          RightFoot: rotation(10)
        },
        positions: { Hips: [0, -0.12, -0.045] }
      },
      {
        time: 0.54,
        rotations: {
          ...jumpArmSwing(32, 22),
          Hips: rotation(4, 0, -0.7),
          Spine: rotation(2, 0, 0.2),
          Spine1: rotation(4, 0, -0.4),
          LeftUpLeg: rotation(18),
          RightUpLeg: rotation(21),
          LeftLeg: rotation(-35),
          RightLeg: rotation(-42),
          LeftFoot: rotation(5),
          RightFoot: rotation(5)
        },
        positions: { Hips: [0, -0.029, -0.012] }
      },
      { time: 0.72 }
    ]
  }
];

// studio/src/animation/recipes/jumpArcRecipe.ts
var SEGMENTS = [
  { id: "jump-launch", span: 0.46, dropFirst: false, dropLast: false },
  { id: "jump-air", span: 0.42, dropFirst: true, dropLast: true },
  { id: "land-soft", span: 0.62, dropFirst: false, dropLast: false }
];
var JUMP_ARC_DURATION = SEGMENTS.reduce((total, segment) => total + segment.span, 0);
var JUMP_ARC_LAND_EVENT = 0.88 + 0.06 * (0.62 / 0.72);
function compose() {
  const frames2 = [];
  let offset = 0;
  for (const segment of SEGMENTS) {
    const source = STANDING_JUMP_RECIPES.find((recipe) => recipe.id === segment.id);
    if (!source) throw new Error(`The jump arc needs the ${segment.id} recipe.`);
    const native = source.frames.at(-1)?.time ?? 0;
    if (native <= 0) throw new Error(`The ${segment.id} recipe has no duration to rescale.`);
    const scale = segment.span / native;
    const slice = source.frames.slice(segment.dropFirst ? 1 : 0, segment.dropLast ? -1 : void 0);
    for (const frame of slice) frames2.push({ ...frame, time: offset + frame.time * scale });
    offset += segment.span;
  }
  const last = frames2.at(-1);
  if (!last) throw new Error("The jump arc composed no frames.");
  frames2[frames2.length - 1] = { ...last, time: JUMP_ARC_DURATION };
  for (let index = 1; index < frames2.length; index += 1) {
    if (frames2[index].time <= frames2[index - 1].time) {
      throw new Error(`The jump arc has a stalled frame at ${frames2[index].time}.`);
    }
  }
  return frames2;
}
var JUMP_ARC_RECIPE = {
  id: "jump",
  basePose: "relaxed",
  frames: compose()
};

// studio/src/animation/spellMotion.ts
var ELEMENTAL_SPELL_IDS = ["fireball", "lightning", "energy-missiles", "healing"];
var SPELL_MOTIONS = {
  fireball: { duration: 1.35, gather: 0.24, release: [0.78], recover: 1.04 },
  lightning: { duration: 1.65, gather: 0.22, release: [0.74], recover: 1.18 },
  "energy-missiles": { duration: 1.1, gather: 0.18, release: [0.43, 0.6, 0.77], recover: 0.9 },
  healing: { duration: 1.8, gather: 0.28, release: [1.08], recover: 1.42 }
};
function isElementalSpell(move) {
  return ELEMENTAL_SPELL_IDS.includes(move);
}

// studio/src/animation/whirlwindMotion.ts
var WHIRLWIND_TIMING = {
  duration: 0.76,
  windupEnd: 0.1,
  firstCut: 0.28,
  finalCut: 0.48,
  spinEnd: 0.52,
  settleStart: 0.58,
  fadeIn: 0.045,
  fadeOut: 0.08,
  cooldown: 0.8
};

// studio/src/animation/moveCatalog.ts
var MOVE_CATALOG = [
  {
    id: "idle",
    label: "Relaxed idle",
    category: "Stance",
    keys: ["1"],
    duration: 5.6,
    loop: true,
    description: "Asymmetrical rest with breathing, ankle corrections, and quiet weight transfer.",
    fadeIn: 0.24,
    fadeOut: 0.2,
    cooldown: 0,
    movementScale: 1,
    showInDeck: true,
    events: []
  },
  {
    id: "combat-idle",
    label: "Combat idle",
    category: "Stance",
    keys: ["2"],
    duration: 2.8,
    loop: true,
    description: "Staggered guard with soft knees, a protected centerline, and active balance.",
    fadeIn: 0.2,
    fadeOut: 0.18,
    cooldown: 0,
    movementScale: 1,
    showInDeck: true,
    events: []
  },
  {
    id: "idle-shift",
    label: "Idle weight shift",
    category: "Stance",
    keys: [],
    duration: 2.4,
    loop: false,
    description: "Transfers support to the opposite leg, settles the pelvis, then recovers.",
    fadeIn: 0.24,
    fadeOut: 0.26,
    cooldown: 0,
    movementScale: 1,
    showInDeck: true,
    events: []
  },
  {
    id: "idle-scan",
    label: "Idle scan",
    category: "Stance",
    keys: [],
    duration: 2.9,
    loop: false,
    description: "A restrained head check with delayed shoulders and a small grip adjustment.",
    fadeIn: 0.24,
    fadeOut: 0.28,
    cooldown: 0,
    movementScale: 1,
    showInDeck: true,
    events: []
  },
  {
    id: "walk-start",
    label: "Walk start",
    category: "Locomotion",
    keys: [],
    duration: 0.52,
    loop: false,
    description: "Falls forward from the ankles, releases the rear foot, and establishes cadence.",
    fadeIn: 0.1,
    fadeOut: 0.12,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 1.18,
    showInDeck: true,
    events: []
  },
  {
    id: "walk",
    label: "Walk forward",
    category: "Locomotion",
    keys: ["W"],
    duration: 1.04,
    loop: true,
    description: "Eight-phase forward gait with foot roll, pelvis transfer, and opposing arm swing.",
    fadeIn: 0.14,
    fadeOut: 0.14,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 1.18,
    showInDeck: true,
    events: []
  },
  {
    id: "walk-stop",
    label: "Walk stop",
    category: "Locomotion",
    keys: [],
    duration: 0.48,
    loop: false,
    description: "Shortens the final step, absorbs momentum, and settles over one foot.",
    fadeIn: 0.08,
    fadeOut: 0.2,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 0.55,
    showInDeck: true,
    events: []
  },
  {
    id: "walk-backward",
    label: "Walk backward",
    category: "Locomotion",
    keys: ["S"],
    duration: 1.18,
    loop: true,
    description: "Cautious toe-first retreat with the chest guarding forward and shorter steps.",
    fadeIn: 0.16,
    fadeOut: 0.16,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 0.82,
    showInDeck: true,
    events: []
  },
  {
    id: "strafe-left",
    label: "Strafe left",
    category: "Locomotion",
    keys: ["A"],
    duration: 1.08,
    loop: true,
    description: "Leftward combat step with lateral push, crossover avoidance, and level guard.",
    fadeIn: 0.15,
    fadeOut: 0.15,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 0.92,
    showInDeck: true,
    events: []
  },
  {
    id: "strafe-right",
    label: "Strafe right",
    category: "Locomotion",
    keys: ["D"],
    duration: 1.08,
    loop: true,
    description: "Mirrored rightward combat step with the pelvis held over the supporting foot.",
    fadeIn: 0.15,
    fadeOut: 0.15,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 0.92,
    showInDeck: true,
    events: []
  },
  {
    id: "run-start",
    label: "Run start",
    category: "Locomotion",
    keys: [],
    duration: 0.46,
    loop: false,
    description: "Drops the center of mass and drives through the first accelerating step.",
    fadeIn: 0.08,
    fadeOut: 0.1,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 2.45,
    showInDeck: true,
    events: []
  },
  {
    id: "run",
    label: "Run",
    category: "Locomotion",
    keys: ["Shift", "W"],
    duration: 0.72,
    loop: true,
    description: "Forward-leaning run with flight phases, compact arm drive, and hip counterrotation.",
    fadeIn: 0.12,
    fadeOut: 0.12,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 2.45,
    showInDeck: true,
    events: []
  },
  {
    id: "run-stop",
    label: "Run stop",
    category: "Locomotion",
    keys: [],
    duration: 0.64,
    loop: false,
    description: "Braking steps lower the hips before the chest catches up and settles.",
    fadeIn: 0.08,
    fadeOut: 0.2,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 1.1,
    showInDeck: true,
    events: []
  },
  {
    id: "turn-left",
    label: "Turn left",
    category: "Locomotion",
    keys: ["Z"],
    duration: 0.68,
    loop: false,
    description: "Plants the left foot, opens the pelvis, then lets the shoulders and head arrive.",
    fadeIn: 0.1,
    fadeOut: 0.18,
    cooldown: 0.18,
    movementScale: 0,
    showInDeck: true,
    events: []
  },
  {
    id: "turn-right",
    label: "Turn right",
    category: "Locomotion",
    keys: ["X"],
    duration: 0.68,
    loop: false,
    description: "Mirrored pivot led by the supporting foot and pelvis rather than the shoulders.",
    fadeIn: 0.1,
    fadeOut: 0.18,
    cooldown: 0.18,
    movementScale: 0,
    showInDeck: true,
    events: []
  },
  {
    id: "jump-launch",
    label: "Jump launch",
    category: "Airborne",
    keys: ["Space"],
    duration: 0.46,
    loop: false,
    description: "Two-stage crouch, backward arm load, and coordinated ankle-knee-hip extension.",
    fadeIn: 0.06,
    fadeOut: 0.08,
    cooldown: 0.32,
    movementScale: 0.5,
    showInDeck: true,
    events: [{ at: 0.36, type: "jump-launch" }]
  },
  {
    id: "jump-air",
    label: "Vertical jump flight",
    category: "Airborne",
    keys: [],
    duration: 0.66,
    loop: false,
    description: "Straight rising line, overhead reach, relaxed apex, and controlled landing preparation.",
    fadeIn: 0.06,
    fadeOut: 0.06,
    cooldown: 0,
    movementScale: 0,
    showInDeck: true,
    events: []
  },
  {
    id: "running-leap",
    label: "Running leap",
    category: "Airborne",
    keys: ["Shift", "Space"],
    duration: 1.42,
    loop: false,
    description: "Long final stride, one-foot drive, split flight, lead-foot landing, and run-through recovery.",
    fadeIn: 0.05,
    fadeOut: 0.1,
    cooldown: 0.5,
    movementScale: 0,
    travelSpeed: 2.06,
    showInDeck: true,
    events: [{ at: 0.4, type: "jump-launch" }, { at: 1.09, type: "jump-land" }]
  },
  {
    id: "airborne",
    label: "Airborne loop",
    category: "Airborne",
    keys: [],
    duration: 0.86,
    loop: true,
    description: "Asymmetrical tuck, apex relaxation, and feet reaching toward the floor.",
    fadeIn: 0.08,
    fadeOut: 0.08,
    cooldown: 0,
    movementScale: 0.5,
    showInDeck: true,
    events: []
  },
  {
    id: "surface-swim",
    label: "Surface swim",
    category: "Swimming",
    keys: ["W"],
    duration: 1.6,
    loop: true,
    description: "Depth-gated freestyle with alternating reach, pull, recovery, body roll, and flutter kick.",
    fadeIn: 0.24,
    fadeOut: 0.22,
    cooldown: 0,
    movementScale: 1,
    travelSpeed: 1.35,
    showInDeck: true,
    events: []
  },
  {
    id: "tread-water",
    label: "Tread water",
    category: "Swimming",
    keys: [],
    duration: 2.4,
    loop: true,
    description: "Stationary deep-water support with sculling hands and alternating compact kicks.",
    fadeIn: 0.22,
    fadeOut: 0.22,
    cooldown: 0,
    movementScale: 0,
    showInDeck: true,
    events: []
  },
  {
    id: "land-soft",
    label: "Soft landing",
    category: "Airborne",
    keys: [],
    duration: 0.72,
    loop: false,
    description: "Foot contact, deep knee absorption, delayed torso follow-through, and quiet recovery.",
    fadeIn: 0.05,
    fadeOut: 0.2,
    cooldown: 0.18,
    movementScale: 0.2,
    showInDeck: true,
    events: [{ at: 0.06, type: "jump-land" }]
  },
  {
    id: "land-hard",
    label: "Hard landing",
    category: "Airborne",
    keys: [],
    duration: 0.92,
    loop: false,
    description: "Deep impact compression with delayed chest, arm, and head follow-through.",
    fadeIn: 0.04,
    fadeOut: 0.26,
    cooldown: 0.38,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.09, type: "jump-land" }]
  },
  {
    id: "dodge",
    label: "Dodge",
    category: "Airborne",
    keys: ["C"],
    duration: 0.62,
    loop: false,
    description: "Loads the opposite leg, drives laterally, and leaves a readable recovery.",
    fadeIn: 0.05,
    fadeOut: 0.14,
    cooldown: 0.65,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.08, type: "dodge-start" }]
  },
  {
    id: "light-attack",
    label: "Light attack",
    category: "Weapon",
    keys: ["F"],
    duration: 0.72,
    loop: false,
    description: "Fast hip-led cut with a compact windup, contact frame, follow-through, and recovery.",
    fadeIn: 0.06,
    fadeOut: 0.16,
    cooldown: 0.38,
    movementScale: 0.16,
    showInDeck: true,
    events: [{ at: 0.28, type: "swing-trail" }, { at: 0.45, type: "swing-impact" }]
  },
  {
    id: "heavy-attack",
    label: "Heavy attack",
    category: "Weapon",
    keys: ["G"],
    duration: 1.34,
    loop: false,
    description: "Long weight transfer into a committed diagonal strike with vulnerable recovery.",
    fadeIn: 0.08,
    fadeOut: 0.24,
    cooldown: 0.92,
    movementScale: 0.08,
    showInDeck: true,
    events: [{ at: 0.55, type: "swing-trail" }, { at: 0.78, type: "swing-impact" }]
  },
  {
    id: "two-handed-strike",
    label: "Two-handed overhead strike",
    category: "Weapon",
    keys: ["R"],
    duration: 1.62,
    loop: false,
    description: "Loads the rear leg, raises both hands overhead, cuts through a braced impact, and recovers under control.",
    fadeIn: 0.08,
    fadeOut: 0.24,
    cooldown: 1.05,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.64, type: "swing-trail" }, { at: 0.82, type: "swing-impact" }]
  },
  {
    id: "cast",
    label: "Spell cast",
    category: "Magic",
    keys: ["E"],
    duration: 1.25,
    loop: false,
    description: "Circles one orb with both hands, then pushes it forward from a lightly bent stance.",
    fadeIn: 0.1,
    fadeOut: 0.2,
    cooldown: 0.85,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.24, type: "cast-gather" }, { at: 0.78, type: "cast-release" }]
  },
  {
    id: "fireball",
    label: "Fireball",
    category: "Magic",
    keys: ["3"],
    duration: SPELL_MOTIONS.fireball.duration,
    loop: false,
    description: "Steps back to gather power between both hands, then drives one fireball forward.",
    fadeIn: 0.07,
    fadeOut: 0.16,
    cooldown: 0.82,
    movementScale: 0,
    showInDeck: true,
    events: [
      { at: SPELL_MOTIONS.fireball.gather, type: "cast-gather" },
      { at: SPELL_MOTIONS.fireball.release[0], type: "cast-release" }
    ]
  },
  {
    id: "lightning",
    label: "Lightning",
    category: "Magic",
    keys: ["4"],
    duration: SPELL_MOTIONS.lightning.duration,
    loop: false,
    description: "Raises both arms to charge overhead, then directs the strike down and forward.",
    fadeIn: 0.08,
    fadeOut: 0.18,
    cooldown: 0.88,
    movementScale: 0,
    showInDeck: true,
    events: [
      { at: SPELL_MOTIONS.lightning.gather, type: "cast-gather" },
      { at: SPELL_MOTIONS.lightning.release[0], type: "cast-release" }
    ]
  },
  {
    id: "energy-missiles",
    label: "Energy missiles",
    category: "Magic",
    keys: ["5"],
    duration: SPELL_MOTIONS["energy-missiles"].duration,
    loop: false,
    description: "Fires three quick alternating palm strikes from a compact casting guard.",
    fadeIn: 0.05,
    fadeOut: 0.13,
    cooldown: 0.82,
    movementScale: 0,
    showInDeck: true,
    events: [
      { at: SPELL_MOTIONS["energy-missiles"].gather, type: "cast-gather" },
      ...SPELL_MOTIONS["energy-missiles"].release.map((at) => ({ at, type: "cast-release" }))
    ]
  },
  {
    id: "healing",
    label: "Healing",
    category: "Magic",
    keys: ["6"],
    duration: SPELL_MOTIONS.healing.duration,
    loop: false,
    description: "Raises open hands, gathers energy at the heart, and extends both palms outward.",
    fadeIn: 0.1,
    fadeOut: 0.22,
    cooldown: 1.12,
    movementScale: 0,
    showInDeck: true,
    events: [
      { at: SPELL_MOTIONS.healing.gather, type: "cast-gather" },
      { at: SPELL_MOTIONS.healing.release[0], type: "cast-release" }
    ]
  },
  {
    id: "whirlwind",
    label: "Whirlwind",
    category: "Weapon",
    keys: ["Q"],
    duration: WHIRLWIND_TIMING.duration,
    loop: false,
    description: "Compresses into a quick sword sweep, completes a full turn, and plants before recovering.",
    fadeIn: WHIRLWIND_TIMING.fadeIn,
    fadeOut: WHIRLWIND_TIMING.fadeOut,
    cooldown: WHIRLWIND_TIMING.cooldown,
    movementScale: 0,
    showInDeck: true,
    events: [
      { at: WHIRLWIND_TIMING.windupEnd, type: "whirlwind-start" },
      { at: WHIRLWIND_TIMING.firstCut, type: "whirlwind-pulse" },
      { at: WHIRLWIND_TIMING.finalCut, type: "whirlwind-pulse" }
    ]
  },
  {
    id: "jump",
    label: "Standing jump",
    category: "Airborne",
    keys: ["J"],
    duration: JUMP_ARC_DURATION,
    loop: false,
    description: "The whole standing jump in one clip: crouch, drive, flight, and a landing the knees absorb.",
    fadeIn: 0.06,
    fadeOut: 0.18,
    cooldown: 0.34,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.36, type: "jump-launch" }, { at: JUMP_ARC_LAND_EVENT, type: "jump-land" }]
  },
  {
    id: "die",
    label: "Death",
    category: "Reaction",
    keys: ["K"],
    duration: 1.4,
    loop: false,
    description: "A hit throws the chest back, the knees give, the body lands on its back, and the head arrives last.",
    fadeIn: 0.05,
    fadeOut: 0.3,
    cooldown: 0.5,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.07, type: "hit-react" }]
  },
  {
    id: "hit",
    label: "Hit reaction",
    category: "Reaction",
    keys: ["H"],
    duration: 0.5,
    loop: false,
    description: "Directional recoil travels from the hips through the spine, head, and hands.",
    fadeIn: 0.035,
    fadeOut: 0.13,
    cooldown: 0.2,
    movementScale: 0,
    showInDeck: true,
    events: [{ at: 0.05, type: "hit-react" }]
  }
];
var MOVE_BY_ID = new Map(
  MOVE_CATALOG.map((move) => [move.id, move])
);

// studio/src/animation/createProceduralClips.ts
import * as THREE2 from "three";

// studio/src/animation/recipes/gaitMechanics.ts
function relaxedWalkArms(swingDegrees, elbowFlexDegrees, shoulderLiftDegrees) {
  return {
    LeftShoulder: rotation(0.4 + shoulderLiftDegrees, 0, -1.6),
    RightShoulder: rotation(0.2 + shoulderLiftDegrees, 0, 1.35),
    LeftArm: rotation(-23.5, -2, swingDegrees),
    RightArm: rotation(-24.5, 3, swingDegrees),
    LeftForeArm: rotation(0, -6, -elbowFlexDegrees),
    RightForeArm: rotation(0, 6, elbowFlexDegrees)
  };
}
function compactRunArms(swingDegrees, elbowFlexDegrees = 56, shoulderLiftDegrees = 0) {
  return {
    LeftShoulder: rotation(shoulderLiftDegrees, 0, -1.5),
    RightShoulder: rotation(shoulderLiftDegrees, 0, 1.5),
    LeftArm: rotation(-22, -2, swingDegrees),
    RightArm: rotation(-22, 3, swingDegrees),
    LeftForeArm: rotation(0, -8, -elbowFlexDegrees),
    RightForeArm: rotation(0, 9, elbowFlexDegrees)
  };
}

// studio/src/animation/recipes/airborneRecipes.ts
var AIRBORNE_RECIPES = [
  ...STANDING_JUMP_RECIPES,
  {
    id: "running-leap",
    basePose: "relaxed",
    frames: [
      {
        time: 0,
        rotations: {
          Hips: rotation(5, -4, -1.5),
          Spine: rotation(-3, 2, 0.7),
          Spine1: rotation(10, 3, -1),
          Spine2: rotation(-1, 2, 0.4),
          Head: rotation(-2, 1, 0),
          LeftUpLeg: rotation(38),
          RightUpLeg: rotation(-31),
          LeftLeg: rotation(-15),
          RightLeg: rotation(-55),
          LeftFoot: rotation(-8),
          RightFoot: rotation(15),
          ...compactRunArms(26)
        },
        positions: { Hips: [8e-3, 4e-3, -0.025] }
      },
      {
        time: 0.16,
        rotations: {
          Hips: rotation(9, 2, 1.2),
          Spine: rotation(-2, -1, -0.4),
          Spine1: rotation(13, -2, 0.8),
          Spine2: rotation(-1, -2, -0.2),
          Head: rotation(-3, 0, 0),
          LeftUpLeg: rotation(-24),
          RightUpLeg: rotation(34),
          LeftLeg: rotation(-52),
          RightLeg: rotation(-18),
          LeftFoot: rotation(14),
          RightFoot: rotation(-9),
          ...compactRunArms(-30, 58)
        },
        positions: { Hips: [-6e-3, -0.035, -0.045] }
      },
      {
        time: 0.235,
        rotations: {
          Hips: rotation(11, 0, 0),
          Spine: rotation(-4, 0, 0),
          Spine1: rotation(14, 0, 0),
          Spine2: rotation(-1.5, 0, 0),
          Head: rotation(-3.5),
          LeftUpLeg: rotation(15),
          RightUpLeg: rotation(23),
          LeftLeg: rotation(-66),
          RightLeg: rotation(-12),
          LeftFoot: rotation(12),
          RightFoot: rotation(-14),
          RightToeBase: rotation(6),
          ...compactRunArms(4, 52)
        },
        positions: { Hips: [0, 0, -0.05] }
      },
      {
        time: 0.31,
        rotations: {
          Hips: rotation(12, -2, -1.1),
          Spine: rotation(-5, 1, 0.5),
          Spine1: rotation(15, 2, -0.8),
          Spine2: rotation(-2, 1, 0.4),
          Head: rotation(-4, 1, 0),
          LeftUpLeg: rotation(54),
          RightUpLeg: rotation(12.5),
          LeftLeg: rotation(-72),
          RightLeg: rotation(-8),
          LeftFoot: rotation(10),
          RightFoot: rotation(-18),
          RightToeBase: rotation(10),
          ...compactRunArms(42, 42)
        },
        positions: { Hips: [6e-3, 0.015, -0.05] }
      },
      {
        time: 0.43,
        rotations: {
          Hips: rotation(8, -1, -0.7),
          Spine: rotation(-7, 1, 0.4),
          Spine1: rotation(12, 2, -0.6),
          Spine2: rotation(-3, 1, 0.3),
          Head: rotation(-4, 1, 0),
          LeftUpLeg: rotation(68),
          RightUpLeg: rotation(-27),
          LeftLeg: rotation(-86),
          RightLeg: rotation(-10),
          LeftFoot: rotation(5),
          RightFoot: rotation(-20),
          RightToeBase: rotation(14),
          ...compactRunArms(52, 34)
        },
        positions: { Hips: [6e-3, 0.12, -0.035] }
      },
      {
        time: 0.61,
        rotations: {
          Hips: rotation(5, -1, -0.5),
          Spine: rotation(-6, 1, 0.3),
          Spine1: rotation(10, 1, -0.4),
          Spine2: rotation(-3, 1, 0.2),
          Head: rotation(-3, 1, 0),
          LeftUpLeg: rotation(68),
          RightUpLeg: rotation(-34),
          LeftLeg: rotation(-70),
          RightLeg: rotation(-15),
          LeftFoot: rotation(1),
          RightFoot: rotation(-16),
          ...compactRunArms(58, 28)
        },
        positions: { Hips: [4e-3, 0.29, -0.015] }
      },
      {
        time: 0.78,
        rotations: {
          Hips: rotation(3, 0, -0.2),
          Spine: rotation(-4, 0, 0.2),
          Spine1: rotation(8, 0, -0.3),
          Spine2: rotation(-2, 0, 0.1),
          Head: rotation(-2, 0, 0),
          LeftUpLeg: rotation(48),
          RightUpLeg: rotation(-44),
          LeftLeg: rotation(-14),
          RightLeg: rotation(-12),
          LeftFoot: rotation(-8),
          RightFoot: rotation(-12),
          ...compactRunArms(60, 24)
        },
        positions: { Hips: [0, 0.36, 5e-3] }
      },
      {
        time: 0.95,
        rotations: {
          Hips: rotation(6, 0, 0.1),
          Spine: rotation(-2, 0, 0.1),
          Spine1: rotation(10, 0, -0.2),
          Spine2: rotation(-1, 0, 0.1),
          Head: rotation(-1, 0, 0),
          LeftUpLeg: rotation(35),
          RightUpLeg: rotation(-28),
          LeftLeg: rotation(-8),
          RightLeg: rotation(-26),
          LeftFoot: rotation(-12),
          RightFoot: rotation(-4),
          ...compactRunArms(52, 30)
        },
        positions: { Hips: [-4e-3, 0.25, 0.018] }
      },
      {
        time: 1.09,
        rotations: {
          Hips: rotation(11, 1, 0.7),
          Spine: rotation(2, -1, -0.3),
          Spine1: rotation(14, -1, 0.5),
          Spine2: rotation(2, -1, -0.2),
          Head: rotation(-4, 0, 0),
          LeftUpLeg: rotation(24),
          RightUpLeg: rotation(-15),
          LeftLeg: rotation(-16),
          RightLeg: rotation(-40),
          LeftFoot: rotation(8),
          RightFoot: rotation(8),
          ...compactRunArms(38, 42)
        },
        positions: { Hips: [-6e-3, 0.07, 0.025] }
      },
      {
        time: 1.21,
        rotations: {
          Hips: rotation(18, 1, 0.8),
          Spine: rotation(8, -1, -0.4),
          Spine1: rotation(19, -1, 0.6),
          Spine2: rotation(6, -1, -0.3),
          Head: rotation(-7, 0, 0),
          LeftUpLeg: rotation(48),
          RightUpLeg: rotation(12),
          LeftLeg: rotation(-78),
          RightLeg: rotation(-52),
          LeftFoot: rotation(15),
          RightFoot: rotation(12),
          ...compactRunArms(7, 62)
        },
        positions: { Hips: [-8e-3, -0.12, -0.02] }
      },
      {
        time: 1.3,
        rotations: {
          Hips: rotation(12, 2.3, 1.1),
          Spine: rotation(3.3, -1.4, -0.5),
          Spine1: rotation(15, -1.9, 0.8),
          Spine2: rotation(3, -1.4, 0),
          Head: rotation(-5, -0.4, 0),
          LeftUpLeg: rotation(14),
          RightUpLeg: rotation(23),
          LeftLeg: rotation(-68),
          RightLeg: rotation(-36),
          LeftFoot: rotation(15),
          RightFoot: rotation(3),
          RightToeBase: rotation(8),
          ...compactRunArms(-7, 59)
        },
        positions: { Hips: [-8e-3, -0.03, -0.022] }
      },
      {
        time: 1.42,
        rotations: {
          Hips: rotation(4, 4, 1.5),
          Spine: rotation(-3, -2, -0.7),
          Spine1: rotation(10, -3, 1),
          Spine2: rotation(-1, -2, 0.4),
          Head: rotation(-2, -1, 0),
          LeftUpLeg: rotation(-31),
          RightUpLeg: rotation(38),
          LeftLeg: rotation(-55),
          RightLeg: rotation(-15),
          LeftFoot: rotation(15),
          RightFoot: rotation(-8),
          ...compactRunArms(-26)
        },
        positions: { Hips: [-8e-3, 4e-3, -0.025] }
      }
    ]
  },
  {
    id: "airborne",
    basePose: "airborne",
    frames: [
      { time: 0 },
      {
        time: 0.2,
        rotations: {
          Hips: rotation(-1, 0, -1.4),
          Spine1: rotation(1.5, 0.8, -0.8),
          Head: rotation(0, 2, -0.4),
          LeftUpLeg: rotation(27, -1, 2.5),
          RightUpLeg: rotation(24, 2, -1.8),
          LeftLeg: rotation(-51),
          RightLeg: rotation(-47),
          LeftFoot: rotation(-5),
          RightFoot: rotation(0),
          LeftArm: rotation(-12, 0, 13),
          RightArm: rotation(-11, 0, -9)
        },
        positions: { Hips: [-8e-3, 0.345, 0.015] }
      },
      {
        time: 0.43,
        rotations: {
          Hips: rotation(0, -1, -0.6),
          Spine: rotation(0, 0, 0.2),
          Spine1: rotation(1, -0.5, -0.2),
          Head: rotation(2, -1, 0.2),
          LeftUpLeg: rotation(18, -1, 1),
          RightUpLeg: rotation(21, 1, -1),
          LeftLeg: rotation(-34),
          RightLeg: rotation(-40),
          LeftFoot: rotation(-1),
          RightFoot: rotation(1),
          LeftArm: rotation(-7, 0, 10),
          RightArm: rotation(-9, 0, -8)
        },
        positions: { Hips: [4e-3, 0.36, 0.018] }
      },
      {
        time: 0.65,
        rotations: {
          Hips: rotation(1, 1, 0.8),
          Spine: rotation(2, -0.5, -0.4),
          Spine1: rotation(4, 0, 0.5),
          Head: rotation(-2, 0, 0),
          LeftUpLeg: rotation(12, -1, 1),
          RightUpLeg: rotation(15, 1, -1),
          LeftLeg: rotation(-24),
          RightLeg: rotation(-29),
          LeftFoot: rotation(5),
          RightFoot: rotation(6),
          LeftArm: rotation(2, 0, 12),
          RightArm: rotation(0, 0, -11)
        },
        positions: { Hips: [0, 0.32, 0.023] }
      },
      { time: 0.86 }
    ]
  },
  {
    id: "land-hard",
    basePose: "relaxed",
    frames: [
      {
        time: 0,
        rotations: {
          Hips: rotation(2, 0, 0),
          Spine: rotation(3, 0, 0),
          Spine1: rotation(5, 0, 0),
          LeftUpLeg: rotation(15),
          RightUpLeg: rotation(17),
          LeftLeg: rotation(-28),
          RightLeg: rotation(-33),
          LeftFoot: rotation(8),
          RightFoot: rotation(8),
          LeftArm: rotation(5, 0, 16),
          RightArm: rotation(2, 0, -14)
        },
        positions: { Hips: [0, 0.18, 0.03] }
      },
      {
        time: 0.09,
        rotations: {
          Hips: rotation(14, 0, -2),
          Spine: rotation(11, 0, 1.5),
          Spine1: rotation(18, 0, -2),
          Spine2: rotation(11, 0, -1),
          Head: rotation(-10),
          LeftUpLeg: rotation(44),
          RightUpLeg: rotation(47),
          LeftLeg: rotation(-89),
          RightLeg: rotation(-94),
          LeftFoot: rotation(13),
          RightFoot: rotation(13),
          LeftArm: rotation(27, 0, 23),
          RightArm: rotation(23, 0, -21)
        },
        positions: { Hips: [-0.012, -0.23, 0.06] }
      },
      {
        time: 0.24,
        rotations: {
          Hips: rotation(10, 0, -2.5),
          Spine: rotation(16, 0, 2),
          Spine1: rotation(21, 0, -2.5),
          Spine2: rotation(15, 0, -1),
          Head: rotation(-15),
          LeftUpLeg: rotation(38),
          RightUpLeg: rotation(41),
          LeftLeg: rotation(-78),
          RightLeg: rotation(-83),
          LeftArm: rotation(19, 0, 19),
          RightArm: rotation(17, 0, -18)
        },
        positions: { Hips: [-0.018, -0.19, 0.052] }
      },
      {
        time: 0.45,
        rotations: {
          Hips: rotation(5, 1, -1.8),
          Spine: rotation(8, 0, 1),
          Spine1: rotation(11, 0, -1.3),
          Head: rotation(-5),
          LeftUpLeg: rotation(25),
          RightUpLeg: rotation(29),
          LeftLeg: rotation(-52),
          RightLeg: rotation(-59),
          LeftArm: rotation(9, 0, 12),
          RightArm: rotation(7, 0, -13)
        },
        positions: { Hips: [-0.014, -0.11, 0.025] }
      },
      { time: 0.7, rotations: { Hips: rotation(1, 1, -1.3), Spine1: rotation(4, 0, -0.8), LeftUpLeg: rotation(11), RightUpLeg: rotation(15), LeftLeg: rotation(-22), RightLeg: rotation(-29) }, positions: { Hips: [-0.011, -0.042, 8e-3] } },
      { time: 0.92 }
    ]
  },
  {
    id: "dodge",
    basePose: "combat",
    frames: [
      { time: 0 },
      {
        time: 0.09,
        rotations: {
          Hips: rotation(3, -5, 7),
          Spine: rotation(4, 3, -4),
          Spine1: rotation(9, 5, -8),
          LeftUpLeg: rotation(28, -3, 8),
          RightUpLeg: rotation(15, 4, -5),
          LeftLeg: rotation(-55),
          RightLeg: rotation(-31),
          LeftFoot: rotation(7, 0, -5),
          LeftArm: rotation(-13, -5, 20),
          RightArm: rotation(-22, 8, -18),
          Head: rotation(-2, -5, 4)
        },
        positions: { Hips: [0.05, -0.12, -0.035] }
      },
      {
        time: 0.19,
        rotations: {
          Hips: rotation(-2, 6, -10),
          Spine: rotation(-2, -4, 6),
          Spine1: rotation(3, -7, 10),
          LeftUpLeg: rotation(9, -5, -8),
          RightUpLeg: rotation(31, 6, 11),
          LeftLeg: rotation(-20),
          RightLeg: rotation(-61),
          LeftFoot: rotation(-5, 0, 7),
          RightFoot: rotation(10, 0, -8),
          LeftArm: rotation(-24, -5, 13),
          RightArm: rotation(-13, 8, -27),
          Head: rotation(-3, 8, -5)
        },
        positions: { Hips: [-0.085, -0.07, 6e-3] }
      },
      {
        time: 0.34,
        rotations: {
          Hips: rotation(1, 3, -4),
          Spine: rotation(2, -2, 2),
          Spine1: rotation(6, -3, 4),
          LeftUpLeg: rotation(13, -3, -1),
          RightUpLeg: rotation(22, 4, 5),
          LeftLeg: rotation(-27),
          RightLeg: rotation(-45),
          LeftArm: rotation(-19, -6, 17),
          RightArm: rotation(-18, 8, -23),
          Head: rotation(-2, 3, -2)
        },
        positions: { Hips: [-0.044, -0.085, 0] }
      },
      { time: 0.5, rotations: { Hips: rotation(0, -2, -2), Spine1: rotation(4, 2, -2), LeftUpLeg: rotation(12), RightUpLeg: rotation(18), LeftLeg: rotation(-24), RightLeg: rotation(-37) }, positions: { Hips: [-0.028, -0.066, -0.02] } },
      { time: 0.62 }
    ]
  }
];

// studio/src/animation/recipes/deathRecipe.ts
var DEATH_RECIPE = {
  id: "die",
  basePose: "relaxed",
  frames: [
    { time: 0 },
    {
      // The hit lands. Everything above the belt is thrown backward at once.
      time: 0.07,
      rotations: {
        Hips: rotation(-8, 1, 2),
        Spine: rotation(-6, 1, -1),
        Spine1: rotation(-7, 1, 1.5),
        Spine2: rotation(-4, 1, 0.5),
        Neck: rotation(-9, -1, 0),
        Head: rotation(-13, -2, 0),
        LeftShoulder: rotation(1, 0, -3),
        RightShoulder: rotation(1, 0, 2.5),
        LeftArm: rotation(-19, -3, -21),
        RightArm: rotation(-20, 4, 23),
        LeftForeArm: rotation(0, -5, -26),
        RightForeArm: rotation(0, 5, 29),
        LeftUpLeg: rotation(-4, -1, 2),
        RightUpLeg: rotation(-3, 1, -2),
        LeftLeg: rotation(-5),
        RightLeg: rotation(-7),
        LeftFoot: rotation(6),
        RightFoot: rotation(7)
      },
      positions: { Hips: [4e-3, -8e-3, -0.05] }
    },
    {
      // Weight rolls onto the heels and the recoil reaches its limit.
      time: 0.17,
      rotations: {
        Hips: rotation(-12, 2, 3.5),
        Spine: rotation(-8, 2, -1.6),
        Spine1: rotation(-10, 2, 2.4),
        Spine2: rotation(-6, 1, 0.8),
        Neck: rotation(-4, -2, 0.5),
        Head: rotation(-6, -3, 0.5),
        LeftArm: rotation(-17, -3, -33),
        RightArm: rotation(-18, 4, 35),
        LeftForeArm: rotation(0, -6, -41),
        RightForeArm: rotation(0, 6, 45),
        LeftUpLeg: rotation(-7, -1, 3),
        RightUpLeg: rotation(-6, 1, -3),
        LeftLeg: rotation(-7),
        RightLeg: rotation(-9),
        LeftFoot: rotation(9),
        RightFoot: rotation(10)
      },
      positions: { Hips: [8e-3, -0.02, -0.096] }
    },
    {
      // The knees give. The pelvis folds forward while it drops.
      time: 0.32,
      rotations: {
        Hips: rotation(4, 3, 4),
        Spine: rotation(3, 2, -2),
        Spine1: rotation(6, 2, 3),
        Spine2: rotation(4, 1, 1),
        Neck: rotation(6, -2, 0.5),
        Head: rotation(9, -3, 0.5),
        LeftArm: rotation(-14, -3, -38),
        RightArm: rotation(-15, 4, 40),
        LeftForeArm: rotation(0, -7, -52),
        RightForeArm: rotation(0, 7, 56),
        LeftUpLeg: rotation(46.1, -2, 5),
        RightUpLeg: rotation(47.1, 2, -4),
        LeftLeg: rotation(-74.1),
        RightLeg: rotation(-77.6),
        LeftFoot: rotation(24.2),
        RightFoot: rotation(27.5)
      },
      positions: { Hips: [0.012, -0.17, -0.145] }
    },
    {
      // Nothing is holding the body up any more.
      time: 0.47,
      rotations: {
        Hips: rotation(-7, 3, 4),
        Spine: rotation(6, 2, -2),
        Spine1: rotation(9, 2, 3),
        Spine2: rotation(6, 1, 1),
        Neck: rotation(11, -2, 0.5),
        Head: rotation(15, -3, 0.5),
        LeftArm: rotation(-8, -3, -24),
        RightArm: rotation(-9, 4, 26),
        LeftForeArm: rotation(0, -8, -46),
        RightForeArm: rotation(0, 8, 50),
        LeftUpLeg: rotation(75.9, -3, 7),
        RightUpLeg: rotation(76.3, 3, -6),
        LeftLeg: rotation(-117.6),
        RightLeg: rotation(-119.6),
        LeftFoot: rotation(27.4),
        RightFoot: rotation(29.6)
      },
      positions: { Hips: [0.016, -0.4, -0.206] }
    },
    {
      // The seat reaches the ground and the legs give up their fold.
      time: 0.63,
      rotations: {
        Hips: rotation(-33, 3, 3.5),
        Spine: rotation(9, 2, -1.8),
        Spine1: rotation(12, 2, 2.6),
        Spine2: rotation(8, 1, 0.9),
        Neck: rotation(14, -2, 0.5),
        Head: rotation(19, -3, 0.5),
        LeftArm: rotation(-4, -3, -10),
        RightArm: rotation(-5, 4, 12),
        LeftForeArm: rotation(0, -8, -38),
        RightForeArm: rotation(0, 8, 41),
        LeftUpLeg: rotation(99.4, -4, 9),
        RightUpLeg: rotation(100, 4, -8),
        LeftLeg: rotation(-127.7),
        RightLeg: rotation(-129.3),
        LeftFoot: rotation(12),
        RightFoot: rotation(11)
      },
      positions: { Hips: [0.02, -0.62, -0.262] }
    },
    {
      // The back unrolls onto the floor, one vertebra at a time.
      time: 0.81,
      rotations: {
        Hips: rotation(-62, 2, 2.5),
        Spine: rotation(8, 1, -1.2),
        Spine1: rotation(10, 1, 1.8),
        Spine2: rotation(6, 1, 0.6),
        Neck: rotation(17, -2, 0.5),
        Head: rotation(22, -2, 0.5),
        LeftArm: rotation(2, -3, -2),
        RightArm: rotation(1, 4, 4),
        LeftForeArm: rotation(0, -8, -29),
        RightForeArm: rotation(0, 8, 32),
        LeftUpLeg: rotation(56.3, -5, 11),
        RightUpLeg: rotation(52.5, 5, -10),
        LeftLeg: rotation(-64.1),
        RightLeg: rotation(-57.5),
        LeftFoot: rotation(0),
        RightFoot: rotation(-2)
      },
      positions: { Hips: [0.022, -0.712, -0.298] }
    },
    {
      // The shoulders land. The head is still held off the ground.
      time: 0.99,
      rotations: {
        Hips: rotation(-84, 1, 1.5),
        Spine: rotation(4, 1, -0.7),
        Spine1: rotation(5, 1, 1),
        Spine2: rotation(3, 0, 0.3),
        Neck: rotation(18, -1, 0.5),
        Head: rotation(23, -2, 0.5),
        LeftArm: rotation(6, -3, 3),
        RightArm: rotation(5, 4, -2),
        LeftForeArm: rotation(0, -7, -20),
        RightForeArm: rotation(0, 7, 22),
        LeftUpLeg: rotation(29.2, -6, 12),
        RightUpLeg: rotation(29.5, 6, -11),
        LeftLeg: rotation(-49.5),
        RightLeg: rotation(-51.1),
        LeftFoot: rotation(-12),
        RightFoot: rotation(-14)
      },
      positions: { Hips: [0.022, -0.737, -0.311] }
    },
    {
      // The head is the last thing to arrive, and it arrives hard.
      time: 1.15,
      rotations: {
        Hips: rotation(-89, 0.5, 0.8),
        Spine: rotation(1.5, 0.5, -0.3),
        Spine1: rotation(2, 0.5, 0.4),
        Spine2: rotation(1, 0, 0.1),
        Neck: rotation(-4, -1, 0.5),
        Head: rotation(-7, -2, 0.5),
        LeftArm: rotation(8, -3, 6),
        RightArm: rotation(7, 4, -5),
        LeftForeArm: rotation(0, -6, -15),
        RightForeArm: rotation(0, 6, 17),
        LeftUpLeg: rotation(14.7, -7, 13),
        RightUpLeg: rotation(14.2, 7, -12),
        LeftLeg: rotation(-30.4),
        RightLeg: rotation(-30.4),
        LeftFoot: rotation(-22),
        RightFoot: rotation(-24)
      },
      positions: { Hips: [0.021, -0.743, -0.314] }
    },
    {
      // The last of the motion runs out through the hands and the ankles.
      time: 1.3,
      rotations: {
        Hips: rotation(-90, 0.3, 0.5),
        Spine: rotation(0.6, 0.3, -0.1),
        Spine1: rotation(0.8, 0.3, 0.2),
        Spine2: rotation(0.4, 0, 0),
        Neck: rotation(-2, -1, 0.5),
        Head: rotation(-3, -2, 0.5),
        LeftArm: rotation(10, -3, 7),
        RightArm: rotation(9, 4, -6),
        LeftForeArm: rotation(0, -5, -12),
        RightForeArm: rotation(0, 5, 14),
        LeftHand: rotation(0, 2, -6),
        RightHand: rotation(0, -2, 7),
        LeftUpLeg: rotation(11.3, -8, 14),
        RightUpLeg: rotation(10.6, 8, -13),
        LeftLeg: rotation(-25.5),
        RightLeg: rotation(-24.8),
        LeftFoot: rotation(-27),
        RightFoot: rotation(-29)
      },
      positions: { Hips: [0.021, -0.744, -0.315] }
    },
    {
      // Still. The clip clamps here.
      time: 1.4,
      rotations: {
        Hips: rotation(-90, 0.3, 0.5),
        Spine: rotation(0.6, 0.3, -0.1),
        Spine1: rotation(0.8, 0.3, 0.2),
        Spine2: rotation(0.4, 0, 0),
        Neck: rotation(-2, -1, 0.5),
        Head: rotation(-3, -2, 0.5),
        LeftArm: rotation(10, -3, 7),
        RightArm: rotation(9, 4, -6),
        LeftForeArm: rotation(0, -5, -12),
        RightForeArm: rotation(0, 5, 14),
        LeftHand: rotation(0, 2, -6),
        RightHand: rotation(0, -2, 7),
        LeftUpLeg: rotation(11.3, -8, 14),
        RightUpLeg: rotation(10.6, 8, -13),
        LeftLeg: rotation(-25.5),
        RightLeg: rotation(-24.8),
        LeftFoot: rotation(-27),
        RightFoot: rotation(-29)
      },
      positions: { Hips: [0.021, -0.744, -0.315] }
    }
  ]
};

// studio/src/animation/recipes/basePoses.ts
var relaxed = {
  rotations: {
    Hips: rotation(0, 1.5, -1.1),
    Spine: rotation(-1.2, -0.8, 0.55),
    Spine1: rotation(1.7, 0.55, -0.75),
    Spine2: rotation(-0.4, -1.25, 0.4),
    Neck: rotation(0.25, 0.55, -0.15),
    Head: rotation(-0.2, 1.15, -0.2),
    LeftShoulder: rotation(0.4, 0, -1.6),
    RightShoulder: rotation(0.2, 0, 1.35),
    LeftArm: rotation(-23.5, -2, 6.8),
    RightArm: rotation(-24.5, 3, -7.8),
    LeftForeArm: rotation(0, -4, -6),
    RightForeArm: rotation(0, 4, 7),
    LeftHand: rotation(0, 1.5, -1),
    RightHand: rotation(0, -1.2, 1.4),
    LeftUpLeg: rotation(3, -0.5, 1.2),
    RightUpLeg: rotation(4.4, 0.6, -1.1),
    LeftLeg: rotation(-6.5),
    RightLeg: rotation(-9),
    LeftFoot: rotation(2),
    RightFoot: rotation(2.8)
  },
  positions: { Hips: [-0.012, -0.018, 0] }
};
var combat = {
  rotations: {
    Hips: rotation(0, -5, -2.4),
    Spine: rotation(2.5, 2, 1.2),
    Spine1: rotation(4, 4, -1.4),
    Spine2: rotation(-1, 5, 0.7),
    Neck: rotation(-1, -2, 0),
    Head: rotation(-1, -4, 0.4),
    LeftShoulder: rotation(0, -2, -2.5),
    RightShoulder: rotation(0, 2, 2.5),
    LeftArm: rotation(-22, -7, 17),
    RightArm: rotation(-18, 9, -22),
    LeftForeArm: rotation(0, -8, -58),
    RightForeArm: rotation(0, 8, 64),
    LeftHand: rotation(3, 4, -2),
    RightHand: rotation(-2, -5, 2),
    LeftUpLeg: rotation(12, -3, 3),
    RightUpLeg: rotation(18, 4, -3),
    LeftLeg: rotation(-24),
    RightLeg: rotation(-36),
    LeftFoot: rotation(5),
    RightFoot: rotation(7)
  },
  positions: { Hips: [-0.025, -0.065, -0.028] }
};
var airborne = {
  rotations: {
    ...relaxed.rotations,
    Hips: rotation(-2, 1, -0.8),
    Spine: rotation(1, -0.5, 0.4),
    Spine1: rotation(2.5, 0.4, -0.5),
    LeftUpLeg: rotation(22, -1, 2),
    RightUpLeg: rotation(29, 2, -2),
    LeftLeg: rotation(-43),
    RightLeg: rotation(-54),
    LeftFoot: rotation(-3),
    RightFoot: rotation(2),
    LeftArm: rotation(-10, 0, 12),
    RightArm: rotation(-14, 0, -10),
    LeftForeArm: rotation(0, -6, -24),
    RightForeArm: rotation(0, 6, 29)
  },
  positions: { Hips: [0, 0.32, 0.012] }
};
var BASE_POSES = { relaxed, combat, airborne };

// studio/src/animation/recipes/spellcastingRecipe.ts
var SPELLCASTING_RECIPE = {
  id: "cast",
  basePose: "combat",
  frames: [
    { time: 0 },
    {
      time: 0.12,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(2, 2, 1),
        Spine1: rotation(3, 3, -1),
        Spine2: rotation(-1, 4, 1),
        Head: rotation(-1, -3, 0),
        LeftUpLeg: rotation(14, -3, 3),
        RightUpLeg: rotation(20, 4, -3),
        LeftLeg: rotation(-28),
        RightLeg: rotation(-40),
        LeftFoot: rotation(6),
        RightFoot: rotation(8),
        LeftArm: rotation(-20, -6, 20),
        RightArm: rotation(-20, 7, -21),
        LeftForeArm: rotation(0, -9, -68),
        RightForeArm: rotation(0, 9, 72)
      },
      positions: { Hips: [-0.025, -0.074, -0.028] }
    },
    {
      time: 0.24,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(3, 2, 1),
        Spine1: rotation(4, 3, -1),
        Spine2: rotation(-1, 4, 1),
        Head: rotation(-1, -3, 0),
        LeftUpLeg: rotation(16, -3, 3),
        RightUpLeg: rotation(22, 4, -3),
        LeftLeg: rotation(-31),
        RightLeg: rotation(-43),
        LeftFoot: rotation(7),
        RightFoot: rotation(9),
        LeftShoulder: rotation(0, -3, -3),
        RightShoulder: rotation(0, 3, 3),
        LeftArm: rotation(-18, -7, 24),
        RightArm: rotation(-18, 8, -25),
        LeftForeArm: rotation(0, -10, -78),
        RightForeArm: rotation(0, 10, 82),
        LeftHand: rotation(4, 8, -7),
        RightHand: rotation(-4, -8, 7)
      },
      positions: { Hips: [-0.025, -0.08, -0.028] }
    },
    {
      time: 0.42,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(3, 1, 1),
        Spine1: rotation(4, 2, -1),
        Spine2: rotation(-1, 3, 1),
        Head: rotation(-1, -2, 0),
        LeftUpLeg: rotation(16),
        RightUpLeg: rotation(22),
        LeftLeg: rotation(-31),
        RightLeg: rotation(-43),
        LeftArm: rotation(-12, -8, 22),
        RightArm: rotation(-24, 8, -24),
        LeftForeArm: rotation(0, -12, -60),
        RightForeArm: rotation(0, 12, 68),
        LeftHand: rotation(7, 12, -9),
        RightHand: rotation(-6, -10, 8)
      },
      positions: { Hips: [-0.025, -0.08, -0.028] }
    },
    {
      time: 0.58,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(3, 1, 1),
        Spine1: rotation(4, 2, -1),
        Spine2: rotation(-1, 3, 1),
        Head: rotation(-1, -2, 0),
        LeftUpLeg: rotation(16),
        RightUpLeg: rotation(22),
        LeftLeg: rotation(-31),
        RightLeg: rotation(-43),
        LeftArm: rotation(-24, -8, 22),
        RightArm: rotation(-12, 8, -24),
        LeftForeArm: rotation(0, -12, -68),
        RightForeArm: rotation(0, 12, 60),
        LeftHand: rotation(6, 10, -8),
        RightHand: rotation(-7, -12, 9)
      },
      positions: { Hips: [-0.025, -0.08, -0.028] }
    },
    {
      time: 0.72,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(2, 1, 1),
        Spine1: rotation(3, 2, -1),
        Spine2: rotation(-1, 2, 0),
        Head: rotation(-1, -1, 0),
        LeftUpLeg: rotation(15),
        RightUpLeg: rotation(21),
        LeftLeg: rotation(-29),
        RightLeg: rotation(-41),
        LeftArm: rotation(-16, -5, 18),
        RightArm: rotation(-16, 6, -19),
        LeftForeArm: rotation(0, -8, -58),
        RightForeArm: rotation(0, 8, 61)
      },
      positions: { Hips: [-0.025, -0.076, -0.028] }
    },
    {
      time: 0.78,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(1, 1, 0),
        Spine1: rotation(2, 1, 0),
        Spine2: rotation(-1, 2, 0),
        Head: rotation(0, -1, 0),
        LeftUpLeg: rotation(13),
        RightUpLeg: rotation(19),
        LeftLeg: rotation(-26),
        RightLeg: rotation(-38),
        LeftArm: rotation(0, -3, 12),
        RightArm: rotation(0, 3, -13),
        LeftForeArm: rotation(0, -5, -35),
        RightForeArm: rotation(0, 5, 38),
        LeftHand: rotation(2, 4, -3),
        RightHand: rotation(-2, -4, 3)
      },
      positions: { Hips: [-0.025, -0.07, -0.028] }
    },
    {
      time: 0.92,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(0, 1, 0),
        Spine1: rotation(1, 1, 0),
        Spine2: rotation(0, 1, 0),
        Head: rotation(0),
        LeftUpLeg: rotation(12),
        RightUpLeg: rotation(18),
        LeftLeg: rotation(-24),
        RightLeg: rotation(-36),
        LeftArm: rotation(12, -2, 8),
        RightArm: rotation(12, 2, -9),
        LeftForeArm: rotation(0, -3, -16),
        RightForeArm: rotation(0, 3, 18),
        LeftHand: rotation(-2, -2, 2),
        RightHand: rotation(2, 2, -2)
      },
      positions: { Hips: [-0.025, -0.065, -0.028] }
    },
    {
      time: 1.08,
      rotations: {
        Hips: rotation(0, -5, -2.4),
        Spine: rotation(2, 2, 1),
        Spine1: rotation(3, 3, -1),
        LeftUpLeg: rotation(13),
        RightUpLeg: rotation(19),
        LeftLeg: rotation(-26),
        RightLeg: rotation(-38),
        LeftArm: rotation(-13, -5, 15),
        RightArm: rotation(-13, 6, -16),
        LeftForeArm: rotation(0, -7, -48),
        RightForeArm: rotation(0, 7, 52)
      },
      positions: { Hips: [-0.025, -0.07, -0.028] }
    },
    { time: 1.25 }
  ]
};

// studio/src/animation/recipes/whirlwindRecipe.ts
var WHIRLWIND_DURATION = WHIRLWIND_TIMING.duration;
function spinFrame(time, yaw, hipsYaw, chestYaw, depth2, knees, extension, lean, side2) {
  const [leftKnee, rightKnee] = knees;
  return {
    time,
    rotations: {
      Root: rotation(0, yaw, 0),
      Hips: rotation(2, hipsYaw, side2 * 2),
      Spine: rotation(lean * 0.3, chestYaw * 0.25, -side2),
      Spine1: rotation(lean * 0.45, chestYaw * 0.4, side2 * 0.6),
      Spine2: rotation(lean * 0.25, chestYaw * 0.35, -side2 * 0.3),
      Head: rotation(-lean * 0.32, -chestYaw * 0.18, 0),
      LeftUpLeg: rotation(leftKnee * 0.46, -4, 4),
      RightUpLeg: rotation(rightKnee * 0.46, 4, -4),
      LeftLeg: rotation(-leftKnee),
      RightLeg: rotation(-rightKnee),
      LeftFoot: rotation(leftKnee * 0.18, 0, -2),
      RightFoot: rotation(rightKnee * 0.18, 0, 2),
      LeftShoulder: rotation(1, -3, -3),
      RightShoulder: rotation(-2, 4, 5),
      LeftArm: rotation(-20, -7, -38 + extension * 20),
      RightArm: rotation(5 + extension * 25, 7, 25 - extension * 17),
      LeftForeArm: rotation(0, -8, -76 - extension * 16),
      RightForeArm: rotation(0, 10, 78 - extension * 42),
      LeftHand: rotation(2, 4, -3),
      RightHand: rotation(-5, -7, 5)
    },
    positions: { Hips: [side2 * 0.015, -depth2, -0.025] }
  };
}
var frames = [
  spinFrame(0, 0, -5, 9, 0.075, [32, 40], 0.15, 8, -1),
  // Compress first. The blade stays close while the hips load against the chest.
  spinFrame(0.065, 0, -24, 33, 0.17, [74, 80], 0, 17, -1),
  spinFrame(WHIRLWIND_TIMING.windupEnd, 0, -27, 36, 0.175, [77, 82], 0, 18, -1),
  // Uneven angular spacing concentrates speed through the cutting arc.
  spinFrame(0.15, 24, 16, -20, 0.155, [71, 76], 0.55, 13, 1),
  spinFrame(0.22, 100, 12, -17, 0.15, [75, 69], 1, 12, -0.5),
  spinFrame(0.3, 195, -7, 9, 0.15, [69, 75], 1, 12, 0.5),
  spinFrame(0.38, 290, 7, -9, 0.15, [75, 69], 1, 12, -0.5),
  spinFrame(0.46, 346, 13, -18, 0.16, [76, 72], 0.85, 14, -1),
  spinFrame(WHIRLWIND_TIMING.spinEnd, 360, 10, -15, 0.18, [80, 76], 0.65, 17, -1),
  // A brief planted beat makes the stop readable before the torso recovers.
  spinFrame(WHIRLWIND_TIMING.settleStart, 360, 7, -10, 0.17, [76, 71], 0.4, 14, -1),
  {
    time: WHIRLWIND_DURATION,
    rotations: {
      Root: rotation(0, 360, 0),
      Hips: rotation(0, -5, -2.4),
      Spine: rotation(2.5, 2, 1.2),
      Spine1: rotation(4, 4, -1.4),
      Spine2: rotation(-1, 5, 0.7),
      Head: rotation(0),
      LeftUpLeg: rotation(12, -3, 3),
      RightUpLeg: rotation(18, 4, -3),
      LeftLeg: rotation(-24),
      RightLeg: rotation(-36),
      LeftFoot: rotation(5),
      RightFoot: rotation(7),
      LeftShoulder: rotation(0, -2, -2.5),
      RightShoulder: rotation(0, 2, 2.5),
      LeftArm: rotation(-22, -7, 17),
      RightArm: rotation(-18, 9, -22),
      LeftForeArm: rotation(0, -8, -58),
      RightForeArm: rotation(0, 8, 64),
      LeftHand: rotation(3, 4, -2),
      RightHand: rotation(-2, -5, 2)
    },
    positions: { Hips: [-0.025, -0.065, -0.028] }
  }
];
var WHIRLWIND_RECIPE = {
  id: "whirlwind",
  basePose: "combat",
  sampleRate: 120,
  frames
};

// studio/src/animation/recipes/combatRecipes.ts
var COMBAT_RECIPES = [
  {
    id: "light-attack",
    basePose: "combat",
    frames: [
      { time: 0 },
      {
        time: 0.1,
        rotations: {
          Hips: rotation(1, -14, -3),
          Spine: rotation(3, -7, 1),
          Spine1: rotation(5, -10, -2),
          Spine2: rotation(0, -13, -1),
          Head: rotation(-2, 6, 0),
          LeftShoulder: rotation(-2, -4, -4),
          LeftArm: rotation(-29, -11, 30),
          LeftForeArm: rotation(0, -10, -78),
          LeftHand: rotation(5, 7, -4),
          RightShoulder: rotation(-2, 4, 4),
          RightArm: rotation(-31, 8, -38),
          RightForeArm: rotation(0, 12, 88),
          RightHand: rotation(-8, -12, 7),
          LeftUpLeg: rotation(18, -3, 3),
          RightUpLeg: rotation(30, 5, -4),
          LeftLeg: rotation(-34),
          RightLeg: rotation(-56),
          LeftFoot: rotation(6),
          RightFoot: rotation(10)
        },
        positions: { Hips: [-0.04, -0.11, -0.045] }
      },
      {
        time: 0.22,
        rotations: {
          Hips: rotation(2, -23, -4),
          Spine: rotation(5, -13, 2),
          Spine1: rotation(7, -18, -3),
          Spine2: rotation(1, -22, -2),
          Head: rotation(-3, 9, 0),
          LeftShoulder: rotation(-3, -5, -4),
          LeftArm: rotation(-30, -12, 31),
          LeftForeArm: rotation(0, -11, -80),
          LeftHand: rotation(5, 8, -4),
          RightShoulder: rotation(-3, 5, 4),
          RightArm: rotation(-43, 8, -47),
          RightForeArm: rotation(0, 14, 101),
          RightHand: rotation(-11, -15, 9),
          LeftUpLeg: rotation(19, -3, 3),
          RightUpLeg: rotation(34, 6, -4),
          LeftLeg: rotation(-37),
          RightLeg: rotation(-64),
          LeftFoot: rotation(7),
          RightFoot: rotation(11)
        },
        positions: { Hips: [-0.052, -0.128, -0.055] }
      },
      {
        time: 0.3,
        rotations: {
          Hips: rotation(1, -2, -1),
          Spine: rotation(4, -12, 1),
          Spine1: rotation(5, -15, -2),
          Spine2: rotation(0, -16, -1),
          Head: rotation(-2, 7, 0),
          LeftArm: rotation(-29, -11, 30),
          LeftForeArm: rotation(0, -11, -79),
          RightArm: rotation(-30, 6, -34),
          RightForeArm: rotation(0, 12, 86),
          RightHand: rotation(-7, -10, 6),
          LeftUpLeg: rotation(21),
          RightUpLeg: rotation(29),
          LeftLeg: rotation(-40),
          RightLeg: rotation(-55),
          LeftFoot: rotation(7),
          RightFoot: rotation(9)
        },
        positions: { Hips: [-0.024, -0.104, -0.025] }
      },
      {
        time: 0.4,
        rotations: {
          Hips: rotation(0, 25, 2),
          Spine: rotation(-1, 10, -1),
          Spine1: rotation(-2, 15, 1),
          Spine2: rotation(-2, 20, 0),
          Head: rotation(-1, -7, 0),
          LeftArm: rotation(-27, -10, 29),
          LeftForeArm: rotation(0, -10, -76),
          RightArm: rotation(7, 0, 30),
          RightForeArm: rotation(0, 8, 42),
          RightHand: rotation(1, 0, 0),
          LeftUpLeg: rotation(27),
          RightUpLeg: rotation(17),
          LeftLeg: rotation(-50),
          RightLeg: rotation(-34)
        },
        positions: { Hips: [0.016, -0.068, 0.04] }
      },
      {
        time: 0.45,
        rotations: {
          Hips: rotation(-1, 36, 3),
          Spine: rotation(-3, 22, -2),
          Spine1: rotation(-4, 29, 2),
          Spine2: rotation(-3, 35, 1),
          Head: rotation(0, -12, 0),
          LeftArm: rotation(-25, -9, 28),
          LeftForeArm: rotation(0, -10, -74),
          RightArm: rotation(22, -3, 58),
          RightForeArm: rotation(0, 4, 12),
          RightHand: rotation(6, 6, -4),
          LeftUpLeg: rotation(31),
          RightUpLeg: rotation(12),
          LeftLeg: rotation(-57),
          RightLeg: rotation(-25),
          LeftFoot: rotation(10),
          RightFoot: rotation(3)
        },
        positions: { Hips: [0.042, -0.052, 0.07] }
      },
      {
        time: 0.57,
        rotations: {
          Hips: rotation(-1, 25, 2),
          Spine: rotation(-2, 18, -1),
          Spine1: rotation(-3, 24, 1),
          Spine2: rotation(-2, 29, 1),
          Head: rotation(0, -9, 0),
          LeftArm: rotation(-26, -10, 29),
          LeftForeArm: rotation(0, -10, -76),
          RightArm: rotation(15, -1, 47),
          RightForeArm: rotation(0, 5, 20),
          RightHand: rotation(4, 3, -2),
          LeftUpLeg: rotation(27),
          RightUpLeg: rotation(15),
          LeftLeg: rotation(-50),
          RightLeg: rotation(-30)
        },
        positions: { Hips: [0.025, -0.065, 0.045] }
      },
      { time: 0.72 }
    ]
  },
  {
    id: "heavy-attack",
    basePose: "combat",
    frames: [
      { time: 0 },
      {
        time: 0.16,
        rotations: {
          Hips: rotation(2, -13, -3),
          Spine: rotation(4, -7, 1),
          Spine1: rotation(7, -11, -2),
          Spine2: rotation(2, -15, -1),
          LeftUpLeg: rotation(22),
          RightUpLeg: rotation(34),
          LeftLeg: rotation(-43),
          RightLeg: rotation(-61),
          LeftFoot: rotation(7),
          RightFoot: rotation(10),
          RightShoulder: rotation(-3, 4, 5),
          RightArm: rotation(-38, 8, -34),
          RightForeArm: rotation(0, 12, 83),
          RightHand: rotation(-11, -12, 8),
          LeftArm: rotation(-30, -12, 31),
          LeftForeArm: rotation(0, -11, -80),
          Head: rotation(-2, 7, 0)
        },
        positions: { Hips: [0.048, -0.125, -0.05] }
      },
      {
        time: 0.36,
        rotations: {
          Hips: rotation(4, -29, -4),
          Spine: rotation(7, -17, 2),
          Spine1: rotation(10, -25, -3),
          Spine2: rotation(4, -32, -2),
          LeftUpLeg: rotation(25),
          RightUpLeg: rotation(41),
          LeftLeg: rotation(-48),
          RightLeg: rotation(-72),
          LeftFoot: rotation(8),
          RightFoot: rotation(12),
          RightArm: rotation(-54, 9, -47),
          RightForeArm: rotation(0, 14, 101),
          RightHand: rotation(-14, -16, 10),
          LeftArm: rotation(-32, -13, 32),
          LeftForeArm: rotation(0, -11, -82),
          Head: rotation(-4, 12, 0)
        },
        positions: { Hips: [0.062, -0.155, -0.065] }
      },
      {
        time: 0.52,
        rotations: {
          Hips: rotation(2, -8, -1),
          Spine: rotation(5, -16, 1),
          Spine1: rotation(7, -21, -2),
          Spine2: rotation(2, -25, -1),
          LeftUpLeg: rotation(25),
          RightUpLeg: rotation(36),
          LeftLeg: rotation(-42),
          RightLeg: rotation(-58),
          RightArm: rotation(-36, 5, -26),
          RightForeArm: rotation(0, 12, 82),
          LeftArm: rotation(-31, -12, 32),
          LeftForeArm: rotation(0, -11, -81),
          Head: rotation(-2, 10, 0)
        },
        positions: { Hips: [0.036, -0.105, -0.04] }
      },
      {
        time: 0.65,
        rotations: {
          Hips: rotation(0, 17, 1),
          Spine: rotation(1, -5, 0),
          Spine1: rotation(0, -3, 0),
          Spine2: rotation(-2, 0, 0),
          LeftUpLeg: rotation(31),
          RightUpLeg: rotation(22),
          LeftLeg: rotation(-58),
          RightLeg: rotation(-42),
          LeftFoot: rotation(10),
          RightFoot: rotation(7),
          RightArm: rotation(-12, 2, 5),
          RightForeArm: rotation(0, 10, 58),
          RightHand: rotation(0, -2, 1),
          LeftArm: rotation(-29, -11, 31),
          LeftForeArm: rotation(0, -11, -79),
          Head: rotation(-1, 1, 0)
        },
        positions: { Hips: [-5e-3, -0.075, 0.025] }
      },
      {
        time: 0.78,
        rotations: {
          Hips: rotation(-2, 39, 3),
          Spine: rotation(-4, 20, -2),
          Spine1: rotation(-6, 27, 2),
          Spine2: rotation(-5, 34, 1),
          LeftUpLeg: rotation(34),
          RightUpLeg: rotation(12),
          LeftLeg: rotation(-61),
          RightLeg: rotation(-25),
          LeftFoot: rotation(11),
          RightFoot: rotation(3),
          RightArm: rotation(20, -3, 52),
          RightForeArm: rotation(0, 5, 15),
          RightHand: rotation(7, 6, -4),
          LeftArm: rotation(-26, -9, 29),
          LeftForeArm: rotation(0, -10, -75),
          Head: rotation(1, -11, 0)
        },
        positions: { Hips: [0.04, -0.055, 0.075] }
      },
      {
        time: 0.97,
        rotations: {
          Hips: rotation(-1, 28, 2),
          Spine: rotation(-3, 22, -1),
          Spine1: rotation(-4, 29, 1),
          Spine2: rotation(-3, 35, 1),
          LeftUpLeg: rotation(31),
          RightUpLeg: rotation(14),
          LeftLeg: rotation(-58),
          RightLeg: rotation(-29),
          RightArm: rotation(17, -2, 47),
          RightForeArm: rotation(0, 5, 20),
          LeftArm: rotation(-27, -10, 30),
          LeftForeArm: rotation(0, -10, -77),
          Head: rotation(1, -10, 0)
        },
        positions: { Hips: [0.025, -0.072, 0.05] }
      },
      {
        time: 1.17,
        rotations: {
          Hips: rotation(0, 7, -2),
          Spine: rotation(1, 5, 1),
          Spine1: rotation(3, 8, -1),
          LeftUpLeg: rotation(16),
          RightUpLeg: rotation(15),
          LeftLeg: rotation(-32),
          RightLeg: rotation(-31),
          RightArm: rotation(-9, 5, -25),
          RightForeArm: rotation(0, 10, 58),
          LeftArm: rotation(-28, -10, 29),
          LeftForeArm: rotation(0, -10, -77),
          Head: rotation(-1, -4, 0)
        },
        positions: { Hips: [-0.028, -0.075, -0.01] }
      },
      { time: 1.34 }
    ]
  },
  SPELLCASTING_RECIPE,
  WHIRLWIND_RECIPE,
  {
    id: "hit",
    basePose: "combat",
    frames: [
      { time: 0 },
      {
        time: 0.065,
        rotations: {
          Hips: rotation(8, -6, -5),
          Spine: rotation(13, 2, -8),
          Spine1: rotation(19, 5, -13),
          Spine2: rotation(15, 4, -10),
          Head: rotation(-14, -4, 7),
          LeftUpLeg: rotation(8),
          RightUpLeg: rotation(23),
          LeftLeg: rotation(-19),
          RightLeg: rotation(-43),
          LeftArm: rotation(-6, -4, 19),
          RightArm: rotation(-2, 7, -27),
          LeftForeArm: rotation(0, -42, 5),
          RightForeArm: rotation(0, 46, -6)
        },
        positions: { Hips: [-0.035, -0.07, 0.06] }
      },
      {
        time: 0.18,
        rotations: {
          Hips: rotation(-3, 4, 2),
          Spine: rotation(-6, -2, 4),
          Spine1: rotation(-9, -3, 6),
          Spine2: rotation(-7, -2, 4),
          Head: rotation(6, 3, -3),
          LeftUpLeg: rotation(17),
          RightUpLeg: rotation(9),
          LeftLeg: rotation(-32),
          RightLeg: rotation(-20),
          LeftArm: rotation(-20, -6, 14),
          RightArm: rotation(-14, 8, -20)
        },
        positions: { Hips: [0.018, -0.052, -0.016] }
      },
      {
        time: 0.34,
        rotations: {
          Hips: rotation(1, -2, -2),
          Spine: rotation(2, 1, -1),
          Spine1: rotation(4, 1, -3),
          Head: rotation(-3, 0, 1),
          LeftUpLeg: rotation(11),
          RightUpLeg: rotation(14),
          LeftLeg: rotation(-23),
          RightLeg: rotation(-29)
        },
        positions: { Hips: [-0.01, -0.06, 0.012] }
      },
      { time: 0.5 }
    ]
  }
];

// studio/src/animation/recipes/locomotionRecipes.ts
var WALK_FRAMES = [
  {
    time: 0,
    rotations: {
      Hips: rotation(0, -4, -1.2),
      Spine: rotation(-1, 2.2, 0.7),
      Spine1: rotation(2, 1.8, -0.9),
      Spine2: rotation(-0.5, 2.4, 0.4),
      LeftUpLeg: rotation(22),
      RightUpLeg: rotation(-15),
      LeftLeg: rotation(-8),
      RightLeg: rotation(-32),
      LeftFoot: rotation(-5),
      RightFoot: rotation(10),
      LeftToeBase: rotation(0),
      RightToeBase: rotation(-7),
      ...relaxedWalkArms(14, 18, 0.5)
    },
    positions: { Hips: [0.012, -0.014, 0] }
  },
  {
    time: 0.13,
    rotations: {
      Hips: rotation(1.5, -2.5, -1.8),
      Spine: rotation(-0.5, 1.5, 1),
      Spine1: rotation(2.3, 1, -1.1),
      LeftUpLeg: rotation(23),
      RightUpLeg: rotation(-13),
      LeftLeg: rotation(-28),
      RightLeg: rotation(-38),
      LeftFoot: rotation(3),
      RightFoot: rotation(14),
      RightToeBase: rotation(-10),
      ...relaxedWalkArms(10, 20, 0.2)
    },
    positions: { Hips: [0.02, -0.022, 8e-3] }
  },
  {
    time: 0.26,
    rotations: {
      Hips: rotation(0, 0, -1.1),
      Spine: rotation(-1.2, 0, 0.65),
      Spine1: rotation(1.8, 0, -0.7),
      LeftUpLeg: rotation(4),
      RightUpLeg: rotation(-7),
      LeftLeg: rotation(-17),
      RightLeg: rotation(-47),
      LeftFoot: rotation(-1),
      RightFoot: rotation(18),
      RightToeBase: rotation(-14),
      ...relaxedWalkArms(4, 23, -0.1)
    },
    positions: { Hips: [0.022, 0, 4e-3] }
  },
  {
    time: 0.39,
    rotations: {
      Hips: rotation(-1, 2.6, -0.2),
      Spine: rotation(-0.7, -1.4, 0),
      Spine1: rotation(1.7, -1, -0.1),
      LeftUpLeg: rotation(-13),
      RightUpLeg: rotation(10),
      LeftLeg: rotation(-4),
      RightLeg: rotation(-56),
      LeftFoot: rotation(-8),
      RightFoot: rotation(-8),
      LeftToeBase: rotation(8),
      RightToeBase: rotation(3),
      ...relaxedWalkArms(-8, 21, 0.3)
    },
    positions: { Hips: [4e-3, 0.01, -3e-3] }
  },
  {
    time: 0.52,
    rotations: {
      Hips: rotation(0, 4, 1.2),
      Spine: rotation(-1, -2.2, -0.7),
      Spine1: rotation(2, -1.8, 0.9),
      Spine2: rotation(-0.5, -2.4, -0.4),
      LeftUpLeg: rotation(-15),
      RightUpLeg: rotation(22),
      LeftLeg: rotation(-32),
      RightLeg: rotation(-8),
      LeftFoot: rotation(10),
      RightFoot: rotation(-5),
      LeftToeBase: rotation(-7),
      RightToeBase: rotation(0),
      ...relaxedWalkArms(-14, 18, 0.5)
    },
    positions: { Hips: [-0.012, -0.014, 0] }
  },
  {
    time: 0.65,
    rotations: {
      Hips: rotation(1.5, 2.5, 1.8),
      Spine: rotation(-0.5, -1.5, -1),
      Spine1: rotation(2.3, -1, 1.1),
      LeftUpLeg: rotation(-13),
      RightUpLeg: rotation(23),
      LeftLeg: rotation(-38),
      RightLeg: rotation(-28),
      LeftFoot: rotation(14),
      RightFoot: rotation(3),
      LeftToeBase: rotation(-10),
      ...relaxedWalkArms(-10, 20, 0.2)
    },
    positions: { Hips: [-0.02, -0.022, 8e-3] }
  },
  {
    time: 0.78,
    rotations: {
      Hips: rotation(0, 0, 1.1),
      Spine: rotation(-1.2, 0, -0.65),
      Spine1: rotation(1.8, 0, 0.7),
      LeftUpLeg: rotation(-7),
      RightUpLeg: rotation(4),
      LeftLeg: rotation(-47),
      RightLeg: rotation(-17),
      LeftFoot: rotation(18),
      RightFoot: rotation(-1),
      LeftToeBase: rotation(-14),
      ...relaxedWalkArms(-4, 23, -0.1)
    },
    positions: { Hips: [-0.022, 0, 4e-3] }
  },
  {
    time: 0.91,
    rotations: {
      Hips: rotation(-1, -2.6, 0.2),
      Spine: rotation(-0.7, 1.4, 0),
      Spine1: rotation(1.7, 1, 0.1),
      LeftUpLeg: rotation(10),
      RightUpLeg: rotation(-13),
      LeftLeg: rotation(-56),
      RightLeg: rotation(-4),
      LeftFoot: rotation(-8),
      RightFoot: rotation(-8),
      LeftToeBase: rotation(3),
      RightToeBase: rotation(8),
      ...relaxedWalkArms(8, 21, 0.3)
    },
    positions: { Hips: [-4e-3, 0.01, -3e-3] }
  }
];
var forwardWalkFrames = [...WALK_FRAMES, { ...WALK_FRAMES[0], time: 1.04 }];
function createStrafeRecipe(id, side2) {
  const leading = side2 === 1 ? "Left" : "Right";
  const trailing = side2 === 1 ? "Right" : "Left";
  const lateral = 0.026 * side2;
  const lean = 3.2 * side2;
  const frames2 = [
    {
      time: 0,
      rotations: {
        Hips: rotation(0, -2 * side2, -lean),
        Spine: rotation(1, 2 * side2, lean * 0.55),
        [`${leading}UpLeg`]: rotation(14, -4 * side2, 5 * side2),
        [`${trailing}UpLeg`]: rotation(8, 3 * side2, -3 * side2),
        [`${leading}Leg`]: rotation(-26),
        [`${trailing}Leg`]: rotation(-17),
        [`${leading}Foot`]: rotation(3, 0, -4 * side2),
        [`${trailing}Foot`]: rotation(5, 0, 2 * side2)
      },
      positions: { Hips: [lateral, -0.05, 0] }
    },
    {
      time: 0.18,
      rotations: {
        Hips: rotation(0, 0, -4.5 * side2),
        Spine1: rotation(4, 0, 2.4 * side2),
        [`${leading}UpLeg`]: rotation(20, -7 * side2, 9 * side2),
        [`${trailing}UpLeg`]: rotation(15, 4 * side2, -5 * side2),
        [`${leading}Leg`]: rotation(-39),
        [`${trailing}Leg`]: rotation(-31),
        [`${leading}Foot`]: rotation(8, 0, -7 * side2)
      },
      positions: { Hips: [0.041 * side2, -0.072, -6e-3] }
    },
    {
      time: 0.36,
      rotations: {
        Hips: rotation(0, 3 * side2, -1.2 * side2),
        Spine: rotation(0, -2 * side2, 0.8 * side2),
        [`${leading}UpLeg`]: rotation(5, -2 * side2, 2 * side2),
        [`${trailing}UpLeg`]: rotation(22, 6 * side2, -8 * side2),
        [`${leading}Leg`]: rotation(-14),
        [`${trailing}Leg`]: rotation(-42),
        [`${leading}Foot`]: rotation(-2, 0, -2 * side2),
        [`${trailing}Foot`]: rotation(11, 0, 5 * side2)
      },
      positions: { Hips: [0.018 * side2, -0.035, 4e-3] }
    },
    {
      time: 0.54,
      rotations: {
        Hips: rotation(0, 2 * side2, 2.8 * side2),
        Spine: rotation(1, -2 * side2, -1.5 * side2),
        [`${leading}UpLeg`]: rotation(7, 3 * side2, -4 * side2),
        [`${trailing}UpLeg`]: rotation(14, -4 * side2, 5 * side2),
        [`${leading}Leg`]: rotation(-17),
        [`${trailing}Leg`]: rotation(-27)
      },
      positions: { Hips: [-0.018 * side2, -0.048, 0] }
    },
    {
      time: 0.72,
      rotations: {
        Hips: rotation(0, 0, 4.5 * side2),
        Spine1: rotation(4, 0, -2.4 * side2),
        [`${leading}UpLeg`]: rotation(15, -4 * side2, 5 * side2),
        [`${trailing}UpLeg`]: rotation(20, 7 * side2, -9 * side2),
        [`${leading}Leg`]: rotation(-31),
        [`${trailing}Leg`]: rotation(-39),
        [`${trailing}Foot`]: rotation(8, 0, 7 * side2)
      },
      positions: { Hips: [-0.041 * side2, -0.072, -6e-3] }
    },
    {
      time: 0.9,
      rotations: {
        Hips: rotation(0, -3 * side2, 1.2 * side2),
        Spine: rotation(0, 2 * side2, -0.8 * side2),
        [`${leading}UpLeg`]: rotation(22, -6 * side2, 8 * side2),
        [`${trailing}UpLeg`]: rotation(5, 2 * side2, -2 * side2),
        [`${leading}Leg`]: rotation(-42),
        [`${trailing}Leg`]: rotation(-14),
        [`${leading}Foot`]: rotation(11, 0, -5 * side2),
        [`${trailing}Foot`]: rotation(-2, 0, 2 * side2)
      },
      positions: { Hips: [-0.018 * side2, -0.035, 4e-3] }
    }
  ];
  frames2.push({ ...frames2[0], time: 1.08 });
  return { id, basePose: "combat", frames: frames2 };
}
function createTurnRecipe(id, side2) {
  return {
    id,
    basePose: "combat",
    frames: [
      { time: 0 },
      {
        time: 0.13,
        rotations: {
          Hips: rotation(0, -9 * side2, -2 * side2),
          Spine: rotation(2, 5 * side2, 1.2 * side2),
          Spine1: rotation(4, 9 * side2, -1.5 * side2),
          Head: rotation(-1, 12 * side2, 0),
          LeftUpLeg: rotation(18),
          RightUpLeg: rotation(18),
          LeftLeg: rotation(-34),
          RightLeg: rotation(-34)
        },
        positions: { Hips: [-0.018 * side2, -0.082, -0.018] }
      },
      {
        time: 0.32,
        rotations: {
          Hips: rotation(0, 18 * side2, 2 * side2),
          Spine: rotation(1, -8 * side2, -1 * side2),
          Spine1: rotation(3, -12 * side2, 1.5 * side2),
          Head: rotation(-1, 9 * side2, 0),
          LeftUpLeg: rotation(12, -5 * side2, 3 * side2),
          RightUpLeg: rotation(21, 6 * side2, -3 * side2),
          LeftLeg: rotation(-23),
          RightLeg: rotation(-41)
        },
        positions: { Hips: [0.016 * side2, -0.057, 6e-3] }
      },
      {
        time: 0.5,
        rotations: {
          Hips: rotation(0, 8 * side2, 0.8 * side2),
          Spine: rotation(2, -3 * side2, -0.5 * side2),
          Spine1: rotation(4, -5 * side2, 0.8 * side2),
          Head: rotation(-1, 2 * side2, 0),
          LeftUpLeg: rotation(13),
          RightUpLeg: rotation(18),
          LeftLeg: rotation(-26),
          RightLeg: rotation(-36)
        },
        positions: { Hips: [8e-3 * side2, -0.064, 0] }
      },
      { time: 0.68 }
    ]
  };
}
var LOCOMOTION_RECIPES = [
  {
    id: "walk-start",
    basePose: "relaxed",
    frames: [
      { time: 0 },
      {
        time: 0.12,
        rotations: {
          Hips: rotation(5, 1, -1.5),
          Spine: rotation(-2, 0, 0.8),
          Spine1: rotation(3, 0, -0.9),
          LeftUpLeg: rotation(8),
          RightUpLeg: rotation(10),
          LeftLeg: rotation(-13),
          RightLeg: rotation(-19),
          LeftArm: rotation(-2, 0, 6),
          RightArm: rotation(3, 0, -7)
        },
        positions: { Hips: [-0.014, -0.035, -0.015] }
      },
      {
        time: 0.28,
        rotations: {
          Hips: rotation(2, -3, -1.8),
          Spine: rotation(-1, 2, 1),
          LeftUpLeg: rotation(24),
          RightUpLeg: rotation(-10),
          LeftLeg: rotation(-20),
          RightLeg: rotation(-29),
          LeftFoot: rotation(-4),
          RightFoot: rotation(11),
          LeftArm: rotation(10, 0, 5),
          RightArm: rotation(-12, 0, -6)
        },
        positions: { Hips: [0.012, -0.026, 2e-3] }
      },
      { ...forwardWalkFrames[1], time: 0.52 }
    ]
  },
  { id: "walk", basePose: "relaxed", frames: forwardWalkFrames },
  {
    id: "walk-stop",
    basePose: "relaxed",
    frames: [
      { ...forwardWalkFrames[4], time: 0 },
      {
        time: 0.14,
        rotations: {
          Hips: rotation(2, 2, 1.7),
          Spine: rotation(-3, -1, -0.8),
          Spine1: rotation(4, -1, 1),
          LeftUpLeg: rotation(-8),
          RightUpLeg: rotation(18),
          LeftLeg: rotation(-29),
          RightLeg: rotation(-24),
          LeftFoot: rotation(12),
          RightFoot: rotation(2),
          LeftArm: rotation(-8, 0, 6),
          RightArm: rotation(7, 0, -7)
        },
        positions: { Hips: [-0.016, -0.042, 0.012] }
      },
      {
        time: 0.3,
        rotations: {
          Hips: rotation(-1, 1, 0.7),
          Spine: rotation(1, -0.5, -0.3),
          Spine1: rotation(0.5, 0, 0.3),
          LeftUpLeg: rotation(6),
          RightUpLeg: rotation(9),
          LeftLeg: rotation(-14),
          RightLeg: rotation(-18),
          LeftFoot: rotation(3),
          RightFoot: rotation(4)
        },
        positions: { Hips: [-6e-3, -0.026, 4e-3] }
      },
      { time: 0.48 }
    ]
  },
  {
    id: "walk-backward",
    basePose: "combat",
    frames: [
      {
        time: 0,
        rotations: {
          Hips: rotation(1, 3, -2),
          Spine: rotation(-2, -2, 1),
          LeftUpLeg: rotation(-15),
          RightUpLeg: rotation(20),
          LeftLeg: rotation(-31),
          RightLeg: rotation(-17),
          LeftFoot: rotation(12),
          RightFoot: rotation(-5),
          LeftArm: rotation(-16, -5, 16),
          RightArm: rotation(-21, 8, -22)
        },
        positions: { Hips: [-0.014, -0.06, 0.015] }
      },
      { time: 0.295, rotations: { Hips: rotation(0, 0, -1), LeftUpLeg: rotation(8), RightUpLeg: rotation(4), LeftLeg: rotation(-34), RightLeg: rotation(-18), LeftFoot: rotation(-2), RightFoot: rotation(6) }, positions: { Hips: [-8e-3, -0.045, -6e-3] } },
      { time: 0.59, rotations: { Hips: rotation(1, -3, 2), Spine: rotation(-2, 2, -1), LeftUpLeg: rotation(20), RightUpLeg: rotation(-15), LeftLeg: rotation(-17), RightLeg: rotation(-31), LeftFoot: rotation(-5), RightFoot: rotation(12) }, positions: { Hips: [0.014, -0.06, 0.015] } },
      { time: 0.885, rotations: { Hips: rotation(0, 0, 1), LeftUpLeg: rotation(4), RightUpLeg: rotation(8), LeftLeg: rotation(-18), RightLeg: rotation(-34), LeftFoot: rotation(6), RightFoot: rotation(-2) }, positions: { Hips: [8e-3, -0.045, -6e-3] } },
      {
        time: 1.18,
        rotations: {
          Hips: rotation(1, 3, -2),
          Spine: rotation(-2, -2, 1),
          LeftUpLeg: rotation(-15),
          RightUpLeg: rotation(20),
          LeftLeg: rotation(-31),
          RightLeg: rotation(-17),
          LeftFoot: rotation(12),
          RightFoot: rotation(-5),
          LeftArm: rotation(-16, -5, 16),
          RightArm: rotation(-21, 8, -22)
        },
        positions: { Hips: [-0.014, -0.06, 0.015] }
      }
    ]
  },
  createStrafeRecipe("strafe-left", 1),
  createStrafeRecipe("strafe-right", -1),
  {
    id: "run-start",
    basePose: "relaxed",
    frames: [
      { time: 0 },
      { time: 0.1, rotations: { Hips: rotation(9, 0, -1), Spine: rotation(-4, 0, 0.5), Spine1: rotation(8, 0, -0.6), LeftUpLeg: rotation(18), RightUpLeg: rotation(22), LeftLeg: rotation(-34), RightLeg: rotation(-42), ...compactRunArms(3, 48) }, positions: { Hips: [-0.01, -0.1, -0.045] } },
      { time: 0.25, rotations: { Hips: rotation(6, -5, -2), Spine: rotation(-3, 2, 0.7), Spine1: rotation(11, 3, -1), Spine2: rotation(-1, 2, 0.4), LeftUpLeg: rotation(42), RightUpLeg: rotation(-20), LeftLeg: rotation(-22), RightLeg: rotation(-56), ...compactRunArms(24) }, positions: { Hips: [0.012, -0.038, -0.032] } },
      { time: 0.46, rotations: { Hips: rotation(5, -3, -1), Spine: rotation(-3, 2, 0.7), Spine1: rotation(10, 2, -1), Spine2: rotation(-1, 2, 0.4), Head: rotation(-2, 1, 0), LeftUpLeg: rotation(32), RightUpLeg: rotation(-26), LeftLeg: rotation(-16), RightLeg: rotation(-51), ...compactRunArms(26) }, positions: { Hips: [6e-3, 2e-3, -0.028] } }
    ]
  },
  {
    id: "run",
    basePose: "relaxed",
    frames: [
      { time: 0, rotations: { Hips: rotation(6, -4, -1.5), Spine: rotation(-3, 2, 0.7), Spine1: rotation(10, 3, -1), Spine2: rotation(-1, 2, 0.4), Head: rotation(-2, 1, 0), LeftUpLeg: rotation(38), RightUpLeg: rotation(-31), LeftLeg: rotation(-18), RightLeg: rotation(-70), LeftFoot: rotation(-8), RightFoot: rotation(15), ...compactRunArms(26, 58, 0.6) }, positions: { Hips: [8e-3, 4e-3, -0.025] } },
      { time: 0.11, rotations: { Hips: rotation(9, -1, -1), Spine: rotation(-3, 1, 0.4), Spine1: rotation(11, 1, -0.5), Spine2: rotation(-1, 1, 0.2), Head: rotation(-2), LeftUpLeg: rotation(28), RightUpLeg: rotation(-15), LeftLeg: rotation(-34), RightLeg: rotation(-48), LeftFoot: rotation(0), RightFoot: rotation(8), ...compactRunArms(17, 62, 0.2) }, positions: { Hips: [4e-3, -0.026, -0.032] } },
      { time: 0.145, rotations: { Hips: rotation(8, 0, -0.5), Spine: rotation(-3, 0, 0.2), Spine1: rotation(11, 0, -0.2), Spine2: rotation(-1), Head: rotation(-2), LeftUpLeg: rotation(15), RightUpLeg: rotation(-10), LeftLeg: rotation(-18), RightLeg: rotation(-42), LeftFoot: rotation(-7), RightFoot: rotation(4), LeftToeBase: rotation(12), ...compactRunArms(9, 64, -0.2) }, positions: { Hips: [2e-3, -6e-3, -0.034] } },
      { time: 0.18, rotations: { Hips: rotation(7, 0, 0), Spine: rotation(-3), Spine1: rotation(10), Spine2: rotation(-1), Head: rotation(-2), LeftUpLeg: rotation(6), RightUpLeg: rotation(-5), LeftLeg: rotation(-28), RightLeg: rotation(-30), LeftFoot: rotation(8), RightFoot: rotation(-2), LeftToeBase: rotation(7), ...compactRunArms(1, 61, -0.4) }, positions: { Hips: [0, 0.031, -0.03] } },
      { time: 0.23, rotations: { Hips: rotation(7, 1, 0.5), Spine: rotation(-3, -1, -0.3), Spine1: rotation(10, -1.5, 0.4), Spine2: rotation(-1, -1, -0.2), Head: rotation(-2, -0.5, 0), LeftUpLeg: rotation(-6), RightUpLeg: rotation(8), LeftLeg: rotation(-43), RightLeg: rotation(-23), LeftFoot: rotation(12), RightFoot: rotation(-5), ...compactRunArms(-8, 59, -0.1) }, positions: { Hips: [-3e-3, 0.026, -0.029] } },
      { time: 0.28, rotations: { Hips: rotation(7, 3, 1), Spine: rotation(-3, -2, -0.7), Spine1: rotation(10, -3, 1), Spine2: rotation(-1, -2, -0.4), Head: rotation(-2, -1, 0), LeftUpLeg: rotation(-18), RightUpLeg: rotation(21), LeftLeg: rotation(-56), RightLeg: rotation(-16), LeftFoot: rotation(14), RightFoot: rotation(-8), ...compactRunArms(-18, 58, 0.1) }, positions: { Hips: [-6e-3, 0.016, -0.028] } },
      { time: 0.36, rotations: { Hips: rotation(6, 4, 1.5), Spine: rotation(-3, -2, -0.7), Spine1: rotation(10, -3, 1), Spine2: rotation(-1, -2, -0.4), Head: rotation(-2, -1, 0), LeftUpLeg: rotation(-31), RightUpLeg: rotation(38), LeftLeg: rotation(-70), RightLeg: rotation(-18), LeftFoot: rotation(15), RightFoot: rotation(-8), ...compactRunArms(-26, 58, 0.6) }, positions: { Hips: [-8e-3, 4e-3, -0.025] } },
      { time: 0.47, rotations: { Hips: rotation(9, 1, 1), Spine: rotation(-3, -1, -0.4), Spine1: rotation(11, -1, 0.5), Spine2: rotation(-1, -1, -0.2), Head: rotation(-2), LeftUpLeg: rotation(-15), RightUpLeg: rotation(28), LeftLeg: rotation(-48), RightLeg: rotation(-34), LeftFoot: rotation(8), RightFoot: rotation(0), ...compactRunArms(-17, 62, 0.2) }, positions: { Hips: [-4e-3, -0.026, -0.032] } },
      { time: 0.505, rotations: { Hips: rotation(8, 0, 0.5), Spine: rotation(-3, 0, -0.2), Spine1: rotation(11, 0, 0.2), Spine2: rotation(-1), Head: rotation(-2), LeftUpLeg: rotation(-10), RightUpLeg: rotation(15), LeftLeg: rotation(-42), RightLeg: rotation(-18), LeftFoot: rotation(4), RightFoot: rotation(-7), RightToeBase: rotation(12), ...compactRunArms(-9, 64, -0.2) }, positions: { Hips: [-2e-3, -6e-3, -0.034] } },
      { time: 0.54, rotations: { Hips: rotation(7, 0, 0), Spine: rotation(-3), Spine1: rotation(10), Spine2: rotation(-1), Head: rotation(-2), LeftUpLeg: rotation(-5), RightUpLeg: rotation(6), LeftLeg: rotation(-30), RightLeg: rotation(-28), LeftFoot: rotation(-2), RightFoot: rotation(8), RightToeBase: rotation(7), ...compactRunArms(-1, 61, -0.4) }, positions: { Hips: [0, 0.031, -0.03] } },
      { time: 0.59, rotations: { Hips: rotation(7, -1, -0.5), Spine: rotation(-3, 1, 0.3), Spine1: rotation(10, 1.5, -0.4), Spine2: rotation(-1, 1, 0.2), Head: rotation(-2, 0.5, 0), LeftUpLeg: rotation(8), RightUpLeg: rotation(-6), LeftLeg: rotation(-23), RightLeg: rotation(-43), LeftFoot: rotation(-5), RightFoot: rotation(12), ...compactRunArms(8, 59, -0.1) }, positions: { Hips: [3e-3, 0.026, -0.029] } },
      { time: 0.64, rotations: { Hips: rotation(7, -3, -1), Spine: rotation(-3, 2, 0.7), Spine1: rotation(10, 3, -1), Spine2: rotation(-1, 2, 0.4), Head: rotation(-2, 1, 0), LeftUpLeg: rotation(21), RightUpLeg: rotation(-18), LeftLeg: rotation(-16), RightLeg: rotation(-56), LeftFoot: rotation(-8), RightFoot: rotation(14), ...compactRunArms(18, 58, 0.1) }, positions: { Hips: [6e-3, 0.016, -0.028] } },
      { time: 0.72, rotations: { Hips: rotation(6, -4, -1.5), Spine: rotation(-3, 2, 0.7), Spine1: rotation(10, 3, -1), Spine2: rotation(-1, 2, 0.4), Head: rotation(-2, 1, 0), LeftUpLeg: rotation(38), RightUpLeg: rotation(-31), LeftLeg: rotation(-18), RightLeg: rotation(-70), LeftFoot: rotation(-8), RightFoot: rotation(15), ...compactRunArms(26, 58, 0.6) }, positions: { Hips: [8e-3, 4e-3, -0.025] } }
    ]
  },
  {
    id: "run-stop",
    basePose: "relaxed",
    frames: [
      { time: 0, rotations: { Hips: rotation(6, -4, -1), Spine: rotation(-3, 2, 0.7), Spine1: rotation(10, 3, -1), Spine2: rotation(-1, 2, 0.4), LeftUpLeg: rotation(35), RightUpLeg: rotation(-27), LeftLeg: rotation(-16), RightLeg: rotation(-53), ...compactRunArms(24) }, positions: { Hips: [8e-3, 0, -0.03] } },
      { time: 0.16, rotations: { Hips: rotation(-4, 2, 2), Spine: rotation(7, -1, -1), Spine1: rotation(13, -2, 1.5), LeftUpLeg: rotation(12), RightUpLeg: rotation(35), LeftLeg: rotation(-42), RightLeg: rotation(-58), LeftFoot: rotation(14), RightFoot: rotation(5), ...compactRunArms(-14, 62) }, positions: { Hips: [-0.018, -0.105, 0.035] } },
      { time: 0.34, rotations: { Hips: rotation(-2, -1, -1), Spine: rotation(4, 0, 0.5), Spine1: rotation(7, 0, -0.6), LeftUpLeg: rotation(20), RightUpLeg: rotation(15), LeftLeg: rotation(-38), RightLeg: rotation(-31), ...compactRunArms(-5, 38) }, positions: { Hips: [-6e-3, -0.07, 0.018] } },
      { time: 0.5, rotations: { Hips: rotation(1, 1, -1.5), Spine1: rotation(3, 0, -0.8), LeftUpLeg: rotation(7), RightUpLeg: rotation(11), LeftLeg: rotation(-15), RightLeg: rotation(-23), ...compactRunArms(0, 18) }, positions: { Hips: [-0.01, -0.033, 4e-3] } },
      { time: 0.64 }
    ]
  },
  createTurnRecipe("turn-left", 1),
  createTurnRecipe("turn-right", -1)
];

// studio/src/animation/recipes/stanceRecipes.ts
var STANCE_RECIPES = [
  {
    id: "idle",
    basePose: "relaxed",
    frames: [
      { time: 0 },
      {
        time: 0.7,
        rotations: {
          Spine1: rotation(2.15, 0.4, -0.9),
          Spine2: rotation(-0.25, -1, 0.45),
          LeftShoulder: rotation(0.1, 0, -1.35),
          RightShoulder: rotation(-0.1, 0, 0.65),
          Head: rotation(-0.1, 1.7, -0.2)
        },
        positions: { Hips: [-0.014, -0.013, -2e-3] }
      },
      {
        time: 1.42,
        rotations: {
          Hips: rotation(0, 0.8, -1.8),
          Spine: rotation(-0.8, -0.3, 1),
          Spine1: rotation(1.55, 0.9, -1.2),
          Spine2: rotation(-0.1, -0.6, 0.7),
          LeftUpLeg: rotation(2, -0.5, 1.8),
          RightUpLeg: rotation(5.2, 0.7, -1.5),
          LeftLeg: rotation(-5.5),
          RightLeg: rotation(-10.5),
          Head: rotation(0.2, 2.4, -0.25)
        },
        positions: { Hips: [-0.022, -0.02, -4e-3] }
      },
      {
        time: 2.1,
        rotations: {
          RightUpLeg: rotation(7, 0.8, -1.7),
          RightLeg: rotation(-13),
          RightFoot: rotation(4.8),
          RightArm: rotation(-23.5, 3, -7.2),
          RightForeArm: rotation(0, 4, 8),
          Head: rotation(-0.3, 0.4, 0.1)
        },
        positions: { Hips: [-0.024, -0.027, 0] }
      },
      {
        time: 2.72,
        rotations: {
          Hips: rotation(0, 1.4, -0.8),
          Spine: rotation(-1, -0.6, 0.4),
          Spine1: rotation(1.8, 0.5, -0.6),
          Head: rotation(-0.1, -1.1, 0.1)
        },
        positions: { Hips: [-8e-3, -0.016, 2e-3] }
      },
      {
        time: 3.42,
        rotations: {
          Hips: rotation(0, 2, 0.45),
          Spine: rotation(-1.4, -1, -0.25),
          Spine1: rotation(2.2, 0.2, 0.35),
          Spine2: rotation(-0.7, -1.5, -0.15),
          LeftUpLeg: rotation(5.1, -0.7, 0.6),
          RightUpLeg: rotation(3.4, 0.4, -0.4),
          LeftLeg: rotation(-9.5),
          RightLeg: rotation(-7.2),
          Head: rotation(0.25, -2.2, 0.2)
        },
        positions: { Hips: [8e-3, -0.014, 4e-3] }
      },
      {
        time: 4.1,
        rotations: {
          LeftUpLeg: rotation(7, -0.6, 0.4),
          LeftLeg: rotation(-13),
          LeftFoot: rotation(4.5),
          LeftArm: rotation(-22.5, -2, 6.1),
          LeftForeArm: rotation(0, -4, -7),
          Head: rotation(-0.15, -0.7, -0.1)
        },
        positions: { Hips: [0.015, -0.025, 0] }
      },
      {
        time: 4.82,
        rotations: {
          Hips: rotation(0, 1.4, -0.6),
          Spine1: rotation(2.3, 0.3, -0.55),
          Spine2: rotation(-0.65, -1, 0.25),
          Head: rotation(0, 0.5, -0.1)
        },
        positions: { Hips: [0, -0.012, -2e-3] }
      },
      { time: 5.6 }
    ]
  },
  {
    id: "combat-idle",
    basePose: "combat",
    frames: [
      { time: 0 },
      {
        time: 0.48,
        rotations: {
          Hips: rotation(0, -4, -2.8),
          Spine1: rotation(4.8, 3.4, -1.7),
          Spine2: rotation(-0.6, 4.3, 0.9),
          LeftForeArm: rotation(0, -8, -61),
          RightForeArm: rotation(0, 8, 66),
          Head: rotation(-0.8, -3, 0.2)
        },
        positions: { Hips: [-0.03, -0.058, -0.025] }
      },
      {
        time: 1.06,
        rotations: {
          Hips: rotation(0, -7, -1.8),
          Spine: rotation(2, 3.2, 0.8),
          Spine1: rotation(3.6, 5, -1.1),
          LeftUpLeg: rotation(10, -3, 3.5),
          RightUpLeg: rotation(20, 4, -3.5),
          LeftLeg: rotation(-21),
          RightLeg: rotation(-40),
          LeftArm: rotation(-21, -7, 18),
          RightArm: rotation(-19, 9, -23),
          Head: rotation(-1.2, -5, 0.5)
        },
        positions: { Hips: [-0.034, -0.071, -0.031] }
      },
      {
        time: 1.72,
        rotations: {
          Hips: rotation(0, -3, -2),
          Spine: rotation(2.7, 1.1, 1),
          Spine1: rotation(4.5, 3, -1.4),
          Spine2: rotation(-1.2, 4, 0.6),
          LeftForeArm: rotation(0, -8, -56),
          RightForeArm: rotation(0, 8, 62),
          Head: rotation(-0.7, -2, 0.15)
        },
        positions: { Hips: [-0.019, -0.061, -0.024] }
      },
      {
        time: 2.28,
        rotations: {
          Hips: rotation(0, -6, -2.7),
          Spine1: rotation(4.1, 4.4, -1.8),
          Spine2: rotation(-0.8, 5.1, 0.9),
          LeftUpLeg: rotation(13, -3, 2.6),
          RightUpLeg: rotation(17, 4, -2.7),
          LeftLeg: rotation(-26),
          RightLeg: rotation(-34),
          Head: rotation(-1.2, -4.6, 0.45)
        },
        positions: { Hips: [-0.029, -0.068, -0.032] }
      },
      { time: 2.8 }
    ]
  },
  {
    id: "idle-shift",
    basePose: "relaxed",
    frames: [
      { time: 0 },
      {
        time: 0.38,
        rotations: {
          Hips: rotation(0, 0, -2.2),
          Spine: rotation(-0.6, 0, 1.2),
          Spine1: rotation(1.2, 0, -1.3),
          LeftUpLeg: rotation(2, 0, 2),
          RightUpLeg: rotation(8, 0, -2),
          LeftLeg: rotation(-5),
          RightLeg: rotation(-15)
        },
        positions: { Hips: [-0.035, -0.03, -5e-3] }
      },
      {
        time: 0.82,
        rotations: {
          Hips: rotation(0, -1, -3.1),
          Spine: rotation(-0.4, 1, 1.8),
          Spine1: rotation(1, 1, -2),
          Spine2: rotation(-0.2, 0, 0.8),
          RightUpLeg: rotation(11, 0, -2.6),
          RightLeg: rotation(-20),
          RightFoot: rotation(6),
          Head: rotation(0, 2.5, -0.6)
        },
        positions: { Hips: [-0.052, -0.041, -8e-3] }
      },
      {
        time: 1.28,
        rotations: {
          Hips: rotation(0, 1.2, 1),
          Spine: rotation(-1.4, -1, -0.7),
          Spine1: rotation(2.1, -0.5, 0.9),
          LeftUpLeg: rotation(7, 0, 0.5),
          RightUpLeg: rotation(4, 0, -0.6),
          LeftLeg: rotation(-12),
          RightLeg: rotation(-8),
          Head: rotation(-0.2, -1.4, 0.25)
        },
        positions: { Hips: [0.018, -0.019, 4e-3] }
      },
      {
        time: 1.78,
        rotations: {
          Hips: rotation(0, 1.8, 0.2),
          Spine1: rotation(2, 0.2, 0),
          Spine2: rotation(-0.6, -1.4, 0.1),
          Head: rotation(0, 0.2, 0)
        },
        positions: { Hips: [4e-3, -0.012, 0] }
      },
      { time: 2.4 }
    ]
  },
  {
    id: "idle-scan",
    basePose: "relaxed",
    frames: [
      { time: 0 },
      { time: 0.5, rotations: { Head: rotation(-0.5, 8, -0.8), Neck: rotation(0, 3, -0.2) } },
      {
        time: 0.92,
        rotations: {
          Head: rotation(-1, 14, -1.1),
          Neck: rotation(0.5, 6, -0.4),
          Spine2: rotation(-0.4, 1.5, 0.3),
          RightShoulder: rotation(-0.5, 0, 1.3),
          RightForeArm: rotation(0, 4, 16),
          RightHand: rotation(-2, -4, 3)
        },
        positions: { Hips: [-0.016, -0.019, -2e-3] }
      },
      {
        time: 1.42,
        rotations: {
          Head: rotation(0.4, -9, 0.5),
          Neck: rotation(0, -4, 0.2),
          Spine2: rotation(-0.4, -2.4, 0.4),
          LeftShoulder: rotation(0, 0, -1.7),
          LeftForeArm: rotation(0, -4, -13),
          LeftHand: rotation(2, 4, -2)
        },
        positions: { Hips: [-8e-3, -0.016, 2e-3] }
      },
      { time: 2.1, rotations: { Head: rotation(-0.2, 1.5, -0.2), Neck: rotation(0.2, 0.8, -0.1) } },
      { time: 2.9 }
    ]
  }
];

// studio/src/animation/recipes/swimmingRecipes.ts
var SURFACE_SWIM_FRAMES = [
  {
    time: 0,
    rotations: {
      Hips: rotation(88, -5, 0),
      Spine: rotation(-4, 1, 0),
      Spine1: rotation(5, 2, 0),
      Spine2: rotation(-2, 2, 0),
      Neck: rotation(-5, 1, 0),
      Head: rotation(7, 0, 0),
      LeftShoulder: rotation(0, -2, -2),
      RightShoulder: rotation(0, 2, 2),
      LeftArm: rotation(-24, -2, 7),
      LeftForeArm: rotation(0, -4, -12),
      LeftHand: rotation(3, 0, -2),
      RightArm: rotation(150, 0, -2),
      RightForeArm: rotation(0, 4, 10),
      RightHand: rotation(-3, 0, 1),
      LeftUpLeg: rotation(-5, 0, 1),
      RightUpLeg: rotation(5, 0, -1),
      LeftLeg: rotation(-11),
      RightLeg: rotation(-22),
      LeftFoot: rotation(-10),
      RightFoot: rotation(-14),
      LeftToeBase: rotation(-3),
      RightToeBase: rotation(-4)
    },
    positions: { Hips: [0, 0.012, 0] }
  },
  {
    time: 0.2,
    rotations: {
      Hips: rotation(88, 8, -1),
      Spine: rotation(-3, -3, 1),
      Spine1: rotation(5, -5, 2),
      Spine2: rotation(-2, -7, 2),
      Neck: rotation(-4, 10, 1),
      Head: rotation(6, 22, 3),
      LeftShoulder: rotation(4, -5, -9),
      RightShoulder: rotation(-1, 2, 3),
      LeftArm: rotation(52, -10, 18),
      LeftForeArm: rotation(0, -14, -92),
      LeftHand: rotation(4, 4, -8),
      RightArm: rotation(146, 0, -3),
      RightForeArm: rotation(0, 4, 10),
      RightHand: rotation(-4, 0, 1),
      LeftUpLeg: rotation(6, 0, 1),
      RightUpLeg: rotation(-6, 0, -1),
      LeftLeg: rotation(-23),
      RightLeg: rotation(-10),
      LeftFoot: rotation(-15),
      RightFoot: rotation(-9),
      LeftToeBase: rotation(-4),
      RightToeBase: rotation(-3)
    },
    positions: { Hips: [8e-3, 0.026, 0] }
  },
  {
    time: 0.4,
    rotations: {
      Hips: rotation(88, 6, -1),
      Spine: rotation(-4, -3, 1),
      Spine1: rotation(5, -4, 1),
      Spine2: rotation(-2, -4, 1),
      Neck: rotation(-5, 5, 0),
      Head: rotation(7, 10, 1),
      LeftShoulder: rotation(2, -4, -7),
      RightShoulder: rotation(-1, 3, 3),
      LeftArm: rotation(108, -7, 12),
      LeftForeArm: rotation(0, -10, -68),
      LeftHand: rotation(2, 2, -4),
      RightArm: rotation(112, 3, -9),
      RightForeArm: rotation(0, 9, 52),
      RightHand: rotation(-2, -2, 4),
      LeftUpLeg: rotation(-4, 0, 1),
      RightUpLeg: rotation(5, 0, -1),
      LeftLeg: rotation(-11),
      RightLeg: rotation(-21),
      LeftFoot: rotation(-9),
      RightFoot: rotation(-15),
      LeftToeBase: rotation(-3),
      RightToeBase: rotation(-4)
    },
    positions: { Hips: [6e-3, 8e-3, 0] }
  },
  {
    time: 0.6,
    rotations: {
      Hips: rotation(88, 2, 0),
      Spine: rotation(-4, -1, 0),
      Spine1: rotation(5, -2, 0),
      Spine2: rotation(-2, -2, 0),
      Neck: rotation(-5, 1, 0),
      Head: rotation(7, 2, 0),
      LeftShoulder: rotation(0, -2, -3),
      RightShoulder: rotation(-2, 4, 5),
      LeftArm: rotation(150, 0, 2),
      LeftForeArm: rotation(0, -4, -12),
      LeftHand: rotation(2, 0, -2),
      RightArm: rotation(68, 5, -14),
      RightForeArm: rotation(0, 12, 72),
      RightHand: rotation(-3, -3, 5),
      LeftUpLeg: rotation(5, 0, 1),
      RightUpLeg: rotation(-5, 0, -1),
      LeftLeg: rotation(-22),
      RightLeg: rotation(-10),
      LeftFoot: rotation(-15),
      RightFoot: rotation(-9),
      LeftToeBase: rotation(-4),
      RightToeBase: rotation(-3)
    },
    positions: { Hips: [2e-3, -6e-3, 0] }
  },
  {
    time: 0.8,
    rotations: {
      Hips: rotation(88, -4, 1),
      Spine: rotation(-3, 2, -1),
      Spine1: rotation(5, 4, -1),
      Spine2: rotation(-2, 5, -1),
      Neck: rotation(-5, 0, 0),
      Head: rotation(7, 0, 0),
      LeftShoulder: rotation(-1, -1, 2),
      RightShoulder: rotation(-3, 5, 8),
      LeftArm: rotation(141, -3, 5),
      LeftForeArm: rotation(0, -8, -36),
      LeftHand: rotation(3, 1, -4),
      RightArm: rotation(22, 5, -11),
      RightForeArm: rotation(0, 14, 88),
      RightHand: rotation(-4, -2, 5),
      LeftUpLeg: rotation(-5, 0, 1),
      RightUpLeg: rotation(5, 0, -1),
      LeftLeg: rotation(-10),
      RightLeg: rotation(-22),
      LeftFoot: rotation(-9),
      RightFoot: rotation(-15),
      LeftToeBase: rotation(-3),
      RightToeBase: rotation(-4)
    },
    positions: { Hips: [-4e-3, 5e-3, 0] }
  },
  {
    time: 1,
    rotations: {
      Hips: rotation(88, -8, 1),
      Spine: rotation(-3, 3, -1),
      Spine1: rotation(5, 5, -2),
      Spine2: rotation(-2, 7, -2),
      Neck: rotation(-4, -1, 0),
      Head: rotation(6, -1, 0),
      LeftShoulder: rotation(-2, 2, 5),
      RightShoulder: rotation(-1, 4, 6),
      LeftArm: rotation(112, -4, 10),
      LeftForeArm: rotation(0, -12, -78),
      LeftHand: rotation(3, 2, -5),
      RightArm: rotation(-24, 2, -7),
      RightForeArm: rotation(0, 4, 14),
      RightHand: rotation(-3, 0, 2),
      LeftUpLeg: rotation(6, 0, 1),
      RightUpLeg: rotation(-6, 0, -1),
      LeftLeg: rotation(-23),
      RightLeg: rotation(-10),
      LeftFoot: rotation(-15),
      RightFoot: rotation(-9),
      LeftToeBase: rotation(-4),
      RightToeBase: rotation(-3)
    },
    positions: { Hips: [-8e-3, 0.025, 0] }
  },
  {
    time: 1.2,
    rotations: {
      Hips: rotation(88, -8, 1),
      Spine: rotation(-3, 3, -1),
      Spine1: rotation(5, 5, -2),
      Spine2: rotation(-2, 7, -2),
      Neck: rotation(-4, -2, 0),
      Head: rotation(6, -3, -1),
      LeftShoulder: rotation(-2, 3, 5),
      LeftArm: rotation(140, 0, 3),
      LeftForeArm: rotation(0, -8, -42),
      LeftHand: rotation(4, 0, -1),
      RightShoulder: rotation(-4, 5, 9),
      RightArm: rotation(52, 10, -18),
      RightForeArm: rotation(0, 14, 92),
      RightHand: rotation(-4, -4, 8),
      LeftUpLeg: rotation(-4, 0, 1),
      RightUpLeg: rotation(5, 0, -1),
      LeftLeg: rotation(-11),
      RightLeg: rotation(-21),
      LeftFoot: rotation(-9),
      RightFoot: rotation(-15),
      LeftToeBase: rotation(-3),
      RightToeBase: rotation(-4)
    },
    positions: { Hips: [-8e-3, 0.024, 0] }
  },
  {
    time: 1.4,
    rotations: {
      Hips: rotation(88, -6, 1),
      Spine: rotation(-4, 3, -1),
      Spine1: rotation(5, 4, -1),
      Spine2: rotation(-2, 4, -1),
      Neck: rotation(-5, -1, 0),
      Head: rotation(7, -1, 0),
      LeftShoulder: rotation(-1, 3, 4),
      RightShoulder: rotation(2, 4, 7),
      LeftArm: rotation(108, -3, 10),
      LeftForeArm: rotation(0, -12, -78),
      LeftHand: rotation(2, 2, -4),
      RightArm: rotation(108, 7, -12),
      RightForeArm: rotation(0, 10, 68),
      RightHand: rotation(-2, -2, 4),
      LeftUpLeg: rotation(5, 0, 1),
      RightUpLeg: rotation(-5, 0, -1),
      LeftLeg: rotation(-22),
      RightLeg: rotation(-10),
      LeftFoot: rotation(-15),
      RightFoot: rotation(-9),
      LeftToeBase: rotation(-4),
      RightToeBase: rotation(-3)
    },
    positions: { Hips: [-6e-3, 8e-3, 0] }
  }
];
var surfaceSwimFrames = [
  ...SURFACE_SWIM_FRAMES,
  {
    time: 1.52,
    rotations: {
      Hips: rotation(88, -5, 0),
      Spine: rotation(-4, 1, 0),
      Spine1: rotation(5, 2, 0),
      Spine2: rotation(-2, 2, 0),
      Neck: rotation(-5, 0, 0),
      Head: rotation(7, 0, 0),
      LeftShoulder: rotation(0, -1, 1),
      RightShoulder: rotation(0, 3, 4),
      LeftArm: rotation(35, -1, 8),
      LeftForeArm: rotation(0, -8, -40),
      LeftHand: rotation(3, 1, -3),
      RightArm: rotation(139, 3, -6),
      RightForeArm: rotation(0, 7, 28),
      RightHand: rotation(-3, -1, 3),
      LeftUpLeg: rotation(-1, 0, 1),
      RightUpLeg: rotation(1, 0, -1),
      LeftLeg: rotation(-15),
      RightLeg: rotation(-16),
      LeftFoot: rotation(-12),
      RightFoot: rotation(-12),
      LeftToeBase: rotation(-3),
      RightToeBase: rotation(-3)
    },
    positions: { Hips: [-2e-3, 0.01, 0] }
  },
  { ...SURFACE_SWIM_FRAMES[0], time: 1.6 }
];
var treadWaterFrames = [
  {
    time: 0,
    rotations: {
      Hips: rotation(1, -3, -2),
      Spine: rotation(3, 1, 1),
      Spine1: rotation(5, 2, -1),
      LeftArm: rotation(-18, -8, 26),
      RightArm: rotation(-18, 8, -26),
      LeftForeArm: rotation(0, -9, -66),
      RightForeArm: rotation(0, 9, 66),
      LeftUpLeg: rotation(34, -4, 6),
      RightUpLeg: rotation(12, 4, -5),
      LeftLeg: rotation(-72),
      RightLeg: rotation(-42),
      LeftFoot: rotation(-8),
      RightFoot: rotation(-15)
    },
    positions: { Hips: [-0.012, 0, 0] }
  },
  {
    time: 0.6,
    rotations: {
      Hips: rotation(-1, 2, 2),
      Spine: rotation(2, -1, -1),
      Spine1: rotation(4, -2, 1),
      LeftArm: rotation(-21, -5, 18),
      RightArm: rotation(-15, 7, -31),
      LeftForeArm: rotation(0, -8, -54),
      RightForeArm: rotation(0, 10, 74),
      LeftUpLeg: rotation(12, -3, 5),
      RightUpLeg: rotation(36, 3, -6),
      LeftLeg: rotation(-42),
      RightLeg: rotation(-74),
      LeftFoot: rotation(-16),
      RightFoot: rotation(-8)
    },
    positions: { Hips: [0.012, 0.018, 6e-3] }
  },
  {
    time: 1.2,
    rotations: {
      Hips: rotation(1, 3, -2),
      Spine: rotation(3, -1, 1),
      Spine1: rotation(5, -2, -1),
      LeftArm: rotation(-15, -7, 31),
      RightArm: rotation(-21, 5, -18),
      LeftForeArm: rotation(0, -10, -74),
      RightForeArm: rotation(0, 8, 54),
      LeftUpLeg: rotation(36, -3, 6),
      RightUpLeg: rotation(12, 3, -5),
      LeftLeg: rotation(-74),
      RightLeg: rotation(-42),
      LeftFoot: rotation(-8),
      RightFoot: rotation(-16)
    },
    positions: { Hips: [0.012, -8e-3, -4e-3] }
  },
  {
    time: 1.8,
    rotations: {
      Hips: rotation(-1, -2, 2),
      Spine: rotation(2, 1, -1),
      Spine1: rotation(4, 2, 1),
      LeftArm: rotation(-18, -7, 25),
      RightArm: rotation(-18, 8, -25),
      LeftForeArm: rotation(0, -9, -64),
      RightForeArm: rotation(0, 9, 64),
      LeftUpLeg: rotation(12, -4, 5),
      RightUpLeg: rotation(34, 4, -6),
      LeftLeg: rotation(-42),
      RightLeg: rotation(-72),
      LeftFoot: rotation(-15),
      RightFoot: rotation(-8)
    },
    positions: { Hips: [-0.012, 0.014, 4e-3] }
  }
];
var SWIMMING_RECIPES = [
  { id: "surface-swim", basePose: "relaxed", frames: surfaceSwimFrames },
  { id: "tread-water", basePose: "relaxed", frames: [...treadWaterFrames, { ...treadWaterFrames[0], time: 2.4 }] }
];

// studio/src/animation/recipes/twoHandedWeaponRecipes.ts
var TWO_HANDED_WEAPON_RECIPES = [
  {
    id: "two-handed-strike",
    basePose: "combat",
    frames: [
      {
        time: 0,
        rotations: {
          Hips: rotation(2, -5, -2.5),
          Spine: rotation(3, 1, 1),
          Spine1: rotation(5, 2, -1.5),
          Spine2: rotation(-1, 3, 0.5),
          Head: rotation(-1, -2, 0.5),
          LeftShoulder: rotation(0, -4, -2),
          RightShoulder: rotation(0, 4, 2),
          LeftArm: rotation(-40, -8, -19),
          RightArm: rotation(-38, 10, 20),
          LeftForeArm: rotation(0, -11, -82),
          RightForeArm: rotation(0, 12, 87),
          LeftHand: rotation(4, 8, -4),
          RightHand: rotation(-7, -13, 7),
          LeftUpLeg: rotation(18, -4, 3),
          RightUpLeg: rotation(27, 5, -3),
          LeftLeg: rotation(-35),
          RightLeg: rotation(-50),
          LeftFoot: rotation(6),
          RightFoot: rotation(9)
        },
        positions: { Hips: [-0.026, -0.078, -0.03] }
      },
      {
        time: 0.14,
        rotations: {
          Hips: rotation(5, -12, -3.5),
          Spine: rotation(5, -3, 1.5),
          Spine1: rotation(8, -4, -2),
          Spine2: rotation(2, -5, -1),
          Head: rotation(-3, 5, 1),
          LeftShoulder: rotation(-2, -5, -3),
          RightShoulder: rotation(-2, 5, 3),
          LeftArm: rotation(16, -4, -24),
          RightArm: rotation(19, 5, 25),
          LeftForeArm: rotation(0, -8, -42),
          RightForeArm: rotation(0, 8, 46),
          LeftHand: rotation(6, 9, -5),
          RightHand: rotation(-9, -14, 8),
          LeftUpLeg: rotation(20, -4, 4),
          RightUpLeg: rotation(39, 6, -4),
          LeftLeg: rotation(-39),
          RightLeg: rotation(-70),
          LeftFoot: rotation(7),
          RightFoot: rotation(12)
        },
        positions: { Hips: [-0.048, -0.135, -0.058] }
      },
      {
        time: 0.3,
        rotations: {
          Hips: rotation(3, -16, -3),
          Spine: rotation(3, -4, 1),
          Spine1: rotation(5, -5, -1.5),
          Spine2: rotation(0, -6, -1),
          Head: rotation(-4, 7, 1),
          LeftShoulder: rotation(-3, -4, -3),
          RightShoulder: rotation(-3, 4, 3),
          LeftArm: rotation(101, -2, -27),
          RightArm: rotation(105, 2, 28),
          LeftForeArm: rotation(0, -5, -18),
          RightForeArm: rotation(0, 5, 20),
          LeftHand: rotation(2, 6, -4),
          RightHand: rotation(-10, -10, 5),
          LeftUpLeg: rotation(18, -4, 3),
          RightUpLeg: rotation(36, 6, -4),
          LeftLeg: rotation(-36),
          RightLeg: rotation(-66),
          LeftFoot: rotation(6),
          RightFoot: rotation(11)
        },
        positions: { Hips: [-0.052, -0.122, -0.052] }
      },
      {
        time: 0.49,
        rotations: {
          Hips: rotation(-2, -18, -2),
          Spine: rotation(-5, -4, 1),
          Spine1: rotation(-10, -6, -1),
          Spine2: rotation(-7, -8, -1),
          Neck: rotation(2, 4, 0),
          Head: rotation(3, 7, 1),
          LeftShoulder: rotation(-4, -3, -2),
          RightShoulder: rotation(-4, 3, 2),
          LeftArm: rotation(141, -1, -24),
          RightArm: rotation(145, 1, 25),
          LeftForeArm: rotation(0, -5, -16),
          RightForeArm: rotation(0, 5, 18),
          LeftHand: rotation(-4, 4, -3),
          RightHand: rotation(-13, -57, 4),
          LeftUpLeg: rotation(17, -4, 3),
          RightUpLeg: rotation(34, 6, -4),
          LeftLeg: rotation(-34),
          RightLeg: rotation(-63),
          LeftFoot: rotation(5),
          RightFoot: rotation(11)
        },
        positions: { Hips: [-0.055, -0.112, -0.05] }
      },
      {
        time: 0.64,
        rotations: {
          Hips: rotation(-1, -4, -1),
          Spine: rotation(-4, -2, 0.5),
          Spine1: rotation(-7, -2, -0.5),
          Spine2: rotation(-5, -2, -0.5),
          Head: rotation(2, 3, 0.5),
          LeftShoulder: rotation(-3, -2, -2),
          RightShoulder: rotation(-3, 2, 2),
          LeftArm: rotation(121, -1, -29),
          RightArm: rotation(125, 1, 30),
          LeftForeArm: rotation(0, -6, -22),
          RightForeArm: rotation(0, 6, 25),
          LeftHand: rotation(-2, 3, -2),
          RightHand: rotation(-7, -3, 2),
          LeftUpLeg: rotation(21, -3, 3),
          RightUpLeg: rotation(28, 5, -3),
          LeftLeg: rotation(-41),
          RightLeg: rotation(-54),
          LeftFoot: rotation(7),
          RightFoot: rotation(9)
        },
        positions: { Hips: [-0.026, -0.098, -0.028] }
      },
      {
        time: 0.75,
        rotations: {
          Hips: rotation(5, 8, 1.5),
          Spine: rotation(3, 2, -1),
          Spine1: rotation(5, 4, 1),
          Spine2: rotation(2, 6, 1),
          Head: rotation(-2, -5, -0.5),
          LeftShoulder: rotation(0, 0, -2),
          RightShoulder: rotation(0, 0, 2),
          LeftArm: rotation(76, -1, -34),
          RightArm: rotation(80, 1, 35),
          LeftForeArm: rotation(0, -7, -27),
          RightForeArm: rotation(0, 7, 30),
          LeftHand: rotation(2, 2, -1),
          RightHand: rotation(-46, 2, -1),
          LeftUpLeg: rotation(27, -2, 3),
          RightUpLeg: rotation(20, 4, -3),
          LeftLeg: rotation(-51),
          RightLeg: rotation(-40),
          LeftFoot: rotation(9),
          RightFoot: rotation(6)
        },
        positions: { Hips: [0.012, -0.083, 0.012] }
      },
      {
        time: 0.82,
        rotations: {
          Hips: rotation(8, 20, 2.5),
          Spine: rotation(8, 4, -1.5),
          Spine1: rotation(12, 6, 1.5),
          Spine2: rotation(8, 8, 1),
          Neck: rotation(-3, -4, 0),
          Head: rotation(-6, -8, -1),
          LeftShoulder: rotation(2, 1, -2),
          RightShoulder: rotation(2, -1, 2),
          LeftArm: rotation(42, 0, -39),
          RightArm: rotation(45, 0, 40),
          LeftForeArm: rotation(0, -8, -36),
          RightForeArm: rotation(0, 8, 40),
          LeftHand: rotation(4, 1, -1),
          RightHand: rotation(-39, 7, -3),
          LeftUpLeg: rotation(33, -2, 4),
          RightUpLeg: rotation(14, 3, -3),
          LeftLeg: rotation(-60),
          RightLeg: rotation(-30),
          LeftFoot: rotation(10),
          RightFoot: rotation(3)
        },
        positions: { Hips: [0.042, -0.07, 0.052] }
      },
      {
        time: 1.02,
        rotations: {
          Hips: rotation(12, 18, 2),
          Spine: rotation(13, 4, -1),
          Spine1: rotation(18, 6, 1),
          Spine2: rotation(13, 7, 1),
          Head: rotation(-8, -7, -0.5),
          LeftShoulder: rotation(3, 1, -1),
          RightShoulder: rotation(3, -1, 1),
          LeftArm: rotation(-2, 0, -34),
          RightArm: rotation(1, 0, 35),
          LeftForeArm: rotation(0, -8, -39),
          RightForeArm: rotation(0, 8, 43),
          LeftHand: rotation(6, 0, 0),
          RightHand: rotation(15, 9, -4),
          LeftUpLeg: rotation(35, -2, 4),
          RightUpLeg: rotation(12, 3, -3),
          LeftLeg: rotation(-64),
          RightLeg: rotation(-27),
          LeftFoot: rotation(11),
          RightFoot: rotation(2)
        },
        positions: { Hips: [0.046, -0.088, 0.072] }
      },
      {
        time: 1.31,
        rotations: {
          Hips: rotation(5, 5, -1.5),
          Spine: rotation(6, 2, 0.5),
          Spine1: rotation(8, 2, -0.5),
          Spine2: rotation(3, 3, 0),
          Head: rotation(-3, -3, 0),
          LeftShoulder: rotation(0, -2, -2),
          RightShoulder: rotation(0, 2, 2),
          LeftArm: rotation(-34, -6, -23),
          RightArm: rotation(-33, 8, 24),
          LeftForeArm: rotation(0, -10, -70),
          RightForeArm: rotation(0, 11, 76),
          LeftHand: rotation(4, 6, -3),
          RightHand: rotation(-3, -8, 4),
          LeftUpLeg: rotation(23, -3, 3),
          RightUpLeg: rotation(23, 4, -3),
          LeftLeg: rotation(-44),
          RightLeg: rotation(-44),
          LeftFoot: rotation(7),
          RightFoot: rotation(7)
        },
        positions: { Hips: [8e-3, -0.082, 0.012] }
      },
      {
        time: 1.62,
        rotations: {
          Hips: rotation(2, -5, -2.5),
          Spine: rotation(3, 1, 1),
          Spine1: rotation(5, 2, -1.5),
          Spine2: rotation(-1, 3, 0.5),
          Head: rotation(-1, -2, 0.5),
          LeftShoulder: rotation(0, -4, -2),
          RightShoulder: rotation(0, 4, 2),
          LeftArm: rotation(-40, -8, -19),
          RightArm: rotation(-38, 10, 20),
          LeftForeArm: rotation(0, -11, -82),
          RightForeArm: rotation(0, 12, 87),
          LeftHand: rotation(4, 8, -4),
          RightHand: rotation(-7, -13, 7),
          LeftUpLeg: rotation(18, -4, 3),
          RightUpLeg: rotation(27, 5, -3),
          LeftLeg: rotation(-35),
          RightLeg: rotation(-50),
          LeftFoot: rotation(6),
          RightFoot: rotation(9)
        },
        positions: { Hips: [-0.026, -0.078, -0.03] }
      }
    ]
  }
];

// studio/src/animation/recipes/spellVariants.ts
function castingFrame(time, shape) {
  const lean = shape.torsoLean ?? 3;
  const yaw = shape.torsoYaw ?? 0;
  const leftKnee = shape.leftKnee ?? 32;
  const rightKnee = shape.rightKnee ?? 38;
  const spread = shape.armSpread ?? 0;
  return {
    time,
    rotations: {
      Hips: rotation(2, shape.hipYaw ?? 0, -1.5),
      Spine: rotation(lean * 0.3, yaw * 0.25, 0.6),
      Spine1: rotation(lean * 0.45, yaw * 0.4, -0.8),
      Spine2: rotation(lean * 0.25, yaw * 0.35, 0.3),
      Neck: rotation(-lean * 0.42, -yaw * 0.18, 0),
      Head: rotation(-lean * 0.22, -yaw * 0.2, 0),
      LeftUpLeg: rotation(leftKnee * 0.48, -3, 3),
      RightUpLeg: rotation(rightKnee * 0.48, 4, -3),
      LeftLeg: rotation(-leftKnee),
      RightLeg: rotation(-rightKnee),
      LeftFoot: rotation(leftKnee * 0.16, 0, -2),
      RightFoot: rotation(rightKnee * 0.16, 0, 2),
      LeftShoulder: rotation(0, -2, -2),
      RightShoulder: rotation(0, 2, 2),
      LeftArm: rotation(-22, -5 - spread, -shape.leftArm),
      RightArm: rotation(-22, 5 + spread, shape.rightArm),
      LeftForeArm: rotation(0, -7, -shape.leftElbow),
      RightForeArm: rotation(0, 7, shape.rightElbow),
      LeftHand: rotation(1, 4, -3),
      RightHand: rotation(-1, -4, 3)
    },
    positions: {
      Hips: [shape.hipShift ?? 0, -shape.crouch, shape.hipBack ?? -0.02]
    }
  };
}
var fireball = {
  id: "fireball",
  basePose: "combat",
  frames: [
    { time: 0 },
    castingFrame(0.12, {
      crouch: 0.085,
      hipShift: 0.025,
      hipBack: -0.05,
      hipYaw: -8,
      torsoLean: 5,
      torsoYaw: 5,
      leftKnee: 39,
      rightKnee: 52,
      leftArm: 18,
      rightArm: 18,
      leftElbow: 72,
      rightElbow: 72
    }),
    castingFrame(SPELL_MOTIONS.fireball.gather, {
      crouch: 0.105,
      hipShift: 0.035,
      hipBack: -0.065,
      hipYaw: -11,
      torsoLean: 7,
      torsoYaw: 7,
      leftKnee: 44,
      rightKnee: 61,
      leftArm: 25,
      rightArm: 25,
      leftElbow: 78,
      rightElbow: 78
    }),
    castingFrame(0.5, {
      crouch: 0.1,
      hipShift: 0.025,
      hipBack: -0.055,
      hipYaw: -5,
      torsoLean: 6,
      torsoYaw: 3,
      leftKnee: 42,
      rightKnee: 57,
      leftArm: 43,
      rightArm: 43,
      leftElbow: 68,
      rightElbow: 68
    }),
    castingFrame(SPELL_MOTIONS.fireball.release[0], {
      crouch: 0.075,
      hipShift: -5e-3,
      hipBack: 0.025,
      hipYaw: 8,
      torsoLean: 11,
      torsoYaw: -5,
      leftKnee: 35,
      rightKnee: 45,
      leftArm: 52,
      rightArm: 52,
      leftElbow: 23,
      rightElbow: 23
    }),
    castingFrame(0.9, {
      crouch: 0.07,
      hipShift: -0.01,
      hipBack: 0.035,
      hipYaw: 7,
      torsoLean: 9,
      torsoYaw: -4,
      leftKnee: 33,
      rightKnee: 43,
      leftArm: 48,
      rightArm: 48,
      leftElbow: 18,
      rightElbow: 18
    }),
    castingFrame(SPELL_MOTIONS.fireball.recover, {
      crouch: 0.08,
      hipShift: 0.01,
      hipBack: -0.015,
      torsoLean: 5,
      leftKnee: 34,
      rightKnee: 45,
      leftArm: 25,
      rightArm: 25,
      leftElbow: 58,
      rightElbow: 58
    }),
    { time: SPELL_MOTIONS.fireball.duration }
  ]
};
var lightning = {
  id: "lightning",
  basePose: "combat",
  frames: [
    { time: 0 },
    castingFrame(SPELL_MOTIONS.lightning.gather, {
      crouch: 0.09,
      hipBack: -0.035,
      torsoLean: 2,
      leftKnee: 43,
      rightKnee: 49,
      leftArm: 58,
      rightArm: 58,
      leftElbow: 56,
      rightElbow: 56,
      armSpread: 4
    }),
    castingFrame(0.48, {
      crouch: 0.1,
      hipBack: -0.04,
      torsoLean: -3,
      leftKnee: 46,
      rightKnee: 52,
      leftArm: 132,
      rightArm: 132,
      leftElbow: 26,
      rightElbow: 26,
      armSpread: 2
    }),
    castingFrame(0.62, {
      crouch: 0.09,
      hipBack: -0.025,
      torsoLean: -1,
      leftKnee: 42,
      rightKnee: 48,
      leftArm: 142,
      rightArm: 142,
      leftElbow: 20,
      rightElbow: 20
    }),
    castingFrame(SPELL_MOTIONS.lightning.release[0], {
      crouch: 0.11,
      hipBack: 0.025,
      torsoLean: 12,
      leftKnee: 51,
      rightKnee: 58,
      leftArm: 44,
      rightArm: 44,
      leftElbow: 24,
      rightElbow: 24
    }),
    castingFrame(0.94, {
      crouch: 0.105,
      hipBack: 0.02,
      torsoLean: 10,
      leftKnee: 49,
      rightKnee: 56,
      leftArm: 39,
      rightArm: 39,
      leftElbow: 20,
      rightElbow: 20
    }),
    castingFrame(SPELL_MOTIONS.lightning.recover, {
      crouch: 0.085,
      hipBack: -0.01,
      torsoLean: 5,
      leftKnee: 37,
      rightKnee: 45,
      leftArm: 29,
      rightArm: 29,
      leftElbow: 58,
      rightElbow: 58
    }),
    { time: SPELL_MOTIONS.lightning.duration }
  ]
};
var missiles = {
  id: "energy-missiles",
  basePose: "combat",
  sampleRate: 120,
  frames: [
    { time: 0 },
    castingFrame(SPELL_MOTIONS["energy-missiles"].gather, {
      crouch: 0.09,
      hipBack: -0.035,
      torsoLean: 7,
      leftKnee: 43,
      rightKnee: 51,
      leftArm: 31,
      rightArm: 31,
      leftElbow: 82,
      rightElbow: 82
    }),
    castingFrame(SPELL_MOTIONS["energy-missiles"].release[0], {
      crouch: 0.085,
      hipShift: -0.018,
      hipBack: 0.01,
      hipYaw: 10,
      torsoLean: 9,
      torsoYaw: 12,
      leftKnee: 39,
      rightKnee: 47,
      leftArm: 28,
      rightArm: 50,
      leftElbow: 76,
      rightElbow: 18
    }),
    castingFrame(0.51, {
      crouch: 0.09,
      hipBack: -0.025,
      torsoLean: 7,
      leftKnee: 44,
      rightKnee: 49,
      leftArm: 31,
      rightArm: 29,
      leftElbow: 80,
      rightElbow: 72
    }),
    castingFrame(SPELL_MOTIONS["energy-missiles"].release[1], {
      crouch: 0.085,
      hipShift: 0.018,
      hipBack: 0.01,
      hipYaw: -10,
      torsoLean: 9,
      torsoYaw: -12,
      leftKnee: 40,
      rightKnee: 46,
      leftArm: 50,
      rightArm: 28,
      leftElbow: 18,
      rightElbow: 76
    }),
    castingFrame(0.68, {
      crouch: 0.09,
      hipBack: -0.025,
      torsoLean: 7,
      leftKnee: 42,
      rightKnee: 51,
      leftArm: 29,
      rightArm: 31,
      leftElbow: 72,
      rightElbow: 80
    }),
    castingFrame(SPELL_MOTIONS["energy-missiles"].release[2], {
      crouch: 0.075,
      hipShift: -0.02,
      hipBack: 0.02,
      hipYaw: 12,
      torsoLean: 11,
      torsoYaw: 14,
      leftKnee: 38,
      rightKnee: 45,
      leftArm: 27,
      rightArm: 54,
      leftElbow: 78,
      rightElbow: 14
    }),
    castingFrame(SPELL_MOTIONS["energy-missiles"].recover, {
      crouch: 0.085,
      hipBack: -0.01,
      torsoLean: 5,
      leftKnee: 38,
      rightKnee: 46,
      leftArm: 26,
      rightArm: 27,
      leftElbow: 61,
      rightElbow: 63
    }),
    { time: SPELL_MOTIONS["energy-missiles"].duration }
  ]
};
var healing = {
  id: "healing",
  basePose: "combat",
  frames: [
    { time: 0 },
    castingFrame(SPELL_MOTIONS.healing.gather, {
      crouch: 0.075,
      hipBack: -0.02,
      torsoLean: 1,
      leftKnee: 34,
      rightKnee: 42,
      leftArm: 76,
      rightArm: 76,
      leftElbow: 45,
      rightElbow: 45,
      armSpread: 12
    }),
    castingFrame(0.58, {
      crouch: 0.065,
      hipBack: -0.015,
      torsoLean: -2,
      leftKnee: 31,
      rightKnee: 39,
      leftArm: 116,
      rightArm: 116,
      leftElbow: 34,
      rightElbow: 34,
      armSpread: 10
    }),
    castingFrame(0.82, {
      crouch: 0.085,
      hipBack: -0.02,
      torsoLean: 3,
      leftKnee: 37,
      rightKnee: 44,
      leftArm: 42,
      rightArm: 42,
      leftElbow: 98,
      rightElbow: 98
    }),
    castingFrame(SPELL_MOTIONS.healing.release[0], {
      crouch: 0.07,
      hipBack: 5e-3,
      torsoLean: 4,
      leftKnee: 34,
      rightKnee: 41,
      leftArm: 52,
      rightArm: 52,
      leftElbow: 34,
      rightElbow: 34,
      armSpread: 16
    }),
    castingFrame(1.25, {
      crouch: 0.07,
      hipBack: 5e-3,
      torsoLean: 3,
      leftKnee: 34,
      rightKnee: 41,
      leftArm: 48,
      rightArm: 48,
      leftElbow: 38,
      rightElbow: 38,
      armSpread: 18
    }),
    castingFrame(SPELL_MOTIONS.healing.recover, {
      crouch: 0.075,
      hipBack: -0.01,
      torsoLean: 2,
      leftKnee: 35,
      rightKnee: 42,
      leftArm: 31,
      rightArm: 31,
      leftElbow: 61,
      rightElbow: 61,
      armSpread: 6
    }),
    { time: SPELL_MOTIONS.healing.duration }
  ]
};
var ELEMENTAL_SPELL_RECIPES = [fireball, lightning, missiles, healing];

// studio/src/animation/sampleMotionCurve.ts
function createMotionCurve(times, values, loop = false) {
  const count = times.length;
  const slopes = times.slice(1).map((time, i) => (values[i + 1] - values[i]) / (time - times[i]));
  const tangents = new Array(count).fill(0);
  const tangent = (left, right, leftSpan, rightSpan) => {
    if (left * right <= 0) return 0;
    const w1 = 2 * rightSpan + leftSpan;
    const w2 = rightSpan + 2 * leftSpan;
    return (w1 + w2) / (w1 / left + w2 / right);
  };
  for (let i = 1; i < count - 1; i += 1) {
    tangents[i] = tangent(slopes[i - 1], slopes[i], times[i] - times[i - 1], times[i + 1] - times[i]);
  }
  if (loop && Math.abs(values[0] - values[count - 1]) < 1e-5) {
    tangents[0] = tangents[count - 1] = tangent(slopes.at(-1), slopes[0], times[count - 1] - times[count - 2], times[1] - times[0]);
  }
  return (time) => {
    if (time <= times[0]) return values[0];
    if (time >= times[count - 1]) return values[count - 1];
    let i = 0;
    while (i < count - 2 && time > times[i + 1]) i += 1;
    const span = times[i + 1] - times[i];
    const u = (time - times[i]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * values[i] + (u3 - 2 * u2 + u) * span * tangents[i] + (-2 * u3 + 3 * u2) * values[i + 1] + (u3 - u2) * span * tangents[i + 1];
  };
}
function motionSampleTimes(keys, fps = 60) {
  const duration = keys.at(-1) ?? 0;
  const count = Math.ceil(duration * fps);
  return [.../* @__PURE__ */ new Set([...keys, ...Array.from({ length: count + 1 }, (_, i) => i * duration / count)])].sort((a, b) => a - b);
}

// studio/src/animation/recipes/gaitPosture.ts
function withGaitPosture(recipe) {
  if (recipe.id !== "walk" && recipe.id !== "run") return recipe;
  const base = BASE_POSES[recipe.basePose ?? "relaxed"];
  const running = recipe.id === "run";
  const heights = recipe.frames.map((frame) => (frame.positions?.Hips ?? base.positions.Hips)[1]);
  const low = Math.min(...heights);
  const span = Math.max(...heights) - low;
  return {
    ...recipe,
    frames: recipe.frames.map((frame, index) => {
      const rotations = { ...frame.rotations };
      const pose = (name) => rotations[name] ?? base.rotations[name] ?? [0, 0, 0];
      const lift = span > 0 ? (heights[index] - low) / span : 0.5;
      const recoil = running ? degrees(-4 + 16 * lift) : 0;
      for (const [name, share] of [["Spine", 0.5], ["Spine1", 0.35], ["Spine2", 0.15]]) {
        const [x, y, z] = pose(name);
        rotations[name] = [x + recoil * share, y, z];
      }
      const chain = ["Hips", "Spine", "Spine1", "Spine2"].map(pose);
      const pitch = chain.reduce((sum, angle) => sum + angle[0], 0);
      const roll = chain.reduce((sum, angle) => sum + angle[2], 0);
      const neck = pose("Neck");
      const head = pose("Head");
      const gazePitch = running ? degrees(3) : degrees(0.5);
      rotations.Neck = [(gazePitch - pitch) * 0.72, neck[1], -roll * 0.65];
      rotations.Head = [(gazePitch - pitch) * 0.28, head[1], -roll * 0.35];
      return { ...frame, rotations };
    })
  };
}

// studio/src/animation/correctRelaxedIdlePosture.ts
import * as T from "three";
var POSTURE_TRACKS = /* @__PURE__ */ new Set([
  "Spine2.quaternion",
  "LeftShoulder.quaternion",
  "RightShoulder.quaternion",
  "LeftArm.quaternion",
  "RightArm.quaternion",
  "LeftForeArm.quaternion",
  "RightForeArm.quaternion",
  "LeftHand.quaternion",
  "RightHand.quaternion"
]);
function widenRelaxedIdleArms(clip) {
  const spread = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), T.MathUtils.degToRad(9));
  const pose = new T.Quaternion();
  for (const track of clip.tracks) {
    if (!/^(Left|Right)Arm\.quaternion$/.test(track.name)) continue;
    for (let key = 0; key < track.values.length; key += 4) {
      pose.fromArray(track.values, key).multiply(spread).normalize().toArray(track.values, key);
    }
  }
  return clip;
}
function correctRelaxedIdlePosture(source, relaxed2) {
  const corrected = source.clone();
  const reference2 = new Map(relaxed2.tracks.map((track) => [track.name, track]));
  const anchorInverse = new T.Quaternion(), rest = new T.Quaternion(), motion = new T.Quaternion();
  const subdued = new T.Quaternion(), result = new T.Quaternion();
  const localForward = new T.Quaternion(), bendAxis = new T.Vector3(0, 0, 1);
  for (const track of corrected.tracks) {
    if (!POSTURE_TRACKS.has(track.name)) continue;
    const calibration = reference2.get(track.name);
    if (!calibration || track.getValueSize() !== 4 || calibration.getValueSize() !== 4) continue;
    anchorInverse.fromArray(track.values, 0).normalize().invert();
    rest.fromArray(calibration.values, 0).normalize();
    if (track.name === "LeftArm.quaternion" || track.name === "RightArm.quaternion") {
      localForward.setFromAxisAngle(bendAxis, T.MathUtils.degToRad(track.name === "LeftArm.quaternion" ? -10 : 10));
      rest.multiply(localForward);
    }
    for (let key = 0; key < track.values.length; key += 4) {
      motion.fromArray(track.values, key).premultiply(anchorInverse).normalize();
      subdued.identity().slerp(motion, 0.55);
      result.copy(rest).multiply(subdued).normalize().toArray(track.values, key);
    }
  }
  return corrected;
}

// studio/src/animation/relaxedStance.ts
var RELAXED_STANCE_MOVES = ["idle", "idle-shift", "idle-scan"];

// studio/src/animation/createProceduralClips.ts
var RECIPES = [
  ...STANCE_RECIPES,
  ...LOCOMOTION_RECIPES,
  ...AIRBORNE_RECIPES,
  ...SWIMMING_RECIPES,
  ...COMBAT_RECIPES,
  ...TWO_HANDED_WEAPON_RECIPES,
  ...ELEMENTAL_SPELL_RECIPES,
  JUMP_ARC_RECIPE,
  DEATH_RECIPE
];
function requireObject(root, name) {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`The rig is missing bone \u201C${name}\u201D.`);
  return object;
}
function requireFiniteVector(value, context) {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new Error(`${context} must contain three finite values.`);
  }
}
function validateFrame(frame, previousTime, recipe) {
  if (!Number.isFinite(frame.time) || frame.time < 0 || frame.time <= previousTime) {
    throw new Error(`${recipe.id} has a non-increasing frame time at ${frame.time}.`);
  }
  for (const [name, value] of Object.entries(frame.rotations ?? {})) {
    requireFiniteVector(value, `${recipe.id}.${name}.rotation`);
  }
  for (const [name, value] of Object.entries(frame.positions ?? {})) {
    requireFiniteVector(value, `${recipe.id}.${name}.position`);
  }
}
function validateRecipes() {
  const ids = /* @__PURE__ */ new Set();
  for (const recipe of RECIPES) {
    if (ids.has(recipe.id)) throw new Error(`Duplicate animation recipe for ${recipe.id}.`);
    ids.add(recipe.id);
    const move = MOVE_CATALOG.find((candidate) => candidate.id === recipe.id);
    if (!move) throw new Error(`Animation recipe ${recipe.id} has no catalog entry.`);
    if (recipe.frames.length < 2 || recipe.frames[0]?.time !== 0) {
      throw new Error(`${recipe.id} must start at zero and contain at least two frames.`);
    }
    let previousTime = -1;
    for (const frame of recipe.frames) {
      validateFrame(frame, previousTime, recipe);
      previousTime = frame.time;
    }
    const lastTime = recipe.frames.at(-1)?.time;
    if (Math.abs((lastTime ?? 0) - move.duration) > 1e-4) {
      throw new Error(`${recipe.id} ends at ${lastTime}, but its catalog duration is ${move.duration}.`);
    }
  }
  for (const move of MOVE_CATALOG) {
    if (!ids.has(move.id)) throw new Error(`Missing animation recipe for ${move.id}.`);
  }
}
function createClip(root, recipe) {
  const move = MOVE_CATALOG.find((candidate) => candidate.id === recipe.id);
  if (!move) throw new Error(`Missing move definition for ${recipe.id}.`);
  const basePose = BASE_POSES[recipe.basePose ?? "relaxed"];
  const rotationNames = /* @__PURE__ */ new Set([
    ...Object.keys(basePose.rotations),
    ...recipe.frames.flatMap((frame) => Object.keys(frame.rotations ?? {}))
  ]);
  const positionNames = /* @__PURE__ */ new Set([
    ...Object.keys(basePose.positions),
    ...recipe.frames.flatMap((frame) => Object.keys(frame.positions ?? {}))
  ]);
  const keyTimes = recipe.frames.map((frame) => frame.time);
  const times = motionSampleTimes(keyTimes, recipe.sampleRate ?? 60);
  const tracks = [];
  for (const name of rotationNames) {
    const object = requireObject(root, name);
    const values = [];
    const curves3 = [0, 1, 2].map((axis) => createMotionCurve(keyTimes, recipe.frames.map((frame) => (frame.rotations?.[name] ?? basePose.rotations[name] ?? [0, 0, 0])[axis]), move.loop));
    for (const time of times) {
      const [x, y, z] = curves3.map((curve) => curve(time));
      const delta = new THREE2.Quaternion().setFromEuler(new THREE2.Euler(x, y, z, "XYZ"));
      const result = object.quaternion.clone().multiply(delta).normalize();
      values.push(result.x, result.y, result.z, result.w);
    }
    tracks.push(new THREE2.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  }
  for (const name of positionNames) {
    const object = requireObject(root, name);
    const values = [];
    const curves3 = [0, 1, 2].map((axis) => createMotionCurve(keyTimes, recipe.frames.map((frame) => (frame.positions?.[name] ?? basePose.positions[name] ?? [0, 0, 0])[axis]), move.loop));
    for (const time of times) {
      const [x = 0, y = 0, z = 0] = curves3.map((curve) => curve(time));
      values.push(object.position.x + x, object.position.y + y, object.position.z + z);
    }
    const track = new THREE2.VectorKeyframeTrack(`${name}.position`, times, values);
    tracks.push(track);
  }
  const clip = new THREE2.AnimationClip(move.id, move.duration, tracks).optimize();
  return RELAXED_STANCE_MOVES.includes(move.id) ? widenRelaxedIdleArms(clip) : clip;
}
function createProceduralClips(root) {
  validateRecipes();
  return new Map(RECIPES.map((recipe) => [recipe.id, createClip(root, withGaitPosture(recipe))]));
}

// studio/src/animation/loadAuthoredAnimationLibrary.ts
import * as THREE3 from "three";
var DIRECT_BINDINGS = [
  { move: "idle", candidates: ["Idle_Loop"] },
  { move: "combat-idle", candidates: ["Idle_Shield_Loop", "Sword_Idle", "Sword_Idle_Loop"] },
  { move: "walk", candidates: ["Walk_Loop"] },
  { move: "run", candidates: ["Sprint_Loop", "Jog_Fwd_Loop"] },
  { move: "surface-swim", candidates: ["Swim_Fwd_Loop"] },
  { move: "tread-water", candidates: ["Swim_Idle_Loop"] }
];
var normalizeName = (name) => name.split("|").at(-1)?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
function findClip(clips, candidates) {
  const byName = new Map(clips.map((clip) => [normalizeName(clip.name), clip]));
  return candidates.map(normalizeName).map((name) => byName.get(name)).find(Boolean);
}
function namedClone(source, move) {
  const clip = source.clone();
  clip.name = move;
  clip.resetDuration();
  return clip;
}
function joinClips(move, segments) {
  const trackNames = new Set(segments.flatMap((clip) => clip.tracks.map((track) => track.name)));
  const tracks = [];
  for (const trackName of trackNames) {
    const sourceTracks = segments.map((clip) => clip.tracks.find((track) => track.name === trackName));
    const prototype = sourceTracks.find(Boolean);
    if (!prototype) continue;
    const valueSize = prototype.getValueSize();
    const times = [];
    const values = [];
    let offset = 0;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const track = sourceTracks[segmentIndex];
      if (track) {
        for (let key = 0; key < track.times.length; key += 1) {
          if (segmentIndex > 0 && key === 0 && track.times[key] === 0) continue;
          times.push(offset + track.times[key]);
          for (let value = 0; value < valueSize; value += 1) values.push(track.values[key * valueSize + value]);
        }
      }
      offset += segment.duration;
    }
    const joined = prototype.clone();
    joined.times = new Float32Array(times);
    joined.values = new Float32Array(values);
    tracks.push(joined);
  }
  const duration = segments.reduce((sum, clip) => sum + clip.duration, 0);
  return new THREE3.AnimationClip(move, duration, tracks).optimize();
}
function addMapping(clips, mappings, move, clip, sourceClips, eventPhases) {
  clips.set(move, clip);
  mappings.push({ move, sourceClips, duration: clip.duration, ...eventPhases ? { eventPhases } : {} });
}
function createAuthoredAnimationLibrary(bank) {
  if (bank.version !== 1 || !Array.isArray(bank.clips)) throw new Error("Unsupported authored animation bank.");
  const parsed = bank.clips.map((json) => THREE3.AnimationClip.parse(json));
  const clips = /* @__PURE__ */ new Map();
  const mappings = [];
  for (const binding of DIRECT_BINDINGS) {
    const source = findClip(parsed, binding.candidates);
    if (!source) continue;
    addMapping(clips, mappings, binding.move, namedClone(source, binding.move), [source.name]);
  }
  const lightStrike = findClip(parsed, ["Sword_Regular_B", "Regular_B"]);
  const lightRecovery = findClip(parsed, ["Sword_Regular_B_Rec", "Regular_B_Rec"]);
  if (lightStrike && lightRecovery) {
    const clip = joinClips("light-attack", [lightStrike, lightRecovery]);
    addMapping(clips, mappings, "light-attack", clip, [lightStrike.name, lightRecovery.name], {
      "swing-trail": 0.1,
      "swing-impact": 0.16
    });
  }
  const heavyStrike = findClip(parsed, ["Sword_Dash"]);
  if (heavyStrike) {
    addMapping(clips, mappings, "heavy-attack", namedClone(heavyStrike, "heavy-attack"), [heavyStrike.name], {
      "swing-trail": 0.15,
      "swing-impact": 0.2
    });
  }
  const eventPhases = /* @__PURE__ */ new Map();
  for (const mapping of mappings) if (mapping.eventPhases) eventPhases.set(mapping.move, mapping.eventPhases);
  const travelSpeeds = /* @__PURE__ */ new Map();
  if (clips.has("walk")) {
    for (const move of ["walk-start", "walk", "walk-stop"]) travelSpeeds.set(move, 0.89);
  }
  if (clips.has("run")) {
    for (const move of ["run-start", "run", "run-stop"]) travelSpeeds.set(move, 7.98);
  }
  return {
    clips,
    authoredMoves: new Set(clips.keys()),
    eventPhases,
    travelSpeeds,
    mappings,
    sources: bank.sources ?? [],
    available: clips.size > 0
  };
}
async function loadAuthoredAnimationLibrary(url = "/animations/quaternius-retargeted.json") {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Animation bank request failed with ${response.status}.`);
    return createAuthoredAnimationLibrary(await response.json());
  } catch (error) {
    console.warn("Using procedural animation fallback.", error);
    return {
      clips: /* @__PURE__ */ new Map(),
      authoredMoves: /* @__PURE__ */ new Set(),
      eventPhases: /* @__PURE__ */ new Map(),
      mappings: [],
      sources: [],
      available: false,
      travelSpeeds: /* @__PURE__ */ new Map()
    };
  }
}
function mergeAnimationLibraries(procedural, authored) {
  const merged = new Map(procedural);
  for (const [move, clip] of authored) merged.set(move, clip);
  const sourceIdle = authored.get("idle"), relaxedIdle = procedural.get("idle");
  if (sourceIdle && relaxedIdle) merged.set("idle", correctRelaxedIdlePosture(sourceIdle, relaxedIdle));
  return merged;
}

// studio/src/animation/createSpellcastingPose.ts
import * as THREE6 from "three";

// studio/src/animation/spellcastingMotion.ts
import * as THREE4 from "three";
var HAND_TIMES = [0, 0.12, 0.22, 0.34, 0.46, 0.58, 0.624, 0.74, 0.84, 1];
var LEFT_HAND_POINTS = [
  [0.2, 1.12, 0.34],
  [0.18, 1.16, 0.39],
  [0.17, 1.2, 0.43],
  [0.13, 1.34, 0.43],
  [0.16, 1.08, 0.43],
  [0.12, 1.19, 0.42],
  [0.11, 1.19, 0.46],
  [0.1, 1.19, 0.55],
  [0.12, 1.17, 0.58],
  [0.2, 1.12, 0.34]
];
var RIGHT_HAND_POINTS = [
  [-0.2, 1.12, 0.34],
  [-0.18, 1.16, 0.39],
  [-0.17, 1.2, 0.43],
  [-0.16, 1.08, 0.43],
  [-0.13, 1.34, 0.43],
  [-0.12, 1.19, 0.42],
  [-0.11, 1.19, 0.46],
  [-0.1, 1.19, 0.55],
  [-0.12, 1.17, 0.58],
  [-0.2, 1.12, 0.34]
];
function pointCurves(points) {
  return [0, 1, 2].map((axis) => createMotionCurve(HAND_TIMES, points.map((point) => point[axis])));
}
var leftHandCurves = pointCurves(LEFT_HAND_POINTS);
var rightHandCurves = pointCurves(RIGHT_HAND_POINTS);
function samplePoint(curves3, time, target) {
  const t = THREE4.MathUtils.clamp(time, 0, 1);
  return target.set(curves3[0](t), curves3[1](t), curves3[2](t));
}
function sampleSpellHandLocalPositions(normalizedTime, leftTarget, rightTarget) {
  samplePoint(leftHandCurves, normalizedTime, leftTarget);
  samplePoint(rightHandCurves, normalizedTime, rightTarget);
}
function spellHandInfluence(normalizedTime) {
  const time = THREE4.MathUtils.clamp(normalizedTime, 0, 1);
  const enter = THREE4.MathUtils.smoothstep(time, 0.04, 0.18);
  const exit = 1 - THREE4.MathUtils.smoothstep(time, 0.84, 0.98);
  return enter * exit;
}
function sampleSpellOrbLocalPosition(normalizedTime, target) {
  const time = THREE4.MathUtils.clamp(normalizedTime, 0, 1);
  const release = THREE4.MathUtils.smootherstep(time, 0.624, 0.9);
  target.set(0, 1.2, THREE4.MathUtils.lerp(0.46, 2.15, release));
  return target;
}
function spellOrbOpacity(normalizedTime) {
  const time = THREE4.MathUtils.clamp(normalizedTime, 0, 1);
  const gather = THREE4.MathUtils.smoothstep(time, 0.12, 0.22);
  const releaseFade = 1 - THREE4.MathUtils.smoothstep(time, 0.82, 0.96);
  return gather * releaseFade;
}
function spellOrbScale(normalizedTime) {
  const time = THREE4.MathUtils.clamp(normalizedTime, 0, 1);
  const gather = THREE4.MathUtils.smoothstep(time, 0.12, 0.28);
  const pulse = Math.sin(time * Math.PI * 10) * 0.06 * (1 - THREE4.MathUtils.smoothstep(time, 0.62, 0.82));
  const release = THREE4.MathUtils.smoothstep(time, 0.62, 0.86);
  return 0.42 + gather * 0.58 + pulse + release * 0.32;
}

// studio/src/animation/createTwoHandedGripConstraint.ts
import * as THREE5 from "three";
var MAX_FOREARM_CORRECTION = THREE5.MathUtils.degToRad(32);
var MAX_UPPER_ARM_CORRECTION = THREE5.MathUtils.degToRad(22);
var MINIMUM_ELBOW_ANGLE = THREE5.MathUtils.degToRad(34);
var POSITION_TOLERANCE_SQUARED = 15e-4 ** 2;
function createTwoHandedGripConstraint(upperArm, forearm, hand, contact, target) {
  const jointPosition = new THREE5.Vector3();
  const handPosition = new THREE5.Vector3();
  const targetPosition = new THREE5.Vector3();
  const targetFramePosition = new THREE5.Vector3();
  const contactOffset = new THREE5.Vector3();
  const jointWorldQuaternion = new THREE5.Quaternion();
  const inverseJointQuaternion = new THREE5.Quaternion();
  const targetWorldQuaternion = new THREE5.Quaternion();
  const fullGripWorldQuaternion = new THREE5.Quaternion();
  const desiredHandWorldQuaternion = new THREE5.Quaternion();
  const currentHandWorldQuaternion = new THREE5.Quaternion();
  const inverseContactQuaternion = contact.quaternion.clone().invert();
  const correction2 = new THREE5.Quaternion();
  const handDirection = new THREE5.Vector3();
  const targetDirection2 = new THREE5.Vector3();
  const axis = new THREE5.Vector3();
  const shoulderPosition = new THREE5.Vector3();
  const elbowPosition = new THREE5.Vector3();
  const wristPosition = new THREE5.Vector3();
  const toShoulder = new THREE5.Vector3();
  const toWrist = new THREE5.Vector3();
  const bendAxis = new THREE5.Vector3();
  const forearmWorldQuaternion = new THREE5.Quaternion();
  const parentWorldQuaternion2 = new THREE5.Quaternion();
  const limitedForearmWorldQuaternion = new THREE5.Quaternion();
  const parentWorldPosition = new THREE5.Vector3();
  const armParentWorldQuaternion = new THREE5.Quaternion();
  const lastTargetWorldPosition = new THREE5.Vector3();
  const lastTargetWorldQuaternion = new THREE5.Quaternion();
  const lastParentWorldPosition = new THREE5.Vector3();
  const lastParentWorldQuaternion = new THREE5.Quaternion();
  const lastUpperArmQuaternion = new THREE5.Quaternion();
  const lastForearmQuaternion = new THREE5.Quaternion();
  const lastHandQuaternion = new THREE5.Quaternion();
  let hasLastOutput = false;
  const sameQuaternion = (left, right) => Math.abs(left.dot(right)) > 1 - 1e-7;
  function recordOutput() {
    lastTargetWorldPosition.copy(targetFramePosition);
    lastTargetWorldQuaternion.copy(targetWorldQuaternion);
    lastParentWorldPosition.copy(parentWorldPosition);
    lastParentWorldQuaternion.copy(armParentWorldQuaternion);
    lastUpperArmQuaternion.copy(upperArm.quaternion);
    lastForearmQuaternion.copy(forearm.quaternion);
    lastHandQuaternion.copy(hand.quaternion);
    hasLastOutput = true;
  }
  function rotateJointTowardTarget(joint, endEffector, maximumCorrection) {
    joint.getWorldPosition(jointPosition);
    endEffector.getWorldPosition(handPosition);
    joint.getWorldQuaternion(jointWorldQuaternion);
    inverseJointQuaternion.copy(jointWorldQuaternion).invert();
    handDirection.copy(handPosition).sub(jointPosition).applyQuaternion(inverseJointQuaternion).normalize();
    targetDirection2.copy(targetPosition).sub(jointPosition).applyQuaternion(inverseJointQuaternion).normalize();
    const angle = Math.min(
      maximumCorrection,
      Math.acos(THREE5.MathUtils.clamp(handDirection.dot(targetDirection2), -1, 1)) * 0.82
    );
    if (angle < 1e-4) return;
    axis.crossVectors(handDirection, targetDirection2);
    if (axis.lengthSq() < 1e-6) return;
    axis.normalize();
    correction2.setFromAxisAngle(axis, angle);
    joint.quaternion.multiply(correction2).normalize();
    joint.updateWorldMatrix(true, true);
  }
  function enforceElbowLimit() {
    upperArm.getWorldPosition(shoulderPosition);
    forearm.getWorldPosition(elbowPosition);
    hand.getWorldPosition(wristPosition);
    toShoulder.copy(shoulderPosition).sub(elbowPosition).normalize();
    toWrist.copy(wristPosition).sub(elbowPosition).normalize();
    const angle = Math.acos(THREE5.MathUtils.clamp(toShoulder.dot(toWrist), -1, 1));
    if (angle >= MINIMUM_ELBOW_ANGLE) return;
    bendAxis.crossVectors(toShoulder, toWrist);
    if (bendAxis.lengthSq() < 1e-6) return;
    bendAxis.normalize();
    correction2.setFromAxisAngle(bendAxis, MINIMUM_ELBOW_ANGLE - angle);
    forearm.getWorldQuaternion(forearmWorldQuaternion);
    limitedForearmWorldQuaternion.copy(correction2).multiply(forearmWorldQuaternion).normalize();
    const parent = forearm.parent;
    if (!parent) return;
    parent.getWorldQuaternion(parentWorldQuaternion2);
    forearm.quaternion.copy(parentWorldQuaternion2.invert()).multiply(limitedForearmWorldQuaternion).normalize();
    forearm.updateWorldMatrix(true, true);
  }
  function orientHand(worldQuaternion) {
    forearm.getWorldQuaternion(jointWorldQuaternion);
    hand.quaternion.copy(jointWorldQuaternion.invert()).multiply(worldQuaternion).normalize();
    hand.updateWorldMatrix(true, true);
  }
  return {
    update(enabled, orientationWeight = 0.725, repositionForContact = true) {
      if (!enabled) {
        hasLastOutput = false;
        return;
      }
      target.updateWorldMatrix(true, false);
      target.getWorldPosition(targetFramePosition);
      target.getWorldQuaternion(targetWorldQuaternion);
      const armParent = upperArm.parent;
      if (!armParent) throw new Error("A grip constraint requires a parented upper arm.");
      armParent.getWorldPosition(parentWorldPosition);
      armParent.getWorldQuaternion(armParentWorldQuaternion);
      if (hasLastOutput && targetFramePosition.distanceToSquared(lastTargetWorldPosition) < 1e-10 && parentWorldPosition.distanceToSquared(lastParentWorldPosition) < 1e-10 && sameQuaternion(targetWorldQuaternion, lastTargetWorldQuaternion) && sameQuaternion(armParentWorldQuaternion, lastParentWorldQuaternion) && sameQuaternion(upperArm.quaternion, lastUpperArmQuaternion) && sameQuaternion(forearm.quaternion, lastForearmQuaternion) && sameQuaternion(hand.quaternion, lastHandQuaternion)) return;
      targetPosition.copy(targetFramePosition);
      fullGripWorldQuaternion.copy(targetWorldQuaternion).multiply(inverseContactQuaternion).normalize();
      for (let iteration = 0; iteration < 16; iteration += 1) {
        contact.getWorldPosition(handPosition);
        if (handPosition.distanceToSquared(targetPosition) <= POSITION_TOLERANCE_SQUARED) break;
        rotateJointTowardTarget(forearm, contact, MAX_FOREARM_CORRECTION);
        rotateJointTowardTarget(upperArm, contact, MAX_UPPER_ARM_CORRECTION);
      }
      if (orientationWeight <= 0) {
        recordOutput();
        return;
      }
      hand.getWorldQuaternion(currentHandWorldQuaternion);
      desiredHandWorldQuaternion.copy(currentHandWorldQuaternion).slerp(fullGripWorldQuaternion, THREE5.MathUtils.clamp(orientationWeight, 0, 1)).normalize();
      if (!repositionForContact) {
        orientHand(desiredHandWorldQuaternion);
        enforceElbowLimit();
        orientHand(desiredHandWorldQuaternion);
        recordOutput();
        return;
      }
      targetPosition.copy(targetFramePosition);
      contactOffset.copy(contact.position).applyQuaternion(desiredHandWorldQuaternion);
      targetPosition.sub(contactOffset);
      for (let iteration = 0; iteration < 16; iteration += 1) {
        hand.getWorldPosition(handPosition);
        if (handPosition.distanceToSquared(targetPosition) <= POSITION_TOLERANCE_SQUARED) break;
        rotateJointTowardTarget(forearm, hand, MAX_FOREARM_CORRECTION);
        rotateJointTowardTarget(upperArm, hand, MAX_UPPER_ARM_CORRECTION);
      }
      orientHand(desiredHandWorldQuaternion);
      enforceElbowLimit();
      orientHand(desiredHandWorldQuaternion);
      recordOutput();
    }
  };
}

// studio/src/animation/createSpellcastingPose.ts
function createSpellcastingPose(options) {
  const leftContact = options.leftHand.getObjectByName("Socket_HandVFX_Left") ?? options.leftHand;
  const rightContact = options.rightHand.getObjectByName("Socket_HandVFX_Right") ?? options.rightHand;
  const leftTargetObject = new THREE6.Object3D();
  const rightTargetObject = new THREE6.Object3D();
  const solveLeft = createTwoHandedGripConstraint(
    options.leftArm,
    options.leftForearm,
    options.leftHand,
    leftContact,
    leftTargetObject
  );
  const solveRight = createTwoHandedGripConstraint(
    options.rightArm,
    options.rightForearm,
    options.rightHand,
    rightContact,
    rightTargetObject
  );
  const controlledBones = [options.leftArm, options.leftForearm, options.rightArm, options.rightForearm];
  const authoredQuaternions = controlledBones.map(() => new THREE6.Quaternion());
  const leftTarget = new THREE6.Vector3();
  const rightTarget = new THREE6.Vector3();
  const currentTarget = new THREE6.Vector3();
  let previousTime = -1;
  function prepareTarget(contact, desired, targetObject, influence) {
    contact.getWorldPosition(currentTarget);
    options.actor.worldToLocal(currentTarget);
    desired.lerpVectors(currentTarget, desired, influence).applyMatrix4(options.actor.matrixWorld);
    targetObject.position.copy(desired);
    targetObject.updateWorldMatrix(true, true);
  }
  return {
    update(move, normalizedTime) {
      if (move !== "cast") {
        previousTime = -1;
        return;
      }
      const time = THREE6.MathUtils.clamp(normalizedTime, 0, 1);
      if (Math.abs(time - previousTime) < 1e-7) {
        controlledBones.forEach((bone, index) => bone.quaternion.copy(authoredQuaternions[index]));
        options.actor.updateWorldMatrix(true, true);
      } else {
        controlledBones.forEach((bone, index) => authoredQuaternions[index].copy(bone.quaternion));
        previousTime = time;
      }
      options.actor.updateWorldMatrix(true, true);
      sampleSpellHandLocalPositions(time, leftTarget, rightTarget);
      const influence = spellHandInfluence(time);
      prepareTarget(leftContact, leftTarget, leftTargetObject, influence);
      prepareTarget(rightContact, rightTarget, rightTargetObject, influence);
      solveLeft.update(true, 0);
      solveRight.update(true, 0);
    }
  };
}

// studio/src/animation/createElementalSpellPose.ts
import * as THREE7 from "three";
var HAND_KEYS = {
  fireball: [
    { time: 0, left: [0.22, 1.12, 0.31], right: [-0.22, 1.12, 0.31] },
    { time: 0.24, left: [0.25, 1.08, 0.34], right: [-0.25, 1.08, 0.34] },
    { time: 0.5, left: [0.1, 1.22, 0.48], right: [-0.1, 1.22, 0.48] },
    { time: 0.78, left: [0.075, 1.25, 0.82], right: [-0.075, 1.25, 0.82] },
    { time: 0.9, left: [0.09, 1.23, 0.98], right: [-0.09, 1.23, 0.98] },
    { time: 1.04, left: [0.17, 1.16, 0.43], right: [-0.17, 1.16, 0.43] },
    { time: 1.35, left: [0.22, 1.12, 0.31], right: [-0.22, 1.12, 0.31] }
  ],
  lightning: [
    { time: 0, left: [0.22, 1.13, 0.31], right: [-0.22, 1.13, 0.31] },
    { time: 0.22, left: [0.28, 1.46, 0.35], right: [-0.28, 1.46, 0.35] },
    { time: 0.48, left: [0.19, 1.72, 0.3], right: [-0.19, 1.72, 0.3] },
    { time: 0.62, left: [0.14, 1.78, 0.27], right: [-0.14, 1.78, 0.27] },
    { time: 0.74, left: [0.13, 1.32, 0.76], right: [-0.13, 1.32, 0.76] },
    { time: 0.94, left: [0.14, 1.25, 0.86], right: [-0.14, 1.25, 0.86] },
    { time: 1.18, left: [0.19, 1.16, 0.42], right: [-0.19, 1.16, 0.42] },
    { time: 1.65, left: [0.22, 1.13, 0.31], right: [-0.22, 1.13, 0.31] }
  ],
  "energy-missiles": [
    { time: 0, left: [0.21, 1.14, 0.32], right: [-0.21, 1.14, 0.32] },
    { time: 0.18, left: [0.18, 1.25, 0.39], right: [-0.18, 1.25, 0.39] },
    { time: 0.43, left: [0.18, 1.22, 0.37], right: [-0.12, 1.27, 0.92] },
    { time: 0.51, left: [0.17, 1.24, 0.4], right: [-0.16, 1.23, 0.43] },
    { time: 0.6, left: [0.12, 1.27, 0.92], right: [-0.18, 1.22, 0.37] },
    { time: 0.68, left: [0.16, 1.23, 0.43], right: [-0.17, 1.24, 0.4] },
    { time: 0.77, left: [0.18, 1.21, 0.36], right: [-0.1, 1.28, 1] },
    { time: 0.9, left: [0.19, 1.17, 0.39], right: [-0.18, 1.17, 0.43] },
    { time: 1.1, left: [0.21, 1.14, 0.32], right: [-0.21, 1.14, 0.32] }
  ],
  healing: [
    { time: 0, left: [0.22, 1.13, 0.3], right: [-0.22, 1.13, 0.3] },
    { time: 0.28, left: [0.35, 1.4, 0.34], right: [-0.35, 1.4, 0.34] },
    { time: 0.58, left: [0.24, 1.66, 0.31], right: [-0.24, 1.66, 0.31] },
    { time: 0.82, left: [0.075, 1.3, 0.43], right: [-0.075, 1.3, 0.43] },
    { time: 1.08, left: [0.3, 1.36, 0.7], right: [-0.3, 1.36, 0.7] },
    { time: 1.25, left: [0.36, 1.34, 0.72], right: [-0.36, 1.34, 0.72] },
    { time: 1.42, left: [0.23, 1.19, 0.4], right: [-0.23, 1.19, 0.4] },
    { time: 1.8, left: [0.22, 1.13, 0.3], right: [-0.22, 1.13, 0.3] }
  ]
};
function curves(keys, side2) {
  const times = keys.map((key) => key.time);
  return [0, 1, 2].map((axis) => createMotionCurve(times, keys.map((key) => key[side2][axis])));
}
var HAND_PATHS = Object.fromEntries(
  Object.entries(HAND_KEYS).map(([id, keys]) => [id, {
    times: keys.map((key) => key.time),
    left: curves(keys, "left"),
    right: curves(keys, "right")
  }])
);
function sample(curvesForSide, time, target) {
  target.set(curvesForSide[0](time), curvesForSide[1](time), curvesForSide[2](time));
}
function createElementalSpellPose(options) {
  const leftContact = options.leftHand.getObjectByName("Socket_HandVFX_Left") ?? options.leftHand;
  const rightContact = options.rightHand.getObjectByName("Socket_HandVFX_Right") ?? options.rightHand;
  const leftTargetObject = new THREE7.Object3D();
  const rightTargetObject = new THREE7.Object3D();
  const solveLeft = createTwoHandedGripConstraint(
    options.leftArm,
    options.leftForearm,
    options.leftHand,
    leftContact,
    leftTargetObject
  );
  const solveRight = createTwoHandedGripConstraint(
    options.rightArm,
    options.rightForearm,
    options.rightHand,
    rightContact,
    rightTargetObject
  );
  const controlledBones = [options.leftArm, options.leftForearm, options.rightArm, options.rightForearm];
  const authoredQuaternions = controlledBones.map(() => new THREE7.Quaternion());
  const leftTarget = new THREE7.Vector3();
  const rightTarget = new THREE7.Vector3();
  const currentTarget = new THREE7.Vector3();
  let previousMove = null;
  let previousTime = -1;
  function prepareTarget(contact, desired, targetObject, influence) {
    contact.getWorldPosition(currentTarget);
    options.root.worldToLocal(currentTarget);
    desired.lerpVectors(currentTarget, desired, influence).applyMatrix4(options.root.matrixWorld);
    targetObject.position.copy(desired);
    targetObject.updateWorldMatrix(true, true);
  }
  return {
    update(move, normalizedTime) {
      if (!isElementalSpell(move)) {
        previousMove = null;
        previousTime = -1;
        solveLeft.update(false);
        solveRight.update(false);
        return;
      }
      const motion = SPELL_MOTIONS[move];
      const time = THREE7.MathUtils.clamp(normalizedTime, 0, 1) * motion.duration;
      if (move === previousMove && Math.abs(time - previousTime) < 1e-7) {
        controlledBones.forEach((bone, index) => bone.quaternion.copy(authoredQuaternions[index]));
        options.root.updateWorldMatrix(true, true);
      } else {
        controlledBones.forEach((bone, index) => authoredQuaternions[index].copy(bone.quaternion));
        previousMove = move;
        previousTime = time;
      }
      const path = HAND_PATHS[move];
      sample(path.left, time, leftTarget);
      sample(path.right, time, rightTarget);
      const enter = THREE7.MathUtils.smoothstep(time, 0.035, Math.min(0.13, motion.gather * 0.6));
      const exit = 1 - THREE7.MathUtils.smoothstep(time, motion.recover, motion.duration - 0.02);
      const influence = enter * exit;
      options.root.updateWorldMatrix(true, true);
      prepareTarget(leftContact, leftTarget, leftTargetObject, influence);
      prepareTarget(rightContact, rightTarget, rightTargetObject, influence);
      solveLeft.update(true, 0);
      solveRight.update(true, 0);
    }
  };
}

// studio/src/animation/createAbilityPose.ts
import * as T4 from "three";

// studio/src/animation/createLimbTargetSolver.ts
import * as T2 from "three";
function createLimbTargetSolver(upper, lower, end) {
  const a = new T2.Vector3(), b = new T2.Vector3(), c = new T2.Vector3();
  const axis = new T2.Vector3(), bend = new T2.Vector3(), joint = new T2.Vector3();
  const from = new T2.Vector3(), to = new T2.Vector3();
  const q = new T2.Quaternion(), world = new T2.Quaternion(), parent = new T2.Quaternion();
  function aim(bone, child, goal) {
    bone.getWorldPosition(a);
    child.getWorldPosition(b);
    from.subVectors(b, a).normalize();
    to.subVectors(goal, a).normalize();
    q.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(world);
    bone.parent.getWorldQuaternion(parent).invert();
    bone.quaternion.copy(parent).multiply(q).multiply(world).normalize();
    bone.updateWorldMatrix(true, true);
  }
  return {
    solve(target, pole) {
      upper.getWorldPosition(a);
      lower.getWorldPosition(b);
      end.getWorldPosition(c);
      const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
      axis.subVectors(target, a);
      const distance = T2.MathUtils.clamp(axis.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
      axis.normalize();
      bend.subVectors(pole, a).addScaledVector(axis, -bend.dot(axis));
      if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(axis, -axis.z);
      bend.normalize();
      const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
      joint.copy(a).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
      aim(upper, lower, joint);
      aim(lower, end, target);
    }
  };
}

// studio/src/abilities/actionChoreography.ts
import * as T3 from "three";

// studio/src/abilities/summonDefinitions.ts
var SUMMON_TAIL = 5.8;
function summonKind(id) {
  return id === "raise-skeleton" ? "skeleton" : id === "summon-imp" ? "imp" : null;
}

// studio/src/abilities/abilityTiming.ts
var ACTION_TIMING = {
  lunge: [0.58, 0.68],
  blink: [0.28, 0.42],
  shadowstep: [0.28, 0.42],
  disengage: [0.22, 0.65],
  snare: [0.8, 0.9],
  "beast-call": [1.15, 0.8],
  fireball: [0.78, 0.57]
};
function abilityTiming(ability) {
  const move = MOVE_BY_ID.get(ability.visual.motion);
  const event = move.events.find((item) => /impact|release|pulse|land/.test(item.type));
  const marker = ability.visual.pose === "bow" || ["snare", "beast-call", "lunge", "disengage", "blink"].includes(ability.id) ? 0.5 : event ? event.at / move.duration : ability.visual.motion === "lightning" ? 0.45 : 0.58;
  const custom = ACTION_TIMING[ability.id];
  const release = custom?.[0] ?? (ability.cast && ability.cast > 0 ? ability.cast : ability.visual.pose === "bow" ? 0.85 : Math.max(0.42, move.duration * marker));
  const recovery = custom?.[1] ?? (ability.visual.pose === "bow" ? 0.8 : Math.max(0.45, move.duration * (1 - marker)));
  const tail = summonKind(ability.id) ? SUMMON_TAIL : ability.id === "meteor" ? 3.5 : ["fireball", "aura", "shield", "portal", "heal", "song", "mark", "trap"].includes(ability.id === "fireball" ? ability.id : ability.visual.family) ? 2.5 : 1.7;
  return { release, marker, recovery, duration: release + recovery + tail };
}

// studio/src/abilities/actionChoreography.ts
var ease = T3.MathUtils.smoothstep;
var usesBow = (ability) => ability.visual.pose === "bow" || ability.id === "disengage";
function sampleActionTravel(id, phase, out) {
  out.set(0, 0, 0);
  if (id === "lunge") out.z = -0.1 * ease(phase, 0, 0.24) + 2.1 * ease(phase, 0.25, 0.54);
  if (id === "blink" || id === "shadowstep") out.z = 3 * ease(phase, 0.43, 0.57);
  if (id === "disengage") {
    const flight = T3.MathUtils.clamp((phase - 0.22) / 0.52, 0, 1);
    out.z = -1.8 * ease(phase, 0.22, 0.74);
    out.y = Math.sin(flight * Math.PI) * 0.34;
  }
  return out;
}
function actionPhase(ability, time) {
  const t = abilityTiming(ability);
  return time < t.release ? 0.5 * time / t.release : Math.min(1, 0.5 + 0.5 * (time - t.release) / t.recovery);
}
function createActionTravel(actor, character) {
  const start = new T3.Vector3(), direction2 = new T3.Quaternion(), offset = new T3.Vector3();
  let active = false;
  return {
    begin() {
      start.copy(actor.position);
      direction2.copy(actor.quaternion);
      active = true;
    },
    sample(ability, phase) {
      if (!active) return;
      sampleActionTravel(ability.id, phase, offset).applyQuaternion(direction2);
      actor.position.copy(start).add(offset);
      character.visible = !(ability.id === "blink" && phase > 0.44 && phase < 0.56);
      actor.updateMatrixWorld(true);
    },
    stop() {
      character.visible = true;
      active = false;
    }
  };
}

// studio/src/animation/createAbilityPose.ts
function createAbilityPose(root, actor) {
  const bones = /* @__PURE__ */ new Map();
  root.traverse((object) => bones.set(object.name, { object, q: object.quaternion.clone(), p: object.position.clone() }));
  const bone = (name) => bones.get(name).object;
  const arms = ["Left", "Right"].map((side2) => createLimbTargetSolver(bone(`${side2}Arm`), bone(`${side2}ForeArm`), bone(`${side2}Hand`)));
  const legs = ["Left", "Right"].map((side2) => createLimbTargetSolver(bone(`${side2}UpLeg`), bone(`${side2}Leg`), bone(`${side2}Foot`)));
  const footFrames = ["LeftFoot", "RightFoot"].map((name) => {
    actor.updateMatrixWorld(true);
    return { point: actor.worldToLocal(bone(name).getWorldPosition(new T4.Vector3())), q: bone(name).getWorldQuaternion(new T4.Quaternion()) };
  });
  const l = new T4.Vector3(), r = new T4.Vector3(), pole = new T4.Vector3(), target = new T4.Vector3();
  const q = new T4.Quaternion(), parentQ = new T4.Quaternion(), euler = new T4.Euler();
  const ss = T4.MathUtils.smoothstep, rad = T4.MathUtils.degToRad;
  function rotate(name, x, y = 0, z = 0) {
    const value = bones.get(name);
    if (!value) return;
    value.object.quaternion.copy(value.q).multiply(q.setFromEuler(euler.set(rad(x), rad(y), rad(z))));
  }
  function arm(index, goal, px, py, pz) {
    target.copy(goal);
    actor.localToWorld(target);
    pole.set(px, py, pz);
    actor.localToWorld(pole);
    arms[index].solve(target, pole);
  }
  function restoreBody() {
    for (const [name, value] of Object.entries(BASE_POSES.relaxed.rotations)) {
      const rest = bones.get(name);
      if (!rest) continue;
      rest.object.quaternion.copy(rest.q).multiply(q.setFromEuler(euler.set(value[0], value[1], value[2])));
    }
    bone("Hips").position.copy(bones.get("Hips").p).add(target.set(-0.012, -0.018, 0));
  }
  function plantFeet(depth2, stagger) {
    bone("Hips").position.copy(bones.get("Hips").p).add(target.set(0, -depth2, -0.1 * depth2));
    actor.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      target.copy(footFrames[i].point);
      target.z += (i ? -1 : 1) * stagger;
      actor.localToWorld(target);
      pole.set(i ? -0.18 : 0.18, 0.5, 0.85);
      actor.localToWorld(pole);
      legs[i].solve(target, pole);
      const foot = bone(i ? "RightFoot" : "LeftFoot");
      foot.parent.getWorldQuaternion(parentQ).invert();
      foot.quaternion.copy(parentQ).multiply(footFrames[i].q);
    }
  }
  return {
    sample(ability, phase) {
      const pose = ability.visual.pose, bow = usesBow(ability);
      if (!pose && !bow) return;
      const up = ss(phase, 0, 0.28), down = 1 - ss(phase, 0.75, 1), weight = up * down;
      if (weight < 1e-4) return;
      restoreBody();
      if (bow) {
        const release = ss(phase, 0.5, 0.56), lift = ability.id === "volley" ? 0.24 : 0;
        rotate("Hips", 0, -35 * weight);
        rotate("Spine1", -2, -18 * weight);
        rotate("Spine2", 0, -8 * weight);
        rotate("Head", -lift * 80, 52 * weight);
        plantFeet(0.035 * weight, 0.13 * weight);
        if (ability.id === "disengage") {
          const tuck = ss(phase, 0.22, 0.38) * (1 - ss(phase, 0.62, 0.78));
          rotate("LeftUpLeg", 10 + 24 * tuck);
          rotate("RightUpLeg", 12 + 18 * tuck);
          rotate("LeftLeg", -20 - 34 * tuck);
          rotate("RightLeg", -24 - 28 * tuck);
        }
        l.set(0.06, 1.45 + lift, 0.67 - lift * 0.45);
        r.set(-0.13 - release * 0.1, 1.51 + lift * 0.35, 0.13 - release * 0.12);
        const liftWeight = ss(phase, 0, 0.22) * (1 - ss(phase, 0.68, 1));
        l.lerp(target.set(0.25, 0.84, 0.08), 1 - liftWeight);
        r.lerp(target.set(-0.25, 0.9, 0.1), 1 - liftWeight);
        actor.updateMatrixWorld(true);
        arm(0, l, 0.48, 1.32, 0.35);
        arm(1, r, -0.5, 1.53, -0.27);
      } else if (pose === "kneel") {
        rotate("Hips", 18 * weight);
        rotate("Spine", 22 * weight);
        rotate("Spine1", 30 * weight);
        rotate("Head", -6 * weight);
        plantFeet(0.49 * weight, 0.22 * weight);
        l.set(0.19, 0.94 - 0.71 * weight, 0.17 + 0.29 * weight);
        r.set(-0.13, 0.94 - 0.81 * weight, 0.18 + 0.3 * weight);
        actor.updateMatrixWorld(true);
        arm(0, l, 0.48, 0.63, 0.3);
        arm(1, r, -0.43, 0.65, 0.36);
      } else if (pose === "shout") {
        const call = ability.id === "beast-call";
        rotate("Spine1", -6 * weight);
        rotate("Neck", -(call ? 18 : 4) * weight);
        rotate("Head", -(call ? 27 : 8) * weight);
        if (call) {
          l.set(0.055, 1.67, 0.08);
          r.set(-0.055, 1.67, 0.08);
          l.lerp(target.set(0.25, 0.88, 0.08), 1 - weight);
          r.lerp(target.set(-0.25, 0.88, 0.08), 1 - weight);
        } else {
          l.set(0.35, 0.95 + 0.4 * weight, 0.25);
          r.set(-0.35, 0.95 + 0.4 * weight, 0.25);
        }
        actor.updateMatrixWorld(true);
        arm(0, l, 0.4, 1.37, 0.21);
        arm(1, r, -0.4, 1.37, 0.21);
      } else if (pose === "thrust") {
        const strike = ss(phase, 0.28, 0.5) * (1 - ss(phase, 0.65, 1));
        rotate("Spine1", 14 * strike);
        rotate("Spine2", 0, 15 * strike);
        plantFeet(0.1 * strike, 0.21 * strike);
        l.set(0.27, 1.05, 0.18);
        r.set(-0.15, 1.1 + 0.14 * strike, 0.2 + 0.55 * strike);
        actor.updateMatrixWorld(true);
        arm(0, l, 0.4, 1.15, 0.05);
        arm(1, r, -0.45, 1.1, 0.3);
      } else {
        l.set(0.2, 1.14, 0.39);
        r.set(-0.12, 1.12 + Math.sin(phase * 18) * 0.04, 0.38);
        actor.updateMatrixWorld(true);
        arm(0, l, 0.4, 1.1, 0.2);
        arm(1, r, -0.4, 1.1, 0.2);
      }
    }
  };
}

// studio/src/animation/createTwoHandedWeaponController.ts
import * as THREE15 from "three";

// studio/src/animation/calibrateWeaponGripContact.ts
var CONTACT_X = 0.055;
var CONTACT_Y = 0.035;
var CONTACT_Z = -0.025;
function calibrateWeaponGripContact(hand, side2) {
  const socketName = `Socket_Weapon_${side2}`;
  const socket = hand.getObjectByName(socketName);
  if (!socket) return hand;
  socket.position.set(side2 === "Right" ? -CONTACT_X : CONTACT_X, CONTACT_Y, CONTACT_Z);
  socket.updateMatrix();
  return socket;
}

// studio/src/animation/createCompactGuardPosture.ts
import * as THREE8 from "three";
var jointWorld = new THREE8.Vector3();
var elbowWorld = new THREE8.Vector3();
var targetWorld = new THREE8.Vector3();
var currentDirection = new THREE8.Vector3();
var targetDirection = new THREE8.Vector3();
var rootWorldQuaternion = new THREE8.Quaternion();
var parentWorldQuaternion = new THREE8.Quaternion();
var armWorldQuaternion = new THREE8.Quaternion();
var correction = new THREE8.Quaternion();
function restoreOrCapture(arm, state) {
  if (state.hasOutput && arm.quaternion.angleTo(state.output) < 1e-6) arm.quaternion.copy(state.base);
  else state.base.copy(arm.quaternion);
}
function createCompactGuardPosture(root, leftArm, leftForearm, rightArm, rightForearm) {
  const leftState = { base: new THREE8.Quaternion(), output: new THREE8.Quaternion(), hasOutput: false };
  const rightState = { base: new THREE8.Quaternion(), output: new THREE8.Quaternion(), hasOutput: false };
  function solve(arm, forearm, state, inward, forward) {
    restoreOrCapture(arm, state);
    arm.updateWorldMatrix(true, true);
    arm.getWorldPosition(jointWorld);
    forearm.getWorldPosition(elbowWorld);
    currentDirection.copy(elbowWorld).sub(jointWorld).normalize();
    root.getWorldQuaternion(rootWorldQuaternion);
    targetWorld.set(inward, 0, forward).applyQuaternion(rootWorldQuaternion).add(elbowWorld);
    targetDirection.copy(targetWorld).sub(jointWorld).normalize();
    correction.setFromUnitVectors(currentDirection, targetDirection);
    arm.getWorldQuaternion(armWorldQuaternion);
    armWorldQuaternion.premultiply(correction);
    arm.parent?.getWorldQuaternion(parentWorldQuaternion);
    arm.quaternion.copy(parentWorldQuaternion.invert()).multiply(armWorldQuaternion).normalize();
    state.output.copy(arm.quaternion);
    state.hasOutput = true;
    arm.updateWorldMatrix(false, true);
  }
  return {
    update(active) {
      restoreOrCapture(leftArm, leftState);
      restoreOrCapture(rightArm, rightState);
      if (!active) {
        leftState.hasOutput = false;
        rightState.hasOutput = false;
        return;
      }
      solve(leftArm, leftForearm, leftState, -0.045, 0.16);
      solve(rightArm, rightForearm, rightState, 0.045, 0.1);
    }
  };
}

// studio/src/animation/createHandGripPose.ts
import * as THREE9 from "three";
var FINGER_CURL_DEGREES = {
  HandIndex1: -67,
  HandIndex2: -39,
  HandMiddle1: -67,
  HandMiddle2: -39,
  HandRing1: -67,
  HandRing2: -39,
  HandPinky1: -70,
  HandPinky2: -39
};
function thumbCurl(suffix, sideSign) {
  return suffix === "HandThumb1" ? new THREE9.Quaternion(-0.068786, 0, -0.445267 * sideSign, 0.892752).normalize() : new THREE9.Quaternion(0.027173, 0, 0.408819 * sideSign, 0.912211).normalize();
}
function createHandGripPose(hand) {
  const side2 = hand.name.startsWith("Left") ? "Left" : "Right";
  const sideSign = side2 === "Left" ? 1 : -1;
  const rotations = [
    ...Object.entries(FINGER_CURL_DEGREES).map(([suffix, degrees2]) => [
      suffix,
      new THREE9.Quaternion().setFromAxisAngle(
        new THREE9.Vector3(1, 0, 0),
        THREE9.MathUtils.degToRad(degrees2)
      )
    ]),
    ["HandThumb1", thumbCurl("HandThumb1", sideSign)],
    ["HandThumb2", thumbCurl("HandThumb2", sideSign)]
  ];
  const joints = rotations.map(([suffix, curl]) => {
    const object = hand.getObjectByName(`${side2}${suffix}`);
    if (!object) throw new Error(`The ${side2.toLowerCase()} grip is missing ${suffix}.`);
    const open = object.quaternion.clone();
    return { object, open, closed: open.clone().multiply(curl).normalize() };
  });
  return {
    update(strength) {
      const weight = THREE9.MathUtils.clamp(strength, 0, 1);
      for (const joint of joints) joint.object.quaternion.slerpQuaternions(joint.open, joint.closed, weight);
    }
  };
}

// studio/src/animation/createOneHandedSwordPose.ts
import * as THREE11 from "three";

// studio/src/animation/setBladeCutOrientation.ts
import * as THREE10 from "three";
var longitudinal = new THREE10.Vector3();
var faceNormal = new THREE10.Vector3();
var cuttingEdge = new THREE10.Vector3();
var basis = new THREE10.Matrix4();
function setBladeCutOrientation(direction2, cutPlaneNormal, target) {
  longitudinal.copy(direction2).normalize();
  faceNormal.copy(cutPlaneNormal).addScaledVector(longitudinal, -cutPlaneNormal.dot(longitudinal));
  if (faceNormal.lengthSq() < 1e-6) {
    faceNormal.set(0, Math.abs(longitudinal.y) < 0.9 ? 1 : 0, Math.abs(longitudinal.y) < 0.9 ? 0 : 1);
    faceNormal.addScaledVector(longitudinal, -faceNormal.dot(longitudinal));
  }
  faceNormal.normalize();
  cuttingEdge.crossVectors(faceNormal, longitudinal).normalize();
  return target.setFromRotationMatrix(basis.makeBasis(cuttingEdge, faceNormal, longitudinal));
}

// studio/src/animation/createOneHandedSwordPose.ts
var DIRECTION_KEYS = {
  "light-attack": [
    { time: 0, elevation: 48, lateral: 18 },
    { time: 0.14, elevation: 92, lateral: -22 },
    { time: 0.31, elevation: 126, lateral: -32 },
    { time: 0.42, elevation: 98, lateral: -12 },
    { time: 0.56, elevation: 28, lateral: 22 },
    { time: 0.625, elevation: -15, lateral: 35 },
    { time: 0.79, elevation: -34, lateral: 43 },
    { time: 1, elevation: 48, lateral: 18 }
  ],
  "heavy-attack": [
    { time: 0, elevation: 48, lateral: 18 },
    { time: 0.12, elevation: 96, lateral: -24 },
    { time: 0.27, elevation: 136, lateral: -36 },
    { time: 0.39, elevation: 124, lateral: -30 },
    { time: 0.49, elevation: 78, lateral: -8 },
    { time: 0.582, elevation: -22, lateral: 38 },
    { time: 0.72, elevation: -43, lateral: 46 },
    { time: 0.87, elevation: 5, lateral: 28 },
    { time: 1, elevation: 48, lateral: 18 }
  ]
};
var curves2 = Object.fromEntries(Object.entries(DIRECTION_KEYS).map(([move, keys]) => [move, {
  elevation: createMotionCurve(keys.map((key) => key.time), keys.map((key) => key.elevation)),
  lateral: createMotionCurve(keys.map((key) => key.time), keys.map((key) => key.lateral))
}]));
function createOneHandedSwordPose(root, palmContact) {
  const palmWorldPosition = new THREE11.Vector3();
  const direction2 = new THREE11.Vector3();
  const bladeAxis = new THREE11.Vector3(0, 0, 1);
  const heavyCutNormal = new THREE11.Vector3(1, 0, -0.8).normalize();
  const cutQuaternion = new THREE11.Quaternion();
  return {
    update(move, normalizedTime) {
      const parent = root.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, false);
      palmContact.updateWorldMatrix(true, false);
      palmContact.getWorldPosition(palmWorldPosition);
      parent.worldToLocal(palmWorldPosition);
      root.position.copy(palmWorldPosition);
      const time = THREE11.MathUtils.clamp(normalizedTime, 0, 1);
      const elevation = THREE11.MathUtils.degToRad(curves2[move].elevation(time));
      const lateral = THREE11.MathUtils.degToRad(curves2[move].lateral(time));
      direction2.set(
        Math.sin(lateral),
        Math.sin(elevation) * Math.cos(lateral),
        Math.cos(elevation) * Math.cos(lateral)
      ).normalize();
      root.quaternion.setFromUnitVectors(bladeAxis, direction2);
      if (move === "heavy-attack") {
        setBladeCutOrientation(direction2, heavyCutNormal, cutQuaternion);
        const turnIntoCut = THREE11.MathUtils.smoothstep(time, 0, 0.12) * (1 - THREE11.MathUtils.smoothstep(time, 0.87, 1));
        root.quaternion.slerp(cutQuaternion, turnIntoCut);
      }
      root.scale.set(1, 1, 1);
      root.updateWorldMatrix(true, true);
    }
  };
}

// studio/src/animation/createWhirlwindSwordPose.ts
import * as THREE12 from "three";
function createWhirlwindSwordPose(swordRoot, palmContact, characterRoot) {
  const palmWorldPosition = new THREE12.Vector3();
  const rootWorldPosition = new THREE12.Vector3();
  const radial = new THREE12.Vector3();
  const tangent = new THREE12.Vector3();
  const upright = new THREE12.Vector3(0, 1, 0);
  const fallbackRadial = new THREE12.Vector3(0, 0, 1);
  const characterWorldQuaternion = new THREE12.Quaternion();
  const parentWorldQuaternion2 = new THREE12.Quaternion();
  const worldOrientation = new THREE12.Quaternion();
  const basis2 = new THREE12.Matrix4();
  return {
    update() {
      const parent = swordRoot.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, false);
      characterRoot.updateWorldMatrix(true, true);
      palmContact.updateWorldMatrix(true, false);
      palmContact.getWorldPosition(palmWorldPosition);
      characterRoot.getWorldPosition(rootWorldPosition);
      radial.copy(palmWorldPosition).sub(rootWorldPosition);
      radial.y = 0;
      if (radial.lengthSq() < 1e-6) {
        characterRoot.getWorldQuaternion(characterWorldQuaternion);
        radial.copy(fallbackRadial).applyQuaternion(characterWorldQuaternion);
        radial.y = 0;
      }
      radial.normalize();
      tangent.crossVectors(upright, radial).normalize();
      worldOrientation.setFromRotationMatrix(basis2.makeBasis(tangent, upright, radial));
      swordRoot.position.copy(palmWorldPosition);
      parent.worldToLocal(swordRoot.position);
      parent.getWorldQuaternion(parentWorldQuaternion2);
      swordRoot.quaternion.copy(parentWorldQuaternion2.invert()).multiply(worldOrientation).normalize();
      swordRoot.scale.set(1, 1, 1);
      swordRoot.updateWorldMatrix(true, true);
    }
  };
}

// studio/src/animation/createSwordShieldCarryPose.ts
import * as THREE13 from "three";
function createSwordShieldCarryPose(sword, hips, leftArm, leftForearm, leftHand, leftContact) {
  const hipPosition = new THREE13.Vector3();
  const targetPosition = new THREE13.Vector3();
  const startPosition = new THREE13.Vector3();
  const startQuaternion = new THREE13.Quaternion();
  const targetQuaternion = new THREE13.Quaternion();
  const bladeDirection = new THREE13.Vector3();
  const faceNormal2 = new THREE13.Vector3(-0.422618, -0.906308, 0);
  const shieldTarget = new THREE13.Object3D();
  const shieldHandPosition = new THREE13.Vector3();
  const solveShield = createTwoHandedGripConstraint(leftArm, leftForearm, leftHand, leftContact, shieldTarget);
  let elapsed = 0;
  let active = false;
  return {
    reset() {
      active = false;
      solveShield.update(false);
    },
    update(phase, running, moving, delta) {
      const parent = sword.root.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, true);
      hips.getWorldPosition(hipPosition);
      parent.worldToLocal(hipPosition);
      if (!active) {
        startPosition.copy(sword.root.position);
        startQuaternion.copy(sword.root.quaternion);
        elapsed = 0;
        active = true;
      }
      elapsed = delta === void 0 ? 0.18 : Math.min(0.18, elapsed + Math.max(0, delta));
      const blend = THREE13.MathUtils.smoothstep(elapsed, 0, 0.18);
      const stride = moving ? Math.sin(phase * Math.PI * 2) : 0;
      targetPosition.set(
        hipPosition.x - 0.34,
        hipPosition.y + 0.015 + stride * 0.014,
        hipPosition.z - 0.1 + stride * (running ? 0.035 : 0.02)
      );
      bladeDirection.set(-0.1, 0.25 + stride * 0.025, -0.86).normalize();
      setBladeCutOrientation(bladeDirection, faceNormal2, targetQuaternion);
      sword.root.position.lerpVectors(startPosition, targetPosition, blend);
      sword.root.quaternion.slerpQuaternions(startQuaternion, targetQuaternion, blend);
      sword.root.updateWorldMatrix(true, true);
      leftContact.getWorldPosition(shieldHandPosition);
      targetPosition.set(
        hipPosition.x + 0.1,
        hipPosition.y + 0.18 + stride * 0.012,
        hipPosition.z + 0.42 - stride * 0.018
      ).applyMatrix4(parent.matrixWorld);
      shieldTarget.position.lerpVectors(shieldHandPosition, targetPosition, blend);
      shieldTarget.updateWorldMatrix(true, false);
      solveShield.update(true, 0);
    }
  };
}

// studio/src/animation/createGreatswordCarryPose.ts
import * as THREE14 from "three";
var CARRY_BLEND_SECONDS = 0.24;
function createGreatswordCarryPose(sword, hips) {
  const hipsPosition = new THREE14.Vector3();
  const desiredPosition = new THREE14.Vector3();
  const desiredQuaternion = new THREE14.Quaternion();
  const startPosition = new THREE14.Vector3();
  const startQuaternion = new THREE14.Quaternion();
  const bladeDirection = new THREE14.Vector3();
  const bladeFaceNormal = new THREE14.Vector3(0.866025, -0.5, 0);
  const bladeTip = sword.root.getObjectByName("BladeTip");
  if (!bladeTip) throw new Error("Greatsword carry requires the blade tip.");
  const bladeLength = bladeTip.position.z;
  let active = false;
  let elapsed = 0;
  return {
    reset() {
      active = false;
    },
    update(deltaSeconds) {
      const parent = sword.root.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, false);
      hips.getWorldPosition(hipsPosition);
      parent.worldToLocal(hipsPosition);
      if (!active) {
        startPosition.copy(sword.root.position);
        startQuaternion.copy(sword.root.quaternion);
        elapsed = 0;
        active = true;
      }
      elapsed = deltaSeconds === void 0 ? CARRY_BLEND_SECONDS : Math.min(CARRY_BLEND_SECONDS, elapsed + Math.max(0, deltaSeconds));
      const progress = elapsed / CARRY_BLEND_SECONDS;
      const blend = progress * progress * (3 - 2 * progress);
      desiredPosition.set(hipsPosition.x - 0.37, hipsPosition.y - 5e-3, hipsPosition.z - 0.1);
      const down = THREE14.MathUtils.clamp((0.075 - desiredPosition.y) / bladeLength, -0.8, -0.05);
      bladeDirection.set(-0.11, down, -Math.sqrt(1 - down * down - 0.11 * 0.11));
      setBladeCutOrientation(bladeDirection, bladeFaceNormal, desiredQuaternion);
      sword.root.position.lerpVectors(startPosition, desiredPosition, blend);
      sword.root.quaternion.slerpQuaternions(startQuaternion, desiredQuaternion, blend);
      sword.root.updateWorldMatrix(true, true);
    }
  };
}

// studio/src/animation/createTwoHandedWeaponController.ts
var TWO_HANDED_STRIKE_DURATION = 1.62;
var SWORD_POSES = [
  { time: 0, position: [-0.04, 1.04, 0.12], bladeAngleDegrees: -31, lateralDegrees: -6 },
  { time: 0.14, position: [-0.06, 1.11, 0.11], bladeAngleDegrees: 108, lateralDegrees: -6 },
  { time: 0.3, position: [-0.02, 1.35, 0.02], bladeAngleDegrees: 122, lateralDegrees: -3 },
  { time: 0.49, position: [0, 1.54, 0.02], bladeAngleDegrees: 135 },
  { time: 0.64, position: [0, 1.47, 0.08], bladeAngleDegrees: 104 },
  { time: 0.75, position: [0, 1.27, 0.18], bladeAngleDegrees: 44 },
  { time: 0.82, position: [0, 1.08, 0.28], bladeAngleDegrees: -12 },
  { time: 1.02, position: [0.015, 1, 0.25], bladeAngleDegrees: -35, lateralDegrees: 2 },
  { time: 1.31, position: [-0.035, 1.01, 0.2], bladeAngleDegrees: 38, lateralDegrees: -4 },
  { time: 1.62, position: [-0.04, 1.04, 0.12], bladeAngleDegrees: -31, lateralDegrees: -6 }
];
var swordTimes = SWORD_POSES.map((pose) => pose.time);
var swordPositionCurves = [0, 1, 2].map((axis) => createMotionCurve(
  swordTimes,
  SWORD_POSES.map((pose) => pose.position[axis])
));
var swordAngleCurve = createMotionCurve(swordTimes, SWORD_POSES.map((pose) => pose.bladeAngleDegrees));
var swordLateralCurve = createMotionCurve(swordTimes, SWORD_POSES.map((pose) => pose.lateralDegrees ?? 0));
var poseDirection = new THREE15.Vector3();
var overheadCutNormal = new THREE15.Vector3(1, 0, 0);
var RUNNING_MOVES = /* @__PURE__ */ new Set(["run-start", "run", "run-stop", "running-leap"]);
var RELAXED_HAND_MOVES = /* @__PURE__ */ new Set(["idle", "walk-start", "walk", "walk-stop", "walk-backward"]);
var CARRY_MOVES = /* @__PURE__ */ new Set([
  ...RELAXED_HAND_MOVES,
  "run-start",
  "run",
  "run-stop",
  "turn-left",
  "turn-right"
]);
function poseQuaternion(angleDegrees, lateralDegrees, target) {
  const angle = THREE15.MathUtils.degToRad(angleDegrees);
  const lateral = THREE15.MathUtils.degToRad(lateralDegrees);
  poseDirection.set(Math.sin(lateral), Math.sin(angle) * Math.cos(lateral), Math.cos(angle) * Math.cos(lateral));
  return setBladeCutOrientation(poseDirection, overheadCutNormal, target);
}
function applyTwoHandedSwordPose(root, timeSeconds) {
  const time = THREE15.MathUtils.clamp(timeSeconds, 0, TWO_HANDED_STRIKE_DURATION);
  root.position.set(
    swordPositionCurves[0](time),
    swordPositionCurves[1](time),
    swordPositionCurves[2](time)
  );
  poseQuaternion(swordAngleCurve(time), swordLateralCurve(time), root.quaternion);
  root.updateWorldMatrix(true, true);
}
function createShieldAttachment(shield, forearm, hand) {
  const elbowPosition = new THREE15.Vector3();
  const wristPosition = new THREE15.Vector3();
  const localElbow = new THREE15.Vector3();
  const localWrist = new THREE15.Vector3();
  const longitudinal2 = new THREE15.Vector3();
  const normal = new THREE15.Vector3();
  const lateral = new THREE15.Vector3();
  const basis2 = new THREE15.Matrix4();
  return (standOff = 0.07) => {
    const parent = shield.root.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    forearm.getWorldPosition(elbowPosition);
    hand.getWorldPosition(wristPosition);
    localElbow.copy(elbowPosition);
    localWrist.copy(wristPosition);
    parent.worldToLocal(localElbow);
    parent.worldToLocal(localWrist);
    longitudinal2.copy(localWrist).sub(localElbow);
    longitudinal2.z = 0;
    if (longitudinal2.lengthSq() < 1e-6) longitudinal2.set(0, 1, 0);
    else longitudinal2.normalize();
    normal.set(0, 0, 1);
    lateral.crossVectors(longitudinal2, normal).normalize();
    normal.crossVectors(lateral, longitudinal2).normalize();
    shield.root.position.copy(localElbow).lerp(localWrist, 0.58).addScaledVector(normal, standOff);
    shield.root.quaternion.setFromRotationMatrix(basis2.makeBasis(lateral, longitudinal2, normal));
    shield.root.updateWorldMatrix(true, true);
  };
}
function createTwoHandedWeaponController(options) {
  const rightPalmContact = calibrateWeaponGripContact(options.rightHand, "Right");
  const leftPalmContact = calibrateWeaponGripContact(options.leftHand, "Left");
  const rightGrip = createTwoHandedGripConstraint(
    options.rightArm,
    options.rightForearm,
    options.rightHand,
    rightPalmContact,
    options.sword.lowerHandSocket
  );
  const leftGrip = createTwoHandedGripConstraint(
    options.leftArm,
    options.leftForearm,
    options.leftHand,
    leftPalmContact,
    options.sword.offHandSocket
  );
  const rightHandGrip = createHandGripPose(options.rightHand);
  const leftHandGrip = createHandGripPose(options.leftHand);
  const oneHandedSwordPose = createOneHandedSwordPose(options.sword.root, rightPalmContact);
  let animatedRoot = options.rightArm;
  while (animatedRoot && animatedRoot.name !== "Root") animatedRoot = animatedRoot.parent;
  if (!animatedRoot) throw new Error("The sword controller requires the animated Root bone.");
  const hips = animatedRoot.getObjectByName("Hips");
  if (!hips) throw new Error("Greatsword carry requires the hips.");
  const carryPose = createGreatswordCarryPose(options.sword, hips);
  const compactGuard = createCompactGuardPosture(
    animatedRoot,
    options.leftArm,
    options.leftForearm,
    options.rightArm,
    options.rightForearm
  );
  let equipment = "unarmed";
  const swordShieldCarry = createSwordShieldCarryPose(
    options.sword,
    hips,
    options.leftArm,
    options.leftForearm,
    options.leftHand,
    leftPalmContact
  );
  let wasCarrying = false;
  let enteringStrikeFromCarry = false;
  const strikeEntryPosition = new THREE15.Vector3();
  const strikeEntryQuaternion = new THREE15.Quaternion();
  const carryPalmPosition = new THREE15.Vector3();
  const palmWorldQuaternion = new THREE15.Quaternion();
  const swordParentWorldQuaternion = new THREE15.Quaternion();
  const swordWorldQuaternion = new THREE15.Quaternion();
  const inverseLowerGripQuaternion = options.sword.lowerHandSocket.quaternion.clone().invert();
  const whirlwindSwordPose = createWhirlwindSwordPose(options.sword.root, rightPalmContact, animatedRoot);
  const guardTarget = new THREE15.Object3D();
  const guardLocalPosition = new THREE15.Vector3();
  const guardLocalOffset = new THREE15.Vector3(0.04, -0.14, 0.48);
  const guardParentWorldQuaternion = new THREE15.Quaternion();
  const guardConstraint = createTwoHandedGripConstraint(
    options.leftArm,
    options.leftForearm,
    options.leftHand,
    leftPalmContact,
    guardTarget
  );
  const attachShield = options.shield ? createShieldAttachment(options.shield, options.leftForearm, options.leftHand) : void 0;
  function attachSwordToAuthoredPalm() {
    const parent = options.sword.root.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    rightPalmContact.updateWorldMatrix(true, false);
    rightPalmContact.getWorldPosition(carryPalmPosition);
    rightPalmContact.getWorldQuaternion(palmWorldQuaternion);
    options.sword.root.position.copy(carryPalmPosition);
    parent.worldToLocal(options.sword.root.position);
    swordWorldQuaternion.copy(palmWorldQuaternion).multiply(inverseLowerGripQuaternion).normalize();
    parent.getWorldQuaternion(swordParentWorldQuaternion);
    options.sword.root.quaternion.copy(swordParentWorldQuaternion.invert()).multiply(swordWorldQuaternion).normalize();
    options.sword.root.updateWorldMatrix(true, true);
  }
  return {
    setEquipment(mode) {
      equipment = mode;
      carryPose.reset();
      swordShieldCarry.reset();
    },
    getEquipment: () => equipment,
    update(move, normalizedTime, deltaSeconds, authoredClip = false, preserveEquipment = false) {
      if (preserveEquipment) {
        options.sword.setVisible(equipment !== "unarmed");
        options.shield?.setVisible(equipment === "sword-shield");
        options.sword.setOneHanded(equipment === "sword-shield");
        if (equipment !== "unarmed") attachSwordToAuthoredPalm();
        if (equipment === "sword-shield") attachShield?.();
        rightHandGrip.update(equipment === "unarmed" ? 0.1 : 1);
        leftHandGrip.update(equipment === "sword-shield" ? 0.45 : 0.1);
        if (equipment === "greatsword" && move === "two-handed-strike") {
          applyTwoHandedSwordPose(options.sword.root, normalizedTime * TWO_HANDED_STRIKE_DURATION);
          rightGrip.update(true, 0.75);
          leftGrip.update(true, 0.75);
          leftHandGrip.update(1);
        } else if (equipment !== "unarmed" && move === "whirlwind") {
          whirlwindSwordPose.update();
          rightGrip.update(true, 0.9, false);
          whirlwindSwordPose.update();
        }
        return;
      }
      const twoHanded = move === "two-handed-strike";
      const whirlwind = move === "whirlwind";
      const oneHandedAttack = move === "light-attack" || move === "heavy-attack";
      const oneHandedGuard = oneHandedAttack || move === "combat-idle";
      if (twoHanded) equipment = "greatsword";
      else if (oneHandedGuard) equipment = "sword-shield";
      const carrying = equipment === "greatsword" && CARRY_MOVES.has(move);
      const carryingShield = equipment === "sword-shield" && CARRY_MOVES.has(move);
      options.sword.setOneHanded(authoredClip && oneHandedGuard || carryingShield);
      if (twoHanded && wasCarrying) {
        enteringStrikeFromCarry = true;
        strikeEntryPosition.copy(options.sword.root.position);
        strikeEntryQuaternion.copy(options.sword.root.quaternion);
      } else if (!twoHanded) enteringStrikeFromCarry = false;
      options.sword.setVisible(twoHanded || oneHandedGuard || whirlwind || carrying || carryingShield);
      options.shield?.setVisible(oneHandedGuard || carryingShield);
      if (!carryingShield) swordShieldCarry.reset();
      if (!carrying) carryPose.reset();
      const relaxedHands = RELAXED_HAND_MOVES.has(move) || equipment === "unarmed" && RELAXED_STANCE_MOVES.includes(move);
      const ambientGrip = RUNNING_MOVES.has(move) ? 0.24 : relaxedHands ? 0.1 : 0;
      compactGuard.update(authoredClip && move === "combat-idle");
      if (oneHandedGuard) {
        if (authoredClip) {
          attachSwordToAuthoredPalm();
        } else {
          const oneHandedMove = oneHandedAttack ? move : "light-attack";
          const swordTime = oneHandedAttack ? normalizedTime : 0;
          oneHandedSwordPose.update(oneHandedMove, swordTime);
          rightGrip.update(true, 0.9, false);
          oneHandedSwordPose.update(oneHandedMove, swordTime);
        }
        const parent = options.sword.root.parent;
        if (parent && !authoredClip) {
          parent.updateWorldMatrix(true, false);
          options.leftArm.getWorldPosition(guardLocalPosition);
          parent.worldToLocal(guardLocalPosition);
          guardLocalPosition.add(guardLocalOffset).applyMatrix4(parent.matrixWorld);
          guardTarget.position.copy(guardLocalPosition);
          parent.getWorldQuaternion(guardParentWorldQuaternion);
          guardTarget.quaternion.copy(guardParentWorldQuaternion);
          guardTarget.updateWorldMatrix(true, true);
          guardConstraint.update(true, 0);
        }
        attachShield?.();
      } else if (twoHanded) {
        applyTwoHandedSwordPose(options.sword.root, normalizedTime * TWO_HANDED_STRIKE_DURATION);
        if (enteringStrikeFromCarry && normalizedTime < 0.09) {
          const progress = normalizedTime / 0.09;
          const blend = progress * progress * (3 - 2 * progress);
          options.sword.root.position.lerpVectors(strikeEntryPosition, options.sword.root.position, blend);
          options.sword.root.quaternion.slerpQuaternions(strikeEntryQuaternion, options.sword.root.quaternion, blend);
          options.sword.root.updateWorldMatrix(true, true);
        }
        rightGrip.update(true, 0.75);
        leftGrip.update(true, 0.75);
      } else if (carrying) {
        carryPose.update(deltaSeconds);
        rightGrip.update(true, 0.9);
        rightPalmContact.getWorldPosition(carryPalmPosition);
        options.sword.root.parent?.worldToLocal(carryPalmPosition);
        options.sword.root.position.copy(carryPalmPosition);
        options.sword.root.updateWorldMatrix(true, true);
      } else if (carryingShield) {
        swordShieldCarry.update(normalizedTime, RUNNING_MOVES.has(move), move !== "idle", deltaSeconds);
        rightGrip.update(true, 0.9);
        rightPalmContact.getWorldPosition(carryPalmPosition);
        options.sword.root.parent?.worldToLocal(carryPalmPosition);
        options.sword.root.position.copy(carryPalmPosition);
        options.sword.root.updateWorldMatrix(true, true);
        attachShield?.(0.26);
      } else if (whirlwind) {
        whirlwindSwordPose.update();
        rightGrip.update(true, 0.9, false);
        whirlwindSwordPose.update();
      }
      rightHandGrip.update(twoHanded || oneHandedGuard || whirlwind || carrying || carryingShield ? 1 : ambientGrip);
      leftHandGrip.update(twoHanded ? 1 : oneHandedGuard || carryingShield ? 0.45 : ambientGrip);
      wasCarrying = carrying;
    }
  };
}

// studio/src/character/createTrainingSword.ts
import * as THREE16 from "three";
function markPart(part, id) {
  part.name = id;
  part.userData.partId = id;
  part.userData.clickable = true;
  return part;
}
function createBladeGeometry() {
  const profile = new THREE16.Shape();
  profile.moveTo(-0.055, 0);
  profile.lineTo(0.055, 0);
  profile.lineTo(0.043, 1.12);
  profile.lineTo(0.018, 1.32);
  profile.lineTo(0, 1.4);
  profile.lineTo(-0.018, 1.32);
  profile.lineTo(-0.043, 1.12);
  profile.closePath();
  const geometry = new THREE16.ExtrudeGeometry(profile, {
    depth: 0.018,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 6e-3,
    bevelThickness: 4e-3,
    curveSegments: 1
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 9e-3, 0);
  geometry.computeVertexNormals();
  return geometry;
}
function createTrainingSword(parent) {
  const root = new THREE16.Group();
  root.name = "TrainingSword";
  root.visible = false;
  parent.add(root);
  const steel = new THREE16.MeshStandardMaterial({
    name: "TrainingSteel",
    color: "#c8d3ce",
    metalness: 0.92,
    roughness: 0.24
  });
  const darkSteel = new THREE16.MeshStandardMaterial({
    name: "TrainingDarkSteel",
    color: "#33413b",
    metalness: 0.76,
    roughness: 0.34
  });
  const gripMaterial = new THREE16.MeshStandardMaterial({
    name: "TrainingGrip",
    color: "#17201c",
    metalness: 0.08,
    roughness: 0.72
  });
  const pommel = markPart(new THREE16.Group(), "Pommel");
  pommel.position.z = -0.055;
  const pommelMesh = new THREE16.Mesh(new THREE16.CylinderGeometry(0.043, 0.052, 0.07, 12), darkSteel);
  pommelMesh.rotation.x = Math.PI / 2;
  pommel.add(pommelMesh);
  const grip = markPart(new THREE16.Group(), "Grip");
  grip.position.z = 0.09;
  const gripMesh = new THREE16.Mesh(new THREE16.CylinderGeometry(0.028, 0.032, 0.25, 12), gripMaterial);
  gripMesh.rotation.x = Math.PI / 2;
  grip.add(gripMesh);
  for (let index = 0; index < 6; index += 1) {
    const wrap = new THREE16.Mesh(new THREE16.TorusGeometry(0.0325, 3e-3, 5, 18), darkSteel);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.z = -0.1 + index * 0.04;
    grip.add(wrap);
  }
  const guard = markPart(new THREE16.Group(), "Guard");
  guard.position.z = 0.23;
  const guardBar = new THREE16.Mesh(new THREE16.BoxGeometry(0.34, 0.035, 0.04, 2, 1, 1), darkSteel);
  guard.add(guardBar);
  const leftQuillon = new THREE16.Mesh(new THREE16.CylinderGeometry(0.018, 0.026, 0.09, 10), darkSteel);
  leftQuillon.rotation.z = Math.PI / 2;
  leftQuillon.position.x = 0.2;
  guard.add(leftQuillon);
  const rightQuillon = leftQuillon.clone();
  rightQuillon.position.x = -0.2;
  guard.add(rightQuillon);
  const blade = markPart(new THREE16.Group(), "Blade");
  blade.position.z = 0.255;
  const bladeMesh = new THREE16.Mesh(createBladeGeometry(), steel);
  blade.add(bladeMesh);
  const fuller = new THREE16.Mesh(new THREE16.BoxGeometry(0.012, 0.021, 1.16), darkSteel);
  fuller.position.z = 0.56;
  blade.add(fuller);
  const bladeTip = markPart(new THREE16.Object3D(), "BladeTip");
  bladeTip.position.z = 1.655;
  const lowerHandSocket = markPart(new THREE16.Object3D(), "LowerHandGripSocket");
  lowerHandSocket.position.z = 0;
  lowerHandSocket.rotation.x = Math.PI / 2;
  lowerHandSocket.rotation.y = THREE16.MathUtils.degToRad(15);
  const offHandSocket = markPart(new THREE16.Object3D(), "OffHandGripSocket");
  offHandSocket.position.z = 0.155;
  offHandSocket.rotation.x = Math.PI / 2;
  offHandSocket.rotation.y = THREE16.MathUtils.degToRad(110);
  const impactSocket = markPart(new THREE16.Object3D(), "ImpactSocket");
  impactSocket.position.z = 1.36;
  root.add(pommel, grip, guard, blade, bladeTip, lowerHandSocket, offHandSocket, impactSocket);
  root.traverse((object) => {
    if (!(object instanceof THREE16.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  root.userData.sculptRuntime = {
    parts: { pommel, grip, guard, blade, bladeTip },
    sockets: { lowerHandGrip: lowerHandSocket, offHandGrip: offHandSocket, impact: impactSocket },
    colliders: [
      { id: "blade-trigger", type: "capsule", radius: 0.055, length: 1.46, trigger: true }
    ],
    destructionGroups: [],
    attachment: {
      parent: parent.name,
      contactType: "constrained-prop",
      lowerHand: "RightHand",
      upperHand: "LeftHand"
    }
  };
  const impactPosition = new THREE16.Vector3();
  return {
    root,
    lowerHandSocket,
    offHandSocket,
    impactSocket,
    setOneHanded(enabled) {
      const bladeScale = enabled ? 0.62 : 1;
      blade.scale.z = bladeScale;
      bladeTip.position.z = blade.position.z + 1.4 * bladeScale;
      impactSocket.position.z = blade.position.z + (1.36 - blade.position.z) * bladeScale;
    },
    setVisible(visible) {
      root.visible = visible;
    },
    getImpactWorldPosition() {
      if (!root.visible) return null;
      root.updateWorldMatrix(true, true);
      return impactSocket.getWorldPosition(impactPosition).clone();
    },
    dispose() {
      parent.remove(root);
      root.traverse((object) => {
        if (!(object instanceof THREE16.Mesh)) return;
        object.geometry.dispose();
      });
      steel.dispose();
      darkSteel.dispose();
      gripMaterial.dispose();
    }
  };
}

// studio/src/character/createTrainingShield.ts
import * as THREE17 from "three";
function createTrainingShield(parent) {
  const root = new THREE17.Group();
  root.name = "TrainingShield";
  root.visible = false;
  parent.add(root);
  const faceMaterial = new THREE17.MeshStandardMaterial({
    name: "TrainingShieldFace",
    color: "#53615b",
    metalness: 0.24,
    roughness: 0.58
  });
  const rimMaterial = new THREE17.MeshStandardMaterial({
    name: "TrainingShieldRim",
    color: "#26342f",
    metalness: 0.72,
    roughness: 0.34
  });
  const faceGeometry = new THREE17.CylinderGeometry(0.29, 0.27, 0.045, 24, 1);
  faceGeometry.rotateX(Math.PI / 2);
  const face = new THREE17.Mesh(faceGeometry, faceMaterial);
  face.name = "ShieldFace";
  const rimGeometry = new THREE17.TorusGeometry(0.285, 0.022, 7, 28);
  const rim = new THREE17.Mesh(rimGeometry, rimMaterial);
  rim.name = "ShieldRim";
  rim.position.z = 0.03;
  const bossGeometry = new THREE17.SphereGeometry(0.085, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const boss = new THREE17.Mesh(bossGeometry, rimMaterial);
  boss.name = "ShieldBoss";
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.04;
  root.add(face, rim, boss);
  root.traverse((object) => {
    if (!(object instanceof THREE17.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  root.userData.sculptRuntime = {
    parts: { face, rim, boss },
    attachment: { parent: parent.name, contactType: "forearm-strapped", forearm: "LeftForeArm" }
  };
  return {
    root,
    setVisible(visible) {
      root.visible = visible;
    },
    dispose() {
      parent.remove(root);
      faceGeometry.dispose();
      rimGeometry.dispose();
      bossGeometry.dispose();
      faceMaterial.dispose();
      rimMaterial.dispose();
    }
  };
}

// studio/src/abilities/abilityBrief.json
var abilityBrief_default = [
  {
    id: "power-strike",
    name: "Power Strike",
    school: "Warrior",
    cost: "15 stamina",
    cooldown: 6,
    cast: null,
    range: 2,
    passive: false,
    rooted: false,
    description: "The next swing lands with your shoulder behind it, for sixty percent more.",
    requirement: "Swordsmanship 30",
    equipment: "any weapon you swing"
  },
  {
    id: "shield-bash",
    name: "Shield Bash",
    school: "Warrior",
    cost: "20 stamina",
    cooldown: 9,
    cast: null,
    range: 2,
    passive: false,
    rooted: false,
    description: "The shield is a weapon too. Half the damage and two seconds of nothing.",
    requirement: "Parrying 40",
    equipment: "a shield"
  },
  {
    id: "rend",
    name: "Rend",
    school: "Warrior",
    cost: "20 stamina",
    cooldown: 8,
    cast: null,
    range: 2,
    passive: false,
    rooted: false,
    description: "A cut that keeps opening. Three a second for eight seconds after.",
    requirement: "Swordsmanship 45",
    equipment: "a sword or an axe"
  },
  {
    id: "crushing-blow",
    name: "Crushing Blow",
    school: "Warrior",
    cost: "20 stamina",
    cooldown: 8,
    cast: null,
    range: 2,
    passive: false,
    rooted: false,
    description: "Armour dents. Ten points of it, for ten seconds, and the wearer sits down.",
    requirement: "Macefighting 45",
    equipment: "a mace, a hammer, a maul or a staff"
  },
  {
    id: "lunge",
    name: "Lunge",
    school: "Warrior",
    cost: "15 stamina",
    cooldown: 7,
    cast: null,
    range: 5,
    passive: false,
    rooted: false,
    description: "Five metres closed in one step, with the point arriving first.",
    requirement: "Fencing 45",
    equipment: "a dagger, a rapier or a spear"
  },
  {
    id: "sweep",
    name: "Sweep",
    school: "Warrior",
    cost: "25 stamina",
    cooldown: 9,
    cast: null,
    range: 3.5,
    passive: false,
    rooted: false,
    description: "The haft comes round in a wide arc and puts the front rank on its back.",
    requirement: "Polearms 45",
    equipment: "a halberd or a glaive"
  },
  {
    id: "whirlwind",
    name: "Whirlwind",
    school: "Warrior",
    cost: "30 stamina",
    cooldown: 12,
    cast: 0.4,
    range: 3,
    passive: false,
    rooted: true,
    description: "A turn on the spot that opens everything standing within three metres.",
    requirement: "Swordsmanship 50 and Tactics 40",
    equipment: "any weapon you swing"
  },
  {
    id: "disarm",
    name: "Disarm",
    school: "Warrior",
    cost: "20 stamina",
    cooldown: 15,
    cast: null,
    range: 2,
    passive: false,
    rooted: false,
    description: "A twist of the wrist. It fights you barehanded for six seconds.",
    requirement: "Wrestling 50",
    equipment: "empty hands"
  },
  {
    id: "leap-slam",
    name: "Leap Slam",
    school: "Warrior",
    cost: "25 stamina",
    cooldown: 10,
    cast: null,
    range: 8,
    passive: false,
    rooted: false,
    description: "Eight metres of air and then the ground, and whatever was standing on it.",
    requirement: "Swordsmanship 60 and Str 50",
    equipment: "any weapon you swing"
  },
  {
    id: "battle-cry",
    name: "Battle Cry",
    school: "Warrior",
    cost: "30 stamina",
    cooldown: 30,
    cast: null,
    range: 10,
    passive: false,
    rooted: false,
    description: "Everyone within ten metres hits a fifth harder for twelve seconds.",
    requirement: "Tactics 60",
    equipment: null
  },
  {
    id: "riposte",
    name: "Riposte",
    school: "Warrior",
    cost: "free",
    cooldown: null,
    cast: null,
    range: 2,
    passive: true,
    rooted: false,
    description: "Every parry answers back for half a swing. Always on.",
    requirement: "Parrying 70",
    equipment: "a shield"
  },
  {
    id: "berserk",
    name: "Berserk",
    school: "Warrior",
    cost: "40 stamina",
    cooldown: 60,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Fifteen seconds of forty percent more, and a third of your armour forgotten.",
    requirement: "Tactics 80 and Con 60",
    equipment: null
  },
  {
    id: "aimed-shot",
    name: "Aimed Shot",
    school: "Ranger",
    cost: "15 stamina",
    cooldown: 6,
    cast: 1.2,
    range: 25,
    passive: false,
    rooted: true,
    description: "Stand still, breathe out, and put it where you meant to.",
    requirement: "Archery 30",
    equipment: "a bow or crossbow and ammunition"
  },
  {
    id: "snare",
    name: "Snare",
    school: "Ranger",
    cost: "10 stamina",
    cooldown: 20,
    cast: 0.8,
    range: 5,
    passive: false,
    rooted: true,
    description: "A loop of wire in the grass. The first thing through it stops for four seconds.",
    requirement: "Tinkering 30 and Tinkering 30, or Tracking 60",
    equipment: null
  },
  {
    id: "crippling-shot",
    name: "Crippling Shot",
    school: "Ranger",
    cost: "15 stamina",
    cooldown: 10,
    cast: null,
    range: 30,
    passive: false,
    rooted: false,
    description: "A bolt through the leg. It comes on at half speed for six seconds.",
    requirement: "Marksmanship 40",
    equipment: "a bow or crossbow and ammunition"
  },
  {
    id: "disengage",
    name: "Disengage",
    school: "Ranger",
    cost: "15 stamina",
    cooldown: 12,
    cast: null,
    range: 6,
    passive: false,
    rooted: false,
    description: "Six metres of backwards, and three seconds of running to make them count.",
    requirement: "Archery 40 and Dex 55",
    equipment: null
  },
  {
    id: "hunters-mark",
    name: "Hunter's Mark",
    school: "Ranger",
    cost: "10 stamina",
    cooldown: 20,
    cast: null,
    range: 30,
    passive: false,
    rooted: false,
    description: "You have its scent. Fifteen percent more from you, and nowhere to hide.",
    requirement: "Tracking 40",
    equipment: null
  },
  {
    id: "double-shot",
    name: "Double Shot",
    school: "Ranger",
    cost: "20 stamina",
    cooldown: 8,
    cast: null,
    range: 25,
    passive: false,
    rooted: false,
    description: "Two arrows off the string before the first one lands.",
    requirement: "Archery 45",
    equipment: "a bow or crossbow and ammunition"
  },
  {
    id: "fleet-foot",
    name: "Fleet Foot",
    school: "Ranger",
    cost: "free",
    cooldown: null,
    cast: null,
    range: null,
    passive: true,
    rooted: false,
    description: "A tenth quicker on your feet, and a fifth once Tracking reaches ninety.",
    requirement: "Tracking 50",
    equipment: null
  },
  {
    id: "beast-call",
    name: "Beast Call",
    school: "Ranger",
    cost: "30 stamina",
    cooldown: 90,
    cast: 2,
    range: 30,
    passive: false,
    rooted: true,
    description: "Whatever is closest and wild takes your side for half a minute.",
    requirement: "Animal lore 50",
    equipment: null
  },
  {
    id: "piercing-arrow",
    name: "Piercing Arrow",
    school: "Ranger",
    cost: "20 stamina",
    cooldown: 10,
    cast: null,
    range: 25,
    passive: false,
    rooted: false,
    description: "Half the armour counts, and the shaft carries on into whatever is behind.",
    requirement: "Archery 55",
    equipment: "a bow or crossbow and ammunition"
  },
  {
    id: "volley",
    name: "Volley",
    school: "Ranger",
    cost: "35 stamina",
    cooldown: 15,
    cast: 1.5,
    range: 30,
    passive: false,
    rooted: true,
    description: "Arrows come down on a five metre circle rather than at anything in it.",
    requirement: "Archery 60",
    equipment: "a bow or crossbow and ammunition"
  },
  {
    id: "magic-arrow",
    name: "Magic Arrow",
    school: "Mage",
    cost: "4 mana",
    cooldown: null,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "The spell you learn on, and the one you never quite stop using.",
    requirement: "nothing",
    equipment: "a wand or a staff"
  },
  {
    id: "fireball",
    name: "Fireball",
    school: "Mage",
    cost: "9 mana",
    cooldown: 3,
    cast: 0.6,
    range: 20,
    passive: false,
    rooted: false,
    description: "It lands hot and keeps burning for four seconds after.",
    requirement: "Magery 25",
    equipment: "a wand or a staff"
  },
  {
    id: "ice-shard",
    name: "Ice Shard",
    school: "Mage",
    cost: "9 mana",
    cooldown: 3,
    cast: 0.6,
    range: 20,
    passive: false,
    rooted: false,
    description: "Less than a fireball and it takes something off their speed instead.",
    requirement: "Magery 30",
    equipment: "a wand or a staff"
  },
  {
    id: "blink",
    name: "Blink",
    school: "Mage",
    cost: "12 mana",
    cooldown: 10,
    cast: null,
    range: 12,
    passive: false,
    rooted: false,
    description: "Twelve metres the way you are looking, through whatever was between.",
    requirement: "Magery 40",
    equipment: "a wand or a staff"
  },
  {
    id: "lightning",
    name: "Lightning",
    school: "Mage",
    cost: "14 mana",
    cooldown: 5,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "No wind up at all. It is simply there, and then it is over.",
    requirement: "Magery 45",
    equipment: "a wand or a staff"
  },
  {
    id: "mana-shield",
    name: "Mana Shield",
    school: "Mage",
    cost: "20 mana",
    cooldown: 30,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "For fifteen seconds every wound costs mana at two for one instead of blood.",
    requirement: "Magery 50",
    equipment: "a wand or a staff"
  },
  {
    id: "frost-nova",
    name: "Frost Nova",
    school: "Mage",
    cost: "25 mana",
    cooldown: 14,
    cast: 0.8,
    range: 5,
    passive: false,
    rooted: true,
    description: "The floor goes white for five metres and nothing on it moves for three seconds.",
    requirement: "Magery 60",
    equipment: "a wand or a staff"
  },
  {
    id: "chain-lightning",
    name: "Chain Lightning",
    school: "Mage",
    cost: "28 mana",
    cooldown: 10,
    cast: 1.2,
    range: 20,
    passive: false,
    rooted: true,
    description: "It jumps to three more, weaker each time, and finds them all itself.",
    requirement: "Magery 70",
    equipment: "a wand or a staff"
  },
  {
    id: "arcane-mastery",
    name: "Arcane Mastery",
    school: "Mage",
    cost: "free",
    cooldown: null,
    cast: null,
    range: null,
    passive: true,
    rooted: false,
    description: "You have read enough to know where the seams are. Ten percent more crits.",
    requirement: "Evaluating intelligence 80",
    equipment: null
  },
  {
    id: "meteor",
    name: "Meteor",
    school: "Mage",
    cost: "45 mana",
    cooldown: 25,
    cast: 2.5,
    range: 25,
    passive: false,
    rooted: true,
    description: "A second and a half of shadow on the ground before anything happens.",
    requirement: "Magery 85",
    equipment: "a wand or a staff"
  },
  {
    id: "hex",
    name: "Hex",
    school: "Sorcerer",
    cost: "8 mana",
    cooldown: 6,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "It misses more and blocks less for twelve seconds, and does not know why.",
    requirement: "Mysticism 20",
    equipment: "a wand or a staff"
  },
  {
    id: "eldritch-bolt",
    name: "Eldritch Bolt",
    school: "Sorcerer",
    cost: "10 mana",
    cooldown: 2,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "Cheap, quick, and one time in five it stops them casting for two seconds.",
    requirement: "Mysticism 30",
    equipment: "a wand or a staff"
  },
  {
    id: "stone-skin",
    name: "Stone Skin",
    school: "Sorcerer",
    cost: "15 mana",
    cooldown: 20,
    cast: 0.5,
    range: null,
    passive: false,
    rooted: false,
    description: "Thirty armour for twelve seconds, and you walk like the stone you are wearing.",
    requirement: "Mysticism 35",
    equipment: "a wand or a staff"
  },
  {
    id: "ward",
    name: "Ward",
    school: "Sorcerer",
    cost: "25 mana",
    cooldown: 30,
    cast: 1.5,
    range: 15,
    passive: false,
    rooted: true,
    description: "Four metres of floor where everything hurts a third less, for ten seconds.",
    requirement: "Mysticism 50",
    equipment: "a wand or a staff"
  },
  {
    id: "transmute",
    name: "Transmute",
    school: "Sorcerer",
    cost: "20 mana",
    cooldown: 20,
    cast: 1,
    range: null,
    passive: false,
    rooted: true,
    description: "One stack of ore becomes the tier above it, and you lose three tenths in the change.",
    requirement: "Mysticism 55 and Alchemy 40",
    equipment: "a wand or a staff"
  },
  {
    id: "spell-plague",
    name: "Spell Plague",
    school: "Sorcerer",
    cost: "30 mana",
    cooldown: 18,
    cast: 1.2,
    range: 20,
    passive: false,
    rooted: true,
    description: "Twenty five poison, and after it every spell you land there bursts on its neighbours.",
    requirement: "Mysticism 65",
    equipment: "a wand or a staff"
  },
  {
    id: "rift",
    name: "Rift",
    school: "Sorcerer",
    cost: "40 mana",
    cooldown: 40,
    cast: 2,
    range: 20,
    passive: false,
    rooted: true,
    description: "A three metre tear that drags monsters in and holds them there for four seconds.",
    requirement: "Mysticism 80",
    equipment: "a wand or a staff"
  },
  {
    id: "elemental-kin",
    name: "Elemental Kin",
    school: "Sorcerer",
    cost: "free",
    cooldown: null,
    cast: null,
    range: null,
    passive: true,
    rooted: false,
    description: "The elements stopped arguing with you. Fifteen percent off each of them.",
    requirement: "Mysticism 90",
    equipment: null
  },
  {
    id: "life-drain",
    name: "Life Drain",
    school: "Necromancer",
    cost: "8 mana",
    cooldown: 4,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "Half of what it loses arrives in you. The necromancer never needs a bandage.",
    requirement: "Necromancy 20",
    equipment: "a wand or a staff"
  },
  {
    id: "raise-skeleton",
    name: "Raise Skeleton",
    school: "Necromancer",
    cost: "20 mana",
    cooldown: 20,
    cast: 1.5,
    range: 6,
    passive: false,
    rooted: true,
    description: "Any corpse within six metres gets up and takes your side.",
    requirement: "Necromancy 30",
    equipment: "a wand or a staff"
  },
  {
    id: "summon-imp",
    name: "Summon Imp",
    school: "Necromancer",
    cost: "18 mana",
    cooldown: 25,
    cast: 1.2,
    range: 5,
    passive: false,
    rooted: true,
    description: "Small, quick, and it throws fire from further back than you would.",
    requirement: "Necromancy 40",
    equipment: "a wand or a staff"
  },
  {
    id: "bone-spear",
    name: "Bone Spear",
    school: "Necromancer",
    cost: "14 mana",
    cooldown: 5,
    cast: 0.5,
    range: 20,
    passive: false,
    rooted: false,
    description: "It goes through the first one and keeps going down the line.",
    requirement: "Necromancy 45",
    equipment: "a wand or a staff"
  },
  {
    id: "fear",
    name: "Fear",
    school: "Necromancer",
    cost: "15 mana",
    cooldown: 15,
    cast: null,
    range: 6,
    passive: false,
    rooted: false,
    description: "Beasts and men within six metres run. Undead and constructs do not.",
    requirement: "Necromancy 50",
    equipment: "a wand or a staff"
  },
  {
    id: "curse-of-weakness",
    name: "Curse of Weakness",
    school: "Necromancer",
    cost: "15 mana",
    cooldown: 20,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "Fifteen seconds of hitting a fifth softer and wearing a fifth less armour.",
    requirement: "Spirit speak 50",
    equipment: "a wand or a staff"
  },
  {
    id: "corpse-explosion",
    name: "Corpse Explosion",
    school: "Necromancer",
    cost: "20 mana",
    cooldown: 8,
    cast: null,
    range: 10,
    passive: false,
    rooted: false,
    description: "What you killed is still useful. It goes off for four metres around itself.",
    requirement: "Necromancy 60",
    equipment: "a wand or a staff"
  },
  {
    id: "summon-hound",
    name: "Summon Hound",
    school: "Necromancer",
    cost: "28 mana",
    cooldown: 30,
    cast: 1.5,
    range: 5,
    passive: false,
    rooted: true,
    description: "A shadow hound. Fast, and what it bites keeps bleeding.",
    requirement: "Necromancy 65",
    equipment: "a wand or a staff"
  },
  {
    id: "lich-form",
    name: "Lich Form",
    school: "Necromancer",
    cost: "50 mana",
    cooldown: 120,
    cast: 3,
    range: null,
    passive: false,
    rooted: true,
    description: "Thirty seconds where spells are paid for in blood and nobody can help you.",
    requirement: "Necromancy 85 and Spirit Speak 70",
    equipment: "a wand or a staff"
  },
  {
    id: "raise-champion",
    name: "Raise Champion",
    school: "Necromancer",
    cost: "60 mana",
    cooldown: 180,
    cast: 3,
    range: 5,
    passive: false,
    rooted: true,
    description: "One bone knight, as strong as you are, for two minutes.",
    requirement: "Necromancy 95",
    equipment: "a wand or a staff"
  },
  {
    id: "heal",
    name: "Heal",
    school: "Healer",
    cost: "10 mana",
    cooldown: 3,
    cast: 0.8,
    range: 20,
    passive: false,
    rooted: false,
    description: "Twenty and a share of your Chivalry, on anyone you can see.",
    requirement: "Chivalry 20",
    equipment: "a wand or a staff"
  },
  {
    id: "cleanse",
    name: "Cleanse",
    school: "Healer",
    cost: "12 mana",
    cooldown: 8,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "Poison, bleed and one curse, gone, with no wind up at all.",
    requirement: "Chivalry 35",
    equipment: "a wand or a staff"
  },
  {
    id: "bless",
    name: "Bless",
    school: "Healer",
    cost: "15 mana",
    cooldown: 20,
    cast: 0.5,
    range: 20,
    passive: false,
    rooted: false,
    description: "Five to everything for thirty seconds. Cheap, and it adds up in a party.",
    requirement: "Chivalry 40",
    equipment: "a wand or a staff"
  },
  {
    id: "consecrate-weapon",
    name: "Consecrate Weapon",
    school: "Healer",
    cost: "12 mana",
    cooldown: 15,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Twenty seconds where your blade means half again to anything already dead.",
    requirement: "Chivalry 45",
    equipment: "any weapon you swing"
  },
  {
    id: "greater-heal",
    name: "Greater Heal",
    school: "Healer",
    cost: "22 mana",
    cooldown: 6,
    cast: 1.5,
    range: 20,
    passive: false,
    rooted: true,
    description: "A second and a half of standing still buys fifty and more.",
    requirement: "Chivalry 50",
    equipment: "a wand or a staff"
  },
  {
    id: "smite",
    name: "Smite",
    school: "Healer",
    cost: "18 mana",
    cooldown: 10,
    cast: null,
    range: 20,
    passive: false,
    rooted: false,
    description: "Thirty to forty five, and twice that on the undead.",
    requirement: "Chivalry 60",
    equipment: "a wand or a staff"
  },
  {
    id: "sanctuary",
    name: "Sanctuary",
    school: "Healer",
    cost: "30 mana",
    cooldown: 45,
    cast: 1.5,
    range: 15,
    passive: false,
    rooted: true,
    description: "Five metres where nothing can be attacked, for six seconds. Long enough.",
    requirement: "Chivalry 65",
    equipment: "a wand or a staff"
  },
  {
    id: "resurrect",
    name: "Resurrect",
    school: "Healer",
    cost: "40 mana",
    cooldown: 60,
    cast: 5,
    range: 5,
    passive: false,
    rooted: true,
    description: "Five seconds of standing over them, and they get up where they fell.",
    requirement: "Healing 80 and Healing 80 and Anatomy 80, or Chivalry 85",
    equipment: "a wand or a staff"
  },
  {
    id: "lay-on-hands",
    name: "Lay on Hands",
    school: "Healer",
    cost: "50 mana",
    cooldown: 90,
    cast: null,
    range: 5,
    passive: false,
    rooted: false,
    description: "All of it, at once, and then a minute and a half of not being able to.",
    requirement: "Chivalry 90",
    equipment: "a wand or a staff"
  },
  {
    id: "hide",
    name: "Hide",
    school: "Rogue",
    cost: "10 stamina",
    cooldown: 8,
    cast: 1,
    range: null,
    passive: false,
    rooted: true,
    description: "Stand still for a second and you are not there. Stealth is what lets you walk.",
    requirement: "nothing",
    equipment: null
  },
  {
    id: "poison-blade",
    name: "Poison Blade",
    school: "Rogue",
    cost: "1 poison vial",
    cooldown: null,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Five hits carry poison at your Poisoning divided by twenty.",
    requirement: "Poisoning 30",
    equipment: "any weapon you swing"
  },
  {
    id: "pick-pocket",
    name: "Pick Pocket",
    school: "Rogue",
    cost: "10 stamina",
    cooldown: 30,
    cast: 1,
    range: 2,
    passive: false,
    rooted: true,
    description: "Gold, or something common, off a humanoid that has not noticed you yet.",
    requirement: "Stealing 30",
    equipment: null
  },
  {
    id: "backstab",
    name: "Backstab",
    school: "Rogue",
    cost: "20 stamina",
    cooldown: 10,
    cast: null,
    range: 2,
    passive: false,
    rooted: false,
    description: "From behind, or out of hiding, three times the damage. From the front, nothing.",
    requirement: "Fencing 40 and Hiding 30",
    equipment: "a dagger, a rapier or a spear"
  },
  {
    id: "shadowstep",
    name: "Shadowstep",
    school: "Rogue",
    cost: "20 stamina",
    cooldown: 15,
    cast: null,
    range: 10,
    passive: false,
    rooted: false,
    description: "Ten metres and you are behind it, which is where Backstab wants you.",
    requirement: "Stealth 60",
    equipment: null
  },
  {
    id: "evasion",
    name: "Evasion",
    school: "Rogue",
    cost: "25 stamina",
    cooldown: 45,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Four seconds where nothing lands. Pick them carefully.",
    requirement: "Fencing 60 and Dex 70",
    equipment: null
  },
  {
    id: "expose-weakness",
    name: "Expose Weakness",
    school: "Rogue",
    cost: "15 stamina",
    cooldown: 20,
    cast: null,
    range: 5,
    passive: false,
    rooted: false,
    description: "You point at the gap and everyone else gets a quarter more for ten seconds.",
    requirement: "Anatomy 60",
    equipment: null
  },
  {
    id: "vanish",
    name: "Vanish",
    school: "Rogue",
    cost: "30 stamina",
    cooldown: 60,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Out of a fight, instantly, with everything forgetting it was chasing you.",
    requirement: "Hiding 70",
    equipment: null
  },
  {
    id: "provoke",
    name: "Provoke",
    school: "Bard",
    cost: "15 stamina",
    cooldown: 12,
    cast: 1,
    range: 15,
    passive: false,
    rooted: true,
    description: "Two monsters decide the other one started it, and settle it for twenty seconds.",
    requirement: "Provocation 20",
    equipment: "an instrument"
  },
  {
    id: "peace",
    name: "Peace",
    school: "Bard",
    cost: "15 stamina",
    cooldown: 15,
    cast: 1,
    range: 8,
    passive: false,
    rooted: true,
    description: "Everything within eight metres stands down for eight seconds and forgets you.",
    requirement: "Peacemaking 20",
    equipment: "an instrument"
  },
  {
    id: "discord",
    name: "Discord",
    school: "Bard",
    cost: "15 stamina",
    cooldown: 15,
    cast: 1,
    range: 15,
    passive: false,
    rooted: true,
    description: "A fifth off everything it has, for twenty seconds, while it can hear you.",
    requirement: "Discordance 20",
    equipment: "an instrument"
  },
  {
    id: "marching-song",
    name: "Marching Song",
    school: "Bard",
    cost: "10 stamina",
    cooldown: 30,
    cast: null,
    range: 12,
    passive: false,
    rooted: false,
    description: "Half a minute of everyone within twelve metres moving fifteen percent quicker.",
    requirement: "Musicianship 40",
    equipment: "an instrument"
  },
  {
    id: "war-drum",
    name: "War Drum",
    school: "Bard",
    cost: "20 stamina",
    cooldown: 30,
    cast: null,
    range: 12,
    passive: false,
    rooted: false,
    description: "Ten percent more damage and ten percent faster swings for twenty seconds.",
    requirement: "Musicianship 60",
    equipment: "an instrument"
  },
  {
    id: "lullaby",
    name: "Lullaby",
    school: "Bard",
    cost: "30 stamina",
    cooldown: 60,
    cast: 2,
    range: 10,
    passive: false,
    rooted: true,
    description: "Ten metres of sleeping, six seconds, or until somebody hits one of them.",
    requirement: "Peacemaking 70",
    equipment: "an instrument"
  },
  {
    id: "jump",
    name: "Jump",
    school: "Everyone",
    cost: "5 stamina",
    cooldown: null,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "One metre twenty. A swing taken in the air is a jump attack.",
    requirement: "nothing",
    equipment: null
  },
  {
    id: "sprint",
    name: "Sprint",
    school: "Everyone",
    cost: "3 stamina",
    cooldown: null,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Hold shift. Three stamina a second for as long as you can pay it.",
    requirement: "nothing",
    equipment: null
  },
  {
    id: "bandage",
    name: "Bandage",
    school: "Everyone",
    cost: "1 bandage",
    cooldown: null,
    cast: 4,
    range: 2,
    passive: false,
    rooted: true,
    description: "Four seconds of binding. Anyone can do it; Anatomy decides how well.",
    requirement: "nothing",
    equipment: null
  },
  {
    id: "meditate",
    name: "Meditate",
    school: "Everyone",
    cost: "free",
    cooldown: null,
    cast: null,
    range: null,
    passive: false,
    rooted: false,
    description: "Sit still and mana comes back three times as fast, until anything at all happens.",
    requirement: "nothing",
    equipment: null
  }
];

// studio/src/abilities/abilityVisuals.ts
var v = (family, color, motion, scale = 1, count = 1, style = "runes", pose, accent = "#f7f3df") => ({ family, color, accent, motion, scale, count, style, pose });
var ABILITY_VISUALS = {
  "power-strike": v("slash", "#ffc66b", "heavy-attack", 1.25, 1, "embers"),
  "shield-bash": v("impact", "#e7c783", "light-attack", 0.8, 1, "shards", "thrust"),
  rend: v("slash", "#e95251", "light-attack", 0.9, 3, "arc"),
  "crushing-blow": v("impact", "#edaa60", "two-handed-strike", 1.35, 8, "shards"),
  lunge: v("impact", "#f4e8ba", "idle", 0.6, 1, "shards", "thrust"),
  sweep: v("slash", "#dfba79", "heavy-attack", 1.5, 1, "arc"),
  whirlwind: v("slash", "#e2cb9b", "whirlwind", 1.65, 4, "arc"),
  disarm: v("slash", "#f3f0d4", "light-attack", 0.55, 2, "shards"),
  "leap-slam": v("impact", "#ffb859", "running-leap", 1.9, 16, "shards"),
  "battle-cry": v("song", "#ffce80", "combat-idle", 1.6, 3, "runes", "shout"),
  riposte: v("slash", "#fff0b4", "light-attack", 0.75, 1, "arc"),
  berserk: v("aura", "#e34832", "combat-idle", 1.25, 6, "embers", "shout"),
  "aimed-shot": v("projectile", "#dcebb7", "idle", 0.65, 1, "feathers", "bow"),
  snare: v("trap", "#a6bb8d", "idle", 0.8, 1, "runes", "kneel"),
  "crippling-shot": v("projectile", "#bccd79", "idle", 0.7, 1, "feathers", "bow"),
  disengage: v("stealth", "#a4d0ae", "idle", 0.9, 4, "feathers"),
  "hunters-mark": v("mark", "#ff283c", "cast", 0.8, 4, "runes"),
  "double-shot": v("projectile", "#c4e299", "idle", 0.7, 2, "feathers", "bow"),
  "fleet-foot": v("aura", "#b2debc", "run", 0.6, 2, "feathers"),
  "beast-call": v("song", "#b8d08a", "idle", 1.1, 3, "feathers", "shout"),
  "piercing-arrow": v("projectile", "#ffe8a4", "idle", 0.85, 1, "feathers", "bow"),
  volley: v("volley", "#dfc88b", "idle", 1.5, 18, "feathers", "bow"),
  "magic-arrow": v("projectile", "#b09bff", "energy-missiles", 0.65, 1, "wisps", void 0, "#e8d7ff"),
  fireball: v("projectile", "#ff762a", "fireball", 1.2, 1, "embers", void 0, "#ffe09b"),
  "ice-shard": v("projectile", "#65d7ff", "cast", 1, 1, "shards", void 0, "#e2fbff"),
  blink: v("stealth", "#8d9fff", "cast", 1.2, 5, "runes"),
  lightning: v("lightning", "#a5c5ff", "lightning", 1.25, 1, "arc"),
  "mana-shield": v("shield", "#8ea0ff", "healing", 1.1, 6, "runes"),
  "frost-nova": v("nova", "#87e7ff", "cast", 1.65, 24, "shards"),
  "chain-lightning": v("lightning", "#b7d0ff", "lightning", 1.2, 4, "arc"),
  "arcane-mastery": v("aura", "#c0a5ff", "idle", 0.75, 3, "runes"),
  meteor: v("meteor", "#ff7031", "cast", 1.8, 1, "embers", "shout"),
  hex: v("mark", "#c488e8", "cast", 0.85, 3, "runes"),
  "eldritch-bolt": v("projectile", "#8be2c2", "cast", 0.85, 1, "wisps", void 0, "#d0ffb0"),
  "stone-skin": v("shield", "#ad9c85", "healing", 1.05, 14, "shards"),
  ward: v("shield", "#83cbbb", "cast", 1.8, 8, "runes"),
  transmute: v("portal", "#ffd78b", "cast", 0.8, 6, "shards", "kneel"),
  "spell-plague": v("mark", "#bddb58", "cast", 1.2, 7, "wisps"),
  rift: v("portal", "#a774f0", "cast", 1.7, 9, "wisps", void 0, "#eda6ff"),
  "elemental-kin": v("aura", "#72d6ba", "idle", 0.85, 4, "shards"),
  "life-drain": v("drain", "#c45177", "cast", 1.05, 3, "wisps"),
  "raise-skeleton": v("portal", "#b2d67c", "cast", 1.1, 8, "shards"),
  "summon-imp": v("portal", "#f37b54", "cast", 0.8, 5, "embers"),
  "bone-spear": v("projectile", "#e5d6ac", "cast", 1.2, 1, "shards"),
  fear: v("nova", "#9780c2", "cast", 1.75, 6, "wisps", "shout"),
  "curse-of-weakness": v("mark", "#a383b7", "cast", 1.05, 5, "wisps"),
  "corpse-explosion": v("impact", "#b6cd63", "cast", 1.65, 18, "shards"),
  "summon-hound": v("portal", "#7e70bd", "cast", 1.35, 4, "wisps"),
  "lich-form": v("aura", "#8ce8ae", "healing", 1.6, 10, "wisps", "shout"),
  "raise-champion": v("portal", "#c9e4ad", "cast", 1.8, 12, "shards"),
  heal: v("heal", "#83f0b2", "healing", 0.9, 3, "wisps"),
  cleanse: v("nova", "#e7fff0", "healing", 1.1, 7, "feathers"),
  bless: v("aura", "#f4dd95", "healing", 1, 5, "runes"),
  "consecrate-weapon": v("aura", "#ffd779", "combat-idle", 0.8, 4, "embers"),
  "greater-heal": v("heal", "#abffd7", "healing", 1.4, 7, "wisps"),
  smite: v("lightning", "#fff0bc", "cast", 1.6, 1, "runes"),
  sanctuary: v("shield", "#f9e7b6", "cast", 2.1, 12, "feathers"),
  resurrect: v("heal", "#fff5c9", "healing", 1.8, 9, "feathers", "kneel"),
  "lay-on-hands": v("heal", "#ffeab3", "healing", 1.6, 12, "runes"),
  hide: v("stealth", "#718496", "idle", 0.8, 3, "wisps", "kneel"),
  "poison-blade": v("aura", "#abc855", "combat-idle", 0.7, 5, "wisps"),
  "pick-pocket": v("mark", "#dfc886", "light-attack", 0.35, 3, "embers", "thrust"),
  backstab: v("slash", "#c65b72", "light-attack", 0.85, 2, "arc", "thrust"),
  shadowstep: v("stealth", "#9276bf", "dodge", 1.3, 6, "wisps"),
  evasion: v("aura", "#a0b5ce", "combat-idle", 1, 5, "feathers"),
  "expose-weakness": v("mark", "#efc879", "cast", 0.85, 4, "runes", "thrust"),
  vanish: v("stealth", "#a18cbd", "idle", 1.5, 8, "wisps"),
  provoke: v("song", "#ef956e", "cast", 1.2, 2, "runes", "music"),
  peace: v("song", "#c1dfc1", "cast", 1.35, 3, "feathers", "music"),
  discord: v("song", "#d398d4", "cast", 1.25, 5, "arc", "music"),
  "marching-song": v("song", "#86cec3", "walk", 1.25, 4, "runes", "music"),
  "war-drum": v("song", "#df9c60", "combat-idle", 1.4, 6, "runes", "music"),
  lullaby: v("song", "#aaaee5", "cast", 1.4, 7, "wisps", "music"),
  jump: v("impact", "#c6ba9c", "jump-launch", 0.35, 4, "shards"),
  sprint: v("aura", "#d4cfb3", "run", 0.55, 2, "feathers"),
  bandage: v("heal", "#e3e0c4", "healing", 0.45, 2, "feathers", "kneel"),
  meditate: v("aura", "#98bddd", "idle", 0.8, 4, "wisps", "kneel")
};

// studio/src/abilities/abilityCatalog.ts
var ABILITY_SCHOOLS = ["Warrior", "Ranger", "Mage", "Sorcerer", "Necromancer", "Healer", "Rogue", "Bard", "Everyone"];
var ABILITIES = abilityBrief_default.map((entry) => {
  const visual = ABILITY_VISUALS[entry.id];
  if (!visual) throw new Error(`Missing effect direction for ${entry.name}.`);
  return { ...entry, school: entry.school, visual };
});
var ABILITY_BY_ID = new Map(ABILITIES.map((ability) => [ability.id, ability]));
var isMagicSchool = (school) => ["Mage", "Sorcerer", "Necromancer", "Healer"].includes(school);

// studio/src/abilities/createAbilityRigCapture.ts
import * as T6 from "three";

// studio/src/vfx/abilities/createMeasuredAttackTrail.ts
import * as T5 from "three";

// studio/src/vfx/spells/createSpellGlow.ts
import * as THREE18 from "three";

// studio/src/vfx/spells/spellBloom.ts
function enableSpellBloom(material) {
  material.userData.spellBloom = true;
  return material;
}

// studio/src/vfx/spells/createSpellGlow.ts
function createSpellGlow(color, size) {
  const uniforms = {
    uColor: { value: new THREE18.Color(color) },
    uAlpha: { value: 1 },
    uTime: { value: 0 },
    uIntensity: { value: 1 },
    uSize: { value: size }
  };
  const geometry = new THREE18.PlaneGeometry(2, 2);
  const material = enableSpellBloom(new THREE18.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE18.AdditiveBlending,
    vertexShader: `
      uniform float uSize;
      varying vec2 vDisc;
      void main() {
        vDisc = position.xy;
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float worldScale = 0.5 * (length(modelMatrix[0].xyz) + length(modelMatrix[1].xyz));
        center.xy += position.xy * uSize * worldScale;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uAlpha;
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vDisc;
      void main() {
        float radius = length(vDisc);
        float angle = atan(vDisc.y, vDisc.x);
        float flame = sin(angle * 7.0 + uTime * 9.0) * 0.035
          + sin(angle * 13.0 - uTime * 13.0) * 0.018;
        float shapedRadius = radius / max(0.82, 1.0 + flame);
        float outer = 1.0 - smoothstep(0.12, 1.0, shapedRadius);
        float core = pow(max(0.0, 1.0 - radius), 5.0);
        float alpha = uAlpha * outer * (0.3 + core * 0.7);
        if (alpha < 0.004) discard;
        vec3 hot = mix(uColor, vec3(1.0), core * 0.72);
        gl_FragColor = vec4(hot * uIntensity, alpha);
      }
    `
  }));
  material.toneMapped = false;
  const mesh = new THREE18.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return {
    mesh,
    uniforms,
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
function createSpellRibbon(color, pointCount, width) {
  if (pointCount < 2) throw new Error("A spell ribbon requires at least two points.");
  const positions = new Float32Array(pointCount * 2 * 3);
  const previous = new Float32Array(pointCount * 2 * 3);
  const next = new Float32Array(pointCount * 2 * 3);
  const sides = new Float32Array(pointCount * 2);
  const tapers = new Float32Array(pointCount * 2);
  const indices = new Uint16Array((pointCount - 1) * 6);
  for (let index = 0; index < pointCount; index += 1) {
    const progress = index / (pointCount - 1);
    const taper = Math.pow(progress, 0.42);
    sides[index * 2] = -1;
    sides[index * 2 + 1] = 1;
    tapers[index * 2] = taper;
    tapers[index * 2 + 1] = taper;
    if (index === pointCount - 1) continue;
    const vertex = index * 2;
    const offset = index * 6;
    indices.set([vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2], offset);
  }
  const geometry = new THREE18.BufferGeometry();
  geometry.setAttribute("position", new THREE18.BufferAttribute(positions, 3));
  geometry.setAttribute("aPrevious", new THREE18.BufferAttribute(previous, 3));
  geometry.setAttribute("aNext", new THREE18.BufferAttribute(next, 3));
  geometry.setAttribute("aSide", new THREE18.BufferAttribute(sides, 1));
  geometry.setAttribute("aTaper", new THREE18.BufferAttribute(tapers, 1));
  geometry.setIndex(new THREE18.BufferAttribute(indices, 1));
  const uniforms = {
    uColor: { value: new THREE18.Color(color) },
    uAlpha: { value: 1 },
    uTime: { value: 0 },
    uWidth: { value: width }
  };
  const material = enableSpellBloom(new THREE18.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE18.AdditiveBlending,
    side: THREE18.DoubleSide,
    vertexShader: `
      uniform float uWidth;
      attribute vec3 aPrevious;
      attribute vec3 aNext;
      attribute float aSide;
      attribute float aTaper;
      varying float vAcross;
      varying float vTaper;
      void main() {
        vec3 currentView = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vec3 previousView = (modelViewMatrix * vec4(aPrevious, 1.0)).xyz;
        vec3 nextView = (modelViewMatrix * vec4(aNext, 1.0)).xyz;
        vec3 tangent = normalize(nextView - previousView + vec3(0.00001));
        vec3 viewDirection = normalize(-currentView);
        vec3 normal = normalize(cross(tangent, viewDirection) + vec3(0.00001));
        float worldScale = length(modelMatrix[0].xyz);
        currentView += normal * uWidth * worldScale * aSide * aTaper;
        vAcross = aSide;
        vTaper = aTaper;
        gl_Position = projectionMatrix * vec4(currentView, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uAlpha;
      uniform float uTime;
      varying float vAcross;
      varying float vTaper;
      void main() {
        float softEdge = pow(max(0.0, 1.0 - abs(vAcross)), 0.65);
        float plasma = 0.78 + 0.22 * sin(uTime * 24.0 + vTaper * 8.0);
        float alpha = uAlpha * softEdge * vTaper;
        if (alpha < 0.004) discard;
        vec3 hot = mix(uColor, vec3(1.0), softEdge * 0.46) * plasma;
        gl_FragColor = vec4(hot, alpha);
      }
    `
  }));
  material.toneMapped = false;
  const mesh = new THREE18.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  const point = new THREE18.Vector3();
  const prior = new THREE18.Vector3();
  const following = new THREE18.Vector3();
  return {
    mesh,
    uniforms,
    update(points) {
      const packed = points instanceof Float32Array;
      if (points.length !== (packed ? pointCount * 3 : pointCount)) {
        throw new Error(`Expected ${pointCount} spell ribbon points.`);
      }
      const positionAttribute = geometry.getAttribute("position");
      const previousAttribute = geometry.getAttribute("aPrevious");
      const nextAttribute = geometry.getAttribute("aNext");
      for (let index = 0; index < pointCount; index += 1) {
        if (packed) {
          point.fromArray(points, index * 3);
          prior.fromArray(points, Math.max(0, index - 1) * 3);
          following.fromArray(points, Math.min(pointCount - 1, index + 1) * 3);
        } else {
          point.copy(points[index]);
          prior.copy(points[Math.max(0, index - 1)]);
          following.copy(points[Math.min(pointCount - 1, index + 1)]);
        }
        for (let side2 = 0; side2 < 2; side2 += 1) {
          const vertex = index * 2 + side2;
          positionAttribute.setXYZ(vertex, point.x, point.y, point.z);
          previousAttribute.setXYZ(vertex, prior.x, prior.y, prior.z);
          nextAttribute.setXYZ(vertex, following.x, following.y, following.z);
        }
      }
      positionAttribute.needsUpdate = true;
      previousAttribute.needsUpdate = true;
      nextAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}

// studio/src/vfx/abilities/createMeasuredAttackTrail.ts
var ATTACK_SAMPLES = 65;
function createMeasuredAttackTrail(parent) {
  const samples = Array.from({ length: ATTACK_SAMPLES }, () => new T5.Vector3());
  const points = Array.from({ length: 18 }, () => new T5.Vector3());
  const ribbon = createSpellRibbon("#e9ddb6", 18, 0.016);
  ribbon.mesh.name = "MeasuredContactStreak";
  parent.add(ribbon.mesh);
  const current = new T5.Vector3(), previous = new T5.Vector3();
  let count = 0;
  function at(progress, out) {
    const x = T5.MathUtils.clamp(progress, 0, 1) * (ATTACK_SAMPLES - 1), i = Math.min(ATTACK_SAMPLES - 2, Math.floor(x));
    return out.lerpVectors(samples[i], samples[i + 1], x - i);
  }
  return {
    reset() {
      count = 0;
      ribbon.mesh.visible = false;
    },
    capture(index, point) {
      samples[index].copy(point);
      count = Math.max(count, index + 1);
    },
    sample(active, time, duration, color) {
      ribbon.mesh.visible = false;
      if (!active || count !== ATTACK_SAMPLES || time > duration) return;
      at(time / duration, current);
      at((time - 0.014) / duration, previous);
      const speed = current.distanceTo(previous) / 0.014;
      if (speed < 1.6) return;
      for (let i = 0; i < 18; i++) at((time - 0.065 * (1 - i / 17)) / duration, points[i]);
      ribbon.update(points);
      ribbon.mesh.visible = true;
      ribbon.uniforms.uColor.value.set(color);
      ribbon.uniforms.uAlpha.value = Math.min(0.5, (speed - 1.6) * 0.12);
      ribbon.uniforms.uTime.value = time;
    },
    dispose() {
      parent.remove(ribbon.mesh);
      ribbon.dispose();
    }
  };
}

// studio/src/abilities/createAbilityRigCapture.ts
function createAbilityRigCapture(options) {
  const mixer = new T6.AnimationMixer(options.character);
  const nodes = [options.actor];
  options.character.traverse((node) => nodes.push(node));
  return {
    capture(ability, melee) {
      const clip = options.clips.get(ability.visual.motion);
      if (!clip) throw new Error(`Missing motion clip for ${ability.visual.motion}.`);
      const saved = nodes.map((node) => ({
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        visible: node.visible
      }));
      const restore = () => {
        for (const pose of saved) {
          pose.node.position.copy(pose.position);
          pose.node.quaternion.copy(pose.quaternion);
          pose.node.scale.copy(pose.scale);
          pose.node.visible = pose.visible;
        }
        options.actor.updateMatrixWorld(true);
      };
      const timing = abilityTiming(ability);
      const action = mixer.clipAction(clip).setLoop(T6.LoopOnce, 1);
      action.clampWhenFinished = true;
      function sample2(time) {
        action.stop();
        restore();
        const phase = time < timing.release ? time / timing.release * timing.marker : Math.min(1, timing.marker + (time - timing.release) / timing.recovery * (1 - timing.marker));
        action.reset().play();
        action.time = T6.MathUtils.clamp(phase, 0, 0.999999) * clip.duration;
        mixer.update(0);
        options.sample(ability.visual.motion, phase, actionPhase(ability, time));
        options.actor.updateMatrixWorld(true);
      }
      try {
        if (melee) for (let index = 0; index < ATTACK_SAMPLES; index++) {
          sample2(index / (ATTACK_SAMPLES - 1) * (timing.release + timing.recovery));
          options.motion(index);
        }
        sample2(timing.release);
        options.release();
      } finally {
        action.stop();
        restore();
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(options.character);
    }
  };
}

// studio/src/vfx/abilities/createAbilityVfx.ts
import * as T21 from "three";

// studio/src/vfx/abilities/createAbilityParticles.ts
import * as T7 from "three";
var COUNT = 560;
var fract = (x) => x - Math.floor(x);
var random = (i, seed) => fract(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453);
function createAbilityParticles(parent) {
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const alphas = new Float32Array(COUNT);
  const geometry = new T7.BufferGeometry();
  geometry.setAttribute("position", new T7.BufferAttribute(positions, 3).setUsage(T7.DynamicDrawUsage));
  geometry.setAttribute("size", new T7.BufferAttribute(sizes, 1).setUsage(T7.DynamicDrawUsage));
  geometry.setAttribute("alpha", new T7.BufferAttribute(alphas, 1).setUsage(T7.DynamicDrawUsage));
  const material = enableSpellBloom(new T7.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T7.AdditiveBlending,
    uniforms: { tint: { value: new T7.Color() }, accent: { value: new T7.Color() }, time: { value: 0 } },
    vertexShader: `attribute float size; attribute float alpha; varying float a; varying float phase;
      void main(){a=alpha; phase=size*41.; vec4 p=modelViewMatrix*vec4(position,1.);
      gl_PointSize=clamp(size*650./max(.1,-p.z),1.,110.); gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform vec3 tint; uniform vec3 accent; uniform float time;
      varying float a; varying float phase;
      void main(){vec2 p=gl_PointCoord-.5; float r=length(p)*2.;
        float grain=.84+.16*sin(p.x*31.+phase)*sin(p.y*29.-time*3.);
        float core=exp(-r*r*30.); float halo=pow(max(0.,1.-r),2.5)*grain;
        gl_FragColor=vec4(mix(tint,accent,core)*1.5,(halo*.6+core*.5)*a);}`
  }));
  const points = new T7.Points(geometry, material);
  const centerOrigin = new T7.Vector3();
  points.frustumCulled = false;
  parent.add(points);
  return {
    update(v2, time, release, origin, target, seed) {
      const family = v2.family;
      const elapsed = time - release;
      if (elapsed < 0 && ["slash", "impact"].includes(family)) {
        alphas.fill(0);
        positions.fill(0);
        sizes.fill(0);
        geometry.getAttribute("alpha").needsUpdate = true;
        return;
      }
      const sustain = ["aura", "shield", "heal", "portal", "song", "stealth", "drain", "mark", "trap"].includes(family);
      material.uniforms.tint.value.set(v2.color);
      material.uniforms.accent.value.set(v2.accent);
      material.uniforms.time.value = time;
      for (let i = 0; i < COUNT; i++) {
        const r = random(i + 1, seed), s = random(i + 17, seed), q = random(i + 61, seed);
        const theta = r * Math.PI * 2;
        let x = 0, y = 0, z = 0, alpha = 0, size = 0.015 + s * 0.045;
        if (elapsed < 0) {
          const phase = fract(time * 0.9 + s);
          const radius = (1 - phase) * (0.4 + q * 0.65) * Math.min(1, time * 3);
          x = origin.x + Math.cos(theta + phase * 5) * radius;
          y = origin.y + Math.sin(theta * 2) * radius;
          z = origin.z + Math.sin(theta + phase * 5) * radius;
          alpha = Math.sin(phase * Math.PI) * Math.min(1, time * 2) * 0.75;
        } else if (sustain) {
          const phase = fract(elapsed * (0.35 + r * 0.18) + s);
          const fade = Math.min(1, elapsed * 8) * T7.MathUtils.clamp(3.2 - elapsed, 0, 1);
          const radius = (0.48 + q * 0.55) * v2.scale;
          const angle = theta + elapsed * (family === "portal" ? 2 : 0.65) + phase * 3;
          const center = ["portal", "mark", "trap"].includes(family) ? target : centerOrigin;
          x = center.x + Math.cos(angle) * radius;
          z = center.z + Math.sin(angle) * radius;
          y = family === "trap" ? 0.05 + phase * 0.25 : phase * 2.5;
          alpha = Math.sin(phase * Math.PI) * fade;
          if (family === "drain") {
            const f = fract(elapsed * 0.7 + s);
            x = T7.MathUtils.lerp(target.x, origin.x, f) + Math.cos(theta + f * 16) * 0.12;
            y = T7.MathUtils.lerp(target.y, origin.y, f) + Math.sin(f * Math.PI) * 0.6;
            z = T7.MathUtils.lerp(target.z, origin.z, f);
          }
          if (v2.style === "wisps") size *= 3;
        } else {
          const age = elapsed - q * 0.2 - (["projectile", "volley", "meteor"].includes(family) ? 0.42 : 0);
          const life = 0.5 + s * 1.2;
          const speed = (0.6 + q * 2.8) * v2.scale;
          const vertical = family === "nova" ? 0.12 + s * 0.6 : 0.5 + s * 2.6;
          x = target.x + Math.cos(theta) * speed * age;
          z = target.z + Math.sin(theta) * speed * age;
          y = Math.max(0.025, target.y + vertical * age - age * age * 1.8);
          alpha = age > 0 ? Math.pow(Math.max(0, 1 - age / life), 1.5) : 0;
          if (v2.style === "embers") size *= 1.6;
          if (v2.style === "wisps") size *= 3;
        }
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        sizes[i] = size;
        alphas[i] = alpha;
      }
      for (const attr of Object.values(geometry.attributes)) attr.needsUpdate = true;
    },
    dispose() {
      parent.remove(points);
      geometry.dispose();
      material.dispose();
    }
  };
}

// studio/src/vfx/abilities/createAbilityShapes.ts
import * as T8 from "three";
var clamp = (n) => T8.MathUtils.clamp(n, 0, 1);
var TAU = Math.PI * 2;
var UP = new T8.Vector3(0, 1, 0);
function createAbilityShapes(parent) {
  const group = new T8.Group();
  parent.add(group);
  const ringGeo = new T8.RingGeometry(0.96, 1, 112);
  const shardGeo = new T8.OctahedronGeometry(1);
  const ballGeo = new T8.SphereGeometry(1, 36, 24);
  const barGeo = new T8.CylinderGeometry(8e-3, 0.016, 1, 5);
  const arcGeo = new T8.RingGeometry(0.965, 1, 64, 1, 0, Math.PI * 1.45);
  const portalArcGeo = new T8.RingGeometry(0.989, 1, 112, 1, 0, Math.PI * 1.65);
  const materials = [];
  function mesh(geometry) {
    const material = enableSpellBloom(new T8.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0,
      side: T8.DoubleSide,
      depthWrite: false,
      blending: T8.AdditiveBlending
    }));
    materials.push(material);
    const result = new T8.Mesh(geometry, material);
    group.add(result);
    return result;
  }
  const rings = Array.from({ length: 9 }, () => mesh(ringGeo));
  const arcs = Array.from({ length: 6 }, () => mesh(arcGeo));
  const shards = Array.from({ length: 32 }, () => mesh(shardGeo));
  const bolts = Array.from({ length: 42 }, () => mesh(barGeo));
  const balls = Array.from({ length: 4 }, () => mesh(ballGeo));
  const shapes = [...rings, ...arcs, ...shards, ...bolts, ...balls];
  const shellMaterial = enableSpellBloom(new T8.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T8.DoubleSide,
    blending: T8.AdditiveBlending,
    uniforms: { tint: { value: new T8.Color() }, opacity: { value: 0 }, time: { value: 0 }, portal: { value: 0 } },
    vertexShader: `varying vec3 n; varying vec3 p; varying vec3 eye; void main(){ n=normalize(normalMatrix*normal);
      p=position; vec4 mv=modelViewMatrix*vec4(position,1.);eye=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 n; varying vec3 p; varying vec3 eye; uniform vec3 tint;
      uniform float opacity; uniform float time; uniform float portal;
      void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),2.8);
      float cells=pow(abs(sin(p.x*24.+sin(p.y*17.))*sin(p.z*24.+cos(p.y*17.))),12.);
      float scan=pow(.5+.5*sin(p.y*40.-time*4.),16.);
      float radius=length(p.xy), angle=atan(p.y,p.x);
      float spiral=pow(.5+.5*sin(angle*4.+radius*23.-time*2.5),6.);
      float vortex=(rim*.12+spiral*.075)*(1.-smoothstep(.45,1.,radius));
      gl_FragColor=vec4(tint*1.5,mix(rim*.40+cells*.09+scan*.035,vortex,portal)*opacity);}`
  }));
  const shell = new T8.Mesh(ballGeo, shellMaterial);
  group.add(shell);
  const voidMaterial = new T8.MeshBasicMaterial({ color: "#05020b", transparent: true, opacity: 0.86, depthWrite: false });
  const voidDisc = new T8.Mesh(ballGeo, voidMaterial);
  group.add(voidDisc);
  materials.push(voidMaterial);
  materials.push(shellMaterial);
  const light = new T8.PointLight("#ffffff", 0, 7, 2);
  group.add(light);
  const direction2 = new T8.Vector3(), point = new T8.Vector3(), previous = new T8.Vector3();
  const originGround = new T8.Vector3(0, 0.025, 0);
  function show(m, color, alpha, position, x = 1, y = x, z = x) {
    m.visible = alpha > 1e-3;
    m.position.copy(position);
    m.scale.set(x, y, z);
    m.material.color.set(color);
    m.material.opacity = clamp(alpha);
    m.rotation.set(0, 0, 0);
  }
  function groundRing(index, center, radius, alpha, color) {
    const ring = rings[index];
    show(ring, color, alpha, center, Math.max(1e-3, radius));
    ring.position.y = 0.035 + index * 4e-3;
    ring.rotation.x = -Math.PI / 2;
  }
  return {
    update(ability, time, release, origin, target) {
      for (const child of shapes) child.visible = false;
      shell.visible = false;
      voidDisc.visible = false;
      light.intensity = 0;
      shellMaterial.uniforms.portal.value = 0;
      const v2 = ability.visual, e = time - release, s = v2.scale;
      const onset = clamp(e * 8), fade = clamp(3 - e), burst = Math.exp(-Math.max(0, e) * 4.5) * onset;
      const { color, accent, family } = v2;
      if (ability.visual.pose === "bow" || ["snare", "beast-call", "blink", "shadowstep", "disengage", "chain-lightning", "meteor", "hunters-mark"].includes(ability.id)) return;
      for (const arc of arcs) arc.geometry = family === "portal" ? portalArcGeo : arcGeo;
      light.color.set(color);
      light.position.copy(e < 0 ? origin : target);
      light.intensity = (e < 0 ? clamp(time / release) * 0.25 : burst * 1.6) * s;
      if (e < 0) {
        if (family === "slash" || family === "impact") {
          light.intensity = 0;
          return;
        }
        const gather = clamp(time / release);
        show(balls[0], color, gather * 0.4, origin, 0.025 + gather * 0.06);
        if (["meteor", "portal", "trap", "nova", "volley"].includes(family)) {
          groundRing(0, target, s * 0.75, gather * 0.3, color);
          groundRing(1, target, s * 0.68, gather * 0.15, accent);
        }
        return;
      }
      if (["aura", "shield", "heal", "song", "stealth", "portal", "mark", "trap"].includes(family)) {
        const center = ["portal", "mark", "trap"].includes(family) ? target : originGround;
        groundRing(0, center, s * (0.6 + onset * 0.14), fade * 0.5, color);
        groundRing(1, center, s * 0.8, fade * 0.22, color);
        for (let i = 0; i < 12; i++) {
          const a = TAU * i / 12 + (family === "portal" ? e * 0.65 : 0);
          point.set(center.x + Math.cos(a) * s * 0.7, 0.04, center.z + Math.sin(a) * s * 0.7);
          show(shards[i], color, fade * 0.7, point, 0.02, 0.01, i % 3 === 0 ? 0.16 : 0.055);
          shards[i].rotation.y = -a;
        }
        if (family === "shield" || family === "aura") {
          shell.visible = true;
          shell.position.set(0, 1.02, 0);
          shell.scale.setScalar(ability.id === "mana-shield" ? 1.1 : s * 0.85);
          if (ability.id === "mana-shield") shell.position.y = 1.11;
          shellMaterial.uniforms.tint.value.set(color);
          shellMaterial.uniforms.opacity.value = fade * onset * (family === "shield" ? 0.8 : 0.24);
          shellMaterial.uniforms.time.value = time;
        }
        if (family === "heal") {
          for (let i = 0; i < 7; i++) {
            const a = TAU * i / 7 + e * 0.3;
            point.set(Math.cos(a) * s * 0.5, 0.8, Math.sin(a) * s * 0.5);
            show(bolts[i], i % 2 ? color : accent, fade * 0.3, point, 1.5, (1.5 + Math.sin(e * 2 + i) * 0.4) * s, 1.5);
          }
          for (let i = 2; i < 6; i++) {
            const phase = (e * 0.38 + i / 4) % 1;
            groundRing(i, originGround, s * (0.5 + phase * 0.3), Math.sin(phase * Math.PI) * fade * 0.35, color);
            rings[i].position.y = phase * 2.6;
          }
        }
        if (family === "song") {
          for (let i = 0; i < 5; i++) {
            const phase = clamp((e - i * 0.19) / 1.8);
            groundRing(i, originGround, 0.3 + phase * s * 2, Math.sin(phase * Math.PI) * 0.55, i % 2 ? color : accent);
          }
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8 + e * 0.35;
            point.set(Math.cos(a) * (e * 0.7 + 0.5), 1.2 + Math.sin(e + i) * 0.25, Math.sin(a) * (e * 0.7 + 0.5));
            show(balls[i % 4], color, fade * 0.55, point, 0.055, 0.035, 0.03);
            show(bolts[i], color, fade * 0.55, point, 1, 0.2, 1);
            bolts[i].position.y += 0.08;
          }
        }
        if (family === "portal") {
          shell.visible = true;
          shell.position.set(target.x, s * 0.78, target.z);
          shell.scale.set(s * 0.72, s * 0.92, 0.09);
          shellMaterial.uniforms.tint.value.set(color);
          shellMaterial.uniforms.opacity.value = fade * onset;
          shellMaterial.uniforms.time.value = time;
          shellMaterial.uniforms.portal.value = 1;
          voidDisc.visible = true;
          voidDisc.position.copy(shell.position);
          voidDisc.scale.copy(shell.scale).multiplyScalar(0.985);
          voidMaterial.opacity = fade * onset * 0.88;
          for (let i = 0; i < 4; i++) {
            point.copy(shell.position);
            show(arcs[i], color, fade * 0.28, point, s * (0.77 + i * 0.018), s * (0.95 + i * 0.018), 1);
            arcs[i].rotation.z = e * (i % 2 ? -1.5 : 1.5) + i * 1.5;
          }
        }
        if ((family === "mark" || family === "trap") && ability.id !== "hunters-mark") {
          point.copy(target);
          point.y = family === "mark" ? 1.55 : 0.06;
          show(arcs[0], color, fade * 0.65, point, s * 0.35);
          arcs[0].rotation.z = e * 0.8;
          if (family === "trap") arcs[0].rotation.x = -Math.PI / 2;
          show(shards[20], accent, fade * 0.6, point, 0.06, 0.14, 0.06);
        }
        if (family === "stealth") {
          for (let i = 0; i < 4; i++) {
            point.set(0, 0.95, -(i + 1) * 0.32);
            show(balls[i], color, fade * 0.055 * (1 - i / 5), point, 0.32, 0.8, 0.22);
          }
        }
      }
      if (["impact", "nova", "meteor", "volley", "projectile", "lightning"].includes(family)) {
        const lag = ["meteor", "volley", "projectile"].includes(family) ? 0.42 : 0;
        const age = e - lag;
        for (let i = 0; i < 3; i++) {
          const phase = clamp((age - i * 0.08) / 1.2);
          groundRing(i, target, 0.1 + phase * s * 1.7, Math.sin(phase * Math.PI) * 0.42 * (1 - phase), color);
        }
        point.copy(target);
        show(balls[3], accent, age >= 0 ? Math.exp(-age * 12) * 0.7 : 0, point, 0.13 + Math.max(0, age) * 0.5);
        for (let i = 0; i < Math.min(32, family === "nova" ? 28 : v2.count + 9); i++) {
          const a = i * 2.399;
          const age2 = Math.max(0, age), rad = s * (0.2 + age2 * (1 + i % 4 * 0.45));
          point.set(target.x + Math.cos(a) * rad, 0.05 + Math.max(0, age2 * (1.2 + i % 3) - 3 * age2 * age2), target.z + Math.sin(a) * rad);
          show(shards[i], i % 4 ? color : accent, age < 0 ? 0 : clamp(1.2 - age2) * 0.8, point, 0.035, family === "nova" ? s * 0.24 * onset : 0.07, 0.03);
          shards[i].rotation.set(age2 * (i % 3), a, family === "nova" ? 0.5 : age2 * 4);
        }
      }
      if (family === "projectile" || family === "volley" || family === "meteor") {
        const count = Math.min(30, v2.count);
        for (let i = 0; i < count; i++) {
          const p = clamp((e - i * (family === "volley" ? 0.023 : 0.12)) / 0.42);
          point.lerpVectors(origin, target, p);
          if (family === "volley") {
            point.x += Math.sin(i * 7.1) * s * 0.6;
            point.z += Math.cos(i * 9.3) * s * 0.6;
            point.y += Math.sin(p * Math.PI) * 2.6;
          }
          if (family === "meteor") point.y += (1 - p) * 5;
          show(shards[i], color, p > 0 && p < 1 ? 0.95 : 0, point, family === "meteor" ? 0.22 : 0.05, family === "meteor" ? 0.4 : 0.24, 0.08);
          direction2.subVectors(target, origin).normalize();
          shards[i].quaternion.setFromUnitVectors(UP, direction2);
          if (family === "meteor") shards[i].rotation.z = e * 3;
        }
      }
      if (family === "lightning" || family === "drain") {
        previous.copy(origin);
        const boltFade = family === "drain" ? fade * onset : clamp(1 - e / 0.65) * (0.65 + 0.35 * Math.sin(e * 83));
        for (let i = 0; i < 42; i++) {
          const p = (i + 1) / 42;
          point.lerpVectors(origin, target, p);
          point.x += Math.sin(p * 75 + Math.floor(e * 18) * 3) * Math.sin(p * Math.PI) * 0.14;
          point.y += family === "drain" ? Math.sin(p * Math.PI) * 0.7 : Math.cos(p * 90 + Math.floor(e * 18)) * 0.13;
          direction2.subVectors(point, previous);
          show(bolts[i], i % 3 ? color : accent, boltFade, previous, 1.5, direction2.length(), 1.5);
          bolts[i].position.addScaledVector(direction2, 0.5);
          bolts[i].quaternion.setFromUnitVectors(UP, direction2.normalize());
          previous.copy(point);
        }
      }
    },
    dispose() {
      parent.remove(group);
      for (const geometry of [ringGeo, shardGeo, ballGeo, barGeo, arcGeo, portalArcGeo]) geometry.dispose();
      for (const material of materials) material.dispose();
      light.dispose();
    }
  };
}

// studio/src/vfx/abilities/createAbilityAtmosphere.ts
import * as T9 from "three";

// studio/src/vfx/spells/createSpellParticleLayer.ts
import * as THREE19 from "three";
var finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
function validatedAtlas(atlas) {
  const columns = positiveInteger(atlas?.columns ?? 1, "Atlas columns");
  const rows = positiveInteger(atlas?.rows ?? 1, "Atlas rows");
  const frames2 = positiveInteger(atlas?.frames ?? 1, "Atlas frames");
  if (frames2 > columns * rows) {
    throw new Error("Atlas frames cannot exceed its cell count.");
  }
  return { columns, rows, frames: frames2 };
}
function createSpellParticleLayer(options) {
  const capacity = positiveInteger(options.capacity, "Particle capacity");
  const atlas = validatedAtlas(options.atlas);
  const hasTexture = options.texture !== void 0;
  if (options.texture) {
    let textureChanged = false;
    if (options.texture.colorSpace === THREE19.NoColorSpace) {
      options.texture.colorSpace = THREE19.SRGBColorSpace;
      textureChanged = true;
    }
    if (!options.texture.flipY) {
      options.texture.flipY = true;
      textureChanged = true;
    }
    if (textureChanged) options.texture.needsUpdate = true;
  }
  const centers = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const rotations = new Float32Array(capacity);
  const colorsAndAlpha = new Float32Array(capacity * 4);
  const frames2 = new Float32Array(capacity);
  const stretches = new Float32Array(capacity);
  stretches.fill(1);
  const centerAttribute = new THREE19.InstancedBufferAttribute(centers, 3).setUsage(THREE19.DynamicDrawUsage);
  const sizeAttribute = new THREE19.InstancedBufferAttribute(sizes, 1).setUsage(THREE19.DynamicDrawUsage);
  const rotationAttribute = new THREE19.InstancedBufferAttribute(rotations, 1).setUsage(THREE19.DynamicDrawUsage);
  const colorAlphaAttribute = new THREE19.InstancedBufferAttribute(colorsAndAlpha, 4).setUsage(THREE19.DynamicDrawUsage);
  const frameAttribute = new THREE19.InstancedBufferAttribute(frames2, 1).setUsage(THREE19.DynamicDrawUsage);
  const stretchAttribute = new THREE19.InstancedBufferAttribute(stretches, 1).setUsage(THREE19.DynamicDrawUsage);
  const geometry = new THREE19.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("position", new THREE19.Float32BufferAttribute([
    -0.5,
    -0.5,
    0,
    0.5,
    -0.5,
    0,
    0.5,
    0.5,
    0,
    -0.5,
    0.5,
    0
  ], 3));
  geometry.setAttribute("uv", new THREE19.Float32BufferAttribute([
    0,
    0,
    1,
    0,
    1,
    1,
    0,
    1
  ], 2));
  geometry.setAttribute("aCenter", centerAttribute);
  geometry.setAttribute("aSize", sizeAttribute);
  geometry.setAttribute("aRotation", rotationAttribute);
  geometry.setAttribute("aColorAlpha", colorAlphaAttribute);
  geometry.setAttribute("aFrame", frameAttribute);
  geometry.setAttribute("aStretch", stretchAttribute);
  geometry.instanceCount = 0;
  const material = new THREE19.ShaderMaterial({
    defines: hasTexture ? { USE_PARTICLE_ATLAS: 1 } : {},
    uniforms: {
      uMap: { value: options.texture ?? null },
      uAtlas: { value: new THREE19.Vector3(atlas.columns, atlas.rows, atlas.frames) },
      uHdr: { value: THREE19.MathUtils.clamp(finiteOr(options.hdr ?? 1, 1), 0, 16) },
      uSurfacePoint: { value: new THREE19.Vector3() },
      uSurfaceNormal: { value: new THREE19.Vector3(0, 1, 0) },
      uSurfaceSoftness: { value: 0 }
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: options.additive ? THREE19.AdditiveBlending : THREE19.NormalBlending,
    vertexShader: `
      attribute vec3 aCenter;
      attribute float aSize;
      attribute float aRotation;
      attribute vec4 aColorAlpha;
      attribute float aFrame;
      attribute float aStretch;

      uniform vec3 uSurfacePoint;
      uniform vec3 uSurfaceNormal;

      varying vec2 vUv;
      varying vec4 vColorAlpha;
      varying float vFrame;
      varying float vSurfaceDistance;

      void main() {
        vUv = uv;
        vColorAlpha = aColorAlpha;
        vFrame = aFrame;

        vec2 corner = position.xy;
        corner.y *= aStretch;
        float cosine = cos(aRotation);
        float sine = sin(aRotation);
        corner = mat2(cosine, -sine, sine, cosine) * corner;

        vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
        float worldScale = (
          length(modelMatrix[0].xyz)
          + length(modelMatrix[1].xyz)
          + length(modelMatrix[2].xyz)
        ) / 3.0;
        centerView.xy += corner * max(0.0, aSize) * worldScale;
        vec3 surfaceNormalView = normalMatrix * uSurfaceNormal;
        vec4 surfacePointView = modelViewMatrix * vec4(uSurfacePoint, 1.0);
        // Keep the transformed normal unnormalized: its scale converts the view-space
        // dot product back to the layer-local distance used by uSurfaceSoftness.
        vSurfaceDistance = dot(centerView.xyz - surfacePointView.xyz, surfaceNormalView);
        gl_Position = projectionMatrix * centerView;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uAtlas;
      uniform float uHdr;
      uniform float uSurfaceSoftness;

      varying vec2 vUv;
      varying vec4 vColorAlpha;
      varying float vFrame;
      varying float vSurfaceDistance;

      #ifdef USE_PARTICLE_ATLAS
        vec2 atlasUv(float frameIndex) {
          float column = mod(frameIndex, uAtlas.x);
          float row = floor(frameIndex / uAtlas.x);
          return vec2(
            (column + vUv.x) / uAtlas.x,
            1.0 - (row + 1.0 - vUv.y) / uAtlas.y
          );
        }
      #endif

      void main() {
        vec4 particle;
        #ifdef USE_PARTICLE_ATLAS
          float boundedFrame = clamp(vFrame, 0.0, uAtlas.z - 1.0);
          float firstFrame = floor(boundedFrame);
          float secondFrame = min(firstFrame + 1.0, uAtlas.z - 1.0);
          vec4 firstSample = texture2D(uMap, atlasUv(firstFrame));
          vec4 secondSample = texture2D(uMap, atlasUv(secondFrame));
          float frameBlend = fract(boundedFrame);
          float blendedAlpha = mix(firstSample.a, secondSample.a, frameBlend);
          vec3 blendedPremultiplied = mix(
            firstSample.rgb * firstSample.a,
            secondSample.rgb * secondSample.a,
            frameBlend
          );
          particle = vec4(blendedPremultiplied / max(blendedAlpha, 0.0001), blendedAlpha);
        #else
          vec2 disc = vUv * 2.0 - 1.0;
          float radiusSquared = dot(disc, disc);
          float softEdge = 1.0 - smoothstep(0.2, 1.0, radiusSquared);
          float hotCore = exp(-radiusSquared * 8.0);
          particle = vec4(vec3(0.72 + softEdge * 0.28), softEdge);
          particle.rgb *= 0.72 + hotCore * 0.65;
        #endif

        float surfaceFade = uSurfaceSoftness > 0.0
          ? smoothstep(0.0, uSurfaceSoftness, vSurfaceDistance)
          : 1.0;
        float alpha = particle.a * vColorAlpha.a * surfaceFade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(particle.rgb * vColorAlpha.rgb * uHdr, alpha);
      }
    `
  });
  material.toneMapped = false;
  if (options.additive) enableSpellBloom(material);
  const mesh = new THREE19.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = options.additive ? 8 : 7;
  mesh.visible = false;
  const attributes = [
    centerAttribute,
    sizeAttribute,
    rotationAttribute,
    colorAlphaAttribute,
    frameAttribute,
    stretchAttribute
  ];
  return {
    mesh,
    setParticle(index, position, size, rotation2, color, opacity, frame, stretch = 1) {
      if (!Number.isInteger(index) || index < 0 || index >= capacity) {
        throw new RangeError(`Particle index ${index} is outside capacity ${capacity}.`);
      }
      const centerOffset = index * 3;
      centers[centerOffset] = finiteOr(position.x, 0);
      centers[centerOffset + 1] = finiteOr(position.y, 0);
      centers[centerOffset + 2] = finiteOr(position.z, 0);
      sizes[index] = Math.max(0, finiteOr(size, 0));
      rotations[index] = finiteOr(rotation2, 0);
      const colorOffset = index * 4;
      colorsAndAlpha[colorOffset] = finiteOr(color.r, 0);
      colorsAndAlpha[colorOffset + 1] = finiteOr(color.g, 0);
      colorsAndAlpha[colorOffset + 2] = finiteOr(color.b, 0);
      colorsAndAlpha[colorOffset + 3] = THREE19.MathUtils.clamp(finiteOr(opacity, 0), 0, 1);
      frames2[index] = THREE19.MathUtils.clamp(finiteOr(frame, 0), 0, atlas.frames - 1);
      stretches[index] = THREE19.MathUtils.clamp(finiteOr(stretch, 1), 0.05, 16);
    },
    setSurfaceFade(point, normal, softness) {
      const pointIsFinite = Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
      const normalIsFinite = Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z);
      const normalLengthSquared = normalIsFinite ? normal.lengthSq() : 0;
      if (!pointIsFinite || normalLengthSquared < 1e-12 || !Number.isFinite(softness) || softness <= 0) {
        material.uniforms.uSurfaceSoftness.value = 0;
        return;
      }
      material.uniforms.uSurfacePoint.value.copy(point);
      material.uniforms.uSurfaceNormal.value.copy(normal).multiplyScalar(1 / Math.sqrt(normalLengthSquared));
      material.uniforms.uSurfaceSoftness.value = softness;
    },
    commit(count) {
      const committedCount = THREE19.MathUtils.clamp(Math.floor(finiteOr(count, 0)), 0, capacity);
      geometry.instanceCount = committedCount;
      mesh.visible = committedCount > 0;
      for (let index = 0; index < attributes.length; index += 1) attributes[index].needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    }
  };
}

// studio/src/vfx/abilities/createAbilityAtmosphere.ts
var clamp2 = (n) => T9.MathUtils.clamp(n, 0, 1);
function createAbilityAtmosphere(root, textures) {
  const atlas = { columns: 6, rows: 6, frames: 36 };
  const smoke = createSpellParticleLayer({ capacity: 28, texture: textures.smoke, atlas, additive: false });
  const energy = createSpellParticleLayer({ capacity: 18, texture: textures.fire, atlas, additive: true, hdr: 2.5 });
  root.add(smoke.mesh, energy.mesh);
  const ground = new T9.Vector3(0, 0.02, 0), up = new T9.Vector3(0, 1, 0);
  smoke.setSurfaceFade(ground, up, 0.14);
  energy.setSurfaceFade(ground, up, 0.12);
  const position = new T9.Vector3(), tint = new T9.Color(), mistTint = new T9.Color(), gray = new T9.Color("#85958d");
  const residueMaterial = new T9.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T9.DoubleSide,
    uniforms: { tint: { value: new T9.Color() }, opacity: { value: 0 }, time: { value: 0 }, mode: { value: 0 } },
    vertexShader: `varying vec2 uvp; void main(){uvp=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 uvp; uniform vec3 tint; uniform float opacity; uniform float time; uniform float mode;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){float r=length(uvp), a=atan(uvp.y,uvp.x);float grain=noise(uvp*12.)*.5+noise(uvp*39.)*.3+noise(uvp*83.)*.2;
        float edge=1.-smoothstep(.6,.98,r+(grain-.5)*.2);float cracks=pow(max(0.,1.-abs(sin(a*17.+sin(r*21.)*.7))),22.);
        float frost=(.38+grain*.7+cracks*.22)*edge;
        float voidCore=(1.-smoothstep(.12,.78,r))*(.65+grain*.35);
        float alpha=mix(frost,voidCore,step(1.5,mode))*opacity;
        gl_FragColor=vec4(tint*(.7+grain*.5),alpha);}`
  });
  const residue = new T9.Mesh(new T9.PlaneGeometry(2, 2), residueMaterial);
  residue.rotation.x = -Math.PI / 2;
  root.add(residue);
  const coronaMaterial = enableSpellBloom(new T9.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T9.DoubleSide,
    blending: T9.AdditiveBlending,
    uniforms: { tint: { value: new T9.Color() }, time: { value: 0 }, opacity: { value: 0 } },
    vertexShader: `varying vec2 u;void main(){u=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 u;uniform vec3 tint;uniform float time;uniform float opacity;
      void main(){float a=atan(u.y,u.x), r=length(u);float edge=.67+sin(a*9.+time*2.)*.035+sin(a*23.-time)*.014;
        float rim=exp(-pow((r-edge)/.018,2.));float filaments=pow(.5+.5*sin(a*42.+r*19.-time*3.),6.);
        float corona=exp(-abs(r-edge)*19.)*filaments;
        gl_FragColor=vec4(tint*2.,(rim*.8+corona*.3)*opacity);}`
  }));
  const corona = new T9.Mesh(new T9.PlaneGeometry(2, 2), coronaMaterial);
  root.add(corona);
  return {
    sample(ability, time, release, origin, target) {
      const v2 = ability.visual, family = v2.family, elapsed = time - release, s = v2.scale;
      tint.set(v2.color);
      mistTint.copy(tint).lerp(gray, 0.6);
      residue.visible = false;
      corona.visible = false;
      if (elapsed < 0) {
        smoke.commit(0);
        energy.commit(0);
        return;
      }
      const age = elapsed - (["projectile", "meteor", "volley"].includes(family) ? 0.42 : 0);
      const sustained = ["portal", "stealth", "heal", "aura", "shield"].includes(family);
      const cold = family === "nova" && v2.style === "shards";
      const hot = v2.style === "embers";
      const impact = ["impact", "meteor", "nova", "projectile", "volley", "stealth", "portal", "heal", "aura", "shield"].includes(family);
      const fade = clamp2(2.7 - Math.max(0, age));
      let smokeCount = 0, energyCount = 0;
      if (impact && age >= 0) {
        for (let i = 0; i < 28; i++) {
          const a = i * 2.39996;
          const t = sustained ? (age * 0.7 + i / 28) % 1.5 : age - i * 0.012;
          if (t < 0) continue;
          const radius = (sustained ? 0.45 + Math.sin(t * 2) * 0.15 : t * (1 + i % 5 * 0.18)) * s;
          const centered = ["stealth", "heal", "aura", "shield"].includes(family);
          position.set(
            (centered ? 0 : target.x) + Math.cos(a) * radius,
            cold ? 0.12 + t * 0.12 : 0.12 + t * (0.45 + i % 4 * 0.12),
            (centered ? 0 : target.z) + Math.sin(a) * radius
          );
          smoke.setParticle(
            smokeCount++,
            position,
            (0.36 + t * 0.7) * s,
            a + t * 0.2,
            cold ? tint : mistTint,
            Math.sin(clamp2(t / 1.6) * Math.PI) * fade * (cold ? 0.35 : 0.22),
            Math.min(35, t * 22)
          );
          if (i < 18 && hot) {
            energy.setParticle(energyCount++, position, (0.25 + t * 0.7) * s, a, tint, clamp2(1 - t / 1.1) * fade * 0.48, Math.min(35, t * 32));
          }
        }
      }
      if (["projectile", "meteor"].includes(family) && elapsed < 0.6 && hot) {
        energyCount = 0;
        for (let i = 0; i < 12; i++) {
          const p = clamp2((elapsed - i * 0.012) / 0.42);
          if (p <= 0 || p >= 1) continue;
          position.lerpVectors(origin, target, p);
          if (family === "meteor") position.y += (1 - p) * 5;
          energy.setParticle(energyCount++, position, (0.32 - i * 0.015) * s, i * 0.8, tint, 0.8 - i * 0.045, Math.min(35, elapsed * 35 + i));
        }
      }
      smoke.commit(smokeCount);
      energy.commit(energyCount);
      if ((cold || hot || family === "impact" || family === "portal" || family === "trap") && age >= 0) {
        residue.visible = true;
        residue.position.copy(target);
        residue.position.y = 0.023;
        residue.scale.setScalar((0.35 + Math.min(1, age * 3) * 0.7) * s);
        residueMaterial.uniforms.tint.value.set(cold ? "#b5e1e8" : hot ? "#100b08" : family === "portal" ? "#09030f" : "#152018");
        residueMaterial.uniforms.opacity.value = clamp2(age * 8) * fade * (cold ? 0.85 : 0.72);
        residueMaterial.uniforms.time.value = time;
        residueMaterial.uniforms.mode.value = family === "portal" ? 2 : 0;
      }
      if (family === "portal" || family === "nova" || family === "heal" || family === "meteor") {
        corona.visible = age >= 0;
        coronaMaterial.uniforms.tint.value.copy(tint);
        coronaMaterial.uniforms.opacity.value = clamp2(age * 8) * fade;
        coronaMaterial.uniforms.time.value = time;
        corona.position.copy(target);
        corona.rotation.set(-Math.PI / 2, 0, 0);
        corona.position.y = 0.04;
        corona.scale.setScalar(s * (1 + Math.min(1, age) * 0.5));
        if (family === "portal") {
          corona.position.y = s * 0.78;
          corona.rotation.set(0, 0, 0);
          corona.scale.set(s * 1.12, s * 1.4, 1);
        }
        if (family === "heal") {
          corona.position.set(0, 0.04, 0);
        }
      }
    },
    dispose() {
      root.remove(smoke.mesh, energy.mesh, residue, corona);
      smoke.dispose();
      energy.dispose();
      residue.geometry.dispose();
      residueMaterial.dispose();
      corona.geometry.dispose();
      coronaMaterial.dispose();
    }
  };
}

// studio/src/vfx/abilities/createSignatureSpells.ts
import * as T10 from "three";

// studio/src/vfx/spells/createFireballVfx.ts
import * as THREE23 from "three";

// studio/src/vfx/spells/createFireVolume.ts
import * as THREE20 from "three";
function createFireVolume() {
  const material = enableSpellBloom(new THREE20.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE20.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*length(modelMatrix[0].xyz);
        gl_Position=projectionMatrix*center;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      float turbulence(vec3 p){
        float flow=uTime*3.;
        return sin(p.x*5.+flow+sin(p.y*7.-flow))*sin(p.z*6.-flow*.7)
          +.4*sin(p.x*13.-flow*1.3)*sin(p.y*11.+p.z*9.+flow);
      }
      void main(){
        vec2 screen=(vUv-.5)*2.;
        if(length(screen)>1.) discard;
        vec3 radiance=vec3(0.);
        float alpha=0.;
        for(int i=0;i<28;i++){
          vec3 p=vec3(screen,-1.+float(i)/13.5);
          float noise=turbulence(p);
          float density=clamp((.76-length(p)+noise*.14)*3.,0.,1.);
          float heat=clamp(density*.7+.25+noise*.18,0.,1.);
          vec3 color=mix(vec3(1.,.08,.008),vec3(1.,.57,.06),smoothstep(.1,.7,heat));
          color=mix(color,vec3(1.,.93,.55),smoothstep(.75,1.,heat));
          float absorption=density*.16;
          radiance+=(1.-alpha)*color*absorption;
          alpha+=(1.-alpha)*absorption;
        }
        if(alpha<.004) discard;
        gl_FragColor=vec4(radiance/max(alpha,.001)*1.4,alpha*uOpacity);
      }
    `
  }));
  material.toneMapped = false;
  const mesh = new THREE20.Mesh(new THREE20.PlaneGeometry(0.38, 0.38), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return { mesh, material };
}

// studio/src/vfx/spells/createFireballImpact.ts
import * as THREE22 from "three";

// studio/src/vfx/spells/spellVfxUtils.ts
import * as THREE21 from "three";
var additiveMaterial = (color, opacity = 1) => enableSpellBloom(new THREE21.MeshBasicMaterial({
  color,
  transparent: true,
  opacity,
  depthWrite: false,
  blending: THREE21.AdditiveBlending,
  side: THREE21.DoubleSide
}));
function createSpellEffectContext(actor, sockets) {
  return {
    actor,
    sockets,
    socketPosition(name, target) {
      const socket = sockets.get(name);
      if (!socket) return target.set(0, 1.25, 0.18);
      actor.updateWorldMatrix(true, false);
      socket.getWorldPosition(target);
      return actor.worldToLocal(target);
    }
  };
}
function disposeTree(root) {
  const geometries = /* @__PURE__ */ new Set();
  const materials = /* @__PURE__ */ new Set();
  root.traverse((object) => {
    if (!(object instanceof THREE21.Mesh || object instanceof THREE21.Line || object instanceof THREE21.Points)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.parent?.remove(root);
}
function smoothRange(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = THREE21.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function quadraticBezier(target, start, control, end, t) {
  const inverse = 1 - t;
  return target.set(
    inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z
  );
}

// studio/src/vfx/spells/createFireballImpact.ts
var ATLAS = { columns: 6, rows: 6, frames: 36 };
var HOT = new THREE22.Color("#ffbc6a");
var SOOT = new THREE22.Color("#a79888");
var EMBER = new THREE22.Color("#ff9b28");
function createFireballImpact(parent, textures) {
  const root = new THREE22.Group();
  root.name = "FireballImpact";
  parent.add(root);
  const flames = createSpellParticleLayer({ capacity: 7, texture: textures?.fire, atlas: ATLAS, additive: true, hdr: 2.6 });
  flames.mesh.name = "FireballExplosion";
  const smoke = createSpellParticleLayer({ capacity: 12, texture: textures?.smoke, atlas: ATLAS, additive: false });
  smoke.mesh.name = "FireballSmoke";
  const sparks = createSpellParticleLayer({ capacity: 72, additive: true, hdr: 4 });
  sparks.mesh.name = "FireballImpactSparks";
  root.add(flames.mesh, smoke.mesh, sparks.mesh);
  const flash = createSpellGlow("#ffc565", 1.6);
  flash.mesh.name = "FireballImpactFlash";
  flash.mesh.material.depthTest = false;
  flash.uniforms.uIntensity.value = 2.5;
  root.add(flash.mesh);
  const light = new THREE22.PointLight("#ff7c2f", 0, 4.5, 2);
  root.add(light);
  const shockMaterial = enableSpellBloom(new THREE22.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE22.DoubleSide,
    blending: THREE22.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime;uniform float uAlpha;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);float a=atan(p.y,p.x);
        float edge=.72+sin(a*7.+uTime*3.)*.012+sin(a*13.-uTime*2.)*.007;
        float ridge=exp(-pow((r-edge)/.022,2.));
        float breakup=.87+.13*sin(a*11.+sin(a*5.)+uTime*8.);
        float alpha=ridge*breakup*uAlpha;
        gl_FragColor=vec4(2.1,.72,.12,alpha);}`
  }));
  const shock = new THREE22.Mesh(new THREE22.PlaneGeometry(2, 2), shockMaterial);
  shock.name = "FireballShockwave";
  root.add(shock);
  const scorchMaterial = new THREE22.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE22.DoubleSide,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uAlpha;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=vUv*2.-1.;float r=length(p);
        float grain=noise(p*5.+3.)*.65+noise(p*13.)*.35;
        float soot=(1.-smoothstep(.3,.95,r+(grain-.5)*.32))*(.7+.3*grain);
        gl_FragColor=vec4(.027,.017,.012,soot*uAlpha);}`
  });
  const scorch = new THREE22.Mesh(new THREE22.PlaneGeometry(1.45, 1.45), scorchMaterial);
  scorch.name = "FireballScorch";
  root.add(scorch);
  const position = new THREE22.Vector3();
  const surfaceUp = new THREE22.Vector3(0, 0, 1);
  const tangent = new THREE22.Vector3();
  const bitangent = new THREE22.Vector3();
  const orientation = new THREE22.Quaternion();
  const axis = new THREE22.Vector3(1, 0, 0);
  return {
    root,
    update(age, point, normal, grounded) {
      root.visible = age >= 0 && age < 2.5;
      if (!root.visible) {
        light.intensity = 0;
        return;
      }
      flames.setSurfaceFade(point, normal, grounded ? 0.11 : 0);
      smoke.setSurfaceFade(point, normal, grounded ? 0.16 : 0);
      const fade = 1 - smoothRange(1.55, 2.5, age);
      orientation.setFromUnitVectors(surfaceUp, normal);
      tangent.crossVectors(normal, Math.abs(normal.x) < 0.9 ? axis : surfaceUp).normalize();
      bitangent.crossVectors(normal, tangent);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const localAge = age - i * 0.025;
        if (localAge < 0 || localAge > 1.05) continue;
        const a = i * 2.399963;
        const expansion = 1 - Math.exp(-localAge * 9);
        position.copy(point).addScaledVector(normal, 0.15 + localAge * (0.42 + i % 3 * 0.1)).addScaledVector(tangent, Math.cos(a) * expansion * 0.36).addScaledVector(bitangent, Math.sin(a) * expansion * 0.3);
        flames.setParticle(
          count++,
          position,
          (0.42 + expansion * 1.12) * (i === 0 ? 1.15 : 0.7),
          a * 0.18,
          HOT,
          (1 - smoothRange(0.52, 1.05, localAge)) * (i === 0 ? 0.94 : 0.5),
          localAge * 30
        );
      }
      flames.commit(count);
      count = 0;
      for (let i = 0; i < 12; i++) {
        const localAge = age - 0.09 - i * 0.035;
        if (localAge < 0) continue;
        const a = i * 2.399963;
        const radius = 0.08 + localAge * 0.22;
        position.copy(point).addScaledVector(normal, 0.18 + localAge * (0.38 + i % 4 * 0.045)).addScaledVector(tangent, Math.cos(a) * radius).addScaledVector(bitangent, Math.sin(a) * radius);
        smoke.setParticle(
          count++,
          position,
          0.45 + localAge * 0.58,
          a + localAge * 0.12,
          SOOT,
          smoothRange(0, 0.18, localAge) * fade * 0.22,
          Math.min(35, localAge * 24)
        );
      }
      smoke.commit(count);
      count = 0;
      for (let i = 0; i < 72; i++) {
        const life = 0.42 + i % 11 * 0.052;
        if (age > life) continue;
        const a = i * 2.399963;
        const speed = 0.65 + i % 9 * 0.17;
        const lift = 0.75 + i % 7 * 0.28;
        const height = Math.max(0.012, 0.06 + lift * age - 2.8 * age * age);
        position.copy(point).addScaledVector(normal, height).addScaledVector(tangent, Math.cos(a) * speed * age).addScaledVector(bitangent, Math.sin(a) * speed * age);
        sparks.setParticle(
          count++,
          position,
          0.01 + i % 3 * 3e-3,
          a,
          EMBER,
          (1 - age / life) ** 0.7,
          0,
          2.6 + speed
        );
      }
      sparks.commit(count);
      flash.mesh.position.copy(point).addScaledVector(normal, 0.12);
      flash.mesh.scale.setScalar(0.35 + Math.min(age, 0.2) * 3);
      flash.uniforms.uAlpha.value = Math.exp(-age * 16) * 0.85;
      flash.uniforms.uTime.value = age;
      light.position.copy(point).addScaledVector(normal, 0.3);
      light.intensity = Math.exp(-age * 6) * 8;
      shock.visible = grounded && age < 0.48;
      shock.position.copy(point).addScaledVector(normal, 0.018);
      shock.quaternion.copy(orientation);
      shock.scale.setScalar(0.25 + (1 - Math.exp(-age * 9)) * 1.55);
      shockMaterial.uniforms.uAlpha.value = (1 - smoothRange(0.035, 0.4, age)) * 0.42;
      shockMaterial.uniforms.uTime.value = age;
      scorch.visible = grounded;
      scorch.position.copy(point).addScaledVector(normal, 0.012);
      scorch.quaternion.copy(orientation);
      scorchMaterial.uniforms.uAlpha.value = smoothRange(0, 0.12, age) * fade * 0.65;
    },
    // Geometries and materials are released once by the parent tree disposer.
    dispose() {
      light.dispose();
    }
  };
}

// studio/src/vfx/spells/createFireballVfx.ts
var FIREBALL_RELEASE = SPELL_MOTIONS.fireball.release[0];
var FIREBALL_IMPACT = FIREBALL_RELEASE + 0.29;
var FIREBALL_END = FIREBALL_IMPACT + 2.5;
var TRAIL_POINTS = 32;
var FIRE_COLOR = new THREE23.Color("#ffbc5c");
function createFireballVfx(context) {
  const root = new THREE23.Group();
  root.name = "FireballVfx";
  root.visible = false;
  context.actor.add(root);
  const orb = new THREE23.Group();
  orb.name = "FireballProjectile";
  root.add(orb);
  const { mesh: volume, material: volumeMaterial } = createFireVolume();
  volume.name = "FireballEnvelope";
  const halo = createSpellGlow("#ff6a16", 0.34);
  halo.mesh.name = "FireballHalo";
  halo.uniforms.uIntensity.value = 2.6;
  const light = new THREE23.PointLight("#ff842e", 0, 3.1, 2);
  orb.add(halo.mesh, volume, light);
  const tendrils = Array.from({ length: 3 }, (_, index) => {
    const ribbon = createSpellRibbon(index === 0 ? "#ffe29b" : "#ff6919", 24, index === 0 ? 0.011 : 0.017);
    ribbon.uniforms.uColor.value.multiplyScalar(index === 0 ? 3.3 : 2.2);
    ribbon.mesh.name = `FireballGatherRibbon${index}`;
    root.add(ribbon.mesh);
    return { ribbon, points: Array.from({ length: 24 }, () => new THREE23.Vector3()) };
  });
  const outerTrail = createSpellRibbon("#ff5515", TRAIL_POINTS, 0.12);
  outerTrail.mesh.name = "FireballPlasmaTrail";
  outerTrail.uniforms.uColor.value.multiplyScalar(2.4);
  const hotTrail = createSpellRibbon("#ffe09b", TRAIL_POINTS, 0.038);
  hotTrail.mesh.name = "FireballHotTrail";
  hotTrail.uniforms.uColor.value.multiplyScalar(3.1);
  root.add(outerTrail.mesh, hotTrail.mesh);
  const trails = [outerTrail, hotTrail];
  const embers = createSpellParticleLayer({ capacity: 52, additive: true, hdr: 3.2 });
  embers.mesh.name = "FireballEmbers";
  root.add(embers.mesh);
  const impact = createFireballImpact(root, context.textures);
  const left = new THREE23.Vector3();
  const right = new THREE23.Vector3();
  const launch = new THREE23.Vector3(0, 1.285, 0.9);
  const target = new THREE23.Vector3(0, 0.035, 3.1);
  const normal = new THREE23.Vector3(0, 1, 0);
  const direction2 = new THREE23.Vector3();
  const position = new THREE23.Vector3();
  const worldOrigin = new THREE23.Vector3();
  const worldTarget = new THREE23.Vector3();
  const worldNormal = new THREE23.Vector3();
  const castWorld = new THREE23.Matrix4();
  const inverse = new THREE23.Matrix4();
  const normalMatrix = new THREE23.Matrix3();
  const trailPoints = Array.from({ length: TRAIL_POINTS }, () => new THREE23.Vector3());
  let released = false;
  let previousTime = -1;
  let grounded = true;
  let presentation = 0;
  function reset() {
    released = false;
    previousTime = -1;
    root.matrixAutoUpdate = true;
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    launch.set(0, 1.285, 0.9);
    target.set(0, 0.035, 3.1);
    normal.set(0, 1, 0);
    presentation = 0;
    root.visible = false;
  }
  function release() {
    context.actor.updateWorldMatrix(true, false);
    castWorld.copy(context.actor.matrixWorld);
    if (previousTime >= 0) {
      context.socketPosition("Socket_HandVFX_Left", left);
      context.socketPosition("Socket_HandVFX_Right", right);
      launch.copy(left).add(right).multiplyScalar(0.5);
      launch.z += 0.1;
    }
    worldOrigin.copy(launch).applyMatrix4(castWorld);
    worldTarget.copy(target).applyMatrix4(castWorld);
    const distance = worldTarget.distanceTo(worldOrigin);
    direction2.copy(worldTarget).sub(worldOrigin).normalize();
    grounded = !context.resolveImpact || context.resolveImpact(worldOrigin, direction2, distance + 0.35, worldTarget, worldNormal);
    if (context.resolveImpact && grounded) {
      inverse.copy(castWorld).invert();
      target.copy(worldTarget).applyMatrix4(inverse);
      normal.copy(worldNormal).applyNormalMatrix(normalMatrix.getNormalMatrix(inverse));
    }
    released = true;
    root.matrixAutoUpdate = false;
  }
  return {
    root,
    reset,
    samplePresentation(worldPosition) {
      if (!root.visible) return 0;
      position.copy(previousTime < FIREBALL_IMPACT ? orb.position : target);
      root.localToWorld(worldPosition.copy(position));
      return presentation;
    },
    update(timeSeconds) {
      if (timeSeconds < previousTime - 1e-6) reset();
      root.visible = timeSeconds >= 0 && timeSeconds < FIREBALL_END;
      if (!root.visible) {
        presentation = 0;
        light.intensity = 0;
        return;
      }
      const gathering = timeSeconds < FIREBALL_RELEASE;
      if (!gathering && !released) release();
      if (released) {
        context.actor.updateWorldMatrix(true, false);
        root.matrix.copy(context.actor.matrixWorld).invert().multiply(castWorld);
      }
      root.updateWorldMatrix(true, true);
      const charge = smoothRange(0.025, 0.48, timeSeconds);
      const flight = THREE23.MathUtils.clamp((timeSeconds - FIREBALL_RELEASE) / (FIREBALL_IMPACT - FIREBALL_RELEASE), 0, 1);
      const impactAge = timeSeconds - FIREBALL_IMPACT;
      if (gathering) {
        context.socketPosition("Socket_HandVFX_Left", left);
        context.socketPosition("Socket_HandVFX_Right", right);
        orb.position.copy(left).add(right).multiplyScalar(0.5);
        orb.position.y += 0.035;
        orb.position.z += 0.04;
      } else {
        orb.position.copy(launch).lerp(target, flight);
        orb.position.y += Math.sin(flight * Math.PI) * 0.12;
      }
      orb.visible = impactAge < 0.025;
      const size = gathering ? 0.3 + charge * 0.78 : 1.16 - flight * 0.12;
      orb.scale.setScalar(size);
      volumeMaterial.uniforms.uTime.value = timeSeconds * 1.5;
      volumeMaterial.uniforms.uOpacity.value = gathering ? charge : 1;
      halo.uniforms.uAlpha.value = charge * 0.52;
      halo.uniforms.uTime.value = timeSeconds;
      light.intensity = impactAge < 0 ? charge * (gathering ? 0.35 : 1.2) : 0;
      for (let j = 0; j < tendrils.length; j++) {
        const { ribbon, points } = tendrils[j];
        ribbon.mesh.visible = gathering && charge > 0.01;
        for (let i = 0; i < points.length; i++) {
          const p = i / (points.length - 1);
          const angle = timeSeconds * (7 + j) + p * Math.PI * 2.2 + j * 2.09;
          const radius = (0.33 * (1 - p) + 0.06) * charge;
          points[i].copy(orb.position);
          points[i].x += Math.cos(angle) * radius;
          points[i].y += Math.sin(angle) * radius * 0.62;
          points[i].z += Math.sin(angle + j) * radius * 0.5;
        }
        ribbon.update(points);
        ribbon.uniforms.uAlpha.value = charge * 0.68;
        ribbon.uniforms.uTime.value = timeSeconds;
      }
      const trailFade = 1 - smoothRange(0, 0.14, impactAge);
      const trailVisible = !gathering && trailFade > 1e-3;
      const trailStart = Math.max(0, flight - 0.6);
      direction2.copy(target).sub(launch);
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const p = i / (TRAIL_POINTS - 1);
        const sample2 = THREE23.MathUtils.lerp(trailStart, flight, p);
        trailPoints[i].copy(launch).addScaledVector(direction2, sample2);
        trailPoints[i].y += Math.sin(sample2 * Math.PI) * 0.12 + Math.sin(timeSeconds * 22 + p * 13) * 0.026 * (1 - p);
        trailPoints[i].x += Math.sin(timeSeconds * 27 - p * 17) * 0.035 * (1 - p);
      }
      for (const trail of trails) {
        trail.update(trailPoints);
        trail.mesh.visible = trailVisible;
        trail.uniforms.uAlpha.value = trailFade * 0.76;
        trail.uniforms.uTime.value = timeSeconds;
      }
      let count = 0;
      if (impactAge < 0.16) for (let i = 0; i < 52; i++) {
        const angle = i * 2.399963 + timeSeconds * 1.4;
        const radius = 0.12 + i % 9 * 0.018;
        position.copy(orb.position);
        if (!gathering) position.addScaledVector(direction2, -(i % 13) * 0.028);
        position.x += Math.cos(angle) * radius;
        position.y += Math.sin(angle) * radius;
        position.z += Math.sin(angle * 1.7) * radius * 0.5;
        embers.setParticle(count++, position, 0.012 + i % 4 * 3e-3, angle, FIRE_COLOR, charge * trailFade * 0.65, 0, 1.8);
      }
      embers.commit(count);
      impact.update(impactAge, target, normal, grounded);
      presentation = impactAge < 0 ? charge * (gathering ? 0.16 : 0.36) : Math.exp(-impactAge * 5) * 0.75;
      previousTime = timeSeconds;
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      impact.dispose();
      light.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/spells/createEnergyMissilesVfx.ts
import * as THREE25 from "three";

// studio/src/vfx/spells/createEnergyMissileShatter.ts
import * as THREE24 from "three";
var SHARDS_PER_IMPACT = 9;
var CYAN = new THREE24.Color("#8ff7ff");
var VIOLET = new THREE24.Color("#9d6cff");
function createEnergyMissileShatter(parent) {
  const particles = createSpellParticleLayer({
    capacity: 7 * SHARDS_PER_IMPACT,
    additive: true,
    hdr: 3.4
  });
  particles.mesh.name = "EnergyMissileShatter";
  parent.add(particles.mesh);
  const worldPosition = new THREE24.Vector3();
  const localPosition = new THREE24.Vector3();
  return {
    mesh: particles.mesh,
    update(samples, worldToLocal) {
      let count = 0;
      for (const sample2 of samples) {
        if (!sample2.active) continue;
        for (let shard = 0; shard < SHARDS_PER_IMPACT; shard += 1) {
          const lifetime = 0.32 + shard % 4 * 0.055;
          if (sample2.age >= lifetime) continue;
          const seed = sample2.index * 11.7 + shard * 2.399963;
          const speed = 0.34 + shard % 5 * 0.075;
          const radial = sample2.age * speed * sample2.worldScale;
          const lift = sample2.age * (0.24 + shard % 3 * 0.075) - sample2.age * sample2.age * 0.58;
          worldPosition.copy(sample2.pointWorld).addScaledVector(sample2.sideWorld, Math.cos(seed) * radial).addScaledVector(sample2.upWorld, Math.sin(seed) * radial + lift * sample2.worldScale).addScaledVector(sample2.directionWorld, (shard % 2 ? 1 : -1) * radial * 0.24);
          localPosition.copy(worldPosition).applyMatrix4(worldToLocal);
          const fade = Math.pow(1 - sample2.age / lifetime, 1.25);
          particles.setParticle(
            count++,
            localPosition,
            5e-3 + shard % 3 * 125e-5,
            seed,
            (sample2.index + shard) % 3 ? CYAN : VIOLET,
            fade * 0.78,
            0,
            4.2 + speed * 5.2
          );
        }
      }
      particles.commit(count);
    },
    clear() {
      particles.commit(0);
    }
  };
}

// studio/src/vfx/spells/createEnergyMissilesVfx.ts
var ENERGY_MISSILES_END = 2;
var TRAIL_POINTS2 = 24;
var BEAT_COUNTS = [2, 3, 2];
var BEAT_STARTS = [0, 2, 5];
var FALLBACK_LAUNCHES = [
  new THREE25.Vector3(-0.12, 1.27, 0.92),
  new THREE25.Vector3(0.12, 1.27, 0.92),
  new THREE25.Vector3(-0.1, 1.28, 1)
];
var LOCAL_FORWARD = new THREE25.Vector3(0, 0, 1);
var LOCAL_SIDE = new THREE25.Vector3(1, 0, 0);
var LOCAL_UP = new THREE25.Vector3(0, 1, 0);
var CYAN2 = new THREE25.Color("#9ffbff");
var VIOLET2 = new THREE25.Color("#a777ff");
function createMissile(index, beat, coreGeometry, sheathGeometry) {
  const root = new THREE25.Group();
  root.name = `EnergyMissile${index + 1}`;
  root.visible = false;
  const coreMaterial = additiveMaterial(index % 3 === 1 ? "#efe8ff" : "#e9ffff", 0);
  coreMaterial.toneMapped = false;
  coreMaterial.color.multiplyScalar(2.8);
  const core = new THREE25.Mesh(coreGeometry, coreMaterial);
  core.name = `EnergyMissileCore${index + 1}`;
  core.scale.set(0.72, 0.72, 2.25);
  const sheathMaterial = additiveMaterial(index % 3 === 1 ? "#681cff" : "#064eff", 0);
  sheathMaterial.toneMapped = false;
  sheathMaterial.color.multiplyScalar(2.15);
  const sheath = new THREE25.Mesh(sheathGeometry, sheathMaterial);
  sheath.name = `EnergyMissileSheath${index + 1}`;
  sheath.scale.set(0.82, 0.82, 1.85);
  const halo = createSpellGlow(index % 3 === 1 ? "#6f2cff" : "#1b8eff", 0.06);
  halo.mesh.name = `EnergyMissileHalo${index + 1}`;
  halo.uniforms.uIntensity.value = 1.5;
  const outerTrail = createSpellRibbon(index % 3 === 1 ? "#7142ff" : "#147dff", TRAIL_POINTS2, 0.027);
  outerTrail.mesh.name = `EnergyMissileRibbon${index + 1}`;
  outerTrail.uniforms.uColor.value.multiplyScalar(1.9);
  const coreTrail = createSpellRibbon("#ddffff", TRAIL_POINTS2, 7e-3);
  coreTrail.mesh.name = `EnergyMissileCoreRibbon${index + 1}`;
  coreTrail.uniforms.uColor.value.multiplyScalar(2.8);
  const spiralWake = createSpellRibbon(index % 3 === 1 ? "#bd81ff" : "#52e8ff", TRAIL_POINTS2, 5e-3);
  spiralWake.mesh.name = `EnergyMissileSpiral${index + 1}`;
  spiralWake.uniforms.uColor.value.multiplyScalar(2.1);
  const impactGlow = createSpellGlow(index % 3 === 1 ? "#8252ff" : "#55e9ff", 0.12);
  impactGlow.mesh.name = `EnergyMissileImpact${index + 1}`;
  impactGlow.mesh.visible = false;
  impactGlow.uniforms.uIntensity.value = 1.65;
  root.add(outerTrail.mesh, coreTrail.mesh, spiralWake.mesh, halo.mesh, core, sheath, impactGlow.mesh);
  const sideWorld = new THREE25.Vector3();
  const upWorld = new THREE25.Vector3();
  const directionWorld = new THREE25.Vector3();
  const endWorld = new THREE25.Vector3();
  return {
    index,
    beat,
    root,
    core,
    sheath,
    halo,
    outerTrail,
    coreTrail,
    spiralWake,
    trailPoints: Array.from({ length: TRAIL_POINTS2 }, () => new THREE25.Vector3()),
    wakePoints: Array.from({ length: TRAIL_POINTS2 }, () => new THREE25.Vector3()),
    startWorld: new THREE25.Vector3(),
    controlWorld: new THREE25.Vector3(),
    endWorld,
    directionWorld,
    sideWorld,
    upWorld,
    currentWorld: new THREE25.Vector3(),
    impactGlow,
    impactSample: {
      index,
      active: false,
      age: -1,
      pointWorld: endWorld,
      sideWorld,
      upWorld,
      directionWorld,
      worldScale: 1
    },
    duration: 0.36,
    launched: false
  };
}
function createMuzzle(index) {
  const root = new THREE25.Group();
  root.name = `EnergyVolleyMuzzle${index + 1}`;
  root.visible = false;
  const glow = createSpellGlow(index === 1 ? "#9670ff" : "#75efff", 0.19);
  glow.uniforms.uIntensity.value = 2.25;
  root.add(glow.mesh);
  return { root, glow, originWorld: new THREE25.Vector3(), launched: false };
}
function createEnergyMissilesVfx(context, options = {}) {
  const sourceTiming = SPELL_MOTIONS["energy-missiles"];
  const timing = options.single ? { ...sourceTiming, release: [sourceTiming.release[0]] } : sourceTiming;
  const beatCounts = options.single ? [1] : BEAT_COUNTS;
  const beatStarts = options.single ? [0] : BEAT_STARTS;
  const root = new THREE25.Group();
  root.name = "EnergyMissilesVfx";
  root.visible = false;
  context.actor.add(root);
  const coreGeometry = new THREE25.IcosahedronGeometry(0.021, 1);
  const sheathGeometry = new THREE25.IcosahedronGeometry(0.034, 1);
  coreGeometry.computeBoundingSphere();
  sheathGeometry.computeBoundingSphere();
  const missiles2 = [];
  for (let beat = 0; beat < beatCounts.length; beat += 1) {
    for (let local = 0; local < beatCounts[beat]; local += 1) {
      const index = beatStarts[beat] + local;
      const missile = createMissile(index, beat, coreGeometry, sheathGeometry);
      missiles2.push(missile);
      root.add(missile.root);
    }
  }
  const muzzles = timing.release.map((_, index) => createMuzzle(index));
  for (const muzzle of muzzles) root.add(muzzle.root);
  const motes = createSpellParticleLayer({ capacity: 24, additive: true, hdr: 2.8 });
  motes.mesh.name = "EnergyMissileHandMotes";
  root.add(motes.mesh);
  const shatter = createEnergyMissileShatter(root);
  const nearbyLight = new THREE25.PointLight("#6cecff", 0, 1.3, 2);
  nearbyLight.name = "EnergyMissileNearbyLight";
  root.add(nearbyLight);
  const leftPalm = new THREE25.Vector3();
  const rightPalm = new THREE25.Vector3();
  const launchWorld = new THREE25.Vector3();
  const targetWorld2 = new THREE25.Vector3();
  const normalWorld = new THREE25.Vector3();
  const actorInverse = new THREE25.Matrix4();
  const actorWorld = new THREE25.Matrix4();
  const pointWorld = new THREE25.Vector3();
  const tangentWorld = new THREE25.Vector3();
  const tangentLocal = new THREE25.Vector3();
  const pointLocal = new THREE25.Vector3();
  const nextPointWorld = new THREE25.Vector3();
  const presentationPosition = new THREE25.Vector3();
  const localLaunch = new THREE25.Vector3();
  const beatLaunched = [false, false, false];
  const impactSamples = missiles2.map((missile) => missile.impactSample);
  let previousTime = -1;
  let emissionStopped = false;
  let presentationStrength = 0;
  function reset() {
    previousTime = -1;
    emissionStopped = false;
    presentationStrength = 0;
    root.visible = false;
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    beatLaunched.fill(false);
    for (const muzzle of muzzles) {
      muzzle.launched = false;
      muzzle.root.visible = false;
      muzzle.glow.uniforms.uAlpha.value = 0;
    }
    for (const missile of missiles2) {
      missile.launched = false;
      missile.root.visible = false;
      missile.core.visible = false;
      missile.sheath.visible = false;
      missile.halo.mesh.visible = false;
      missile.impactGlow.mesh.visible = false;
      missile.impactSample.active = false;
      missile.core.material.opacity = 0;
      missile.sheath.material.opacity = 0;
      missile.outerTrail.mesh.visible = false;
      missile.coreTrail.mesh.visible = false;
      missile.spiralWake.mesh.visible = false;
    }
    motes.commit(0);
    shatter.clear();
    nearbyLight.intensity = 0;
    nearbyLight.visible = false;
  }
  function captureLaunch(beat, sampledAfterRelease) {
    context.actor.updateWorldMatrix(true, true);
    actorWorld.copy(context.actor.matrixWorld);
    const elements = actorWorld.elements;
    const worldScale = (Math.hypot(elements[0], elements[1], elements[2]) + Math.hypot(elements[4], elements[5], elements[6]) + Math.hypot(elements[8], elements[9], elements[10])) / 3;
    const socketName = beat === 1 ? "Socket_HandVFX_Left" : "Socket_HandVFX_Right";
    const socket = context.sockets.get(socketName);
    if (!sampledAfterRelease && socket) {
      socket.getWorldPosition(launchWorld);
    } else {
      localLaunch.copy(FALLBACK_LAUNCHES[beat]);
      launchWorld.copy(localLaunch).applyMatrix4(actorWorld);
    }
    const muzzle = muzzles[beat];
    muzzle.originWorld.copy(launchWorld);
    muzzle.launched = true;
    const sideWorld = pointWorld.copy(LOCAL_SIDE).transformDirection(actorWorld);
    const upWorld = tangentWorld.copy(LOCAL_UP).transformDirection(actorWorld);
    const first = beatStarts[beat];
    const count = beatCounts[beat];
    for (let local = 0; local < count; local += 1) {
      const missile = missiles2[first + local];
      const centered = local - (count - 1) * 0.5;
      missile.sideWorld.copy(sideWorld);
      missile.upWorld.copy(upWorld);
      missile.impactSample.worldScale = worldScale;
      missile.startWorld.copy(launchWorld).addScaledVector(sideWorld, centered * 0.032 * worldScale).addScaledVector(upWorld, Math.abs(centered) * 9e-3 * worldScale);
      missile.directionWorld.set(centered * 0.105, -0.025 + local % 2 * 0.032, 1).transformDirection(actorWorld);
      const distance = (2.55 + beat * 0.13 + Math.abs(centered) * 0.18) * worldScale;
      targetWorld2.copy(missile.startWorld).addScaledVector(missile.directionWorld, distance);
      normalWorld.copy(missile.directionWorld).negate();
      context.resolveImpact?.(
        missile.startWorld,
        missile.directionWorld,
        distance,
        targetWorld2,
        normalWorld
      );
      missile.endWorld.copy(targetWorld2);
      missile.controlWorld.copy(missile.startWorld).lerp(missile.endWorld, 0.48).addScaledVector(upWorld, (0.11 + beat * 0.018) * worldScale).addScaledVector(sideWorld, centered * 0.075 * worldScale);
      missile.duration = 0.34 + local * 0.027 + beat * 0.014;
      missile.launched = true;
    }
    beatLaunched[beat] = true;
  }
  function updateMotes(timeSeconds) {
    context.socketPosition("Socket_HandVFX_Left", leftPalm);
    context.socketPosition("Socket_HandVFX_Right", rightPalm);
    let count = 0;
    const gather = smoothRange(0.015, timing.gather, timeSeconds) * (1 - smoothRange(timing.release[0] - 0.13, timing.release[0], timeSeconds));
    for (let hand = 0; hand < 2; hand += 1) {
      const palm = hand ? rightPalm : leftPalm;
      for (let mote = 0; mote < 6; mote += 1) {
        const angle = mote * 2.399963 + timeSeconds * (hand ? -8.5 : 8.5);
        pointLocal.copy(palm);
        pointLocal.x += Math.cos(angle) * (0.045 + mote % 2 * 0.012);
        pointLocal.y += Math.sin(angle) * 0.04;
        pointLocal.z += Math.sin(angle * 1.7) * 0.025;
        motes.setParticle(
          count++,
          pointLocal,
          9e-3 + mote % 3 * 2e-3,
          angle,
          (mote + hand) % 3 ? CYAN2 : VIOLET2,
          gather * 0.72,
          0,
          1.4
        );
      }
    }
    if (!emissionStopped) for (let beat = 0; beat < timing.release.length; beat += 1) {
      if (beatLaunched[beat]) continue;
      const release = timing.release[beat];
      const anticipation = smoothRange(release - 0.16, release - 0.08, timeSeconds) * (1 - smoothRange(release - 0.035, release, timeSeconds));
      if (anticipation <= 0) continue;
      const palm = beat === 1 ? leftPalm : rightPalm;
      for (let mote = 0; mote < 8; mote += 1) {
        const angle = mote * 2.399963 + timeSeconds * (12 + beat);
        pointLocal.copy(palm);
        pointLocal.x += Math.cos(angle) * (0.035 + mote * 3e-3);
        pointLocal.y += Math.sin(angle) * 0.032;
        pointLocal.z += Math.cos(angle * 1.4) * 0.025;
        motes.setParticle(
          count++,
          pointLocal,
          9e-3 + mote % 2 * 3e-3,
          angle,
          beat === 1 ? VIOLET2 : CYAN2,
          anticipation * 0.9,
          0,
          1.65
        );
      }
    }
    motes.commit(count);
  }
  function updateMissile(missile, timeSeconds) {
    if (!missile.launched) return 0;
    const release = timing.release[missile.beat];
    const age = timeSeconds - release;
    const impactAge = age - missile.duration;
    const active = age >= 0 && impactAge < 0.58;
    missile.root.visible = active;
    missile.impactSample.active = impactAge >= 0 && impactAge < 0.5;
    missile.impactSample.age = impactAge;
    if (!active) return 0;
    const progress = THREE25.MathUtils.clamp(age / missile.duration, 0, 1);
    quadraticBezier(missile.currentWorld, missile.startWorld, missile.controlWorld, missile.endWorld, progress);
    pointLocal.copy(missile.currentWorld).applyMatrix4(actorInverse);
    missile.root.position.copy(pointLocal);
    const nextProgress = Math.min(1, progress + 0.012);
    quadraticBezier(nextPointWorld, missile.startWorld, missile.controlWorld, missile.endWorld, nextProgress);
    tangentWorld.copy(nextPointWorld).sub(missile.currentWorld).normalize();
    tangentLocal.copy(tangentWorld).transformDirection(actorInverse);
    missile.root.quaternion.setFromUnitVectors(LOCAL_FORWARD, tangentLocal);
    const flightFade = 1 - smoothRange(missile.duration * 0.82, missile.duration, age);
    const launchSnap = smoothRange(0, 0.025, age);
    const headAlpha = launchSnap * flightFade;
    missile.core.visible = impactAge < 0;
    missile.sheath.visible = impactAge < 0;
    missile.halo.mesh.visible = impactAge < 0;
    missile.core.material.opacity = headAlpha;
    missile.sheath.material.opacity = headAlpha * 0.5;
    missile.halo.uniforms.uAlpha.value = headAlpha * 0.27;
    missile.halo.uniforms.uTime.value = timeSeconds + missile.index * 0.37;
    missile.root.scale.setScalar(0.92 + Math.sin(progress * Math.PI) * 0.08);
    const trailFade = impactAge < 0 ? launchSnap : 1 - smoothRange(0, 0.16, impactAge);
    const trailVisible = trailFade > 1e-3;
    const trailStart = Math.max(0, progress - 0.62);
    for (let index = 0; index < TRAIL_POINTS2; index += 1) {
      const along = index / (TRAIL_POINTS2 - 1);
      const sample2 = THREE25.MathUtils.lerp(trailStart, progress, along);
      quadraticBezier(pointWorld, missile.startWorld, missile.controlWorld, missile.endWorld, sample2);
      pointLocal.copy(pointWorld).applyMatrix4(actorInverse).sub(missile.root.position);
      missile.trailPoints[index].copy(pointLocal);
      const phase = sample2 * 23 + missile.index * 1.71;
      const amplitude = 0.018 * missile.impactSample.worldScale * (1 - along) * Math.sin(along * Math.PI);
      pointWorld.addScaledVector(missile.sideWorld, Math.cos(phase) * amplitude).addScaledVector(missile.upWorld, Math.sin(phase) * amplitude);
      pointLocal.copy(pointWorld).applyMatrix4(actorInverse).sub(missile.root.position);
      missile.wakePoints[index].copy(pointLocal);
    }
    missile.outerTrail.update(missile.trailPoints);
    missile.coreTrail.update(missile.trailPoints);
    missile.spiralWake.update(missile.wakePoints);
    missile.outerTrail.mesh.visible = trailVisible;
    missile.coreTrail.mesh.visible = trailVisible;
    missile.spiralWake.mesh.visible = trailVisible;
    missile.outerTrail.uniforms.uAlpha.value = trailFade * 0.63;
    missile.coreTrail.uniforms.uAlpha.value = trailFade * 0.94;
    missile.spiralWake.uniforms.uAlpha.value = trailFade * 0.42;
    missile.outerTrail.uniforms.uTime.value = timeSeconds + missile.index;
    missile.coreTrail.uniforms.uTime.value = timeSeconds + missile.index * 0.7;
    missile.spiralWake.uniforms.uTime.value = timeSeconds - missile.index * 0.5;
    missile.impactGlow.mesh.visible = missile.impactSample.active;
    if (missile.impactSample.active) {
      missile.impactGlow.uniforms.uAlpha.value = Math.exp(-impactAge * 10.5) * 0.3;
      missile.impactGlow.uniforms.uTime.value = timeSeconds + missile.index;
      missile.impactGlow.mesh.scale.setScalar(0.3 + smoothRange(0, 0.2, impactAge) * 0.74);
    }
    return impactAge < 0 ? 0.18 + Math.sin(progress * Math.PI) * 0.13 : Math.exp(-impactAge * 6.5) * 0.46;
  }
  reset();
  return {
    root,
    reset,
    stopEmission() {
      emissionStopped = true;
    },
    samplePresentation(outWorld) {
      if (!root.visible || presentationStrength <= 0) return 0;
      outWorld.copy(presentationPosition);
      return presentationStrength;
    },
    update(timeSeconds) {
      if (timeSeconds < previousTime - 1e-6) reset();
      root.visible = timeSeconds >= 0 && timeSeconds < ENERGY_MISSILES_END;
      if (!root.visible) {
        nearbyLight.intensity = 0;
        presentationStrength = 0;
        return;
      }
      context.actor.updateWorldMatrix(true, true);
      actorWorld.copy(context.actor.matrixWorld);
      actorInverse.copy(actorWorld).invert();
      const sampledAfterRelease = previousTime < 0 && timeSeconds > timing.release[0] + 1e-6;
      if (!emissionStopped) for (let beat = 0; beat < timing.release.length; beat += 1) {
        if (!beatLaunched[beat] && timeSeconds >= timing.release[beat]) {
          captureLaunch(beat, sampledAfterRelease);
        }
      }
      updateMotes(timeSeconds);
      presentationStrength = 0;
      for (let beat = 0; beat < muzzles.length; beat += 1) {
        const muzzle = muzzles[beat];
        if (!muzzle.launched) continue;
        const age = timeSeconds - timing.release[beat];
        const visible = age >= 0 && age < 0.115;
        muzzle.root.visible = visible;
        if (!visible) continue;
        muzzle.root.position.copy(muzzle.originWorld).applyMatrix4(actorInverse);
        const snap = Math.exp(-age * 28);
        muzzle.glow.uniforms.uAlpha.value = snap * 0.82;
        muzzle.glow.uniforms.uTime.value = timeSeconds + beat;
        muzzle.root.scale.setScalar(0.38 + age * 8.5);
        if (snap * 0.2 > presentationStrength) {
          presentationStrength = snap * 0.2;
          presentationPosition.copy(muzzle.originWorld);
        }
      }
      for (const missile of missiles2) {
        const strength = updateMissile(missile, timeSeconds);
        if (strength > presentationStrength) {
          presentationStrength = strength;
          presentationPosition.copy(missile.currentWorld);
        }
      }
      shatter.update(impactSamples, actorInverse);
      nearbyLight.intensity = Math.min(1.05, presentationStrength * 2.3);
      nearbyLight.visible = presentationStrength > 0;
      if (presentationStrength > 0) {
        nearbyLight.position.copy(presentationPosition).applyMatrix4(actorInverse);
      } else {
        nearbyLight.position.set(0, 0, 0);
      }
      previousTime = timeSeconds;
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      nearbyLight.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/spells/createLightningVfx.ts
import * as THREE27 from "three";

// studio/src/vfx/spells/lightningGeometry.ts
import * as THREE26 from "three";
var direction = new THREE26.Vector3();
var side = new THREE26.Vector3();
var depth = new THREE26.Vector3();
var reference = new THREE26.Vector3();
function signedNoise(seed, index, channel) {
  const value = Math.sin(seed * 127.1 + index * 311.7 + channel * 74.7) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
function writeHierarchicalBolt(points, start, end, seed, amplitude, roughness = 0.5) {
  const last = points.length - 1;
  if (last < 2 || (last & last - 1) !== 0) {
    throw new Error("A hierarchical bolt needs 2^n + 1 points.");
  }
  points[0].copy(start);
  points[last].copy(end);
  direction.copy(end).sub(start);
  if (direction.lengthSq() < 1e-10) direction.set(0, -1, 0);
  direction.normalize();
  reference.set(0, 1, 0);
  if (Math.abs(direction.y) > 0.82) reference.set(1, 0, 0);
  side.crossVectors(direction, reference).normalize();
  depth.crossVectors(direction, side).normalize();
  const boundedRoughness = THREE26.MathUtils.clamp(roughness, 0.25, 0.82);
  let stride = last >> 1;
  let displacement = Math.max(0, amplitude);
  let level = 0;
  while (stride >= 1) {
    const span = stride << 1;
    for (let index = stride; index < last; index += span) {
      const envelope = Math.sin(index / last * Math.PI);
      points[index].copy(points[index - stride]).add(points[index + stride]).multiplyScalar(0.5).addScaledVector(side, signedNoise(seed, index, level) * displacement * envelope).addScaledVector(depth, signedNoise(seed + 19, index, level + 7) * displacement * 0.72 * envelope);
    }
    stride >>= 1;
    displacement *= boundedRoughness;
    level += 1;
  }
}

// studio/src/vfx/spells/createLightningVfx.ts
var LIGHTNING_RELEASE = SPELL_MOTIONS.lightning.release[0];
var LIGHTNING_END = 2.55;
var MAIN_POINTS = 33;
var BRANCH_POINTS = 9;
var PRIMARY_FORK_COUNT = 5;
var SECONDARY_FORK_COUNT = 3;
var FORK_COUNT = PRIMARY_FORK_COUNT + SECONDARY_FORK_COUNT + 1;
var PRIMARY_ATTACHMENTS = [5, 10, 16, 22, 27];
var SECONDARY_PARENTS = [0, 2, 4];
var GROUND_ARC_COUNT = 4;
var ION_ARC_COUNT = 2;
var ION_COUNT = 28;
var SPARK_COUNT = 48;
var SMOKE_COUNT = 10;
var STRIKE_STARTS = [0, 0.105, 0.215];
var STRIKE_ENDS = [0.068, 0.183, 0.271];
var STRIKE_PEAKS = [1, 0.72, 0.44];
var COBALT = new THREE27.Color("#358cff");
var HOT_BLUE = new THREE27.Color("#9eefff");
var WHITE_HOT = new THREE27.Color("#ffffff");
var SMOKE = new THREE27.Color("#8496ac");
var AXIS_X = new THREE27.Vector3(1, 0, 0);
var AXIS_Z = new THREE27.Vector3(0, 0, 1);
function createBolt(parent, name, pointCount, color, width) {
  const ribbon = createSpellRibbon(color, pointCount, width);
  ribbon.mesh.name = name;
  ribbon.mesh.visible = false;
  parent.add(ribbon.mesh);
  return {
    ribbon,
    points: Array.from({ length: pointCount }, () => new THREE27.Vector3())
  };
}
function setBoltAppearance(bolt, visible, alpha, time) {
  bolt.ribbon.mesh.visible = visible;
  bolt.ribbon.uniforms.uAlpha.value = visible ? alpha : 0;
  bolt.ribbon.uniforms.uTime.value = time;
}
function setBranchTaper(bolt) {
  const taper = bolt.ribbon.mesh.geometry.getAttribute("aTaper");
  for (let index = 0; index < bolt.points.length; index += 1) {
    const width = Math.pow(1 - index / (bolt.points.length - 1), 0.58);
    taper.setX(index * 2, width);
    taper.setX(index * 2 + 1, width);
  }
  taper.needsUpdate = true;
}
function hash01(index, channel) {
  const value = Math.sin(index * 91.17 + channel * 37.41) * 43758.5453;
  return value - Math.floor(value);
}
function createLightningVfx(context) {
  const timing = SPELL_MOTIONS.lightning;
  const root = new THREE27.Group();
  root.name = "LightningVfx";
  root.visible = false;
  context.actor.add(root);
  const main = createBolt(root, "LightningCore", MAIN_POINTS, "#f5ffff", 0.011);
  main.ribbon.uniforms.uColor.value.multiplyScalar(4.8);
  const mainGlow = createBolt(root, "LightningCoreGlow", MAIN_POINTS, "#276cff", 0.035);
  mainGlow.ribbon.uniforms.uColor.value.multiplyScalar(2.4);
  const forks = Array.from({ length: FORK_COUNT }, (_, index) => {
    const bolt = createBolt(root, `LightningFork${index + 1}`, BRANCH_POINTS, index % 2 ? "#71c8ff" : "#e9ffff", 0.011);
    bolt.ribbon.uniforms.uColor.value.multiplyScalar(index % 2 ? 2.1 : 3.7);
    setBranchTaper(bolt);
    return bolt;
  });
  const groundArcs = Array.from({ length: GROUND_ARC_COUNT }, (_, index) => {
    const bolt = createBolt(root, `LightningGroundArc${index + 1}`, BRANCH_POINTS, index % 2 ? "#2774ff" : "#bdefff", 0.014);
    bolt.ribbon.uniforms.uColor.value.multiplyScalar(index % 2 ? 1.9 : 2.7);
    setBranchTaper(bolt);
    return bolt;
  });
  const ionArcs = Array.from({ length: ION_ARC_COUNT }, (_, index) => {
    const bolt = createBolt(root, `LightningIonArc${index + 1}`, BRANCH_POINTS, index ? "#4f8fff" : "#d9ffff", 9e-3);
    bolt.ribbon.uniforms.uColor.value.multiplyScalar(index ? 1.8 : 2.8);
    return bolt;
  });
  const strikeBolts = [main, mainGlow, ...forks];
  const allBolts = [...strikeBolts, ...groundArcs, ...ionArcs];
  const ions = createSpellParticleLayer({ capacity: ION_COUNT, additive: true, hdr: 2.6 });
  ions.mesh.name = "LightningIons";
  root.add(ions.mesh);
  const sparks = createSpellParticleLayer({ capacity: SPARK_COUNT, additive: true, hdr: 4.2 });
  sparks.mesh.name = "LightningHotDebris";
  root.add(sparks.mesh);
  const smoke = createSpellParticleLayer({
    capacity: SMOKE_COUNT,
    texture: context.textures?.smoke,
    atlas: context.textures?.smoke ? { columns: 6, rows: 6, frames: 36 } : void 0,
    hdr: 1
  });
  smoke.mesh.name = "LightningSmoke";
  root.add(smoke.mesh);
  const impactGlow = createSpellGlow("#78bdff", 0.24);
  impactGlow.mesh.name = "LightningContactFlash";
  impactGlow.mesh.material.depthTest = false;
  impactGlow.uniforms.uIntensity.value = 2.8;
  root.add(impactGlow.mesh);
  const scorchMaterial = new THREE27.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE27.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float spokes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 11.0 + r * 19.0);
        float soot = (1.0 - smoothstep(0.16, 1.0, r)) * (0.68 + spokes * 0.22);
        gl_FragColor = vec4(0.018, 0.026, 0.042, soot * uAlpha);
      }
    `
  });
  scorchMaterial.name = "LightningScorchMaterial";
  const scorch = new THREE27.Mesh(new THREE27.CircleGeometry(0.42, 48), scorchMaterial);
  scorch.name = "LightningScorch";
  scorch.visible = false;
  root.add(scorch);
  const light = new THREE27.PointLight("#73b9ff", 0, 3.25, 2);
  light.name = "LightningContactLight";
  root.add(light);
  const left = new THREE27.Vector3();
  const right = new THREE27.Vector3();
  const overhead = new THREE27.Vector3();
  const target = new THREE27.Vector3(0, 0.025, 2.25);
  const normal = new THREE27.Vector3(0, 1, 0);
  const sky = new THREE27.Vector3(0, 4.3, 2.25);
  const tangent = new THREE27.Vector3(1, 0, 0);
  const bitangent = new THREE27.Vector3(0, 0, 1);
  const point = new THREE27.Vector3();
  const offset = new THREE27.Vector3();
  const velocity = new THREE27.Vector3();
  const worldOrigin = new THREE27.Vector3();
  const worldTarget = new THREE27.Vector3();
  const worldNormal = new THREE27.Vector3();
  const rayDirection = new THREE27.Vector3();
  const castWorld = new THREE27.Matrix4();
  const inverse = new THREE27.Matrix4();
  const normalMatrix = new THREE27.Matrix3();
  const groundQuaternion = new THREE27.Quaternion();
  let released = false;
  let grounded = true;
  let previousTime = -1;
  let presentation = 0;
  function sampleHands() {
    context.socketPosition("Socket_HandVFX_Left", left);
    context.socketPosition("Socket_HandVFX_Right", right);
    overhead.copy(left).add(right).multiplyScalar(0.5);
    overhead.x *= 0.28;
    overhead.y = Math.max(1.96, overhead.y + 0.42);
    overhead.z += 0.12;
  }
  function captureRelease() {
    sampleHands();
    context.actor.updateWorldMatrix(true, false);
    castWorld.copy(context.actor.matrixWorld);
    worldOrigin.copy(sky).applyMatrix4(castWorld);
    worldTarget.copy(target).applyMatrix4(castWorld);
    rayDirection.copy(worldTarget).sub(worldOrigin);
    const distance = rayDirection.length();
    rayDirection.multiplyScalar(1 / Math.max(distance, 1e-6));
    grounded = !context.resolveImpact || context.resolveImpact(worldOrigin, rayDirection, distance + 0.6, worldTarget, worldNormal);
    inverse.copy(castWorld).invert();
    if (context.resolveImpact && grounded) {
      target.copy(worldTarget).applyMatrix4(inverse);
      normal.copy(worldNormal).applyNormalMatrix(normalMatrix.getNormalMatrix(inverse)).normalize();
    }
    tangent.crossVectors(normal, Math.abs(normal.y) < 0.84 ? AXIS_X : AXIS_Z).normalize();
    bitangent.crossVectors(normal, tangent).normalize();
    sky.copy(target).addScaledVector(normal, 4.25).addScaledVector(bitangent, -0.08);
    groundQuaternion.setFromUnitVectors(AXIS_Z, normal);
    smoke.setSurfaceFade(target, normal, grounded ? 0.12 : 0);
    released = true;
    root.matrixAutoUpdate = false;
  }
  function reset() {
    released = false;
    grounded = true;
    previousTime = -1;
    presentation = 0;
    target.set(0, 0.025, 2.25);
    normal.set(0, 1, 0);
    sky.set(0, 4.3, 2.25);
    root.matrixAutoUpdate = true;
    root.matrix.identity();
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    root.visible = false;
    for (let index = 0; index < allBolts.length; index += 1) {
      setBoltAppearance(allBolts[index], false, 0, 0);
    }
    ions.commit(0);
    sparks.commit(0);
    smoke.commit(0);
    impactGlow.mesh.visible = false;
    impactGlow.uniforms.uAlpha.value = 0;
    scorch.visible = false;
    scorchMaterial.uniforms.uAlpha.value = 0;
    light.intensity = 0;
  }
  function updateGathering(timeSeconds) {
    sampleHands();
    const gather = smoothRange(0.04, timing.gather + 0.24, timeSeconds) * (1 - smoothRange(LIGHTNING_RELEASE - 0.07, LIGHTNING_RELEASE, timeSeconds));
    const flicker = 0.72 + 0.28 * (hash01(Math.floor(timeSeconds * 24), 3) > 0.38 ? 1 : 0.3);
    let ionCount = 0;
    for (let index = 0; index < ION_COUNT; index += 1) {
      const orbit = timeSeconds * (2.8 + index % 4 * 0.23) + index * 2.399963;
      const radius = 0.1 + hash01(index, 2) * 0.34;
      const progress = hash01(index, 5);
      point.copy(overhead);
      point.x += Math.cos(orbit) * radius;
      point.z += Math.sin(orbit) * radius * 0.58;
      point.y += (progress - 0.5) * 0.42 + Math.sin(orbit * 1.7) * 0.06;
      ions.setParticle(ionCount++, point, 9e-3 + hash01(index, 7) * 0.018, orbit, index % 3 ? COBALT : WHITE_HOT, gather * flicker * (0.36 + hash01(index, 8) * 0.54), 0, 2.4);
    }
    ions.commit(gather > 2e-3 ? ionCount : 0);
    for (let index = 0; index < ionArcs.length; index += 1) {
      const ion = ionArcs[index];
      writeHierarchicalBolt(ion.points, index ? right : left, overhead, 101 + index * 37 + Math.floor(timeSeconds * 10), 0.12);
      ion.ribbon.update(ion.points);
      setBoltAppearance(ion, gather > 0.22 && hash01(Math.floor(timeSeconds * 18), index + 9) > 0.42, gather * 0.54, timeSeconds);
    }
    for (let index = 0; index < strikeBolts.length; index += 1) setBoltAppearance(strikeBolts[index], false, 0, timeSeconds);
    for (let index = 0; index < groundArcs.length; index += 1) setBoltAppearance(groundArcs[index], false, 0, timeSeconds);
    sparks.commit(0);
    smoke.commit(0);
    impactGlow.mesh.visible = false;
    scorch.visible = false;
    light.intensity = 0;
    presentation = gather * 0.22;
  }
  function updateReleased(timeSeconds) {
    const age = timeSeconds - LIGHTNING_RELEASE;
    let pulse = 0;
    let pattern = 0;
    for (let index = 0; index < STRIKE_STARTS.length; index += 1) {
      const local = age - STRIKE_STARTS[index];
      const duration = STRIKE_ENDS[index] - STRIKE_STARTS[index];
      if (local < 0 || local > duration) continue;
      pulse = STRIKE_PEAKS[index] * smoothRange(0, 6e-3, local) * (1 - smoothRange(0.016, duration, local));
      pattern = index;
      break;
    }
    const strikeVisible = pulse > 1e-3;
    if (strikeVisible) {
      writeHierarchicalBolt(main.points, sky, target, 17 + pattern * 26, 0.56 - pattern * 0.06, 0.65);
      main.ribbon.update(main.points);
      mainGlow.ribbon.update(main.points);
      setBoltAppearance(main, true, pulse, timeSeconds);
      setBoltAppearance(mainGlow, true, pulse * 0.46, timeSeconds);
      for (let index = 0; index < PRIMARY_FORK_COUNT; index += 1) {
        const fork = forks[index];
        const branchIndex = PRIMARY_ATTACHMENTS[index];
        point.copy(main.points[branchIndex]);
        const length = 0.34 + hash01(index + pattern * 3, 30) * 0.5;
        const side2 = index % 2 ? -1 : 1;
        offset.copy(tangent).multiplyScalar(side2 * length).addScaledVector(bitangent, (hash01(index + pattern * 7, 10) - 0.5) * length * 0.85).addScaledVector(normal, -0.08 - index * 0.035);
        point.add(offset);
        writeHierarchicalBolt(fork.points, main.points[branchIndex], point, 211 + pattern * 31 + index * 17, 0.11 + index * 0.012);
        fork.ribbon.update(fork.points);
        setBoltAppearance(fork, true, pulse * (0.9 - index * 0.1), timeSeconds);
      }
      for (let index = 0; index < SECONDARY_FORK_COUNT; index += 1) {
        const parent = forks[SECONDARY_PARENTS[index]];
        const fork = forks[PRIMARY_FORK_COUNT + index];
        const parentPoint = 4 + index;
        velocity.copy(parent.points[parentPoint]).sub(parent.points[parentPoint - 1]).normalize();
        point.copy(parent.points[parentPoint]);
        const side2 = index % 2 ? 1 : -1;
        const length = 0.24 + hash01(index + pattern * 5, 32) * 0.22;
        point.addScaledVector(velocity, length * 0.24).addScaledVector(tangent, side2 * length * 0.72).addScaledVector(bitangent, (hash01(index, 34) - 0.5) * length * 0.7).addScaledVector(normal, -0.04 - index * 0.02);
        writeHierarchicalBolt(fork.points, parent.points[parentPoint], point, 521 + pattern * 43 + index * 23, 0.065 + index * 8e-3);
        fork.ribbon.update(fork.points);
        setBoltAppearance(fork, true, pulse * (0.58 - index * 0.09), timeSeconds);
      }
      const tertiaryParent = forks[PRIMARY_FORK_COUNT + 1];
      const tertiary = forks[FORK_COUNT - 1];
      velocity.copy(tertiaryParent.points[5]).sub(tertiaryParent.points[4]).normalize();
      point.copy(tertiaryParent.points[5]).addScaledVector(velocity, 0.07).addScaledVector(tangent, -0.19).addScaledVector(bitangent, 0.09).addScaledVector(normal, -0.035);
      writeHierarchicalBolt(tertiary.points, tertiaryParent.points[5], point, 719 + pattern * 37, 0.045);
      tertiary.ribbon.update(tertiary.points);
      setBoltAppearance(tertiary, true, pulse * 0.34, timeSeconds);
    } else {
      for (let index = 0; index < strikeBolts.length; index += 1) setBoltAppearance(strikeBolts[index], false, 0, timeSeconds);
    }
    const groundStrength = smoothRange(0, 0.018, age) * (1 - smoothRange(0.24, 0.58, age));
    for (let index = 0; index < groundArcs.length; index += 1) {
      const arc = groundArcs[index];
      const angle = index * Math.PI * 0.5 + 0.28;
      point.copy(target).addScaledVector(tangent, Math.cos(angle) * (0.36 + index * 0.12)).addScaledVector(bitangent, Math.sin(angle) * (0.36 + index * 0.12));
      writeHierarchicalBolt(arc.points, target, point, 407 + index * 29, 0.07);
      for (let pointIndex = 0; pointIndex < arc.points.length; pointIndex += 1) {
        const arcPoint = arc.points[pointIndex];
        offset.copy(arcPoint).sub(target);
        arcPoint.addScaledVector(normal, 0.016 - offset.dot(normal));
      }
      arc.ribbon.update(arc.points);
      setBoltAppearance(arc, grounded && groundStrength > 2e-3, groundStrength * (0.72 - index * 0.08), timeSeconds);
    }
    for (let index = 0; index < ionArcs.length; index += 1) setBoltAppearance(ionArcs[index], false, 0, timeSeconds);
    ions.commit(0);
    const flash = smoothRange(0, 9e-3, age) * (1 - smoothRange(0.035, 0.14, age));
    impactGlow.mesh.visible = flash > 1e-3;
    impactGlow.mesh.position.copy(target).addScaledVector(normal, 0.105);
    impactGlow.uniforms.uAlpha.value = flash * 0.42;
    impactGlow.uniforms.uTime.value = timeSeconds;
    light.position.copy(target).addScaledVector(normal, 0.23);
    light.intensity = Math.min(1.15, flash * 1.15 + pulse * 0.28);
    let sparkCount = 0;
    if (age >= 0 && age < 0.92) {
      for (let index = 0; index < SPARK_COUNT; index += 1) {
        const delay = hash01(index, 12) * 0.07;
        const flight = age - delay;
        if (flight < 0) continue;
        const angle = index * 2.399963 + hash01(index, 14) * 0.34;
        const speed = 0.72 + hash01(index, 16) * 1.5;
        velocity.copy(tangent).multiplyScalar(Math.cos(angle) * speed).addScaledVector(bitangent, Math.sin(angle) * speed).addScaledVector(normal, 0.82 + hash01(index, 18) * 1.58);
        point.copy(target).addScaledVector(normal, 0.035).addScaledVector(velocity, flight).addScaledVector(normal, -3.7 * flight * flight);
        offset.copy(point).sub(target);
        const distanceToPlane = offset.dot(normal);
        if (distanceToPlane < 0.012) point.addScaledVector(normal, 0.012 - distanceToPlane);
        const alpha = Math.max(0, 1 - flight / 0.72) * (0.34 + hash01(index, 20) * 0.48);
        sparks.setParticle(sparkCount++, point, 5e-3 + hash01(index, 22) * 8e-3, angle, index % 4 ? HOT_BLUE : WHITE_HOT, alpha, 0, 1.7 + speed * 0.35);
      }
    }
    sparks.commit(sparkCount);
    let smokeCount = 0;
    if (age > 0.08 && age < 1.72) {
      for (let index = 0; index < SMOKE_COUNT; index += 1) {
        const delay = 0.08 + index * 0.038;
        const smokeAge = age - delay;
        if (smokeAge < 0) continue;
        const angle = index * 2.399963;
        point.copy(target).addScaledVector(tangent, Math.cos(angle) * (0.035 + smokeAge * 0.13)).addScaledVector(bitangent, Math.sin(angle) * (0.035 + smokeAge * 0.13)).addScaledVector(normal, 0.045 + smokeAge * (0.23 + hash01(index, 24) * 0.13));
        const alpha = smoothRange(0, 0.12, smokeAge) * (1 - smoothRange(0.65, 1.58, smokeAge)) * 0.32;
        smoke.setParticle(smokeCount++, point, 0.16 + smokeAge * 0.25, angle + smokeAge * 0.65, SMOKE, alpha, smokeAge * 18 + index * 1.7);
      }
    }
    smoke.commit(smokeCount);
    scorch.visible = grounded && age >= 0.035 && age < LIGHTNING_END - LIGHTNING_RELEASE;
    scorch.position.copy(target).addScaledVector(normal, 8e-3);
    scorch.quaternion.copy(groundQuaternion);
    scorchMaterial.uniforms.uAlpha.value = smoothRange(0.04, 0.16, age) * (1 - smoothRange(1.35, LIGHTNING_END - LIGHTNING_RELEASE, age)) * 0.46;
    presentation = Math.max(pulse * 0.8, flash, groundStrength * 0.36, Math.max(0, 1 - age / 1.25) * 0.12);
  }
  reset();
  return {
    root,
    reset,
    samplePresentation(worldPosition) {
      if (!root.visible) return 0;
      point.copy(released ? target : overhead);
      root.localToWorld(worldPosition.copy(point));
      return presentation;
    },
    update(timeSeconds) {
      if (timeSeconds < previousTime - 1e-6) reset();
      root.visible = timeSeconds >= 0 && timeSeconds < LIGHTNING_END;
      if (!root.visible) {
        presentation = 0;
        light.intensity = 0;
        previousTime = timeSeconds;
        return;
      }
      if (timeSeconds < LIGHTNING_RELEASE) {
        updateGathering(timeSeconds);
      } else {
        if (!released) captureRelease();
        context.actor.updateWorldMatrix(true, false);
        root.matrix.copy(context.actor.matrixWorld).invert().multiply(castWorld);
        root.matrixWorldNeedsUpdate = true;
        updateReleased(timeSeconds);
      }
      previousTime = timeSeconds;
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      light.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/spells/createHealingVfx.ts
import * as THREE28 from "three";
var MOTE_COUNT = 64;
var WISP_POINTS = 14;
function createWisp(color) {
  const ribbon = createSpellRibbon(color, WISP_POINTS, 0.04);
  const attribute = new THREE28.BufferAttribute(new Float32Array(WISP_POINTS * 3), 3);
  return { line: ribbon.mesh, attribute, material: ribbon.mesh.material, ribbon };
}
function createHealingVfx(context) {
  const timing = SPELL_MOTIONS.healing;
  const release = timing.release[0];
  const root = new THREE28.Group();
  root.name = "HealingVfx";
  root.visible = false;
  context.actor.add(root);
  const sigil = new THREE28.Group();
  sigil.name = "HealingSigil";
  sigil.position.set(0, 1.25, 0.31);
  const outerMaterial = additiveMaterial("#9cff70", 0);
  const outer = new THREE28.Mesh(new THREE28.TorusGeometry(0.36, 0.012, 7, 64), outerMaterial);
  const innerMaterial = additiveMaterial("#ffd968", 0);
  const inner = new THREE28.Mesh(new THREE28.TorusGeometry(0.235, 9e-3, 6, 48), innerMaterial);
  for (let index = 0; index < 8; index += 1) {
    const ray = new THREE28.Mesh(new THREE28.BoxGeometry(0.012, 0.095, 6e-3), innerMaterial);
    const angle = index / 8 * Math.PI * 2;
    ray.position.set(Math.sin(angle) * 0.3, Math.cos(angle) * 0.3, 0);
    ray.rotation.z = -angle;
    sigil.add(ray);
  }
  sigil.add(outer, inner);
  root.add(sigil);
  const heartMaterial = additiveMaterial("#fff0a8", 0);
  const heart = new THREE28.Mesh(new THREE28.IcosahedronGeometry(0.025, 2), heartMaterial);
  heart.name = "HealingHeart";
  heart.position.set(0, 1.58, 0.34);
  root.add(heart);
  const heartGlow = createSpellGlow("#c5ff84", 0.72);
  root.add(heartGlow.mesh);
  const columnMaterial = enableSpellBloom(new THREE28.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE28.AdditiveBlending,
    side: THREE28.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uOpacity; uniform float uTime; varying vec2 vUv;
      void main(){
        float vertical=sin(vUv.y*3.14159);
        float strands=pow(.5+.5*sin(vUv.x*56.5487+vUv.y*13.-uTime*3.),14.);
        float shimmer=.55+.45*sin(vUv.y*23.+uTime*5.);
        gl_FragColor=vec4(.55,1.,.38,uOpacity*vertical*strands*shimmer*.2);
      }`
  }));
  const column = new THREE28.Mesh(new THREE28.CylinderGeometry(0.42, 0.28, 2.2, 28, 1, true), columnMaterial);
  column.name = "HealingColumn";
  column.position.y = 1.08;
  root.add(column);
  const motePositions = new Float32Array(MOTE_COUNT * 3);
  const moteGeometry = new THREE28.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE28.BufferAttribute(motePositions, 3));
  const moteMaterial = enableSpellBloom(new THREE28.PointsMaterial({
    color: "#d8ff83",
    size: 0.025,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE28.AdditiveBlending
  }));
  const motes = new THREE28.Points(moteGeometry, moteMaterial);
  motes.name = "HealingMotes";
  motes.frustumCulled = false;
  root.add(motes);
  const leftWisp = createWisp("#8dff7a");
  const rightWisp = createWisp("#ffe475");
  leftWisp.line.name = "HealingLeftWisp";
  rightWisp.line.name = "HealingRightWisp";
  root.add(leftWisp.line, rightWisp.line);
  const light = new THREE28.PointLight("#c9ff7d", 0, 2.35, 2);
  light.position.set(0, 1.38, 0.28);
  root.add(light);
  const left = new THREE28.Vector3();
  const right = new THREE28.Vector3();
  const heartPosition = new THREE28.Vector3();
  const wispPoint = new THREE28.Vector3();
  const updateWisp = (wisp, hand, timeSeconds, side2) => {
    for (let index = 0; index < WISP_POINTS; index += 1) {
      const progress = index / (WISP_POINTS - 1);
      wispPoint.copy(hand).lerp(heartPosition, progress);
      wispPoint.x += Math.sin(progress * Math.PI * 2 + timeSeconds * 5.5) * 0.035 * side2;
      wispPoint.y += Math.sin(progress * Math.PI) * 0.09;
      wisp.attribute.setXYZ(index, wispPoint.x, wispPoint.y, wispPoint.z);
    }
    wisp.ribbon.update(wisp.attribute.array);
  };
  return {
    root,
    update(timeSeconds) {
      root.visible = true;
      context.socketPosition("Socket_Weapon_Left", left);
      context.socketPosition("Socket_Weapon_Right", right);
      const gather = smoothRange(0, timing.gather, timeSeconds);
      const blessing = smoothRange(timing.gather, release, timeSeconds);
      const releasePulse = smoothRange(release, release + 0.2, timeSeconds);
      const fade = 1 - smoothRange(timing.recover, timing.duration, timeSeconds);
      const opacity = gather * fade;
      sigil.visible = opacity > 1e-3;
      sigil.scale.setScalar(0.62 + blessing * 0.38 + releasePulse * 0.34);
      sigil.rotation.z = timeSeconds * 0.55;
      sigil.rotation.x = -Math.PI / 2 * releasePulse;
      sigil.position.y = THREE28.MathUtils.lerp(1.35, 0.035, releasePulse);
      sigil.position.z = THREE28.MathUtils.lerp(0.31, 0, releasePulse);
      inner.rotation.z = -timeSeconds * 1.25;
      outerMaterial.opacity = opacity * 0.34;
      innerMaterial.opacity = opacity * 0.44;
      heart.visible = opacity > 1e-3;
      heart.position.copy(left).add(right).multiplyScalar(0.5);
      heart.position.lerp(heartPosition.set(0, 1.28, 0.34), releasePulse);
      heart.scale.setScalar(0.68 + blessing * 0.46 + Math.sin(timeSeconds * 8) * 0.035);
      heartMaterial.opacity = opacity * (0.72 + releasePulse * 0.28);
      heartPosition.copy(heart.position);
      heartGlow.mesh.position.copy(heart.position);
      light.position.copy(heart.position);
      heartGlow.uniforms.uAlpha.value = opacity * 0.8;
      heartGlow.uniforms.uTime.value = timeSeconds;
      column.visible = timeSeconds >= timing.gather && fade > 1e-3;
      column.scale.x = column.scale.z = 0.58 + releasePulse * 0.72;
      columnMaterial.uniforms.uOpacity.value = opacity * (0.45 + releasePulse * 0.55);
      columnMaterial.uniforms.uTime.value = timeSeconds;
      const moteAttribute = moteGeometry.getAttribute("position");
      for (let index = 0; index < MOTE_COUNT; index += 1) {
        const seed = index * 0.61803398875;
        const cycle = (seed + timeSeconds * (0.22 + index % 5 * 0.018)) % 1;
        const angle = index * 2.399963 + timeSeconds * 0.45;
        const radius = 0.14 + index % 8 * 0.034;
        moteAttribute.setXYZ(index, Math.cos(angle) * radius, 0.08 + cycle * 2.05, Math.sin(angle) * radius + 0.13);
      }
      moteAttribute.needsUpdate = true;
      moteMaterial.opacity = opacity * 0.74;
      updateWisp(leftWisp, left, timeSeconds, -1);
      updateWisp(rightWisp, right, timeSeconds, 1);
      leftWisp.material.opacity = opacity * (0.28 + blessing * 0.5);
      rightWisp.material.opacity = leftWisp.material.opacity;
      leftWisp.ribbon.uniforms.uAlpha.value = leftWisp.material.opacity;
      rightWisp.ribbon.uniforms.uAlpha.value = rightWisp.material.opacity;
      light.intensity = opacity * (0.75 + releasePulse * 1.15);
    },
    dispose() {
      light.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/abilities/createSignatureSpells.ts
function createSignatureSpells(root, textures) {
  const palm = new T10.Vector3();
  const context = {
    actor: root,
    sockets: /* @__PURE__ */ new Map(),
    textures,
    socketPosition(_name, out) {
      return out.copy(palm);
    }
  };
  const fireball2 = createFireballVfx(context), arrow = createEnergyMissilesVfx(context, { single: true });
  const lightning2 = createLightningVfx(context), healing2 = createHealingVfx(context);
  const effects = [fireball2, arrow, lightning2, healing2];
  let lastId = "";
  return {
    sample(id, time, release, origin) {
      for (const effect2 of effects) effect2.root.visible = false;
      palm.copy(origin);
      if (lastId !== id) {
        fireball2.reset();
        arrow.reset();
        lightning2.reset();
        lastId = id;
      }
      const effect = id === "fireball" ? fireball2 : id === "magic-arrow" ? arrow : id === "lightning" ? lightning2 : id === "heal" ? healing2 : null;
      if (!effect) return false;
      const sourceRelease = id === "fireball" ? FIREBALL_RELEASE : id === "magic-arrow" ? 0.43 : id === "lightning" ? 0.74 : 1.08;
      const sourceTime = time < release ? time / release * sourceRelease : sourceRelease + time - release;
      effect.update(sourceTime);
      return true;
    },
    reset() {
      lastId = "";
      fireball2.reset();
      arrow.reset();
      lightning2.reset();
      for (const effect of effects) effect.root.visible = false;
    },
    dispose() {
      for (const effect of effects) effect.dispose();
    }
  };
}

// studio/src/vfx/abilities/createRangerEffects.ts
import * as T12 from "three";

// studio/src/character/createArrowGeometry.ts
import * as T11 from "three";
function createArrow() {
  const root = new T11.Group();
  root.name = "Arrow";
  const shaft = new T11.Mesh(new T11.CylinderGeometry(6e-3, 6e-3, 0.66, 6), new T11.MeshStandardMaterial({ color: "#a2875f", roughness: 0.72 }));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.3;
  const tip = new T11.Mesh(new T11.ConeGeometry(0.022, 0.09, 4), new T11.MeshStandardMaterial({ color: "#becbd4", metalness: 0.8, roughness: 0.24 }));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.06;
  const featherGeo = new T11.PlaneGeometry(0.06, 0.12);
  featherGeo.rotateX(Math.PI / 2);
  const featherMat = new T11.MeshStandardMaterial({ color: "#d3cbb5", side: T11.DoubleSide, roughness: 0.85 });
  root.add(shaft, tip);
  for (let i = 0; i < 3; i++) {
    const feather = new T11.Mesh(featherGeo, featherMat);
    feather.position.z = -0.56;
    feather.rotation.z = i * Math.PI * 2 / 3;
    root.add(feather);
  }
  return root;
}

// studio/src/vfx/abilities/createRangerEffects.ts
function sampleArrowFlight(id, index, age, origin, target, out) {
  const volley = id === "volley";
  const flight = volley ? 1.16 : 0.38;
  const progress = T12.MathUtils.clamp((age - index * (volley ? 0.022 : 0.12)) / flight, 0, id === "piercing-arrow" ? 1.65 : 1);
  out.lerpVectors(origin, target, progress);
  if (volley) {
    out.x += Math.sin(index * 7.1) * 0.8 * progress;
    out.z += Math.cos(index * 9.3) * 0.65 * progress;
    out.y += 4 * 3.2 * progress * (1 - progress);
  }
  return progress;
}
function createRangerEffects(parent) {
  const root = new T12.Group();
  root.name = "RangerPhysicalProjectiles";
  parent.add(root);
  const template = createArrow();
  const arrowTipOffset = new T12.Box3().setFromObject(template).max.z;
  const arrows = Array.from({ length: 24 }, (_, i) => {
    const arrow = i ? template.clone() : template;
    root.add(arrow);
    return arrow;
  });
  const trails = arrows.map(() => {
    const ribbon = createSpellRibbon("#d8cba0", 12, 8e-3);
    root.add(ribbon.mesh);
    return { ribbon, points: Array.from({ length: 12 }, () => new T12.Vector3()) };
  });
  const sparks = createSpellParticleLayer({ capacity: 128, additive: true, hdr: 2.2 });
  root.add(sparks.mesh);
  const direction2 = new T12.Vector3(), ahead = new T12.Vector3(), position = new T12.Vector3(), end = new T12.Vector3();
  const forward = new T12.Vector3(0, 0, 1), shotAxis = new T12.Vector3(), color = new T12.Color();
  function sampleRoot(id, index, age, origin, target, out) {
    const progress = sampleArrowFlight(id, index, age, origin, target, out), volley = id === "volley";
    const delay = index * (volley ? 0.022 : 0.12), flight = (volley ? 1.16 : 0.38) * (id === "piercing-arrow" ? 1.65 : 1);
    const tangentTime = T12.MathUtils.clamp(age, delay, delay + flight);
    sampleArrowFlight(id, index, tangentTime - 8e-3, origin, target, ahead);
    sampleArrowFlight(id, index, tangentTime + 8e-3, origin, target, end);
    direction2.subVectors(end, ahead).normalize();
    out.addScaledVector(shotAxis, arrowTipOffset).addScaledVector(direction2, -arrowTipOffset);
    return progress;
  }
  return {
    sample(ability, time, release, origin, target) {
      root.visible = ability.visual.pose === "bow";
      if (!root.visible) return;
      const e = time - release, count = Math.min(24, ability.visual.count), volley = ability.id === "volley";
      shotAxis.subVectors(target, origin).normalize();
      color.set(ability.visual.color);
      let particleCount = 0;
      for (let i = 0; i < 24; i++) {
        const arrow = arrows[i], trail = trails[i];
        const p = sampleRoot(ability.id, i, e, origin, target, position);
        arrow.visible = i < count && e + 1e-9 >= i * (volley ? 0.022 : 0.12) && e < 2.5;
        if (ability.id === "piercing-arrow" && p >= 1.65) arrow.visible = false;
        trail.ribbon.mesh.visible = arrow.visible && p > 0 && p < (ability.id === "piercing-arrow" ? 1.65 : 1);
        if (!arrow.visible) continue;
        arrow.position.copy(position);
        if (direction2.lengthSq() > 1e-9) arrow.quaternion.setFromUnitVectors(forward, direction2.normalize());
        for (let j = 0; j < 12; j++) sampleRoot(ability.id, i, e - 0.055 * (1 - j / 11), origin, target, trail.points[j]);
        trail.ribbon.update(trail.points);
        trail.ribbon.uniforms.uAlpha.value = ability.id === "piercing-arrow" ? 0.85 : 0.26;
        trail.ribbon.uniforms.uWidth.value = ability.id === "piercing-arrow" ? 0.019 : 8e-3;
        trail.ribbon.uniforms.uTime.value = time;
        const impactAge = e - i * (volley ? 0.022 : 0.12) - (volley ? 1.16 : 0.38);
        if (impactAge >= 0 && impactAge < 0.4) {
          sampleArrowFlight(ability.id, i, 10, origin, target, end);
          if (ability.id === "piercing-arrow") end.copy(target);
          for (let k = 0; k < 5; k++) {
            const a = k * 2.4 + i;
            position.copy(end);
            position.x += Math.cos(a) * impactAge;
            position.y += Math.sin(a) * impactAge * 0.7;
            position.z -= impactAge * 0.8;
            sparks.setParticle(particleCount++, position, 9e-3, a, color, 1 - impactAge / 0.4, 0, 2.2);
          }
        }
      }
      sparks.commit(particleCount);
    },
    dispose() {
      for (const t of trails) t.ribbon.dispose();
      sparks.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/abilities/createChainLightning.ts
import * as T14 from "three";

// studio/src/vfx/abilities/targetLayout.ts
import * as T13 from "three";
var TRAINING_TARGETS = [new T13.Vector3(0, 1.05, 3), new T13.Vector3(-1.25, 1.05, 3.65), new T13.Vector3(1.3, 1.05, 3.85), new T13.Vector3(0.1, 1.05, 4.5)];

// studio/src/vfx/abilities/createChainLightning.ts
function createChainLightning(parent) {
  const root = new T14.Group();
  root.name = "BranchingChainLightning";
  parent.add(root);
  const strands = Array.from({ length: 24 }, (_, i) => {
    const core = createSpellRibbon("#e4f6ff", 33, i % 6 === 0 ? 0.015 : 5e-3);
    const glow = createSpellRibbon("#408bff", 33, i % 6 === 0 ? 0.05 : 0.018);
    core.uniforms.uColor.value.multiplyScalar(3);
    glow.uniforms.uColor.value.multiplyScalar(1.6);
    root.add(glow.mesh, core.mesh);
    return { core, glow, points: Array.from({ length: 33 }, () => new T14.Vector3()) };
  });
  const flashes = TRAINING_TARGETS.map(() => {
    const flash = createSpellGlow("#a3d8ff", 0.34);
    root.add(flash.mesh);
    return flash;
  });
  const ions = createSpellParticleLayer({ capacity: 128, additive: true, hdr: 3.2 });
  root.add(ions.mesh);
  const light = new T14.PointLight("#6ea6ff", 0, 6, 2);
  root.add(light);
  const start = new T14.Vector3(), end = new T14.Vector3(), point = new T14.Vector3(), white = new T14.Color("#d6f1ff");
  function draw(index, seed, amplitude, alpha, time) {
    const strand = strands[index];
    writeHierarchicalBolt(strand.points, start, end, seed, amplitude, 0.57);
    strand.core.update(strand.points);
    strand.glow.update(strand.points);
    strand.core.mesh.visible = strand.glow.mesh.visible = alpha > 3e-3;
    strand.core.uniforms.uAlpha.value = alpha;
    strand.glow.uniforms.uAlpha.value = alpha * 0.45;
    strand.core.uniforms.uTime.value = strand.glow.uniforms.uTime.value = time;
  }
  return {
    sample(active, time, release, origin) {
      root.visible = active;
      if (!active) return;
      for (const strand of strands) strand.core.mesh.visible = strand.glow.mesh.visible = false;
      for (const flash of flashes) flash.mesh.visible = false;
      let count = 0, peak = 0;
      const elapsed = time - release;
      for (let link = 0; link < 4; link++) {
        const age = elapsed - link * 0.115;
        const pulse = age >= 0 && age < 0.72 ? (1 - T14.MathUtils.smoothstep(age, 0.42, 0.72)) * (age < 0.07 ? 1 : 0.24 + 0.76 * Math.pow(Math.max(0, Math.cos((age - 0.19) * 37)), 6)) : 0;
        peak = Math.max(peak, pulse);
        start.copy(link ? TRAINING_TARGETS[link - 1] : origin);
        end.copy(TRAINING_TARGETS[link]);
        draw(link * 6, 71 + link * 121 + Math.floor(Math.max(0, age) * 14), 0.22, pulse, time);
        const main = strands[link * 6];
        for (let fork = 1; fork < 6; fork++) {
          const attachment = 5 + fork * 4;
          start.copy(main.points[attachment]);
          end.copy(start).add(point.set(Math.sin(fork * 3.7 + link) * 0.35, (fork % 2 ? 1 : -1) * 0.25, Math.cos(fork * 2.3) * 0.27));
          draw(link * 6 + fork, 111 + link * 31 + fork * 17 + Math.floor(Math.max(0, age) * 14), 0.09, pulse * (0.65 - fork * 0.06), time);
        }
        const flash = flashes[link];
        flash.mesh.visible = pulse > 0;
        flash.mesh.position.copy(TRAINING_TARGETS[link]);
        flash.uniforms.uAlpha.value = pulse * 0.56;
        flash.uniforms.uIntensity.value = 2.7;
        if (age >= 0 && age < 0.85) for (let i = 0; i < 32; i++) {
          const flight = age - i % 4 * 0.012;
          if (flight < 0) continue;
          const angle = i * 2.399;
          point.copy(TRAINING_TARGETS[link]);
          point.x += Math.cos(angle) * flight * (0.7 + i % 3 * 0.2);
          point.z += Math.sin(angle) * flight * 0.85;
          point.y += flight * (0.8 + i % 4 * 0.2) - 3.8 * flight * flight;
          point.y = Math.max(0.03, point.y);
          ions.setParticle(count++, point, 8e-3 + i % 3 * 2e-3, angle, white, Math.max(0, 1 - flight / 0.8), 0, 2.8);
        }
      }
      ions.commit(count);
      light.position.copy(TRAINING_TARGETS[1]);
      light.intensity = peak * 2.2;
    },
    dispose() {
      for (const s of strands) {
        s.core.dispose();
        s.glow.dispose();
      }
      for (const f of flashes) f.dispose();
      ions.dispose();
      light.dispose();
      parent.remove(root);
    }
  };
}

// studio/src/vfx/abilities/createMeteorEffect.ts
import * as T15 from "three";
var FLIGHT = 0.94;
var ENTRY = new T15.Vector3(-1.4, 5.6, -1.3);
function sampleMeteorPath(age, target, out) {
  const p = T15.MathUtils.clamp(age / FLIGHT, 0, 1);
  return out.copy(target).addScaledVector(ENTRY, 1 - p * p);
}
function createMeteorEffect(parent, textures) {
  const root = new T15.Group();
  root.name = "VolumetricMeteor";
  parent.add(root);
  const meteor = new T15.Group();
  root.add(meteor);
  const rock = new T15.Mesh(new T15.IcosahedronGeometry(0.38, 2), new T15.MeshStandardMaterial({ color: "#170b06", roughness: 0.85, emissive: "#9d2404", emissiveIntensity: 0.35, depthWrite: false }));
  const volume = createFireVolume();
  volume.mesh.scale.setScalar(4.2);
  meteor.add(rock, volume.mesh);
  const glow = createSpellGlow("#ff731c", 0.86);
  glow.uniforms.uIntensity.value = 2.6;
  meteor.add(glow.mesh);
  const atlas = { columns: 6, rows: 6, frames: 36 };
  const flame = createSpellParticleLayer({ capacity: 48, texture: textures.fire, atlas, additive: true, hdr: 2.2 });
  const smoke = createSpellParticleLayer({ capacity: 48, texture: textures.smoke, atlas, additive: false });
  const sparks = createSpellParticleLayer({ capacity: 96, additive: true, hdr: 3 });
  root.add(flame.mesh, smoke.mesh, sparks.mesh);
  const impactRoot = new T15.Group();
  impactRoot.scale.setScalar(1.7);
  root.add(impactRoot);
  const impact = createFireballImpact(impactRoot, textures);
  const debris = new T15.InstancedMesh(new T15.IcosahedronGeometry(0.045, 0), new T15.MeshStandardMaterial({ color: "#382018", emissive: "#f4560a", emissiveIntensity: 0.8, roughness: 0.9 }), 24);
  debris.frustumCulled = false;
  root.add(debris);
  const dummy = new T15.Object3D();
  const light = new T15.PointLight("#ff711c", 0, 7, 2);
  root.add(light);
  const p = new T15.Vector3(), zero = new T15.Vector3(0, 0.018, 0), up = new T15.Vector3(0, 1, 0);
  const hot = new T15.Color("#ffdd9f"), soot = new T15.Color("#615953"), ember = new T15.Color("#ffc57b");
  return {
    sample(active, time, release, target) {
      root.visible = active;
      if (!active) return;
      const e = time - release, age = e - FLIGHT;
      meteor.visible = e >= 0 && age < 0;
      sampleMeteorPath(e, target, meteor.position);
      meteor.rotation.set(e * 1.5, e * 2, e * 0.7);
      volume.material.uniforms.uTime.value = time * 2;
      volume.material.uniforms.uOpacity.value = 1;
      glow.uniforms.uTime.value = time;
      glow.uniforms.uAlpha.value = 0.38;
      let fc = 0, sc = 0, ec = 0;
      for (let i = 0; i < 48; i++) {
        const delay = i * 0.018, emitted = e - delay;
        if (emitted < 0 || emitted > FLIGHT || delay < Math.max(0, age)) continue;
        sampleMeteorPath(emitted, target, p);
        p.x += Math.sin(i * 8.3) * (0.12 + delay * 0.21);
        p.z += Math.cos(i * 4.1) * (0.12 + delay * 0.21);
        flame.setParticle(fc++, p, 0.8 + delay * 1.15, i * 1.8, hot, Math.max(0, 0.72 - delay * 0.9), delay * 34 + i % 6);
        p.y += delay * 0.45;
        smoke.setParticle(sc++, p, 0.6 + delay * 1.7, i * 0.7, soot, 0.24 * Math.sin(Math.min(1, delay / 0.85) * Math.PI), delay * 25);
      }
      for (let i = 0; i < 96; i++) {
        const delay = i % 24 * 0.027, emitted = e - delay;
        if (emitted < 0 || emitted > FLIGHT) continue;
        sampleMeteorPath(emitted, target, p);
        const a = i * 2.399;
        p.x += Math.cos(a) * (0.36 + delay * 0.65);
        p.z += Math.sin(a) * (0.36 + delay * 0.65);
        p.y -= delay * delay * 2;
        sparks.setParticle(ec++, p, 0.012 + i % 3 * 4e-3, a, ember, Math.max(0, 1 - delay / 0.9), 0, 2.5);
      }
      flame.commit(fc);
      smoke.commit(sc);
      sparks.commit(ec);
      impactRoot.position.copy(target);
      impact.update(age, zero, up, true);
      debris.visible = age >= 0 && age < 1.6;
      if (debris.visible) for (let i = 0; i < 24; i++) {
        const angle = i * 2.399, speed = 0.8 + i % 5 * 0.43;
        dummy.position.copy(target);
        dummy.position.x += Math.cos(angle) * speed * age;
        dummy.position.z += Math.sin(angle) * speed * age;
        dummy.position.y = Math.max(0.035, age * (1.4 + i % 4 * 0.55) - 4.9 * age * age);
        dummy.rotation.set(age * (i % 5 + 2), angle, age * 3);
        dummy.scale.setScalar((1 + i % 3 * 0.35) * (1 - T15.MathUtils.smoothstep(age, 1.2, 1.6)));
        dummy.updateMatrix();
        debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      light.position.copy(meteor.position);
      light.intensity = meteor.visible ? 2.2 : 0;
    },
    dispose() {
      impact.dispose();
      flame.dispose();
      smoke.dispose();
      sparks.dispose();
      glow.dispose();
      light.dispose();
      debris.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/abilities/createActionAccents.ts
import * as T16 from "three";
function createActionAccents(parent) {
  const root = new T16.Group();
  root.name = "ActionSpecificAccents";
  parent.add(root);
  const iconMaterial = enableSpellBloom(new T16.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new T16.Color() }, alpha: { value: 0 }, shield: { value: 0 } },
    vertexShader: `varying vec2 p;void main(){p=uv*2.-1.;vec4 c=modelViewMatrix*vec4(0,0,0,1);c.xy+=position.xy;gl_Position=projectionMatrix*c;}`,
    fragmentShader: `varying vec2 p;uniform vec3 color;uniform float alpha;uniform float shield;
      void main(){float r=length(p);float ring=1.-smoothstep(.022,.041,abs(r-.59));
        float cross=max((1.-step(.027,abs(p.x)))*step(.42,abs(p.y)),(1.-step(.027,abs(p.y)))*step(.42,abs(p.x)));
        float target=max(ring,max(cross,1.-smoothstep(.035,.055,r)));
        float side=abs(p.x)-(.57-max(0.,-p.y)*.7);float top=p.y-.6;
        float border=1.-smoothstep(.022,.045,min(abs(side),abs(top)));
        float inside=step(side,.025)*step(top,.025)*step(-.85,p.y);
        float crest=inside*(border+.10);
        float a=mix(target,crest,shield)*alpha; if(a<.005)discard;gl_FragColor=vec4(color*1.9,a);}`
  }));
  const icon = new T16.Mesh(new T16.PlaneGeometry(0.55, 0.55), iconMaterial);
  icon.frustumCulled = false;
  root.add(icon);
  const trap = new T16.Group();
  trap.name = "PlacedSnareTrap";
  root.add(trap);
  const iron = new T16.MeshStandardMaterial({ color: "#596268", roughness: 0.5, metalness: 0.8 });
  const ring = new T16.Mesh(new T16.TorusGeometry(0.21, 0.018, 6, 32), iron);
  ring.rotation.x = Math.PI / 2;
  trap.add(ring);
  const plate = new T16.Mesh(new T16.CylinderGeometry(0.09, 0.09, 0.015, 16), iron);
  trap.add(plate);
  const toothGeo = new T16.ConeGeometry(0.024, 0.055, 4);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const tooth = new T16.Mesh(toothGeo, iron);
    tooth.position.set(Math.cos(a) * 0.2, 0.025, Math.sin(a) * 0.2);
    trap.add(tooth);
  }
  const orbMaterial = enableSpellBloom(new T16.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T16.AdditiveBlending,
    uniforms: { time: { value: 0 }, alpha: { value: 0 } },
    vertexShader: `varying vec3 p;varying vec3 n;varying vec3 v;void main(){p=position;n=normalMatrix*normal;vec4 mv=modelViewMatrix*vec4(position,1);v=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 p;varying vec3 n;varying vec3 v;uniform float time;uniform float alpha;
      void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.);float flow=sin(p.x*17.+p.y*23.-time*19.)*sin(p.z*19.-time*7.);
      gl_FragColor=vec4(mix(vec3(.12,.23,1.8),vec3(.7,1.4,2.2),rim),(rim*.75+pow(max(0.,flow),3.)*.4)*alpha);}`
  }));
  const orb = new T16.Mesh(new T16.SphereGeometry(1, 36, 24), orbMaterial);
  root.add(orb);
  const flash = createSpellGlow("#8bbaff", 1.15);
  root.add(flash.mesh);
  const rings = Array.from({ length: 3 }, () => {
    const m = enableSpellBloom(new T16.MeshBasicMaterial({ color: "#ccdec6", transparent: true, opacity: 0, depthWrite: false, blending: T16.AdditiveBlending }));
    const r = new T16.Mesh(new T16.TorusGeometry(1, 6e-3, 6, 48), m);
    root.add(r);
    return r;
  });
  const position = new T16.Vector3();
  return {
    sample(ability, time, release, target, origin) {
      icon.visible = trap.visible = orb.visible = flash.mesh.visible = false;
      for (const r of rings) r.visible = false;
      const e = time - release, phase = actionPhase(ability, time), fade = Math.max(0, Math.min(1, 3 - e));
      if (ability.id === "hunters-mark" || ability.id === "mana-shield") {
        icon.visible = e >= 0;
        icon.position.copy(ability.id === "hunters-mark" ? target : position.set(0, 0, 0));
        icon.position.y = ability.id === "hunters-mark" ? 1.96 : 2.42;
        iconMaterial.uniforms.shield.value = ability.id === "mana-shield" ? 1 : 0;
        iconMaterial.uniforms.color.value.set(ability.id === "hunters-mark" ? "#ff283c" : "#71b9ff");
        iconMaterial.uniforms.alpha.value = fade * T16.MathUtils.smoothstep(e, 0, 0.08);
      }
      if (ability.id === "snare") {
        trap.visible = phase > 0.14;
        trap.position.copy(origin);
        if (phase < 0.5) {
          trap.position.lerp(position.set(-0.13, 0.055, 0.48), T16.MathUtils.smoothstep(phase, 0.22, 0.5));
        } else trap.position.set(-0.13, 0.055, 0.48);
        trap.rotation.set(0, 0, 0);
        trap.scale.setScalar(1);
      }
      if (ability.id === "blink" || ability.id === "shadowstep") {
        sampleActionTravel(ability.id, phase, position);
        position.y = 1;
        const strength = T16.MathUtils.smoothstep(phase, 0.32, 0.44) * (1 - T16.MathUtils.smoothstep(phase, 0.57, 0.73));
        orb.visible = strength > 1e-3;
        orb.position.copy(position);
        orb.scale.setScalar(0.3 + strength * 0.47);
        orbMaterial.uniforms.time.value = time;
        orbMaterial.uniforms.alpha.value = strength;
        flash.mesh.visible = strength > 1e-3;
        flash.mesh.position.copy(position);
        flash.uniforms.uAlpha.value = strength * 0.65;
        flash.uniforms.uTime.value = time;
      }
      if (ability.id === "beast-call") for (let i = 0; i < 3; i++) {
        const p = T16.MathUtils.clamp((e - i * 0.17) / 0.85, 0, 1), r = rings[i];
        r.visible = p > 0 && p < 1;
        r.position.set(0, 1.7 + p * 0.55, 0.3 + p * 0.8);
        r.rotation.x = -Math.PI / 4;
        r.scale.setScalar(0.08 + p * 0.55);
        r.material.opacity = Math.sin(p * Math.PI) * 0.27;
      }
    },
    dispose() {
      flash.dispose();
      disposeTree(root);
    }
  };
}

// studio/src/vfx/abilities/createTrainingTargets.ts
import * as T17 from "three";
function createTrainingTargets(parent) {
  const root = new T17.Group();
  root.name = "AbilityTrainingTargets";
  parent.add(root);
  const wood = new T17.MeshStandardMaterial({ color: "#6b5946", roughness: 0.87 });
  const metal = new T17.MeshStandardMaterial({ color: "#414b51", roughness: 0.6, metalness: 0.6 });
  const torsoGeo = new T17.CylinderGeometry(0.19, 0.25, 0.64, 14), headGeo = new T17.SphereGeometry(0.14, 16, 12);
  const postGeo = new T17.CylinderGeometry(0.045, 0.07, 0.7, 10), armGeo = new T17.CylinderGeometry(0.075, 0.075, 0.85, 10);
  const targets = TRAINING_TARGETS.map((position, index) => {
    const target = new T17.Group();
    target.position.copy(position);
    target.name = `TrainingTarget${index + 1}`;
    const torso = new T17.Mesh(torsoGeo, wood), head = new T17.Mesh(headGeo, wood), post = new T17.Mesh(postGeo, metal), arm = new T17.Mesh(armGeo, wood);
    head.position.y = 0.48;
    post.position.y = -0.68;
    arm.rotation.z = Math.PI / 2;
    arm.position.y = 0.2;
    target.add(torso, head, post, arm);
    root.add(target);
    return target;
  });
  return {
    sample(ability, time, release) {
      root.visible = ["projectile", "volley", "lightning", "mark", "meteor", "slash", "impact"].includes(ability.visual.family) && !["jump", "lightning", "lunge"].includes(ability.id);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        target.visible = i === 0 || ability.id === "chain-lightning";
        const age = time - release - (ability.id === "chain-lightning" ? i * 0.11 : 0.42);
        target.rotation.x = age < 0 ? 0 : Math.sin(age * 22) * Math.exp(-age * 9) * 0.08;
      }
    },
    dispose() {
      disposeTree(root);
    }
  };
}

// studio/src/vfx/abilities/summoning/createGroundSummon.ts
import * as T20 from "three";

// studio/src/vfx/abilities/summoning/createSummonFigure.ts
import * as T18 from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
var DOWN = new T18.Vector3(0, -1, 0);
function createSummonFigure(kind) {
  const root = new T18.Group();
  root.name = `Summoned_${kind}`;
  const pelvis = new T18.Group(), chest = new T18.Group(), head = new T18.Group();
  pelvis.name = "Pelvis";
  chest.name = "Chest";
  head.name = "Head";
  root.add(pelvis);
  pelvis.add(chest);
  chest.position.y = 0.34;
  chest.add(head);
  head.position.y = 0.37;
  const imp = kind === "imp";
  const body = new T18.MeshStandardMaterial({ color: imp ? "#8b3c33" : "#d5c9a6", roughness: 0.83, vertexColors: true });
  const dark = new T18.MeshStandardMaterial({ color: imp ? "#382329" : "#29281f", roughness: 0.93, side: T18.DoubleSide });
  const eyes = enableSpellBloom(new T18.MeshStandardMaterial({ color: imp ? "#ffaf24" : "#b6ed7a", emissive: imp ? "#ff6d08" : "#76d634", emissiveIntensity: 2.5 }));
  const buckets = /* @__PURE__ */ new Map();
  const rotation2 = new T18.Quaternion(), matrix = new T18.Matrix4(), center = new T18.Vector3(), scale = new T18.Vector3();
  function add(part, geometry, material = body) {
    if (!buckets.has(part)) buckets.set(part, /* @__PURE__ */ new Map());
    const materials = buckets.get(part);
    if (!materials.has(material)) materials.set(material, []);
    materials.get(material).push(geometry);
  }
  function oval(part, x, y, z, sx, sy, sz, material = body) {
    const geometry = new T18.SphereGeometry(1, 16, 12);
    geometry.scale(sx, sy, sz).translate(x, y, z);
    add(part, geometry, material);
  }
  function rod(part, a, b, radius, radiusEnd = radius, material = body) {
    const start = new T18.Vector3(...a), end = new T18.Vector3(...b);
    const length = start.distanceTo(end);
    rotation2.setFromUnitVectors(DOWN, end.clone().sub(start).normalize());
    center.copy(start).add(end).multiplyScalar(0.5);
    scale.set(1, 1, 1);
    matrix.compose(center, rotation2, scale);
    add(part, new T18.CylinderGeometry(radius, radiusEnd, length, 10).applyMatrix4(matrix), material);
  }
  function curve(part, points, radius, material = body) {
    const path = new T18.CatmullRomCurve3(points.map((p) => new T18.Vector3(p[0], p[1], p[2])));
    add(part, new T18.TubeGeometry(path, 24, radius, 7, false), material);
  }
  if (imp) {
    oval(pelvis, 0, 0.045, 0, 0.18, 0.16, 0.13);
    oval(chest, 0, -0.03, 0, 0.23, 0.25, 0.15);
    oval(chest, 0, -0.12, 0.09, 0.13, 0.16, 0.08, dark);
    oval(head, 0, 0.065, 0.015, 0.16, 0.2, 0.14);
    oval(head, 0, -0.06, 0.14, 0.105, 0.065, 0.07);
    for (const side2 of [-1, 1]) {
      curve(head, [[side2 * 0.105, 0.19, 0], [side2 * 0.19, 0.29, -0.045], [side2 * 0.2, 0.39, -0.13]], 0.032, dark);
      rod(head, [side2 * 0.2, 0.36, -0.11], [side2 * 0.16, 0.43, -0.17], 0.024, 1e-3, dark);
      rod(head, [side2 * 0.13, 0.07, 0], [side2 * 0.29, 0.17, -0.045], 0.06, 3e-3);
      oval(head, side2 * 0.074, 0.074, 0.131, 0.052, 0.031, 0.024, dark);
      oval(head, side2 * 0.076, 0.077, 0.151, 0.031, 0.016, 8e-3, eyes);
      rod(head, [side2 * 0.045, 0.107, 0.151], [side2 * 0.125, 0.133, 0.111], 0.023, 0.032);
      rod(head, [side2 * 0.055, -0.026, 0.195], [side2 * 0.051, -0.084, 0.209], 0.014, 1e-3);
    }
    curve(pelvis, [[0, -0.045, -0.09], [0, -0.14, -0.3], [0.17, -0.16, -0.48], [0.34, 0.03, -0.51], [0.32, 0.12, -0.45]], 0.023);
    rod(pelvis, [0.32, 0.08, -0.47], [0.31, 0.19, -0.4], 0.048, 1e-3, dark);
    for (const side2 of [-1, 1]) {
      const outline = [[0.11, 0.14, -0.1], [0.25, 0.27, -0.2], [0.52, 0.3, -0.33], [0.4, 0.07, -0.28], [0.47, -0.21, -0.28], [0.26, -0.16, -0.21], [0.12, -0.24, -0.12]];
      const positions = [];
      for (let i = 1; i < outline.length - 1; i++) for (const p of [outline[0], outline[i], outline[i + 1]]) positions.push(side2 * p[0], p[1], p[2]);
      const geometry = new T18.BufferGeometry();
      geometry.setAttribute("position", new T18.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      add(chest, geometry, dark);
      for (const i of [2, 4, 6]) curve(chest, [[side2 * 0.11, 0.14, -0.1], [side2 * 0.25, 0.27, -0.2], [side2 * outline[i][0], outline[i][1], outline[i][2]]], 0.014);
    }
  } else {
    for (const side2 of [-1, 1]) {
      curve(pelvis, [[0, 0.1, -0.02], [side2 * 0.12, 0.15, -0.03], [side2 * 0.2, 0.09, 0.02], [side2 * 0.16, -0.07, 0.07], [side2 * 0.04, -0.1, 0.09], [0, -0.04, 0.1]], 0.027);
      oval(pelvis, side2 * 0.12, 0.095, -0.012, 0.071, 0.065, 0.024);
      for (let i = 0; i < 7; i++) {
        const y = 0.16 - i * 0.04, width = 0.18 - Math.pow((i - 2) / 8, 2) * 0.15;
        curve(chest, [[side2 * 0.025, y, -0.075], [side2 * width, y + 0.015, -0.025], [side2 * (width + 0.015), y - 8e-3, 0.085], [side2 * 0.075, y - 0.045, 0.14], [side2 * 0.017, y - 0.033, 0.125]], 95e-4);
      }
      curve(chest, [[0, 0.19, 0.08], [side2 * 0.1, 0.22, 0.04], [side2 * 0.21, 0.19, 0]], 0.017);
      oval(chest, side2 * 0.13, 0.12, -0.095, 0.069, 0.09, 0.018);
    }
    for (let i = 0; i < 5; i++) oval(pelvis, 0, 0.07 + i * 0.041, -0.055, 0.03, 0.019, 0.029);
    for (let i = 0; i < 8; i++) oval(chest, 0, -0.08 + i * 0.041, -0.06, 0.027, 0.018, 0.027);
    rod(chest, [0, 0.21, -0.06], [0, 0.28, -0.015], 0.025, 0.02);
    rod(chest, [0, 0.17, 0.13], [0, -0.07, 0.13], 0.016, 0.01);
    oval(head, 0, 0.085, -0.015, 0.122, 0.148, 0.105);
    oval(head, 0, -0.016, 0.055, 0.088, 0.07, 0.061);
    for (const side2 of [-1, 1]) {
      oval(head, side2 * 0.052, 0.042, 0.088, 0.042, 0.046, 0.027, dark);
      oval(head, side2 * 0.054, 0.04, 0.112, 0.012, 0.013, 8e-3, eyes);
      curve(head, [[side2 * 0.014, 0.092, 0.105], [side2 * 0.056, 0.108, 0.103], [side2 * 0.102, 0.07, 0.072]], 0.019);
      rod(head, [side2 * 0.093, 0.01, 0.071], [side2 * 0.071, -0.029, 0.106], 0.019, 0.014);
    }
    oval(head, 0, -0.017, 0.112, 0.015, 0.025, 8e-3, dark);
    curve(head, [[-0.079, -0.026, 0.054], [-0.07, -0.092, 0.098], [0, -0.107, 0.119], [0.07, -0.092, 0.098], [0.079, -0.026, 0.054]], 0.017);
    for (let i = 0; i < 8; i++) {
      oval(head, (i - 3.5) * 0.014, -0.053, 0.119 - Math.abs(i - 3.5) * 2e-3, 6e-3, 0.012, 7e-3);
      oval(head, (i - 3.5) * 0.014, -0.079, 0.128 - Math.abs(i - 3.5) * 3e-3, 6e-3, 9e-3, 6e-3);
    }
  }
  function limb(name, parent, x, y, upperLength, lowerLength, leg) {
    const upper = new T18.Group(), lower = new T18.Group(), end = new T18.Group();
    upper.name = name;
    lower.name = `${name}Joint`;
    end.name = `${name}Contact`;
    parent.add(upper);
    upper.position.set(x, y, 0);
    upper.add(lower);
    lower.position.y = -upperLength;
    lower.add(end);
    end.position.y = -lowerLength;
    const radius = leg ? 0.027 : 0.018;
    for (const [part, length] of [[upper, upperLength], [lower, lowerLength]]) {
      if (imp) {
        oval(part, 0, -length * 0.44, 0, leg ? 0.076 : 0.052, length * 0.58, leg ? 0.072 : 0.053);
      } else {
        const double = part === lower;
        rod(part, [0, -0.015, 0], [double ? -0.011 : 0, -length + 0.018, 0], radius, radius * 0.7);
        if (double) rod(part, [0.025, -0.015, -0.013], [0.018, -length + 0.018, -9e-3], radius * 0.5);
        for (const y2 of [0, -length]) oval(part, 0, y2, 0, radius * 1.35, radius * 1.1, radius * 1.35);
      }
    }
    if (leg) {
      oval(end, 0, 2e-3, 0.038, imp ? 0.064 : 0.035, 0.029, 0.085);
      for (let i = 0; i < (imp ? 3 : 5); i++) rod(end, [(i - (imp ? 1 : 2)) * 0.019, 0, 0.072], [(i - (imp ? 1 : 2)) * 0.025, -0.016, 0.145 - Math.abs(i - 2) * 9e-3], 8e-3, imp ? 1e-3 : 6e-3);
    } else {
      if (imp) oval(end, 0, -0.036, 0, 0.043, 0.055, 0.024);
      for (let i = 0; i < 4; i++) {
        const x2 = (i - 1.5) * 0.02, length = 0.085 - Math.abs(i - 1) * 0.01;
        rod(end, [x2, 0, 0], [x2, -0.054, 0], 8e-3);
        curve(end, [[x2, -0.054, 0], [x2, -0.054 - length * 0.5, 7e-3], [x2, -0.054 - length, 0.035], [x2, -0.047 - length, 0.051]], imp ? 9e-3 : 6e-3);
      }
      curve(end, [[0.026, -0.017, 0], [0.06, -0.047, 5e-3], [0.064, -0.084, 0.025], [0.053, -0.093, 0.04]], imp ? 0.012 : 8e-3);
    }
    return { upper, lower, end, solver: createLimbTargetSolver(upper, lower, end) };
  }
  const leftArm = limb("LeftArm", chest, 0.22, 0.19, 0.3, 0.29, false), rightArm = limb("RightArm", chest, -0.22, 0.19, 0.3, 0.29, false);
  const leftLeg = limb("LeftLeg", pelvis, 0.13, 0, 0.39, 0.38, true), rightLeg = limb("RightLeg", pelvis, -0.13, 0, 0.39, 0.38, true);
  for (const [part, materials] of buckets) for (const [material, geometries] of materials) {
    const plain = geometries.map((g) => {
      const geometry = g.index ? g.toNonIndexed() : g.clone();
      geometry.deleteAttribute("uv");
      if (material === body) {
        const attribute = geometry.getAttribute("position"), colors = new Float32Array(attribute.count * 3);
        for (let i = 0; i < attribute.count; i++) {
          const shade = 0.82 + 0.18 * Math.sin(attribute.getX(i) * 119 + attribute.getY(i) * 73 + attribute.getZ(i) * 97) ** 2;
          colors.set([shade, shade, shade], i * 3);
        }
        geometry.setAttribute("color", new T18.BufferAttribute(colors, 3));
      }
      return geometry;
    });
    const mesh = new T18.Mesh(mergeGeometries(plain), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    part.add(mesh);
    for (const geometry of [...geometries, ...plain]) geometry.dispose();
  }
  const limbs = [leftArm, rightArm, leftLeg, rightLeg];
  return {
    root,
    pelvis,
    chest,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    limbs,
    dispose() {
      disposeTree(root);
    }
  };
}

// studio/src/vfx/abilities/summoning/summonChoreography.ts
import * as T19 from "three";
function summonPortalOpening(age) {
  return smoothRange(0, 0.45, age) * (1 - smoothRange(3.55, 4.35, age));
}
function createSummonChoreography(figure, kind) {
  const target = new T19.Vector3(), pole = new T19.Vector3(), inverse = new T19.Quaternion(), orientation = new T19.Quaternion();
  const { root, pelvis, chest, head, leftArm, rightArm, leftLeg, rightLeg } = figure;
  const arms = [[leftArm, 1, 0], [rightArm, -1, 0.2]];
  function solve(limb, x, y, z, px, py, pz, plantedHand = false) {
    root.localToWorld(target.set(x, y, z));
    root.localToWorld(pole.set(px, py, pz));
    limb.solver.solve(target, pole);
    root.getWorldQuaternion(orientation);
    limb.end.parent.getWorldQuaternion(inverse).invert();
    limb.end.quaternion.copy(inverse).multiply(orientation);
    if (plantedHand) limb.end.rotateX(-Math.PI / 2);
  }
  return {
    sample(age) {
      const t = age * (kind === "imp" ? 1.12 : 1);
      const haul = smoothRange(0.65, 1.85, t), knee = smoothRange(1.65, 2.45, t), stand = smoothRange(2.35, 3.3, t), step = smoothRange(2.8, 3.6, t);
      pelvis.position.set(0.032 * Math.sin(t * 2) * haul * (1 - stand), -0.98 + 0.28 * smoothRange(0.2, 0.7, t) + 0.68 * haul + 0.22 * knee + 0.57 * stand, -0.23 + 0.43 * haul + 0.45 * knee + 0.31 * step);
      chest.position.z = 0.18 * (1 - stand);
      head.position.y = 0.2 + 0.17 * smoothRange(0.7, 1.4, t);
      chest.rotation.set(0.28 + 0.36 * haul - 0.58 * stand, 0.08 * Math.sin(t * 2) * (1 - stand), 0.035 * (1 - stand));
      head.rotation.set(-0.22 - 0.2 * haul + 0.37 * stand, -0.18 * (1 - smoothRange(0.8, 1.8, t)), 0);
      const idle = smoothRange(3.6, 4.1, t);
      chest.rotation.x += Math.sin(t * 2.3) * 9e-3 * idle;
      head.rotation.y += Math.sin(t * 0.9) * 0.06 * idle;
      for (const limb of figure.limbs) {
        limb.upper.quaternion.identity();
        limb.lower.quaternion.identity();
        limb.end.quaternion.identity();
      }
      root.updateWorldMatrix(true, true);
      for (const [limb, side2, delay] of arms) {
        const plant = smoothRange(0.22 + delay, 0.65 + delay, t), release = smoothRange(1.7 + delay, 2.18 + delay, t);
        const restY = pelvis.position.y + 0.05;
        solve(limb, side2 * (0.46 - 0.18 * release), T19.MathUtils.lerp(-0.36 + 0.445 * plant, restY, release), T19.MathUtils.lerp(0.48, pelvis.position.z + 0.12, release), side2 * 0.72, 0.3, pelvis.position.z - 0.18, true);
        limb.end.rotateX(release * Math.PI / 2);
      }
      const first = smoothRange(1.35, 2.05, t), second = smoothRange(2.15, 2.82, t);
      solve(leftLeg, 0.16, -0.88 + 0.912 * first, 0.03 + 0.87 * first + 0.17 * step, 0.21, 0.35, 1);
      solve(rightLeg, -0.16, -1 + 1.032 * second, -0.12 + 1.06 * second, -0.23, 0.24, 0.8);
      root.updateWorldMatrix(true, true);
    }
  };
}

// studio/src/vfx/abilities/summoning/createGroundSummon.ts
function createGroundSummon(parent, textures) {
  const root = new T20.Group();
  root.name = "GroundSummoning";
  root.visible = false;
  parent.add(root);
  const skeleton = createSummonFigure("skeleton"), imp = createSummonFigure("imp");
  const skeletonMotion = createSummonChoreography(skeleton, "skeleton"), impMotion = createSummonChoreography(imp, "imp");
  root.add(skeleton.root, imp.root);
  imp.root.scale.setScalar(0.68);
  const aperture = new T20.Group();
  aperture.name = "HorizontalSummonAperture";
  root.add(aperture);
  const plane = new T20.PlaneGeometry(2, 2);
  const uniforms = { time: { value: 0 }, strength: { value: 0 }, tint: { value: new T20.Color() } };
  const vertexShader = `varying vec2 p; void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}`;
  const voidMaterial = new T20.ShaderMaterial({
    uniforms,
    vertexShader,
    depthWrite: false,
    fragmentShader: `varying vec2 p;uniform float time;uniform vec3 tint;${noise}
      void main(){float r=length(p);float edge=.79+noise(p*13.)*.025;if(r>edge)discard;
        float a=atan(p.y,p.x),swirl=noise(vec2(a*3.+time*.22,r*12.-time*.65));
        vec3 color=vec3(.003,.004,.003)+tint*pow(swirl,4.)*.075*smoothstep(.2,.8,r);
        gl_FragColor=vec4(color,1.);}`
  });
  const voidDisc = new T20.Mesh(plane, voidMaterial);
  voidDisc.name = "SummonVoid";
  voidDisc.rotation.x = -Math.PI / 2;
  voidDisc.position.y = 0.019;
  aperture.add(voidDisc);
  const rimMaterial = enableSpellBloom(new T20.ShaderMaterial({
    uniforms,
    vertexShader,
    transparent: true,
    depthWrite: false,
    blending: T20.AdditiveBlending,
    fragmentShader: `varying vec2 p;uniform float time;uniform float strength;uniform vec3 tint;${noise}
      void main(){float r=length(p),a=atan(p.y,p.x);float n=noise(vec2(a*8.,time*.8))*2.-1.;
        float edge=.80+n*.022;float rim=exp(-abs(r-edge)*135.);
        float tendrils=pow(noise(vec2(a*22.+time*.7,r*28.-time*3.)),3.)*exp(-abs(r-edge)*18.);
        float runes=pow(max(0.,sin(a*24.)),12.)*exp(-abs(r-.94)*120.);
        float alpha=(rim*.86+tendrils*.6+runes*.34)*strength;
        gl_FragColor=vec4(tint*(1.4+rim*1.1),alpha);}`
  }));
  const rim = new T20.Mesh(plane, rimMaterial);
  rim.name = "GroundPortalRim";
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.023;
  aperture.add(rim);
  const smoke = createSpellParticleLayer({ capacity: 36, texture: textures.smoke, atlas: { columns: 6, rows: 6, frames: 36 }, additive: false });
  const embers = createSpellParticleLayer({ capacity: 40, additive: true, hdr: 2.2 });
  root.add(smoke.mesh, embers.mesh);
  const ground = new T20.Vector3(0, 0.02, 0), up = new T20.Vector3(0, 1, 0);
  smoke.setSurfaceFade(ground, up, 0.1);
  embers.setSurfaceFade(ground, up, 0.06);
  const dirt = new T20.InstancedMesh(new T20.IcosahedronGeometry(0.027, 0), new T20.MeshStandardMaterial({ color: "#443b2b", roughness: 1 }), 24);
  dirt.name = "DisplacedGraveEarth";
  dirt.instanceMatrix.setUsage(T20.DynamicDrawUsage);
  dirt.frustumCulled = false;
  root.add(dirt);
  const glow = new T20.PointLight("#b2d67c", 0, 3, 2);
  glow.position.y = 0.23;
  root.add(glow);
  const position = new T20.Vector3(), tint = new T20.Color(), smokeTint = new T20.Color(), gray = new T20.Color("#8d9387"), dummy = new T20.Object3D();
  return {
    root,
    sample(id, time, release, target) {
      const kind = summonKind(id), age = time - release;
      root.visible = kind !== null && age >= 0;
      if (!kind) return false;
      root.position.set(target.x, 0, target.z);
      skeleton.root.visible = kind === "skeleton";
      imp.root.visible = kind === "imp";
      const opening = summonPortalOpening(age), size = kind === "imp" ? 0.68 : 1;
      aperture.visible = opening > 1e-3;
      aperture.scale.set(0.79 * size * opening, 1, 0.91 * size * opening);
      tint.set(kind === "imp" ? "#f88442" : "#b2d67c");
      smokeTint.copy(tint).lerp(gray, 0.77);
      uniforms.time.value = age;
      uniforms.strength.value = opening;
      uniforms.tint.value.copy(tint);
      glow.color.copy(tint);
      glow.intensity = opening * (1.9 + 0.25 * Math.sin(age * 9));
      glow.distance = 3 * size;
      (kind === "skeleton" ? skeletonMotion : impMotion).sample(age);
      for (let i = 0; i < 36; i++) {
        const life = (Math.max(0, age) * 0.6 + i * 0.071) % 1, a = i * 2.39996 + life * 0.32;
        position.set(Math.cos(a) * (0.59 + life * 0.18) * size, (0.04 + life * 0.39) * size, Math.sin(a) * (0.69 + life * 0.18) * size);
        smoke.setParticle(i, position, (0.18 + life * 0.36) * size, a, smokeTint, Math.sin(life * Math.PI) * opening * 0.31, Math.floor(life * 35));
      }
      smoke.commit(root.visible ? 36 : 0);
      for (let i = 0; i < 40; i++) {
        const life = (Math.max(0, age) * 0.8 + i * 0.037) % 1, a = i * 2.39996;
        position.set(Math.cos(a) * (0.57 + life * 0.11) * size, (0.025 + life * (kind === "imp" ? 0.74 : 0.25)) * size, Math.sin(a) * (0.67 + life * 0.14) * size);
        embers.setParticle(i, position, (kind === "imp" ? 0.013 : 9e-3) * size, a, tint, Math.sin(life * Math.PI) * opening, 0, kind === "imp" ? 2.2 : 1.4);
      }
      embers.commit(root.visible ? 40 : 0);
      dirt.visible = kind === "skeleton" && age > 0.35 && age < 2.6;
      for (let i = 0; i < 24; i++) {
        const a = i * 2.39996, t = Math.max(0, age - 0.35 - i % 3 * 0.36), speed = 0.3 + i % 5 * 0.05;
        const flight = Math.min(t, 0.48), radius = 0.64 + flight * 0.36;
        dummy.position.set(Math.cos(a) * radius, 0.026 + Math.max(0, flight * speed - flight * flight * 0.9), Math.sin(a) * radius * 1.12);
        dummy.rotation.set(flight * 5 + i, flight * 3, i);
        dummy.scale.setScalar((0.6 + i % 3 * 0.3) * (1 - smoothRange(1.7, 2.6, age)));
        dummy.updateMatrix();
        dirt.setMatrixAt(i, dummy.matrix);
      }
      dirt.instanceMatrix.needsUpdate = true;
      return true;
    },
    reset() {
      root.visible = false;
      smoke.commit(0);
      embers.commit(0);
    },
    dispose() {
      skeleton.dispose();
      imp.dispose();
      smoke.dispose();
      embers.dispose();
      plane.dispose();
      voidMaterial.dispose();
      rimMaterial.dispose();
      dirt.geometry.dispose();
      dirt.material.dispose();
      dirt.dispose();
      glow.dispose();
      parent.remove(root);
    }
  };
}

// studio/src/vfx/abilities/createAbilityVfx.ts
function createAbilityVfx(actor, sockets, textures) {
  const root = new T21.Group();
  root.name = "EquipmentIndependentAbilityVfx";
  actor.add(root);
  root.visible = false;
  root.matrixAutoUpdate = false;
  const generic = new T21.Group();
  root.add(generic);
  const particles = createAbilityParticles(generic), shapes = createAbilityShapes(generic), atmosphere = createAbilityAtmosphere(generic, textures);
  const signatures = createSignatureSpells(root, textures), ranger = createRangerEffects(root), chain = createChainLightning(root);
  const meteor = createMeteorEffect(root, textures), accents = createActionAccents(root), targets = createTrainingTargets(root);
  const melee = createMeasuredAttackTrail(root);
  const summons = createGroundSummon(root, textures);
  const castWorld = new T21.Matrix4(), castInverse = new T21.Matrix4();
  const origin = new T21.Vector3(), releaseOrigin = new T21.Vector3(), target = new T21.Vector3();
  let current = null, seed = 1;
  function readHand(out) {
    sockets.hand(out);
    actor.localToWorld(out);
    out.applyMatrix4(castInverse);
  }
  return {
    begin(ability) {
      current = ability;
      root.visible = true;
      signatures.reset();
      melee.reset();
      summons.reset();
      actor.updateWorldMatrix(true, false);
      castWorld.copy(actor.matrixWorld);
      castInverse.copy(castWorld).invert();
      root.matrix.identity();
      root.matrixWorldNeedsUpdate = true;
      seed = Array.from(ability.id).reduce((value, c) => value + c.charCodeAt(0), 1);
      readHand(origin);
      releaseOrigin.copy(origin);
    },
    captureRelease() {
      readHand(releaseOrigin);
    },
    captureMotionSample(index) {
      if (sockets.strikeTip) {
        sockets.strikeTip(origin);
        actor.localToWorld(origin);
        origin.applyMatrix4(castInverse);
      } else readHand(origin);
      melee.capture(index, origin);
    },
    sample(time) {
      if (!current) return;
      actor.updateWorldMatrix(true, false);
      root.matrix.copy(actor.matrixWorld).invert().multiply(castWorld);
      root.matrixWorldNeedsUpdate = true;
      root.updateWorldMatrix(true, true);
      const timing = abilityTiming(current), family = current.visual.family;
      if (time < timing.release) readHand(origin);
      else origin.copy(releaseOrigin);
      const distant = ["projectile", "volley", "lightning", "portal", "drain", "meteor", "mark"].includes(family);
      target.set(0, ["projectile", "lightning", "drain", "mark"].includes(family) ? 1.05 : 0.035, distant ? 3 : family === "slash" ? 0.85 : 0);
      if (current.id === "lunge") target.set(0, 1.1, 2.7);
      if (current.id === "snare") target.set(-0.13, 0.055, 0.48);
      if (current.id === "volley") target.y = 0.04;
      if (summonKind(current.id)) target.set(0.85, 0, 2.1);
      sockets.target?.(current, target);
      root.visible = time < timing.duration;
      targets.sample(current, time, timing.release);
      const signature = signatures.sample(current.id, time, timing.release, origin);
      ranger.sample(current, time, timing.release, origin, target);
      chain.sample(current.id === "chain-lightning", time, timing.release, origin);
      meteor.sample(current.id === "meteor", time, timing.release, target);
      accents.sample(current, time, timing.release, target, origin);
      const summoning = summons.sample(current.id, time, timing.release, target);
      melee.sample(["slash", "impact"].includes(family), time, timing.release + timing.recovery, current.visual.accent);
      generic.visible = !signature && !summoning && current.visual.pose !== "bow" && !["snare", "beast-call", "blink", "shadowstep", "disengage", "chain-lightning", "meteor", "hunters-mark"].includes(current.id);
      if (generic.visible) {
        particles.update(current.visual, time, timing.release, origin, target, seed);
        shapes.update(current, time, timing.release, origin, target);
        atmosphere.sample(current, time, timing.release, origin, target);
      }
    },
    reset() {
      current = null;
      root.visible = false;
      signatures.reset();
      summons.reset();
    },
    dispose() {
      particles.dispose();
      shapes.dispose();
      atmosphere.dispose();
      signatures.dispose();
      ranger.dispose();
      chain.dispose();
      meteor.dispose();
      accents.dispose();
      targets.dispose();
      melee.dispose();
      summons.dispose();
      actor.remove(root);
    }
  };
}

// studio/src/vfx/createElementalSpellVfx.ts
import * as THREE30 from "three";

// studio/src/vfx/spells/createSpellSequenceDirector.ts
import * as THREE29 from "three";
function createSpellSequenceDirector(createEffect, options) {
  const slots = Array.from({ length: options.capacity }, (_, index) => {
    const effect = createEffect();
    if (index) effect.root.name = `${options.residualPrefix}${index}`;
    return { effect, age: -1 };
  });
  let active = -1;
  let wasCasting = false;
  let previousTime = -1;
  const candidatePosition = new THREE29.Vector3();
  function reset() {
    for (const slot of slots) {
      slot.effect.reset();
      slot.age = -1;
    }
    active = -1;
    wasCasting = false;
    previousTime = -1;
  }
  return {
    reset,
    update(casting, time, delta) {
      if (delta === void 0) {
        reset();
        if (casting) {
          slots[0].effect.update(time);
          slots[0].age = time;
          active = 0;
        }
        wasCasting = casting;
        previousTime = time;
        return;
      }
      const step = Number.isFinite(delta) ? THREE29.MathUtils.clamp(delta, 0, 0.1) : 0;
      const newCast = casting && (!wasCasting || time < previousTime - 1e-5);
      if (newCast) {
        if (active >= 0 && slots[active].age >= options.release) slots[active].effect.stopEmission?.();
        if (active >= 0 && slots[active].age < options.release) {
          slots[active].effect.reset();
          slots[active].age = -1;
        }
        active = slots.findIndex((slot) => slot.age < 0);
        if (active < 0) {
          active = 0;
          for (let i = 1; i < slots.length; i++) if (slots[i].age > slots[active].age) active = i;
        }
        slots[active].effect.reset();
        slots[active].age = time;
      }
      if (!casting && wasCasting && active >= 0) {
        if (slots[active].age < options.release) {
          slots[active].effect.reset();
          slots[active].age = -1;
        } else slots[active].effect.stopEmission?.();
        active = -1;
      }
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.age < 0) continue;
        slot.age = casting && i === active ? time : slot.age + step;
        if (slot.age >= options.end) {
          slot.effect.reset();
          slot.age = -1;
        } else slot.effect.update(slot.age);
      }
      wasCasting = casting;
      previousTime = time;
    },
    samplePresentation(worldPosition) {
      let strength = 0;
      for (const slot of slots) {
        const value = slot.effect.samplePresentation(candidatePosition);
        if (value > strength) {
          strength = value;
          worldPosition.copy(candidatePosition);
        }
      }
      return strength;
    },
    dispose() {
      for (const slot of slots) slot.effect.dispose();
    }
  };
}

// studio/src/vfx/spells/createFireballDirector.ts
function createFireballDirector(context) {
  return createSpellSequenceDirector(() => createFireballVfx(context), {
    capacity: 3,
    release: FIREBALL_RELEASE,
    end: FIREBALL_END,
    residualPrefix: "FireballResidual"
  });
}

// studio/src/vfx/createElementalSpellVfx.ts
function createElementalSpellVfx(actor, sockets, options = {}) {
  const context = { ...createSpellEffectContext(actor, sockets), ...options };
  const sequences = [
    { id: "fireball", director: createFireballDirector(context) },
    { id: "lightning", director: createSpellSequenceDirector(() => createLightningVfx(context), {
      capacity: 2,
      release: SPELL_MOTIONS.lightning.release[0],
      end: LIGHTNING_END,
      residualPrefix: "LightningResidual"
    }) },
    { id: "energy-missiles", director: createSpellSequenceDirector(() => createEnergyMissilesVfx(context), {
      capacity: 2,
      release: SPELL_MOTIONS["energy-missiles"].release[0],
      end: ENERGY_MISSILES_END,
      residualPrefix: "EnergyMissilesResidual"
    }) }
  ];
  const healing2 = createHealingVfx(context);
  const candidate = new THREE30.Vector3();
  return {
    update(move, normalizedTime, deltaSeconds) {
      const progress = THREE30.MathUtils.clamp(normalizedTime, 0, 1);
      for (const { id, director } of sequences) {
        director.update(move === id, progress * SPELL_MOTIONS[id].duration, deltaSeconds);
      }
      healing2.root.visible = false;
      if (move === "healing") healing2.update(progress * SPELL_MOTIONS.healing.duration);
    },
    samplePresentation(worldPosition) {
      let strength = 0;
      for (const { director } of sequences) {
        const value = director.samplePresentation(candidate);
        if (value > strength) {
          strength = value;
          worldPosition.copy(candidate);
        }
      }
      return strength;
    },
    reset() {
      for (const { director } of sequences) director.reset();
      healing2.root.visible = false;
    },
    dispose() {
      for (const { director } of sequences) director.dispose();
      healing2.dispose();
    }
  };
}

// studio/src/vfx/createSpellOrb.ts
import * as THREE31 from "three";
function createSpellOrb(parent) {
  const root = new THREE31.Group();
  root.name = "SpellOrb";
  root.visible = false;
  parent.add(root);
  const coreGeometry = new THREE31.IcosahedronGeometry(0.085, 2);
  const coreMaterial = enableSpellBloom(new THREE31.MeshBasicMaterial({
    color: "#b9ffe0",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE31.AdditiveBlending
  }));
  const core = new THREE31.Mesh(coreGeometry, coreMaterial);
  core.name = "SpellOrbCore";
  const shellGeometry = new THREE31.IcosahedronGeometry(0.125, 1);
  const shellMaterial = enableSpellBloom(new THREE31.MeshBasicMaterial({
    color: "#35ff91",
    wireframe: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE31.AdditiveBlending
  }));
  const shell = new THREE31.Mesh(shellGeometry, shellMaterial);
  shell.name = "SpellOrbShell";
  const light = new THREE31.PointLight("#50ff9d", 0, 2.4, 2);
  root.add(core, shell, light);
  return {
    root,
    update(move, normalizedTime) {
      const casting = move === "cast";
      const opacity = casting ? spellOrbOpacity(normalizedTime) : 0;
      root.visible = opacity > 1e-3;
      if (!root.visible) return;
      sampleSpellOrbLocalPosition(normalizedTime, root.position);
      const scale = spellOrbScale(normalizedTime);
      root.scale.setScalar(scale);
      coreMaterial.opacity = opacity * 0.96;
      shellMaterial.opacity = opacity * 0.56;
      shell.rotation.set(normalizedTime * Math.PI * 1.4, normalizedTime * Math.PI * 2.2, normalizedTime * Math.PI * 0.7);
      light.intensity = opacity * (2.8 + scale * 2.2);
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      parent.remove(root);
      coreGeometry.dispose();
      shellGeometry.dispose();
      coreMaterial.dispose();
      shellMaterial.dispose();
      light.dispose();
    }
  };
}

// studio/src/vfx/spells/loadSpellTextures.ts
import * as THREE32 from "three";
async function loadSpellTextures() {
  const loader = new THREE32.TextureLoader();
  const results = await Promise.allSettled([
    loader.loadAsync("/vfx/spell-fire-explosion-atlas.png"),
    loader.loadAsync("/vfx/spell-smoke-atlas.png")
  ]);
  const [fireResult, smokeResult] = results;
  if (fireResult.status !== "fulfilled" || smokeResult.status !== "fulfilled") {
    for (const result of results) if (result.status === "fulfilled") result.value.dispose();
    throw fireResult.status === "rejected" ? fireResult.reason : smokeResult.status === "rejected" ? smokeResult.reason : new Error("Spell textures unavailable.");
  }
  const fire = fireResult.value;
  const smoke = smokeResult.value;
  for (const texture of [fire, smoke]) {
    texture.colorSpace = THREE32.SRGBColorSpace;
    texture.minFilter = THREE32.LinearFilter;
    texture.magFilter = THREE32.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = texture.wrapT = THREE32.ClampToEdgeWrapping;
  }
  return { fire, smoke, dispose() {
    fire.dispose();
    smoke.dispose();
  } };
}

// studio/src/scene/createSpellPostprocessing.ts
import * as THREE34 from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// studio/src/scene/SelectiveSpellBloomPass.ts
import * as THREE33 from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// studio/src/scene/createSpellBloomSelection.ts
function createSpellBloomSelection(scene) {
  const saved = /* @__PURE__ */ new Map();
  let hasEmission = false;
  function inspectMaterial(material) {
    if (!material.visible || saved.has(material)) return;
    saved.set(material, material.colorWrite);
    if (material.userData.spellBloom === true && material.colorWrite) hasEmission = true;
    else material.colorWrite = false;
  }
  function inspect(object) {
    const material = object.material;
    if (Array.isArray(material)) for (const item of material) inspectMaterial(item);
    else if (material) inspectMaterial(material);
  }
  return {
    render(draw) {
      hasEmission = false;
      try {
        scene.traverseVisible(inspect);
        if (hasEmission) draw();
        return hasEmission;
      } finally {
        for (const [material, colorWrite] of saved) material.colorWrite = colorWrite;
        saved.clear();
      }
    }
  };
}

// studio/src/scene/SelectiveSpellBloomPass.ts
var SelectiveSpellBloomPass = class extends Pass {
  constructor(scene, camera, resolutionScale = 1) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.resolutionScale = resolutionScale;
    this.selection = createSpellBloomSelection(scene);
    this.source.texture.name = "Spell bloom emission";
    this.combine.uniforms.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
  }
  source = new THREE33.WebGLRenderTarget(1, 1, { type: THREE33.HalfFloatType });
  bloom = new UnrealBloomPass(new THREE33.Vector2(1, 1), 0.52, 0.34, 0.65);
  selection;
  clearColor = new THREE33.Color();
  combine = new THREE33.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { tBase: { value: null }, tBloom: { value: null }, uBloomActive: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tBase;uniform sampler2D tBloom;uniform float uBloomActive;varying vec2 vUv;
      void main(){vec4 base=texture2D(tBase,vUv);gl_FragColor=vec4(base.rgb+texture2D(tBloom,vUv).rgb*uBloomActive,base.a);}`
  });
  quad = new FullScreenQuad(this.combine);
  renderer = null;
  drawEmission = () => {
    const renderer = this.renderer;
    renderer.setRenderTarget(this.source);
    renderer.clear(true, true, true);
    renderer.render(this.scene, this.camera);
  };
  render(renderer, writeBuffer, readBuffer, delta) {
    const background = this.scene.background;
    const oldTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    let active = false;
    try {
      this.renderer = renderer;
      this.scene.background = null;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0, 0);
      active = this.selection.render(this.drawEmission);
    } finally {
      this.scene.background = background;
      renderer.setClearColor(this.clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.setRenderTarget(oldTarget);
      this.renderer = null;
    }
    if (active) this.bloom.render(renderer, writeBuffer, this.source, delta, false);
    this.combine.uniforms.tBase.value = readBuffer.texture;
    this.combine.uniforms.uBloomActive.value = active ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  setSize(width, height) {
    const scaledWidth = Math.max(1, Math.round(width * this.resolutionScale));
    const scaledHeight = Math.max(1, Math.round(height * this.resolutionScale));
    this.source.setSize(scaledWidth, scaledHeight);
    this.bloom.setSize(scaledWidth, scaledHeight);
  }
  dispose() {
    this.source.dispose();
    this.bloom.dispose();
    this.combine.dispose();
    this.quad.dispose();
  }
};

// studio/src/scene/createSpellPostprocessing.ts
var DISTORTION_SHADER = {
  name: "LocalizedSpellDistortion",
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE34.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uRadius: { value: 0.14 },
    uAspect: { value: 1 },
    uTime: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uStrength;
    uniform float uRadius;
    uniform float uAspect;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 fromCenter = vUv - uCenter;
      vec2 metric = vec2(fromCenter.x * uAspect, fromCenter.y);
      float distanceFromCenter = length(metric);
      float mask = 1.0 - smoothstep(uRadius * 0.28, uRadius, distanceFromCenter);
      vec2 direction = metric / max(distanceFromCenter, 0.0001);
      float wave = sin(distanceFromCenter * 92.0 - uTime * 15.0) * 0.55
        + sin(distanceFromCenter * 47.0 + uTime * 9.0) * 0.45;
      vec2 offset = direction * wave * mask * uStrength * 0.006;
      offset.x /= uAspect;
      gl_FragColor = texture2D(tDiffuse, clamp(vUv + offset, vec2(0.001), vec2(0.999)));
    }
  `
};
function createSpellPostprocessing(renderer, scene, camera, bloomResolutionScale = 1) {
  const composer = new EffectComposer(renderer);
  let composerPixelRatio = renderer.getPixelRatio();
  composer.setPixelRatio(composerPixelRatio);
  renderer.info.autoReset = false;
  if (renderer.capabilities.isWebGL2) {
    composer.renderTarget1.samples = 2;
    composer.renderTarget2.samples = 2;
  }
  const renderPass = new RenderPass(scene, camera);
  const distortionPass = new ShaderPass(DISTORTION_SHADER);
  const bloomPass = new SelectiveSpellBloomPass(scene, camera, bloomResolutionScale);
  const outputPass = new OutputPass();
  distortionPass.enabled = false;
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(distortionPass);
  composer.addPass(outputPass);
  const worldPosition = new THREE34.Vector3();
  const projectedPosition = new THREE34.Vector3();
  let requestedStrength = 0;
  let requestedRadius = 0.14;
  let enabled = true;
  let elapsedTime = 0;
  function updateDistortion() {
    projectedPosition.copy(worldPosition).project(camera);
    const visible = requestedStrength > 1e-4 && projectedPosition.z >= -1 && projectedPosition.z <= 1 && Math.abs(projectedPosition.x) < 1.3 && Math.abs(projectedPosition.y) < 1.3;
    distortionPass.enabled = visible;
    if (!visible) return;
    distortionPass.uniforms.uCenter.value.set(
      projectedPosition.x * 0.5 + 0.5,
      projectedPosition.y * 0.5 + 0.5
    );
    distortionPass.uniforms.uStrength.value = requestedStrength;
    distortionPass.uniforms.uRadius.value = requestedRadius;
    distortionPass.uniforms.uTime.value = elapsedTime;
  }
  return {
    render(deltaSeconds = 0) {
      renderer.info.reset();
      if (!enabled) {
        renderer.render(scene, camera);
        return;
      }
      const safeDelta = Number.isFinite(deltaSeconds) ? THREE34.MathUtils.clamp(deltaSeconds, 0, 0.05) : 0;
      elapsedTime += safeDelta;
      updateDistortion();
      composer.render(safeDelta);
    },
    setSize(width, height) {
      const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
      const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
      const nextPixelRatio = renderer.getPixelRatio();
      if (Math.abs(composerPixelRatio - nextPixelRatio) > 1e-4) {
        composerPixelRatio = nextPixelRatio;
        composer.setPixelRatio(composerPixelRatio);
      }
      composer.setSize(safeWidth, safeHeight);
      distortionPass.uniforms.uAspect.value = safeWidth / safeHeight;
    },
    setSpellPresentation(value) {
      if (!value) {
        requestedStrength = 0;
        distortionPass.enabled = false;
        return;
      }
      worldPosition.copy(value.position);
      const finitePosition = Number.isFinite(worldPosition.x) && Number.isFinite(worldPosition.y) && Number.isFinite(worldPosition.z);
      requestedStrength = finitePosition && Number.isFinite(value.strength) ? THREE34.MathUtils.clamp(value.strength, 0, 1) : 0;
      requestedRadius = Number.isFinite(value.radius ?? 0.14) ? THREE34.MathUtils.clamp(value.radius ?? 0.14, 0.04, 0.32) : 0.14;
    },
    setEnabled(value) {
      enabled = value;
    },
    dispose() {
      distortionPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    }
  };
}

// studio/src/vfx/createCombatVfx.ts
import * as THREE36 from "three";

// studio/src/vfx/createSwordSweepTrail.ts
import * as THREE35 from "three";
function createSwordSweepTrail(scene, sample2) {
  const capacity = 16;
  const lifetime = 0.1;
  const positions = new Float32Array(capacity * 6);
  const colors = new Float32Array(capacity * 6);
  const ages = new Float32Array(capacity);
  const indices = [];
  for (let i = 0; i < capacity - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE35.BufferGeometry();
  const positionAttribute = new THREE35.BufferAttribute(positions, 3).setUsage(THREE35.DynamicDrawUsage);
  const colorAttribute = new THREE35.BufferAttribute(colors, 3).setUsage(THREE35.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = new THREE35.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE35.AdditiveBlending,
    side: THREE35.DoubleSide
  });
  const ribbon = new THREE35.Mesh(geometry, material);
  ribbon.name = "WhirlwindBladeTrail";
  ribbon.frustumCulled = false;
  ribbon.visible = false;
  scene.add(ribbon);
  const base = new THREE35.Vector3();
  const tip = new THREE35.Vector3();
  const color = new THREE35.Color("#a0ffcf");
  let count = 0;
  let remaining = 0;
  return {
    begin(duration) {
      count = 0;
      remaining = duration;
      ribbon.visible = false;
      geometry.setDrawRange(0, 0);
    },
    update(delta) {
      if (delta <= 0) return;
      for (let i = 0; i < count; i += 1) ages[i] = ages[i] + delta;
      if (remaining > 0 && sample2(base, tip)) {
        if (count === capacity) {
          positions.copyWithin(0, 6);
          ages.copyWithin(0, 1);
          count -= 1;
        }
        base.lerp(tip, 0.3);
        base.toArray(positions, count * 6);
        tip.toArray(positions, count * 6 + 3);
        ages[count] = 0;
        count += 1;
      }
      remaining = Math.max(0, remaining - delta);
      let first = 0;
      while (first < count && ages[first] >= lifetime) first += 1;
      for (let i = first; i < count; i += 1) {
        const strength = (1 - ages[i] / lifetime) ** 2;
        for (let side2 = 0; side2 < 2; side2 += 1) {
          const offset = i * 6 + side2 * 3;
          colors[offset] = color.r * strength;
          colors[offset + 1] = color.g * strength;
          colors[offset + 2] = color.b * strength;
        }
      }
      ribbon.visible = count - first >= 2;
      geometry.setDrawRange(first * 6, Math.max(0, count - first - 1) * 6);
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
    },
    dispose() {
      scene.remove(ribbon);
      geometry.dispose();
      material.dispose();
    }
  };
}

// studio/src/vfx/createCombatVfx.ts
var jade = new THREE36.Color("#36ff93");
var mint = new THREE36.Color("#b6ffdc");
function createCombatVfx(scene, characterRoot, sockets, getWeaponImpactPosition, sampleSwordSegment) {
  const effects = /* @__PURE__ */ new Set();
  const worldPosition = new THREE36.Vector3();
  const swordTrail = sampleSwordSegment ? createSwordSweepTrail(scene, sampleSwordSegment) : void 0;
  const getSocketPosition = (name) => {
    const socket = sockets.get(name);
    if (!socket) return characterRoot.getWorldPosition(new THREE36.Vector3());
    return socket.getWorldPosition(new THREE36.Vector3());
  };
  function addRing(position, options = {}) {
    const radius = options.radius ?? 0.55;
    const material = new THREE36.MeshBasicMaterial({
      color: jade,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE36.AdditiveBlending
    });
    const ring = new THREE36.Mesh(new THREE36.TorusGeometry(radius, 0.013, 8, 64), material);
    ring.position.copy(position);
    if (options.flat ?? true) ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(0.2);
    scene.add(ring);
    effects.add({
      age: 0,
      duration: options.duration ?? 0.58,
      update(progress) {
        const eased = 1 - (1 - progress) ** 3;
        ring.scale.setScalar(0.2 + eased * 1.45);
        material.opacity = (1 - progress) ** 1.7 * 0.88;
      },
      dispose() {
        scene.remove(ring);
        ring.geometry.dispose();
        material.dispose();
      }
    });
  }
  function addBurst(position, count = 26, scale = 1, duration = 0.68) {
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + index % 3 * 0.19;
      const lift = 0.12 + index * 7 % 11 / 30;
      velocities.push(new THREE36.Vector3(Math.cos(angle) * (0.32 + index % 5 * 0.07), lift, Math.sin(angle) * (0.32 + index % 4 * 0.08)).multiplyScalar(scale));
    }
    const geometry = new THREE36.BufferGeometry();
    geometry.setAttribute("position", new THREE36.BufferAttribute(positions, 3));
    const material = new THREE36.PointsMaterial({
      color: mint,
      size: 0.035 * scale,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE36.AdditiveBlending
    });
    const points = new THREE36.Points(geometry, material);
    points.position.copy(position);
    scene.add(points);
    effects.add({
      age: 0,
      duration,
      update(progress) {
        const attribute = geometry.getAttribute("position");
        for (let index = 0; index < velocities.length; index += 1) {
          const velocity = velocities[index];
          if (!velocity) continue;
          const elapsed = progress * duration;
          attribute.setXYZ(index, velocity.x * elapsed, velocity.y * elapsed - 1.7 * elapsed * elapsed, velocity.z * elapsed);
        }
        attribute.needsUpdate = true;
        material.opacity = (1 - progress) ** 1.4;
      },
      dispose() {
        scene.remove(points);
        geometry.dispose();
        material.dispose();
      }
    });
  }
  function trigger(type) {
    characterRoot.updateWorldMatrix(true, true);
    characterRoot.getWorldPosition(worldPosition);
    switch (type) {
      case "jump-launch":
        addRing(worldPosition.clone().setY(0.025), { radius: 0.38, duration: 0.42 });
        break;
      case "jump-land":
        addRing(worldPosition.clone().setY(0.025), { radius: 0.72, duration: 0.74 });
        addBurst(worldPosition.clone().setY(0.08), 18, 0.75);
        break;
      case "dodge-start":
        addRing(worldPosition.clone().setY(0.03), { radius: 0.45, duration: 0.38 });
        break;
      case "swing-trail":
        swordTrail?.begin(0.16);
        break;
      case "swing-impact":
        addBurst(getWeaponImpactPosition?.() ?? getSocketPosition("Socket_Weapon_Right"), 22, 0.85);
        break;
      case "whirlwind-start":
        swordTrail?.begin(WHIRLWIND_TIMING.spinEnd - WHIRLWIND_TIMING.windupEnd);
        addRing(worldPosition.clone().setY(0.04), { radius: 0.72, duration: 0.22 });
        break;
      case "whirlwind-pulse":
        addRing(worldPosition.clone().setY(0.05), { radius: 1.05, duration: 0.26 });
        addBurst(getWeaponImpactPosition?.() ?? getSocketPosition("Socket_Weapon_Right"), 18, 1.25, 0.22);
        break;
      case "hit-react":
        addBurst(worldPosition.clone().add(new THREE36.Vector3(0, 1.2, 0)), 16, 0.65);
        break;
    }
  }
  function update(delta) {
    swordTrail?.update(delta);
    for (const effect of effects) {
      effect.age += delta;
      const progress = THREE36.MathUtils.clamp(effect.age / effect.duration, 0, 1);
      effect.update(progress, delta);
      if (progress < 1) continue;
      effect.dispose();
      effects.delete(effect);
    }
  }
  return {
    trigger,
    update,
    dispose() {
      swordTrail?.dispose();
      for (const effect of effects) effect.dispose();
      effects.clear();
    }
  };
}
export {
  ABILITIES,
  ABILITY_BY_ID,
  ABILITY_SCHOOLS,
  ATTACK_SAMPLES,
  ELEMENTAL_SPELL_IDS,
  MOVE_BY_ID,
  MOVE_CATALOG,
  SPELL_MOTIONS,
  TWO_HANDED_STRIKE_DURATION,
  abilityTiming,
  actionPhase,
  applyTwoHandedSwordPose,
  createAbilityPose,
  createAbilityRigCapture,
  createAbilityVfx,
  createActionTravel,
  createAuthoredAnimationLibrary,
  createCombatVfx,
  createElementalSpellPose,
  createElementalSpellVfx,
  createMeasuredAttackTrail,
  createProceduralClips,
  createSpellOrb,
  createSpellPostprocessing,
  createSpellcastingPose,
  createTrainingShield,
  createTrainingSword,
  createTwoHandedWeaponController,
  isElementalSpell,
  isMagicSchool,
  loadAuthoredAnimationLibrary,
  loadSpellTextures,
  mergeAnimationLibraries,
  sampleActionTravel,
  usesBow
};
