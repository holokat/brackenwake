/** Original fantasy cast. Native, editable geometry, Z up, front toward -Y. */
const range=(start,stop,step=1)=>{if(stop===undefined){stop=start;start=0;}return Array.from({length:Math.max(0,Math.ceil((stop-start)/step))},(_,i)=>start+i*step);};
const zip=(a,b)=>a.slice(0,b.length).map((v,i)=>[v,b[i]]);
const enumerate=a=>a.map((v,i)=>[i,v]);
const reversed=a=>a.slice().reverse();
const sum=a=>a.reduce((s,v)=>s+v,0);
const _add=(a,b)=>a.map((v,i)=>v+b[i]);
const _sub=(a,b)=>a.map((v,i)=>v-b[i]);
const _mul=(a,x)=>a.map(v=>v*x);
const _unit=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
const _cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const _tube=(h,name,points,radii,mat,sides=8,variation=.04)=>h.tube(name,points,radii,mat,{sides,variation});

function _organicLoft(h,name,rings,mat,n=12,variation=.17,fold=.035,jitter=.06) {
  const verts=rings.flatMap(([x,y,z,rx,ry],r)=>range(n).map(k=>{
    const end=r===0||r===rings.length-1,a=k*Math.PI*2/n+(end?0:.035*Math.sin(r*2));
    const radial=1+(end?0:fold*Math.sin(k*2.43+r));
    return [x+rx*Math.sin(a)*radial,y-ry*Math.cos(a)*radial,z+(end?0:jitter*Math.sin(k*1.8+r))];
  }));
  const faces=[];
  for(let r=0;r<rings.length-1;r++)for(let k=0;k<n;k++){
    const a=r*n+k,b=r*n+(k+1)%n,c=(r+1)*n+(k+1)%n,d=(r+1)*n+k;
    faces.push(...((r+k)%2?[[a,b,d],[b,c,d]]:[[a,b,c],[a,c,d]]));
  }
  faces.push(range(n).reverse(),range(n).map(k=>(rings.length-1)*n+k));
  return h.mesh(name,verts,faces,mat,{variation});
}

function _tri_grid(h, name, rows, material, thickness = 0.035, variation = 0.07) {
  let a, b, back, c, edge, f, faces, front, i, n, nc, nr, p, pairs, r, row, verts, x, y, z;
  // Closed cloth sheet, retaining a deliberate irregular triangular grid.
  [nr, nc] = [rows.length, rows[0].length];
  front = rows.flatMap((row) => row.map((p) => p));
  back = front.map(([x, y, z]) => [(x * 0.985), ((y < 0) ? (y + thickness) : (y - thickness)), z]);
  [verts, faces] = [front.concat(back), []];
  n = front.length;
  for (const r of range((nr - 1))) {
    for (const c of range((nc - 1))) {
      [a, b] = [((r * nc) + c), (((r + 1) * nc) + c)];
      pairs = (((r + c) % 2) ? [[a, b, (b + 1)], [a, (b + 1), (a + 1)]] : [[a, b, (a + 1)], [(a + 1), b, (b + 1)]]);
      faces.push(...pairs);
      faces.push(...pairs.map((f) => reversed(f).map((i) => (i + n))));
    }
  }
  edge = range(nc).concat(range(1, nr).map((r) => (((r * nc) + nc) - 1)));
  edge.push(...range((n - 2), ((n - nc) - 1), -(1)).concat(range((nr - 2), 0, -(1)).map((r) => (r * nc))));
  for (const [a, b] of zip(edge, edge.slice(1, undefined).concat(edge.slice(undefined, 1)))) {
    faces.push(...[[a, (a + n), (b + n)], [a, (b + n), b]]);
  }
  return h.mesh(name, verts, faces, material, {variation: variation});
}

function _plate(h, name, perimeter, material, thickness = 0.06, bulge = 0.025, variation = 0.065) {
  let cen, faces, i, j, k, n, p, verts, x, y, z;
  // A faceted, closed leather or fabric panel with a raised centre.
  n = perimeter.length;
  cen = range(3).map((k) => (sum(perimeter.map((p) => p[k])) / n));
  verts = perimeter.concat([[cen[0], (cen[1] - bulge), cen[2]]]);
  verts.push(...perimeter.map(([x, y, z]) => [x, (y + thickness), z]));
  faces = range(n).map((i) => [i, ((i + 1) % n), n]);
  faces.push(...range(1, (n - 1)).map((i) => [(n + 1), ((n + 1) + ((i + 1) % n)), ((n + 1) + i)]));
  for (const i of range(n)) {
    j = ((i + 1) % n);
    faces.push(...[[i, ((n + 1) + i), ((n + 1) + j)], [i, ((n + 1) + j), j]]);
  }
  return h.mesh(name, verts, faces, material, {variation: variation});
}

function _strap(h, name, points, width, material, depth = 0.036) {
  let d, i, p, rows, side;
  rows = [];
  for (const [i, p] of enumerate(points)) {
    d = _sub(points[Math.min((i + 1), (points.length - 1))], points[Math.max(0, (i - 1))]);
    side = _mul(_unit([-(d[2]), 0, d[0]]), (width / 2));
    rows.push([_add(p, side), _sub(p, side)]);
  }
  return _tri_grid(h, name, rows, material, depth, 0.04);
}

function _frame(h, name, c, w, hh, material = 'gold', angle = 0, radius = 0.025) {
  let ca, corners, sa;
  [ca, sa] = [Math.cos(angle), Math.sin(angle)];
  function p(x, z) {
    return [((c[0] + (x * ca)) + (z * sa)), c[1], ((c[2] - (x * sa)) + (z * ca))];
  }
  corners = [p((-(w) / 2), (-(hh) / 2)), p((w / 2), (-(hh) / 2)), p((w / 2), (hh / 2)), p((-(w) / 2), (hh / 2))];
  _tube(h, (name + ' frame'), corners.concat(corners.slice(undefined, 1)), radius, material, 6);
  _tube(h, (name + ' pin'), [p(0, 0), p(0, (hh * 0.47))], (radius * 0.65), material, 5);
}

function _curve_rings(points, radii, sides = 10) {
  let a, b, d, i, p, radius, ref, rings, t, u, v;
  rings = [];
  for (const [i, p] of enumerate(points)) {
    d = _unit(_sub(points[Math.min((i + 1), (points.length - 1))], points[Math.max(0, (i - 1))]));
    ref = ((Math.abs(d[1]) < 0.9) ? [0, 1, 0] : [1, 0, 0]);
    u = _unit(_cross(d, ref));
    v = _unit(_cross(d, u));
    radius = radii[i];
    [a, b] = (Array.isArray(radius) ? radius : [radius, radius]);
    rings.push(range(sides).map((t) => _add(p, _add(_mul(u, (Math.cos((((t * 2) * Math.PI) / sides)) * a)), _mul(v, (Math.sin((((t * 2) * Math.PI) / sides)) * b))))));
  }
  return rings;
}

function _profileAt(rings,z){
  const sorted=rings.slice().sort((a,b)=>a[2]-b[2]);
  if(z<=sorted[0][2])return sorted[0].slice();
  for(let i=1;i<sorted.length;i++)if(z<=sorted[i][2]){
    const a=sorted[i-1],b=sorted[i],t=(z-a[2])/(b[2]-a[2]);
    return a.map((v,k)=>v+(b[k]-v)*t);
  }
  return sorted.at(-1).slice();
}
function _bandOnProfile(h,name,profile,z,width,clearance,mat){
  const samples=[_profileAt(profile,z+width/2),_profileAt(profile,z-width/2)];
  const rows=_curve_rings(samples.map(s=>s.slice(0,3)),samples.map(s=>[s[3]+clearance,s[4]+clearance]),12);
  _tri_grid(h,name,rows.map(r=>r.concat(r.slice(0,1))),mat,.018,.045);
  return _profileAt(profile,z);
}
function _sleeve(h, name, points, radii, material, cuff_mat = null, sides = 10, cuff_width = 0.1) {
  let d, inner, p, p0, p1, r, rings;
  rings = _curve_rings(points, radii, sides);
  rings=rings.map((row,j)=>row.map((v,k)=>_add(points[j],_mul(_sub(v,points[j]),j>0&&j<rings.length-1?1+.024*Math.sin(k*2.1+j):1))));
  if(/Mage raised left bell sleeve/.test(name))rings=rings.map((row,j)=>row.map(v=>{
    const drape=Math.pow(Math.max(0,(j-2)/(rings.length-3)),1.5);
    const lower=Math.max(0,(points[j][2]-v[2])/(Array.isArray(radii[j])?radii[j][0]:radii[j]));
    return [v[0]-.035*drape*lower,v[1],v[2]-.50*drape*lower];
  }));
  _tri_grid(h, name, rings.map((r) => r.concat(r.slice(undefined, 1))), material, 0.045, .17);
  if (cuff_mat) {
    [p0, p1] = points.slice(-(2), undefined);
    d = _unit(_sub(p0, p1));
    if(/Ranger short green sleeve/.test(name)){
      const t=Math.min(.9,cuff_width/Math.hypot(..._sub(p0,p1)));
      const cuffEnd=rings.at(-1).map(v=>_add(p1,_mul(_sub(v,p1),1.045)));
      const center=_add(_mul(p1,1-t),_mul(p0,t));
      inner=rings.at(-1).map((v,i)=>{const p=_add(_mul(v,1-t),_mul(rings.at(-2)[i],t));return _add(center,_mul(_sub(p,center),1.045));});
      _tri_grid(h,name+' cuff binding',[cuffEnd.concat(cuffEnd.slice(0,1)),inner.concat(inner.slice(0,1))],cuff_mat,.015,.035);
    }else{
      inner = rings.at(-(1)).map((p) => _add(p, _mul(d, cuff_width)));
      _tri_grid(h, (name + ' cuff binding'), [rings.at(-(1)).concat(rings.at(-(1)).slice(undefined, 1)), inner.concat(inner.slice(undefined, 1))], cuff_mat, 0.02, 0.035);
    }
  }
  return rings;
}

function _pouch(h, name, c, size = [0.48, 0.27, 0.66]) {
  let d, dx, flap, hh, outline, w, x, y, z;
  [x, y, z] = c;
  [w, d, hh] = size;
  outline = [[(x - (w * 0.47)), y, (z + (hh * 0.47))], [(x + (w * 0.43)), y, (z + (hh * 0.47))], [(x + (w * 0.5)), (y - 0.025), (z - (hh * 0.35))], [(x + (w * 0.32)), (y - 0.035), (z - (hh * 0.5))], [(x - (w * 0.42)), (y - 0.035), (z - (hh * 0.5))], [(x - (w * 0.5)), y, (z - (hh * 0.32))]];
  _plate(h, (name + ' bag'), outline, 'leather', d, 0.055);
  flap = [[(x - (w * 0.48)), (y - 0.052), (z + (hh * 0.46))], [(x + (w * 0.46)), (y - 0.052), (z + (hh * 0.46))], [(x + (w * 0.4)), (y - 0.08), (z + (hh * 0.12))], [(x + (w * 0.07)), (y - 0.095), (z - (hh * 0.08))], [(x - (w * 0.41)), (y - 0.075), (z + (hh * 0.08))]];
  _plate(h, (name + ' folded flap'), flap, 'leather_light', 0.042, 0.012);
  _strap(h, (name + ' clasp strap'), [[(x + 0.015), (y - 0.12), (z + (hh * 0.29))], [(x + 0.025), (y - 0.14), (z - (hh * 0.16))]], 0.105, 'leather_dark');
  h.ico((name + ' brass stud'), [(x + 0.025), (y - 0.167), (z + (hh * 0.04))], [0.055, 0.026, 0.057], 'gold', {sub: 1});
  for (const dx of [(-(w) * 0.27), (w * 0.27)]) {
    _strap(h, (name + ' belt attachment'), [[(x + dx), (y + 0.015), (z + (hh * 0.71))], [(x + dx), (y - 0.025), (z + (hh * 0.35))]], 0.09, 'leather_dark');
  }
}

function _belt(h, name, z, rx, ry, buckle_x = 0) {
  let ring, t, x, zz;
  h.loft((name + ' leather belt'), [[0, 0, (z - 0.15), rx, ry], [0, 0, (z + 0.15), rx, ry]], 'leather', {n: 16, variation: 0.045});
  for (const zz of [(z - 0.135), (z + 0.135)]) {
    ring = range(16).map((t) => [(Math.sin(((t * Math.PI) / 8)) * rx), (-(Math.cos(((t * Math.PI) / 8))) * (ry + 0.012)), zz]);
    _tube(h, (name + ' edge stitching'), ring.concat(ring.slice(undefined, 1)), 0.011, 'leather_light', 5, 0.02);
  }
  _plate(h, (name + ' buckle bed'), [[(buckle_x - 0.2), (-(ry) - 0.047), (z - 0.2)], [(buckle_x + 0.2), (-(ry) - 0.047), (z - 0.2)], [(buckle_x + 0.2), (-(ry) - 0.047), (z + 0.2)], [(buckle_x - 0.2), (-(ry) - 0.047), (z + 0.2)]], 'leather_dark', 0.035);
  _frame(h, (name + ' rectangular buckle'), [buckle_x, (-(ry) - 0.097), z], 0.32, 0.35, 'gold', 0, 0.033);
  for (const x of [-(0.5), -(0.35), 0.35, 0.51]) {
    _strap(h, (name + ' keeper'), [[x, ((-(ry) * Math.sqrt(Math.max(0, (1 - ((x / rx) ** 2))))) - 0.035), (z - 0.19)], [x, ((-(ry) * Math.sqrt(Math.max(0, (1 - ((x / rx) ** 2))))) - 0.035), (z + 0.19)]], 0.073, 'leather_dark');
  }
}

const C={navy:'#172837',teal:'#20515a',tealDark:'#153740',bronze:'#b48b56',bronzeDark:'#71583b',iron:'#43515a',ink:'#111c24',olive:'#344939',oliveLight:'#51634a',leather:'#593d28',leatherEdge:'#927352',indigo:'#343651',indigoDark:'#21253b',ivory:'#cac7b4',ivoryShade:'#aaa995'};
const glowCache=new Map();
function _glow(h,color,intensity=1.8){
  const key=color+intensity;
  if(!glowCache.has(key)){const m=h.mat('crystal').clone();m.name='Arcane '+key;m.color.set(color);m.emissive.set(color);m.emissiveIntensity=intensity;m.roughness=.28;m.metalness=.12;glowCache.set(key,m);}
  return glowCache.get(key);
}
function _circle(h,name,c,u,v,rx,ry,radius,mat,n=16){
  const points=range(n+1).map(i=>_add(c,_add(_mul(u,Math.cos(i*Math.PI*2/n)*rx),_mul(v,Math.sin(i*Math.PI*2/n)*ry))));
  return _tube(h,name,points,radius,mat,6,.055);
}
function _bevelPanel(h,name,outline,mat,edge=C.bronzeDark,depth=.075,inset=.11){
  const n=outline.length,center=range(3).map(k=>sum(outline.map(p=>p[k]))/n);
  const inner=outline.map(p=>[p[0]+(center[0]-p[0])*inset,p[1]-.035,p[2]+(center[2]-p[2])*inset]);
  _plate(h,name+' core',inner,mat,depth,.035,.12);
  const verts=outline.concat(inner),faces=[];
  for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,n+j],[i,n+j,n+i]);}
  h.mesh(name+' chamfer',verts,faces,edge,{variation:.085});
  const back=outline.map(([x,y,z])=>[x,y+depth,z]);
  const side=outline.concat(back),sideFaces=[];
  for(let i=0;i<n;i++){const j=(i+1)%n;sideFaces.push([i,n+i,n+j],[i,n+j,j]);}
  h.mesh(name+' thickness',side,sideFaces,edge,{variation:.075});
}
function _coatSector(h,name,levels,mat,{gap=15,fold=.055,hem=C.bronzeDark,asymmetry=.09}={}){
  const angles=range(19).map(i=>(gap+(360-2*gap)*i/18)*Math.PI/180);
  const rows=levels.map(([z,rx,ry,cy=0],r)=>angles.map((a,j)=>{
    const t=r/(levels.length-1),f=1+fold*Math.sin(j*2.25+r*.63)*t;
    return [Math.sin(a)*rx*f,cy-Math.cos(a)*ry*f,z+(r===0?0:asymmetry*Math.sin(a*2+.5)*t+.025*Math.sin(j*2+r))];
  }));
  _tri_grid(h,name,rows,mat,.06,.14);
  if(hem){const bottom=rows.at(-1);_tri_grid(h,name+' woven hem',[bottom,bottom.map(([x,y,z])=>[x,y*1.008,z+.075])],hem,.015,.055);}
  for(const edge of [0,18])_tube(h,name+' bound front edge',rows.map(r=>r[edge]),.021,hem||mat,5,.04);
  return rows;
}
function _hoodNeckWrap(h,prefix,mat){
  // A complete cloth volume continues from the chest to the underside of the mask.
  const wrap=_organicLoft(h,prefix+' hood fitted neck wrap',[
    [0,.015,6.34,.47,.345],[0,.02,6.56,.435,.35],
    [0,.025,6.82,.355,.335],[0,.03,7.035,.305,.305]
  ],mat,14,.085,.024,.02);
  wrap.userData.coversBody=['neck'];
  _strap(h,prefix+' hood diagonal neck fold',[
    [-.37,-.25,6.88],[-.21,-.352,6.75],[.10,-.366,6.61],[.35,-.30,6.56]
  ],.155,mat,.028);
  _tube(h,prefix+' hood neck folded edge',[
    [-.36,-.274,6.80],[-.19,-.371,6.68],[.10,-.384,6.54],[.34,-.318,6.49]
  ],.014,prefix==='Mage'?C.tealDark:C.oliveLight,5,.035);
}
function _sculptedHood(h,prefix,mat,trim,{mage=false}={}){
  _hoodNeckWrap(h,prefix,mage?C.tealDark:C.olive);
  const angles=[39,61,85,110,139,165,190,218,245,271,296,321].map(v=>v*Math.PI/180);
  const levels=[[6.59,.73,.50],[7.02,.69,.51],[7.57,.665,.54],[7.99,.60,.55],[8.29,.43,.43],[8.39,.105,.13]];
  const rows=levels.map(([z,rx,ry],r)=>angles.map((a,j)=>[Math.sin(a)*rx,.065-Math.cos(a)*ry,z+(r===4?.035*Math.sin(a):0)]));
  _tri_grid(h,prefix+' sculpted hood shell',rows,mat,.075,.11);
  const inner=rows.slice(0,5).map(row=>row.map(([x,y,z])=>[x*.89,y*.83+.025,z-.025]));
  _tri_grid(h,prefix+' dark hood lining',inner,C.ink,.035,.035);
  for(const edge of [0,angles.length-1])_tube(h,prefix+' hood rolled opening',rows.slice(0,5).map(r=>r[edge]),.032,trim,6,.055);
  _bevelPanel(h,prefix+' peaked hood brow',[[-.51,-.42,7.96],[0,-.64,8.25],[.51,-.42,7.96],[.39,-.56,7.89],[0,-.68,8.08],[-.39,-.56,7.89]],mat,trim,.045,.07);
  if(mage){
    _bevelPanel(h,'Mage sculpted bronze face mask',[[-.28,-.435,7.93],[.28,-.435,7.93],[.415,-.49,7.64],[.315,-.51,7.16],[0,-.585,6.985],[-.315,-.51,7.16],[-.415,-.49,7.64]],C.ink,C.bronzeDark,.08,.085);
    _bevelPanel(h,'Mage central mask ridge',[[-.063,-.545,7.82],[.063,-.545,7.82],[.106,-.67,7.42],[0,-.705,7.27],[-.106,-.67,7.42]],C.bronze,C.bronzeDark,.035,.16);
    for(const side of [-1,1]){
      _bevelPanel(h,'Mage swept mask brow',[[side*.065,-.56,7.78],[side*.35,-.555,7.81],[side*.39,-.562,7.68],[side*.10,-.59,7.65]],C.bronze,C.bronzeDark,.025,.08);
      const eye=h.ico('Mage glowing teal eye',[side*.221,-.592,7.62],[.114,.026,.041],_glow(h,'#60f0db',2.2),{sub:1});eye.userData.slot='headwear';
      _tube(h,'Mage cheek mask engraving',[[side*.36,-.555,7.48],[side*.26,-.583,7.28],[side*.13,-.617,7.13]],.014,C.bronzeDark,5,.035);
    }
  }
}
function _shoulderCowl(h,prefix,mat,trim){
  const angles=[26,49,75,102,131,158,185,212,239,266,292,316,337].map(v=>v*Math.PI/180);
  const rows=[[6.71,.55,.38],[6.48,1.10,.61],[6.13,1.56,.74]].map(([z,rx,ry],r)=>angles.map((a,j)=>[Math.sin(a)*rx,-Math.cos(a)*ry,z-.13*(-Math.cos(a))*r/2+.022*(j%2)]));
  _tri_grid(h,prefix+' sculpted shoulder cowl',rows,mat,.075,.14);
  for(const side of [-1,1]){
    _bevelPanel(h,prefix+' layered shoulder wing',[[side*.35,-.46,6.70],[side*.89,-.55,6.61],[side*1.48,-.44,6.27],[side*1.57,-.39,6.10],[side*.87,-.705,6.16],[side*.47,-.64,6.41]],mat,trim,.065,.055);
    _tube(h,prefix+' shoulder wing piping',[[side*.47,-.661,6.40],[side*.87,-.729,6.15],[side*1.55,-.415,6.09]],.021,trim,5,.04);
  }
}
function _ringBelt(h,prefix,z,rx=.79,ry=.49){
  h.loft(prefix+' thick leather belt',[[0,0,z-.14,rx,ry],[0,0,z+.14,rx,ry]],C.leather,{n:16,variation:.075});
  h.loft(prefix+' belt inner edge',[[0,0,z-.16,rx*.999,ry*1.015],[0,0,z-.105,rx,ry*1.017]],C.leatherEdge,{n:16,variation:.04});
  _circle(h,prefix+' central bronze belt ring',[0,-ry-.045,z],[1,0,0],[0,0,1],.175,.19,.037,C.bronze,12);
  _tube(h,prefix+' belt ring pin',[[0,-ry-.054,z-.04],[0,-ry-.054,z+.17]],.018,C.bronze,5);
  for(const side of [-1,1])for(const x of [.38,.62]){
    const yy=-ry*Math.sqrt(1-(x/rx)**2)-.029;
    _circle(h,prefix+' belt harness ring',[side*x,yy,z],[1,0,0],[0,0,1],.053,.072,.018,C.bronzeDark,10);
  }
}
function _adventureBoots(h,prefix,{mage=false,wizard=false}={}){
  for(const side of [-1,1]){
    const x=side*.87,name=prefix+(side<0?' left boot':' right boot'),tall=!mage;
    h.loft(name+' layered sole',[[x,-.23,.055,.335,.555],[x,-.23,.14,.345,.57]],C.ink,{n:10,variation:.035});
    _organicLoft(h,name+' shaped foot',[[x,-.25,.13,.335,.56],[x,-.26,.25,.338,.57],[x,-.18,.38,.303,.47],[x,-.035,.57,.25,.29],[x,0,.74,.235,.26]],C.leather,10,.12,.025,.018);
    const shaft=tall?[[x,0,.50,.24,.26],[x-side*.04,0,1.0,.25,.27],[x-side*.12,.01,1.61,.325,.32],[x-side*.16,.01,2.14,.365,.34]]:[[x,0,.50,.24,.26],[x-side*.035,0,.87,.255,.28],[x-side*.08,.01,1.24,.30,.295]];
    _organicLoft(h,name+' fitted shaft',shaft,wizard?C.indigoDark:C.leather,10,.13,.045,.045);
    _bevelPanel(h,name+' toe cap',[[x-.275,-.62,.21],[x+.275,-.62,.21],[x+.245,-.48,.38],[x,-.38,.46],[x-.245,-.48,.38]],mage?C.iron:C.leather,C.leatherEdge,.025,.09);
    _strap(h,name+' instep strap',[[x-.26,-.20,.48],[x,-.34,.56],[x+.235,-.20,.65]],.115,C.ink,.025);
    if(tall){
      h.loft(name+' folded upper cuff',[[x-side*.16,0,1.90,.405,.39],[x-side*.16,0,2.17,.435,.415],[x-side*.16,0,2.25,.415,.39]],C.leather,{n:12,variation:.10});
      _bevelPanel(h,name+' pointed knee guard',[[x-side*.18-.28,-.32,2.28],[x-side*.18,-.41,2.53],[x-side*.18+.28,-.32,2.28],[x-side*.18+.24,-.43,2.05],[x-side*.18,-.48,1.88],[x-side*.18-.24,-.43,2.05]],wizard?C.indigoDark:C.iron,C.bronzeDark,.055,.13);
      for(const zz of [1.02,1.56]){
        const fit=_bandOnProfile(h,name+' leather calf straps',shaft,zz,.13,.065,C.ink);
        _frame(h,name+' calf strap buckle',[fit[0]-.14,fit[1]-fit[4]-.077,zz],.105,.12,C.bronzeDark,0,.015);
      }
    }
  }
}
function _staff(h,prefix,{wizard=false}={}){
  const x=-2.82,y=-.37;
  const dark=wizard?C.indigoDark:'#382d24';
  _tube(h,prefix+' segmented staff shaft',[[x+.03,y,.12],[x-.03,y,.80],[x+.015,y,2.2],[x-.018,y,3.7],[x,y,4.93],[x+.02,y,6.40],[x,y,6.92]],[.069,.089,.075,.075,.088,.10,.135],dark,8,.11);
  for(const z of [.25,.83,2.24,4.43,5.28,6.38,6.88])h.loft(prefix+' staff bronze ferrule',[[x,y,z-.048,.115,.115],[x,y,z+.048,.115,.115]],C.bronzeDark,{n:8,variation:.075});
  for(let j=0;j<9;j++)_circle(h,prefix+' staff wrapped leather grip',[x,y,4.62+j*.068],[1,0,0],[0,1,0],.102,.102,.017,C.leather,10);
  if(wizard){
    const orb=h.ico('Wizard arcane amber orb',[x,y,7.54],[.31,.31,.34],_glow(h,'#dfb968',1.15),{sub:2,variation:.10});orb.userData.slot='weapon';
    _circle(h,'Wizard staff armillary ring',[x,y,7.54],[1,0,0],[0,.72,.70],.49,.49,.024,C.bronze,18);
    _circle(h,'Wizard staff crossing armillary ring',[x,y,7.54],[.75,0,.66],[0,1,0],.445,.445,.022,C.bronzeDark,18);
  }else{
    const verts=[[x,y,8.18]],n=6;
    for(let j=0;j<n;j++){const a=j*Math.PI*2/n;verts.push([x+.29*Math.sin(a),y-.235*Math.cos(a),7.57]);}
    verts.push([x,y,7.025]);
    const faces=range(n).map(j=>[0,j+1,(j+1)%n+1]).concat(range(n).map(j=>[n+1,(j+1)%n+1,j+1]));
    h.mesh('Mage faceted heart crystal',verts,faces,_glow(h,'#31c5b8',.90),{variation:.18});
  }
  for(let k=0;k<3;k++){
    const a=k*Math.PI*2/3+.4;
    const points=[[6.77,.10],[7.09,.30],[7.48,.425],[7.83,.31],[7.99,.18]].map(([z,r])=>[x+Math.sin(a)*r,y+Math.cos(a)*r,z]);
    _tube(h,prefix+' sculpted staff crown prong',points,[.093,.074,.047,.028,.009],C.bronze,6,.11);
  }
  h.loft(prefix+' staff crown socket',[[x,y,6.70,.12,.12],[x,y,6.93,.195,.195],[x,y,7.035,.13,.13]],C.bronzeDark,{n:8,variation:.12});
}
function _tagClass(h,prefix){
  for(const mesh of h.root.children){
    if(!mesh.name.startsWith(prefix))continue;
    const name=mesh.name.toLowerCase();
    if(/beard|moustache|eyebrow/.test(name)){mesh.userData.slot='facialhair';mesh.userData.appearance='facialhair';}
    else if(/staff|crystal|orb|bow/.test(name))mesh.userData.slot='weapon';
    else if(/hood|mask|eye|hat/.test(name))mesh.userData.slot='headwear';
    else if(/quiver|arrow|feather/.test(name))mesh.userData.slot='quiver';
    else if(/cape|cowl|shoulder wing/.test(name))mesh.userData.slot='cape';
    else if(/boot|calf|knee/.test(name))mesh.userData.slot='boots';
    else if(/bracer|forearm|fastening buckle|fastening strap/.test(name))mesh.userData.slot='gloves';
    else if(/belt|satchel|pouch|grimoire/.test(name))mesh.userData.slot='belt';
    else mesh.userData.slot='armor';
    const key=mesh.userData.materialKey||'',mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    mesh.userData.colorChannel=/Arcane|crystal/.test(key)?'crystal':/wood/.test(key)?'wood':mat.metalness>.5?'metal':/leather/.test(key)||[C.leather,C.leatherEdge,C.ink].includes(key)?'leather':'cloth';
    mesh.userData.originalDesign=true;
  }
}

export function buildMage(h){
  _finishMaterials(h);
  _organicLoft(h,'Mage tailored navy coat body',[[0,0,4.78,.70,.41],[0,0,5.20,.75,.445],[0,0,5.73,.91,.50],[0,0,6.18,1.02,.46],[0,0,6.52,.56,.36]],C.navy,12,.13,.023,.05);
  _coatSector(h,'Mage layered teal outer robe',[[4.87,.72,.415],[4.04,.85,.47],[3.12,1.04,.535],[2.03,1.28,.60],[.93,1.49,.68]],C.tealDark,{gap:16,hem:C.bronzeDark,fold:.063,asymmetry:.13});
  _coatSector(h,'Mage shadow under robe',[[4.79,.64,.36],[2.88,.79,.43],[1.01,.85,.49]],C.navy,{gap:5,hem:null,fold:.074,asymmetry:.055});
  for(const side of [-1,1]){
    const rows=[[6.38,.32,.51],[5.78,.27,.565],[4.94,.19,.49],[3.25,.34,.60],[1.22,.48,.725]].map(([z,x,y],j)=>[[side*(x+.07),-y,z],[side*(x+.30),-y+.07,z+(j===4?.10:0)]]);
    _tri_grid(h,'Mage long structured coat facing',rows,C.navy,.045,.13);
    _tube(h,'Mage bronze facing seam',rows.map(r=>r[0]),.024,C.bronzeDark,5,.055);
  }
  _sleeve(h,'Mage right folded bell sleeve',[[.77,0,6.45],[1.06,0,6.20],[1.32,-.01,5.57],[1.45,-.06,5.06],[1.57,-.13,4.55],[1.64,-.21,4.08]],[[.32,.37],[.45,.46],[.365,.39],[.30,.32],[.35,.37],[.45,.43]],C.teal,C.bronzeDark,12,.095);
  _sleeve(h,'Mage raised left bell sleeve',[[-.77,0,6.45],[-1.06,0,6.20],[-1.38,0,5.50],[-1.67,-.03,5.01],[-2.10,-.17,4.96],[-2.54,-.29,4.93]],[[.32,.37],[.45,.46],[.365,.39],[.32,.34],[.43,.39],[.59,.43]],C.teal,C.bronzeDark,12,.10);
  _shoulderCowl(h,'Mage',C.navy,C.bronzeDark);
  _sculptedHood(h,'Mage',C.navy,C.teal,{mage:true});
  for(const z of [6.17,5.68]){
    _circle(h,'Mage bronze coat clasp',[0,-.579,z],[1,0,0],[0,0,1],.095,.13,.024,C.bronze,12);
    h.ico('Mage clasp teal inlay',[0,-.609,z],[.045,.022,.06],'crystal',{sub:1});
  }
  _ringBelt(h,'Mage',4.87);
  _pouch(h,'Mage right ritual satchel',[.73,-.48,4.38],[.47,.27,.69]);
  _pouch(h,'Mage left small belt pouch',[-.68,-.445,4.50],[.27,.23,.43]);
  for(const side of [-1,1])_organicLoft(h,'Mage dark trouser leg',[[side*.80,0,.57,.24,.24],[side*.74,0,1.58,.30,.28]],C.ink,8,.10,.025,.03);
  _adventureBoots(h,'Mage',{mage:true});
  _staff(h,'Mage');
  _tagClass(h,'Mage');
}

function _rangerCape(h){
  const angles=[24,50,78,108,138,168,198,228,257,285,313,337].map(a=>a*Math.PI/180);
  const rows=[0,.5,1].map(t=>angles.map((a,j)=>{
    const left=Math.max(0,-Math.sin(a)),back=Math.max(0,-Math.cos(a));
    return [Math.sin(a)*(.55+1.03*t),-Math.cos(a)*(.39+.33*t),6.67-t*(.50+.78*left+.38*back)+.045*Math.sin(j*2)];
  }));
  _tri_grid(h,'Ranger asymmetric green shoulder cape',rows,C.olive,.075,.13);
  _tri_grid(h,'Ranger cape folded lower edge',[rows.at(-1),rows.at(-1).map(([x,y,z])=>[x,y*1.012,z+.07])],C.oliveLight,.025,.055);
  _bevelPanel(h,'Ranger right short cape fold',[[.20,-.46,6.62],[.84,-.50,6.64],[1.48,-.41,6.21],[1.56,-.37,6.08],[.83,-.68,6.13]],C.olive,C.oliveLight,.045,.07);
  _bevelPanel(h,'Ranger left overlapping cape fold',[[-.20,-.46,6.62],[-.80,-.52,6.64],[-1.48,-.39,6.16],[-1.40,-.41,5.68],[-.83,-.68,6.10]],C.olive,C.oliveLight,.05,.075);
}
function _rangerVest(h){
  _organicLoft(h,'Ranger fitted leather vest',[[0,0,4.77,.71,.42],[0,0,5.18,.75,.46],[0,0,5.67,.92,.50],[0,0,6.16,.97,.465],[0,0,6.49,.53,.35]],C.leather,12,.13,.025,.045);
  for(const side of [-1,1]){
    _bevelPanel(h,'Ranger sculpted breast panel',[[side*.065,-.49,6.20],[side*.42,-.46,6.35],[side*.83,-.36,6.15],[side*.84,-.43,5.71],[side*.50,-.55,5.39],[side*.07,-.57,5.54]],C.leather,C.leatherEdge,.065,.065);
    _tube(h,'Ranger breast panel stitched edge',[[side*.075,-.61,5.55],[side*.49,-.59,5.43],[side*.82,-.47,5.71]],.012,C.leatherEdge,5,.04);
    _bevelPanel(h,'Ranger lower leather side panel',[[side*.10,-.51,5.37],[side*.64,-.42,5.35],[side*.72,-.37,5.02],[side*.36,-.48,4.80],[side*.07,-.55,4.92]],C.leather,C.leatherEdge,.04,.055);
    _bevelPanel(h,'Ranger divided leather hip skirt',[[side*.13,-.465,4.80],[side*.71,-.37,4.77],[side*.90,-.385,3.91],[side*.49,-.53,3.70],[side*.27,-.54,4.01]],C.olive,C.leatherEdge,.06,.065);
  }
  const strap=[[-.63,-.37,6.42],[-.43,-.55,6.16],[-.09,-.655,5.81],[.34,-.617,5.41],[.71,-.457,5.05]];
  _strap(h,'Ranger leather diagonal baldric',strap,.22,C.ink,.055);
  for(const d of [-.075,.075])_tube(h,'Ranger baldric fine edge',strap.map(([x,y,z])=>[x+d*.69,y-.021,z+d*.72]),.009,C.leatherEdge,5,.025);
  _frame(h,'Ranger solid bronze baldric buckle',[-.19,-.694,5.91],.255,.31,C.bronze,-.73,.024);
}
function _rangerMask(h){
  _bevelPanel(h,'Ranger leather lower face mask',[[-.345,-.49,7.49],[.345,-.49,7.49],[.37,-.50,7.24],[.25,-.54,7.035],[0,-.60,6.99],[-.25,-.54,7.035],[-.37,-.50,7.24]],C.ink,C.leather,.06,.065);
  _bevelPanel(h,'Ranger shaped leather nose bridge',[[-.075,-.565,7.49],[.075,-.565,7.49],[.105,-.685,7.29],[0,-.715,7.22],[-.105,-.685,7.29]],C.leather,C.ink,.026,.09);
  for(const side of [-1,1]){
    _tube(h,'Ranger leather mask stitched edge',[[side*.335,-.536,7.47],[side*.343,-.547,7.25],[side*.235,-.585,7.075]],.011,C.leatherEdge,5,.045);
    for(const z of [7.17,7.29])_tube(h,'Ranger mask ventilation seam',[[side*.16,-.611,z],[side*.28,-.574,z+.045]],.009,C.ink,5,.015);
  }
}
function _rangerBracers(h){
  for(const side of [-1,1]){
    const name=side<0?'Ranger left bracer':'Ranger right bracer';
    _sleeve(h,name+' shaped leather shell',[[side*1.44,-.015,4.99],[side*1.52,-.105,4.57],[side*1.60,-.19,4.055]],[[.293,.305],[.28,.283],[.218,.23]],C.leather,null,10);
    _bevelPanel(h,name+' tapered forearm panel',[[side*1.28,-.285,4.94],[side*1.46,-.346,5.06],[side*1.72,-.29,4.91],[side*1.77,-.38,4.16],[side*1.58,-.452,4.045],[side*1.40,-.39,4.17]],C.leather,C.leatherEdge,.06,.07);
    const profile=[[side*1.44,-.015,4.99,.293,.305],[side*1.52,-.105,4.57,.28,.283],[side*1.60,-.19,4.055,.218,.23]];
    for(const z of [4.84,4.22]){
      const fit=_bandOnProfile(h,name+' broad leather fastening',profile,z,.108,.045,C.ink);
      _frame(h,name+' fastening buckle',[fit[0]-side*.12,fit[1]-fit[4]-.061,z],.115,.13,C.bronzeDark,0,.016);
    }
  }
}
function _quiver(h){
  const path=[[-.39,.53,4.56],[-.70,.60,5.48],[-1.00,.67,6.29]];
  const rows=_curve_rings(path,[.185,.235,.255],10);
  _tri_grid(h,'Ranger leather back quiver',rows.map(row=>row.concat(row.slice(0,1))),C.leather,.06,.12);
  h.mesh('Ranger quiver dark opening',rows.at(-1),range(1,9).map(i=>[0,i+1,i]),C.ink,{variation:.015});
  for(const i of [0,2])_tube(h,'Ranger quiver bronze rim',rows[i].concat(rows[i].slice(0,1)),i===2?.042:.029,C.bronzeDark,6,.07);
  _strap(h,'Ranger quiver rear leather harness',[[-.69,.46,6.34],[-.26,.55,5.67],[.33,.50,5.11],[.69,.39,4.88]],.20,C.ink,.045);
  for(let j=0;j<6;j++){
    const start=[-.68+(j%3)*.07,.58+Math.floor(j/3)*.105,5.43],top=[-1.15+(j-2.5)*.094,.64+(j%2)*.105,6.90+(j%3)*.081];
    const d=_unit(_sub(top,start));_tube(h,'Ranger quiver arrow shaft',[start,top],.017,'wood_light',5,.035);
    for(const side of [-1,1]){
      const feather=[top,_add(_add(top,_mul(d,-.07)),[side*.075,-.01,side*.024]),_add(_add(top,_mul(d,-.35)),[side*.075,-.01,side*.024]),_add(top,_mul(d,-.47))];
      _plate(h,'Ranger quiver long arrow feather',feather,j%2?C.ivoryShade:C.ivory,.014,.005,.075);
    }
  }
}
function _bow(h){
  const points=[[-.76,-.39,2.34],[-.39,-.39,2.60],[.27,-.39,2.73],[.98,-.39,3.03],[1.42,-.39,3.43],[1.71,-.39,3.71],[2.12,-.39,4.02],[2.44,-.39,4.51],[2.53,-.39,5.12],[2.71,-.39,5.47],[2.88,-.39,5.52]];
  const radii=[[.020,.024],[.069,.054],[.097,.065],[.089,.063],[.066,.055],[.096,.080],[.070,.057],[.087,.060],[.075,.055],[.046,.037],[.014,.019]];
  _tube(h,'Ranger sculpted recurve bow',points,radii,'wood',8,.11);
  _tube(h,'Ranger bow polished wood inlay',points.slice(1,-1).map(([x,y,z])=>[x-.028,y-.062,z+.021]),.022,'wood_light',5,.055);
  _tube(h,'Ranger taut bow string',[points[0],points.at(-1)],.010,'bowstring',5,.012);
  for(const [start,end] of [[0,2],[8,10]])_tube(h,'Ranger bow reinforced limb tip',points.slice(start,end+1),radii.slice(start,end+1).map(([x,y])=>[x*1.055,y*1.07]),C.bronzeDark,6,.055);
  const d=_unit(_sub(points[6],points[4]));
  for(let j=0;j<9;j++){
    const c=_add(points[5],_mul(d,(j-4)*.051)),ring=_curve_rings([_sub(c,_mul(d,.002)),_add(c,_mul(d,.002))],[.102,.102],8)[0];
    _tube(h,'Ranger bow leather grip binding',ring.concat(ring.slice(0,1)),.017,C.leather,5,.05);
  }
}
export function buildRanger(h){
  _finishMaterials(h);
  _organicLoft(h,'Ranger closed trouser pelvis',[[0,0,3.56,.31,.31],[0,.015,3.80,.59,.40],[0,.015,4.09,.76,.445],[0,0,4.49,.755,.425],[0,0,4.84,.705,.411]],'#30372c',14,.12,.04,.035);
  for(const side of [-1,1])_organicLoft(h,'Ranger fitted olive trousers',[[side*.87,0,.53,.185,.195],[side*.83,0,1.0,.19,.20],[side*.745,0,1.70,.24,.25],[side*.71,-.01,2.10,.275,.28],[side*.68,-.025,2.35,.31,.33],[side*.57,.01,3.03,.405,.41],[side*.47,0,3.96,.42,.43]],'#30372c',10,.16,.065,.075);
  _organicLoft(h,'Ranger forest under tunic',[[0,0,4.26,.80,.425],[0,0,4.83,.70,.405],[0,0,5.66,.90,.485],[0,0,6.42,.62,.37]],C.olive,12,.12,.025,.035);
  for(const side of [-1,1])_sleeve(h,'Ranger short green sleeve',[[side*.78,0,6.44],[side*1.03,0,6.18],[side*1.19,-.01,5.73],[side*1.32,-.025,5.46]],[[.33,.37],[.455,.46],[.365,.385],[.355,.37]],C.olive,C.leather,10,.075);
  _rangerVest(h);_rangerCape(h);_sculptedHood(h,'Ranger',C.olive,C.oliveLight);_rangerMask(h);
  _ringBelt(h,'Ranger',4.84);
  _pouch(h,'Ranger large belt pouch',[.73,-.435,4.41],[.44,.25,.59]);
  _pouch(h,'Ranger small left belt pouch',[-.67,-.46,4.49],[.29,.22,.46]);
  _rangerBracers(h);_adventureBoots(h,'Ranger');_quiver(h);_bow(h);_tagClass(h,'Ranger');
}

function _wizardBeard(h){
  _organicLoft(h,'Wizard sculpted ivory beard',[[0,-.215,7.21,.42,.31],[0,-.39,6.96,.54,.32],[0,-.48,6.58,.41,.245],[.025,-.45,6.17,.075,.10]],C.ivory,10,.075,.065,.045);
  for(const side of [-1,1]){
    for(let j=0;j<3;j++){
      const x=side*(.13+j*.14),end=side*(.035+j*.052),z=6.19+j*.16;
      _tube(h,'Wizard flowing sculpted beard lock',[[x,-.49+j*.035,7.10],[x*1.06,-.675+j*.035,6.83],[end,-.625+j*.015,z+.15],[end+.02*side,-.48,z]],[[.12,.085],[.13,.095],[.073,.053],[.013,.019]],j===1?C.ivoryShade:C.ivory,6,.08);
    }
    _tube(h,'Wizard swept ivory moustache',[[side*.02,-.573,7.34],[side*.21,-.654,7.27],[side*.41,-.55,7.12]],[.058,.112,.014],C.ivory,7,.055);
    _tube(h,'Wizard thick ivory eyebrow',[[side*.07,-.455,7.71],[side*.23,-.48,7.75],[side*.36,-.405,7.70]],[.035,.051,.020],C.ivory,6,.035);
  }
}
function _wizardHat(h){
  const original=h;h=Object.create(original);
  h.mesh=(name,verts,faces,mat,options)=>original.mesh(name,verts.map(([x,y,z])=>[x,y,z-.22]),faces,mat,options);
  const rows=[[8.00,.83,.64],[8.075,.87,.66],[8.17,.49,.385]].map(([z,rx,ry],r)=>range(13).map(j=>{const a=j*Math.PI*2/12;return [Math.sin(a)*rx,-Math.cos(a)*ry,z+.045*Math.sin(a*2)];}));
  _tri_grid(h,'Wizard sculpted wide hat brim',rows,C.indigoDark,.055,.12);
  _organicLoft(h,'Wizard tall bent hat crown',[[0,0,8.10,.49,.39],[0,.025,8.44,.415,.34],[-.035,.04,8.81,.30,.26],[-.24,.06,9.17,.18,.17],[-.53,.08,9.43,.084,.095],[-.79,.095,9.39,.012,.016]],C.indigo,12,.14,.06,.05);
  h.loft('Wizard ivory woven hat band',[[0,0,8.14,.483,.389],[0,.012,8.31,.452,.371]],C.ivoryShade,{n:12,variation:.05});
  _frame(h,'Wizard hat bronze buckle',[0,-.409,8.232],.18,.17,C.bronze,0,.020);
}
function _wizardCollar(h){
  const angles=[34,62,92,125,155,186,217,248,278,307,331].map(a=>a*Math.PI/180);
  const rows=[[6.39,.54,.34],[6.82,.78,.50],[7.025,.72,.47]].map(([z,rx,ry],r)=>angles.map(a=>[Math.sin(a)*rx,.025-Math.cos(a)*ry,z-.09*Math.cos(a)]));
  _tri_grid(h,'Wizard high sculpted coat collar',rows,C.indigoDark,.065,.10);
  for(const edge of [0,angles.length-1])_tube(h,'Wizard high collar ivory edge',rows.map(r=>r[edge]),.024,C.ivoryShade,6,.05);
}
export function buildWizard(h,{hat=true,beard=true}={}){
  _finishMaterials(h);
  _organicLoft(h,'Wizard tailored indigo coat torso',[[0,0,4.78,.70,.425],[0,0,5.22,.755,.47],[0,0,5.80,.93,.495],[0,0,6.31,.98,.46],[0,.01,6.58,.56,.37]],C.indigo,12,.12,.025,.04);
  _coatSector(h,'Wizard long split indigo coat',[[4.87,.74,.43],[4.01,.89,.47],[2.65,1.14,.55],[1.05,1.30,.63]],C.indigo,{gap:34,hem:C.bronzeDark,fold:.055,asymmetry:.12});
  _coatSector(h,'Wizard ivory under robe',[[4.83,.63,.37],[3.19,.73,.405],[1.11,.83,.49]],C.ivoryShade,{gap:9,hem:C.indigoDark,fold:.057,asymmetry:.065});
  for(const side of [-1,1]){
    const rows=[[6.38,.40,.53],[5.78,.24,.565],[4.88,.18,.515],[3.18,.31,.577],[1.17,.48,.65]].map(([z,x,y],j)=>[[side*x,-y,z],[side*(x+.19),-y+.035,z+(j===4?.10:0)]]);
    _tri_grid(h,'Wizard ivory coat lapel',rows,C.ivory,.04,.075);
    _tube(h,'Wizard bronze lapel seam',rows.map(r=>r[0]),.021,C.bronzeDark,5,.055);
  }
  _sleeve(h,'Wizard right layered coat sleeve',[[.78,0,6.45],[1.06,0,6.22],[1.32,-.01,5.57],[1.45,-.06,5.07],[1.58,-.14,4.48],[1.65,-.21,4.09]],[[.32,.37],[.435,.445],[.35,.375],[.30,.32],[.335,.355],[.405,.395]],C.indigo,C.ivoryShade,12,.14);
  _sleeve(h,'Wizard left layered coat sleeve',[[-.78,0,6.45],[-1.03,0,6.13],[-1.28,0,5.56],[-1.56,0,4.90],[-2.08,-.18,4.922],[-2.54,-.29,4.93]],[[.35,.40],[.46,.47],[.41,.41],[.38,.38],[.41,.40],[.465,.395]],C.indigo,C.ivoryShade,12,.14);
  _wizardCollar(h);if(beard)_wizardBeard(h);if(hat)_wizardHat(h);
  _ringBelt(h,'Wizard',4.87);
  _pouch(h,'Wizard leather satchel',[-.71,-.46,4.40],[.39,.27,.57]);
  _bevelPanel(h,'Wizard strapped grimoire cover',[[.49,-.555,4.72],[.90,-.525,4.67],[.95,-.555,4.08],[.54,-.58,4.12]],C.indigoDark,C.bronzeDark,.19,.075);
  _strap(h,'Wizard grimoire closing strap',[[.69,-.61,4.74],[.74,-.631,4.10]],.095,C.leather,.025);
  h.ico('Wizard grimoire brass clasp',[.72,-.655,4.40],[.050,.023,.059],C.bronze,{sub:1});
  for(const side of [-1,1])_organicLoft(h,'Wizard charcoal trousers',[[side*.83,0,.55,.23,.24],[side*.73,0,1.93,.29,.31]],C.indigoDark,10,.11,.035,.04);
  _adventureBoots(h,'Wizard',{wizard:true});_staff(h,'Wizard',{wizard:true});_tagClass(h,'Wizard');
}
function _finishMaterials(h){
  for(const [color,metalness,roughness] of [[C.bronze,.77,.36],[C.bronzeDark,.65,.46],[C.iron,.76,.40],[C.leather,0,.65],[C.leatherEdge,0,.73],[C.ink,0,.72]]){
    const mat=h.mat(color);mat.metalness=metalness;mat.roughness=roughness;
  }
}
