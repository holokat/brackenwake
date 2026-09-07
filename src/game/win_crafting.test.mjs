// The Crafting panel. Run: node src/game/win_crafting.test.mjs
import {
  STATION_KINDS, STATION, stationsForSite, STATION_RING, HAMLET_STATIONS,
  resultBaseFor, unmakeableReason, UNMAKEABLE, BASE_ALIAS, auditCraftBases, CRAFT_AUDIT,
  refusalFor, forecast, benchFor, craft, countMaterial, takeMaterial, giveMaterial, packOf, NEAR_MISS,
  FAMILY_LABEL, FAMILY_GLYPH, familyTint, tileArt, billFor, chipsFor, lineFor,
  familiesAt, filtersFor, inFilter, cardView, auditCraftArt, CRAFT_ART_AUDIT, panel, refundBaseFor,
} from './win_crafting.js';
import { RECIPES, RECIPE, craftChance, craftQuality, MIN_CRAFT_CHANCE } from '../mmo/recipes.js';
import { BASES, makeItem } from '../mmo/items.js';
import { itemIcon } from './icon_art.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function mkCtx(over = {}) {
  const items = new Array(over.slots ?? 20).fill(null);
  const character = {
    name: 'Alred', gold: 100, skills: {}, pack: { slots: over.slots ?? 20, items }, ...over.character,
  };
  const toasts = [];
  const ctx = {
    stationAccess: over.stationAccess || (() => true),
    character,
    hud: { toast: (t, k) => toasts.push([t, k]) },
    audio: { play() {} },
    floaters: { spawn() {} },
    player: { pos: { x: 0, y: 0, z: 0 } },
    inventory: {
      get pack() { return character.pack; },
      emptySlot() { return character.pack.items.indexOf(null); },
      add(it) {
        if (over.addFails === 'all') return { ok: false, added: 0, dropped: it.count ?? 1 };
        if (over.addFails === 'results' && it.recipe) return { ok: false, added: 0, dropped: it.count ?? 1 };
        const list = character.pack.items;
        const i = list.indexOf(null);
        if (i < 0) return { ok: false, added: 0, dropped: it.count ?? 1 };
        list[i] = it;
        return { ok: true, added: it.count ?? 1, dropped: 0, index: i };
      },
      remove(where, n = null) {
        const list = character.pack.items;
        const i = typeof where === 'number' ? where : list.indexOf(where);
        const it = list[i];
        if (!it) return { ok: false, removed: 0, item: null };
        const have = it.count ?? 1;
        const want = n == null ? have : n;
        if (want < have) { it.count = have - want; return { ok: true, removed: want, item: it }; }
        list[i] = null;
        return { ok: true, removed: have, item: it };
      },
    },
    ...over.ctx,
  };
  ctx.toasts = toasts;
  return ctx;
}

// The pack the tests fill is the pack the game fills: `refundBaseFor` is what
// `giveMaterial` spends, so a test stack of copper is a copper ingot and not
// an iron one wearing the word copper. It used to ask for a base called
// "ingot", which items.js retires to `iron_ingot`, and that stack answered to
// BOTH copper and iron.
const stock = (ctx, id, n) => {
  const it = makeItem({ base: refundBaseFor(id), rarity: 'common', count: n });
  it.material = id;
  it.label = id;
  ctx.inventory.add(it);
  return it;
};

console.log('win_crafting: no craft button can throw');
check('the audit passes at load', (() => { try { auditCraftBases(); return true; } catch (e) { console.log(e.message); return false; } })());
check('most recipes really can be made', CRAFT_AUDIT.made > 400, `${CRAFT_AUDIT.made} of ${RECIPES.length}`);
check('the ones that cannot are counted and named', CRAFT_AUDIT.unmakeable === RECIPES.length - CRAFT_AUDIT.made, JSON.stringify(CRAFT_AUDIT.byFamily));
{
  let bad = 0;
  for (const r of RECIPES) {
    const base = resultBaseFor(r);
    if (!base) { if (!unmakeableReason(r)) bad++; continue; }
    try { makeItem({ base, rarity: 'common', quality: 1, count: r.result.count ?? 1 }); } catch { bad++; }
  }
  check('every recipe either makes a real item or gives a reason', bad === 0, `${RECIPES.length} recipes walked`);
}

console.log('win_crafting: the two spelling gaps between recipes.js and items.js');
{
  const armour = RECIPE['armour.cloth.head.cloth'];
  check('an armour recipe names the piece', armour.result.base === 'cloth_hood' && !BASES.cloth_hood, `recipe says "${armour.result.base}", items.js has no such base`);
  check('and it is resolved by tier and slot', resultBaseFor(armour) === 'cloth_head', `to "${resultBaseFor(armour)}"`);
  const every = RECIPES.filter((r) => r.family === 'armour');
  check('every armour recipe resolves', every.every((r) => !!resultBaseFor(r)), `${every.length} armour recipes`);
  const knives = RECIPES.find((r) => r.result.base === 'throwingKnives');
  check('throwingKnives finds throwing_knives', resultBaseFor(knives) === 'throwing_knives' && BASE_ALIAS.throwingKnives === 'throwing_knives');
  check('a potion becomes the potion stack', resultBaseFor(RECIPE['potion.heal']) === 'potion');
  check('a meal becomes its own dish, not a stack called food',
    resultBaseFor(RECIPE['meal.heartyStew']) === 'hearty_stew', String(resultBaseFor(RECIPE['meal.heartyStew'])));
  check('and all six meals have a dish of their own',
    ['heartyStew', 'roastFowl', 'fishPie', 'honeyBread', 'spicedWine', 'travellersRation']
      .every((k) => !!resultBaseFor(RECIPE[`meal.${k}`])));
  check('arrows are already the arrow stack', resultBaseFor(RECIPE['ammo.arrow.oak']) === 'arrow');
}

console.log('win_crafting: what cannot be made says why');
{
  // Which recipes have no item behind them is a live question: items.js is
  // growing tool bases as this is written, and every one it grows drops out of
  // this list on its own. So the test asks the live set, not a frozen one.
  const orphans = RECIPES.filter((r) => !resultBaseFor(r));
  check('every recipe with no item behind it gives a reason', orphans.every((r) => !!unmakeableReason(r)), `${orphans.length} of ${RECIPES.length}: ${[...new Set(orphans.map((r) => r.family))].join(', ')}`);
  check('and no reason carries an em dash', !orphans.some((r) => unmakeableReason(r).includes('—')));
  const bag = RECIPES.find((r) => r.family === 'bag');
  const scroll = RECIPES.find((r) => r.family === 'scroll');
  check('a bag says the pack has no bag item', /bag item/.test(unmakeableReason(bag)), unmakeableReason(bag));
  check('a scroll says nothing is a scroll yet', /scroll/.test(unmakeableReason(scroll)), unmakeableReason(scroll));
  check('an axe, which is a weapon, can be made', resultBaseFor(RECIPE['tool.axe']) === 'axe');
  const ctx = mkCtx({ character: { skills: { tailoring: 100, tinkering: 100 }, gold: 1000 } });
  const r = refusalFor(bag, ctx);
  check('the panel greys a bag with that reason even at skill 100', r && r.kind === 'missing', r && r.why);
  check('every reason in the table is a sentence', Object.values(UNMAKEABLE).every((t) => t.length > 20 && !t.includes('—')));
  // and the day items.js grows the base, the refusal goes away by itself
  check('a tool items.js has a base for is not refused for that reason', refusalFor(RECIPE['tool.axe'], ctx)?.kind !== 'missing');
}

console.log('win_crafting: the refusals, in order');
{
  const dagger = RECIPE['weapon.dagger.copper'];
  const hard = RECIPES.filter((r) => r.station === 'forge' && r.difficulty >= 90)[0];

  const green = mkCtx();
  check('a beginner is refused a difficulty 95 recipe on skill', refusalFor(hard, green).kind === 'skill', refusalFor(hard, green).why);
  check('and the reason names the skill and the number', /Blacksmithing/.test(refusalFor(hard, green).why), refusalFor(hard, green).why);

  const able = mkCtx({ character: { skills: { blacksmithing: 20 } } });
  const noMats = refusalFor(dagger, able);
  check('with the skill but no metal it is refused on materials', noMats.kind === 'materials', noMats.why);
  check('and it counts exactly what is missing', /2 more copper/.test(noMats.why), noMats.why);

  stock(able, 'copper', 1);
  check('one of two is still short by one', /1 more copper/.test(refusalFor(dagger, able).why), refusalFor(dagger, able).why);
  stock(able, 'copper', 1);
  check('with both it is not refused at all', refusalFor(dagger, able) === null);

  // the pack, full
  const full = mkCtx({ character: { skills: { blacksmithing: 20 } } });
  full.character.pack.items.fill(null);
  stock(full, 'copper', 40);
  for (let i = 1; i < full.character.pack.items.length; i++) full.character.pack.items[i] = makeItem({ base: 'ore', rarity: 'common' });
  const packed = refusalFor(dagger, full);
  check('a full pack is refused with the fifth reason', packed.kind === 'pack', packed.why);

  // gold, which nothing charges yet, driven with a recipe that does
  const fee = { ...dagger, gold: 500 };
  const poor = mkCtx({ character: { skills: { blacksmithing: 20 }, gold: 5 } });
  stock(poor, 'copper', 4);
  const g = refusalFor(fee, poor);
  check('a recipe with a bench fee is refused on gold', g.kind === 'gold', g.why);
  check('no recipe in the game charges one today', RECIPES.filter((r) => r.gold).length === 0, `0 of ${RECIPES.length}, so the branch is written and never fires until recipes.js grows one`);
}

console.log('win_crafting: the numbers shown before you commit');
{
  const dagger = RECIPE['weapon.dagger.copper'];
  const ctx = mkCtx({ character: { skills: { blacksmithing: 50 } } });
  const f = forecast(dagger, ctx);
  check('the chance is recipes.js own craftChance', Math.abs(f.chance - craftChance(50, dagger.difficulty)) < 1e-12, `${(f.chance * 100).toFixed(0)}% at skill 50 against difficulty ${dagger.difficulty}`);
  check('the expected quality is the real function with the jitter pinned', Math.abs(f.expected - craftQuality(50, dagger.difficulty, () => 0.5)) < 1e-12, `x${f.expected.toFixed(3)}`);
  check('the worst roll is below the best', f.worst < f.best, `x${f.worst.toFixed(3)} to x${f.best.toFixed(3)}`);
  check('the expected sits between them', f.expected > f.worst && f.expected < f.best);
  const gm = forecast(dagger, mkCtx({ character: { skills: { blacksmithing: 100 } } }));
  check('a grandmaster is better than a journeyman', gm.chance > f.chance && gm.expected > f.expected, `${(gm.chance * 100).toFixed(0)}% and x${gm.expected.toFixed(2)}`);
  check('at 95 over the difficulty a copper dagger can be signed', gm.exceptionalPossible === true, `skill 100 against difficulty ${dagger.difficulty}`);
  const great = RECIPE['weapon.greatsword.starfall'] || RECIPES.filter((r) => r.difficulty >= 90)[0];
  check('a difficulty 95 piece can never be signed, even at 100', forecast(great, mkCtx({ character: { skills: { blacksmithing: 100 } } })).exceptionalPossible === false, `difficulty ${great.difficulty}`);
}

console.log('win_crafting: the bench');
{
  const ctx = mkCtx({ character: { skills: { blacksmithing: 30, tinkering: 30 } } });
  const rows = benchFor('forge', ctx);
  check('the forge lists something', rows.length > 0, `${rows.length} rows`);
  check('every forge recipe is visible, including distant skill requirements', rows.length === RECIPES.filter((r) => r.station === 'forge').length, `${rows.length} of ${RECIPES.filter((r) => r.station === 'forge').length}`);
  check('at most twelve out of reach ones are shown', rows.filter((r) => r.refusal && r.refusal.kind === 'skill').length <= NEAR_MISS);
  check('every row carries a verdict and a forecast', rows.every((r) => r.forecast && (r.refusal === null || !!r.refusal.why)));
  const first = rows[0];
  check('the easiest thing is first', rows.every((r) => r.recipe.difficulty >= first.recipe.difficulty || (r.refusal && r.refusal.kind === 'skill')));
  const bare = benchFor('kitchen', mkCtx());
  check('a kitchen lists cooking, not smithing', bare.every((r) => r.recipe.station === 'kitchen'));
}

console.log('win_crafting: making it');
{
  const dagger = RECIPE['weapon.dagger.copper'];
  const always = () => 0.0001;      // succeeds, and rolls the low end of everything
  const never = () => 0.9999;       // fails

  const win = mkCtx({ character: { skills: { blacksmithing: 60 } } });
  stock(win, 'copper', 5);
  const r = craft('weapon.dagger.copper', win, { rng: always });
  check('a success puts a dagger in the pack', r.ok === true && win.character.pack.items.some((i) => i && i.base === 'dagger'));
  check('the copper went', countMaterial(win, 'copper') === 3, `${countMaterial(win, 'copper')} left of 5`);
  check('it carries the recipe name, the quality and the material', r.item.label === dagger.name && r.item.quality === r.quality && r.item.material === 'copper', `${r.item.label}, x${r.quality.toFixed(2)}, ${r.rarity}`);
  check('it said what happened', /You make/.test(r.text), r.text);

  const lose = mkCtx({ character: { skills: { blacksmithing: 60 } } });
  stock(lose, 'copper', 5);
  const f = craft('weapon.dagger.copper', lose, { rng: never });
  check('a failure makes nothing', f.ok === false && !lose.character.pack.items.some((i) => i && i.base === 'dagger'));
  check('and eats half the materials, as 03 says', countMaterial(lose, 'copper') === 4, `2 wanted, 1 eaten, ${countMaterial(lose, 'copper')} of 5 left`);
  check('and it said so', /came apart/.test(f.text) && /learned something/.test(f.text), f.text);

  // the lesson goes through progression, when there is one
  const lessons = [];
  const taught = mkCtx({ character: { skills: { blacksmithing: 60 } }, ctx: { progression: { lesson: (...a) => lessons.push(a) } } });
  stock(taught, 'copper', 5);
  craft('weapon.dagger.copper', taught, { rng: never });
  craft('weapon.dagger.copper', taught, { rng: always });
  check('both a failure and a success teach', lessons.length === 2 && lessons[0][3] === false && lessons[1][3] === true);
}

console.log('win_crafting: the pack that fills between the check and the swing');
{
  // refusalFor sees room, inventory.add refuses the result: the race the real
  // game can lose. The materials have to come back or the work is stolen.
  const ctx = mkCtx({ character: { skills: { blacksmithing: 60 } }, addFails: 'results' });
  stock(ctx, 'copper', 5);
  const before = countMaterial(ctx, 'copper');
  const r = craft('weapon.dagger.copper', ctx, { rng: () => 0.0001 });
  check('nothing was made', r.ok === false && r.packFull === true);
  check('the copper came back', countMaterial(ctx, 'copper') === before, `${countMaterial(ctx, 'copper')} of ${before}`);
  check('and it said the pack was the problem', /nowhere to put it/.test(r.text), r.text);

  const worse = mkCtx({ character: { skills: { blacksmithing: 60 } }, addFails: 'all' });
  worse.character.pack.items[0] = (() => { const it = makeItem({ base: 'ingot', count: 5 }); it.material = 'copper'; return it; })();
  const r2 = craft('weapon.dagger.copper', worse, { rng: () => 0.0001 });
  check('when even the refund will not fit it says that too', r2.ok === false && /would not fit back/.test(r2.text), r2.text);
}

console.log('win_crafting: materials in the pack');
{
  const ctx = mkCtx();
  stock(ctx, 'iron', 12);
  stock(ctx, 'iron', 3);
  check('two stacks of the same metal add up', countMaterial(ctx, 'iron') === 15);
  check('a metal you do not have counts zero', countMaterial(ctx, 'starfall') === 0);
  check('taking spans two stacks', takeMaterial(ctx, 'iron', 14) === 14 && countMaterial(ctx, 'iron') === 1);
  check('taking more than there is takes what there is', takeMaterial(ctx, 'iron', 10) === 1 && countMaterial(ctx, 'iron') === 0);
  check('giving puts it back with the material stamped on', giveMaterial(ctx, 'iron', 4) === true && countMaterial(ctx, 'iron') === 4);
}

console.log('win_crafting: a refund comes back as the metal it went in as');
{
  // The bug this section exists for: `giveMaterial` asked for a base called
  // "ingot", items.js resolves that to `iron_ingot`, and the stamp said
  // copper. One stack then answered to two metals.
  check('copper comes back as a copper ingot', refundBaseFor('copper') === 'copper_ingot', refundBaseFor('copper'));
  check('and not as the retired stack base', refundBaseFor('copper') !== 'ingot' && !BASES.ingot);
  const ctx = mkCtx();
  giveMaterial(ctx, 'copper', 4);
  check('four copper counts as four copper', countMaterial(ctx, 'copper') === 4, `${countMaterial(ctx, 'copper')}`);
  check('and as no iron at all', countMaterial(ctx, 'iron') === 0, `${countMaterial(ctx, 'iron')} iron`);
  const every = [...new Set(RECIPES.flatMap((r) => Object.keys(r.materials || {})))];
  const wrong = every.filter((id) => {
    const b = refundBaseFor(id);
    const m = BASES[b]?.material ?? null;
    return !BASES[b] || (m !== null && m !== id);
  });
  check('and every material any recipe spends refunds as itself', wrong.length === 0, wrong.join(', ') || `${every.length} materials walked`);
  check('tin, which has no ingot in the game, comes back as tin ore', refundBaseFor('tin') === 'tin_ore');
  check('oak comes back as an oak log, not the retired log stack', refundBaseFor('oak') === 'oak_log');
  check('cloth, which is no item yet, comes back as a stamped reagent', refundBaseFor('cloth') === 'reagent' && BASES.reagent.material == null);
  const wood = mkCtx();
  giveMaterial(wood, 'ash', 3);
  check('an ash refund is ash and not oak', countMaterial(wood, 'ash') === 3 && countMaterial(wood, 'oak') === 0,
    `${countMaterial(wood, 'ash')} ash, ${countMaterial(wood, 'oak')} oak`);
}

console.log('win_crafting: where the stations stand');
{
  check('there are seven', STATION_KINDS.length === 7, STATION_KINDS.map((s) => s.id).join(', '));
  check('every one makes something', STATION_KINDS.every((s) => s.recipes > 0));
  check('every one names its skills', STATION_KINDS.every((s) => s.skills.length > 0), STATION_KINDS.map((s) => `${s.id}:${s.skills.join('/')}`).join(' '));
  const town = { x: 500, z: -200, kind: 'town', facing: 1.1, flatR: 46 };
  const ts = stationsForSite(town);
  check('a town gets all seven', ts.length === 7);
  check('all seven stand on the ring', ts.every((s) => Math.abs(Math.hypot(s.x - town.x, s.z - town.z) - STATION_RING.town) < 1e-9), `${STATION_RING.town} m`);
  check('and inside the flattened pad', ts.every((s) => Math.hypot(s.x - town.x, s.z - town.z) < town.flatR));
  const gaps = [];
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) gaps.push(Math.hypot(ts[i].x - ts[j].x, ts[i].z - ts[j].z));
  check('no two stations are on top of each other', Math.min(...gaps) > 2, `closest pair ${Math.min(...gaps).toFixed(2)} m`);
  const hs = stationsForSite({ x: 0, z: 0, kind: 'hamlet', facing: 0, flatR: 26 });
  check('a hamlet gets three', hs.length === 3 && hs.every((s) => HAMLET_STATIONS.includes(s.id)), hs.map((s) => s.id).join(', '));
  check('a ruin gets none', stationsForSite({ kind: 'ruin' }).length === 0);
  check('a cave gets none', stationsForSite({ kind: 'cave' }).length === 0);
  // stations sit outside the people, who stand at 8 m in a town and 5 in a hamlet
  check('stations stand outside the street', STATION_RING.town > 8 && STATION_RING.hamlet > 5, `${STATION_RING.town} m and ${STATION_RING.hamlet} m against the 8 m and 5 m the people take`);
}

console.log('win_crafting: against the real inventory, not a stand-in for it');
{
  // The adapters exist because W3's inventory answers with records and takes
  // pack indices. Proving them against a fake proves nothing about W3's file,
  // so this section drives the real one.
  let createInventory = null;
  try { ({ createInventory } = await import('./inventory.js')); } catch { /* not written yet */ }
  if (!createInventory) {
    console.log('  ..   skipped: inventory.js is not there yet');
  } else {
    const character = { name: 'Alred', gold: 100, skills: { blacksmithing: 60 }, stats: { str: 40, int: 10 } };
    const inv = createInventory({ character });
    const ctx = { stationAccess: () => true, character: inv.character, inventory: inv, hud: { toast() {} }, audio: { play() {} }, player: { pos: { x: 0, y: 0, z: 0 } } };
    check('the real pack reads through the adapter', Array.isArray(packOf(ctx)) && packOf(ctx).length === 0);
    const ingots = makeItem({ base: 'ingot', rarity: 'common', count: 6 });
    ingots.material = 'copper';
    inv.add(ingots);
    check('a real stack is counted as its material', countMaterial(ctx, 'copper') === 6, `${countMaterial(ctx, 'copper')} copper`);
    const r = craft('weapon.dagger.copper', ctx, { rng: () => 0.0001 });
    check('a craft through the real inventory succeeds', r.ok === true, r.text);
    check('and the real pack now holds the dagger', packOf(ctx).some((i) => i.base === 'dagger'));
    check('and the real stack really shrank', countMaterial(ctx, 'copper') === 4, `${countMaterial(ctx, 'copper')} left of 6`);
    check('the crafted dagger is not counted as copper to melt down again', packOf(ctx).filter((i) => i.material === 'copper').length === 2 && countMaterial(ctx, 'copper') === 4);

    // fill the real pack and prove the refusal comes from the real emptySlot
    const slots = inv.pack.slots;
    for (let i = 0; i < slots; i++) inv.add(makeItem({ base: 'longsword', rarity: 'common' }));
    check('the real pack fills up', inv.emptySlot() === -1, `${slots} slots`);
    const full = refusalFor(RECIPE['weapon.dagger.copper'], ctx);
    check('and the panel greys the recipe with the pack reason', full && full.kind === 'pack', full && full.why);
  }
}


// ---------------------------------------------------------------------------
// The cards.
//
// The panel is BUILT against a small fake document and read back, because a
// test that only checked `cardView` would prove a view model exists and not
// that a player at a forge sees three hundred and sixty two cards, each with a
// picture on it. Every station is opened for real.

function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, type: '', disabled: false,
      listeners: {},
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join(' ') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute(k, v) { node.dataset[k] = v; },
      removeAttribute() {},
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      append(...cs) { for (const c of cs) node.appendChild(c); },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
      querySelector() { return null; },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
}
globalThis.document = makeDom();

/** The four parts of the page, found by class rather than by index. */
const pick = (node, cls) => node.children.find((c) => c.classList.contains(cls));
const cardsOf = (root) => pick(root, 'bw-cards').children;
const chipsOf = (root) => pick(root, 'bw-filters').children;
const bodyOf = (card) => card.children[1];
const matsOf = (card) => bodyOf(card).children[2].children;
const tileOf = (card) => card.children[0];
const buttonOf = (card) => card.children[2];

/** A character who can make anything, so the bench shows everything it knows. */
const gm = () => {
  const skills = {};
  for (const r of RECIPES) skills[r.skill] = 100;
  return skills;
};

function openAt(station, ctx) {
  const root = document.createElement('div');
  panel.build(root, ctx);
  panel.open(ctx, { station });
  return root;
}

console.log('win_crafting: the cards, drawn against a real document');
{
  const ctx = mkCtx({ character: { skills: gm() } });
  let total = 0, blank = 0, noName = 0, noChips = 0;
  const seen = new Set();
  for (const st of STATION_KINDS) {
    const root = openAt(st.id, ctx);
    const cards = cardsOf(root);
    const want = RECIPES.length;
    check(`the ${st.name} draws a card for every recipe it knows`, cards.length === want, `${cards.length} of ${want}`);
    for (const c of cards) {
      total++;
      const art = tileOf(c).innerHTML;
      if (!/^<(img|svg)/.test(art)) blank++;
      if (!bodyOf(c).children[0].textContent.trim()) noName++;
      if (!bodyOf(c).children[1].children.length) noChips++;
      seen.add(bodyOf(c).children[0].textContent);
    }
  }
  check('every card in the game has a picture on it', blank === 0, `${total} cards walked, ${blank} blank`);
  check('and a name', noName === 0, `${noName} nameless`);
  check('and at least one chip', noChips === 0, `${noChips} bare`);
  check('the seven stations together draw all 486 recipes', total === RECIPES.length * STATION_KINDS.length, `${total} cards`);
  check('eight pairs of recipes really do share a name', seen.size === RECIPES.length - 8, `${seen.size} distinct names for ${total} cards`);

  // Which is why the card says the armour tier: two cards reading "Hide tunic"
  // side by side at the tanning rack looked like the page had repeated itself.
  const rack = openAt('tanningRack', ctx);
  const twins = cardsOf(rack).filter((c) => bodyOf(c).children[0].textContent === 'Hide tunic');
  check('both Hide tunics are on the tanning rack', twins.length === 2);
  const said = twins.map((c) => bodyOf(c).children[1].children.map((x) => x.textContent).join(' '));
  check('and the tier chip tells them apart', said[0] !== said[1] && /leather/.test(said[0]) && /studded/.test(said[1]), said.join(' | '));
  const lines = twins.map((c) => bodyOf(c).children[3].textContent);
  check('as does the line saying what comes out', lines[0] !== lines[1], lines.join(' | '));
  let same = 0;
  for (const st of STATION_KINDS) {
    const r = openAt(st.id, ctx);
    const said2 = cardsOf(r).map((c) => bodyOf(c).children[0].textContent + '|' + bodyOf(c).children[1].children.map((x) => x.textContent).join(' '));
    same += said2.length - new Set(said2).size;
  }
  check('so no two cards at one bench read the same', same === 0, `${same} repeats`);
}

console.log('win_crafting: the bill of materials counts the pack, both ways');
{
  const dagger = RECIPE['weapon.dagger.copper'];   // 2 copper
  const ctx = mkCtx({ character: { skills: { blacksmithing: 60 } } });
  let bill = billFor(dagger, ctx);
  check('with nothing in the pack the line reads 0 of 2', bill[0].text === '0 of 2 copper' && bill[0].met === false, bill[0].text);
  stock(ctx, 'copper', 1);
  bill = billFor(dagger, ctx);
  check('one of two is still short', bill[0].have === 1 && bill[0].met === false, bill[0].text);
  stock(ctx, 'copper', 2);
  bill = billFor(dagger, ctx);
  check('three of two is enough', bill[0].have === 3 && bill[0].met === true, bill[0].text);

  // and the chip really carries the class the css paints red or green
  const root = openAt('forge', ctx);
  const card = cardsOf(root).find((c) => bodyOf(c).children[0].textContent === 'Copper Dagger');
  const chip = matsOf(card)[0];
  check('the copper chip is drawn as met', chip.textContent === '3 of 2 copper' && !chip.classList.contains('short'), `"${chip.textContent}" class "${chip.className}"`);
  const iron = cardsOf(root).find((c) => bodyOf(c).children[0].textContent === 'Iron Dagger');
  const ironChip = matsOf(iron)[0];
  check('and the iron chip on the next card is drawn short', ironChip.classList.contains('short'), `"${ironChip.textContent}" class "${ironChip.className}"`);

  // a recipe with two materials shows two chips, one of each colour
  const bow = RECIPE['bow.longbow.oak'];           // 4 oak, 1 hide
  const two = mkCtx({ character: { skills: { carpentry: 60 } } });
  stock(two, 'oak', 9);
  const lines = billFor(bow, two);
  check('a two material bill shows both lines', lines.length === 2, lines.map((l) => l.text).join(', '));
  check('the one you have is met and the one you do not is not',
    lines.find((l) => l.id === 'oak').met === true && lines.find((l) => l.id === 'hide').met === false,
    lines.map((l) => `${l.text} ${l.met}`).join(', '));
}

console.log('win_crafting: the filters narrow the bench');
{
  const ctx = mkCtx({ character: { skills: gm() } });
  const root = openAt('forge', ctx);
  const all = cardsOf(root).length;
  const chips = chipsOf(root);
  check('the catalogue offers every family plus All and Can make',
    chips.length === familiesAt(null).length + 2, chips.map((c) => c.textContent).join(', '));
  check('including families made at other workshops',
    chips.some((c) => c.textContent === FAMILY_LABEL.scroll), chips.map((c) => c.textContent).join(', '));

  const shields = chips.find((c) => c.textContent === FAMILY_LABEL.shield);
  shields.fire('click');
  const narrowed = cardsOf(root).length;
  check('clicking Shields narrows the list', narrowed < all && narrowed === RECIPES.filter((r) => r.family === 'shield' && r.station === 'forge').length,
    `${narrowed} of ${all}`);
  check('and every card left is a shield', cardsOf(root).every((c) => /shield/i.test(bodyOf(c).children[0].textContent)));
  check('the chip clicked is the one lit', chipsOf(root).find((c) => c.textContent === FAMILY_LABEL.shield).classList.contains('on'));

  chipsOf(root).find((c) => c.textContent === 'All').fire('click');
  check('and All puts them all back', cardsOf(root).length === all, `${cardsOf(root).length} of ${all}`);

  // Can make, driven both ways: nothing in the pack, then enough for a dagger
  chipsOf(root).find((c) => c.textContent === 'Can make').fire('click');
  check('with an empty pack Can make shows nothing', cardsOf(root).length === 0, `${cardsOf(root).length} cards`);
  stock(ctx, 'copper', 4);
  panel.render();
  const ready = cardsOf(root);
  check('with four copper it shows exactly what four copper buys', ready.length > 0 && ready.every((c) => !c.classList.contains('locked')),
    ready.map((c) => bodyOf(c).children[0].textContent).join(', '));
  check('and every one of them really is unrefused', ready.every((c) => buttonOf(c).disabled === false));

  // a family with nothing in reach says so rather than showing an empty grid
  const bare = openAt('inscriptionDesk', mkCtx());
  check('a bench you cannot use yet still lists what it makes', cardsOf(bare).length > 0, `${cardsOf(bare).length} scroll cards`);
  check('and every one of them wears the lock', cardsOf(bare).every((c) => c.classList.contains('locked')));
}

console.log('win_crafting: the picture is looked up through the base the craft really lands on');
{
  const cases = [
    ['armour.cloth.head.cloth', 'cloth_head', /cloth-hood\.webp$/],
    ['armour.leather.chest.hide', 'leather_chest', /leather-tunic\.webp$/],
    ['meal.heartyStew', 'hearty_stew', /hearty-stew\.webp$/],
    ['potion.heal', 'potion', /potion\.webp$/],
    ['weapon.dagger.copper', 'dagger', /dagger\.webp$/],
    ['bow.longbow.oak', 'longbow', /longbow\.webp$/],
    ['ammo.arrow.oak', 'arrow', /arrow-bundle\.webp$/],
  ];
  for (const [id, base, file] of cases) {
    const r = RECIPE[id];
    const landed = resultBaseFor(r);
    const src = itemIcon(landed, { count: r.result.count ?? 1, material: r.result.material });
    check(`${r.name} lands on ${base} and wears its painting`,
      landed === base && file.test(src || '') && tileArt(r, 96).includes(src),
      `${landed} -> ${src}`);
  }
  check('the recipe table\'s own spelling would have found nothing for cloth armour',
    itemIcon(RECIPE['armour.cloth.head.cloth'].result.base) === null,
    `"${RECIPE['armour.cloth.head.cloth'].result.base}" is not an items.js base`);

  // a base with a real item and no painting falls to ui_theme's drawn glyph
  const plate = RECIPE['armour.plate.head.iron'];
  check('a plate helm has no painting yet and draws the helm glyph',
    itemIcon(resultBaseFor(plate)) === null && /^<svg/.test(tileArt(plate, 96)),
    tileArt(plate, 96).slice(0, 40));

  // a recipe with no item at all falls to the family glyph
  const hatchet = RECIPE['tool.hatchet'];
  check('a hatchet has no item at all and draws the tool glyph',
    resultBaseFor(hatchet) === null && tileArt(hatchet, 96).includes(FAMILY_GLYPH.tool ? 'svg' : 'never'),
    tileArt(hatchet, 96).slice(0, 40));
  check('and it is tinted by the material the recipe names', /fill="#/.test(tileArt(hatchet, 96)), familyTint(hatchet));

  check('every family in the table is labelled and drawn', (() => { try { auditCraftArt(); return true; } catch (e) { console.log(e.message); return false; } })());
  check('the audit walked every recipe', CRAFT_ART_AUDIT.recipes === RECIPES.length && CRAFT_ART_AUDIT.families === 14,
    `${CRAFT_ART_AUDIT.families} families, ${CRAFT_ART_AUDIT.recipes} recipes`);
}

console.log('win_crafting: a card that cannot be made says so on the card');
{
  const ctx = mkCtx({ character: { skills: gm() } });
  const root = openAt('loom', ctx);
  const bagCard = cardsOf(root).find((c) => /slot bag/.test(bodyOf(c).children[0].textContent));
  check('a bag is on the bench, not hidden', !!bagCard);
  check('it is greyed as missing, not merely locked', bagCard.classList.contains('missing') && bagCard.classList.contains('locked'), bagCard.className);
  check('its make button is dead', buttonOf(bagCard).disabled === true);
  check('and the line under it is the reason, in words',
    /bag item/.test(bodyOf(bagCard).children[3].textContent), bodyOf(bagCard).children[3].textContent);
  check('a missing recipe shows no chance to make it', !chipsFor({ recipe: RECIPE['bag.bag4'], forecast: forecast(RECIPE['bag.bag4'], ctx) }).some(c => c.id === 'chance'),
    chipsFor({ recipe: RECIPE['bag.bag4'], forecast: forecast(RECIPE['bag.bag4'], ctx) }).map((c) => c.text).join(', '));
  const madeable = chipsFor({ recipe: RECIPE['weapon.dagger.copper'], forecast: forecast(RECIPE['weapon.dagger.copper'], ctx) });
  check('and one that can be made shows the chance and the quality',
    madeable.some((c) => c.id === 'chance') && madeable.some((c) => c.id === 'quality'), madeable.map((c) => c.text).join(', '));
  check('the line on a good card says what comes out', /^Makes /.test(lineFor({ recipe: RECIPE['weapon.dagger.copper'], refusal: null })),
    lineFor({ recipe: RECIPE['weapon.dagger.copper'], refusal: null }));
  check('and a stack says how many', /^Makes 20 /.test(lineFor({ recipe: RECIPE['ammo.arrow.oak'], refusal: null })),
    lineFor({ recipe: RECIPE['ammo.arrow.oak'], refusal: null }));
}

console.log('win_crafting: the make button is the same craft() the rest of the game calls');
{
  const ctx = mkCtx({ character: { skills: { blacksmithing: 100 } } });
  stock(ctx, 'copper', 6);
  ctx.rng = () => 0.0001;
  const root = openAt('forge', ctx);
  const card = cardsOf(root).find((c) => bodyOf(c).children[0].textContent === 'Copper Dagger');
  const before = countMaterial(ctx, 'copper');
  buttonOf(card).fire('click');
  check('clicking make really makes one', packOf(ctx).some((i) => i.base === 'dagger'));
  check('and it really spent the copper', countMaterial(ctx, 'copper') === before - 2, `${countMaterial(ctx, 'copper')} of ${before}`);
  check('and it said so out loud', ctx.toasts.some(([t]) => /You make a copper dagger/.test(t)), ctx.toasts.at(-1)?.[0]);
  const after = cardsOf(root).find((c) => bodyOf(c).children[0].textContent === 'Copper Dagger');
  check('and the card redrew with the new count', matsOf(after)[0].textContent === '4 of 2 copper', matsOf(after)[0].textContent);
}

console.log('win_crafting: the page keeps up with a pack that changes under it');
{
  // Both directions: a tick with nothing changed must NOT redraw, and a tick
  // after a stack lands must. A window that only ever redrew would be correct
  // and expensive; one that never did would be a lie about your own pack.
  const ctx = mkCtx({ character: { skills: gm() } });
  const root = openAt('forge', ctx);
  let builds = 0;
  const real = panel.render.bind(panel);
  panel.render = (...a) => { builds++; return real(...a); };
  try {
    panel.tick(0.6);
    check('a tick with nothing changed redraws nothing', builds === 0, `${builds} redraws`);
    panel.tick(0.2);
    check('and a tick under half a second does not even look', builds === 0);
    stock(ctx, 'copper', 4);
    panel.tick(0.6);
    check('a stack landing in the pack redraws the page once', builds === 1, `${builds} redraws`);
    panel.tick(0.6);
    check('and it settles again straight after', builds === 1, `${builds} redraws`);
    const card = cardsOf(root).find((c) => bodyOf(c).children[0].textContent === 'Copper Dagger');
    check('the copper chip now reads what the pack really holds', matsOf(card)[0].textContent === '4 of 2 copper', matsOf(card)[0].textContent);
    ctx.character.skills.blacksmithing = 3;
    panel.tick(0.6);
    check('a skill that moved redraws too', builds === 2, `${builds} redraws`);
  } finally { panel.render = real; }

  // and what that costs, measured rather than asserted
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) panel.stamp();
  const per = (performance.now() - t0) / 200;
  check('the twice a second check costs well under a millisecond', per < 1,
    `${per.toFixed(3)} ms for ${panel._cards.length} cards, against 16.7 ms of frame`);
}

console.log('win_crafting: the panel with nowhere to stand');
{
  const root = openAt(null, mkCtx({ stationAccess: () => false }));
  check('no station says so', /Walk up to its workshop/.test(pick(root, 'bw-where').textContent), pick(root, 'bw-where').textContent);
  check('every recipe is visible away from a workshop', cardsOf(root).length === RECIPES.length);
  check('every craft action is disabled away from a workshop', panel._cards.every(c => c.view.locked));
  check('and every recipe family remains browsable', chipsOf(root).length === filtersFor(null).length);
}

console.log('win_crafting: the view model and the page agree');
{
  const ctx = mkCtx({ character: { skills: gm() } });
  stock(ctx, 'copper', 3);
  const rows = benchFor('forge', ctx, { family: 'weapon' });
  check('asking for one family gets one family', rows.every((r) => r.recipe.family === 'weapon'), `${rows.length} rows`);
  check('and it is every weapon the forge knows', rows.length === RECIPES.filter((r) => r.station === 'forge' && r.family === 'weapon').length, `${rows.length}`);
  const v = cardView(rows.find((r) => r.recipe.id === 'weapon.dagger.copper'), ctx);
  check('the card view names the base it lands on', v.base === 'dagger' && v.family === 'weapon');
  check('it is not locked when the copper is there', v.locked === false, JSON.stringify(v.refusal));
  check('and its art is the painted dagger', /dagger\.webp/.test(v.art), v.art.slice(0, 60));
  check('inFilter keeps a weapon under Weapons and drops it under Shields',
    inFilter(rows[0], 'weapon') === true && inFilter(rows[0], 'shield') === false);
  check('and keeps everything under All', rows.every((r) => inFilter(r, 'all')));
  check('filtersFor names only the families of the bench asked for',
    filtersFor('kitchen').map((f) => f.id).join(',') === 'all,ready,meal,forageMeal', filtersFor('kitchen').map((f) => f.id).join(','));
}

{
  let nearby = false;
  const ctx = mkCtx({ character: { skills: { blacksmithing: 100 } }, stationAccess: id => nearby && id === 'forge' });
  stock(ctx, 'copper', 6);
  ctx.rng = () => 0.0001;
  const root = openAt(null, ctx);
  check('a skilled crafter away from a forge sees a station requirement', refusalFor(RECIPE['weapon.dagger.copper'], ctx)?.kind === 'station');
  check('craft execution away from a forge spends nothing', !craft('weapon.dagger.copper',ctx).ok && countMaterial(ctx,'copper')===6);
  nearby = true; panel.tick(.6);
  check('walking into forge range enables the open recipe', !refusalFor(RECIPE['weapon.dagger.copper'],ctx));
  check('the enabled action crafts through the real path', craft('weapon.dagger.copper',ctx).ok && countMaterial(ctx,'copper')===4);
  nearby = false; panel.tick(.6);
  check('walking away disables an already-open craft tab', panel._cards.find(c=>c.row.recipe.id==='weapon.dagger.copper').view.refusal.kind==='station');
  check('a stale forge label cannot bypass proximity', !craft('weapon.dagger.copper',{...ctx,station:'forge'}).ok && countMaterial(ctx,'copper')===4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
