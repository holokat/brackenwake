// Exact positions and UVs, indexed with optional distant index buffers.
// Normals use signed 16-bit storage, colors use normalized 8-bit storage.
// Textures, sockets, source topology and hierarchy stay intact.
import assert from 'node:assert/strict';
import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
import {parseGLB} from '../../tools/validate-glb.mjs';
const WIDTH={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const TYPES={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array};

export async function packStructure(buffer,budget){
 await MeshoptSimplifier.ready;
 const {json,bin}=parseGLB(buffer),out=structuredClone(json),chunks=[];
 let offset=0;out.bufferViews=[];out.accessors=[];
 const view=(bytes,target)=>{const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const n=out.bufferViews.length;out.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);offset+=bytes.length;return n;};
 const accessor=(data,template,target)=>{const a={...template,bufferView:view(Buffer.from(data.buffer,data.byteOffset,data.byteLength),target),count:data.length/WIDTH[template.type]};delete a.byteOffset;delete a.min;delete a.max;
  if(template.type==='VEC3'&&target===34962){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<data.length;i++){const k=i%3;a.min[k]=Math.min(a.min[k],data[i]);a.max[k]=Math.max(a.max[k],data[i]);}}
  return out.accessors.push(a)-1;};
 const read=i=>{const a=json.accessors[i],v=json.bufferViews[a.bufferView],T=TYPES[a.componentType],w=WIDTH[a.type];assert(T&&w&&!a.sparse,'Unsupported studio attribute');assert(!v.byteStride||v.byteStride===w*T.BYTES_PER_ELEMENT,'Interleaved source needs explicit support');return new T(bin.buffer.slice(bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0)+a.count*w*T.BYTES_PER_ELEMENT));};
 const stats={triangles:0,midTriangles:0,farTriangles:0,verticesBefore:0,verticesAfter:0,maxLodError:0};
 for(const [mi,mesh]of json.meshes.entries()){
  assert.equal(mesh.primitives.length,1,'One atlas per studio model');
  const p=mesh.primitives[0],attrs=Object.entries(p.attributes).map(([key,ai])=>({key,ai,data:read(ai),w:WIDTH[json.accessors[ai].type]}));
  const count=json.accessors[p.attributes.POSITION].count,lookup=new Map(),unique=[],remap=new Uint32Array(count);
  for(let i=0;i<count;i++){
   const key=attrs.map(a=>Array.from(a.data.subarray(i*a.w,(i+1)*a.w)).join(',')).join('|');
   if(!lookup.has(key)){lookup.set(key,unique.length);unique.push(i);}remap[i]=lookup.get(key);
  }
  const indices=p.indices===undefined?remap:Uint32Array.from(read(p.indices),i=>remap[i]);
  const attributeIds={},arrays={};
  for(const a of attrs){const data=new a.data.constructor(unique.length*a.w);unique.forEach((v,i)=>data.set(a.data.subarray(v*a.w,(v+1)*a.w),i*a.w));arrays[a.key]=data;
   const template={...json.accessors[a.ai]};let stored=data;
   if(a.key==='NORMAL'){stored=Int16Array.from(data,n=>Math.round(Math.max(-1,Math.min(1,n))*32767));template.componentType=5122;template.normalized=true;}
   if(a.key==='COLOR_0'){stored=Uint8Array.from(data,n=>Math.round(Math.max(0,Math.min(1,n))*255));template.componentType=5121;template.normalized=true;}
   attributeIds[a.key]=accessor(stored,template,34962);
  }
  const indexId=data=>accessor(data,{componentType:5125,type:'SCALAR'},34963);
  const pos=arrays.POSITION,uv=arrays.TEXCOORD_0,color=arrays.COLOR_0,attribute=new Float32Array(unique.length*5);
  for(let i=0;i<unique.length;i++)attribute.set([uv[i*2],uv[i*2+1],...color.subarray(i*3,i*3+3)],i*5);
  // UVs are constant atlas cells. A high UV weight keeps color boundaries.
  const mid=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,attribute,5,[10,10,.3,.3,.3],null,Math.min(indices.length,budget*3),.008,['Permissive','Prune']);
  const far=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,attribute,5,[10,10,.2,.2,.2],null,Math.min(indices.length,Math.max(120,Math.floor(budget*.3))*3),.025,['Permissive','Prune']);
  out.meshes[mi].primitives=[{...p,attributes:attributeIds,indices:indexId(indices)}];
  out.meshes[mi].extras={...mesh.extras,kalderaLod:{mid:indexId(mid[0]),far:indexId(far[0])}};
  stats.triangles+=indices.length/3;stats.midTriangles+=mid[0].length/3;stats.farTriangles+=far[0].length/3;stats.verticesBefore+=count;stats.verticesAfter+=unique.length;stats.maxLodError=Math.max(stats.maxLodError,far[1]);
 }
 for(const [i,img]of(json.images||[]).entries()){assert(img.bufferView!==undefined,'Studio textures must be embedded');const v=json.bufferViews[img.bufferView];out.images[i].bufferView=view(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));}
 const binary=Buffer.concat(chunks);out.buffers=[{byteLength:binary.length}];
 const raw=Buffer.from(JSON.stringify(out)),j=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]),b=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]),result=Buffer.alloc(28+j.length+b.length);
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(j.length,12);result.writeUInt32LE(0x4e4f534a,16);j.copy(result,20);result.writeUInt32LE(b.length,20+j.length);result.writeUInt32LE(0x004e4942,24+j.length);b.copy(result,28+j.length);
 return {buffer:result,stats};
}
