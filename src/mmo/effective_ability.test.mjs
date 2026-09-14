import { ABILITIES_BY_ID } from './abilities.js';
import { MODIFIERS } from './talent_modifiers.js';
import { resolveSpell } from './combat_rules.js';
import {
  abilityModifierValues, abilityPreview, effectiveAbility, effectiveActorModifiers,
  modifierCondition, summonModifierValues,
} from './effective_ability.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `   ${detail}` : ''}`); };
const character = {
  opening: 'mage',
  advancement: { allocations: {
    'mage.fire.emberThread': 2,
    'mage.fire.dryKindling': 3,
    'mage.fire.kilnMouth': 1,
    'mage.fire.bankedHeat': 2,
    'mage.arcane.greenGlass': 3,
  } },
  skills: { magery: 50 },
};
const actor = { id: 'player', health: 40, maxHealth: 100, skills: { magery: 50 }, buffs: [] };
const target = { health: 40, maxHealth: 100, dots: [{ source: 'player', abilityId: 'fireball' }], status: { root: { until: 10 } } };

console.log('\neffective ability: shared catalogue resolution');
{
  const abilityKeys = new Set(['damagePct', 'dotDamagePct', 'healingPct', 'costPct', 'cooldownPct', 'castTimePct', 'durationPct', 'rangeFlat', 'radiusFlat', 'moveDistanceFlat', 'controlDurationFlat', 'slowFractionFlat', 'markBonusFlat', 'absorbEfficiencyPct', 'leechFractionFlat']);
  const actorKeys = new Set(['spellCrit', 'runSpeed', 'armourRatingFlat', 'parryCounterMult']);
  const summonKeys = new Set(['durationPct', 'healthPct', 'damagePct']);
  const bad = [];
  for (const [spec, nodes] of Object.entries(MODIFIERS)) for (const node of nodes) for (const effect of node.effects) {
    const keys = Object.keys(effect.changes || {});
    const supported = effect.type === 'ability' ? abilityKeys : effect.type === 'actor' ? actorKeys : effect.type === 'summon' ? summonKeys : null;
    if (!supported || !keys.length || keys.some(key => !supported.has(key))) bad.push(`${spec}.${node.id}:${effect.type}:${keys.join(',')}`);
    if ((effect.type === 'ability' || effect.type === 'summon') && effect.abilityIds?.some(id => !ABILITIES_BY_ID[id])) bad.push(`${spec}.${node.id}:unknown ability`);
  }
  check('every emitted catalogue modifier uses a runtime-supported field and ability id', bad.length === 0, bad.join(' | '));
}
{
  // Isolate each catalogue effect so a later edit cannot sell a rank that the
  // runtime accepts but whose named base action never changes.
  const ineffective = [];
  const probeActor = {
    id: 'player', health: 40, maxHealth: 100, shield: true, hidden: true,
    buffs: [], absorb: { abilityId: 'manaShield' }, skills: {},
  };
  const probeTarget = {
    health: 40, maxHealth: 100, status: { root: { until: 1 } },
    dots: [], marks: [], resists: {}, skills: {},
  };
  for (const [spec, nodes] of Object.entries(MODIFIERS)) for (const node of nodes) for (const effect of node.effects || []) {
    const opening = spec.split('.')[0];
    const primeWhen = when => {
      if (!when) return;
      if (when.kind === 'all') { for (const condition of when.conditions || []) primeWhen(condition); return; }
      if (!when.abilityId) return;
      probeActor.buffs = [{ abilityId: when.abilityId }];
      probeTarget.dots = [{ abilityId: when.abilityId, source: 'player' }];
      probeTarget.marks = [{ abilityId: when.abilityId, from: 'player' }];
    };
    primeWhen(effect.when);
    const isolated = { id: 'probe', maxRank: 1, effects: [effect] };
    const original = MODIFIERS[spec];
    MODIFIERS[spec] = [isolated];
    const probe = { opening, advancement: { allocations: { [`${spec}.probe`]: 1 } } };
    try {
      if (effect.type === 'ability') for (const abilityId of effect.abilityIds || []) {
        const base = effectiveAbility({ opening, advancement: { allocations: {} } }, ABILITIES_BY_ID[abilityId], { actor: probeActor, target: probeTarget });
        const changed = effectiveAbility(probe, ABILITIES_BY_ID[abilityId], { actor: probeActor, target: probeTarget });
        if (JSON.stringify(base) === JSON.stringify(changed)) ineffective.push(`${spec}.${node.id}:${abilityId}`);
      }
      if (effect.type === 'actor' && Object.keys(effectiveActorModifiers(probe, { actor: probeActor, target: probeTarget })).length === 0) ineffective.push(`${spec}.${node.id}:actor`);
      if (effect.type === 'summon' && (effect.abilityIds || []).some(abilityId => Object.keys(summonModifierValues(probe, abilityId, { actor: probeActor, target: probeTarget })).length === 0)) ineffective.push(`${spec}.${node.id}:summon`);
    } finally { MODIFIERS[spec] = original; }
  }
  check('every shipped modifier rank changes its declared runtime target under a satisfied condition', ineffective.length === 0, ineffective.join(' | '));
}
{
  const values = abilityModifierValues(character, 'fireball', { actor, target });
  check('ranks add unconditional and own-dot damage exactly once', values.dotDamagePct === .06 && values.damagePct === .08, JSON.stringify(values));
  check('cost and range changes are kept independent', values.costPct === -.09 && values.rangeFlat === .5, JSON.stringify(values));
  const fireball = effectiveAbility(character, ABILITIES_BY_ID.fireball, { actor, target });
  check('runtime record applies cost, range and direct damage without mutating the catalogue',
    fireball.cost.mana === ABILITIES_BY_ID.fireball.cost.mana * .91 && fireball.range === ABILITIES_BY_ID.fireball.range + .5
    && fireball.effect.parts[0].min === ABILITIES_BY_ID.fireball.effect.parts[0].min * 1.08 && ABILITIES_BY_ID.fireball.cost.mana !== fireball.cost.mana);
  const preview = abilityPreview(character, ABILITIES_BY_ID.fireball, { actor, target });
  const spell = { base: [fireball.effect.parts[0].min, fireball.effect.parts[0].max], damageType: 'fire' };
  const endpoint = roll => { let i = 0; return () => (i++ === 0 ? roll : 1); };
  const expectedMin = resolveSpell({ caster: actor, target, spell, rng: endpoint(0) }).damage;
  const expectedMax = resolveSpell({ caster: actor, target, spell, rng: endpoint(.999999) }).damage;
  check('preview uses the runtime spell resolver, including the current target and stat inputs',
    preview.damage.min === expectedMin && preview.damage.max === expectedMax && preview.lines.some(line => /mana/.test(line)), preview.lines.join(' | '));
}
{
  const low = { id: 'low', health: 100, maxHealth: 100, stats: { int: 0 }, skills: { evaluatingIntelligence: 0, chivalry: 50, healing: 80, anatomy: 60 }, buffs: [] };
  const high = { ...low, id: 'high', stats: { int: 100 }, skills: { ...low.skills, evaluatingIntelligence: 100 }, bonuses: { spellDamage: 10 } };
  const lowSpell = abilityPreview({ opening: 'mage', advancement: { allocations: {} } }, ABILITIES_BY_ID.magicArrow, { actor: low, target });
  const highSpell = abilityPreview({ opening: 'mage', advancement: { allocations: {} } }, ABILITIES_BY_ID.magicArrow, { actor: high, target });
  const healingCharacter = { opening: 'paladin', advancement: { allocations: {} } };
  const heal = abilityPreview(healingCharacter, ABILITIES_BY_ID.heal, { actor: low });
  const bandage = abilityPreview(healingCharacter, ABILITIES_BY_ID.bandage, { actor: low });
  check('spell previews increase with current Intelligence, Evaluating Intelligence and spell damage', highSpell.damage.min > lowSpell.damage.min, `${lowSpell.damage.min} -> ${highSpell.damage.min}`);
  check('heal and bandage previews use the exact runtime amount formula',
    heal.healing.amount === 35 && bandage.healing.amount === 50,
    `${heal.healing.amount} / ${bandage.healing.amount}`);
}
{
  const node = { id: 'limitProbe', maxRank: 1, effects: [{ type: 'ability', abilityIds: ['limitProbe'], changes: { costPct: -1, cooldownPct: -1, castTimePct: -1, radiusFlat: 99, controlDurationFlat: 99, slowFractionFlat: 99 } }] };
  MODIFIERS['mage.arcane'].push(node);
  const probe = { opening: 'mage', advancement: { allocations: { 'mage.arcane.limitProbe': 1 } } };
  const base = { id: 'limitProbe', cost: { mana: 10 }, cooldown: 10, castTime: 1, range: 5, effect: { kind: 'control', effect: 'slow', magnitude: .3, duration: 2, radius: 3 } };
  const out = effectiveAbility(probe, base, { actor: { health: 1, maxHealth: 1 } });
  MODIFIERS['mage.arcane'].pop();
  check('modifier limits cap actual effective cost, cooldown, cast, radius, control and slow values',
    out.cost.mana === 7 && out.cooldown === 7.5 && out.castTime === .7 && out.effect.radius === 3.75
    && out.effect.duration === 2.5 && out.effect.magnitude === .7, JSON.stringify(out));
}
{
  const mods = effectiveActorModifiers(character, { actor });
  check('actor modifiers resolve from their catalogue rank', mods.spellCrit === .015, JSON.stringify(mods));
  check('conditions reject a wrong owner and accept controlled targets',
    !modifierCondition({ kind: 'ownDot', abilityId: 'fireball' }, { actor, target: { ...target, dots: [{ source: 'other', abilityId: 'fireball' }] } })
    && modifierCondition({ kind: 'targetControlled' }, { actor, target }));
}
{
  const ranger = { opening: 'ranger', advancement: { allocations: { 'ranger.beastmastery.longCalling': 2, 'ranger.beastmastery.fedCompanion': 3 } } };
  const values = summonModifierValues(ranger, 'beastCall', { actor: { id: 'player' } });
  check('summon duration and health modifiers share the same rank reader', values.durationPct === .1 && values.healthPct === .12, JSON.stringify(values));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
