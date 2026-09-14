import * as THREE from 'three';
import {
  BLOOD_PARTICLE_CAP, BLOOD_SPLAT_CAP, BLOOD_SPLAT_LIFE,
  bloodProfile, isBloodImpact, bloodBurstPlan, splatGeometry, createBloodEffects,
} from './blood_effects.js';
import { createCombat, SWING_LAND_S } from './combat.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `   ${detail}` : ''}`); };
const actor = (over = {}) => ({ id: 'wolf#1', kind: 'monster', family: 'beast', monsterId: 'wolf', pos: { x: 4, y: 1, z: -3 }, ...over });
const fighter = (over = {}) => ({
  id: 'fighter', kind: 'monster', family: 'beast', monsterId: 'wolf', name: 'Wolf', pos: { x: 0, y: 0, z: 0 }, yaw: 0,
  stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 }, skills: { wrestling: 50, tactics: 0, anatomy: 0, parrying: 0, magery: 0 },
  bonuses: {}, ar: 0, resists: {}, weapon: { skill: 'wrestling', minDamage: 10, maxDamage: 10, speed: 2, weight: 3, damageType: 'physical', reach: 2 },
  health: 100, maxHealth: 100, mana: 50, maxMana: 50, stamina: 100, maxStamina: 100, buffs: [], status: {}, faction: 'hostile', ai: null, ...over,
});

{
  check('humanoids have blood', !!bloodProfile(actor({ family: 'humanoid' })));
  check('spiders use their own green ichor', bloodProfile(actor({ family: 'vermin', monsterId: 'giantSpider' }))?.colour === 0x58793c);
  check('undead, constructs and elementals do not bleed',
    !bloodProfile(actor({ family: 'undead' })) && !bloodProfile(actor({ family: 'construct' })) && !bloodProfile(actor({ family: 'elemental' })));
  check('an incorporeal note also suppresses blood', !bloodProfile(actor({ family: 'beast', notes: ['incorporeal50'] })));
  check('zero damage, non-impact damage and a bloodless body are not impacts',
    !isBloodImpact({ kind: 'melee', damage: 0, defender: actor() })
    && !isBloodImpact({ kind: 'fall', damage: 4, defender: actor() })
    && !isBloodImpact({ kind: 'spell', damage: 4, defender: actor({ family: 'undead' }) }));
  check('a real positive-damage combat resolution is an impact', isBloodImpact({ kind: 'melee', damage: 1, defender: actor() }));
}

{
  const one = bloodBurstPlan({ damage: 24, seed: 1234 });
  const again = bloodBurstPlan({ damage: 24, seed: 1234 });
  const heavy = bloodBurstPlan({ damage: 90, seed: 3 });
  check('the burst plan is deterministic for a combat event', JSON.stringify(one) === JSON.stringify(again));
  check('a landed blow makes a bounded spray and stain', one.particles.length >= 4 && one.particles.length <= 12 && one.splats.length === 2,
    `${one.particles.length} droplets, ${one.splats.length} stains`);
  check('even a huge hit cannot exceed the particle budget per burst', heavy.particles.length === 12);
  const geo = splatGeometry();
  check('a ground splat is an irregular flat fan, not a billboard square', geo.index.count / 3 === 13 && geo.attributes.position.count === 14);
  geo.dispose();
}

{
  const scene = new THREE.Scene();
  const blood = createBloodEffects(scene, { heightAt: () => 2.5, particleCap: 8, splatCap: 3 });
  check('blood owns exactly two instanced meshes under one scene group', blood.root.children.length === 2 && scene.children.includes(blood.root));
  check('the fixed test pools are the requested capacities and begin empty',
    blood.capacity.particles === 8 && blood.capacity.splats === 3 && blood.droplets.count === 0 && blood.stains.count === 0,
    `${blood.capacity.particles} droplets, ${blood.capacity.splats} stains`);
  const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  blood.stains.material.onBeforeCompile(shader);
  check('stains carry a per-instance fade into the real basic shader',
    shader.vertexShader.includes('aBloodFade') && shader.fragmentShader.includes('diffuseColor.a *= vBloodFade'));
  blood.clear();
  const hit = { now: 100, kind: 'melee', damage: 30, attacker: { id: 'you' }, defender: actor() };
  check('a successful hit enters the real pools', blood.hit(hit) && blood.particleCount > 0 && blood.splatCount === 2);
  blood.update(0.1);
  check('the renderer compacts active droplets and stains into its fixed meshes', blood.droplets.count === blood.particleCount && blood.stains.count === blood.splatCount);
  for (let i = 0; i < 30; i++) blood.hit({ ...hit, now: 101 + i });
  check('repeated hits never grow either pool', blood.particleCount <= 8 && blood.splatCount <= 3 && blood.stats.evictedParticles > 0 && blood.stats.evictedSplats > 0);
  for (let i = 0; i < Math.ceil((BLOOD_SPLAT_LIFE + 1) / 0.1); i++) blood.update(0.1);
  check('lifetime expiry removes droplets and fading stains', blood.particleCount === 0 && blood.splatCount === 0);
  blood.dispose();
  check('dispose removes the root from the scene', !scene.children.includes(blood.root));
}

// The production seam: combat's resolver emits a resolution only after its
// damage path runs. This drives a real miss, melee hit and physical spell into
// the same listener app/systems/combat.js uses.
{
  const scene = new THREE.Scene();
  const blood = createBloodEffects(scene, { heightAt: () => 0 });
  const missCombat = createCombat({ rng: () => 0.999 });
  missCombat.onResolved(info => blood.hit(info));
  const missA = fighter({ id: 'miss-a', kind: 'player', faction: 'player' }), missB = fighter({ id: 'miss-b', pos: { x: 1, y: 0, z: 0 } });
  missCombat.queueSwing(missA, missB, { now: 0 });
  missCombat.update(0, SWING_LAND_S * 1000);
  check('a real combat miss leaves the blood pool empty', blood.particleCount === 0 && blood.splatCount === 0);

  const combat = createCombat({ rng: () => 0 });
  combat.onResolved(info => blood.hit(info));
  const meleeA = fighter({ id: 'melee-a', kind: 'player', faction: 'player' }), meleeB = fighter({ id: 'melee-b', pos: { x: 1, y: 0, z: 0 } });
  combat.queueSwing(meleeA, meleeB, { now: 0 });
  combat.update(0, SWING_LAND_S * 1000);
  const afterMelee = blood.stats.hits;
  const caster = fighter({ id: 'caster', kind: 'player', faction: 'player' }), target = fighter({ id: 'spell-target', pos: { x: 1, y: 0, z: 0 } });
  combat.queueSpell(caster, { base: [10, 10], damageType: 'physical' }, target, { now: 1000, travel: 0 });
  combat.update(0, 1000);
  check('successful melee and physical spell resolutions both create blood', afterMelee === 1 && blood.stats.hits === 2,
    `${afterMelee} melee, ${blood.stats.hits} total`);
  blood.dispose();
}

check('production capacities stay bounded', BLOOD_PARTICLE_CAP === 96 && BLOOD_SPLAT_CAP === 48);
console.log(`blood effects: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
