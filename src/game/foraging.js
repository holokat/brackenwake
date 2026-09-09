import {achievementEvent} from './achievements/events.js';
// Picking things up, and eating them.
//
//   const foraging = createForaging({ field: forageField, inventory, progression,
//                                     hud, audio, floaters, character, actor, combat });
//   foraging.harvest(hit.rec);            // a click on a forage record in reach
//   foraging.useItem(item, { pack: 3 });  // the bag's "use"
//   foraging.hoverText(hit.rec);          // the HUD hint
//
// Two halves. `harvest` turns a record in the world into a stack in the pack
// and a Foraging lesson. `useItem` turns a stack in the pack into something
// that happens to the body: health, a timed buff, a poison, a cure.
//
// A RECORD IS A BUNCH, NOT A PLANT. `forage.js` places a patch of dandelions
// as one pickable holding two or three plants, so one click here is one stack,
// one line and ONE lesson. It used to be one of each PER PLANT, and that is the
// whole reason a walk across a meadow trained Foraging faster than a season of
// work. The bunch is small on purpose: a tree carries at most one bunch of a
// kind and a bunch at a tree holds at most two plants, so the most one oak can
// give is two chanterelles. See TREE_CLUSTER_MAX in forage.js.
//
// ---------------------------------------------------------------------------
// THE THINGS THAT WOULD OTHERWISE HAVE GONE WRONG, AND WHAT IS DONE INSTEAD
// ---------------------------------------------------------------------------
//
// 1. THE PACK IS THE GATE, NOT THE PATCH. `inventory.add` refuses when the pack
//    is full. If the record were cleared first, a full pack would delete the
//    mushrooms out of the world and hand back nothing. The record is only
//    marked picked AFTER the pack has really taken something.
//
// 2. A POISON THAT NOBODY TICKS IS A DECORATION. `combat.js` only ticks the
//    actors it is tracking, and `applyStatus` is what adds one to that set.
//    Writing `actor.status.poison` by hand would look right in a debugger and
//    do nothing in a game. So poison goes through `combat.applyStatus` when a
//    combat runtime is passed, and when one is not the entry is still written
//    (so a headless caller and the test see it) AND `stats.unticked` counts it,
//    so a missing wire shows up as a number rather than as a mystery.
//
// 3. A BUFF NEEDS A RECOMPUTE, AND A CLOCK. `actor.buffs` is summed by
//    `recompute`, which drops anything whose `until` has passed only if
//    `actor.now` is set first. Both happen here, in that order, exactly as
//    docs/mmo/wiring/W1.md says.
//
// 4. WHAT DID NOT HAPPEN GETS WORDS TOO. A full pack, a patch already picked, a
//    step too far, a cure with nothing to cure: each says so. Silence is
//    indistinguishable from a broken button.
//
// 5. THE REACH IS TO THE NEAREST PLANT. A three plant patch is 1.99 m across at
//    its widest, with a plant 1.26 m off its own centre, and the reach is 2.5:
//    measuring to the middle would refuse a click on a plant the player is
//    standing on top of. `distanceToForage` takes the nearest member, which is
//    what "stand over it" means. Both numbers are measured in forage.test.mjs.

import { FORAGE_BY_ID, REGROW_MS, plantsIn, distanceToForage } from '../world/forage.js';
import { baseFor, makeItem, FORAGE_TAG } from '../mmo/items.js';
import { SKILL_BY_ID, SKILL_CAP } from '../mmo/skills.js';
import { poisonTick } from '../mmo/combat_rules.js';
import { recompute as recomputeActor } from './actor.js';
import { toolFor } from './tools.js';

/** You have to be standing over it. Half a swing's reach; this is not chopping. */
export const HARVEST_REACH = 2.5;

/** Foraging if the skill sheet has it, Cooking if a future edit takes it away. */
export const FORAGE_SKILL = SKILL_BY_ID.has('foraging') ? 'foraging' : 'cooking';

/**
 * The worst share of a patch anybody gets. A beginner who kneels down in a
 * bunch of three dandelions walks away with two of them, not with one: the
 * skill decides how much of the patch is spoiled or missed, not whether the
 * patch was worth stopping for.
 */
export const YIELD_FLOOR = 0.6;

/**
 * How many of a bunch's `plants` end up in the pack, at this Foraging.
 *
 * The share runs from YIELD_FLOOR at 0 to the whole patch at SKILL_CAP, and it
 * rounds UP, so the floor is a floor and never a rounding accident: at skill 0
 * a patch of three gives two (67%), never one (33%). The rounding is what makes
 * the caps in forage.js honest, too: a bunch of two gives two at every skill,
 * so "two of each max" is two and not one. A grandmaster gets every plant that
 * stood there and no more, because there is no more: `SKILL_CAP` is 100 and a
 * hundred out of a hundred is all of it.
 */
export function yieldFor(skill, plants = 1) {
  const s = clamp(Number.isFinite(skill) ? skill : 0, 0, SKILL_CAP);
  const n = Math.max(1, Math.round(Number.isFinite(plants) ? plants : 1));
  const share = YIELD_FLOOR + (1 - YIELD_FLOOR) * (s / SKILL_CAP);
  return clamp(Math.ceil(n * share), 1, n);
}

/** One to twenty in words, for a hover line. Past twenty, the digits read better. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty'];
export const numberWord = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

const num = (v) => (Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * "3 chanterelles", "a chanterelle", "3 wild honey".
 *
 * The plural is the table's own `many` field and not a rule, because no rule
 * turns Wild garlic into something a sentence can hold: -s gives "wild garlics"
 * and -ies gives worse. `auditForage` refuses an entry without one, so a twenty
 * third forageable cannot ship with a plural nobody wrote.
 */
export function amountText(id, n) {
  const f = FORAGE_BY_ID[id];
  const name = (f ? f.name : id).toLowerCase();
  if (n === 1) return `a ${name}`;
  return `${n} ${f && f.many ? f.many : name}`;
}

/** "a patch of dandelions, three of them". What a bunch is called on sight. */
export function patchText(id, plants) {
  const f = FORAGE_BY_ID[id];
  if (!f) return String(id);
  if (plants <= 1) return f.name;
  return `A patch of ${f.many}, ${numberWord(plants)} of them`;
}

/** What a tag means, in the words the pickup line uses. */
export const TAG_LINE = {
  edible: '',
  toxic: 'It is poison. Do not eat it raw.',
  caution: 'Not to be eaten as it is. A cook knows what to do with it.',
};

/**
 * The runtime.
 *
 * Everything is optional but `field`. With no inventory, no progression and no
 * hud it still refuses and still returns its reasons, which is what lets the
 * test drive every branch against recorders rather than against a game.
 */
export function createForaging(o = {}) {
  const field = o.field || null;
  const inventory = o.inventory || null;
  const progression = o.progression || null;
  const hud = o.hud || null;
  const audio = o.audio || null;
  const floaters = o.floaters || null;
  const character = o.character || null;
  const actorOf = () => o.actor || null;
  const combat = o.combat || null;
  const recompute = o.recompute || recomputeActor;
  const rng = typeof o.rng === 'function' ? o.rng : Math.random;
  const clock = typeof o.now === 'function' ? o.now : () => Date.now();

  const stats = { picked: 0, refused: 0, eaten: 0, unticked: 0, taught: 0 };
  let lastSaid = '';

  function say(text, kind) {
    if (!text) return '';
    lastSaid = text;
    if (hud && typeof hud.log === 'function') hud.log(text, kind);
    else if (hud && typeof hud.toast === 'function') hud.toast(text, kind);
    return text;
  }
  const cue = (name, at) => { try { audio?.play?.(name, at ? { at } : undefined); } catch { /* a missing cue never costs an item */ } };
  const float = (text, kind, at) => {
    const pos = at || actorOf()?.pos || null;
    if (pos && floaters?.spawn) { try { floaters.spawn(pos, text, kind); } catch { /* the number is a garnish */ } }
  };

  const where = () => actorOf()?.pos || o.at || null;
  const skillValue = () => num(character?.skills?.[FORAGE_SKILL]);
  /** What the actor's Harvest Yield is worth: 1 ordinarily, 2 in the Blossom Fall (E2). */
  const yieldFactor = () => 1 + num(actorOf()?.bonuses?.harvestYield);

  // ------------------------------------------------------------------ pick

  /**
   * Take a forage record, which is a WHOLE BUNCH. Returns
   *   { ok, reason, id, count, plants, text, dist, rec }
   * and `ok` is only true when the pack really took something and the patch
   * really went away.
   *
   * A bunch of three dandelions is one call, one stack, one line and ONE
   * Foraging lesson. It used to be one of each PER PLANT, which is what made a
   * walk across a meadow train Foraging faster than a season of work.
   */
  function harvest(rec, now = clock()) {
    const no = (reason, text) => { stats.refused++; return { ok: false, reason, text: text || '', count: 0, id: rec?.id || null, rec: rec || null }; };
    if (!rec || !rec.id) return no('nothing', say('there is nothing there to pick', 'bad'));
    const f = FORAGE_BY_ID[rec.id];
    if (!f) return no('unknown', say(`nothing here knows what ${rec.id} is`, 'bad'));
    const plants = plantsIn(rec);
    if (rec.harvestedUntil) {
      const left = Math.max(0, Math.round((rec.harvestedUntil - now) / 60000));
      return no('picked', say(left ? `this patch is picked over, about ${left} minutes to grow back` : 'this patch is picked over', 'bad'));
    }
    const p = where();
    // To the nearest plant in the bunch, not to its middle: a wild garlic patch
    // is over two metres across and the reach is 2.5.
    const dist = p ? distanceToForage(rec, num(p.x), num(p.z)) : Infinity;
    if (!(dist <= HARVEST_REACH)) {
      const what = plants > 1 ? `patch of ${f.many}` : f.name.toLowerCase();
      const r = no('too_far', say(`the ${what} is ${dist === Infinity ? 'out of reach' : Math.round(dist) + ' m off'}, stand over it`, 'bad'));
      r.dist = dist;
      return r;
    }

    // What picks a plant. Foraging is the one gathering job that wants no tool
    // at all, and it goes through the same rule the axe and the pickaxe do
    // (T3, src/game/tools.js) rather than saying nothing and assuming hands:
    // the day a crop wants a sickle, this refuses in words instead of picking
    // it anyway. `bare` is why `ok` is true here for every character alive.
    const tool = toolFor('forage', character, { noun: f.name.toLowerCase() });
    if (!tool.ok) return no('no_tool', say(tool.reason, 'bad'));

    const skill = skillValue();
    const share = yieldFor(skill, plants);
    const factor = yieldFactor();
    const count = Math.max(1, Math.round(share * factor));
    const item = makeItem({ base: rec.id, count });
    const res = inventory?.add
      ? inventory.add(item, { quiet: true })
      : { added: count, dropped: 0, ok: true };
    const added = num(res.added);
    if (added <= 0) {
      cue('denied');
      // The record is untouched: the patch is still there to come back for.
      return no('pack_full', say(`your pack is full, so ${amountText(rec.id, count)} stays where it is`, 'bad'));
    }

    field?.remove?.(rec, now);
    achievementEvent(character, 'forage', {id: rec.id, count: added});
    stats.picked++;

    // ONE lesson for the bunch. `stats.taught` counts calls, not plants, and
    // foraging.test.mjs drives a three plant patch and measures exactly one.
    if (progression?.lesson) { progression.lesson(FORAGE_SKILL, f.difficulty, true); stats.taught++; }

    cue('pickup', { x: rec.x, z: rec.z });
    float(`+${added} ${f.name}`, 'loot');
    const warn = TAG_LINE[f.tag];
    const dropped = num(res.dropped);
    let text = plants > 1
      ? `You pick the whole patch: ${amountText(rec.id, added)}.`
      : `${cap(amountText(rec.id, added))} in the pack.`;
    // What did NOT happen gets words too, and the verb has to agree.
    if (dropped > 0) text += ` ${dropped} would not fit and ${dropped === 1 ? 'is' : 'are'} left on the ground.`;
    if (factor > 1 && added > share) text += ` The blossom is falling, so it came up ${added} instead of ${share}.`;
    if (warn) text += ` ${warn}`;
    say(text, f.tag === 'toxic' ? 'bad' : undefined);
    return { ok: true, reason: 'picked', id: rec.id, count: added, plants, dropped, text, dist, rec, item };
  }

  /** The HUD hint under the cursor. Names the bunch, and says how big it is. */
  function hoverText(rec) {
    if (!rec || !rec.id) return '';
    const f = FORAGE_BY_ID[rec.id];
    if (!f) return '';
    const head = patchText(rec.id, plantsIn(rec));
    if (rec.harvestedUntil) return `${head}, picked over`;
    const p = where();
    const d = p ? distanceToForage(rec, num(p.x), num(p.z)) : Infinity;
    if (!(d <= HARVEST_REACH)) return `${head}, too far`;
    const tail = f.tag === 'toxic' ? ', poison' : f.tag === 'caution' ? ', cook it first' : '';
    return `${head}${tail}, click to pick`;
  }

  // ------------------------------------------------------------------- use

  /** A roll inside a [min, max] band, rounded. */
  const band = (b) => {
    if (!Array.isArray(b)) return num(b);
    const [lo, hi] = b;
    return Math.round(lo + rng() * (hi - lo));
  };

  function pushBuff(actor, id, name, seconds, effect, now) {
    actor.buffs = Array.isArray(actor.buffs) ? actor.buffs : [];
    const at = actor.buffs.findIndex((b) => b && b.id === id);
    if (at >= 0) actor.buffs.splice(at, 1);      // a second helping refreshes, never stacks
    const entry = { id, abilityId: null, name, kind: 'buff', until: now + seconds * 1000, effect };
    actor.buffs.push(entry);
    actor.now = now;                              // W1: set the clock, then recompute
    try { recompute(actor); } catch (e) { console.error('[foraging] recompute threw', e); }
    return entry;
  }

  function healOver(actor, amount, seconds, now) {
    if (seconds > 0) {
      return pushBuff(actor, 'forage:heal', 'Well fed', seconds,
        { regen: { healthRegen: amount / seconds } }, now);
    }
    const before = num(actor.health);
    actor.health = clamp(before + amount, 0, num(actor.maxHealth) || before + amount);
    return { instant: Math.round((actor.health - before) * 10) / 10 };
  }

  function poison(actor, level, now) {
    if (combat?.applyStatus) return { via: 'combat', entry: combat.applyStatus(actor, 'poison', { level }, now) };
    // No combat runtime. The entry is written in combat.js's own shape so a
    // caller can see it, but nothing will tick it: see note 2 at the top.
    const tick = poisonTick(level);
    actor.status = actor.status || {};
    actor.status.poison = {
      level, perSecond: tick.perSecond, until: now + tick.seconds * 1000, nextTick: now + 1000,
    };
    stats.unticked++;
    return { via: 'none', entry: actor.status.poison };
  }

  /**
   * Eat it, drink it, or be told why nothing happened.
   *
   * The second argument is either a pack address (`{ pack: 3 }`, which is what
   * `win_bag.js` hands `ctx.useItem`) or an actor to apply it to. Anything with
   * a `maxHealth`, a `pos` or a `buffs` list is an actor; anything else is an
   * address. One stack is spent, and only when something really happened.
   */
  function useItem(item, second = null, opts = {}) {
    const now = num(opts.now) || clock();
    const isActor = !!second && (second.maxHealth != null || second.buffs != null || second.pos != null);
    const target = opts.actor || (isActor ? second : actorOf());
    const address = isActor ? (opts.where || null) : second;

    const b = baseFor(item);
    if (!b) return { ok: false, reason: 'unknown', text: say('that is not a thing you can carry', 'bad') };
    const use = b.use;
    if (!use) return { ok: false, reason: 'no_use', text: say(`nothing has been written yet that uses ${b.name.toLowerCase()}`, 'bad') };
    if (!target) return { ok: false, reason: 'no_actor', text: say(`there is nobody here to eat the ${b.name.toLowerCase()}`, 'bad') };

    const did = [];
    const out = { ok: true, reason: 'used', base: b.id, effects: did };

    if (use.nothing) {
      // A caution is not a refusal: the item is real, it just does not feed you
      // raw. Nothing is spent, because nothing happened.
      return { ok: false, reason: 'nothing', text: say(cap(use.nothing), 'bad'), base: b.id };
    }

    if (Array.isArray(use.heal)) {
      const amount = band(use.heal);
      const seconds = num(use.seconds);
      const r = healOver(target, amount, seconds, now);
      out.healed = amount;
      did.push(seconds > 0
        ? `${amount} health over ${seconds} seconds`
        : `${r.instant} health back`);
      float(`+${amount}`, 'heal');
      cue('heal');
    }

    if (use.poison > 0) {
      const p = poison(target, use.poison, now);
      out.poison = use.poison;
      out.poisonVia = p.via;
      did.push(`poison ${use.poison} in you`);
      float('poisoned', 'miss');
      cue('spell_poison');
    }

    if (use.cure) {
      const had = !!target.status?.[use.cure];
      if (had) {
        if (combat?.clearStatus) combat.clearStatus(target, use.cure);
        else delete target.status[use.cure];
        did.push(`the ${use.cure} drawn out of you`);
        cue('heal');
      } else {
        did.push(`nothing to cure, and it keeps`);
        // Nothing was spent and nothing changed: say so and stop.
        return { ok: false, reason: 'nothing_to_cure', base: b.id, text: say(`there is no ${use.cure} in you, so the ${b.name.toLowerCase()} stays corked`, 'bad') };
      }
    }

    if (use.restore) {
      const amount = band(use.amount);
      const key = use.restore === 'mana' ? 'mana' : 'stamina';
      const maxKey = key === 'mana' ? 'maxMana' : 'maxStamina';
      const before = num(target[key]);
      target[key] = clamp(before + amount, 0, num(target[maxKey]) || before + amount);
      out.restored = Math.round((target[key] - before) * 10) / 10;
      did.push(`${out.restored} ${key} back`);
      float(`+${out.restored} ${key}`, 'heal');
      cue('heal');
    }

    if (use.buff) {
      const { name, seconds, effect } = use.buff;
      pushBuff(target, `forage:${b.id}`, name, seconds, effect, now);
      out.buff = { id: `forage:${b.id}`, name, seconds };
      const mins = Math.round(seconds / 60);
      // The dish already names itself at the head of the line; do not say it twice.
      did.push(name === b.name ? `good for ${mins} minutes` : `${name} for ${mins} minutes`);
      float(name, 'gain');
      cue('buff');
    }

    // Spend one. `remove` is what makes the effect cost something; without an
    // address (a dev call, a test) the item is left alone and it is said.
    let spent = 0;
    if (address && inventory?.remove) {
      const r = inventory.remove(address, 1);
      spent = num(r.removed);
    }
    out.spent = spent;

    const tail = use.line ? ` ${cap(use.line)}.` : '';
    out.text = say(`${b.name}: ${did.join(', ')}.${tail}`, use.poison ? 'bad' : 'good');
    stats.eaten++;
    return out;
  }

  return {
    harvest, useItem, hoverText, yieldFor, patchText,
    HARVEST_REACH, FORAGE_SKILL, REGROW_MS, YIELD_FLOOR,
    stats,
    get lastSaid() { return lastSaid; },
    /** What the HUD prints beside the season. */
    skill: () => skillValue(),
  };
}

/**
 * The recipe card's flat buff, as the plain effect block `actor.js` sums.
 *
 * `recipes.js` states a meal's buff as `{ staminaRegen, healthRegen, manaRegen,
 * cold, poison, carry, str, dex, int, con, wis }` because that is what reads on
 * a card. `actor.js` wants it sorted into `regen`, `resists`, `bonuses` and
 * `stats`. This is the one translation, and `foraging.test.mjs` runs every
 * forage meal through it and checks the answer against what the item's own base
 * carries, so a card can never promise something the food does not do.
 */
export function effectFromBuff(buff) {
  const out = {};
  const put = (group, key, v) => {
    if (!Number.isFinite(v)) return;
    out[group] = out[group] || {};
    out[group][key] = v;
  };
  for (const [k, v] of Object.entries(buff || {})) {
    if (k === 'healthRegen' || k === 'manaRegen' || k === 'staminaRegen') put('regen', k, v);
    else if (k === 'cold' || k === 'poison' || k === 'fire' || k === 'energy' || k === 'physical') put('resists', k, v);
    else if (k === 'carry') put('bonuses', k, v);
    else if (['str', 'dex', 'int', 'con', 'wis'].includes(k)) put('stats', k, v);
    else throw new Error(`effectFromBuff: "${k}" is a buff key nothing reads`);
  }
  return out;
}

/** Which item base a forage tag should read as, for a tooltip colour. */
export const tagOf = (baseId) => FORAGE_TAG[baseId] || null;
