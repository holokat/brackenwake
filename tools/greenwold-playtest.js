import {studioSnapshot,studioCommand} from './studio-playtest.js';
// The real boot, character creation and frame. Storage is replaced before the
// application imports, so this page cannot read or modify the user's saves.
const frameRequest=window.requestAnimationFrame.bind(window);
let paused=false;const heldFrames=new Set(),backgroundFrames=new Set();
// Review only: keep the same application frame callback ticking at 20 Hz in
// a hidden tab, without taking focus from the user's current Brave tab. A
// worker clock avoids the page timer's one-minute background throttle.
const clockUrl=URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),50)'],{type:'text/javascript'}));
const reviewClock=new Worker(clockUrl);URL.revokeObjectURL(clockUrl);
reviewClock.onmessage=()=>{if(document.hidden)for(const run of [...backgroundFrames])run(performance.now());};
window.addEventListener('pagehide',()=>reviewClock.terminate());
window.requestAnimationFrame=cb=>{
 if(paused){heldFrames.add(cb);return -1;}
 let called=false;
 const run=t=>{if(called)return;called=true;backgroundFrames.delete(run);cb(t);};
 backgroundFrames.add(run);return frameRequest(run);
};
const pause=()=>{paused=true;};
const resume=()=>{paused=false;for(const cb of heldFrames)window.requestAnimationFrame(cb);heldFrames.clear();};
const memory=new Map();
const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});
Object.defineProperty(window,'sessionStorage',{value:storage});
// Exercise the real builder save path without writing review edits to the project.
const nativeFetch=window.fetch.bind(window),editorWrites=[];
window.fetch=(url,options)=>{
 if(String(url)==='/__editor/save'&&options?.method==='POST'){
  const body=JSON.parse(options.body);editorWrites.push(body);
  return Promise.resolve(new Response(JSON.stringify({ok:true,path:body.path,bytes:options.body.length}),{headers:{'Content-Type':'application/json'}}));
 }
 return nativeFetch(url,options);
};
window.__editorReviewWrites=editorWrites;
const reviewState=v=>fetch('http://127.0.0.1:5208/state',{method:'POST',body:JSON.stringify(v)}).catch(()=>{});
reviewState({ready:false,stage:'loading'});
const lines=[];
const write=v=>{lines.push(typeof v==='string'?v:JSON.stringify(v));document.querySelector('#report').textContent=lines.join('\n');reviewState({ready:false,lines});};
window.addEventListener('error',e=>write(`Error: ${e.message}`));
window.addEventListener('unhandledrejection',e=>write(`Rejection: ${e.reason?.stack||e.reason}`));
const {SPACES}=await import('/src/mmo/spaces/index.js');
const {structures}=await import('/src/game/editor/palette.js');
const locations=['hearthhome','hedge_3','longmeadow','millrun','beechhangar','chalkpits','chalk_rim','sunkenchapel','highwaymanshollow','kingsroad_camp','oldcellars','watermeadows','coldwake',...Object.keys(SPACES).filter(id=>id.startsWith('greenwold_habitat_')).map(id=>id.slice(10))];
const select=document.querySelector('#place');
for(const id of locations){const s=SPACES[`greenwold_${id}`];if(s)select.add(new Option(s.name,id));}
await import('/src/game/main.js');reviewState({ready:false,stage:'main imported'});
const wait=fn=>new Promise(resolve=>{const check=()=>fn()?resolve():requestAnimationFrame(check);check();});
await wait(()=>window.__bw?.creating);
await wait(()=>window.__bw.sc && document.querySelector('input[placeholder="a name"]'));
const name=document.querySelector('input[placeholder="a name"]');name.value='Greenwold Tester';name.dispatchEvent(new Event('input',{bubbles:true}));
reviewState({ready:false,stage:'creation',name:name.value});
const create=[...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent));
if(!create)throw Error('The real creation button was not found');create.click();
await wait(()=>window.__bw?.player);
const b=window.__bw;
const weatherProbes={},livingProbes={};
// Compare the same live scene with precipitation visible and hidden. Reading
// a small render target measures actual shader output, not just draw counts.
function probeWeather(){
 const renderer=b.sc.renderer,T=b.THREE,target=new T.WebGLRenderTarget(640,308),before=new Uint8Array(640*308*4),after=new Uint8Array(before.length),previous=renderer.getRenderTarget();
 const particles=[b.weather.particles.rain,b.weather.particles.flakes],visible=particles.map(p=>p.visible);
 try{
  renderer.setRenderTarget(target);renderer.render(b.sc.scene,b.sc.camera);renderer.readRenderTargetPixels(target,0,0,640,308,before);
  particles.forEach(p=>p.visible=false);renderer.render(b.sc.scene,b.sc.camera);renderer.readRenderTargetPixels(target,0,0,640,308,after);
  let changed=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>6)changed++;
  return {changedPixels:changed,totalPixels:640*308,rain:visible[0],flakes:visible[1]};
 }finally{particles.forEach((p,i)=>p.visible=visible[i]);renderer.setRenderTarget(previous);target.dispose();}
}
function probeLiving(){
 const renderer=b.sc.renderer,T=b.THREE,target=new T.WebGLRenderTarget(640,308),a=new Uint8Array(640*308*4),z=new Uint8Array(a.length),previous=renderer.getRenderTarget(),visible=b.living.root.visible;
 try{renderer.setRenderTarget(target);renderer.render(b.sc.scene,b.sc.camera);renderer.readRenderTargetPixels(target,0,0,640,308,a);b.living.root.visible=false;renderer.render(b.sc.scene,b.sc.camera);renderer.readRenderTargetPixels(target,0,0,640,308,z);let changedPixels=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-z[i])+Math.abs(a[i+1]-z[i+1])+Math.abs(a[i+2]-z[i+2])>6)changedPixels++;return{changedPixels,totalPixels:640*308,...b.living.stats};}
 finally{b.living.root.visible=visible;renderer.setRenderTarget(previous);target.dispose();}
}
const weatherSelect=document.createElement('select');weatherSelect.setAttribute('aria-label','Weather preview');
for(const mode of ['auto','clear','overcast','rain','snow','mist','dust'])weatherSelect.add(new Option(mode==='auto'?'Local weather':mode[0].toUpperCase()+mode.slice(1),mode));
weatherSelect.onchange=()=>b.weather.setMode(weatherSelect.value);document.querySelector('#review .row').appendChild(weatherSelect);
await b.runtime.ready;
await wait(()=>b.runtime.field.sculpt);
const {DAY_CYCLE_MS}=await import('/src/game/dayclock.js');
function day(night=false){b.sc.setClockOffset((night?.38:.88)*DAY_CYCLE_MS-b.clock.now);}
day();
function selected(){return SPACES[`greenwold_${select.value}`];}
function view(mode='overview',back=false,range=38){
 const s=selected();if(!s)return;
 b.dev.set(true);b.windows?.closeAll?.();
 const x=s.at.x,z=s.at.z,y=b.runtime.heightAt(x,z);
 const far=mode==='sky'?Math.max(8,Math.min(150,range)):select.value==='chalkpits'?115:select.value==='beechhangar'?85:95;
 const side=back?-1:1;
 b.sc.camera.position.set(x+far*.55*side,y+(mode==='sky'?5:far*.62),z+far*.85*side);
 b.camera.yaw=Math.atan2(x-b.sc.camera.position.x,z-b.sc.camera.position.z);b.camera.pitch=mode==='sky'?.10:.55;
 document.querySelector('#status').textContent=`${s.name}. Review camera; the character's save is in memory.`;
}
function walk(){const s=selected();b.dev.set(false);b.windows?.closeAll?.();const p=s.arrival||{x:6,z:6};b.player.teleport(s.at.x+p.x,s.at.z+p.z,(x,z)=>b.runtime.heightAt(x,z));b.camera.snap(b.player.pos);document.querySelector('#status').textContent=`${s.name}. WASD to move, E to interact, M for the map.`;}
document.querySelector('#view').onclick=view;document.querySelector('#walk').onclick=walk;
let night=false;document.querySelector('#night').onclick=()=>{night=!night;day(night);document.querySelector('#night').textContent=night?'Day':'Night';};
document.querySelector('#details').onclick=()=>document.querySelector('#review').classList.toggle('closed');
document.querySelector('#check').onclick=()=>{
 write({place:select.value,pos:b.player.pos,sculpt:!!b.runtime.field.sculpt,story:b.story.viewNow(),people:b.npcs.list().map(n=>({name:n.personName,at:n.at,x:n.x,z:n.z})),stones:b.stones.length,forage:b.forage.count,monsters:b.monsters.all().map(m=>m.id),render:b.sc.renderer.info.render});
 document.querySelector('#review').classList.remove('closed');
};
window.__greenwoldReview={view,walk,day,write,memory};
view();write('The live __bw runtime is ready. User storage was never opened.');
// This optional loop lets the local review script inspect THIS in-memory game
// while Brave's normal window remains open. It never reads another tab.
const bridge='http://127.0.0.1:5208';
let studioReview=null;
const snapshot=()=>({ready:true,studioReview,studio:studioSnapshot(b),place:select.value,pos:{x:b.player.pos.x,y:b.player.pos.y,z:b.player.pos.z},sculpt:!!b.runtime.field.sculpt,story:b.story.viewNow(),people:b.npcs.list().map(n=>({name:n.personName,at:n.at,x:n.x,z:n.z})),stones:b.stones.length,forage:b.forage.count,monsters:b.monsters.all().map(m=>m.id),chapel:{bodies:b.chapel.bodies.length,hostile:b.chapel.hostile},weatherProbes,livingProbes,living:b.living?.stats,stream:{terrain:b.runtime.world.pending,sites:b.runtime.siteMarkers.meshes().length,pendingSites:b.runtime.siteMarkers.pending},library:structures().filter(s=>s.real).length,weather:{...b.weather.state,...b.weather.particles.stats},day:b.sc.day,phase:b.sky.phase,sunY:b.sky.sunDir.y,fog:{near:b.sc.scene.fog.near,far:b.sc.scene.fog.far},errors:lines.filter(s=>/^(Error|Rejection|Review error):/i.test(s)),shaderErrors:b.sc.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>p.diagnostics),render:b.sc.renderer.info.render});
let bridging=false;
const bridgeTick=async()=>{
  if(bridging)return;bridging=true;
  try{
  const mode=b.weather.state.rain>.5&&b.weather.state.snow<.015?'rain':b.weather.state.snow>.5&&b.weather.state.rain<.015?'snow':null;
  if(mode&&!weatherProbes[mode]){weatherProbes[mode]=probeWeather();write({weatherProbe:mode,...weatherProbes[mode]});}
  await fetch(bridge+'/state',{method:'POST',body:JSON.stringify(snapshot())});
  const command=await(await fetch(bridge+'/command')).json();if(!command)return;
  if(command.place){select.value=command.place;}
  if(command.action==='studio'){studioReview=await studioCommand(b,command);write({studioReview});}
  if(command.action==='pause')pause();if(command.action==='resume')resume();
  if(command.action==='view')view(command.low?'sky':'overview',!!command.back,command.range||38);if(command.action==='walk')walk();if(command.action==='day')day(!!command.night);
  if(command.action==='weather'){weatherSelect.value=command.mode;b.weather.setMode(command.mode);}
  if(command.action==='bell'){
    const s=SPACES.greenwold_sunkenchapel;b.sc.camera.position.set(b.player.pos.x,b.player.pos.y+6,b.player.pos.z+6);b.sc.camera.lookAt(s.at.x,b.runtime.heightAt(s.at.x,s.at.z)+5,s.at.z);b.sc.camera.updateMatrixWorld(true);b.input.pointer.x=0;b.input.pointer.y=0;
    write({bellInteraction:b.interact.enter()});
  }
  if(command.action==='capture'){
    livingProbes[select.value+(b.sc.day<.3?'-night':'-day')]=probeLiving();
    b.sc.renderer.render(b.sc.scene,b.sc.camera);
    const blob=await new Promise(resolve=>b.sc.renderer.domElement.toBlob(resolve,'image/jpeg',.86));
    if(blob)await fetch(bridge+'/capture/'+select.value+(command.name?'-'+command.name:''),{method:'POST',body:blob});
  }
 }catch(error){if(!String(error).includes('Failed to fetch'))write('Review error: '+error.stack);}finally{bridging=false;}
};
let bridgeAt=0;reviewClock.addEventListener('message',()=>{if(performance.now()-bridgeAt>2000){bridgeAt=performance.now();void bridgeTick();}});
