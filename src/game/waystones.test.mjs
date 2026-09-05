// The waystones: the sheet's one sentence, gate by gate.
// Run: node src/game/waystones.test.mjs
import {
  createWaystones, waystonesFrom, hedgeStones, twinsFor, shortRealm, bearingWord,
  whenAgain, farWords, HEDGE_R, HEDGE_STONES, TOUCH_REACH, COOLDOWN_MS,
} from './waystones.js';
import { DAY_CYCLE_MS } from './dayclock.js';
import { authoredSites, BODY_R } from '../world/zones.js';
import { REALMS } from '../mmo/realms.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SITES = authoredSites();
const STONES = waystonesFrom(SITES);
const byId = (id) => STONES.find((s) => s.id === id);

console.log('\nWhere the stones are');

check('the ring this file draws is the ring the megalith builds',
  HEDGE_R + 6 === BODY_R.waystones, `${HEDGE_R} + 6 against zones.BODY_R.waystones ${BODY_R.waystones}`);
check('sixteen stones stand in the world', STONES.length === 16,
  `${STONES.filter((s) => s.kind === 'town').length} town squares and ${STONES.filter((s) => s.kind === 'hedge').length} on the ring`);
check('the seven precinct towns each have one', STONES.filter((s) => s.kind === 'town').length === 7,
  STONES.filter((s) => s.kind === 'town').map((s) => s.place).join(' '));
check('and the Drowned Mill, which has no plan, has none',
  !STONES.some((s) => s.place === 'drownedmill'));
check('the ring holds nine', STONES.filter((s) => s.kind === 'hedge').length === HEDGE_STONES);
{
  const hedge = STONES.filter((s) => s.kind === 'hedge');
  const site = SITES.find((s) => s.sub === 'waystones');
  const radii = hedge.map((s) => Math.hypot(s.x - site.x, s.z - site.z));
  check('every one of the nine stands on the ring, to the centimetre',
    radii.every((r) => Math.abs(r - HEDGE_R) < 0.01), `${radii[0].toFixed(2)} m out, all nine`);
  const twins = new Set(hedge.map((s) => s.twin));
  check('and each is twinned with a different realm', twins.size === 9 && REALMS.every((r) => twins.has(r.id)),
    hedge.map((s) => s.name).join(', '));
  const { worst } = twinsFor(site.x, site.z);
  check('and each twin is on its own side of the ring', worst < Math.PI / 2,
    `the worst is ${(worst * 180 / Math.PI).toFixed(0)} degrees off its realm's bearing`);
  check('names a signpost could carry', shortRealm('The Saltmarch and the Thousand Isles') === 'Saltmarch'
    && shortRealm('Ember Wastes') === 'Ember Wastes');
  check('and a compass word for each', bearingWord(0) === 'east' && bearingWord(Math.PI) === 'west',
    hedge.map((s) => s.where.split(', ')[1]).join(' | '));
}
check('nothing is placed twice', new Set(STONES.map((s) => s.id)).size === STONES.length);
check('a day is the day clock\'s day', COOLDOWN_MS === DAY_CYCLE_MS, `${COOLDOWN_MS / 60000} real minutes`);
check('the words for a wait are words', whenAgain(COOLDOWN_MS) === 'in 25 minutes' && whenAgain(0) === 'now' && whenAgain(1000) === 'in under a minute',
  `${whenAgain(COOLDOWN_MS)} / ${whenAgain(1000)}`);
check('and the words for a distance are words', farWords(240) === '240 m' && farWords(3120) === '3.1 km');

// ---------------------------------------------------------------------------

const HOME = byId('way:hearthhome');
const HEDGE = byId('way:hedge:greenwold');
const FAR = byId('way:coldseat');

function harness(over = {}) {
  const said = [];
  const moved = [];
  const character = { name: 'You', ...over.character };
  const at = { x: HOME.x, z: HOME.z, ...over.at };
  const state = {
    dragon: { awake: true, name: 'Ash', grant: () => true },
    legion: false,
    now: 5_000_000,
    ...over.state,
  };
  const ways = createWaystones({
    character,
    stones: () => STONES,
    hud: { log: (t, k) => said.push([t, k]), toast: () => {} },
    dragon: () => state.dragon,
    legion: () => state.legion,
    pos: () => at,
    now: () => state.now,
    teleport: (x, z, name) => { moved.push({ x, z, name }); at.x = x; at.z = z; return true; },
  });
  return { ways, said, moved, character, at, state, last: () => (said.length ? said[said.length - 1][0] : '') };
}

console.log('\nTouching one');

{
  const h = harness({ state: { dragon: { awake: false, name: 'Ash', grant: () => true } } });
  const r = h.ways.touch();
  check('the dragon down: the stone refuses', r.ok === false && r.reason === 'asleep');
  check('and it says so, and says why', /Ash is down/.test(r.text) && /will not know you/.test(r.text), r.text);
  check('and nothing was taken', h.ways.count === 0 && h.character.waystones.owned.length === 0);
}
{
  const h = harness({ state: { dragon: null } });
  const r = h.ways.touch();
  check('no dragon at all: refused, in different words', r.ok === false && r.reason === 'no_dragon', r.text);
}
{
  const h = harness({ state: { legion: true } });
  const r = h.ways.touch();
  check('the Legion: refused', r.ok === false && r.reason === 'legion');
  check('and told what a century of trying got them', /century/.test(r.text), r.text);
}
{
  const h = harness({ at: { x: HOME.x + 200, z: HOME.z } });
  const r = h.ways.touch();
  check('nothing in reach: refused, and told where the nearest one is',
    r.ok === false && r.reason === 'no_stone' && /200 m off/.test(r.text), r.text);
  const named = h.ways.touch(HOME.id);
  check('and reaching for one by name from 200 m off is refused too',
    named.ok === false && named.reason === 'too_far' && /200 m/.test(named.text), named.text);
}
{
  const h = harness();
  const r = h.ways.touch();
  check('the dragon awake: the stone is yours', r.ok === true && h.ways.owns(HOME.id));
  check('and it says which stone and what happens next', /Hearthhome knows you/.test(r.text) && /first stone/.test(r.text), r.text);
  check('and the character is carrying it', h.character.waystones.owned.includes('way:hearthhome'));
  const again = h.ways.touch();
  check('touching it twice takes nothing twice', again.ok === false && again.reason === 'already' && h.ways.count === 1, again.text);
  // and the second stone changes the sentence, because now there is a network
  h.at.x = HEDGE.x; h.at.z = HEDGE.z;
  const two = h.ways.touch();
  check('a second stone says how many you hold', two.ok === true && /2 stones now/.test(two.text), two.text);
  check('the exact reach is measured', TOUCH_REACH === 8);
  h.at.x = FAR.x + TOUCH_REACH + 0.1; h.at.z = FAR.z;
  check('a step outside the reach refuses', h.ways.touch(FAR.id).reason === 'too_far' && !h.ways.owns(FAR.id));
  h.at.x = FAR.x + TOUCH_REACH - 0.1;
  check('and a step inside it does not', h.ways.touch().ok === true && h.ways.owns(FAR.id));
}

console.log('\nTravelling');

{
  const h = harness();
  h.ways.touch();                              // Hearthhome
  h.at.x = HEDGE.x; h.at.z = HEDGE.z;
  h.ways.touch();                              // the Greenwold Stone
  h.at.x = HOME.x; h.at.z = HOME.z;

  const notOffered = h.ways.destinations(HOME.id).map((d) => d.stone.id);
  check('a stone you do not own is not offered', !notOffered.includes(FAR.id) && notOffered.includes(HEDGE.id),
    notOffered.join(' '));
  check('and neither is the one you are standing on', !notOffered.includes(HOME.id));
  const refused = h.ways.travel(FAR.id);
  check('and asking for one anyway refuses with words', refused.ok === false && refused.reason === 'unowned_to'
    && /only answers a stone you have touched/.test(refused.text), refused.text);
  check('and nothing moved', h.moved.length === 0);

  const go = h.ways.travel(HEDGE.id);
  check('two owned stones: it carries you', go.ok === true && h.moved.length === 1);
  check('and the teleport really happened, at the far stone\'s own metres',
    Math.abs(h.moved[0].x - HEDGE.x) < 1e-9 && Math.abs(h.moved[0].z - HEDGE.z) < 1e-9,
    `${h.moved[0].x.toFixed(1)}, ${h.moved[0].z.toFixed(1)}`);
  check('and it says where from, where to, how far and when again',
    /Hearthhome carries you to the Greenwold Stone/.test(go.text) && /km|m /.test(go.text) && /25 minutes/.test(go.text), go.text);

  // the cooldown, on the stone you LEFT
  check('the stone you left is spent', h.ways.cooldownLeft(HOME.id) > 0, `${(h.ways.cooldownLeft(HOME.id) / 60000).toFixed(1)} minutes left`);
  check('and the stone you arrived at is not', h.ways.cooldownLeft(HEDGE.id) === 0);

  // a second travel from the same stone inside a day
  h.at.x = HOME.x; h.at.z = HOME.z;
  h.state.now += 10 * 60_000;                   // ten minutes later
  const twice = h.ways.travel(HEDGE.id);
  check('a second run out of the same stone inside a day refuses', twice.ok === false && twice.reason === 'cooldown');
  check('and says how long is left', /answer again in 15 minutes/.test(twice.text), twice.text);
  check('and nothing moved for it', h.moved.length === 1);

  // and out the other side of the day it works again
  h.state.now += COOLDOWN_MS;
  const later = h.ways.travel(HEDGE.id);
  check('and a day later it carries you again', later.ok === true && h.moved.length === 2, later.text);
}
{
  const h = harness({ state: { legion: true }, character: { waystones: { owned: ['way:hearthhome', 'way:coldseat'], used: {} } } });
  const r = h.ways.travel(FAR.id);
  check('the Legion may not travel either, with two stones in hand', r.ok === false && r.reason === 'legion', r.text);
  check('and it moved nobody', h.moved.length === 0);
}
{
  const h = harness({ at: { x: 0, z: 0 } });
  const r = h.ways.travel(HEDGE.id);
  check('you cannot travel from open country', r.ok === false && r.reason === 'not_at_stone', r.text);
}
{
  const h = harness({ character: { waystones: { owned: ['way:hearthhome'], used: {} } } });
  const r = h.ways.travel(HOME.id);
  check('a stone will not carry you to itself', r.ok === false && r.reason === 'same', r.text);
}
{
  const h = harness({ character: { waystones: { owned: ['way:hedge:greenwold'], used: {} } } });
  const r = h.ways.travel(HEDGE.id);
  check('and it will not carry you from a stone you have not touched', r.ok === false && r.reason === 'unowned_from', r.text);
}

console.log('\nThe save');

{
  const h = harness();
  h.ways.touch();
  h.at.x = HEDGE.x; h.at.z = HEDGE.z;
  h.ways.touch();
  h.at.x = HOME.x; h.at.z = HOME.z;
  h.ways.travel(HEDGE.id);
  // the same document, handed to a runtime built from nothing, the way a reload
  // hands it back
  const doc = JSON.parse(JSON.stringify(h.character));
  const moved = [];
  const again = createWaystones({
    character: doc,
    stones: () => STONES,
    hud: { log: () => {} },
    dragon: () => ({ awake: true, name: 'Ash' }),
    pos: () => ({ x: HOME.x, z: HOME.z }),
    now: () => h.state.now,
    teleport: (x, z) => { moved.push({ x, z }); return true; },
  });
  check('a rebuilt runtime still holds the two stones', again.count === 2, again.owned().map((s) => s.name).join(', '));
  check('and the spent stone is still spent', again.cooldownLeft(HOME.id) > 0,
    `${(again.cooldownLeft(HOME.id) / 60000).toFixed(1)} minutes`);
  const r = again.travel(HEDGE.id);
  check('so the refusal survives a reload', r.ok === false && r.reason === 'cooldown', r.text);
  // a save whose clock is from another session must not leave a stone cold for ever
  doc.waystones.used[HOME.id] = h.state.now + 10 * COOLDOWN_MS;
  const third = createWaystones({
    character: doc, stones: () => STONES, hud: { log: () => {} },
    dragon: () => ({ awake: true }), pos: () => ({ x: HOME.x, z: HOME.z }),
    now: () => h.state.now, teleport: () => true,
  });
  check('and a clock that has gone backwards does not freeze a stone', third.cooldownLeft(HOME.id) === 0);
}
{
  const junk = { waystones: { owned: ['way:hearthhome', 7, null], used: { 'way:hearthhome': 'soon' } } };
  const w = createWaystones({ character: junk, stones: () => STONES, hud: { log: () => {} }, now: () => 0 });
  check('a half written save is read defensively', w.count === 1 && w.cooldownLeft('way:hearthhome') === 0,
    JSON.stringify(junk.waystones));
}

console.log('\nEvery refusal said something');

{
  const h = harness({ state: { dragon: null } });
  const before = h.said.length;
  h.ways.touch();
  h.ways.travel(FAR.id);
  h.ways.travel('way:nowhere');
  check('three refusals, three lines', h.said.length - before === 3, h.said.slice(before).map((s) => s[0].slice(0, 40)).join(' | '));
  check('and every one of them is marked bad', h.said.slice(before).every((s) => s[1] === 'bad'));
  check('and none of them has an em dash', h.said.every((s) => !s[0].includes('—')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
