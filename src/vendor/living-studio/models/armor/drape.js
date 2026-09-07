/** Broad folds and returned edges describe fabric without a flat, paper-thin silhouette. */
export function buildRobeSkirt(h,dark=false,torso){
 const p=h.profile,hem=dark?.82:p.hem,width=dark?1.24:1.42,material=dark?'violet_dark':p.material;
 const rows=[[4.15,.857,.521],[3.72,1.065,.66],[3.30,1.075,.64],[2.05,1.17,.65],[hem,width,.75]];
 for(const s of[-1,1]){
  const side=s<0?'L':'R';let skirt,vertices=[],faces=[],steps=6;
  h.with('skirt',p.role,()=>{
   for(let r=0;r<rows.length;r++){
    const[z,rx,ry]=rows[r];
    for(let i=0;i<=steps;i++){
     const angle=.08+(Math.PI-.16)*i/steps,fold=1+(i%2?.035:-.01)*(r/(rows.length-1));
     const lift=r===rows.length-1?.13*Math.cos(angle)+.07*Math.sin(angle*3):0;
     vertices.push([s*rx*Math.sin(angle)*fold,.025-ry*Math.cos(angle)*fold,z+lift]);
    }
   }
   for(let r=0;r<rows.length-1;r++)for(let i=0;i<steps;i++){const a=r*(steps+1)+i;faces.push([a,a+1,a+steps+2,a+steps+1]);}
   skirt=h.attached(h.thicken(`Flowing robe skirt ${s}`,vertices,faces,.035,material),torso);
  },side);
  h.with('skirt','trim',()=>{
   const edging=[],edgeFaces=[];
   for(let row=0;row<rows.length;row++){
    const a=vertices[row*(steps+1)],b=vertices[row*(steps+1)+1];
    edging.push([a[0],a[1]-.018,a[2]],[a[0]+(b[0]-a[0])*.27,a[1]+(b[1]-a[1])*.27-.018,a[2]+(b[2]-a[2])*.27]);
   }
   for(let i=0;i<rows.length-1;i++)edgeFaces.push([i*2,i*2+1,i*2+3,i*2+2]);
   h.attached(h.thicken(`Robe skirt bound opening ${s}`,edging,edgeFaces,.035,dark?'violet':p.edge),skirt);
  },side);
 }
}
export function buildDrapedBack(h){
 const p=h.profile,cloth=p.tier==='cloth',leather=p.role==='leather',plate=p.tier==='plate';
 const bottom=cloth?1.46:plate?3.86:p.tier==='chain'?2.42:2.98,width=cloth?1.38:plate?1.02:1.24+p.bulk*.45;
 const rows=[[6.43,.45,.38],[6.11,1.13,.53],[5.25,1.03,.70],[4.15,1.05,.78],[bottom,width,.99]];
 const folds=[-.07,.10,-.075,.10,-.055,.085,-.06],vertices=[],faces=[],cols=folds.length;
 for(let r=0;r<rows.length;r++){
  const[z,w,cy]=rows[r],progress=r/(rows.length-1);
  for(let i=0;i<cols;i++){
   const t=i/(cols-1)*2-1,drift=progress*progress*(cloth?.16:leather?.085:.035),lift=r===rows.length-1?(.13+.22*t+.16*Math.abs(t)+folds[i]*.8)*(plate?.32:1):0;
   vertices.push([w*t+drift,cy-.29*t*t+folds[i]*(.4+progress),z+lift]);
  }
 }
 for(let r=0;r<rows.length-1;r++)for(let i=0;i<cols-1;i++){const a=r*cols+i;faces.push([a,a+1,a+cols+1,a+cols]);}
 const mantle=h.with('back',p.role,()=>h.rootPart(h.thicken(`${p.tier} draped back mantle`,vertices,faces,cloth?.032:leather?.05:.065,p.material)));
 h.with('back',p.edgeRole,()=>{
  const path=vertices.slice((rows.length-1)*cols).map(([x,y,z])=>[x,z+.055]);
  h.mountedStrip('Mantle weighted bound hem',path,.085,mantle,p.edge,{side:1,thickness:.018});
 });
 const straps=[];
 h.with('chest',p.role,()=>{
  for(const s of[-1,1]){
   const end=h.surface(mantle,s*.94,5.94,1),points=[[s*.35,-.25,6.36],[s*.70,.03,6.34],[s*.97,.26,6.12],end];
   const vertices=[];for(const[x,y,z]of points)vertices.push([x-.105,y,z],[x+.105,y,z]);
   const strap=h.attached(h.thicken(`Mantle shoulder fall ${s}`,vertices,[[0,1,3,2],[2,3,5,4],[4,5,7,6]],.045,p.material),mantle);straps.push(strap);
  }
 });
 return {bottom,width,mantle,straps};
}
