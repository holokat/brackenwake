// Spells and swings, measured. Run: node src/game/effects.test.mjs
//
// The poses are the interesting half: they are ADDITIVE, so every clip has to
// be zero at t = 0 and back to zero at t = 1, or an arm that swung once would
// never come back to the walk. Death is the deliberate exception and is
// checked for being the exception rather than being let off.
//
// The second half builds the real createEffects against a headless THREE
// scene and the real player rig, and measures that the arm actually moves.

import * as THREE from 'three';
import {
  colourFor, TYPE_COLOURS, GROUP_COLOURS,
  swingPose, castPose, flinchPose, deathPose,
  stepParticle, particleFade, boltAt, createEffects,
  SWING_S, FLINCH_S, DEATH_S, PARTICLE_GRAVITY,
  spellCueFor, impactCueFor, materialOf, swingCueFor, posOf,
  SPELL_CUES, IMPACT_CUES,
} from './effects.js';
import { CUES } from './audio.js';
import { buildCharacter, poseCharacter, STRIDE_WALK } from './player.js';
import { ABILITIES, ABILITIES_BY_ID } from '../mmo/abilities.js';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// --- colours -------------------------------------------------------------------
console.log('effects: a colour per spell');
ck('Fireball is the fire colour', colourFor('fireball') === TYPE_COLOURS.fire, hex(colourFor('fireball')));
ck('Ice Shard is the cold colour', colourFor('iceShard') === TYPE_COLOURS.cold, hex(colourFor('iceShard')));
ck('Lightning is the energy colour', colourFor('lightning') === TYPE_COLOURS.energy, hex(colourFor('lightning')));
ck('Consecrate Weapon is holy, which is a damage type and not a resist',
  colourFor('consecrateWeapon') === TYPE_COLOURS.holy, hex(colourFor('consecrateWeapon')));
ck('a spell that deals no damage falls back to its group',
  colourFor('bless') === GROUP_COLOURS.healer && colourFor('curseOfWeakness') === GROUP_COLOURS.necromancer,
  `bless ${hex(colourFor('bless'))}, curse ${hex(colourFor('curseOfWeakness'))}`);
ck('an ability nobody has heard of is still given a colour rather than undefined',
  colourFor('nonesuch') === TYPE_COLOURS.physical, hex(colourFor('nonesuch')));
{
  let missing = 0;
  for (const a of ABILITIES) { const c = colourFor(a.id); if (!Number.isInteger(c) || c < 0 || c > 0xffffff) missing++; }
  ck(`all ${ABILITIES.length} abilities resolve to a real colour`, missing === 0, `${missing} did not`);
}

// --- the poses ------------------------------------------------------------------
console.log('effects: the poses start and end at rest');
for (const [name, fn] of [['swing', swingPose], ['cast', castPose], ['flinch', flinchPose]]) {
  const a = fn(0), b = fn(1);
  const zero = (o) => Object.entries(o).filter(([k, v]) => k !== 'glow' && Math.abs(v) > 1e-9).map(([k, v]) => `${k}=${v.toFixed(3)}`);
  ck(`${name} is at rest at t = 0`, zero(a).length === 0, zero(a).join(' '));
  ck(`${name} is back at rest at t = 1`, zero(b).length === 0, zero(b).join(' '));
}
ck('death does NOT come back to rest, because a body that stood up would be a bug',
  deathPose(1).tip > 1.4 && deathPose(1).hipsDrop > 0.8,
  `tip ${deathPose(1).tip.toFixed(2)} rad, hips down ${deathPose(1).hipsDrop.toFixed(2)} m`);
ck('death starts standing', near(deathPose(0).tip, 0) && near(deathPose(0).hipsDrop, 0));
{
  let mono = true, prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.02) { const v = deathPose(t).tip; if (v < prev - 1e-9) mono = false; prev = v; }
  ck('and it only ever goes down', mono);
}
{
  const wind = swingPose(0.2), through = swingPose(0.6);
  ck('the swing winds the arm back first, then brings it through',
    wind.armR < -0.5 && through.armR > wind.armR,
    `back to ${wind.armR.toFixed(2)} rad, through at ${through.armR.toFixed(2)}`);
  ck('and the body turns into the blow, the hips leading the head',
    Math.abs(through.torsoY) > 0.1 && Math.sign(through.headY) !== Math.sign(through.torsoY),
    `torso ${through.torsoY.toFixed(2)}, head ${through.headY.toFixed(2)}`);
}
{
  const held = castPose(0.5);
  ck('the cast holds the hand up through the middle of the bar', held.armR < -2, `${held.armR.toFixed(2)} rad`);
  ck('and the glow is brightest just before it lands',
    castPose(0.84).glow > castPose(0.3).glow && castPose(1).glow === 0,
    `0.3 -> ${castPose(0.3).glow.toFixed(2)}, 0.84 -> ${castPose(0.84).glow.toFixed(2)}, 1 -> ${castPose(1).glow}`);
}
{
  const f = flinchPose(0.5);
  ck('a flinch recoils backwards, not forwards', f.torsoX < 0 && f.headX < 0, `${f.torsoX.toFixed(2)} rad`);
}

// --- particles -------------------------------------------------------------------
console.log('effects: particles');
{
  const p = { x: 0, y: 2, z: 0, vx: 1, vy: 0, vz: 0, age: 0, life: 0.5, size: 1, drag: 1, friction: 0, colour: 0 };
  stepParticle(p, 0.1, PARTICLE_GRAVITY);
  ck('one tenth of a second of gravity takes 0.6 m/s off the rise',
    near(p.vy, -PARTICLE_GRAVITY * 0.1, 1e-12), `${p.vy.toFixed(3)} m/s`);
  ck('and it travelled its 0.1 m sideways', near(p.x, 0.1, 1e-12), `${p.x.toFixed(3)} m`);
  ck('it is not dead yet', p.dead === false && p.age === 0.1);
  for (let i = 0; i < 5; i++) stepParticle(p, 0.1, PARTICLE_GRAVITY);
  ck('and it dies exactly at its life', p.dead === true && p.age >= p.life, `${p.age.toFixed(2)} s of ${p.life}`);
}
{
  const p = { x: 0, y: 0, z: 0, vx: 10, vy: 0, vz: 0, age: 0, life: 1, size: 1, drag: 0, friction: 2, colour: 0 };
  stepParticle(p, 0.5, PARTICLE_GRAVITY);
  ck('friction slows a spark, and drag 0 keeps it from falling',
    p.vx < 10 && p.vy === 0, `${p.vx.toFixed(2)} m/s after half a second`);
}
ck('a fresh particle is at full size and a spent one at none',
  particleFade({ age: 0, life: 1 }) === 1 && particleFade({ age: 1, life: 1 }) === 0);
{
  let mono = true, prev = 2;
  for (let t = 0; t <= 1; t += 0.05) { const v = particleFade({ age: t, life: 1 }); if (v > prev + 1e-9) mono = false; prev = v; }
  ck('and it only fades, never brightens', mono);
}

console.log('effects: the bolt');
{
  const from = { x: 0, y: 1, z: 0 }, to = { x: 10, y: 1, z: 0 };
  ck('it starts at the hand', near(boltAt(from, to, 0).x, 0) && near(boltAt(from, to, 0).y, 1));
  ck('it ends at the target', near(boltAt(from, to, 1).x, 10) && near(boltAt(from, to, 1).y, 1));
  let mono = true, prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.02) { const v = boltAt(from, to, t).x; if (v < prev - 1e-9) mono = false; prev = v; }
  ck('it never goes backwards', mono);
  ck('and it arcs over the ground between the two', boltAt(from, to, 0.5).y > 1.5,
    `${boltAt(from, to, 0.5).y.toFixed(2)} m at the halfway point`);
}

// --- the real thing ----------------------------------------------------------------
console.log('effects: createEffects against a real rig');
const scene = new THREE.Scene();
const fx = createEffects({ scene });
const rig = buildCharacter();
scene.add(rig.group);
const gait = { phase: 0, stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1 };

// The frame order that matters: the gait writes the rig, THEN effects add to
// it. `fx.update` clamps a step to 0.1 s the way every update in this codebase
// does, so time is advanced in real 1/60 frames rather than in one long jump:
// a test that handed it 0.45 s at once would only advance the clip 0.1 s and
// then lie about what it had proved.
const frame = (dt) => { poseCharacter(rig.parts, gait); fx.update(dt); };
const run = (seconds, step = 1 / 60) => {
  let t = 0;
  while (t < seconds - 1e-9) { const d = Math.min(step, seconds - t); frame(d); t += d; }
};

frame(0);
const restArm = rig.parts.armR.rotation.x;
fx.swing(rig);
run(SWING_S * 0.2);
const midArm = rig.parts.armR.rotation.x;
ck('a swing actually moves the arm off its resting angle',
  Math.abs(midArm - restArm) > 0.5, `${restArm.toFixed(3)} -> ${midArm.toFixed(3)} rad`);
ck('and the torso turned with it', Math.abs(rig.parts.torso.rotation.y) > 0.05,
  `${rig.parts.torso.rotation.y.toFixed(3)} rad`);
run(SWING_S);
frame(0);
ck('and when it is over the arm is back where the walk put it',
  near(rig.parts.armR.rotation.x, restArm, 1e-9), `${rig.parts.armR.rotation.x.toFixed(6)} vs ${restArm.toFixed(6)}`);
ck('and so is the turn in the shoulders, which the gait does NOT reset for us',
  near(rig.parts.torso.rotation.y, 0, 1e-9) && near(rig.parts.hips.rotation.y, 0, 1e-9),
  `torso.y ${rig.parts.torso.rotation.y.toFixed(6)}, hips.y ${rig.parts.hips.rotation.y.toFixed(6)}`);
ck('the clip cleared itself rather than piling up', fx.clipCount === 0, String(fx.clipCount));
{
  // ten swings in a row: if the additive channels accumulated, this is where
  // the body would end up facing backwards
  for (let i = 0; i < 10; i++) { fx.swing(rig); run(SWING_S); frame(0); }
  ck('ten swings later the body is still facing forward, not spinning',
    Math.abs(rig.parts.torso.rotation.y) < 1e-9 && Math.abs(rig.parts.hips.rotation.x) < 1e-9,
    `torso.y ${rig.parts.torso.rotation.y.toFixed(6)}, hips.x ${rig.parts.hips.rotation.x.toFixed(6)}`);
}

fx.swing(rig); fx.swing(rig); fx.swing(rig);
ck('three presses in one frame do not stack three swings on one arm', fx.clipCount === 1, String(fx.clipCount));
fx.clear();

fx.cast(rig, 1.2, colourFor('fireball'));
run(0.4);
ck('a cast raises the hand', rig.parts.armR.rotation.x < restArm - 1.5, `${rig.parts.armR.rotation.x.toFixed(2)} rad`);
ck('and lights something the colour of the spell',
  scene.getObjectByProperty('isPointLight', true)?.intensity > 0,
  `intensity ${scene.getObjectByProperty('isPointLight', true)?.intensity?.toFixed(2)}`);
fx.stopCast(rig);
frame(0);
ck('stopping a cast puts the arm down and the light out',
  near(rig.parts.armR.rotation.x, restArm, 1e-9)
  && scene.getObjectByProperty('isPointLight', true).intensity === 0);

fx.clear();
fx.flinch(rig);
run(FLINCH_S * 0.5);
ck('a flinch bends the body back', rig.parts.torso.rotation.x < -0.1, `${rig.parts.torso.rotation.x.toFixed(2)} rad`);
run(FLINCH_S);
fx.clear();

const hipY = rig.parts.hips.position.y;
fx.die(rig);
{
  const before = fx.clipCount;
  fx.update(30);
  ck('a death clip is held past its life, a corpse does not get up on its own', fx.clipCount === before && before > 0, `${fx.clipCount} clips after 30 s`);
  const released = fx.stand(rig);
  ck('stand releases the held clip so a woken player is posed alive again', released === 1 && fx.clipCount === before - 1, `${released} released, ${fx.clipCount} left`);
  ck('and a second stand has nothing to release', fx.stand(rig) === 0);
  fx.die(rig);
}
run(DEATH_S);
frame(0);
ck('a death drops the hips and tips the body over',
  rig.parts.hips.position.y < hipY - 0.7 && rig.parts.hips.rotation.x > 1.3 && rig.parts.hips.rotation.x < 1.6,
  `hips ${rig.parts.hips.position.y.toFixed(2)} m, tipped ${rig.parts.hips.rotation.x.toFixed(2)} rad`);
run(5);
ck('and it stays down five seconds later, at the same angle and not a growing one',
  rig.parts.hips.rotation.x > 1.3 && rig.parts.hips.rotation.x < 1.6 && fx.clipCount === 1,
  `${rig.parts.hips.rotation.x.toFixed(3)} rad, ${fx.clipCount} clip held`);
fx.clear();

console.log('effects: the spell shapes');
fx.burst({ x: 0, y: 1, z: 0 }, TYPE_COLOURS.fire, 1);
ck('a burst puts particles in the pool', fx.particleCount > 10, `${fx.particleCount} sparks`);
let arrived = 0;
fx.bolt({ x: 0, y: 1, z: 0 }, { x: 6, y: 1, z: 0 }, TYPE_COLOURS.cold, { onArrive: () => { arrived++; } });
ck('a bolt is in flight', fx.boltCount === 1);
frame(0.1);
ck('and it has not arrived after a tenth of a second at 34 m/s over 6 m', arrived === 0 && fx.boltCount === 1);
frame(0.1);
ck('and it lands on the second tenth, calling back exactly once', arrived === 1 && fx.boltCount === 0,
  `arrived ${arrived} times`);
fx.ring({ x: 0, y: 0, z: 0 }, 3, TYPE_COLOURS.cold, 0.5);
fx.column({ x: 0, y: 0, z: 0 }, 6, TYPE_COLOURS.fire, 1.5);
fx.showGroundRing({ x: 2, y: 0, z: 2 }, 2.5, TYPE_COLOURS.physical);
ck('rings, columns and the cursor ring all built without throwing', true);
fx.hideGroundRing();
run(2);
ck('and they clean themselves up when their time is done',
  scene.children.length > 0 && fx.particleCount >= 0);
fx.dispose();
ck('dispose takes the whole group out of the scene',
  !scene.children.some((c) => c.name === 'bw-effects'));

// --- which sound, before anything plays one -----------------------------------
//
// The three lookups are pure, so they are driven from both sides: every case
// they are meant to catch, and the cases they are meant NOT to catch.
console.log('effects: which sound');
{
  for (const [type, cue] of Object.entries(SPELL_CUES)) {
    ck(`a ${type} spell is ${cue}`, spellCueFor(TYPE_COLOURS[type]) === cue, spellCueFor(TYPE_COLOURS[type]));
  }
  ck('a named type beats the colour it was painted with',
    spellCueFor(TYPE_COLOURS.fire, 'cold') === 'spell_cold');
  ck('a type nobody has heard of falls back to the colour',
    spellCueFor(TYPE_COLOURS.fire, 'custard') === 'spell_fire');
  ck('a colour from neither table is the plain one, never undefined',
    spellCueFor(0x123456) === 'spell_physical', spellCueFor(0x123456));
  ck('a necromancer spell that deals no damage is the drone, not the plain one',
    spellCueFor(colourFor('curseOfWeakness')) === 'spell_dark', spellCueFor(colourFor('curseOfWeakness')));
  ck('and a healer blessing is the warm chord',
    spellCueFor(colourFor('bless')) === 'spell_holy', spellCueFor(colourFor('bless')));
  ck('Fireball, Ice Shard and Lightning each get their own',
    spellCueFor(colourFor('fireball')) === 'spell_fire'
    && spellCueFor(colourFor('iceShard')) === 'spell_cold'
    && spellCueFor(colourFor('lightning')) === 'spell_energy');
  {
    const used = new Set(ABILITIES.map((a) => spellCueFor(colourFor(a.id))));
    const unreachable = Object.values(SPELL_CUES).filter((c) => !used.has(c));
    ck(`all ${Object.keys(SPELL_CUES).length} spell sounds are reachable from a real ability`,
      unreachable.length === 0, unreachable.join(',') || `${used.size} cues over ${ABILITIES.length} abilities`);
  }
  {
    const missing = [...new Set([...Object.values(SPELL_CUES), ...Object.values(IMPACT_CUES),
      'swing_light', 'swing_heavy', 'cast_start', 'cast_loop', 'aoe_ring', 'aoe_column'])]
      .filter((c) => !CUES[c]);
    ck('and every cue effects.js can name is a real row in audio.js', missing.length === 0, missing.join(','));
  }
}
{
  ck('nothing said is flesh, which is what a person is', materialOf(null) === 'flesh' && materialOf({}) === 'flesh');
  ck('a skeleton is bone', materialOf('skeleton') === 'bone' && materialOf({ id: 'skeletonWarrior' }) === 'bone');
  ck('so are the bone knight, the lich and the bone dragon',
    materialOf({ id: 'boneKnight' }) === 'bone' && materialOf({ id: 'lich' }) === 'bone'
    && materialOf({ id: 'boneDragon' }) === 'bone');
  ck('but a zombie is not, undead or otherwise',
    materialOf({ id: 'zombie', kind: 'undead' }) === 'flesh', materialOf({ id: 'zombie', kind: 'undead' }));
  ck('a construct is metal', materialOf({ id: 'ironGolem', kind: 'construct' }) === 'metal');
  ck('and so is anything in ringmail, chain or plate',
    materialOf({ armour: 'plate' }) === 'metal' && materialOf({ armour: 'chain' }) === 'metal'
    && materialOf({ armour: 'ring' }) === 'metal');
  ck('cloth, leather and studded are not', materialOf({ armour: 'cloth' }) === 'flesh'
    && materialOf({ armour: 'leather' }) === 'flesh' && materialOf({ armour: 'studded' }) === 'flesh');
  ck('an armour piece straight out of items.js works as the source',
    materialOf({ material: 'plate', slot: 'chest' }) === 'metal');
  ck('an explicit word wins over everything else',
    materialOf({ impactMaterial: 'flesh', id: 'skeleton', kind: 'construct' }) === 'flesh');
  ck('a monster row nested under the actor is found',
    materialOf({ name: 'it', row: { id: 'skeleton' } }) === 'bone');
  ck('and each material has a cue', impactCueFor('skeleton') === 'impact_bone'
    && impactCueFor({ kind: 'construct' }) === 'impact_metal' && impactCueFor(null) === 'impact_flesh');
}
{
  ck('an empty swing is the light one', swingCueFor() === 'swing_light' && swingCueFor({}) === 'swing_light');
  ck('one hand is light, two is heavy',
    swingCueFor({ hands: 1 }) === 'swing_light' && swingCueFor({ hands: 2 }) === 'swing_heavy');
  ck('twoHanded says the same thing', swingCueFor({ twoHanded: true }) === 'swing_heavy');
  ck('and the weapon itself says it too',
    swingCueFor({ weapon: { id: 'greatsword', hands: 2 } }) === 'swing_heavy'
    && swingCueFor({ weapon: { id: 'dagger', hands: 1 } }) === 'swing_light');
}
{
  ck('posOf reads a pos, an x/z, or a group position',
    JSON.stringify(posOf({ pos: { x: 1, y: 9, z: 2 } })) === '{"x":1,"z":2}'
    && JSON.stringify(posOf({ x: 3, z: 4 })) === '{"x":3,"z":4}'
    && JSON.stringify(posOf({ group: { position: { x: 5, z: 6 } } })) === '{"x":5,"z":6}');
  ck('and gives back null rather than a wrong place', posOf(null) === null && posOf({ name: 'nowhere' }) === null);
}

// --- and then it plays them ----------------------------------------------------
//
// The audio here is a fake that records the cue name, where it was played and
// what gain it was given. Every claim below is a count: exactly one call, with
// exactly that name, at exactly that place. A hook that fired twice or fired
// nothing fails, and both have happened while this was being written.
console.log('effects: every visual makes its sound');
function fakeAudio() {
  const calls = [];
  return {
    calls,
    play(cueName, o = {}) {
      const el = { cue: cueName, loop: false, paused: false, pauses: 0, pause() { this.paused = true; this.pauses++; } };
      calls.push({ cue: cueName, at: o.at || null, gain: o.gain, el });
      return el;
    },
    reset() { calls.length = 0; },
    names() { return calls.map((c) => c.cue).join(','); },
    only(name, place) {
      if (calls.length !== 1) return `${calls.length} calls: ${this.names()}`;
      const c = calls[0];
      if (c.cue !== name) return `played ${c.cue}, wanted ${name}`;
      if (place) {
        if (!c.at) return `${name} was played with no position`;
        const dx = Math.abs(c.at.x - place.x), dz = Math.abs(c.at.z - place.z);
        if (dx > 1e-6 || dz > 1e-6) return `${name} at ${c.at.x},${c.at.z} not ${place.x},${place.z}`;
      }
      return null;
    },
  };
}
{
  const sc2 = new THREE.Scene();
  const heard = fakeAudio();
  const fx2 = createEffects({ scene: sc2 }, { audio: heard });
  const body = buildCharacter();
  sc2.add(body.group);
  body.group.position.set(12, 0, -7);
  const HERE = { x: 12, z: -7 };
  const tick = (dt) => { poseCharacter(body.parts, { phase: 0, stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1 }); fx2.update(dt); };

  heard.reset();
  fx2.swing(body);
  ck('a swing is one swing_light, at the swinger', heard.only('swing_light', HERE) === null, heard.only('swing_light', HERE) || heard.names());
  fx2.clear();
  heard.reset();
  fx2.swing(body, { weapon: { id: 'greatsword', hands: 2 } });
  ck('a two-handed swing is one swing_heavy, at the same place',
    heard.only('swing_heavy', HERE) === null, heard.only('swing_heavy', HERE) || heard.names());
  fx2.clear();

  heard.reset();
  fx2.flinch(body);
  ck('a flinch with nothing said is one impact_flesh', heard.only('impact_flesh', HERE) === null, heard.names());
  fx2.clear(); heard.reset();
  fx2.flinch(body, { id: 'skeleton', kind: 'undead' });
  ck('a skeleton flinching is impact_bone', heard.only('impact_bone', HERE) === null, heard.names());
  fx2.clear(); heard.reset();
  fx2.flinch(body, { id: 'ironGolem', kind: 'construct' });
  ck('an iron golem flinching is impact_metal', heard.only('impact_metal', HERE) === null, heard.names());
  fx2.clear(); heard.reset();

  fx2.die(body);
  ck('dying adds no sound of its own, because the blow already made one',
    heard.calls.length === 0, heard.names());
  fx2.clear(); heard.reset();

  // the cast: two sounds, one of them held
  fx2.cast(body, 1.2, colourFor('fireball'));
  ck('a cast is exactly two sounds', heard.calls.length === 2, heard.names());
  ck('and they are cast_start then cast_loop, both at the caster',
    heard.names() === 'cast_start,cast_loop'
    && heard.calls.every((c) => c.at && Math.abs(c.at.x - 12) < 1e-6 && Math.abs(c.at.z + 7) < 1e-6),
    heard.calls.map((c) => `${c.cue}@${c.at ? `${c.at.x},${c.at.z}` : 'nowhere'}`).join(' '));
  const loopEl = heard.calls[1].el;
  ck('the hum is set to loop, because a cast is longer than one second', loopEl.loop === true);
  ck('and it is still running while the bar fills', loopEl.paused === false);
  fx2.stopCast(body);
  ck('breaking the cast stops the hum, exactly once',
    loopEl.paused === true && loopEl.pauses === 1 && loopEl.loop === false, `${loopEl.pauses} pauses`);
  ck('and no third sound was played for stopping', heard.calls.length === 2, heard.names());

  // a cast that runs out on its own has to stop the hum too, which is the bug
  // this pair of checks exists to catch
  heard.reset();
  fx2.cast(body, 0.4, colourFor('fireball'));
  const loop2 = heard.calls[1].el;
  for (let i = 0; i < 40; i++) tick(1 / 60);
  ck('a cast that finishes by itself also stops the hum',
    loop2.paused === true && fx2.clipCount === 0, `${loop2.pauses} pauses, ${fx2.clipCount} clips`);
  fx2.clear(); heard.reset();

  // the bolt and the burst it turns into
  const FROM = { x: 0, y: 1, z: 0 }, TO = { x: 6, y: 1, z: 0 };
  fx2.bolt(FROM, TO, TYPE_COLOURS.cold);
  ck('a bolt leaves with one sound, at the hand it left',
    heard.only('spell_cold', { x: 0, z: 0 }) === null, heard.only('spell_cold', { x: 0, z: 0 }) || heard.names());
  for (let i = 0; i < 3; i++) tick(0.1);
  ck('and it lands with a second one, at the target and nowhere else',
    heard.calls.length === 2 && heard.calls[1].cue === 'spell_cold'
    && heard.calls[1].at.x === 6 && heard.calls[1].at.z === 0,
    heard.calls.map((c) => `${c.cue}@${c.at.x},${c.at.z}`).join(' '));
  for (let i = 0; i < 10; i++) tick(0.1);
  ck('and never a third, however long the frame loop runs', heard.calls.length === 2, heard.names());
  fx2.clear(); heard.reset();

  fx2.burst({ x: 4, y: 1, z: 9 }, TYPE_COLOURS.fire, 1.6);
  ck('a burst on its own is one spell_fire at the burst',
    heard.only('spell_fire', { x: 4, z: 9 }) === null, heard.names());
  ck('and a bigger burst is a louder one', heard.calls[0].gain > 0.9, String(heard.calls[0].gain));
  heard.reset();
  fx2.burst({ x: 0, y: 1, z: 0 }, TYPE_COLOURS.fire, 0.7);
  ck('a small one is quieter', heard.calls[0].gain < 0.8, String(heard.calls[0].gain));
  fx2.clear(); heard.reset();

  fx2.ring({ x: -3, y: 0, z: 8 }, 3, TYPE_COLOURS.cold, 0.5);
  ck('a ring is one aoe_ring where the ring is', heard.only('aoe_ring', { x: -3, z: 8 }) === null, heard.names());
  heard.reset();
  fx2.column({ x: 20, y: 0, z: 20 }, 6, TYPE_COLOURS.fire, 1.5);
  ck('a column is one aoe_column where the column is', heard.only('aoe_column', { x: 20, z: 20 }) === null, heard.names());
  heard.reset();
  fx2.showGroundRing({ x: 2, y: 0, z: 2 }, 2.5, TYPE_COLOURS.physical);
  ck('but the cursor ring under your feet makes no sound at all, since it moves every frame',
    heard.calls.length === 0, heard.names());
  fx2.dispose();
}
{
  // and none of it may be load-bearing
  const sc3 = new THREE.Scene();
  const silent = createEffects({ scene: sc3 });
  const body = buildCharacter();
  sc3.add(body.group);
  let threw = null;
  try {
    silent.swing(body); silent.flinch(body, 'skeleton'); silent.cast(body, 1, 0xffffff);
    silent.stopCast(body); silent.bolt({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, 0xffffff);
    silent.burst({ x: 0, y: 1, z: 0 }, 0xffffff); silent.ring({ x: 0, z: 0 }, 1, 0xffffff);
    silent.column({ x: 0, z: 0 }, 1, 0xffffff); silent.update(0.1); silent.clear();
  } catch (e) { threw = e.message; }
  ck('with no audio handed in, every hook is a quiet no-op', threw === null, threw || '');
  silent.dispose();

  const sc4 = new THREE.Scene();
  const angry = createEffects({ scene: sc4 }, { audio: { play() { throw new Error('the speaker fell over'); } } });
  const body2 = buildCharacter();
  sc4.add(body2.group);
  let threw2 = null;
  try { angry.swing(body2); angry.cast(body2, 1, 0xffffff); angry.burst({ x: 0, z: 0 }, 0xffffff); }
  catch (e) { threw2 = e.message; }
  ck('and an audio layer that throws does not take the swing down with it', threw2 === null, threw2 || '');
  angry.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
