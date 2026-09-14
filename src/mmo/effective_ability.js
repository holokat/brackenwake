// One reader for talent modifiers. The catalogue stores per-rank deltas; this
// module evaluates ownership and combat context, then gives both runtime and
// UI the same effective numbers.

import { MODIFIERS } from './talent_modifiers.js';
import { talentCooldown, talentRank } from './talents.js';
import { damage as meleeDamage, resolveSpell } from './combat_rules.js';

const number = value => Number.isFinite(value) ? value : 0;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const copy = value => value && typeof value === 'object' ? { ...value } : value;
const classOf = character => character?.opening || character?.advancement?.classId || '';
const allocationsOf = character => character?.advancement?.allocations || {};

/** The purchased rank of a catalogue modifier. Ability ranks use talents.js. */
export function modifierRank(character, specId, modifier) {
  const localId = typeof modifier === 'string' ? modifier : modifier?.id;
  if (!String(specId).startsWith(`${classOf(character)}.`)) return 0;
  const key = `${specId}.${localId}`;
  const max = Number.isInteger(modifier?.maxRank) ? modifier.maxRank : 3;
  return clamp(Math.floor(number(allocationsOf(character)[key])), 0, max);
}

function ownDot(context, abilityId) {
  const target = context?.target;
  const owner = context?.actor?.id ?? 'player';
  return Array.isArray(target?.dots) && target.dots.some(dot => dot?.abilityId === abilityId && dot.source === owner);
}

function controlled(target) {
  const status = target?.status || {};
  return !!status.root;
}

function selfEffect(context, abilityId) {
  const actor = context?.actor;
  return (actor?.buffs || []).some(buff => buff?.abilityId === abilityId)
    || !!actor?.passives?.[abilityId]
    || (abilityId === 'manaShield' && actor?.absorb?.abilityId === abilityId)
    || ((abilityId === 'hide' || abilityId === 'vanish') && !!actor?.hidden)
    || actor?.enchant?.abilityId === abilityId;
}

/** Whether a modifier condition is true for the action being resolved. */
export function modifierCondition(when, context = {}) {
  if (!when) return true;
  if (when.kind === 'all') return (when.conditions || []).every(condition => modifierCondition(condition, context));
  const actor = context.actor || {};
  const target = context.target || null;
  switch (when.kind) {
    case 'ownDot': return ownDot(context, when.abilityId);
    case 'targetControlled': return controlled(target);
    case 'targetBelowHalf': return number(target?.health) > 0 && number(target.health) < number(target.maxHealth) / 2;
    case 'selfBelowHalf': return number(actor.health) > 0 && number(actor.health) < number(actor.maxHealth) / 2;
    case 'selfEffect': return selfEffect(context, when.abilityId);
    case 'hasShield': return !!(actor.shield || context.character?.equipment?.offHand?.shield);
    case 'ownerMark': return Array.isArray(target?.marks) && target.marks.some(mark => mark?.abilityId === when.abilityId && mark.from === actor.id);
    default: return false;
  }
}

function add(into, changes, rank) {
  for (const [key, value] of Object.entries(changes || {})) into[key] = number(into[key]) + number(value) * rank;
  return into;
}

/** Collected ability changes for one ability under the supplied combat context. */
export function abilityModifierValues(character, abilityOrId, context = {}) {
  const abilityId = typeof abilityOrId === 'string' ? abilityOrId : abilityOrId?.id;
  const values = {};
  for (const [specId, modifiers] of Object.entries(MODIFIERS)) {
    for (const modifier of modifiers) {
      const rank = modifierRank(character, specId, modifier);
      if (!rank) continue;
      for (const effect of modifier.effects || []) {
        if (effect.type !== 'ability' || !effect.abilityIds?.includes(abilityId) || !modifierCondition(effect.when, { ...context, character })) continue;
        add(values, effect.changes, rank);
      }
    }
  }
  return values;
}

/** Dynamic actor additions such as armour, speed and spell critical chance. */
export function effectiveActorModifiers(character, context = {}) {
  const values = {};
  for (const [specId, modifiers] of Object.entries(MODIFIERS)) {
    for (const modifier of modifiers) {
      const rank = modifierRank(character, specId, modifier);
      if (!rank) continue;
      for (const effect of modifier.effects || []) {
        if (effect.type === 'actor' && modifierCondition(effect.when, { ...context, character })) add(values, effect.changes, rank);
      }
    }
  }
  return values;
}

/** Summon changes are read only by the summoning path. */
export function summonModifierValues(character, abilityOrId, context = {}) {
  const abilityId = typeof abilityOrId === 'string' ? abilityOrId : abilityOrId?.id;
  const values = {};
  for (const [specId, modifiers] of Object.entries(MODIFIERS)) {
    for (const modifier of modifiers) {
      const rank = modifierRank(character, specId, modifier);
      if (!rank) continue;
      for (const effect of modifier.effects || []) {
        if (effect.type === 'summon' && effect.abilityIds?.includes(abilityId) && modifierCondition(effect.when, { ...context, character })) add(values, effect.changes, rank);
      }
    }
  }
  return values;
}

const scale = (value, pct) => number(value) * (1 + number(pct));

function applyEffect(effect, values) {
  if (!effect || typeof effect !== 'object') return effect;
  const next = { ...effect };
  if (next.kind === 'combo') next.parts = (next.parts || []).map(part => applyEffect(part, values));
  if (next.applies) next.applies = applyEffect(next.applies, values);
  if (next.kind === 'spellDamage' || next.kind === 'corpseBurst' || next.kind === 'plague' || (next.min != null && next.max != null)) {
    next.min = scale(next.min, values.damagePct);
    next.max = scale(next.max, values.damagePct);
    if (next.initial != null) next.initial = scale(next.initial, values.damagePct);
  }
  if (next.kind === 'damageMult') next.value = scale(next.value, values.damagePct);
  if (next.kind === 'aoe') {
    if (next.damageMult != null) next.damageMult = scale(next.damageMult, values.damagePct);
    if (next.spellDamage) next.spellDamage = applyEffect(next.spellDamage, values);
  }
  if (next.kind === 'dot') next.perSecond = scale(next.perSecond, values.dotDamagePct);
  if (next.kind === 'heal' || next.kind === 'bandage') {
    next.base = scale(next.base, values.healingPct);
    if (next.perSkill != null) next.perSkill = scale(next.perSkill, values.healingPct);
    if (next.perHealing != null) next.perHealing = scale(next.perHealing, values.healingPct);
    if (next.perAnatomy != null) next.perAnatomy = scale(next.perAnatomy, values.healingPct);
  }
  if (next.duration != null) next.duration = scale(next.duration, number(values.durationPct));
  if (next.kind === 'control' && next.duration != null) next.duration += clamp(number(values.controlDurationFlat), 0, .5);
  if (next.kind === 'control' && next.effect === 'slow') next.magnitude = clamp(number(next.magnitude) + number(values.slowFractionFlat), 0, .7);
  if (next.kind === 'move' && next.distance != null) next.distance += number(values.moveDistanceFlat);
  if (next.radius != null) next.radius = Math.max(1, number(next.radius) + clamp(number(values.radiusFlat), -number(next.radius) + 1, number(next.radius) * .25));
  if (next.onSpellHit?.radius != null) next.onSpellHit = { ...next.onSpellHit, radius: Math.max(1, number(next.onSpellHit.radius) + clamp(number(values.radiusFlat), -number(next.onSpellHit.radius) + 1, number(next.onSpellHit.radius) * .25)) };
  if (next.kind === 'mark' && next.damageTakenMult != null) next.damageTakenMult += number(values.markBonusFlat);
  if (next.kind === 'absorb' && next.ratio != null) next.ratio /= 1 + number(values.absorbEfficiencyPct);
  if (next.kind === 'leech' && next.fraction != null) next.fraction = clamp(number(next.fraction) + number(values.leechFractionFlat), 0, .75);
  return next;
}

/**
 * Effective action data. It never mutates the catalogue record. The runtime
 * passes actor/target context; hover can pass those same optional values.
 */
export function effectiveAbility(character, ability, context = {}) {
  if (!ability || typeof ability !== 'object') return null;
  const values = abilityModifierValues(character, ability, context);
  const next = { ...ability, range: number(ability.range) + number(values.rangeFlat) };
  const costPct = clamp(number(values.costPct), -.3, .3);
  if (ability.cost && typeof ability.cost === 'object') {
    next.cost = { ...ability.cost };
    if (next.cost.mana != null) next.cost.mana = Math.max(0, scale(next.cost.mana, costPct));
    if (next.cost.stamina != null) next.cost.stamina = Math.max(0, scale(next.cost.stamina, costPct));
  }
  if (ability.mana != null) next.mana = Math.max(0, scale(ability.mana, costPct));
  if (ability.stamina != null) next.stamina = Math.max(0, scale(ability.stamina, costPct));
  if (ability.cooldown != null) {
    const training = 1 - .03 * Math.max(0, talentRank(character, ability.id) - 1);
    next.cooldown = Math.max(0, ability.cooldown * Math.max(.75, (1 + number(values.cooldownPct)) * training) / training);
  }
  if (ability.castTime != null) next.castTime = Math.max(0, scale(ability.castTime, clamp(number(values.castTimePct), -.3, .3)));
  next.effect = applyEffect(ability.effect, values);
  return next;
}

/** A compact, numeric read model for a hover or combat log preview. */
export function abilityPreview(character, ability, context = {}) {
  const effective = effectiveAbility(character, ability, context);
  if (!effective) return null;
  const effect = effective.effect || {};
  const first = effect.kind === 'combo' ? (effect.parts || [])[0] || {} : effect;
  // AOE carries its spell payload one level down, while weapon AOEs carry a
  // multiplier. Preview the damage record that the runtime will queue.
  const damaging = first.spellDamage || (first.kind === 'aoe' && first.damageMult != null
    ? { kind: 'damageMult', value: first.damageMult, type: first.type }
    : first);
  // Runtime actors normally carry these projections. Fixtures and a loading
  // character may not, so preview falls back to the persisted sheet exactly
  // as the heal and cast paths do.
  const previewActor = context.actor ? {
    ...context.actor,
    stats: context.actor.stats || character?.stats || {},
    skills: context.actor.skills || character?.skills || {},
  } : null;
  const skills = previewActor?.skills || character?.skills || {};
  const healBase = number(first.base);
  const healPerSkill = number(first.perSkill ?? first.perHealing);
  const healing = first.kind === 'heal' || first.kind === 'bandage'
    ? (() => {
      const amount = first.kind === 'bandage'
        ? Math.round(healBase + number(first.perHealing) * number(skills.healing) + number(first.perAnatomy) * number(skills.anatomy))
        : Math.round(healBase + healPerSkill * number(skills[first.skill]));
      return { amount, base: healBase, perSkill: healPerSkill };
    })()
    : null;
  const noCrit = roll => { let n = 0; return () => (n++ ? 1 : roll); };
  const target = context.target || { health: 1e9, maxHealth: 1e9, resists: {}, skills: {} };
  const damage = damaging.min != null
    ? (() => {
      if (!previewActor) return { min: number(damaging.min), max: number(damaging.max), kind: damaging.type || 'physical' };
      const spell = { base: [number(damaging.min), number(damaging.max)], damageType: damaging.type || 'energy' };
      return { min: resolveSpell({ caster: previewActor, target, spell, rng: noCrit(0) }).damage, max: resolveSpell({ caster: previewActor, target, spell, rng: noCrit(.999999) }).damage, kind: spell.damageType };
    })()
    : (damaging.value != null ? (() => {
      if (!previewActor) return { multiplier: number(damaging.value), kind: 'weapon' };
      const weapon = previewActor.weapon || {};
      const min = Math.round(number(weapon.minDamage ?? weapon.min));
      const max = Math.round(number(weapon.maxDamage ?? weapon.max));
      return { min: meleeDamage(previewActor, target, min, { multiplier: number(damaging.value), crit: false }).final, max: meleeDamage(previewActor, target, max, { multiplier: number(damaging.value), crit: false }).final, multiplier: number(damaging.value), kind: weapon.damageType || 'physical' };
    })() : null);
  // startCast applies rank training after it receives the effective record.
  // Preview the same final interval, not the intermediate record.
  const cooldown = effective.cooldown != null ? talentCooldown(effective, character) : 0;
  const cost = effective.cost?.mana ?? effective.cost?.stamina ?? effective.mana ?? effective.stamina ?? 0;
  const costKind = effective.cost?.mana != null || effective.mana != null ? 'mana' : effective.cost?.stamina != null || effective.stamina != null ? 'stamina' : null;
  const lines = [];
  if (damage?.min != null) lines.push(`${Math.round(damage.min)}–${Math.round(damage.max)} ${damage.kind}`);
  if (damage?.multiplier != null) lines.push(`${Math.round(damage.multiplier * 100)}% weapon damage`);
  if (healing) lines.push(`${Math.round(healing.amount)} healing`);
  if (costKind) lines.push(`${Math.round(cost)} ${costKind}`);
  if (cooldown) lines.push(`${number(cooldown).toFixed(1)} s cooldown`);
  if (effective.castTime) lines.push(`${number(effective.castTime).toFixed(1)} s cast`);
  if (effective.range) lines.push(`${number(effective.range).toFixed(1)} m range`);
  if (first.duration) lines.push(`${number(first.duration).toFixed(1)} s duration`);
  if (first.radius) lines.push(`${number(first.radius).toFixed(1)} m radius`);
  return {
    ability: effective,
    id: effective.id,
    cost, costKind,
    cooldown: number(cooldown), castTime: number(effective.castTime), range: number(effective.range),
    damage, healing, duration: number(first.duration), radius: number(first.radius),
    modifiers: abilityModifierValues(character, ability, context), lines,
  };
}
