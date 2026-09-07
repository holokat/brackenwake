import * as THREE from 'three';
import {planeVertex,billboardVertex,noiseGLSL,meshPart} from './resources.js';

export function groundSeal(resources,color,{radius=.85,complexity=0}={}){
  const material=resources.shader(color,`uniform float uTime,uOpacity,uDetail;uniform vec3 uColor;varying vec2 vUv;
    float ring(float r,float radius,float width){return exp(-pow(abs(r-radius)/width,2.))+exp(-pow(abs(r-radius)/(width*4.),2.))*.18;}
    void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float inner=ring(r,.74,.009),outer=ring(r,.91,.011),middle=ring(r,.82,.004);float ticks=pow(max(0.,cos(a*24.)),34.)*(1.-smoothstep(.055,.07,abs(r-.85)));float compass=pow(max(0.,cos(a*8.)),48.)*smoothstep(.43,.55,r)*(1.-smoothstep(.77,.82,r));float spokes=pow(max(0.,cos(a*6.+uTime*.07)),90.)*(1.-smoothstep(.02,.65,r));float glow=exp(-r*r*2.6)*.07+exp(-pow(abs(r-.82)*7.,2.))*.05;float alpha=outer+inner*.5+middle*.38+ticks*.45+compass*.65+spokes*.18*uDetail+glow;gl_FragColor=vec4(uColor*2.15,alpha*uOpacity*.8);}`,{uniforms:{uDetail:{value:complexity}}});
  const root=new THREE.Mesh(resources.geometry('seal-plane',()=>new THREE.PlaneGeometry(2,2)),material);root.name='Grounded compass seal';root.rotation.x=-Math.PI/2;root.position.y=.012;root.scale.setScalar(radius);
  return meshPart(root,material);
}

export function symbol(resources,color,{kind='sun',size=.4}={}){
  const styles={cross:0,sun:1,compass:2,diamond:3};
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uTime,uOpacity,uKind;varying vec2 vUv;
    float glowLine(float distance,float width){return exp(-pow(abs(distance)/(width*1.65),2.))+exp(-pow(abs(distance)/(width*4.5),2.))*.23;}
    float line(vec2 p,vec2 a,vec2 b,float width){vec2 ab=b-a;float h=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.);return glowLine(length(p-a-ab*h),width);}
    void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x),alpha=0.;
    if(uKind<.5){alpha=line(p,vec2(0.,-.65),vec2(0.,.66),.035)+line(p,vec2(-.4,.19),vec2(.4,.19),.035);}
    else if(uKind<1.5){alpha=glowLine(r-.44,.018);alpha+=pow(max(0.,cos(a*8.)),45.)*smoothstep(.45,.52,r)*(1.-smoothstep(.82,.9,r));alpha+=line(p,vec2(-.7,0.),vec2(.7,0.),.022)+line(p,vec2(0.,-.84),vec2(0.,.84),.022);}
    else if(uKind<2.5){float diamond=abs(p.x)+abs(p.y);alpha=glowLine(diamond-.52,.018)+glowLine(r-.61,.013);alpha+=line(p,vec2(-.86,0.),vec2(.86,0.),.019)+line(p,vec2(0.,-.86),vec2(0.,.86),.019);}
    else{float diamond=abs(p.x)*1.8+abs(p.y);alpha=glowLine(diamond-.66,.04)+exp(-pow(r/.11,2.));}
    alpha+=exp(-r*r*13.)*.19;gl_FragColor=vec4(mix(uColor,vec3(1.),.2)*2.45,alpha*uOpacity*.83);}`,{vertexShader:billboardVertex,uniforms:{uKind:{value:styles[kind]??1}}});
  const root=new THREE.Mesh(resources.geometry('symbol-plane',()=>new THREE.PlaneGeometry(2,2)),material);root.name=`Holy ${kind} symbol`;root.scale.setScalar(size);
  return meshPart(root,material);
}

export function halo(resources,color,{radius=.65}={}){
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uTime,uOpacity;varying vec2 vUv;void main(){float edge=pow(max(0.,sin(vUv.y*3.14159)),.45);float detail=.6+.4*pow(abs(sin(vUv.x*50.+uTime*.2)),8.);gl_FragColor=vec4(uColor*1.9,edge*detail*uOpacity);}`);
  const root=new THREE.Mesh(resources.geometry('halo-torus',()=>new THREE.TorusGeometry(1,.012,5,96)),material);root.name='Levitating light corona';root.rotation.x=Math.PI/2;root.scale.setScalar(radius);
  return meshPart(root,material);
}

export function pillar(resources,color,{radius=.35,height=3.3}={}){
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uTime,uOpacity;varying vec2 vUv;${noiseGLSL}
    void main(){float cells=11.,cell=floor(vUv.x*cells),seed=hash31(vec3(cell,7.,3.)),u=fract(vUv.x*cells)-.5;float width=.13+seed*.29;float drift=sin(vUv.y*3.7+seed*15.+uTime*.12)*.08;float lane=exp(-pow(abs(u+drift)/width,2.));float core=exp(-pow(abs(u+drift)/(width*.25),2.));float shaftEnd=.58+seed*.42;float foot=smoothstep(0.,.035,vUv.y),top=1.-smoothstep(shaftEnd*.53,shaftEnd,vUv.y);float veil=fbm(vec3(vUv*vec2(5.,1.8),uTime*.24));float alpha=(lane*.22+core*.09+veil*.065)*foot*top;gl_FragColor=vec4(uColor*2.05,alpha*uOpacity);}`);
  const root=new THREE.Mesh(resources.geometry('shaft-cylinder',()=>new THREE.CylinderGeometry(1,1,1,48,1,true)),material);root.name='Soft vertical light shafts';root.scale.set(radius,height,radius);root.position.y=height/2;
  return meshPart(root,material);
}

/** A physical radial ribbon, soft on all four boundaries, coils around Y. */
export function helix(resources,color,{radius=.75,height=2.6,turns=2.2,width=.045,speed=.8,phase=0,taper=.3}={}){
  const segments=112,positions=new Float32Array((segments+1)*6),uvs=new Float32Array((segments+1)*4),indices=[];
  for(let i=0;i<=segments;i++){uvs.set([i/segments,0,i/segments,1],i*4);if(i<segments){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}}
  const geometry=resources.ownGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(indices);
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uTime,uOpacity;varying vec2 vUv;${noiseGLSL}
    void main(){float edge=pow(max(0.,sin(vUv.y*3.14159)),1.1),ends=smoothstep(0.,.06,vUv.x)*(1.-smoothstep(.88,1.,vUv.x));float flow=.5+.5*fbm(vec3(vUv*vec2(18.,2.),uTime*.75));float line=exp(-pow(abs(vUv.y-.5)*15.,2.));gl_FragColor=vec4(mix(uColor,vec3(1.),line*.12)*2.2,edge*ends*(flow*.56+line*.46)*uOpacity);}`);
  const root=new THREE.Mesh(geometry,material);root.name='Flowing helical light ribbon';
  return meshPart(root,material,time=>{for(let i=0;i<=segments;i++){const t=i/segments,a=t*turns*Math.PI*2-time*speed+phase,r=radius*(1-t*taper);for(let j=0;j<2;j++){const row=i*6+j*3,rr=r+(j-.5)*width*.28;positions[row]=Math.cos(a)*rr;positions[row+1]=t*height+(j-.5)*width*.96;positions[row+2]=Math.sin(a)*rr;}}geometry.attributes.position.needsUpdate=true;});
}

export function softDome(resources,color,{radius=1.12}={}){
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uTime,uOpacity;varying vec3 vNormal,vView;varying vec2 vUv;${noiseGLSL}
    void main(){float fresnel=pow(max(0.,1.-abs(dot(normalize(vNormal),normalize(vView)))),2.7);float ribs=pow(max(0.,cos(vUv.x*50.26548)),80.);float base=exp(-pow(abs(vUv.y-.5)*85.,2.));float wave=exp(-pow(abs(vUv.y-(.5+fract(uTime*.14)*.5))*55.,2.));float membrane=.016+fbm(vec3(vUv*7.,uTime*.14))*.015;float alpha=membrane+fresnel*.23+ribs*.115+base*.31+wave*.025;gl_FragColor=vec4(uColor*1.7,alpha*uOpacity);}`,{vertexShader:`varying vec3 vNormal,vView;varying vec2 vUv;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalMatrix*normal;vView=-p.xyz;gl_Position=projectionMatrix*p;}`});
  const root=new THREE.Mesh(resources.geometry('sanctuary-dome',()=>new THREE.SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI/2)),material);root.name='Transparent sanctuary dome and meridian ribs';root.scale.set(radius,2.2,radius);return meshPart(root,material);
}
