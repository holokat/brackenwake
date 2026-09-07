import {constructionAccent} from './shapes.js';

export function buildHead(h){
 const p=h.profile,b=p.bulk,hood=['cloth','chain'].includes(p.tier),plate=p.tier==='plate';
 h.with('head',p.role,()=>{
  const vertices=[],faces=[],n=12,arc=9;
  const guardRows=hood?[[6.82,.54,.41],[7.08,.49,.43],[7.43,.50,.45],[7.78,.49,.445]]:[[7.05,.44,.38],[7.42,.48,.42],[7.78,.49,.445]];
  for(const[z,rx,ry]of guardRows)for(let k=2;k<=10;k++){
   const a=k*Math.PI/6;vertices.push([(rx+b*.45)*Math.sin(a),.035-(ry+b*.45)*Math.cos(a),z]);
  }
  for(let row=0;row<guardRows.length-1;row++)for(let k=0;k<arc-1;k++){
   const a=row*arc+k;faces.push([a,a+1,a+arc+1,a+arc]);
  }
  const topOffset=(guardRows.length-1)*arc,crownRing=[];
  for(let k=0;k<n;k++){
   if(k>=2&&k<=10)crownRing.push(topOffset+k-2);
   else{const a=k*Math.PI/6;crownRing.push(vertices.length);vertices.push([(.49+b*.45)*Math.sin(a),.035-(.445+b*.45)*Math.cos(a),7.78]);}
  }
  let previous=crownRing;
  for(const[z,rx,ry]of [[8.00,.415+b*.32,.365+b*.32],[plate?8.23:8.16,plate?.095:.16,.13]]){
   const ring=[];for(let k=0;k<n;k++){const a=k*Math.PI/6;ring.push(vertices.length);vertices.push([rx*Math.sin(a),.06-ry*Math.cos(a),z]);}
   for(let k=0;k<n;k++)faces.push([previous[k],previous[(k+1)%n],ring[(k+1)%n],ring[k]]);previous=ring;
  }
  faces.push(previous);
  const shell=h.rootPart(h.thicken(`${p.tier} joined crown and ${hood?'cowl':'nape guard'}`,vertices,faces,([x,y,z])=>{
   const r=Math.hypot(x,y-.035),factor=Math.max(.2,(r-.036)/r);return [x*factor,.035+(y-.035)*factor,z-.009];
  },p.material));
  h.with('head',p.edgeRole,()=>{
   h.mountedStrip('Fitted brow binding',[[-.37,7.83],[0,7.83],[.37,7.83]],.085,shell,p.edge);
   // Face opening keeps a continuous, thick return all the way into the crown.
   for(const side of[-1,1]){
    const points=guardRows.map(([z,rx,ry])=>[side*(rx+b*.45)*Math.sin(Math.PI/3),.035-(ry+b*.45)*.5,z]);
    h.attached(h.tube(`Bound face opening ${side}`,points,hood?.029:.035,p.edge,{sides:6}),shell);
   }
  });
  if(plate){
   h.with('head','metal',()=>{
    const nose=h.panel('Brow-mounted nasal guard',[[-.042,-.426,7.83],[.042,-.426,7.83],[.058,-.49,7.43],[0,-.50,7.36],[-.058,-.49,7.43]],.062,p.edge);
    h.attached(nose,shell);h.rivet('Nasal fastening',0,7.84,shell,{radius:.035});
   });
  }else if(p.tier==='leather'){
   h.mountedStrip('Cap crown sewn seam',[[0,7.87],[0,8.00],[0,8.11]],.045,shell,'leather_light');
  }
  constructionAccent(h,{support:shell,z:7.97,width:.46,height:.16,binding:'head'});
 });
}
