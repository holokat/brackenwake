import { CELLAR_BOSSES, getCellarBoss, registerCellarBosses } from './cellar_bosses.js';
import {registerCellarCreatures,CELLAR_CREATURE} from './cellar_monsters.js';
import {registerOreElementals,ORE_ELEMENTAL} from './ore_elementals.js';
import {MONSTER_HEALTH_FACTOR, MONSTER_DAMAGE_FACTOR} from './combat_pace.js';
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

/**
 * What `coinPurse` is worth.
 *
 * The tag was carried by four rows and read by nothing at all: a bandit's purse
 * was a rat's purse with a better name. A row that carries the tag has its
 * kill gold multiplied by its own `purse`, or by this where it names none, and
 * `src/game/loot_drops.js` is where that happens, on the one line that turns a
 * kill into a sack. 1.5 puts a tier 2 purse at 18 to 45 against the band's 12
 * to 30, which is "over its tier band" and is still short of tier 3's 30 to 80.
 */
export const DEFAULT_PURSE = 1.5;
export const MAX_PURSE = 4;

// Aggro radius by temperament, from `docs/mmo/02-COMBAT.md`:
// "critters 0 (they never aggro), vermin 6 m, most monsters 12 m, hunters 18 m,
// bosses 25 m". Each monster's tabled `aggro` is the tuned number the document
// prints; the temperament it is filed under is the band that number falls in,
// and `auditMonsters()` proves every row agrees with its band.
export const AGGRO_BY_TEMPERAMENT = { critter: 0, vermin: 6, normal: 12, hunter: 18, boss: 34 };
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
// M5 halved the two wild numbers again. 150 and 400 left a zone with eight
// things alive; 220 and 110 left the Greenwold at 164 bodies per square
// kilometre by day, which is a body every 78 m and reads as empty country from
// a horse. 110 and 60 is one group per two chunks by day and better than one
// per chunk by night, and `GROUP_CHANCE` below carries the part of that which
// does not fit in a single chunk.
export const SPAWN_SPACING_M = { dungeon: 40, wildNight: 60, wildDay: 110 };

// Bosses change phase at 66% and 33% health.
export const BOSS_PHASES = [0.66, 0.33];

// Every tag a `notes` entry is allowed to use, and what each one means in one
// line. A typo in a note is otherwise invisible: nothing reads it and the
// effect never fires. The meaning is not decoration either: a tag with no rule
// behind it anywhere is a promise to the player that nothing keeps, so the
// wiring note for each of the tags added in wave A is written out in
// `docs/mmo/wiring/M2.md` and the ones already wired say where they are wired.
export const NOTE_TAG_MEANING = {
  // --- where and when it lives
  flying: 'stays in the air; monster_ai.isFlyer holds it at hoverHeight and it comes down to swing',
  erratic: 'does not fly a straight line at you; the approach wanders',
  night: 'commoner after dusk, still present by day',
  dummy: 'a training body: it stands still, strikes nobody, rights itself when knocked down, and teaches a weapon only up to TRAINING_CAP (game/monsters.js spawn and standBackUp, combat.js teach, monster_models.js still shapes)',
  nightOnly: 'never spawns in daylight above ground',
  snowOnly: 'only in snow, mountain or crater habitats',
  fenOnly: 'only in the fen',
  coastOnly: 'only on the beach, in the ocean or underground beside them',
  noonOnly: 'only between the hours the sun is highest, which is the whole of its legend',
  wanders: 'does not sit in its lair; it walks a route of places and can be met anywhere on it',
  huge: 'a body far larger than its tier suggests, so the tier health band does not hold for it',
  // --- how it moves and swings
  slow: 'walks slower than its run speed suggests; it never runs you down',
  charges: 'closes the last stretch at a run and the blow that lands hits harder',
  parries: 'carries a natural guard, so combat_rules gives it a parry roll',
  swordAndShield: 'fights one handed behind a shield',
  plate: 'wears plate: the AR on the row already holds it',
  shield: 'carries a shield',
  tailSweep: 'a wide arc that catches everything in front of it, not one target',
  dives: 'a flyer stoops from the air for a doubled blow and climbs again',
  // --- groups
  group: 'spawns with its own kind and fights as one',
  sharesAggro: 'pulling one pulls every one of its kind within the group',
  alpha: 'the leader of its pack; the pack holds while it lives',
  leadsGoblins: 'goblins spawn around it and fight better for it',
  warCry: 'a shout that lifts every ally of its own kind nearby',
  shieldWall: 'while two or more of the same row stand within four metres, each gains armour',
  howl: 'calls every monster of its own row within thirty metres into the fight',
  healsAllies: 'a chant that heals every ally within eight metres',
  summons: 'calls lesser monsters into the fight; the row carries `summons: { id, count }`',
  // --- what it throws, shoots, casts or breathes
  throwsKnives: 'thrown weapon; monster_ai.RANGED_TAGS maps it to the thrown mode',
  bow: 'shot weapon; monster_ai.RANGED_TAGS already maps it to the shot mode',
  boulder: 'thrown weapon, and a heavy one',
  rangedSpikes: 'thrown weapon fired off its own body',
  breath: 'a cone of fire, held for BREATH_SECONDS',
  poisonBreath: 'a cone of poison',
  casts: 'a bolt or a fireball at range, interruptible',
  hex: 'a curse that lowers the target hit chance for a while, the document Fireball and Hex',
  stormCall: 'calls lightning down on the ground a target is standing on, after a warning',
  powderCharge: 'throws a charge that goes off a moment later and hits an area',
  ashCloud: 'a cloud that blinds: the target hit chance falls while it stands in it',
  // --- what it does when it reaches you
  poison1: 'poison level 1 on a landed blow',
  poison2: 'poison level 2 on a landed blow',
  poison3: 'poison level 3 on a landed blow',
  poisonTouch: 'poison level 1 by touch',
  disease10: 'one blow in ten carries disease',
  stun: 'a blow that stuns',
  paralyse15: 'fifteen percent of blows hold you still',
  silence3: 'a screech that stops casting for three seconds',
  knockback: 'a blow that moves you',
  groundSlam: 'an area blow around itself after a warning',
  webRoot2: 'a web that roots for two seconds',
  roots: 'roots out of the ground that hold you where you stand',
  frostNova: 'a ring of cold around itself',
  grab: 'takes hold of you and holds you there while it squeezes',
  ambush: 'unseen until you are close, and the first blow is doubled',
  burrows: 'goes under the ground, and comes up somewhere else',
  awakens: 'never aggros at all until you come inside four metres of it',
  dropsFromAbove: 'hangs above the path and drops on whatever walks under it',
  dragonTime: 'the world runs slow around it: it acts twice for every once of yours',
  // --- what it is made of
  undead: 'undead: no meat, never flees, holy hurts it',
  holyWeak: 'holy damage doubled',
  silverWeak: 'silver doubled',
  fireWeak: 'fire doubled',
  energyWeak: 'energy doubled',
  immunePoison: 'poison does nothing to it',
  coldImmune: 'cold does nothing to it',
  fireImmune: 'fire does nothing to it',
  incorporeal50: 'half of all physical damage passes straight through',
  thickHide: 'a hide that turns blades, which the AR on the row already holds',
  // --- what it does over time
  regen3: 'three health a second',
  burnStopsRegen: 'burning stops the regeneration',
  regrows: 'a severed part grows back',
  threeHeads: 'three heads, three attacks',
  healsInDaylight: 'heals while the sun is on it',
  lifeLeech30: 'thirty percent of the damage it does comes back as health',
  manaDrain: 'takes mana as well as health',
  phylactery: 'it stands back up unless the phylactery is broken first',
  // --- what it leaves
  coinPurse: 'carries coin over its tier band: loot_drops multiplies the kill by the row `purse`, or by DEFAULT_PURSE where the row names none',
  lootTwice: 'the loot roll is made twice and the better kept',
  purpleFloor: 'never drops worse than an epic',
  champion: 'a champion or a boss: the plate says so and the colour is the tier',
};

export const NOTE_TAGS = new Set(Object.keys(NOTE_TAG_MEANING));

// ---------------------------------------------------------------------------
// The roster.
//
// `flees` follows 02-COMBAT after 2026-09-08: monsters never flee.
const rows = [];
// More frequent player attacks are balanced with health, preserving enemy telegraphs.
const M = (r) => {
  const tuned = { ...r, baseHp: r.hp, hp: r.tier > 0 ? Math.round(r.hp * MONSTER_HEALTH_FACTOR) : r.hp };
  // and the blow, the same way: the row keeps its written numbers in baseDamage
  tuned.baseDamage = r.damage;
  tuned.damage = r.tier > 0 && Array.isArray(r.damage) ? r.damage.map((v) => Math.round(v * MONSTER_DAMAGE_FACTOR)) : r.damage;
  rows.push(tuned); return tuned;
};

// --- Tier 0, critters. Never attack first. No gold.
// Rabbit, squirrel, deer, gull, frog, crow, field mouse. 1 to 8 health. Drop
// meat and hide by Skinning." Health is spread across the document's own 1 to 8;
// run speeds match the fauna already in `src/world/fauna.js` where one exists.
const critter = (id, name, hp, run, group, extra = {}) => M({
  id, name, tier: 0, hp, damage: [0, 0], speed: 2.0, hit: 0, def: 10, ar: 0,
  run, aggro: 0, gold: [0, 0], kind: 'critter', temperament: 'critter',
  flees: 'never', group, notes: [], lootTable: ['meat', 'hide'], ...extra,
});
critter('rabbit', 'Rabbit', 2, 4.2, [1, 3]);
critter('squirrel', 'Squirrel', 2, 4.6, [1, 2]);
critter('deer', 'Deer', 8, 7.0, [1, 4]);
critter('gull', 'Gull', 3, 9.0, [2, 6], { notes: ['flying'] });
critter('frog', 'Frog', 2, 2.0, [1, 3]);
critter('crow', 'Crow', 3, 9.0, [2, 5], { notes: ['flying'] });
critter('fieldMouse', 'Field Mouse', 1, 4.0, [1, 2]);

// --- Tier 1, vermin and the newly dead (skill 10 to 25, 4 to 12 gold)
M({ id: 'giantRat', name: 'Giant Rat', tier: 1, hp: 18, damage: [2, 5], speed: 2.0, hit: 15, def: 10, ar: 2, run: 5.5, aggro: 6,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [1, 3], notes: ['disease10'],
  lootTable: ['meat', 'hide'] });
M({ id: 'caveBat', name: 'Cave Bat', tier: 1, hp: 12, damage: [1, 4], speed: 1.6, hit: 20, def: 25, ar: 0, run: 8, aggro: 6,
  kind: 'flying', temperament: 'vermin', flees: 'never', group: [1, 4], notes: ['flying', 'erratic'],
  lootTable: ['meat', 'hide'] });
M({ id: 'skeleton', name: 'Skeleton', tier: 1, hp: 30, damage: [4, 8], speed: 2.8, hit: 20, def: 15, ar: 8, run: 4.5, aggro: 10,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'holyWeak', 'group', 'sharesAggro'],
  lootTable: ['bone', 'shortsword', 'buckler'] });
M({ id: 'zombie', name: 'Zombie', tier: 1, hp: 45, damage: [5, 10], speed: 3.6, hit: 15, def: 5, ar: 4, run: 3, aggro: 8,
  kind: 'undead', temperament: 'vermin', flees: 'never', group: [1, 2], notes: ['undead', 'slow', 'poisonTouch'],
  lootTable: ['bone', 'tunic', 'ring'] });
M({ id: 'goblinScout', name: 'Goblin Scout', tier: 1, hp: 26, damage: [3, 7], speed: 2.4, hit: 22, def: 20, ar: 5, run: 6, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro', 'throwsKnives'],
  lootTable: ['dagger', 'throwingKnives', 'hide'] });
M({ id: 'thornGrub', name: 'Thorn Grub', tier: 1, hp: 20, damage: [2, 6], speed: 3.0, hit: 10, def: 10, ar: 10, run: 2, aggro: 4,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [1, 3], notes: ['poison1'],
  lootTable: ['reagent', 'hide'] });
// Authored, not tabled. "beach and coast: crabs, harpies on cliffs, the drowned"
// names two creatures the tier tables never list. A habitat entry that points at
// nothing is the bug this module exists to prevent, so the two are written here
// inside their tiers' bands and flagged `authored: true`.
M({ id: 'crab', name: 'Crab', tier: 1, hp: 22, damage: [2, 6], speed: 2.6, hit: 18, def: 12, ar: 12, run: 3, aggro: 5,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [1, 3], notes: ['coastOnly'],
  lootTable: ['meat', 'hide'], authored: true });

// --- Tier 2, the common dangers (skill 30 to 45, 12 to 30 gold)
// M5: three to four, never two. "The first wolves after dark" in the Beech
// Hangar is a pack, and a pair read as two dogs having a disagreement.
M({ id: 'wolf', name: 'Wolf', tier: 2, hp: 40, damage: [6, 11], speed: 2.2, hit: 38, def: 35, ar: 6, run: 8.5, aggro: 14,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [3, 4], notes: ['night', 'group', 'sharesAggro'],
  lootTable: ['meat', 'hide'] });
M({ id: 'boar', name: 'Boar', tier: 2, hp: 55, damage: [8, 14], speed: 3.0, hit: 32, def: 25, ar: 10, run: 7, aggro: 8,
  kind: 'beast', temperament: 'vermin', flees: 'never', group: [1, 2], notes: ['charges'],
  lootTable: ['meat', 'hide'] });
M({ id: 'skeletonWarrior', name: 'Skeleton Warrior', tier: 2, hp: 60, damage: [8, 14], speed: 2.8, hit: 40, def: 35, ar: 18, run: 4.5, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'swordAndShield', 'parries', 'holyWeak', 'group', 'sharesAggro'],
  lootTable: ['bone', 'longsword', 'kite', 'helm'] });
M({ id: 'goblinWarrior', name: 'Goblin Warrior', tier: 2, hp: 48, damage: [7, 12], speed: 2.6, hit: 38, def: 30, ar: 12, run: 6, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro'],
  lootTable: ['shortsword', 'buckler', 'hide'] });
// --- the training yard on the Starting Island. Bodies, not monsters: they
// never move, never swing, never die and never drop a thing. Tier 1 so they
// have a shape, a plate and a def to roll against; temperament critter for the
// aggro band of 0 (game/monsters.js skips the critter bolt for a `dummy`).
M({ id: 'trainingDummy', name: 'Training Dummy', tier: 1, hp: 40, damage: [0, 0], speed: 2.0, hit: 10, def: 20, ar: 0, run: 0, aggro: 0,
  kind: 'construct', temperament: 'critter', flees: 'never', group: [1, 1], notes: ['dummy', 'immunePoison'], lootTable: ['reagent'] });
M({ id: 'archeryTarget', name: 'Archery Target', tier: 1, hp: 40, damage: [0, 0], speed: 2.0, hit: 10, def: 20, ar: 0, run: 0, aggro: 0,
  kind: 'construct', temperament: 'critter', flees: 'never', group: [1, 1], notes: ['dummy', 'immunePoison'], lootTable: ['reagent'] });
M({ id: 'bandit', name: 'Bandit', tier: 2, hp: 55, damage: [8, 14], speed: 2.7, hit: 42, def: 38, ar: 14, run: 6, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['coinPurse', 'group', 'sharesAggro'],
  lootTable: ['dagger', 'rapier', 'boots', 'ring'] });
M({ id: 'giantSpider', name: 'Giant Spider', tier: 2, hp: 45, damage: [5, 9], speed: 2.0, hit: 40, def: 40, ar: 8, run: 7, aggro: 10,
  kind: 'vermin', temperament: 'normal', flees: 'never', group: [1, 3], notes: ['poison2', 'webRoot2'],
  lootTable: ['reagent', 'hide'] });
M({ id: 'bogCrawler', name: 'Bog Crawler', tier: 2, hp: 70, damage: [9, 15], speed: 3.2, hit: 30, def: 20, ar: 16, run: 4, aggro: 8,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [1, 2], notes: ['fenOnly', 'poison2'],
  lootTable: ['reagent', 'hide', 'gem'] });
M({ id: 'drowned', name: 'Drowned', tier: 2, hp: 58, damage: [7, 13], speed: 3.0, hit: 36, def: 28, ar: 12, run: 3.5, aggro: 10,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'holyWeak', 'coastOnly', 'slow'],
  lootTable: ['bone', 'rapier', 'boots'], authored: true });

// --- Tier 3, veterans (skill 50 to 65, 30 to 80 gold)
M({ id: 'direWolf', name: 'Dire Wolf', tier: 3, hp: 90, damage: [12, 20], speed: 2.1, hit: 58, def: 50, ar: 12, run: 9.5, aggro: 16,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [1, 2], notes: ['alpha', 'group'],
  lootTable: ['meat', 'thickHide'] });
M({ id: 'orc', name: 'Orc', tier: 3, hp: 110, damage: [14, 24], speed: 3.0, hit: 55, def: 40, ar: 22, run: 5.5, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro', 'warCry'],
  lootTable: ['axe', 'battleaxe', 'breastplate', 'ingot'] });
M({ id: 'ghoul', name: 'Ghoul', tier: 3, hp: 85, damage: [10, 18], speed: 2.4, hit: 52, def: 45, ar: 10, run: 6, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [1, 3], notes: ['undead', 'holyWeak', 'paralyse15', 'stun'],
  lootTable: ['bone', 'reagent', 'ring'] });
M({ id: 'hobgoblin', name: 'Hobgoblin', tier: 3, hp: 120, damage: [15, 25], speed: 3.1, hit: 56, def: 45, ar: 26, run: 5, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['leadsGoblins', 'sharesAggro'],
  lootTable: ['warhammer', 'maul', 'greaves', 'ingot'] });
M({ id: 'harpy', name: 'Harpy', tier: 3, hp: 70, damage: [10, 17], speed: 2.0, hit: 60, def: 60, ar: 6, run: 10, aggro: 18,
  kind: 'flying', temperament: 'hunter', flees: 'never', group: [1, 3], notes: ['flying', 'silence3'],
  lootTable: ['meat', 'reagent', 'amulet'] });
// --- Wave C, S2: the Greenwold's one named beast.
//
// "Old Grist, a boar the size of a pony in the beech hangar" (14-KALDERA.md,
// section 5.1, and the Greenwold's `encounters` in realms.js). A boar row with
// a name, a tier over the common boar's and a body a third again as tall,
// standing alone in one wood. Not a boss: no arena, no phases, no purple floor.
M({ id: 'oldGrist', name: 'Old Grist', tier: 3, hp: 210, damage: [16, 28], speed: 2.6, hit: 58, def: 46, ar: 20, run: 8.5, aggro: 16,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [1, 1], unique: true, notes: ['charges', 'knockback', 'alpha'],
  lootTable: ['meat', 'thickHide', 'gem'], family: 'wolf', authored: true,
  model: 'A boar the size of a pony, grey down the spine, one tusk broken off short and the other polished, with the leaf litter of the Beech Hangar worn into his shoulders like bark.', wave: 'S2' });
M({ id: 'stonebackBear', name: 'Stoneback Bear', tier: 3, hp: 160, damage: [18, 30], speed: 3.4, hit: 50, def: 30, ar: 30, run: 7, aggro: 10,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['thickHide'],
  lootTable: ['meat', 'thickHide'] });
M({ id: 'cultist', name: 'Cultist', tier: 3, hp: 80, damage: [8, 14], speed: 2.6, hit: 55, def: 45, ar: 8, run: 5.5, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['casts', 'group'],
  lootTable: ['robe', 'quarterstaff', 'scroll', 'reagent'] });
M({ id: 'mireTroll', name: 'Mire Troll', tier: 3, hp: 200, damage: [20, 34], speed: 3.8, hit: 48, def: 30, ar: 28, run: 4.5, aggro: 12,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['regen3', 'burnStopsRegen', 'fireWeak'],
  lootTable: ['thickHide', 'reagent', 'gem'] });

// --- Tier 4, elites (skill 70 to 85, 80 to 250 gold)
M({ id: 'ogre', name: 'Ogre', tier: 4, hp: 320, damage: [28, 45], speed: 4.2, hit: 70, def: 40, ar: 34, run: 5, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['knockback', 'groundSlam', 'stun'],
  lootTable: ['maul', 'warhammer', 'thickHide'] });
M({ id: 'wraith', name: 'Wraith', tier: 4, hp: 180, damage: [18, 30], speed: 2.4, hit: 78, def: 75, ar: 10, run: 7, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'incorporeal50', 'manaDrain'],
  lootTable: ['scroll', 'reagent', 'amulet', 'ring'] });
M({ id: 'ironGolem', name: 'Iron Golem', tier: 4, hp: 400, damage: [30, 48], speed: 4.5, hit: 65, def: 30, ar: 60, run: 3.5, aggro: 10,
  kind: 'construct', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['immunePoison', 'energyWeak', 'slow'],
  lootTable: ['ingot', 'ore', 'gem'] });
M({ id: 'wyvern', name: 'Wyvern', tier: 4, hp: 260, damage: [24, 40], speed: 3.0, hit: 76, def: 65, ar: 24, run: 11, aggro: 20,
  kind: 'flying', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['flying', 'poisonBreath', 'breath'],
  lootTable: ['scaledHide', 'reagent', 'gem'] });
M({ id: 'werewolf', name: 'Werewolf', tier: 4, hp: 220, damage: [22, 36], speed: 2.0, hit: 80, def: 70, ar: 16, run: 10, aggro: 18,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [1, 2], notes: ['nightOnly', 'night', 'silverWeak'],
  lootTable: ['thickHide', 'meat', 'ring'] });
M({ id: 'boneKnight', name: 'Bone Knight', tier: 4, hp: 280, damage: [26, 42], speed: 3.2, hit: 78, def: 70, ar: 44, run: 5, aggro: 14,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['undead', 'holyWeak', 'plate', 'parries'],
  lootTable: ['bone', 'greatsword', 'breastplate', 'tower'] });
M({ id: 'manticore', name: 'Manticore', tier: 4, hp: 300, damage: [26, 44], speed: 2.8, hit: 75, def: 60, ar: 22, run: 9, aggro: 18,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['rangedSpikes'],
  lootTable: ['scaledHide', 'reagent', 'amulet'] });
M({ id: 'vampireKnight', name: 'Vampire Knight', tier: 4, hp: 260, damage: [24, 40], speed: 2.6, hit: 82, def: 75, ar: 30, run: 7.5, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'lifeLeech30'],
  lootTable: ['longsword', 'cloak', 'ring', 'amulet'] });

// --- Tier 5, champions (skill 90 to 100, 250 to 800 gold, always roll loot twice)
M({ id: 'cyclops', name: 'Cyclops', tier: 5, hp: 700, damage: [45, 70], speed: 4.6, hit: 88, def: 45, ar: 40, run: 5.5, aggro: 16,
  kind: 'humanoid', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['boulder', 'lootTwice', 'champion'],
  lootTable: ['maul', 'thickHide', 'gem'] });
M({ id: 'elderTreant', name: 'Elder Treant', tier: 5, hp: 900, damage: [40, 60], speed: 4.8, hit: 85, def: 50, ar: 50, run: 3, aggro: 12,
  kind: 'elemental', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['roots', 'healsInDaylight', 'fireWeak', 'lootTwice', 'champion'],
  lootTable: ['wood', 'reagent', 'gem'] });
M({ id: 'lich', name: 'Lich', tier: 5, hp: 520, damage: [30, 50], speed: 2.4, hit: 95, def: 85, ar: 20, run: 6, aggro: 22,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'casts', 'phylactery', 'lootTwice', 'champion'],
  lootTable: ['scroll', 'reagent', 'amulet', 'gem'] });
M({ id: 'frostGiant', name: 'Frost Giant', tier: 5, hp: 800, damage: [48, 76], speed: 4.4, hit: 90, def: 50, ar: 48, run: 6, aggro: 16,
  kind: 'humanoid', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['snowOnly', 'frostNova', 'coldImmune', 'stun', 'lootTwice', 'champion'],
  lootTable: ['ingot', 'thickHide', 'gem', 'warhammer'] });
M({ id: 'hydra', name: 'Hydra', tier: 5, hp: 950, damage: [36, 56], speed: 2.2, hit: 88, def: 55, ar: 36, run: 6, aggro: 14,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['threeHeads', 'regrows', 'lootTwice', 'champion'],
  lootTable: ['scaledHide', 'reagent', 'gem'] });
M({ id: 'boneDragon', name: 'Bone Dragon', tier: 5, hp: 1100, damage: [50, 80], speed: 3.6, hit: 96, def: 80, ar: 56, run: 9, aggro: 24,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['undead', 'holyWeak', 'flying', 'breath', 'lootTwice', 'champion'],
  lootTable: ['bone', 'scaledHide', 'gem', 'greatsword'] });

// ===========================================================================
// Wave A, M2: the roster the nine realms need.
//
// `src/mmo/realms.js` names what lives in ninety five places, and until this
// section existed most of those sentences had no row behind them: the kraken
// in the shoals, the sandworm under the singing dunes, the mammoth herds on
// the steppe, five kinds of Legion soldier on a road that says "Legion
// patrols". A place that promises a monster and spawns a giant rat is the same
// failure as a gift that does not fit the barn, so every one of them is here.
//
// Each row carries four things the older rows do not:
//
//   `family`  the body it borrows from `src/game/monster_models.js` until it
//             has one of its own. It has to be one of BODY_FAMILIES below, and
//             `monsters.test.mjs` reads the builder table out of that file and
//             proves the list still matches it.
//   `model`   the body the user should make, in one sentence. This is the
//             modelling queue, in the data, rather than in someone's head.
//   `tamable` for animals only: `{ difficulty, food, loyaltyDays }`, where
//             `difficulty` is on Animal Taming's own 0 to 100 (skills.js) and
//             `food` is a real items.js base id.
//   `wave`    'M2', which is what tells the tier band audit which rows are the
//             document's own and which are ours. The bands are computed from
//             the document's rows and every row here has to sit inside them.
//
// Numbers are not invented one at a time. Health and damage sit inside
// `TIER_HP_BAND` and `TIER_DAMAGE_BAND`, which are 0.8x the lowest and 1.2x
// the highest of the document's own rows in that tier, so a new tier 3 row
// cannot quietly be a tier 4 one. Hit and defence sit in the tier's skill
// band as the older rows do. Gold is the tier's, always.

/** The bodies `src/game/monster_models.js` can build today. */
export const BODY_FAMILIES = [
  // above tier 0, from that file's BUILDERS table
  'biped', 'skeleton', 'goblin', 'zombie', 'rat', 'wolf', 'spider', 'grub', 'flyer',
  // tier 0, from its CRITTER_SHAPE table: real animals, not boxes
  'rabbit', 'squirrel', 'deer', 'gull', 'frog', 'crow', 'fieldMouse', 'fox', 'goose', 'hawk',
  // tier 0 and asked for by the user, with no body yet. M2.md says what it needs.
  'whale',
];

/** A tamable row has to be an animal. Nothing dead, built or thinking. */
export const TAMABLE_KINDS = ['beast', 'critter', 'flying'];

// --- Tier 0. The fauna the world already draws, and one that is not a fight.
//
// The fox, the goose and the hawk have finished bodies waiting in
// monster_models.CRITTER_SHAPE with no row behind them; these are those rows.
// The whale is the user's: tier 0, never hostile, and far too big for the
// document's "1 to 8 health", which is what the `huge` tag exempts it from.
critter('fox', 'Fox', 6, 8.0, [1, 2], {
  notes: ['erratic'], family: 'fox',
  model: 'The fox body is already built in monster_models.CRITTER_BODY. Nothing to make.',
  tamable: { difficulty: 20, food: 'game_meat', loyaltyDays: 7 },
  wave: 'M2',
});
critter('goose', 'Goose', 5, 6.0, [2, 6], {
  notes: ['group'], family: 'goose',
  model: 'The goose body is already built in monster_models.CRITTER_BODY. Nothing to make.',
  tamable: { difficulty: 10, food: 'bread', loyaltyDays: 3 },
  wave: 'M2',
});
critter('hawk', 'Hawk', 4, 11.0, [1, 1], {
  notes: ['flying', 'dives'], family: 'hawk',
  model: 'The hawk body is already built in monster_models.CRITTER_BODY. Nothing to make.',
  tamable: { difficulty: 45, food: 'rat_meat', loyaltyDays: 10 },
  wave: 'M2',
});
critter('whale', 'Whale', 900, 5.0, [1, 2], {
  damage: [0, 0], speed: 4.0, kind: 'beast', notes: ['huge', 'coastOnly'],
  lootTable: ['meat', 'thickHide'], family: 'whale',
  model: 'A whale, twenty five metres of it, in the dragon language: one lofted tube, no legs, a fluke that beats up and down rather than side to side, and a blowhole. F1 built this body in the same wave; it passes under a boat and the boat rides its wake.',
  wave: 'M2',
});

// --- Tier 1, the shallow end of two realms (skill 10 to 25, 4 to 12 gold)
M({ id: 'saltCrab', name: 'Salt Crab', tier: 1, hp: 26, damage: [3, 7], speed: 2.8, hit: 18, def: 12, ar: 14, run: 3.2, aggro: 6,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [2, 4], notes: ['coastOnly', 'group', 'sharesAggro', 'grab'],
  lootTable: ['meat', 'hide'], family: 'grub',
  model: 'A crab the size of a dog, white with dried salt, one claw twice the other. It walks sideways and it never walks alone.',
  wave: 'M2' });
M({ id: 'reedStalker', name: 'Reed Stalker', tier: 1, hp: 22, damage: [4, 9], speed: 3.0, hit: 24, def: 20, ar: 4, run: 6.5, aggro: 6,
  kind: 'beast', temperament: 'vermin', flees: 'never', group: [1, 2], notes: ['fenOnly', 'ambush', 'poison1'],
  lootTable: ['meat', 'hide', 'reagent'], family: 'flyer',
  model: 'A heron gone wrong: five feet of grey bird standing in the sedge on one leg, a beak like a spear, and it does not move until you are inside its reach.',
  tamable: { difficulty: 40, food: 'fish', loyaltyDays: 5 },
  wave: 'M2' });

// --- Tier 2, the Legion's rank and file and the shore (skill 30 to 45)
M({ id: 'legionSoldier', name: 'Legion Soldier', tier: 2, hp: 62, damage: [8, 14], speed: 2.6, hit: 42, def: 36, ar: 20, run: 5.8, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 4], notes: ['group', 'sharesAggro', 'shield', 'shieldWall', 'warCry'],
  lootTable: ['shortsword', 'kite', 'helm', 'boots'], family: 'biped',
  model: 'A man in the Legion\'s black and brass: mail, a square shield with the nine skulls on it, a short sword. He is not a monster and he does not fight like one.',
  wave: 'M2' });
M({ id: 'legionArcher', name: 'Legion Archer', tier: 2, hp: 50, damage: [7, 13], speed: 2.4, hit: 44, def: 40, ar: 12, run: 6.2, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro', 'bow'],
  lootTable: ['dagger', 'tunic', 'boots'], family: 'biped',
  model: 'The same man in half the armour with a longbow and a quiver at the hip, standing behind the shields and stepping back when you close.',
  wave: 'M2' });
M({ id: 'raider', name: 'Raider', tier: 2, hp: 58, damage: [8, 15], speed: 2.5, hit: 43, def: 38, ar: 14, run: 6.4, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 4], notes: ['group', 'sharesAggro', 'coinPurse', 'charges'],
  lootTable: ['axe', 'rapier', 'boots', 'ring'], family: 'biped',
  model: 'A Ridge Rider: desert cloth over stolen Legion mail, a scarf across the face, an axe taken off a convoy guard. They come at a run and they come from three sides.',
  wave: 'M2' });
M({ id: 'muskOx', name: 'Musk Ox', tier: 2, hp: 80, damage: [9, 16], speed: 3.4, hit: 30, def: 22, ar: 18, run: 6.0, aggro: 8,
  kind: 'beast', temperament: 'vermin', flees: 'never', group: [3, 6], notes: ['snowOnly', 'charges', 'group'],
  lootTable: ['meat', 'thickHide'], family: 'wolf',
  model: 'A wall of hair on four short legs, horns that meet in a helmet across the brow, and it stands its ground in a ring around its young.',
  tamable: { difficulty: 50, food: 'nettle', loyaltyDays: 14 },
  wave: 'M2' });
M({ id: 'coralCrab', name: 'Coral Crab', tier: 2, hp: 46, damage: [7, 12], speed: 2.6, hit: 36, def: 30, ar: 22, run: 3.6, aggro: 8,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [2, 4], notes: ['coastOnly', 'group', 'poison1'],
  lootTable: ['meat', 'hide', 'gem'], family: 'grub',
  model: 'A crab that has grown its shell out of the reef: live coral in pink and white across its back, and it is beautiful right up until it opens.',
  wave: 'M2' });
M({ id: 'wisp', name: 'Will o\' Wisp', tier: 2, hp: 34, damage: [6, 12], speed: 2.0, hit: 44, def: 45, ar: 0, run: 7.0, aggro: 12,
  // M5 took `fenOnly` off it. The tag was a placement guard and nothing else,
  // and it was the one thing keeping a light over standing water out of the
  // Greenwold's water meadow and off a chapel with a river over its roof. Where
  // it lives is the lists below, which is where it always really was.
  kind: 'elemental', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['flying', 'erratic', 'casts', 'incorporeal50'],
  lootTable: ['reagent', 'gem'], family: 'flyer',
  model: 'A light over the water with nothing holding it up, the size of a lantern, one colour if it means to lead you home and another if it does not.',
  wave: 'M2' });

// --- Tier 3, the middle of the world (skill 50 to 65, 30 to 80 gold)
M({ id: 'blossomSpider', name: 'Blossom Spider', tier: 3, hp: 95, damage: [11, 19], speed: 2.0, hit: 58, def: 55, ar: 10, run: 7.5, aggro: 12,
  kind: 'vermin', temperament: 'normal', flees: 'never', group: [2, 4], notes: ['poison2', 'webRoot2', 'dropsFromAbove', 'group'],
  lootTable: ['reagent', 'hide', 'gem'], family: 'spider',
  model: 'A spider that has taken the canopy\'s colours: pink and cream across the back like fallen blossom, which is exactly what it looks like on the branch above the path.',
  wave: 'M2' });
M({ id: 'canopyHarpy', name: 'Canopy Harpy', tier: 3, hp: 78, damage: [10, 18], speed: 2.0, hit: 62, def: 60, ar: 8, run: 10.5, aggro: 18,
  kind: 'flying', temperament: 'hunter', flees: 'never', group: [2, 3], notes: ['flying', 'dives', 'silence3', 'group'],
  lootTable: ['meat', 'reagent', 'amulet'], family: 'flyer',
  model: 'The cliff harpy grown for the canopy: longer wings, feet made for branches, feathers in the greens of the Deep, and it comes down the gap between two trunks like a thrown knife.',
  wave: 'M2' });
M({ id: 'cultistAdept', name: 'Cultist Adept', tier: 3, hp: 92, damage: [10, 17], speed: 2.5, hit: 60, def: 50, ar: 10, run: 5.5, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [1, 3], notes: ['casts', 'hex', 'group', 'sharesAggro'],
  lootTable: ['robe', 'quarterstaff', 'scroll', 'reagent'], family: 'biped',
  model: 'A cultist who has been at it long enough to be given the good robe: brass at the collar, the mark burned rather than inked, and a staff he uses as a staff.',
  wave: 'M2' });
M({ id: 'fenWitch', name: 'Fen Witch', tier: 3, hp: 86, damage: [9, 16], speed: 2.4, hit: 62, def: 58, ar: 6, run: 5.0, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['fenOnly', 'casts', 'hex', 'poison2', 'summons'],
  summons: { id: 'wisp', count: 2 },
  lootTable: ['robe', 'reagent', 'scroll', 'ring'], family: 'biped',
  model: 'An old woman standing in water to the knee who has not been cold in forty years. Sedge in her hair on purpose. Two lights come when she calls them.',
  wave: 'M2' });
M({ id: 'emberDrake', name: 'Ember Drake', tier: 3, hp: 130, damage: [14, 24], speed: 2.8, hit: 60, def: 55, ar: 20, run: 10.0, aggro: 18,
  kind: 'flying', temperament: 'hunter', flees: 'never', group: [1, 2], notes: ['flying', 'breath', 'fireImmune'],
  lootTable: ['scaledHide', 'reagent', 'gem'], family: 'flyer',
  model: 'A drake the size of a hound with wings, scales the colour of a coal that has been on the fire an hour, and it lands on hot rock because hot rock is comfortable.',
  tamable: { difficulty: 90, food: 'emberite_ore', loyaltyDays: 30 },
  wave: 'M2' });
M({ id: 'legionChaplain', name: 'Legion Chaplain', tier: 3, hp: 88, damage: [9, 16], speed: 2.6, hit: 58, def: 52, ar: 14, run: 5.4, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['casts', 'healsAllies', 'group'],
  lootTable: ['robe', 'quarterstaff', 'scroll', 'amulet'], family: 'biped',
  model: 'Clean robes in a filthy country, a brass cup on a chain, and a voice that carries over a shield wall. Kill her last and the wall never falls; kill her first and it does.',
  wave: 'M2' });
M({ id: 'legionSapper', name: 'Legion Sapper', tier: 3, hp: 105, damage: [12, 20], speed: 3.0, hit: 55, def: 45, ar: 18, run: 5.6, aggro: 12,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro', 'powderCharge', 'knockback'],
  lootTable: ['warhammer', 'ingot', 'helm', 'boots'], family: 'biped',
  model: 'The men who cut the Legion\'s way through a glacier: leather aprons, goggles pushed up, a sledge in both hands and a satchel of charges nobody sane stands beside.',
  wave: 'M2' });
M({ id: 'cairnWight', name: 'Cairn Wight', tier: 3, hp: 100, damage: [12, 21], speed: 2.8, hit: 58, def: 50, ar: 16, run: 5.0, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [1, 3], notes: ['undead', 'holyWeak', 'manaDrain', 'ambush'],
  lootTable: ['bone', 'longsword', 'ring'], family: 'skeleton',
  model: 'A rider who was buried under a cairn on the road up and is still in the mail he was buried in, stones and all, standing inside his own heap until you pass it.',
  wave: 'M2' });
M({ id: 'boneHound', name: 'Bone Hound', tier: 3, hp: 76, damage: [11, 19], speed: 2.2, hit: 60, def: 52, ar: 10, run: 9.5, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [3, 5], notes: ['undead', 'holyWeak', 'group', 'sharesAggro', 'howl'],
  lootTable: ['bone', 'reagent'], family: 'wolf',
  model: 'A hound with no meat left on it that still runs like a hound, and the pack of them makes a noise across the ash that carries a mile.',
  wave: 'M2' });
M({ id: 'marrowGhoul', name: 'Marrow Ghoul', tier: 3, hp: 110, damage: [13, 22], speed: 2.6, hit: 56, def: 44, ar: 14, run: 6.0, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['undead', 'holyWeak', 'disease10', 'paralyse15'],
  lootTable: ['bone', 'reagent', 'greaves'], family: 'zombie',
  model: 'A ghoul that has been living inside a dragon\'s thighbone eating what grows in marrow. Grey, swollen, and it leaves prints of the stuff.',
  wave: 'M2' });
M({ id: 'frostWolf', name: 'Frost Wolf', tier: 3, hp: 105, damage: [13, 22], speed: 2.1, hit: 60, def: 55, ar: 14, run: 9.8, aggro: 16,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [3, 5], notes: ['snowOnly', 'group', 'alpha', 'frostNova'],
  lootTable: ['meat', 'thickHide'], family: 'wolf',
  model: 'A white wolf a head taller than a dire wolf with rime in the guard hairs, and the air in front of its mouth goes to fog and stays there.',
  tamable: { difficulty: 70, food: 'venison', loyaltyDays: 21 },
  wave: 'M2' });
M({ id: 'drownedMarine', name: 'Drowned Marine', tier: 3, hp: 115, damage: [12, 21], speed: 3.0, hit: 56, def: 46, ar: 22, run: 4.2, aggro: 12,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [2, 4], notes: ['undead', 'holyWeak', 'coastOnly', 'group', 'sharesAggro', 'shield', 'shieldWall'],
  lootTable: ['bone', 'rapier', 'kite', 'breastplate'], family: 'zombie',
  model: 'A soldier of the Sunken Kingdom still in his rank: white marble scale gone green, a tower shield, and three thousand years of standing in a line together.',
  wave: 'M2' });
M({ id: 'reefEel', name: 'Reef Eel', tier: 3, hp: 70, damage: [12, 20], speed: 2.0, hit: 62, def: 60, ar: 8, run: 8.0, aggro: 6,
  kind: 'vermin', temperament: 'vermin', flees: 'never', group: [1, 3], notes: ['coastOnly', 'ambush', 'stormCall'],
  lootTable: ['meat', 'hide', 'reagent'], family: 'grub',
  model: 'Two metres of eel in a hole in the coral with its head out and its mouth open, and the water around it prickles before it strikes.',
  wave: 'M2' });
M({ id: 'cinderImp', name: 'Cinder Imp', tier: 3, hp: 68, damage: [10, 18], speed: 2.0, hit: 58, def: 58, ar: 6, run: 8.5, aggro: 12,
  kind: 'flying', temperament: 'normal', flees: 'never', group: [3, 6], notes: ['flying', 'erratic', 'casts', 'fireImmune', 'group'],
  lootTable: ['reagent', 'ore', 'gem'], family: 'flyer',
  model: 'A hand span of glowing grit in the shape of a small angry man with bat wings, trailing sparks, and there are never fewer than three.',
  wave: 'M2' });

// --- Tier 4, elites (skill 70 to 85, 80 to 250 gold)
M({ id: 'templeGuardian', name: 'Temple Guardian', tier: 4, hp: 380, damage: [28, 46], speed: 4.0, hit: 70, def: 35, ar: 52, run: 4.0, aggro: 10,
  kind: 'construct', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['immunePoison', 'energyWeak', 'awakens', 'knockback', 'groundSlam'],
  lootTable: ['ingot', 'ore', 'gem'], family: 'biped',
  model: 'One of the hundred carved faces with a body under it: eight feet of dark temple stone, vines still on the shoulders, standing in a niche you have already walked past twice.',
  wave: 'M2' });
M({ id: 'brassSentinel', name: 'Brass Sentinel', tier: 4, hp: 340, damage: [26, 44], speed: 3.8, hit: 72, def: 40, ar: 46, run: 4.8, aggro: 12,
  kind: 'construct', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['immunePoison', 'energyWeak', 'breath', 'group', 'sharesAggro'],
  lootTable: ['ingot', 'ore', 'gem'], family: 'biped',
  model: 'The Brass City\'s own guard: a furnace with legs, riveted brass over a red glow, a grille for a face, and it vents what it is full of when you get in front of it.',
  wave: 'M2' });
M({ id: 'legionKnight', name: 'Legion Knight', tier: 4, hp: 300, damage: [26, 42], speed: 3.0, hit: 80, def: 70, ar: 46, run: 5.2, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [1, 3], notes: ['plate', 'parries', 'swordAndShield', 'shieldWall', 'group', 'sharesAggro', 'warCry'],
  lootTable: ['longsword', 'kite', 'breastplate', 'helm'], family: 'biped',
  model: 'Full Legion plate, black and brass, the nine skulls raised on the breast, visor down. He fights the way the Eyrie taught the Legion to fight, which is the joke.',
  wave: 'M2' });
M({ id: 'riderWraith', name: 'Rider Wraith', tier: 4, hp: 200, damage: [20, 34], speed: 2.4, hit: 80, def: 78, ar: 12, run: 7.5, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 2], notes: ['undead', 'holyWeak', 'incorporeal50', 'manaDrain', 'ashCloud'],
  lootTable: ['scroll', 'reagent', 'amulet', 'ring'], family: 'skeleton',
  model: 'A dragonrider in the shape the ash keeps: a rider\'s coat and harness with nothing in them, the buckles still done up, and it counts under its breath.',
  wave: 'M2' });
M({ id: 'iceTroll', name: 'Ice Troll', tier: 4, hp: 420, damage: [30, 50], speed: 4.0, hit: 70, def: 38, ar: 34, run: 4.8, aggro: 12,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['snowOnly', 'regen3', 'burnStopsRegen', 'fireWeak', 'coldImmune', 'knockback'],
  lootTable: ['thickHide', 'reagent', 'gem'], family: 'biped',
  model: 'The mire troll\'s northern cousin: blue-white, gaunt rather than fat, ice grown into the hide in plates, and it knits itself back together unless something is burning it.',
  wave: 'M2' });
M({ id: 'mammoth', name: 'Mammoth', tier: 4, hp: 480, damage: [30, 52], speed: 4.4, hit: 66, def: 30, ar: 36, run: 7.5, aggro: 10,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [2, 4], notes: ['snowOnly', 'charges', 'knockback', 'group', 'thickHide'],
  lootTable: ['meat', 'thickHide', 'bone'], family: 'wolf',
  model: 'Four metres at the shoulder under a coat that reaches the snow, tusks that cross at the tips, and a herd of them turning together is the loudest thing in Frostreach.',
  tamable: { difficulty: 85, food: 'nettle', loyaltyDays: 30 },
  wave: 'M2' });
M({ id: 'lavaHound', name: 'Lava Hound', tier: 4, hp: 260, damage: [24, 40], speed: 2.2, hit: 78, def: 66, ar: 24, run: 10.5, aggro: 18,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [2, 4], notes: ['fireImmune', 'breath', 'charges', 'group'],
  lootTable: ['scaledHide', 'reagent', 'gem'], family: 'wolf',
  model: 'A hound of cooled crust with the red still showing in the cracks, and where it has been standing the rock stays soft.',
  tamable: { difficulty: 88, food: 'voidrock_ore', loyaltyDays: 21 },
  wave: 'M2' });
M({ id: 'ashWraith', name: 'Ash Wraith', tier: 4, hp: 190, damage: [19, 32], speed: 2.4, hit: 78, def: 76, ar: 8, run: 7.0, aggro: 16,
  kind: 'undead', temperament: 'hunter', flees: 'never', group: [1, 2], notes: ['undead', 'holyWeak', 'incorporeal50', 'ashCloud', 'silence3'],
  lootTable: ['scroll', 'reagent', 'ring', 'amulet'], family: 'skeleton',
  model: 'A column of hanging ash with a shape in it, and it leaves footprints of melted glass on the slope behind it.',
  wave: 'M2' });
M({ id: 'sandworm', name: 'Sandworm', tier: 4, hp: 460, damage: [32, 55], speed: 4.2, hit: 72, def: 30, ar: 40, run: 8.0, aggro: 14,
  kind: 'vermin', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['burrows', 'grab', 'immunePoison', 'tailSweep'],
  lootTable: ['scaledHide', 'reagent', 'gem'], family: 'grub',
  model: 'Ten metres of segmented worm that comes out of a dune vertically, a mouth of rings, no eyes at all. It hears the dunes sing and it answers a tone lower.',
  wave: 'M2' });

// --- Tier 5, champions (skill 90 to 100, 250 to 800 gold, loot twice)
M({ id: 'kraken', name: 'Kraken', tier: 5, hp: 1250, damage: [52, 88], speed: 3.4, hit: 92, def: 60, ar: 40, run: 7.0, aggro: 22,
  kind: 'beast', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['coastOnly', 'grab', 'tailSweep', 'knockback', 'lootTwice', 'champion'],
  lootTable: ['meat', 'scaledHide', 'gem', 'reagent'], family: 'spider',
  model: 'The water goes black under the hull and then eight arms come over the rail. The body never fully surfaces and one eye the size of a barrel does.',
  wave: 'M2' });
M({ id: 'seaWyrm', name: 'Sea Wyrm', tier: 5, hp: 1150, damage: [46, 76], speed: 2.4, hit: 90, def: 62, ar: 38, run: 6.5, aggro: 14,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['coastOnly', 'threeHeads', 'regrows', 'grab', 'lootTwice', 'champion'],
  lootTable: ['scaledHide', 'reagent', 'gem'], family: 'wolf',
  model: 'Thalassa\'s kin: a serpent long enough to lie around a sea cave twice, three heads on one neck that splits, and the light in the Sunken Kingdom is what their eggs left behind.',
  wave: 'M2' });
M({ id: 'stormWyvern', name: 'Storm Wyvern', tier: 5, hp: 760, damage: [48, 78], speed: 2.8, hit: 94, def: 78, ar: 30, run: 12.0, aggro: 24,
  kind: 'flying', temperament: 'hunter', flees: 'never', group: [1, 1], notes: ['flying', 'stormCall', 'dives', 'knockback', 'lootTwice', 'champion'],
  lootTable: ['scaledHide', 'reagent', 'gem', 'amulet'], family: 'flyer',
  model: 'A wyvern that has lived on the lightning peak long enough to be scarred by it: black, with the old strikes across the wings in white, and it rides the front of the storm rather than sheltering from it.',
  wave: 'M2' });
M({ id: 'glacierGolem', name: 'Glacier Golem', tier: 5, hp: 900, damage: [50, 80], speed: 4.6, hit: 88, def: 40, ar: 62, run: 3.6, aggro: 12,
  kind: 'construct', temperament: 'normal', flees: 'never', group: [1, 1], notes: ['snowOnly', 'immunePoison', 'coldImmune', 'fireWeak', 'frostNova', 'groundSlam', 'knockback', 'lootTwice', 'champion'],
  lootTable: ['ingot', 'ore', 'gem'], family: 'biped',
  model: 'Glacier ice with a thousand years of grit and gravel in it, walking. Blue where it is thick, and you can see the shapes of things it has closed over.',
  wave: 'M2' });
M({ id: 'glassWyvern', name: 'Glass Wyvern', tier: 5, hp: 700, damage: [44, 72], speed: 2.6, hit: 92, def: 80, ar: 34, run: 11.5, aggro: 22,
  kind: 'flying', temperament: 'hunter', flees: 'never', group: [1, 2], notes: ['flying', 'rangedSpikes', 'dives', 'fireImmune', 'lootTwice', 'champion'],
  lootTable: ['scaledHide', 'reagent', 'gem'], family: 'flyer',
  model: 'A wyvern hatched on the volcano\'s black glass and made of it: obsidian scales that ring, wings you can half see through, and it sheds them at you.',
  tamable: { difficulty: 95, food: 'gem', loyaltyDays: 30 },
  wave: 'M2' });

// ===========================================================================
// Wave M5: the Greenwold has more in it, and more kinds of it.
//
// The complaint was "we dont have much variety of monsters, or enough monsters
// in the game". The first half of that is the densities above. This is the
// second half: nine things the first realm's own sentences already promise and
// that nothing was standing up.
//
// Every row here is tier 1 or tier 2, because the Greenwold's danger band in
// `src/mmo/realms.js` is [1, 2] and `spawnsForChunk` re-rolls anything over it
// in open country. Every one of them is placed in HABITAT and in at least one
// named place below, so it is met by walking and not only by reading. Every
// one borrows a body `src/game/monster_models.js` builds today, and carries
// the size and the colour that tell it from the rest of its family: see
// MONSTER_SCALE and MONSTER_TINT in that file.
//
// The other three the wave adds are not rows at all, because the rows already
// existed and nothing had put them anywhere a player walks: the Giant Spider
// and the Goblin Warrior go into the Beech Hangar at night, and the Will o'
// Wisp comes off `fenOnly` and onto the Greenwold's wet ground, the water
// meadow of the Mill Run and the Sunken Chapel.

// --- Tier 1, wave M5 (skill 10 to 25, 4 to 12 gold)
M({ id: 'wildDog', name: 'Wild Dog', tier: 1, hp: 26, damage: [3, 7], speed: 2.4, hit: 22, def: 22, ar: 3, run: 7.5, aggro: 12,
  kind: 'beast', temperament: 'normal', flees: 'never', group: [3, 5], notes: ['group', 'sharesAggro', 'howl'],
  lootTable: ['meat', 'hide'], family: 'wolf',
  model: 'Somebody\'s dogs, three farms and two winters ago: a lurcher, a collie and whatever the collie had. Ribs showing, tails down, and they work a field the way they were taught to work sheep.',
  wave: 'M5' });
M({ id: 'badger', name: 'Badger', tier: 1, hp: 34, damage: [4, 9], speed: 3.0, hit: 20, def: 16, ar: 10, run: 5.2, aggro: 6,
  kind: 'beast', temperament: 'vermin', flees: 'never', group: [1, 2], notes: ['nightOnly', 'awakens', 'thickHide'],
  lootTable: ['meat', 'hide'], family: 'wolf',
  model: 'A metre of muscle and grey bristle with a striped head, out of a sett under the beech roots after dark. It will let you walk past. It will not let you walk over.',
  tamable: { difficulty: 60, food: 'game_meat', loyaltyDays: 7 },
  wave: 'M5' });

// --- Tier 2, wave M5 (skill 30 to 45, 12 to 30 gold)
M({ id: 'banditArcher', name: 'Bandit Archer', tier: 2, hp: 46, damage: [7, 12], speed: 2.5, hit: 41, def: 40, ar: 10, run: 6.2, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro', 'bow'],
  lootTable: ['dagger', 'throwingKnives', 'boots', 'hide'], family: 'biped',
  model: 'A poacher who took the other work: a hunting bow, a hood, no armour worth the name, up on the lip of the hollow while the rest of them are down in it.',
  wave: 'M5' });
M({ id: 'highwayman', name: 'Highwayman', tier: 2, hp: 60, damage: [9, 15], speed: 2.6, hit: 44, def: 42, ar: 16, run: 6.5, aggro: 14,
  kind: 'humanoid', temperament: 'normal', flees: 'never', group: [2, 3], notes: ['group', 'sharesAggro', 'coinPurse', 'ambush'],
  purse: 2.5,
  lootTable: ['rapier', 'cloak', 'ring', 'boots'], family: 'biped',
  model: 'A bandit who has done well: a good coat off a merchant, a rapier off a guard, boots that fit, and a scarf up over the face because the Kingsroad has a bounty board at both ends of it.',
  wave: 'M5' });
M({ id: 'scarecrow', name: 'Scarecrow', tier: 2, hp: 58, damage: [8, 14], speed: 3.4, hit: 32, def: 12, ar: 6, run: 3.6, aggro: 10,
  kind: 'undead', temperament: 'normal', flees: 'never', group: [1, 2], notes: ['undead', 'holyWeak', 'fireWeak', 'nightOnly', 'awakens'],
  lootTable: ['bone', 'tunic', 'wood'], family: 'biped',
  model: 'The one in the far field, on its pole, in Wynn Ashby\'s old coat. In daylight it is a scarecrow. After dark it is still a scarecrow until you are four metres from it, and then it comes down off the pole.',
  wave: 'M5' });

// --- Bosses. "one per dungeon level 3, one per named crater: 2,000 to 4,000
// health, unique abilities, phase changes at 66% and 33%, always drop a purple
// or better, 800 to 3,000 gold". The document names the four; their combat
// numbers are authored inside the tier 5 band.
//
// A boss is read against its REALM, not against tier 6.
//
// The document's band is the dungeon level 3 boss: 2,000 to 4,000 health, 800
// to 3,000 gold, skill 90 to 100. That is the right band for the last dungeon
// in the world and the wrong one for the first. Sergeant Oram Blackhand stands
// in a cellar under a mill in the safest realm there is, and a player who has
// been alive for an hour has a 20 skill and forty health: a 2,000 health boss
// hitting at 98 is not a fight, it is a wall with a name, and 3,000 gold in the
// first hour is the economy over.
//
// So every boss carries a `rank`, which is its realm's own danger (realms.js
// `danger`, the higher of the two), and health, gold and the skill band are
// read from the rank. Rank 5 IS the document's band, which is where the four
// bosses that were already here sit, so not one of their numbers moves.
export const BOSS_HP_BY_RANK = {
  1: [300, 600], 2: [600, 1200], 3: [1200, 1800], 4: [1800, 2600],
  5: [2600, 4000],    // the document's own 2,000 to 4,000, at its top end
  6: [3400, 4000],    // Malachar, and nothing else, ever
};
export const BOSS_GOLD_BY_RANK = {
  1: [60, 180], 2: [150, 450], 3: [400, 1200],
  4: [800, 3000], 5: [800, 3000],   // the document's own
  6: [1200, 4000],
};
export const DEFAULT_BOSS_RANK = 5;

const boss = (r) => M({
  tier: 6, boss: true, phases: BOSS_PHASES.slice(), temperament: 'boss', aggro: 25,
  flees: 'never', group: [1, 1], authored: true, rank: DEFAULT_BOSS_RANK, ...r,
  speed: r.speed * .82, run: r.cellarBoss ? r.run : r.run * 1.12,
  gold: r.gold || BOSS_GOLD_BY_RANK[r.rank || DEFAULT_BOSS_RANK].slice(),
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

// --- Wave A, M2: the twelve bosses the realms name.
//
// One per realm dungeon out of `src/mmo/realms.js`, plus the two the sheet has
// walking around loose. Each carries `lair`, the place id it is found in, and
// the wandering two carry `route`, the places they walk between; `PLACE_IDS`
// below is the list those are checked against and `monsters.test.mjs` proves
// that list against realms.js itself.
//
// Two to three abilities each, and every one of them is a tag out of
// NOTE_TAG_MEANING rather than a sentence nothing reads. Where a tag is new
// this wave, `docs/mmo/wiring/M2.md` carries the rule it needs in
// src/game/monsters.js, and the row also carries at least one tag that already
// works, so a boss is never inert while it waits.
boss({ id: 'oramBlackhand', name: 'Sergeant Oram Blackhand', rank: 1, lair: 'oldcellars',
  hp: 520, damage: [5, 11], speed: 2.4, hit: 25, def: 24, ar: 16, run: 6.0,
  kind: 'humanoid', notes: ['coinPurse', 'warCry', 'summons', 'charges'],
  summons: { id: 'goblinWarrior', count: 2 },
  lootTable: ['longsword', 'breastplate', 'ring', 'boots'], family: 'biped',
  model: 'A bandit wearing half a Legion uniform he was given last month and has not earned: black coat, brass gorget, a sack of eggshell at his belt he will not put down even to fight.' , wave: 'M2' });
boss({ id: 'keeperOfFaces', name: 'the Keeper of Faces', rank: 2, lair: 'templeoffaces_deep',
  hp: 1050, damage: [9, 17], speed: 2.4, hit: 45, def: 45, ar: 10, run: 6.5,
  kind: 'undead', notes: ['undead', 'holyWeak', 'incorporeal50', 'casts', 'silence3', 'summons'],
  summons: { id: 'giantSpider', count: 2 },
  lootTable: ['scroll', 'reagent', 'amulet', 'ring'], family: 'skeleton',
  model: 'The temple\'s last priest, still in the robe, with no face of his own left: the hundred on the wall behind him take turns wearing his.' , wave: 'M2' });
boss({ id: 'thalassa', name: 'Thalassa the Sea-Wyrm', rank: 2, lair: 'leviathansrest',
  hp: 1200, damage: [10, 18], speed: 2.6, hit: 44, def: 40, ar: 24, run: 6.0,
  kind: 'beast', notes: ['coastOnly', 'threeHeads', 'regrows', 'grab', 'tailSweep'],
  lootTable: ['scaledHide', 'reagent', 'gem', 'amulet'], family: 'wolf',
  model: 'The last sea-wyrm, old, filling the cave, her three heads on one splitting neck and her eyes on the dragon rather than on you. She is only fought if you came without Aldo.' , wave: 'M2' });
boss({ id: 'brassHeart', name: 'the Brass Heart', rank: 3, lair: 'firstfire',
  hp: 1800, damage: [16, 38], speed: 4.2, hit: 62, def: 30, ar: 60, run: 3.4,
  kind: 'construct', notes: ['immunePoison', 'energyWeak', 'groundSlam', 'knockback', 'stun', 'breath'],
  lootTable: ['ingot', 'ore', 'gem', 'maul'], family: 'biped',
  model: 'An iron golem the size of a house with a furnace where a chest goes and the crater\'s own fire in it. Isk built the body. Malachar bent what is inside it.' , wave: 'M2' });
boss({ id: 'theLibrarian', name: 'the Librarian', rank: 3, lair: 'buriedlibrary',
  hp: 1300, damage: [14, 32], speed: 3.2, hit: 64, def: 55, ar: 26, run: 5.0,
  kind: 'humanoid', notes: ['boulder', 'casts', 'hex', 'summons'],
  summons: { id: 'cairnWight', count: 2 },
  lootTable: ['scroll', 'reagent', 'gem', 'quarterstaff'], family: 'biped',
  model: 'A cyclops in the rags of a scholar\'s robe, one enormous eye and a pair of spectacles ground for it, throwing masonry with one hand and holding its place in a book with the other.' , wave: 'M2' });
boss({ id: 'wardenHask', name: 'Warden Hask', rank: 4, lair: 'eyrieroost',
  hp: 2200, damage: [20, 45], speed: 3.4, hit: 82, def: 60, ar: 42, run: 5.0,
  kind: 'humanoid', notes: ['knockback', 'groundSlam', 'stun', 'warCry', 'summons'],
  summons: { id: 'ogre', count: 2 },
  lootTable: ['maul', 'breastplate', 'gem', 'ingot'], family: 'biped',
  model: 'The Legion\'s ogre-keeper: a big man made bigger by what he keeps, mail sewn onto leather, a goad in one hand and a maul in the other, standing where the ghosts will not let him past.' , wave: 'M2' });
boss({ id: 'huntmasterGallow', name: 'Huntmaster Gallow', rank: 4, lair: 'skulllodge_throat',
  hp: 2000, damage: [22, 46], speed: 2.6, hit: 84, def: 74, ar: 34, run: 7.0,
  kind: 'humanoid', notes: ['bow', 'howl', 'coinPurse', 'summons'],
  summons: { id: 'boneHound', count: 2 },
  lootTable: ['longsword', 'cloak', 'ring', 'amulet'], family: 'biped',
  model: 'Malachar\'s oldest friend in a coat made of nine hides, a bow he strung before you were born, and a whistle on a cord that brings the hounds up the throat behind you.' , wave: 'M2' });
boss({ id: 'legateOssory', name: 'Legate Ossory', rank: 4, lair: 'icevault_deep',
  hp: 2400, damage: [24, 48], speed: 3.0, hit: 82, def: 72, ar: 52, run: 4.8,
  kind: 'humanoid', notes: ['snowOnly', 'plate', 'parries', 'swordAndShield', 'shieldWall', 'warCry', 'summons'],
  summons: { id: 'legionKnight', count: 2 },
  lootTable: ['greatsword', 'tower', 'breastplate', 'gem'], family: 'biped',
  model: 'Seventy years old in rimesteel plate that fits him, helm under one arm until the moment it is not, a decent man at the head of an indecent army and he knows it.' , wave: 'M2' });
boss({ id: 'kingCaradoc', name: 'King Caradoc the Drowned', rank: 5, lair: 'drownedpalace',
  hp: 3000, damage: [50, 80], speed: 2.8, hit: 96, def: 82, ar: 44, run: 5.4,
  kind: 'undead', notes: ['undead', 'holyWeak', 'coastOnly', 'lifeLeech30', 'casts', 'summons'],
  summons: { id: 'drownedMarine', count: 2 },
  lootTable: ['longsword', 'kite', 'breastplate', 'gem'], family: 'zombie',
  model: 'Three thousand years of king, white marble armour gone green at the joints, walking up a stair out of the sea every dusk. He is only fought if you lie to him about Thalassa.' , wave: 'M2' });
boss({ id: 'malachar', name: 'Malachar, the Wyrmking', rank: 6, lair: 'throneofash',
  hp: 4000, damage: [58, 95], speed: 2.4, hit: 100, def: 92, ar: 58, run: 8.0,
  kind: 'humanoid', notes: ['plate', 'parries', 'breath', 'dragonTime', 'lifeLeech30', 'summons'],
  summons: { id: 'boneKnight', count: 2 },
  lootTable: ['greatsword', 'breastplate', 'gem', 'amulet'], family: 'biped',
  model: 'A knight of the Eyrie who never took the armour off and has worn it for a thousand years: black plate with nine hearts\' worth of fire behind the eye slot. Three phases: the knight who fights like Skyward taught him, the Wyrmking who does not need to, and the man underneath.' , wave: 'M2' });
boss({ id: 'noon', name: 'Noon the Manticore', rank: 3, lair: 'glassroad',
  route: ['glassroad', 'saltpans', 'singingdunes', 'embercut'],
  hp: 1500, damage: [15, 36], speed: 2.6, hit: 64, def: 60, ar: 24, run: 9.5,
  kind: 'beast', notes: ['rangedSpikes', 'charges', 'noonOnly', 'wanders'],
  lootTable: ['scaledHide', 'reagent', 'gem'], family: 'wolf',
  model: 'A manticore the colour of the red rock he sleeps on, scarred across the muzzle, and the Ashwalkers set their day by him because he hunts at midday and at no other hour.' , wave: 'M2' });
boss({ id: 'rimemouth', name: 'Rimemouth', rank: 4, lair: 'whitepines',
  route: ['whitepines', 'mammothsteppe', 'longnightcamp', 'hotsprings'],
  hp: 1900, damage: [20, 42], speed: 2.0, hit: 80, def: 74, ar: 26, run: 10.5,
  kind: 'beast', notes: ['snowOnly', 'alpha', 'howl', 'frostNova', 'wanders'],
  lootTable: ['meat', 'thickHide', 'gem'], family: 'wolf',
  model: 'The White Pack\'s leader, a dire wolf half again the size of one, frost grown into the coat in plates, and on the full moon he comes out into the open and waits to be answered.' , wave: 'M2' });

registerOreElementals(rows);
registerCellarCreatures(rows);
registerCellarBosses(boss);

// Gold comes from the tier unless a row overrides it.
for (const r of rows) if (!r.gold) r.gold = TIERS[r.tier].gold.slice();

export const MONSTER_LIST = rows;
export const MONSTERS = Object.fromEntries(rows.map((m) => [m.id, m]));
// the training yard's two bodies are in no document: they are furniture that takes a hit
for (const m of rows) if (!m.notes.includes('dummy') && !getCellarBoss(m.id)) DOC_REFS.monsters[m.id] = m.name.replace(/^the /, '');

export const BOSSES = rows.filter((m) => m.boss);
/**
 * Four in the document, twelve realm bosses and the authored Cellars descent. This is
 * pinned so a boss cannot be lost in an edit and nobody notice.
 */
export const EXPECTED_BOSSES = 16 + CELLAR_BOSSES.length;
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
const T1 = ['giantRat', 'caveBat', 'skeleton', 'zombie', 'goblinScout', 'thornGrub', 'wildDog'];
const T2 = ['wolf', 'boar', 'skeletonWarrior', 'goblinWarrior', 'bandit', 'giantSpider', 'banditArcher', 'highwayman'];
const T3 = ['direWolf', 'orc', 'ghoul', 'hobgoblin', 'harpy', 'stonebackBear', 'cultist', 'mireTroll'];
const T4 = ['ogre', 'wraith', 'ironGolem', 'wyvern', 'boneKnight', 'manticore', 'vampireKnight'];

// Wave A adds its rows to the same biomes, minus the ones a tag bars. A row
// tagged fenOnly, snowOnly or coastOnly is not written into a list it cannot
// legally stand in; the audit below proves it, in both directions.
const T1N = ['saltCrab', 'reedStalker'];
const T2N = ['legionSoldier', 'legionArcher', 'raider', 'muskOx', 'coralCrab', 'wisp'];
const T3N = ['blossomSpider', 'canopyHarpy', 'cultistAdept', 'fenWitch', 'emberDrake', 'legionChaplain',
  'legionSapper', 'cairnWight', 'boneHound', 'marrowGhoul', 'frostWolf', 'drownedMarine', 'reefEel', 'cinderImp'];
const T4N = ['templeGuardian', 'brassSentinel', 'legionKnight', 'riderWraith', 'iceTroll', 'mammoth',
  'lavaHound', 'ashWraith', 'sandworm'];
// The four that are only ever met where the sheet says they are.
const T5N = ['kraken', 'seaWyrm', 'stormWyvern', 'glacierGolem', 'glassWyvern'];
/** Rows a dungeon may hold: nothing gated to a biome the dungeon is not in. */
const undergroundOf = (list) => list.filter((id) => {
  const n = MONSTERS[id].notes;
  return !n.includes('snowOnly') && !n.includes('fenOnly');
});

export const HABITAT = {
  // "meadow, day: rats, boars, bandits on roads, goblin scouts near ruins"
  // "meadow, night: wolves, skeletons rising near ruins and shrines, zombies"
  // Wave A: the Kingsroad is the Legion's road, so the Legion walks on it.
  // M5 widened both lists. Seven rows by day and six by night over four
  // thousand chunks of the Greenwold meant a walk met the same six things; the
  // wave adds the dogs and the archers to the day, and the fox, the scarecrow,
  // the spider and the archers to the night.
  meadow: {
    day: ['giantRat', 'boar', 'bandit', 'goblinScout', 'legionSoldier', 'legionArcher', 'raider', 'wildDog', 'banditArcher'],
    night: ['wolf', 'skeleton', 'zombie', 'bandit', 'legionSoldier', 'raider', 'fox', 'scarecrow', 'giantSpider', 'banditArcher', 'badger'],
  },
  // "boreal: wolf packs, dire wolves, bears, werewolves at night"
  boreal: { day: ['wolf', 'direWolf', 'stonebackBear'], night: ['wolf', 'direWolf', 'stonebackBear', 'werewolf', 'badger'] },
  // "desert: giant spiders, cultists at ruins, manticores, cyclops at the far end"
  desert: {
    day: ['giantSpider', 'cultist', 'manticore', 'cyclops', 'sandworm', 'raider', 'cultistAdept', 'emberDrake', 'legionSoldier', 'legionArcher', 'legionChaplain', 'legionKnight', 'brassSentinel'],
    night: ['giantSpider', 'cultist', 'manticore', 'cyclops', 'sandworm', 'raider', 'cultistAdept', 'legionSoldier', 'legionChaplain'],
  },
  // "beach and coast: crabs, harpies on cliffs, the drowned"
  beach: {
    day: ['crab', 'harpy', 'drowned', 'saltCrab', 'coralCrab', 'drownedMarine', 'reefEel'],
    night: ['crab', 'harpy', 'drowned', 'saltCrab', 'coralCrab', 'drownedMarine', 'reefEel'],
  },
  // "fen: bog crawlers, mire trolls, ghouls"
  fen: {
    day: ['bogCrawler', 'mireTroll', 'ghoul', 'reedStalker', 'fenWitch'],
    night: ['bogCrawler', 'mireTroll', 'ghoul', 'reedStalker', 'fenWitch', 'wisp'],
  },
  // "mountain: ogres, iron golems near caves, wyverns high up, frost giants in snow"
  mountain: {
    day: ['ogre', 'ironGolem', 'wyvern', 'stormWyvern', 'cairnWight', 'legionSoldier', 'legionSapper', 'legionKnight'],
    night: ['ogre', 'ironGolem', 'wyvern', 'stormWyvern', 'cairnWight', 'legionSoldier', 'legionSapper'],
  },
  // Authored: snow is boreal's roster plus the document's frost giant, and now
  // the herds and what hunts them.
  snow: {
    day: ['direWolf', 'frostGiant', 'frostWolf', 'muskOx', 'mammoth', 'iceTroll', 'glacierGolem', 'legionSapper'],
    night: ['wolf', 'direWolf', 'frostGiant', 'frostWolf', 'muskOx', 'mammoth', 'iceTroll', 'glacierGolem'],
  },
  // Authored: sakura reads as a gentler meadow, with the Deep's own three.
  sakura: {
    day: ['giantRat', 'boar', 'goblinScout', 'blossomSpider', 'canopyHarpy', 'cultistAdept'],
    night: ['wolf', 'giantSpider', 'skeleton', 'blossomSpider', 'canopyHarpy', 'cultistAdept'],
  },
  // Authored: nothing stands on open water. The Sunken Kingdom's rows are
  // placed by HABITAT_BY_PLACE, because they are in named places on the floor
  // of it and not spread over the whole sea.
  ocean: { day: [], night: [] },
  // "ruins: always something: skeletons, cultists, a wraith in the old ones"
  ruin: {
    day: ['skeleton', 'cultist', 'wraith', 'cairnWight', 'cultistAdept'],
    night: ['skeleton', 'cultist', 'wraith', 'zombie', 'cairnWight', 'cultistAdept', 'marrowGhoul', 'scarecrow'],
  },
  // "graveyard: nightshade, skeletons and zombies at night". By day it is quiet.
  graveyard: {
    day: [],
    night: ['skeleton', 'zombie', 'ghoul', 'vampireKnight', 'boneHound', 'marrowGhoul', 'riderWraith', 'cairnWight', 'scarecrow'],
  },
  // A3: a bandit camp is men round a fire, and they are there in the dark too.
  bandit_camp: {
    day: ['bandit', 'raider', 'goblinScout', 'hobgoblin', 'banditArcher', 'highwayman', 'wildDog'],
    night: ['bandit', 'raider', 'goblinScout', 'hobgoblin', 'banditArcher', 'highwayman', 'wildDog'],
  },
  // A3: an arena has a champion in it by day and nothing after dark. The rows
  // are tier 3 and 4, and the count is the row's own group size.
  arena: {
    day: ['ogre', 'orc', 'hobgoblin', 'boneKnight'],
    night: [],
  },
  // A3: a sealed barrow. What is in it is what is in a ruin, and it does not
  // come out in daylight.
  tomb: {
    day: [],
    night: ['skeleton', 'cairnWight', 'wraith', 'marrowGhoul'],
  },
  // "crater: starfall ore, starbloom, a champion". The Ashen Throne is a
  // crater the size of a realm, so its own rows are here too.
  crater: {
    day: ['cyclops', 'elderTreant', 'lich', 'hydra', 'cinderImp', 'lavaHound', 'ashWraith', 'glassWyvern', 'brassSentinel', 'legionKnight', 'legionChaplain'],
    night: ['cyclops', 'elderTreant', 'lich', 'hydra', 'boneDragon', 'cinderImp', 'lavaHound', 'ashWraith', 'glassWyvern', 'legionKnight'],
  },
  // "caves: vermin, spiders, an ogre in the deep ones"
  cave: { day: ['giantRat', 'caveBat', 'giantSpider', 'thornGrub', 'ogre'], night: ['giantRat', 'caveBat', 'giantSpider', 'thornGrub', 'ogre'] },
  // "dungeon level 1: tier 1 and 2"   (no daylight underground, so both lists match)
  dungeon1: { day: [...T1, ...T2, ...undergroundOf([...T1N, ...T2N])], night: [...T1, ...T2, ...undergroundOf([...T1N, ...T2N])] },
  // "dungeon level 2: tier 3, a tier 4 at the stair"
  dungeon2: { day: [...T3, 'boneKnight', ...undergroundOf(T3N)], night: [...T3, 'boneKnight', ...undergroundOf(T3N)] },
  // "dungeon level 3: tier 4, the boss room". Only the four unnamed bosses of
  // the document belong to every third level; the twelve named ones stand in
  // their own lair and nowhere else.
  dungeon3: {
    day: [...T4, 'boneDragon', ...undergroundOf(T4N), ...BOSSES.filter((b) => b.where === 'dungeon3').map((b) => b.id)],
    night: [...T4, 'boneDragon', ...undergroundOf(T4N), ...BOSSES.filter((b) => b.where === 'dungeon3').map((b) => b.id)],
  },
};

// ---------------------------------------------------------------------------
// Where they live, by the name of the place rather than the kind of ground.
//
// `HABITAT` answers "what walks on a meadow". It cannot answer "what is in the
// Kraken's Shoals", and realms.js is full of places that name one particular
// thing: the shoals name the kraken, the Singing Dunes name the sandworm, the
// Mammoth Steppe names the herds, the Wisp Lanterns name the wisps. A place
// that promises a monster and rolls a giant rat is the failure this table
// exists to stop, so every one of those sentences has its own roster here and
// `spawnRollFor` reads this first.
//
// `biome` is which of the HABITAT keys the place reads as, and it is not always
// its realm's: the Saltmarch is a fen realm whose causeway, isles and shoals
// are salt water. The audit uses it for the snowOnly, fenOnly and coastOnly
// checks, and monsters.test.mjs proves against realms.js that a place which is
// open country ('wild') never disagrees with the realm it is in.
//
// SOURCE OF TRUTH for every key: `src/mmo/realms.js`. This module imports
// nothing, so the ids are written out in PLACE_IDS below and the test proves
// the list is exactly the set of places realms.js has.
const at = (biome, day, night = day) => ({ biome, day, night });

export const HABITAT_BY_PLACE = {
  // --- The Greenwold, ring 0
  // The water meadow. Geese on the road by day, and after dark the wisps come
  // up off the standing water either side of the mill leat (M5).
  millrun: at('meadow', ['goose', 'giantRat', 'bandit', 'wildDog'], ['goose', 'wolf', 'zombie', 'wisp', 'scarecrow']),
  // Old Grist once in fourteen night rolls: spawnRollFor picks uniformly, so the
  // common rows are written down more than once to make him the rare one (S2).
  // M5 added the badger setts the realm sheet already names, a spider in the
  // beeches and the goblins that come up out of the Old Cellars after dark, and
  // re-weighted the rest so the list is still fourteen long and Old Grist is
  // still one roll in fourteen. Counted, not assumed: the night list below is
  // wolf 4, boar 3, fox 2, badger 2, spider 1, goblin warrior 1, Old Grist 1.
  beechhangar: at('meadow',
    ['boar', 'fox', 'giantRat', 'wildDog'],
    ['wolf', 'wolf', 'wolf', 'wolf', 'boar', 'boar', 'boar', 'fox', 'fox', 'badger', 'badger', 'giantSpider', 'goblinWarrior', 'oldGrist']),
  // The Legion's road, and the men who work it. M5 put the highwayman here and
  // nowhere else in the open Greenwold: he is a road robber and the Kingsroad
  // is the only road.
  kingsroad: at('meadow', ['legionSoldier', 'legionArcher', 'bandit', 'highwayman', 'banditArcher'], ['legionSoldier', 'legionArcher', 'wolf', 'highwayman']),
  highwaymanshollow: at('meadow', ['bandit', 'raider', 'goblinScout', 'banditArcher', 'highwayman'], ['bandit', 'raider', 'wolf', 'banditArcher', 'highwayman']),
  greenwoldpits: at('meadow', ['giantRat', 'thornGrub', 'wildDog'], ['giantRat', 'thornGrub', 'skeleton', 'giantSpider']),
  // Under water, so it reads as 'beach' and not as 'ruin': the drowned are
  // tagged coastOnly by the document and a chapel with the river over its roof
  // is the one inland place they belong. Same for the Drowned Rider Hall.
  // M5: a wisp over the flooded nave, which is what a light under water is.
  sunkenchapel: at('beach', ['skeleton', 'drowned', 'zombie'], ['skeleton', 'drowned', 'zombie', 'wraith', 'wisp']),
  // The mouth of the cellars and the brick under it. M5 put an archer on the
  // stair and a spider in the old brick.
  oldcellars: at('dungeon1', ['bandit', 'goblinScout', 'goblinWarrior', 'giantRat', 'banditArcher', 'giantSpider', 'oramBlackhand']),
  waystones: at('meadow', ['fox', 'hawk'], ['wolf', 'fox', 'badger']),

  // --- Verdant Deep, ring 1
  blossomfall: at('sakura', ['blossomSpider', 'canopyHarpy', 'giantSpider'], ['blossomSpider', 'giantSpider', 'wolf']),
  rootriver: at('sakura', ['giantSpider', 'blossomSpider', 'bandit'], ['giantSpider', 'blossomSpider', 'cultistAdept']),
  spiderwells: at('cave', ['giantSpider', 'blossomSpider', 'thornGrub'], ['giantSpider', 'blossomSpider', 'thornGrub']),
  hanginggardens: at('sakura', ['canopyHarpy', 'harpy', 'blossomSpider'], ['canopyHarpy', 'harpy', 'blossomSpider']),
  verditehollow: at('cave', ['thornGrub', 'giantSpider', 'caveBat']),
  templeoffaces: at('ruin', ['templeGuardian', 'cultistAdept', 'blossomSpider'], ['templeGuardian', 'cultistAdept', 'wraith']),
  templeoffaces_deep: at('dungeon2', ['blossomSpider', 'giantSpider', 'cultistAdept', 'templeGuardian', 'keeperOfFaces']),
  moonpool: at('sakura', ['canopyHarpy', 'cultistAdept'], ['canopyHarpy', 'cultistAdept', 'wraith']),

  // --- The Saltmarch and the Thousand Isles, ring 1
  sedgesea: at('fen', ['bogCrawler', 'reedStalker', 'ghoul'], ['bogCrawler', 'reedStalker', 'ghoul', 'wisp', 'fenWitch']),
  wisplanterns: at('fen', ['reedStalker', 'bogCrawler'], ['wisp', 'fenWitch', 'bogCrawler']),
  tidewalk: at('beach', ['saltCrab', 'crab', 'drowned'], ['saltCrab', 'drowned', 'drownedMarine']),
  thousandisles: at('beach', ['saltCrab', 'harpy', 'crab'], ['saltCrab', 'drowned', 'kraken']),
  krakenshoals: at('ocean', ['coralCrab', 'reefEel'], ['kraken', 'reefEel']),
  wreckward: at('beach', ['drowned', 'drownedMarine', 'saltCrab'], ['drowned', 'drownedMarine', 'wraith']),
  saltcut: at('beach', ['crab', 'saltCrab', 'giantRat']),
  smugglerscays: at('beach', ['raider', 'bandit', 'saltCrab'], ['raider', 'drowned', 'saltCrab']),
  leviathansrest: at('dungeon2', ['saltCrab', 'crab', 'drowned', 'mireTroll', 'thalassa']),

  // --- Ember Wastes, ring 2
  glassroad: at('desert', ['legionSoldier', 'legionArcher', 'raider', 'noon'], ['legionSoldier', 'raider', 'cultistAdept']),
  saltpans: at('desert', ['manticore', 'giantSpider', 'sandworm', 'noon'], ['manticore', 'giantSpider', 'sandworm']),
  singingdunes: at('desert', ['sandworm', 'giantSpider', 'noon'], ['sandworm', 'giantSpider']),
  embercut: at('desert', ['emberDrake', 'cultistAdept', 'legionSoldier', 'noon'], ['emberDrake', 'cultistAdept']),
  cultistcamp: at('desert', ['cultistAdept', 'legionChaplain', 'cultist'], ['cultistAdept', 'legionChaplain', 'cultist']),
  banditridge: at('desert', ['raider', 'manticore'], ['raider', 'manticore']),
  miragepalace: at('ruin', ['cultistAdept', 'wraith'], ['cultistAdept', 'wraith', 'lich']),
  brasscity: at('desert', ['brassSentinel', 'legionSoldier', 'legionChaplain'], ['brassSentinel', 'legionSoldier']),
  brasscity_works: at('dungeon3', ['brassSentinel', 'ironGolem', 'cultistAdept', 'legionKnight']),
  buriedlibrary: at('dungeon2', ['sandworm', 'cyclops', 'cairnWight', 'theLibrarian']),
  firstfire: at('crater', ['cyclops', 'cultistAdept', 'ironGolem', 'emberDrake', 'brassHeart']),

  // --- The Stormpeaks, ring 2
  cairnroad: at('mountain', ['cairnWight', 'ogre', 'legionSoldier'], ['cairnWight', 'ogre', 'wyvern']),
  legionpass: at('mountain', ['legionSoldier', 'legionArcher', 'legionKnight', 'ogre'], ['legionSoldier', 'legionKnight', 'ogre']),
  blacklochs: at('mountain', ['stormWyvern', 'wyvern', 'ogre'], ['stormWyvern', 'wyvern', 'cairnWight']),
  echochasm: at('mountain', ['ogre', 'cairnWight', 'wyvern'], ['ogre', 'cairnWight']),
  skybridge: at('mountain', ['stormWyvern', 'harpy'], ['stormWyvern', 'harpy']),
  thundershaft: at('mountain', ['ironGolem', 'caveBat', 'legionSapper']),
  drownedhall: at('beach', ['drowned', 'cairnWight', 'wraith']),
  eyrieroost: at('dungeon3', ['ogre', 'ironGolem', 'wyvern', 'legionKnight', 'wardenHask']),
  stormanvil: at('mountain', ['stormWyvern', 'ironGolem'], ['stormWyvern', 'cairnWight']),

  // --- The Boneyard, ring 2
  ninefall: at('graveyard', ['riderWraith', 'boneHound'], ['riderWraith', 'boneHound', 'wraith']),
  ashsea: at('graveyard', ['boneHound', 'wraith', 'ghoul'], ['boneHound', 'wraith', 'ghoul', 'werewolf']),
  ridertombs: at('graveyard', ['boneKnight', 'riderWraith', 'marrowGhoul'], ['boneKnight', 'riderWraith', 'marrowGhoul']),
  boneorchard: at('graveyard', ['wraith', 'marrowGhoul'], ['wraith', 'marrowGhoul', 'riderWraith']),
  marrowmine: at('graveyard', ['marrowGhoul', 'boneHound'], ['marrowGhoul', 'boneHound']),
  hunterscamps: at('graveyard', ['boneHound', 'bandit'], ['boneHound', 'werewolf']),
  ribcathedral: at('graveyard', ['riderWraith', 'wraith'], ['riderWraith', 'wraith', 'boneKnight']),
  skulllodge: at('graveyard', ['boneHound', 'bandit', 'vampireKnight'], ['boneHound', 'vampireKnight']),
  skulllodge_throat: at('dungeon3', ['boneKnight', 'wraith', 'vampireKnight', 'boneHound', 'huntmasterGallow']),

  // --- Frostreach, ring 3
  whitepines: at('snow', ['frostWolf', 'direWolf', 'rimemouth'], ['frostWolf', 'direWolf', 'rimemouth']),
  mammothsteppe: at('snow', ['mammoth', 'muskOx', 'frostWolf'], ['mammoth', 'muskOx', 'frostWolf', 'rimemouth']),
  icefall: at('snow', ['iceTroll', 'legionSapper'], ['iceTroll', 'legionSapper']),
  rimecut: at('snow', ['iceTroll', 'glacierGolem', 'legionSapper']),
  frozenfleet: at('beach', ['drowned', 'drownedMarine', 'skeleton'], ['drowned', 'drownedMarine', 'skeleton']),
  aurorashelf: at('snow', ['glacierGolem', 'frostGiant'], ['glacierGolem', 'frostGiant']),
  longnightcamp: at('snow', ['frostGiant', 'frostWolf'], ['frostGiant', 'frostWolf', 'rimemouth']),
  hotsprings: at('snow', ['muskOx', 'frostWolf'], ['frostWolf', 'rimemouth']),
  icevault_deep: at('snow', ['direWolf', 'frostGiant', 'legionSapper', 'glacierGolem', 'legionKnight', 'legateOssory']),

  // --- The Sunken Kingdom, ring 3
  reefstair: at('ocean', ['coralCrab', 'drownedMarine'], ['coralCrab', 'drownedMarine']),
  avenues: at('ocean', ['drownedMarine', 'reefEel', 'drowned'], ['drownedMarine', 'reefEel', 'drowned']),
  pearlbeds: at('ocean', ['coralCrab', 'reefEel'], ['coralCrab', 'reefEel', 'drowned']),
  pearlreef: at('ocean', ['coralCrab', 'crab'], ['coralCrab', 'drowned']),
  coliseum: at('ocean', ['drownedMarine', 'drownedKnight'], ['drownedMarine', 'drownedKnight']),
  theglow: at('ocean', ['seaWyrm', 'reefEel'], ['seaWyrm', 'reefEel']),
  whaleroad: at('ocean', ['whale', 'coralCrab'], ['whale', 'kraken']),
  drownedbell: at('ocean', ['drownedMarine', 'drowned'], ['drownedMarine', 'drowned', 'vampireKnight']),
  drownedpalace: at('ocean', ['drownedMarine', 'vampireKnight', 'boneDragon', 'kingCaradoc']),

  // --- The Ashen Throne, ring 3
  glassslopes: at('crater', ['glassWyvern', 'ironGolem', 'cultistAdept', 'ashWraith'], ['glassWyvern', 'ironGolem', 'ashWraith']),
  cindercut: at('crater', ['manticore', 'cinderImp', 'lavaHound'], ['manticore', 'cinderImp', 'lavaHound']),
  lavafalls: at('crater', ['lavaHound', 'cinderImp'], ['lavaHound', 'cinderImp']),
  obsidianbridge: at('crater', ['glassWyvern', 'wyvern'], ['glassWyvern', 'wyvern']),
  steamingshore: at('beach', ['drownedMarine', 'drowned', 'crab'], ['drownedMarine', 'drowned']),
  slagcamps: at('crater', ['legionSoldier', 'raider', 'cinderImp'], ['legionSoldier', 'raider']),
  outerworks: at('crater', ['legionSoldier', 'legionArcher', 'legionKnight', 'legionSapper', 'legionChaplain'], ['legionSoldier', 'legionKnight', 'legionChaplain']),
  ashengate: at('crater', ['legionKnight', 'legionChaplain', 'brassSentinel'], ['legionKnight', 'legionChaplain']),
  cinderport: at('crater', ['legionSoldier', 'legionArcher'], ['legionSoldier', 'raider']),
  heartcages: at('crater', ['boneKnight', 'legionKnight'], ['boneKnight', 'legionKnight']),
  throneofash: at('dungeon3', ['legionKnight', 'boneKnight', 'brassSentinel', 'legionChaplain', 'malachar']),
};

// Aliases the rest of the game may hand us. `coast` is the document's own word.
const PLACE_ALIASES = { coast: 'beach', ruins: 'ruin', caves: 'cave', oceanside: 'beach' };
export const resolvePlace = (place) => PLACE_ALIASES[place] || place;

/**
 * Every place id in `src/mmo/realms.js`, in that file's order.
 *
 * SOURCE OF TRUTH: realms.js. Written out rather than imported for the reason
 * LOOT_KINDS is: this module imports nothing, so a server can hold it on its
 * own. `monsters.test.mjs` imports realms.js and proves this list is exactly
 * that file's places, both ways, so a renamed place breaks the test rather
 * than quietly emptying a boss's lair.
 */
export const PLACE_IDS = [
  'hearthhome', 'millrun', 'oldcellars', 'beechhangar', 'kingsroad', 'greenwoldpits', 'waystones', 'highwaymanshollow', 'sunkenchapel',
  'canopycourt', 'templeoffaces', 'templeoffaces_deep', 'blossomfall', 'rootriver', 'sunkenshrine', 'verditehollow', 'hanginggardens', 'moonpool', 'spiderwells',
  'redqueensharbour', 'drownedmill', 'sedgesea', 'leviathansrest', 'thousandisles', 'wreckward', 'saltcut', 'tidewalk', 'smugglerscays', 'wisplanterns', 'krakenshoals',
  'lastwell', 'brasscity', 'brasscity_works', 'firstfire', 'glassroad', 'saltpans', 'embercut', 'cultistcamp', 'miragepalace', 'buriedlibrary', 'banditridge', 'singingdunes',
  'cairnfoot', 'cairnroad', 'legionpass', 'eyrie', 'eyrieroost', 'blacklochs', 'thundershaft', 'skybridge', 'stormanvil', 'echochasm', 'drownedhall',
  'ninefall', 'skulllodge', 'skulllodge_throat', 'ridersrest', 'ridertombs', 'ashsea', 'marrowmine', 'ribcathedral', 'hunterscamps', 'boneorchard',
  'coldseat', 'icevault', 'icevault_deep', 'whitepines', 'frozenfleet', 'rimecut', 'longnightcamp', 'aurorashelf', 'icefall', 'hotsprings', 'mammothsteppe',
  'reefstair', 'drownedpalace', 'coliseum', 'theglow', 'avenues', 'pearlreef', 'pearlbeds', 'airgardens', 'drownedbell', 'whaleroad',
  'cinderport', 'outerworks', 'ashengate', 'throneofash', 'glassslopes', 'cindercut', 'steamingshore', 'lavafalls', 'slagcamps', 'obsidianbridge', 'heartcages',
];
const PLACE_ID_SET = new Set(PLACE_IDS);

/**
 * The roster for a place: its own if realms.js names one, otherwise the biome's.
 * A named place always wins, which is the whole point of writing one down.
 */
export function habitatFor(place) {
  return HABITAT_BY_PLACE[place] || HABITAT[resolvePlace(place)] || null;
}

/** Every row that can be tamed, with its Animal Taming difficulty. */
export const TAMABLE = Object.fromEntries(rows.filter((m) => m.tamable).map((m) => [m.id, m.tamable]));
export const tamableRows = () => rows.filter((m) => m.tamable);

/**
 * Is this row ONE CREATURE, rather than a kind of creature?
 *
 * Every boss is, and so is a named beast like Old Grist. It matters because a
 * place's roster is rolled per chunk: the Old Cellars cover forty six chunks
 * and Sergeant Oram Blackhand is in their table, so the roll stood six of him
 * up across the realm and, at M5's densities, several inside one near ring at
 * the same time. `src/game/monsters.js` reads this in its sweep and keeps the
 * nearest of them, or the one already standing.
 *
 * Nothing about the roll changes: a place that names its boss still names it,
 * which is what `auditMonsters` insists on. What changes is how many of him
 * are on their feet at once.
 */
export const isUniqueRow = (m) => {
  const row = typeof m === 'string' ? MONSTERS[m] : m;
  return !!(row && (row.boss || row.unique));
};

/** Every boss, keyed by the realms.js place it is found in. */
export const BOSS_BY_LAIR = Object.fromEntries(rows.filter((m) => m.boss && m.lair).map((m) => [m.lair, m]));

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

/**
 * What a kill's gold is multiplied by. 1 for everything that does not carry a
 * purse, so the caller can multiply unconditionally.
 *
 * READ BY `src/game/loot_drops.js` on the one line that turns a kill into a
 * sack. Before M5 the `coinPurse` tag was carried by four rows and read by
 * nothing at all.
 */
export function purseMultiplier(monster) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m || !Array.isArray(m.notes) || !m.notes.includes('coinPurse')) return 1;
  return Number.isFinite(m.purse) ? m.purse : DEFAULT_PURSE;
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
 * `place` may be a biome, one of the document's words for one, or a realms.js
 * place id, which wins where it exists.
 * Returns `{ id, monster, count }`; `count` is inside the monster's group range.
 */
export function spawnRollFor(place, isNight, rng = Math.random) {
  const h = habitatFor(place);
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
// The tier bands, computed rather than typed.
//
// "A tier 3 row is worth 30 to 80 gold and hits at 50 to 65" was already in the
// document. What was not was how much health a tier 3 row has, and forty new
// rows written by hand is forty chances to put a tier 4 monster in a tier 3
// suit. So the bands are read off the document's OWN rows in each tier and
// widened by a fifth either way:
//
//   band = [floor(0.8 * lowest documented), ceil(1.2 * highest documented)]
//
// and every row in the table has to sit inside its tier's band. The rows the
// document wrote are the ones without a `wave`, so this cannot drift as more
// waves are added: wave A's rows are measured against the document for ever.
const documented = rows.filter((m) => !m.wave && !m.boss && !m.notes.includes('dummy'));
const bandOf = (pick) => {
  const out = {};
  for (const m of documented) {
    const v = pick(m);
    const b = out[m.tier] || (out[m.tier] = [Infinity, -Infinity]);
    if (v < b[0]) b[0] = v;
    if (v > b[1]) b[1] = v;
  }
  for (const t of Object.keys(out)) out[t] = [Math.floor(out[t][0] * 0.8), Math.ceil(out[t][1] * 1.2)];
  return out;
};
export const TIER_HP_BAND = bandOf((m) => m.hp);
export const TIER_DAMAGE_MIN_BAND = bandOf((m) => m.damage[0]);
export const TIER_DAMAGE_MAX_BAND = bandOf((m) => m.damage[1]);

// ---------------------------------------------------------------------------
/**
 * Every structural claim this table makes, checked at load. Throws with the
 * whole list of problems, not the first one.
 */
export function auditMonsters() {
  const bad = [];
  const seen = new Set();
  const kinds = new Set(['critter', 'vermin', 'undead', 'beast', 'humanoid', 'construct', 'elemental', 'flying']);
  const flees = new Set(['never']);
  const loot = new Set(LOOT_KINDS);
  const families = new Set(BODY_FAMILIES);
  const tamableKinds = new Set(TAMABLE_KINDS);
  const byId = Object.fromEntries(MONSTER_LIST.map((m) => [m.id, m]));

  for (const m of MONSTER_LIST) {
    const at2 = `monster ${m.id}`;
    if (seen.has(m.id)) bad.push(`${at2}: duplicate id`);
    seen.add(m.id);
    if (!m.name || typeof m.name !== 'string') bad.push(`${at2}: no name`);
    const tier = TIERS[m.tier];
    if (!tier) { bad.push(`${at2}: unknown tier ${m.tier}`); continue; }
    // A boss is read against its realm's danger, not against tier 6: see the
    // comment over BOSS_HP_BY_RANK.
    const rank = m.boss ? m.rank : m.tier;
    if (m.boss && !TIERS[rank]) { bad.push(`${at2}: boss rank ${rank} is not a tier`); continue; }
    const [lo, hi] = (m.boss ? TIERS[rank] : tier).band;
    if (!(m.hit >= lo - HIT_SLACK && m.hit <= hi)) bad.push(`${at2}: hit ${m.hit} outside [${lo - HIT_SLACK}, ${hi}] for ${m.boss ? `boss rank ${rank}` : `tier ${m.tier}`}`);
    if (!(m.def >= 0 && m.def <= hi)) bad.push(`${at2}: def ${m.def} outside [0, ${hi}] for ${m.boss ? `boss rank ${rank}` : `tier ${m.tier}`}`);
    if (!(m.hp > 0)) bad.push(`${at2}: hp ${m.hp}`);
    if (!Array.isArray(m.damage) || m.damage.length !== 2 || m.damage[0] > m.damage[1]) bad.push(`${at2}: damage ${JSON.stringify(m.damage)}`);
    if (!(m.speed > 0)) bad.push(`${at2}: speed ${m.speed}`);
    if (!(m.ar >= 0)) bad.push(`${at2}: ar ${m.ar}`);
    if (!(m.run >= 0)) bad.push(`${at2}: run ${m.run}`);
    if (!kinds.has(m.kind)) bad.push(`${at2}: kind ${m.kind}`);
    if (!flees.has(m.flees)) bad.push(`${at2}: flees ${m.flees}`);
    if (m.flees !== 'never') bad.push(`${at2}: every monster row must carry flees never`);
    if (!Array.isArray(m.group) || m.group.length !== 2 || m.group[0] < 1 || m.group[0] > m.group[1]) bad.push(`${at2}: group ${JSON.stringify(m.group)}`);
    if (!Array.isArray(m.gold) || m.gold[0] > m.gold[1]) bad.push(`${at2}: gold ${JSON.stringify(m.gold)}`);
    if (!m.boss && m.tier > 0 && (m.gold[0] !== TIERS[m.tier].gold[0] || m.gold[1] !== TIERS[m.tier].gold[1])) bad.push(`${at2}: gold does not match tier ${m.tier}`);
    if (m.tier === 0 && (m.gold[0] !== 0 || m.gold[1] !== 0)) bad.push(`${at2}: critters never drop gold`);

    // The tier's own health and damage bands, from the document's rows.
    if (!m.boss) {
      const hpBand = TIER_HP_BAND[m.tier];
      const dLo = TIER_DAMAGE_MIN_BAND[m.tier];
      const dHi = TIER_DAMAGE_MAX_BAND[m.tier];
      const exempt = m.notes.includes('huge');
      const still = m.notes.includes('dummy');   // a training body hits for nothing, by design
      if (hpBand && !exempt && (m.hp < Math.max(1, hpBand[0]) || m.hp > hpBand[1])) bad.push(`${at2}: hp ${m.hp} outside the tier ${m.tier} band [${Math.max(1, hpBand[0])}, ${hpBand[1]}]`);
      if (dLo && !still && (m.damage[0] < dLo[0] || m.damage[0] > dLo[1])) bad.push(`${at2}: low damage ${m.damage[0]} outside the tier ${m.tier} band [${dLo[0]}, ${dLo[1]}]`);
      if (dHi && !still && (m.damage[1] < dHi[0] || m.damage[1] > dHi[1])) bad.push(`${at2}: high damage ${m.damage[1]} outside the tier ${m.tier} band [${dHi[0]}, ${dHi[1]}]`);
      if (exempt && m.tier !== 0) bad.push(`${at2}: only a tier 0 row may be huge`);
    }

    const band = TEMPERAMENT_BANDS[m.temperament];
    if (!band) bad.push(`${at2}: temperament ${m.temperament}`);
    else if (m.aggro < band[0] || m.aggro > band[1]) bad.push(`${at2}: aggro ${m.aggro} outside temperament ${m.temperament} band [${band[0]}, ${band[1]}]`);
    if (m.tier === 0 && m.aggro !== 0) bad.push(`${at2}: a tier 0 row never attacks first`);

    for (const n of m.notes) if (!NOTE_TAGS.has(n)) bad.push(`${at2}: unknown note tag "${n}"`);
    // Kind 'flying' must carry the tag; the tag may also sit on something whose
    // kind is more specific (the Bone Dragon is undead and flies).
    if (m.kind === 'flying' && !m.notes.includes('flying')) bad.push(`${at2}: kind flying without the flying tag`);
    if (!Array.isArray(m.lootTable) || m.lootTable.length === 0) bad.push(`${at2}: empty lootTable`);
    else for (const k of m.lootTable) if (!loot.has(k)) bad.push(`${at2}: loot kind "${k}" is not a base this game has`);

    // A body to wear until it has one of its own, and a sentence saying what
    // the one of its own should be. Only wave A rows carry these; the older
    // rows keep their silhouette in monster_models.SHAPE_FOR.
    if (m.wave) {
      if (!m.family) bad.push(`${at2}: no body family to borrow`);
      else if (!families.has(m.family)) bad.push(`${at2}: family "${m.family}" is not a body monster_models.js can build`);
      if (!m.model || typeof m.model !== 'string' || m.model.length < 20) bad.push(`${at2}: no model note saying what body to make`);
    }

    // Taming, on Animal Taming's own 0 to 100.
    if (m.tamable) {
      const t = m.tamable;
      if (!tamableKinds.has(m.kind)) bad.push(`${at2}: kind ${m.kind} cannot be tamed, only ${TAMABLE_KINDS.join(', ')}`);
      if (!(typeof t.difficulty === 'number' && t.difficulty >= 0 && t.difficulty <= 100)) bad.push(`${at2}: taming difficulty ${t.difficulty} is not 0 to 100`);
      if (!t.food || typeof t.food !== 'string') bad.push(`${at2}: nothing to feed it`);
      if (!(typeof t.loyaltyDays === 'number' && t.loyaltyDays > 0)) bad.push(`${at2}: loyaltyDays ${t.loyaltyDays}`);
    }

    // One creature is one creature: a row that says it is unique cannot roll a
    // group of three, or the sweep's rule below would silently drop two of it.
    if (isUniqueRow(m) && !(m.group[0] === 1 && m.group[1] === 1)) bad.push(`${at2}: one of a kind and a group of ${m.group.join(' to ')}`);
    if (m.unique != null && m.unique !== true) bad.push(`${at2}: unique is ${m.unique} and the only value it takes is true`);

    // A purse is a number the loot roll multiplies by, and it is only a number
    // where the tag says there is one. Both directions: a purse with no tag is
    // a number nothing reads, and a tag with a purse of 1 is a promise the
    // sack does not keep.
    if (m.purse != null) {
      if (!m.notes.includes('coinPurse')) bad.push(`${at2}: a purse of ${m.purse} and no coinPurse tag to read it`);
      if (!(m.purse > 1 && m.purse <= MAX_PURSE)) bad.push(`${at2}: purse ${m.purse} is not over 1 and up to ${MAX_PURSE}`);
    }
    if (m.notes.includes('coinPurse') && !(purseMultiplier(m) > 1)) bad.push(`${at2}: coinPurse and a multiplier of ${purseMultiplier(m)}`);

    // A summon has to be a real row, and a lesser one.
    if (m.notes.includes('summons') !== !!m.summons) bad.push(`${at2}: the summons tag and the summons field disagree`);
    if (m.summons) {
      const s2 = byId[m.summons.id];
      if (!s2) bad.push(`${at2}: summons "${m.summons.id}", which is not a monster`);
      else if (s2.tier >= m.tier) bad.push(`${at2}: summons ${s2.id}, which is tier ${s2.tier} and not lesser`);
      if (!(m.summons.count >= 1 && m.summons.count <= 4)) bad.push(`${at2}: summons ${m.summons.count} of them`);
    }

    if (m.boss) {
      const hpBand = BOSS_HP_BY_RANK[rank]?.map(hp=>Math.round(hp*MONSTER_HEALTH_FACTOR));
      const goldBand = BOSS_GOLD_BY_RANK[rank];
      if (!hpBand) bad.push(`${at2}: no health band for boss rank ${rank}`);
      else if (!(m.hp >= hpBand[0] && m.hp <= hpBand[1])) bad.push(`${at2}: boss hp ${m.hp} outside rank ${rank}'s ${hpBand[0]} to ${hpBand[1]}`);
      if (!goldBand || m.gold[0] !== goldBand[0] || m.gold[1] !== goldBand[1]) bad.push(`${at2}: boss gold ${JSON.stringify(m.gold)} is not rank ${rank}'s ${JSON.stringify(goldBand)}`);
      if (!Array.isArray(m.phases) || m.phases.length !== 2 || m.phases[0] !== 0.66 || m.phases[1] !== 0.33) bad.push(`${at2}: boss phases ${JSON.stringify(m.phases)}`);
      if (!m.notes.includes('purpleFloor')) bad.push(`${at2}: a boss always drops a purple or better`);
      if (!m.where && !m.lair) bad.push(`${at2}: a boss with no dungeon and no lair is met nowhere`);
      if (m.lair && !PLACE_ID_SET.has(m.lair)) bad.push(`${at2}: lair "${m.lair}" is not a place in realms.js`);
      if (m.lair && !(HABITAT_BY_PLACE[m.lair] || {}).day?.includes(m.id)) bad.push(`${at2}: its lair ${m.lair} does not hold it`);
      if (m.route) {
        if (!m.notes.includes('wanders')) bad.push(`${at2}: a route and no wanders tag`);
        if (!Array.isArray(m.route) || m.route.length < 2) bad.push(`${at2}: a route of ${m.route && m.route.length} places`);
        else for (const id of m.route) if (!PLACE_ID_SET.has(id)) bad.push(`${at2}: route place "${id}" is not in realms.js`);
      } else if (m.notes.includes('wanders')) bad.push(`${at2}: the wanders tag and no route`);
    }
  }

  for (let t = 1; t <= 5; t++) if (monstersOfTier(t).length === 0) bad.push(`tier ${t} is empty`);
  if (BOSSES.length !== EXPECTED_BOSSES) bad.push(`there should be ${EXPECTED_BOSSES} bosses, there are ${BOSSES.length}`);

  // Both habitat tables, checked the same way. A place table carries the biome
  // it reads as, so a coastOnly row on a causeway in a fen realm is legal and
  // a snowOnly row in the desert is not, wherever it is written.
  const checkRoster = (where, biome, list, when) => {
    if (!Array.isArray(list)) { bad.push(`habitat ${where}.${when} is not a list`); return; }
    for (const id of list) {
      const m = MONSTERS[id];
      if (!m) { bad.push(`habitat ${where}.${when}: "${id}" is not a monster`); continue; }
      if (when === 'day' && m.notes.includes('nightOnly') && !biome.startsWith('dungeon') && biome !== 'cave') {
        bad.push(`habitat ${where}.day: ${id} is night only`);
      }
      if (m.notes.includes('snowOnly') && !['snow', 'mountain', 'crater'].includes(biome)) bad.push(`habitat ${where}: ${id} is snow only`);
      if (m.notes.includes('fenOnly') && biome !== 'fen') bad.push(`habitat ${where}: ${id} is fen only`);
      if (m.notes.includes('coastOnly') && !['beach', 'ocean'].includes(biome) && !biome.startsWith('dungeon')) bad.push(`habitat ${where}: ${id} is coast only`);
    }
  };
  for (const [place, h] of Object.entries(HABITAT)) {
    for (const when of ['day', 'night']) checkRoster(place, place, h[when], when);
  }
  for (const [place, h] of Object.entries(HABITAT_BY_PLACE)) {
    if (!PLACE_ID_SET.has(place)) bad.push(`habitat by place: "${place}" is not a place in realms.js`);
    if (!HABITAT[h.biome]) bad.push(`habitat by place ${place}: biome "${h.biome}" is not one this table knows`);
    for (const when of ['day', 'night']) checkRoster(place, h.biome, h[when], when);
    if (!h.day.length && !h.night.length) bad.push(`habitat by place ${place}: named and empty`);
  }
  // Every monster has to be somewhere, or it is written and never met.
  const placed = new Set([
    ...Object.values(HABITAT).flatMap((h) => [...h.day, ...h.night]),
    ...Object.values(HABITAT_BY_PLACE).flatMap((h) => [...h.day, ...h.night]),
  ]);
  for (const m of MONSTER_LIST) {
    if (m.tier === 0 && !placed.has(m.id)) continue;   // critters are placed by src/world/fauna.js as well
    if (m.notes.includes('dummy')) continue;             // a training body stands where a space file puts it (island_training)
    const cellarBoss = getCellarBoss(m.id);
    if (cellarBoss && m.cellarBoss && m.cellarDepth === cellarBoss.depth && m.where === `oldcellars:${cellarBoss.depth}`) continue;
    if(CELLAR_CREATURE[m.id]&&m.cellarCreature)continue; // authored Old Cellars encounters
    if (ORE_ELEMENTAL[m.id] && m.oreElemental===ORE_ELEMENTAL[m.id].ore) continue; // surfaced by the finite mining claim encounter
    if (!placed.has(m.id)) bad.push(`monster ${m.id} lives nowhere`);
  }
  // No em dash anywhere in the prose of this table.
  for (const m of MONSTER_LIST) {
    for (const text of [m.name, m.model || '']) if (text.includes('—')) bad.push(`monster ${m.id}: em dash`);
  }

  if (bad.length) throw new Error(`auditMonsters: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    monsters: MONSTER_LIST.length, bosses: BOSSES.length,
    places: Object.keys(HABITAT).length, named: Object.keys(HABITAT_BY_PLACE).length,
    tamable: Object.keys(TAMABLE).length,
  };
}

auditMonsters();
