// Chain Lightning: four discrete strikes propagating target to target, each
// with five secondary forks and its own contact flash.
//
// PORTED from the studio's src/vfx/abilities/createChainLightning.ts.
//
// THE ONE CHANGE: the studio struck three fixed training dummies. `sample`
// here takes the LINKS the game's own chain resolved, in the actor's local
// frame, so the bolt goes where the damage went. Four links is the pool, which
// is the studio's number and matches abilities.js's Chain Lightning: one
// target plus three jumps.

import * as THREE from 'three';
import { createSpellRibbon, createSpellGlow } from './glow.js';
import { createSpellParticleLayer } from './particles.js';
import { writeHierarchicalBolt } from './bolt.js';

export const CHAIN_LINKS = 4;
const STRANDS = 24;

export function createChainLightning(parent) {
  const root = new THREE.Group();
  root.name = 'BranchingChainLightning';
  root.visible = false;
  parent.add(root);
  const strands = Array.from({ length: STRANDS }, (unused, i) => {
    const core = createSpellRibbon('#e4f6ff', 33, i % 6 === 0 ? 0.015 : 0.005);
    const glow = createSpellRibbon('#408bff', 33, i % 6 === 0 ? 0.050 : 0.018);
    core.uniforms.uColor.value.multiplyScalar(3);
    glow.uniforms.uColor.value.multiplyScalar(1.6);
    root.add(glow.mesh, core.mesh);
    return { core, glow, points: Array.from({ length: 33 }, () => new THREE.Vector3()) };
  });
  const flashes = Array.from({ length: CHAIN_LINKS }, () => {
    const flash = createSpellGlow('#a3d8ff', 0.34);
    root.add(flash.mesh);
    return flash;
  });
  const ions = createSpellParticleLayer({ capacity: 128, additive: true, hdr: 3.2 });
  root.add(ions.mesh);
  const light = new THREE.PointLight('#6ea6ff', 0, 6, 2);
  root.add(light);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const point = new THREE.Vector3();
  const white = new THREE.Color('#d6f1ff');
  const links = Array.from({ length: CHAIN_LINKS }, () => new THREE.Vector3());
  let linkCount = 0;

  function draw(index, seed, amplitude, alpha, time) {
    const strand = strands[index];
    writeHierarchicalBolt(strand.points, start, end, seed, amplitude, 0.57);
    strand.core.update(strand.points);
    strand.glow.update(strand.points);
    strand.core.mesh.visible = alpha > 0.003;
    strand.glow.mesh.visible = alpha > 0.003;
    strand.core.uniforms.uAlpha.value = alpha;
    strand.glow.uniforms.uAlpha.value = alpha * 0.45;
    strand.core.uniforms.uTime.value = time;
    strand.glow.uniforms.uTime.value = time;
  }

  return {
    root,
    get links() { return linkCount; },
    /** Where the chain went, in the actor's local frame. Up to four points. */
    setLinks(points) {
      linkCount = Math.min(CHAIN_LINKS, (points && points.length) || 0);
      for (let i = 0; i < linkCount; i += 1) links[i].copy(points[i]);
      return this;
    },
    setPalette(palette) {
      if (!palette) return this;
      const core = new THREE.Color(palette.accent);
      const glow = new THREE.Color(palette.color);
      for (let i = 0; i < strands.length; i += 1) {
        strands[i].core.uniforms.uColor.value.copy(core).multiplyScalar(3);
        strands[i].glow.uniforms.uColor.value.copy(glow).multiplyScalar(1.6);
      }
      for (const flash of flashes) flash.uniforms.uColor.value.copy(glow);
      light.color.copy(glow);
      white.copy(core);
      return this;
    },
    hide() { root.visible = false; light.intensity = 0; },
    sample(active, time, release, origin) {
      root.visible = active && linkCount > 0;
      if (!root.visible) { light.intensity = 0; return; }
      for (const strand of strands) { strand.core.mesh.visible = false; strand.glow.mesh.visible = false; }
      for (const flash of flashes) flash.mesh.visible = false;
      let count = 0;
      let peak = 0;
      const elapsed = time - release;
      for (let link = 0; link < linkCount; link++) {
        const age = elapsed - link * 0.115;
        const pulse = (age >= 0 && age < 0.72)
          ? (1 - THREE.MathUtils.smoothstep(age, 0.42, 0.72))
            * (age < 0.07 ? 1 : 0.24 + 0.76 * Math.pow(Math.max(0, Math.cos((age - 0.19) * 37)), 6))
          : 0;
        peak = Math.max(peak, pulse);
        start.copy(link ? links[link - 1] : origin);
        end.copy(links[link]);
        draw(link * 6, 71 + link * 121 + Math.floor(Math.max(0, age) * 14), 0.22, pulse, time);
        const main = strands[link * 6];
        for (let fork = 1; fork < 6; fork++) {
          const attachment = 5 + fork * 4;
          start.copy(main.points[attachment]);
          end.copy(start).add(point.set(Math.sin(fork * 3.7 + link) * 0.35, (fork % 2 ? 1 : -1) * 0.25, Math.cos(fork * 2.3) * 0.27));
          draw(link * 6 + fork, 111 + link * 31 + fork * 17 + Math.floor(Math.max(0, age) * 14), 0.09, pulse * (0.65 - fork * 0.06), time);
        }
        const flash = flashes[link];
        flash.mesh.visible = pulse > 0;
        flash.mesh.position.copy(links[link]);
        flash.uniforms.uAlpha.value = pulse * 0.56;
        flash.uniforms.uIntensity.value = 2.7;
        if (age >= 0 && age < 0.85) for (let i = 0; i < 32; i++) {
          const flight = age - (i % 4) * 0.012;
          if (flight < 0) continue;
          const angle = i * 2.399;
          point.copy(links[link]);
          point.x += Math.cos(angle) * flight * (0.7 + (i % 3) * 0.2);
          point.z += Math.sin(angle) * flight * 0.85;
          point.y += flight * (0.8 + (i % 4) * 0.2) - 3.8 * flight * flight;
          point.y = Math.max(0.03, point.y);
          ions.setParticle(count++, point, 0.008 + (i % 3) * 0.002, angle, white, Math.max(0, 1 - flight / 0.8), 0, 2.8);
        }
      }
      ions.commit(count);
      light.position.copy(links[Math.min(1, linkCount - 1)]);
      light.intensity = peak * 2.2;
    },
    dispose() {
      for (const s of strands) { s.core.dispose(); s.glow.dispose(); }
      for (const f of flashes) f.dispose();
      ions.dispose();
      light.dispose();
      if (root.parent) root.parent.remove(root);
    },
  };
}
