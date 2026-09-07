import {POPULATION_LAYOUT} from '../../src/mmo/greenwold/population_layout.js';
import {STRONGHOLDS} from '../../src/mmo/greenwold/strongholds.js';
import {FOOTPRINT} from '../../src/mmo/plans/footprints.js';
import {rectOf,pointInRect,cornersOf} from '../../src/mmo/plans/plan_schema.js';
import {routeDistance} from '../../src/mmo/greenwold/routes.js';

const p=(model,x,z,scale=1,yaw=0)=>({model,x,z,scale,yaw,tag:'greenwold-population'});
// Two neighbouring groups occupy different parts of each ground. Their
// cover, food and work props explain why they are here.
const POSITIONS=[[-10,2],[-6,-2],[-3,4],[1,0],[14,-17],[19,-19],[22,-13],[17,-10]];
const DESIGNS={
  field:{species:['giantRat','thornGrub'],trees:[],pieces:[p('lw_gorse',-18,-9,1.5),p('lw_thistle_clump',-17,-5),p('lw_cowslip_patch',4,13,1.5),p('lw_rabbit_warren',22,-26)],forage:'dandelion'},
  wood:{species:['badger','giantSpider'],tree:'beech',pieces:[p('lw_ivy_stump',-14,-13,1.4),p('lw_bracken',-18,-8,1.6),p('lw_bracken',24,-23,1.4),p('lw_mushroom_ring',15,-28),p('lw_leaf_litter',-12,10,2)],forage:'oyster_mushroom'},
  hunt:{species:['boar','wolf'],tree:'oak',pieces:[p('lw_boar_wallow',-10,-7,1.7),p('lw_bracken',-22,-11,1.5),p('lw_bramble_thicket',25,-28,1.5),p('sheep_skeleton',20,-25)],forage:'blackberry'},
  wet:{species:['reedStalker','drowned'],tree:'willow',pieces:[p('lw_rushes',-18,-11,1.6),p('lw_rushes',24,-25,1.5),p('lw_rowing_boat',14,-29),p('lw_mooring_post',10,-27),p('lw_eel_trap',11,-25)],forage:'nettle'},
  quarry:{species:['goblinScout','goblinWarrior'],tree:'birch',pieces:[p('spoil_heap',-20,-11,1.3),p('ore_cart',9,-24,1.2),p('lw_timber_prop',14,-30,1.4),p('barrow',21,-28),p('lw_chalk_boulder',-22,9,2)],ore:true},
  ruin:{species:['skeleton','zombie'],tree:'oak',pieces:[p('lw_drowned_wall',-17,-12,2),p('lw_drowned_wall',27,-22,1.8,90),p('lw_headstone_row',13,-28),p('lw_headstone_row',18,-29),p('lw_dead_oak',-25,1,.8)],forage:'nettle'},
  outlaw:{species:['goblinScout','bandit'],tree:'oak',pieces:[p('tent_ragged',-14,-13,1.8,35),p('tent_ragged',24,-30,1.8,300),p('campfire',9,-12),p('lw_stolen_goods',10,-27,1.2),p('weapons_rack',28,-6),p('lw_tripwire',-16,12,1,90)]},
  legion:{species:['legionSoldier','legionArcher'],tree:'oak',pieces:[p('legion_tent',-16,-14,1.6,30),p('legion_tent',24,-30,1.6,330),p('legion_standard',-22,-20),p('lw_legion_barrier',-8,13,1.3),p('legion_crate',13,-29),p('brazier',10,-10)]},
};
const TREES=[[-31,-15,.9],[-24,-30,1.1],[-8,-37,.9],[8,-39,1.1],[29,-35,1],[36,-18,.9],[-32,7,1.1],[35,3,.85],[-20,20,.9],[20,18,.95]];
export const populationIds=new Set(POPULATION_LAYOUT.map(([id])=>'greenwold_population_'+id));
const rotate=(x,z,a)=>({x:x*Math.cos(a)-z*Math.sin(a),z:x*Math.sin(a)+z*Math.cos(a)});

export function authorPopulation(spaces,field,{physical,forageCatalog={}}={}){
  for(const id of populationIds)delete spaces[id];
  const occupied=Object.values(spaces).flatMap(s=>(s.spawns||[]).map(p=>({x:s.at.x+p.x,z:s.at.z+p.z})));
  const towns=Object.values(spaces).filter(s=>s.safeRadius),report={grounds:0,monsters:0,trees:0,pieces:0,forage:0,ore:0,skipped:[]};
  const outside=(x,z,pad=0)=>!towns.some(s=>Math.hypot(x-s.at.x,z-s.at.z)<s.safeRadius+22+pad)&&!STRONGHOLDS.some(h=>Math.hypot(x-h.at.x,z-h.at.z)<60+pad);
  for(const [key,district,kind,x,z,yaw]of POPULATION_LAYOUT){
    const design=DESIGNS[kind],a=yaw*Math.PI/180,id='greenwold_population_'+key;
    if(!outside(x,z,5)){report.skipped.push({key,reason:'settlement or stronghold'});continue;}
    const local=(dx,dz)=>rotate(dx,dz,a),world=(dx,dz)=>{const q=local(dx,dz);return{x:x+q.x,z:z+q.z};};
    const s={id,name:district==='beechhangar'?'Beech Hangar woodland':'Greenwold countryside',at:{x,z},radius:78,district,pieces:[],trees:[],rocks:[],spawns:[],forage:[],runs:[],areas:[],people:[],markers:[]};
    const usable=(wx,wz,pad=.65)=>{
      if(!outside(wx,wz)||routeDistance(wx,wz)<7)return false;
      const sample=field.sampleAt(wx,wz);if(sample.water||physical?.at(wx,sample.h,wz,pad,2))return false;
      for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])if(Math.abs(field.heightAt(wx+dx,wz+dz)-sample.h)>.45)return false;
      return true;
    };
    // Furniture may be omitted where the real slope or an existing structure
    // occupies it. Defenders are then fitted as a whole, before anything writes.
    for(const piece of design.pieces){
      const q=local(piece.x,piece.z),p={...piece,...q,yaw:piece.yaw+yaw},r=rectOf(p);
      const points=[[r.x,r.z],...cornersOf(r)];
      if(points.some(([dx,dz])=>!usable(x+dx,z+dz,1.5)))continue;
      if(occupied.some(o=>pointInRect(o.x-x,o.z-z,{...r,hw:r.hw+2,hd:r.hd+2})))continue;
      if(s.pieces.some(p=>Math.hypot(p.x-q.x,p.z-q.z)<Math.max(...FOOTPRINT[p.model].slice(0,2))*.6+Math.max(...FOOTPRINT[piece.model].slice(0,2))*.6))continue;
      s.pieces.push(p);
    }
    const solid=(wx,wz)=>s.pieces.some(p=>{const r=rectOf(p);return pointInRect(wx-x,wz-z,{...r,hw:r.hw+1.2,hd:r.hd+1.2});})||s.trees.some(p=>Math.hypot(x+p.x-wx,z+p.z-wz)<2.5);
    for(const [i,[dx,dz]]of POSITIONS.entries()){
      const intended=world(dx,dz),candidates=[intended];
      // Deterministic editor fitting around a hand-placed point. The chosen
      // coordinates are saved; the live game never searches or rolls spawns.
      for(let r=3;r<=30;r+=3)for(const[ox,oz]of[[1,0],[.7,.7],[0,1],[-.7,.7],[-1,0],[-.7,-.7],[0,-1],[.7,-.7]])candidates.push({x:intended.x+r*ox,z:intended.z+r*oz});
      const q=candidates.find(q=>usable(q.x,q.z)&&!solid(q.x,q.z)&&occupied.every(o=>Math.hypot(o.x-q.x,o.z-q.z)>=3.5));
      if(!q)continue;
      s.spawns.push({id:design.species[i<4?0:1],x:+(q.x-x).toFixed(2),z:+(q.z-z).toFixed(2),encounter:key+':'+(i<4?'near':'rear'),slot:key+':'+i});occupied.push(q);
    }
    if(s.spawns.length<6){report.skipped.push({key,reason:'insufficient fighting ground',monsters:s.spawns.length});occupied.splice(occupied.length-s.spawns.length);continue;}
    if(design.tree)for(const[dx,dz,scale]of TREES){
      const q=world(dx,dz);if(!usable(q.x,q.z,1.2)||solid(q.x,q.z)||occupied.some(o=>Math.hypot(o.x-q.x,o.z-q.z)<4))continue;
      s.trees.push({species:design.tree,x:+(q.x-x).toFixed(2),z:+(q.z-z).toFixed(2),scale,yaw,harvest:true});
    }
    if(design.ore)for(const[dx,dz,ore]of[[-22,-19,'copper'],[-26,-17,'tin'],[-27,-22,'copper']]){
      const q=world(dx,dz);if(!usable(q.x,q.z,2)||solid(q.x,q.z)||occupied.some(o=>Math.hypot(o.x-q.x,o.z-q.z)<4))continue;
      s.rocks.push({kind:'ore',ore,x:+(q.x-x).toFixed(2),z:+(q.z-z).toFixed(2),scale:1.1,harvest:true});
    }
    if(design.forage==='oyster_mushroom'){
      for(const t of s.trees.slice(0,2))s.forage.push({id:'oyster_mushroom',x:t.x,z:t.z,tree:{x:t.x,z:t.z,scale:t.scale},yaw:90,height:.9,count:2});
    }else if(forageCatalog[design.forage])for(const[dx,dz]of[[-21,8],[9,17]]){
      const q=world(dx,dz);if(usable(q.x,q.z)&&!solid(q.x,q.z))s.forage.push({id:design.forage,x:+(q.x-x).toFixed(2),z:+(q.z-z).toFixed(2),count:2});
    }
    spaces[id]=s;report.grounds++;report.monsters+=s.spawns.length;report.trees+=s.trees.length;report.pieces+=s.pieces.length;report.ore+=s.rocks.length;report.forage+=s.forage.length;
  }
  return report;
}
