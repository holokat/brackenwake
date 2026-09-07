import * as THREE from 'three';
import {noiseGLSL,meshPart} from './resources.js';

function bodyMesh(mesh){
  if(!mesh.isMesh||!mesh.geometry?.attributes.position)return false;
  for(let node=mesh;node;node=node.parent)if(['weapon','offhand'].includes(node.userData.slot)||node.userData.healerOwned)return false;
  return true;
}
function visible(mesh){for(let node=mesh;node;node=node.parent)if(!node.visible)return false;return true;}

/** An owned snapshot of real posed native triangles, never a replacement humanoid. */
export function resurrectedSoul(resources,actor,parent,color){
  const entries=[];let count=0;actor.traverse(mesh=>{if(bodyMesh(mesh)){entries.push({mesh,start:count,count:mesh.geometry.attributes.position.count});count+=mesh.geometry.attributes.position.count;}});
  const vertices=new Float32Array(Math.max(3,count)*3),indices=[];
  for(const {mesh,start,count:length}of entries){const source=mesh.geometry.index;if(source)for(let i=0;i<source.count;i++)indices.push(source.getX(i)+start);else for(let i=0;i<length;i++)indices.push(start+i);}
  const geometry=resources.ownGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uTime,uOpacity;varying vec3 vPosition,vView;${noiseGLSL}
    void main(){vec3 face=normalize(cross(dFdx(vView),dFdy(vView)));float rim=pow(max(0.,1.-abs(dot(face,normalize(vView)))),1.5);float bands=.5+.5*sin(vPosition.y*38.-uTime*3.);float veins=pow(max(0.,sin(vPosition.x*28.+vPosition.y*18.+fbm(vPosition*8.)*4.)),20.);float alpha=.18+rim*.49+veins*.09+bands*.035;gl_FragColor=vec4(mix(uColor,vec3(.3,.75,1.65),rim*.55)*1.7,alpha*uOpacity);}`,
    {blending:THREE.NormalBlending,vertexShader:`varying vec3 vPosition,vView;void main(){vPosition=position;vec4 p=modelViewMatrix*vec4(position,1.);vView=p.xyz;gl_Position=projectionMatrix*p;}`});
  const root=new THREE.Mesh(geometry,material);root.name='Actual character rising soul';root.userData.sourceCharacter=actor.name;root.userData.sourceMeshCount=entries.length;
  const point=new THREE.Vector3(),inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  function capture(){actor.updateWorldMatrix(true,true);parent.updateWorldMatrix(true,false);inverse.copy(parent.matrixWorld).invert();for(const {mesh,start,count:length}of entries){matrix.multiplyMatrices(inverse,mesh.matrixWorld);const shown=visible(mesh);for(let i=0;i<length;i++){if(shown){mesh.getVertexPosition(i,point);point.applyMatrix4(matrix);}else point.set(0,0,0);point.toArray(vertices,(start+i)*3);}}geometry.attributes.position.needsUpdate=true;}
  capture();const part=meshPart(root,material);return {...part,capture};
}
