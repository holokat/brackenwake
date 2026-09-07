/** Shoulder caps enclose the rounded deltoid and share its upper-arm binding. */
export function buildSleeve(h,s,torso,{robe=false,profile=h.profile}={}){
 const p=profile,b=p.bulk,capBulk=Math.min(b,.055),side=s<0?'L':'R',long=['cloth','chain'].includes(p.tier)||robe;
 return h.with('arm',p.role,()=>{
  // The previous flat top at 6.18 cut through the shoulder crown. These upper
  // rings close over it and overlap the torso instead of relying on arm pose.
  const rings=[
   [s*.96,0,6.59,.25+capBulk*.5,.21+capBulk*.5],
   [s*.98,0,6.45,.43+capBulk,.36+capBulk],
   [s*1.02,0,6.20,.50+capBulk,.405+capBulk],
   [s*1.10,0,5.98,.40+b,.40+b],
   [s*1.31,-.008,5.55,.34+b,.33+b],
  ];
  if(long)rings.push([s*1.45,-.015,5.05,.30,.295],[s*1.54,-.14,4.43,robe?.36:.285,robe?.33:.27],[s*1.60,-.21,4.12,robe?.38:.25,robe?.35:.235]);
  const sleeve=h.attached(h.shell(`${p.tier} ${long?'long':'upper'} sleeve ${s}`,rings,robe?'violet_dark':p.material,{n:p.sides,closedStart:true}),torso);
  const end=rings.at(-1),previous=rings.at(-2),t=.12,start=end.map((value,i)=>value+(previous[i]-value)*t);
  h.with('arm',p.edgeRole,()=>h.attached(h.shell(`Sleeve cuff binding ${s}`,[[start[0],start[1],start[2],start[3]+.016,start[4]+.016],[end[0],end[1],end[2],end[3]+.016,end[4]+.016]],p.edge,{thickness:.050}),sleeve),side);
  if(p.tier==='plate')h.with(`upperArm${side}`,'metal',()=>{
   const shoulder=h.attached(h.ico(`Plate pauldron ${s}`,[s*1.12,0,6.10],[.65,.61,.44],p.material,{sub:1}),sleeve);
   h.mountedStrip(`Pauldron bound front edge ${s}`,[[s*1.04,6.17],[s*1.15,6.24]],.25,shoulder,p.edge);
  });
  return sleeve;
 },side);
}

export function buildApronUndershirt(h){
 const profile={tier:'workshirt',role:'cloth',edgeRole:'cloth',material:'cloth_dark',edge:'cloth_dark',bulk:.015,sides:12};
 const torso=h.with('torso','cloth',()=>h.shell('Apron cloth undershirt',[
  [0,.025,4.10,.82,.49],[0,0,4.68,.74,.42],[0,0,5.28,.88,.49],
  [0,0,5.93,1.05,.51],[0,0,6.18,1.06,.46],[0,.01,6.42,.57,.32],
 ],profile.material));
 for(const side of[-1,1])buildSleeve(h,side,torso,{profile});
 return torso;
}
