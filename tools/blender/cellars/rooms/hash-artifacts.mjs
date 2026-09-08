import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..');
const docs=path.join(root,'docs/art/old-cellars/blender/rooms'),assets=path.join(root,'assets/models/cellars/rooms');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceFiles=Object.fromEntries(fs.readdirSync(here).filter(n=>/\.(py|mjs)$/.test(n)).sort().map(n=>[n,hash(path.join(here,n))]));
const rooms=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'))).rooms.map(r=>{
  const blend=r.glb.replace('.glb','.blend'),name=r.glb.replace('.glb','.json');
  return {level:r.level,glb:r.glb,glbSha256:hash(path.join(assets,r.glb)),blend,blendSha256:hash(path.join(assets,blend)),manifestSha256:hash(path.join(assets,name)),...r.metrics,colliders:r.colliders.length,anchors:r.anchors.length,flights:r.routes.length};
});
const evidence=JSON.parse(fs.readFileSync(path.join(docs,'render-evidence.json')));
const renderHashes=evidence.flatMap(r=>r.views.map(p=>({level:r.level,path:p,sha256:hash(path.join(root,p)),assetSha256:r.assetSha256})));
const report={sourceFiles,sourceSetSha256:crypto.createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex'),combinedManifestSha256:hash(path.join(assets,'manifest.json')),rooms,renderHashes,totals:{triangles:rooms.reduce((n,r)=>n+r.triangles,0),glbBytes:rooms.reduce((n,r)=>n+r.glbBytes,0),blendBytes:rooms.reduce((n,r)=>n+r.blendBytes,0),flights:rooms.reduce((n,r)=>n+r.flights,0),colliders:rooms.reduce((n,r)=>n+r.colliders,0),anchors:rooms.reduce((n,r)=>n+r.anchors,0)},verification:{geometry:'validate.mjs',routes:'validate-routes.mjs',sources:'verify-source.mjs',actualGame:'node src/world/cellar_art.test.mjs',actualGameSamples:{stairs:4040,portals:1632}},limitations:['Review lighting is illustrative; runtime lights and VFX are supplied by the game.','The masonry and relief treatment is more geometric and less densely ornamented than the generated references.','The rooms contain no bosses.']};
report.renderSetSha256=crypto.createHash('sha256').update(JSON.stringify(renderHashes)).digest('hex');
fs.writeFileSync(path.join(docs,'handoff.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sourceSetSha256:report.sourceSetSha256,combinedManifestSha256:report.combinedManifestSha256,renderSetSha256:report.renderSetSha256,totals:report.totals,renderCount:renderHashes.length}));
