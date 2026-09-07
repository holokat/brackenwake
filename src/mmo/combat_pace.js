// Live combat pacing. Item sheets retain weapon identity; player recovery is
// shorter than the original tabletop timer. Enemy telegraphs keep their timing.
export const MONSTER_HEALTH_FACTOR=1.5;
export const COMBAT_PACE = Object.freeze({swingFactor:.42,swingFloor:.55,swingCeiling:1.4});
export function playerSwingSeconds(seconds){return Math.max(COMBAT_PACE.swingFloor,Math.min(COMBAT_PACE.swingCeiling,seconds*COMBAT_PACE.swingFactor));}
// Gathering, bandaging and performances still use their authored durations.
const CASTS = Object.freeze({
 aimedShot:.65,volley:.8,snare:.45,beastCall:1,
 fireball:.35,iceShard:.35,frostNova:.5,chainLightning:.75,meteor:1.35,
 stoneSkin:.35,ward:.8,spellPlague:.7,rift:1.2,
 summonImp:.8,summonHound:.7,boneSpear:.35,raiseSkeleton:.8,raiseChampion:1.4,lichForm:1.4,
 heal:.45,greaterHeal:.8,bless:.35,sanctuary:.8,resurrect:1.8,
});
export function pacedCastTime(id,seconds){return CASTS[id]===undefined?seconds:Math.min(seconds,CASTS[id]);}
export const PACED_CASTS=CASTS;
