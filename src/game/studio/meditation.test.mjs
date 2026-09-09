import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildStudioCharacter } from './body.js';
import { createPlayer } from '../player.js';
import { playerActor } from '../actor.js';
import { planCharacter } from '../creation.js';
import { APPEARANCE } from '../../mmo/openings.js';
import { createAbilities } from '../abilities_runtime.js';
import { createAbilityHooks } from '../ability_hooks.js';
import { emotes } from '../app/systems/emotes.js';

globalThis.ProgressEvent ||= class {};
const binary = readFileSync('public/studio/models/warrior-base-rigged.glb');
const bank = JSON.parse(readFileSync('public/studio/animations/quaternius-retargeted.json'));
const loadMotionAssets = async () => [binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), bank];

for (const gender of APPEARANCE.genders) {
  const character = planCharacter({ opening: 'mage', name: 'Meditation test', appearance: { gender } }).character;
  const rig = createPlayer(new THREE.Scene(), character.appearance, {
    buildCharacter: look => buildStudioCharacter(look, { classId: 'mage', sourceMotion: true, loadMotionAssets }),
  });
  rig.studio.setEquipment(character.equipment);
  await rig.studio.ready;
  assert.deepEqual(rig.studio.errors, []);
  const actor = playerActor(character, { pos: rig.pos });
  actor.mana = 0;
  const hud = { log() {} };
  const hooks = createAbilityHooks({ character, actor, player: rig, hud });
  const abilities = createAbilities({ character, actor, player: rig, hud, utility: hooks.utility });
  const registry = {
    player: { rig, actor, dying: false },
    combat: { combat: { onHit() {} }, monsters: { actors: () => [] } },
    abilities: { abilities },
    ui: { panelCtx: {}, windows: { register() {} } },
  };
  const ctx = { hud, input: { down: () => false }, get: id => registry[id], has: id => id in registry,
    frame: { now: 10000, nowS: 10, dt: 1 / 60 } };
  const system = emotes.create(ctx);
  function frames(count) {
    for (let i = 0; i < count; i++) {
      ctx.frame.now += 1000 / 60;
      ctx.frame.nowS = ctx.frame.now / 1000;
      rig.update(1 / 60, { x: 0, z: 0, yaw: 0 }, () => 0);
      system.step(ctx.frame);
    }
  }
  frames(2);
  const standingHip = rig.parts.hips.position.y;
  assert.ok(abilities.useById('meditate', ctx.frame.nowS).ok);
  frames(60);
  const seatedHip = rig.parts.hips.position.y;
  assert.equal(system.current, 'sit');
  assert.ok(seatedHip < standingHip * 0.65, `${gender}: standing ${standingHip}, seated ${seatedHip}`);
  rig.group.updateMatrixWorld(true);
  rig.group.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite), object.name));
  const entrance = system.state.at;
  abilities.useById('meditate', ctx.frame.nowS);
  frames(1);
  assert.equal(system.state.at, entrance, 'pressing Meditate again keeps the seated entrance settled');
  actor.mana = actor.maxMana;
  hooks.update(1 / 60, ctx.frame.now, ctx.frame.nowS);
  frames(2);
  assert.equal(system.current, null);
  assert.equal(actor.meditating, null);
  assert.ok(rig.parts.hips.position.y > seatedHip * 1.5, 'the source animation regains the standing body');
  console.log(`${gender} Wizard: standing hip ${standingHip.toFixed(3)}, seated ${seatedHip.toFixed(3)}, restored ${rig.parts.hips.position.y.toFixed(3)}`);
  rig.studio.dispose();
}
