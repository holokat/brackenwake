import {THREE,kit,TAU,plank,tube} from './shared.js';

export function roof(k,name,p,width,depth,height,material='slate') {
 const g=k.group(name,p),q=kit(g);
 for(const side of [-1,1]){
  const slope=q.box(`${name} roof slope ${side}`,[side*width*.25,height*.5,0],[Math.hypot(width/2,height)+.09,.065,depth],material,.006);slope.rotation.z=-side*Math.atan2(height,width/2);
  for(let row=0;row<4;row++)for(let col=0;col<Math.max(4,Math.round(depth/.25));col++){
   const t=(row+.5)/4,x=side*width/2*t,y=height*(1-t)+.045,z=-depth/2+.13+col*.25;
   if(z>depth/2-.02)continue;
   const tile=q.box(`${name} tile ${side} ${row} ${col}`,[x,y,z],[Math.hypot(width/2,height)/4+.018,.022,.238],row%2?'slateLight':material,.005);tile.rotation.z=slope.rotation.z;
  }
 }
 q.beam(`${name} ridge`,[0,height,-depth/2],[0,height,depth/2],.075,.075,'woodDark');
 for(const z of [-1,1])for(const side of [-1,1])q.beam(`${name} bargeboard ${z} ${side}`,[0,height+.02,z*depth*.51],[side*width/2,0,z*depth*.51],.085,.06,'woodDark');
 return g;
}

export function barrel(k,name,p,r=.3,h=.7,{open=false,water=false}={}) {
 const g=k.group(name,p),q=kit(g);
 for(let i=0;i<14;i++){
  const a=i/14*TAU,b=(i+1)/14*TAU;
  const vertices=[];
  const ys=[0,h*.12,h*.5,h*.88,h],rs=[r*.83,r*.94,r,r*.94,r*.83];
  for(let j=0;j<4;j++){
   const A=[Math.cos(a)*rs[j],ys[j],Math.sin(a)*rs[j]],B=[Math.cos(b)*rs[j],ys[j],Math.sin(b)*rs[j]],C=[Math.cos(a)*rs[j+1],ys[j+1],Math.sin(a)*rs[j+1]],D=[Math.cos(b)*rs[j+1],ys[j+1],Math.sin(b)*rs[j+1]];
   vertices.push(...A,...B,...D,...A,...D,...C);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const stave=q.mesh(`${name} stave ${i}`,geo,i%3?'wood':'woodLight');stave.material.side=THREE.DoubleSide;
 }
 for(const yy of [.12,.5,.88])q.torus(`${name} iron hoop ${yy}`,[0,h*yy,0],r*(yy===.5?1.01:.95),.018,'iron',[Math.PI/2,0,0],20);
 if(!open)for(let i=-2;i<=2;i++){const w=2*Math.sqrt(Math.max(.001,(r*.82)**2-(i*r*.28)**2));plank(q,`${name} lid plank ${i}`,[0,h,i*r*.28],[w,.027,r*.26]);}
 else{q.torus(`${name} open rim`,[0,h,0],r*.83,.015,'woodLight',[Math.PI/2,0,0],20);if(water){const o=q.cylinder(`${name} water`,[0,h*.72,0],r*.94,r*.94,.008,'water',20);o.material.roughness=.15;o.material.metalness=.12;}else q.cylinder(`${name} dark hollow`,[0,h*.16,0],r*.87,r*.87,.018,'woodDark',14);}
 return g;
}

export function basket(k,name,p,r=.19,h=.22) {
 const g=k.group(name,p),q=kit(g);
 q.cylinder(`${name} wicker body`,[0,h/2,0],r,r*.68,h,'rope',12);
 for(let i=0;i<6;i++)q.torus(`${name} horizontal weave ${i}`,[0,(i+.4)/6*h,0],r*(.7+i*.06),.008,'woodLight',[Math.PI/2,0,0],16);
 for(let i=0;i<12;i++){const a=i/12*TAU;q.beam(`${name} upright willow ${i}`,[Math.cos(a)*r*.68,0,Math.sin(a)*r*.68],[Math.cos(a)*r,h,Math.sin(a)*r],.007,.007,'woodDark');}
 q.cylinder(`${name} interior`,[0,h-.012,0],r*.92,r*.92,.009,'woodDark',12);return g;
}

export function wheel(k,name,p,r=.45,iron=false) {
 const g=k.group(name,p),q=kit(g);
 q.torus(`${name} felloe`,[0,0,0],r,.055,iron?'iron':'woodDark',[0,0,0],20);
 q.torus(`${name} iron tyre`,[0,0,0],r+.045,.015,'iron',[0,0,0],20);
 q.cylinder(`${name} hub`,[0,0,0],.09,.09,.2,'wood',10).rotation.x=Math.PI/2;
 for(let i=0;i<10;i++){const a=i/10*TAU;q.beam(`${name} spoke ${i}`,[0,0,0],[Math.cos(a)*r,Math.sin(a)*r,0],.038,.045,iron?'iron':'woodLight');}
 return g;
}

export function wagon(k,name,p,{hay=false,covered=false}={}) {
 const g=k.group(name,p),q=kit(g),w=2.25,d=1.25;
 for(const x of [-.8,.8]){q.beam(`${name} axle ${x}`,[x,.48,-.83],[x,.48,.83],.1,.1,'iron');for(const z of [-.78,.78])wheel(q,`${name} wheel ${x} ${z}`,[x,.48,z],.44);}
 for(let i=0;i<7;i++)plank(q,`${name} bed plank ${i}`,[(i-3)*.31,.78,0],[.30,.09,d]);
 for(const z of [-1,1])for(let row=0;row<3;row++)plank(q,`${name} side board ${z} ${row}`,[0,.93+row*.16,z*d*.5],[w,.14,.055]);
 for(const x of [-1,1])for(let row=0;row<3;row++)q.box(`${name} end board ${x} ${row}`,[x*w/2,.93+row*.16,0],[.055,.14,d],'wood');
 for(const z of [-.42,.42])q.beam(`${name} forward shaft ${z}`,[1.1,.73,z],[2.5,.12,z],.07,.065,'woodDark');
 if(hay){q.rock(`${name} hay load`,[0,1.6,0],[1.12,.72,.72],'straw',1);for(let i=0;i<40;i++){const x=(i%10-4.5)*.22,z=(Math.floor(i/10)-1.5)*.3;q.beam(`${name} straw wisp ${i}`,[x,1.45,z],[x+.06,2.05+Math.sin(i)*.2,z+.03],.016,.015,'thatch');}}
 if(covered){
  for(let x=-.95;x<=1;x+=.48)tube(q,`${name} canopy hoop ${x}`,[[x,1.25,-.68],[x,1.95,-.55],[x,2.18,0],[x,1.95,.55],[x,1.25,.68]],.035,'wood',6);
  const points=[];for(let i=0;i<12;i++){const a=Math.PI*i/11;points.push(new THREE.Vector2(Math.cos(a)*.68,1.3+Math.sin(a)*.9));}
  for(let i=0;i<11;i++){
   const a=points[i],b=points[i+1],geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-1.1,a.y,a.x,1.1,a.y,a.x,1.1,b.y,b.x,-1.1,a.y,a.x,1.1,b.y,b.x,-1.1,b.y,b.x],3));q.mesh(`${name} canvas panel ${i}`,geo,'cloth').material.side=THREE.DoubleSide;
  }
  q.box(`${name} strongbox`,[-.7,.96,0],[.5,.3,.5],'iron');q.box(`${name} strongbox lock`,[-.96,.98,.02],[.04,.12,.13],'brass');
 }
 return g;
}

export function hut(k,name,p,{leanTo=false,door=true}={}) {
 const g=k.group(name,p),q=kit(g),w=2,d=1.5,h=1.7;
 for(const z of [-d/2,d/2])for(let i=0;i<11;i++){
  const x=(i-5)*w/11;if(z>0&&door&&Math.abs(x)<.35)continue;
  q.box(`${name} wall plank ${z} ${i}`,[x,h/2,z],[w/11-.006,h,.05],i%3?'wood':'woodLight');
 }
 for(const x of [-w/2,w/2])for(let i=0;i<9;i++)q.box(`${name} side plank ${x} ${i}`,[x,h/2,(i-4)*d/9],[.05,h,d/9-.006],'wood');
 for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])q.beam(`${name} corner upright ${x} ${z}`,[x,0,z],[x,h,z],.10,.10,'woodDark');
 roof(q,`${name} pitched roof`,[0,h,0],2.2,1.72,.55);
 if(door){const panel=q.group(`${name} open door`,[-.36,0,.82]);panel.rotation.y=-.75;const b=kit(panel);for(let i=0;i<4;i++)plank(b,`${name} door plank ${i}`,[.075+i*.15,.68,0],[.143,1.35,.06]);for(const y of [.3,1.1])b.box(`${name} strap hinge ${y}`,[.3,y,.035],[.6,.04,.012],'iron');b.torus(`${name} door handle`,[.53,.68,.055],.034,.008,'iron');}
 if(leanTo){for(const x of [1.1,1.9])q.beam(`${name} woodstore post ${x}`,[x,0,-.55],[x,1.2,-.55],.08,.08,'woodDark');const o=q.box(`${name} lean-to roof`,[1.45,1.38,0],[1.15,.06,1.5],'woodDark');o.rotation.z=-.27;}
 return g;
}

export function rail(k,name,a,b,height=1,rails=3) {
 for(const [i,p] of [a,b].entries())k.beam(`${name} post ${i}`,[p[0],0,p[1]],[p[0],height,p[1]],.10,.1,'woodDark');
 for(let i=1;i<=rails;i++)k.beam(`${name} horizontal rail ${i}`,[a[0],height*i/(rails+.4),a[1]],[b[0],height*i/(rails+.4),b[1]],.075,.055,'woodLight');
}

export function stoneWall(k,name,p,w,h,d=.35) {
 const rows=Math.max(2,Math.round(h/.2));for(let y=0;y<rows;y++)for(let x=0;x<Math.ceil(w/.38);x++){
  const span=w/Math.ceil(w/.38),xx=-w/2+span*(x+.5)+(y%2?span*.15:0);
  k.rock(`${name} stone ${x} ${y}`,[p[0]+xx,p[1]+(y+.5)*h/rows,p[2]],[span*.54,h/rows*.52,d*.51],(x+y)%4?'stone':'stoneLight',0);
 }
}

export function trough(k,name,p,w=2,d=.65,h=.55,stone=true) {
 const g=k.group(name,p),q=kit(g),mat=stone?'stone':'woodDark';
 q.box(`${name} basin floor`,[0,.06,0],[w,.12,d],mat);
 for(const z of [-1,1])q.box(`${name} long rim ${z}`,[0,h/2,z*(d/2-.05)],[w,h,.1],mat,.035);
 for(const x of [-1,1])q.box(`${name} end rim ${x}`,[x*(w/2-.06),h/2,0],[.12,h,d],mat,.035);
 const water=q.box(`${name} water`,[0,h*.64,0],[w-.19,.006,d-.17],'water',0);water.material.roughness=.13;water.material.metalness=.15;
 for(let i=0;i<8;i++)q.rock(`${name} rim moss ${i}`,[-w*.42+i*w*.12,h,(i%2?1:-1)*(d*.43)],[.06,.018,.04],'moss',0);
 return g;
}
