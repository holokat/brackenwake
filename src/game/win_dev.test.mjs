// The dev bench. Run: node src/game/win_dev.test.mjs
//
// Every claim here is measured against the real modules wherever a real module
// runs in node: state.js holds the document, actor.js builds the actor and
// recomputes it, inventory.js owns the pack, combat.js resolves. Only the four
// things that need THREE or a canvas are stood in for, and those stand-ins are
// recorders, so what they prove is the order and the arguments of the calls the
// bench really makes.
//
// The bench is the panel. panel.build wires buttons to createBench and nothing
// else, so driving the bench is driving the buttons.

import {
  createBench, searchBases, searchMonsters, groupSites, edgeOf, abilityNeeds,
  clockOffsetFor, clockWords, panel, SETS, GOLD_STEPS, PLACE_RADIUS, KIND_ORDER, ENTERABLE,
} from './win_dev.js';
import { createState } from './state.js';
import { playerActor, recompute } from './actor.js';
import { createInventory } from './inventory.js';
import { createCombat } from './combat.js';
import { makeItem, RARITY, BASES, setOf, WEAPON_IDS } from '../mmo/items.js';
import { ABILITIES, unlockedFor } from '../mmo/abilities.js';
import { MONSTERS } from '../mmo/monsters.js';
import { dayFactorAt, DAY_CYCLE_MS } from './scene.js';
import { createDev, DEBUG_FLAGS } from './dev.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// A ctx that is real everywhere node allows it to be.

function realCtx(over = {}) {
  const state = createState({ storage: null });
  const character = state.character;
  character.needsCreation = false;
  const said = [];
  const hud = { log: (t, k) => said.push([t, k || null]), toast: (t, k) => said.push([t, k || null]) };
  const audio = { play: () => {} };
  const floaters = { spawn: () => {} };
  const actor = playerActor(character, { pos: { x: 0, y: 0, z: 0 } });
  const inventory = createInventory({
    character, actor, recompute,
    onChange: (c, what) => state.touch(what),
    hud, audio, floaters,
    onSell: () => ({ ok: false, reason: 'nobody is buying' }),
    onDrop: () => {},
  });
  const combat = createCombat({ floaters, hud, audio, progression: { lesson: () => {}, statLesson: () => {} } });
  const ctx = {
    character, actor, state, inventory, combat, hud, audio, floaters, said,
    player: { pos: actor.pos, yaw: 0, teleport(x, z) { this.pos.x = x; this.pos.z = z; } },
    recompute: (who) => recompute(who || actor),
    now: () => 0,
    ...over,
  };
  return ctx;
}

/** A ctx made of recorders, for the calls that need THREE in the real game. */
function recordingCtx(over = {}) {
  const calls = [];
  const at = { x: 0, z: 0 };
  const said = [];
  const ctx = {
    calls, said,
    character: { skills: {}, stats: {} },
    actor: { name: 'You', pos: at, health: 10, maxHealth: 10 },
    hud: { log: (t, k) => said.push([t, k || null]) },
    player: {
      pos: at, yaw: 0,
      teleport(x, z) { calls.push(['player.teleport', x, z]); at.x = x; at.z = z; },
    },
    camera: { yaw: 0, snap(p) { calls.push(['camera.snap', Math.round(p.x), Math.round(p.z)]); } },
    state: { setPos(x, z) { calls.push(['state.setPos', x, z]); }, touch() {}, coins: 0 },
    monsters: { rescan(x, z, night) { calls.push(['monsters.rescan', x, z, !!night]); } },
    combat: { forget(a) { calls.push(['combat.forget', a === ctx.actor]); } },
    runtime: { heightAt: () => 3, sitesNear: () => [] },
    sc: { dayFactor: () => 1 },
    now: () => 0,
    ...over,
  };
  return ctx;
}

// ---------------------------------------------------------------------------
console.log('win_dev: the panel matches the window contract');
check('it is the dev panel on F2', panel.id === 'dev' && panel.key === 'f2' && panel.title === 'Dev bench');
check('it builds, opens and ticks', typeof panel.build === 'function' && typeof panel.open === 'function' && typeof panel.tick === 'function');
{
  const src = [
    ...Object.values(SETS).map((s) => s.label),
    ...KIND_ORDER, 'Dev bench',
  ].join(' ');
  // 8212 is the em dash, written as a code so this file does not carry one either.
  check('nothing the panel shows carries an em dash', !src.includes(String.fromCharCode(8212)));
}

console.log('win_dev: the item search');
{
  const plate = searchBases('breastplate');
  check('a partial name finds the breastplates', plate.length >= 1 && plate.every((b) => /breastplate/i.test(b.name)), plate.map((b) => b.id).join(', '));
  const byId = searchBases('plate_chest');
  check('an id finds its own base', byId.length === 1 && byId[0].id === 'plate_chest');
  check('a name nobody has finds nothing', searchBases('zzzz').length === 0);
  check('an empty box shows a list, capped', searchBases('', { limit: 5 }).length === 5);
  check('the whole catalogue is reachable', searchBases('', { limit: 0 }).length === Object.keys(BASES).length, `${Object.keys(BASES).length} bases`);
}

console.log('win_dev: the monster search');
{
  const wolves = searchMonsters('wolf');
  const ids = wolves.map((m) => m.id);
  check('a partial name finds all three wolves', ids.includes('wolf') && ids.includes('direWolf') && ids.includes('werewolf'), ids.join(', '));
  check('and they come lowest tier first', wolves.every((m, i) => i === 0 || wolves[i - 1].tier <= m.tier), wolves.map((m) => m.tier).join(''));
  check('a capital does not matter', searchMonsters('WOLF').length === wolves.length);
  check('nothing by that name is nothing', searchMonsters('gribbly').length === 0);
}

console.log('win_dev: the site list groups and sorts');
{
  const sites = [
    { id: 'a', name: 'Ashford', kind: 'town', x: 300, z: 0, flatR: 46 },
    { id: 'b', name: 'Coldmere', kind: 'town', x: 100, z: 0, flatR: 46 },
    { id: 'c', name: 'Redstead', kind: 'hamlet', x: 0, z: 900, flatR: 26 },
    { id: 'd', name: 'the Marl Cut', kind: 'dungeon', x: 0, z: 50, flatR: 10 },
    { id: 'e', name: "Rye's Delve", kind: 'cave', x: 0, z: -700, flatR: 12 },
    { id: 'f', name: 'the Kiln Barrow', kind: 'ruin', x: 20, z: 20, flatR: 14 },
    { id: 'g', name: 'a cold fire', kind: 'camp', x: 5, z: 5, flatR: 7 },
    { id: 'h', name: 'the Weir Stone', kind: 'shrine', x: -400, z: 0, flatR: 6 },
    { id: 'i', name: 'somewhere new', kind: 'lighthouse', x: 10, z: 10, flatR: 5 },
  ];
  const groups = groupSites(sites, { x: 0, z: 0 });
  const order = groups.map((g) => g.kind);
  check('the kinds come in the bench order', order.join(',') === 'town,hamlet,dungeon,cave,ruin,shrine,camp,lighthouse', order.join(','));
  const towns = groups[0].rows;
  check('the nearer town is first', towns[0].site.name === 'Coldmere' && towns[1].site.name === 'Ashford', towns.map((r) => `${r.site.name} ${Math.round(r.d)}`).join(', '));
  check('the distance is measured, not guessed', near(towns[0].d, 100) && near(towns[1].d, 300));
  check('a kind KIND_ORDER never heard of still appears, at the end', order[order.length - 1] === 'lighthouse');
  check('nothing is lost on the way', groups.reduce((n, g) => n + g.rows.length, 0) === sites.length);
  check('an empty world is an empty list', groupSites([], { x: 0, z: 0 }).length === 0);
}

console.log('win_dev: where a teleport lands');
{
  const site = { name: 'Coldmere', kind: 'town', x: 1000, z: 0, flatR: 46, facing: 0 };
  const at = edgeOf(site, { x: 0, z: 0 });
  check('you land outside the flat ground, on your own side', near(at.x, 1000 - 54) && near(at.z, 0), `${Math.round(at.x)}, ${Math.round(at.z)}`);
  check('and you are looking at the place', near(at.yaw, Math.PI / 2, 1e-9), `${at.yaw.toFixed(3)} rad`);
  const inside = edgeOf(site, { x: 1000, z: 0 });
  check('standing on the centre still gives a direction', Number.isFinite(inside.x) && Number.isFinite(inside.z) && Math.hypot(inside.x - 1000, inside.z) > 50);
}

console.log('win_dev: a teleport does the five things, in order');
{
  const ctx = recordingCtx();
  const bench = createBench(ctx);
  const site = { name: 'Coldmere', kind: 'town', x: 500, z: 0, flatR: 46, facing: 0 };
  const r = bench.teleport(site);
  const names = ctx.calls.map((c) => c[0]);
  check('all five were called', names.length === 5, names.join(' -> '));
  check('and in the order main.js uses', names.join(',') === 'player.teleport,camera.snap,state.setPos,monsters.rescan,combat.forget', names.join(','));
  check('the document was moved to where the feet are', ctx.calls[2][1] === ctx.calls[0][1] && ctx.calls[2][2] === ctx.calls[0][2]);
  check('the sweep is around the new spot', ctx.calls[3][1] === ctx.calls[0][1]);
  check('and it is the player whose swings are dropped', ctx.calls[4][1] === true);
  check('the camera was turned to face it', near(ctx.camera.yaw, Math.PI / 2, 1e-9));
  check('and it said where you went and how far it was', /Coldmere/.test(r.text) && /500 m/.test(r.text), r.text);
}

console.log('win_dev: a teleport with nothing wired changes nothing and says so');
{
  const ctx = recordingCtx({ player: {} });
  const bench = createBench(ctx);
  const r = bench.teleport({ name: 'Coldmere', kind: 'town', x: 500, z: 0, flatR: 46 });
  check('it refuses', r.ok === false);
  check('nothing at all was called', ctx.calls.length === 0);
  check('and the refusal is in words', /teleport/.test(r.text), r.text);
}

console.log('win_dev: going into a place, and going deeper');
{
  const entered = [];
  const ctx = recordingCtx({
    runtime: {
      heightAt: () => 0, sitesNear: () => [], inDungeon: false,
      enterDungeon: (s) => { entered.push(s.id); return { site: s, level: 1 }; },
      dungeonGo: (d) => { entered.push(`go:${d}`); return { inside: true, level: 2 }; },
    },
  });
  const bench = createBench(ctx);
  const cave = { id: 'c1', name: "Rye's Delve", kind: 'cave', x: 200, z: 0, flatR: 12 };
  const town = { id: 't1', name: 'Coldmere', kind: 'town', x: 200, z: 0, flatR: 46 };
  const a = bench.enterSite(cave);
  check('a cave opens, and the feet moved first', a.ok === true && entered[0] === 'c1' && ctx.calls[0][0] === 'player.teleport');
  const b = bench.enterSite(town);
  check('a town has nothing to go into, and says so', b.ok === false && /nothing to go into/.test(b.text), b.text);
  check('the town did not open anything', entered.length === 1);
  const up = bench.dungeonGo('up');
  check('above ground, deeper and out refuse', up.ok === false && /not underground/.test(up.text), up.text);
  ctx.runtime.inDungeon = true;
  const down = bench.dungeonGo('down');
  check('underground the stair is taken', down.ok === true && entered.includes('go:down'));
  check('every enterable kind is a kind sitegrid.js has', ENTERABLE.every((k) => ['dungeon', 'cave'].includes(k)));
}

console.log('win_dev: go to coordinates');
{
  const ctx = recordingCtx();
  const bench = createBench(ctx);
  const r = bench.goTo('120', '-45');
  check('two numbers move you', r.ok === true && ctx.calls[0][1] === 120 && ctx.calls[0][2] === -45);
  check('and it says where you are and how high', /120, -45/.test(r.text) && /3 m/.test(r.text), r.text);
  const bad = bench.goTo('over there', '4');
  check('words do not', bad.ok === false && ctx.calls.length === 5, bad.text);
}

console.log('win_dev: gold goes through the purse the game uses');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const before = ctx.state.coins;
  const r = bench.giveGold(GOLD_STEPS[1]);
  check('a thousand goes in', r.ok && ctx.state.coins === before + 1000, `${before} then ${ctx.state.coins}`);
  check('and the line counts the purse, not the gift', r.text.includes(String(before + 1000)), r.text);
  const none = bench.giveGold(0);
  check('nothing asked for is nothing given, and it says so', none.ok === false && ctx.state.coins === before + 1000, none.text);
}

console.log('win_dev: an item into the pack');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const r = bench.giveItem({ base: 'plate_chest', rarity: 'rare', identified: true, material: 'iron' });
  const slot = ctx.character.pack.items[r.index];
  check('it went in', r.ok === true && !!slot, r.text);
  check('it is a plate breastplate', slot && slot.base === 'plate_chest', slot && BASES[slot.base].name);
  check('of the rarity that was asked for', slot && slot.rarity === 'rare');
  check('and it is identified', slot && slot.identified === true);
  check('with the two affixes rare rolls', slot && slot.affixes.length === RARITY.rare.affixes, `${slot ? slot.affixes.length : 0} affixes`);
  check('every line is readable, none of it vague', r.vague === 0);
  check('the metal is on the record for gear_visuals', slot && slot.material === 'iron');
  check('and the line names the thing and its slot', /Breastplate/.test(r.text) && /slot \d/.test(r.text), r.text);
}

console.log('win_dev: an item left unidentified is left unidentified');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const r = bench.giveItem({ base: 'longsword', rarity: 'epic', identified: false });
  const slot = ctx.character.pack.items[r.index];
  check('it went in', r.ok === true);
  check('and it is still a mystery', slot && slot.identified === false, r.text);
  check('the affixes are already rolled from the seed', slot && slot.affixes.length === RARITY.epic.affixes);
  check('and the line says so', /unknown/.test(r.text), r.text);
}

console.log('win_dev: a stack, a common item, and a base nobody has');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const r = bench.giveItem({ base: 'arrow', rarity: 'common', count: 250 });
  const slot = ctx.character.pack.items[r.index];
  check('250 arrows are 250 arrows', r.ok && slot.count === 250, `${slot && slot.count}`);
  const one = bench.giveItem({ base: 'longsword', count: 40 });
  const sword = ctx.character.pack.items[one.index];
  check('a sword cannot be a stack of forty', one.ok && sword.count === undefined);
  const none = bench.giveItem({ base: 'lightsabre' });
  check('a base nobody has is refused in words', none.ok === false && /no base called lightsabre/.test(none.text), none.text);
}

console.log('win_dev: a full pack takes nothing and says so');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const items = ctx.character.pack.items;
  for (let i = 0; i < items.length; i++) items[i] = makeItem({ base: 'longsword', seed: i + 1 });
  const before = items.map((it) => it.id).join(',');
  const r = bench.giveItem({ base: 'plate_chest', rarity: 'rare' });
  check('it refuses', r.ok === false, r.text);
  check('the pack is exactly what it was', items.map((it) => it.id).join(',') === before);
  check('no slot became a breastplate', !items.some((it) => it.base === 'plate_chest'));
  check('and the refusal says the pack is full', /full/.test(r.text), r.text);
}

console.log('win_dev: the full sets');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const r = bench.giveSet('plate', { rarity: 'common', identified: true });
  const worn = ctx.character.pack.items.filter((it) => it && it.base.startsWith('plate_'));
  check('all eight pieces went in', r.ok === true && r.added === 8 && worn.length === 8, r.text);
  check('and they are the eight setOf("plate") names', new Set(worn.map((it) => it.base)).size === setOf('plate').length);
}
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const r = bench.giveSet('weapons', { rarity: 'common' });
  const wanted = WEAPON_IDS.filter((id) => BASES[id].slot).length;
  check('the weapon rack is every weapon with a slot, fists left out', wanted === 18, `${wanted} of ${WEAPON_IDS.length} weapons`);
  const held = ctx.character.pack.items.filter(Boolean).length;
  check('all eighteen fit a twenty slot pack', r.ok === true && r.added === wanted && held === wanted, r.text);
  const none = bench.giveSet('mithril');
  check('a set nobody has is refused', none.ok === false && /no set called mithril/.test(none.text), none.text);
}
{
  // The other direction: a pack with three slots left takes three of the set.
  const ctx = realCtx();
  const bench = createBench(ctx);
  const items = ctx.character.pack.items;
  for (let i = 0; i < items.length - 3; i++) items[i] = makeItem({ base: 'longsword', seed: i + 1 });
  const r = bench.giveSet('plate', { rarity: 'common' });
  check('three of the eight go in and five do not', r.ok === false && r.added === 3 && r.refused === 5, r.text);
  check('and it counts both halves out loud', /3 of 8/.test(r.text) && /No room for 5/.test(r.text), r.text);
  check('the pack really is full', items.every(Boolean));
}

console.log('win_dev: the skills sheet, driven up and put back exactly');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const sheet = ctx.character.skills;
  sheet.swordsmanship = 41.5; sheet.mining = 7; sheet.tactics = 63.25;
  const kept = { ...sheet };
  const up = bench.setAllSkills(100);
  check('every skill stands at 100', Object.values(sheet).every((v) => v === 100), `${up.changed} changed`);
  check('the actor was recomputed off the same object', ctx.actor.skills.swordsmanship === 100);
  const back = bench.restoreSkills();
  const same = Object.keys(kept).every((k) => sheet[k] === kept[k]) && Object.keys(sheet).length === Object.keys(kept).length;
  check('restore gives back the exact sheet, key for key', same, `${back.changed} put right, ${Object.keys(kept).length} keys`);
  check('including the fractions', sheet.swordsmanship === 41.5 && sheet.tactics === 63.25);
  check('the actor followed it back down', ctx.actor.skills.swordsmanship === 41.5);
  check('the object was written in place, never replaced', ctx.actor.baseSkills === sheet);
  const again = bench.restoreSkills();
  check('a second restore has nothing to give and says so', again.ok === false && /nothing to put back/.test(again.text), again.text);
}

console.log('win_dev: the stats, and the pools that follow them');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  const kept = { ...ctx.character.stats };
  const beforeHealth = ctx.actor.maxHealth;
  const up = bench.setAllStats(100);
  check('every stat stands at 100', Object.values(ctx.character.stats).every((v) => v === 100), `${up.changed} changed`);
  check('and the health pool grew with them', ctx.actor.maxHealth > beforeHealth, `${beforeHealth} then ${ctx.actor.maxHealth}`);
  check('the line reports the pools it just changed', /Health \d+/.test(up.text), up.text);
  bench.restoreStats();
  const same = Object.keys(kept).every((k) => ctx.character.stats[k] === kept[k]);
  check('restore gives back the exact stats', same);
  check('and the pool went back with them', ctx.actor.maxHealth === beforeHealth);
}

console.log('win_dev: learn every ability');
{
  const needs = abilityNeeds();
  const worst = Math.max(...Object.values(needs.skills), ...Object.values(needs.stats));
  check('nothing an ability wants is above 100', worst <= 100, `the highest is ${worst}`);
  const ctx = realCtx();
  const bench = createBench(ctx);
  const before = unlockedFor(ctx.character.skills, ctx.character.stats).length;
  const r = bench.learnAllAbilities();
  const after = unlockedFor(ctx.character.skills, ctx.character.stats);
  check(`all ${ABILITIES.length} abilities open`, r.ok === true && after.length === ABILITIES.length, `${before} before, ${after.length} after`);
  check('and it counted the new ones itself', r.gained === after.length - before, r.text);
  check('it says the bar is still the player\'s', /bar is untouched/.test(r.text), r.text);
  check('the bar really was not touched', !('bar' in ctx.character) || ctx.character.bar.every((x) => x === null));
  bench.restoreSkills(); bench.restoreStats();
  check('and the sheet it raised can be put back', unlockedFor(ctx.character.skills, ctx.character.stats).length === before);
}

console.log('win_dev: god mode is probed, not promised');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  ctx.actor.health = ctx.actor.maxHealth;
  const on = bench.toggleGod();
  check('the flag goes on', on.on === true && ctx.actor.godMode === true);
  check('combat.js honours it: the probe blow takes nothing off', on.honoured === true && /took nothing off you/.test(on.text), on.text);
  check('the test blow was healed back', ctx.actor.health === ctx.actor.maxHealth, `${ctx.actor.health} of ${ctx.actor.maxHealth}`);
  const off = bench.toggleGod();
  check('and it goes off again', off.on === false && ctx.actor.godMode === false, off.text);
}
{
  // The other direction: a combat that DOES honour the flag reports honoured.
  const ctx = recordingCtx({
    actor: { name: 'You', pos: { x: 0, z: 0 }, health: 10, maxHealth: 10 },
    combat: {
      hurt(a, n) { if (a.godMode) return 0; a.health -= n; return n; },
      heal(a, n) { a.health += n; return n; },
      forget() {},
    },
  });
  const bench = createBench(ctx);
  const on = bench.toggleGod();
  check('a resolver that honours it is reported as honouring it', on.honoured === true && /took nothing off/.test(on.text), on.text);
  check('and no health moved', ctx.actor.health === 10);
}

console.log('win_dev: heal and refill');
{
  const ctx = realCtx();
  const bench = createBench(ctx);
  ctx.actor.health = 3; ctx.actor.mana = 0; ctx.actor.stamina = 1;
  const r = bench.healFull();
  check('health is full', ctx.actor.health === ctx.actor.maxHealth, `${ctx.actor.health} of ${ctx.actor.maxHealth}`);
  check('so are mana and stamina', ctx.actor.mana === ctx.actor.maxMana && ctx.actor.stamina === ctx.actor.maxStamina);
  check('and it counted what it put back', r.healed === Math.round(ctx.actor.maxHealth - 3) || Math.abs(r.healed - (ctx.actor.maxHealth - 3)) < 1, r.text);
}

console.log('win_dev: cooldowns');
{
  const cooldowns = { fireball: 900, powerStrike: 400 };
  const ctx = recordingCtx({ abilities: { cooldowns } });
  const bench = createBench(ctx);
  const r = bench.resetCooldowns();
  check('both are cleared, off the very object the runtime reads', r.cleared === 2 && Object.keys(cooldowns).length === 0, r.text);
  const again = bench.resetCooldowns();
  check('a second press says nothing was cooling', again.cleared === 0 && /nothing was cooling/.test(again.text), again.text);
  const bare = createBench(recordingCtx());
  const none = bare.resetCooldowns();
  check('with no ability runtime it refuses in words', none.ok === false && /not wired/.test(none.text), none.text);
}

console.log('win_dev: spawning');
{
  const spawned = [];
  const ctx = recordingCtx({
    player: { pos: { x: 0, z: 0 }, yaw: 0, teleport() {} },
    targeting: { lastGround: { x: 40, z: 40 } },
    monsters: { rescan() {}, spawnAt: (id, x, z) => { spawned.push([id, x, z]); return { id, actor: { name: MONSTERS[id].name } }; } },
  });
  const bench = createBench(ctx);
  const ahead = bench.spawn('wolf');
  check('a wolf appears six metres ahead', ahead.ok && Math.round(Math.hypot(spawned[0][1], spawned[0][2])) === 6, `${spawned[0][1].toFixed(1)}, ${spawned[0][2].toFixed(1)}`);
  check('and the line carries its tier and its health', /tier 2/.test(ahead.text) && new RegExp(`${MONSTERS.wolf.hp} health`).test(ahead.text), ahead.text);
  const cursor = bench.spawn('wolf', 'cursor');
  check('at the cursor it goes to the cursor', cursor.ok && spawned[1][1] === 40 && spawned[1][2] === 40);
  const nobody = bench.spawn('gribbly');
  check('nothing is called gribbly', nobody.ok === false && spawned.length === 2, nobody.text);
}
{
  const ctx = recordingCtx({ monsters: { rescan() {} } });
  const bench = createBench(ctx);
  const r = bench.spawn('wolf');
  check('with no spawnAt it names the export it needs', r.ok === false && /spawnAt\(id, x, z\)/.test(r.text), r.text);
}

console.log('win_dev: killing');
{
  const dead = [];
  const alive = [
    { name: 'Wolf', pos: { x: 5, z: 0 }, health: 40, ai: { target: 'you', state: 'chase' } },
    { name: 'Dire Wolf', pos: { x: 29, z: 0 }, health: 90, ai: { target: 'you', state: 'chase' } },
    { name: 'Drake', pos: { x: 31, z: 0 }, health: 900, ai: { target: null, state: 'idle' } },
  ];
  const ctx = recordingCtx({
    monsters: { rescan() {}, actors: () => alive },
    combat: { kill: (a) => { dead.push(a.name); a.health = 0; }, forget: () => {} },
    targeting: { current: alive[0] },
  });
  const bench = createBench(ctx);
  const t = bench.killTarget();
  check('the target falls, through combat.kill', t.ok && dead[0] === 'Wolf' && alive[0].health === 0, t.text);
  dead.length = 0;
  alive[0].health = 40;
  const near30 = bench.killNear(30);
  check('kill all within 30 m takes the two inside it', near30.killed === 2 && dead.join(',') === 'Wolf,Dire Wolf', near30.text);
  check('and leaves the one at 31 m alone', alive[2].health === 900);
  const deadCalm = bench.clearAggro();
  check('a corpse is not calmed: it is dead', deadCalm.calmed === 0 && alive[0].ai.target === 'you', deadCalm.text);
  alive[0].health = 40; alive[1].health = 90;
  const calm = bench.clearAggro();
  check('clearing aggro calms the two that were interested', calm.calmed === 2 && alive[0].ai.target === null && alive[1].ai.state === 'idle', calm.text);
  check('and leaves the one that never was', alive[2].ai.state === 'idle');
  const quiet = bench.clearAggro();
  check('a second press has nobody to calm and says so', quiet.calmed === 0 && /nothing was interested/.test(quiet.text), quiet.text);
  const noTarget = createBench(recordingCtx({ monsters: { rescan() {} } })).killTarget();
  check('with nothing targeted it says so', noTarget.ok === false && /not looking at anything/.test(noTarget.text), noTarget.text);
}

console.log('win_dev: the time of day');
{
  const cycle = DAY_CYCLE_MS;
  for (const [t, want] of [[0.5, 'noon'], [0, 'midnight'], [0.25, 'dawn']]) {
    const now = 123456;
    const off = clockOffsetFor(t, now, cycle);
    const phase = (((now + off) / cycle) + 0.12) % 1;
    const wantPhase = (((t + 0.5) % 1) + 1) % 1;
    check(`the offset lands ${want} on the phase it asked for`, near(phase, wantPhase, 1e-9), `${phase.toFixed(6)} wanted ${wantPhase.toFixed(6)}`);
  }
  check('noon is the brightest the day gets', near(dayFactorAt(clockOffsetFor(0.5, 0)), 1, 1e-9), String(dayFactorAt(clockOffsetFor(0.5, 0))));
  check('midnight is the darkest', near(dayFactorAt(clockOffsetFor(0, 0)), 0, 1e-9), String(dayFactorAt(clockOffsetFor(0, 0))));
  check('the offset is always inside one cycle', [0, 0.13, 0.5, 0.99].every((t) => { const o = clockOffsetFor(t, 7e7); return o >= 0 && o < cycle; }));
  check('the label reads like a clock', clockWords(0.5) === '12:00' && clockWords(0) === '00:00' && clockWords(0.75) === '18:00', `${clockWords(0.5)} ${clockWords(0.75)}`);
}
{
  const set = [];
  const ctx = recordingCtx({ sc: { dayFactor: () => 1, setClockOffset: (ms) => set.push(ms) } });
  const bench = createBench(ctx);
  const r = bench.setTimeOfDay(0.5);
  check('a scene that can be set is set', r.ok === true && set.length === 1 && near(set[0], r.offset));
  check('and it says the time it just made', /12:00/.test(r.text), r.text);
  const bare = createBench(recordingCtx());
  const none = bare.setTimeOfDay(0.5);
  check('a scene that cannot names the function it needs, and moves nothing', none.ok === false && /setClockOffset\(ms\)/.test(none.text), none.text);
}

console.log('win_dev: the overlay switches, and fly');
{
  const dev = { on: false, debug: { chunks: false, colliders: false }, toggle() { this.on = !this.on; return this.on; }, setDebug(k, v) { if (!(k in this.debug)) return null; this.debug[k] = !!v; return this.debug[k]; } };
  const ctx = recordingCtx({ dev });
  const bench = createBench(ctx);
  const on = bench.setDebug('chunks', true);
  check('a switch goes on, on dev.js\'s own object', on.ok && dev.debug.chunks === true && bench.debug === dev.debug);
  check('and the line names who has to read it', /chunks\.js/.test(on.text), on.text);
  const off = bench.setDebug('chunks', false);
  check('and off again', off.on === false && dev.debug.chunks === false, off.text);
  const nope = bench.setDebug('wireframe', true);
  check('a switch nobody declared is refused', nope.ok === false && !('wireframe' in dev.debug), nope.text);
  const fly = bench.toggleFly();
  check('fly goes through dev.toggle, the same F1 does', fly.ok && dev.on === true);
  bench.toggleFly();
  check('and back', dev.on === false);
  const bare = createBench(recordingCtx()).toggleFly();
  check('with no dev module it refuses in words', bare.ok === false && /not wired/.test(bare.text), bare.text);
}

console.log('win_dev: the readout counts what it can reach and admits what it cannot');
{
  const ctx = recordingCtx({
    monsters: { rescan() {}, count: 7 },
    runtime: { heightAt: () => 12, sitesNear: () => [], inDungeon: true, dungeonLevel: 3, world: { stats: { loaded: 41 } } },
    sc: { dayFactor: () => 1, renderer: { info: { render: { calls: 133, triangles: 250000 } } } },
    state: { setPos() {}, touch() {}, coins: 4200 },
  });
  const r = createBench(ctx).readout(1 / 60);
  check('fps comes off the frame it was given', r.fps === 60);
  check('monsters, chunks and draw calls are read', r.monsters === 7 && r.chunks === 41 && r.calls === 133, `${r.monsters} ${r.chunks} ${r.calls}`);
  check('so is where you are and how deep', r.inDungeon === true && r.level === 3 && r.y === 12);
  check('and the purse', r.gold === 4200);
  const bare = createBench(recordingCtx()).readout(0);
  check('with nothing wired it reports null and not a zero it made up', bare.monsters === null && bare.chunks === null && bare.calls === null);
}

console.log('win_dev: the places list is drawn from the runtime, within 6 km');
{
  const asked = [];
  const ctx = recordingCtx({
    player: { pos: { x: 900, z: -300 }, yaw: 0, teleport() {} },
    runtime: {
      heightAt: () => 0,
      sitesNear: (x, z, r) => { asked.push([x, z, r]); return [{ id: 'a', name: 'Ashford', kind: 'town', x: 1000, z: -300, flatR: 46 }]; },
    },
  });
  const groups = createBench(ctx).places();
  check('it asks around the player, at 6 km', asked[0][0] === 900 && asked[0][1] === -300 && asked[0][2] === PLACE_RADIUS, asked[0].join(', '));
  check('and measures from the player, not the origin', Math.round(groups[0].rows[0].d) === 100, `${groups[0].rows[0].d}`);
  const none = createBench(recordingCtx()).places();
  check('a runtime with no sites is an empty list, not a throw', Array.isArray(none) && none.length === 0);
}

console.log('dev.js: F1 fly, and the mode that is remembered');
{
  const events = [];
  const state = createState({ storage: null });
  state.character.needsCreation = false;
  const dev = createDev({
    sc: { camera: { position: { x: 12, z: 34 } } },
    camera: { setMode: (m) => events.push(`camera:${m}`), flyUpdate: () => events.push('fly') },
    player: { setVisible: (v) => events.push(`visible:${v}`), teleport: (x, z) => events.push(`teleport:${Math.round(x)},${Math.round(z)}`) },
    hud: { setDev: (v) => events.push(`badge:${v}`), toast: (t) => events.push(`say:${t.slice(0, 12)}`) },
    runtime: { clampWalkable: (x, z) => [x, z], heightAt: () => 0 },
    state,
  });
  check('it starts off', dev.on === false);
  check('and the document says nothing about dev until the first switch', state.character.settings.dev === undefined, `state.js DEFAULT_SETTINGS has no dev key; win_settings.normalise gives it one at boot`);
  dev.toggle();
  check('F1 flies', dev.on === true && events.includes('camera:fly') && events.includes('visible:false'));
  check('the lens is up for the tools and the market', state.dev === true);
  check('and the document remembers the mode', state.character.settings.dev === true);
  dev.update(0.016);
  check('the camera is driven while it is on', events.includes('fly'));
  dev.toggle();
  check('off puts the feet on the ground under the camera', dev.on === false && events.includes('teleport:12,34'));
  check('the lens comes off', state.dev === false);
  check('and the document remembers that too', state.character.settings.dev === false);
  check('the save carries it', JSON.parse(JSON.stringify(state.character)).settings.dev === false);
  check('every switch said something', events.filter((e) => e.startsWith('say:')).length === 2);
  check('the debug switches start false and are the two the bench flips', DEBUG_FLAGS.join(',') === 'chunks,colliders' && DEBUG_FLAGS.every((k) => dev.debug[k] === false));
  check('an unknown switch is refused', dev.setDebug('wireframe', true) === null);
  check('a known one is written', dev.setDebug('colliders', true) === true && dev.debug.colliders === true);
}

console.log(`\nwin_dev: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
