// Runs every *.test.mjs under src/ in its own process. `npm test`.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.test.mjs')) files.push(p); } })('src');
let bad = 0;
for (const f of files) { const r = spawnSync('node', [f], { stdio: 'inherit' }); if (r.status !== 0) bad++; }
console.log(bad ? `\n${bad} SUITE(S) FAILED` : '\nALL SUITES GREEN'); process.exit(bad ? 1 : 0);
