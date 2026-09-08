/** Distinct creature bodies in the cast's faceted visual style. */
export const chibiMonsterLooks = Object.freeze({
 scarecrow: {height:1.85,weapon:'none',cloth:'#796043',family:'straw'},
 zombie: {height:1.70,weapon:'claws',cloth:'#645747',family:'undead'},
 drowned: {height:1.75,weapon:'claws',cloth:'#365d62',family:'undead'},
 wraith: {height:1.85,weapon:'claws',cloth:'#343e52',family:'spectral'},
 skeleton: {height:1.72,weapon:'buckler',cloth:'#645342',family:'bone'},
 goblinScout: {height:1.48,weapon:'dagger',cloth:'#555e36',family:'goblin'},
 goblinWarrior: {height:1.60,weapon:'buckler',cloth:'#624841',family:'goblin'},
});
export const isChibiMonster=id=>Object.hasOwn(chibiMonsterLooks,id);
