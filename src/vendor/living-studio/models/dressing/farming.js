import {THREE,kit,plank,log,ladder,tube,grass,motion,TAU} from './shared.js';
import {rail,trough,wagon,hut,wheel} from './construction.js';
import {axe} from './village.js';

export const farmingBuilders={kissing_gate:kissingGate,cattle_trough:cattleTrough,plough,harrow,hay_wain:hayWain,shepherds_hut:shepherdsHut,log_pile:logPile,charcoal_clamp:charcoalClamp,saw_pit:sawPit,hunters_seat:huntersSeat,snare,woodcutters_hut:woodcuttersHut,rope_swing:ropeSwing,timber_prop:timberProp};
function model(name,fn){const g=new THREE.Group();g.name=name;fn(kit(g));return g;}
function kissingGate(){return model('Kissing gate inside V rails',k=>{
 rail(k,'Left V fence',[-.75,-.55],[.45,0],1.1,3);rail(k,'Right V fence',[-.75,.55],[.45,0],1.1,3);
 const g=motion(k.group('Swinging kissing gate',[-.7,-.001,-.55]),'sway',{amount:.03,speed:.9}),q=kit(g);g.rotation.y=-.24;
 rail(q,'Hinged gate leaf',[0,0],[1.1,0],1.05,3);q.beam('Gate diagonal brace',[0,.1,0],[1.08,.92,0],.06,.045,'wood');
 for(const y of [.26,.85])q.torus(`Gate iron hinge ${y}`,[0,y,0],.08,.012,'iron',[Math.PI/2,0,0],12);
});}
function cattleTrough(){return model('Long cattle trough',k=>{trough(k,'Timber cattle basin',[0,0,0],2.4,.6,.55,false);for(const x of [-.8,.8])k.box(`Trough stone bearer ${x}`,[x,.06,0],[.26,.12,.66],'stone');});}
function plough(){return model('Wooden plough with iron share',k=>{
 k.beam('Long plough beam',[-1.15,.62,0],[.72,.34,0],.12,.14,'woodDark');
 for(const z of [-.31,.31]){k.beam(`Plough handle ${z}`,[.15,.22,z*.6],[.87,1.07,z],.067,.064,'wood');k.beam(`Plough grip ${z}`,[.84,1.04,z],[1.07,1.10,z],.058,.058,'woodLight');}
 k.beam('Plough handle crosspiece',[.43,.63,-.25],[.43,.63,.25],.05,.05,'woodDark');
 k.beam('Plough upright standard',[.1,.53,0],[.24,.09,0],.11,.075,'iron');
 const s=new THREE.Shape();s.moveTo(-.45,.02);s.lineTo(.50,.02);s.lineTo(.31,.16);s.lineTo(.1,.32);s.lineTo(-.07,.15);s.closePath();const share=k.extrude('Broad forged ploughshare',s,.4,'steel');share.position.z=-.2;share.rotation.y=.24;
 k.beam('Vertical coulter blade',[-.3,.55,0],[-.2,.06,0],.018,.16,'iron');
 k.torus('Plough trace ring',[-1.16,.61,0],.067,.015,'iron',[0,Math.PI/2,0],12);
});}
function harrow(){return model('Timber tooth harrow',k=>{
 for(const x of [-.85,-.28,.28,.85])k.beam(`Harrow crossbar ${x}`,[x,.28,-.7],[x,.28,.7],.09,.10,'wood');
 for(const z of [-.7,-.23,.23,.7])k.beam(`Harrow lengthwise rail ${z}`,[-.9,.24,z],[.9,.24,z],.08,.08,'woodDark');
 for(let x=0;x<5;x++)for(let z=0;z<4;z++){k.cone(`Iron harrow tooth ${x} ${z}`,[-.78+x*.39,.12,-.63+z*.42],.023,.24,'iron',4).rotation.z=Math.PI;}
 tube(k,'Harrow towing chain',[[-.84,.27,0],[-1.13,.17,0],[-1.29,.10,0]],.015,'iron',6);grass(k,'Grass through harrow',1.5,16,.32);
});}
function hayWain(){return model('Four wheel hay wain',k=>wagon(k,'Hay wain',[0,0,0],{hay:true}));}
function shepherdsHut(){return model('Shepherd hut on iron wheels',k=>{
 for(const x of [-.8,.8])for(const z of [-.78,.78])wheel(k,`Hut iron wheel ${x} ${z}`,[x,.32,z],.29,true);
 const cabin=hut(k,'Shepherd hut',[0,.55,0]);cabin.scale.set(1.3,1,1);
 k.box('Hut chassis',[0,.52,0],[2.85,.12,1.65],'woodDark');
 for(let i=0;i<3;i++)plank(k,`Hut entry step ${i}`,[0,.11+i*.15,1.15-i*.13],[.60,.11,.26]);
 k.cylinder('Stove chimney',[.73,2.61,-.38],.085,.085,.57,'iron',10);k.cone('Stove chimney rain cap',[.73,2.91,-.38],.16,.08,'iron',10);
 const socket=k.group('Stove smoke socket',[.73,2.96,-.38]);socket.userData.effect='chimney_smoke';
});}
function logPile(){return model('Roadside stacked trunks',k=>{
 for(let row=0;row<3;row++)for(let i=0;i<4-row;i++)log(k,`Roadside trunk ${row} ${i}`,[0,.2+row*.31,-.56+i*.36+row*.18],3.65-(i%2)*.20,.20,'x');
 for(const x of [-1.4,1.4])k.beam(`Log pile retaining stake ${x}`,[x,0,.72],[x,.7,.69],.07,.07,'woodDark');
});}
function charcoalClamp(){return model('Turf charcoal clamp and burner hut',k=>{
 k.rock('Turf covered charcoal mound',[-.45,.64,0],[1.80,.84,1.8],'earth',1);
 for(let i=0;i<15;i++){const a=i/15*TAU;k.rock(`Clamp turf sod ${i}`,[Math.cos(a)*1.40-.45,.58,Math.sin(a)*1.42],[.47,.25,.43],i%3?'moss':'earth',0);}
 k.cylinder('Clamp smoke vent',[-.45,1.46,0],.15,.21,.1,'coal',10);const smoke=k.group('Charcoal clamp smoke socket',[-.45,1.55,0]);smoke.userData.effect='chimney_smoke';
 const cabin=hut(k,'Charcoal burner hut',[2.05,0,-1]);cabin.scale.set(.63,.61,.63);
 k.beam('Charcoal rake shaft',[1.14,.02,1.32],[1.4,1.5,1.24],.036,.036,'woodLight');k.beam('Charcoal rake crossbar',[.84,.1,1.30],[1.42,.1,1.30],.06,.05,'iron');for(let i=0;i<7;i++)k.beam(`Charcoal rake tine ${i}`,[.88+i*.08,.1,1.3],[.88+i*.08,0,1.41],.014,.014,'iron');
});}
function sawPit(){return model('Saw pit with trunk and long saw',k=>{
 k.box('Dark saw pit hollow',[0,.02,0],[3.1,.025,1.1],'#292720');
 for(const z of [-.65,.65]){for(let i=0;i<9;i++)k.box(`Pit retaining plank ${z} ${i}`,[-1.44+i*.36,.29,z],[.345,.58,.055],'woodDark');k.beam(`Pit upper rim ${z}`,[-1.7,.56,z],[1.7,.56,z],.10,.10,'wood');}
 for(const x of [-1.04,1.04])k.beam(`Saw pit bearers ${x}`,[x,.59,-.77],[x,.59,.77],.18,.14,'woodDark');
 log(k,'Trunk across the saw pit',[0,.83,0],3.72,.29,'x');
 k.box('Long two man saw blade',[.14,.6,0],[.06,1.10,.35],'steel',0);
 for(let i=0;i<15;i++)k.cone(`Saw tooth ${i}`,[.14,.09+i*.074,.198],.026,.048,'iron',3).rotation.x=Math.PI/2;
 for(const y of [.05,1.16])k.beam(`Saw cross handle ${y}`,[.14,y,-.30],[.14,y,.30],.045,.045,'woodLight');
});}
function huntersSeat(){return model('Hunter high seat and ladder',k=>{
 k.cylinder('Tree supporting high seat',[.15,1.95,-.35],.19,.28,3.9,'wood',9);
 for(let i=0;i<6;i++)plank(k,`High seat platform board ${i}`,[(i-2.5)*.17,2.8,0],[.163,.075,.95]);
 for(const x of [-.45,.45]){k.beam(`High seat diagonal support ${x}`,[.1,2,-.3],[x,2.8,.4],.09,.09,'woodDark');k.beam(`High seat side post ${x}`,[x,2.8,-.35],[x,3.48,-.35],.06,.06,'wood');}
 plank(k,'High seat bench',[0,3.13,-.1],[.85,.08,.35]);plank(k,'High seat backrest',[0,3.47,-.38],[.92,.26,.045]);ladder(k,'High seat ladder',[0,0,.75],[0,2.8,.40],.5,10);
});}
function snare(){return model('Wire snare on rabbit run peg',k=>{
 k.beam('Wooden snare anchor peg',[-.09,0,0],[-.09,.22,0],.025,.025,'woodDark');
 k.torus('Open wire snare loop',[.055,.145,.03],.11,.003,'iron',[0,-.25,0],24);tube(k,'Snare tether',[[-.09,.18,0],[-.01,.2,.03],[.07,.25,.03]],.0025,'iron',5);grass(k,'Snare grass',.27,8,.09);
});}
function woodcuttersHut(){return model('Woodcutter plank hut and fire ring',k=>{
 hut(k,'Woodcutter hut',[-.3,0,-.15],{leanTo:true});
 for(let row=0;row<3;row++)for(let i=0;i<3-row;i++)log(k,`Woodstore log ${row} ${i}`,[1.15,.13+row*.2,-.45+i*.2],.60,.12,'x');
 for(let i=0;i<10;i++){const a=i/10*TAU;k.rock(`Fire ring stone ${i}`,[-.75+Math.cos(a)*.38,.07,1.09+Math.sin(a)*.38],[.11,.08,.11],'stone',0);}
 k.rock('Old fire ashes',[-.75,.013,1.09],[.27,.02,.27],'coal',0);axe(k,[-1.26,0,.61],.55);
});}
function ropeSwing(){return model('Six metre rope and stick swing',k=>{
 const group=motion(k.group('Hanging rope swing',[0,5.86,0]),'swing',{amount:.028,speed:.7}),q=kit(group);
 tube(q,'Long rope',[[0,0,0],[.013,-1.9,.015],[-.01,-3.9,0],[0,-5.7,0]],.012,'rope',6);q.beam('Worn stick seat',[-.095,-5.70,0],[.095,-5.70,0],.045,.04,'woodLight');q.torus('Seat rope knot',[0,-5.66,0],.025,.012,'rope',[0,Math.PI/2,0],8);
});}
function timberProp(){return model('Mine timber support frame',k=>{
 for(const x of [-1,1]){k.beam(`Squared pit prop ${x}`,[x,0,0],[x,2.17,0],.19,.18,'woodDark');k.beam(`Pit prop knee brace ${x}`,[x,1.58,0],[x*.53,2.18,0],.12,.11,'wood');k.box(`Pit prop foot stone ${x}`,[x,.05,0],[.3,.1,.38],'stone');}
 k.beam('Pit prop lintel',[-1.20,2.20,0],[1.20,2.20,0],.22,.20,'wood');for(const x of [-.96,.96])k.box(`Iron prop strap ${x}`,[x,2.1,.12],[.16,.28,.016],'iron');
});}
