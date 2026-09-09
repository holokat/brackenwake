// Patch only the floor and ground-level inlay index lists in the shipped room.
// Keep every other mesh, texture, material, transform and binary buffer intact.
import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../../../assets/models/cellars/descent/boss-01.glb',import.meta.url);
const file=await readFile(path),jsonLength=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+jsonLength));
if(doc.asset.extras?.commandStairOpening===1){console.log('Command stair opening is already cut.');process.exit(0);}
const bin=Buffer.from(file.subarray(28+jsonLength)),report=[];
for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
 const name=doc.materials[primitive.material].name;
 if(!['Descent floor','Descent bronze'].includes(name))continue;
 const a=doc.accessors[primitive.attributes.POSITION],v=doc.bufferViews[a.bufferView],iv=doc.accessors[primitive.indices],view=doc.bufferViews[iv.bufferView];
 if(a.componentType!==5126||!([5123,5125].includes(iv.componentType)))throw Error('Unexpected room accessor format');
 const stride=v.byteStride||12,offset=v.byteOffset+(a.byteOffset||0),io=view.byteOffset+(iv.byteOffset||0),bytes=iv.componentType===5125?4:2;
 const indices=Array.from({length:iv.count},(_,i)=>bytes===4?bin.readUInt32LE(io+i*bytes):bin.readUInt16LE(io+i*bytes));
 const xyz=i=>[0,4,8].map(k=>bin.readFloatLE(offset+i*stride+k));
 const keep=[];let removed=0;
 for(let i=0;i<indices.length;i+=3){
  const tri=indices.slice(i,i+3),p=tri.map(xyz),x=p.reduce((s,q)=>s+q[0],0)/3,z=p.reduce((s,q)=>s+q[2],0)/3;
  // Nine 2m floor tiles, with the shoulders covering their cut edges. No wall,
  // ceiling, hanging inlay or neighbouring combat floor is removed.
  if(Math.abs(x)<3.01&&z<-6&&z>-12&&Math.max(...p.map(q=>q[1]))<.24)removed++;
  else keep.push(...tri);
 }
 if(!removed)continue;
 keep.forEach((n,i)=>bytes===4?bin.writeUInt32LE(n,io+i*bytes):bin.writeUInt16LE(n,io+i*bytes));
 iv.count=keep.length;iv.min=[Math.min(...keep)];iv.max=[Math.max(...keep)];report.push({material:name,removedTriangles:removed});
}
if(!report.some(r=>r.material==='Descent floor'))throw Error('The expected floor tiles were not found');
doc.asset.extras={...doc.asset.extras,commandStairOpening:1};
const json=Buffer.from(JSON.stringify(doc)),padding=(4-json.length%4)%4,padded=Buffer.concat([json,Buffer.alloc(padding,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+bin.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
await writeFile(path,Buffer.concat([header,padded,bh,bin]));console.log(JSON.stringify(report));
