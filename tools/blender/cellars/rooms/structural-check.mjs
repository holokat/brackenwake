import assert from 'node:assert/strict';

/** Recover connected solid pieces across glTF's flat-normal vertex splits. */
export function structuralComponents(bytes,gltf,materialNames) {
  const base=28+bytes.readUInt32LE(12),out=[];
  function read(ai){
    const a=gltf.accessors[ai],v=gltf.bufferViews[a.bufferView],n=a.type==='SCALAR'?1:3,s=a.componentType===5123?2:4;
    return Array.from({length:a.count},(_,i)=>{
      const at=base+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??s*n);
      const row=Array.from({length:n},(_,k)=>a.componentType===5126?bytes.readFloatLE(at+k*s):s===4?bytes.readUInt32LE(at+k*s):bytes.readUInt16LE(at+k*s));
      return n===1?row[0]:row;
    });
  }
  for(const mesh of gltf.meshes) for(const primitive of mesh.primitives){
    const name=gltf.materials[primitive.material].name;if(!materialNames.includes(name))continue;
    const pos=read(primitive.attributes.POSITION),idx=read(primitive.indices),parent=pos.map((_,i)=>i),weld=new Map();
    function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
    function union(a,b){a=root(a);b=root(b);if(a!==b)parent[a]=b;}
    for(let i=0;i<pos.length;i++){const key=pos[i].map(n=>Math.round(n*1e5)).join(',');if(weld.has(key))union(i,weld.get(key));else weld.set(key,i);}
    for(let i=0;i<idx.length;i+=3){union(idx[i],idx[i+1]);union(idx[i],idx[i+2]);}
    const groups=new Map();
    for(let i=0;i<idx.length;i+=3){
      const key=root(idx[i]),c=groups.get(key)??{material:name,triangles:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};c.triangles++;
      for(let k=0;k<3;k++)for(let axis=0;axis<3;axis++){const n=pos[idx[i+k]][axis];c.min[axis]=Math.min(c.min[axis],n);c.max[axis]=Math.max(c.max[axis],n);}
      groups.set(key,c);
    }
    out.push(...groups.values());
  }
  return out;
}

export function verifyCathedralStructure(bytes,gltf){
  const names=['Cellar stone_structure','Cellar stone_light_structure','Cellar stone_dark_structure'];
  for(const name of names)assert.ok(gltf.materials.some(m=>m.name===name),`Missing protected structure batch ${name}`);
  const parts=structuralComponents(bytes,gltf,names);assert.ok(parts.length>500);
  assert.ok(parts.every(p=>p.triangles>=12),'Structural prism collapsed into a tetrahedron or wedge');
  const stringer=parts.find(p=>p.material==='Cellar stone_dark_structure'&&p.min[0]>52.4&&p.max[0]<57.6&&p.min[2]>-12.1&&p.max[2]<12.1&&p.max[1]>8&&p.max[1]<9.1);
  assert.ok(stringer,'Missing first-flight stringer');assert.equal(stringer.triangles,12);
  assert.ok(Math.abs(stringer.max[1]-9)<.001&&Math.abs(stringer.min[1]+.35)<.001,'Stringer end collapsed');
  const treads=parts.filter(p=>p.material==='Cellar stone_light_structure'&&p.min[0]>52.4&&p.max[0]<57.6&&p.min[1]>-.1&&p.max[1]<9.2&&p.min[2]>-12.5&&p.max[2]<12.5);
  assert.equal(treads.length,33);assert.ok(treads.every(p=>p.triangles===28),'Stair tread bevel box collapsed');
  return {components:parts.length,minimumComponentTriangles:Math.min(...parts.map(p=>p.triangles)),stringerTriangles:stringer.triangles,firstFlightTreads:treads.length,treadTriangles:28};
}
