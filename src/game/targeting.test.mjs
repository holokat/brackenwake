// Who the game thinks you meant. Run: node src/game/targeting.test.mjs
//
// Everything here is the pure half of targeting.js, driven with plain objects.
// Every gate is pushed both ways: a thing inside the cone AND a thing just
// outside it, a target in range AND one a hand's breadth past it, a corpse and
// a live monster, a hostile and a townsman.

import {
  pickTarget, inCone, angleTo, flatDistance, isTargetable, targetFrame,
  tierColour, tierForSkill, playerTier, TIER_STEPS, TIER_BANDS,
  DEFAULT_HALF_ANGLE, COMBAT_SKILLS, MAX_PLAYER_TIER,
} from './targeting.js';

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

// --- tiers and colours ---------------------------------------------------------
console.log('targeting: the tier colour');
ck('the bands come from mmo/monsters TIERS, seven of them, bosses sharing tier 5 numbers',
  TIER_BANDS.join(',') === '0,10,30,50,70,90,90', TIER_BANDS.join(','));
ck('skill 0 is tier 0, 10 is tier 1, 45 is tier 2, 65 is tier 3, 85 is tier 4, 95 is tier 5 or above',
  [0, 10, 45, 65, 85, 95].map(tierForSkill).join(',') === '0,1,2,3,4,6',
  [0, 10, 45, 65, 85, 95].map(tierForSkill).join(','));
ck('a player never reads as a boss tier', playerTier({ skills: { swordsmanship: 100 } }) === MAX_PLAYER_TIER,
  String(playerTier({ skills: { swordsmanship: 100 } })));
ck('the player is measured by the best skill that fights, not by tailoring',
  playerTier({ skills: { tailoring: 100, swordsmanship: 32 } }) === 2,
  `tailoring 100 and swordsmanship 32 reads tier ${playerTier({ skills: { tailoring: 100, swordsmanship: 32 } })}`);
ck('every combat skill in the list is one abilities.js knows',
  COMBAT_SKILLS.length === new Set(COMBAT_SKILLS).size, COMBAT_SKILLS.join(' '));

console.log('targeting: the five steps, at the documented offsets');
const steps = [-3, -2, -1, 0, 1, 2, 3].map((d) => tierColour(3 + d, 3));
ck('three or more below you is still grey', steps[0].key === 'trivial' && steps[0].colour === '#9aa0a6');
ck('two below is grey', steps[1].key === 'trivial' && steps[1].colour === '#9aa0a6');
ck('one below is green', steps[2].key === 'easy' && steps[2].colour === '#7ee07a');
ck('your own tier is yellow', steps[3].key === 'even' && steps[3].colour === '#ffd23f');
ck('one above is orange', steps[4].key === 'hard' && steps[4].colour === '#ff9a3c');
ck('two above is red', steps[5].key === 'deadly' && steps[5].colour === '#ff5a4d');
ck('and three above is still red, not something new', steps[6].key === 'deadly' && steps[6].colour === '#ff5a4d');
ck('the five steps are the five colours 06-ECONOMY-UI names, in that order',
  TIER_STEPS.map((s) => s.colour).join(',') === '#9aa0a6,#7ee07a,#ffd23f,#ff9a3c,#ff5a4d',
  TIER_STEPS.map((s) => s.colour).join(','));
ck('every step has words a player can read', TIER_STEPS.every((s) => typeof s.word === 'string' && s.word.length));

// --- the target frame ----------------------------------------------------------
console.log('targeting: the frame data');
ck('no target, no frame', targetFrame(null) === null);
{
  const f = targetFrame(mob('Skeleton Warrior', 0, 4, { health: 15, maxHealth: 60, tier: 2 }),
    { skills: { swordsmanship: 55 } });
  ck('it names the thing', f.name === 'Skeleton Warrior');
  ck('a quarter of its health is a quarter of the bar', f.fraction === 0.25, String(f.fraction));
  ck('a tier 2 seen by a tier 3 player is green', f.colour === '#7ee07a' && f.step === 'easy', `${f.step} ${f.colour}`);
}
{
  const f = targetFrame(mob('Cyclops', 0, 4, { health: 700, maxHealth: 700, tier: 5 }),
    { skills: { swordsmanship: 20 } });
  ck('a tier 5 seen by a tier 1 player is red', f.colour === '#ff5a4d' && f.step === 'deadly', `${f.step} ${f.colour}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
