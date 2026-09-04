
class Component extends DCLogic {
  ENGINE_BODY = `
  const V=THREE.Vector3, Q=THREE.Quaternion, M4=THREE.Matrix4, YUP=new THREE.Vector3(0,1,0), GOLD=2.39996;
  const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
  renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(55,1,0.1,900);
  const hemi=new THREE.HemisphereLight(0xbfd7ff,0x4a5a3a,0.55); scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff1dc,2.6); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.03; scene.add(sun); scene.add(sun.target);
  const fog=new THREE.FogExp2(0xbfd0d8,0.012); scene.fog=fog;
  const pmrem=new THREE.PMREMGenerator(renderer);
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  let rng=mulberry32(1);
  function hexLerp(a,b,t){ return new THREE.Color(a).lerp(new THREE.Color(b),t); }
  function vnoise(x,z){ const xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi; function h(a,b){ let n=Math.sin(a*127.1+b*311.7)*43758.5453; return n-Math.floor(n); } const u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf); return (h(xi,zi)*(1-u)+h(xi+1,zi)*u)*(1-v)+(h(xi,zi+1)*(1-u)+h(xi+1,zi+1)*u)*v; }
  function fbm(x,z){ let a=0.5,f=1,s=0; for(let i=0;i<4;i++){ s+=a*vnoise(x*f,z*f); f*=2.03; a*=0.5; } return s; }
  function hash2(x,z){ let h=(x*374761393+z*668265263+(S.seed|0)*982451653)|0; h=Math.imul(h^(h>>>13),1274126177); return (h^(h>>>16))>>>0; }
  const SPECIES={
    oak:{ h:[13,20], trunk:0.055, levels:4, lat:4, apical:0.52, latRatio:0.62, spread:52, tropism:0.28, gravity:0.35, habit:'round', leaf:'oval', leafPer:4, leafSize:0.5, bark:'#4a3a28', leafA:'#2c5a22', leafB:'#6b9a3a', barkStyle:'rough' },
    beech:{ h:[16,24], trunk:0.045, levels:4, lat:3, apical:0.6, latRatio:0.55, spread:40, tropism:0.35, gravity:0.3, habit:'round', leaf:'oval', leafPer:4, leafSize:0.42, bark:'#7d7565', leafA:'#3d7a2a', leafB:'#8fbf4a', barkStyle:'smooth' },
    birch:{ h:[10,16], trunk:0.03, levels:4, lat:3, apical:0.62, latRatio:0.5, spread:34, tropism:0.15, gravity:0.75, habit:'round', leaf:'oval', leafPer:3, leafSize:0.3, bark:'#e2ddd0', leafA:'#6fa233', leafB:'#a8d15a', barkStyle:'birch' },
    spruce:{ h:[18,30], trunk:0.035, levels:3, lat:6, apical:0.72, latRatio:0.38, spread:84, tropism:0.2, gravity:0.4, habit:'conical', leaf:'needle', leafPer:6, leafSize:0.55, bark:'#5a3f2c', leafA:'#213f22', leafB:'#3f6d3a', barkStyle:'plates' },
    pine:{ h:[16,26], trunk:0.04, levels:4, lat:3, apical:0.5, latRatio:0.5, spread:60, tropism:0.5, gravity:0.2, habit:'umbrella', leaf:'needle', leafPer:6, leafSize:0.6, bark:'#7a4a30', leafA:'#2f5d2a', leafB:'#5b8a44', barkStyle:'plates' },
    kapok:{ h:[24,34], trunk:0.065, levels:4, lat:3, apical:0.66, latRatio:0.55, spread:70, tropism:0.3, gravity:0.25, habit:'umbrella', leaf:'tropical', leafPer:4, leafSize:0.75, bark:'#8a8270', leafA:'#2f6b25', leafB:'#6fae3c', barkStyle:'smooth' },
    fig:{ h:[12,18], trunk:0.075, levels:4, lat:4, apical:0.5, latRatio:0.7, spread:62, tropism:0.2, gravity:0.45, habit:'round', leaf:'tropical', leafPer:5, leafSize:0.6, bark:'#6a6052', leafA:'#245a1e', leafB:'#5f9b35', barkStyle:'rough' }
  };
  const BIOMES={
    'Temperate broadleaf':{ mix:[['oak',0.45],['beech',0.35],['birch',0.2]], ground:['#3e4a25','#5a5a34','#2f4a22'], grass:['#3f6e24','#7ea63c'], relief:3.0, fog:0.009, sky:['#8fb7dd','#dbe6ee'], under:1.0 },
    'Boreal conifer':{ mix:[['spruce',0.6],['pine',0.25],['birch',0.15]], ground:['#3a3524','#4d4a30','#31401f'], grass:['#556f2e','#8aa34a'], relief:5.0, fog:0.012, sky:['#9fb6c9','#e3e9ee'], under:0.6 },
    'Tropical wet':{ mix:[['kapok',0.4],['fig',0.6]], ground:['#2f3d1c','#4a4a28','#26461d'], grass:['#357a25','#7dc043'], relief:2.2, fog:0.014, sky:['#a7c5dc','#e8eef0'], under:1.6 },
    'Birch grove':{ mix:[['birch',0.85],['spruce',0.15]], ground:['#4a5a2a','#6b6a3c','#3d5f2a'], grass:['#4f8a2c','#a4cf55'], relief:2.0, fog:0.007, sky:['#9cc3e6','#e6eef3'], under:1.2 },
    'Mediterranean pine':{ mix:[['pine',0.7],['oak',0.3]], ground:['#6a5a3a','#8a7a50','#5a5a30'], grass:['#7d7a36','#b8a85a'], relief:4.0, fog:0.004, sky:['#7fb0e0','#eadfc8'], under:0.5 }
  };
  // ---------- textures ----------
  function tex(c,srgb,rep){ const t=new THREE.CanvasTexture(c); if(srgb&&THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace; if(rep){ t.wrapS=t.wrapT=THREE.RepeatWrapping; } t.anisotropy=4; return t; }
  function normalFromHeight(hc){ const w=hc.width,h=hc.height; const src=hc.getContext('2d').getImageData(0,0,w,h).data; const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); const out=x.createImageData(w,h); const H=(i,j)=>src[(((j+h)%h)*w+((i+w)%w))*4]/255; for(let j=0;j<h;j++) for(let i=0;i<w;i++){ const dx=(H(i+1,j)-H(i-1,j))*3, dz=(H(i,j+1)-H(i,j-1))*3; const l=Math.hypot(dx,dz,1); const o=(j*w+i)*4; out.data[o]=(-dx/l*0.5+0.5)*255; out.data[o+1]=(-dz/l*0.5+0.5)*255; out.data[o+2]=(1/l*0.5+0.5)*255; out.data[o+3]=255; } x.putImageData(out,0,0); return c; }
  function makeBark(style,color){ const W=256,Hh=512; const c=document.createElement('canvas'); c.width=W; c.height=Hh; const x=c.getContext('2d'); const hc=document.createElement('canvas'); hc.width=W; hc.height=Hh; const hx=hc.getContext('2d');
    x.fillStyle=color; x.fillRect(0,0,W,Hh); hx.fillStyle='#808080'; hx.fillRect(0,0,W,Hh);
    const r=mulberry32(7);
    if(style==='rough'||style==='plates'){ const n=style==='plates'?420:900; for(let i=0;i<n;i++){ const px=r()*W, py=r()*Hh, w=style==='plates'?8+r()*22:1+r()*3, h=style==='plates'?10+r()*30:14+r()*90; const d=r()<0.55; x.fillStyle=(d?'rgba(0,0,0,':'rgba(255,240,220,')+(0.05+r()*0.14)+')'; x.fillRect(px,py,w,h); hx.fillStyle=(d?'rgba(0,0,0,':'rgba(255,255,255,')+(0.25+r()*0.4)+')'; hx.fillRect(px,py,w,h); if(px+w>W){ x.fillRect(px-W,py,w,h); hx.fillRect(px-W,py,w,h);} } }
    if(style==='smooth'){ for(let i=0;i<1500;i++){ const px=r()*W, py=r()*Hh; x.fillStyle=(r()<0.5?'rgba(0,0,0,':'rgba(255,255,255,')+(0.02+r()*0.05)+')'; x.fillRect(px,py,2+r()*6,2+r()*6); hx.fillStyle='rgba(0,0,0,'+(0.05+r()*0.1)+')'; hx.fillRect(px,py,3+r()*8,3+r()*8);} for(let i=0;i<60;i++){ const py=r()*Hh; x.fillStyle='rgba(70,80,60,'+(0.08+r()*0.15)+')'; x.fillRect(0,py,W,1+r()*3);} }
    if(style==='birch'){ for(let i=0;i<70;i++){ const py=r()*Hh, w=10+r()*70, h=2+r()*7; x.fillStyle='rgba(20,18,16,'+(0.6+r()*0.4)+')'; x.fillRect(r()*W,py,w,h); hx.fillStyle='rgba(0,0,0,0.5)'; hx.fillRect(r()*W,py,w,h);} for(let i=0;i<400;i++){ x.fillStyle='rgba(120,110,100,'+(0.05+r()*0.1)+')'; x.fillRect(r()*W,r()*Hh,1,4+r()*20);} }
    return { map:tex(c,true,true), normalMap:tex(normalFromHeight(hc),false,true) }; }
  function makeLeafTex(kind){ const c=document.createElement('canvas'); c.width=128; c.height=128; const x=c.getContext('2d'); x.clearRect(0,0,128,128); x.fillStyle='#ffffff';
    if(kind==='oval'){ x.beginPath(); x.moveTo(64,4); x.bezierCurveTo(118,40,106,110,64,126); x.bezierCurveTo(22,110,10,40,64,4); x.fill(); }
    else if(kind==='tropical'){ x.beginPath(); x.moveTo(64,2); x.bezierCurveTo(100,30,104,96,64,127); x.bezierCurveTo(24,96,28,30,64,2); x.fill(); }
    else { x.strokeStyle='#ffffff'; x.lineCap='round'; x.lineWidth=3; x.beginPath(); x.moveTo(64,6); x.lineTo(64,124); x.stroke(); x.lineWidth=2.2; for(let i=0;i<20;i++){ const t=i/20, y=12+t*108, l=22*(1-t*0.5)+6; x.beginPath(); x.moveTo(64,y); x.lineTo(64-l,y+l*0.7); x.moveTo(64,y); x.lineTo(64+l,y+l*0.7); x.stroke(); } }
    if(kind!=='needle'){ x.globalCompositeOperation='source-in'; const g=x.createLinearGradient(0,0,0,128); g.addColorStop(0,'#ffffff'); g.addColorStop(1,'#c4c8b8'); x.fillStyle=g; x.fillRect(0,0,128,128); x.globalCompositeOperation='source-over'; x.strokeStyle='rgba(50,70,35,0.45)'; x.lineWidth=2; x.beginPath(); x.moveTo(64,10); x.lineTo(64,122); x.stroke(); x.lineWidth=1; for(let i=1;i<6;i++){ const yy=20+i*16; x.beginPath(); x.moveTo(64,yy); x.lineTo(64+(i%2?26:-26),yy+14); x.stroke(); } }
    return tex(c,true,false); }
  function makeGrassTex(){ const c=document.createElement('canvas'); c.width=128; c.height=256; const x=c.getContext('2d'); x.clearRect(0,0,128,256); const r=mulberry32(3); x.lineCap='round'; for(let i=0;i<16;i++){ const bx=8+r()*112, top=10+r()*70; const g=x.createLinearGradient(0,256,0,top); g.addColorStop(0,'#9aa68a'); g.addColorStop(1,'#ffffff'); x.strokeStyle=g; x.lineWidth=2.2+r()*2.6; x.beginPath(); x.moveTo(bx,256); x.quadraticCurveTo(bx+(r()-0.5)*40,140,bx+(r()-0.5)*70,top); x.stroke(); } return tex(c,true,false); }
  function makeGroundTex(){ const c=document.createElement('canvas'); c.width=256; c.height=256; const x=c.getContext('2d'); x.fillStyle='#8a8a8a'; x.fillRect(0,0,256,256); const r=mulberry32(11); for(let i=0;i<9000;i++){ const l=r(); x.fillStyle=l<0.5?'rgba(0,0,0,'+(0.04+r()*0.12)+')':'rgba(255,255,255,'+(0.03+r()*0.1)+')'; const s=1+r()*4; x.fillRect(r()*256,r()*256,s,s*(0.5+r())); } for(let i=0;i<180;i++){ x.fillStyle='rgba(110,90,50,'+(0.12+r()*0.25)+')'; x.beginPath(); x.ellipse(r()*256,r()*256,3+r()*5,2+r()*3,r()*3.14,0,6.28); x.fill(); } return tex(c,true,true); }
  function makeSky(top,bot){ const c=document.createElement('canvas'); c.width=512; c.height=256; const x=c.getContext('2d'); const g=x.createLinearGradient(0,0,0,256); g.addColorStop(0,top); g.addColorStop(0.5,bot); g.addColorStop(0.52,'#6d7a5a'); g.addColorStop(1,'#3a4030'); x.fillStyle=g; x.fillRect(0,0,512,256); const t=new THREE.CanvasTexture(c); t.mapping=THREE.EquirectangularReflectionMapping; if(THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace; return t; }
  const leafTex={ oval:makeLeafTex('oval'), tropical:makeLeafTex('tropical'), needle:makeLeafTex('needle') }, grassTex=makeGrassTex(), groundTex=makeGroundTex();
  const windU={ uTime:{value:0}, uWind:{value:S.wind} };
  function windHook(sh,amp,grass){ sh.uniforms.uTime=windU.uTime; sh.uniforms.uWind=windU.uWind; sh.vertexShader='uniform float uTime;uniform float uWind;\\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\\n vec3 wpos=(instanceMatrix*vec4(position,1.0)).xyz;\\n float wp=sin(uTime*1.4+wpos.x*0.35+wpos.z*0.25+position.y*0.4)+0.5*sin(uTime*2.9+wpos.x*1.3+wpos.y*0.8);\\n'+(grass?' float dcam=distance(wpos,cameraPosition); transformed.y*=smoothstep(70.0,48.0,dcam);\\n transformed.x+=wp*uWind*0.32*position.y*position.y;\\n transformed.z+=wp*uWind*0.2*position.y*position.y;':' transformed.x+=wp*uWind*'+amp+'*position.y;\\n transformed.z+=wp*uWind*'+(amp*0.75)+'*position.y;')); if(grass) sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\\n diffuseColor.rgb*=mix(0.38,1.15,vMapUv.y);'); }
  // ---------- tree growth ----------
  let P,Nr,U,I,vbase,LP,LN,LU,LC,I2,axisCount;
  function perp(d){ const a=Math.abs(d.y)<0.98?YUP:new V(1,0,0); return new V().crossVectors(d,a).normalize(); }
  function branchOff(axis,angle,az){ const u=perp(axis); const v=new V().crossVectors(axis,u).normalize(); const side=u.multiplyScalar(Math.cos(az)).add(v.multiplyScalar(Math.sin(az))).normalize(); return axis.clone().multiplyScalar(Math.cos(angle)).add(side.multiplyScalar(Math.sin(angle))).normalize(); }
  function emitRing(center,frameU,frameV,r,vseg,vc){ const start=vbase; for(let i=0;i<=vseg;i++){ const a=i/vseg*Math.PI*2; const nn=frameU.clone().multiplyScalar(Math.cos(a)).add(frameV.clone().multiplyScalar(Math.sin(a))); P.push(center.x+nn.x*r,center.y+nn.y*r,center.z+nn.z*r); Nr.push(nn.x,nn.y,nn.z); U.push(i/vseg*2.0, vc); vbase++; } return start; }
  function connect(a,b,vseg){ for(let i=0;i<vseg;i++){ I.push(a+i,b+i,a+i+1, a+i+1,b+i,b+i+1); } }
  function pushLeaf(p,q,sz,w,col){ const base=LP.length/3; const hw=sz*w*0.5; const corners=[[-hw,0,0],[hw,0,0],[hw,sz,0],[-hw,sz,0]]; const n=new V(0,0,1).applyQuaternion(q); for(const c of corners){ const v=new V(c[0],c[1],c[2]).applyQuaternion(q).add(p); LP.push(v.x,v.y,v.z); LN.push(n.x,n.y,n.z); LC.push(col.r,col.g,col.b); } LU.push(0,0,1,0,1,1,0,1); I2.push(base,base+1,base+2, base,base+2,base+3); }
  function leafSpray(sp,nodes,dirs,scale,leafA,leafB){ const per=Math.round(sp.leafPer*S.foliage); const needle=sp.leaf==='needle'; const start=Math.floor(nodes.length*(needle?0.05:0.3));
    for(let i=start;i<nodes.length;i++){ const p=nodes[i], d=dirs[i]; for(let j=0;j<per;j++){ const pd=perp(d).applyAxisAngle(d,rng()*6.28); let out=d.clone().multiplyScalar(0.3+rng()*0.4).add(pd.multiplyScalar(0.75)); out.y+=needle?0.05:0.3; out.normalize(); const sz=sp.leafSize*scale*(0.75+rng()*0.5); const lp=p.clone().add(out.clone().multiplyScalar(sz*(0.1+rng()*0.4))); const q=new Q().setFromUnitVectors(YUP,out); q.multiply(new Q().setFromAxisAngle(YUP,rng()*6.28)); q.multiply(new Q().setFromAxisAngle(new V(1,0,0),(rng()-0.5)*0.7)); const col=hexLerp(leafA,leafB,rng()).multiplyScalar(0.85+rng()*0.3); pushLeaf(lp,q,needle?sz*1.6:sz,needle?0.55:1.0,col); } } }
  function growAxis(sp,pos,dir,len,rad,order,scale,gnarl,leafA,leafB){
    axisCount++; if(axisCount>1400) return;
    const maxO=sp.levels; const segs=Math.max(3,Math.min(12,Math.round(len/(scale*0.9)))); const step=len/segs; const vseg=order===0?10:(order===1?7:5);
    const last=order>=maxO; const endRad=last?0.012:rad*(order===0?0.7:0.55);
    let p=pos.clone(), d=dir.clone().normalize(); const nodes=[],dirs=[],radii=[]; const curlAxis=perp(d).applyAxisAngle(d,rng()*6.28); const curl=(rng()-0.5)*(order===0?0.05:0.35)*gnarl; const wob=(order===0?0.025:0.12)*gnarl*(order+1);
    for(let s=0;s<=segs;s++){ const t=s/segs; nodes.push(p.clone()); dirs.push(d.clone()); let r=rad+(endRad-rad)*t; if(order===0&&t<0.12) r*=1+(0.12-t)/0.12*0.6; radii.push(Math.max(0.012,r)); p=p.clone().add(d.clone().multiplyScalar(step)); d.applyAxisAngle(curlAxis,curl); d.y-=sp.gravity*step*0.05*order*(sp.habit==='conical'?1.6:1); d.y+=sp.tropism*step*0.12*(order>0?t*2:0.3); d.x+=(rng()-0.5)*wob; d.z+=(rng()-0.5)*wob; d.normalize(); }
    let fu=perp(dirs[0]); const rs=[]; for(let s=0;s<=segs;s++){ const dd=dirs[s]; fu=fu.clone().sub(dd.clone().multiplyScalar(fu.dot(dd))).normalize(); const fv=new V().crossVectors(fu,dd).normalize(); rs.push(emitRing(nodes[s],fu,fv,radii[s],vseg,(nodes[s].y)*0.6)); }
    for(let s=0;s<segs;s++) connect(rs[s],rs[s+1],vseg);
    if(last||rad<0.02){ leafSpray(sp,nodes,dirs,scale,leafA,leafB); return; }
    if(order>=maxO-1){ const c=Math.floor(segs*0.5); leafSpray(sp,nodes.slice(c),dirs.slice(c),scale,leafA,leafB); }
    const ld=dirs[segs].clone(); ld.x+=(rng()-0.5)*0.25*gnarl; ld.z+=(rng()-0.5)*0.25*gnarl; ld.normalize();
    const cont=order===0? (sp.habit==='umbrella'?0.62:sp.apical) : sp.apical;
    growAxis(sp,nodes[segs],ld,len*cont,endRad,order+1,scale,gnarl,leafA,leafB);
    const whorl=sp.habit==='conical'&&order===0; const n=whorl? segs-1 : Math.max(1,Math.round(sp.lat*(order===0?1:0.75)));
    let az=rng()*6.28; const t0=sp.habit==='umbrella'&&order===0?0.72:(order===0?0.35:0.2);
    for(let k=1;k<=n;k++){ const t=whorl? k/segs : t0+(0.96-t0)*(k/(n+1)); const si=Math.max(1,Math.min(segs,Math.round(t*segs))); const per=whorl? 5 : 1; for(let w=0;w<per;w++){ az+=GOLD; const ang=(S.crownSpread*sp.spread/50*(0.8+rng()*0.4))*Math.PI/180; const cd=branchOff(dirs[si],ang,az); let f= sp.habit==='conical'? (1.15-t*0.95) : sp.habit==='umbrella'? (0.7+t*0.5) : (0.6+t*0.5); const cLen=len*sp.latRatio*f*(0.85+rng()*0.3); const cRad=radii[si]*(0.5+0.12*(1-t)); if(cLen>scale*0.3) growAxis(sp,nodes[si],cd,cLen,cRad,order+1,scale,gnarl,leafA,leafB); } }
  }
  function buildPrototype(spName,seed,maturity){ const sp=SPECIES[spName]; rng=mulberry32(seed); P=[];Nr=[];U=[];I=[];vbase=0;LP=[];LN=[];LU=[];LC=[];I2=[];axisCount=0;
    const h=(sp.h[0]+rng()*(sp.h[1]-sp.h[0]))*S.heightScale*(0.5+0.5*maturity); const scale=h/16; const rad=h*sp.trunk*S.trunkRadius*(0.7+0.5*maturity);
    const leafA=hexLerp(sp.leafA,'#a8742c',S.autumn).getStyle(), leafB=hexLerp(sp.leafB,'#d9a33a',S.autumn).getStyle();
    growAxis(sp,new V(0,-0.4*scale,0),new V((rng()-0.5)*0.04,1,(rng()-0.5)*0.04).normalize(),h*(sp.habit==='conical'?0.34:0.4),rad,0,scale,S.gnarl,leafA,leafB);
    const bg=new THREE.BufferGeometry(); bg.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); bg.setAttribute('normal',new THREE.Float32BufferAttribute(Nr,3)); bg.setAttribute('uv',new THREE.Float32BufferAttribute(U,2)); bg.setIndex(I);
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(LP,3)); lg.setAttribute('normal',new THREE.Float32BufferAttribute(LN,3)); lg.setAttribute('uv',new THREE.Float32BufferAttribute(LU,2)); lg.setAttribute('color',new THREE.Float32BufferAttribute(LC,3)); lg.setIndex(I2);
    const bk=makeBark(sp.barkStyle,sp.bark); const barkMat=new THREE.MeshStandardMaterial({ map:bk.map, normalMap:bk.normalMap, normalScale:new THREE.Vector2(0.9,0.9), roughness:0.95 });
    const leafMat=new THREE.MeshStandardMaterial({ map:leafTex[sp.leaf], vertexColors:true, alphaTest:0.45, side:THREE.DoubleSide, roughness:0.75, emissive:new THREE.Color(leafA).multiplyScalar(0.18) });
    leafMat.onBeforeCompile=function(sh){ windHook(sh,0.06,false); };
    const depth=new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking, map:leafTex[sp.leaf], alphaTest:0.45 });
    return { bark:bg, leaf:lg, barkMat:barkMat, leafMat:leafMat, depth:depth, h:h }; }
  // ---------- world (chunked, infinite) ----------
  const TC=96, GC=24; let treeRings=2; const GRASS_RINGS=2;
  let protos=[], biome=BIOMES[S.biome], relief=3, groundMat=null, grassMat=null, grassGeo=null;
  const treeChunks=new Map(), grassChunks=new Map();
  function terrainH(x,z){ const d=Math.hypot(x,z); const flat=Math.min(1,d/14); return (fbm(x*0.011+7,z*0.011+3)-0.5)*relief*2.4*flat + (fbm(x*0.07,z*0.07)-0.5)*0.4 + (fbm(x*0.0025+31,z*0.0025)-0.5)*relief*4.0*flat; }
  function spacingFor(){ return S.density==='Open'?21:(S.density==='Dense'?8:13); }
  function makeTerrain(ox,oz){ const segs=48; const g=new THREE.PlaneGeometry(TC,TC,segs,segs); g.rotateX(-Math.PI/2); g.translate(ox+TC/2,0,oz+TC/2); const pa=g.attributes.position; const cols=[]; const cA=new THREE.Color(biome.ground[0]), cB=new THREE.Color(biome.ground[1]), cC=new THREE.Color(biome.ground[2]); const gc=S.groundCover; const tint= gc==='Leaf litter'?new THREE.Color('#6b5a36'):gc==='Needle duff'?new THREE.Color('#5a4630'):gc==='Ground moss'?new THREE.Color('#3b6a2a'):gc==='Bare earth'?new THREE.Color('#5c5040'):null;
    for(let i=0;i<pa.count;i++){ const x=pa.getX(i), z=pa.getZ(i); pa.setY(i,terrainH(x,z)); const n=fbm(x*0.05,z*0.05), n2=vnoise(x*0.6,z*0.6); let c=cA.clone().lerp(cB,n).lerp(cC,n2*0.5); if(tint) c.lerp(tint,0.5); c.multiplyScalar(0.85+0.3*vnoise(x*2.3,z*2.3)); cols.push(c.r,c.g,c.b); }
    g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3)); g.computeVertexNormals(); const m=new THREE.Mesh(g,groundMat); m.receiveShadow=true; return m; }
  function makeTreeChunk(cx,cz){ const grp=new THREE.Group(); const ox=cx*TC, oz=cz*TC; grp.add(makeTerrain(ox,oz)); const r=mulberry32(hash2(cx,cz));
    const spacing=spacingFor(); const thr=S.density==='Open'?0.44:(S.density==='Dense'?0.24:0.34); const lists=protos.map(()=>[]);
    for(let x=ox+spacing*0.5;x<ox+TC;x+=spacing) for(let z=oz+spacing*0.5;z<oz+TC;z+=spacing){ const px=x+(r()-0.5)*spacing*0.9, pz=z+(r()-0.5)*spacing*0.9; const pick=r(), sc=0.55+Math.pow(r(),1.4)*0.95, sy=0.9+r()*0.25, rot=r()*6.28; if(Math.hypot(px,pz)<9) continue; if(fbm(px*0.017+50,pz*0.017)<thr) continue; lists[Math.floor(pick*protos.length)].push([px,pz,sc,sy,rot]); }
    let n=0; const m=new M4(), q=new Q(), s=new V(), p=new V();
    protos.forEach(function(pr,pi){ const list=lists[pi]; if(!list.length) return; n+=list.length; const bark=new THREE.InstancedMesh(pr.bark,pr.barkMat,list.length); const leaf=new THREE.InstancedMesh(pr.leaf,pr.leafMat,list.length); leaf.customDepthMaterial=pr.depth;
      list.forEach(function(t,i){ p.set(t[0],terrainH(t[0],t[1]),t[1]); q.setFromAxisAngle(YUP,t[4]); s.set(t[2],t[2]*t[3],t[2]); m.compose(p,q,s); bark.setMatrixAt(i,m); leaf.setMatrixAt(i,m); });
      bark.instanceMatrix.needsUpdate=true; leaf.instanceMatrix.needsUpdate=true; bark.castShadow=true; bark.receiveShadow=true; leaf.castShadow=true; leaf.receiveShadow=true; bark.frustumCulled=false; leaf.frustumCulled=false; bark.material.wireframe=wire; leaf.visible=!wire; grp.add(bark); grp.add(leaf); });
    grp.userData.trees=n; scene.add(grp); return grp; }
  function buildGrassAssets(){ const blade=new THREE.PlaneGeometry(0.6,1,1,3); blade.translate(0,0.5,0); const b2=blade.clone().rotateY(Math.PI/2); const b3=blade.clone().rotateY(-Math.PI/2*0.5); const pos=[],uv=[],nrm=[],idx=[]; let base=0; for(const gg of [blade,b2,b3]){ const pa=gg.attributes.position, ua=gg.attributes.uv, ia=gg.index; for(let i=0;i<pa.count;i++){ pos.push(pa.getX(i),pa.getY(i),pa.getZ(i)); uv.push(ua.getX(i),ua.getY(i)); nrm.push(0,1,0); } for(let i=0;i<ia.count;i++) idx.push(ia.getX(i)+base); base+=pa.count; }
    grassGeo=new THREE.BufferGeometry(); grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); grassGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); grassGeo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3)); grassGeo.setIndex(idx);
    grassMat=new THREE.MeshStandardMaterial({ map:grassTex, alphaTest:0.35, side:THREE.DoubleSide, roughness:0.85 }); grassMat.onBeforeCompile=function(sh){ windHook(sh,0,true); }; }
  function makeGrassChunk(gx,gz){ const ox=gx*GC, oz=gz*GC; const count=Math.floor(GC*GC*7*S.grass*biome.under); if(count<1) return null; const r=mulberry32(hash2(gx*3+1,gz*3+7)); const inst=new THREE.InstancedMesh(grassGeo,grassMat,count); const m=new M4(), q=new Q(), s=new V(), p=new V(); const gA=new THREE.Color(biome.grass[0]), gB=new THREE.Color(biome.grass[1]);
    for(let i=0;i<count;i++){ p.set(ox+r()*GC,0,oz+r()*GC); const lush=fbm(p.x*0.06+9,p.z*0.06); p.y=terrainH(p.x,p.z)-0.03; const sc=(0.35+r()*0.7)*(0.5+lush); q.setFromAxisAngle(YUP,r()*6.28); s.set(sc*1.1,sc,sc*1.1); m.compose(p,q,s); inst.setMatrixAt(i,m); inst.setColorAt(i,gA.clone().lerp(gB,r()*0.6+lush*0.4).multiplyScalar(0.85+0.3*r())); }
    inst.instanceMatrix.needsUpdate=true; if(inst.instanceColor) inst.instanceColor.needsUpdate=true; inst.receiveShadow=true; inst.frustumCulled=false; inst.visible=!wire; scene.add(inst); return inst; }
  function disposeObj(o){ if(!o) return; scene.remove(o); o.traverse(function(n){ if(n.isMesh&&n.geometry&&!n.isInstancedMesh) n.geometry.dispose(); }); }
  let treeCount=0, lastCX=null, lastCZ=null, lastGX=null, lastGZ=null;
  function updateChunks(px,pz,force){ const cx=Math.floor(px/TC), cz=Math.floor(pz/TC), gx=Math.floor(px/GC), gz=Math.floor(pz/GC);
    if(force||cx!==lastCX||cz!==lastCZ){ lastCX=cx; lastCZ=cz; const need=new Set(); for(let i=-treeRings;i<=treeRings;i++) for(let j=-treeRings;j<=treeRings;j++) need.add((cx+i)+','+(cz+j)); for(const [k,g] of treeChunks){ if(!need.has(k)){ disposeObj(g); treeChunks.delete(k); } } for(const k of need){ if(!treeChunks.has(k)){ const [a,b]=k.split(',').map(Number); treeChunks.set(k,makeTreeChunk(a,b)); } } treeCount=0; for(const g of treeChunks.values()) treeCount+=g.userData.trees; if(HOST&&HOST.onCount) HOST.onCount(treeCount); }
    if(force||gx!==lastGX||gz!==lastGZ){ lastGX=gx; lastGZ=gz; const need=new Set(); for(let i=-GRASS_RINGS;i<=GRASS_RINGS;i++) for(let j=-GRASS_RINGS;j<=GRASS_RINGS;j++) need.add((gx+i)+','+(gz+j)); for(const [k,g] of grassChunks){ if(!need.has(k)){ disposeObj(g); grassChunks.delete(k); } } for(const k of need){ if(!grassChunks.has(k)){ const [a,b]=k.split(',').map(Number); const g=makeGrassChunk(a,b); if(g) grassChunks.set(k,g); } } } }
  function clearWorld(){ for(const g of treeChunks.values()) disposeObj(g); treeChunks.clear(); for(const g of grassChunks.values()) disposeObj(g); grassChunks.clear(); lastCX=lastCZ=lastGX=lastGZ=null; }
  let wire=false;
  function rebuild(){ biome=BIOMES[S.biome]||BIOMES['Temperate broadleaf']; relief=biome.relief*S.relief; treeRings=S.view==='Near'?1:(S.view==='Far'?3:2);
    clearWorld(); protos.forEach(function(pr){ pr.bark.dispose(); pr.leaf.dispose(); pr.barkMat.map.dispose(); pr.barkMat.normalMap.dispose(); pr.barkMat.dispose(); pr.leafMat.dispose(); });
    const r=mulberry32(S.seed|0); protos=[]; for(let i=0;i<8;i++){ const spn=pickSpecies(biome.mix,r); protos.push(buildPrototype(spn,(S.seed|0)*7+i*131,Math.min(1,S.maturity*(0.55+r()*0.7)))); }
    if(!groundMat){ groundMat=new THREE.MeshStandardMaterial({ vertexColors:true, map:groundTex, roughness:1.0 }); groundTex.repeat.set(TC/3,TC/3); }
    if(!grassGeo) buildGrassAssets();
    const tp=mode==='look'?eye:target; updateChunks(tp.x,tp.z,true); applyEnv(); }
  function pickSpecies(mix,r){ let t=r(); for(const m of mix){ t-=m[1]; if(t<=0) return m[0]; } return mix[mix.length-1][0]; }
  function applyWire(){ scene.traverse(function(n){ if(n.isInstancedMesh){ if(n.geometry===grassGeo||n.geometry.attributes.color) n.visible=!wire; else n.material.wireframe=wire; } }); }
  let lastSky='';
  function applyEnv(){ const t=S.timeOfDay; const el=Math.max(4,Math.sin((t-6)/12*Math.PI)*70)*Math.PI/180; const warm=1-Math.min(1,Math.max(0,(el*180/Math.PI-8)/30)); sun.color.copy(new THREE.Color('#fff4e6').lerp(new THREE.Color('#ff9a4a'),warm)); sun.intensity=2.0+1.2*Math.sin(el);
    const sz=70; sun.shadow.camera.left=-sz; sun.shadow.camera.right=sz; sun.shadow.camera.top=sz; sun.shadow.camera.bottom=-sz; sun.shadow.camera.near=1; sun.shadow.camera.far=400; sun.shadow.camera.updateProjectionMatrix();
    const skyTop=hexLerp(biome.sky[0],'#3b3552',warm*0.7), skyBot=hexLerp(biome.sky[1],'#ffb070',warm*0.7); const key=skyTop.getHexString()+skyBot.getHexString();
    if(key!==lastSky){ lastSky=key; const eq=makeSky('#'+skyTop.getHexString(),'#'+skyBot.getHexString()); const rt=pmrem.fromEquirectangular(eq); if(scene.environment) scene.environment.dispose(); scene.environment=rt.texture; if(scene.background&&scene.background.dispose) scene.background.dispose(); scene.background=eq; }
    hemi.color.copy(skyTop); hemi.groundColor.set(biome.ground[1]); hemi.intensity=0.45+0.3*Math.sin(el);
    fog.color.copy(skyBot.clone().lerp(new THREE.Color(biome.ground[1]),0.25)); fog.density=biome.fog*S.fog; windU.uWind.value=S.wind; }
  // ---------- camera ----------
  let mode='orbit', theta=0.7, phi=1.2, radius=45, target=new V(0,6,0);
  let yaw=0.6, pitch=-0.05; const eye=new V(0,0,-2); const keys={};
  function updateOrbit(){ const sp=Math.sin(phi); camera.position.set(target.x+radius*sp*Math.sin(theta), target.y+radius*Math.cos(phi), target.z+radius*sp*Math.cos(theta)); camera.lookAt(target); }
  function moveVec(dt,base,speed,faceYaw){ const sp=(keys['ShiftLeft']?2.4:1)*speed*dt; const f=new V(Math.sin(faceYaw),0,Math.cos(faceYaw)), rgt=new V(f.z,0,-f.x); if(keys['KeyW']||keys['ArrowUp']) base.addScaledVector(f,sp); if(keys['KeyS']||keys['ArrowDown']) base.addScaledVector(f,-sp); if(keys['KeyA']||keys['ArrowLeft']) base.addScaledVector(rgt,sp); if(keys['KeyD']||keys['ArrowRight']) base.addScaledVector(rgt,-sp); }
  function updateLook(dt){ moveVec(dt,eye,4,yaw); const gy=terrainH(eye.x,eye.z)+1.7; eye.y+=(gy-eye.y)*Math.min(1,dt*8); camera.position.copy(eye); camera.lookAt(eye.x+Math.sin(yaw)*Math.cos(pitch), eye.y+Math.sin(pitch), eye.z+Math.cos(yaw)*Math.cos(pitch)); }
  let dragging=false; canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown',function(e){ try{ canvas.setPointerCapture(e.pointerId); }catch(err){} dragging=true; canvas.style.cursor='grabbing'; });
  canvas.addEventListener('pointermove',function(e){ if(!dragging) return; if(mode==='orbit'){ theta-=e.movementX*0.005; phi=Math.max(0.15,Math.min(1.52,phi-e.movementY*0.005)); } else { yaw-=e.movementX*0.004; pitch=Math.max(-1.3,Math.min(1.3,pitch+e.movementY*0.004)); } });
  canvas.addEventListener('pointerup',function(){ dragging=false; canvas.style.cursor='grab'; });
  canvas.addEventListener('wheel',function(e){ e.preventDefault(); if(mode==='orbit'){ radius=Math.max(4,Math.min(300,radius*(1+Math.sign(e.deltaY)*0.09))); } },{passive:false});
  window.addEventListener('keydown',function(e){ keys[e.code]=true; if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0 && document.activeElement&&document.activeElement.tagName!=='INPUT') e.preventDefault(); });
  window.addEventListener('keyup',function(e){ keys[e.code]=false; });
  function resize(){ const w=canvas.clientWidth||canvas.parentElement.clientWidth||800, h=canvas.clientHeight||canvas.parentElement.clientHeight||600; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize',resize); resize();
  rebuild(); updateOrbit();
  let last=performance.now(), fpsAcc=0, frames=0, dirty=false, envDirty=false;
  function frame(){ const now=performance.now(); const dt=Math.min(0.05,(now-last)/1000); last=now; frames++; fpsAcc+=dt; if(fpsAcc>0.5){ if(HOST&&HOST.onFps) HOST.onFps(Math.round(frames/fpsAcc)); frames=0; fpsAcc=0; }
    if(dirty){ dirty=false; rebuild(); if(HOST&&HOST.onBuilt) HOST.onBuilt(); } if(envDirty){ envDirty=false; applyEnv(); }
    windU.uTime.value=now*0.001;
    if(mode==='look') updateLook(dt); else { moveVec(dt,target,Math.max(8,radius*0.35),theta+Math.PI); target.y=terrainH(target.x,target.z)+6; updateOrbit(); }
    const tp=mode==='look'?eye:target; updateChunks(tp.x,tp.z,false);
    const el=Math.max(4,Math.sin((S.timeOfDay-6)/12*Math.PI)*70)*Math.PI/180, az=(S.timeOfDay/24)*Math.PI*2; sun.position.set(tp.x+Math.cos(el)*Math.cos(az)*120, Math.sin(el)*120, tp.z+Math.cos(el)*Math.sin(az)*120); sun.target.position.set(tp.x,0,tp.z);
    renderer.render(scene,camera); }
  renderer.setAnimationLoop(frame);
  const ENV_KEYS={timeOfDay:1,fog:1,wind:1};
  const api={ set:function(k,v){ S[k]=v; if(ENV_KEYS[k]) envDirty=true; else dirty=true; }, setMany:function(o){ Object.assign(S,o); dirty=true; }, regen:function(){ dirty=true; }, setMode:function(m){ mode=m; if(m==='look'){ eye.set(target.x,terrainH(target.x,target.z-2)+1.7,target.z-2); } else { target.set(eye.x,terrainH(eye.x,eye.z)+6,eye.z); } }, setWire:function(b){ wire=b; applyWire(); }, resize:resize, dispose:function(){ renderer.setAnimationLoop(null); window.removeEventListener('resize',resize); renderer.dispose(); pmrem.dispose(); }, getSettings:function(){ return S; } };
  return api;
`;

  DEFAULTS = { biome:'Temperate broadleaf', density:'Natural', view:'Medium', seed:42017, heightScale:1.0, crownSpread:50, trunkRadius:1.0, maturity:0.75, gnarl:0.35, foliage:1.0, autumn:0, groundCover:'Auto', grass:1.0, relief:1.0, timeOfDay:15, fog:1.0, wind:0.5 };

  state = { settings:null, mode:'orbit', wire:false, fps:0, treeCount:0, building:false, showExport:false, exportTab:'html', copied:false };

  constructor(props){ super(props); this.state.settings = Object.assign({}, this.DEFAULTS); }
  componentDidMount(){ this._mounted=true; this._waitThree(); }
  componentWillUnmount(){ this._mounted=false; if(this.eng) this.eng.dispose(); }
  _waitThree(){ if(window.THREE){ this._init(); } else if(this._mounted){ setTimeout(()=>this._waitThree(), 60); } }
  _init(){
    const canvas = this.canvasRef && this.canvasRef.current;
    if(!canvas){ setTimeout(()=>this._init(), 60); return; }
    const S = JSON.parse(JSON.stringify(this.state.settings));
    const self = this;
    const HOST = { onFps:(f)=>{ if(self._lastFps!==f){ self._lastFps=f; self.setState({fps:f}); } }, onCount:(c)=>{ if(self.state.treeCount!==c) self.setState({treeCount:c}); }, onBuilt:()=>self.setState({building:false}) };
    try{ const factory = new Function('THREE','canvas','S','HOST', this.ENGINE_BODY); this.eng = factory(window.THREE, canvas, S, HOST); }
    catch(err){ console.error('Forest engine failed to init:', err); }
  }
  set(key, val){
    const s = Object.assign({}, this.state.settings); s[key]=val;
    const live = key==='timeOfDay'||key==='fog'||key==='wind';
    this.setState({ settings:s, building:!live });
    if(this.eng) this.eng.set(key, val);
  }
  regen(){ this.setState({building:true}); if(this.eng) this.eng.regen(); }
  _buildHtml(){
    const json = JSON.stringify(this.state.settings, null, 2);
    return ['<!doctype html><html><head><meta charset="utf-8">','<meta name="viewport" content="width=device-width,initial-scale=1">','<title>Arbor Forest</title>','<style>html,body{margin:0;height:100%;overflow:hidden}#c{width:100vw;height:100vh;display:block}</style>','</head><body><canvas id="c"></canvas>','<scr'+'ipt src="https://unpkg.com/three@0.160.0/build/three.min.js"></scr'+'ipt>','<scr'+'ipt>','const S = '+json+';','const HOST = {};','const canvas = document.getElementById("c");','(function(THREE,canvas,S,HOST){',this.ENGINE_BODY,'})(THREE,canvas,S,HOST);','</scr'+'ipt></body></html>'].join('\n');
  }
  openExport(){ this.setState({ showExport:true, exportTab:'html', copied:false }); }
  closeExport(){ this.setState({ showExport:false }); }
  _exportText(){ return this.state.exportTab==='json' ? JSON.stringify(this.state.settings,null,2) : this._buildHtml(); }
  copyExport(){ const txt=this._exportText(); try{ navigator.clipboard.writeText(txt); }catch(e){} this.setState({ copied:true }); setTimeout(()=>{ if(this._mounted) this.setState({ copied:false }); }, 1600); }
  downloadExport(){ const t=this.state.exportTab; const txt=this._exportText(); const ext=t==='json'?'json':'html'; const blob=new Blob([txt],{type:t==='html'?'text/html':'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='arbor-forest.'+ext; a.click(); setTimeout(()=>URL.revokeObjectURL(url),800); }
  _tabStyle(active){ return 'border:1px solid '+(active?'#7cc243':'rgba(255,255,255,.12)')+';background:'+(active?'rgba(124,194,67,.12)':'transparent')+';color:'+(active?'#7cc243':'#c7d0d9')+";font-family:'Space Grotesk';font-weight:600;font-size:12.5px;padding:8px 14px;border-radius:9px;cursor:pointer"; }
  _modeStyle(active){ return 'border:1px solid '+(active?'#7cc243':'rgba(255,255,255,.12)')+';background:'+(active?'rgba(124,194,67,.16)':'rgba(10,13,18,.62)')+';backdrop-filter:blur(10px);color:'+(active?'#7cc243':'#e6edf3')+";font-family:'Space Grotesk';font-weight:600;font-size:12px;padding:8px 14px;border-radius:10px;cursor:pointer"; }
  _segStyle(active){ return 'flex:1;min-width:60px;border:1px solid '+(active?'#7cc243':'rgba(255,255,255,.12)')+';background:'+(active?'rgba(124,194,67,.14)':'#11151c')+';color:'+(active?'#7cc243':'#c7d0d9')+";font-family:'Space Grotesk';font-weight:600;font-size:12px;padding:8px 6px;border-radius:8px;cursor:pointer"; }

  renderVals(){
    this.canvasRef = this.canvasRef || React.createRef();
    const S = this.state.settings, self = this;
    const num = (e)=> parseFloat(e.target.value);
    const R = (key,label,min,max,step,dec)=>({ isRange:true, key, label, value:S[key], min, max, step, display:Number(S[key]).toFixed(dec==null?2:dec), onInput:(e)=>self.set(key, num(e)) });
    const SEL = (key,label,options)=>({ isSelect:true, key, label, value:S[key], options, display:'', onInput:(e)=>self.set(key, e.target.value) });
    const SEG = (key,label,options)=>({ isSeg:true, key, label, display:'', segs:options.map(o=>({ label:String(o), style:self._segStyle(S[key]===o), onClick:()=>self.set(key,o) })) });
    const SEED = { isSeed:true, label:'Seed', display:'', value:S.seed, onInput:(e)=>self.set('seed', parseInt(e.target.value)||1), shuffle:()=>self.set('seed', Math.floor(Math.random()*1e9)) };
    const sections = [
      { title:'World', items:[ SEL('biome','Forest type',['Temperate broadleaf','Boreal conifer','Tropical wet','Birch grove','Mediterranean pine']), SEG('density','Stand density',['Open','Natural','Dense']), SEG('view','Stream distance',['Near','Medium','Far']), SEED ] },
      { title:'Tree architecture', items:[ R('heightScale','Height',0.5,1.6,0.01,2), R('crownSpread','Crown spread',20,80,1,0), R('trunkRadius','Trunk radius',0.5,1.8,0.01,2), R('maturity','Maturity',0,1,0.01,2), R('gnarl','Gnarl',0,1,0.01,2), R('foliage','Foliage',0.3,1.8,0.01,2), R('autumn','Autumn',0,1,0.01,2) ] },
      { title:'Ground', items:[ SEL('groundCover','Ground cover',['Auto','Leaf litter','Needle duff','Ground moss','Bare earth']), R('grass','Grass density',0,2,0.01,2), R('relief','Terrain relief',0,2,0.01,2) ] },
      { title:'Light & air', items:[ R('timeOfDay','Time of day',6,20,0.1,1), R('fog','Fog',0,3,0.01,2), R('wind','Wind',0,1.5,0.01,2) ] }
    ];
    return {
      canvasRef: this.canvasRef, fps: this.state.fps, treeCount: this.state.treeCount, building: this.state.building, sections,
      hint: this.state.mode==='look' ? 'Walk: drag to look · WASD / arrows to move · Shift to run. The world streams in endlessly.' : 'Drag to orbit · scroll to zoom · WASD to fly across the zone · Walk mode drops you onto the forest floor.',
      orbitStyle: this._modeStyle(this.state.mode==='orbit'), lookStyle: this._modeStyle(this.state.mode==='look'), wireStyle: this._modeStyle(this.state.wire),
      setOrbit: ()=>{ self.setState({mode:'orbit'}); if(self.eng) self.eng.setMode('orbit'); },
      setLook: ()=>{ self.setState({mode:'look'}); if(self.eng) self.eng.setMode('look'); },
      wireToggle: ()=>{ const b=!self.state.wire; self.setState({wire:b}); if(self.eng) self.eng.setWire(b); },
      regen: ()=>self.regen(),
      openExport: ()=>self.openExport(), closeExport: ()=>self.closeExport(), stop: (e)=>{ e.stopPropagation(); },
      showExport: this.state.showExport, exportText: this._exportText(),
      tabHtml: ()=>self.setState({exportTab:'html'}), tabJson: ()=>self.setState({exportTab:'json'}),
      tabHtmlStyle: this._tabStyle(this.state.exportTab==='html'), tabJsonStyle: this._tabStyle(this.state.exportTab==='json'),
      copyExport: ()=>self.copyExport(), downloadExport: ()=>self.downloadExport(),
      copyLabel: this.state.copied ? 'Copied ✓' : 'Copy to clipboard'
    };
  }
}
