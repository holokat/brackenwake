// Who the game thinks you meant. Run: node src/game/targeting.test.mjs
//
// Everything here is the pure half of targeting.js, driven with plain objects.
// Every gate is pushed both ways: a thing inside the cone AND a thing just
// outside it, a target in range AND one a hand's breadth past it, a corpse and
// a live monster, a hostile and a townsman.

import {
  pickTarget, inCone, angleTo, flatDistance, isTargetable, targetFrame,
  conOf, tierForSkill, playerTier, screenOf, nameplateOf,
  DEFAULT_HALF_ANGLE, CON_SKILLS, MAX_PLAYER_TIER, createTargeting,
  PLATE_LIFT, BOSS_PLATE_LIFT, DEFAULT_BODY_HEIGHT,
} from './targeting.js';
import { CON_LEVELS } from './con.js';
import { colourFor, angerLevel, ANGRY_TAKEN, KINDS } from './floaters.js';
import { ringState, tintFor, conLevel, TARGET_COLOUR } from './target_ring.js';
import * as THREE from 'three';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const mob = (name, x, z, extra = {}) => ({
  name, pos: { x, y: 0, z }, health: 30, maxHealth: 30, faction: 'hostile', tier: 2, ...extra,
});
const me = { x: 0, y: 0, z: 0 };

// --- distance and angle -------------------------------------------------------
console.log('targeting: the flat measure');
ck('distance ignores height, because reach is written for people on ground',
  flatDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 40, z: 0 }) === 3, '3 m away with 40 m of air above');
ck('straight ahead at yaw 0 is +z', near(angleTo(me, 0, { x: 0, z: 5 }), 0));
ck('directly behind is pi', near(angleTo(me, 0, { x: 0, z: -5 }), Math.PI));
ck('to the side is a right angle', near(angleTo(me, 0, { x: 5, z: 0 }), Math.PI / 2));
ck('yaw follows the game convention, forward = (sin, cos)',
  near(angleTo(me, Math.PI / 2, { x: 5, z: 0 }), 0), 'at yaw 90 degrees, +x is straight ahead');
ck('something standing on your feet counts as ahead', angleTo(me, 0, { x: 0, z: 0 }) === 0);

// --- who may be targeted ------------------------------------------------------
console.log('targeting: who counts');
ck('a live hostile counts', isTargetable(mob('Wolf', 1, 1)));
ck('a corpse does not', !isTargetable(mob('Wolf', 1, 1, { health: 0 })));
ck('nor does one flagged dead', !isTargetable(mob('Wolf', 1, 1, { dead: true })));
ck('nor a townsman', !isTargetable(mob('Smith', 1, 1, { faction: 'town' })));
ck('nor a critter', !isTargetable(mob('Rabbit', 1, 1, { faction: 'critter' })));
ck('nor yourself', (() => { const self = mob('You', 0, 0); return !isTargetable(self, self); })());

// --- the cone -----------------------------------------------------------------
console.log('targeting: the cone in front');
{
  const ahead = mob('ahead', 0, 5);
  const behind = mob('behind', 0, -7);
  const side = mob('side', 3, 0);
  const found = inCone([ahead, behind, side], me, 0, 10, DEFAULT_HALF_ANGLE);
  ck('the one in front is found', found.length === 1 && found[0].actor === ahead, found.map((f) => f.actor.name).join(','));
  ck('the one behind is not', !found.some((f) => f.actor === behind));
  ck('and neither is the one at ninety degrees, since the cone is 120 wide',
    !found.some((f) => f.actor === side));
  // and the other way: widen the cone and the side one appears
  const wide = inCone([ahead, behind, side], me, 0, 10, Math.PI);
  ck('a full circle finds all three', wide.length === 3, String(wide.length));
  ck('and they come back nearest first, 3 then 5 then 7',
    wide.map((f) => f.dist.toFixed(0)).join(',') === '3,5,7',
    wide.map((f) => `${f.actor.name} ${f.dist.toFixed(0)}`).join(' < '));
}
{
  const inside = mob('inside', 0, 9.99);
  const outside = mob('outside', 0, 10.01);
  ck('range is inclusive at the line', inCone([inside], me, 0, 10).length === 1);
  ck('and excludes a centimetre past it', inCone([outside], me, 0, 10).length === 0);
}

// --- pickTarget ---------------------------------------------------------------
console.log('targeting: pickTarget');
{
  const cursor = mob('under the cursor', 0, 3);
  const nearer = mob('nearer', 0, 1);
  const r = pickTarget({ cursorHit: cursor, candidates: [cursor, nearer], pos: me, yaw: 0, range: 10 });
  ck('the cursor wins over the nearer thing', r.target === cursor && r.how === 'cursor', `${r.target.name} by ${r.how}`);
}
{
  const far = mob('far', 0, 30);
  const r = pickTarget({ cursorHit: far, candidates: [far], pos: me, yaw: 0, range: 20 });
  ck('a cursor hit out of range is refused, and says the numbers',
    r.target === null && /30\.0 m away and the reach is 20/.test(r.reason), r.reason);
}
{
  const a = mob('near one', 0, 2), b = mob('far one', 0, 6);
  const r = pickTarget({ cursorHit: null, candidates: [b, a], pos: me, yaw: 0, range: 10 });
  ck('with no cursor the nearest in front wins', r.target === a && r.how === 'front', r.target.name);
}
{
  const r = pickTarget({ cursorHit: null, candidates: [mob('behind', 0, -3)], pos: me, yaw: 0, range: 10 });
  ck('nothing in front is a refusal with words',
    r.target === null && r.how === 'none' && /nothing hostile within 10 m in front/.test(r.reason), r.reason);
}
{
  // the injected search wins, so main.js and this file cannot disagree
  const own = mob('the runtime picked me', 0, 4);
  let sawArgs = null;
  const r = pickTarget({
    cursorHit: null, candidates: [mob('the cone would have picked me', 0, 1)],
    pos: me, yaw: 0.5, range: 12, halfAngle: 0.7,
    nearestHostile: (p, y, range, half) => { sawArgs = { y, range, half }; return own; },
  });
  ck('nearestHostile is used instead of the cone when it is given', r.target === own, r.target.name);
  ck('and it is handed the ability’s own yaw, range and half angle',
    sawArgs.y === 0.5 && sawArgs.range === 12 && sawArgs.half === 0.7, JSON.stringify(sawArgs));
}
{
  const r = pickTarget({ cursorHit: null, candidates: [], pos: me, yaw: 0, range: 5, nearestHostile: () => null });
  ck('and when it finds nothing that is still a refusal with words', r.target === null && r.reason.includes('5 m'), r.reason);
}

// --- acquire, which is the door every ability goes through ----------------------
//
// Three answers wearing one shape, and they must not be mistaken for one
// another: somebody to hit, somebody chosen but too far, and nobody at all.
// The middle one is a distance to walk; the last one is a question for the
// player, and abilities_runtime holds the spell on the cursor to ask it.
console.log('targeting: acquire tells "too far" apart from "nobody there"');
{
  const near = mob('Skeleton', 0, 4);
  const far = mob('Ogre', 0, 40);
  const t = createTargeting(null, null, { targets: () => [near, far] }, {
    pos: () => ({ x: 0, y: 0, z: 0 }), yaw: () => 0,
  });

  const none = t.acquire({ range: 20 });
  ck('with nothing chosen the cone answers', none.target === near && none.how === 'front', none.reason);
  ck('and that answer is not flagged out of range', !none.outOfRange);

  t.set(near);
  const mine = t.acquire({ range: 20 });
  ck('a chosen target in reach is the one used', mine.target === near && mine.how === 'current', mine.reason);

  t.set(far);
  const away = t.acquire({ range: 20 });
  ck('a chosen target out of reach is NOT quietly swapped for the nearer one',
    away.target === null && away.blocked === far, away.target ? away.target.name : 'nobody');
  ck('it is flagged out of range and names the distance and the reach',
    away.outOfRange === true && /Ogre is 40\.0 m away and the reach is 20 m/.test(away.reason), away.reason);
  ck('and the distance comes back as a number too', away.dist === 40, String(away.dist));

  // the other way: widen the reach and the same target is simply the target
  const wide = t.acquire({ range: 50 });
  ck('with 50 m of reach that same target needs no walking',
    wide.target === far && wide.how === 'current' && !wide.outOfRange, wide.reason);

  const empty = createTargeting(null, null, { targets: () => [] }, {
    pos: () => ({ x: 0, y: 0, z: 0 }), yaw: () => 0,
  });
  const nobody = empty.acquire({ range: 20 });
  ck('an empty world is "nobody there", and NOT out of range',
    nobody.target === null && !nobody.outOfRange && /nothing hostile within 20 m/.test(nobody.reason), nobody.reason);
}
{
  const far = mob('far', 0, 30);
  const r = pickTarget({ cursorHit: far, candidates: [far], pos: me, yaw: 0, range: 20 });
  ck('a cursor hit out of range carries the same flag, and who blocked it',
    r.outOfRange === true && r.blocked === far, r.reason);
  const near = mob('near', 0, 3);
  const ok = pickTarget({ cursorHit: near, candidates: [near], pos: me, yaw: 0, range: 20 });
  ck('and a cursor hit inside it carries neither', !ok.outOfRange && !ok.blocked, ok.reason);
}

// --- tiers and colours ---------------------------------------------------------
//
// The rule itself is con.js's and is measured cell by cell in con.test.mjs.
// What is checked here is that targeting.js reads THAT rule and not a second
// copy of it, which is the bug this file used to be.
console.log('targeting: the con rule comes from con.js');
ck('skill 0 is tier 0, 10 is tier 1, 45 is tier 2, 65 is tier 3, 85 is tier 4, 95 is tier 5',
  [0, 10, 45, 65, 85, 95].map(tierForSkill).join(',') === '0,1,2,3,4,5',
  [0, 10, 45, 65, 85, 95].map(tierForSkill).join(','));
ck('a player never reads as a boss tier', playerTier({ skills: { swordsmanship: 100 } }) === MAX_PLAYER_TIER,
  String(playerTier({ skills: { swordsmanship: 100 } })));
ck('the player is measured by the best skill that fights, not by tailoring',
  playerTier({ skills: { tailoring: 100, swordsmanship: 32 } }) === 2,
  `tailoring 100 and swordsmanship 32 reads tier ${playerTier({ skills: { tailoring: 100, swordsmanship: 32 } })}`);
ck('the skill list has no duplicates', CON_SKILLS.length === new Set(CON_SKILLS).size, CON_SKILLS.join(' '));
ck('conOf is the same function con.js publishes, six fighting levels and the friend',
  CON_LEVELS.length === 7 && conOf({ tier: 2 }, { skills: { swordsmanship: 50 } }).level === 'even');
{
  // MP1: a fellow player can be chosen, and stays chosen frame after frame
  const mate = { id: 'tour', name: 'tour', faction: 'player', remote: true, health: 100, maxHealth: 100, pos: { x: 3, y: 0, z: 0 } };
  const t = createTargeting(null, null, { targets: () => [] }, { self: null, pos: () => ({ x: 0, y: 0, z: 0 }), yaw: () => 0 });
  ck('a friend can be set as the target', t.set(mate) === mate && t.current === mate);
  t.update?.(0.016, 1);
  t.frame?.({ skills: {} }, 1);
  ck('and is still the target after a frame', t.current === mate, String(t.current && t.current.name));
  mate.health = 0;
  t.update(0.016);
  ck('a friend who has fallen is let go', t.current !== mate);
}
ck('another player reads as a friend, not as no threat (MP1)',
  conOf({ tier: 2, faction: 'player' }, { skills: { swordsmanship: 50 } }).level === 'friend' && conOf({ faction: 'ally' }).word === 'a fellow traveller');
ck('and it reads the rung, one below the band: swordsmanship 30 is band 2 and reads tier 1',
  playerTier({ skills: { swordsmanship: 30 } }) === 2 && conOf({ tier: 2 }, { skills: { swordsmanship: 30 } }).level === 'hard',
  conOf({ tier: 2 }, { skills: { swordsmanship: 30 } }).level);

// --- the target frame ----------------------------------------------------------
console.log('targeting: the frame data');
ck('no target, no frame', targetFrame(null) === null);
{
  // swordsmanship 75 is band 4, which reads as tier 3, one rung above the mob
  const f = targetFrame(mob('Skeleton Warrior', 0, 4, { health: 15, maxHealth: 60, tier: 2 }),
    { skills: { swordsmanship: 75 } });
  ck('it names the thing', f.name === 'Skeleton Warrior');
  ck('a quarter of its health is a quarter of the bar', f.fraction === 0.25, String(f.fraction));
  ck('a tier 2 seen by a player who reads as tier 3 is green and says "easy"',
    f.colour === '#7ee07a' && f.level === 'easy' && f.word === 'easy', `${f.level} ${f.colour} "${f.word}"`);
  ck('and it carries no skull', f.skull === false);
}
{
  const f = targetFrame(mob('Cyclops', 0, 4, { health: 700, maxHealth: 700, tier: 5 }),
    { skills: { swordsmanship: 20 } });
  ck('a tier 5 seen by a tier 1 player is red, says it will kill you, and wears a skull',
    f.colour === '#ff5a4d' && f.level === 'deadly' && f.word === 'it will kill you' && f.skull === true,
    `${f.level} ${f.colour} "${f.word}" skull=${f.skull}`);
}
{
  const f = targetFrame({ name: 'odd one', health: 12 });
  ck('a thing with no maxHealth reads full rather than dividing by zero',
    f.fraction === 1 && f.maxHealth === 12, `${f.health}/${f.maxHealth}`);
}
{
  const f = targetFrame(mob('overkilled', 0, 1, { health: -30, maxHealth: 40 }));
  ck('negative health is clamped to nothing, and the frame says it is dead',
    f.fraction === 0 && f.dead === true, `${f.health}/${f.maxHealth} dead=${f.dead}`);
}


// --- the nameplate over the target ---------------------------------------------
//
// A real THREE.PerspectiveCamera stands in for the game's, so what is measured
// is the projection the player would get and not a description of it.
console.log('targeting: the nameplate, projected');
const W = 1280, H = 720;
function stubCamera() {
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
  cam.position.set(0, 6, 14);
  cam.lookAt(0, 1, 0);
  cam.updateMatrixWorld(true);
  return cam;
}
{
  const cam = stubCamera();
  const middle = screenOf(cam, { x: 0, y: 1, z: 0 }, W, H);
  ck('a point the camera is aimed at lands in the middle of the screen',
    middle.visible && Math.abs(middle.x - W / 2) < 1 && Math.abs(middle.y - H / 2) < 1,
    `${middle.x.toFixed(1)}, ${middle.y.toFixed(1)}`);
  const behind = screenOf(cam, { x: 0, y: 1, z: 40 }, W, H);
  ck('a point behind the camera is not visible', behind.visible === false);
  ck('no camera, no projection', screenOf(null, { x: 0, y: 0, z: 0 }, W, H).visible === false);
  ck('and a zero sized viewport is refused rather than dividing by nothing',
    screenOf(cam, { x: 0, y: 1, z: 0 }, 0, 0).visible === false);
}
{
  // 60 frames of a wolf walking from left to right in front of the camera
  const cam = stubCamera();
  const wolf = mob('Wolf', -6, 0, { tier: 2 });
  const me9 = { skills: { swordsmanship: 50 } };
  const xs = [], ys = [];
  for (let i = 0; i < 60; i++) {
    wolf.pos.x = -6 + 12 * (i / 59);
    const plate = nameplateOf(wolf, me9, cam, W, H, 1.4);
    if (!plate) { xs.length = 0; break; }
    xs.push(plate.x); ys.push(plate.y);
  }
  ck('the plate is drawn on all 60 frames', xs.length === 60, `${xs.length} frames`);
  let climbs = true;
  for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) climbs = false;
  ck('and it follows the wolf across the screen, never jumping back',
    climbs, `x ran ${xs[0].toFixed(0)} px to ${xs[xs.length - 1].toFixed(0)} px`);
  ck('it stays inside the viewport the whole way',
    xs.every((x) => x >= 0 && x <= W) && ys.every((y) => y >= 0 && y <= H),
    `y between ${Math.min(...ys).toFixed(0)} and ${Math.max(...ys).toFixed(0)} px`);
  ck('and it hangs over the body, not under it',
    ys.every((y, i) => y < screenOf(cam, { x: -6 + 12 * (i / 59), y: 0, z: 0 }, W, H).y),
    'every plate is higher on screen than the feet it belongs to');
}
{
  const cam = stubCamera();
  const me9 = { skills: { swordsmanship: 50 } };
  const wolf = mob('Wolf', 0, 0, { tier: 2 });
  const plate = nameplateOf(wolf, me9, cam, W, H, 1.4);
  ck('the plate carries the con colour and the word', plate.colour === '#ffd23f' && plate.word === 'a fair fight',
    `${plate.colour} "${plate.word}"`);
  ck('and no skull for a fair fight', plate.skull === false);
  const ogre = mob('Ogre', 0, 0, { tier: 4 });
  ck('a red name carries a skull', nameplateOf(ogre, me9, cam, W, H, 1.4).skull === true);
  const king = mob('the Ashen King', 0, 0, { tier: 6, boss: true });
  const kingPlate = nameplateOf(king, me9, cam, W, H, 1.4);
  ck('a boss is purple and carries a skull too', kingPlate.colour === '#c07bf0' && kingPlate.skull === true,
    `${kingPlate.colour} "${kingPlate.word}"`);
  ck('and hangs higher than an ordinary plate, so it clears the boss sprite',
    kingPlate.y < plate.y && BOSS_PLATE_LIFT > PLATE_LIFT,
    `boss at ${kingPlate.y.toFixed(0)} px, ordinary at ${plate.y.toFixed(0)} px, lifts ${BOSS_PLATE_LIFT} m and ${PLATE_LIFT} m`);
  const tall = nameplateOf(mob('Wyvern', 0, 0, { tier: 4 }), me9, cam, W, H, 4);
  ck('a taller body wears its plate higher', tall.y < plate.y, `${tall.y.toFixed(0)} px against ${plate.y.toFixed(0)} px`);
  ck('with no body height given it falls back to DEFAULT_BODY_HEIGHT and draws there',
    nameplateOf(wolf, me9, cam, W, H).y === nameplateOf(wolf, me9, cam, W, H, DEFAULT_BODY_HEIGHT).y && DEFAULT_BODY_HEIGHT === 2,
    `${nameplateOf(wolf, me9, cam, W, H).y.toFixed(1)} px, the same as a ${DEFAULT_BODY_HEIGHT} m body`);
  ck('a corpse gets no plate', nameplateOf(mob('Wolf', 0, 0, { health: 0 }), me9, cam, W, H, 1.4) === null);
  ck('and nothing at all gets no plate', nameplateOf(null, me9, cam, W, H, 1.4) === null);
  ck('a target behind the camera gets no plate',
    nameplateOf(mob('Wolf', 0, 40, { tier: 2 }), me9, cam, W, H, 1.4) === null);
}

// --- the wire: what createTargeting hands the HUD and the floaters --------------
console.log('targeting: the plate and the floaters follow the target');
{
  const cam = stubCamera();
  const plates = [];
  const hud = { setNameplate: (p) => plates.push(p), log: () => {} };
  const wolf = mob('Wolf', 0, 4, { tier: 2 });
  const t = createTargeting({ camera: cam }, null, { targets: () => [wolf], forActor: () => ({ model: { height: 1.4 } }) }, {
    hud, pos: () => ({ x: 0, y: 0, z: 0 }), yaw: () => 0,
    viewport: () => ({ width: W, height: H }),
  });

  const fresh = { skills: {} };
  const gm = { skills: { swordsmanship: 100 } };

  ck('with nothing targeted the HUD is told to hide the plate', t.frame(fresh) === null && plates[plates.length - 1] === null);
  ck('and the floaters are not angry', angerLevel() === null);

  t.set(wolf);
  const f1 = t.frame(fresh);
  ck('a fresh character sees a red wolf in the frame', f1.level === 'deadly' && f1.colour === '#ff5a4d', `${f1.level} ${f1.colour}`);
  ck('the plate the HUD was handed is the same red, with a skull',
    plates[plates.length - 1].colour === '#ff5a4d' && plates[plates.length - 1].skull === true);
  ck('and the numbers you take from it go angry',
    angerLevel() === 'deadly' && colourFor('taken') === ANGRY_TAKEN, colourFor('taken'));
  ck('and the ring under it is pulled off gold toward the red',
    conLevel() === 'deadly' && ringState(wolf, false, 0).colour === tintFor('deadly')
    && ringState(wolf, false, 0).colour !== TARGET_COLOUR,
    '#' + ringState(wolf, false, 0).colour.toString(16));

  const f2 = t.frame(gm);
  ck('the SAME wolf reads grey to a grandmaster', f2.level === 'trivial' && f2.colour === '#9aa0a6', `${f2.level} ${f2.colour}`);
  ck('the plate turns grey with it', plates[plates.length - 1].colour === '#9aa0a6');
  ck('and the numbers you take go back to the ordinary red',
    angerLevel() === 'trivial' && colourFor('taken') === KINDS.taken.color, colourFor('taken'));
  ck('and the ring goes grey with the name',
    conLevel() === 'trivial' && ringState(wolf, false, 0).colour === tintFor('trivial'),
    '#' + ringState(wolf, false, 0).colour.toString(16));

  t.clear();
  t.frame(gm);
  ck('clearing the target takes the plate down', plates[plates.length - 1] === null);
  ck('and puts the floaters back', angerLevel() === null);
  ck('and the ring back to gold', conLevel() === null && ringState(wolf, false, 0).colour === TARGET_COLOUR);

  t.set(wolf);
  t.frame(fresh);
  t.dispose();
  ck('disposing takes the plate down and clears the anger and the ring too',
    plates[plates.length - 1] === null && angerLevel() === null && conLevel() === null);
}
{
  // no renderer, no camera, no hud: the frame still answers and nothing throws
  const t = createTargeting(null, null, { targets: () => [] }, { pos: () => ({ x: 0, z: 0 }), yaw: () => 0 });
  const wolf = mob('Wolf', 0, 1, { tier: 2 });
  t.set(wolf);
  const f = t.frame({ skills: { swordsmanship: 50 } });
  ck('with no camera the frame is still drawn and the plate is simply absent',
    f.level === 'even' && t.nameplate === null, `${f.level}, plate ${t.nameplate}`);
  t.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

