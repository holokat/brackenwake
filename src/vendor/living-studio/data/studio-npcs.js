import {studioOutfit} from './studio-classes.js';

const equipment = studioOutfit('cloth', {
  head: 'none', hands: 'none', wrists: 'none', back: 'none',
  waist: 'leather_waist', feet: 'leather_feet',
});

// Occupations use the same neutral base and complete outfit contract as the
// playable cast. Their tools and accessories are part of each authored outfit.
export const studioNpcs = Object.freeze([
  {
    id: 'blacksmith', name: 'Blacksmith', symbol: '⚒',
    subtitle: 'NPC · Leather apron',
    description: 'A leather apron over cream sleeves, with tools at the waist.',
    colors: {cloth: '#695546', leather: '#624735', trim: '#b4986d', metal: '#898782'},
  },
  {
    id: 'provisioner', name: 'Provisioner', symbol: '▱',
    subtitle: 'NPC · Satchel and supplies',
    description: 'An olive vest, cream sleeves, and a supply satchel.',
    colors: {cloth: '#697054', leather: '#70563c', trim: '#b6a27a', metal: '#898782'},
  },
  {
    id: 'healer', name: 'Healer', symbol: '✚',
    subtitle: 'NPC · Ivory and teal robe',
    description: 'An ivory robe with teal trim and a medicine pouch.',
    colors: {cloth: '#d0c8ae', leather: '#705b42', trim: '#6b928a', scarf: '#6b928a', metal: '#96978b'},
  },
  {
    id: 'weaponsmaster', name: 'Weaponsmaster', symbol: '⚔',
    subtitle: 'NPC · Padded vest',
    description: 'A charcoal padded vest with red cloth accents.',
    colors: {cloth: '#4b4943', leather: '#5c4636', trim: '#9f7860', scarf: '#8b4942', metal: '#898782'},
  },
  {
    id: 'innkeeper', name: 'Innkeeper', symbol: '⌂',
    subtitle: 'NPC · Cream apron',
    description: 'A rust vest and cream apron with a front pocket.',
    colors: {cloth: '#9b6250', leather: '#77553d', trim: '#d4c29f', metal: '#a19379'},
  },
  {
    id: 'alchemist', name: 'Alchemist', symbol: '◇',
    subtitle: 'NPC · Bottles and pouches',
    description: 'A muted purple vest with teal accents and small bottles.',
    colors: {cloth: '#6c6175', leather: '#68533f', trim: '#72978c', scarf: '#72978c', metal: '#95988a'},
  },
  {
    id: 'tailor', name: 'Tailor', symbol: '✂',
    subtitle: 'NPC · Tape and sewing tools',
    description: 'A slate blue vest with a measuring tape, shears, and a thread spool.',
    colors: {cloth: '#687582', leather: '#6b513e', trim: '#c8b78f', metal: '#9c9587'},
  },
  {
    id: 'banker', name: 'Banker', symbol: '▤',
    subtitle: 'NPC · Ledger and coin pouch',
    description: 'A navy vest with brass buttons, a ledger, and a coin pouch.',
    colors: {cloth: '#414f60', leather: '#504233', trim: '#b59b60', metal: '#b59b60'},
  },
  {
    id: 'stablemaster', name: 'Stablemaster', symbol: '♧',
    subtitle: 'NPC · Apron and rope',
    description: 'An olive vest with a short leather apron and a rope loop.',
    colors: {cloth: '#777257', leather: '#6d4f39', trim: '#b2996e', metal: '#928879'},
  },
  {
    id: 'bowyer', name: 'Bowyer', symbol: '↟',
    subtitle: 'NPC · Shafts and wood tool',
    description: 'A moss green vest with a bundle of shafts and a wood tool at the hip.',
    colors: {cloth: '#647054', leather: '#65503b', trim: '#b39d6d', metal: '#928879'},
  },
].map(entry => Object.freeze({
  ...entry, equipment, weapon: 'none', shield: 'none',
  materials: Object.freeze(['Cloth', 'Leather']),
  colors: Object.freeze({secondary: '#d1c5a5', ...entry.colors}),
})));

const npcIds = new Set(studioNpcs.map(entry => entry.id));
export const isStudioNpc = kind => npcIds.has(kind);
