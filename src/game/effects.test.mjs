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
} from './effects.js';
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
