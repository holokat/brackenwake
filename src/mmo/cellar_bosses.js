// Authored Old Cellars encounters. Distances are metres, clocks milliseconds.
// This table is shared by the world spawn, combat and Blender model adapters.
const attack = (id, name, pattern, warnMs, damageScale, damageType, cue) =>
  ({ id, name, pattern, warnMs, damageScale, damageType, cue,
    animation: ['hammer', 'crush', 'cleave'].includes(pattern) ? 'swing' : 'special' });

export const CELLAR_BOSSES = [
  {
    id: 'morvaOssuaryMother', name: 'Morva, the ossuary mother', depth: 2, height: 4.8,
    rank: 1, hp: 600, damage: [7, 13], hit: 25, def: 22, ar: 18, run: 3.4,
    family: 'spider', kind: 'vermin', colour: 0x55d9bc,
    model: 'A skull-shell crustacean on six legs with a brine-filled ossuary under its carapace.',
    notes: [], lootTable: ['ring', 'amulet', 'helm', 'boots'],
    summon: { id: 'ossuaryCrawler', count: 2, cap: 4 },
    phases: [
      { kind: 'tide', line: 'Morva cracks her shell. The brine returns in two tides.' },
      { kind: 'brood', line: 'Morva opens the ossuary. More crawlers climb out.' },
    ],
    attacks: [
      attack('tidalRing', 'Tidal ring', 'tidal', 1700, 1.1, 'cold', 'The outer ring floods first. Stay inside it, then step out of the returning tide.'),
      attack('brineJets', 'Brine jets', 'jets', 1600, 1, 'cold', 'Brine gathers along the pale lanes. Step between them.'),
      attack('crawlerBrood', 'Crawler brood', 'brood', 2100, .6, 'poison', 'Skulls stir in the marked pools. Clear the pools before the crawlers rise.'),
    ],
  },
  {
    id: 'sextonBellkeeper', name: 'Sexton, the last bellkeeper', depth: 3, height: 6,
    rank: 2, hp: 1050, damage: [11, 20], hit: 43, def: 34, ar: 20, run: 3.2,
    family: 'biped', kind: 'undead', colour: 0xc4ad6b,
    model: 'A hunched spectral bellkeeper with a huge bronze bell hammer and suspended foundry chains.',
    notes: ['undead', 'holyWeak'], lootTable: ['warhammer', 'amulet', 'cloak', 'ring'],
    phases: [
      { kind: 'bells', line: 'Sexton raises the hammer again. The inner ring returns after the outer shock.' },
      { kind: 'silence', line: 'Sexton lowers his head. The silence spreads to three marks.' },
    ],
    attacks: [
      attack('bellShock', 'Bell shock', 'bells', 1850, 1.05, 'energy', 'The inner bell sounds first. Step out, then move into the quiet centre.'),
      attack('bellHammer', 'Bell hammer', 'hammer', 1750, 1.4, 'physical', 'The hammer points down a narrow lane. Step to either side.'),
      attack('silenceMarks', 'Silence marks', 'silence', 2100, .9, 'energy', 'Silence settles where you stood. Leave the marked circles.'),
    ],
  },
  {
    id: 'abbotCinder', name: 'Abbot Cinder', depth: 4, height: 7.5,
    rank: 3, hp: 1560, damage: [15, 27], hit: 61, def: 43, ar: 24, run: 3,
    family: 'biped', kind: 'undead', colour: 0xff8844,
    model: 'A four-armed revenant with an open furnace chest, ribbed kiln armour and a charred abbot crown.',
    notes: ['undead', 'holyWeak', 'fireImmune'], lootTable: ['robe', 'quarterstaff', 'boots', 'ring'],
    phases: [
      { kind: 'embers', line: 'Cinder opens the lower furnace. His sweep burns a third arc.' },
      { kind: 'furnace', line: 'All four hands open. The furnace pulse reaches farther.' },
    ],
    attacks: [
      attack('cinderSweep', 'Cinder sweep', 'sweep', 1850, 1.05, 'fire', 'Cinder sweeps across the bright wedges. Move behind his shoulders.'),
      attack('cinderMarks', 'Cinder marks', 'cinders', 2200, .85, 'fire', 'Embers collect at your feet. Keep moving out of the circles.'),
      attack('furnacePulse', 'Furnace pulse', 'pulse', 2400, 1.35, 'fire', 'The furnace draws breath. Leave the bright circle around Cinder.'),
    ],
  },
  {
    id: 'ilexChainArchivist', name: 'Ilex, the chain archivist', depth: 5, height: 9,
    rank: 4, hp: 2200, damage: [20, 34], hit: 78, def: 55, ar: 26, run: 2.8,
    family: 'skeleton', kind: 'undead', colour: 0x76d7ba,
    model: 'A floating lich torso with chained book arms, hanging scrolls and a long legless tattered shroud.',
    notes: ['undead', 'holyWeak'], lootTable: ['robe', 'quarterstaff', 'amulet', 'ring'],
    phases: [
      { kind: 'chains', line: 'Ilex turns a second page. Another chain crosses the archive.' },
      { kind: 'ritual', line: 'Ilex tears the binding. The sanctuary changes sides.' },
    ],
    attacks: [
      attack('chainLanes', 'Crossing chains', 'chains', 1800, 1.1, 'physical', 'Chains stretch across the floor. Stand in one of the open quarters.'),
      attack('bookCurses', 'Book curses', 'books', 2300, .9, 'energy', 'Open books mark the floor. Leave their circles before the pages close.'),
      attack('archiveRitual', 'Archive ritual', 'sanctuary', 3500, 1.4, 'energy', 'The archive darkens. Reach the green sanctuary circle before the ritual closes.'),
    ],
  },
  {
    id: 'vossInvertedSaint', name: 'Voss, the inverted saint', depth: 6, height: 11,
    rank: 4, hp: 2540, damage: [24, 40], hit: 82, def: 58, ar: 32, run: 2.7,
    family: 'biped', kind: 'construct', colour: 0x93b8ff,
    model: 'A crawling stone giant carrying a cathedral on its back, with tomb chains and massive slab hands.',
    notes: ['immunePoison'], lootTable: ['maul', 'greaves', 'helm', 'warhammer'],
    phases: [
      { kind: 'tombs', line: 'Voss strains against the ceiling. More tomb chains snap.' },
      { kind: 'gravity', line: 'Voss bows the cathedral on his back. Gravity breaks in three waves.' },
    ],
    attacks: [
      attack('fallingTombs', 'Falling tombs', 'tombs', 2400, 1.05, 'physical', 'Tomb shadows appear on the floor. Leave every marked rectangle.'),
      attack('gravityShock', 'Gravity shock', 'gravity', 1700, 1, 'energy', 'Gravity spreads from Voss. Follow the wave into the cleared centre.'),
      attack('saintCrush', 'Saint crush', 'crush', 2050, 1.45, 'physical', 'Voss raises both slab hands. Move out of the wide lane in front of him.'),
    ],
  },
  {
    id: 'asterFirstKing', name: 'Aster, the first king', depth: 7, height: 14,
    rank: 5, hp: 3500, damage: [29, 48], hit: 95, def: 68, ar: 36, run: 2.5,
    family: 'skeleton', kind: 'undead', colour: 0xe9c184,
    model: 'A colossal crowned skeletal king in layered burial armour with an immense two-handed tomb sword.',
    notes: ['undead', 'holyWeak'], lootTable: ['greatsword', 'breastplate', 'helm', 'amulet'],
    phases: [
      { kind: 'crown', line: 'Aster rises against the throne. His sword returns for a second cut.' },
      { kind: 'collapse', line: 'Aster breaks the crown. The royal graves collapse in a longer procession.' },
    ],
    attacks: [
      attack('royalCleave', 'Royal cleave', 'cleave', 2100, 1.25, 'physical', 'Aster draws the sword across his body. Get behind the bright arc.'),
      attack('graveCross', 'Grave cross', 'cross', 2000, 1.1, 'energy', 'The royal graves open in a cross. Move into an unmarked quarter.'),
      attack('royalCollapse', 'Royal collapse', 'collapse', 1900, 1, 'physical', 'The ceiling follows your footsteps. Keep leaving each marked circle.'),
    ],
  },
];

export const CELLAR_BOSS_BY_DEPTH = Object.fromEntries(CELLAR_BOSSES.map(b => [b.depth, b]));
const byId = Object.fromEntries(CELLAR_BOSSES.map(b => [b.id, b]));
export const getCellarBoss = id => byId[id] || null;

// Use the catalog's normal boss constructor, including the global pace factors.
export function registerCellarBosses(registerBoss) {
  for (const b of CELLAR_BOSSES) registerBoss({
    id: b.id, name: b.name, rank: b.rank, hp: b.hp, damage: b.damage.slice(),
    speed: 3, hit: b.hit, def: b.def, ar: b.ar, run: b.run, kind: b.kind,
    notes: b.notes.slice(), lootTable: b.lootTable.slice(), family: b.family, model: b.model,
    wave: 'Cellars', cellarBoss: true, cellarDepth: b.depth, where: `oldcellars:${b.depth}`,
  });
}
