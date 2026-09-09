import {defineConfig} from 'vite';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../docs/art/widow-vault/captures/',import.meta.url));
export default defineConfig({cacheDir:'.vite/widow-review',server:{host:'127.0.0.1',port:5208,strictPort:true},plugins:[{
 name:'widow-local-art-review',
 configureServer(server){server.middlewares.use('/__art_capture',async(req,res)=>{
  const name=(req.url||'').slice(1);
  if(req.method!=='POST'||!/^widow-[a-z0-9-]+$/.test(name)){res.statusCode=400;return res.end();}
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>12000000){res.statusCode=413;return res.end();}chunks.push(chunk);}
  const extension=req.headers['content-type']?.includes('application/json')?'.json':'.png';
  await mkdir(output,{recursive:true});await writeFile(output+name+extension,Buffer.concat(chunks));res.end('Saved');
 });}
}]});
