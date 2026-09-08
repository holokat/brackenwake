// Loot: what a dead thing leaves behind. Pure, deterministic, no THREE.
//
// Four rules from the documents, implemented once and used by every kill:
//
// SHIFT. "Monster tier shifts the weights up one row per two tiers."
//   shift = floor(tier / 2), and each base weight moves that many rows toward
//   the rare end, clamped at legendary so no probability is lost:
//     weight[min(5, i + shift)] += BASE[i]
//   Tier 1 is the printed table. Tier 2 and 3 (shift 1) never drop a white:
//   uncommon takes the 70, and legendary keeps 0.5 + 0.1. Tier 4 and 5
//   (shift 2) start at blue. That is a hard reading of "up one row", and it is
//   the only one that makes rarity climb with tier, which is what the sentence
//   is for.
//
// LUCK. "Luck adds luck * 0.5% to every roll above common." Every above-common
//   weight is multiplied by (1 + luck * 0.005), so 40 Luck makes each of them
//   20% likelier relative to common. Common's own weight is untouched.
//
// BOSSES. "Bosses roll twice and keep the better", and tier 5 champions
//   "always roll loot twice" as well. bossRoll does both; a real boss also
//   passes floor: 'epic', which is the document's "always drop a purple or
//   better".
//
// THE CLASS. 15-PROGRAMME.md, the user's fourteenth line: "Drops biased 60/40
//   toward the player's class." A class in this game is not an opening id, it
//   is a skill sheet: a warrior who casts for a year is a mage, and the loot
//   has to follow the sheet rather than the choice made at creation. So
//   `classProfile` reads the skills and the STR and answers with the set of
//   base ids that character would actually use, and `rollDrop` draws from the
//   intersection of that set and the monster's own table six times in ten.
//
//   Three things this bias deliberately does NOT do:
//     * It never touches gold, meat, ore, wood or any other base that does not
//       take a rarity. `takesRarity` is the gate, and it is asked AFTER the
//       ordinary draw, so a table of four materials and one sword hands over
//       materials at exactly the rate it always did.
//     * It never invents a base the monster does not carry. The bias is an
//       intersection, and when the intersection is empty the roll falls back
//       to the whole table and SAYS SO in the record it fills in.
//     * Without a profile it does nothing at all, bit for bit. The 60/40 coin
//       is drawn from its own salt, never from the item stream, so the seeds
//       every existing test and save was built against still answer the same.
//
// Gold ranges are the per-tier ranges of docs/mmo/05-WORLD-CONTENT.md.

import { hash2, rand2 } from '../world/noise.js';
import {
  makeItem, RARITY, RARITY_ORDER, baseFor, takesRarity,
  BASES, ARMOR_TIERS, COMBAT_SKILLS, FOCUS_BASES,
} from './items.js';
import { SKILLS } from './skills.js';
import { POWER_BY_ID, allowedOn, rollAffixes } from './affixes.js';

const SALT_RNG = 0x1007;
const SALT_ITEM = 0x100d;
const SALT_SECOND = 0xb055;
// Its own salt, and that is the whole reason a profiled roll and an unprofiled
// roll of the same seed still agree about everything else: the class coin is
// never taken out of the item stream, so it cannot shift it.
const SALT_BIAS = 0xb1a5;
const SALT_UNIQUE = 0x0117;

/** A deterministic [0, 1) stream from one integer seed. */
export function seededRng(seed) {
  let i = 0;
  const s = seed >>> 0;
  return () => rand2(s, (i++ * 1103515245 + 12345) | 0, SALT_RNG);
}

/** The printed drop weights, common first. Read live, so the audit and the
 * tests see a table that has been tampered with rather than a snapshot. */
export const baseWeights = () => RARITY_ORDER.map((id) => RARITY[id].weight);
export const BASE_WEIGHTS = baseWeights();

/** Gold per kill by monster tier, from the world content tables. */
export const GOLD = {
  0: [0, 0],
  1: [4, 12],
  2: [12, 30],
  3: [30, 80],
  4: [80, 250],
  5: [250, 800],
  boss: [800, 3000],
};

/** How many rows the table climbs for a monster tier. */
export const shiftFor = (tier) => Math.max(0, Math.floor((Number(tier) || 0) / 2));

/** The six weights for a tier and a Luck value, common first. */
export function weightsFor(tier, luck = 0) {
  const shift = shiftFor(tier);
  const w = [0, 0, 0, 0, 0, 0];
  const base = baseWeights();
  for (let i = 0; i < 6; i++) w[Math.min(5, i + shift)] += base[i];
  const boost = 1 + Math.max(0, luck) * 0.005;
  for (let i = 1; i < 6; i++) w[i] *= boost;
  return w;
}

/** One rarity id, drawn from the shifted and luck-boosted weights. */
export function rollRarity(monsterTier, luck = 0, rng = Math.random) {
  const w = weightsFor(monsterTier, luck);
  let total = 0;
  for (const x of w) total += x;
  let t = rng() * total;
  for (let i = 0; i < 6; i++) {
    if (t < w[i]) return RARITY_ORDER[i];
    t -= w[i];
  }
  return RARITY_ORDER[5];
}

/** Gold from a kill, uniform in the tier's range. Critters carry none. */
export function rollGold(tier, rng = Math.random) {
  const range = GOLD[tier];
  if (!range) return 0;
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ===========================================================================
// THE CLASS PROFILE
// ===========================================================================
//
// What a character would actually use, worked out from the character and
// nothing else. `opening` is never read: it is the choice made at creation and
// it stops being true the moment the player trains something else.
//
// The whole rule, in one place:
//
//   TOP THREE. Rank the character's skills over PROFILE_SKILLS, which is the
//     two Combat groups of skills.js, the Magic group, and Musicianship. Value
//     first, then the table's own order so a tie between Swordsmanship 45 and
//     Chivalry 45 always breaks the same way. A skill at zero is not ranked:
//     a character who has trained nothing favours nothing but jewellery and
//     what their back can carry, which is correct and is measured.
//
//   WEAPONS. Every weapon base whose `skill` is one of those three AND whose
//     strReq is at or under the character's STR. The STR gate is not decoration:
//     `items.canEquip` REFUSES a weapon above your strength outright, so a
//     greatsword dropped for a STR 40 rogue is the useless thing this whole
//     change exists to stop. Fists are excluded, having no slot to sit in.
//
//   ARMOUR. The heaviest three tiers the character can wear at their STR. At
//     75 STR that is exactly the document's ring, chain and plate; at 30 it is
//     cloth, leather and studded; at 0 it is cloth alone. A character whose
//     TOP skill is a casting skill gets cloth and leather instead, whatever
//     their STR, because 03-ITEMS-LOOT's Meditation and castBurden columns are
//     what make a plated wizard impossible. Chivalry is the one exception, and
//     it is the document's own: "the paladin's small holy magic, works in
//     plate", so a paladin is armoured by STR like any other fighter.
//
//   FOCI. A wand or a staff if any casting skill is in the top three. A spell
//     will not go through anything else (`items.isFocus`).
//
//   SHIELDS. If Parrying is in the top three, the shields their STR allows.
//
//   INSTRUMENTS. If Musicianship is in the top three. It is the gate skill for
//     the three bard skills, so it is the one that decides a lute.
//
//   JEWELLERY. Always. A ring and an amulet fit every character in the game and
//     are the one place any affix line can turn up (affixes.js weightFor).

/** The Magic group of skills.js. What "a casting skill" means here. */
export const MAGIC_SKILLS = SKILLS.filter((s) => s.group === 'Magic').map((s) => s.id);

/**
 * The casting skills that do NOT push a character out of metal.
 * 01-STATS-SKILLS: Chivalry is "the paladin's small holy magic, works in
 * plate", and items.js says the same in prose beside castBurden. Every other
 * Magic skill wants cloth.
 */
export const PLATE_CASTING = ['chivalry'];

/** Casting skills that make a character a robe wearer. */
export const ROBE_SKILLS = MAGIC_SKILLS.filter((id) => !PLATE_CASTING.includes(id));

/**
 * The skills that decide what gear you want, in ranking order. Not every skill:
 * Blacksmithing tells you nothing about which sword to keep.
 */
export const PROFILE_SKILLS = [...COMBAT_SKILLS, ...MAGIC_SKILLS, 'musicianship'];

/** How many of them count. "biased towards our class" is the top three. */
export const PROFILE_TOP = 3;

const SKILL_ORDER = new Map(PROFILE_SKILLS.map((id, i) => [id, i]));
const SKILL_NAME_BY_ID = new Map(SKILLS.map((s) => [s.id, s.name]));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** STR out of whatever shape the character is in. Documents write `stats.str`. */
export function strengthOf(character) {
  const c = character || {};
  const s = c.stats || {};
  return num(s.str ?? s.STR ?? c.str ?? c.STR);
}

/** The character's ranked profile skills, highest first, zeroes left out. */
export function topSkills(character, n = PROFILE_TOP) {
  const map = (character && character.skills) || {};
  return PROFILE_SKILLS
    .map((id) => ({ id, name: SKILL_NAME_BY_ID.get(id) || id, value: num(map[id]) }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value || SKILL_ORDER.get(a.id) - SKILL_ORDER.get(b.id))
    .slice(0, n);
}

/** The armour tier ids a character wears well. See the header. */
export function armourTiersFor(topSkillId, str) {
  if (topSkillId && ROBE_SKILLS.includes(topSkillId)) return ['cloth', 'leather'];
  const wearable = ARMOR_TIERS.filter((t) => t.strReq <= str);
  if (!wearable.length) return [ARMOR_TIERS[0].id];
  return wearable.slice(-3).map((t) => t.id);
}

/**
 * The whole working, for the audit, the dev bench and anything that wants to
 * tell the player WHY a sword turned up. `classProfile` is this minus the
 * explanation.
 */
export function classProfileDetail(character) {
  const str = strengthOf(character);
  const top = topSkills(character);
  const ids = top.map((e) => e.id);
  const casting = ids.filter((id) => MAGIC_SKILLS.includes(id));
  const tiers = armourTiersFor(ids[0] || null, str);
  const fits = (b) => (b.strReq || 0) <= str;

  const weapons = [];
  const armour = [];
  const shields = [];
  const foci = [];
  const instruments = [];
  const jewellery = [];
  for (const b of Object.values(BASES)) {
    if (!takesRarity(b) || !fits(b)) continue;
    switch (b.kind) {
      case 'weapon':
        // A focus is a weapon too, and it is reached by the casting rule below
        // as well as by this one; the Set swallows the overlap.
        if (b.slot && ids.includes(b.skill)) weapons.push(b.id);
        break;
      case 'armour':
        if (tiers.includes(b.material)) armour.push(b.id);
        break;
      case 'shield':
        if (ids.includes('parrying')) shields.push(b.id);
        break;
      case 'instrument':
        if (ids.includes('musicianship')) instruments.push(b.id);
        break;
      case 'jewellery':
        jewellery.push(b.id);
        break;
      default:
        break;   // offhand: a tome and a torch belong to no class in particular
    }
  }
  if (casting.length) for (const id of FOCUS_BASES) if (fits(BASES[id])) foci.push(id);
  // AMMUNITION. An archer's kit is a bow and a quiver, and a quiver empties.
  const ammo = [];
  for (const [skill, base] of Object.entries(AMMO_FOR)) if (ids.includes(skill) && BASES[base]) ammo.push(base);

  const bases = new Set([...weapons, ...armour, ...shields, ...foci, ...instruments, ...jewellery, ...ammo]);
  return {
    str, top, skills: ids, casting, robed: !!ids[0] && ROBE_SKILLS.includes(ids[0]),
    tiers, weapons, armour, shields, foci, instruments, jewellery, ammo, bases,
  };
}

/**
 * The set of base ids this character's skills favour. Pure, and cheap enough
 * to call once per kill: loot.test.mjs measures it.
 */
export function classProfile(character) {
  return classProfileDetail(character).bases;
}

/** A profile as a Set, whatever it arrived as. Null stays null. */
export function asProfile(profile) {
  if (!profile) return null;
  if (profile instanceof Set) return profile.size ? profile : null;
  if (Array.isArray(profile)) return profile.length ? new Set(profile) : null;
  // A character document, handed straight in.
  if (typeof profile === 'object' && (profile.skills || profile.stats)) return asProfile(classProfile(profile));
  return null;
}

/** Six rolls in ten come off the class's own shelf. */
/** The ammunition a ranged skill empties, by skill. */
export const AMMO_FOR = { archery: 'arrow', marksmanship: 'bolt' };
/** A quiver's worth, when a kill hands one over. */
export const AMMO_STACK = [12, 30];

/**
 * L2: WHAT IT CARRIED, IT COULD HAVE CARRIED FOR YOU.
 *
 * L1 drew the six in ten from the intersection of the monster's table and the
 * character's profile, and never invented a base the monster did not carry.
 * Measured on the island (2026-09-08), that gave a ranger a pack of fifteen
 * pairs of boots, rings, daggers and rapiers and never a bow, an arrow, a helm
 * or an amulet: the bandit's table is `dagger, rapier, boots, ring`, and the
 * only two of those an archer's profile holds are the boots and the ring.
 *
 * So the six in ten now draw from the character's OWN kit whenever the body
 * carried gear at all (a bandit with a rapier on him could as well have had a
 * bow); a wolf, which carries nothing, still hands over nothing but meat and
 * hide. The kit is weighted by category, and armour is drawn by SLOT first
 * and material second, so a pair of boots is one piece in eight and not the
 * whole wardrobe. The open four in ten are the table, as before.
 */
export const KIT_SHARES = { weapon: 35, armour: 35, jewellery: 10, ammo: 10, hand: 10 };

/**
 * One draw from a `classProfileDetail`. `r` is a unit random source. Returns
 * `{ base, count }` or null for a profile that holds nothing at all.
 */
export function kitDraw(detail, r) {
  if (!detail) return null;
  const hand = [...(detail.shields || []), ...(detail.foci || []), ...(detail.instruments || [])];
  const cats = [];
  if (detail.weapons?.length) cats.push(['weapon', KIT_SHARES.weapon]);
  if (detail.armour?.length) cats.push(['armour', KIT_SHARES.armour]);
  if (detail.jewellery?.length) cats.push(['jewellery', KIT_SHARES.jewellery]);
  if (detail.ammo?.length) cats.push(['ammo', KIT_SHARES.ammo]);
  if (hand.length) cats.push(['hand', KIT_SHARES.hand]);
  if (!cats.length) return null;
  const total = cats.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  let cat = cats[cats.length - 1][0];
  for (const [name, w] of cats) { if (x < w) { cat = name; break; } x -= w; }
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  if (cat === 'weapon') return { base: pick(detail.weapons), count: 1 };
  if (cat === 'jewellery') return { base: pick(detail.jewellery), count: 1 };
  if (cat === 'hand') return { base: pick(hand), count: 1 };
  if (cat === 'ammo') return { base: pick(detail.ammo), count: AMMO_STACK[0] + Math.floor(r() * (AMMO_STACK[1] - AMMO_STACK[0] + 1)) };
  return { base: pick(detail.armour), count: 1 };
}

/**
 * The share of ordinary kills that roll for gear at all; 1 is the tables as
 * written. The user wanted fewer drops and more coins (2026-09-08), so
 * rollKill throws this coin before rollDrop. Bosses and the twice roll keep
 * their drop: the fight was long. Gold is rolled regardless.
 */
export const GEAR_DROP_SCALE = 0.75;
export const CLASS_BIAS = 0.6;
/** Eight in ten from a boss: the fight was long and the drop should land. */
export const BOSS_BIAS = 0.8;

/**
 * One loot roll.
 *
 * `table` is the monster's own list of base ids, either as an array or as
 * { bases, chance } when the monster does not drop on every kill. Tier 0
 * critters drop nothing here: they give meat and hide through Skinning.
 *
 * `profile` is a Set of base ids from `classProfile`, an array of them, or a
 * character document. Null, and this is the roll it always was.
 *
 * `record`, if given, is filled in with what the class coin did, so the caller
 * can say it out loud. A silent bias is indistinguishable from no bias.
 *
 * Returns the item unidentified, with its affix list empty. The affixes are
 * already decided by item.seed; affixes.identify() reads them out.
 */
export function rollDrop({
  table, tier = 1, luck = 0, seed = 0, profile = null, bias = CLASS_BIAS, record = null,
  kit = null, carries = false,
} = {}) {
  if (!table) return null;
  const bases = Array.isArray(table) ? table : table.bases;
  const chance = Array.isArray(table) ? 1 : (table.chance != null ? table.chance : 1);
  if (!bases || !bases.length) return null;
  if (!tier || tier === 0) return null;
  const rng = seededRng(seed);
  if (chance < 1 && rng() >= chance) return null;
  const rolled = rollRarity(tier, luck, rng);
  const pick = Math.min(bases.length - 1, Math.floor(rng() * bases.length));
  let base = bases[pick];
  if (!baseFor(base)) throw new Error(`rollDrop: the table names ${base}, which is not a base`);
  let index = pick;
  let count = 1;

  // THE CLASS COIN, and it is thrown AFTER the ordinary draw on purpose.
  //
  // The question the coin answers is "the table gave you a piece of gear, do
  // you want it to be gear you can use", so it is only ever asked when the
  // draw already landed on gear. A wolf whose table is meat, hide and one
  // dagger hands over meat at exactly the rate it did before this existed, and
  // that is the property the tests hold to: materials are untouched.
  const want = asProfile(profile);
  const gear = takesRarity(base);
  if (record) {
    record.gear = gear;
    record.profiled = !!want;
    record.biased = false;
    record.fellBack = false;
    record.from = 'table';
    record.favoured = [];
    record.rolledBase = base;
    record.reason = !want
      ? 'no profile, so the table alone decided'
      : (gear ? '' : 'not gear, so the class has no opinion');
  }
  if (want && gear) {
    const favoured = [];
    for (const b of bases) if (b !== undefined && takesRarity(b) && want.has(b)) favoured.push(b);
    const coin = rand2(seed, 0, SALT_BIAS);
    const biased = coin < bias;
    // L2: the body carried gear, so it could have carried yours (see kitDraw)
    let k = 2;
    const drawn = biased && kit && carries ? kitDraw(kit, () => rand2(seed, k++, SALT_BIAS)) : null;
    if (drawn) {
      base = drawn.base;
      count = drawn.count;
      index = bases.indexOf(base);
    } else if (biased && favoured.length) {
      const j = Math.min(favoured.length - 1, Math.floor(rand2(seed, 1, SALT_BIAS) * favoured.length));
      base = favoured[j];
      index = bases.indexOf(base);
    }
    if (record) {
      record.coin = coin;
      record.bias = bias;
      record.biased = biased;
      record.favoured = favoured;
      record.fellBack = biased && !drawn && favoured.length === 0;
      record.from = drawn ? 'kit' : (biased && favoured.length) ? 'profile' : 'table';
      record.reason = biased
        ? (drawn
          ? 'it carried gear, so it carried yours: drawn from your own kit'
          : favoured.length
            ? `drawn from the ${favoured.length} thing(s) here your skills use`
            : 'nothing this one carries suits you, so the whole table decided')
        : 'the open four in ten';
    }
  }

  // The rarity is rolled before the base is drawn, so that a wolf and a bandit
  // face the same table; what the draw means is decided here. A material or a
  // food takes no rarity, so it comes out common however the dice fell, and
  // `makeItem` would coerce it anyway. Doing it here as well keeps the seed the
  // item is built from honest about what the item actually is.
  const rarity = takesRarity(base) ? rolled : 'common';
  return makeItem({ base, rarity, count, seed: hash2(seed, RARITY_ORDER.indexOf(rarity) * 31 + index, SALT_ITEM) });
}

/** The better of two items by rarity. Either may be null. */
export function better(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return RARITY_ORDER.indexOf(b.rarity) > RARITY_ORDER.indexOf(a.rarity) ? b : a;
}

/**
 * Two rolls, the better kept. Tier 5 champions call this; a boss calls it with
 * floor: 'epic' so it always leaves a purple or better.
 *
 * THE RARE FLOOR. `floor` now defaults to 'rare': a thing worth calling a boss
 * fight does not hand over a white. Pass `floor: null` to turn it off. Measured
 * honestly, it is a belt to an existing brace almost everywhere it runs: the
 * tier shift already puts tier 5 at blue and tier 6 at purple, so the default
 * changes nothing for either of the two callers in the game today. It bites for
 * a lower tier champion, which is what the programme's wandering semi-bosses
 * will be, and loot.test.mjs drives it at tier 1 to prove it.
 *
 * THE BOSS BIAS. `bias` defaults to BOSS_BIAS, so eight gear rolls in ten off a
 * boss come from the character's own shelf rather than six.
 */
export function bossRoll({
  table, tier = 5, luck = 0, seed = 0, floor = 'rare',
  profile = null, bias = BOSS_BIAS, record = null, kit = null, carries = false,
} = {}) {
  const recA = record ? {} : null;
  const recB = record ? {} : null;
  const first = rollDrop({ table, tier, luck, seed, profile, bias, record: recA, kit, carries });
  const second = rollDrop({ table, tier, luck, seed: hash2(seed, 1, SALT_SECOND), profile, bias, record: recB, kit, carries });
  let best = better(first, second);
  // The record belongs to the roll that was kept, not to the first one thrown.
  if (record) Object.assign(record, (best && best === second ? recB : recA) || {});
  if (!best) return null;
  if (floor) {
    const want = RARITY_ORDER.indexOf(floor);
    if (want < 0) throw new Error(`bossRoll: ${floor} is not a rarity`);
    // A purple floor cannot make a purple out of a haunch of venison. When the
    // better of the two rolls is a thing rarity does not apply to, the floor is
    // simply not applied: the boss's own table decides what it can leave.
    if (takesRarity(best) && RARITY_ORDER.indexOf(best.rarity) < want) {
      best = makeItem({ base: best.base, rarity: floor, seed: best.seed });
    }
  }
  return best;
}

// ===========================================================================
// THE SIGNATURES
// ===========================================================================
//
// Nine named uniques, one for each realm boss in src/mmo/realms.js. A fixed
// base, a fixed named power out of affixes.js POWERS, legendary always, and
// five ordinary affix lines that still roll off the seed so no two copies are
// the same sword. One per character for ever, at one kill in four.
//
// WHO DROPS IT. Two joins, and both of them are needed.
//
//   `monsters` names the row in src/mmo/monsters.js that IS this boss. It is
//   the explicit join and it is checked in loot.test.mjs against the live
//   roster, so a renamed id fails there instead of quietly dropping nothing.
//
//   The boss's NAME, as realms.js writes it, matched case insensitively and
//   past a leading "the" and any punctuation. This is the join that made the
//   feature real before the M2 roster landed and it is what a boss row added
//   tomorrow will be caught by. loot.js and monsters.js were written by
//   different hands at the same hour; the name is the thing they agree on.
//
// Nothing here is reachable from a monster that is not a boss. `signatureFor`
// requires `monster.boss`, and loot.test.mjs drives every row in monsters.js
// through it to prove the ones that are not get nothing. A boss with no
// signature at all is allowed: the Librarian and the two wandering bosses have
// none, and are not meant to.

/** One kill in four leaves it, until the character has it. */
export const UNIQUE_CHANCE = 0.25;

export const SIGNATURES = [
  {
    id: 'blackhands_answer', realm: 'greenwold', boss: 'Sergeant Oram Blackhand',
    monsters: ['oramBlackhand'], base: 'longsword', power: 'sunder', name: "Blackhand's Answer",
    flavour: 'Oram Blackhand carried this sword down into the cellars and did not carry it out. The edge still knows its way through a shield.',
  },
  {
    id: 'hundred_faces', realm: 'verdant', boss: 'The Keeper of Faces',
    monsters: ['keeperOfFaces'], base: 'cloth_outfit', power: 'archmage', name: 'The Robes of a Hundred Faces',
    flavour: 'Every face cut into the cliff looked out of these robes first. Wearing them, a spell does not care whether you are standing still.',
  },
  {
    id: 'thalassas_tooth', realm: 'saltmarch', boss: 'Thalassa the Sea-Wyrm',
    monsters: ['thalassa'], base: 'spear', power: 'everfrost', name: "Thalassa's Tooth",
    flavour: 'One of the sea-wyrm\'s own teeth, pulled off the tide line and set on an ash shaft. It has never warmed up.',
  },
  {
    id: 'furnace_heart', realm: 'emberwastes', boss: 'The Brass Heart',
    monsters: ['brassHeart'], base: 'plate_outfit', power: 'phoenix', name: 'Heartplate of the Brass City',
    flavour: 'The city kept its heart behind eight inches of brass and the heart kept beating anyway. It beats hardest the moment you go down.',
  },
  {
    id: 'hasks_reckoning', realm: 'stormpeaks', boss: 'Warden Hask',
    monsters: ['wardenHask'], base: 'longbow', power: 'stormcaller', name: "Hask's Long Reckoning",
    flavour: 'Warden Hask shot at the ghosts on the stair for forty years and hit nothing at all. It has never once missed a living thing.',
  },
  {
    id: 'gallows_whistle', realm: 'boneyard', boss: 'Huntmaster Gallow',
    monsters: ['huntmasterGallow'], base: 'amulet', power: 'shepherd', name: "Gallow's Whistle",
    flavour: 'Huntmaster Gallow blew it once and the pack came up out of the ground to him. Whatever runs at your heel hears the same note.',
  },
  {
    id: 'cold_crown', realm: 'frostreach', boss: 'Legate Ossory',
    monsters: ['legateOssory'], base: 'plate_outfit', power: 'kingsguard', name: "The Legate's Cold Harness",
    flavour: 'Ossory wore this under the glacier for a winter and never shivered. Neither does anyone standing behind you.',
  },
  {
    id: 'caradocs_ring', realm: 'sunkenkingdom', boss: 'King Caradoc the Drowned',
    monsters: ['kingCaradoc'], base: 'ring', power: 'undying', name: "Caradoc's Drowned Ring",
    flavour: 'The king went down wearing it and it would not let him finish drowning. It is still refusing.',
  },
  {
    id: 'wyrmkings_due', realm: 'ashenthrone', boss: 'Malachar, the Wyrmking',
    monsters: ['malachar'], base: 'greatsword', power: 'vampiric', name: "The Wyrmking's Due",
    flavour: 'Malachar took his tithe with this and never troubled to count it. The sword counted every drop.',
  },
];

export const SIGNATURE_BY_ID = Object.fromEntries(SIGNATURES.map((s) => [s.id, s]));

const normName = (s) => String(s || '')
  .toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

/**
 * The signature this monster carries, or null. A row must say `boss: true`:
 * that is the whole of "never elsewhere". A bare id is accepted for audits and
 * matches only the named list, every entry of which is a boss.
 */
export function signatureFor(monster) {
  if (!monster) return null;
  if (typeof monster === 'string') return SIGNATURES.find((s) => s.monsters.includes(monster)) || null;
  if (!monster.boss) return null;
  const byId = SIGNATURES.find((s) => s.monsters.includes(monster.id));
  if (byId) return byId;
  const n = normName(monster.name);
  return n ? (SIGNATURES.find((s) => normName(s.boss) === n) || null) : null;
}

/**
 * The affix entry a named power makes. affixes.js builds the same record in
 * `rollPower`, which is not exported, so the shape is repeated here and
 * loot.test.mjs compares the two key for key against a real legendary roll.
 */
function powerEntry(power) {
  return {
    id: power.id, stat: power.id, group: 'power', label: power.name, unit: 'power',
    value: 1, range: [1, 1], tier: 'legendary', prefix: power.prefix, suffix: power.suffix,
    power: true, text: power.text,
  };
}

/**
 * The unique itself. Legendary, five affix lines rolled off the seed like any
 * other, and the signature's own power in place of the one that would have
 * been rolled. It arrives unidentified, which is what every colour above white
 * does; `affixes.identify` reads the list that is already attached rather than
 * rolling a second one, so the power cannot be identified away.
 */
export function makeUnique(sig, seed = 0) {
  const s = typeof sig === 'string' ? SIGNATURE_BY_ID[sig] : sig;
  if (!s) throw new Error(`makeUnique: ${sig} is not a signature`);
  const power = POWER_BY_ID[s.power];
  if (!power) throw new Error(`makeUnique: ${s.id} names the power ${s.power}, which does not exist`);
  const item = makeItem({
    base: s.base, rarity: 'legendary',
    seed: hash2(seed, SIGNATURES.indexOf(s) * 97 + 5, SALT_UNIQUE),
  });
  item.affixes = [...rollAffixes(item).filter((a) => !a.power), powerEntry(power)];
  item.unique = s.id;
  item.uniqueName = s.name;
  item.flavour = s.flavour;
  return item;
}

/**
 * The unique this kill leaves, or null, AND the record of it on the character.
 *
 * This is the one impure function in this file and it is impure on purpose.
 * "Once per character" is only true if the taking and the remembering happen
 * together; a version that returned the sword and left the caller to write it
 * down would eventually ship with the writing missing, and the player would
 * find the same sword twice. `character.uniques` is the list, created here if
 * the document predates it.
 *
 * NOTE FOR THE WIRING: `state.hydrate` rebuilds the character field by field,
 * so `uniques` has to be carried there or this record is lost on the next
 * save. docs/mmo/wiring/L1.md names the line.
 */
export function rollUnique({ monster = null, character = null, seed = 0, signature = null } = {}) {
  if (!character || typeof character !== 'object') return null;
  const sig = signature ? (typeof signature === 'string' ? SIGNATURE_BY_ID[signature] : signature) : signatureFor(monster);
  if (!sig) return null;
  if (!Array.isArray(character.uniques)) character.uniques = [];
  if (character.uniques.includes(sig.id)) return null;
  if (rand2(seed, 3, SALT_UNIQUE) >= UNIQUE_CHANCE) return null;
  const item = makeUnique(sig, seed);
  character.uniques.push(sig.id);
  return item;
}

/**
 * Everything one kill leaves: gold, a drop or nothing, and, off a realm boss a
 * character has not beaten for its signature yet, the unique.
 *
 * `character` is the whole document. The profile is worked out from it here so
 * that no caller has to remember to, and `profile` overrides it for a test or a
 * bench that wants to drive one directly. Neither given, and this is the roll
 * it always was.
 */
export function rollKill({
  table, tier = 1, luck = 0, seed = 0, boss = false, twice = false,
  character = null, monster = null, profile = undefined, record = null,
} = {}) {
  const gold = rollGold(boss ? 'boss' : tier, seededRng(hash2(seed, 77, SALT_SECOND)));
  const want = profile === undefined ? (character ? classProfile(character) : null) : asProfile(profile);
  // L2: the character's whole kit, and whether this body carried any gear at all
  const kit = character && character.skills ? classProfileDetail(character) : null;
  const bases = Array.isArray(table) ? table : (table && table.bases) || [];
  const carries = bases.some((b) => takesRarity(b));
  const rec = record || {};
  // The gear coin is thrown only over a table that carries gear: a rat's meat
  // and a critter's hide are not what the user wanted fewer of.
  const gearCoin = carries && !boss && !twice ? seededRng(hash2(seed, 91, SALT_SECOND))() : 0;
  const lost = gearCoin >= GEAR_DROP_SCALE;
  const item = (boss || twice)
    ? bossRoll({ table, tier, luck, seed, floor: boss ? 'epic' : 'rare', profile: want, bias: BOSS_BIAS, record: rec, kit, carries })
    : lost ? null
      : rollDrop({ table, tier, luck, seed, profile: want, bias: CLASS_BIAS, record: rec, kit, carries });
  if (lost) rec.gearCoin = 'none';
  const unique = boss ? rollUnique({ monster, character, seed }) : null;
  return { gold, item, unique, bias: rec };
}

// ===========================================================================
// AUDITS
// ===========================================================================

/** The signature table is a table: real bases, real powers, no em dashes. */
export function auditSignatures() {
  const bad = [];
  const seen = new Set();
  for (const s of SIGNATURES) {
    const at = s.id || '(no id)';
    if (!s.id || seen.has(s.id)) bad.push(`${at}: the id is missing or repeated`);
    seen.add(s.id);
    for (const field of ['realm', 'boss', 'base', 'power', 'name', 'flavour']) {
      if (!s[field] || typeof s[field] !== 'string') bad.push(`${at}: no ${field}`);
    }
    if (!Array.isArray(s.monsters)) bad.push(`${at}: monsters is not a list`);
    const b = baseFor(s.base);
    if (!b) bad.push(`${at}: the base ${s.base} does not exist`);
    else if (!takesRarity(b)) bad.push(`${at}: ${s.base} takes no rarity, so it cannot be legendary`);
    const p = POWER_BY_ID[s.power];
    if (!p) bad.push(`${at}: ${s.power} is not one of the named powers`);
    else if (b && !allowedOn(p, b)) bad.push(`${at}: ${p.name} will not sit on a ${b.name}`);
    // The house style, held here so a line cannot ship with one.
    for (const field of ['name', 'flavour']) {
      if (/[—–]/.test(String(s[field]))) bad.push(`${at}: the ${field} carries a dash this project does not use`);
    }
  }
  if (SIGNATURES.length !== 9) bad.push(`there are ${SIGNATURES.length} signatures and nine realms`);
  const realms = new Set(SIGNATURES.map((s) => s.realm));
  if (realms.size !== SIGNATURES.length) bad.push('two signatures share a realm');
  if (bad.length) throw new Error(`auditSignatures: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    signatures: SIGNATURES.length,
    wired: SIGNATURES.filter((s) => s.monsters.length).length,
    waiting: SIGNATURES.filter((s) => !s.monsters.length).map((s) => s.boss),
  };
}

/** Fails loudly if the gold table or the weight shift has drifted. Runs at load. */
export function auditLoot() {
  const bad = (m) => { throw new Error(`auditLoot: ${m}`); };
  for (const key of ['0', '1', '2', '3', '4', '5', 'boss']) {
    const r = GOLD[key];
    if (!Array.isArray(r) || r.length !== 2) bad(`tier ${key} has no gold range`);
    if (r[0] > r[1]) bad(`tier ${key} gold runs backwards`);
  }
  for (const t of [0, 1, 2, 3, 4, 5]) {
    const w = weightsFor(t, 0);
    const sum = w.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 100) > 1e-9) bad(`tier ${t} weights sum to ${sum}, not 100`);
  }
  if (shiftFor(1) !== 0 || shiftFor(3) !== 1 || shiftFor(5) !== 2) bad('the shift is not one row per two tiers');
  if (!(CLASS_BIAS > 0 && CLASS_BIAS < 1)) bad(`the class bias is ${CLASS_BIAS}, and it is a fraction of one`);
  if (!(BOSS_BIAS > CLASS_BIAS && BOSS_BIAS < 1)) bad(`the boss bias is ${BOSS_BIAS}, which is not above the ordinary ${CLASS_BIAS}`);
  if (!PROFILE_SKILLS.length) bad('no skill decides a profile');
  for (const id of PROFILE_SKILLS) {
    if (!SKILL_NAME_BY_ID.has(id)) bad(`PROFILE_SKILLS names "${id}", which is not a skill`);
  }
  auditSignatures();
  return true;
}

auditLoot();
