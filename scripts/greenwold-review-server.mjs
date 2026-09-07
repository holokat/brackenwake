// Optional bridge to the already-open Brave playtest tab. No browser is started.
// Only the isolated tools/greenwold-playtest page connects. Captures are its
// game canvas, never the desktop or another tab. No arbitrary code execution.
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
const output=process.argv[2]||'/tmp/kaldera-greenwold-review';mkdirSync(output,{recursive:true});
let state={ready:false},commands=[];
createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5198');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS'){res.end();return;}
 const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
 if(req.method==='POST'&&req.url==='/state'){state=JSON.parse(body);writeFileSync(`${output}/state.json`,JSON.stringify(state,null,2));}
 if(req.method==='POST'&&req.url==='/command'){
  const c=JSON.parse(body);if(['view','walk','day','capture','check','pause','resume'].includes(c.action))commands.push(c);else{res.writeHead(400);res.end('Unknown command');return;}
 }
 if(req.method==='POST'&&req.url?.startsWith('/capture/')){
  const name=req.url.slice(9).replace(/[^a-z0-9_-]/g,'');writeFileSync(`${output}/${name}.png`,body);
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/command'&&req.method==='GET'?commands.shift()||null:state));
}).listen(5208,'127.0.0.1',()=>console.log(`Greenwold review bridge on 5208; captures in ${output}`));
