import * as THREE from 'three';
import {makeItem} from '/src/mmo/items.js';
import {ABILITIES_BY_ID} from '/src/mmo/abilities.js';
import {giveMaterial} from '/src/game/win_crafting.js';
import {swingSeconds} from '/src/mmo/combat_rules.js';
import {focusSearchPoint} from '/src/game/editor/search.js';
import {SPACES} from '/src/mmo/spaces/index.js';
import {STRONGHOLDS} from '/src/mmo/greenwold/strongholds.js';
import {authoredPick} from '/src/mmo/greenwold/interactions.js';
import {spaceSiteRow} from '/src/world/sites.js';
export function studioSnapshot(b){
 const s=b.player.studio,body=s?.actor;const box=body?new THREE.Box3().setFromObject(body.group):null;
 const panel=document.querySelector('.bw-win-crafting');
 return {craft:panel&&{visible:!!panel.offsetParent,cards:panel.querySelectorAll('.bw-card').length,disabled:panel.querySelectorAll('.bw-make:disabled').length,where:panel.querySelector('.bw-where')?.textContent,count:panel.querySelector('.bw-count')?.textContent,requirements:[...panel.querySelectorAll('.bw-req')].slice(0,6).map(n=>n.textContent)},loaded:s?.loaded,errors:s?.errors,motion:!!s?.sourceMotion,bodySize:box?.getSize(new THREE.Vector3()).toArray(),gear:s?.equipment,sourceMeshCount:body?.group.userData.batchedSourceMeshes,swingSeconds:swingSeconds(b.actor),spells:b.spellVfx?.studioState,forage:b.studioForage?.count,colliders:b.runtime.physical?.bodies.length,npcs:b.npcs.list().map(n=>({id:n.id,loaded:n.rig?.loaded,errors:n.rig?.errors,walked:n.wander?.distance,mode:n.wander?.mode}))};
}
export async function studioCommand(b,c){
 if(c.op==='builderRepeat'){
  await studioCommand(b,{op:'builderSearch',query:'Fence rail 3m',scope:'library',select:true});
  const ed=b.editor,panel=b.windows.panels.find(p=>p.id==='editor'),point={x:486,z:-204};
  focusSearchPoint({sc:b.sc,camera:b.camera,dev:b.dev,runtime:b.runtime},point,24);
  const canvas=b.sc.renderer.domElement,rect=canvas.getBoundingClientRect(),before=ed.depth,rows=[];
  for(let i=0;i<3;i++){
   const world=new THREE.Vector3(point.x+i*3,b.runtime.heightAt(point.x+i*3,point.z),point.z).project(b.sc.camera);
   const e={clientX:rect.left+(world.x+1)*rect.width/2,clientY:rect.top+(1-world.y)*rect.height/2,button:0,pointerId:91,pointerType:'mouse',bubbles:true};
   canvas.dispatchEvent(new PointerEvent('pointermove',e));canvas.dispatchEvent(new PointerEvent('pointerdown',{...e,buttons:1}));canvas.dispatchEvent(new PointerEvent('pointerup',e));b.step(30);
   rows.push({mode:panel._modeNow(),pick:ed.pick,selection:ed.selection(),depth:ed.depth});
  }
  return{before,rows,preview:b.sc.scene.getObjectByName('editor-placement-preview')?.visible,writes:window.__editorReviewWrites.length};
 }
 if(c.op==='stronghold'){
  const hub=STRONGHOLDS.find(h=>h.id===c.id)||STRONGHOLDS[0];
  b.windows.closeAll();b.player.teleport(hub.at.x,hub.at.z+66,(x,z)=>b.runtime.heightAt(x,z));b.camera.snap(b.player.pos);
  b.dev.set(true);document.querySelector('#review').style.display='none';
  focusSearchPoint({sc:b.sc,camera:b.camera,dev:b.dev,runtime:b.runtime},hub.at,c.range||78);
  for(let i=0;i<50;i++)b.step(30);
  const rows=b.monsters.all().filter(m=>m.key.startsWith('s:greenwold_'+hub.id+':plan:'));
  const space=SPACES['greenwold_'+hub.id],piece=space.pieces.find(p=>p.model==='loot_sack');
  const point={x:space.at.x+piece.x,z:space.at.z+piece.z},pick=authoredPick(spaceSiteRow(space,b.runtime.field),'loot_sack',point);
  const guarded=b.chests.open(pick.chest,{at:point});
  return {id:hub.id,name:hub.name,defenders:rows.length,expected:hub.spawns.length,leader:rows.find(m=>m.rec.elite)&&{name:rows.find(m=>m.rec.elite).name,health:rows.find(m=>m.rec.elite).actor.health},guarded:guarded.reason,meshes:b.runtime.siteMarkers.meshes().length,ready:rows.every(m=>m.model.group.parent&&m.model.group.visible),pos:{...b.player.pos}};
 }
 if(c.op==='builderGrab'){
  b.dev.set(true);b.windows.open('editor');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'v',bubbles:true}));
  const ed=b.editor,space=ed.searchSpaces().find(s=>s.id==='greenwold_hearthhome'),index=space.pieces.findIndex(e=>e.model==='cottage_b'),item=space.pieces[index];
  const point={x:space.at.x+item.x,z:space.at.z+item.z};focusSearchPoint({sc:b.sc,camera:b.camera,dev:b.dev,runtime:b.runtime},point,18);
  const target=new THREE.Vector3(point.x,b.runtime.heightAt(point.x,point.z)+2,point.z).project(b.sc.camera),canvas=b.sc.renderer.domElement,rect=canvas.getBoundingClientRect();
  const event={clientX:rect.left+(target.x+1)*rect.width/2,clientY:rect.top+(1-target.y)*rect.height/2,button:0,pointerId:72,pointerType:'mouse',bubbles:true};
  canvas.dispatchEvent(new PointerEvent('pointerdown',event));canvas.dispatchEvent(new PointerEvent('pointerup',event));
  const panel=b.windows.panels.find(p=>p.id==='editor'),chosen=ed.selection();
  return {mode:panel._modeNow(),selected:chosen,model:chosen&&ed.doc.at(chosen)?.model,depth:ed.doc?.depth,handles:!!panel._handles.control.object,toolbar:panel._handles.toolbar.style.display,handTitle:document.querySelector('#bw-editor .rail .cell')?.title};
 }
 if(c.op==='builderPreview'){
  await studioCommand(b,{op:'builderSearch',query:c.query||'Barrel',scope:'library',select:true});
  const canvas=b.sc.renderer.domElement,rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+rect.width*.57,clientY:rect.top+rect.height*.63,pointerId:71,pointerType:'mouse',bubbles:true}));
  const ghost=b.sc.scene.getObjectByName('editor-placement-preview');
  let meshes=0;ghost?.traverse(o=>{if(o.isMesh)meshes++;});
  return {name:ghost?.name,visible:ghost?.visible,position:ghost?.position.toArray(),meshes,columns:getComputedStyle(document.querySelector('#bw-editor .grid')).gridTemplateColumns,sidebar:document.querySelector('#bw-editor .strip').getBoundingClientRect().width};
 }
 if(c.op==='builderHandles'){
  await studioCommand(b,{op:'builderSearch',query:c.query||'cottage hearthhome',scope:'placed',select:true});
  const handles=b.windows.panels.find(p=>p.id==='editor')._handles,ed=b.editor;
  if(!handles?.control.object)throw Error('No selected object handles');
  const mode=c.mode||'Move';[...handles.toolbar.querySelectorAll('button')].find(n=>n.textContent===mode).click();
  b.sc.renderer.render(b.sc.scene,b.sc.camera);
  const canvas=b.sc.renderer.domElement,rect=canvas.getBoundingClientRect(),pos=handles.proxy.position.clone().project(b.sc.camera);
  const center={x:rect.left+(pos.x+1)*rect.width/2,y:rect.top+(1-pos.y)*rect.height/2};
  const selection=ed.selection(),before=JSON.stringify(ed.doc.at(selection)),depth=ed.doc.depth;let point=null;
  for(let dy=-130;dy<=130&&!point;dy+=5)for(let dx=-130;dx<=130&&!point;dx+=5){
   const x=center.x+dx,y=center.y+dy;handles.control.pointerHover({x:(x-rect.left)/rect.width*2-1,y:-(y-rect.top)/rect.height*2+1,button:0});
   if(handles.control.axis===(mode==='Rotate'?'Y':'X'))point={x,y};
  }
  if(!point)throw Error('No visible handle hit');
  const fire=(name,x,y,button=0)=>canvas.dispatchEvent(new PointerEvent(name,{clientX:x,clientY:y,button,buttons:name==='pointerup'?0:1,pointerId:79,pointerType:'mouse',bubbles:true}));
  fire('pointerdown',point.x,point.y);const began=handles.dragging;
  fire('pointermove',point.x+45,point.y+25,-1);
  fire('pointerup',point.x+45,point.y+25);
  const after=JSON.stringify(ed.doc.at(ed.selection())),afterDepth=ed.doc.depth;
  if(c.undo)window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
  return {mode,began,before:JSON.parse(before),after:JSON.parse(after),depthDelta:afterDepth-depth,changed:before!==after,undoRestored:JSON.stringify(ed.doc.at(selection))===before,toolbarVisible:handles.toolbar.style.display,errors:[],writes:window.__editorReviewWrites.length};
 }
 if(c.op==='builderSearch'){
  b.dev.set(true);b.windows.open('editor');
  const input=document.querySelector('#bw-builder-search');input.focus();input.value=c.query||'Hearthhome';input.dispatchEvent(new Event('input',{bubbles:true}));
  if(c.scope){const button=[...document.querySelectorAll('.search-scopes button')].find(n=>n.textContent.toLowerCase()===c.scope);button.click();}
  const rows=[...document.querySelectorAll('.search-result')].map(n=>({name:n.querySelector('.search-name').textContent,detail:n.querySelector('.search-detail').textContent}));
  const before={rows,status:document.querySelector('.search-status').textContent,expanded:input.getAttribute('aria-expanded')};
  if(c.select){input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}
  if(c.escape){input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
  return {before,expanded:input.getAttribute('aria-expanded'),editorOpen:b.windows.isOpen('editor'),space:b.editor?.space?.id,selected:b.editor?.selection(),tool:b.editor?.pick,camera:b.sc.camera.position.toArray(),overflow:document.querySelector('.search-popup').getBoundingClientRect().right>innerWidth};
 }
 if(c.op==='sequence'){const results=[];for(const op of c.steps)results.push(await studioCommand(b,op));return results;}
 if(c.op==='station'){const s=b.stations.nearest(b.player.pos,500,c.id||'forge');if(!s)throw Error('Station unavailable');b.player.teleport(s.x,s.z+2,(x,z)=>b.runtime.heightAt(x,z));b.camera.snap(b.player.pos);b.dev.set(false);return {x:s.x,z:s.z,id:s.id};}
 if(c.op==='equip'){
  const item=makeItem({base:c.item,rarity:c.rarity||'common',seed:29});if(!item)throw Error('Unknown item');
  const slot=b.inventory.emptySlot();b.inventory.add(item);const result=b.inventory.equip(slot,c.slot);await b.player.studio.ready;return result;
 }
 if(c.op==='unequip'){const result=b.inventory.unequip(c.slot);await b.player.studio.ready;return result;}
 if(c.op==='look'){b.player.studio.setAppearance({gender:c.gender||'male'});await b.player.studio.ready;}
 if(c.op==='pose'){b.player.group.rotation.y=c.yaw??Math.PI;b.player.studio.poseAction(c.pose||'idle',c.phase??.4);}
 if(c.op==='frame'){
  document.querySelector('#review').style.display='none';b.dev.set(true);b.player.group.visible=true;b.windows.closeAll();const p=b.player.pos,range=c.range||3.3;
  b.sc.camera.position.set(p.x+(c.side??.6)*range,p.y+1.35,p.z+range);b.sc.camera.lookAt(p.x,p.y+.95,p.z);b.sc.camera.updateMatrixWorld(true);
 }
 if(c.op==='craft')b.windows.open('crafting');
 if(c.op==='stockForge'){
  const character=b.inventory.character;character.skills.blacksmithing=100;
  for(const id of ['iron','oak','hide'])giveMaterial({character,inventory:b.inventory},id,100);
  b.panels.crafting.render();return studioSnapshot(b).craft;
 }
 if(c.op==='craftOne'){
  const button=document.querySelector('.bw-make:not(:disabled)');if(!button)throw Error('No enabled crafting action');
  const before=b.inventory.pack.items.filter(Boolean).map(i=>({base:i.base,count:i.count||1}));
  button.click();return {before,after:b.inventory.pack.items.filter(Boolean).map(i=>({base:i.base,count:i.count||1})),craft:studioSnapshot(b).craft};
 }
 if(c.op==='animalFrame'){
  const rows=b.living.root.children.filter(g=>/Coop hen/.test(g.name));if(!rows.length)throw Error('No hens loaded');
  const center=new THREE.Vector3();for(const row of rows)center.add(row.position);center.divideScalar(rows.length);
  b.dev.set(true);document.querySelector('#review').style.display='none';b.sc.camera.position.set(center.x+3,center.y+1.6,center.z+4);b.sc.camera.lookAt(center.x,center.y+.2,center.z);b.sc.camera.updateMatrixWorld(true);return rows.map(g=>({name:g.name,pos:g.position.toArray()}));
 }
 if(c.op==='probeHover'){
  b.windows.closeAll();b.dev.set(false);const npc=b.npcs.list().find(n=>n.rig?.loaded&&Math.hypot(n.x-b.player.pos.x,n.z-b.player.pos.z)<24);if(!npc)throw Error('No nearby NPC');
  const point=new THREE.Vector3(npc.x,npc.y+1,npc.z).project(b.sc.camera);b.input.pointer.x=point.x;b.input.pointer.y=point.y;
  for(let i=0;i<8;i++)b.step(16.7);const hit=b.hoverHalo.target;
  b.windows.open('crafting');b.step(16.7);const cleared=b.hoverHalo.target===null;
  return {npc:npc.id,hit,clearedOnWindow:cleared};
 }
 if(c.op==='spell'){
  const a=ABILITIES_BY_ID[c.id];if(!a)throw Error('Unknown ability');
  b.spellVfx.start(c.id,{castTime:a.castTime,target:a.target==='self'?b.actor:{x:b.player.pos.x,y:b.player.pos.y,z:b.player.pos.z+5}});for(let t=0;t<(c.time??a.castTime+.15);t+=1/60)b.spellVfx.update(1/60);
 }
 if(c.op==='hover'){
  const n=b.npcs.list().find(n=>n.rig?.loaded);if(n){b.hoverHalo.show(n,.75,b.player.pos);return{name:n.personName,target:b.hoverHalo.target};}
 }
 if(c.op==='move'){
  b.dev.set(false);b.windows.closeAll();const from={...b.player.pos};for(let i=0;i<(c.frames||120);i++)b.player.update(1/60,{z:1,yaw:c.yaw||0},Object.assign((x,z)=>b.runtime.heightAt(x,z),{canMove:(a,z)=>b.runtime.physical.canMove(a,z),supportAt:(...a)=>b.runtime.physical.supportAt(...a),ceilingAt:(...a)=>b.runtime.physical.ceilingAt(...a)}));return{from,to:{...b.player.pos},blocked:b.player.state.blocked};
 }
 return studioSnapshot(b);
}
