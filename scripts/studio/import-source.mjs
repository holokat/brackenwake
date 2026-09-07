import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||'/Users/k/code/animation-studio/fantasy-studio');
const destination=resolve('src/vendor/living-studio');
const entries=['models/character.js','models/item-model.js','models/creatures/index.js','models/forage/index.js','runtime/animation.js','runtime/source-motion.js','runtime/source-effects.js','runtime/preview-equipment.js','runtime/enchantment-session.js','data/item-catalog.js','data/wiki.js'];
const files=new Map(),queue=entries.map(p=>resolve(source,p));
while(queue.length){
 const path=queue.pop();if(files.has(path))continue;
 if(!path.startsWith(source+'/'))throw new Error(`Source import escapes snapshot: ${path}`);
 const content=readFileSync(path);files.set(path,content);
 if(path.endsWith('.js'))for(const match of content.toString().matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
  const next=resolve(dirname(path),match[1]);if(!existsSync(next))throw new Error(`Missing source ${next}`);queue.push(next);
 }
}
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt={source,snapshotAt:new Date().toISOString(),entries,files:{},assets:{},copiedBytes:0};
for(const[path,content]of files){
 const local=relative(source,path),target=resolve(destination,local);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);
 receipt.files[local]={sha256:hash(content),bytes:content.length};receipt.copiedBytes+=content.length;
}
for(const local of ['models/warrior-base-rigged.glb','animations/quaternius-retargeted.json','vfx/spell-fire-explosion-atlas.png','vfx/spell-smoke-atlas.png']){
 const origin=resolve(source,'../studio/public',local),content=readFileSync(origin),target=resolve('public/studio',local);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);
 receipt.assets[local]={sha256:hash(content),bytes:content.length};receipt.copiedBytes+=content.length;
}
// Earlier habitats share this exact source folder. Keep their receipt truthful.
const priorPath='docs/mmo/greenwold/living-import.json',prior=JSON.parse(readFileSync(priorPath));
let changed=0;for(const[local,entry]of Object.entries(prior.files))if(receipt.files[local]&&receipt.files[local].sha256!==entry.sha256){prior.files[local]=receipt.files[local];changed++;}
if(changed){prior.updatedBy='docs/mmo/studio/source-import.json';prior.copiedBytes=Object.values(prior.files).reduce((n,f)=>n+f.bytes,0);prior.studioVerification={previous:prior.studioVerification,note:'Shared dependencies updated by the later character integration; use the new snapshot hashes.'};writeFileSync(priorPath,JSON.stringify(prior,null,2)+'\n');}
mkdirSync('docs/mmo/studio',{recursive:true});writeFileSync('docs/mmo/studio/source-import.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({files:files.size,assets:Object.keys(receipt.assets).length,bytes:receipt.copiedBytes,sharedFilesUpdated:changed}));
