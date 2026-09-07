import * as THREE from 'three';

/** Folded leaf cards have a real silhouette and tumble around their centre. */
export function driftingFoliage(root,{style,radius,duration,color}){
 const petal=style==='petals',snow=style==='snow',seed=style==='seeds';
 let geometry;
 if(seed){
  const p=[];for(let i=0;i<6;i++){const a=i*Math.PI/3,b=a+.09;p.push(0,0,0,Math.cos(a)*.8,.8,Math.sin(a)*.8,Math.cos(b)*.8,.8,Math.sin(b)*.8);}p.push(-.018,-1,0,.018,-1,0,0,0,0);geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 }else if(snow)geometry=new THREE.CircleGeometry(1,6);
 else{
  const shape=petal?[[0,-.8],[-.6,-.2],[-.65,.4],[0,.9],[.65,.4],[.6,-.2]]:[[0,-1],[-.35,-.5],[-.65,-.2],[-.4,.15],[-.48,.5],[0,1],[.48,.5],[.4,.15],[.65,-.2],[.35,-.5]];
  const p=[];for(let i=0;i<shape.length;i++){const a=shape[i],b=shape[(i+1)%shape.length];p.push(0,0,.16,...a,0,...b,0);}geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 }
 geometry.computeVertexNormals();const count=snow?150:seed?48:44;
 const material=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,flatShading:true});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=`Drifting ${style}`;mesh.frustumCulled=false;root.add(mesh);
 const dummy=new THREE.Object3D(),tone=new THREE.Color(color),values=[];
 for(let i=0;i<count;i++){const a=Math.sin(i*127.17)*43758.5453;values.push(a-Math.floor(a));mesh.setColorAt(i,tone.clone().multiplyScalar(.75+(i%7)*.055));}
 return t=>{for(let i=0;i<count;i++){const p=(t/duration+values[i])%1;const x=Math.sin(i*12.33)*radius*.8,z=Math.cos(i*8.71)*radius*.7;dummy.position.set(x+Math.sin(t*.8+i)*.27,(1-p)*radius*1.15+.06,z+Math.cos(t*.7+i)*.2);dummy.rotation.set(t*(snow?.25:.6)+i,Math.sin(t*.5+i),t*.32+i);const s=snow?.018:seed?.045:petal?.055:.085;dummy.scale.setScalar(s*(.6+values[(i+3)%count]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;};
}
