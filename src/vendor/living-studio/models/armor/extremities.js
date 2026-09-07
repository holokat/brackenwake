import {constructionAccent} from './shapes.js';
import {blockHandDetails} from '../hand-shape.js';

export function buildHands(h){
 const p=h.profile,b=p.bulk;
 for(const s of[-1,1]){
  const side=s<0?'L':'R',x=s*1.61,y=-.22,z=4.03,binding=`hand${side}`;
  h.with(binding,p.role,()=>{
   const glove=h.rootPart(h.shell(`Block hand armor ${s}`,[[x,y,z+.05,.155+b*.28,.15+b*.28],[x+s*.015,y-.045,z-.12,.214+b*.35,.18+b*.35],[x+s*.005,y-.105,z-.40,.20+b*.35,.19+b*.35],[x,y-.09,z-.47,.16+b*.28,.16+b*.28]],p.material,{n:8,thickness:.034,closedEnd:true}));
   const details=blockHandDetails(x,y,z,s,{armored:true,bulk:b});
   h.attached(h.cube(`Block hand curl armor ${s}`,details.curl.center,details.curl.size,p.material,{bevel:.025}),glove);
   h.attached(h.cube(`Block thumb armor ${s}`,details.thumb.center,details.thumb.size,p.material,{bevel:.025}),glove);
   h.with(binding,p.edgeRole,()=>h.mountedStrip(`Glove turned wrist seam ${s}`,[[x-.11,4.01],[x+.11,4.01]],.054,glove,p.edge));
   if(p.tier==='plate')h.mountedPanel(`Gauntlet knuckle plate ${s}`,[[x-.14,3.88],[x+.14,3.88],[x+.14,3.64],[x-.14,3.64]],glove,p.edge,{thickness:.042});
   else if(p.tier==='cloth'||p.tier==='leather')h.with(binding,p.role==='cloth'?'trim':'leather',()=>h.mountedStrip(`Glove back seam ${s}`,[[x,3.64],[x,3.87]],.04,glove,p.edge));
   constructionAccent(h,{support:glove,x,z:3.76,width:.29,height:.16,binding});
  });
 }
}
export function buildWrists(h){
 const p=h.profile,b=p.bulk;
 for(const s of[-1,1]){
  const side=s<0?'L':'R',binding=`forearm${side}`,top=p.tier==='plate'?4.92:p.tier==='cloth'?4.46:4.71;
  h.with(binding,p.role,()=>{
   const rows=[[s*1.60,-.205,4.08,.20+b*.5,.20+b*.5],[s*1.575,-.177,4.32,.24+b*.5,.24+b*.5],[s*(1.60-(top-4.08)*.16),-.05,top,.27+b*.5,.25+b*.5]];
   const guard=h.shell(`${p.tier} wrist guard ${s}`,rows,p.material);
   if(p.tier==='plate')h.mountedPanel(`Vambrace dorsal plate ${s}`,[[s*1.60-.14,4.15],[s*1.60+.14,4.15],[s*1.48+.15,4.77],[s*1.48,4.87],[s*1.48-.15,4.77]],guard,p.edge,{thickness:.045});
   const z=top-.065,x=s*(1.60-(z-4.08)*.16);
   h.with(binding,p.edgeRole,()=>h.mountedStrip(`Bracer rolled upper lip ${s}`,[[x-.16,z],[x+.16,z]],.065,guard,p.edge));
   if(p.role==='leather')h.with(binding,'leather',()=>h.mountedStrip(`Bracer lower fastening strap ${s}`,[[s*1.56-.15,4.25],[s*1.56+.15,4.25]],.065,guard,'leather_light'));
   constructionAccent(h,{support:guard,x:s*1.55,z:4.38,width:.32,height:.18,binding});
  });
 }
}
function buckle(h,belt,p){
 h.with('hips','leather',()=>h.mountedStrip('Belt fastening tongue',[[0,4.30],[0,4.50]],.26,belt,'leather_dark',{thickness:.017}));
 h.with('hips','metal',()=>{
  const front=h.mountedPanel('Buckle recessed backplate',[[-.17,4.27],[.17,4.27],[.17,4.53],[-.17,4.53]],belt,'steel_dark',{thickness:.029});
  for(const[x,z]of[[-.145,4.40],[.145,4.40]])h.mountedStrip(`Buckle side rail ${x}`,[[x,4.28],[x,4.52]],.039,front,'steel_edge',{thickness:.031});
  for(const z of[4.294,4.506])h.mountedStrip(`Buckle cross rail ${z}`,[[-.14,z],[.14,z]],.039,front,'steel_edge',{thickness:.031});
  h.mountedStrip('Buckle pin',[[0,4.30],[0,4.50]],.025,front,'steel',{thickness:.038});
 });
}
export function buildWaist(h){
 const p=h.profile,b=p.bulk,height=p.tier==='cloth'?.36:p.tier==='plate'?.47:.30;
 const belt=h.band(`${p.tier} waist band`,4.40,.91+b,.57+b,height,p.material,'hips');
 if(p.tier==='cloth')h.with('hips','cloth',()=>{
  const point=h.surface(belt,.35,4.40);
  const end=h.attached(h.panel('Sash falling end',[[.27,point[1],4.46],[.48,point[1],4.45],[.44,point[1]-.035,3.39],[.27,point[1]-.025,3.49]],.052,p.edge),belt);
  h.attached(h.ico('Sash knot',[.36,point[1]-.045,4.40],[.18,.13,.14],p.edge,{sub:1}),[belt,end]);
  h.with('hips','trim',()=>h.mountedStrip('Sash folded waist seam',[[-.42,4.49],[0,4.49],[.20,4.49]],.04,belt,p.edge));
 });
 else buckle(h,belt,p);
 if(p.tier==='plate')h.with('hips','metal',()=>{
  for(const s of[-1,1]){
   const a=h.surface(belt,s*.27,4.21),b=h.surface(belt,s*.69,4.21);
   const tasset=h.attached(h.panel(`Articulated waist tasset ${s}`,[[a[0],a[1]-.018,4.22],[b[0],b[1]-.018,4.22],[s*.81,b[1]-.055,3.68],[s*.37,a[1]-.045,3.61]],.095,p.material),belt);
   h.mountedStrip(`Tasset rolled edge ${s}`,[[s*.41,3.72],[s*.67,3.75]],.047,tasset,p.edge);
  }
 });
 constructionAccent(h,{support:belt,x:.60,z:4.40,width:.24,height:.10,binding:'hips'});
}

/** A shared yoke bridges both thigh rings to one waist, with no exposed pelvis cylinder. */
function trouserYoke(h,legRows){
 const p=h.profile,n=p.sides,half=n/2,vertices=[],faces=[],lower=new Map(),top=new Map();
 for(const s of[-1,1]){
  const [x,y,z,rx,ry]=legRows.get(s).at(-1),ring=[];
  for(let k=0;k<n;k++){const a=k*Math.PI*2/n;ring.push(vertices.length);vertices.push([x+rx*Math.sin(a),y-ry*Math.cos(a),z-.012]);}lower.set(s,ring);
  const waist=[];
  for(let k=0;k<=half;k++){const a=k*Math.PI/half;waist.push(vertices.length);vertices.push([s*(.83+p.bulk)*Math.sin(a),.025-(.49+p.bulk)*Math.cos(a),4.16]);}top.set(s,waist);
  // Only the outside half of each thigh rises into the waist.
  for(let k=0;k<half;k++){
   const a=s>0?k:(n-k)%n,b=s>0?k+1:(n-k-1+n)%n;faces.push([ring[a],ring[b],waist[k+1],waist[k]]);
  }
 }
 const left=lower.get(-1),right=lower.get(1);
 faces.push([left[0],right[0],top.get(1)[0]],[right[half],left[half],top.get(-1)[half]]);
 // The inner arcs meet beneath the crotch; there are no hidden overlapping yoke panels.
 for(let k=0;k<half;k++)faces.push([left[k],left[k+1],right[(n-k-1+n)%n],right[(n-k)%n]]);
 return h.with('hips',p.role,()=>h.rootPart(h.thicken(`${p.tier} trouser pelvis yoke`,vertices,faces,([x,y,z])=>[x*.976,.025+(y-.025)*.94,z-.010],p.material)));
}
export function buildLegs(h){
 const p=h.profile,b=p.bulk,legRows=new Map();
 for(const s of[-1,1])legRows.set(s,[[s*.86,.03,.59,.22+b*.35,.235+b*.35],[s*.82,.08,1.16,.30+b*.50,.315+b*.50],[s*.77,.065,1.66,.365+b*.50,.37+b*.50],[s*.67,-.065,2.22,.29+b*.55,.30+b*.55],[s*.60,.035,2.86,.43+b*.5,.43+b*.5],[s*.49,.055,3.68,.46+b*.5,.49+b*.5]]);
 const yoke=trouserYoke(h,legRows);
 for(const s of[-1,1]){
  const side=s<0?'L':'R',binding='leg';
  h.with(binding,p.role,()=>{
   const leg=h.attached(h.shell(`${p.tier} trouser leg ${s}`,legRows.get(s),p.material),yoke);
   if(p.tier==='plate'){
    h.with(`thigh${side}`,'metal',()=>{
     const thigh=h.mountedPanel(`Thigh plate ${s}`,[[s*.52-.25,3.57],[s*.52+.25,3.57],[s*.65+.21,2.61],[s*.65,2.49],[s*.65-.21,2.61]],leg,p.edge,{thickness:.043});
     h.mountedStrip(`Thigh folded center ridge ${s}`,[[s*.64,2.65],[s*.55,3.46]],.041,thigh,p.material,{thickness:.025});
    });
    h.with(`shin${side}`,'metal',()=>{
     const knee=h.surface(leg,s*.67,2.23);h.attached(h.ico(`Knee plate ${s}`,[s*.67,knee[1]-.06,2.23],[.35,.18,.32],p.edge,{sub:1}),leg);
     h.mountedPanel(`Shin plate ${s}`,[[s*.76-.19,1.91],[s*.76+.19,1.91],[s*.87+.13,.68],[s*.87-.13,.68]],leg,p.material,{thickness:.038});
    });
   }else h.with(binding,p.edgeRole,()=>h.mountedStrip(`Trouser reinforced front seam ${s}`,[[s*.85,.72],[s*.80,1.18],[s*.74,1.65],[s*.67,2.22],[s*.60,2.86],[s*.53,3.57]],.037,leg,p.edge),side);
   constructionAccent(h,{support:leg,x:s*.53,z:3.23,width:.48,height:.34,binding:`thigh${side}`});
  },side);
 }
 h.with('hips',p.edgeRole,()=>h.mountedStrip('Trouser waist facing',[[-.56,4.08],[0,4.08],[.56,4.08]],.075,yoke,p.edge));
}
export function buildFeet(h){
 if(h.profile.tier==='cloth'){buildSandals(h);return;}
 const p=h.profile,b=p.bulk,plate=p.tier==='plate',height=plate?1.58:p.tier==='leather'?1.22:p.tier==='cloth'?.65:1.05;
 for(const s of[-1,1]){
  const side=s<0?'L':'R',x=s*1.03;
  const rows=[[x,-.22,.08,.385+b*.3,.52+b*.3],[s*1.01,-.23,.20,.39+b*.3,plate?.61:.53+b*.3],[s*.93,-.12,.40,.30+b*.3,.39+b*.3],[s*.87,.005,.59,.235+b*.3,.25+b*.3]];
  const foot=h.with(`foot${side}`,p.role,()=>h.rootPart(h.loft(`${p.tier} boot foot ${s}`,rows,p.material,{n:p.sides})));
  h.with(`foot${side}`,'leather',()=>{
   h.attached(h.loft(`Boot sole ${s}`,[[x,-.22,.025,.389+b*.3,.525+b*.3],[x,-.22,.13,.398+b*.3,.54+b*.3]],'leather_dark',{n:p.sides}),foot);
   h.mountedStrip(`Boot toe welt ${s}`,[[x-.21,.20],[x,.20],[x+.21,.20]],.034,foot,'leather_light',{thickness:.018});
  });
  h.with(`shin${side}`,p.role,()=>{
   const topX=s*(.87-(height-.5)*.07),upper=h.attached(h.shell(`${p.tier} boot upper ${s}`,[[s*.88,0,.43,.27+b*.4,.29+b*.4],[s*.85,.02,.70,.26+b*.4,.29+b*.4],[topX,.06,height,.33+b*.4,.34+b*.4]],p.material),foot);
   h.with(`shin${side}`,p.edgeRole,()=>h.attached(h.shell(`Turned boot cuff ${s}`,[[topX,.06,height-.095,.325+b*.4,.335+b*.4],[topX,.06,height+.006,.346+b*.4,.356+b*.4]],p.edge,{thickness:.061}),upper));
   if(plate)h.mountedStrip(`Boot upper folded ridge ${s}`,[[s*.85,.77],[topX,1.41]],.05,upper,p.edge,{thickness:.031});
   if(p.tier==='leather')h.with(`shin${side}`,'leather',()=>h.mountedStrip(`Boot ankle strap ${s}`,[[s*.84-.15,.79],[s*.84+.15,.79]],.065,upper,'leather_dark'));
   constructionAccent(h,{support:upper,x:s*.84,z:Math.min(height-.12,.83),width:.30,height:.16,binding:`shin${side}`});
  });
 }
}


function buildSandals(h){
 const p=h.profile;
 for(const s of[-1,1]){
  const side=s<0?'L':'R',x=s*1.01;
  const sole=h.with(`foot${side}`,'leather',()=>h.rootPart(h.loft(`Sandal leather sole ${s}`,[[x,-.22,.025,.39,.535],[x,-.22,.135,.40,.545]],'leather_dark',{n:12})));
  h.with(`foot${side}`,'cloth',()=>{
   for(const[cy,height,name]of[[-.46,.30,'toe'],[-.085,.42,'instep']]){
    const vertices=[];
    for(const[dx,z]of[[-.345,.11],[-.28,height-.05],[0,height],[.28,height-.05],[.345,.11]])vertices.push([x+dx,cy-.085,z],[x+dx,cy+.085,z]);
    const faces=[];for(let i=0;i<4;i++)faces.push([i*2,i*2+1,i*2+3,i*2+2]);
    h.attached(h.thicken(`Sandal ${name} strap ${s}`,vertices,faces,([xx,y,z])=>[xx,y,z-.040],p.material),sole);
   }
  });
  h.with(`shin${side}`,'cloth',()=>{
   const vertices=[],faces=[],n=6,cx=s*.87;
   for(const[z,rx,ry,centerX]of[[.12,.32,.25,x],[.49,.265,.275,cx]])for(let k=0;k<=n;k++){
    const a=Math.PI/2+Math.PI*k/n;vertices.push([centerX+rx*Math.sin(a),.035-ry*Math.cos(a),z]);
   }
   for(let k=0;k<n;k++)faces.push([k,k+1,k+n+2,k+n+1]);
   const heel=h.attached(h.thicken(`Sandal heel sling ${s}`,vertices,faces,([xx,y,z])=>[cx+(xx-cx)*.91,.035+(y-.035)*.91,z],p.material),sole);
   h.attached(h.shell(`Sandal ankle strap ${s}`,[[cx,.035,.455,.272,.282],[cx,.035,.57,.272,.282]],p.edge,{n:12,thickness:.052}),heel);
  });
 }
}
