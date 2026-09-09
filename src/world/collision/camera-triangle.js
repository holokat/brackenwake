import * as T from 'three';
const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3(),edge=new T.Vector3(),w=new T.Vector3(),point=new T.Vector3();
const tri=new T.Triangle(a,b,c),closest=new T.Vector3();
function firstRoot(aa,bb,cc){
 if(Math.abs(aa)<1e-12)return Infinity;
 const d=bb*bb-4*aa*cc;if(d<0)return Infinity;
 const t=(-bb-Math.sqrt(d))/(2*aa);return t>=0?t:Infinity;
}
/** Exact swept sphere against a triangle's face, edge cylinders and vertex
 * spheres. It is two-sided, even when the renderer culls a wall's back face. */
export function triangleCameraDistance(position,index,i,origin,direction,radius,limit){
 const vertex=n=>index?index.getX(n):n;
 a.fromBufferAttribute(position,vertex(i));b.fromBufferAttribute(position,vertex(i+1));c.fromBufferAttribute(position,vertex(i+2));
 tri.closestPointToPoint(origin,closest);
 if(closest.distanceToSquared(origin)<=radius*radius)return 0;
 tri.getNormal(normal);
 const signed=normal.dot(w.copy(origin).sub(a)),speed=normal.dot(direction);
 if(Math.abs(speed)>1e-12)for(const side of [-1,1]){
  const t=(side*radius-signed)/speed;
  if(t<0||t>=limit)continue;
  point.copy(origin).addScaledVector(direction,t).addScaledVector(normal,-side*radius);
  if(tri.containsPoint(point))limit=t;
 }
 for(let i=0;i<3;i++){
  const v=i===0?a:i===1?b:c,end=i===0?b:i===1?c:a;
  w.copy(origin).sub(v);
  limit=Math.min(limit,firstRoot(1,2*w.dot(direction),w.lengthSq()-radius*radius));
  edge.copy(end).sub(v);const ee=edge.lengthSq();if(ee<1e-12)continue;
  const ve=direction.dot(edge),we=w.dot(edge);
  const t=firstRoot(1-ve*ve/ee,2*(w.dot(direction)-we*ve/ee),w.lengthSq()-we*we/ee-radius*radius);
  if(t>=limit)continue;
  const u=(we+t*ve)/ee;if(u>=0&&u<=1)limit=t;
 }
 return limit;
}
