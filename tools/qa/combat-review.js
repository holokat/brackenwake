// This review uses a temporary character and the production boot and combat modules.
const memory=new Map(), storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
const report=async value=>{document.title=`Combat QA: ${value.stage}`;await fetch('http://127.0.0.1:5318/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});};
// Background tabs suspend requestAnimationFrame. A worker clock lets this
// functional review finish without taking focus from the user's browser.
// Do not use this clock for FPS or performance measurements.
const callbacks=new Map(),shortTimers=new Map();let frameId=0,timerId=1000000000;
const nativeFrame=requestAnimationFrame,nativeCancel=cancelAnimationFrame,nativeTimeout=setTimeout,nativeClear=clearTimeout;
const worker=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),16)'],{type:'text/javascript'})));
worker.onmessage=()=>{const timers=[...shortTimers.values()];shortTimers.clear();for(const job of timers)job();const jobs=[...callbacks.values()];callbacks.clear();for(const job of jobs)job(performance.now());};
window.setTimeout=(fn,ms,...args)=>{if(ms>0||typeof fn!=='function')return nativeTimeout(fn,ms,...args);shortTimers.set(++timerId,()=>fn(...args));return timerId;};
window.clearTimeout=id=>{if(!shortTimers.delete(id))nativeClear(id);};
const restoreClock=()=>{worker.terminate();window.requestAnimationFrame=nativeFrame;window.cancelAnimationFrame=nativeCancel;window.setTimeout=nativeTimeout;window.clearTimeout=nativeClear;for(const job of shortTimers.values())nativeTimeout(job,0);for(const job of callbacks.values())nativeFrame(job);};
window.requestAnimationFrame=fn=>{callbacks.set(++frameId,fn);return frameId;};
window.cancelAnimationFrame=id=>callbacks.delete(id);
await report({stage:'starting'});
const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const wait=async fn=>{const end=performance.now()+150000;while(!fn()){if(performance.now()>end)throw Error('Combat review timed out');await new Promise(r=>setTimeout(r,50));}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const image=async(name,b)=>{b.sc.render();const png=b.sc.renderer.domElement.toDataURL('image/png').split(',')[1];await fetch(`http://127.0.0.1:5318/image/${name}.png`,{method:'POST',body:png});};
try{
 await import('/src/game/main.js');await wait(()=>window.__bw?.creating);
 document.querySelector('[data-opening="mage"]').click();
 const input=document.querySelector('input[placeholder="a name"]');input.value='Combat review';input.dispatchEvent(new Event('input',{bubbles:true}));
 [...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();await wait(()=>window.__bw?.player);
 const b=window.__bw;b.actor.godMode=true;b.windows.closeAll();
 const {makeItem}=await import('/src/mmo/items.js');
 b.inventory.add(makeItem({base:'potion',count:4}));b.inventory.add(makeItem({base:'apple',count:2}));
 b.itemBar.assign(0,'apple');b.itemBar.assign(2,'potion');await delay(200);
 const cells=document.querySelectorAll('#bw-items .icell'),transfer=new DataTransfer();
 cells[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
 cells[2].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));await delay(200);
 if(b.itemBar.view()[0].base!=='potion'||b.itemBar.view()[2].base!=='apple')throw Error('HUD drop did not swap both items');
 await report({stage:'item-drop-passed',slots:b.itemBar.view().map(x=>({slot:x.slot,base:x.base,count:x.count}))});
 b.runtime.enterDungeon({id:'s:island_cellars',sub:'oldcellars',kind:'dungeon',x:120,z:-110,cx:0,cz:0,name:'The Old Cellars'},2);
 await report({stage:'dungeon-loading'});await b.runtime.dungeonScene.ready;await report({stage:'dungeon-ready'});
 const place=(x,z,pitch=.28)=>{b.player.teleport(x,z,(x,z)=>b.runtime.heightAt(x,z));b.camera.yaw=Math.PI;b.camera.pitch=pitch;b.camera.snap(b.player.pos);};
 const l=b.runtime.dungeonScene.layout.landmark;place(l.x,l.z+28);
 await wait(()=>b.runtime.dungeonScene.landmark.loaded);await delay(1800);await image('cellar-lighting',b);await report({stage:'lighting-captured'});
 const room=b.runtime.dungeonScene.layout.descent.find(r=>r.roomId===9);place(room.x,room.z+26);
 await wait(()=>b.monsters.all().some(m=>m.id==='morvaOssuaryMother'));
 const boss=b.monsters.all().find(m=>m.id==='morvaOssuaryMother');
 await wait(()=>b.runtime.dungeonScene.descent.rooms.find(r=>r.room.roomId===9)?.loaded);
 b.combat.hurt(boss.actor,1,{now:b.now,killer:b.actor});
 await wait(()=>b.monsters.warnings().some(w=>w.id&&w.left<.7&&w.left>.1));
 await image('morva-attack',b);
 const warnings=b.monsters.warnings();
 await report({stage:'boss-doorway-passed',active:boss.cellarCombat.active,state:boss.actor.ai.state,distance:Math.hypot(boss.actor.pos.x-b.player.pos.x,boss.actor.pos.z-b.player.pos.z),warnings,shaders:b.sc.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,errors});
 window.__combatReview={b,boss,place};restoreClock();
}catch(error){restoreClock();await report({stage:'failed',error:String(error),errors});}
