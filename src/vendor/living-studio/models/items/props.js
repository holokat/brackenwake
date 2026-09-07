import {gem,grip,loop,plate,role,shaft} from './common.js';
import {skull} from './skull.js';

function book(h,holy){
 role(h.cube('Bound page block',[0,0,.29],[.57,.23,.76],'#c7ba98'),'paper');
 for(const y of[-.07,0,.07])role(h.cube('Page edge scoring',[.286,y,.29],[.006,.008,.725],'#a79a7b'),'paper');
 for(const y of[-.145,.145])role(h.cube('Leather book cover',[0,y,.29],[.69,.07,.88],holy?'leather_dark':'violet',{bevel:.024}),'leather');
 role(h.cube('Book spine',[-.32,0,.29],[.1,.33,.88],holy?'leather':'violet_dark',{bevel:.018}),'leather');
 h.cube('Book clasp',[.32,-.014,.25],[.14,.36,.1],'gold');
 for(const z of[-.05,.62])h.cube('Spine raised binding',[-.33,0,z],[.114,.345,.05],holy?'leather_dark':'violet_dark',{bevel:.009}).userData.materialRole='leather';
 for(const side of[-1,1])for(const z of[-.075,.655]){
  h.cube('Book corner cap',[side*.29,-.16,z],[.11,.065,.10],'gold',{bevel:.014});
 }
 if(holy){
  h.cube('Book cross stem',[0,-.194,.35],[.065,.035,.43],'gold');
  h.cube('Book cross arms',[0,-.195,.42],[.31,.035,.065],'gold');
  gem(h,[0,-.205,.42],{size:.066});
 }else{
  plate(h,'Tome diamond cover mount',[[0,.58],[.2,.29],[0,0],[-.2,.29]],.04,'gold',{y:-.19});
  gem(h,[0,-.224,.29],{size:.143});
  role(h.cube('Cloth bookmark',[.17,0,-.19],[.085,.035,.34],'red'),'cloth');
 }
}

function torch(h){
 shaft(h,-.41,1.05,{radius:.075});grip(h,{bottom:-.3,top:.22,radius:.09});
 h.loft('Iron torch basket',[[0,0,.77,.12,.12],[0,0,1.19,.25,.25]],'steel_dark',{n:6,variation:.015});
 h.loft('Torch basket rolled rim',[[0,0,1.13,.262,.262],[0,0,1.2,.262,.262]],'steel',{n:6,variation:0});
 const flame=role(h.loft('Faceted amber flame',[[0,0,1.13,.2,.17],[.055,0,1.48,.22,.15],[.02,0,1.79,.1,.08],[.15,0,2.01,.004,.004]],'#ffffff',{n:5,variation:0}),'flame');
 const {position,color}=flame.geometry.attributes;
 for(let i=0;i<position.count;i++){
  const c=h.mat(position.getZ(i)<1.6&&position.getY(i)<-.07?'#ffd477':'#d87a24').color;
  color.setXYZ(i,c.r,c.g,c.b);
 }
}

function lute(h){
 const outline=[[0,-.94],[-.3,-.81],[-.46,-.45],[-.42,-.15],[-.15,.21],[.15,.21],[.42,-.15],[.46,-.45],[.3,-.81]],n=outline.length;
 const rim=outline.map(([x,z])=>[x,-.121,z]),back=outline.map(([x,z])=>[x*.8,.155,-.34+(z+.34)*.82]);
 const faces=outline.flatMap((_,i)=>{const j=(i+1)%n;return[[i,j,n+j,n+i],[n+i,n+j,n*2]];});
 h.mesh('Pear shaped lute bowl',[...rim,...back,[0,.3,-.34]],faces,'wood',{variation:.015});
 const hole=Array.from({length:10},(_,i)=>{const a=i*Math.PI/5;return[Math.sin(a)*.105,-.20+Math.cos(a)*.12];});
 plate(h,'Lute soundboard',outline,.038,'wood_light',{y:-.14,holes:[hole]});
 loop(h,'Sound hole carved rim',[0,-.159,-.2],.117,.132,.013,'wood',{segments:10});
 h.cube('Lute neck',[0,-.072,.54],[.135,.115,.87],'wood',{bevel:.012});
 role(h.cube('Lute fretboard',[0,-.139,.51],[.13,.022,.8],'#39291a'),'wood');
 h.tube('Angled lute pegbox',[[0,-.07,.97],[0,.05,1.22]],.09,'wood',{sides:6,variation:0});
 h.cube('Lute bridge',[0,-.181,-.64],[.29,.058,.065],'wood');
 h.cube('Lute string nut',[0,-.159,.924],[.138,.025,.037],'#c7ba98').userData.materialRole='bone';
 for(const x of[-.045,0,.045])h.tube('Lute string',[[x,-.209,-.64],[x,-.172,.924]],.006,'bowstring',{sides:4,variation:0});
 for(const z of[.24,.39,.52,.63,.73,.82])role(h.cube('Lute tied fret',[0,-.153,z],[.14,.014,.014],'bowstring'),'cord');
 for(const side of[-1,1])h.tube('Lute tuning peg '+side,[[side*.055,.013,1.12],[side*.15,.013,1.12]],.025,'wood_light',{sides:5,variation:0});
 gem(h,[0,-.193,.1],{size:.055});
}

function tool(h,id){
 if(id==='tongs'){
  for(const s of[-1,1])h.tube('Forged tong arm '+s,[[s*.15,0,-.7],[s*.07,0,-.25],[-s*.055,0,.25],[-s*.19,0,.76],[-s*.12,0,1.04],[-s*.07,0,1.045]],.047,'steel_dark',{sides:6,variation:0});
  h.ico('Tong pivot',[0,-.045,.03],[.1,.055,.1],'steel',{sub:1,variation:0});
  h.ico('Tong pivot peened pin',[0,-.087,.03],[.045,.028,.045],'steel_edge',{sub:1,variation:0});
  h.ico('Rear tong pivot washer',[0,.045,.03],[.085,.035,.085],'steel',{sub:1,variation:0});return;
 }
 shaft(h,-.36,id==='pickaxe'?1.85:1.05,{radius:id==='pickaxe'?.095:.085});grip(h,{bottom:-.28,top:.28,radius:.105});
 shaft(h,-.38,-.25,{radius:.106,mat:'steel_dark',name:'Tool handle heel cap'});
 if(id==='pickaxe'){
  h.tube('Curved pick head',[[-1.01,0,1.47],[-.59,0,1.81],[0,0,1.88],[.59,0,1.81],[1.01,0,1.47]],[.014,.085,.145,.085,.014],'steel',{sides:6,variation:.015});
  h.loft('Pick socket',[[0,0,1.66,.16,.15],[0,0,1.97,.16,.15]],'steel_dark',{n:8,variation:0});
 }else{
  h.cube('Smith hammer face',[.24,0,1.04],[.43,.35,.35],'steel',{bevel:.035});
  h.cube('Smith hammer socket',[0,0,1.04],[.26,.3,.34],'steel_dark');
  plate(h,'Cross peen',[[-.1,.91],[-.48,1.0],[-.48,1.13],[-.1,1.2]],.18,'steel_edge');
 }
}

export function buildProp(h,id){
 if(id==='tome'||id==='holy_book')book(h,id==='holy_book');
 else if(id==='skull')skull(h);
 else if(id==='torch')torch(h);
 else if(id==='lute')lute(h);
 else if(['pickaxe','smith_hammer','tongs'].includes(id))tool(h,id);
 else if(id==='ring'){
  loop(h,'Faceted ring band',[0,0,0],.3,.3,.055,'gold',{segments:12});
  gem(h,[0,-.018,.32],{size:.14,alignToSurface:false});
 }else if(id==='amulet'){
  loop(h,'Amulet chain',[0,0,.51],.43,.66,.027,'gold',{segments:14});
  loop(h,'Pendant bail',[0,0,-.14],.055,.1,.028,'gold',{segments:8});
  plate(h,'Amulet setting',[[0,-.1],[.27,-.33],[.18,-.62],[0,-.75],[-.18,-.62],[-.27,-.33]],.09,'gold');
  gem(h,[0,-.071,-.4],{size:.19});
 }else if(id==='fists'){
  role(h.loft('Closed block fist',[[0,0,-.34,.17,.16],[0,-.035,-.17,.24,.2],[0,-.04,.18,.24,.2],[0,-.01,.27,.18,.17]],'skin',{n:6,phase:Math.PI/6,variation:.018}),'skin');
  role(h.cube('Block thumb',[-.19,-.18,-.04],[.16,.2,.28],'skin',{bevel:.025}),'skin');
  for(const x of[-.15,-.05,.05,.15])role(h.cube('Curled finger knuckle',[x,-.208,.083],[.097,.087,.20],'skin',{bevel:.022}),'skin');
 }else return false;
 return true;
}
