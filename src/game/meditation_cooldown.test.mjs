import assert from 'node:assert/strict';
import test from 'node:test';
import { createAbilities } from './abilities_runtime.js';
import { createAbilityHooks } from './ability_hooks.js';

function rig() {
  const character = { skills: { meditation: 100 }, bar: ['meditate', 'meditate'] };
  const actor = { id: 'player', health: 100, maxHealth: 100, mana: 0, maxMana: 100, stamina: 100, maxStamina: 100, buffs: [], status: [], pos: { x: 0, y: 0, z: 0 } };
  const player = { speed: 0, pos: actor.pos };
  const hooks = createAbilityHooks({ character, actor, player });
  let starts = 0;
  const abilities = createAbilities({ character, actor, player, utility: { ...hooks.utility, meditate(effect, ctx) { starts++; return hooks.utility.meditate(effect, ctx); } } });
  return { actor, player, hooks, abilities, starts: () => starts };
}

test('1,000 Meditate presses across duplicate slots and direct use start recovery once in three seconds', () => {
  const r = rig(); let accepted = 0, meditation;
  for (let press = 0; press < 1000; press++) {
    const now = press * .003;
    const result = press % 3 === 0 ? r.abilities.useById('meditate', now) : r.abilities.use(press % 2, now);
    if (result.ok) accepted++;
    if (press === 0) meditation = r.actor.meditating;
    assert.equal(r.actor.meditating, meditation, 'refused presses do not restart recovery');
  }
  assert.equal(accepted, 1); assert.equal(r.starts(), 1);
  const cells = r.abilities.barView(1.5).slice(0, 2);
  assert(cells.every(cell => cell.cooldownLeft === 1.5 && cell.ability.cooldown === 3), 'both hotbar slots show the same remaining cooldown');
  assert.equal(r.abilities.useById('meditate', 2.999).ok, false);
  assert.equal(r.abilities.useById('meditate', 3).ok, true);
  assert.equal(r.starts(), 2);
});

test('damage interrupts meditation without allowing immediate reactivation', () => {
  const r = rig(); assert(r.abilities.use(0, 0).ok);
  r.abilities.onDamaged(1, .2); assert.equal(r.actor.meditating, null);
  assert.equal(r.abilities.use(1, .201).ok, false);
  assert.equal(r.abilities.cooldownLeft('meditate', .2), 2.8);
  assert(r.abilities.use(1, 3).ok); assert(r.actor.meditating);
});

test('a moving player is refused without starting the cooldown', () => {
  const r = rig(); r.player.speed = 2;
  assert.equal(r.abilities.use(0, 0).ok, false);
  assert.equal(r.abilities.cooldownLeft('meditate', 0), 0);
  r.player.speed = 0; assert(r.abilities.use(0, .1).ok);
  assert.equal(r.abilities.cooldownLeft('meditate', .1), 3);
});
