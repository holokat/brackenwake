// Local-only sink for the two browser reviews. Never included in the game build.
import http from 'node:http';
import {appendFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const directory=process.env.BRACKENWAKE_QA_OUTPUT || join(tmpdir(),'brackenwake-browser-review');
mkdirSync(directory,{recursive:true});
http.createServer((req,res)=>{
 if(req.headers.origin!=='http://localhost:5317'){res.writeHead(403);res.end();return;}
 res.setHeader('Access-Control-Allow-Origin','http://localhost:5317');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS'){res.end();return;}
 if(req.method!=='POST'){res.writeHead(405);res.end();return;}
 let data='',bytes=0;
 req.on('data',chunk=>{bytes+=chunk.length;if(bytes>24*1024*1024){req.destroy();return;}data+=chunk;});
 req.on('end',()=>{
  try{
   if(req.url==='/report'){const value=JSON.parse(data);appendFileSync(join(directory,'report.jsonl'),JSON.stringify(value)+'\n');console.log(value);}
   else if(/^\/image\/[a-z0-9-]+\.png$/.test(req.url))writeFileSync(join(directory,req.url.slice(7)),Buffer.from(data,'base64'));
   else{res.writeHead(404);res.end();return;}
   res.end('ok');
  }catch{res.writeHead(400);res.end();}
 });
}).listen(5318,'127.0.0.1',()=>console.log(`Review evidence: ${directory}`));
