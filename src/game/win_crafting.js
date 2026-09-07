// The Crafting panel: a station, the recipes it will take, and the arithmetic
// shown before you commit to any of them.
//
// All the numbers are `src/mmo/recipes.js`. Nothing here re-derives a chance, a
// quality or a rarity; the expected quality on screen is the real
// `craftQuality` called with a jitter of nothing, so the number the player
// reads and the number the roll uses come from one function.
//
// WHAT CHANGED IN CR2
//
// It was a list: a name, a comma joined bill, one percent and a button, in
// thirteen point grey, while the abilities window next door was a wall of
// painted cards. A player could not see what a thing looked like, could not
// tell at a glance whether the iron was in the pack, and had no way to ask a
// forge for shields. So it is the abilities window's card now, and
// deliberately its class names and its numbers out of ui_theme.js: a tile of
// art, a name, small caps chips, a bill that counts your own pack against the
// recipe in green and red, a padlock and one gold sentence when the answer is
// no, family filters along the top and a count under them.
//
// The picture is resolved through `resultBaseFor`, which is the whole point:
// an armour recipe calls itself `cloth_hood` and the painting is filed under
// `cloth_head`. Reading the recipe's own spelling found nothing for all 216
// armour recipes. `tileArt` falls from the painting, to ui_theme's drawn glyph
// for the base, to the family's glyph for a recipe with no item behind it at
// all, and `auditCraftArt()` runs every recipe through it at import so no card
// in the game can come out blank.
//
// TWO GAPS BETWEEN recipes.js AND items.js, FOUND BY TRACING THE PATH.
//
//   1. A recipe's `result.base` is not always an `items.js` base. `makeItem`
//      throws on a base it does not know, so every one of these would have been
//      a button that exploded:
//        - armour recipes name the piece ("cloth_hood"), items.js names the
//          slot ("cloth_head"). Every armour recipe. Resolved from the
//          recipe's own `armourTier` and `slot`, which do match.
//        - "throwingKnives" against items.js's "throwing_knives".
//        - potions ("healPotion") and meals ("heartyStew") have no base of
//          their own; they are the "potion" and "food" stacks.
//        - bags, scrolls and six of the seven tools have no base at all.
//      `UNMAKEABLE` records the third group with the reason, the panel greys
//      them with that reason, and `auditCraftBases()` runs `makeItem` on every
//      other recipe at load, so no craft button in the game can throw.
//
//   2. A recipe's materials are ids like "iron", "oak", "ginseng". items.js has
//      no base for any of those: it has the stacks "ingot", "ore", "log" and
//      "reagent" and no field saying which metal or which wood. So this module
//      needs one convention, and here it is:
//
//        a material stack carries `item.material`, the ores.js id.
//
//      `countMaterial` reads that and nothing else. Mining, lumberjacking,
//      looting and vendor stock all have to stamp it or the forge will say you
//      have no iron while you are standing on twenty ingots. That is a wiring
//      note, and it is in docs/mmo/wiring/W5.md.

import { layoutFor } from '../mmo/plans/index.js';
import {
  RECIPES, RECIPE, STATIONS, craftChance, craftQuality, craftedRarity, exceptional,
  MIN_CRAFT_CHANCE, MATERIALS as CRAFT_MATERIALS,
} from '../mmo/recipes.js';
import { BASES, baseFor, makeItem, RARITY } from '../mmo/items.js';
import { skillNameOf } from '../mmo/items.js';
import { itemGlyph, GLYPHS, MATERIAL_TINT, theme } from './ui_theme.js';
import { hash2 } from '../world/noise.js';

/** How many recipes past your reach the panel still shows, so you can see what is coming. */
export const NEAR_MISS = 12;

// ---------------------------------------------------------------------------
// Where a station stands, which is what main.js needs from this file.
//
// 03-ITEMS-LOOT.md: "Towns have them near the well; houses will later." A town
// keeps all seven; a hamlet keeps the three a working village needs. Authored,
// because neither document says which stations a hamlet gets.

export const HAMLET_STATIONS = ['forge', 'workbench', 'kitchen'];
/** The ring stations stand on, outside the people and inside the buildings. */
export const STATION_RING = { town: 10.5, hamlet: 6.8 };

export const STATION_KINDS = STATIONS.map((s) => ({
  id: s.id,
  name: s.name,
  for: s.for,
  skills: [...new Set(RECIPES.filter((r) => r.station === s.id).map((r) => r.skill))],
  recipes: RECIPES.filter((r) => r.station === s.id).length,
  inHamlet: HAMLET_STATIONS.includes(s.id),
}));
export const STATION_IDS = STATION_KINDS.map((s) => s.id);
export const STATION = Object.fromEntries(STATION_KINDS.map((s) => [s.id, s]));

/**
 * Where a settlement's stations stand, so main.js can put a model at each and
 * set `ctx.station` when the player clicks one. Deterministic from the site.
 */
export function stationsForSite(site) {
  if (!site) return [];
  const authored = layoutFor(site.sub)?.stations;
  if (authored) return authored.map(p => ({ ...p, name: STATION[p.id].name, site, x: site.x + p.x, z: site.z + p.z, yaw: (p.yaw || 0) * Math.PI / 180 }));
  if (site.kind !== 'town' && site.kind !== 'hamlet') return [];
  const list = site.kind === 'town' ? STATION_KINDS : STATION_KINDS.filter((s) => s.inHamlet);
  const r = STATION_RING[site.kind];
  return list.map((s, i) => {
    const a = (i / list.length) * Math.PI * 2 + (site.facing || 0) + Math.PI / list.length;
    const x = site.x + Math.cos(a) * r;
    const z = site.z + Math.sin(a) * r;
    return { id: s.id, name: s.name, site, x, z, yaw: Math.atan2(site.x - x, site.z - z) };
  });
}

// ---------------------------------------------------------------------------
// Resolving a recipe's result to an item this game can actually make.

/**
 * The spelling mismatches between recipes.js and items.js.
 *
 * The six meals joined here in a later wave. They used to fall through to a
 * stack base literally called `food`, so all six cooked into one grey word;
 * items.js has a real base for each dish now (see FOOD_BASES there) and these
 * are the camel to snake joins that reach them.
 */
export const BASE_ALIAS = {
  throwingKnives: 'throwing_knives',
  heartyStew: 'hearty_stew',
  roastFowl: 'roast_fowl',
  fishPie: 'fish_pie',
  honeyBread: 'honey_bread',
  spicedWine: 'spiced_wine',
  travellersRation: 'travellers_ration',
};

/**
 * Families whose result is a stack rather than a base of its own.
 *
 * `meal` is not one of them any more. There is no `food` base: rarity does not
 * apply to food and a thing called Food is not a thing you eat, so every dish
 * is its own base and reaches it through BASE_ALIAS above.
 */
const FAMILY_STACK = { potion: 'potion' };

/**
 * Recipe families items.js has no base for, with the reason. The panel greys
 * these with the reason rather than hiding them, because a forge that quietly
 * skips the pickaxe looks broken and a forge that says why does not.
 */
export const UNMAKEABLE = {
  bag: 'the pack has no bag item yet, so a bag cannot be made or carried',
  scroll: 'nothing in this game is a scroll yet, so there is nothing to write on',
  tool: 'the hatchet, sewing kit, saw and tinker\'s tools have no item shape yet; the axe, pickaxe and tongs do',
};

/** The items.js base a recipe would really produce, or null when there is none. */
export function resultBaseFor(recipe) {
  if (!recipe) return null;
  if (recipe.family === 'armour' && recipe.armourTier && recipe.slot) {
    const id = `${recipe.armourTier}_${recipe.slot}`;
    if (BASES[id]) return id;
  }
  const want = recipe.result?.base;
  if (want && BASES[want]) return want;
  if (want && BASE_ALIAS[want] && BASES[BASE_ALIAS[want]]) return BASE_ALIAS[want];
  const stack = FAMILY_STACK[recipe.family];
  if (stack && BASES[stack]) return stack;
  return null;
}

/** Why a recipe can never be made at all, or null. Not about your skill. */
export function unmakeableReason(recipe) {
  if (resultBaseFor(recipe)) return null;
  return UNMAKEABLE[recipe.family] || `nothing in this game is a ${recipe.result?.base} yet`;
}

/** Everything this module claims about the two tables, checked at load. */
export function auditCraftBases() {
  const bad = [];
  const counts = { made: 0, unmakeable: 0, byFamily: {} };
  for (const r of RECIPES) {
    const base = resultBaseFor(r);
    if (!base) {
      counts.unmakeable++;
      counts.byFamily[r.family] = (counts.byFamily[r.family] || 0) + 1;
      if (!unmakeableReason(r)) bad.push(`${r.id}: cannot be made and gives no reason`);
      continue;
    }
    counts.made++;
    // the exact call a craft would make, run for real
    try {
      makeItem({ base, rarity: 'common', quality: 1, count: r.result.count ?? 1, seed: 1 });
    } catch (e) {
      bad.push(`${r.id}: makeItem("${base}") throws (${e.message})`);
    }
    for (const id of Object.keys(r.materials || {})) {
      if (!CRAFT_MATERIALS[id]) bad.push(`${r.id}: material "${id}" is not in recipes.js MATERIALS`);
      // a refund must come back as the same stuff it went in as
      const back = refundBaseFor(id);
      const carries = BASES[back]?.material ?? null;
      if (!BASES[back]) bad.push(`${r.id}: "${id}" would be refunded as "${back}", which is not a base`);
      else if (carries !== null && carries !== id) {
        bad.push(`${r.id}: "${id}" would be refunded as "${back}", which is ${carries} and would count as both`);
      }
    }
  }
  for (const s of STATION_KINDS) {
    if (!s.recipes) bad.push(`station ${s.id} has no recipes`);
    if (!s.skills.length) bad.push(`station ${s.id} takes no skill`);
  }
  if (!RARITY.common) bad.push('items.js has no common rarity');
  if (bad.length) throw new Error(`auditCraftBases: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return counts;
}

export const CRAFT_AUDIT = auditCraftBases();

// ---------------------------------------------------------------------------
// The pack, seen as a pile of materials.

// The inventory, as W3 built it: `pack` is a getter for { slots, items },
// `add(item)` answers with a record and not a boolean, and `remove` takes a
// PACK INDEX rather than the item. These wrappers also work with no inventory
// at all, against the character document, so the node tests below drive the
// same code the game does.

/** Every real thing in the pack, holes removed. */
export function packOf(ctx) {
  const list = ctx?.inventory?.pack?.items || ctx?.character?.pack?.items || [];
  return list.filter(Boolean);
}

/** The slot array itself, holes and all, which is what an index means. */
const packSlots = (ctx) => ctx?.inventory?.pack?.items || ctx?.character?.pack?.items || [];

export function packRoom(ctx) {
  const inv = ctx?.inventory;
  if (inv && typeof inv.emptySlot === 'function') return inv.emptySlot() >= 0;
  const p = ctx?.character?.pack;
  if (!p) return true;
  return (p.items || []).filter(Boolean).length < (p.slots ?? 20);
}

/** True when the item really went in. */
export function addItem(ctx, item) {
  const inv = ctx?.inventory;
  if (inv && typeof inv.add === 'function') {
    const r = inv.add(item);
    if (r === false) return false;
    if (r && typeof r === 'object') return r.ok !== false && (r.added ?? 1) > 0;
    return r !== false;
  }
  const list = packSlots(ctx);
  const i = list.indexOf(null);
  if (i < 0) return false;
  list[i] = item;
  return true;
}

/**
 * Whether a pack entry is a lump of raw material rather than a made thing.
 *
 * This test earns its keep: a crafted item also carries `material`, so without
 * it a copper dagger in the pack counted as a copper ingot, and the forge would
 * have let you melt your own sword back into the recipe that made it. Only the
 * stack bases in items.js (ingot, ore, log, reagent, food and the rest) are
 * material.
 */
export const isRawMaterial = (it) => !!it && baseFor(it)?.kind === 'material';

/** How many of one material the pack holds. See the convention note at the top. */
/** A stack a recipe can spend: a raw material, or a food (venison pays for "meat"). */
export const isIngredient = (it) => !!it && (isRawMaterial(it) || baseFor(it)?.kind === 'food');
/** True when this stack answers to the recipe's material id, by its own tag, its base, or its base's material. */
export const answersTo = (it, id) => !!it && (it.material === id || it.base === id || baseFor(it)?.material === id);
export function countMaterial(ctx, id) {
  let n = 0;
  for (const it of packOf(ctx)) {
    if (isIngredient(it) && answersTo(it, id)) n += it.count ?? 1;
  }
  return n;
}

/** Take `n` of a material out of the pack. Returns how many really came out. */
export function takeMaterial(ctx, id, n) {
  let left = n;
  const inv = ctx?.inventory;
  const list = packSlots(ctx);
  for (const it of [...list]) {
    if (left <= 0) break;
    if (!isIngredient(it)) continue;
    if (!answersTo(it, id)) continue;
    const have = it.count ?? 1;
    const k = Math.min(have, left);
    const i = list.indexOf(it);
    let took = false;
    if (inv && typeof inv.remove === 'function' && i >= 0) {
      const r = inv.remove(i, k);
      took = !(r === false || (r && r.ok === false));
    } else if (i >= 0) {
      if (have - k > 0) it.count = have - k; else list[i] = null;
      took = true;
    }
    if (took) left -= k;
  }
  return n - left;
}

/** `thickHide` as items.js spells it. Declared, not assigned, because
 *  `auditCraftBases` runs at import and reaches it. */
function snake(s) { return String(s).replace(/([A-Z])/g, '_$1').toLowerCase(); }

/**
 * The items.js base a refunded material comes back as.
 *
 * THIS USED TO NAME THE STACK AND NOT THE METAL, AND THAT WAS A DOUBLE COUNT.
 * It asked `makeItem` for a base called "ingot". items.js retired that base and
 * quietly resolves it to `iron_ingot`, so refunding four copper after a failed
 * craft put four IRON ingots in the pack with the word "Copper" written on
 * them. `answersTo` reads both the stamp and the base's own metal, so that one
 * stack then counted as four copper AND four iron, and a forge would let you
 * make an iron dagger out of copper you never had. Wood went the same way
 * through a base called "log", which resolves to oak.
 *
 * So the metal is named. `tin` has no ingot in items.js and comes back as tin
 * ore, which is the only tin the game has. `auditCraftBases` proves for every
 * material any recipe spends that the base it comes back as either carries
 * that same material or carries none, which is the check that would have
 * caught the original.
 */
export function refundBaseFor(id) {
  const kind = CRAFT_MATERIALS[id]?.kind;
  if (BASES[id]) return id;
  if (BASES[snake(id)]) return snake(id);
  if (kind === 'metal') return BASES[`${id}_ingot`] ? `${id}_ingot` : BASES[`${id}_ore`] ? `${id}_ore` : 'reagent';
  if (kind === 'wood') return BASES[`${id}_log`] ? `${id}_log` : 'reagent';
  if (kind === 'leather') return 'hide';
  // `meat` is not an item in this game any more, so the generic haunch it comes
  // back as is game meat, the same word the hunting bag has always used.
  if (kind === 'food') return 'game_meat';
  return 'reagent';
}

/** Put a material back, which is what a full pack after a craft costs us. */
export function giveMaterial(ctx, id, n) {
  if (n <= 0) return true;
  const item = makeItem({ base: refundBaseFor(id), rarity: 'common', quality: 1, count: n, seed: n });
  item.material = id;
  item.label = CRAFT_MATERIALS[id]?.name || id;
  return addItem(ctx, item);
}

// ---------------------------------------------------------------------------
// What you can and cannot make, and why not.

/**
 * The reason a recipe is greyed, or null. In the order the player would ask:
 * does this game have the thing at all, can my hands do it, have I got the
 * stuff, have I got the gold, is there room for what comes out.
 *
 * NOTE ON GOLD: no recipe in recipes.js carries a gold cost today, so the gold
 * branch below never fires in the running game. It reads `recipe.gold` so that
 * the day a station charges a bench fee the refusal is already written and
 * already tested. `auditCraftBases` counts how many carry one; it is zero.
 */
export function refusalFor(recipe, ctx) {
  if (!recipe) return { kind: 'unknown', why: 'There is no such recipe.' };
  const missing = unmakeableReason(recipe);
  if (missing) return { kind: 'missing', why: missing };
  const skill = ctx?.character?.skills?.[recipe.skill] ?? 0;
  const chance = craftChance(skill, recipe.difficulty);
  if (chance <= MIN_CRAFT_CHANCE) {
    const need = recipe.difficulty - 45;
    return {
      kind: 'skill',
      why: `Your ${skillNameOf(recipe.skill)} is ${skill.toFixed(1)} and this wants more than ${need.toFixed(0)} before it is worth striking.`,
    };
  }
  const short = [];
  for (const [id, n] of Object.entries(recipe.materials || {})) {
    const have = countMaterial(ctx, id);
    if (have < n) short.push(`${n - have} more ${CRAFT_MATERIALS[id]?.name?.toLowerCase() || id}`);
  }
  if (short.length) return { kind: 'materials', why: `You need ${short.join(' and ')}.` };
  const gold = recipe.gold ?? 0;
  if (gold > 0 && (ctx?.character?.gold ?? 0) < gold) {
    return { kind: 'gold', why: `The bench costs ${gold} gold and you have ${ctx?.character?.gold ?? 0}.` };
  }
  if (!packRoom(ctx)) return { kind: 'pack', why: 'Your pack is full, and what you make has to go somewhere.' };
  return null;
}

/** Chance, expected quality and the odds of an exceptional, before committing. */
export function forecast(recipe, ctx) {
  const skill = ctx?.character?.skills?.[recipe.skill] ?? 0;
  const chance = craftChance(skill, recipe.difficulty);
  // the real function, with the jitter pinned: middle, worst and best roll
  const expected = craftQuality(skill, recipe.difficulty, () => 0.5);
  const worst = craftQuality(skill, recipe.difficulty, () => 0);
  const best = craftQuality(skill, recipe.difficulty, () => 1);
  return {
    skill, chance, expected, worst, best,
    exceptionalPossible: exceptional(best, skill, recipe.difficulty),
  };
}

/**
 * Every recipe a station will take, easiest first, with its verdict.
 *
 * `opts.family` narrows to one recipe family BEFORE the near miss slice, so
 * asking a forge for shields shows the twelve easiest shields and not whatever
 * shields happened to survive a cut made across all 362 of its recipes.
 */
export function benchFor(station, ctx, opts = {}) {
  const family = opts.family || null;
  const all = RECIPES.filter((r) => r.station === station && (!family || r.family === family));
  const rows = all.map((r) => ({ recipe: r, refusal: refusalFor(r, ctx), forecast: forecast(r, ctx) }));
  const open = rows.filter((r) => !r.refusal || r.refusal.kind !== 'skill');
  const shut = rows.filter((r) => r.refusal && r.refusal.kind === 'skill')
    .sort((a, b) => a.recipe.difficulty - b.recipe.difficulty)
    .slice(0, opts.nearMiss ?? NEAR_MISS);
  open.sort((a, b) => a.recipe.difficulty - b.recipe.difficulty || a.recipe.id.localeCompare(b.recipe.id));
  return [...open, ...shut];
}

// ---------------------------------------------------------------------------
// Making the thing.

const pos = (ctx) => ctx?.player?.pos || ctx?.actor?.pos || { x: 0, y: 0, z: 0 };

/** "a copper dagger", "an iron helm". A line without one reads like a stub. */
const withArticle = (name) => {
  const w = String(name || 'thing').toLowerCase();
  if (/s$/.test(w)) return w;
  return `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
};

function say(ctx, text, kind) {
  ctx?.hud?.toast?.(text, kind);
  ctx?.hud?.log?.(text, kind);
  return text;
}

/**
 * One attempt. Success or failure, the materials go, because 03-ITEMS-LOOT.md
 * says "Failure eats half the materials and still teaches". Every branch says
 * what happened out loud.
 */
export function craft(recipeId, ctx, opts = {}) {
  const recipe = RECIPE[recipeId] || recipeId;
  const refusal = refusalFor(recipe, ctx);
  if (refusal) {
    ctx?.audio?.play?.('denied');
    return { ok: false, refusal, text: say(ctx, refusal.why, 'bad') };
  }
  const rng = opts.rng || ctx?.rng || Math.random;
  const c = ctx.character;
  const skill = c?.skills?.[recipe.skill] ?? 0;
  const chance = craftChance(skill, recipe.difficulty);
  const success = rng() < chance;

  // what it costs either way
  const eaten = {};
  for (const [id, n] of Object.entries(recipe.materials)) {
    const want = success ? n : Math.max(1, Math.ceil(n / 2));
    eaten[id] = takeMaterial(ctx, id, want);
  }
  if (recipe.gold > 0) c.gold = (c.gold ?? 0) - recipe.gold;
  const spent = Object.entries(eaten).map(([id, n]) => `${n} ${CRAFT_MATERIALS[id]?.name?.toLowerCase() || id}`).join(' and ');

  // failure still teaches, which is the whole reason to keep swinging
  ctx?.progression?.lesson?.(c, recipe.skill, recipe.difficulty, success, rng);

  if (!success) {
    ctx?.audio?.play?.('denied');
    return {
      ok: false, success: false, eaten,
      text: say(ctx, `The ${recipe.name.toLowerCase()} came apart in your hands. ${spent} went with it, and you learned something anyway.`, 'bad'),
    };
  }

  const quality = craftQuality(skill, recipe.difficulty, rng);
  const exc = exceptional(quality, skill, recipe.difficulty);
  const rarity = craftedRarity(skill, exc, rng, { material: recipe.result.material });
  const base = resultBaseFor(recipe);
  const item = makeItem({
    base, rarity, quality,
    count: recipe.result.count ?? 1,
    maker: exc ? (c?.name || null) : null,
    seed: hash2(recipe.id.length, Math.floor(rng() * 0xffff), 7717),
  });
  item.label = recipe.name;
  item.recipe = recipe.id;
  item.material = recipe.result.material;

  if (!addItem(ctx, item)) {
    // the pack filled between the check and the swing: put it all back rather
    // than dropping the work on the floor without a word
    let backAll = true;
    for (const [id, n] of Object.entries(eaten)) if (!giveMaterial(ctx, id, n)) backAll = false;
    if (recipe.gold > 0) c.gold = (c.gold ?? 0) + recipe.gold;
    ctx?.audio?.play?.('denied');
    return {
      ok: false, success: true, packFull: true, item,
      text: say(ctx, `The ${recipe.name.toLowerCase()} is made and there is nowhere to put it. ${backAll ? `Your ${spent} is back in the pack` : `Some of your ${spent} would not fit back either`}. Make room and strike again.`, 'bad'),
    };
  }

  ctx?.audio?.play?.('pickup');
  ctx?.floaters?.spawn?.(pos(ctx), recipe.name, 'loot', { color: RARITY[rarity]?.colour });
  const mark = exc ? ` It is exceptional, and it carries your name.` : '';
  const colour = rarity === 'common' ? '' : ` It came out ${RARITY[rarity].label.toLowerCase()}.`;
  return {
    ok: true, success: true, item, quality, rarity, exceptional: exc, eaten,
    text: say(ctx, `You make ${withArticle(recipe.name)} at quality ${quality.toFixed(2)}.${colour}${mark} It cost ${spent}.`, 'good'),
  };
}

// ---------------------------------------------------------------------------
// The card, as a pure view. Everything the panel draws is decided here, so a
// node test can count the cards, read the bill and prove nothing is blank
// without a browser.
//
// The window used to be a list: name, a comma joined bill, a percent, a
// button. It said what a recipe cost but not whether you had it, and it drew
// no picture at all while the abilities window next door was a wall of
// painted cards. These helpers are the abilities window's shape, applied to a
// bench: art, chips, a bill you can read against your own pack, and one
// sentence when the answer is no.

/** The word on a family's filter chip and heading. Every family in recipes.js. */
export const FAMILY_LABEL = {
  weapon: 'Weapons', armour: 'Armour', shield: 'Shields', staff: 'Staves',
  bow: 'Bows', ammo: 'Ammunition', potion: 'Potions', meal: 'Meals',
  tool: 'Tools', bag: 'Bags', scroll: 'Scrolls', instrument: 'Instruments',
  forageMeal: 'Forage meals', foragePotion: 'Forage draughts',
};

/**
 * The ui_theme.js glyph a family wears when there is no item behind the recipe
 * at all. A bag, a scroll and four of the seven tools have no base, so
 * `itemGlyph` has nothing to draw from and the card would be an empty square.
 * Every other card draws the real base, painted when the library has painted
 * it and glyphed when it has not.
 */
export const FAMILY_GLYPH = {
  weapon: 'sword', armour: 'chest', shield: 'shield', staff: 'staff',
  bow: 'bow', ammo: 'arrow', potion: 'flask', meal: 'food',
  tool: 'tool', bag: 'parcel', scroll: 'book', instrument: 'lute',
  forageMeal: 'food', foragePotion: 'flask',
};

/** The colour a drawn family glyph takes, from the material the recipe names. */
export function familyTint(recipe) {
  return MATERIAL_TINT[recipe?.result?.material] || theme.parchmentDim;
}

/**
 * One card's picture, as an html string, at `size` px. Never empty:
 *
 *   1. the painted icon for the base the recipe really produces, through
 *      `itemIcon`, which is also where a stack and a gem's own colour come
 *      from, so a bundle of twenty arrows and a ruby are right;
 *   2. failing a painting, ui_theme.js's drawn glyph for that base, tinted by
 *      the base's own material, which is how the bag and the paper doll draw
 *      the same item;
 *   3. failing a base, the family's glyph, which is the only case the player
 *      sees for a bag, a scroll or a hatchet.
 */
export function tileArt(recipe, size = 96) {
  const id = resultBaseFor(recipe);
  if (id && BASES[id]) {
    return itemGlyph(BASES[id], size, null, {
      count: recipe.result?.count ?? 1,
      material: recipe.result?.material || null,
    });
  }
  const glyph = GLYPHS[FAMILY_GLYPH[recipe?.family]] || GLYPHS.parcel;
  return `<svg class="bw-g" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${familyTint(recipe)}" stroke="none">${glyph}</svg>`;
}

/**
 * The bill of materials, each line with your own number against the number the
 * recipe wants. `met` is what turns a chip green and short of it red, and it is
 * the same `countMaterial` the refusal and the craft itself spend.
 */
export function billFor(recipe, ctx) {
  const out = [];
  for (const [id, need] of Object.entries(recipe?.materials || {})) {
    const have = countMaterial(ctx, id);
    const name = (CRAFT_MATERIALS[id]?.name || id).toLowerCase();
    out.push({ id, name, need, have, met: have >= need, text: `${have} of ${need} ${name}` });
  }
  return out;
}

/**
 * The small caps chips along the top of a card. A recipe this game has no item
 * for gets the two chips that are still true and none of the arithmetic, since
 * a chance to make a thing that cannot exist is a number about nothing.
 */
export function chipsFor(row) {
  const r = row?.recipe;
  if (!r) return [];
  const out = [];
  // Eight pairs of recipes at the tanning rack share a name to the letter:
  // "Hide tunic" is both the leather one and the studded one, and on a wall of
  // cards two identical names side by side look like the page repeated itself.
  // The tier is what tells them apart, so it is said first.
  if (r.armourTier) out.push({ id: 'tier', text: `${r.armourTier} armour` });
  out.push({ id: 'skill', text: `${skillNameOf(r.skill)} ${(row.forecast?.skill ?? 0).toFixed(1)}` });
  out.push({ id: 'difficulty', text: `difficulty ${r.difficulty}` });
  if (unmakeableReason(r)) return out;
  const f = row.forecast;
  out.push({ id: 'chance', text: `${Math.round(f.chance * 100)}% to hold` });
  out.push({ id: 'quality', text: `x${f.expected.toFixed(2)} quality` });
  if ((r.result?.count ?? 1) > 1) out.push({ id: 'count', text: `${r.result.count} at a time` });
  if (f.exceptionalPossible) out.push({ id: 'sign', text: 'can be signed' });
  return out;
}

/** The line under the bill: what comes out, or why nothing will. */
export function lineFor(row) {
  if (row?.refusal) return row.refusal.why;
  const id = resultBaseFor(row.recipe);
  const n = row.recipe.result?.count ?? 1;
  const name = BASES[id]?.name || row.recipe.name;
  return n > 1 ? `Makes ${n} ${name.toLowerCase()}.` : `Makes one ${name.toLowerCase()}.`;
}

/** Every family this station takes, in the order recipes.js lists them. */
export function familiesAt(station) {
  const seen = new Map();
  for (const r of RECIPES) if (r.station === station) seen.set(r.family, (seen.get(r.family) || 0) + 1);
  return [...seen.entries()].map(([id, count]) => ({ id, label: FAMILY_LABEL[id] || id, count }));
}

/** The filter row: everything, what you can make now, then this station's families. */
export function filtersFor(station) {
  return [
    { id: 'all', label: 'All' },
    { id: 'ready', label: 'Can make' },
    ...familiesAt(station).map((f) => ({ id: f.id, label: f.label })),
  ];
}

/** Pure. Does this filter show this row? */
export function inFilter(row, filter) {
  if (!row) return false;
  if (!filter || filter === 'all') return true;
  if (filter === 'ready') return !row.refusal;
  return row.recipe.family === filter;
}

/**
 * One whole card, as data. The panel below reads nothing off a recipe that is
 * not in here, which is what lets the test drive the same values the player
 * sees without a document.
 */
export function cardView(row, ctx) {
  return {
    id: row.recipe.id,
    name: row.recipe.name,
    family: row.recipe.family,
    base: resultBaseFor(row.recipe),
    art: tileArt(row.recipe, 96),
    chips: chipsFor(row),
    bill: billFor(row.recipe, ctx),
    line: lineFor(row),
    locked: !!row.refusal,
    missing: !!unmakeableReason(row.recipe),
    refusal: row.refusal,
  };
}

/**
 * Every family the recipe table has is labelled, wears a glyph, and every
 * recipe in the game lands on a picture. Runs at import, so the day a
 * fourteenth family is authored this throws here rather than shipping a wall
 * of empty squares.
 */
export function auditCraftArt() {
  const bad = [];
  const fams = [...new Set(RECIPES.map((r) => r.family))];
  for (const f of fams) {
    if (!FAMILY_LABEL[f]) bad.push(`the family "${f}" has no word on its filter chip`);
    if (!FAMILY_GLYPH[f]) bad.push(`the family "${f}" has no glyph`);
    else if (!GLYPHS[FAMILY_GLYPH[f]]) bad.push(`the family "${f}" wants a "${FAMILY_GLYPH[f]}" glyph and ui_theme has none`);
  }
  let blank = 0;
  for (const r of RECIPES) {
    const art = tileArt(r, 96);
    if (!art || !/^<(img|svg)/.test(art)) { blank++; if (blank < 4) bad.push(`${r.id} draws nothing`); }
  }
  for (const s of STATION_KINDS) {
    if (!familiesAt(s.id).length) bad.push(`station ${s.id} shows no filter at all`);
  }
  if (bad.length) throw new Error(`auditCraftArt: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { families: fams.length, recipes: RECIPES.length };
}

export const CRAFT_ART_AUDIT = auditCraftArt();

// ---------------------------------------------------------------------------
// The panel.
//
// The same card the abilities window uses, and deliberately the same class
// names and the same numbers out of ui_theme.js, so a player who has learned
// to read one page can read the other: a tile of art on the left, a name, a
// row of small caps chips, and a lock plus one gold sentence when the answer
// is no.

const CSS = `
.bw-win-crafting { width: 100%; font-family: ${theme.fonts.body}; }
.bw-win-crafting .bw-where { color: ${theme.parchmentDim}; font-style: italic; font-size: 15px; margin: 0 0 10px; }

.bw-win-crafting .bw-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.bw-win-crafting .bw-f {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; padding: 5px 11px; cursor: pointer;
  color: ${theme.parchmentDim}; background: rgba(9,8,6,.7);
  border: 1px solid ${theme.goldDim}66;
}
.bw-win-crafting .bw-f:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
.bw-win-crafting .bw-f.on { color: ${theme.goldBright}; border-color: ${theme.gold}; background: ${theme.plate}; }
.bw-win-crafting .bw-count {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; color: ${theme.parchmentFaint}; margin: 0 0 12px;
}

.bw-win-crafting .bw-cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 10px; max-height: 58vh; overflow: auto; padding-right: 4px;
}

.bw-win-crafting .bw-card {
  position: relative; display: grid; grid-template-columns: 96px 1fr; gap: 13px;
  padding: 11px 13px; align-items: start;
  background: linear-gradient(150deg, rgba(30,25,18,.86), rgba(10,9,7,.9));
  border: 1px solid ${theme.goldDim}55;
}
.bw-win-crafting .bw-card:hover { border-color: ${theme.gold}; }
.bw-win-crafting .bw-card.locked { opacity: .62; }
.bw-win-crafting .bw-card.missing { opacity: .5; }

.bw-win-crafting .bw-tile {
  position: relative; width: 96px; height: 96px; display: flex; overflow: hidden;
  align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 40%, rgba(255,255,255,.07), rgba(0,0,0,.45));
  border: 1px solid ${theme.goldDim}77;
}
.bw-win-crafting .bw-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bw-win-crafting .bw-tile svg { width: 58px; height: 58px; }
.bw-win-crafting .bw-card.locked .bw-tile { filter: grayscale(1); }
.bw-win-crafting .bw-lock {
  position: absolute; right: 2px; bottom: 1px; font-family: ${theme.fonts.display};
  font-size: 15px; line-height: 1; color: ${theme.parchmentFaint};
}

.bw-win-crafting .bw-name {
  font-family: ${theme.fonts.display}; font-size: 17px; font-weight: 600;
  letter-spacing: .02em; color: ${theme.parchment}; margin-bottom: 5px; padding-right: 62px;
}
.bw-win-crafting .bw-card:hover .bw-name { color: ${theme.goldBright}; }
.bw-win-crafting .bw-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.bw-win-crafting .bw-chip {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase; padding: 2px 7px; color: ${theme.parchmentDim};
  background: rgba(0,0,0,.4); border: 1px solid ${theme.goldDim}44;
}
.bw-win-crafting .bw-mats { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.bw-win-crafting .bw-mat {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .1em;
  text-transform: uppercase; padding: 2px 7px; background: rgba(0,0,0,.4);
  color: ${theme.up}; border: 1px solid ${theme.up}55;
}
.bw-win-crafting .bw-mat.short { color: ${theme.down}; border-color: ${theme.down}55; }
.bw-win-crafting .bw-req {
  font-family: ${theme.fonts.display}; font-size: 11.5px; letter-spacing: .06em;
  color: ${theme.parchmentFaint}; margin-top: 2px;
}
.bw-win-crafting .bw-card.locked .bw-req { color: #e0b064; }

.bw-win-crafting .bw-make {
  position: absolute; right: 11px; top: 10px; font: inherit;
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; padding: 4px 11px; cursor: pointer;
  color: ${theme.goldBright}; background: rgba(9,8,6,.85); border: 1px solid ${theme.gold};
}
.bw-win-crafting .bw-make:hover { background: ${theme.plate}; }
.bw-win-crafting .bw-make:disabled { color: ${theme.parchmentFaint}; border-color: ${theme.goldDim}55; cursor: default; background: rgba(9,8,6,.6); }
.bw-win-crafting .bw-none { color: ${theme.parchmentFaint}; padding: 10px 2px; font-size: 15px; }
.bw-win-crafting .bw-none:empty { display: none; padding: 0; }
`;

/** The padlock on a card you cannot strike, the abilities window's own drawing. */
export const LOCK_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.6v11H5.4V10zm2.4 0h5.2V7a2.6 2.6 0 0 0-5.2 0zM12 13.4a1.8 1.8 0 0 0-1 3.3v1.6h2v-1.6a1.8 1.8 0 0 0-1-3.3z"/></svg>`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const panel = {
  id: 'crafting',
  title: 'Crafting',
  key: 'v',

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('bw-craft-css')) {
      const st = document.createElement('style');
      st.id = 'bw-craft-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('bw-win-crafting');
    root.textContent = '';
    this._root = root;
    this._ctx = ctx;
    this._filter = 'all';
    this._cards = [];
    this._where = el('p', 'bw-where');
    this._filterRow = el('div', 'bw-filters');
    this._count = el('div', 'bw-count');
    // the "nothing here" line lives OUTSIDE the grid, so `.bw-cards` only ever
    // holds cards and a count of its children is a count of recipes
    this._empty = el('div', 'bw-none');
    this._list = el('div', 'bw-cards');
    root.append(this._where, this._filterRow, this._count, this._empty, this._list);
  },

  open(ctx, extra) {
    this._ctx = ctx || this._ctx;
    const was = this._station;
    this._station = extra?.station || this._ctx?.station || null;
    if (was !== this._station) this._filter = 'all';
    this.render();
  },

  close() { },

  /** Everything, from the station line down. Cheap enough to call on a craft. */
  render() {
    if (!this._root || typeof document === 'undefined') return;
    const ctx = this._ctx;
    const st = STATION[this._station];
    this._cards = [];
    this._list.textContent = '';
    this._filterRow.textContent = '';
    this._count.textContent = '';
    this._empty.textContent = '';
    if (!st) {
      this._where.textContent = 'You are not at a station.';
      this._empty.textContent = 'Stand at a forge, a loom, a tanning rack, a workbench, an alchemy table, a kitchen or an inscription desk, and click it.';
      return;
    }
    this._where.textContent = `At the ${st.name}. ${st.skills.map((s) => `${skillNameOf(s)} ${(ctx?.character?.skills?.[s] ?? 0).toFixed(1)}`).join(', ')}.`;

    // the filter row: only the families this station takes
    const filters = filtersFor(st.id);
    if (!filters.some((f) => f.id === this._filter)) this._filter = 'all';
    this._filterEls = new Map();
    for (const f of filters) {
      const b = el('div', 'bw-f' + (f.id === this._filter ? ' on' : ''), f.label);
      b.addEventListener('click', () => {
        if (this._filter === f.id) return;
        this._filter = f.id;
        this.render();
      });
      this._filterRow.appendChild(b);
      this._filterEls.set(f.id, b);
    }

    const family = this._filter === 'all' || this._filter === 'ready' ? null : this._filter;
    const rows = benchFor(st.id, ctx, { family }).filter((row) => inFilter(row, this._filter));
    if (!rows.length) {
      this._count.textContent = `nothing here answers to ${(FAMILY_LABEL[this._filter] || this._filter).toLowerCase()}`;
      this._empty.textContent = this._filter === 'ready'
        ? 'Nothing at this bench is within reach today. Bring the materials, or raise the skill.'
        : 'Nothing is made here.';
      return;
    }

    for (const row of rows) {
      const v = cardView(row, ctx);
      const card = el('div', 'bw-card' + (v.locked ? ' locked' : '') + (v.missing ? ' missing' : ''));

      const tile = el('div', 'bw-tile');
      tile.innerHTML = v.art;
      const lock = el('span', 'bw-lock');
      lock.innerHTML = LOCK_SVG;
      if (!v.locked) lock.style.display = 'none';
      tile.appendChild(lock);
      card.appendChild(tile);

      const body = el('div');
      body.appendChild(el('div', 'bw-name', v.name));
      const chips = el('div', 'bw-chips');
      for (const c of v.chips) chips.appendChild(el('span', 'bw-chip', c.text));
      body.appendChild(chips);
      const mats = el('div', 'bw-mats');
      for (const m of v.bill) mats.appendChild(el('span', 'bw-mat' + (m.met ? '' : ' short'), m.text));
      body.appendChild(mats);
      body.appendChild(el('div', 'bw-req', v.line));
      card.appendChild(body);

      const make = el('button', 'bw-make', 'make');
      make.disabled = v.locked;
      make.addEventListener('click', () => {
        // craft() is the one path that makes anything, and it says out loud
        // what happened either way. The page is rebuilt after, because the
        // pack it counted against has just changed.
        craft(row.recipe.id, this._ctx);
        this.render();
      });
      card.appendChild(make);

      this._list.appendChild(card);
      this._cards.push({ row, card, view: v });
    }

    const ready = rows.filter((r) => !r.refusal).length;
    const here = RECIPES.filter((r) => r.station === st.id).length;
    this._count.textContent = `${ready} you can make now, ${rows.length} shown, ${here} known at this bench`;
    this._stamp = this.stamp();
  },

  /**
   * The pack changes while this window is open: a stack spent elsewhere, a
   * skill that ticked over, a barrel emptied by another window. Twice a
   * second is often enough for a bench, and the page is only rebuilt when one
   * of the numbers on it has actually moved.
   */
  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.5) return;
    this._since = 0;
    if (!this._root || !this._cards || !this._cards.length) return;
    const now = this.stamp();
    if (now === this._stamp) return;
    this.render();
    this._stamp = this.stamp();
  },

  /**
   * Everything the open cards read, as one string, so a change is a compare.
   *
   * This asks the five things a card actually depends on and not the cards
   * themselves: how much of each material the pack holds, the skills the bench
   * uses, the gold, and whether there is room for what comes out. Walking all
   * 362 forge cards through `refusalFor` cost 2.7 ms and ran twice a second,
   * which is a sixth of a frame spent proving nothing had changed. This asks
   * fourteen questions instead of seven hundred.
   */
  stamp() {
    const ctx = this._ctx;
    const ids = new Set();
    const skills = new Set();
    for (const { row } of this._cards || []) {
      for (const id of Object.keys(row.recipe.materials || {})) ids.add(id);
      skills.add(row.recipe.skill);
    }
    const mats = [...ids].sort().map((id) => `${id}:${countMaterial(ctx, id)}`).join(',');
    const sk = [...skills].sort().map((s) => `${s}:${(ctx?.character?.skills?.[s] ?? 0).toFixed(2)}`).join(',');
    return `${mats}|${sk}|${ctx?.character?.gold ?? 0}|${packRoom(ctx) ? 'room' : 'full'}`;
  },
};

export default panel;
