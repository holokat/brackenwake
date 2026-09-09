import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file='models/props/old_cellars_entrance.glb';
const [source,built,manifest]=await Promise.all([
 readFile(new URL('../../../public/'+file,import.meta.url)),
 readFile(new URL('../../../dist/'+file,import.meta.url)),
 readFile(new URL('../../../dist/models/props/manifest.json',import.meta.url)),
]);
assert.deepEqual(built,source,'Built asset must match the reviewed Blender export');
assert.ok(JSON.parse(manifest).ids.includes('old_cellars_entrance'));
console.log('Cellars exterior build verified');
