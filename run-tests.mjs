// Runs every *.test.mjs under src/ and server/ in its own process. `npm test`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.test.mjs')) files.push(p); } })('src');
if (existsSync('server')) (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.test.mjs')) files.push(p); } })('server');
let bad = 0;
const failed = [];
for (const f of files) { const r = spawnSync('node', [f], { stdio: 'inherit' }); if (r.status !== 0) { bad++; failed.push(f); } }
if (failed.length) console.log('\nFAILED: ' + failed.join(', '));
console.log(bad ? `\n${bad} SUITE(S) FAILED` : '\nALL SUITES GREEN'); process.exit(bad ? 1 : 0);
