// The real boot, character creation and frame. Storage is replaced before the
// application imports, so this page cannot read or modify the user's saves.
const frameRequest=window.requestAnimationFrame.bind(window);
let paused=false;const heldFrames=new Set();
window.requestAnimationFrame=cb=>paused?(heldFrames.add(cb),-1):frameRequest(cb);
const pause=()=>{paused=true;};
const resume=()=>{paused=false;for(const cb of heldFrames)frameRequest(cb);heldFrames.clear();};
const memory=new Map();
const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});
Object.defineProperty(window,'sessionStorage',{value:storage});
const reviewState=v=>fetch('http://127.0.0.1:5208/state',{method:'POST',body:JSON.stringify(v)}).catch(()=>{});
reviewState({ready:false,stage:'loading'});
const lines=[];
const write=v=>{lines.push(typeof v==='string'?v:JSON.stringify(v));document.querySelector('#report').textContent=lines.join('\n');reviewState({ready:false,lines});};
window.addEventListener('error',e=>write(`Error: ${e.message}`));
window.addEventListener('unhandledrejection',e=>write(`Rejection: ${e.reason?.stack||e.reason}`));
const {SPACES}=await import('/src/mmo/spaces/index.js');
const locations=['hearthhome','hedge_3','longmeadow','millrun','beechhangar','chalkpits','chalk_rim','sunkenchapel','highwaymanshollow','kingsroad_camp','oldcellars','watermeadows','coldwake'];
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
await wait(()=>b.runtime.field.sculpt);
const {DAY_CYCLE_MS}=await import('/src/game/dayclock.js');
function day(night=false){b.sc.setClockOffset((night?.38:.88)*DAY_CYCLE_MS-b.now);}
day();
function selected(){return SPACES[`greenwold_${select.value}`];}
function view(){
 const s=selected();if(!s)return;
 b.dev.set(true);b.windows?.closeAll?.();
 const x=s.at.x,z=s.at.z,y=b.runtime.heightAt(x,z);
 const far=select.value==='chalkpits'?115:select.value==='beechhangar'?85:95;
 b.sc.camera.position.set(x+far*.55,y+far*.62,z+far*.85);
 b.camera.yaw=Math.atan2(x-b.sc.camera.position.x,z-b.sc.camera.position.z);b.camera.pitch=.55;
 b.sc.setFog(160,1200);document.querySelector('#status').textContent=`${s.name}. Review camera; the character's save is in memory.`;
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
const snapshot=()=>({ready:true,place:select.value,pos:{x:b.player.pos.x,y:b.player.pos.y,z:b.player.pos.z},sculpt:!!b.runtime.field.sculpt,story:b.story.viewNow(),people:b.npcs.list().map(n=>({name:n.personName,at:n.at,x:n.x,z:n.z})),stones:b.stones.length,forage:b.forage.count,monsters:b.monsters.all().map(m=>m.id),errors:lines.filter(s=>/Error|Rejection/.test(s)),render:b.sc.renderer.info.render});
let bridging=false;
setInterval(async()=>{
 if(bridging)return;bridging=true;
 try{
  await fetch(bridge+'/state',{method:'POST',body:JSON.stringify(snapshot())});
  const command=await(await fetch(bridge+'/command')).json();if(!command)return;
  if(command.place){select.value=command.place;}
  if(command.action==='pause')pause();if(command.action==='resume')resume();
  if(command.action==='view')view();if(command.action==='walk')walk();if(command.action==='day')day(!!command.night);
  if(command.action==='capture'){
    b.sc.renderer.render(b.sc.scene,b.sc.camera);
    const blob=await new Promise(resolve=>b.sc.renderer.domElement.toBlob(resolve,'image/png'));
    if(blob)await fetch(bridge+'/capture/'+select.value,{method:'POST',body:blob});
  }
 }catch{}finally{bridging=false;}
},2000);
