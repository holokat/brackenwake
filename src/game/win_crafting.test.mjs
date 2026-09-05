// The Crafting panel. Run: node src/game/win_crafting.test.mjs
import {
  STATION_KINDS, STATION, stationsForSite, STATION_RING, HAMLET_STATIONS,
  resultBaseFor, unmakeableReason, UNMAKEABLE, BASE_ALIAS, auditCraftBases, CRAFT_AUDIT,
  refusalFor, forecast, benchFor, craft, countMaterial, takeMaterial, giveMaterial, packOf, NEAR_MISS,
} from './win_crafting.js';
import { RECIPES, RECIPE, craftChance, craftQuality, MIN_CRAFT_CHANCE } from '../mmo/recipes.js';
import { BASES, makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function mkCtx(over = {}) {
  const items = new Array(over.slots ?? 20).fill(null);
  const character = {
    name: 'Alred', gold: 100, skills: {}, pack: { slots: over.slots ?? 20, items }, ...over.character,
  };
  const toasts = [];
  const ctx = {
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

const stock = (ctx, id, n) => {
  const it = makeItem({ base: 'ingot', rarity: 'common', count: n });
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
  check('the list is bounded, not all 362', rows.length < RECIPES.filter((r) => r.station === 'forge').length, `${rows.length} of ${RECIPES.filter((r) => r.station === 'forge').length}`);
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
    const ctx = { character: inv.character, inventory: inv, hud: { toast() {} }, audio: { play() {} }, player: { pos: { x: 0, y: 0, z: 0 } } };
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
