import * as THREE from 'three';
import {buildLivingProp} from './living/models.js';
import {ceilingAt} from './dungeon.js';
import {worldOf,gridOf,walkable} from './dungeon_gen.js';
import {mineHeight,MINE_ROUTES} from './shoulder_working.js';
import {surfaceClaim} from '../game/surface_mining.js';
import {furnishWidowVault,inWidowVault} from './widow_vault.js';
import {createParticles} from '../vendor/living-studio/runtime/world-effects/particles.js';
// Batches static timber, iron and rock; only carts and effect emitters animate.
export function furnishShoulder(built,L,{loadWidow=null}={}){
 const root=new THREE.Group();root.name='Shoulder mine infrastructure';built.group.add(root);
 const groups=new Map(),effects=[],carts=[],shafts=[],workLights=[];let time=0,disposed=false,impactTime=-10;
 const materials={wood:new THREE.MeshStandardMaterial({color:0x725039,roughness:.94}),iron:new THREE.MeshStandardMaterial({color:0x45505d,metalness:.8,roughness:.48}),rock:new THREE.MeshStandardMaterial({color:0x454856,roughness:1}),gold:new THREE.MeshStandardMaterial({color:0x987047,metalness:.65,roughness:.45})};
 const addBox=(key,x,y,z,w,h,d,angle=0)=>{if(inWidowVault(L,x,z))return;const list=groups.get(key)||[];list.push({x,y,z,w,h,d,angle});groups.set(key,list);};
 const point=(gx,gz)=>{const p=worldOf(L,gx,gz);return {...p,y:mineHeight(p.z)};};
 const beam=(x,y,z,w,h,d,angle=0)=>addBox('wood',x,y,z,w,h,d,angle);
 // Raise the actual merged geology to the three working levels. Sampling one
 // height function at shared vertices leaves no cracks between neighbouring cells.
 for(const mesh of [built.parts.floor,built.parts.ceiling,...built.parts.walls]){const a=mesh?.geometry.attributes.position;if(!a)continue;for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+mineHeight(a.getZ(i)));a.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}
 for(const t of built.torches)t.y+=mineHeight(t.z);
 for(const box of built.chestMeshes)box.position.y+=mineHeight(box.position.z);
 built.entrancePos.y=mineHeight(built.entrancePos.z);
 const boxGeo=new THREE.BoxGeometry(1,1,1);
 function cart(p,angle,index){if(inWidowVault(L,p.x,p.z))return;const g=new THREE.Group();g.name='Ore wagon';g.position.set(p.x,p.y+.12,p.z);g.rotation.y=angle;root.add(g);
  const part=(mat,x,y,z,w,h,d)=>{const m=new THREE.Mesh(boxGeo,materials[mat]);m.position.set(x,y,z);m.scale.set(w,h,d);g.add(m);};
  part('wood',0,.55,0,1.8,.2,2.6);for(const x of [-.85,.85])part('wood',x,1,0,.15,.85,2.6);for(const z of [-1.25,1.25])part('wood',0,1,z,1.8,.85,.15);
  const wheels=[];for(const x of [-1,1])for(const z of [-.8,.8]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.16,10),materials.iron);m.rotation.z=Math.PI/2;m.position.set(x,.32,z);g.add(m);wheels.push(m);}
  for(let i=0;i<5;i++)part('rock',Math.sin(i*5)*.5,.88+(i%2)*.15,Math.cos(i*4)*.8,.65,.5,.65);
  carts.push({g,wheels,base:g.position.clone(),angle,index});
 }
 for(let n=0;n<MINE_ROUTES.length;n++){
  const [ax,az,bx,bz]=MINE_ROUTES[n],a=point(ax,az),b=point(bx,bz),len=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
  for(let s=1;s<len;s+=1.8){const x=a.x+dx*s,z=a.z+dz*s,y=mineHeight(z);beam(x,y+.09,z,2.5,.18,.24,angle);for(const side of [-.8,.8])addBox('iron',x+dz*side,y+.23,z-dx*side,.1,.16,1.85,angle);}
  for(let s=12;s<len-5;s+=18){const x=a.x+dx*s,z=a.z+dz*s,y=mineHeight(z);for(const side of [-5.6,5.6])beam(x+dz*side,y+4.5,z-dx*side,.6,9,.6);beam(x,y+9,z,12,.7,.7,angle);}
  if(n%2===0)cart(point(Math.round(ax+(bx-ax)*.35),Math.round(az+(bz-az)*.35)),angle,n);
 }
 // Scaffolds with real collision/support surfaces and stair treads. Three
 // height levels can be reached; the central haul road remains unobstructed.
 for(const index of [1,4]){
  const r=L.rooms[index],p=point(r.cx-9,r.cz);if(index===4)p.z=-10;p.y=mineHeight(p.z);const y=p.y;
  for(const level of [3,6,9]){
   for(let i=0;i<10;i++)beam(p.x,y+level-.15,p.z-9+i*1.8,5,.3,1.72);
   built.physicalBodies.push({kind:'box',model:'mine scaffold deck',x:p.x,z:p.z,y:y+level-.3,w:5,d:18,h:.3,c:1,s:0});
   for(const side of [-2.4,2.4]){beam(p.x+side,y+level+1,p.z,.12,.12,18);for(const z of [-8,-4,0,4,8])beam(p.x+side,y+level+.5,p.z+z,.14,1,.14);}
  }
  for(const x of [-2.3,2.3])for(const z of [-8,0,8])beam(p.x+x,y+5,p.z+z,.45,10,.45);
  // Stairs enter each deck along its outside edge; 0.06 m risers allow walking.
  for(let flight=0;flight<3;flight++){
   const direction=flight%2?1:-1,start=flight%2?-5.72:8;
   for(let i=0;i<50;i++){const sy=y+flight*3+(i+1)*.06,sx=p.x+4.5+(flight%2)*2.5,sz=p.z+start+direction*i*.28;beam(sx,sy-.03,sz,2,.06,.3);}
   const z=p.z+start+direction*49*.28,level=(flight+1)*3;
   built.physicalBodies.push({kind:'ramp',model:'mine stair',x:p.x+4.5+(flight%2)*2.5,z:p.z+start+direction*24.5*.28,y:y+flight*3,w:2,d:14,h:3,direction,c:1,s:0});
   beam(p.x+5,y+level-.15,z+direction*.65,6,.3,1);built.physicalBodies.push({kind:'box',model:'scaffold landing',x:p.x+5,z:z+direction*.65,y:y+level-.3,w:6,d:1,h:.3,c:1,s:0});
  }
 }
 // Hanging stalactites frame the high vault, without blocking routes.
 const spikeGeo=new THREE.ConeGeometry(1,1,7);
 const spikes=[];for(const r of L.rooms){if(r.id===7)continue;for(let i=0;i<18;i++){const gx=r.x+2+(i*13%(r.w-4)),gz=r.z+2+(i*7%(r.h-4));if(!walkable(L,gx,gz))continue;const p=point(gx,gz);const ceiling=ceilingAt(L,gx,gz),length=3+(i%5)*1.4;spikes.push({x:p.x,y:p.y+ceiling-length*.45,z:p.z,length});}}
 const stalactites=new THREE.InstancedMesh(spikeGeo,materials.rock,spikes.length),dummy=new THREE.Object3D();spikes.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(Math.PI,0,0);dummy.scale.set(1+p.length*.1,p.length,1+p.length*.1);dummy.updateMatrix();stalactites.setMatrixAt(i,dummy.matrix);});root.add(stalactites);
 // Web spokes and sagging rings collect over the abandoned workings.
 const webPositions=[];
 for(const index of [2,4,6,8,10]){const r=L.rooms[index],p=point(r.cx+6,r.cz-5),cy=p.y+5;
  const vertex=(a,radius)=>[p.x+Math.cos(a)*radius,cy+Math.sin(a)*radius*.8,p.z+Math.sin(a*3)*.18];
  for(let j=0;j<14;j++){const a=j/14*Math.PI*2;webPositions.push(...vertex(a,0),...vertex(a,5));for(let k=1;k<7;k++)webPositions.push(...vertex(a,k*.7),...vertex((j+1)/14*Math.PI*2,k*.7));}
 }
 const webG=new THREE.BufferGeometry();webG.setAttribute('position',new THREE.Float32BufferAttribute(webPositions,3));root.add(new THREE.LineSegments(webG,new THREE.LineBasicMaterial({color:0x9faaba,transparent:true,opacity:.45})));
 // Local work lamps reuse the published fire, smoke, mist and dust emitters.
 const emit=async(id,p,scale=1)=>{try{const {createEffectModel}=await import('../vendor/living-studio/runtime/world-effects/index.js');const fx=await createEffectModel(id);if(disposed){fx.dispose();return;}fx.group.position.set(p.x,p.y,p.z);fx.group.scale.setScalar(scale);root.add(fx.group);effects.push(fx);}catch(e){console.warn('Shoulder effect unavailable',id,e.message);}};
 for(const [index,r] of L.rooms.entries()){if(index===7)continue;const p=point(r.cx+7,r.cz+5);if(index%2===0||index===1){const basket=buildLivingProp('lw_watch_fire');basket.position.set(p.x+.35,p.y,p.z);basket.scale.setScalar(1.8);root.add(basket);emit('watch_fire',{...p,y:p.y+.65},1.1);emit('chimney_embers',{...p,y:p.y+1},1.2);}emit(index%3===0?'mist_bank':'cave_dust',{...p,y:p.y+.2},index%3===0?3:2);if(index===0||index===9)emit('chimney_smoke',{...p,y:p.y+1.6});
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{clock:{value:0}},vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvv;uniform float clock;void main(){float edge=pow(sin(uvv.x*3.14159),2.);float fade=sin(uvv.y*3.14159);float grain=.8+.2*sin(uvv.y*45.+clock*.3);gl_FragColor=vec4(.32,.48,.65,edge*fade*grain*.055);}'});
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.5,6,24,16,1,true),mat);shaft.position.set(p.x,p.y+12,p.z);shaft.rotation.z=.16;root.add(shaft);shafts.push(shaft);
 }
 // The nearest four work lamps illuminate timber and faces without adding a
 // light per emitter to every material shader in the entire mine.
 const lampPositions=[];
 for(const r of L.rooms){if(r.id===7)continue;const p=point(r.cx+7,r.cz+5);lampPositions.push(new THREE.Vector3(p.x,p.y+3,p.z));}
 for(let i=0;i<4;i++){const light=new THREE.PointLight(0xffb469,100,35,1.3);root.add(light);workLights.push(light);}
 const roofFill=new THREE.HemisphereLight(0x6986a3,0x322b20,.65);root.add(roofFill);
 // Batch the large quantity of timber and rails into four draw calls.
 for(const [key,list] of groups){const mesh=new THREE.InstancedMesh(boxGeo,materials[key],list.length);list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.name='Mine '+key;mesh.computeBoundingSphere();root.add(mesh);}
 const spark=createParticles({count:44,color:'#f7c080',mode:8,radius:1.1,duration:.6,size:8});root.add(spark.group);spark.group.visible=false;
 const cursor=new THREE.Mesh(new THREE.RingGeometry(.28,.34,24),new THREE.MeshBasicMaterial({color:0xffd793,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));cursor.visible=false;root.add(cursor);
 const surfaces=[built.parts.floor,built.parts.ceiling,...built.parts.walls];
 const update=built.update.bind(built),dispose=built.dispose.bind(built);
 built.mine={addSurfaces(items){surfaces.push(...items);},removeSurfaces(items){for(const item of items){const i=surfaces.indexOf(item);if(i>=0)surfaces.splice(i,1);}},pick(ray){const hit=ray.intersectObjects(surfaces,false)[0];if(!hit)return null;const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);return {distance:hit.distance,kind:'mineSurface',claim:surfaceClaim(hit.point,normal),normal};},mark(pick){cursor.visible=!!pick;if(pick){cursor.position.copy(pick.claim.point).addScaledVector(pick.normal,.025);cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),pick.normal);}},impact(claim){impactTime=time;spark.group.position.copy(claim.point);spark.group.visible=true;},spawnPoint(pos){for(const d of [5,7,9])for(let i=0;i<12;i++){const x=pos.x+Math.cos(i*Math.PI/6)*d,z=pos.z+Math.sin(i*Math.PI/6)*d,g=gridOf(L,x,z);if(walkable(L,g.gx,g.gz)&&walkable(L,g.gx+1,g.gz)&&walkable(L,g.gx-1,g.gz))return{x,z};}return null;}};
 const widow=furnishWidowVault(built,L,{load:loadWidow});built.widow=widow;built.ready=widow.ready;
 for(const anchor of widow.anchors){if(anchor.kind==='lamp'||anchor.kind==='fire')lampPositions.push(Object.assign(new THREE.Vector3(anchor.x,anchor.y,anchor.z),{widow:true,power:anchor.kind==='fire'?95:24}));if(anchor.kind==='fire'){emit('watch_fire',anchor,.8);emit('chimney_embers',anchor,.65);}if(anchor.kind==='dust')emit('cave_dust',anchor,2);if(anchor.kind==='mist')emit('mist_bank',anchor,1.4);}
 built.update=(a,b)=>{const result=update(a,b),pos=typeof a==='number'?b:a;time+=typeof a==='number'?Math.min(.1,a):.016;
  widow.update(time,pos);
  if(pos){const nearest=lampPositions.map(p=>({p,d:Math.hypot(p.x-pos.x,p.z-pos.z)})).sort((a,b)=>a.d-b.d);workLights.forEach((light,i)=>{light.position.copy(nearest[i].p);const p=nearest[i].p;light.intensity=(p.power||80)*(1+Math.sin(time*3+i)*.08);light.decay=p.widow?2:1.3;light.distance=p.widow?30:35;});}
  for(const fx of effects){fx.group.visible=!pos||Math.hypot(fx.group.position.x-pos.x,fx.group.position.z-pos.z)<85;if(fx.group.visible)fx.update(time);}
  for(const s of shafts)s.material.uniforms.clock.value=time;
  for(const c of carts){const offset=Math.sin(time*.12+c.index)*2;c.g.position.x=c.base.x+Math.sin(c.angle)*offset;c.g.position.z=c.base.z+Math.cos(c.angle)*offset;c.g.position.y=mineHeight(c.g.position.z)+.12;for(const w of c.wheels)w.rotation.x=offset/.36;}
  if(time-impactTime<.6)spark.update(time-impactTime);else spark.group.visible=false;return result;};
 built.dispose=()=>{if(disposed)return;disposed=true;widow.dispose();for(const fx of effects)fx.dispose();dispose();};
 built.mineStats={rooms:L.rooms.length,carts:carts.length+widow.anchors.filter(a=>a.kind==='cart').length,scaffoldDecks:9,rails:groups.get('iron')?.length||0,stalactites:spikes.length};
 return built;
}
