import {goblinAnatomies} from './goblin-anatomy.js';

/** Wide muzzles, sloping backs, long arms and short splayed legs, with no human base. */
export function buildChibiGoblin(s,id,{clothColor}={}){
 const warrior=id==='goblinWarrior',j=goblinAnatomies[id].joints,b=warrior?1:0;
 const skin=warrior?'#748759':'#8b9b5a',shade='#586641',dark='#242a21',leather='#493b2e';
 const cloth=clothColor||(warrior?'#624841':'#555e36'),bone='#d4c6a1',metal='#71736b';
 const headZ=j.head[2],headY=j.head[1];
 s.bone='head';
 volume(s,'Goblin sloping wedge skull',[
  [headZ-.58,.57,.46,0,headY-.15],[headZ-.33,.98,.65,0,headY-.11],
  [headZ+.12,1.21+b*.08,.70,0,headY],[headZ+.65,1.17+b*.07,.70,0,headY],
  [headZ+1.02,.84,.52,0,headY+.10],[headZ+1.19,.40,.29,0,headY+.08],
 ],skin);
 volume(s,'Goblin broad jutting muzzle',[
  [headZ-.49,.47,.21,0,headY-.54],[headZ-.30,.76,.38,0,headY-.62],
  [headZ-.07,.80,.36,0,headY-.65],[headZ+.12,.44,.20,0,headY-.64],
 ],skin);
 s.ico('Goblin hooked nose',[0,headY-.88,headZ+.25],[.29,.38,.33],skin,1);
 for(const sign of[-1,1]){
  const ear=[[sign*.94,headY+.04,headZ+.74],[sign*2.04,headY+.13,headZ+.91],
   [sign*1.57,headY-.02,headZ+.13],[sign*.99,headY-.09,headZ-.02],[sign*1.22,headY+.32,headZ+.37]];
  s.mesh('Goblin pointed ear '+sign,ear,[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]],skin);
  s.mesh('Goblin recessed ear fold '+sign,[[sign*1.17,headY-.039,headZ+.60],[sign*1.82,headY+.075,headZ+.78],[sign*1.50,headY-.028,headZ+.24]],[[0,1,2]],shade);
  const x=sign*.53,y=headY-.707,z=headZ+.43;
  s.cube('Goblin inset eye '+sign,[x,y,z],[.44,.06,.22],dark,.035);
  s.cube('Goblin amber pupil '+sign,[x-sign*.025,y-.035,z-.005],[.105,.025,.145],'#d5bb62',.022);
  s.tube('Goblin heavy slanted brow '+sign,[[sign*.23,y-.025,z+.17],[sign*.58,y-.015,z+.27],[sign*.91,y+.07,z+.27]],[.105,.13,.07],shade,5);
  s.tube('Goblin upward tusk '+sign,[[sign*.51,headY-.78,headZ-.22],[sign*.63,headY-1.04,headZ-.03],[sign*.57,headY-1.02,headZ+.17]],[.115,.075,.008],bone,5);
 }
 s.tube('Goblin mouth crease',[[-.41,headY-1.0,headZ-.20],[0,headY-1.025,headZ-.24],[.41,headY-1.0,headZ-.20]],.027,dark,4);
 for(let i=0;i<3;i++)s.tube('Goblin crown ridge '+i,[[0,headY-.20+i*.24,headZ+1.10],[0,headY-.15+i*.24,headZ+1.34-i*.06]],[.14,.015],shade,5);
 if(warrior)s.tube('Goblin warrior iron brow guard',[[-.91,headY-.63,headZ+.81],[0,headY-.69,headZ+.91],[.91,headY-.63,headZ+.81]],[[.12,.085],[.13,.085],[.12,.085]],metal,5);
 s.bone='neck';s.tube('Goblin thick forward neck',[j.neck,[0,headY+.02,headZ-.18]],[.37+b*.09,.42+b*.10],skin,8);
 s.bone='chest';
 const waist=j.hips[2],chest=j.chest[2];
 volume(s,'Goblin sloping bare torso',[[waist-.12,.51+b*.16,.40,0,.10],[waist+.30,.64+b*.23,.49,0,.09],
  [chest-.12,.77+b*.29,.52,0,.06],[chest+.36,.92+b*.29,.48,0,.11],[chest+.56,.45+b*.11,.36,0,.10]],skin);
 s.ico('Goblin hunched shoulder mass',[0,.28,chest+.18],[.77+b*.30,.43,.59],skin,1);
 s.tube('Goblin fitted leather harness',[[-.65-b*.16,-.23,chest+.36],[-.33,-.49,chest],[.13,-.52,waist+.53],[.53+b*.12,-.36,waist+.12]],[[.15,.045],[.15,.045],[.15,.045],[.15,.045]],leather,4);
 if(warrior){
  s.bone='upperArmL';s.ico('Goblin warrior single scrap pauldron',[-1.43,-.025,3.34],[.51,.47,.35],metal,1);
  for(const x of[-1.35,-1.60])s.tube('Goblin warrior shoulder spike '+x,[[x,-.02,3.56],[x-.07,-.02,3.94]],[.12,.008],bone,5);
 }else{
  s.bone='chest';for(let i=0;i<3;i++){
   const x=-.25+i*.24,z=chest-.03-i*.23;
   s.tube('Goblin scout short knife sheath '+i,[[x,-.57,z],[x+.13,-.57,z-.33]],[.075,.055],leather,5);
   s.tube('Goblin scout knife grip '+i,[[x,-.57,z],[x-.06,-.57,z+.17]],.051,bone,5);
  }
 }
 s.bone='hips';
 volume(s,'Goblin broad pelvis',[[waist-.38,.57+b*.10,.34,0,.12],[waist+.23,.63+b*.14,.43,0,.10]],skin);
 volume(s,'Goblin ragged hip wrap',[[waist-.58,.68+b*.14,.40,0,.10],[waist-.11,.77+b*.13,.45,0,.10],[waist+.12,.66+b*.14,.46,0,.10]],cloth);
 volume(s,'Goblin rope waist',[[waist+.09,.70+b*.14,.48,0,.10],[waist+.22,.69+b*.14,.47,0,.10]],leather);
 s.ico('Goblin rough waist clasp',[0,-.404,waist+.16],[.18,.09,.13],bone,1);
 for(const[sign,side]of[[-1,'L'],[1,'R']]){
  const shoulder=j['upperArm'+side],elbow=j['forearm'+side],hand=j['hand'+side];
  s.bone='upperArm'+side;
  s.tube('Goblin long heavy upper arm '+side,[shoulder,[(shoulder[0]+elbow[0])/2,-.035,(shoulder[2]+elbow[2])/2],elbow],[.30+b*.13,.31+b*.10,.25+b*.08],skin,7);
  s.bone='forearm'+side;s.ico('Goblin elbow '+side,elbow,[.27+b*.08,.27+b*.06,.28],skin,1);
  s.tube('Goblin long forearm '+side,[elbow,hand],[.30+b*.08,.24+b*.08],skin,7);
  s.tube('Goblin wrist binding '+side,[[hand[0]-sign*.045,hand[1]+.03,hand[2]+.20],hand],[.29+b*.07,.285+b*.07],leather,7);
  s.bone='hand'+side;
  const hx=hand[0],hy=hand[1],hz=hand[2];
  volume(s,'Goblin broad knuckle hand '+side,[[hz-.43,.28+b*.07,.23,hx,hy-.07],[hz-.13,.34+b*.08,.28,hx,hy-.06],[hz+.11,.23+b*.05,.20,hx,hy]],skin);
  s.ico('Goblin inward thumb '+side,[hx-sign*.29,hy-.09,hz-.19],[.16,.20,.19],skin,1);
  for(const n of[-1,0,1])s.tube('Goblin knuckle nail '+side+n,[[hx+n*.17,hy-.29,hz-.35],[hx+n*.17,hy-.34,hz-.48]],[.063,.012],bone,5);
  const thigh=j['thigh'+side],knee=j['shin'+side],foot=j['foot'+side];
  s.bone='thigh'+side;s.tube('Goblin squat haunch '+side,[thigh,knee],[.38+b*.08,.26+b*.07],skin,7);
  s.bone='shin'+side;s.ico('Goblin outward knee '+side,knee,[.285+b*.06,.29,.27],shade,1);
  s.tube('Goblin short bowed shin '+side,[knee,foot],[.26+b*.06,.23+b*.06],skin,7);
  s.bone='foot'+side;
  volume(s,'Goblin wide bare foot '+side,[[.01,.35+b*.05,.48,foot[0],-.32],[.15,.39+b*.05,.55,foot[0],-.35],[.38,.24+b*.04,.30,foot[0],-.20]],skin);
  for(let n=-1;n<=1;n++)s.tube('Goblin splayed toe '+side+n,[[foot[0]+n*.23,-.69,.14],[foot[0]+n*.26,-.99+Math.abs(n)*.06,.12]],[.14,.06],skin,5);
 }
}

function volume(s,name,rings,color){
 const v=[],f=[];
 for(const[z,w,d,x=0,y=0]of rings){const c=Math.min(.19,w*.35,d*.35);for(const[a,b]of[[-w+c,-d],[w-c,-d],[w,-d+c],[w,d-c],[w-c,d],[-w+c,d],[-w,d-c],[-w,-d+c]])v.push([x+a,y+b,z]);}
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++)f.push([r*8+i,r*8+(i+1)%8,(r+1)*8+(i+1)%8,(r+1)*8+i]);
 f.push([7,6,5,4,3,2,1,0],Array.from({length:8},(_,i)=>(rings.length-1)*8+i));return s.mesh(name,v,f,color);
}
