// The Greenwold's first hour, running. Run: node src/game/story_runtime.test.mjs
import * as THREE from 'three';
import { createStory, spotFor, plateText, NEAR_RING, CHECK_MS } from './story_runtime.js';
import { PEOPLE, PERSON, BEATS, BEAT_IDS, REALM, HEARTHHOME_M, CELLAR_MOUTH_M, WAGON_SEEN_M } from '../mmo/story.js';
import { ZONE, authoredSites } from '../world/zones.js';
import { NPCS } from '../mmo/npcs.js';
import { createWaystones, waystonesFrom } from './waystones.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const HOME = ZONE.hearthhome;
const CELLARS = ZONE.oldcellars;
const ROAD = ZONE.kingsroad;

/**
 * The runtime with a fake world behind it. Nothing is stubbed that the runtime
 * makes a decision with: the places are the real `zones.ZONE`, the cast is the
 * real `story.js`, and the beats are the real beats.
 */
function harness(over = {}) {
  const said = [];        // [text, kind] in the order they were said
  const toasted = [];
  const world = {
    realm: REALM,
    inDungeon: false,
    pos: { x: HOME.x, z: HOME.z },
    day: 1,
    stones: 0,
    events: [],
    npcs: [],
    ...over.world,
  };
  const character = { name: 'You', ...over.character };
  const story = createStory({
    character,
    runtime: {
      get inDungeon() { return world.inDungeon; },
      field: { sampleAt: () => ({ realm: world.realm }) },
      heightAt: () => 0,
    },
    hud: { log: (t, k) => said.push([t, k]), toast: (t, k) => toasted.push([t, k]) },
    scene: null, camera: null, root: null,
    npcs: { list: () => world.npcs },
    events: () => ({ active: () => world.events }),
    waystones: { get count() { return world.stones; } },
    realmAt: () => world.realm,
    pos: () => world.pos,
    dayFactor: () => world.day,
  });
  return { story, world, character, said, toasted, text: () => said.map((s) => s[0]).join(' ') };
}

console.log('\nThe view, built off the running world');

{
  const h = harness();
  let v = h.story.viewNow();
  check('standing in the middle of Hearthhome is standing in Hearthhome', v.inHearthhome === true && v.realm === REALM);
  h.world.pos = { x: HOME.x + HEARTHHOME_M + 5, z: HOME.z };
  check('and five metres past the edge of it is not', h.story.viewNow().inHearthhome === false,
    `${HEARTHHOME_M} m is the edge`);
  h.world.pos = { x: HOME.x + HEARTHHOME_M - 5, z: HOME.z };
  check('and five metres inside it is', h.story.viewNow().inHearthhome === true);

  h.world.pos = { x: CELLARS.x, z: CELLARS.z };
  check('the mouth of the Old Cellars is found by standing at it', h.story.viewNow().atCellarMouth === true);
  h.world.pos = { x: CELLARS.x + CELLAR_MOUTH_M + 1, z: CELLARS.z };
  check('and not from a metre outside the reach', h.story.viewNow().atCellarMouth === false, `${CELLAR_MOUTH_M} m`);

  h.world.pos = { x: ROAD.x, z: ROAD.z };
  h.world.events = [{ id: 'tithewagon', x: ROAD.x + 10, z: ROAD.z }];
  check('the wagon is seen when it is on the road you are on', h.story.viewNow().wagonNear === true);
  h.world.events = [{ id: 'tithewagon', x: ROAD.x + WAGON_SEEN_M + 10, z: ROAD.z }];
  check('and not from over the hill', h.story.viewNow().wagonNear === false, `${WAGON_SEEN_M} m`);
  h.world.events = [{ id: 'bonewind', x: ROAD.x, z: ROAD.z }];
  check('and another event standing on the same spot is not the wagon', h.story.viewNow().wagonNear === false);

  h.world.stones = 2;
  check('the stones you hold are counted, not guessed', h.story.viewNow().stonesOwned === 2);

  h.world.inDungeon = true;
  h.world.pos = { x: HOME.x, z: HOME.z };
  check('underground, no place on the surface is being stood in',
    h.story.viewNow().inHearthhome === false && h.story.viewNow().atCellarMouth === false);
}

console.log('\nThe deaths that are triggers');

{
  const h = harness();
  h.world.day = 1;
  h.story.onDeath('wolf');
  check('a wolf killed at noon is not a wolf killed at night', h.story.viewNow().wolfKilledAtNight === false);
  h.world.day = 0.1;
  h.story.onDeath('wolf');
  check('a wolf killed after dark is', h.story.viewNow().wolfKilledAtNight === true);
  check('and Oram has not died of it', h.story.viewNow().oramDown === false);
  h.story.onDeath('boar', { night: true });
  check('and a boar is not a wolf', h.story.viewNow().oramDown === false);
  h.story.onDeath('oramBlackhand');
  check('Sergeant Oram Blackhand going down is its own latch', h.story.viewNow().oramDown === true);
  check('the bell has not been rung', h.story.viewNow().bellRung === false);
  h.story.ringChapelBell();
  check('and ringing it says so', h.story.viewNow().bellRung === true);
}

console.log('\nEvery beat, driven true and false');

// One harness per beat: drive the world to the trigger, check the words, then
// check that nothing at all is said the second time.
const drive = {
  arrival: (h) => { h.world.pos = { x: HOME.x, z: HOME.z }; },
  firststone: (h) => { h.world.stones = 1; },
  tithewagon: (h) => { h.world.pos = { x: ROAD.x, z: ROAD.z }; h.world.events = [{ id: 'tithewagon', x: ROAD.x, z: ROAD.z }]; },
  firstwolf: (h) => { h.world.day = 0.1; h.story.onDeath('wolf'); },
  cellarsmouth: (h) => { h.world.pos = { x: CELLARS.x, z: CELLARS.z }; },
  oram: (h) => { h.story.onDeath('oramBlackhand'); },
  chapelbell: (h) => { h.story.ringChapelBell(); },
};
// Where each beat is NOT: a place in the Greenwold with nothing happening.
const NOWHERE = { x: ZONE.beechhangar.x, z: ZONE.beechhangar.z };

for (const beat of BEATS) {
  const h = harness();
  h.world.pos = { ...NOWHERE };
  h.story.update(0.1, 1000);
  check(`${beat.id}: says nothing before its trigger`, h.said.length === 0, h.text().slice(0, 60));
  drive[beat.id](h);
  h.story.update(0.1, 1000 + CHECK_MS + 1);
  const mine = h.said.filter((s) => beat.words.includes(s[0]));
  check(`${beat.id}: says all of its lines when it fires`, mine.length === beat.words.length,
    `${mine.length} of ${beat.words.length}`);
  check(`${beat.id}: and the first of them is toasted where a player would see it`,
    h.toasted.length >= 1 && h.toasted[0][0] === beat.words[0]);
  check(`${beat.id}: and it is written down`, h.story.said(beat.id) && h.character.story.beats.includes(beat.id),
    h.character.story.beats.join(' '));
  const before = h.said.length;
  h.story.update(0.1, 1000 + CHECK_MS * 4);
  h.story.update(0.1, 1000 + CHECK_MS * 8);
  check(`${beat.id}: and never said again`, h.said.length === before);
}

console.log('\nOnce per character, over a reload');

{
  const h = harness();
  h.story.update(0.1, 1000);                       // arrival: standing in Hearthhome
  check('the arrival fired', h.story.said('arrival'));
  const doc = JSON.parse(JSON.stringify(h.character));
  const said2 = [];
  const again = createStory({
    character: doc,
    runtime: { inDungeon: false, field: { sampleAt: () => ({ realm: REALM }) }, heightAt: () => 0 },
    hud: { log: (t) => said2.push(t), toast: () => {} },
    scene: null, root: null,
    npcs: { list: () => [] },
    events: () => ({ active: () => [] }),
    waystones: { count: 0 },
    realmAt: () => REALM,
    pos: () => ({ x: HOME.x, z: HOME.z }),
    dayFactor: () => 1,
  });
  again.update(0.1, 1000);
  again.update(0.1, 9000);
  check('a runtime rebuilt on the same document says nothing again', said2.length === 0, said2.join(' | '));
  check('and still knows it happened', again.said('arrival') && doc.story.beats.includes('arrival'));
  // and a fresh character hears it for the first time
  const said3 = [];
  const fresh = createStory({
    character: {},
    runtime: { inDungeon: false, field: { sampleAt: () => ({ realm: REALM }) }, heightAt: () => 0 },
    hud: { log: (t) => said3.push(t), toast: () => {} },
    scene: null, root: null, npcs: { list: () => [] },
    events: () => ({ active: () => [] }), waystones: { count: 0 },
    realmAt: () => REALM, pos: () => ({ x: HOME.x, z: HOME.z }), dayFactor: () => 1,
  });
  fresh.update(0.1, 1000);
  check('while a new character hears it', said3.length >= 3, `${said3.length} lines`);
}

console.log('\nAnd never outside the Greenwold');

{
  // Every trigger true at once, in another realm. Nothing may fire.
  const h = harness({ world: { realm: 'frostreach' } });
  h.world.stones = 3;
  h.world.events = [{ id: 'tithewagon', x: HOME.x, z: HOME.z }];
  h.world.day = 0.1;
  h.story.onDeath('wolf');
  h.story.onDeath('oramBlackhand');
  h.story.ringChapelBell();
  h.story.update(0.1, 1000);
  h.story.update(0.1, 5000);
  check('seven triggers true in Frostreach and not one beat fires',
    h.said.length === 0 && h.character.story.beats.length === 0, h.text().slice(0, 80));
  // and the same world, back home. Six of the seven, because the seventh wants
  // the player standing at a mouth 387 m from the middle of the village and a
  // player is only ever in one place.
  h.world.realm = REALM;
  h.story.update(0.1, 9000);
  const six = BEAT_IDS.filter((id) => id !== 'cellarsmouth');
  check('and the same world in the Greenwold fires six of the seven',
    six.every((id) => h.character.story.beats.includes(id)) && h.character.story.beats.length === 6,
    h.character.story.beats.join(' '));
  const words = BEATS.filter((b) => b.id !== 'cellarsmouth').reduce((a, b) => a + b.words.length, 0);
  check('and says all of it, with a line for the waypoint effect', h.said.length === words + 1,
    `${h.said.length} lines against ${words} of script and 1 effect`);
  // and the seventh, at the mouth it wants
  h.world.pos = { x: CELLARS.x, z: CELLARS.z };
  h.story.update(0.1, 13000);
  check('and walking to the Old Cellars fires the seventh',
    h.character.story.beats.length === BEAT_IDS.length, h.character.story.beats.join(' '));
}

console.log('\nThe waypoint effect');

{
  const h = harness();
  h.story.update(0.1, 1000);                       // arrival
  check('the arrival turns the compass to the ring',
    !!h.character.waypoint && Math.abs(h.character.waypoint.x - ZONE.waystones.x) < 1e-9,
    JSON.stringify(h.character.waypoint));
  check('and says it did', h.text().includes('Your compass turns to The Standing Hedge'), h.said[h.said.length - 1][0]);
}
{
  const h = harness({ character: { waypoint: { x: 10, z: 10, name: 'a mark of my own' } } });
  h.story.update(0.1, 1000);
  check('a compass already set is not turned under the player', h.character.waypoint.x === 10);
  check('and it says that too, rather than nothing', h.text().includes('is not marked over it'),
    h.said[h.said.length - 1][0]);
}
{
  const h = harness();
  h.story.onDeath('oramBlackhand');
  h.story.update(0.1, 1000);
  check('killing Oram still fires the beat', h.story.said('oram'));
  check('and it no longer grants or names Wyrmsoul',
    !h.text().includes('Wyrmsoul') && !h.text().includes('hatchling'), h.text());
}

console.log('\nThe names on the three doors');

{
  const home = authoredSites().find((s) => s.sub === 'hearthhome');
  const court = authoredSites().find((s) => s.sub === 'canopycourt');
  const rec = (roleId, site, name) => ({ id: `${site.id}:${roleId}`, role: NPCS[roleId], site, personName: name, plate: { textContent: `${name}, the ${NPCS[roleId].name}` } });
  const h = harness();
  h.world.npcs = [
    rec('innkeeper', home, 'Bess'),
    rec('blacksmith', home, 'Cobb'),
    rec('healer', home, 'Nell'),
    rec('provisioner', home, 'Tam'),
    rec('innkeeper', court, 'Lark'),
  ];
  const n = h.story.nameTheDoors();
  check('three of Hearthhome\'s people are given their names', n === 3, `${n} named`);
  const inn = h.world.npcs[0];
  check('the Bracken Arms is kept by Nan Ockley', inn.personName === 'Nan Ockley' && inn.story?.id === 'nan');
  check('and her plate says so', inn.plate.textContent === plateText(PERSON.nan), inn.plate.textContent);
  check('and the shop under the name is still the Innkeeper\'s', inn.role === NPCS.innkeeper);
  check('the forge is Cobb Ashby\'s', h.world.npcs[1].personName === 'Cobb Ashby');
  check('the healer is Alys Fenn', h.world.npcs[2].personName === 'Alys Fenn');
  check('the provisioner is left alone, because nobody was written for that door',
    h.world.npcs[3].personName === 'Tam' && !h.world.npcs[3].story);
  check('and the Canopy Court\'s innkeeper is left alone, because Nan is not there',
    h.world.npcs[4].personName === 'Lark' && !h.world.npcs[4].story);
  check('and the three are remembered as met', ['nan', 'cobb', 'alys'].every((id) => h.character.story.met.includes(id)),
    h.character.story.met.join(' '));
  const again = h.story.nameTheDoors();
  check('naming them twice renames nobody', again === 3 && h.character.story.met.length === 3);
}

console.log('\nWhere the six stand');

{
  for (const p of PEOPLE) {
    if (p.at.kind !== 'spot') continue;
    const spot = spotFor(p);
    const zone = ZONE[p.place];
    const d = Math.hypot(spot.x - zone.x, spot.z - zone.z);
    check(`${p.name} stands ${p.at.out} m out from the middle of ${zone.name}`, Math.abs(d - p.at.out) < 1e-9,
      `${d.toFixed(3)} m`);
  }
  const home = authoredSites().find((s) => s.sub === 'hearthhome');
  const nan = spotFor(PERSON.nan, { site: home });
  check('and Nan Ockley\'s door is a real door on the real plan', !!nan && Number.isFinite(nan.x) && nan.at === 'inn',
    `${nan.x.toFixed(1)}, ${nan.z.toFixed(1)}`);
  check('a door person with no town handed in gets no spot rather than a wrong one', spotFor(PERSON.nan) === null);

  const h = harness();
  h.story.update(0.1, 1000);
  const near = h.story.people().map((r) => r.id).sort();
  check('standing in Hearthhome, the three of the green are standing there',
    near.join(' ') === 'bram pip wynn', near.join(' '));
  check('and nobody else is built', h.story.count === 3);
  const rec = h.story.person('bram');
  check('each of them is a record the Talk panel can read',
    rec.role.id === 'farmer' && rec.personName === 'Bram Haywood' && rec.story === PERSON.bram && rec.site.sub === 'hearthhome');
  h.world.pos = { x: ZONE.millrun.x, z: ZONE.millrun.z };
  h.story.update(0.1, 2000);
  check('walking to the mill takes the three down and stands Ivy Weir up',
    h.story.people().map((r) => r.id).join(' ') === 'ivy', h.story.people().map((r) => r.id).join(' '));
  h.world.pos = { x: 6000, z: 6000 };
  h.story.update(0.1, 3000);
  check('and out of the realm nobody is standing anywhere', h.story.count === 0);
  check('the ring they are raised in is the townsfolk\'s own', NEAR_RING === 320);
}

console.log('\nThe join: a hand on a real stone rings the beat');

// The whole path, with the real waystone runtime under the real story runtime
// and the real sixteen stones: standing at one of the Standing Hedge's nine,
// touching it, and the first hour hearing about it.
{
  const stones = waystonesFrom(authoredSites());
  const hedge = stones.find((s) => s.id === 'way:hedge:greenwold');
  const said = [];
  const character = { name: 'You' };
  const at = { x: hedge.x, z: hedge.z };
  const hud = { log: (t) => said.push(t), toast: () => {} };
  const ways = createWaystones({
    character, stones: () => stones, hud,
    pos: () => at, now: () => 1000, teleport: () => true,
  });
  const story = createStory({
    character,
    runtime: { inDungeon: false, field: { sampleAt: () => ({ realm: REALM }) }, heightAt: () => 0 },
    hud, scene: null, root: null, npcs: { list: () => [] },
    events: () => ({ active: () => [] }),
    waystones: ways,
    realmAt: () => REALM, pos: () => at, dayFactor: () => 1,
  });
  story.update(0.1, 1000);
  check('standing at a stone on the ring is not standing in the village', !story.said('arrival'));
  const touched = ways.touch();
  check('the stone on the ring answers a hand', touched.ok === true, touched.text);
  check('and the view has counted it', story.viewNow().stonesOwned === 1);
  story.checkBeats(2000, true);
  check('and the beat about the first stone fires off the real count', story.said('firststone'),
    character.story.beats.join(' '));
  check('and it is Old Wynn who was telling the truth', said.some((t) => /Old Wynn was telling the truth/.test(t)));
}

console.log('\nA click with nothing under it');

{
  const h = harness();
  h.story.update(0.1, 1000);
  check('a click on nothing is nothing', h.story.click(null, { x: 0, z: 0 }, { open: () => true }) === null);
  check('and the nearest person to a spot a kilometre off is nobody',
    h.story.nearest({ x: 9000, z: 9000 }) === null);
  check('and the one you are standing on is somebody',
    h.story.nearest(spotFor(PERSON.bram))?.npc?.id === 'bram');
}

console.log('story: in a sculpt world the cast stands only where a space places them');
{
  // the harness's runtime field, with the sculpt header on
  const sculptWorld = { field: { sampleAt: () => ({ realm: REALM }), sculpt: { height: 6, ground: 'grass' } }, heightAt: () => 0, get inDungeon() { return false; } };
  const mk = (spaces) => createStory({
    character: { name: 'You' }, runtime: sculptWorld, hud: { log() {}, toast() {} },
    scene: null, npcs: null, events: () => [], waystones: { count: 0 },
    realmAt: () => REALM, pos: () => ({ x: HOME.x, z: HOME.z }), dayFactor: () => 1, root: null, buildCharacter: () => ({ group: new THREE.Group(), parts: {}, setAppearance() {}, update() {}, dispose() {} }),
    spaces,
  });
  const none = mk({});
  none.update(0.016, 1000);
  check('with no space naming them, nobody from the cast stands', (none.count ?? none.live ?? 0) === 0 || !none.nearest || none.nearest({ x: HOME.x, z: HOME.z }) === null, 'no bodies');
  const placed = mk({ mine: { id: 'mine', at: { x: HOME.x, z: HOME.z }, people: [{ name: PERSON.bram.name, role: 'farmer', x: 3, z: 4, yaw: 90 }] } });
  placed.update(0.016, 1000);
  const near = placed.nearest ? placed.nearest({ x: HOME.x + 3, z: HOME.z + 4 }) : null;
  check('and a space that places Bram by name stands him at that spot', !!near && near.npc && near.npc.id === 'bram', near && near.npc ? near.npc.id : 'nobody');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
