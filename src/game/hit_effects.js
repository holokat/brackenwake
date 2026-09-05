// What a weapon does to a thing beyond opening it.
//
// 03-ITEMS-LOOT gives a weapon seven "hit effect" lines, each rolled at 10 to
// 40% and each described in one clause: "a small spell at half the wielder's
// skill". `actor.js` sums every one of them into `actor.bonuses.hitFireball`
// and friends as a FRACTION, chance per landed hit, and W1.md section 7 lists
// all seven under UNCONSUMED_BONUSES because until this file existed nothing
// read a single one. A sword called "Freezing Longsword of Frost" froze
// nothing at all.
//
// Two halves, and the split is the point:
//
//   rollHitEffects(attacker, defender, result, rng)   pure, decides WHAT fires
//   applyHitEffects(list, attacker, defender, combat) writes it, through the
//                                                     runtime's own hurt, heal
//                                                     and applyStatus
//
// Nothing here mutates in the roll and nothing here invents a second damage
// pipeline in the apply: a typed effect is reduced by the defender's own typed
// resist through `combat_rules.resistOf`, which is the same reader
// `combat_rules.damage` uses, and the write goes through `combat.hurt`, which
// is the one place in the game that takes health off outside a resolved swing.
//
// ---------------------------------------------------------------------------
// Where the number came from
// ---------------------------------------------------------------------------
// 03 gives the CHANCE band (10 to 40%) and nothing else: no damage, no
// duration, no drain fraction. Every magnitude below is therefore either the
// brief's or INVENTED, and each one says which in the table. The rule this file
// follows for "scaled by the character" is 03's own clause, "at half the
// wielder's skill": the wielder's skill for a spell off a blade is Magery, and
// the per point figure is `combat_rules.SPELL_PER_INT`, imported rather than
// re-guessed, so a hit fireball and a cast fireball grow at the same rate.
//
//   scale = 1 + (Magery * 0.5) * SPELL_PER_INT      100 Magery -> x1.40
//
// ---------------------------------------------------------------------------
// The three sources, in the order they are rolled
// ---------------------------------------------------------------------------
// 1. `attacker.bonuses.hitX`, the summed affix lines. A roll is drawn ONLY for
//    a line the attacker actually carries, so a plain sword draws nothing and a
//    seeded test's sequence is not spent on absent affixes.
// 2. `attacker.powers`, the legendary named powers, of which two are hit
//    effects: Vampiric ("all damage leeches 25%") and Everfrost ("hits slow 40%
//    and can freeze"). Stormcaller is NOT here: chaining to two other bodies
//    needs a list of bodies, which a pure function of one pair does not have.
//    Sunder is armour piercing and belongs in the damage pipeline, not here.
// 3. `attacker.enchant`, W4's `weaponEnchant`. Poison Blade is the one that
//    procs: it carries a `level`, and a level is a poison. Consecrate Weapon
//    carries `vs` and `mult` instead, which is a damage multiplier and not a
//    proc, so it fires nothing here and only spends a hit.

import { resistOf, SPELL_PER_INT } from '../mmo/combat_rules.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const skillOf = (a, k) => num(a && a.skills && a.skills[k]);
const bonusOf = (a, k) => num(a && a.bonuses && a.bonuses[k]);

/** Half the wielder's skill, 03's own phrase, at combat_rules' own per point rate. */
export const SKILL_FRACTION = 0.5;
/** Magery at which Hit Frost freezes solid every time. The brief's number. */
export const FREEZE_AT_MAGERY = 100;

/**
 * The six damage type colours, copied from `effects.js` TYPE_COLOURS so this
 * file stays free of THREE and of `abilities.js`. `hit_effects.test.mjs`
 * imports both and fails if they ever drift apart, which is the audit.
 */
export const TYPE_COLOURS = {
  physical: 0xe8e2d4,
  fire: 0xff7a2a,
  cold: 0x6fd0ff,
  poison: 0x86e05a,
  energy: 0xb98cff,
  holy: 0xffe9a8,
};

/**
 * Three effects are not a damage type and need a colour of their own. All three
 * INVENTED, and deliberately away from the six above so a drain never reads as
 * a poison.
 */
export const EFFECT_COLOURS = {
  drain: 0xb4335a,     // life drain, and Vampiric: dark blood red
  fatigue: 0xc9bd7a,   // stamina gone: a tired ochre
  dispel: 0xd8d2ff,    // a buff unravelling: pale violet
  thorns: 0xc0c4c8,    // the defender's own spikes: the miss grey
};

/** `0xff7a2a` to `"#ff7a2a"`, which is what floaters.js wants in `extra.color`. */
export const cssColour = (n) => `#${(num(n) >>> 0).toString(16).padStart(6, '0')}`;

/**
 * The seven lines, in the order they are rolled, with every magnitude and where
 * it came from.
 *
 * | id           | magnitude                          | source            |
 * | ------------ | ---------------------------------- | ----------------- |
 * | hitFireball  | 10 to 20 fire                      | the brief         |
 * | hitLightning | 12 to 24 energy                    | the brief         |
 * | hitFrost     | slow 30% for 4 s, freeze 1.5 s     | the brief         |
 * | hitFrost     | 8 to 16 cold on top                | INVENTED          |
 * | hitHarm      | 8 to 16 physical, no armour        | the brief         |
 * | hitLifeDrain | heals 30% of the blow              | the brief         |
 * | hitFatigue   | 10 to 20 stamina                   | the brief         |
 * | hitDispel    | one buff                           | the brief         |
 *
 * `ignoreResist` is Harm's alone: 02-COMBAT's armour term is AR and none of
 * these go through it anyway, so "ignores armour" is free. Harm additionally
 * ignores the physical RESIST, because a line whose whole promise is that
 * nothing stops it should not be halved by a breastplate's 12%.
 */
export const HIT_EFFECTS = {
  hitFireball: { kind: 'fireball', damageType: 'fire', base: [10, 20], word: 'fireball' },
  hitLightning: { kind: 'lightning', damageType: 'energy', base: [12, 24], word: 'lightning' },
  hitFrost: {
    kind: 'frost', damageType: 'cold', base: [8, 16], word: 'frost',
    slow: 0.30, slowSeconds: 4, freezeSeconds: 1.5,
  },
  hitHarm: { kind: 'harm', damageType: 'physical', base: [8, 16], ignoreResist: true, word: 'harm' },
  hitLifeDrain: { kind: 'drain', drain: 0.30, word: 'life drain' },
  hitFatigue: { kind: 'fatigue', stamina: [10, 20], word: 'fatigue' },
  hitDispel: { kind: 'dispel', word: 'dispel' },
};

/** The seven, in roll order. Exported so a test can drive every one of them. */
export const HIT_EFFECT_IDS = Object.keys(HIT_EFFECTS);

/**
 * The two named powers that are hit effects.
 *
 * Everfrost's freeze chance is INVENTED: 03 says only "can freeze". A flat one
 * hit in six was chosen over the Magery ramp Hit Frost uses, because a
 * legendary sword should freeze in the hands of a warrior who has never cast
 * anything, which is the whole difference between a power and an affix.
 */
export const EVERFROST_SLOW = 0.40;          // 03: "hits slow 40%"
export const EVERFROST_SLOW_SECONDS = 4;     // INVENTED, matched to Hit Frost
export const EVERFROST_FREEZE_CHANCE = 0.15; // INVENTED
export const EVERFROST_FREEZE_SECONDS = 1.5; // INVENTED, matched to Hit Frost
export const VAMPIRIC_DRAIN = 0.25;          // 03: "all damage leeches 25%"

/** 1 + (Magery / 2) * SPELL_PER_INT. 100 Magery is x1.40. */
export function spellScale(attacker) {
  return 1 + skillOf(attacker, 'magery') * SKILL_FRACTION * SPELL_PER_INT;
}

/** Hit Frost freezes solid at 100 Magery and proportionally under it. */
export function freezeChance(attacker) {
  return clamp(skillOf(attacker, 'magery') / FREEZE_AT_MAGERY, 0, 1);
}

/** An inclusive integer roll, the same shape `combat_rules.weaponRoll` uses. */
function rollBetween([lo, hi], rng) {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return a + Math.floor(rng() * (b - a + 1));
}

/** The damage one typed effect does, after Magery and after the typed resist. */
function typedDamage(row, attacker, defender, rng) {
  const roll = rollBetween(row.base, rng);
  const raw = roll * spellScale(attacker);
  const resist = row.ignoreResist ? 0 : resistOf(defender, row.damageType);
  return {
    roll,
    raw,
    resist,
    damage: Math.max(1, Math.round(raw * (1 - resist))),
    damageType: row.damageType,
  };
}

/** "you", or the thing's name, or "it". Used at the head and the tail of a line. */
export function who(actor) {
  if (!actor) return 'it';
  if (actor.kind === 'player') return 'you';
  return actor.name || 'it';
}
/** First letter up, for a line that starts with a subject rather than a number. */
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** "you take" against "the rat takes". Lines read as prose or they read as UI. */
const takes = (actor) => (actor && actor.kind === 'player' ? 'take' : 'takes');
const has = (actor) => (actor && actor.kind === 'player' ? 'have' : 'has');
const article = (actor) => (actor && actor.kind === 'player' ? '' : 'the ');
/** "you", or "the rat". The object of a sentence, with its article. */
export const target = (actor) => `${article(actor)}${who(actor)}`;

/**
 * Which effects fire on this hit, and how big each one is. Pure: it reads, it
 * rolls, it returns, and it writes nothing anywhere.
 *
 * Nothing fires on a miss, a dodge or a parry, because all three come back with
 * `result.damage` at zero and the first line here refuses them.
 *
 * @param attacker the actor swinging, with `bonuses`, `skills`, `powers`, `enchant`
 * @param defender the actor being hit, read for its typed resists and its buffs
 * @param result   the resolved swing: only `damage` is read
 * @param rng      () => [0, 1). One draw per line the attacker carries, then
 *                 one or two more for a line that fired.
 * @returns [{ id, kind, source, damage?, damageType?, heal?, stamina?, buff?,
 *            status?: [{ id, seconds, factor?, level? }], colour, word }]
 */
export function rollHitEffects(attacker, defender, result, rng) {
  const out = [];
  if (typeof rng !== 'function') throw new Error('hit_effects: rollHitEffects needs an rng');
  const dealt = num(result && result.damage);
  if (!attacker || !defender || dealt <= 0) return out;

  for (const id of HIT_EFFECT_IDS) {
    const chance = bonusOf(attacker, id);
    if (chance <= 0) continue;               // no draw at all: see note 1 above
    if (rng() >= chance) continue;
    const row = HIT_EFFECTS[id];
    out.push(buildEffect(id, row, 'affix', attacker, defender, dealt, rng));
  }

  const powers = Array.isArray(attacker.powers) ? attacker.powers : [];
  if (powers.includes('vampiric')) {
    out.push(drainEffect('vampiric', 'power', 'Vampiric', VAMPIRIC_DRAIN, dealt, attacker));
  }
  if (powers.includes('everfrost')) {
    const frozen = rng() < EVERFROST_FREEZE_CHANCE;
    out.push(frostEffect('everfrost', 'power', 'Everfrost', {
      slow: EVERFROST_SLOW, slowSeconds: EVERFROST_SLOW_SECONDS,
      frozen, freezeSeconds: EVERFROST_FREEZE_SECONDS,
    }, null));
  }

  const enchant = attacker.enchant;
  // The enchant's `until` is NOT compared against a clock here. It is written
  // in SECONDS by abilities_runtime.js and this file is called from a runtime
  // whose clock is MILLISECONDS, and abilities.update is the one thing that
  // expires it. A live `actor.enchant` is taken as live.
  if (enchant && num(enchant.level) > 0 && enchant.damageType === 'poison') {
    out.push({
      id: 'enchant:poison', kind: 'poison', source: 'enchant',
      status: [{ id: 'poison', level: Math.round(num(enchant.level)) }],
      colour: TYPE_COLOURS.poison, word: 'poisoned',
      powerName: null,
    });
  }
  return out;
}

/**
 * The same three sources on a SPELL rather than a swing. A weapon's hit lines
 * are "chance per hit" of a weapon and do not fire off a fireball, and neither
 * do the powers, so the only thing that can carry over is the enchant, and only
 * an enchant that says so.
 *
 * NOTHING IN abilities.js SETS `onSpell` TODAY. This fires for no ability in
 * the game as it stands, and is here so that the day an ability wants a spell
 * to carry the blade's poison it sets one flag rather than growing a branch in
 * combat.js. Named in G11.md rather than left to be discovered.
 */
export function rollSpellEffects(attacker, defender, result, rng) {
  const enchant = attacker && attacker.enchant;
  if (!enchant || enchant.onSpell !== true) return [];
  return rollHitEffects({ ...attacker, bonuses: {}, powers: [] }, defender, result, rng);
}

function buildEffect(id, row, source, attacker, defender, dealt, rng) {
  if (row.kind === 'drain') {
    return drainEffect(id, source, null, row.drain, dealt, attacker);
  }
  if (row.kind === 'fatigue') {
    const amount = rollBetween(row.stamina, rng);
    return {
      id, kind: 'fatigue', source, stamina: amount,
      colour: EFFECT_COLOURS.fatigue, word: row.word, powerName: null,
    };
  }
  if (row.kind === 'dispel') {
    return {
      id, kind: 'dispel', source, dispel: 1,
      colour: EFFECT_COLOURS.dispel, word: row.word, powerName: null,
    };
  }
  if (row.kind === 'frost') {
    const d = typedDamage(row, attacker, defender, rng);
    const frozen = rng() < freezeChance(attacker);
    return frostEffect(id, source, null, {
      slow: row.slow, slowSeconds: row.slowSeconds,
      frozen, freezeSeconds: row.freezeSeconds,
    }, d);
  }
  const d = typedDamage(row, attacker, defender, rng);
  return {
    id, kind: row.kind, source,
    damage: d.damage, damageType: d.damageType, roll: d.roll, resist: d.resist,
    ignoreArmour: true, ignoreResist: !!row.ignoreResist,
    colour: TYPE_COLOURS[d.damageType] ?? TYPE_COLOURS.physical,
    word: row.word, powerName: null,
  };
}

function drainEffect(id, source, powerName, fraction, dealt, attacker) {
  return {
    id, kind: 'drain', source, powerName,
    heal: Math.round(dealt * fraction), fraction, of: dealt,
    colour: EFFECT_COLOURS.drain, word: 'life drain',
    attackerName: who(attacker),
  };
}

/**
 * Frost is the one that is two statuses. `level` on the slow is the slow's own
 * percentage, which is what lets `combat.applyStatus`'s "a stronger one
 * replaces a weaker one" rule compare Everfrost's 40 against Hit Frost's 30
 * without a second comparison being written anywhere.
 */
function frostEffect(id, source, powerName, spec, damage) {
  const status = [{ id: 'slow', seconds: spec.slowSeconds, factor: spec.slow, level: Math.round(spec.slow * 100) }];
  if (spec.frozen) status.push({ id: 'root', seconds: spec.freezeSeconds, level: 1 });
  return {
    id, kind: 'frost', source, powerName,
    status, frozen: !!spec.frozen, slow: spec.slow,
    damage: damage ? damage.damage : 0,
    damageType: damage ? damage.damageType : 'cold',
    roll: damage ? damage.roll : 0,
    resist: damage ? damage.resist : 0,
    ignoreArmour: true,
    colour: TYPE_COLOURS.cold,
    word: spec.frozen ? 'frozen' : 'chilled',
  };
}

/**
 * Every effect said out loud. The subject is named in the first clause, which
 * is the house style: a line that opens with a number is a readout, not prose.
 */
export function lineFor(e, attacker, defender) {
  // A named power speaks in its own name: Everfrost opens the sentence where
  // plain frost would, and Vampiric becomes the adjective on the blade. A line
  // that reads "Vampiric The blade drinks" is a template showing through.
  const blade = e.powerName ? `The ${e.powerName.toLowerCase()} blade` : 'The blade';
  switch (e.kind) {
    case 'fireball':
      return `Fire bursts off the blade into ${target(defender)}, ${e.damage} of it.`;
    case 'lightning':
      return `Lightning cracks out of the blade into ${target(defender)}, ${e.damage} of it.`;
    case 'frost': {
      const bite = e.damage > 0 ? `, ${e.damage} cold` : '';
      const cold = e.powerName || 'Frost';
      return e.frozen
        ? `${cold} catches ${target(defender)} and holds it there${bite}.`
        : `${cold} catches ${target(defender)} and it slows${bite}.`;
    }
    case 'harm':
      return `Harm opens ${target(defender)} where no armour helps, ${e.damage} of it.`;
    case 'drain': {
      // what was really put back, not what was rolled: a drain on a fighter who
      // is already whole heals nothing, and the line has to say so.
      const got = e.healed != null ? e.healed : e.heal;
      return got > 0
        ? `${blade} drinks, and ${who(attacker)} ${has(attacker)} ${got} back.`
        : `${blade} drinks, and ${who(attacker)} ${has(attacker)} no room for it.`;
    }
    case 'fatigue':
      return e.stamina > 0
        ? `${cap(target(defender))} ${takes(defender)} the weariness, ${e.stamina} stamina gone.`
        : `${cap(target(defender))} ${has(defender)} no stamina left to take.`;
    case 'dispel':
      return e.buff
        ? `${blade} unravels ${e.buff} on ${target(defender)}.`
        : `${blade} looks for something to unravel on ${target(defender)} and finds nothing.`;
    case 'poison':
      return `${cap(target(defender))} ${takes(defender)} the poison off the blade.`;
    default:
      return `${cap(target(defender))} ${takes(defender)} ${e.word}.`;
  }
}

/**
 * Apply the list. The writes all go through the runtime that was handed in, so
 * this file never touches health, never decides a death and never spawns a
 * floater of its own: `combat.hurt` owns the first two and `combat.float` the
 * third.
 *
 * @param combat the object `createCombat` returns. `hurt`, `heal`, `applyStatus`
 *   and `float` are used; `recompute` and `onHitFire` are used when present.
 * @returns { lines, floats, damage, healed, stamina, dispelled }
 *   `floats` is the descriptor list, so a test can prove the words and the
 *   colours without standing up a floaters layer.
 */
export function applyHitEffects(list, attacker, defender, combat, now) {
  const lines = [], floats = [];
  let damage = 0, healed = 0, stamina = 0, dispelled = 0;
  if (!Array.isArray(list) || !list.length || !combat) return { lines, floats, damage, healed, stamina, dispelled };

  const put = (over, text, kind, colour) => {
    const f = { over, text, kind, colour: cssColour(colour) };
    floats.push(f);
    combat.float?.(over === 'attacker' ? attacker : defender, text, kind, { color: f.colour });
  };

  for (const e of list) {
    let fired = false;

    if (num(e.damage) > 0) {
      // through the runtime's own hurt: it is the one writer of health outside a
      // resolved swing, it owns the death, and `quiet` is set because the number
      // wants the effect's colour and hurt's floater is plain.
      const took = combat.hurt(defender, e.damage, { now, quiet: true, kind: 'damage', killer: attacker });
      if (took > 0) { damage += took; put('defender', String(took), 'damage', e.colour); fired = true; }
    }

    if (Array.isArray(e.status)) {
      let took = 0;
      for (const s of e.status) {
        const entry = combat.applyStatus(defender, s.id, { ...s, quiet: true }, now);
        if (entry) { took++; fired = true; }
      }
      // no word over a corpse: the damage above may have finished it, and
      // applyStatus refuses a dead actor, so the floater follows the status and
      // not the intention.
      if (took > 0) {
        if (e.kind === 'frost') put('defender', e.frozen ? 'frozen' : 'chilled', 'miss', e.colour);
        else if (e.kind === 'poison') put('defender', 'poisoned', 'miss', e.colour);
      }
    }

    if (num(e.heal) > 0) {
      const got = combat.heal(attacker, e.heal, { quiet: true });
      if (got > 0) { healed += got; put('attacker', String(got), 'heal', e.colour); fired = true; }
      // a drain that healed nothing because the attacker was already whole is
      // still a thing that happened, and the line below says so.
      e.healed = got;
    }

    if (num(e.stamina) > 0) {
      const before = num(defender.stamina);
      defender.stamina = Math.max(0, before - e.stamina);
      const gone = before - defender.stamina;
      if (gone > 0) { stamina += gone; put('defender', `-${gone} stamina`, 'miss', e.colour); fired = true; }
      e.stamina = gone;
    }

    if (e.kind === 'dispel') {
      const b = stripOneBuff(defender, combat);
      e.buff = b ? (b.name || b.abilityId || 'the enchantment') : null;
      if (b) { dispelled++; put('defender', `${e.buff} gone`, 'miss', e.colour); fired = true; }
      else put('defender', 'nothing to unravel', 'miss', e.colour);
    }

    lines.push(lineFor(e, attacker, defender));
    combat.onHitFire?.({
      attacker, defender, effect: e, kind: e.kind, colour: e.colour,
      damage: num(e.damage), fired, now,
    });
  }
  return { lines, floats, damage, healed, stamina, dispelled };
}

/**
 * One buff off the defender, the most recent first, because the thing a player
 * just cast is the thing a dispel should take.
 *
 * TWO PATHS, and the reason matters. `abilities_runtime.expire` is the only
 * thing in the tree that calls `recompute` when a buff drops, so a buff spliced
 * out of the array here without a recompute would take its +STR into the grave
 * and leave the bonus behind for ever. So:
 *
 *   with `combat.recompute`  the buff is spliced AND the actor recomputed here,
 *                            which is complete and immediate;
 *   without it               the buff is only MARKED expired (`until` set to
 *                            -Infinity, which is expired under a clock in
 *                            seconds and under one in milliseconds alike) and
 *                            the owner drops it on its next update.
 */
export function stripOneBuff(actor, combat) {
  const buffs = actor && Array.isArray(actor.buffs) ? actor.buffs : null;
  if (!buffs || !buffs.length) return null;
  const i = buffs.length - 1;
  const b = buffs[i];
  if (typeof combat?.recompute === 'function') {
    buffs.splice(i, 1);
    combat.recompute(actor);
  } else {
    b.until = -Infinity;
  }
  return b;
}

/**
 * The audit. Every id `actor.js` lists under the hit effect group has to have a
 * row here, and every row here has to be a bonus key, or a weapon promising
 * "+30% Hit Frost" is decoration again. Called at import by the test.
 */
export function auditHitEffects(bonusKeys = []) {
  const bad = [];
  for (const id of HIT_EFFECT_IDS) {
    const row = HIT_EFFECTS[id];
    if (!row.kind) bad.push(`${id} has no kind`);
    if (bonusKeys.length && !bonusKeys.includes(id)) bad.push(`${id} is not a bonus key actor.js sums`);
  }
  for (const k of bonusKeys) {
    if (/^hit[A-Z]/.test(k) && !HIT_EFFECTS[k]) bad.push(`bonus key "${k}" has no row in hit_effects.js`);
  }
  if (bad.length) throw new Error(`hit_effects: ${bad.join('; ')}`);
  return { effects: HIT_EFFECT_IDS.length };
}
