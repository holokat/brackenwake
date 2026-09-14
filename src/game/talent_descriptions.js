import { ABILITIES_BY_ID } from '../mmo/abilities.js';
import { abilityPreview } from '../mmo/effective_ability.js';
import { nodeRank, nodeMaxRank } from '../mmo/talents.js';
import { actorFor } from './compare.js';

const pretty = value => Number(value.toFixed(2));
const abilityName = id => ABILITIES_BY_ID[id]?.name || id;
const FIELDS = {
  damagePct:['damage','%'], dotDamagePct:['damage over time','%'], healingPct:['healing','%'],
  costPct:['resource cost','%'], cooldownPct:['cooldown','%'], castTimePct:['cast time','%'], durationPct:['duration','%'],
  rangeFlat:['range',' m'], radiusFlat:['radius',' m'], moveDistanceFlat:['movement distance',' m'],
  controlDurationFlat:['control duration',' s'], slowFractionFlat:['slow',' percentage points'],
  markBonusFlat:['damage taken bonus',' percentage points'], absorbEfficiencyPct:['absorption efficiency','%'],
  leechFractionFlat:['damage healed',' percentage points'], spellCrit:['spell critical chance',' percentage points'],
  runSpeed:['movement speed','%'], armourRatingFlat:['armour',''], parryCounterMult:['counterattack multiplier','%'],
  healthPct:['health','%'],
};

export function conditionDescription(when) {
  if (!when) return '';
  if (when.kind === 'all') return (when.conditions || []).map(conditionDescription).join(' and ');
  const phrases = {
    ownDot: `against targets bearing your ${abilityName(when.abilityId)}`,
    targetControlled: 'against rooted targets', targetBelowHalf: 'against targets below half health',
    selfBelowHalf: 'while below half health', hasShield: 'while carrying a shield',
    selfEffect: `while ${abilityName(when.abilityId)} is active`,
    ownerMark: `against targets bearing your ${abilityName(when.abilityId)}`,
  };
  return phrases[when.kind] || '';
}

/** The numbers here come from the same per-rank effects the runtime reads. */
export function modifierDescriptionLines(node, rank = 1) {
  return (node.effects || []).map(effect => {
    const changes = Object.entries(effect.changes || {}).map(([key,value]) => {
      const [label,unit] = FIELDS[key] || [key,''];
      const percent = unit.includes('%') || unit.includes('percentage');
      const amount = pretty(value * rank * (percent ? 100 : 1));
      return `${amount >= 0 ? '+' : ''}${amount}${unit} ${label}`;
    }).join(', ');
    const subject = (effect.abilityIds || []).map(abilityName).join(', ');
    const condition = conditionDescription(effect.when);
    return `${subject ? `${subject}${effect.type === 'summon' ? ' companion' : ''}: ` : ''}${changes}${condition ? ` ${condition}` : ''}.`;
  });
}

export function characterAbilityLines(character, ability, actor) {
  if (!ability) return [];
  const preview = abilityPreview(character, ability, { actor: actorFor(character, actor) });
  return [ability.description, ...(preview?.lines || [])].filter(Boolean);
}

export function talentDescriptionLines(character, node, actor) {
  if (!node) return [];
  const rank = nodeRank(character, node), maximum = nodeMaxRank(node, ABILITIES_BY_ID);
  const lines = [node.name || abilityName(node.abilityId), `Rank ${rank} / ${maximum}`];
  if (node.kind === 'modifier') {
    if (rank) lines.push('Current effect', ...modifierDescriptionLines(node, rank));
    if (rank < maximum) lines.push(`Rank ${rank + 1}`, ...modifierDescriptionLines(node, rank + 1));
    if (node.capstone) lines.push('Choose one capstone for your class. Reset talents outside combat to change it.');
  } else lines.push(...characterAbilityLines(character, ABILITIES_BY_ID[node.abilityId], actor));
  return lines;
}
