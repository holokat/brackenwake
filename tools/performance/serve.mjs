// Local production-build profiler. Reuses public assets without copying them.
import {build} from 'vite';
import {transitionProbe} from './transition_probe.mjs';
import {createServer} from 'node:http';
import {mkdir, writeFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve, extname, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = '/private/tmp/brackenwake-performance-build';
const reports = join(root, 'outputs/performance');
const port = 5201;
await build({root, plugins:[transitionProbe()], configFile: false, publicDir: false, build: {outDir: output, emptyOutDir: false, sourcemap: true,
  rolldownOptions: {input: join(root, 'tools/performance/index.html')}}});
await mkdir(reports, {recursive: true});
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (req.method === 'POST' && path === '/measurements') {
      if (req.headers.origin !== `http://localhost:${port}`) {res.writeHead(403).end(); return;}
      const chunks = []; let size = 0;
      for await (const chunk of req) {size += chunk.length; if(size > 32 * 1024 * 1024) throw Error('Report too large'); chunks.push(chunk);}
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (!Array.isArray(data.phases) || typeof data.label !== 'string') throw Error('Invalid report');
      const name = `${new Date().toISOString().replace(/[:.]/g,'-')}-${data.label.replace(/[^a-z0-9-]/gi,'_')}.json`;
      await writeFile(join(reports, name), JSON.stringify(data));
      console.log('Saved ' + name); res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({name})); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405).end();return;}
    const relative = path === '/' ? '/tools/performance/index.html' : path;
    for (const base of [output, join(root, 'public')]) {
      const file = resolve(base, '.' + relative);
      if (!file.startsWith(base + sep)) continue;
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) continue;
      res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control':'public, max-age=3600'});
      if(req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res); return;
    }
    res.writeHead(404).end('Not found');
  } catch(error) {console.error(error.message); if(!res.headersSent)res.writeHead(400);res.end('Request failed');}
}).listen(port, '127.0.0.1', () => console.log(`Performance playtest: http://localhost:${port}/?solo`));
