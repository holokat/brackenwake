// The Talk panel: the shop floor. Run: node src/game/win_talk.test.mjs
import {
  auditTalk, CATALOG, PRICES, NO_BASE_FOR, UNSTOCKED_CATEGORY, missingFor,
  stockFor, buysFrom, categoryOf, basePriceOf, tabsFor,
  memoryOf, noteTrade, stockLeft, quoteBuy, quoteSell, multiplierFor,
  trainQuote, trainAsFarAsGold, healQuote, createTalkEngine,
  VENDOR_MEMORY_MS, RESTOCK_MS, armourPiecePrice,
} from './win_talk.js';
import {
  NPCS, vendorPayRate, vendorPrice, vendorPays, trainCost, TRAIN_CAP,
  SELL_RATE, SELL_RATE_FLOOR, PROVISIONER_SELL_RATE, RESURRECT_COST,
} from '../mmo/npcs.js';
import { BASES, makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

let NOW = 1_000_000;

function mkCtx(over = {}) {
  const items = new Array(20).fill(null);
  const character = {
    name: 'You', gold: 1000, skills: {}, health: 40, maxHealth: 100,
    mana: 10, maxMana: 50, stamina: 10, maxStamina: 60,
    pack: { slots: 20, items }, vendorMemory: {},
    ...over.character,
  };
  const toasts = [];
  const floats = [];
  const ctx = {
    character,
    hud: { toast: (t, k) => toasts.push([t, k]) },
    audio: { play: () => {} },
    floaters: { spawn: (p, t, k) => floats.push([t, k]) },
    player: { pos: { x: 0, y: 0, z: 0 } },
    inventory: {
      get pack() { return character.pack; },
      emptySlot() { return character.pack.items.indexOf(null); },
      add(it) {
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
    now: () => NOW,
    ...over,
  };
  ctx.toasts = toasts;
  ctx.floats = floats;
  return ctx;
}

const site = { id: '3,-2', cx: 3, cz: -2, name: 'Brackenwake', kind: 'town' };
const npcFor = (roleId, name = 'Alred') => ({ personName: name, role: NPCS[roleId], site });

console.log('win_talk: the catalog cannot throw');
check('the audit passes at load', (() => { try { auditTalk(); return true; } catch (e) { console.log(e.message); return false; } })());
check('every row names a base items.js really has', CATALOG.every((r) => !!BASES[r.base]), `${CATALOG.length} rows`);
{
  let threw = 0;
  for (const r of CATALOG) { try { makeItem({ base: r.base, rarity: 'common', quality: 1, count: r.count }); } catch { threw++; } }
  check('makeItem takes every row without throwing', threw === 0, `${CATALOG.length} rows made for real`);
}
check('the things it cannot stock are recorded with a reason', Object.values(NO_BASE_FOR).every((s) => s.length > 20), `${Object.keys(NO_BASE_FOR).length} recorded`);
check('every unstocked shelf points at one of those reasons', Object.values(UNSTOCKED_CATEGORY).every((k) => !!NO_BASE_FOR[k]));
check('no row name carries an em dash', !CATALOG.some((r) => r.name.includes('—')));

console.log('win_talk: who sells what');
{
  let empty = [];
  for (const role of Object.values(NPCS)) {
    const rows = stockFor(role);
    if (role.sells.length && rows.length === 0) empty.push(role.id);
    for (const r of rows) check.silent = true;
  }
  check('only the Stablemaster sells nothing, and says why', empty.join(',') === 'stablemaster', `empty shelves: ${empty.join(', ') || 'none'}`);
  check('the Stablemaster still has a panel worth opening', tabsFor(NPCS.stablemaster).length >= 2, tabsFor(NPCS.stablemaster).join(', '));
  check('the Stablemaster says what he would sell', missingFor(NPCS.stablemaster).some((m) => m.category === 'feed'));
  check('the Blacksmith keeps weapons, shields and mail', stockFor(NPCS.blacksmith).length > 20, `${stockFor(NPCS.blacksmith).length} rows`);
  check('the Healer keeps bandages', stockFor(NPCS.healer).some((r) => r.base === 'bandage'));
  check('the Provisioner buys anything', buysFrom(NPCS.provisioner, 'longsword') && buysFrom(NPCS.provisioner, 'potion'));
  check('the Bowyer will not buy your armour', !buysFrom(NPCS.bowyer, 'plate_chest'));
  check('the Bowyer will buy your arrows', buysFrom(NPCS.bowyer, 'arrow'), `arrows are "${categoryOf('arrow')}"`);
}

console.log('win_talk: the prices 06 actually gives');
check('longsword 90', PRICES.longsword === 90);
check('kite shield 70', PRICES.kite === 70);
check('longbow 140', PRICES.longbow === 140);
check('quarterstaff 30', PRICES.quarterstaff === 30);
check('iron ingot 4, copper ore 1, oak wood 2, bandage 2', PRICES.ingot === 4 && PRICES.ore === 1 && PRICES.log === 2 && PRICES.bandage === 2);
check('heal potion 25', PRICES.potion === 25);
{
  // a set of eight priced as nine shares comes back to the document's number
  const sum = ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back']
    .reduce((a, p) => a + armourPiecePrice('chain', p), 0);
  check('a chainmail set of eight adds back up to about 600', Math.abs(sum - 600) <= 8, `${sum} gold for the eight pieces`);
  const cloth = ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back']
    .reduce((a, p) => a + armourPiecePrice('cloth', p), 0);
  check('a robe set adds back up to about 60', Math.abs(cloth - 60) <= 6, `${cloth} gold`);
}

console.log('win_talk: the per-hour memory');
{
  const ctx = mkCtx();
  NOW = 1_000_000;
  noteTrade(ctx.character, site.id, 'ingot', { sold: 4 }, NOW);
  check('what you sold is remembered', memoryOf(ctx.character, site.id, 'ingot', NOW).sold === 4);
  check('an hour later it is forgotten', memoryOf(ctx.character, site.id, 'ingot', NOW + VENDOR_MEMORY_MS + 1).sold === 0);
  check('a minute before the hour it is not', memoryOf(ctx.character, site.id, 'ingot', NOW + VENDOR_MEMORY_MS - 60000).sold === 4);
  check('another town has not heard about it', memoryOf(ctx.character, '9,9', 'ingot', NOW).sold === 0);
  check('another thing in the same town has not either', memoryOf(ctx.character, site.id, 'ore', NOW).sold === 0);
}

console.log('win_talk: selling the same thing over and over');
{
  // MEASURED, and it is not quite what the brief said. The rate is
  // 0.30 x 0.9^sold, and `sold` is how many went before this one, so the Nth
  // unit is priced at index N-1.
  const rates = [];
  for (let n = 0; n <= 22; n++) rates.push(vendorPayRate(n, false));
  const firstFloor = rates.findIndex((r) => r <= SELL_RATE_FLOOR + 1e-12);
  check('the rate starts at 30%', Math.abs(rates[0] - SELL_RATE) < 1e-12);
  check('the floor is 5%', SELL_RATE_FLOOR === 0.05);
  check('the floor first binds at index 18, which is the 19th unit sold', firstFloor === 18,
    `index 17 pays ${(rates[17] * 100).toFixed(4)}%, index 18 pays ${(rates[18] * 100).toFixed(4)}% and is floored to 5%`);
  check('the 18th unit is a hair above the floor, not on it', rates[17] > SELL_RATE_FLOOR,
    `${(rates[17] * 100).toFixed(4)}% against the 5% floor, ${((rates[17] - 0.05) * 100).toFixed(4)} points clear`);
  check('nothing ever pays less than the floor', rates.every((r) => r >= SELL_RATE_FLOOR - 1e-12));
  const q = quoteSell(100, 0, 20, false);
  check('twenty sold in one go is priced unit by unit', q.total === Array.from({ length: 20 }, (_, i) => vendorPays(100, i, false)).reduce((a, b) => a + b, 0), `${q.total} gold for twenty of a 100 gold thing`);
  check('the Provisioner starts at 15% and falls the same way', Math.abs(vendorPayRate(0, true) - PROVISIONER_SELL_RATE) < 1e-12 && vendorPayRate(3, true) < vendorPayRate(0, true));
}

console.log('win_talk: buying the same thing over and over');
{
  const each = [];
  for (let n = 0; n <= 20; n++) each.push(vendorPrice(100, 1, n));
  check('the first one is the catalog price', each[0] === 100);
  check('twenty bought and the next costs 2.65 times the first', Math.abs(each[20] / each[0] - Math.pow(1.05, 20)) < 0.005,
    `${each[0]} gold to start, ${each[20]} gold for the twenty first, and 1.05^20 is ${Math.pow(1.05, 20).toFixed(4)}`);
  const q = quoteBuy(100, 1, 0, 20);
  check('a lot of twenty costs the sum of the twenty rising prices', q.total === each.slice(0, 20).reduce((a, b) => a + b, 0), `${q.total} gold`);
  check('a town multiplier lands between 0.9 and 1.2', (() => {
    for (let cx = -6; cx <= 6; cx++) { const m = multiplierFor({ cx, cz: 1 }); if (!(m >= 0.9 && m <= 1.2)) return false; }
    return true;
  })(), `this town runs at ${multiplierFor(site).toFixed(3)}`);
  check('the same town always charges the same', multiplierFor(site) === multiplierFor({ ...site }));
}

console.log('win_talk: buying, for real');
{
  NOW = 2_000_000;
  const ctx = mkCtx();
  const e = createTalkEngine(ctx, npcFor('healer'));
  const before = ctx.character.gold;
  const r = e.buy('bandages', 1);
  check('a bandage bundle goes into the pack', r.ok === true && ctx.character.pack.items.some((i) => i && i.base === 'bandage'));
  check('the gold really left the purse', ctx.character.gold < before, `${before} to ${ctx.character.gold}`);
  check('it said what happened', /You buy/.test(r.text), r.text);
  check('a gold floater went up', ctx.floats.some(([, k]) => k === 'gold'));
  const second = e.buy('bandages', 1);
  check('the second bundle costs at least as much as the first', second.gold >= r.gold, `${r.gold} then ${second.gold}`);

  // no gold
  ctx.character.gold = 1;
  const broke = e.buy('bandages', 1);
  check('with one gold it refuses and says how short you are', broke.ok === false && /short/.test(broke.text), broke.text);

  // no room
  ctx.character.gold = 1000;
  ctx.character.pack.items.fill({ base: 'ore', count: 1 });
  const full = e.buy('bandages', 1);
  check('a full pack refuses and nothing is paid', full.ok === false && /pack is full/.test(full.text) && ctx.character.gold === 1000, full.text);
}

console.log('win_talk: the shelf runs out and comes back');
{
  NOW = 3_000_000;
  const ctx = mkCtx();
  const e = createTalkEngine(ctx, npcFor('blacksmith'));
  const row = stockFor(NPCS.blacksmith).find((r) => r.key === 'longsword');
  check('a rack of swords is finite', row.stock > 0 && row.stock < 10, `${row.stock} on the rack`);
  for (let i = 0; i < row.stock; i++) { ctx.character.gold = 100000; e.buy('longsword', 1); ctx.character.pack.items.fill(null); }
  check('the rack empties', stockLeft(ctx.character, site.id, row, NOW) === 0);
  const bare = e.buy('longsword', 1);
  check('an empty rack says so instead of selling air', bare.ok === false && /bare/.test(bare.text), bare.text);
  NOW += RESTOCK_MS + 1;
  check('half an hour later the rack is full again', stockLeft(ctx.character, site.id, row, NOW) === row.stock, `${row.stock} back`);
}

console.log('win_talk: selling, for real');
{
  NOW = 4_000_000;
  const ctx = mkCtx();
  const e = createTalkEngine(ctx, npcFor('blacksmith'));
  const ingots = makeItem({ base: 'ingot', rarity: 'common', count: 6 });
  ingots.material = 'iron';
  ctx.inventory.add(ingots);
  const offers = e.offers();
  check('the smith can see the ingots in your pack', offers.length === 1 && offers[0].units === 6, JSON.stringify(offers.map((o) => [o.item.base, o.units, o.pays])));
  const before = ctx.character.gold;
  const r = e.sell(ingots);
  check('the gold arrives', r.ok && ctx.character.gold > before, `${r.gold} gold for six ingots at 4 each`);
  check('paying is under 30% of the catalog price', r.gold < 6 * 4 * 0.3 + 1, `${r.gold} against ${(6 * 4 * 0.3).toFixed(1)} at the top rate`);
  check('the ingots left the pack', !ctx.character.pack.items.some((i) => i === ingots));
  check('it said what happened', /You sell/.test(r.text), r.text);

  const sword = makeItem({ base: 'longsword', rarity: 'common' });
  ctx.inventory.add(sword);
  const bowyer = createTalkEngine(ctx, npcFor('bowyer', 'Bess'));
  const no = bowyer.sell(sword);
  check('the Bowyer will not take a longsword, and says who will', no.ok === false && /Provisioner/.test(no.text), no.text);
  const prov = createTalkEngine(ctx, npcFor('provisioner', 'Cobb'));
  const yes = prov.sell(sword);
  check('the Provisioner takes it', yes.ok === true, yes.text);
  check('and pays 15%, not 30%', yes.gold === vendorPays(90, 0, true), `${yes.gold} gold, which is ${(yes.gold / 90 * 100).toFixed(0)}% of 90`);
}

console.log('win_talk: training, refused and allowed');
{
  const ctx = mkCtx({ character: { gold: 1000, skills: { blacksmithing: 0, archery: 12 } } });
  const smith = createTalkEngine(ctx, npcFor('blacksmith'));

  const wrong = trainQuote(ctx.character, NPCS.blacksmith, 'archery');
  check('a smith refuses to teach archery', wrong.ok === false && /does not teach/.test(wrong.why), wrong.why);

  const q = trainQuote(ctx.character, NPCS.blacksmith, 'blacksmithing');
  check('nothing to forty costs 400 gold', q.ok === true && q.cost === 400 && q.cost === trainCost(0, 40), `${q.cost} gold`);
  const r = smith.train('blacksmithing');
  check('the skill really moved', ctx.character.skills.blacksmithing === TRAIN_CAP, `${ctx.character.skills.blacksmithing}`);
  check('the gold really went', ctx.character.gold === 600, `${ctx.character.gold} left`);
  check('a gain floater went up', ctx.floats.some(([t, k]) => k === 'gain' && /Blacksmithing/.test(t)), ctx.floats.map(([t]) => t).join(' / '));
  check('it said what happened', /stands at 40/.test(r.text), r.text);

  const again = smith.train('blacksmithing');
  check('past forty nobody can teach you', again.ok === false && /Past forty/.test(again.text), again.text);

  ctx.character.skills.mining = 0;
  ctx.character.gold = 120;
  const short = trainQuote(ctx.character, NPCS.blacksmith, 'mining');
  check('with 120 gold it refuses and counts the shortfall', short.ok === false && short.short === 280, short.why);
  const far = trainAsFarAsGold(ctx.character, NPCS.blacksmith, 'mining');
  check('120 gold buys 12 points', far === 12, `to ${far}`);
  const part = smith.train('mining', far);
  check('spending what you have really moves it', part.ok === true && ctx.character.skills.mining === 12 && ctx.character.gold === 0, `${ctx.character.skills.mining} for ${part.quote.cost} gold`);

  const poor = smith.train('mining');
  check('with nothing left it refuses again', poor.ok === false, poor.text);
}

console.log('win_talk: the healer');
{
  const ctx = mkCtx({ character: { gold: 100, health: 30, maxHealth: 100, skills: { healing: 0 } } });
  const healer = createTalkEngine(ctx, npcFor('healer', 'Nell'));
  const r = healer.heal();
  check('a healer closes what is open', r.ok && ctx.character.health === 100, r.text);
  check('and charges nothing for it', ctx.character.gold === 100, r.text);
  const nothing = healer.heal();
  check('healing the whole refuses and says why', nothing.ok === false && /nothing wrong/.test(nothing.text), nothing.text);

  ctx.character.health = 0;
  const raise = healer.heal();
  check('raising the dead costs 50 gold', raise.ok && ctx.character.gold === 50, raise.text);
  check('you come back alive', ctx.character.health > 0 && ctx.character.dead === false, `${ctx.character.health} health`);

  const broke = mkCtx({ character: { gold: 10, health: 0, maxHealth: 100, skills: { healing: 0 } } });
  const h2 = createTalkEngine(broke, npcFor('healer', 'Nell'));
  const no = h2.heal();
  check('with ten gold the dead stay dead, and are told the price', no.ok === false && /50 gold/.test(no.text), no.text);
  check('and the gold is untouched', broke.character.gold === 10);

  const skilled = mkCtx({ character: { gold: 0, health: 0, maxHealth: 100, skills: { healing: 40 } } });
  const h3 = createTalkEngine(skilled, npcFor('healer', 'Nell'));
  const free = h3.heal();
  check('past Healing 30 it is free, with no gold at all', free.ok === true && skilled.character.gold === 0, free.text);
  check('the resurrection cost really is the document\'s 50', RESURRECT_COST === 50);
}

console.log('win_talk: the innkeeper');
{
  const ctx = mkCtx({ character: { health: 10, maxHealth: 100, mana: 1, maxMana: 40, stamina: 2, maxStamina: 60 } });
  const inn = createTalkEngine(ctx, npcFor('innkeeper', 'Tam'));
  const r = inn.rest();
  check('a bed puts back health, mana and stamina', r.ok && ctx.character.health === 100 && ctx.character.mana === 40 && ctx.character.stamina === 60, r.text);
  const smith = createTalkEngine(ctx, npcFor('blacksmith'));
  check('a smith keeps no beds and says so', smith.rest().ok === false);
}

console.log('win_talk: every action says something');
{
  const ctx = mkCtx();
  const e = createTalkEngine(ctx, npcFor('healer', 'Nell'));
  const before = ctx.toasts.length;
  e.buy('bandages', 1);
  e.heal();
  e.train('healing');
  check('three actions produced three lines of feedback', ctx.toasts.length - before >= 3, `${ctx.toasts.length - before} lines`);
  check('no line carries an em dash', !ctx.toasts.some(([t]) => t.includes('—')));
}

console.log('win_talk: against the real inventory, not a stand-in for it');
{
  let createInventory = null;
  try { ({ createInventory } = await import('./inventory.js')); } catch { /* not written yet */ }
  if (!createInventory) {
    console.log('  ..   skipped: inventory.js is not there yet');
  } else {
    NOW = 5_000_000;
    const inv = createInventory({ character: { name: 'Alred', gold: 500, skills: {}, stats: { str: 60, int: 10 } } });
    const ctx = {
      character: inv.character, inventory: inv,
      hud: { toast() {} }, audio: { play() {} }, floaters: { spawn() {} },
      player: { pos: { x: 0, y: 0, z: 0 } }, now: () => NOW,
    };
    const e = createTalkEngine(ctx, npcFor('blacksmith'));
    const before = inv.character.gold;
    const bought = e.buy('longsword', 1);
    check('a real buy puts a real sword in the real pack', bought.ok === true && inv.pack.items.some((i) => i && i.base === 'longsword'), bought.text);
    check('and the gold really left', inv.character.gold < before, `${before} to ${inv.character.gold}`);
    const sword = inv.pack.items.find((i) => i && i.base === 'longsword');
    const sold = e.sell(sword);
    check('selling it back goes through the real remove', sold.ok === true && !inv.pack.items.includes(sword), sold.text);
    check('and you lost money on the round trip, as a shop intends', inv.character.gold < before, `${inv.character.gold} against the ${before} you started with`);

    // a real full pack
    for (let i = 0; i < inv.pack.slots; i++) inv.add(makeItem({ base: 'kite', rarity: 'common' }));
    check('the real pack fills', inv.emptySlot() === -1);
    const gold = inv.character.gold;
    const refused = e.buy('dagger', 1);
    check('a real full pack refuses the buy and keeps the gold', refused.ok === false && inv.character.gold === gold, refused.text);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
