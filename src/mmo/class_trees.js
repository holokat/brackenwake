// Class-owned ability nodes and live, original modifiers. Ability IDs remain
// stable for saves and runtime casting; modifier IDs are class-tree allocations.
import { MODIFIERS } from './talent_modifiers.js';

const LIVE_LEVELS = {
  magicArrow:1, lightning:6, blink:10, eldritchBolt:14, hex:20, manaShield:26,
  chainLightning:42, arcaneMastery:62, rift:82, transmute:50, fireball:2, spellPlague:42, meteor:62,
  iceShard:2, stoneSkin:10, frostNova:18, ward:42, elementalKin:62, powerStrike:1, rend:6, lunge:14,
  crushingBlow:42, sweep:26, whirlwind:14, battleCry:26, berserk:62, shieldBash:2, disarm:14, riposte:26, leapSlam:42,
  dualStrike:1, deepCut:6, poisonBlade:14, kidneyShot:26, finishingStrike:62, throwingKnife:2, evasion:14,
  exposeWeakness:42, hide:1, backstab:6, pickPocket:10, shadowstep:26, vanish:42, aimedShot:1, doubleShot:6,
  piercingArrow:26, volley:62, snare:2, cripplingShot:14, disengage:26, huntersMark:2, fleetFoot:14, beastCall:42,
  heal:1, cleanse:6, greaterHeal:18, layOnHands:62, bless:10, sanctuary:62, consecrateWeapon:6, smite:14, resurrect:42,
  lifeDrain:6, curseOfWeakness:14, fear:26, boneSpear:42,
};
const MODIFIER_LEVELS = [2, 10, 18, 26, 34, 42, 50, 62, 74];
const MODIFIER_TREE_POINTS = [0, 2, 4, 6, 8, 10, 12, 15, 18];
const nodeId = (classId, specId, id) => `${classId}.${specId}.${id}`;
const readableId = (id) => String(id || '').replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
const percent = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 1000) / 10}%`;
const decimal = (value) => `${value > 0 ? '+' : ''}${value}`;
const CHANGE_DESCRIPTIONS = {
  damagePct: (value) => `damage ${percent(value)}`,
  dotDamagePct: (value) => `damage over time ${percent(value)}`,
  healingPct: (value) => `healing ${percent(value)}`,
  costPct: (value) => `cost ${percent(value)}`,
  cooldownPct: (value) => `cooldown ${percent(value)}`,
  castTimePct: (value) => `cast time ${percent(value)}`,
  durationPct: (value) => `duration ${percent(value)}`,
  rangeFlat: (value) => `range ${decimal(value)}`,
  radiusFlat: (value) => `radius ${decimal(value)}`,
  moveDistanceFlat: (value) => `movement distance ${decimal(value)}`,
  controlDurationFlat: (value) => `control duration ${decimal(value)}`,
  slowFractionFlat: (value) => `slow strength ${percent(value)}`,
  markBonusFlat: (value) => `mark bonus ${percent(value)}`,
  absorbEfficiencyPct: (value) => `absorb efficiency ${percent(value)}`,
  leechFractionFlat: (value) => `leech ${percent(value)}`,
  spellCrit: (value) => `spell critical chance ${percent(value)}`,
  runSpeed: (value) => `movement speed ${percent(value)}`,
  armourRatingFlat: (value) => `armour rating ${decimal(value)}`,
  parryCounterMult: (value) => `parry counter damage ${percent(value)}`,
  healthPct: (value) => `health ${percent(value)}`,
};
function conditionDescription(when) {
  if (!when) return '';
  if (when.kind === 'all') return when.conditions.map(conditionDescription).filter(Boolean).join(' and ');
  if (when.kind === 'ownDot') return `while ${readableId(when.abilityId)} affects the target`;
  if (when.kind === 'selfEffect') return `while ${readableId(when.abilityId)} is active`;
  if (when.kind === 'ownerMark') return `while the owner’s ${readableId(when.abilityId)} affects the target`;
  return {
    targetControlled: 'against controlled targets', targetBelowHalf: 'against targets below half health',
    selfBelowHalf: 'below half health', hasShield: 'while shielded',
  }[when.kind] || '';
}
function modifierDescription(node) {
  const details = node.effects.map((entry) => {
    const target = entry.abilityIds?.map(readableId).join(' and ') || (entry.type === 'actor' ? 'You' : 'Your summon');
    const changes = Object.entries(entry.changes).map(([key, value]) => CHANGE_DESCRIPTIONS[key](value)).join(', ');
    const when = conditionDescription(entry.when);
    return `${target}: ${changes}${when ? ` ${when}` : ''}.`;
  }).join(' ');
  return `${node.capstone ? 'At rank 1' : 'Per rank'}: ${details}`;
}

const SOURCE_TREES = [
  {
    "id": "mage",
    "name": "Mage",
    "branches": [
      {
        "id": "arcane",
        "name": "Arcane",
        "description": "Build a spell sequence, choose when to spend mana, and control where a fight happens.",
        "abilities": [
          {
            "id": "magicArrow",
            "requires": []
          },
          {
            "id": "lightning",
            "requires": [
              "magicArrow"
            ]
          },
          {
            "id": "blink",
            "requires": [
              "magicArrow"
            ]
          },
          {
            "id": "eldritchBolt",
            "requires": [
              "lightning"
            ]
          },
          {
            "id": "hex",
            "requires": [
              "blink"
            ]
          },
          {
            "id": "manaShield",
            "requires": [
              "blink"
            ]
          },
          {
            "id": "chainLightning",
            "requires": [
              "lightning"
            ]
          },
          {
            "id": "arcaneMastery",
            "requires": [
              "eldritchBolt"
            ]
          },
          {
            "id": "rift",
            "requires": [
              "chainLightning",
              "hex"
            ]
          },
          {
            "id": "transmute",
            "requires": [
              "hex"
            ]
          }
        ]
      },
      {
        "id": "fire",
        "name": "Fire",
        "description": "Maintain a burn, gather enemies, and commit to a telegraphed burst.",
        "abilities": [
          {
            "id": "fireball",
            "requires": []
          },
          {
            "id": "spellPlague",
            "requires": [
              "fireball"
            ]
          },
          {
            "id": "meteor",
            "requires": [
              "fireball"
            ]
          }
        ]
      },
      {
        "id": "frost",
        "name": "Frost",
        "description": "Control pursuit, prepare a frozen target, and trade movement for protection.",
        "abilities": [
          {
            "id": "iceShard",
            "requires": []
          },
          {
            "id": "stoneSkin",
            "requires": [
              "iceShard"
            ]
          },
          {
            "id": "frostNova",
            "requires": [
              "iceShard"
            ]
          },
          {
            "id": "ward",
            "requires": [
              "stoneSkin"
            ]
          },
          {
            "id": "elementalKin",
            "requires": [
              "ward"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "warrior",
    "name": "Warrior",
    "branches": [
      {
        "id": "arms",
        "name": "Arms",
        "description": "Choose a weapon approach and time deliberate strikes around wounds and openings.",
        "abilities": [
          {
            "id": "powerStrike",
            "requires": []
          },
          {
            "id": "rend",
            "requires": [
              "powerStrike"
            ]
          },
          {
            "id": "lunge",
            "requires": [
              "powerStrike"
            ]
          },
          {
            "id": "crushingBlow",
            "requires": [
              "powerStrike"
            ]
          },
          {
            "id": "sweep",
            "requires": [
              "powerStrike"
            ]
          }
        ]
      },
      {
        "id": "fury",
        "name": "Fury",
        "description": "Sustain pressure and choose how much defense to give up during a burst.",
        "abilities": [
          {
            "id": "whirlwind",
            "requires": []
          },
          {
            "id": "battleCry",
            "requires": [
              "whirlwind"
            ]
          },
          {
            "id": "berserk",
            "requires": [
              "whirlwind"
            ]
          }
        ]
      },
      {
        "id": "protection",
        "name": "Protection",
        "description": "Block a dangerous hit, interrupt its follow-up, and protect an ally’s position.",
        "abilities": [
          {
            "id": "shieldBash",
            "requires": []
          },
          {
            "id": "disarm",
            "requires": [
              "shieldBash"
            ]
          },
          {
            "id": "riposte",
            "requires": [
              "shieldBash"
            ]
          },
          {
            "id": "leapSlam",
            "requires": [
              "shieldBash"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "rogue",
    "name": "Rogue",
    "branches": [
      {
        "id": "assassination",
        "name": "Assassination",
        "description": "Prepare poison and wounds, then spend the opening on a decisive finish.",
        "abilities": [
          {
            "id": "dualStrike",
            "requires": []
          },
          {
            "id": "deepCut",
            "requires": [
              "dualStrike"
            ]
          },
          {
            "id": "poisonBlade",
            "requires": [
              "dualStrike"
            ]
          },
          {
            "id": "kidneyShot",
            "requires": [
              "deepCut"
            ]
          },
          {
            "id": "finishingStrike",
            "requires": [
              "deepCut",
              "poisonBlade"
            ]
          }
        ]
      },
      {
        "id": "combat",
        "name": "Combat",
        "description": "Fight in the open, manage an exposed target, and turn a dodge into pressure.",
        "abilities": [
          {
            "id": "throwingKnife",
            "requires": []
          },
          {
            "id": "evasion",
            "requires": [
              "throwingKnife"
            ]
          },
          {
            "id": "exposeWeakness",
            "requires": [
              "throwingKnife"
            ]
          }
        ]
      },
      {
        "id": "subtlety",
        "name": "Subtlety",
        "description": "Arrange the approach, choose the opening target, and leave before the return hit.",
        "abilities": [
          {
            "id": "hide",
            "requires": []
          },
          {
            "id": "backstab",
            "requires": [
              "hide"
            ]
          },
          {
            "id": "pickPocket",
            "requires": [
              "hide"
            ]
          },
          {
            "id": "shadowstep",
            "requires": [
              "backstab"
            ]
          },
          {
            "id": "vanish",
            "requires": [
              "hide"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "ranger",
    "name": "Ranger",
    "branches": [
      {
        "id": "marksmanship",
        "name": "Marksmanship",
        "description": "Prepare a firing position and choose precise pressure or a committed area volley.",
        "abilities": [
          {
            "id": "aimedShot",
            "requires": []
          },
          {
            "id": "doubleShot",
            "requires": [
              "aimedShot"
            ]
          },
          {
            "id": "piercingArrow",
            "requires": [
              "aimedShot"
            ]
          },
          {
            "id": "volley",
            "requires": [
              "doubleShot"
            ]
          }
        ]
      },
      {
        "id": "survival",
        "name": "Survival",
        "description": "Arrange a trap, control pursuit, and make distance useful rather than permanent.",
        "abilities": [
          {
            "id": "snare",
            "requires": []
          },
          {
            "id": "cripplingShot",
            "requires": [
              "snare"
            ]
          },
          {
            "id": "disengage",
            "requires": [
              "snare"
            ]
          }
        ]
      },
      {
        "id": "beastmastery",
        "name": "Beast mastery",
        "description": "Fight beside a called beast and spend attention on its position and survival.",
        "abilities": [
          {
            "id": "huntersMark",
            "requires": []
          },
          {
            "id": "fleetFoot",
            "requires": [
              "huntersMark"
            ]
          },
          {
            "id": "beastCall",
            "requires": [
              "huntersMark"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "paladin",
    "name": "Paladin",
    "branches": [
      {
        "id": "holy",
        "name": "Holy",
        "description": "Deliver direct healing while keeping a chosen ally ready for the next hit.",
        "abilities": [
          {
            "id": "heal",
            "requires": []
          },
          {
            "id": "cleanse",
            "requires": [
              "heal"
            ]
          },
          {
            "id": "greaterHeal",
            "requires": [
              "heal"
            ]
          },
          {
            "id": "layOnHands",
            "requires": [
              "greaterHeal"
            ]
          }
        ]
      },
      {
        "id": "protection",
        "name": "Protection",
        "description": "Place a defended area and protect allies through a shield and holy support.",
        "abilities": [
          {
            "id": "shieldBash",
            "requires": []
          },
          {
            "id": "bless",
            "requires": [
              "shieldBash"
            ]
          },
          {
            "id": "riposte",
            "requires": [
              "shieldBash"
            ]
          },
          {
            "id": "ward",
            "requires": [
              "bless"
            ]
          },
          {
            "id": "sanctuary",
            "requires": [
              "ward"
            ]
          }
        ]
      },
      {
        "id": "retribution",
        "name": "Retribution",
        "description": "Alternate melee commitment and holy attacks to prepare a costly finishing strike.",
        "abilities": [
          {
            "id": "powerStrike",
            "requires": []
          },
          {
            "id": "consecrateWeapon",
            "requires": [
              "powerStrike"
            ]
          },
          {
            "id": "smite",
            "requires": [
              "powerStrike"
            ]
          },
          {
            "id": "battleCry",
            "requires": [
              "consecrateWeapon"
            ]
          },
          {
            "id": "crushingBlow",
            "requires": [
              "powerStrike"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "priest",
    "name": "Priest",
    "branches": [
      {
        "id": "holy",
        "name": "Holy",
        "description": "Prepare sustained healing, respond to wounds, and spend attention across allies.",
        "abilities": [
          {
            "id": "heal",
            "requires": []
          },
          {
            "id": "cleanse",
            "requires": [
              "heal"
            ]
          },
          {
            "id": "greaterHeal",
            "requires": [
              "heal"
            ]
          },
          {
            "id": "resurrect",
            "requires": [
              "greaterHeal"
            ]
          },
          {
            "id": "layOnHands",
            "requires": [
              "greaterHeal"
            ]
          }
        ]
      },
      {
        "id": "discipline",
        "name": "Discipline",
        "description": "Prepare mitigation, use a direct holy attack, and decide when offense supports recovery.",
        "abilities": [
          {
            "id": "smite",
            "requires": []
          },
          {
            "id": "bless",
            "requires": [
              "smite"
            ]
          },
          {
            "id": "manaShield",
            "requires": [
              "smite"
            ]
          },
          {
            "id": "ward",
            "requires": [
              "bless"
            ]
          },
          {
            "id": "sanctuary",
            "requires": [
              "ward"
            ]
          }
        ]
      },
      {
        "id": "shadow",
        "name": "Shadow",
        "description": "Sustain a draining target, control dangerous enemies, and choose how much health to risk.",
        "abilities": [
          {
            "id": "eldritchBolt",
            "requires": []
          },
          {
            "id": "lifeDrain",
            "requires": [
              "eldritchBolt"
            ]
          },
          {
            "id": "curseOfWeakness",
            "requires": [
              "lifeDrain"
            ]
          },
          {
            "id": "fear",
            "requires": [
              "lifeDrain"
            ]
          },
          {
            "id": "boneSpear",
            "requires": [
              "lifeDrain"
            ]
          },
          {
            "id": "spellPlague",
            "requires": [
              "curseOfWeakness"
            ]
          }
        ]
      }
    ]
  }
];

function branchNodes(classId, spec) {
  const modifiers = MODIFIERS[`${classId}.${spec.id}`];
  if (!Array.isArray(modifiers) || modifiers.length !== 10) throw new Error(`class trees: ${classId}.${spec.id} needs nine modifiers and one capstone`);
  const abilities = spec.abilities.map((entry) => ({
    id: entry.id, abilityId: entry.id, name: entry.id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    kind: 'ability', status: 'live', level: classId === 'priest' && entry.id === 'eldritchBolt' ? 1
      : classId === 'priest' && entry.id === 'smite' ? 2 : LIVE_LEVELS[entry.id], requires: entry.requires,
  }));
  const entries = [...abilities, ...modifiers.map((entry, index) => ({
    ...entry, level: entry.level || (entry.capstone ? 82 : MODIFIER_LEVELS[index]),
    requiredTreePoints: entry.requiredTreePoints ?? (entry.capstone ? 25 : MODIFIER_TREE_POINTS[index]),
    choiceGroup: entry.capstone ? `${classId}.capstone` : undefined,
    iconAbilityId: entry.effects.find((effect) => effect.abilityIds?.length)?.abilityIds[0] || null,
    description: modifierDescription(entry),
  }))];
  const byLocalId = Object.fromEntries(entries.map((node) => [node.id, node]));
  const requiredLevel = (node, seen = new Set()) => {
    if (seen.has(node.id)) throw new Error(`class trees: cycle at ${classId}.${spec.id}.${node.id}`);
    return Math.max(node.level, ...node.requires.map((id) => {
      const required = byLocalId[id];
      if (!required) throw new Error(`class trees: ${classId}.${spec.id}.${node.id} requires missing ${id}`);
      return requiredLevel(required, new Set(seen).add(node.id));
    }));
  };
  for (const node of entries) node.level = requiredLevel(node);
  return entries.map((node, index) => ({
    ...node, id: nodeId(classId, spec.id, node.id),
    requires: node.requires.map((required) => nodeId(classId, spec.id, required)),
    row: index ? Math.ceil(index / 2) : 0, column: index ? (index % 2 ? 0 : 2) : 1,
  }));
}

export const CLASS_TREES = SOURCE_TREES.map((tree) => ({
  ...tree, branches: tree.branches.map((spec) => ({ ...spec, nodes: branchNodes(tree.id, spec) })),
}));

export const CLASS_NODES = Object.fromEntries(CLASS_TREES.flatMap((tree) =>
  tree.branches.flatMap((branch) => branch.nodes.map((node) => [node.id, node]))));

const EFFECT_TYPES = new Set(['ability', 'actor', 'summon']);
const CHANGE_KEYS = new Set(['damagePct', 'dotDamagePct', 'healingPct', 'costPct', 'cooldownPct', 'castTimePct', 'durationPct', 'rangeFlat', 'radiusFlat', 'moveDistanceFlat', 'controlDurationFlat', 'slowFractionFlat', 'markBonusFlat', 'absorbEfficiencyPct', 'leechFractionFlat', 'spellCrit', 'runSpeed', 'armourRatingFlat', 'parryCounterMult', 'healthPct']);
function validWhen(when) {
  if (!when) return true;
  if (when.kind === 'all') return Array.isArray(when.conditions) && when.conditions.length > 1 && when.conditions.every(validWhen);
  if (when.kind === 'ownDot' || when.kind === 'selfEffect' || when.kind === 'ownerMark') return typeof when.abilityId === 'string';
  return ['targetControlled', 'targetBelowHalf', 'selfBelowHalf', 'hasShield'].includes(when.kind);
}

/** Fail on a placeholder, malformed effect, or a catalogue that loses player choice. */
export function auditClassCatalogue() {
  const bad = [];
  for (const tree of CLASS_TREES) for (const branch of tree.branches) {
    const modifiers = branch.nodes.filter((node) => node.kind === 'modifier');
    const capstones = modifiers.filter((node) => node.capstone);
    if (modifiers.length !== 10 || capstones.length !== 1) bad.push(`${tree.id}.${branch.id} needs nine modifiers and one capstone`);
    for (const node of branch.nodes) {
      if (node.status !== 'live') bad.push(`${node.id} is not live`);
      if (!['ability', 'modifier'].includes(node.kind)) bad.push(`${node.id} has no node kind`);
      if (node.kind === 'ability' && !node.abilityId) bad.push(`${node.id} has no ability id`);
      if (node.kind !== 'modifier') continue;
      if (node.maxRank !== (node.capstone ? 1 : 3) || node.pointCost !== 1) bad.push(`${node.id} has wrong rank or cost`);
      if (typeof node.description !== 'string' || !node.description.length) bad.push(`${node.id} has no numeric effect description`);
      if (node.capstone && (node.level !== 82 || node.requiredTreePoints !== 25 || node.choiceGroup !== `${tree.id}.capstone`)) bad.push(`${node.id} has no capstone gate`);
      for (const entry of node.effects || []) {
        if (!EFFECT_TYPES.has(entry.type) || !entry.changes || typeof entry.changes !== 'object') bad.push(`${node.id} has invalid effect`);
        if ((entry.type === 'ability' || entry.type === 'summon') && !entry.abilityIds?.length) bad.push(`${node.id} lacks effect ability ids`);
        if (!validWhen(entry.when)) bad.push(`${node.id} has invalid condition`);
        for (const [key, value] of Object.entries(entry.changes || {})) if (!CHANGE_KEYS.has(key) || !Number.isFinite(value)) bad.push(`${node.id} has invalid change ${key}`);
      }
    }
  }
  if (bad.length) throw new Error(`class trees: ${bad.join('; ')}`);
  return { nodes: Object.keys(CLASS_NODES).length, modifiers: Object.values(CLASS_NODES).filter((node) => node.kind === 'modifier').length };
}

auditClassCatalogue();
