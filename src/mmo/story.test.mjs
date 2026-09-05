// The Greenwold's cast and script. Run: node src/mmo/story.test.mjs
import {
  auditStory, PEOPLE, PERSON, BEATS, BEAT, BEAT_IDS, STORY_ROLES, roleOf,
  blankView, VIEW_KEYS, REALM, CELLAR_MOUTH_M, WAGON_SEEN_M, HEARTHHOME_M,
} from './story.js';
import { REALMS } from './realms.js';
import { NPCS } from './npcs.js';
import { tabsFor, stockFor } from '../game/win_talk.js';
import { layoutTown, lotOf, doorOf, REQUIRED_LOTS, lotsOverlap } from '../world/town_layout.js';
import { authoredSites, ZONE } from '../world/zones.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const PLACES = new Set(REALMS.flatMap((r) => r.places.map((p) => p.id)));
const GREENWOLD = new Set(REALMS.find((r) => r.id === 'greenwold').places.map((p) => p.id));

console.log('\nThe cast');

const stats = auditStory();
check('the audit passes on the real cast', !!stats, JSON.stringify(stats));
check('ten people and seven beats', stats.people === 10 && stats.beats === 7, `${stats.people} people, ${stats.beats} beats, ${stats.lines} lines`);

// --- every person has a role that exists ------------------------------------
{
  let bad = [];
  for (const p of PEOPLE) if (!roleOf(p.role)) bad.push(p.id);
  check('every person keeps a role something knows how to draw', bad.length === 0,
    PEOPLE.map((p) => `${p.id}:${p.role}`).join(' '));
  const inTable = PEOPLE.filter((p) => NPCS[p.role]);
  check('the three who keep a building carry a role out of npcs.js', inTable.length === 3,
    inTable.map((p) => `${p.name} is the ${NPCS[p.role].name}`).join(', '));
  const own = PEOPLE.filter((p) => !NPCS[p.role]);
  check('and everybody else carries one of this file\'s own', own.every((p) => STORY_ROLES[p.role]),
    own.map((p) => p.role).join(' '));
}

// --- every place exists, and is in the Greenwold -----------------------------
{
  check('every person stands at a place realms.js has', PEOPLE.every((p) => PLACES.has(p.place)));
  check('and every one of those places is in the Greenwold', PEOPLE.every((p) => GREENWOLD.has(p.place)),
    [...new Set(PEOPLE.map((p) => p.place))].join(' '));
  check('every beat happens at a Greenwold place', BEATS.every((b) => GREENWOLD.has(b.place)),
    BEATS.map((b) => `${b.id}@${b.place}`).join(' '));
  // the sheet's nine, and how much of it the cast actually stands on
  const used = new Set(PEOPLE.map((p) => p.place));
  check('the cast is spread over five of the Greenwold\'s nine places', used.size === 5,
    [...used].join(' '));
}

// --- the lines ---------------------------------------------------------------
{
  const lines = PEOPLE.flatMap((p) => p.lines).concat(BEATS.flatMap((b) => b.words));
  check('no em dash anywhere in the cast or the script', lines.every((l) => !l.includes('—')),
    `${lines.length} lines read`);
  check('every person has three to six lines', PEOPLE.every((p) => p.lines.length >= 3 && p.lines.length <= 6),
    PEOPLE.map((p) => p.lines.length).join(' '));
  check('every beat has two to four', BEATS.every((b) => b.words.length >= 2 && b.words.length <= 4),
    BEATS.map((b) => b.words.length).join(' '));
  // the house style: the subject is named in the first line of every card
  const noSubject = PEOPLE.filter((p) => !/[A-Z]/.test(p.lines[0].slice(0, 60)) && !/^(The|A|An|You|Your|My|I|It|Six|One|Two)/.test(p.lines[0]));
  check('every first line names something rather than opening on a mood', noSubject.length === 0,
    noSubject.map((p) => p.id).join(' '));
}

// --- the offers --------------------------------------------------------------
{
  const rows = PEOPLE.map((p) => {
    const role = roleOf(p.role);
    const tabs = tabsFor(role);
    return { p, role, tabs };
  });
  for (const r of rows) {
    const trades = r.tabs.length > 1;
    if (r.p.talkOnly) check(`${r.p.name} opens on Talk alone, and says why`, !trades && !!r.p.talkOnly, r.p.talkOnly.slice(0, 60));
    else check(`${r.p.name} has something behind the panel`, trades, r.tabs.join(' '));
  }
  const farmer = rows.find((r) => r.p.id === 'bram');
  check('Bram\'s shelf is not empty, so his Buy tab is not a lie', stockFor(farmer.role).length > 0,
    `${stockFor(farmer.role).length} rows of food`);
  const miller = rows.find((r) => r.p.id === 'ivy');
  check('Ivy Weir buys, sells and teaches', miller.tabs.includes('buy') && miller.tabs.includes('sell') && miller.tabs.includes('train'),
    miller.tabs.join(' '));
}

// --- the doors ---------------------------------------------------------------
//
// The three who keep a building have to stand at a door the town plan really
// lays out. Hearthhome's plan is read here exactly as npcs_runtime reads it.
{
  const home = authoredSites().find((s) => s.sub === 'hearthhome');
  check('Hearthhome is an authored town', !!home && home.kind === 'town');
  const plan = layoutTown(home, 0);
  check('and it has a plan', !!plan && plan.lots.length > 0, `${plan?.lots.length} lots`);
  const doorFolk = PEOPLE.filter((p) => p.at.kind === 'door');
  check('the three door people name a building every town has',
    doorFolk.every((p) => REQUIRED_LOTS.includes(p.at.lot)),
    doorFolk.map((p) => `${p.name} at the ${p.at.lot}`).join(', '));
  let stood = 0;
  for (const p of doorFolk) {
    const lot = lotOf(plan, p.at.lot);
    if (!lot) continue;
    const d = doorOf(lot, 2.0);
    if (Number.isFinite(d.x) && Number.isFinite(d.z)) stood++;
  }
  check('and the plan can give all three of them a door', stood === doorFolk.length, `${stood} of ${doorFolk.length}`);
  check('the copy of REQUIRED_LOTS in story.js is the real one',
    ['inn', 'smith', 'forge', 'healer', 'stable', 'pens', 'bank'].every((k) => REQUIRED_LOTS.includes(k))
    && REQUIRED_LOTS.length === 7, REQUIRED_LOTS.join(' '));
}

// --- the spots ---------------------------------------------------------------
//
// Hearthhome's three spot people stand in the square, off the ring the town's
// own traders take, and out of every building's footprint.
{
  const home = authoredSites().find((s) => s.sub === 'hearthhome');
  const plan = layoutTown(home, 0);
  const zone = ZONE.hearthhome;
  const spots = PEOPLE.filter((p) => p.place === 'hearthhome' && p.at.kind === 'spot').map((p) => ({
    p,
    x: zone.x + Math.cos(p.at.bearing) * p.at.out,
    z: zone.z + Math.sin(p.at.bearing) * p.at.out,
  }));
  check('three of the cast stand on the green rather than in a doorway', spots.length === 3,
    spots.map((s) => s.p.name).join(', '));
  const inSquare = spots.every((s) => Math.hypot(s.x - plan.square.x, s.z - plan.square.z) <= plan.square.r);
  check('all three stand inside the square', inSquare,
    spots.map((s) => Math.hypot(s.x - plan.square.x, s.z - plan.square.z).toFixed(1)).join(' m, ') + ` m, of ${plan.square.r} m`);
  // the town's own people take an 8 m ring (npcs_runtime.NPC_RING.town); nobody
  // may be standing on top of anybody
  const ring = 8;
  let worst = Infinity;
  for (const s of spots) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (home.facing || 0);
      const gx = zone.x + Math.cos(a) * ring, gz = zone.z + Math.sin(a) * ring;
      worst = Math.min(worst, Math.hypot(s.x - gx, s.z - gz));
    }
  }
  check('and none of them is standing on a trader', worst > 1.2, `the closest pair is ${worst.toFixed(2)} m apart`);
  let inBuilding = 0;
  for (const s of spots) {
    for (const lot of plan.lots) {
      if (lotsOverlap(lot, { x: s.x, z: s.z, w: 0.9, d: 0.9, yaw: 0 }, 0)) inBuilding++;
    }
  }
  check('and none of them is standing inside a building', inBuilding === 0, `${plan.lots.length} lots tested`);
  // and the four away from town stand on ground their place really has
  const away = PEOPLE.filter((p) => p.at.kind === 'spot' && p.place !== 'hearthhome');
  check('the four away from Hearthhome stand at a place with a position',
    away.every((p) => ZONE[p.place] && Number.isFinite(ZONE[p.place].x)),
    away.map((p) => `${p.name} at ${ZONE[p.place].name}`).join(', '));
  check('and each of them inside their own place\'s radius',
    away.every((p) => p.at.out < (ZONE[p.place].r || 1e9)),
    away.map((p) => `${p.at.out} m of ${ZONE[p.place].r}`).join(', '));
}

console.log('\nThe first hour');

// --- the beats, both directions ----------------------------------------------
{
  check('seven beats, each with an id of its own', new Set(BEAT_IDS).size === 7, BEAT_IDS.join(' '));
  check('every trigger is false on a blank view', BEATS.every((b) => !b.when(blankView())));
  // Every field a trigger reads is a field the view really has.
  const keys = new Set(VIEW_KEYS);
  check('the view names every field the runtime fills', Object.keys(blankView()).every((k) => keys.has(k)),
    VIEW_KEYS.join(' '));

  const drive = {
    arrival: (v) => { v.inHearthhome = true; },
    firststone: (v) => { v.stonesOwned = 1; },
    tithewagon: (v) => { v.wagonNear = true; },
    firstwolf: (v) => { v.wolfKilledAtNight = true; },
    cellarsmouth: (v) => { v.atCellarMouth = true; },
    oram: (v) => { v.oramDown = true; },
    chapelbell: (v) => { v.bellRung = true; },
  };
  for (const b of BEATS) {
    const on = blankView();
    on.realm = REALM;
    drive[b.id](on);
    const off = blankView();
    off.realm = REALM;
    check(`${b.id}: fires on ${b.trigger}`, b.when(on) === true);
    check(`${b.id}: and not without it`, b.when(off) === false);
    // and never anywhere but here, with the same view that fired it
    const away = { ...on, realm: 'frostreach' };
    check(`${b.id}: and never outside the Greenwold`, b.when(away) === false);
  }
}

// --- the effects -------------------------------------------------------------
{
  const withEffect = BEATS.filter((b) => b.effect);
  check('two beats change something', withEffect.length === 2, withEffect.map((b) => `${b.id}:${b.effect.kind}`).join(' '));
  check('the arrival turns the compass to the Standing Hedge',
    BEAT.arrival.effect.kind === 'waypoint' && BEAT.arrival.effect.place === 'waystones');
  check('and killing Oram hands over the Greenwold\'s gift',
    BEAT.oram.effect.kind === 'gift' && BEAT.oram.effect.gift === 'greenwold');
}

// --- the ranges the runtime measures against ---------------------------------
{
  check('the ranges are metres and are named', CELLAR_MOUTH_M === 45 && WAGON_SEEN_M === 140 && HEARTHHOME_M === 110,
    `cellar ${CELLAR_MOUTH_M} m, wagon ${WAGON_SEEN_M} m, village ${HEARTHHOME_M} m`);
  // Hearthhome's precinct is 120 m and the beat wants you inside the town
  const home = authoredSites().find((s) => s.sub === 'hearthhome');
  check('and standing in Hearthhome means inside its precinct', HEARTHHOME_M <= home.flatR,
    `${HEARTHHOME_M} m of a ${home.flatR} m precinct`);
}

console.log('\nThe audit, driven false');

// Every rule the audit states, made to fail, one at a time.
{
  const clone = () => PEOPLE.map((p) => ({ ...p, at: { ...p.at }, lines: [...p.lines] }));
  const beats = () => BEATS.map((b) => ({ ...b }));
  const throws = (people, bs, want) => {
    try { auditStory(people, bs || BEATS); return `no throw (wanted ${want})`; }
    catch (e) { return e.message.includes(want) ? null : `threw the wrong thing: ${e.message.split('\n')[1]}`; }
  };
  const cases = [
    ['a role nothing has', (ps) => { ps[0].role = 'ratcatcher'; }, 'which neither npcs.js nor this file has'],
    ['a place the world has not', (ps) => { ps[0].place = 'atlantis'; }, 'which is no place in realms.js'],
    ['a place in another realm', (ps) => { ps[0].place = 'canopycourt'; }, 'not in the Greenwold'],
    ['an em dash', (ps) => { ps[0].lines[0] = 'A line with an em dash — in it.'; }, 'em dash'],
    ['two lines', (ps) => { ps[0].lines = ['one', 'two']; }, 'wanted three to six'],
    ['a shopkeeper claiming to be talk only', (ps) => { ps[0].talkOnly = 'because'; }, 'says it is talk only and its role trades'],
    ['a person with nothing behind the panel and no reason', (ps) => { ps[1].talkOnly = null; }, 'no reason is given'],
    ['a door with nobody standing over it', (ps) => { const n = ps.find((p) => p.id === 'nan'); n.over = null; }, 'names nobody to stand over'],
    ['a door onto a building no town has', (ps) => { const n = ps.find((p) => p.id === 'nan'); n.at.lot = 'brewery'; }, 'which is not a building every town has'],
    ['a name over the wrong role', (ps) => { const n = ps.find((p) => p.id === 'nan'); n.over = 'blacksmith'; }, 'the shop and the name disagree'],
    ['a person nothing can reach', (ps) => { const s = ps.find((p) => p.id === 'sexton'); s.body = false; }, 'nothing in the game would ever reach them'],
  ];
  for (const [name, breakIt, want] of cases) {
    const ps = clone();
    breakIt(ps);
    // the sexton case only bites once his beat is gone too
    const bs = name === 'a person nothing can reach' ? beats().filter((b) => b.who !== 'sexton') : BEATS;
    const err = throws(ps, bs, want);
    check(`the audit refuses ${name}`, err === null, err || 'threw');
  }
  // and a beat that is true the moment the game boots
  const bs = beats();
  bs[0] = { ...bs[0], when: () => true };
  let caught = null;
  try { auditStory(PEOPLE, bs); } catch (e) { caught = e.message; }
  check('the audit refuses a trigger that is true on a blank view',
    !!caught && caught.includes('true on a blank view'), caught ? caught.split('\n')[1] : 'no throw');
  // and the real tables still pass, after all that mutation
  check('and the real cast is untouched by any of it', !!auditStory());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
