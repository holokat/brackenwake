import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {editorSavePlugin} from '../../../tools/editor_save.mjs';

const root = mkdtempSync(join(tmpdir(), 'brackenwake-editor-refresh-'));
const spaces = join(root, 'src/mmo/spaces');
mkdirSync(spaces, {recursive:true});
writeFileSync(join(root, 'index.html'), '<main>Editor refresh regression</main>');
const writeSpace = (id, name) => writeFileSync(join(spaces, id + '.json'), JSON.stringify({id, name, at:{x:0,z:0}, radius:20, pieces:[]}));
writeSpace('initial', 'Original area');
const server = await createServer({root, configFile:false, logLevel:'error', plugins:[editorSavePlugin(root)],
  server:{host:'127.0.0.1', port:0, watch:{ignored:['**/src/mmo/spaces/**']}}});
try {
  await server.listen();
  const base = 'http://127.0.0.1:' + server.httpServer.address().port;
  const get = async (path, headers) => {
    const response = await fetch(base + path, {headers});
    assert.equal(response.status, 200, path);
    return response.text();
  };
  await get('/', {accept:'text/html'});
  assert((await get('/src/mmo/spaces/list.js')).includes('initial.json'));
  assert((await get('/src/mmo/spaces/initial.json?import')).includes('Original area'));
  let reloads = 0;
  const send = server.ws.send.bind(server.ws);
  server.ws.send = (...args) => { if (args[0]?.type === 'full-reload') reloads++; return send(...args); };
  // Simulate a Blender/layout script, without using the editor's save endpoint.
  writeSpace('initial', 'Updated area'); writeSpace('new_meadow', 'New meadow');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert((await get('/src/mmo/spaces/initial.json?import')).includes('Original area'), 'Fixture must reproduce the stale cache');
  await get('/', {accept:'text/html'});
  assert((await get('/src/mmo/spaces/list.js')).includes('new_meadow.json'), 'New space was not registered');
  assert((await get('/src/mmo/spaces/initial.json?import')).includes('Updated area'), 'Saved JSON stayed cached');
  assert((await get('/src/mmo/spaces/new_meadow.json?import')).includes('New meadow'));
  assert.equal(reloads, 0, 'Refreshing data interrupted another editor tab');
  console.log('External world edits appear after navigation, without restarting Vite or broadcasting a reload.');
} finally {
  await server.close();
}
