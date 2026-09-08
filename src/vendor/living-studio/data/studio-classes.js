import {wiki} from './wiki.js';

const outfit = (material, overrides = {}) => Object.freeze({
  ...Object.fromEntries(wiki.pieces.map(({slot}) => [slot, `${material}_${slot}`])),
  ...overrides,
});
export {outfit as studioOutfit};

// The studio cast has its own art direction and loadouts. The captured wiki
// remains the source for equipment and historical ability data.
export const studioClasses = Object.freeze([
  {
    id: 'wizard', name: 'Wizard', symbol: '✧',
    subtitle: 'Staff · Cloth robe',
    description: 'Blue robes, gold trim, a pointed hat, and a red scarf.',
    materials: ['Cloth', 'Leather'],
    equipment: outfit('cloth', {wrists: 'leather_wrists', waist: 'leather_waist', feet: 'leather_feet'}),
    weapon: 'staff', shield: 'none',
    colors: {cloth: '#414d77', leather: '#684732', trim: '#c0a071', scarf: '#803c40', metal: '#88959d'},
  },
  {
    id: 'rogue', name: 'Rogue', symbol: '⟡',
    subtitle: 'Dual daggers · Leather armor',
    description: 'Charcoal leather, a deep hood, and a red scarf.',
    materials: ['Leather', 'Cloth'],
    equipment: outfit('leather'),
    weapon: 'dagger', shield: 'dagger',
    colors: {cloth: '#403a38', leather: '#55433a', trim: '#8c9690', scarf: '#803e40', metal: '#9da8a7'},
  },
  {
    id: 'warrior', name: 'Warrior', symbol: '⚔',
    subtitle: 'Longsword · Plate armor',
    description: 'Gray plate armor, red cloth, a longsword, and a heater shield.',
    materials: ['Plate', 'Leather', 'Cloth'],
    equipment: outfit('plate', {waist: 'leather_waist', back: 'cloth_back'}),
    weapon: 'longsword', shield: 'heater',
    colors: {cloth: '#883f41', leather: '#654731', trim: '#baa26d', metal: '#787370'},
  },
  {
    id: 'ranger', name: 'Ranger', symbol: '⌁',
    subtitle: 'Longbow · Leather armor',
    description: 'An olive hood, cloak, and face scarf with brown leather and a longbow.',
    materials: ['Leather', 'Cloth'],
    equipment: outfit('leather', {back: 'cloth_back'}),
    weapon: 'longbow', shield: 'none',
    colors: {cloth: '#596343', leather: '#614a31', trim: '#a5925d', scarf: '#596343', metal: '#919a90'},
  },
].map(entry => Object.freeze({
  ...entry,
  materials: Object.freeze(entry.materials),
  colors: Object.freeze(entry.colors),
})));
