import assert from 'node:assert/strict';
import { ABILITIES_BY_ID } from '../mmo/abilities.js';
import { CLASS_NODES } from '../mmo/class_trees.js';
import { LEVEL_XP, grantExperience, learnTalent, newAdvancement } from '../mmo/talents.js';
import { conditionDescription, modifierDescriptionLines, talentDescriptionLines } from './talent_descriptions.js';

const character = { opening: 'mage', advancement: newAdvancement('mage') };
grantExperience(character, LEVEL_XP[4]);
const copperThread = CLASS_NODES['mage.arcane.copperThread'];
assert.deepEqual(modifierDescriptionLines(copperThread, 1), ['Magic Arrow: +3% damage.']);
assert.deepEqual(modifierDescriptionLines(copperThread, 3), ['Magic Arrow: +9% damage.']);
assert.equal(learnTalent(character, copperThread.id, ABILITIES_BY_ID).ok, true);
assert.equal(learnTalent(character, copperThread.id, ABILITIES_BY_ID).ok, true);
const detail = talentDescriptionLines(character, copperThread);
assert.deepEqual(detail.slice(0, 6), [
  'Copper thread', 'Rank 2 / 3', 'Current effect', 'Magic Arrow: +6% damage.', 'Rank 3', 'Magic Arrow: +9% damage.',
]);

const bankedHeat = CLASS_NODES['mage.fire.bankedHeat'];
assert.equal(conditionDescription(bankedHeat.effects[0].when), 'against targets bearing your Fireball');
assert.deepEqual(modifierDescriptionLines(bankedHeat, 2), ['Fireball: +8% damage against targets bearing your Fireball.']);
const lastRivet = CLASS_NODES['warrior.protection.lastRivet'];
assert.equal(conditionDescription(lastRivet.effects[0].when), 'while below half health and while carrying a shield');
assert.deepEqual(modifierDescriptionLines(lastRivet, 1), ['+15 armour while below half health and while carrying a shield.']);

const returningSteel = CLASS_NODES['warrior.protection.returningSteel'];
assert.deepEqual(modifierDescriptionLines(returningSteel, 1), ['+2% counterattack multiplier.']);
const capstone = CLASS_NODES['mage.fire.kilnWake'];
assert.deepEqual(talentDescriptionLines(character, capstone).slice(-1), ['Choose one capstone for your class. Reset talents outside combat to change it.']);

console.log('Talent description checks passed: current and next ranks, numeric effects, and conditions.');
