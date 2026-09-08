import assert from 'node:assert/strict';
import {RAID} from '../src/mmo/cellar_raid_rules.js';
const base=process.argv[2]||'ws://127.0.0.1:8787';
assert.match(base,/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+$/,'Review clients may connect only to a local Worker');
const room='cellars-review-'+Date.now(),sockets=[],packets=[];let hp=200,live=9;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const state=i=>({t:'state',layer:i<live?RAID.layer:'oldcellars:7',p:[RAID.x+12,0,RAID.z+i*.1],hp,mhp:200,mp:100,mmp:100,st:100,mst:100,yaw:0,sp:0});
try{
for(let i=0;i<10;i++){const ws=new WebSocket(base+'/ws/'+room);sockets.push(ws);packets[i]=[];ws.onmessage=e=>packets[i].push(JSON.parse(e.data));await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});ws.send(JSON.stringify({t:'hello',id:'review-player-'+i,name:'Review '+i}));ws.send(JSON.stringify(state(i)));}
const timer=setInterval(()=>sockets.forEach((w,i)=>{if(w.readyState===1)w.send(JSON.stringify(state(i)));}),500);
const latest=i=>packets[i].filter(p=>p.t==='raid').at(-1);
await pause(1400);assert.equal(latest(0).status,'sealed');live=10;await pause(1500);assert.equal(latest(0).status,'fighting');const run=latest(0).run;
sockets[0].send(JSON.stringify({t:'raidStrike',run,seq:1,kind:'melee',damage:350}));await pause(250);assert(sockets.every((_,i)=>latest(i).hp===RAID.maxHealth-350));sockets[0].send(JSON.stringify({t:'raidStrike',run,seq:1,kind:'melee',damage:350}));await pause(250);assert.equal(latest(0).hp,RAID.maxHealth-350);
await pause(12000);assert(packets.every(p=>p.some(m=>m.t==='raid'&&m.attack)),'all clients see warning');assert(packets.every(p=>p.some(m=>m.t==='raidDamage')),'all clients receive landed hazard');
live=9;await pause(1600);assert.equal(latest(0).status,'shielded');live=10;await pause(1600);assert.equal(latest(0).status,'fighting');
clearInterval(timer);sockets.forEach(w=>w.close());console.log(JSON.stringify({clients:10,worker:'local Cloudflare runtime',sealedAtNine:true,sharedHealth:true,replayRejected:true,sharedWarningAndDamage:true,shieldAndResume:true,room}));
}catch(e){sockets.forEach(w=>w.close());console.error(e);process.exit(1);}
