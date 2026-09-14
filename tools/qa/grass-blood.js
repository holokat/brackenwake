// Production-only visual evidence. This page replaces browser storage before
// boot, so its character, monster and effects cannot touch a player save.
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
const status=document.querySelector('#status'),errors=[];
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const report=async value=>{status.textContent=value.stage;document.title=`Grass + blood: ${value.stage}`;await fetch('http://127.0.0.1:5318/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}).catch(()=>{});};
const wait=async fn=>{const end=performance.now()+150000;while(!fn()){if(performance.now()>end)throw Error('Grass and blood review timed out');await new Promise(r=>setTimeout(r,50));}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await report({stage:'loading'});await import('/src/game/main.js');await wait(()=>document.querySelector('[data-opening="mage"]'));
 document.querySelector('[data-opening="mage"]').click();const name=document.querySelector('input[placeholder="a name"]');name.value='Grass blood review';name.dispatchEvent(new Event('input',{bubbles:true}));
 [...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();await wait(()=>window.__bw?.player);
 const b=window.__bw;b.actor.godMode=true;b.windows.closeAll();b.dev.set(true);
 const view=(eye,target)=>{b.player.teleport(target[0],target[2],(x,z)=>b.runtime.heightAt(x,z));b.sc.camera.position.set(...eye);b.camera.yaw=Math.atan2(target[0]-eye[0],target[2]-eye[2]);b.camera.pitch=Math.atan2(eye[1]-target[1],Math.hypot(target[0]-eye[0],target[2]-eye[2]));b.camera.flyUpdate(0,(x,z)=>b.runtime.heightAt(x,z));};
 const snapshot=()=>{const grass=[];b.sc.scene.traverse(o=>{if(o.name?.startsWith('grass:'))grass.push({name:o.name,instances:o.count});});return {draws:b.sc.renderer.info.render.calls,triangles:b.sc.renderer.info.render.triangles,grass,shaderErrors:b.sc.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,errors};};
 const capture=async(id)=>{b.sc.render();await fetch(`http://127.0.0.1:5318/image/${id}.png`,{method:'POST',body:b.sc.renderer.domElement.toDataURL('image/png').split(',')[1]});};
 const frameTiming=async(frames=90)=>{const marks=[];let previous=performance.now();for(let i=0;i<frames;i++)await new Promise(requestAnimationFrame).then(()=>{const now=performance.now();marks.push(now-previous);previous=now;});marks.sort((a,b)=>a-b);const at=q=>marks[Math.min(marks.length-1,Math.floor((marks.length-1)*q))];return {frames,medianMs:Number(at(.5).toFixed(2)),p95Ms:Number(at(.95).toFixed(2)),maxMs:Number(at(1).toFixed(2))};};
 const ground=(x,z)=>b.runtime.heightAt(x,z);
 // The low view makes the grass cards answer the question the far overview cannot.
 view([31,ground(31,368)+2.0,368],[35,ground(35,379),379]);await delay(900);await capture('grass-final-close');await report({stage:'grass-final-close',...snapshot(),frameTiming:await frameTiming()});
 view([24,ground(24,362)+5.5,362],[35,ground(35,379),379]);await delay(900);await capture('grass-final-medium');await report({stage:'grass-final-medium',...snapshot()});
 const target=b.monsters.spawnAt('wolf',35,379);if(!target)throw Error('Could not spawn the review target');
 await wait(()=>target.actor&&target.actor.health>0);view([31.5,ground(31.5,375)+3.8,375],[35,ground(35,379)+0.35,379]);
 // Queue the resolver's physical spell, then advance the real frame loop. The
 // blood listener receives `onResolved`, not a hand-authored visual event.
 b.combat.queueSpell(b.actor,{base:[10,10],damageType:'physical'},target.actor,{now:b.now,travel:0});
 for(let i=0;i<8&&b.blood.stats.hits===0;i++)b.step(100);
 await wait(()=>b.blood.stats.hits===1);b.step(180);await capture('blood-final-impact');
 await report({stage:'blood-final-impact',...snapshot(),blood:{...b.blood.stats,particles:b.blood.particleCount,splats:b.blood.splatCount,targetHealth:target.actor.health}});
 b.monsters.despawn(target.key);await report({stage:'ready',...snapshot()});
}catch(error){await report({stage:'failed',error:String(error),errors});}
