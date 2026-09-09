// Sound system, in node. Run: node src/game/app/systems/sound.test.mjs

globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'performance', { value: { now: () => 1000 }, writable: true, configurable: true });

import { createAudio, bedFor, LIBRARY_DIR, SOURCE_MAX_DIST } from '../../audio.js';
import { sound, createShotScheduler, soundContext, sourcePositions, nearRoad, hedgeBlocked } from './sound.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function fakeKit() {
  const built = [], played = [];
  const make = (url) => {
    const el = {
      url, volume: 1, playbackRate: 1, loop: false, paused: true, plays: 0, listeners: {},
      play() { this.plays++; this.paused = false; played.push(this); return { catch() {} }; },
      pause() { this.paused = true; },
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      removeEventListener() {},
      fire(t) { for (const fn of (this.listeners[t] || []).slice()) fn(); },
    };
    built.push(el);
    return el;
  };
  return { make, built, played, reset() { built.length = 0; played.length = 0; } };
}

function ctxRig(over = {}) {
  const pos = over.pos || { x: 449.55, z: -144.61 };
  const sample = over.sample || { h: 6, biome: 'meadow', water: false, river: 0 };
  const runtime = {
    inDungeon: !!over.inDungeon,
    field: { chunk: 64, seaLevel: 0, sampleAt: () => sample },
    flora: { treesFor: () => over.trees || [] },
    sitesNear: () => over.sites || [],
  };
  const world = {
    runtime,
    weather: { state: { rain: over.rain || 0, snow: over.snow || 0 } },
    underwater: !!over.underwater,
    nearestSettlement: () => over.settlement === false ? null : (over.settlement || { x: 449.55, z: -144.61, flatR: 76 }),
  };
  const audio = over.audio || createAudio({ makeElement: fakeKit().make, storage: null, listen: false, fadeMs: 0 });
  const systems = new Map([
    ['world', world],
    ['player', { pos }],
    ['ui', {}],
    ['world_life', { stations: { nearest: () => over.station || null } }],
    ['combat', { monsters: { all: () => [] } }],
  ]);
  return {
    audio,
    sc: { clockOffset: 0 },
    get: (name) => systems.get(name),
    has: (name) => systems.has(name),
    isNight: (now) => !!over.night || now === over.nightAt,
  };
}

// ---- context --------------------------------------------------------------
{
  const c = soundContext(ctxRig(), { worldNow: 1000 }, { x: 449.55, z: -144.61 });
  check('standing inside a settlement uses flatR plus 20 m', !!c.settlement);
  const away = soundContext(ctxRig({ pos: { x: 600, z: -144.61 } }), { worldNow: 1000 }, { x: 600, z: -144.61 });
  check('outside flatR plus 20 m is open country', !away.settlement);
  const rainy = soundContext(ctxRig({ rain: 0.4, trees: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }], settlement: false, pos: { x: 0, z: 0 } }), { worldNow: 1000 }, { x: 0, z: 0 });
  check('rain and three nearby trees become the rain-under-trees bed', /amb-rain-under-trees/.test(bedFor(rainy)), bedFor(rainy));
  const mine = soundContext(ctxRig({ settlement: false, sites: [{ kind: 'mine', x: 0, z: 0 }] }), { worldNow: 1000 }, { x: 0, z: 0 });
  check('a nearby mine site sets the mine-yard flag', mine.nearMine === true);
  const water = soundContext(ctxRig({ settlement: false, sample: { h: 2, biome: 'meadow', water: true, river: 0 } }), { worldNow: 1000 }, { x: 0, z: 0 });
  check('standing in shallow water sets the wading flag', water.wading === true);
  const faunaCtx = ctxRig({ settlement: false });
  faunaCtx.get('combat').monsters = { all: () => [{ id: 'boar', pos: { x: 3, z: 0 } }, { id: 'goose', pos: { x: 30, z: 0 } }] };
  const fauna = soundContext(faunaCtx, { worldNow: 1000 }, { x: 0, z: 0 });
  check('nearby boar, badger and goose are read from the combat monster runtime', fauna.nearFauna.join(',') === 'boar', fauna.nearFauna.join(','));
  check('a Greenwold route is recognised as a road', nearRoad(456, -139, 8) === true);
  check('a point well away from all routes is not a road', nearRoad(9000, 9000, 8) === false);
}

// ---- scheduler through the real audio pool path ---------------------------
{
  const k = fakeKit();
  const audio = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0, random: () => 0 });
  audio.unlock();
  audio.setListener(0, 0);
  const s = createShotScheduler(audio, { random: () => 0 });
  for (let i = 0; i < 8; i++) s.trigger('owl', { x: 0, z: 0 });
  const owl = k.built.filter((e) => /os-owl-call/.test(e.url)).map((e) => e.url);
  let repeated = false;
  for (let i = 1; i < owl.length; i++) if (owl[i] === owl[i - 1]) repeated = true;
  check('the scheduler path never repeats the same pool variant running', !repeated, owl.join(' '));

  k.reset();
  s.step({ x: 0, z: 0, now: 1000, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false });
  s.step({ x: 0, z: 0, now: 2000, night: false, biome: 'meadow', treeCover: false, rainValue: 0.4, inDungeon: false });
  check('rain beginning fires distant thunder when no warning state exists', k.built.some((e) => /os-distant-thunder/.test(e.url)), k.built.map((e) => e.url).join(' '));

  k.reset();
  s.step({ x: 0, z: 0, now: 3000, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false });
  s.step({ x: 2, z: 0, now: 3016, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, inField: true });
  check('a field stride fires wheat walk through the scheduler', k.built.some((e) => /os-wheat-walk/.test(e.url)));
  k.reset();
  s.step({ x: 4, z: 0, now: 4000, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, wading: true });
  check('a wading stride fires splash through the scheduler', k.built.some((e) => /os-splash-wade/.test(e.url)));
  k.reset();
  // a hedge pushes back with a sound, once a second while you keep walking into it
  const hedgeBefore = k.built.filter((e) => /os-hedge-push/.test(e.url)).length;
  s.step({ x: 4, z: 0, now: 4500, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, hedgeBlocked: true });
  s.step({ x: 4, z: 0, now: 4516, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, hedgeBlocked: true });
  check('walking into a hedge fires the push', k.built.filter((e) => /os-hedge-push/.test(e.url)).length === hedgeBefore + 1);
  s.step({ x: 4, z: 0, now: 4700, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, hedgeBlocked: true });
  check('and not again within the second', k.built.filter((e) => /os-hedge-push/.test(e.url)).length === hedgeBefore + 1);
  const fakeCtx = { get: (id) => (id === 'world' ? { runtime: { physical: { at: (x) => (x > 100 ? { model: 'hedge_4m' } : { model: 'wall_stone' }) } } } : null) };
  const rigAt = (x) => ({ rig: { state: { blocked: true, blockedAt: { x, z: 0 }, y: 0 } } });
  check('hedgeBlocked reads the collider the refused step wanted to enter, hedge yes, wall no',
    hedgeBlocked(fakeCtx, rigAt(120), { y: 0 }) === true && hedgeBlocked(fakeCtx, rigAt(50), { y: 0 }) === false
    && hedgeBlocked(fakeCtx, { rig: { state: { blocked: false, blockedAt: null } } }, { y: 0 }) === false);
  s.step({ x: 4, z: 0, now: 5000, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, gateNear: true });
  s.step({ x: 4, z: 0, now: 5016, night: false, biome: 'meadow', treeCover: false, rainValue: 0, inDungeon: false, gateNear: true });
  check('passing into gate range fires one swing, not one per frame', k.built.filter((e) => /os-gate-swing/.test(e.url)).length === 1);
  audio.dispose();
}

// ---- point sources and system update --------------------------------------
{
  const k = fakeKit();
  const audio = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0 });
  audio.unlock();
  audio.music.start();
  audio.setListener(0, 0);
  const near = audio.source.update('mill', `${LIBRARY_DIR}src-mill-wheel.mp3`, { x: 4, z: 0 });
  check('a source in range plays', near.inRange === true && near.el.plays === 1);
  const far = audio.source.update('mill', `${LIBRARY_DIR}src-mill-wheel.mp3`, { x: SOURCE_MAX_DIST + 1, z: 0 });
  check('a source past range is paused rather than left at zero volume', far.inRange === false && far.el.paused === true && far.volume === 0);
  audio.dispose();
}

{
  const k = fakeKit();
  const audio = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0 });
  audio.unlock();
  audio.music.start();
  audio.setListener(449.55, -144.61);
  const ctx = ctxRig({ audio });
  const inst = sound.create(ctx);
  inst.update({ worldNow: 1000, now: 1000, centre: { x: 449.55, z: -144.61 } });
  check('the system writes the settlement music context into audio.js', audio.music.kind === 'settlementDay', audio.music.kind);
  check('the system writes the chosen ambience bed into audio.js', /amb-village-day/.test(audio.music.ambience.url), audio.music.ambience.url);
  check('the authored inn and mill positions are derived from space piece offsets',
    sourcePositions(ctx, { x: 449.55, z: -144.61 }).some((s) => s.id === 'tavern' && /space piece/.test(s.how))
    && sourcePositions(ctx, { x: -1001, z: -336 }).some((s) => s.id === 'mill' && /space piece/.test(s.how)));
  audio.dispose();
}


// Weather sound follows the same outdoor state as the particle renderer.
{
  const pos={x:0,z:0};
  const snow=soundContext(ctxRig({snow:.8,settlement:false,pos}),{worldNow:1000},pos);
  check('snowfall reaches the audio context without becoming rain',snow.snowing && !snow.raining && snow.rainValue===0);
  check('snowfall does not choose a rain recording',!bedFor(snow).includes('amb-rain'));
  for(const shelter of ['inDungeon','underwater']) {
    const c=soundContext(ctxRig({[shelter]:true,rain:.8,snow:.8,pos}),{worldNow:1000},pos);
    check(`${shelter} suppresses outdoor rain and snow audio`,!c.raining && !c.snowing && c.rainValue===0 && c.snowValue===0);
    if(shelter==='inDungeon') check('the mine ambience wins over weather and a nearby settlement',bedFor(c).endsWith('amb-mine-inside.mp3'));
    const k=fakeKit(),audio=createAudio({makeElement:k.make,storage:null,listen:false,fadeMs:0,random:()=>0});
    audio.unlock();audio.setListener(0,0);
    const scheduler=createShotScheduler(audio,{random:()=>0});
    scheduler.step({...c,now:0,rainValue:0});
    scheduler.step({...c,now:70000,rainValue:.8});
    check(`${shelter} does not play thunder or outdoor wind`,!k.built.some(e=>/os-(distant-thunder|wind-gust)/.test(e.url)));
    audio.dispose();
  }
  const k=fakeKit(),audio=createAudio({makeElement:k.make,storage:null,listen:false,fadeMs:0,random:()=>0});
  audio.unlock();audio.setListener(0,0);
  const scheduler=createShotScheduler(audio,{random:()=>0});
  scheduler.step({...snow,now:0});scheduler.step({...snow,now:25000});
  check('snow keeps the existing outdoor wind-gust recordings',k.built.some(e=>/os-wind-gust/.test(e.url)));
  check('snow does not trigger thunder',!k.built.some(e=>/os-distant-thunder/.test(e.url)));
  audio.dispose();
  check('the bed selector also protects callers passing raw rain with dungeon and settlement flags',
    bedFor({raining:true,inDungeon:true,settlement:true}).endsWith('amb-mine-inside.mp3'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
