export const CELLAR_CREATURES = [
    { id: 'ossuaryCrawler', name: 'Ossuary crawler', base: 'giantSpider', size: 1.4, color: 0xb3a38b, glow: 0x77e0d0, notes: ['poison2', 'webRoot2'] },
    { id: 'hushWraith', name: 'Hush wraith', base: 'wraith', size: 1.65, color: 0x59526f, glow: 0xb3a3ff, notes: ['undead', 'holyWeak', 'incorporeal50', 'manaDrain'] },
    { id: 'emberRevenant', name: 'Ember revenant', base: 'boneKnight', size: 1.9, color: 0x593a31, glow: 0xff8b4c, notes: ['undead', 'holyWeak', 'groundSlam', 'breath'] },
    { id: 'chainedLich', name: 'Chained lich', base: 'lich', size: 2.2, color: 0x385950, glow: 0x8affc6, notes: ['undead', 'holyWeak', 'casts', 'manaDrain'] },
    { id: 'vaultBehemoth', name: 'Vault behemoth', base: 'ironGolem', size: 2.9, color: 0x575668, glow: 0x97baff, notes: ['immunePoison', 'groundSlam', 'knockback'] },
    { id: 'sepulcherWarden', name: 'Sepulcher warden', base: 'frostGiant', size: 3.7, color: 0x514657, glow: 0xe4adf5, notes: ['undead', 'holyWeak', 'groundSlam', 'stun', 'frostNova'] },
];
export const CELLAR_CREATURE = Object.fromEntries(CELLAR_CREATURES.map(e => [e.id, e]));
export function registerCellarCreatures(rows) { for (const e of CELLAR_CREATURES) {
    const base = rows.find(r => r.id === e.base);
    rows.push({ ...base, id: e.id, name: e.name, wave: 'Cellars', cellarCreature: true, boss: false, family: base.family || 'biped', notes: e.notes, tamable: undefined, model: e.name + ': a tomb creature surrounded by floating grave shards and a luminous crown.' });
} }
