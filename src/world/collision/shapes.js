// Static physical envelopes in metres. Foliage bends; trunks, masonry and furniture do not.
const SOFT=/^(lane_slab|road_slab_2m|road_kerb|rail_2m|stone_bridge_10m|footbridge|stepping_stones|rooting_patch|lily_pad_patch|offerings|chain_lantern|legion_banner|sheep_skeleton)$/;
const SOFT_LIVING=/^(cowslip_patch|cow_parsley|yellow_iris|bracken|leaf_litter|mushroom_ring|bluebells|nettles|puddle|duck_pond|sheep_track|deer_rub|rabbit_warren|fox_earth|molehills|butterfly|dragonfly|kestrel|crow_flock|ivy|reed|water_weed|lily|rush|flower|fung|moss|lichen|grass|fern|seed|petal|fallen_leav)/;
const TREE=/^(oak_[abc]|beech_[abc]|willow|lw_(apple_tree|dead_oak|coppice_stool|ivy_stump))$/;
export function propColliders(model,x,z,y,w,d,h,yaw=0){
 if(SOFT.test(model)||(model.startsWith('lw_')&&SOFT_LIVING.test(model.slice(3)))||h<.28)return[];
 const c=Math.cos(yaw),s=Math.sin(yaw),out=[];
 const box=(dx,dz,bw,bd,bh=h,by=0)=>out.push({kind:'box',model,x:x+dx*c+dz*s,z:z+dz*c-dx*s,y:y+by,w:bw,d:bd,h:bh,c,s});
 if(['fingerpost','lamp_post_iron','lantern_post','lw_lantern_post','lw_wanted_poster'].includes(model))return[{kind:'circle',model,x,z,y,r:.14,h}];
 if(TREE.test(model))return[{kind:'circle',model,x,z,y,r:Math.min(w,d)*.055,h}];
 if(['gate_tower','cellar_arch','mine_mouth'].includes(model)){
  const post=w*(model==='gate_tower'?.24:.17);box(-(w-post)/2,0,post,d);box((w-post)/2,0,post,d);box(0,0,w,d,h*.2,h*.8);return out;
 }
 if(model==='headframe'||model==='lookout_platform'){
  for(const a of[-1,1])for(const b of[-1,1])box(a*w*.4,b*d*.4,w*.13,d*.13);
  box(0,0,w,d,.22,h-.22);return out;
 }
 if(model==='stable_pen'){
  box(-w/2,0,.18,d);box(w/2,0,.18,d);box(0,-d/2,w,.18);return out;
 }
 // The well's central stone basin is solid, while its roof remains overhead.
 if(model==='well_pavilion'){out.push({kind:'circle',model,x,z,y,r:w*.26,h:h*.3});for(const a of[-1,1])for(const b of[-1,1])box(a*w*.43,b*d*.43,.16,.16);return out;}
 if(model==='chapel_sunken'){
  box(-w*.46,0,w*.08,d);box(w*.46,0,w*.08,d);box(0,-d*.46,w,d*.08);return out;
 }
 box(0,0,w,d);return out;
}
export function overlaps(body,x,y,z,radius=.32,height=1.75){
 if(body.enabled&&!body.enabled())return false;
 if(y>=body.y+body.h-.04||y+height<=body.y+.04)return false;
 const dx=x-body.x,dz=z-body.z;
 if(body.kind==='circle')return dx*dx+dz*dz<(radius+body.r)**2;
 const a=Math.max(0,Math.abs(dx*body.c-dz*body.s)-body.w/2),b=Math.max(0,Math.abs(dx*body.s+dz*body.c)-body.d/2);
 return a*a+b*b<radius*radius;
}
export function createCollisionIndex(bodies=[],cell=16){
 const cells=new Map();
 for(const b of bodies){const r=b.kind==='circle'?b.r:Math.hypot(b.w,b.d)/2;for(let x=Math.floor((b.x-r-1)/cell);x<=Math.floor((b.x+r+1)/cell);x++)for(let z=Math.floor((b.z-r-1)/cell);z<=Math.floor((b.z+r+1)/cell);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);}}
 const at=(x,y,z,r=.32,h=1.75)=> (cells.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]).find(b=>overlaps(b,x,y,z,r,h))||null;
 const near=(x,z)=>cells.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[];
 const depth=(b,x,z,r)=>{
  const dx=x-b.x,dz=z-b.z;if(b.kind==='circle')return b.r+r-Math.hypot(dx,dz);
  const a=Math.abs(dx*b.c-dz*b.s)-b.w/2,d=Math.abs(dx*b.s+dz*b.c)-b.d/2;
  return r-(Math.hypot(Math.max(0,a),Math.max(0,d))+Math.min(0,Math.max(a,d)));
 };
 return{bodies,at,
  supportAt(x,z,below,r=.3){let top=-Infinity;for(const b of near(x,z))if(b.y+b.h<=below&&overlaps(b,x,b.y+.05,z,r,.1))top=Math.max(top,b.y+b.h);return top;},
  ceilingAt(x,z,feet,height=1.75,r=.3){let bottom=Infinity;for(const b of near(x,z))if(b.y>=feet+height-.04&&overlaps(b,x,b.y+.05,z,r,.1))bottom=Math.min(bottom,b.y);return bottom;},
  canMove(from,to,r=.32,h=1.75){
   const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/Math.max(.02,Math.min(.16,r*.5))));
   for(let i=1;i<=n;i++){const t=i/n,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,z=from.z+(to.z-from.z)*t;
    for(const hit of near(x,z))if(overlaps(hit,x,y,z,r,h)){
     // Old saves can begin inside a newly solid object. Only reduce penetration,
     // and check every overlapping body so leaving one cannot cross another.
     if(overlaps(hit,from.x,from.y,from.z,r,h)&&depth(hit,to.x,to.z,r)<depth(hit,from.x,from.z,r)-1e-8)continue;
     return false;
    }
   }return true;
  },
 };
}
