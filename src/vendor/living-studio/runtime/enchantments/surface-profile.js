import * as THREE from 'three';

const excluded = /grip|winding|guard|pommel|bolster|ricasso|lugs|ferrule|socket|collar|binding|butt|heel|stirrup|rail|stock|string|nock|retaining|prong/i;
const working = /blade|edge|spear point|spear head|flange|mace core|mace crown|striking face|hammer.*beak|maul.*head|maul face|crown|staff crystal|staff skull|bow.*limb|crossbow prod|arrow head|bolt head|throwing knife/i;
const isFarther=(point,best)=>{const difference=point.lengthSq()-best.lengthSq();return difference>1e-8||(Math.abs(difference)<=1e-8&&point.z>best.z);};
export function randomSource(seed = 1) {
  let value = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((a,c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Samples real triangles in native item coordinates, never editing source buffers. */
export function createSurfaceProfile(target, seed) {
  target.updateWorldMatrix(true, true);
  const inverse = target.matrixWorld.clone().invert(), triangles = [], bounds = new THREE.Box3(), surfaceNames = new Set();
  const point = new THREE.Vector3(), edge = new THREE.Vector3(), normal = new THREE.Vector3();
  const id = target.userData.itemId || target.name;
  let area = 0;const sources=[];
  target.traverse(mesh => {
    if (mesh.userData.archeryArrow || !mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes.position) return;
    const name = mesh.name, role = mesh.userData.materialRole;
    const quarter = id === 'quarterstaff' && /end cap/i.test(name);
    const wand = id === 'wand' && /gemstone|inset gemstone/i.test(name);
    if ((!working.test(name) && !quarter && !wand) || (!quarter && excluded.test(name)) || ['cord','leather','cloth','feather','recess'].includes(role)) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld), attribute = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const count = index ? index.count : attribute.count;
    const source={mesh,attribute,matrix,version:attribute.version};sources.push(source);
    for (let i = 0; i + 2 < count; i += 3) {
      const vertices = [0,1,2].map(j => new THREE.Vector3().fromBufferAttribute(attribute, index ? index.getX(i+j) : i+j).applyMatrix4(matrix));
      // Bow limbs cross the center grip; reject only those central triangles.
      if (/bow.*limb/i.test(name) && vertices.some(v => Math.abs(v.z) < .255)) continue;
      if (/throwing knife/i.test(name) && vertices.some(v => v.z < .24)) continue;
      normal.subVectors(vertices[1], vertices[0]).cross(edge.subVectors(vertices[2], vertices[0]));
      const triangleArea = normal.length() * .5;
      if (triangleArea < 1e-9) continue;
      area += triangleArea;
      triangles.push({vertices, normal: normal.clone().normalize(), cumulative: area, surface: name,source,indices:[0,1,2].map(j=>index?index.getX(i+j):i+j)});
      vertices.forEach(v => bounds.expandByPoint(v)); surfaceNames.add(name);
    }
  });
  if (!triangles.length) throw new Error(`No enchantable working surfaces on ${id || 'weapon'}`);
  const random = randomSource(seed), points = [];
  for (let i = 0; i < 160; i++) {
    const targetArea = (i + random()) / 160 * area;
    const triangle = triangles.find(entry => entry.cumulative >= targetArea) || triangles.at(-1);
    const u = Math.sqrt(random()), v = random(), [a,b,c] = triangle.vertices;
    point.copy(a).multiplyScalar(1-u).addScaledVector(b,u*(1-v)).addScaledVector(c,u*v);
    points.push({position: point.clone(), normal: triangle.normal.clone(), surface: triangle.surface,triangle,weights:[1-u,u*(1-v),u*v]});
  }
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const tip = triangles.flatMap(t => t.vertices).reduce((best,v) => isFarther(v,best) ? v : best, center).clone();
  const positions = [], normals = [];
  for (const triangle of triangles) for (const vertex of triangle.vertices) { positions.push(...vertex); normals.push(...triangle.normal); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3));
  const currentMatrix=new THREE.Matrix4();
  function refresh(){
    inverse.copy(target.matrixWorld).invert();let changed=false;
    for(const source of sources){currentMatrix.multiplyMatrices(inverse,source.mesh.matrixWorld);const moved=currentMatrix.elements.some((value,i)=>Math.abs(value-source.matrix.elements[i])>1e-10);if(source.version!==source.attribute.version||moved){changed=true;source.version=source.attribute.version;source.matrix.copy(currentMatrix);}}
    if(!changed)return false;
    bounds.makeEmpty();let offset=0;tip.set(0,0,0);
    for(const triangle of triangles){
      for(let j=0;j<3;j++){const vertex=triangle.vertices[j];vertex.fromBufferAttribute(triangle.source.attribute,triangle.indices[j]).applyMatrix4(triangle.source.matrix);bounds.expandByPoint(vertex);if(isFarther(vertex,tip))tip.copy(vertex);}
      normal.subVectors(triangle.vertices[1],triangle.vertices[0]).cross(edge.subVectors(triangle.vertices[2],triangle.vertices[0])).normalize();triangle.normal.copy(normal);
      for(const vertex of triangle.vertices){vertex.toArray(geometry.attributes.position.array,offset);normal.toArray(geometry.attributes.normal.array,offset);offset+=3;}
    }
    for(const sample of points){sample.position.set(0,0,0);for(let j=0;j<3;j++)sample.position.addScaledVector(sample.triangle.vertices[j],sample.weights[j]);sample.normal.copy(sample.triangle.normal);}
    bounds.getCenter(center);bounds.getSize(size);geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;geometry.boundingSphere=null;return true;
  }
  return {bounds, center, tip, size, scale: Math.max(.45, Math.min(2.2, size.length()*.48)), points, surfaceNames: [...surfaceNames], triangleCount: triangles.length, geometry,refresh};
}
