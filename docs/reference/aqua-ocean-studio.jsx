
class Component extends DCLogic {
  SIM_VERT = `varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  SIM_FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDamping;
uniform int uCount;
uniform vec4 uSrc[16];
void main(){
  vec4 c = texture2D(uPrev, vUv);
  float cur = c.r; float prev = c.g;
  float l = texture2D(uPrev, vUv - vec2(uTexel.x,0.0)).r;
  float r = texture2D(uPrev, vUv + vec2(uTexel.x,0.0)).r;
  float u = texture2D(uPrev, vUv + vec2(0.0,uTexel.y)).r;
  float d = texture2D(uPrev, vUv - vec2(0.0,uTexel.y)).r;
  float nH = (l + r + u + d) * 0.5 - prev;
  nH *= uDamping;
  for(int i=0;i<16;i++){
    if(i >= uCount) break;
    vec4 s = uSrc[i];
    float dd = distance(vUv, s.xy);
    nH += s.z * exp(-(dd*dd)/(s.w*s.w));
  }
  nH = clamp(nH, -1.5, 1.5);
  gl_FragColor = vec4(nH, cur, 0.0, 1.0);
}`;

  COMMON = `precision highp float;
uniform vec3 uZenith,uHorizon,uSunColor,uSunDir,uCamPos,uDeep,uShallow;
uniform float uGlare,uCloud,uTime,uWaveH,uSteep,uWaveScale,uWindDir,uSpeed,uShoal,uMurk,uExposure,uTone,uRipSize;
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<4;i++){ v+=a*vnoise(p); p=m*p; a*=0.5; } return v; }
float ripFade(vec2 uv){ vec2 d=abs(uv-0.5); return 1.0-smoothstep(0.36,0.5,max(d.x,d.y)); }
float seabed(vec2 p){
  float r=length(p);
  float base=-mix(uShoal,48.0,smoothstep(26.0,140.0,r));
  base+=(fbm(p*0.05)-0.5)*3.2*smoothstep(4.0,30.0,r);
  vec2 q=p-vec2(14.0,-10.0);
  base+=(uShoal-0.25)*exp(-dot(q,q)/34.0);
  return min(base,-0.15);
}
void waveParam(int i, out float ang, out float len, out float amp){
  if(i==0){ang=0.0;len=42.0;amp=1.0;} else if(i==1){ang=0.4;len=27.0;amp=0.6;} else if(i==2){ang=-0.54;len=17.0;amp=0.4;} else if(i==3){ang=0.96;len=9.5;amp=0.22;} else if(i==4){ang=-1.22;len=5.5;amp=0.12;} else {ang=1.92;len=3.2;amp=0.07;}
}
void gerstner(vec2 p, out vec3 disp, out vec3 nrm, out float J){
  disp=vec3(0.0); vec3 n=vec3(0.0,1.0,0.0); J=1.0;
  for(int i=0;i<6;i++){
    float ang,len,amp; waveParam(i,ang,len,amp);
    ang+=uWindDir; len*=uWaveScale; amp*=uWaveH;
    vec2 d=vec2(cos(ang),sin(ang));
    float k=6.2831853/len; float w=sqrt(9.81*k)*uSpeed;
    float qa=uSteep/(k*6.0)*clamp(amp*k*3.0,0.0,1.0);
    float th=k*dot(d,p)-w*uTime+float(i)*1.7;
    float s=sin(th), c=cos(th);
    disp.xz+=qa*d*c; disp.y+=amp*s;
    n.xz-=d*k*amp*c; n.y-=k*qa*s; J-=k*qa*s;
  }
  nrm=normalize(n);
}
vec3 skyCol(vec3 d, float withClouds){
  d=normalize(d);
  float t=clamp(d.y,0.0,1.0);
  vec3 c=mix(uHorizon,uZenith,pow(t,0.38));
  if(d.y<0.0) c=mix(uHorizon,uHorizon*0.45,clamp(-d.y*3.0,0.0,1.0));
  vec3 L=normalize(uSunDir);
  float s=max(dot(d,L),0.0);
  c+=uSunColor*pow(s,6.0)*0.22*uGlare;
  c+=uSunColor*pow(s,64.0)*0.35*uGlare;
  c+=uSunColor*smoothstep(0.9994,0.9999,s)*12.0;
  if(withClouds>0.5 && d.y>0.0){
    vec2 p=d.xz/(d.y+0.15)*1.6+vec2(uTime*0.006,uTime*0.003);
    float n=fbm(p);
    float th=0.78-uCloud*0.5;
    float cov=smoothstep(th,th+0.22,n)*smoothstep(0.0,0.12,d.y);
    vec3 cc=mix(vec3(1.0,1.0,1.02)*1.1, vec3(0.62,0.66,0.74), smoothstep(th+0.05,th+0.42,n));
    cc*=(0.85+0.35*pow(s,2.0));
    c=mix(c,cc,cov);
  }
  return c;
}
vec3 tonemap(vec3 x){ x*=uExposure; x=(x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14); return pow(clamp(x,0.0,1.0),vec3(1.0/2.2)); }
vec3 outCol(vec3 c){ return uTone>0.5 ? tonemap(c) : c; }
`;

  WATER_VERT = `uniform sampler2D uRip; uniform float uRipH,uFar;
varying vec3 vWorld; varying vec2 vBase;
void main(){
  vec2 g=position.xz;
  vec2 w=uCamPos.xz+sign(g)*pow(abs(g),vec2(2.2))*uFar;
  vec3 disp,n; float J; gerstner(w,disp,n,J);
  vec2 ruv=vec2(0.5+w.x/uRipSize,0.5-w.y/uRipSize);
  float rf=ripFade(ruv);
  float rh=rf>0.0 ? texture2D(uRip,ruv).r*uRipH*rf : 0.0;
  vec3 p=vec3(w.x,0.0,w.y)+disp; p.y+=rh;
  vWorld=p; vBase=w;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
}`;

  WATER_FRAG = `uniform sampler2D uRip,uScene; uniform vec2 uRipTexel,uResolution;
uniform float uRipH,uDetail,uReflect,uRefract,uFoam,uSSS,uFogD,uDebug;
varying vec3 vWorld; varying vec2 vBase;
float detailH(vec2 p){ return vnoise(p*1.1+uTime*vec2(0.23,0.14)*uSpeed)*0.6+vnoise(p*2.7-uTime*vec2(0.12,0.21)*uSpeed)*0.4; }
void main(){
  vec3 dd,nG; float J; gerstner(vBase,dd,nG,J);
  vec3 toCam=uCamPos-vWorld; float dist=length(toCam); vec3 V=toCam/dist;
  float e=0.06; float h0=detailH(vWorld.xz); float hx=detailH(vWorld.xz+vec2(e,0.0)); float hz=detailH(vWorld.xz+vec2(0.0,e));
  float dfade=uDetail*0.35/(1.0+dist*0.025);
  vec3 n=nG+vec3(-(hx-h0)/e*dfade,0.0,-(hz-h0)/e*dfade);
  vec2 ruv=vec2(0.5+vBase.x/uRipSize,0.5-vBase.y/uRipSize);
  float rf=ripFade(ruv);
  if(uDebug>0.5){ float h=texture2D(uRip,ruv).r*rf; gl_FragColor=vec4(vec3(0.5+h*2.5),1.0); return; }
  if(rf>0.0){
    float hL=texture2D(uRip,ruv-vec2(uRipTexel.x,0.0)).r, hR=texture2D(uRip,ruv+vec2(uRipTexel.x,0.0)).r;
    float hD=texture2D(uRip,ruv-vec2(0.0,uRipTexel.y)).r, hU=texture2D(uRip,ruv+vec2(0.0,uRipTexel.y)).r;
    float f=uRipH*rf/(2.0*uRipTexel.x*uRipSize);
    n.x+=(hL-hR)*f; n.z+=(hU-hD)*f;
  }
  n=normalize(n);
  vec3 L=normalize(uSunDir);
  vec3 col;
  if(gl_FrontFacing){
    vec3 R=reflect(-V,n); R.y=max(R.y,0.02);
    vec3 refl=skyCol(R,1.0);
    vec3 T=refract(-V,n,0.75);
    float bedY=seabed(vWorld.xz+T.xz*1.5);
    float depth=max(vWorld.y-bedY,0.0);
    float path=depth/max(-T.y,0.25);
    vec3 trans=exp(-path*vec3(0.34,0.12,0.075)*uMurk);
    vec2 suv=gl_FragCoord.xy/uResolution;
    vec3 sceneC=texture2D(uScene,clamp(suv+n.xz*uRefract/(1.0+dist*0.04),0.001,0.999)).rgb;
    vec3 body=mix(uDeep,uShallow,exp(-depth*0.11*uMurk));
    vec3 refrCol=mix(body,sceneC,trans);
    float F=clamp(0.02+0.98*pow(1.0-max(dot(n,V),0.0),5.0),0.0,1.0)*uReflect;
    col=mix(refrCol,refl,F);
    float back=max(dot(V,-L),0.0);
    float hgt=clamp(vWorld.y/max(uWaveH,0.05)*0.5+0.35,0.0,1.0);
    float sss=(pow(back,3.0)*1.2+0.12)*hgt*uSSS;
    col+=uShallow*sss*(1.0-F)*0.8;
    vec3 H=normalize(L+V); float nh=max(dot(n,H),0.0);
    float spec=pow(nh,1200.0)*4.0+pow(nh,120.0)*0.15;
    col+=uSunColor*spec*uGlare;
    float crest=smoothstep(1.0-uSteep*0.45,1.0-uSteep*0.95,J);
    float fn=fbm(vWorld.xz*0.3+vec2(uTime*0.04,-uTime*0.02));
    float foam=crest*smoothstep(0.32,0.68,fn+crest*0.3);
    float shore=smoothstep(1.8,0.1,depth)*smoothstep(0.38,0.72,fn*0.7+fbm(vWorld.xz*0.9+uTime*vec2(0.2,-0.13))*0.6);
    foam=clamp((foam+shore)*uFoam,0.0,1.0);
    vec3 foamCol=vec3(0.9,0.94,0.97)*(0.5+0.6*max(dot(n,L),0.0)+0.2*uGlare);
    col=mix(col,foamCol,foam);
    float fog=1.0-exp(-dist*uFogD);
    col=mix(col,skyCol(vec3(-V.x,0.03,-V.z),0.0),fog);
  } else {
    vec3 nb=-n;
    vec3 T=refract(-V,nb,1.333);
    if(dot(T,T)<0.001){ col=uDeep*0.4; } else { col=skyCol(T,1.0)*vec3(0.55,0.8,1.0)*0.9; }
    float F=clamp(0.02+0.98*pow(1.0-max(dot(nb,V),0.0),5.0),0.0,1.0);
    col=mix(col,uDeep*0.4,F*0.8);
    float fog=1.0-exp(-dist*0.05*uMurk);
    col=mix(col,uDeep*0.32,fog);
  }
  gl_FragColor=vec4(outCol(col),1.0);
}`;

  SKY_VERT = `varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

  SKY_FRAG = `varying vec3 vDir;
void main(){ vec3 c=skyCol(vDir,1.0); gl_FragColor=vec4(outCol(c),1.0); }`;

  BED_VERT = `varying vec3 vW; varying vec3 vN;
void main(){
  vec3 p=position;
  float e=0.8; float h=seabed(p.xz); float hx=seabed(p.xz+vec2(e,0.0)); float hz=seabed(p.xz+vec2(0.0,e));
  vN=normalize(vec3(-(hx-h)/e,1.0,-(hz-h)/e));
  p.y=h; vW=p;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
}`;

  BED_FRAG = `uniform vec3 uSand; uniform sampler2D uRip; uniform vec2 uRipTexel;
varying vec3 vW; varying vec3 vN;
void main(){
  vec3 L=normalize(uSunDir);
  float depth=max(-vW.y,0.0);
  float c1=vnoise(vW.xz*0.6+uTime*vec2(0.3,0.18)*uSpeed), c2=vnoise(vW.xz*0.8-uTime*vec2(0.2,0.27)*uSpeed+3.1);
  float caust=pow(clamp(1.0-abs(c1-c2)*1.7,0.0,1.0),6.0);
  vec2 ruv=vec2(0.5+vW.x/uRipSize,0.5-vW.z/uRipSize); float rf=ripFade(ruv);
  float ripC=0.0;
  if(rf>0.0){
    float c0=texture2D(uRip,ruv).r;
    float l=texture2D(uRip,ruv-vec2(uRipTexel.x,0.0)).r, r=texture2D(uRip,ruv+vec2(uRipTexel.x,0.0)).r;
    float u=texture2D(uRip,ruv+vec2(0.0,uRipTexel.y)).r, d=texture2D(uRip,ruv-vec2(0.0,uRipTexel.y)).r;
    ripC=clamp(-(l+r+u+d-4.0*c0)*7.0,-0.4,1.6)*rf;
  }
  float cf=exp(-depth*0.09*uMurk);
  float grain=0.8+0.3*fbm(vW.xz*0.5);
  vec3 col=uSand*grain*(0.85+0.8*caust*cf+ripC*cf);
  float nl=max(dot(normalize(vN),L),0.0);
  col*=0.4+0.7*nl;
  col*=exp(-depth*vec3(0.34,0.12,0.075)*uMurk*0.6);
  if(uCamPos.y<0.0){ float dcam=length(uCamPos-vW); float fog=1.0-exp(-dcam*0.05*uMurk); col=mix(col,uDeep*0.32,fog); }
  gl_FragColor=vec4(outCol(col),1.0);
}`;

  ENGINE_BODY = `
  const RS = 48.0, SIMRES = 256, GRID = 400;
  const WAVES=[[0,42,1.0],[0.4,27,0.6],[-0.54,17,0.4],[0.96,9.5,0.22],[-1.22,5.5,0.12],[1.92,3.2,0.07]];
  let time = 0;
  function waveY(x,z,t){ let y=0; const wd=S.windDir*Math.PI/180; for(let i=0;i<6;i++){ const W=WAVES[i]; const ang=W[0]+wd, len=W[1]*S.waveScale, amp=W[2]*S.waveHeight; const k=2*Math.PI/len, w=Math.sqrt(9.81*k)*S.waveSpeed; const th=k*(Math.cos(ang)*x+Math.sin(ang)*z)-w*t+i*1.7; y+=amp*Math.sin(th); } return y; }
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0x062a4a, 0.0); scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30000);
  let theta = 0.6, phi = 1.18, radius = 26, target = new THREE.Vector3(0,0.6,0);
  function updateCam(){ const sp = Math.sin(phi); camera.position.set(target.x+radius*sp*Math.sin(theta), target.y+radius*Math.cos(phi), target.z+radius*sp*Math.cos(theta)); camera.lookAt(target); }
  updateCam();
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0x8fb6d8, 0.7));
  function srcArray(){ const a=[]; for(let i=0;i<16;i++) a.push(new THREE.Vector4(0,0,0,0.02)); return a; }
  const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, format: THREE.RGBAFormat };
  let rtA = new THREE.WebGLRenderTarget(SIMRES, SIMRES, rtOpts);
  let rtB = new THREE.WebGLRenderTarget(SIMRES, SIMRES, rtOpts);
  const simScene = new THREE.Scene();
  const simCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const simU = { uPrev:{value:rtA.texture}, uTexel:{value:new THREE.Vector2(1/SIMRES,1/SIMRES)}, uDamping:{value:S.damping}, uCount:{value:0}, uSrc:{value:srcArray()} };
  const simMat = new THREE.ShaderMaterial({ vertexShader:SIM_VERT, fragmentShader:SIM_FRAG, uniforms:simU, depthTest:false, depthWrite:false });
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), simMat));
  let simSub = 2;
  const SH = {
    uZenith:{value:new THREE.Color(S.zenith)}, uHorizon:{value:new THREE.Color(S.horizon)}, uSunColor:{value:new THREE.Color(S.sunColor)}, uSunDir:{value:new THREE.Vector3(0,1,0)},
    uCamPos:{value:new THREE.Vector3()}, uDeep:{value:new THREE.Color(S.deepColor)}, uShallow:{value:new THREE.Color(S.shallowColor)},
    uGlare:{value:S.sunGlare}, uCloud:{value:S.clouds}, uTime:{value:0}, uWaveH:{value:S.waveHeight}, uSteep:{value:S.choppiness}, uWaveScale:{value:S.waveScale},
    uWindDir:{value:0}, uSpeed:{value:S.waveSpeed}, uShoal:{value:S.shoalDepth}, uMurk:{value:1}, uExposure:{value:S.exposure}, uTone:{value:1}, uRipSize:{value:RS}
  };
  function U(extra){ return Object.assign({}, SH, extra); }
  const ripTexel = { value:new THREE.Vector2(1/SIMRES,1/SIMRES) };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8000,48,24), new THREE.ShaderMaterial({ vertexShader:SKY_VERT, fragmentShader:COMMON+SKY_FRAG, uniforms:U({}), side:THREE.BackSide, depthWrite:false }));
  scene.add(sky);
  const bedGeo = new THREE.PlaneGeometry(700,700,240,240); bedGeo.rotateX(-Math.PI/2);
  const bedU = U({ uSand:{value:new THREE.Color(S.sand)}, uRip:{value:rtA.texture}, uRipTexel:ripTexel });
  const bed = new THREE.Mesh(bedGeo, new THREE.ShaderMaterial({ vertexShader:COMMON+BED_VERT, fragmentShader:COMMON+BED_FRAG, uniforms:bedU }));
  bed.frustumCulled = false; scene.add(bed);
  const wGeo = new THREE.PlaneGeometry(2,2,GRID,GRID); wGeo.rotateX(-Math.PI/2);
  const waterU = U({ uRip:{value:rtA.texture}, uRipTexel:ripTexel, uRipH:{value:1.2}, uFar:{value:6000}, uScene:{value:null}, uResolution:{value:new THREE.Vector2(1,1)},
    uDetail:{value:S.detail}, uReflect:{value:S.reflectivity}, uRefract:{value:S.refractionStrength}, uFoam:{value:S.foamIntensity}, uSSS:{value:S.sss}, uFogD:{value:0.001}, uDebug:{value:0} });
  const water = new THREE.Mesh(wGeo, new THREE.ShaderMaterial({ vertexShader:COMMON+WATER_VERT, fragmentShader:COMMON+WATER_FRAG, uniforms:waterU, side:THREE.DoubleSide }));
  water.frustumCulled = false; scene.add(water);
  let sceneRT = new THREE.WebGLRenderTarget(2,2,{ minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter });
  waterU.uScene.value = sceneRT.texture;
  const queue = [];
  function impulse(u,v,strength,rad){ if(u<0.0||u>1.0||v<0.0||v>1.0) return; queue.push([u,v,strength,rad||0.02]); }
  const balls = [];
  function drop(u,v){
    const m = new THREE.MeshPhongMaterial({ color:0xff6a2a, shininess:60, specular:0x666666 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55,24,16), m);
    const x=(u-0.5)*RS, z=(0.5-v)*RS; mesh.position.set(x,9,z); scene.add(mesh);
    balls.push({ mesh:mesh, vy:0, u:u, v:v, x:x, z:z, landed:false, t:0 });
    if(balls.length>12){ const b=balls.shift(); scene.remove(b.mesh); }
  }
  function sunDir(){ const el=S.sunElevation*Math.PI/180, az=S.sunAzimuth*Math.PI/180; return new THREE.Vector3(Math.cos(el)*Math.cos(az), Math.sin(el), Math.cos(el)*Math.sin(az)).normalize(); }
  function applyUniforms(){
    const sd = sunDir();
    SH.uZenith.value.set(S.zenith); SH.uHorizon.value.set(S.horizon); SH.uSunColor.value.set(S.sunColor); SH.uSunDir.value.copy(sd);
    SH.uDeep.value.set(S.deepColor); SH.uShallow.value.set(S.shallowColor);
    SH.uGlare.value=S.sunGlare; SH.uCloud.value=S.clouds; SH.uWaveH.value=S.waveHeight; SH.uSteep.value=S.choppiness; SH.uWaveScale.value=S.waveScale;
    SH.uWindDir.value=S.windDir*Math.PI/180; SH.uSpeed.value=S.waveSpeed; SH.uShoal.value=S.shoalDepth; SH.uMurk.value=2.0-S.clarity*1.7; SH.uExposure.value=S.exposure;
    waterU.uDetail.value=S.detail; waterU.uReflect.value=S.reflectivity; waterU.uRefract.value=S.refractionStrength; waterU.uFoam.value=S.foamIntensity; waterU.uSSS.value=S.sss; waterU.uFogD.value=S.haze*0.0012; waterU.uDebug.value=S.debugHeight?1.0:0.0;
    bedU.uSand.value.set(S.sand);
    simU.uDamping.value=S.damping; simSub=2;
    water.material.wireframe = !!S.wireframe;
    dirLight.position.copy(sd).multiplyScalar(30); dirLight.color.set(S.sunColor);
    fog.color.set(S.deepColor);
  }
  applyUniforms();
  let mode='sculpt', downBtn=-1, downX=0, downY=0, downT=0, moved=0, dragArmed=false;
  const ray = new THREE.Raycaster();
  const planeY0 = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  function uvAt(cx,cy){ const r=canvas.getBoundingClientRect(); const nx=((cx-r.left)/r.width)*2-1, ny=-((cy-r.top)/r.height)*2+1; ray.setFromCamera(new THREE.Vector2(nx,ny), camera); const pt=new THREE.Vector3(); if(ray.ray.intersectPlane(planeY0, pt)){ return { u:0.5+pt.x/RS, v:0.5-pt.z/RS }; } return null; }
  canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown', function(e){ try{ canvas.setPointerCapture(e.pointerId); }catch(err){} downBtn=e.button; downX=e.clientX; downY=e.clientY; downT=performance.now(); moved=0; if(e.button===0 && mode==='sculpt' && !(e.shiftKey||dragArmed)){ const p=uvAt(e.clientX,e.clientY); if(p) impulse(p.u,p.v,-0.06,0.02); } });
  canvas.addEventListener('pointermove', function(e){ if(downBtn===-1){ if(mode==='sculpt'){ const p=uvAt(e.clientX,e.clientY); if(p) impulse(p.u,p.v,-0.014,0.012); } return; } moved+=Math.abs(e.movementX)+Math.abs(e.movementY); const orbit=(downBtn===2||downBtn===1||mode==='camera'); if(orbit){ theta-=e.movementX*0.005; phi=Math.max(0.05,Math.min(2.9, phi - e.movementY*0.005)); updateCam(); } else if(downBtn===0 && mode==='sculpt' && !(e.shiftKey||dragArmed)){ const p=uvAt(e.clientX,e.clientY); if(p) impulse(p.u,p.v,-0.07,0.02); } });
  canvas.addEventListener('pointerup', function(e){ const dt=performance.now()-downT; if(downBtn===0 && moved<6 && dt<320){ const p=uvAt(e.clientX,e.clientY); if(p){ if(e.shiftKey||dragArmed){ drop(p.u,p.v); dragArmed=false; if(HOST&&HOST.onArm) HOST.onArm(false); } else { impulse(p.u,p.v,-0.3,0.03); } } } downBtn=-1; });
  canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  canvas.addEventListener('wheel', function(e){ e.preventDefault(); radius=Math.max(2.5,Math.min(140, radius*(1+Math.sign(e.deltaY)*0.08))); updateCam(); }, { passive:false });
  function resize(){ const w=canvas.clientWidth||canvas.parentElement.clientWidth||800, h=canvas.clientHeight||canvas.parentElement.clientHeight||600; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); const dpr=renderer.getPixelRatio(); const pw=Math.max(2,Math.floor(w*dpr)), ph=Math.max(2,Math.floor(h*dpr)); sceneRT.setSize(pw,ph); waterU.uResolution.value.set(pw,ph); }
  window.addEventListener('resize', resize); resize();
  impulse(0.45,0.5,-0.3,0.025);
  let last=performance.now(), fpsAcc=0, frames=0;
  function stepSim(){
    for(let s=0;s<simSub;s++){
      simU.uPrev.value = rtA.texture;
      const n = (s===0)? Math.min(16,queue.length) : 0;
      simU.uCount.value = n;
      if(s===0){ for(let i=0;i<n;i++){ const q=queue[i]; simU.uSrc.value[i].set(q[0],q[1],q[2],q[3]); } }
      renderer.setRenderTarget(rtB); renderer.render(simScene, simCam);
      const t=rtA; rtA=rtB; rtB=t;
    }
    queue.length=0;
    waterU.uRip.value=rtA.texture; bedU.uRip.value=rtA.texture;
  }
  function frame(){
    const now=performance.now(); const dt=Math.min(0.05,(now-last)/1000); last=now;
    time += dt; SH.uTime.value = time;
    frames++; fpsAcc+=dt; if(fpsAcc>0.5){ if(HOST&&HOST.onFps) HOST.onFps(Math.round(frames/fpsAcc)); frames=0; fpsAcc=0; }
    stepSim();
    for(let i=balls.length-1;i>=0;i--){ const b=balls[i]; b.t+=dt; const wy=waveY(b.x,b.z,time); if(!b.landed){ b.vy-=9.8*dt; b.mesh.position.y+=b.vy*dt; if(b.mesh.position.y<=wy){ b.landed=true; b.mesh.position.y=wy; impulse(b.u,b.v,-0.6,0.035); } } else { b.mesh.position.y += (wy+0.05-b.mesh.position.y)*0.15; b.mesh.rotation.x+=dt*0.5; b.mesh.rotation.z+=dt*0.3; } if(b.t>20){ scene.remove(b.mesh); balls.splice(i,1); } }
    SH.uCamPos.value.copy(camera.position); sky.position.copy(camera.position);
    const under = camera.position.y < waveY(camera.position.x, camera.position.z, time);
    fog.density = under ? 0.04*SH.uMurk.value : 0.0;
    SH.uTone.value=0; water.visible=false; renderer.setRenderTarget(sceneRT); renderer.render(scene,camera);
    waterU.uScene.value=sceneRT.texture;
    SH.uTone.value=1; water.visible=true; renderer.setRenderTarget(null); renderer.render(scene,camera);
  }
  renderer.setAnimationLoop(frame);
  const api = {
    set:function(k,v){ S[k]=v; applyUniforms(); },
    setMany:function(o){ Object.assign(S,o); applyUniforms(); },
    setMode:function(m){ mode=m; },
    arm:function(a){ dragArmed=a; },
    dropRandom:function(){ drop(0.3+Math.random()*0.4, 0.3+Math.random()*0.4); },
    dive:function(){ if(phi<1.6){ phi=2.15; radius=Math.min(radius,14); } else { phi=1.28; } updateCam(); },
    resize:resize,
    dispose:function(){ renderer.setAnimationLoop(null); window.removeEventListener('resize',resize); renderer.dispose(); },
    getSettings:function(){ return S; }
  };
  return api;
`;

  SKY_PRESETS = {
    'Tropical Noon': { zenith:'#1e63c8', horizon:'#cfe6f7', sunColor:'#fff4dc', sunElevation:52, sunAzimuth:130, sunGlare:0.6, clouds:0.55 },
    'Clear Midday': { zenith:'#2f79d6', horizon:'#dfefff', sunColor:'#fff3d6', sunElevation:46, sunAzimuth:135, sunGlare:0.6, clouds:0.2 },
    'Golden Hour': { zenith:'#3a3f74', horizon:'#ffb267', sunColor:'#ff8a3c', sunElevation:9, sunAzimuth:110, sunGlare:1.05, clouds:0.5 },
    'Overcast': { zenith:'#9aa6b2', horizon:'#d5dbe0', sunColor:'#dfe4e8', sunElevation:40, sunAzimuth:150, sunGlare:0.15, clouds:0.95 },
    'Night': { zenith:'#060a16', horizon:'#12233f', sunColor:'#bcd0ff', sunElevation:35, sunAzimuth:150, sunGlare:0.45, clouds:0.3 }
  };

  DEFAULTS = { waveHeight:0.75, choppiness:0.55, waveScale:1.0, windDir:35, waveSpeed:1.0, detail:0.7, damping:0.985, shallowColor:'#25c8c4', deepColor:'#063a6e', clarity:0.65, shoalDepth:4.5, sand:'#c9b489', skyPreset:'Tropical Noon', zenith:'#1e63c8', horizon:'#cfe6f7', sunColor:'#fff4dc', sunAzimuth:130, sunElevation:52, sunGlare:0.6, clouds:0.55, foamIntensity:0.8, reflectivity:1.0, refractionStrength:0.06, sss:0.8, haze:0.6, exposure:1.0, wireframe:false, debugHeight:false };

  state = { settings: null, mode:'sculpt', armed:false, fps:0, showExport:false, exportTab:'html', copied:false, presets:[] };

  constructor(props){ super(props); this.state.settings = Object.assign({}, this.DEFAULTS); }

  componentDidMount(){ this._mounted=true; this._waitThree(); this._refreshPresets(); }
  componentWillUnmount(){ this._mounted=false; if(this.eng) this.eng.dispose(); }

  SHADER_NAMES = ['SIM_VERT','SIM_FRAG','COMMON','WATER_VERT','WATER_FRAG','SKY_VERT','SKY_FRAG','BED_VERT','BED_FRAG'];

  _waitThree(){ if(window.THREE){ this._init(); } else if(this._mounted){ setTimeout(()=>this._waitThree(), 60); } }
  _init(){
    const canvas = this.canvasRef && this.canvasRef.current;
    if(!canvas){ setTimeout(()=>this._init(), 60); return; }
    const S = JSON.parse(JSON.stringify(this.state.settings));
    const self = this;
    const HOST = { onFps:(f)=>{ if(self._lastFps!==f){ self._lastFps=f; self.setState({fps:f}); } }, onArm:(a)=>self.setState({armed:a}) };
    try{
      const factory = new Function('THREE','canvas','S', ...this.SHADER_NAMES, 'HOST', this.ENGINE_BODY);
      this.eng = factory(window.THREE, canvas, S, ...this.SHADER_NAMES.map(n=>this[n]), HOST);
    }catch(err){ console.error('Water engine failed to init:', err); }
  }

  set(key, val){
    let patch = {}; patch[key] = val;
    if(key==='skyPreset' && this.SKY_PRESETS[val]){ patch = Object.assign({}, this.SKY_PRESETS[val]); patch.skyPreset = val; }
    const s = Object.assign({}, this.state.settings, patch);
    this.setState({ settings:s });
    if(this.eng) this.eng.setMany(patch);
  }

  _presetStore(){ try{ return JSON.parse(localStorage.getItem('aqua-ocean-presets')||'{}'); }catch(e){ return {}; } }
  _refreshPresets(){ const st=this._presetStore(); this.setState({ presets:Object.keys(st) }); }
  savePreset(){ const name=window.prompt('Preset name'); if(!name) return; const st=this._presetStore(); st[name]=this.state.settings; localStorage.setItem('aqua-ocean-presets', JSON.stringify(st)); this._refreshPresets(); }
  loadPreset(name){ const st=this._presetStore(); const p=st[name]; if(!p) return; const s=Object.assign({}, this.DEFAULTS, p); this.setState({ settings:s }); if(this.eng) this.eng.setMany(s); }
  deletePreset(name){ const st=this._presetStore(); delete st[name]; localStorage.setItem('aqua-ocean-presets', JSON.stringify(st)); this._refreshPresets(); }
  resetDefaults(){ const s=Object.assign({}, this.DEFAULTS); this.setState({ settings:s }); if(this.eng) this.eng.setMany(s); }
  randomize(){
    const rnd=(a,b)=>a+Math.random()*(b-a);
    function h2h(h,s,l){ const a=s*Math.min(l,1-l); const f=(n)=>{ const k=(n+h/30)%12; const c=l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1))); return Math.round(255*c); }; const t=(x)=>x.toString(16).padStart(2,'0'); return '#'+t(f(0))+t(f(8))+t(f(4)); }
    const waterHue=rnd(165,205);
    const names=Object.keys(this.SKY_PRESETS);
    const sky=names[Math.floor(Math.random()*names.length)];
    const s=Object.assign({}, this.SKY_PRESETS[sky], {
      skyPreset:sky,
      waveHeight:+rnd(0.2,1.8).toFixed(2),
      choppiness:+rnd(0.2,0.9).toFixed(2),
      waveScale:+rnd(0.6,2.0).toFixed(2),
      windDir:Math.round(rnd(0,360)),
      waveSpeed:+rnd(0.6,1.4).toFixed(2),
      detail:+rnd(0.3,1.2).toFixed(2),
      damping:+rnd(0.972,0.995).toFixed(3),
      shallowColor:h2h(waterHue, rnd(0.5,0.8), rnd(0.42,0.6)),
      deepColor:h2h(waterHue+rnd(5,25), rnd(0.6,0.9), rnd(0.12,0.24)),
      clarity:+rnd(0.3,0.95).toFixed(2),
      shoalDepth:+rnd(1.5,7).toFixed(1),
      sand:h2h(rnd(35,50), rnd(0.25,0.45), rnd(0.6,0.75)),
      sunAzimuth:Math.round(rnd(0,360)),
      sunElevation:Math.round(rnd(8,75)),
      sunGlare:+rnd(0.25,1.2).toFixed(2),
      clouds:+rnd(0,1).toFixed(2),
      foamIntensity:+rnd(0.3,1.5).toFixed(2),
      reflectivity:+rnd(0.7,1.0).toFixed(2),
      refractionStrength:+rnd(0.02,0.15).toFixed(2),
      sss:+rnd(0.3,1.5).toFixed(2),
      haze:+rnd(0.2,1.4).toFixed(2),
      exposure:+rnd(0.9,1.4).toFixed(2),
      wireframe:false, debugHeight:false
    });
    this.setState({ settings:s }); if(this.eng) this.eng.setMany(s);
  }

  _buildHtml(){
    const S = this.state.settings;
    const json = JSON.stringify(S, null, 2);
    const names = this.SHADER_NAMES;
    const parts = [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>Aqua Ocean</title>',
      '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}#c{width:100vw;height:100vh;display:block}</style>',
      '</head><body><canvas id="c"></canvas>',
      '<scr'+'ipt src="https://unpkg.com/three@0.160.0/build/three.min.js"></scr'+'ipt>',
      '<scr'+'ipt>',
      'const S = '+json+';'
    ];
    names.forEach(n=> parts.push('const '+n+' = `'+this[n]+'`;'));
    parts.push('const HOST = {};', 'const canvas = document.getElementById("c");',
      '(function(THREE,canvas,S,'+names.join(',')+',HOST){', this.ENGINE_BODY, '})(THREE,canvas,S,'+names.join(',')+',HOST);',
      '</scr'+'ipt></body></html>');
    return parts.join('\n');
  }
  _buildGlsl(){ return this.SHADER_NAMES.map(n=> '// ===== '+n+' =====\n'+this[n]).join('\n\n'); }
  openExport(){ this.setState({ showExport:true, exportTab:'html', copied:false }); }
  closeExport(){ this.setState({ showExport:false }); }
  _exportText(){ const t=this.state.exportTab; if(t==='json') return JSON.stringify(this.state.settings,null,2); if(t==='glsl') return this._buildGlsl(); return this._buildHtml(); }
  copyExport(){ const txt=this._exportText(); try{ navigator.clipboard.writeText(txt); }catch(e){} this.setState({ copied:true }); setTimeout(()=>{ if(this._mounted) this.setState({ copied:false }); }, 1600); }
  downloadExport(){ const t=this.state.exportTab; const txt=this._exportText(); const ext = t==='json'?'json':(t==='glsl'?'glsl.txt':'html'); const mime = t==='html'?'text/html':'text/plain'; const blob=new Blob([txt],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='aqua-ocean.'+ext; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 800); }

  _tabStyle(active){ return 'border:1px solid '+(active?'#3ce0c8':'rgba(255,255,255,.12)')+';background:'+(active?'rgba(60,224,200,.12)':'transparent')+';color:'+(active?'#3ce0c8':'#c7d0d9')+";font-family:'Space Grotesk';font-weight:600;font-size:12.5px;padding:8px 14px;border-radius:9px;cursor:pointer"; }
  _modeStyle(active){ return 'border:1px solid '+(active?'#3ce0c8':'rgba(255,255,255,.12)')+';background:'+(active?'rgba(60,224,200,.16)':'rgba(10,13,18,.62)')+';backdrop-filter:blur(10px);color:'+(active?'#3ce0c8':'#e6edf3')+";font-family:'Space Grotesk';font-weight:600;font-size:12px;padding:8px 14px;border-radius:10px;cursor:pointer"; }

  renderVals(){
    this.canvasRef = this.canvasRef || React.createRef();
    const S = this.state.settings;
    const self = this;
    const num = (e)=> parseFloat(e.target.value);
    const R = (key,label,min,max,step,dec)=>({ isRange:true, key, label, value:S[key], min, max, step, display:Number(S[key]).toFixed(dec==null?2:dec), onInput:(e)=>self.set(key, num(e)) });
    const C = (key,label)=>({ isColor:true, key, label, value:S[key], display:String(S[key]).toUpperCase(), onInput:(e)=>self.set(key, e.target.value) });
    const T = (key,label)=>({ isToggle:true, key, label, value:S[key], display:S[key]?'On':'Off', onInput:()=>self.set(key, !S[key]), btnStyle:'width:100%;border:1px solid '+(S[key]?'#3ce0c8':'rgba(255,255,255,.12)')+';background:'+(S[key]?'rgba(60,224,200,.12)':'#11151c')+';color:'+(S[key]?'#3ce0c8':'#c7d0d9')+";font-family:'Space Grotesk';font-weight:600;font-size:12px;padding:9px;border-radius:8px;cursor:pointer" });
    const SEL = (key,label,options)=>({ isSelect:true, key, label, value:S[key], options, display:'', onInput:(e)=>self.set(key, e.target.value) });

    const sections = [
      { title:'Waves', items:[ R('waveHeight','Wave height',0,2.5,0.01,2), R('choppiness','Choppiness',0,1,0.01,2), R('waveScale','Wavelength',0.3,3,0.01,2), R('windDir','Wind direction',0,360,1,0), R('waveSpeed','Wave speed',0,2.5,0.01,2), R('detail','Micro ripples',0,1.5,0.01,2), R('damping','Touch ripple damping',0.95,0.999,0.001,3) ] },
      { title:'Water & seabed', items:[ C('shallowColor','Shallow tint'), C('deepColor','Deep tint'), R('clarity','Water clarity',0,1,0.01,2), R('shoalDepth','Shoal depth',0.5,12,0.1,1), C('sand','Sand color') ] },
      { title:'Sky & sun', items:[ SEL('skyPreset','Environment', Object.keys(this.SKY_PRESETS)), R('sunAzimuth','Sun azimuth',0,360,1,0), R('sunElevation','Sun elevation',2,88,1,0), R('sunGlare','Sun glare',0,1.5,0.01,2), R('clouds','Cloud cover',0,1,0.01,2), C('zenith','Zenith'), C('horizon','Horizon'), C('sunColor','Sun color') ] },
      { title:'Surface look', items:[ R('foamIntensity','Foam',0,2,0.01,2), R('reflectivity','Reflection',0,1,0.01,2), R('refractionStrength','Refraction',0,0.3,0.005,3), R('sss','Sun scatter',0,2,0.01,2), R('haze','Distance haze',0,2,0.01,2), R('exposure','Exposure',0.4,2.5,0.01,2) ] },
      { title:'Debug', items:[ T('wireframe','Wireframe mesh'), T('debugHeight','Ripple buffer') ] }
    ];

    const presets = this.state.presets.map((name)=>({ name, load:()=>self.loadPreset(name), del:()=>self.deletePreset(name) }));

    return {
      canvasRef: this.canvasRef,
      fps: this.state.fps,
      sections,
      presets,
      hasPresets: presets.length>0,
      noPresets: presets.length===0,
      sculptStyle: this._modeStyle(this.state.mode==='sculpt'),
      cameraStyle: this._modeStyle(this.state.mode==='camera'),
      armStyle: this._modeStyle(this.state.armed),
      setSculpt: ()=>{ self.setState({mode:'sculpt'}); if(self.eng) self.eng.setMode('sculpt'); },
      setCamera: ()=>{ self.setState({mode:'camera'}); if(self.eng) self.eng.setMode('camera'); },
      armToggle: ()=>{ const a=!self.state.armed; self.setState({armed:a}); if(self.eng) self.eng.arm(a); },
      dropNow: ()=>{ if(self.eng) self.eng.dropRandom(); },
      diveToggle: ()=>{ if(self.eng) self.eng.dive(); },
      savePreset: ()=>self.savePreset(),
      resetDefaults: ()=>self.resetDefaults(),
      randomize: ()=>self.randomize(),
      openExport: ()=>self.openExport(),
      closeExport: ()=>self.closeExport(),
      stop: (e)=>{ e.stopPropagation(); },
      showExport: this.state.showExport,
      exportText: this._exportText(),
      tabHtml: ()=>self.setState({exportTab:'html'}),
      tabJson: ()=>self.setState({exportTab:'json'}),
      tabGlsl: ()=>self.setState({exportTab:'glsl'}),
      tabHtmlStyle: this._tabStyle(this.state.exportTab==='html'),
      tabJsonStyle: this._tabStyle(this.state.exportTab==='json'),
      tabGlslStyle: this._tabStyle(this.state.exportTab==='glsl'),
      copyExport: ()=>self.copyExport(),
      downloadExport: ()=>self.downloadExport(),
      copyLabel: this.state.copied ? 'Copied ✓' : 'Copy to clipboard'
    };
  }
}
