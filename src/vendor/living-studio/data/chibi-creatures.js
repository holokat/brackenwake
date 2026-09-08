/** Preview construction only. Source creature names, rigs and moves stay in their catalog. */
export const chibiCreatureLooks = Object.freeze({
 bandit: {outfit:'provisioner',weapon:'dagger'},
 banditArcher: {outfit:'bowyer',weapon:'bow'},
 highwayman: {outfit:'weaponsmaster',weapon:'rapier'},
 raider: {outfit:'blacksmith',weapon:'axe'},
 legionSoldier: {outfit:'weaponsmaster',weapon:'shield'},
 legionArcher: {outfit:'bowyer',weapon:'bow'},
 oramBlackhand: {outfit:'weaponsmaster',weapon:'longsword'},
});
export const isChibiCreature = id => Object.hasOwn(chibiCreatureLooks,id);
