// Talent topology is independent of the ability catalogue, so cast gates and
// save hydration can share these rules without a circular import.
export const MAX_LEVEL = 99;
export const COMMON_ABILITIES = ['jump', 'sprint', 'bandage', 'meditate', 'recall'];
export const STARTER_ABILITIES = {
  warrior: ['powerStrike'], ranger: ['aimedShot'], rogue: ['dualStrike', 'hide'], mage: ['magicArrow'],
};
export const TALENT_TREES = [
  {id:'warrior',name:'Warrior',branches:[
    {name:'Arms',ids:['powerStrike','rend','whirlwind','berserk']},
    {name:'Vanguard',ids:['shieldBash','disarm','riposte']},
    {name:'Assault',ids:['lunge','sweep','crushingBlow','leapSlam','battleCry']},
  ]},
  {id:'ranger',name:'Ranger',branches:[
    {name:'Marksmanship',ids:['aimedShot','doubleShot','piercingArrow','volley']},
    {name:'Survival',ids:['snare','cripplingShot','disengage']},
    {name:'Wildcraft',ids:['huntersMark','beastCall','fleetFoot']},
  ]},
  {id:'mage',name:'Mage',branches:[
    {name:'Arcane',ids:['magicArrow','blink','lightning','chainLightning','arcaneMastery','rift']},
    {name:'Elements',ids:['fireball','iceShard','frostNova','meteor','elementalKin']},
    {name:'Warding',ids:['hex','eldritchBolt','manaShield','stoneSkin','ward','spellPlague','transmute']},
  ]},
  {id:'rogue',name:'Rogue',branches:[
    {name:'Assassination',ids:['dualStrike','deepCut','kidneyShot','finishingStrike']},
    {name:'Shadows',ids:['hide','backstab','shadowstep','vanish']},
    {name:'Subterfuge',ids:['throwingKnife','poisonBlade','pickPocket','evasion','exposeWeakness']},
  ]},
  {id:'necromancer',name:'Necromancy',branches:[
    {name:'Bone',ids:['boneSpear','raiseSkeleton','raiseChampion']},
    {name:'Decay',ids:['lifeDrain','curseOfWeakness','corpseExplosion','lichForm']},
    {name:'Dread',ids:['summonImp','fear','summonHound']},
  ]},
  {id:'healer',name:'Restoration',branches:[
    {name:'Healing',ids:['heal','greaterHeal','layOnHands']},
    {name:'Protection',ids:['cleanse','bless','sanctuary']},
    {name:'Devotion',ids:['consecrateWeapon','smite','resurrect']},
  ]},
  {id:'bard',name:'Bard',branches:[
    {name:'Discord',ids:['provoke','discord']},
    {name:'Harmony',ids:['peace','lullaby']},
    {name:'Inspiration',ids:['marchingSong','warDrum']},
  ]},
  {id:'everyone',name:'Fieldcraft',branches:[{name:'Campcraft',ids:['camp']}]},
];
const ROW_LEVELS = [2, 6, 14, 26, 42, 62, 82];
export const TALENT_NODES = Object.fromEntries(TALENT_TREES.flatMap(tree => tree.branches.flatMap(branch =>
  branch.ids.map((id,index) => [id,{id,tree:tree.id,branch:branch.name,level:ROW_LEVELS[index],requires:branch.ids[index-1] || null}]))));
const validIds = new Set([...COMMON_ABILITIES,...Object.keys(TALENT_NODES)]);
const integer = (n,low,high) => Number.isFinite(n) ? Math.max(low,Math.min(high,Math.floor(n))) : low;
export function xpToNextLevel(level) { const n=integer(level,1,MAX_LEVEL)-1; return level>=MAX_LEVEL ? 0 : 100+35*n+8*n*n; }
export const LEVEL_XP = [0,0];
for(let level=2;level<=MAX_LEVEL;level++) LEVEL_XP[level]=LEVEL_XP[level-1]+xpToNextLevel(level-1);
export const MAX_XP = LEVEL_XP[MAX_LEVEL];
export function levelOf(character) {
  const xp=integer(character?.advancement?.xp,0,MAX_XP);
  let low=1,high=MAX_LEVEL;
  while(low<high){const mid=Math.ceil((low+high)/2);if(LEVEL_XP[mid]<=xp)low=mid;else high=mid-1;}
  return low;
}
export function newAdvancement(opening) {
  const granted=[...COMMON_ABILITIES,...(STARTER_ABILITIES[opening] || [])];
  return {v:1,xp:0,granted,ranks:Object.fromEntries(granted.map(id=>[id,1]))};
}
export function talentRank(character,id) { return integer(character?.advancement?.ranks?.[id],0,5); }
export function talentGate(ability,character) {
  if(!character?.advancement) return null; // Legacy callers retain the practice rule.
  return talentRank(character,ability.id)>0 ? {ok:true} : {ok:false,reason:`Learn ${ability.name} in Skill trees (P).`};
}
export function availablePoints(character) {
  const p=character?.advancement;
  if(!p)return 0;
  const granted=new Set(p.granted || []);
  const spent=Object.entries(p.ranks || {}).reduce((sum,[id,rank])=>sum+Math.max(0,integer(rank,0,5)-(granted.has(id)?1:0)),0);
  return Math.max(0,levelOf(character)-1-spent);
}
export function maxTalentRank(ability) { return ability && !ability.passive && ability.cooldown>0 ? 5 : 1; }
export function talentCooldown(ability,character) {
  return ability.cooldown * (1-0.03*Math.max(0,talentRank(character,ability.id)-1));
}
export function learnCheck(character,ability) {
  const node=TALENT_NODES[ability?.id];
  if(!character?.advancement || !node)return {ok:false,reason:'This ability is part of your starting kit.'};
  const rank=talentRank(character,ability.id),max=maxTalentRank(ability);
  if(rank>=max)return {ok:false,reason:'Fully learned.'};
  const level=Math.max(node.level,1+rank*8);
  if(levelOf(character)<level)return {ok:false,reason:`Requires level ${level}.`};
  if(!rank && node.requires && !talentRank(character,node.requires))return {ok:false,reason:`Learn the preceding ability first.`,requires:node.requires};
  if(!availablePoints(character))return {ok:false,reason:'Gain a level to earn a talent point.'};
  return {ok:true,rank:rank+1};
}
export function learnTalent(character,ability) {
  const check=learnCheck(character,ability);
  if(!check.ok)return check;
  character.advancement.ranks[ability.id]=check.rank;
  return {...check,ability:ability.id,points:availablePoints(character)};
}
export function grantExperience(character,amount) {
  if(!character?.advancement || !Number.isFinite(amount) || amount<=0)return {gained:0,levels:0};
  const before=levelOf(character),old=character.advancement.xp;
  character.advancement.xp=Math.min(MAX_XP,old+Math.floor(amount));
  return {gained:character.advancement.xp-old,levels:levelOf(character)-before,level:levelOf(character)};
}
export function progressionView(character) {
  const level=levelOf(character),xp=integer(character?.advancement?.xp,0,MAX_XP)-LEVEL_XP[level],needed=xpToNextLevel(level);
  return {level,xp,needed,points:availablePoints(character),fraction:needed?xp/needed:1};
}
/** Hydration never trusts a saved level or unspent-point count. Both are derived. */
export function hydrateAdvancement(raw,opening,legacyIds=[],abilities={}) {
  const fresh=newAdvancement(opening);
  if(!raw || raw.v!==1){
    fresh.granted=[...new Set([...fresh.granted,...legacyIds.filter(id=>validIds.has(id))])];
    fresh.ranks=Object.fromEntries(fresh.granted.map(id=>[id,1]));
    return fresh;
  }
  const granted=[...new Set([...fresh.granted,...(Array.isArray(raw.granted)?raw.granted:[]).filter(id=>validIds.has(id))])];
  const out={v:1,xp:integer(raw.xp,0,MAX_XP),granted,ranks:Object.fromEntries(granted.map(id=>[id,1]))};
  // Rebuild learned paths in level order, consuming only points actually earned.
  const c={advancement:out};
  for(let pass=0;pass<5;pass++)for(const id of Object.keys(TALENT_NODES)){
    const ability=abilities[id];
    if(!ability || talentRank(c,id)>=integer(raw.ranks?.[id],0,maxTalentRank(ability)))continue;
    const check=learnCheck(c,ability);if(check.ok)out.ranks[id]=check.rank;
  }
  return out;
}
