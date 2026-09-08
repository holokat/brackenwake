// Finite, character-owned mining claims. A claim is a 4 m patch on a surface,
// including its face axis, so floor, wall and roof cannot spend each other's ore.
import {selectedBaseOf} from './tools.js';
export const MINING_REACH=4.2, MINING_SWING_MS=850;
export const MINE_ORES=[['iron',0],['copper',10],['tin',20],['silver',35],['coldiron',45],['emberite',55],['rimesteel',65],['verdite',72],['voidrock',82],['starfall',92]];
export function miningTool(c){const all=[...Object.values(c?.equipment||{}),...(c?.pack?.items||[])];return all.find(i=>i?.base==='pickaxe'&&(i.durability??100)>0)||all.find(i=>i?.base==='pickaxe')||null;}
export function surfaceClaim(point,normal){
 const axis=Math.abs(normal.y)>.7?'y':Math.abs(normal.x)>.7?'x':'z';
 const a=[Math.floor(point.x/4),Math.floor(point.y/4),Math.floor(point.z/4)];
 const key=`${axis}${normal[axis]<0?'-':'+'}:${a.join(':')}`;
 let hash=2166136261;for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 return {key,capacity:4+hash%5,point:{x:point.x,y:point.y,z:point.z},hash};
}
export function miningPreview(c,claim){
 const used=c?.mining?.shoulder?.[claim.key]||{taken:0,work:0};const skill=Math.max(0,Number(c?.skills?.mining)||0);
 const unlocked=MINE_ORES.filter(([,n])=>skill>=n);const tier=unlocked[(claim.hash>>>5)%unlocked.length];
 return {remaining:Math.max(0,claim.capacity-used.taken),work:used.work||0,ore:tier[0],difficulty:tier[1],hits:Math.max(1,Math.ceil(5+(tier[1]-skill)/18)),skill,tool:miningTool(c)};
}
export function strikeSurface(c,claim,{now,last=-Infinity,position,dev=false}={}){
 const p=miningPreview(c,claim),fail=reason=>({ok:false,reason,...p});
 if(!dev&&selectedBaseOf(c)!=='pickaxe')return fail('Choose the pickaxe on your item bar, then click a surface.');
 if(!p.tool&&!dev)return fail('You need a pickaxe in your pack.');
 if(p.tool&&(p.tool.durability??100)<=0)return fail('Your pickaxe is broken. Bring another from the provisioner.');
 if(!position||Math.hypot(position.x-claim.point.x,(position.y+1.1)-claim.point.y,position.z-claim.point.z)>MINING_REACH)return fail('Move closer to this surface.');
 if(now-last<MINING_SWING_MS)return fail('cooldown');
 if(!p.remaining)return fail('This surface is worked out. Find another seam.');
 c.mining ||= {};c.mining.shoulder ||= {};
 const record=c.mining.shoulder[claim.key] ||= {taken:0,work:0};
 record.work++;
 if(p.tool)p.tool.durability=Math.max(0,(p.tool.durability??100)-1);
 const yielded=record.work>=p.hits;if(yielded){record.taken++;record.work=0;}
 return {ok:true,yielded,ore:p.ore,difficulty:p.difficulty,remaining:claim.capacity-record.taken,hitsLeft:p.hits-record.work,durability:p.tool?.durability??100};
}
export function hydrateMining(raw){const shoulder={};for(const [key,v] of Object.entries(raw?.shoulder||{}).slice(0,50000)){if(/^[xyz][+-]:-?\d+:-?\d+:-?\d+$/.test(key)&&Number.isFinite(v?.taken)&&Number.isFinite(v?.work))shoulder[key]={taken:Math.max(0,Math.min(8,Math.floor(v.taken))),work:Math.max(0,Math.min(10,Math.floor(v.work))),awakened:!!v.awakened};}return {shoulder};}
