// Authored centre lines in world metres. A bend is a design decision, not noise.
// Spurs open a view or offer a second approach; the broad road is the safe return.
export const ROUTES = [
  { id:'village-east', name:'The east lane', from:'hearthhome', to:'hedge3', width:5, points:[[456,-139],[460,-149],[463,-163],[463,-178],[463,-191],[500,-220],[564,-194],[624,-167],[686,-152],[770,-144]] },
  { id:'village-west', name:'The mill lane', from:'hearthhome', to:'longmeadow', width:5, points:[[456,-139],[460,-149],[463,-163],[463,-178],[463,-191],[440,-216],[385,-225],[300,-193],[227,-193],[165,-211],[65,-258],[-60,-316],[-174,-370],[-279,-423],[-367,-473],[-393,-470]] },
  { id:'meadow-mill', name:'The haymakers lane', from:'longmeadow', to:'millrun', width:4, points:[[-393,-470],[-456,-474],[-551,-477],[-630,-461],[-719,-438],[-810,-412],[-895,-385],[-960,-366],[-996,-358],[-1010,-349]] },
  { id:'mill-wood', name:'The hollow way', from:'millrun', to:'beechhangar', width:3.5, points:[[-1010,-349],[-1044,-367],[-1070,-326],[-1077,-252],[-1100,-176],[-1090,-82],[-1109,22],[-1100,117],[-1080,210],[-1062,279],[-1046,304],[-1028,333],[-1010,355]] },
  { id:'wood-ridge', name:'The beech ridge', from:'beechhangar', to:'millrun', width:3, points:[[-1010,355],[-980,395],[-940,367],[-909,305],[-923,228],[-966,160],[-983,88],[-990,12],[-985,-61],[-1028,-152],[-1040,-238],[-1044,-306],[-1046,-343],[-1034,-351],[-1010,-349]] },
  { id:'mill-quarry', name:'The quarry approach', from:'millrun', to:'chalkpits', width:4, points:[[-1010,-349],[-1030,-385],[-1000,-454],[-971,-539],[-947,-628],[-907,-694],[-864,-737],[-830,-770],[-775,-795],[-710,-820],[-653,-855],[-628,-901],[-618,-899],[-591,-903],[-581,-910]] },
  { id:'quarry-rim', name:'The chalk switchback', from:'chalkpits', to:'chalklookout', width:3, points:[[-581,-910],[-548,-914],[-523,-946],[-516,-990],[-535,-1020],[-584,-1045],[-647,-1056],[-690,-1087],[-644,-1117],[-586,-1104],[-539,-1075],[-503,-1056],[-475,-1082],[-496,-1124],[-547,-1159]] },
  { id:'quarry-chapel', name:'The ridge road', from:'chalkpits', to:'chapellanding', width:4, points:[[-581,-910],[-548,-914],[-482,-958],[-402,-941],[-331,-923],[-273,-871],[-210,-826],[-120,-805],[-52,-805]] },
  { id:'chapel-causeway', name:'The chapel causeway', from:'sunkenchapel', to:'chapellanding', width:3, points:[[-55,-952],[-43,-929],[-38,-899],[-42,-860],[-52,-825],[-52,-805]] },
  { id:'chapel-stones', name:'The pilgrims descent', from:'chapellanding', to:'hedge6', width:3, points:[[-52,-805],[-24,-788],[32,-759],[95,-715],[142,-671]] },
  { id:'chapel-hollow', name:'The mere path', from:'chapellanding', to:'highwaymanshollow', width:3, points:[[-52,-805],[15,-808],[90,-835],[158,-894],[235,-956],[311,-984],[372,-997],[418,-1028],[455,-1048],[482,-1038],[495,-1025]] },
  { id:'hollow-back', name:'The concealed approach', from:'highwaymanshollow', to:'hedge5', width:2.5, points:[[495,-1025],[477,-1034],[452,-1018],[451,-970],[470,-922],[483,-872],[463,-820],[470,-754],[462,-677],[462,-672],[466,-671]] },
  { id:'hollow-road', name:'The lookout track', from:'highwaymanshollow', to:'kingsroad', width:3, points:[[495,-1025],[525,-1038],[555,-1031],[583,-1002],[622,-980],[681,-961],[742,-952],[808,-944],[890,-1007],[948,-1050]] },
  { id:'kingsroad', name:'The Kingsroad', from:'kingsroad', to:'hearthhome', width:6, word:'cobble', points:[[1320,-1272],[1189,-1187],[1090,-1133],[1015,-1095],[968,-1074],[890,-1007],[808,-944],[748,-862],[697,-774],[649,-672],[614,-577],[582,-488],[553,-401],[498,-288],[463,-230],[463,-191]] },
  { id:'river-west', name:'The water meadow bank', from:'millrun', to:'watermeadows', width:3, points:[[-1010,-349],[-996,-358],[-960,-366],[-947,-337],[-933,-302],[-925,-250],[-883,-202],[-831,-139],[-767,-91],[-697,-40],[-625,-8],[-553,12]] },
  { id:'river-cellars', name:'The old towpath', from:'watermeadows', to:'oldcellars', width:3, points:[[-553,12],[-495,21],[-430,34],[-355,14],[-278,-7],[-195,-34],[-110,-53],[-38,-64],[22,-72],[59,-99]] },
  { id:'cellar-lane', name:'The cellar cutting', from:'oldcellars', to:'longmeadow', width:3, points:[[59,-99],[61,-130],[50,-164],[29,-218],[-60,-316],[-174,-370],[-279,-423],[-367,-473],[-393,-470]] },
  { id:'village-river', name:'The bridge lane', from:'hearthhome', to:'oldcellars', width:4, points:[[456,-139],[458,-122],[457,-113],[450,-105],[450,-99],[450,-85],[450,-59],[396,-31],[313,-35],[231,-33],[146,-23],[61,-12],[35,-22],[33,-52],[59,-99]] },
  { id:'wood-coldwake', name:'The southern bridleway', from:'beechhangar', to:'coldwake', width:4, points:[[-1010,355],[-997,430],[-963,508],[-914,585],[-853,653],[-786,713],[-705,750],[-617,776],[-547,784],[-505,777],[-480,771]] },
  { id:'coldwake-river', name:'The drovers return', from:'coldwake', to:'watermeadows', width:4, points:[[-480,771],[-495,742],[-515,704],[-521,626],[-523,553],[-529,470],[-554,383],[-572,301],[-585,217],[-580,146],[-563,91],[-553,57],[-553,12]] },
  { id:'coldwake-hedge', name:'The south fields', from:'coldwake', to:'hedge1', width:3.5, points:[[-480,771],[-433,767],[-390,734],[-328,690],[-238,625],[-142,557],[-44,488],[51,421],[142,352],[226,285],[304,247]] },
];

export const HEDGE_POINTS = [[304,247],[608,136],[770,-144],[714,-463],[466,-671],[142,-671],[-105,-463],[-162,-144],[0,136]];
for (let i=0; i<9; i++) {
  const a=HEDGE_POINTS[i], b=HEDGE_POINTS[(i+1)%9];
  // Each side bows away from the ring's centre. The nine stones stay visible.
  const mx=(a[0]+b[0])/2, mz=(a[1]+b[1])/2;
  const dx=mx-304, dz=mz+226, len=Math.hypot(dx,dz);
  ROUTES.push({id:`hedge-${i+1}`,name:'The Standing Hedge lane',from:`hedge${i+1}`,to:`hedge${(i+1)%9+1}`,width:3,points:[a,[Math.round(mx+dx/len*24),Math.round(mz+dz/len*24)],b]});
}
// Paths meet the worn ground beside each sarsen. The solid stone occupies its centre.
for(const route of ROUTES)route.points=route.points.map(p=>{
 const stone=HEDGE_POINTS.find(s=>s[0]===p[0]&&s[1]===p[1]);if(!stone)return p;
 const dx=304-p[0],dz=-226-p[1],d=Math.hypot(dx,dz);
 return [Math.round((p[0]+dx/d*2.3)*100)/100,Math.round((p[1]+dz/d*2.3)*100)/100];
});
export function nearestOnSegment(x,z,a,b) {
  const dx=b[0]-a[0], dz=b[1]-a[1], l2=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(l2||1)));
  return {x:a[0]+dx*t,z:a[1]+dz*t,t,d:Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)};
}
export function routeDistance(x,z,routes=ROUTES) {
  let best=Infinity;
  for(const r of routes) for(let i=1;i<r.points.length;i++) best=Math.min(best,nearestOnSegment(x,z,r.points[i-1],r.points[i]).d-r.width/2);
  return best;
}
export function sampleRoute(route, step=2) {
  const out=[];
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step);
    for(let k=0;k<n;k++)out.push({x:a[0]+(b[0]-a[0])*k/n,z:a[1]+(b[1]-a[1])*k/n});
  }
  const p=route.points.at(-1);out.push({x:p[0],z:p[1]});return out;
}
