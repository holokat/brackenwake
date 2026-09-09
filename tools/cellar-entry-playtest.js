// Runs the real boot and player frame using temporary in-memory storage.
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
const report=document.querySelector('#report'),status=document.querySelector('#status'),lines=[];
const write=v=>{lines.push(typeof v==='string'?v:JSON.stringify(v));report.textContent=lines.join('\n');};
window.addEventListener('error',e=>write('Error: '+e.message));window.addEventListener('unhandledrejection',e=>write('Rejection: '+e.reason));
const wait=fn=>new Promise(resolve=>{const check=()=>fn()?resolve():requestAnimationFrame(check);check();});
await import('/src/game/main.js');
await wait(()=>window.__bw?.creating);
const name=document.querySelector('input[placeholder="a name"]');name.value='Cellar playtest';name.dispatchEvent(new Event('input',{bubbles:true}));
const button=[...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent));if(!button)throw Error('Creation action unavailable');button.click();
await wait(()=>window.__bw?.player);
const b=window.__bw;await b.runtime.ready;
const site={id:'s:island_cellars',sub:'oldcellars',kind:'dungeon',x:0,z:0,cx:0,cz:0,name:'The Old Cellars'};
b.runtime.enterDungeon(site);
await b.runtime.dungeonScene.ready;
function place(x,z,yaw=Math.PI){b.player.teleport(x,z,(x,z)=>b.runtime.heightAt(x,z));b.camera.yaw=yaw;b.camera.pitch=.28;b.camera.snap(b.player.pos);status.textContent='Old Cellars. WASD to move, E at the returning stair. Temporary playtest character.';}
place(1,175);
// Survival assistance applies only to this isolated review character.
setInterval(()=>{if(b.actor.health>0)b.actor.health=b.actor.maxHealth;},100);
const floor=document.querySelector('#floor');
floor.onchange=async()=>{b.runtime.leaveDungeon();b.runtime.enterDungeon(site,Number(floor.value));status.textContent='Loading floor '+floor.value;const loaded=await b.runtime.dungeonScene.ready;status.textContent='Floor '+floor.value+'. Room artwork '+(loaded?'loaded.':'failed to load.');write({floor:Number(floor.value),loaded});};
document.querySelector('#arrival').onclick=()=>place(1,175);
document.querySelector('#nave').onclick=()=>place(1,120);
document.querySelector('#boss').onclick=()=>{place(5,b.runtime.dungeonLevel===8?10:-137);write({bosses:b.monsters.all().filter(m=>/Morva|Sexton|Cinder|Ilex|Voss|Aster|Oram|Vharos/i.test(m.name||m.actor.name||'')).map(m=>({name:m.name||m.actor.name,pos:m.actor.pos,loaded:!!m.model?.loaded}))});};
document.querySelector('#down').onclick=async()=>{const before=b.runtime.dungeonLevel,stair=b.runtime.dungeonScene.stairPos;if(!stair)return;place(stair.x,stair.z);b.runtime.dungeonGo('down');const loaded=await b.runtime.dungeonScene.ready;floor.value=b.runtime.dungeonLevel;write({descendingStair:{before,after:b.runtime.dungeonLevel,loaded}});status.textContent='Descended to floor '+floor.value;};
document.querySelector('#up').onclick=async()=>{const before=b.runtime.dungeonLevel;b.runtime.dungeonGo('up');if(b.runtime.dungeonScene)await b.runtime.dungeonScene.ready;floor.value=b.runtime.dungeonLevel;write({returningStair:{before,after:b.runtime.dungeonLevel}});status.textContent='Returned to floor '+b.runtime.dungeonLevel;};
document.querySelector('#metrics').onclick=async()=>{const start=performance.now();let frames=0;while(performance.now()-start<5000){await new Promise(requestAnimationFrame);frames++;}write({floor:b.runtime.dungeonLevel,fps:Math.round(frames*1000/(performance.now()-start)),render:b.sc.renderer.info.render,memory:b.sc.renderer.info.memory,webglError:b.sc.renderer.getContext().getError(),forageVisible:b.forage.group.visible});document.querySelector('#review').classList.remove('closed');};
document.querySelector('#details').onclick=()=>document.querySelector('#review').classList.toggle('closed');
document.querySelector('#walk').onclick=async()=>{
 place(1,175);document.querySelector('#walk').disabled=true;
 const start={...b.player.pos},deadline=performance.now()+30000;let prior=performance.now();const samples=[];
 b.input.keys.add('w');
 while(performance.now()<deadline&&b.player.pos.z>121){await new Promise(requestAnimationFrame);if(performance.now()-prior>250){samples.push({...b.player.pos});prior=performance.now();}}
 b.input.keys.delete('w');document.querySelector('#walk').disabled=false;
 const passed=b.player.pos.z<=121;
 write({corridor:passed?'passed':'blocked',from:start,to:{...b.player.pos},samples:samples.length,entryLoaded:b.runtime.dungeonScene.entry.loaded,forageVisible:b.forage.group.visible,webglError:b.sc.renderer.getContext().getError()});
 status.textContent=passed?'Walked through the open corridor into the nave.':'The player did not reach the nave. See Details.';
};
write({roomAssetLoaded:b.runtime.dungeonScene.entry.loaded,blenderTriangles:b.runtime.dungeonScene.entry.group.children.filter(o=>o.isGroup).length,userStorage:'Never opened',floor:b.runtime.dungeonLevel});
