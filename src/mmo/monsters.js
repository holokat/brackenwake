// Monsters: every row of `docs/mmo/05-WORLD-CONTENT.md`, where they live, and
// the rules that turn a place and a clock into a spawn. Pure data and pure
// functions: no THREE, no DOM, no imports. Every roll takes an `rng` so a
// server and a client can agree, which is what `00-OVERVIEW.md` asks for.
//
// The document is the source of truth for hp, damage, speed, hit, def, AR, run
// and aggro. Where a value is not in the document it is derived by a rule that
// is written down here and checked by `auditMonsters()`, never guessed twice.

// ---------------------------------------------------------------------------
// Item base kinds a monster can drop.
//
// SOURCE OF TRUTH: `src/mmo/items.js` (written by another agent) and the tables
// in `docs/mmo/03-ITEMS-LOOT.md`. This list is hardcoded here so this module
// imports nothing. `DOC_REFS.bases` maps each id to the words it appears as in
// the documents, and `monsters.test.mjs` reads the markdown and proves every
// one of them is really there. If items.js renames a base, that test fails.
export const LOOT_KINDS = [
  'meat', 'hide', 'thickHide', 'scaledHide', 'bone', 'reagent',
  'ingot', 'ore', 'wood', 'gem', 'scroll',
  'ring', 'amulet', 'cloak', 'robe', 'tunic', 'breastplate', 'greaves', 'helm', 'boots',
  'dagger', 'shortsword', 'longsword', 'greatsword', 'rapier', 'axe', 'battleaxe',
  'warhammer', 'maul', 'quarterstaff', 'throwingKnives',
  'buckler', 'kite', 'tower',
];

export const DOC_REFS = {
  // id -> the phrase that must appear in 03-ITEMS-LOOT.md or 05-WORLD-CONTENT.md
  bases: {
    meat: 'meat', hide: 'hide', thickHide: 'thick hide', scaledHide: 'scaled hide',
    bone: 'bone', reagent: 'reagent', ingot: 'ingot', ore: 'ore', wood: 'wood',
    gem: 'gem', scroll: 'scroll', ring: 'ring', amulet: 'amulet', cloak: 'cloak',
    robe: 'robe', tunic: 'tunic', breastplate: 'breastplate', greaves: 'greaves',
    helm: 'helm', boots: 'boots', dagger: 'dagger', shortsword: 'shortsword',
    longsword: 'longsword', greatsword: 'greatsword', rapier: 'rapier', axe: 'axe',
    battleaxe: 'battleaxe', warhammer: 'warhammer', maul: 'maul',
    quarterstaff: 'quarterstaff', throwingKnives: 'throwing knives',
    buckler: 'buckler', kite: 'kite', tower: 'tower',
  },
  // every monster name, as the document writes it
  monsters: {},   // filled at the bottom of this file from MONSTERS[].name
};

// ---------------------------------------------------------------------------
// Tiers.
//
// The document heads each tier with a skill range: tier 1 "skill 10 to 25",
// tier 5 "skill 90 to 100". Read literally that band holds for `hit` on every
// row but three (Mire Troll 48 in a 50 to 65 tier, Iron Golem 65 in 70 to 85,
// Elder Treant and Cyclops and Hydra 85 to 88 in 90 to 100), and it never holds
// for `def`, which the document runs far below the band on purpose (Zombie 5,
// Stoneback Bear 30, Iron Golem 30: things that hit hard and cannot dodge).
//
// So the band is enforced as the document actually uses it, and this is the
// interpretation `auditMonsters()` checks:
//   hit  in [lo - HIT_SLACK, hi]     HIT_SLACK = 5, the largest shortfall present
//   def  in [0, hi]                  the band's top is a ceiling, not a floor
export const HIT_SLACK = 5;

export const TIERS = {
  0: { band: [0, 10], gold: [0, 0] },
  1: { band: [10, 25], gold: [4, 12] },
  2: { band: [30, 45], gold: [12, 30] },
  3: { band: [50, 65], gold: [30, 80] },
  4: { band: [70, 85], gold: [80, 250] },
  5: { band: [90, 100], gold: [250, 800] },
  6: { band: [90, 100], gold: [800, 3000] },   // bosses
};

// Aggro radius by temperament, from `docs/mmo/02-COMBAT.md`:
// "critters 0 (they never aggro), vermin 6 m, most monsters 12 m, hunters 18 m,
// bosses 25 m". Each monster's tabled `aggro` is the tuned number the document
// prints; the temperament it is filed under is the band that number falls in,
// and `auditMonsters()` proves every row agrees with its band.
export const AGGRO_BY_TEMPERAMENT = { critter: 0, vermin: 6, normal: 12, hunter: 18, boss: 25 };
export const TEMPERAMENT_BANDS = {
  critter: [0, 0], vermin: [1, 8], normal: [9, 14], hunter: [15, 24], boss: [25, 25],
};
export const LEASH_FACTOR = 2.5;   // "Aggro breaks if you get past the leash radius (2.5x aggro)"

// Respawn, from "Monsters respawn 8 to 15 minutes after death, at their spot,
// unless a player is within 30 m."
export const RESPAWN_MIN_S = 480;
export const RESPAWN_MAX_S = 900;
export const NO_RESPAWN_RADIUS = 30;

// Density, from "about one monster group per 40 m of dungeon corridor, one per
// 150 m of wild land at night, one per 400 m by day."
export const SPAWN_SPACING_M = { dungeon: 40, wildNight: 150, wildDay: 400 };

// Bosses change phase at 66% and 33% health.
export const BOSS_PHASES = [0.66, 0.33];

// Every tag a `notes` entry is allowed to use. A typo in a note is otherwise
// invisible: nothing reads it and the effect never fires.
export const NOTE_TAGS = new Set([
  'flying', 'erratic', 'night', 'nightOnly', 'snowOnly', 'fenOnly', 'coastOnly',
  'slow', 'charges', 'parries', 'swordAndShield', 'plate', 'shield',
  'group', 'sharesAggro', 'alpha', 'leadsGoblins', 'warCry', 'throwsKnives',
  'poison1', 'poison2', 'poison3', 'poisonTouch', 'poisonBreath', 'disease10',
  'stun', 'paralyse15', 'silence3', 'knockback', 'groundSlam', 'webRoot2',
  'roots', 'boulder', 'rangedSpikes', 'breath', 'frostNova',
  'undead', 'holyWeak', 'silverWeak', 'fireWeak', 'energyWeak',
  'immunePoison', 'coldImmune', 'incorporeal50', 'thickHide',
  'regen3', 'burnStopsRegen', 'regrows', 'threeHeads', 'healsInDaylight',
  'lifeLeech30', 'manaDrain', 'coinPurse', 'casts', 'phylactery',
  'lootTwice', 'purpleFloor', 'champion',
]);

// ---------------------------------------------------------------------------
// The roster.
//
// `flees` follows 02-COMBAT: "critters flee at any damage. Vermin and beasts
// flee below 25% health and return healed. Undead and constructs never flee."
// Two rows overrule their kind and the document says so in words: the Skeleton
// "never flees" (it is undead anyway) and the Vampire Knight "flees to a coffin
// at 20%" despite being undead.
const rows = [];
const M = (r) => { rows.push(r); return r; };

// --- Tier 0, critters. "Never attack first. Flee at any damage. No gold.
// Rabbit, squirrel, deer, gull, frog, crow, field mouse. 1 to 8 health. Drop
// meat and hide by Skinning." Health is spread across the document's own 1 to 8;
// run speeds match the fauna already in `src/world/fauna.js` where one exists.
const critter = (id, name, hp, run, group) => M({
  id, name, tier: 0, hp, damage: [0, 0], speed: 2.0, hit: 0, def: 10, ar: 0,
  run, aggro: 0, gold: [0, 0], kind: 'critter', temperament: 'critter',
  flees: 'always', group, notes: [], lootTable: ['meat', 'hide'],
});
critter('rabbit', 'Rabbit', 2, 4.2, [1, 3]);
critter('squirrel', 'Squirrel', 2, 4.6, [1, 2]);
critter('deer', 'Deer', 8, 7.0, [1, 4]);
critter('gull', 'Gull', 3, 9.0, [2, 6]);
critter('frog', 'Frog', 2, 2.0, [1, 3]);
critter('crow', 'Crow', 3, 9.0, [2, 5]);
critter('fieldMouse', 'Field Mouse', 1, 4.0, [1, 2]);

// --- Tier 1, vermin and the newly dead (skill 10 to 25, 4 to 12 gold)
M({ id: 'giantRat', name: 'Giant Rat', tier: 1, hp: 18, damage: [2, 5], speed: 2.0, hit: 15, def: 10, ar: 2, run: 5.5, aggro: 6,
  kind: 'vermin', temperament: 'vermin', flees: 'low', group: [1, 3], notes: ['disease10'],
  lootTable: ['meat', 'hide'] });
M({ id: 'caveBat', name: 'Cave Bat', tier: 1, hp: 12, damage: [1, 4], speed: 1.6, hit: 20, def: 25, ar: 0, run: 8, aggro: 6,
  kind: 'flying', temperament: 'vermin', flees: 'low', group: [1, 4], notes: ['flying', 'erratic'],
  lootTable: ['meat', 'hide'] });
M({ id: 'skeleton', name: 'Skeleton', tier: 1, hp: 30, damage: [4, 8], speed: 2.8, hit: 20, def: 15, ar: 8, run: 4.5, aggro: 10,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'holyWeak', 'group', 'sharesAggro'],
  lootTable: ['bone', 'shortsword', 'buckler'] });
M({ id: 'zombie', name: 'Zombie', tier: 1, hp: 45, damage: [5, 10], speed: 3.6, hit: 15, def: 5, ar: 4, run: 3, aggro: 8,
  kind: 'undead', temperament: 'vermin', flees: 'never', group: [1, 2], notes: ['undead', 'slow', 'poisonTouch'],
  lootTable: ['bone', 'tunic', 'ring'] });
M({ id: 'goblinScout', name: 'Goblin Scout', tier: 1, hp: 26, damage: [3, 7], speed: 2.4, hit: 22, def: 20, ar: 5, run: 6, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [2, 3], notes: ['group', 'sharesAggro', 'throwsKnives'],
  lootTable: ['dagger', 'throwingKnives', 'hide'] });
M({ id: 'thornGrub', name: 'Thorn Grub', tier: 1, hp: 20, damage: [2, 6], speed: 3.0, hit: 10, def: 10, ar: 10, run: 2, aggro: 4,
  kind: 'vermin', temperament: 'vermin', flees: 'low', group: [1, 3], notes: ['poison1'],
  lootTable: ['reagent', 'hide'] });
// Authored, not tabled. "beach and coast: crabs, harpies on cliffs, the drowned"
// names two creatures the tier tables never list. A habitat entry that points at
// nothing is the bug this module exists to prevent, so the two are written here
// inside their tiers' bands and flagged `authored: true`.
M({ id: 'crab', name: 'Crab', tier: 1, hp: 22, damage: [2, 6], speed: 2.6, hit: 18, def: 12, ar: 12, run: 3, aggro: 5,
  kind: 'vermin', temperament: 'vermin', flees: 'low', group: [1, 3], notes: ['coastOnly'],
  lootTable: ['meat', 'hide'], authored: true });

// --- Tier 2, the common dangers (skill 30 to 45, 12 to 30 gold)
M({ id: 'wolf', name: 'Wolf', tier: 2, hp: 40, damage: [6, 11], speed: 2.2, hit: 38, def: 35, ar: 6, run: 8.5, aggro: 14,
  kind: 'beast', temperament: 'normal', flees: 'low', group: [2, 4], notes: ['night', 'group'],
  lootTable: ['meat', 'hide'] });
M({ id: 'boar', name: 'Boar', tier: 2, hp: 55, damage: [8, 14], speed: 3.0, hit: 32, def: 25, ar: 10, run: 7, aggro: 8,
  kind: 'beast', temperament: 'vermin', flees: 'low', group: [1, 2], notes: ['charges'],
  lootTable: ['meat', 'hide'] });
M({ id: 'skeletonWarrior', name: 'Skeleton Warrior', tier: 2, hp: 60, damage: [8, 14], speed: 2.8, hit: 40, def: 35, ar: 18, run: 4.5, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'swordAndShield', 'parries', 'holyWeak', 'group', 'sharesAggro'],
  lootTable: ['bone', 'longsword', 'kite', 'helm'] });
M({ id: 'goblinWarrior', name: 'Goblin Warrior', tier: 2, hp: 48, damage: [7, 12], speed: 2.6, hit: 38, def: 30, ar: 12, run: 6, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [2, 3], notes: ['group', 'sharesAggro'],
  lootTable: ['shortsword', 'buckler', 'hide'] });
M({ id: 'bandit', name: 'Bandit', tier: 2, hp: 55, damage: [8, 14], speed: 2.7, hit: 42, def: 38, ar: 14, run: 6, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [2, 3], notes: ['coinPurse', 'group', 'sharesAggro'],
  lootTable: ['dagger', 'rapier', 'boots', 'ring'] });
M({ id: 'giantSpider', name: 'Giant Spider', tier: 2, hp: 45, damage: [5, 9], speed: 2.0, hit: 40, def: 40, ar: 8, run: 7, aggro: 10,
  kind: 'vermin', temperament: 'normal', flees: 'low', group: [1, 3], notes: ['poison2', 'webRoot2'],
  lootTable: ['reagent', 'hide'] });
M({ id: 'bogCrawler', name: 'Bog Crawler', tier: 2, hp: 70, damage: [9, 15], speed: 3.2, hit: 30, def: 20, ar: 16, run: 4, aggro: 8,
  kind: 'vermin', temperament: 'vermin', flees: 'low', group: [1, 2], notes: ['fenOnly', 'poison2'],
  lootTable: ['reagent', 'hide', 'gem'] });
M({ id: 'drowned', name: 'Drowned', tier: 2, hp: 58, damage: [7, 13], speed: 3.0, hit: 36, def: 28, ar: 12, run: 3.5, aggro: 10,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'holyWeak', 'coastOnly', 'slow'],
  lootTable: ['bone', 'rapier', 'boots'], authored: true });

// --- Tier 3, veterans (skill 50 to 65, 30 to 80 gold)
M({ id: 'direWolf', name: 'Dire Wolf', tier: 3, hp: 90, damage: [12, 20], speed: 2.1, hit: 58, def: 50, ar: 12, run: 9.5, aggro: 16,
  kind: 'beast', temperament: 'hunter', flees: 'low', group: [1, 2], notes: ['alpha', 'group'],
  lootTable: ['meat', 'thickHide'] });
M({ id: 'orc', name: 'Orc', tier: 3, hp: 110, damage: [14, 24], speed: 3.0, hit: 55, def: 40, ar: 22, run: 5.5, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [2, 3], notes: ['group', 'sharesAggro', 'warCry'],
  lootTable: ['axe', 'battleaxe', 'breastplate', 'ingot'] });
M({ id: 'ghoul', name: 'Ghoul', tier: 3, hp: 85, damage: [10, 18], speed: 2.4, hit: 52, def: 45, ar: 10, run: 6, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [1, 3], notes: ['undead', 'holyWeak', 'paralyse15', 'stun'],
  lootTable: ['bone', 'reagent', 'ring'] });
M({ id: 'hobgoblin', name: 'Hobgoblin', tier: 3, hp: 120, damage: [15, 25], speed: 3.1, hit: 56, def: 45, ar: 26, run: 5, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [1, 2], notes: ['leadsGoblins', 'sharesAggro'],
  lootTable: ['warhammer', 'maul', 'greaves', 'ingot'] });
M({ id: 'harpy', name: 'Harpy', tier: 3, hp: 70, damage: [10, 17], speed: 2.0, hit: 60, def: 60, ar: 6, run: 10, aggro: 18,
  kind: 'flying', temperament: 'hunter', flees: 'low', group: [1, 3], notes: ['flying', 'silence3'],
  lootTable: ['meat', 'reagent', 'amulet'] });
M({ id: 'stonebackBear', name: 'Stoneback Bear', tier: 3, hp: 160, damage: [18, 30], speed: 3.4, hit: 50, def: 30, ar: 30, run: 7, aggro: 10,
  kind: 'beast', temperament: 'normal', flees: 'low', group: [1, 1], notes: ['thickHide'],
  lootTable: ['meat', 'thickHide'] });
M({ id: 'cultist', name: 'Cultist', tier: 3, hp: 80, damage: [8, 14], speed: 2.6, hit: 55, def: 45, ar: 8, run: 5.5, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [2, 3], notes: ['casts', 'group'],
  lootTable: ['robe', 'quarterstaff', 'scroll', 'reagent'] });
M({ id: 'mireTroll', name: 'Mire Troll', tier: 3, hp: 200, damage: [20, 34], speed: 3.8, hit: 48, def: 30, ar: 28, run: 4.5, aggro: 12,
  kind: 'beast', temperament: 'normal', flees: 'low', group: [1, 1], notes: ['regen3', 'burnStopsRegen', 'fireWeak'],
  lootTable: ['thickHide', 'reagent', 'gem'] });

// --- Tier 4, elites (skill 70 to 85, 80 to 250 gold)
M({ id: 'ogre', name: 'Ogre', tier: 4, hp: 320, damage: [28, 45], speed: 4.2, hit: 70, def: 40, ar: 34, run: 5, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'low', group: [1, 1], notes: ['knockback', 'groundSlam', 'stun'],
  lootTable: ['maul', 'warhammer', 'thickHide'] });
M({ id: 'wraith', name: 'Wraith', tier: 4, hp: 180, damage: [18, 30], speed: 2.4, hit: 78, def: 75, ar: 10, run: 7, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'incorporeal50', 'manaDrain'],
  lootTable: ['scroll', 'reagent', 'amulet', 'ring'] });
M({ id: 'ironGolem', name: 'Iron Golem', tier: 4, hp: 400, damage: [30, 48], speed: 4.5, hit: 65, def: 30, ar: 60, run: 3.5, aggro: 10,
  kind: 'construct', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['immunePoison', 'energyWeak', 'slow'],
  lootTable: ['ingot', 'ore', 'gem'] });
M({ id: 'wyvern', name: 'Wyvern', tier: 4, hp: 260, damage: [24, 40], speed: 3.0, hit: 76, def: 65, ar: 24, run: 11, aggro: 20,
  kind: 'flying', temperament: 'hunter', flees: 'low', group: [1, 1], notes: ['flying', 'poisonBreath', 'breath'],
  lootTable: ['scaledHide', 'reagent', 'gem'] });
M({ id: 'werewolf', name: 'Werewolf', tier: 4, hp: 220, damage: [22, 36], speed: 2.0, hit: 80, def: 70, ar: 16, run: 10, aggro: 18,
  kind: 'beast', temperament: 'hunter', flees: 'low', group: [1, 2], notes: ['nightOnly', 'night', 'silverWeak'],
  lootTable: ['thickHide', 'meat', 'ring'] });
M({ id: 'boneKnight', name: 'Bone Knight', tier: 4, hp: 280, damage: [26, 42], speed: 3.2, hit: 78, def: 70, ar: 44, run: 5, aggro: 14,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['undead', 'holyWeak', 'plate', 'parries'],
  lootTable: ['bone', 'greatsword', 'breastplate', 'tower'] });
M({ id: 'manticore', name: 'Manticore', tier: 4, hp: 300, damage: [26, 44], speed: 2.8, hit: 75, def: 60, ar: 22, run: 9, aggro: 18,
  kind: 'beast', temperament: 'hunter', flees: 'low', group: [1, 1], notes: ['rangedSpikes'],
  lootTable: ['scaledHide', 'reagent', 'amulet'] });
M({ id: 'vampireKnight', name: 'Vampire Knight', tier: 4, hp: 260, damage: [24, 40], speed: 2.6, hit: 82, def: 75, ar: 30, run: 7.5, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'low', group: [1, 1], notes: ['undead', 'holyWeak', 'lifeLeech30'],
  lootTable: ['longsword', 'cloak', 'ring', 'amulet'] });

// --- Tier 5, champions (skill 90 to 100, 250 to 800 gold, always roll loot twice)
M({ id: 'cyclops', name: 'Cyclops', tier: 5, hp: 700, damage: [45, 70], speed: 4.6, hit: 88, def: 45, ar: 40, run: 5.5, aggro: 16,
  kind: 'humanoid', temperament: 'hunter', flees: 'low', group: [1, 1], notes: ['boulder', 'lootTwice', 'champion'],
  lootTable: ['maul', 'thickHide', 'gem'] });
M({ id: 'elderTreant', name: 'Elder Treant', tier: 5, hp: 900, damage: [40, 60], speed: 4.8, hit: 85, def: 50, ar: 50, run: 3, aggro: 12,
  kind: 'elemental', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['roots', 'healsInDaylight', 'fireWeak', 'lootTwice', 'champion'],
  lootTable: ['wood', 'reagent', 'gem'] });
M({ id: 'lich', name: 'Lich', tier: 5, hp: 520, damage: [30, 50], speed: 2.4, hit: 95, def: 85, ar: 20, run: 6, aggro: 22,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'casts', 'phylactery', 'lootTwice', 'champion'],
  lootTable: ['scroll', 'reagent', 'amulet', 'gem'] });
M({ id: 'frostGiant', name: 'Frost Giant', tier: 5, hp: 800, damage: [48, 76], speed: 4.4, hit: 90, def: 50, ar: 48, run: 6, aggro: 16,
  kind: 'humanoid', temperament: 'hunter', flees: 'low', group: [1, 1], notes: ['snowOnly', 'frostNova', 'coldImmune', 'stun', 'lootTwice', 'champion'],
  lootTable: ['ingot', 'thickHide', 'gem', 'warhammer'] });
M({ id: 'hydra', name: 'Hydra', tier: 5, hp: 950, damage: [36, 56], speed: 2.2, hit: 88, def: 55, ar: 36, run: 6, aggro: 14,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['threeHeads', 'regrows', 'lootTwice', 'champion'],
  lootTable: ['scaledHide', 'reagent', 'gem'] });
M({ id: 'boneDragon', name: 'Bone Dragon', tier: 5, hp: 1100, damage: [50, 80], speed: 3.6, hit: 96, def: 80, ar: 56, run: 9, aggro: 24,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'flying', 'breath', 'lootTwice', 'champion'],
  lootTable: ['bone', 'scaledHide', 'gem', 'greatsword'] });

// --- Bosses. "one per dungeon level 3, one per named crater: 2,000 to 4,000
// health, unique abilities, phase changes at 66% and 33%, always drop a purple
// or better, 800 to 3,000 gold". The document names the four; their combat
// numbers are authored inside the tier 5 band.
const boss = (r) => M({
  tier: 6, boss: true, phases: BOSS_PHASES.slice(), temperament: 'boss', aggro: 25,
  gold: [800, 3000], flees: 'never', group: [1, 1], authored: true, ...r,
  notes: [...(r.notes || []), 'lootTwice', 'purpleFloor', 'champion'],
});
boss({ id: 'ashenKing', name: 'the Ashen King', hp: 3200, damage: [55, 85], speed: 2.6, hit: 98, def: 88, ar: 30, run: 6,
  kind: 'undead', notes: ['undead', 'holyWeak', 'casts', 'phylactery'],
  lootTable: ['scroll', 'reagent', 'amulet', 'gem', 'ring'], where: 'dungeon3' });
boss({ id: 'motherOfSpiders', name: 'the Mother of Spiders', hp: 2600, damage: [40, 66], speed: 2.2, hit: 92, def: 80, ar: 26, run: 8.5,
  kind: 'vermin', notes: ['poison3', 'webRoot2'],
  lootTable: ['scaledHide', 'reagent', 'gem', 'ring'], where: 'dungeon3' });
boss({ id: 'wardenOfTheCut', name: 'the Warden of the Cut', hp: 4000, damage: [60, 95], speed: 4.4, hit: 90, def: 40, ar: 70, run: 3.5,
  kind: 'construct', notes: ['immunePoison', 'energyWeak', 'knockback', 'stun'],
  lootTable: ['ingot', 'ore', 'gem', 'greatsword'], where: 'dungeon3' });
boss({ id: 'drownedKnight', name: 'the Drowned Knight', hp: 2800, damage: [50, 78], speed: 3.0, hit: 94, def: 78, ar: 48, run: 5,
  kind: 'undead', notes: ['undead', 'holyWeak', 'coastOnly', 'lifeLeech30'],
  lootTable: ['longsword', 'kite', 'breastplate', 'gem'], where: 'dungeon3' });

// Gold comes from the tier unless a row overrides it.
for (const r of rows) if (!r.gold) r.gold = TIERS[r.tier].gold.slice();

export const MONSTER_LIST = rows;
export const MONSTERS = Object.fromEntries(rows.map((m) => [m.id, m]));
for (const m of rows) DOC_REFS.monsters[m.id] = m.name.replace(/^the /, '');

export const BOSSES = rows.filter((m) => m.boss);
export const monstersOfTier = (t) => rows.filter((m) => m.tier === t);

// ---------------------------------------------------------------------------
// Where they live.
//
// The document's "Where they live" table, key by key, plus the three world
// biomes it does not name. `src/world/field.js` ships eight biomes: ocean,
// beach, meadow, boreal, desert, sakura, mountain, snow. The table covers
// meadow, boreal, desert, beach, mountain and a fen (which the world field has
// no biome for, kept here so bog crawlers have a home the day one exists).
// Sakura and snow are filled by their nearest neighbour, meadow and boreal,
// plus the document's own "frost giants in snow"; ocean is deliberately empty,
// because nothing walks on it. All three are marked in the comments below.
const T1 = ['giantRat', 'caveBat', 'skeleton', 'zombie', 'goblinScout', 'thornGrub'];
const T2 = ['wolf', 'boar', 'skeletonWarrior', 'goblinWarrior', 'bandit', 'giantSpider'];
const T3 = ['direWolf', 'orc', 'ghoul', 'hobgoblin', 'harpy', 'stonebackBear', 'cultist', 'mireTroll'];
const T4 = ['ogre', 'wraith', 'ironGolem', 'wyvern', 'boneKnight', 'manticore', 'vampireKnight'];

export const HABITAT = {
  // "meadow, day: rats, boars, bandits on roads, goblin scouts near ruins"
  // "meadow, night: wolves, skeletons rising near ruins and shrines, zombies"
  meadow: { day: ['giantRat', 'boar', 'bandit', 'goblinScout'], night: ['wolf', 'skeleton', 'zombie', 'bandit'] },
  // "boreal: wolf packs, dire wolves, bears, werewolves at night"
  boreal: { day: ['wolf', 'direWolf', 'stonebackBear'], night: ['wolf', 'direWolf', 'stonebackBear', 'werewolf'] },
  // "desert: giant spiders, cultists at ruins, manticores, cyclops at the far end"
  desert: { day: ['giantSpider', 'cultist', 'manticore', 'cyclops'], night: ['giantSpider', 'cultist', 'manticore', 'cyclops'] },
  // "beach and coast: crabs, harpies on cliffs, the drowned"
  beach: { day: ['crab', 'harpy', 'drowned'], night: ['crab', 'harpy', 'drowned'] },
  // "fen: bog crawlers, mire trolls, ghouls"
  fen: { day: ['bogCrawler', 'mireTroll', 'ghoul'], night: ['bogCrawler', 'mireTroll', 'ghoul'] },
  // "mountain: ogres, iron golems near caves, wyverns high up, frost giants in snow"
  mountain: { day: ['ogre', 'ironGolem', 'wyvern'], night: ['ogre', 'ironGolem', 'wyvern'] },
  // Authored: snow is boreal's roster plus the document's frost giant.
  snow: { day: ['direWolf', 'frostGiant'], night: ['wolf', 'direWolf', 'frostGiant'] },
  // Authored: sakura reads as a gentler meadow.
  sakura: { day: ['giantRat', 'boar', 'goblinScout'], night: ['wolf', 'giantSpider', 'skeleton'] },
  // Authored: nothing stands on open water.
  ocean: { day: [], night: [] },
  // "ruins: always something: skeletons, cultists, a wraith in the old ones"
  ruin: { day: ['skeleton', 'cultist', 'wraith'], night: ['skeleton', 'cultist', 'wraith', 'zombie'] },
  // "graveyard: nightshade, skeletons and zombies at night". By day it is quiet.
  graveyard: { day: [], night: ['skeleton', 'zombie', 'ghoul', 'vampireKnight'] },
  // "crater: starfall ore, starbloom, a champion"
  crater: { day: ['cyclops', 'elderTreant', 'lich', 'hydra'], night: ['cyclops', 'elderTreant', 'lich', 'hydra', 'boneDragon'] },
  // "caves: vermin, spiders, an ogre in the deep ones"
  cave: { day: ['giantRat', 'caveBat', 'giantSpider', 'thornGrub', 'ogre'], night: ['giantRat', 'caveBat', 'giantSpider', 'thornGrub', 'ogre'] },
  // "dungeon level 1: tier 1 and 2"   (no daylight underground, so both lists match)
  dungeon1: { day: [...T1, ...T2], night: [...T1, ...T2] },
  // "dungeon level 2: tier 3, a tier 4 at the stair"
  dungeon2: { day: [...T3, 'boneKnight'], night: [...T3, 'boneKnight'] },
  // "dungeon level 3: tier 4, the boss room"
  dungeon3: { day: [...T4, 'boneDragon', ...BOSSES.map((b) => b.id)], night: [...T4, 'boneDragon', ...BOSSES.map((b) => b.id)] },
};

// Aliases the rest of the game may hand us. `coast` is the document's own word.
const PLACE_ALIASES = { coast: 'beach', ruins: 'ruin', caves: 'cave', oceanside: 'beach' };
export const resolvePlace = (place) => PLACE_ALIASES[place] || place;

// ---------------------------------------------------------------------------
// Rules

/** Aggro radius in metres, from temperament (02-COMBAT.md). Critters: 0. */
export function aggroRadius(monster) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m) return 0;
  return AGGRO_BY_TEMPERAMENT[m.temperament] ?? 0;
}

/** Leash radius: 2.5x aggro. Past it for 6 s and the monster walks home. */
export function leashRadius(monster) { return aggroRadius(monster) * LEASH_FACTOR; }

/** Seconds until a corpse's spot is refilled, 8 to 15 minutes. */
export function respawnDelay(rng = Math.random) {
  return RESPAWN_MIN_S + rng() * (RESPAWN_MAX_S - RESPAWN_MIN_S);
}

/** Gold for one kill, uniform over the tier's range. Critters give none. */
export function goldFor(monster, rng = Math.random) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m) return 0;
  const [lo, hi] = m.gold;
  if (hi <= 0) return 0;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * One spawn for a place and a time of day, or null where nothing lives.
 * Returns `{ id, monster, count }`; `count` is inside the monster's group range.
 */
export function spawnRollFor(place, isNight, rng = Math.random) {
  const h = HABITAT[resolvePlace(place)];
  if (!h) return null;
  const list = isNight ? h.night : h.day;
  if (!list || list.length === 0) return null;
  const pick = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  const m = MONSTERS[list[pick]];
  if (!m) return null;
  const [gmin, gmax] = m.group;
  const span = Math.max(0, gmax - gmin);
  const count = gmin + Math.min(span, Math.max(0, Math.floor(rng() * (span + 1))));
  return { id: m.id, monster: m, count };
}

// ---------------------------------------------------------------------------
/**
 * Every structural claim this table makes, checked at load. Throws with the
 * whole list of problems, not the first one.
 */
export function auditMonsters() {
  const bad = [];
  const seen = new Set();
  const kinds = new Set(['critter', 'vermin', 'undead', 'beast', 'humanoid', 'construct', 'elemental', 'flying']);
  const flees = new Set(['always', 'low', 'never']);
  const loot = new Set(LOOT_KINDS);

  for (const m of MONSTER_LIST) {
    const at = `monster ${m.id}`;
    if (seen.has(m.id)) bad.push(`${at}: duplicate id`);
    seen.add(m.id);
    if (!m.name || typeof m.name !== 'string') bad.push(`${at}: no name`);
    const tier = TIERS[m.tier];
    if (!tier) { bad.push(`${at}: unknown tier ${m.tier}`); continue; }
    const [lo, hi] = tier.band;
    if (!(m.hit >= lo - HIT_SLACK && m.hit <= hi)) bad.push(`${at}: hit ${m.hit} outside [${lo - HIT_SLACK}, ${hi}] for tier ${m.tier}`);
    if (!(m.def >= 0 && m.def <= hi)) bad.push(`${at}: def ${m.def} outside [0, ${hi}] for tier ${m.tier}`);
    if (!(m.hp > 0)) bad.push(`${at}: hp ${m.hp}`);
    if (!Array.isArray(m.damage) || m.damage.length !== 2 || m.damage[0] > m.damage[1]) bad.push(`${at}: damage ${JSON.stringify(m.damage)}`);
    if (!(m.speed > 0)) bad.push(`${at}: speed ${m.speed}`);
    if (!(m.ar >= 0)) bad.push(`${at}: ar ${m.ar}`);
    if (!(m.run >= 0)) bad.push(`${at}: run ${m.run}`);
    if (!kinds.has(m.kind)) bad.push(`${at}: kind ${m.kind}`);
    if (!flees.has(m.flees)) bad.push(`${at}: flees ${m.flees}`);
    if (!Array.isArray(m.group) || m.group.length !== 2 || m.group[0] < 1 || m.group[0] > m.group[1]) bad.push(`${at}: group ${JSON.stringify(m.group)}`);
    if (!Array.isArray(m.gold) || m.gold[0] > m.gold[1]) bad.push(`${at}: gold ${JSON.stringify(m.gold)}`);
    if (m.tier > 0 && (m.gold[0] !== TIERS[m.tier].gold[0] || m.gold[1] !== TIERS[m.tier].gold[1])) bad.push(`${at}: gold does not match tier ${m.tier}`);
    if (m.tier === 0 && (m.gold[0] !== 0 || m.gold[1] !== 0)) bad.push(`${at}: critters never drop gold`);

    const band = TEMPERAMENT_BANDS[m.temperament];
    if (!band) bad.push(`${at}: temperament ${m.temperament}`);
    else if (m.aggro < band[0] || m.aggro > band[1]) bad.push(`${at}: aggro ${m.aggro} outside temperament ${m.temperament} band [${band[0]}, ${band[1]}]`);

    for (const n of m.notes) if (!NOTE_TAGS.has(n)) bad.push(`${at}: unknown note tag "${n}"`);
    // Kind 'flying' must carry the tag; the tag may also sit on something whose
    // kind is more specific (the Bone Dragon is undead and flies).
    if (m.kind === 'flying' && !m.notes.includes('flying')) bad.push(`${at}: kind flying without the flying tag`);
    if (!Array.isArray(m.lootTable) || m.lootTable.length === 0) bad.push(`${at}: empty lootTable`);
    else for (const k of m.lootTable) if (!loot.has(k)) bad.push(`${at}: loot kind "${k}" is not a base this game has`);

    if (m.boss) {
      if (!(m.hp >= 2000 && m.hp <= 4000)) bad.push(`${at}: boss hp ${m.hp} outside 2000 to 4000`);
      if (!Array.isArray(m.phases) || m.phases.length !== 2 || m.phases[0] !== 0.66 || m.phases[1] !== 0.33) bad.push(`${at}: boss phases ${JSON.stringify(m.phases)}`);
      if (m.gold[0] !== 800 || m.gold[1] !== 3000) bad.push(`${at}: boss gold ${JSON.stringify(m.gold)}`);
      if (!m.notes.includes('purpleFloor')) bad.push(`${at}: a boss always drops a purple or better`);
    }
  }

  for (let t = 1; t <= 5; t++) if (monstersOfTier(t).length === 0) bad.push(`tier ${t} is empty`);
  if (BOSSES.length !== 4) bad.push(`there should be four bosses, there are ${BOSSES.length}`);

  for (const [place, h] of Object.entries(HABITAT)) {
    for (const when of ['day', 'night']) {
      if (!Array.isArray(h[when])) { bad.push(`habitat ${place}.${when} is not a list`); continue; }
      for (const id of h[when]) {
        if (!MONSTERS[id]) bad.push(`habitat ${place}.${when}: "${id}" is not a monster`);
        else {
          const m = MONSTERS[id];
          if (when === 'day' && m.notes.includes('nightOnly') && !place.startsWith('dungeon') && place !== 'cave') {
            bad.push(`habitat ${place}.day: ${id} is night only`);
          }
          if (m.notes.includes('snowOnly') && !['snow', 'mountain', 'crater'].includes(place)) bad.push(`habitat ${place}: ${id} is snow only`);
          if (m.notes.includes('fenOnly') && place !== 'fen') bad.push(`habitat ${place}: ${id} is fen only`);
          if (m.notes.includes('coastOnly') && !['beach', 'ocean'].includes(place) && !place.startsWith('dungeon')) bad.push(`habitat ${place}: ${id} is coast only`);
        }
      }
    }
  }
  // Every monster has to be somewhere, or it is written and never met.
  const placed = new Set(Object.values(HABITAT).flatMap((h) => [...h.day, ...h.night]));
  for (const m of MONSTER_LIST) {
    if (m.tier === 0) continue;   // critters are placed by src/world/fauna.js, not here
    if (!placed.has(m.id)) bad.push(`monster ${m.id} lives nowhere`);
  }
  // No em dash anywhere in the prose of this table.
  for (const m of MONSTER_LIST) if (m.name.includes('—')) bad.push(`monster ${m.id}: em dash in the name`);

  if (bad.length) throw new Error(`auditMonsters: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { monsters: MONSTER_LIST.length, bosses: BOSSES.length, places: Object.keys(HABITAT).length };
}

auditMonsters();
