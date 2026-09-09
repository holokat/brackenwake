import {createProbe} from './probe.js';
const memory = new Map();
const storage = {getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
Object.defineProperty(window, 'localStorage', {value: storage}); Object.defineProperty(window, 'sessionStorage', {value: storage});
const probe = createProbe(), status = document.querySelector('#status'), output = document.querySelector('#report');
const next = () => new Promise(requestAnimationFrame);
const delay = async ms => {const until=performance.now()+ms;while(performance.now()<until)await next();};
const wait = async (fn, ms=120000) => {const until=performance.now()+ms;while(!fn()){if(performance.now()>until)throw Error('Playtest wait timed out');await next();}};
const write = value => {output.textContent += JSON.stringify(value) + '\n';};
const {SYSTEMS} = await import('../../src/game/app/systems/index.js');
probe.installSystems(SYSTEMS);
probe.mark('boot-start');
await import('../../src/game/main.js');
await wait(()=>window.__bw?.creating);
const name = document.querySelector('input[placeholder="a name"]'); name.value='Performance review'; name.dispatchEvent(new Event('input',{bubbles:true}));
[...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();
await wait(()=>window.__bw?.player); const b=window.__bw; await b.runtime.ready;
probe.installRenderer(b); probe.mark('boot-ready');
for(const method of ['enterDungeon','leaveDungeon','dungeonGo']){
  const original=b.runtime[method];b.runtime[method]=(...args)=>probe.operation(method,()=>original.apply(b.runtime,args));
}
// Review survival assistance does not alter monster AI, damage, effects or cooldowns.
setInterval(()=>{if(b.actor.health>0)b.actor.health=b.actor.maxHealth;},250);
const site = {id:'s:island_cellars',sub:'oldcellars',kind:'dungeon',x:120,z:-110,cx:0,cz:0,name:'The Old Cellars'};
let running=false, runNumber=0;
function controls(){for(const button of document.querySelectorAll('#review button'))button.disabled=running;}
function place(x,z,yaw=Math.PI){b.player.teleport(x,z,(x,z)=>b.runtime.heightAt(x,z));b.camera.yaw=yaw;b.camera.pitch=.28;b.camera.snap(b.player.pos);}
async function phase(name,fn){
  status.textContent=name+'. Measuring the live game.';
  const p=await probe.phase(name,b,fn);write({phase:name,seconds:Math.round((p.end-p.start)/1000),failure:p.failure});
  // Reporting happens outside the measured interval.
  await save('checkpoint');
  if(p.failure)throw Error(p.failure);
}
async function save(label){
  const response=await fetch('/measurements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(probe.report(b,label))});
  if(!response.ok)throw Error('Could not save measurements');return response.json();
}
async function ready(){if(await b.runtime.dungeonScene.ready===false)throw Error('Nearby dungeon artwork failed to load');}
async function walk(z,yaw,seconds=30){
  b.camera.yaw=yaw;b.camera.snap(b.player.pos);b.input.keys.add('w');
  try{await wait(()=>yaw===Math.PI?b.player.pos.z<=z:b.player.pos.z>=z,seconds*1000);}finally{b.input.keys.delete('w');}
}
async function orbit(ms){const start=performance.now();while(performance.now()-start<ms){b.camera.yaw=(performance.now()-start)/ms*Math.PI*2;await next();}}
async function route(){
  running=true;controls();runNumber++;
  try{
    if(b.runtime.inDungeon)b.runtime.leaveDungeon();
    await phase(`Run ${runNumber} surface settling`,()=>delay(15000));
    await phase(`Run ${runNumber} surface orbit`,()=>orbit(12000));
    await phase(`Run ${runNumber} dungeon entry`,async()=>{b.runtime.enterDungeon(site);await ready();await delay(2500);});
    await phase(`Run ${runNumber} entrance idle`,()=>delay(12000));
    await phase(`Run ${runNumber} corridor walk`,()=>walk(121,Math.PI));
    await phase(`Run ${runNumber} nave orbit`,()=>orbit(12000));
    await phase(`Run ${runNumber} backtrack`,()=>walk(170,0));
    await phase(`Run ${runNumber} boss room approach`,async()=>{place(5,-137);await delay(12000);});
    await phase(`Run ${runNumber} combat`,async()=>{
      const until=performance.now()+15000;let targeted=null, swings=0;const targets=[];
      while(performance.now()<until){
        const candidates=b.monsters.all().filter(m=>m.actor.health>0).sort((a,c)=>Math.hypot(a.actor.pos.x-b.player.pos.x,a.actor.pos.z-b.player.pos.z)-Math.hypot(c.actor.pos.x-b.player.pos.x,c.actor.pos.z-b.player.pos.z));
        const m=candidates[0];
        if(m&&targeted!==m){place(m.actor.pos.x+1.8,m.actor.pos.z,Math.PI);b.startAttack(m);targeted=m;swings++;targets.push({m,before:m.actor.health});}
        await next();
      }
      probe.mark('combat-targets',{count:swings,monsterCount:b.monsters.all().length,targets:targets.map(({m,before})=>({id:m.id,before,after:m.actor.health}))});b.stopAttack();
    });
    await phase(`Run ${runNumber} stair approach`,async()=>{const at=b.runtime.dungeonScene.stairPos;place(at.x,at.z+25);await delay(8000);});
    await phase(`Run ${runNumber} floor two transition`,async()=>{b.runtime.dungeonGo('down');await ready();await delay(3000);});
    await phase(`Run ${runNumber} floor two orbit`,()=>orbit(12000));
    await phase(`Run ${runNumber} return upstairs`,async()=>{b.runtime.dungeonGo('up');await ready();await delay(8000);});
    await phase(`Run ${runNumber} return to surface`,async()=>{b.runtime.leaveDungeon();await delay(15000);});
    await save('route-'+runNumber);status.textContent='Dungeon route finished. Measurements saved locally.';
  }catch(error){status.textContent=String(error);write(String(error));await save('failed-route');}
  finally{b.input.keys.clear();b.stopAttack();running=false;controls();}
}
async function compare(){
  running=true;controls();
  let bloom, glowScale;
  const adaptive=b.sc.resolution?.enabled, pixelRatio=b.sc.resolution?.ceiling||b.sc.renderer.getPixelRatio(), shadows=b.sc.renderer.shadowMap.enabled, originalRender=b.sc.render;
  try{
    if(!b.runtime.inDungeon){b.runtime.enterDungeon(site);await ready();}
    place(1,121);await delay(8000);
    await phase('Comparison default rendering',()=>orbit(15000));
    if(b.sc.resolution)b.sc.resolution.enabled=false;
    b.sc.renderer.setPixelRatio(pixelRatio);b.sc.resize();await delay(1500);
    bloom=b.sc.spellPass.composer.passes.find(pass=>pass.source&&pass.bloom);glowScale=bloom.resolutionScale;
    bloom.resolutionScale=.5;b.sc.resize();await delay(1500);
    await phase('Comparison half-resolution glow',()=>orbit(15000));
    bloom.resolutionScale=glowScale;b.sc.resize();await delay(1500);
    b.sc.renderer.setPixelRatio(1);b.sc.resize();await delay(1500);
    await phase('Comparison pixel ratio one',()=>orbit(15000));
    b.sc.renderer.setPixelRatio(pixelRatio);b.sc.resize();b.sc.renderer.shadowMap.enabled=false;await delay(1500);
    await phase('Comparison shadows disabled',()=>orbit(15000));
    b.sc.renderer.setPixelRatio(1);b.sc.resize();await delay(1500);
    await phase('Comparison ratio one and shadows disabled',()=>orbit(15000));
    b.sc.renderer.setPixelRatio(pixelRatio);b.sc.resize();b.sc.renderer.shadowMap.enabled=shadows;
    b.sc.render=()=>{b.sc.renderer.info.reset();b.sc.renderer.render(b.sc.scene,b.sc.camera);return false;};await delay(1500);
    await phase('Comparison postprocessing bypassed',()=>orbit(15000));
    b.sc.render=originalRender;await delay(1500);
    await phase('Comparison fixed density repeat',()=>orbit(15000));
    await save('render-comparison');status.textContent='Rendering comparisons finished. Original settings restored.';
  }finally{if(bloom)bloom.resolutionScale=glowScale;b.sc.render=originalRender;b.sc.renderer.setPixelRatio(pixelRatio);b.sc.resize();b.sc.renderer.shadowMap.enabled=shadows;if(b.sc.resolution)b.sc.resolution.enabled=adaptive;running=false;controls();}
}
document.querySelector('#run').onclick=route;
document.querySelector('#compare').onclick=compare;
document.querySelector('#export').onclick=async()=>{const result=await save('manual');status.textContent='Saved '+result.name;};
status.textContent='Ready. Temporary character, current game build.';controls();

async function reviewWarmup(){
 running=true;controls();
 try{
  await phase('Final room warm-up',async()=>{b.runtime.enterDungeon(site);await ready();await delay(4000);});
  await phase('Final corridor walk',()=>walk(121,Math.PI));
  await phase('Final nave review',()=>orbit(15000));
  await save('warmup-review');status.textContent='Final room review finished. Artwork loaded and measurements saved.';
 }catch(error){status.textContent=String(error);await save('failed-review');}
 finally{b.input.keys.clear();running=false;controls();}
}
if(new URLSearchParams(location.search).has('review'))reviewWarmup();
