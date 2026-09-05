// The Crafting panel: a station, the recipes it will take, and the arithmetic
// shown before you commit to any of them.
//
// All the numbers are `src/mmo/recipes.js`. Nothing here re-derives a chance, a
// quality or a rarity; the expected quality on screen is the real
// `craftQuality` called with a jitter of nothing, so the number the player
// reads and the number the roll uses come from one function.
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

import {
  RECIPES, RECIPE, STATIONS, craftChance, craftQuality, craftedRarity, exceptional,
  MIN_CRAFT_CHANCE, MATERIALS as CRAFT_MATERIALS,
} from '../mmo/recipes.js';
import { BASES, baseFor, makeItem, RARITY } from '../mmo/items.js';
import { skillNameOf } from '../mmo/items.js';
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
  if (!site || (site.kind !== 'town' && site.kind !== 'hamlet')) return [];
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
  tool: 'only the axe exists as an item; the other tools have no shape yet',
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

/** Put a material back, which is what a full pack after a craft costs us. */
export function giveMaterial(ctx, id, n) {
  if (n <= 0) return true;
  // A food material goes back as a real food. `fish` is its own base; `meat`
  // is not an item in this game any more, so the generic haunch it comes back
  // as is game meat, the same word the hunting bag has always used.
  const base = CRAFT_MATERIALS[id]?.kind === 'metal' ? 'ingot'
    : CRAFT_MATERIALS[id]?.kind === 'wood' ? 'log'
      : CRAFT_MATERIALS[id]?.kind === 'food' ? (BASES[id] ? id : 'game_meat') : 'reagent';
  const item = makeItem({ base, rarity: 'common', quality: 1, count: n, seed: n });
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

/** Every recipe a station will take, easiest first, with its verdict. */
export function benchFor(station, ctx, opts = {}) {
  const all = RECIPES.filter((r) => r.station === station);
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
// The panel.

const CSS = `
.bw-win-crafting .bw-where{color:#95a08f;font-size:12.5px;margin:0 0 10px}
.bw-win-crafting .bw-list{display:flex;flex-direction:column;gap:0;max-height:52vh;overflow:auto}
.bw-win-crafting .bw-r{display:flex;align-items:center;gap:10px;padding:6px 2px;border-top:1px solid #2a332a}
.bw-win-crafting .bw-r.no{opacity:.55}
.bw-win-crafting .bw-r .n{flex:1 1 auto;min-width:0}
.bw-win-crafting .bw-r .n small{display:block;color:#8b9686;font-size:11.5px}
.bw-win-crafting .bw-r .c{color:#cbd8c2;font-variant-numeric:tabular-nums;min-width:112px;text-align:right;font-size:12px}
.bw-win-crafting .bw-r button{font:inherit;font-size:12px;padding:4px 9px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer}
.bw-win-crafting .bw-r button:disabled{opacity:.5;cursor:default}
.bw-win-crafting .bw-none{color:#8b9686;padding:10px 2px}
`;

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
    this._where = el('p', 'bw-where');
    this._list = el('div', 'bw-list');
    root.append(this._where, this._list);
  },

  open(ctx, extra) {
    this._ctx = ctx || this._ctx;
    this._station = extra?.station || this._ctx?.station || null;
    this.render();
  },

  close() { },

  render() {
    if (!this._root || typeof document === 'undefined') return;
    const ctx = this._ctx;
    const st = STATION[this._station];
    this._list.textContent = '';
    if (!st) {
      this._where.textContent = 'You are not at a station.';
      this._list.appendChild(el('div', 'bw-none', 'Stand at a forge, a loom, a tanning rack, a workbench, an alchemy table, a kitchen or an inscription desk, and click it.'));
      return;
    }
    this._where.textContent = `At the ${st.name}. ${st.skills.map((s) => `${skillNameOf(s)} ${(ctx?.character?.skills?.[s] ?? 0).toFixed(1)}`).join(', ')}.`;
    const rows = benchFor(st.id, ctx);
    if (!rows.length) { this._list.appendChild(el('div', 'bw-none', 'Nothing is made here.')); return; }
    for (const row of rows) {
      const r = el('div', 'bw-r' + (row.refusal ? ' no' : ''));
      const bill = Object.entries(row.recipe.materials)
        .map(([id, n]) => `${n} ${(CRAFT_MATERIALS[id]?.name || id).toLowerCase()}`).join(', ');
      const n = el('span', 'n', row.recipe.name);
      n.appendChild(el('small', null, row.refusal ? row.refusal.why : bill));
      const f = row.forecast;
      const c = el('span', 'c', `${Math.round(f.chance * 100)}%, x${f.expected.toFixed(2)}${f.exceptionalPossible ? ', can sign' : ''}`);
      const b = el('button', null, 'make');
      b.disabled = !!row.refusal;
      b.addEventListener('click', () => { craft(row.recipe.id, this._ctx); this.render(); });
      r.append(n, c, b);
      this._list.appendChild(r);
    }
  },
};

export default panel;
