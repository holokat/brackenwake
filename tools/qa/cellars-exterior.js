// Temporary storage is installed before the real game imports. No player save is read.
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
const lines=[],errors=[],write=v=>{lines.push(JSON.stringify(v));document.querySelector('#report').textContent=lines.join('\n');};
const status=document.querySelector('#status');
addEventListener('error',e=>{errors.push(e.message);write({error:e.message});});
addEventListener('unhandledrejection',e=>{errors.push(String(e.reason));write({rejection:String(e.reason)});});
const frame=()=>new Promise(requestAnimationFrame);
async function wait(fn){const deadline=performance.now()+120000;while(!fn()){if(performance.now()>deadline)throw Error('Playtest timed out');await frame();}}
await import('/src/game/main.js');await wait(()=>window.__bw?.creating);
const name=document.querySelector('input[placeholder="a name"]');name.value='Cellars exterior review';name.dispatchEvent(new Event('input',{bubbles:true}));
[...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();
await wait(()=>window.__bw?.player);const b=window.__bw;await b.runtime.ready;
b.actor.godMode=true;b.windows.closeAll();
const {DAY_CYCLE_MS}=await import('/src/game/dayclock.js');b.sc.setClockOffset(.88*DAY_CYCLE_MS-b.clock.now);b.weather.setMode('clear');
const yaw=200*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw),origin={x:120,z:-110};
const world=(x,z)=>({x:origin.x+x*c+z*s,z:origin.z+z*c-x*s});
function approach(side=false){
 if(b.runtime.inDungeon)b.interact.leave();
 const p=world(side?5:0,side?8:7);b.player.teleport(p.x,p.z,(x,z)=>b.runtime.heightAt(x,z));
 b.camera.yaw=yaw+Math.PI+(side?.42:0);b.camera.pitch=.25;b.camera.snap(b.player.pos);
 status.textContent='WASD to move. Point at the entrance and press E. Temporary character is protected from damage.';
}
function snapshot(){const meshes=[];b.sc.scene.traverse(o=>{if(o.isMesh&&o.userData.plan?.piece==='old_cellars_entrance')meshes.push(o);});
 return{three:b.THREE.REVISION,world:b.runtime.field.sculpt?.world,position:{...b.player.pos},inDungeon:b.runtime.inDungeon,
  exteriorMeshes:meshes.length,triangles:meshes.reduce((n,o)=>n+(o.geometry.index?.count||o.geometry.attributes.position.count)/3,0),
  failedShaders:b.sc.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,errors:[...errors],streaming:b.runtime.dungeonScene?.streaming?.stats||null};
}
function aim(point){const p=new b.THREE.Vector3(point.x,point.y,point.z).project(b.sc.camera);b.input.pointer.x=p.x;b.input.pointer.y=p.y;}
document.querySelector('#front').onclick=()=>approach();document.querySelector('#side').onclick=()=>approach(true);
document.querySelector('#enter').onclick=async()=>{try{
 approach();await frame();await frame();
 const target=world(1.78,0);aim({...target,y:b.runtime.heightAt(origin.x,origin.z)+1.4});
 const result=b.interact.enter();if(result.action!=='enter')throw Error('Real entrance interaction returned '+result.action);
 const loaded=await b.runtime.dungeonScene.ready;if(!loaded)throw Error('Dungeon artwork did not load');
 status.textContent='Dungeon entry passed through the real interaction. The room artwork is ready.';write({entry:result.action,...snapshot()});
 }catch(e){errors.push(e.message);write({error:e.message});status.textContent=e.message;}};
document.querySelector('#return').onclick=async()=>{const left=b.interact.leave();await frame();await frame();
 const distance=Math.hypot(b.player.pos.x-origin.x,b.player.pos.z-origin.z);write({returned:left,distanceFromDoor:distance,...snapshot()});
 if(!left||distance>1)throw Error('Return did not reach the exterior doorway');status.textContent='Returned to the doorway. Walk forward to leave the entrance.';
};
document.querySelector('#achievement').onclick=()=>{b.audio.unlock();b.actor.godMode=false;b.achievements.record({type:'camp'});b.actor.godMode=true;write({banner:b.hud.unlockState});};
document.querySelector('#snapshot').onclick=()=>write(snapshot());document.querySelector('#hide').onclick=()=>{document.querySelector('#qa').style.display='none';};
approach();await wait(()=>snapshot().exteriorMeshes===2);write(snapshot());
window.__cellarsExteriorReview={snapshot,approach,memory};
