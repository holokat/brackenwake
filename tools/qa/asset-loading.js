// Uses the production boot, controller, loaders and renderer. Existing saves are never read.
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
const report=document.querySelector('#report'),status=document.querySelector('#status'),lines=[];
const write=value=>{lines.push(typeof value==='string'?value:JSON.stringify(value));report.textContent=lines.join('\n');report.scrollTop=report.scrollHeight;};
const frames=[],longTasks=[];let last=performance.now(),recording=false;
const observer=new PerformanceObserver(list=>{if(recording)for(const e of list.getEntries())longTasks.push(e.duration);});
if(PerformanceObserver.supportedEntryTypes.includes('longtask'))observer.observe({type:'longtask',buffered:false});
function sample(now){if(recording&&document.visibilityState==='visible')frames.push(now-last);last=now;requestAnimationFrame(sample);}requestAnimationFrame(sample);
window.addEventListener('error',e=>write(`Error: ${e.message}`));window.addEventListener('unhandledrejection',e=>write(`Rejection: ${e.reason}`));
const wait=(fn,ms=120000)=>new Promise((resolve,reject)=>{const until=performance.now()+ms;const tick=()=>fn()?resolve():performance.now()>until?reject(Error('Review timed out')):requestAnimationFrame(tick);tick();});
await import('/src/game/main.js');await wait(()=>window.__bw?.creating);
const name=document.querySelector('input[placeholder="a name"]');name.value='Loading review';name.dispatchEvent(new Event('input',{bubbles:true}));
[...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();
await wait(()=>window.__bw?.player);const b=window.__bw;await b.runtime.ready;
const start=performance.now();recording=true;
b.runtime.enterDungeon({id:'s:island_cellars',sub:'oldcellars',kind:'dungeon',x:120,z:-110,cx:0,cz:0,name:'The Old Cellars'});
let ready=await b.runtime.dungeonScene.ready;
setInterval(()=>{if(b.actor.health>0)b.actor.health=b.actor.maxHealth;},250);
function snapshot(label){
 const sorted=frames.slice().sort((a,b)=>a-b),resources=performance.getEntriesByType('resource').filter(r=>r.startTime>=start&&/\.glb(?:[?#]|$)/.test(r.name));
 write({label,ready,elapsedMs:Math.round(performance.now()-start),position:{...b.player.pos},floor:b.runtime.dungeonLevel,
  frameP95Ms:sorted[Math.floor(sorted.length*.95)]||0,worstFrameMs:sorted.at(-1)||0,longTasks:longTasks.length,worstLongTaskMs:Math.max(0,...longTasks),
  loading:b.assetLoading,preload:b.runtime.dungeonPreload,streaming:b.runtime.dungeonScene?.streaming?.stats,glbs:resources.map(r=>({name:r.name.split('/').at(-1),bytes:r.encodedBodySize,ms:Math.round(r.duration)})),
  renderer:b.sc.renderer.info.render,memory:b.sc.renderer.info.memory,webglError:b.sc.renderer.getContext().getError()});
}
snapshot('Arrival ready');status.textContent=ready?'Nearby artwork is ready. The rest streams as you explore.':'Nearby artwork failed to load. The structural shell remains visible.';
function controls(busy=false){for(const button of document.querySelectorAll('#review button'))button.disabled=button.id!=='snapshot'&&(busy||!b.runtime.dungeonScene||(button.id==='stairs'&&!b.runtime.dungeonScene.stairPos));}
async function action(run){controls(true);try{await run();}catch(error){write(error.message);status.textContent=error.message;}finally{controls();}}
controls();
function place(x,z,yaw=Math.PI){b.player.teleport(x,z,(x,z)=>b.runtime.heightAt(x,z));b.camera.yaw=yaw;b.camera.pitch=.28;b.camera.snap(b.player.pos);}
async function walk(targetZ,yaw,label){
 b.camera.yaw=yaw;b.camera.snap(b.player.pos);b.input.keys.add('w');
 try{await wait(()=>yaw===Math.PI?b.player.pos.z<=targetZ:b.player.pos.z>=targetZ,35000);snapshot(label);}finally{b.input.keys.delete('w');}
}
document.querySelector('#walk').onclick=()=>action(()=>walk(110,Math.PI,'Nave reached'));
document.querySelector('#back').onclick=()=>action(()=>walk(170,0,'Backtracking complete'));
document.querySelector('#snapshot').onclick=()=>snapshot('Manual capture');
document.querySelector('#stairs').onclick=()=>action(async()=>{
 const at=b.runtime.dungeonScene.stairPos;place(at.x,at.z+25);await new Promise(resolve=>setTimeout(resolve,5000));snapshot('Near stairs, before transition');
 b.runtime.dungeonGo('down');ready=await b.runtime.dungeonScene.ready;snapshot('Next floor arrival');status.textContent=ready?'Nearby artwork is ready on the next floor.':'Nearby artwork failed to load. The structural shell remains visible.';
});
document.querySelector('#exit').onclick=()=>action(()=>{b.input.keys.delete('w');b.runtime.leaveDungeon();ready=null;status.textContent='Returned to the surface.';snapshot('Dungeon disposed');});
// Direct stair views use normal level transitions and a temporary character.
const params=new URLSearchParams(location.search);
if(params.has('stair'))await action(async()=>{
 b.actor.godMode=true;b.windows.closeAll();
 const floor=Math.max(1,Math.min(8,Math.floor(Number(params.get('level'))||1)));
 while(b.runtime.dungeonLevel<floor){b.runtime.dungeonGo('down');ready=await b.runtime.dungeonScene.ready;}
 const dir=params.get('stair')==='up'||!b.runtime.dungeonScene.stairPos?'up':'down';
 const at=dir==='up'?b.runtime.dungeonScene.entrancePos:b.runtime.dungeonScene.stairPos;
 place(at.x,at.z+(dir==='up'?-6:6),dir==='up'?0:Math.PI);b.camera.pitch=.5;b.camera.snap(b.player.pos);
 status.textContent=`Loading level ${floor}. The stair remains visible while artwork arrives.`;
 if(dir==='down')await wait(()=>b.runtime.dungeonScene.descent.rooms.find(r=>r.room.roomId===9)?.loaded);
 else if(floor>=2&&floor<=7)await wait(()=>b.runtime.dungeonScene.descent.rooms.find(r=>r.room.roomId===0)?.loaded);
 status.textContent=`Level ${floor}, stairs ${dir}. Click the steps to travel; this review uses a temporary character.`;
 snapshot(`Level ${floor} stair ${dir} ready`);
});
