import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..');
const assets=path.join(root,'assets/models/cellars/rooms'),docs=path.join(root,'docs/art/old-cellars/blender/rooms');
const log=JSON.parse(fs.readFileSync(path.join(docs,'mcp-build-log.json')));assert.equal(log.status,'ok');assert.match(log.stdout,/CELLAR_ROOMS_BUILD_FINISHED/);
const renderLog=JSON.parse(fs.readFileSync(path.join(docs,'mcp-render-log.json')));assert.equal(renderLog.status,'ok');assert.match(renderLog.stdout,/CELLAR_ROOM_EXPORT_RENDERS_FINISHED/);
const bellLog=JSON.parse(fs.readFileSync(path.join(docs,'mcp-bell-review-log.json')));assert.equal(bellLog.status,'ok');assert.match(bellLog.stdout,/CELLAR_ROOMS_BUILD_FINISHED/);assert.match(bellLog.stdout,/CELLAR_ROOM_EXPORT_RENDERS_FINISHED/);
const cameraLog=JSON.parse(fs.readFileSync(path.join(docs,'mcp-camera-review-log.json')));assert.equal(cameraLog.status,'ok');assert.match(cameraLog.stdout,/CELLAR_ROOM_EXPORT_RENDERS_FINISHED/);
const roofLog=JSON.parse(fs.readFileSync(path.join(docs,'mcp-vault-review-log.json')));assert.equal(roofLog.status,'ok');assert.match(roofLog.stdout,/CELLAR_ROOMS_BUILD_FINISHED/);assert.match(roofLog.stdout,/CELLAR_ROOM_EXPORT_RENDERS_FINISHED/);
const structureLog=JSON.parse(fs.readFileSync(path.join(docs,'mcp-structure-review-log.json')));assert.equal(structureLog.status,'ok');assert.match(structureLog.stdout,/CELLAR_ROOMS_BUILD_FINISHED/);assert.match(structureLog.stdout,/CELLAR_ROOM_EXPORT_RENDERS_FINISHED/);
const evidence=JSON.parse(fs.readFileSync(path.join(docs,'render-evidence.json')));assert.equal(evidence.length,8);
for(let level=1;level<=8;level++) {
  const name=`cellar-room-${String(level).padStart(2,'0')}`,m=JSON.parse(fs.readFileSync(path.join(assets,`${name}.json`)));
  const blend=fs.readFileSync(path.join(assets,`${name}.blend`));
  // Blender 5 compressed saves use zstd; both native and compressed editable source are accepted.
  assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528,'Missing editable Blender source');
  assert.ok(blend.length>500000);assert.equal(m.source.port,9879);assert.match(m.source.transport,/Blender MCP/);
  for(const [file,hash] of Object.entries(m.source.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(here,file))).digest('hex'),hash,`Stale source: ${file}`);
  const e=evidence.find(e=>e.level===level);assert.equal(e.assetSha256,m.assetSha256);assert.equal(e.renderer,'Cycles CPU');assert.equal(e.views.length,3);
  for(const p of e.views){const png=fs.readFileSync(path.join(root,p));assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.length>50000);assert.ok(png.readUInt32BE(16)>=1000);assert.ok(png.readUInt32BE(20)>=800);}
}
console.log('CELLAR_ROOM_SOURCES_VERIFIED');
