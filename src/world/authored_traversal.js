import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DATA from '../mmo/greenwold/traversal.json' with { type: 'json' };
import { nearestOnSegment } from '../mmo/greenwold/routes.js';

export const CROSSINGS = DATA.bridges;
const bounds = new WeakMap();
function boundsOf(b) {
  if(!bounds.has(b))bounds.set(b,{
    x0:Math.min(...b.points.map(p=>p[0]))-b.width/2,x1:Math.max(...b.points.map(p=>p[0]))+b.width/2,
    z0:Math.min(...b.points.map(p=>p[2]))-b.width/2,z1:Math.max(...b.points.map(p=>p[2]))+b.width/2,
  });
  return bounds.get(b);
}
// Feet and visible planks read the identical segment heights.
export function authoredDeckAt(field,x,z,bridges=CROSSINGS) {
  if(!field?.sculpt)return null;
  let best=null;
  for(const b of bridges){
   const box=boundsOf(b);if(x<box.x0||x>box.x1||z<box.z0||z>box.z1)continue;
   const first=b.points[0],second=b.points[1],last=b.points.at(-1),penultimate=b.points.at(-2);
   if((x-first[0])*(second[0]-first[0])+(z-first[2])*(second[2]-first[2])<0)continue;
   if((x-last[0])*(last[0]-penultimate[0])+(z-last[2])*(last[2]-penultimate[2])>0)continue;
   let closest=Infinity,y=null;
   for(let i=1;i<b.points.length;i++){
    const a=b.points[i-1],c=b.points[i];
    const hit=nearestOnSegment(x,z,[a[0],a[2]],[c[0],c[2]]);
    if(hit.d>b.width/2 || hit.d>=closest)continue;
    closest=hit.d;y=a[1]+(c[1]-a[1])*hit.t;
   }
   if(y!==null)best=best===null?y:Math.max(best,y);
  }
  // At an approach the bank may rise through the planks. The ground remains
  // solid there; choosing a lower deck would put feet beneath the bank.
  return best===null?null:Math.max(best,field.heightAt?.(x,z)??-Infinity);
}

export function createAuthoredCrossings(scene,field) {
  const group=new THREE.Group();group.name='site:greenwold-crossings';scene.add(group);
  const deckMat=new THREE.MeshStandardMaterial({color:0x9b8866,roughness:.95,flatShading:true});
  const railMat=new THREE.MeshStandardMaterial({color:0x5d4b35,roughness:1,flatShading:true});
  let builtVersion=null,builtEdits=null;
  const rebuild=()=>{
  group.traverse(o=>o.geometry?.dispose());group.clear();
  for(const b of CROSSINGS){
    const decks=[],rails=[];
    for(let i=1;i<b.points.length;i++){
      const a=new THREE.Vector3(...b.points[i-1]),c=new THREE.Vector3(...b.points[i]);
      const d=c.clone().sub(a),mid=a.clone().add(c).multiplyScalar(.5);
      // Forty-metre graded approaches make the crossings easy to walk, but
      // their flush or buried portions are ordinary ground, not visible wood.
      // Keep the complete height profile for feet and draw the raised span.
      const bank=field.heightAt(mid.x,mid.z);
      if(mid.y-bank<.08&&!field.sampleAt(mid.x,mid.z).water)continue;
      const direction=new THREE.Vector3(d.x,0,d.z).normalize();
      const side=new THREE.Vector3(direction.z,0,-direction.x);
      const yaw=Math.atan2(d.x,d.z);
      const pitch=-Math.atan2(d.y,Math.hypot(d.x,d.z));
      const rot=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
      const add=(dest,w,h,l,p)=>{
        const g=new THREE.BoxGeometry(w,h,l);
        g.applyMatrix4(new THREE.Matrix4().compose(p,rot,new THREE.Vector3(1,1,1)));dest.push(g);
      };
      add(decks,b.width,.24,d.length()+.05,mid.clone().add(new THREE.Vector3(0,-.12,0)));
      for(const sign of[-1,1]){
        const p=mid.clone().addScaledVector(side,sign*(b.width/2-.12));p.y+=.8;
        add(rails,.12,.14,d.length()+.05,p);
        if(i%2===0){const p=a.clone().addScaledVector(side,sign*(b.width/2-.12));p.y+=.43;add(rails,.16,1.05,.16,p);}
      }
    }
    const part=new THREE.Group();part.name=b.id;part.userData.crossing=b;
    for(const [list,mat]of[[decks,deckMat],[rails,railMat]]){
      if(!list.length)continue;
      const merged=mergeGeometries(list);list.forEach(g=>g.dispose());
      const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=true;mesh.receiveShadow=true;part.add(mesh);
    }
    group.add(part);
  }
  builtVersion=field.terrainEdits?.version;builtEdits=field.terrainEdits;
  };
  return {group,update(x,z){
    if(field.sculpt){if(!group.parent)scene.add(group);}else{scene.remove(group);return;}
    if(builtEdits!==field.terrainEdits||builtVersion!==field.terrainEdits?.version||builtVersion===null)rebuild();
    for(const o of group.children){const p=o.userData.crossing.points;const m=p[Math.floor(p.length/2)];o.visible=Math.hypot(m[0]-x,m[2]-z)<360;}
  },dispose(){group.traverse(o=>o.geometry?.dispose());deckMat.dispose();railMat.dispose();scene.remove(group);}};
}
