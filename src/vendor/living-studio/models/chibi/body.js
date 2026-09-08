function bind(mesh,bone){mesh.userData.armorBinding=bone;return mesh;}
export function buildChibiBody(h,{slots,colors}){
 h.part='skin';
 bind(h.loft('Chibi neck',[[0,0,4.76,.31,.30],[0,0,5.47,.34,.31]],'skin',{n:8,variation:0}),'neck');
 h.part='outfit';
 const base=colors.cloth||'#33323b';
 bind(h.loft('Chibi inner torso',[[0,0,2.58,.68,.36],[0,0,3.15,.64,.37],[0,0,4.25,.83,.40],[0,0,4.64,.93,.37],[0,0,4.91,.35,.28]],base,{n:8,variation:.015}),'chest');
 bind(h.loft('Chibi trouser pelvis',[[0,0,2.27,.68,.37],[0,0,2.93,.68,.36]],'#30303a',{n:8,variation:.015}),'hips');
 for(const[s,side]of[[-1,'L'],[1,'R']]){
  h.part='skin';
  const arm=bind(h.tube(`Chibi arm ${side}`,[[s*.89,0,4.72],[s*1.17,-.005,4.23],[s*1.35,-.015,3.80],[s*1.45,-.09,3.31],[s*1.50,-.16,2.87]],[.33,.32,.265,.25,.21],'skin',{sides:8,variation:.012}),'arm');
  arm.userData.armorSide=side;
  h.part='outfit';
  const leg=bind(h.tube(`Chibi trouser leg ${side}`,[[s*.46,.04,2.67],[s*.52,.02,2.03],[s*.60,-.06,1.35],[s*.65,0,.42]],[.39,.35,.29,.25],'#30303a',{sides:8,variation:.015}),'leg');
  leg.userData.armorSide=side;leg.userData.materialRole='cloth';
  if(slots.feet==='none'){
   h.part='skin';bind(h.loft(`Chibi bare foot sole ${side}`,[[s*.65,-.18,.02,.28,.48],[s*.65,-.20,.16,.30,.50],[s*.65,0,.49,.25,.28]],'skin',{n:8,variation:0}),'foot'+side);
  }
  h.part='hands';
  const mat=slots.hands==='none'?'skin':colors.leather||'#40332e',x=s*1.5,y=-.16,z=2.92;
  for(const mesh of [
   h.loft(`Block hand ${s}`,[[x,y,z+.045,.20,.18],[x,y-.04,z-.12,.24,.22],[x,y-.085,z-.40,.23,.215],[x,y-.06,z-.48,.18,.19]],mat,{n:8,phase:Math.PI/8,variation:.015}),
   h.cube(`Block hand curl ${s}`,[x+s*.015,y+.06,z-.33],[.34,.20,.25],mat,{bevel:.035}),
   h.cube(`Block thumb ${s}`,[x-s*.19,y+.025,z-.21],[.18,.23,.28],mat,{bevel:.04})
  ]){bind(mesh,'hand'+side);mesh.userData.slot='hands';mesh.userData.materialRole=slots.hands==='none'?'skin':'leather';}
 }
}
