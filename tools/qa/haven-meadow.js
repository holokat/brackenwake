// The production renderer and world, with a memory-only review character.
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
const errors=[],status=document.querySelector('#status');
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const report=async value=>{status.textContent=value.stage;document.title=`Meadow: ${value.stage}`;await fetch('http://127.0.0.1:5318/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}).catch(()=>{});};
const wait=async fn=>{const end=performance.now()+150000;while(!fn()){if(performance.now()>end)throw Error('Meadow review timed out');await new Promise(r=>setTimeout(r,50));}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const testWalk=new URLSearchParams(location.search).has('walktest');
const autoCapture=new URLSearchParams(location.search).has('capturetest');
try{
 await report({stage:'loading'});await import('/src/game/main.js');await wait(()=>document.querySelector('[data-opening="mage"]'));
 await report({stage:'creating'});
 document.querySelector('[data-opening="mage"]').click();
 const name=document.querySelector('input[placeholder="a name"]');name.value='Meadow review';name.dispatchEvent(new Event('input',{bubbles:true}));
 [...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();await report({stage:'entering'});await wait(()=>window.__bw?.player);
 const b=window.__bw;b.actor.godMode=true;b.windows.closeAll();await b.runtime.ready;
 const{DAY_CYCLE_MS}=await import('/src/game/dayclock.js');b.sc.setClockOffset(.13*DAY_CYCLE_MS-b.clock.now);b.weather.setMode('clear');
 const views={overview:[[-91,104,371],[34,4,379]],mill:[[57,14,395],[77,10,378]],picnic:[[-43,12,403],[-25,6.6,386]],shore:[[-10,10,417],[10,4,434]]};
 function view(id){const[eye,target]=views[id];b.dev.set(true);b.windows.closeAll();b.player.teleport(target[0],target[2],(x,z)=>b.runtime.heightAt(x,z));b.sc.camera.position.set(...eye);b.camera.yaw=Math.atan2(target[0]-eye[0],target[2]-eye[2]);b.camera.pitch=Math.atan2(eye[1]-target[1],Math.hypot(target[0]-eye[0],target[2]-eye[2]));b.camera.flyUpdate(0,(x,z)=>b.runtime.heightAt(x,z));}
 const snapshot=()=>{const meshes=[];b.sc.scene.traverse(o=>{if(o.isMesh&&o.userData.plan?.id==='island_kite_meadow')meshes.push(o);});return{world:b.runtime.field.sculpt?.world,meadowMeshes:meshes.length,triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3*(m.isInstancedMesh?m.count:1),0),draws:b.sc.renderer.info.render.calls,frameTriangles:b.sc.renderer.info.render.triangles,shaderErrors:b.sc.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,errors};};
 async function capture(id){document.body.classList.add('capture');b.sc.render();const image=b.sc.renderer.domElement.toDataURL('image/png').split(',')[1];document.body.classList.remove('capture');await fetch(`http://127.0.0.1:5318/image/meadow-${id}.png`,{method:'POST',body:image});await report({stage:`captured-${id}`,...snapshot()});}
 for(const id of Object.keys(views))document.getElementById(id).onclick=()=>view(id);
 document.querySelector('#walk').onclick=()=>{b.dev.set(false);b.player.teleport(2,342,(x,z)=>b.runtime.heightAt(x,z));b.camera.yaw=.45;b.camera.pitch=.25;b.camera.distance=10;b.camera.snap(b.player.pos);};
 document.querySelector('#capture').onclick=()=>capture('manual');
 view('overview');await wait(()=>snapshot().meadowMeshes>=14);await delay(autoCapture?20000:2500);
 if(autoCapture)for(const id of['overview','mill','picnic','shore']){view(id);await delay(1600);await capture(id);}
 if(testWalk){
  const{walkMeadow}=await import('./meadow-walk.js');
  const routes=await fetch('/assets/models/haven-meadow/routes.json').then(r=>r.json());
  await report({stage:'walking'});await report(await walkMeadow(b,routes.paths[0]));
 }
 view('overview');await report({stage:'ready',...snapshot()});window.__meadowReview={b,view,capture,snapshot};
}catch(error){await report({stage:'failed',error:String(error),errors});}
