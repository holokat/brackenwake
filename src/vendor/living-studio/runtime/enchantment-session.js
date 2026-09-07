import * as THREE from 'three';
import {createWeaponEnchantment} from './enchantments/weapon-enchantment.js';

/** Owns one replaceable VFX instance. Weapon resources are borrowed, never disposed here. */
export function createEnchantmentSession({scene, createEffect = createWeaponEnchantment}) {
  let effect = null, target = null, key = '', elapsed = 0, playing = true, disposed = false;
  let previousMotion = null;
  const impact = new THREE.Vector3();
  let impactAt = -Infinity;

  function reset() { effect?.reset(); previousMotion = null; impactAt = -Infinity; }
  function clear() {
    effect?.dispose(); effect = null; target = null; key = '';
    previousMotion = null; impactAt = -Infinity;
  }
  return {
    get effect() { return effect; },
    get target() { return target; },
    get playing() { return playing; },
    get time() { return elapsed; },
    get active() { return !!effect; },
    get presentation() {
      const age = elapsed - impactAt;
      return effect && age >= 0 && age < .7
        ? {position: impact, strength: .55 * Math.exp(-age * 5), radius: .16} : null;
    },
    bind(nextTarget, selection = {id:'none',level:1}) {
      if (disposed) return false;
      const nextKey = selection.id + ':' + selection.level;
      if (nextTarget === target && nextKey === key) return false;
      clear();
      target = nextTarget; key = nextKey;
      if (target && selection.id !== 'none') {
        effect = createEffect({target,scene,id:selection.id,level:selection.level,seed:73});
        effect.update({time:elapsed,delta:0});
      }
      return true;
    },
    update(delta = 0, motion = null) {
      if (disposed || !effect) return false;
      const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0;
      // A scrub or a new clip starts a fresh history, never a streak across unrelated poses.
      const completed = motion && previousMotion?.playing && !motion.playing && motion.duration > 0 && motion.time >= motion.duration;
      const explicitSeek = motion?.seekVersion !== previousMotion?.seekVersion;
      if (motion && previousMotion && (motion.id !== previousMotion.id || motion.time < previousMotion.time || explicitSeek ||
        (!motion.playing && motion.time !== previousMotion.time && !completed))) reset();
      if (playing) elapsed += dt;
      effect.update({time:elapsed,delta:playing ? dt : 0});
      if (playing && (motion?.playing || completed) && previousMotion?.id === motion?.id) {
        const contacts = motion.impactTimes || [motion.impactTime];
        for (const contact of contacts) if (Number.isFinite(contact) && previousMotion.time < contact && motion.time >= contact) this.triggerImpact();
      }
      previousMotion = motion ? {...motion} : null;
      return playing;
    },
    triggerImpact(position) {
      if (!effect || disposed) return false;
      if (position) impact.copy(position); else effect.tipWorld(impact);
      if (![impact.x,impact.y,impact.z].every(Number.isFinite)) return false;
      impactAt = elapsed;
      effect.triggerImpact(impact, elapsed);
      effect.update({time:elapsed,delta:0});
      return true;
    },
    setPlaying(value) {
      if (playing !== !!value) effect?.resetTrail();
      playing = !!value;
    },
    seek(time) {
      if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid enchantment preview time');
      elapsed = time; reset(); effect?.update({time:elapsed,delta:0});
    },
    reset,
    clear,
    dispose() { if (!disposed) { clear(); disposed = true; } },
  };
}
