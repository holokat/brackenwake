import * as THREE from 'three';
import {shieldContactWorld} from './shield-contact.js';
import {createAbilityVfx, createElementalSpellVfx, createSpellOrb, createCombatVfx, ATTACK_SAMPLES, MOVE_BY_ID, SPELL_MOTIONS} from '../vendor/source-library.js';
import {staffFocusWorld} from './staff-focus.js';
import {createHealerVfx} from './healer/healer-vfx.js';

const SOURCE_HIPS_HEIGHT = .8799999952316284;
const TEXTURE_FILES = ['spell-fire-explosion-atlas.png', 'spell-smoke-atlas.png'];

async function loadTextures() {
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(TEXTURE_FILES.map(name =>
    loader.loadAsync(new URL(`../../studio/public/vfx/${name}`, import.meta.url).href)));
  if (results.some(result => result.status === 'rejected')) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw results.find(result => result.status === 'rejected').reason;
  }
  const [fire, smoke] = results.map(result => result.value);
  for (const texture of [fire, smoke]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
  }
  return {fire, smoke, dispose() { fire.dispose(); smoke.dispose(); }};
}

function adaptWorldUnits(root, scale) {
  const lights = [], materials = new Set();
  root.traverse(object => {
    if (object.isPointLight) lights.push({object, intensity: object.intensity, distance: object.distance});
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.isShaderMaterial) materials.add(material);
    }
  });
  for (const material of materials) {
    // Shader billboards construct camera-space quads, so their winding does not
    // inherit the reflected actor matrix. Ordinary meshes keep normal culling.
    if (/(?:center(?:View)?|c)\.xy\s*\+=/.test(material.vertexShader)) material.side = THREE.DoubleSide;
    material.vertexShader = material.vertexShader
      .replace('c.xy+=position.xy;', 'c.xy+=position.xy*length(modelMatrix[0].xyz);')
      .replace('size*650./max(.1,-p.z)', 'size*650.*length(modelMatrix[0].xyz)/max(.1,-p.z)');
  }
  // Three light distance and intensity are world quantities, unlike geometry.
  // Restore source units before sampling and convert once afterward, including
  // lights whose authors change their cutoff distance during a summon.
  return callback => {
    for (const light of lights) {
      light.object.intensity = light.intensity; light.object.distance = light.distance;
    }
    try { return callback(); }
    finally {
      for (const light of lights) {
        light.intensity = light.object.intensity; light.distance = light.object.distance;
        light.object.intensity *= scale * scale; light.object.distance *= scale;
      }
    }
  };
}

function createCombatTimeline({root, actor, sockets, hand, tip, hasWeapon, pose, scale, eventPhases, motionDurations}) {
  const layer = new THREE.Group(); layer.name = 'LowpolySourceCombatEffects'; root.add(layer);
  const proxy = node => ({
    updateWorldMatrix() { node.updateWorldMatrix(true, false); },
    getWorldPosition(out) { return layer.worldToLocal(node.getWorldPosition(out)); },
  });
  const sourceSockets = new Map([...sockets].map(([name, node]) => [name, proxy(node)]));
  const impact = new THREE.Vector3(), convertedMaterials = new WeakSet();
  let currentMove = '', previousTime = -1, disposed = false;
  const position = out => layer.worldToLocal(actor.localToWorld(tip(out)));
  const create = () => createCombatVfx(layer, proxy(actor), sourceSockets,
    () => position(impact).clone(), (base, end) => {
      if (!hasWeapon() || !['light-attack', 'heavy-attack', 'two-handed-strike', 'whirlwind'].includes(currentMove)) return false;
      layer.worldToLocal(actor.localToWorld(hand(base))); position(end); return true;
    });
  let vfx = create();
  function reset() { vfx.dispose(); vfx = create(); currentMove = ''; previousTime = -1; }
  function trigger(type) {
    vfx.trigger(type);
    layer.traverse(object => {
      if (object.material?.isPointsMaterial && !convertedMaterials.has(object.material)) {
        object.material.size *= scale; convertedMaterials.add(object.material);
      }
    });
  }
  return {
    reset,
    update(move, phase, delta) {
      if (disposed) return;
      const definition = MOVE_BY_ID.get(move), duration = motionDurations?.get(move) ?? definition?.duration ?? 1;
      const time = phase * duration, overrides = eventPhases?.get(move);
      const reconstruct = delta === undefined || move !== currentMove || time < previousTime;
      if (reconstruct) reset();
      currentMove = move;
      const events = (definition?.events ?? []).map(event => ({...event,
        at: (overrides?.[event.type] ?? event.at / definition.duration) * duration,
      })).filter(event => event.at > previousTime && event.at <= time).sort((a, b) => a.at - b.at);
      if (reconstruct && events.length) {
        let cursor = 0, eventIndex = 0;
        const windowStart = Math.max(0, time - .12);
        while (eventIndex < events.length && events[eventIndex].at <= windowStart) {
          const event = events[eventIndex++];
          pose(move, event.at / duration); vfx.update(event.at - cursor); trigger(event.type); cursor = event.at;
        }
        pose(move, windowStart / duration); vfx.update(windowStart - cursor); cursor = windowStart;
        // Recreate the short authored trail from actual poses when scrubbing.
        while (cursor < time) {
          const next = Math.min(time, cursor + 1 / 60);
          while (eventIndex < events.length && events[eventIndex].at <= next) {
            const event = events[eventIndex++];
            pose(move, event.at / duration); vfx.update(event.at - cursor);
            trigger(event.type); cursor = event.at;
          }
          pose(move, next / duration); vfx.update(next - cursor); cursor = next;
        }
      } else {
        for (const event of events) trigger(event.type);
        vfx.update(Number.isFinite(delta) ? Math.max(0, delta) : 0);
      }
      pose(move, phase); previousTime = time;
    },
    dispose() { if (!disposed) { disposed = true; vfx.dispose(); layer.removeFromParent(); } },
  };
}

/** Preserve the original Y-up effects in their own frame inside the Z-up editor. */
export async function createSourceEffects(stage, actor, options = {}) {
  const group = actor.group, rig = actor.rig;
  if (!stage.scene || !group || !rig?.joints.handR || !rig.joints.handL) {
    throw new Error('Source effects require a scene and a rigged lowpoly character.');
  }
  const scale = options.scale ?? rig.rest.hips.p.z / SOURCE_HIPS_HEIGHT;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Effect scale must be positive and finite.');
  const textures = options.textures ?? await loadTextures();
  const ownsTextures = !options.textures;
  const root = new THREE.Group();
  root.name = 'LowpolySourceEffects';
  root.matrixAutoUpdate = false;
  // Source left +X, up +Y, front +Z become native left -X, up +Z, front -Y.
  const basis = new THREE.Matrix4().set(-scale, 0, 0, 0, 0, 0, -scale, 0, 0, scale, 0, 0, 0, 0, 0, 1);
  root.matrix.copy(basis);
  stage.scene.add(root);
  const sourceActor = new THREE.Group();
  sourceActor.name = 'LowpolySourceEffectActor';
  sourceActor.matrixAutoUpdate = false;
  root.add(sourceActor);
  const inverse = new THREE.Matrix4(), point = new THREE.Vector3(), elbow = new THREE.Vector3();
  const handMidpoint = new THREE.Vector3(), orbRelease = new THREE.Vector3();
  const rangedFrameInverse = new THREE.Matrix4(), rangedTarget = new THREE.Vector3(), rangedDirection = new THREE.Vector3();
  const projectileFrameInverse = new THREE.Matrix4(), projectileDirection = new THREE.Vector3();
  const shieldImpact = new THREE.Vector3();
  const weaponTips = new WeakMap();
  let ability = null, disposed = false, previousMove = '', previousPhase = -1, orbReleased = false, previousAbilityTime = -1;
  let hasRangedAim = false, trainingTarget, trainingTargetRest;

  function syncFrame() {
    group.updateWorldMatrix(true, true);
    root.updateWorldMatrix(true, false);
    inverse.copy(root.matrixWorld).invert();
    sourceActor.matrix.copy(inverse).multiply(group.matrixWorld).multiply(basis);
    sourceActor.matrixWorldNeedsUpdate = true;
    sourceActor.updateWorldMatrix(true, false);
  }
  function handPosition(side, out) {
    rig.joints[`hand${side}`].getWorldPosition(out);
    return sourceActor.worldToLocal(out);
  }
  function castingStaff() {
    return (group.userData.loadout ?? []).find(item => item.visible && item.userData.slot === 'weapon' &&
      ['staff', 'bone_staff'].includes(item.userData.itemId) && ['forward', 'raised'].includes(item.userData.staffPose));
  }
  function castPosition(out) {
    if (staffFocusWorld(castingStaff(), out)) return sourceActor.worldToLocal(out);
    handPosition('L', out); handPosition('R', point);
    return out.add(point).multiplyScalar(.5);
  }
  function mountedWeapon() {
    return (group.userData.loadout ?? []).find(object => object.visible && object.userData.slot === 'weapon' && (
      object.userData.twoHandedGrip?.kind === 'melee' || object.parent === rig.joints.handR &&
      !['bow', 'crossbow'].includes(object.userData.twoHandedGrip?.kind)
    ));
  }
  function rangedWeapon() {
    return (group.userData.loadout ?? []).find(object => object.visible && ['bow', 'crossbow'].includes(object.userData.twoHandedGrip?.kind));
  }
  function rangedOrigin(weapon, out) {
    if (weapon.userData.twoHandedGrip.kind === 'crossbow') {
      const rail = weapon.getObjectByName('Crossbow rail');
      if (rail) {
        if (!rail.geometry.boundingBox) rail.geometry.computeBoundingBox();
        const box = rail.geometry.boundingBox; box.getCenter(out); out.y = box.min.y;
        return rail.localToWorld(out);
      }
    }
    const arrow = weapon.userData.bowArrow;
    if (weapon.userData.twoHandedGrip.kind === 'bow' && arrow?.tip) {
      weapon.localToWorld(out.fromArray(arrow.tip));
      // The source arrow's root lies .105 source units behind its point.
      // Match the actual nocked point when handing over to the flying arrow.
      projectileFrameInverse.copy(sourceActor.matrixWorld).invert();
      projectileDirection.fromArray(arrow.direction).transformDirection(weapon.matrixWorld).transformDirection(projectileFrameInverse);
      out.applyMatrix4(projectileFrameInverse).addScaledVector(projectileDirection, -.105);
      return sourceActor.localToWorld(out);
    }
    return weapon.localToWorld(out.fromArray(weapon.userData.twoHandedGrip.left));
  }
  function captureRangedAim() {
    const weapon = ability?.visual.pose === 'bow' ? rangedWeapon() : null;
    hasRangedAim = !!weapon;
    if (!weapon) return;
    rangedOrigin(weapon, rangedTarget);
    rangedDirection.set(...(weapon.userData.twoHandedGrip.kind === 'bow' ? [1, 0, 0] : [0, -1, 0])).transformDirection(weapon.matrixWorld);
    rangedTarget.addScaledVector(rangedDirection, 3 * scale).applyMatrix4(rangedFrameInverse);
    // Keep the training target grounded while moving it onto the firing line.
    trainingTarget.position.x = rangedTarget.x; trainingTarget.position.z = rangedTarget.z;
  }
  function strikeTip(out) {
    if(ability?.id==='shield-bash'){
      const shield=(group.userData.loadout??[]).find(item=>item.userData.gripSocket?.kind==='shield');
      if(shieldContactWorld(shield,out))return sourceActor.worldToLocal(out);
      return handPosition('L',out);
    }
    const weapon = mountedWeapon();
    if (weapon) {
      // Read the equipped geometry once; moving bones and changing loadouts remain live.
      let tip = weaponTips.get(weapon);
      if (!tip) {
        tip = new THREE.Vector3();
        const worldInverse = new THREE.Matrix4().copy(weapon.matrixWorld).invert();
        let distance = -1;
        weapon.traverse(mesh => {
          if (!mesh.isMesh || !mesh.visible) return;
          const positions = mesh.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(worldInverse);
            if (point.lengthSq() > distance) { distance = point.lengthSq(); tip.copy(point); }
          }
        });
        weaponTips.set(weapon, tip);
      }
      return sourceActor.worldToLocal(out.copy(tip).applyMatrix4(weapon.matrixWorld));
    }
    rig.joints.handR.getWorldPosition(out);
    rig.joints.forearmR.getWorldPosition(elbow);
    point.subVectors(out, elbow).normalize();
    out.addScaledVector(point, .55 * scale);
    return sourceActor.worldToLocal(out);
  }
  function captureShieldImpact() {
    if (ability?.id !== 'shield-bash') return;
    strikeTip(shieldImpact); sourceActor.localToWorld(shieldImpact);
    shieldImpact.applyMatrix4(rangedFrameInverse);
  }
  // The elemental implementations read world-space socket objects. Native bones
  // already have the correct world positions, so no duplicate skeleton is needed.
  const sockets = new Map([
    ['Socket_HandVFX_Left', rig.joints.handL], ['Socket_HandVFX_Right', rig.joints.handR],
    ['Socket_Weapon_Left', rig.joints.handL], ['Socket_Weapon_Right', rig.joints.handR],
    ['Socket_FootVFX_Left', rig.joints.footL], ['Socket_FootVFX_Right', rig.joints.footR],
    ['Socket_HeadVFX', rig.joints.head], ['Socket_RootVFX', rig.joints.hips],
  ]);
  // Forward spells average both source palms. Use the same physical focus for
  // those sockets; healing keeps its free left hand and channels from the stone.
  // Combat retains the native socket map above, including staff melee trails.
  const spellSocket = (side, support = false) => ({
    getWorldPosition(out) {
      const staff = castingStaff();
      if ((!support || staff?.userData.staffPose === 'forward') && staffFocusWorld(staff, out)) return out;
      return rig.joints[`hand${side}`].getWorldPosition(out);
    },
  });
  const spellSockets = new Map(sockets);
  spellSockets.set('Socket_HandVFX_Left', spellSocket('L', true));
  spellSockets.set('Socket_HandVFX_Right', spellSocket('R'));
  spellSockets.set('Socket_Weapon_Right', spellSocket('R'));
  let abilityEffects, elemental, orb, combat, healer;
  let healerActive = false;
  try {
    syncFrame();
    abilityEffects = createAbilityVfx(sourceActor, {
      hand(out) {
        if(ability?.id==='shield-bash')return strikeTip(out);
        if (ability?.visual.pose === 'bow' || ability?.id === 'disengage') {
          const ranged = rangedWeapon();
          if (ranged) return sourceActor.worldToLocal(rangedOrigin(ranged, out));
          const bow = (group.userData.loadout ?? []).find(object => object.name === 'bow' && object.visible);
          if (bow) return handPosition(bow.parent === rig.joints.handL ? 'L' : 'R', out);
          let defaultBow = false;
          group.traverse(object => { if (object.isSkinnedMesh && object.visible && /bow/i.test(object.name)) defaultBow = true; });
          return handPosition(defaultBow ? 'R' : 'L', out);
        }
        return staffFocusWorld(castingStaff(), out) ? sourceActor.worldToLocal(out) : handPosition('R', out);
      },
      target(current, out) {
        if (current.id === 'shield-bash') out.copy(shieldImpact);
        else if (current.visual.pose === 'bow' && hasRangedAim) out.copy(rangedTarget);
      },
      strikeTip, nativeElementals: () => true,
    }, textures);
    healer = createHealerVfx(sourceActor, {
      actor,
      hand: out => ability?.id === 'lay-on-hands' ? handPosition('L', out)
        : staffFocusWorld(castingStaff(), out) ? sourceActor.worldToLocal(out) : handPosition('R', out),
      weaponBase: out => {
        const weapon = mountedWeapon();
        return weapon ? sourceActor.worldToLocal(weapon.getWorldPosition(out)) : handPosition('R', out);
      },
      weaponTip: strikeTip,
    });
    trainingTarget = sourceActor.getObjectByName('TrainingTarget1');
    trainingTargetRest = trainingTarget.position.clone();
    elemental = createElementalSpellVfx(sourceActor, spellSockets, {textures});
    orb = createSpellOrb(sourceActor);
    combat = createCombatTimeline({root, actor: sourceActor, sockets, scale,
      eventPhases: options.eventPhases, motionDurations: options.motionDurations,
      hand: out => handPosition('R', out), hasWeapon: () => !!mountedWeapon(),
      tip: out => mountedWeapon() ? strikeTip(out) : handPosition('R', out),
      pose(move, phase) { options.sampleMotion?.(move, phase); syncFrame(); },
    });
  } catch (error) {
    abilityEffects?.dispose(); elemental?.dispose(); orb?.dispose(); combat?.dispose(); healer?.dispose();
    root.removeFromParent();
    if (ownsTextures) textures.dispose();
    throw error;
  }
  const sampleInSourceUnits = adaptWorldUnits(root, scale);

  function reset() {
    if (disposed) return;
    ability = null; previousMove = ''; previousPhase = -1; orbReleased = false; previousAbilityTime = -1;
    hasRangedAim = false; healerActive = false; trainingTarget.position.copy(trainingTargetRest);
    sampleInSourceUnits(() => { abilityEffects.reset(); healer.reset(); elemental.reset(); orb.update('idle', 0); });
    combat.reset();
    root.visible = false;
  }
  reset();
  return {
    root, sourceActor, scale, healer,
    begin(nextAbility) {
      if (disposed) return;
      reset(); ability = nextAbility; syncFrame(); root.visible = true;
      rangedFrameInverse.copy(sourceActor.matrixWorld).invert(); captureRangedAim(); captureShieldImpact();
      sampleInSourceUnits(() => {
        healerActive = healer.begin(nextAbility);
        if (healerActive) healer.sample(0);
        else { abilityEffects.begin(nextAbility); abilityEffects.sample(0); }
      });
      previousAbilityTime = 0;
    },
    captureRelease() {
      if (disposed || !ability) return;
      syncFrame(); captureRangedAim(); captureShieldImpact();
      if (healerActive) healer.captureRelease(); else abilityEffects.captureRelease();
    },
    captureMotionSample(index) {
      if (disposed || !ability) return;
      if (!Number.isInteger(index) || index < 0 || index >= ATTACK_SAMPLES) {
        throw new RangeError(`Motion sample must be between 0 and ${ATTACK_SAMPLES - 1}.`);
      }
      syncFrame(); if (!healerActive) abilityEffects.captureMotionSample(index);
    },
    sample(seconds) {
      if (disposed || !ability) return;
      if (!Number.isFinite(seconds)) throw new TypeError('Ability time must be finite.');
      syncFrame();
      const time = Math.max(0, seconds);
      // Prime original stateful signature effects on a backward seek while keeping
      // their measured release and strike anchors in the original cast frame.
      sampleInSourceUnits(() => {
        if (healerActive) healer.sample(time);
        else {
          if (time < previousAbilityTime) abilityEffects.sample(0);
          abilityEffects.sample(time);
        }
      });
      previousAbilityTime = time;
    },
    updateMotion(move, phase, deltaSeconds) {
      if (disposed) return;
      if (!Number.isFinite(phase)) throw new TypeError('Motion phase must be finite.');
      const progress = THREE.MathUtils.clamp(phase, 0, 1);
      const restarted = move !== previousMove || progress < previousPhase;
      if (restarted) orbReleased = false;
      syncFrame(); root.visible = true;
      combat.update(move, progress, deltaSeconds);
      const reconstruct = (deltaSeconds === undefined || restarted) && options.sampleMotion;
      if (reconstruct && move === 'cast' && progress > .624) {
        options.sampleMotion(move, .624); syncFrame();
        castPosition(orbRelease);
        orbReleased = true;
        options.sampleMotion(move, progress); syncFrame();
      }
      sampleInSourceUnits(() => {
        if (ability) { ability = null; abilityEffects.reset(); healer.reset(); healerActive = false; }
        if (progress < previousPhase && move === previousMove) elemental.reset();
        orb.update(move, progress);
        // A seek reconstructs the original sequence. Live deltas preserve residuals.
        const spell = SPELL_MOTIONS[move];
        if (reconstruct && spell) {
          elemental.reset(); elemental.update(move, 0, 0);
          for (const release of spell.release) if (release / spell.duration <= progress) {
            options.sampleMotion(move, release / spell.duration); syncFrame();
            elemental.update(move, release / spell.duration, 0);
          }
          options.sampleMotion(move, progress); syncFrame(); elemental.update(move, progress, 0);
        } else elemental.update(move, progress, deltaSeconds);
      });
      if (move === 'cast' && orb.root.visible) {
        castPosition(handMidpoint);
        const forwardTravel = orb.root.position.z - .46;
        if (progress <= .624 || !orbReleased) orbRelease.copy(handMidpoint);
        orbReleased = progress > .624;
        orb.root.position.copy(orbReleased ? orbRelease : handMidpoint);
        orb.root.position.z += forwardTravel;
        orb.root.updateWorldMatrix(true, true);
      }
      previousMove = move; previousPhase = progress;
    },
    refreshFrame() {
      if (disposed || !ability || !healerActive) return;
      syncFrame();
      sampleInSourceUnits(() => healer.sample(Math.max(0, previousAbilityTime)));
    },
    samplePresentation(worldPosition) {
      return disposed ? 0 : elemental.samplePresentation(worldPosition);
    },
    reset,
    dispose() {
      if (disposed) return;
      reset(); disposed = true;
      abilityEffects.dispose(); elemental.dispose(); orb.dispose(); combat.dispose(); healer.dispose();
      root.removeFromParent(); root.clear();
      if (ownsTextures) textures.dispose();
    },
  };
}
