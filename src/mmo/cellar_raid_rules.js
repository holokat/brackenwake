// Shared coordinates and telegraphs, used by the Worker and the rendered arena.
export const CELLAR_DEPTHS = 8;
export const RAID = { id: 'sepulcher', name: 'Vharos, the buried cathedral', layer: 'oldcellars:8', x: 1, z: -31, radius: 74, minPlayers: 10, maxHealth: 180000, resetMs: 90000 };
export const RAID_ATTACKS = [
    { id: 'gravesurge', name: 'Gravesurge', warning: 'The inner ring breaks. Run beyond the amber circle.', shape: 'circle', radius: 29, damage: 65, color: 0xffac55, windup: 3400 },
    { id: 'funeralCross', name: 'Funeral cross', warning: 'Four tomb roads ignite. Leave the violet cross.', shape: 'cross', width: 10, damage: 75, color: 0xb988ff, windup: 3900 },
    { id: 'hollowStar', name: 'Hollow star', warning: 'The outer vault collapses. Gather inside the blue ring.', shape: 'outside', radius: 25, damage: 85, color: 0x75d8ff, windup: 4100 },
    { id: 'tombfall', name: 'Tombfall', warning: 'Falling tombs mark your positions. Keep moving.', shape: 'marks', radius: 9, damage: 70, color: 0xff6955, windup: 3200 },
];
export function inRaid(state) { return state?.layer === RAID.layer && state.hp > 0 && Array.isArray(state.p) && state.p.every(Number.isFinite) && Math.hypot(state.p[0] - RAID.x, state.p[2] - RAID.z) <= RAID.radius; }
export function attackHits(attack, pos) {
    const d = Math.hypot(pos[0] - RAID.x, pos[2] - RAID.z);
    if (attack.shape === 'circle')
        return d < attack.radius;
    if (attack.shape === 'outside')
        return d > attack.radius;
    if (attack.shape === 'cross')
        return Math.abs(pos[0] - RAID.x) < attack.width / 2 || Math.abs(pos[2] - RAID.z) < attack.width / 2;
    return (attack.marks || []).some(p => Math.hypot(pos[0] - p[0], pos[2] - p[1]) < attack.radius);
}
