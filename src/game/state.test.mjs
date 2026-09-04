// The character document, the pack views over it, and the two save versions.
// Run: node src/game/state.test.mjs
//
// Two things are being proved here. The first is that everything the old game
// did still happens, because interact.js and shop.js were not changed and are
// still calling add, take, giveTool and spend. The second is that the thing
// underneath is now the v2 document, and that a real v1 save turns into one
// without losing a log.
//
// The cap is checked from BOTH sides of every add, because a pack that quietly
// eats what will not fit is the bug this game has shipped before.
import {
  createState, migrateV1, hydrate, blankCharacter, auditState, baseOf, weightOf, makeStack,
  CAP, SAVE_KEY, SAVE_KEY_V1, SAVE_VERSION, SAVE_VERSION_V1, START_COINS,
  CARRIED, GOOD_CAP, TOOLS, PACK_SLOTS, BAR_SLOTS,
  MATERIAL_BASE, LOCAL_BASES, SKILL_IDS,
} from './state.js';
import { SLOTS } from '../mmo/items.js';
import { SKILLS } from '../mmo/skills.js';
import { STATS } from '../mmo/stats.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function memStore() {
  const m = new Map();
  return { m, writes: 0, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { this.writes++; m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}

/** Exactly what v1's save() wrote, so the migration is tested on the real thing. */
const v1Save = (o = {}) => JSON.stringify({
  v: 1, coins: 120, materials: { wood: 0, stone: 0, ore: 0 },
  goods: { venison: 0, game_meat: 0 }, tools: [], tool: 'hand', pos: { x: 0, z: 0 },
  ...o,
});

const stacksIn = (c, base) => c.pack.items.filter((i) => i && i.base === base);

// ---- the tables line up ----------------------------------------------------
{
  const r = auditState();
  check('every material, good and tool maps to a base something knows', !!r, `${r.locals} bases written locally, ${r.skills} skills`);
  check('the local bases are the four items.js has no row for', Object.keys(LOCAL_BASES).sort().join(',') === 'game_meat,pickaxe,stone,venison', Object.keys(LOCAL_BASES).join(','));
  check('wood is a log, ore is ore, stone is local', MATERIAL_BASE.wood === 'log' && MATERIAL_BASE.ore === 'ore' && baseOf('stone').localBase === true);
  check('and the skill list is the whole of skills.js', SKILL_IDS.length === SKILLS.length, `${SKILL_IDS.length}`);
}

// ---- the document a new player gets ----------------------------------------
{
  const c = blankCharacter();
  check('a new document is version 2', c.v === SAVE_VERSION && SAVE_VERSION === 2);
  check('it is a Blank', c.opening === 'blank');
  check('with fifty of each stat, which is 250', STATS.every((k) => c.stats[k] === 50) && STATS.reduce((t, k) => t + c.stats[k], 0) === 250);
  check('and none of the 200 skill points placed', SKILL_IDS.every((id) => c.skills[id] === 0), `${SKILL_IDS.length} skills, all zero`);
  check('every skill and stat starts marked up', SKILL_IDS.every((id) => c.skillLocks[id] === 'up') && STATS.every((k) => c.statLocks[k] === 'up'));
  check(`the pack has ${PACK_SLOTS} slots and they are empty`, c.pack.slots === PACK_SLOTS && c.pack.items.length === PACK_SLOTS && c.pack.items.every((i) => i === null));
  check('the paper doll has all fourteen slots, empty', SLOTS.every((s) => c.equipment[s] === null) && Object.keys(c.equipment).length === 14);
  check(`the bar has ${BAR_SLOTS} slots`, c.bar.length === BAR_SLOTS && c.bar.every((b) => b === null));
  check('nothing is discovered and nothing is dead', c.discovered.length === 0 && c.deadUntil.length === 0);
  check('the settings are the nine 07 names', Object.keys(c.settings).sort().join(',') === 'grass,invertDrag,music,pixelRatio,ring,sensitivity,sfx,shadows,textScale', Object.keys(c.settings).join(','));
  check('and it says it needs creating', c.needsCreation === true);
}
{
  const s = createState({ storage: null });
  check('no save at all gives needsCreation and a Blank', s.needsCreation === true && s.character.opening === 'blank');
  check('and the pools start full: 155 health from CON 50 and STR 50', s.character.health === 155, String(s.character.health));
}

// ---- the start of a game, as the old views see it --------------------------
{
  const s = createState({ storage: null });
  check('starts with 120 coins', s.coins === START_COINS, String(s.coins));
  check('and the coins ARE the gold on the document', s.character.gold === 120);
  check('starts with no tools and an empty hand', s.tools.size === 0 && s.tool === 'hand');
  check('starts with nothing in the pack', s.materials.wood === 0 && s.materials.stone === 0 && s.materials.ore === 0);
  check('the cap is 150 for each of the three', s.caps.wood === CAP && s.caps.stone === CAP && s.caps.ore === CAP);
}

// ---- the cap, from both sides ---------------------------------------------
{
  const s = createState({ storage: null });
  const a = s.add('wood', 200);
  check('200 wood into an empty pack keeps 150', a.added === 150, JSON.stringify(a));
  check('and reports the other 50 as dropped', a.dropped === 50, JSON.stringify(a));
  check('the pack holds exactly the cap', s.materials.wood === 150, String(s.materials.wood));
  check('and it is one stack of 150 logs, in one slot', stacksIn(s.character, 'log').length === 1 && stacksIn(s.character, 'log')[0].count === 150, JSON.stringify(stacksIn(s.character, 'log').map((i) => i.count)));
  const b = s.add('wood', 10);
  check('a full pack takes nothing and drops all 10', b.added === 0 && b.dropped === 10, JSON.stringify(b));

  const t = createState({ storage: null });
  t.add('stone', 149);
  const c = t.add('stone', 5);
  check('the last space takes 1 of 5 and drops 4', c.added === 1 && c.dropped === 4, JSON.stringify(c));
  check('under the cap nothing is dropped', t.add('ore', 3).dropped === 0);
  check('adding 0 is 0 added and 0 dropped', JSON.stringify(t.add('ore', 0)) === '{"added":0,"dropped":0}');
  check('a negative amount cannot drain the pack', t.add('ore', -5).added === 0 && t.materials.ore === 3);
  check('a fractional amount floors instead of leaking decimals', t.add('ore', 2.7).added === 2 && t.materials.ore === 5);
  const u = t.add('gold', 4);
  check('a material this game does not carry is refused, not silently kept', u.added === 0 && u.dropped === 4, JSON.stringify(u));
  check('and no stack was opened for it', t.character.pack.items.filter(Boolean).length === 2, String(t.character.pack.items.filter(Boolean).length));
}

// ---- taking back out ------------------------------------------------------
{
  const s = createState({ storage: null });
  s.add('wood', 12);
  check('take 5 of 12 leaves 7', s.take('wood', 5).taken === 5 && s.materials.wood === 7);
  check('take 99 of 7 takes 7 and cannot go negative', s.take('wood', 99).taken === 7 && s.materials.wood === 0);
  check('and the empty stack gives its slot back', s.character.pack.items.every((i) => i === null), JSON.stringify(s.character.pack.items.filter(Boolean)));
  check('take from an empty pack takes nothing', s.take('wood', 1).taken === 0);
}

// ---- the views really are views --------------------------------------------
{
  const s = createState({ storage: null });
  s.add('wood', 7);
  check('spreading materials reads the pack, not a copy', JSON.stringify({ ...s.materials }) === '{"wood":7,"stone":0,"ore":0}', JSON.stringify({ ...s.materials }));
  // hud.setMaterials does exactly this spread on every redraw.
  s.character.pack.items[0].count = 20;
  check('a write straight to the pack shows up in the view', s.materials.wood === 20, String(s.materials.wood));
  check('a stack of 20 logs weighs 40 stones', weightOf(s.character.pack.items[0]) === 40, String(weightOf(s.character.pack.items[0])));
}

// ---- coins ----------------------------------------------------------------
{
  const s = createState({ storage: null });
  check('cannot spend more than you have', s.spend(121) === false && s.coins === 120);
  check('can spend exactly what you have', s.spend(120) === true && s.coins === 0);
  check('cannot spend at zero', s.spend(1) === false && s.coins === 0);
  check('earning adds', s.earn(35) === 35 && s.coins === 35);
  check('spending part leaves the rest', s.spend(30) === true && s.coins === 5);
  check('and the document agrees', s.character.gold === 5);
}

// ---- tools ----------------------------------------------------------------
{
  const s = createState({ storage: null });
  check('a tool you do not own cannot be held', (s.tool = 'axe', s.tool === 'hand'));
  check('giving the axe works once', s.giveTool('axe') === true && s.tools.has('axe'));
  check('and it went to the main hand, as 07 says', s.character.equipment.mainHand.base === 'axe', JSON.stringify(s.character.equipment.mainHand && s.character.equipment.mainHand.base));
  check('and not twice', s.giveTool('axe') === false && s.tools.size === 1);
  check('the first tool goes into the hand by itself', s.tool === 'axe');
  check('a tool that is not in the game is refused', s.giveTool('sword') === false && s.tools.size === 1);
  s.giveTool('bow');
  check('the bow goes to the ranged slot', s.character.equipment.ranged.base === 'shortbow');
  check('a later tool does not snatch the hand', s.tool === 'axe');
  check('but can be taken out', (s.tool = 'bow', s.tool === 'bow'));
  check('and the hand is always available', (s.tool = 'hand', s.tool === 'hand'));
  s.giveTool('pickaxe');
  check('the pickaxe goes in the pack, as 07 says', s.character.pack.items.some((i) => i && i.base === 'pickaxe'));
  check('all three read as owned', s.tools.size === 3 && TOOLS.every((t) => s.hasTool(t)));
  s.character.equipment.mainHand = null;
  check('and losing the axe out of the hand loses the tool', s.tools.has('axe') === false && s.hasTool('axe') === false);
}
{
  const s = createState({ storage: null });
  check('dev mode reports every tool as owned', (s.dev = true, TOOLS.every((t) => s.hasTool(t))));
  check('but does not pretend they were bought', TOOLS.every((t) => s.boughtTool(t) === false));
  check('and turning it off hands back exactly nothing', (s.dev = false, s.tools.size === 0));
}

// ---- onChange -------------------------------------------------------------
{
  const s = createState({ storage: null });
  let n = 0;
  const off = s.onChange(() => n++);
  s.add('wood', 5); check('add notifies', n === 1, String(n));
  s.take('wood', 1); check('take notifies', n === 2, String(n));
  s.earn(5); check('earn notifies', n === 3, String(n));
  s.spend(5); check('spend notifies', n === 4, String(n));
  s.coins = 200; check('assigning coins notifies', n === 5, String(n));
  s.giveTool('axe'); check('a tool notifies twice, once for the pack and once for the hand', n === 7, String(n));
  s.tool = 'hand'; check('changing tool notifies', n === 8, String(n));
  s.touch('skills'); check('and progression.js can say a skill changed', n === 9, String(n));
  const before = n;
  s.add('wood', 0); check('an add of nothing says nothing', n === before);
  s.spend(9999); check('a refused spend says nothing', n === before);
  s.coins = 200; check('setting coins to what they already are says nothing', n === before);
  s.setPos(12, -4);
  check('walking does not redraw the HUD', n === before, `pos now ${s.pos.x},${s.pos.z}`);
  off();
  s.earn(1); check('unsubscribing works', n === before);
}

// ---- the hunting bag, from both sides -------------------------------------
{
  const s = createState({ storage: null });
  check('the bag starts empty', CARRIED.every((g) => s.goods[g] === 0), JSON.stringify(s.goods));
  check(`the bag caps at ${GOOD_CAP} of each`, CARRIED.every((g) => s.goodCaps[g] === GOOD_CAP));
  const a = s.addGood('venison', 2);
  check('2 venison go in whole', a.added === 2 && a.dropped === 0, JSON.stringify(a));
  check('and the bag holds them', s.goods.venison === 2);
  const b = s.addGood('venison', GOOD_CAP);
  check(`a bag with 2 in it takes ${GOOD_CAP - 2} more`, b.added === GOOD_CAP - 2, JSON.stringify(b));
  check('and reports the rest as dropped', b.dropped === 2, JSON.stringify(b));
  check('a full bag takes nothing and drops all 3', JSON.stringify(s.addGood('venison', 3)) === '{"added":0,"dropped":3}');
  const c = s.addGood('pelt', 4);
  check('a good this game does not carry adds nothing', c.added === 0 && c.dropped === 4, JSON.stringify(c));
  check('and does not invent a pocket for it', !('pelt' in s.goods));
  check('venison and game meat are separate stacks, not one pile of food', s.addGood('game_meat', 3).added === 3 && s.goods.venison === GOOD_CAP && s.goods.game_meat === 3);
  check('taking 5 venison takes 5', s.takeGood('venison', 5).taken === 5 && s.goods.venison === GOOD_CAP - 5);
  check('taking more than you have takes what is there', s.takeGood('venison', 999).taken === GOOD_CAP - 5 && s.goods.venison === 0);
  check('taking from an empty bag takes nothing', s.takeGood('venison', 1).taken === 0);
  check('taking a good this game does not carry takes nothing', s.takeGood('pelt', 1).taken === 0);
}
{
  let n = 0;
  const s = createState({ storage: null });
  s.onChange(() => n++);
  s.addGood('game_meat', 1);
  check('putting meat in the bag redraws the HUD', n === 1, String(n));
  s.addGood('game_meat', 0);
  check('adding nothing redraws nothing', n === 1, String(n));
  s.takeGood('game_meat', 1);
  check('taking it out redraws again', n === 2, String(n));
  s.takeGood('game_meat', 1);
  check('taking from empty redraws nothing', n === 2, String(n));
}

// ---- v2 save and load ------------------------------------------------------
{
  const store = memStore();
  const a = createState({ storage: store });
  a.add('wood', 40); a.add('stone', 7); a.add('ore', 2);
  a.addGood('venison', 3); a.addGood('game_meat', 1);
  a.spend(60); a.giveTool('axe'); a.giveTool('pickaxe'); a.tool = 'pickaxe';
  a.setPos(123.5, -88.25);
  a.character.skills.mining = 42.5;
  a.character.skillLocks.mining = 'down';
  a.character.stats.str = 61;
  a.character.name = 'Mabel';
  a.character.needsCreation = false;
  a.character.health = 90;

  check('save writes', a.save() === true && store.m.has(SAVE_KEY));
  check('and under the v2 key', SAVE_KEY === 'brackenwake-save-v2');
  const raw = JSON.parse(store.m.get(SAVE_KEY));
  check('the save is version 2', raw.v === SAVE_VERSION, JSON.stringify(raw.v));
  check('the save shape is the 07 document', JSON.stringify(Object.keys(raw).sort()) === '["appearance","bar","deadUntil","discovered","equipment","gold","health","heldTool","mana","name","needsCreation","opening","pack","pos","settings","skillLocks","skills","stamina","statLocks","stats","v"]', Object.keys(raw).join(','));

  const b = createState({ storage: store });
  check('load finds it', b.load() === true);
  check('coins come back', b.coins === 60, String(b.coins));
  check('materials come back', b.materials.wood === 40 && b.materials.stone === 7 && b.materials.ore === 2);
  check('the hunting bag comes back', b.goods.venison === 3 && b.goods.game_meat === 1, JSON.stringify(b.goods));
  check('tools come back', b.tools.has('axe') && b.tools.has('pickaxe') && b.tools.size === 2);
  check('the held tool comes back', b.tool === 'pickaxe');
  check('the place you stood comes back', b.pos.x === 123.5 && b.pos.z === -88.25);
  check('the skill comes back to the tenth', b.character.skills.mining === 42.5, String(b.character.skills.mining));
  check('and so does its lock', b.character.skillLocks.mining === 'down');
  check('the stat comes back', b.character.stats.str === 61);
  check('the name comes back', b.character.name === 'Mabel');
  check('the health you were left on comes back', b.character.health === 90, String(b.character.health));
  check('and a made character does not ask to be made again', b.needsCreation === false);
  let notified = 0; const c = createState({ storage: store }); c.onChange(() => notified++); c.load();
  check('loading redraws the HUD once', notified === 1, String(notified));
}

// ---- migration from a real v1 save -----------------------------------------
{
  const store = memStore();
  store.setItem(SAVE_KEY_V1, v1Save({
    coins: 245, materials: { wood: 37, stone: 12, ore: 4 },
    goods: { venison: 6, game_meat: 2 },
    tools: ['axe', 'pickaxe', 'bow'], tool: 'pickaxe', pos: { x: -212.5, z: 44 },
  }));
  const s = createState({ storage: store });
  check('a v1 save loads when there is no v2', s.load() === true);
  check('37 wood migrates to a stack of 37 logs', stacksIn(s.character, 'log').length === 1 && stacksIn(s.character, 'log')[0].count === 37, JSON.stringify(stacksIn(s.character, 'log').map((i) => i.count)));
  check('12 stone migrates to a stack of 12', stacksIn(s.character, 'stone')[0].count === 12);
  check('4 ore migrates to a stack of 4', stacksIn(s.character, 'ore')[0].count === 4);
  check('and the old views read the same numbers back', s.materials.wood === 37 && s.materials.stone === 12 && s.materials.ore === 4, JSON.stringify({ ...s.materials }));
  check('6 venison and 2 game meat come with them', s.goods.venison === 6 && s.goods.game_meat === 2, JSON.stringify(s.goods));
  check('245 coins become 245 gold', s.character.gold === 245 && s.coins === 245, String(s.coins));
  check('the axe is in the main hand', s.character.equipment.mainHand.base === 'axe');
  check('the bow is in the ranged slot', s.character.equipment.ranged.base === 'shortbow');
  check('the pickaxe is in the pack', s.character.pack.items.some((i) => i && i.base === 'pickaxe'));
  check('and all three still read as tools', s.tools.size === 3, [...s.tools].join(','));
  check('the held tool carries over', s.tool === 'pickaxe');
  check('the position carries over', s.pos.x === -212.5 && s.pos.z === 44, `${s.pos.x},${s.pos.z}`);
  check('the character is a Blank with its fifties', s.character.opening === 'blank' && STATS.every((k) => s.character.stats[k] === 50));
  check('with the 200 skill points unplaced', SKILL_IDS.every((id) => s.character.skills[id] === 0));
  check('and it asks to be made', s.needsCreation === true);
  check('the pools are full for the new character', s.character.health === 155 && s.character.mana === 135 && s.character.stamina === 120, `${s.character.health}/${s.character.mana}/${s.character.stamina}`);
  check('six slots of the pack are used and fourteen are free', s.character.pack.items.filter(Boolean).length === 6, String(s.character.pack.items.filter(Boolean).length));

  check('the v1 save is still there, because no v2 has been written yet', store.m.has(SAVE_KEY_V1));
  check('and there is no v2 yet', !store.m.has(SAVE_KEY));
  s.save();
  check('after one v2 save the new key is written', store.m.has(SAVE_KEY));
  check('and only then does the v1 key go', !store.m.has(SAVE_KEY_V1));
}
{
  // The shape before `v` existed: materials at the top level, tools as a map.
  const store = memStore();
  store.setItem(SAVE_KEY_V1, JSON.stringify({ coins: 41, wood: 9, stone: 3, tools: { axe: true, bow: false }, tool: 'axe', x: 5, z: 6 }));
  const s = createState({ storage: store });
  check('a save from before v1 numbered itself still migrates', s.load() === true);
  check('its coins are kept', s.coins === 41, String(s.coins));
  check('its materials are kept', s.materials.wood === 9 && s.materials.stone === 3 && s.materials.ore === 0);
  check('its tool map is read', s.tools.has('axe') && !s.tools.has('bow') && s.tools.size === 1);
  check('its held tool is kept', s.tool === 'axe');
  check('its position is read from the old top-level keys', s.pos.x === 5 && s.pos.z === 6);
  check('a save from before the hunting bag leaves it empty', CARRIED.every((g) => s.goods[g] === 0), JSON.stringify(s.goods));
}
{
  const store = memStore();
  store.setItem(SAVE_KEY_V1, v1Save({ coins: -5, materials: { wood: 900, stone: -3, ore: 'lots' }, goods: { venison: 900, game_meat: -2, pelt: 5 }, tools: ['axe'], tool: 'pickaxe', pos: { x: 'here', z: 2 } }));
  const s = createState({ storage: store });
  s.load();
  check('a v1 save over the cap is clamped to the cap', s.materials.wood === CAP, String(s.materials.wood));
  check('a negative material is clamped to zero', s.materials.stone === 0);
  check('a material that is not a number is left alone', s.materials.ore === 0);
  check('a good over its cap is clamped to the cap', s.goods.venison === GOOD_CAP, String(s.goods.venison));
  check('a negative good is clamped to zero', s.goods.game_meat === 0);
  check('a good this version does not carry is ignored', !('pelt' in s.goods));
  check('negative coins are clamped to zero', s.coins === 0);
  check('holding a tool you do not own falls back to the hand', s.tool === 'hand');
  check('half a position is no position', s.pos.x === 0 && s.pos.z === 0);
}
{
  // v1's tool list is an array of ids; a repeat must not make two axes.
  const c = migrateV1({ v: SAVE_VERSION_V1, coins: 10, materials: { wood: 1 }, tools: ['axe', 'axe', 'crossbow'], tool: 'axe' });
  check('a repeated tool in a v1 save makes one item', c.equipment.mainHand.base === 'axe' && c.pack.items.filter((i) => i && i.base === 'axe').length === 0);
  check('and a tool this game never had is ignored', c.pack.items.filter(Boolean).length === 1, JSON.stringify(c.pack.items.filter(Boolean).map((i) => i.base)));
}

// ---- which save wins -------------------------------------------------------
{
  const store = memStore();
  store.setItem(SAVE_KEY_V1, v1Save({ coins: 11 }));
  const a = createState({ storage: store });
  a.load(); a.coins = 999; a.save();
  const b = createState({ storage: store });
  b.load();
  check('once a v2 save exists it is the one that loads', b.coins === 999, String(b.coins));
  store.setItem(SAVE_KEY_V1, v1Save({ coins: 11 }));
  const c = createState({ storage: store });
  c.load();
  check('and a v1 save that reappears beside it is ignored', c.coins === 999, String(c.coins));
}

// ---- a load that has to tolerate something --------------------------------
{
  const s = createState({ storage: memStore() });
  check('no save at all is not an error, and leaves a new game', s.load() === false && s.coins === 120 && s.tools.size === 0);
}
{
  const store = memStore(); store.setItem(SAVE_KEY, '{not json');
  const s = createState({ storage: store });
  check('a corrupt v2 save does not throw and leaves a new game', s.load() === false && s.coins === 120);
}
{
  const store = memStore();
  store.setItem(SAVE_KEY, '{not json');
  store.setItem(SAVE_KEY_V1, v1Save({ coins: 77 }));
  const s = createState({ storage: store });
  check('a corrupt v2 save falls back to the v1 one rather than to nothing', s.load() === true && s.coins === 77, String(s.coins));
}
{
  const store = memStore();
  store.setItem(SAVE_KEY, JSON.stringify({
    v: 4, gold: 12, quests: [{ id: 'x' }],
    stats: { str: 70, luck: 9 }, skills: { mining: 5, swimmming: 3 },
    pack: { slots: 20, items: [{ base: 'log', count: 5 }, { base: 'unobtanium', count: 9 }] },
    equipment: { mainHand: { base: 'axe' }, tail: { base: 'axe' } },
    heldTool: 'crossbow',
  }));
  const s = createState({ storage: store });
  check('a newer save still loads', s.load() === true);
  check('what it shares is kept', s.coins === 12 && s.materials.wood === 5 && s.tools.has('axe'));
  check('a stat this version does not have is ignored', s.character.stats.str === 70 && !('luck' in s.character.stats));
  check('a skill this version does not have is ignored', s.character.skills.mining === 5 && !('swimmming' in s.character.skills));
  check('an item base this version does not know is dropped, not carried as a hole', s.character.pack.items.filter(Boolean).length === 1, JSON.stringify(s.character.pack.items.filter(Boolean).map((i) => i.base)));
  check('an equipment slot this version does not have is ignored', !('tail' in s.character.equipment) && Object.keys(s.character.equipment).length === 14);
  check('and a hand holding a tool it does not own falls back to the hand', s.tool === 'hand');
}
{
  const c = hydrate({ stats: { con: 100, str: 100 }, health: 99999 });
  check('a save claiming more health than the stats allow is clamped', c.health === 280, `${c.health} of a possible ${30 + 200 + 50}`);
  const d = hydrate(null);
  check('hydrating nothing gives a whole blank document', d.v === 2 && d.pack.items.length === PACK_SLOTS);
}
{
  const s = createState({ storage: null });
  check('with no storage, save reports that it did not', s.save() === false);
  check('and load reports that it found nothing', s.load() === false);
}
{
  const store = memStore();
  store.setItem(SAVE_KEY, '{}'); store.setItem(SAVE_KEY_V1, '{}');
  const s = createState({ storage: store });
  s.clearSave();
  check('clearing a save clears both versions', !store.m.has(SAVE_KEY) && !store.m.has(SAVE_KEY_V1));
}

// ---- creation hands the document over --------------------------------------
{
  const s = createState({ storage: null });
  let told = 0;
  s.onChange(() => told++);
  const made = blankCharacter();
  made.opening = 'warrior';
  made.name = 'Alder';
  made.stats = { str: 65, dex: 50, int: 25, con: 65, wis: 45 };
  made.skills.swordsmanship = 50;
  made.gold = 25;
  check('creation.js can put a whole character in', s.setCharacter(made) === true);
  check('and it stops asking to be created', s.needsCreation === false);
  check("the stats are the warrior's", s.character.stats.str === 65 && s.character.skills.swordsmanship === 50);
  check("the purse is the opening's", s.coins === 25, String(s.coins));
  check('the pools fill, because the character is new', s.character.health === 192.5, String(s.character.health));
  check('and the HUD is told', told === 1, String(told));
  check('a character of nothing is refused', s.setCharacter(null) === false);
}

// ---- the pack has a floor as well as a cap ---------------------------------
{
  const s = createState({ storage: null });
  for (let i = 0; i < PACK_SLOTS; i++) s.character.pack.items[i] = makeStack('gem', 1);
  const a = s.add('wood', 10);
  check('a pack with no free slot takes nothing and says so', a.added === 0 && a.dropped === 10, JSON.stringify(a));
  check('and giving a tool into a full pack is refused rather than lost', s.giveTool('pickaxe') === false && !s.tools.has('pickaxe'));
  check('but a tool with a slot of its own still fits', s.giveTool('axe') === true && s.character.equipment.mainHand.base === 'axe');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
