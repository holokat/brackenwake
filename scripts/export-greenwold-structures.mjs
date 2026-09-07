// Every structure the Greenwold needs, read off the spaces that stand it.
//
//   node scripts/export-greenwold-structures.mjs
//
// Writes docs/concepts/greenwold/STRUCTURES.md and wiki/site/structures.html
// (the codex page) and prints the counts. Rerun it whenever a space, a
// footprint or the props manifest changes; the list is generated, never typed,
// so a piece placed in the editor cannot be quietly left off it.
//
// WHAT COUNTS. A structure is a model id a Greenwold space stands as a piece
// or lays as a run: a building, a wall, a bridge, a stall, a lamp post. The
// guide's per zone model lists (src/mmo/greenwold_guide.js) are read too, so
// a thing the zone is meant to have and no space has placed yet is still on
// the list, marked so. Trees are pieces with files of their own and get their
// own short section at the end because they are models, not structures. The
// dressing a space files under `rocks` (wheat rows, folds, reed beds, gates)
// is drawn in code by src/world/dressing_models.js and needs no file, so it is
// listed once, apart, as done.
//
// MADE means public/models/props/manifest.json has the id, which is what
// tools/validate-props.mjs writes from the files really in the folder. A
// piece with no FOOTPRINT row is never loaded at all, and is flagged in red.
//
// The words for each id come from docs/concepts/greenwold/MODELS.md, which is
// Fable's reading of the concept images with a prompt per model; an id that
// file does not know gets the guide's landmark line or nothing.

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOOTPRINT } from '../src/mmo/plans/footprints.js';
import { GUIDE_ZONES, GUIDE_BY_ID } from '../src/mmo/greenwold_guide.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SPACE_DIR = join(ROOT, 'src', 'mmo', 'spaces');
const MANIFEST = join(ROOT, 'public', 'models', 'props', 'manifest.json');
const MODELS_MD = join(ROOT, 'docs', 'concepts', 'greenwold', 'MODELS.md');
const OUT_MD = join(ROOT, 'docs', 'concepts', 'greenwold', 'STRUCTURES.md');
const OUT_HTML = join(ROOT, 'wiki', 'site', 'structures.html');

const made = new Set(existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')).ids || [] : []);

// ---- the words, from MODELS.md ---------------------------------------------
const WORDS = new Map();
if (existsSync(MODELS_MD)) {
  for (const line of readFileSync(MODELS_MD, 'utf8').split('\n')) {
    const m = line.match(/^\|\s*(`[^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)\|\s*$/);
    if (!m) continue;
    const ids = [...m[1].matchAll(/`([a-z0-9_]+)`/g)].map((x) => x[1]);
    // `headstone_a` to `headstone_e` names a run of ids
    const run = m[1].match(/`([a-z0-9_]+)_([a-z])` to `\1_([a-z])`/);
    if (run) for (let c = run[2].charCodeAt(0); c <= run[3].charCodeAt(0); c++) ids.push(`${run[1]}_${String.fromCharCode(c)}`);
    for (const id of ids) WORDS.set(id, { what: m[2].trim(), tris: m[3].trim(), tex: m[4].trim(), prompt: m[5].trim() });
  }
}

// ---- the spaces, in the order the first hour meets them --------------------
const ORDER = [
  ['hearthhome', 'Hearthhome, the green', /^greenwold_hearthhome$/],
  ['standinghedge', 'The Standing Hedge, the ring', /^greenwold_hedge_\d$/],
  ['millrun', 'The Mill Run, the river and the wheat', /^greenwold_millrun$/],
  ['beechhangar', 'The Beech Hangar, the wood', /^greenwold_beechhangar$/],
  ['chalkpits', 'The Chalk Pits, the scar', /^greenwold_chalkpits$/],
  ['oldcellars', 'The Old Cellars, the hollow', /^greenwold_oldcellars$/],
  ['kingsroad', 'The Kingsroad, the paved way in', /^greenwold_kingsroad_/],
  ['highwaymanshollow', "Highwayman's Hollow, the camp", /^greenwold_highwaymanshollow$/],
  ['sunkenchapel', 'The Sunken Chapel, the water', /^greenwold_sunkenchapel$/],
  ['longmeadow', 'The Long Meadow', /^greenwold_longmeadow$/],
  ['watermeadows', 'The Water Meadows', /^greenwold_watermeadows$/],
  ['coldwake', 'Coldwake, the hamlet', /^greenwold_coldwake$/],
  [null, 'The country between: fields, pastures, copses and banks', /^greenwold_/],
];
const files = readdirSync(SPACE_DIR).filter((f) => f.startsWith('greenwold_') && f.endsWith('.json'));
const spaces = files.map((f) => JSON.parse(readFileSync(join(SPACE_DIR, f), 'utf8')));
const claimed = new Set();
const TREE = /^(oak|beech|birch|willow|ash|elm|pine|spruce|fir|yew)(_[a-z])?$/;

/** id -> { n, spaces, how } for one group of spaces. */
function usesIn(group) {
  const uses = new Map();
  const add = (id, how, sid) => {
    const e = uses.get(id) || { n: 0, spaces: new Set(), how: new Set() };
    e.n++; e.spaces.add(sid.replace(/^greenwold_/, '')); e.how.add(how); uses.set(id, e);
  };
  for (const s of group) {
    for (const p of s.pieces || []) add(p.model, 'stands', s.id);
    for (const r of s.runs || []) add(r.model, 'runs', s.id);
  }
  return uses;
}
const rockKinds = new Map();
for (const s of spaces) for (const r of s.rocks || []) rockKinds.set(r.kind, (rockKinds.get(r.kind) || 0) + 1);

const sections = [];
const seen = new Set();
for (const [zoneId, title, re] of ORDER) {
  const group = spaces.filter((s) => re.test(s.id) && !claimed.has(s.id));
  for (const s of group) claimed.add(s.id);
  const uses = usesIn(group);
  // what the guide says this zone needs, placed or not
  // `models` are ids; `wanted` is sentences ("a heron"), kept as a note
  const guideModels = zoneId && GUIDE_BY_ID[zoneId] ? [...(GUIDE_BY_ID[zoneId].models || []), ...(GUIDE_BY_ID[zoneId].wanted || [])].filter((id) => /^[a-z0-9_]+$/.test(id)) : [];
  const wanted = zoneId && GUIDE_BY_ID[zoneId] ? (GUIDE_BY_ID[zoneId].wanted || []).filter((w) => !/^[a-z0-9_]+$/.test(w)) : [];
  const ids = new Set([...uses.keys(), ...guideModels]);
  const rows = [];
  for (const id of ids) {
    if (TREE.test(id)) continue;
    const u = uses.get(id);
    const fp = FOOTPRINT[id];
    rows.push({
      id, n: u ? u.n : 0, where: u ? [...u.spaces].join(', ') : 'not placed yet',
      how: u ? [...u.how].join(' and ') : 'the guide lists it',
      size: fp ? `${fp[0]} by ${fp[1]} by ${fp[2]} m` : null,
      made: made.has(id), words: WORDS.get(id) || null, firstHere: !seen.has(id),
    });
    seen.add(id);
  }
  rows.sort((a, b) => (FOOTPRINT[b.id]?.[2] || 0) - (FOOTPRINT[a.id]?.[2] || 0) || a.id.localeCompare(b.id));
  sections.push({ zoneId, title, spaces: group.map((s) => s.id), rows, wanted });
}
const trees = new Map();
for (const s of spaces) for (const p of s.pieces || []) if (TREE.test(p.model)) trees.set(p.model, (trees.get(p.model) || 0) + 1);

const all = new Map();
for (const sec of sections) for (const r of sec.rows) if (!all.has(r.id)) all.set(r.id, r);
const distinct = [...all.values()];
const nMade = distinct.filter((r) => r.made).length;
const nNoFoot = distinct.filter((r) => !r.size).length;
const nToMake = distinct.length - nMade;
const date = new Date().toISOString().slice(0, 10);
const heightWord = (id) => { const f = FOOTPRINT[id]; if (!f) return ''; const [w, , h] = f; return h >= 7 ? 'large building' : (h >= 4 && w >= 4) ? 'building' : h >= 2 || w >= 4 ? 'structure' : 'prop'; };

// ---- markdown --------------------------------------------------------------
const md = [];
md.push('# The Greenwold: every structure to make');
md.push('');
md.push(`Generated ${date} by scripts/export-greenwold-structures.mjs from the ${spaces.length} greenwold spaces in src/mmo/spaces, the guide's per zone lists, src/mmo/plans/footprints.js and public/models/props/manifest.json. ${distinct.length} distinct structures: ${nMade} made, ${nToMake} to make${nNoFoot ? `, ${nNoFoot} with no footprint row (never loaded until one is added)` : ''}. Sizes are the FOOTPRINT the game scales a model to, width by depth by height. The words and prompts are MODELS.md's; the spec (glb, metres, Y up, budgets by height, validator) is at the top of that file.`);
md.push('');
md.push('A structure that is not made yet stands in the game as a stand-in body of its footprint, so the layout can be walked before the model exists. Each section is one zone, in the order the first hour meets them; a structure is listed under the first zone that needs it and counted again where it recurs.');
md.push('');
for (const sec of sections) {
  const need = sec.rows.filter((r) => r.firstHere);
  const again = sec.rows.filter((r) => !r.firstHere);
  md.push(`## ${sec.title}`);
  md.push('');
  md.push(`Spaces: ${sec.spaces.map((s) => `\`${s}\``).join(', ') || 'none yet'}. ${need.length} new here${again.length ? `, ${again.length} already listed above (${again.map((r) => `\`${r.id}\``).join(', ')})` : ''}.`);
  md.push('');
  if (sec.wanted.length) { md.push(`The guide also wants, with no id yet: ${sec.wanted.join('; ')}.`); md.push(''); }
  if (need.length) {
    md.push('| id | what | size | kind | in this zone | status |');
    md.push('|---|---|---|---|---|---|');
    for (const r of need) {
      const status = r.made ? 'MADE' : !r.size ? 'NO FOOTPRINT: add a row to footprints.js or it never loads' : 'to make';
      md.push(`| \`${r.id}\` | ${r.words ? r.words.what : (r.n ? '' : 'listed by the guide, not placed yet')} | ${r.size || ''} | ${heightWord(r.id)} | ${r.n ? `${r.n} (${r.how}) in ${r.where}` : r.where} | ${status} |`);
    }
    md.push('');
  }
}
md.push('## Dressing the game already draws in code');
md.push('');
md.push('These stand in the spaces under `rocks` and are drawn by src/world/dressing_models.js. No file is needed; a model for one would be a replacement, not a gap.');
md.push('');
md.push([...rockKinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `\`${k}\` (${n})`).join(', '));
md.push('');
md.push('## Trees with files of their own');
md.push('');
md.push('Not structures, but models: the spaces stand these as pieces and the game loads a glb per id. The species scattered as `trees` (beech, oak, birch, willow) are grown by the tree system and are not on this list.');
md.push('');
md.push('| id | what | size | stands | status |');
md.push('|---|---|---|---|---|');
for (const [id, n] of [...trees.entries()].sort((a, b) => b[1] - a[1])) {
  const fp = FOOTPRINT[id];
  md.push(`| \`${id}\` | ${WORDS.get(id)?.what || ''} | ${fp ? `${fp[0]} by ${fp[1]} by ${fp[2]} m` : ''} | ${n} | ${made.has(id) ? 'MADE' : 'to make'} |`);
}
md.push('');
md.push('## Prompts');
md.push('');
md.push('One line per structure still to make, MODELS.md\'s prompt with the size the game wants, for pasting into a modelling tool. Attach the zone\'s concept image.');
md.push('');
for (const r of distinct.filter((x) => !x.made && x.words && x.words.prompt)) {
  md.push(`- \`${r.id}\`${r.size ? ` (${r.size})` : ''}: ${r.words.prompt}`);
}
md.push('');
mkdirSync(dirname(OUT_MD), { recursive: true });
writeFileSync(OUT_MD, md.join('\n'));

// ---- the codex page ---------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = [];
h.push(`<title>Greenwold Structures</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"><style>
:root{--ground:#f3ecdc;--panel:#eae1cb;--ink:#23201a;--ink2:#4f4838;--mute:#7d735f;--gold:#8a6d2a;--rule:#cdbf9c;--sel:#e0d2ad;--red:#9b3b2a;--green:#3f6b3a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ground:#15130f;--panel:#1d1a14;--ink:#e8dfc8;--ink2:#c9bda0;--mute:#8d8368;--gold:#c9a75a;--rule:#3a332a;--sel:#2a251c;--red:#d0705c;--green:#7fae72}}
:root[data-theme="dark"]{--ground:#15130f;--panel:#1d1a14;--ink:#e8dfc8;--ink2:#c9bda0;--mute:#8d8368;--gold:#c9a75a;--rule:#3a332a;--sel:#2a251c;--red:#d0705c;--green:#7fae72}
body{background:var(--ground);color:var(--ink);font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;line-height:1.5;margin:0}
.wrap{max-width:1100px;margin:0 auto;padding:40px 28px 90px}
h1,h2,h3{font-family:Cinzel,Georgia,serif;font-weight:600;letter-spacing:.02em;text-wrap:balance;color:var(--ink)}
h1{font-size:34px;margin:0 0 6px}h2{font-size:22px;margin:44px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--rule);color:var(--gold)}h3{font-size:19px;margin:28px 0 6px}
.lede{color:var(--ink2);font-style:italic;margin:0 0 10px;max-width:66ch}
p{max-width:76ch}
.tbl{overflow-x:auto;margin:10px 0 18px}
table{border-collapse:collapse;width:100%;font-size:16px}
th{font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule)}
td{padding:7px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover{background:var(--sel)}
li{max-width:90ch;margin:3px 0}
code{font-family:ui-monospace,Menlo,monospace;font-size:14px;background:var(--panel);padding:1px 5px;border-radius:3px}
.no{color:var(--red);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.yes{color:var(--green);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.todo{color:var(--gold);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.note{color:var(--mute);font-size:16px}
.count{color:var(--mute);font-size:15px;margin:2px 0 14px}
.back{display:inline-block;margin-bottom:18px;color:var(--gold)}
strong{color:var(--ink)}
</style><div class="wrap"><a class="back" href="index.html">The codex</a><h1>The Greenwold: every structure to make</h1><p class="lede">Read off the spaces that stand them, the guide's zone lists, the footprint table and the folder of finished models, so the list is what the world asks for and not a memory of it.</p>`);
h.push(`<p class="count">${distinct.length} distinct structures across ${spaces.length} spaces: <span class="yes">${nMade} made</span>, <span class="todo">${nToMake} to make</span>${nNoFoot ? `, <span class="no">${nNoFoot} with no footprint</span>` : ''}. Generated ${date}. Sizes are width by depth by height in metres, the footprint the game scales a model to. A structure not made yet stands in the game as a stand-in body of its footprint.</p>`);
h.push(`<p class="note">Each section is one zone in the order the first hour meets them. A structure is listed under the first zone that needs it and named again where it recurs. The spec every model is built to (glb, metres, Y up, budgets by height, the validator) is in <code>docs/concepts/greenwold/MODELS.md</code>.</p>`);
for (const sec of sections) {
  const need = sec.rows.filter((r) => r.firstHere);
  const again = sec.rows.filter((r) => !r.firstHere);
  h.push(`<h2>${esc(sec.title)}</h2>`);
  h.push(`<p class="count">${sec.spaces.map((s) => `<code>${esc(s)}</code>`).join(', ') || 'no space yet'}. ${need.length} new here${again.length ? `, ${again.length} listed above: ${again.map((r) => `<code>${esc(r.id)}</code>`).join(', ')}` : ''}.</p>`);
  if (sec.wanted.length) h.push(`<p class="note">The guide also wants, with no id yet: ${esc(sec.wanted.join('; '))}.</p>`);
  if (!need.length) continue;
  h.push('<div class="tbl"><table><thead><tr><th>id</th><th>what</th><th>size</th><th>kind</th><th>in this zone</th><th>status</th></tr></thead><tbody>');
  for (const r of need) {
    const status = r.made ? '<span class="yes">made</span>' : !r.size ? '<span class="no">no footprint</span>' : '<span class="todo">to make</span>';
    h.push(`<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.words ? r.words.what : (r.n ? '' : 'listed by the guide, not placed yet'))}</td><td>${esc(r.size || '')}</td><td>${esc(heightWord(r.id))}</td><td>${r.n ? `${r.n} (${esc(r.how)}) in ${esc(r.where)}` : esc(r.where)}</td><td>${status}</td></tr>`);
  }
  h.push('</tbody></table></div>');
}
h.push('<h2>Dressing the game already draws in code</h2>');
h.push(`<p>These stand in the spaces under <code>rocks</code> and are drawn by the dressing system. No file is needed; a model for one would be a replacement, not a gap.</p><p class="note">${[...rockKinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<code>${esc(k)}</code> (${n})`).join(', ')}</p>`);
h.push('<h2>Trees with files of their own</h2>');
h.push('<p>Not structures, but models: the spaces stand these as pieces and the game loads a glb per id. The species scattered as trees are grown by the tree system and are not on this list.</p>');
h.push('<div class="tbl"><table><thead><tr><th>id</th><th>what</th><th>size</th><th>stands</th><th>status</th></tr></thead><tbody>');
for (const [id, n] of [...trees.entries()].sort((a, b) => b[1] - a[1])) {
  const fp = FOOTPRINT[id];
  h.push(`<tr><td><code>${esc(id)}</code></td><td>${esc(WORDS.get(id)?.what || '')}</td><td>${fp ? `${fp[0]} by ${fp[1]} by ${fp[2]} m` : ''}</td><td class="num">${n}</td><td>${made.has(id) ? '<span class="yes">made</span>' : '<span class="todo">to make</span>'}</td></tr>`);
}
h.push('</tbody></table></div>');
h.push('<h2>Prompts</h2><p>One line per structure still to make: the prompt with the size the game wants, for pasting into a modelling tool with the zone\'s concept image attached.</p><ul>');
for (const r of distinct.filter((x) => !x.made && x.words && x.words.prompt)) {
  h.push(`<li><code>${esc(r.id)}</code>${r.size ? ` (${esc(r.size)})` : ''}: ${esc(r.words.prompt)}</li>`);
}
h.push('</ul></div>');
mkdirSync(dirname(OUT_HTML), { recursive: true });
writeFileSync(OUT_HTML, h.join('\n'));

console.log(`${distinct.length} structures: ${nMade} made, ${nToMake} to make, ${nNoFoot} without a footprint; ${trees.size} tree models; ${rockKinds.size} code-drawn dressing kinds.`);
console.log(`written: ${OUT_MD}\n         ${OUT_HTML}`);
if (nNoFoot) console.log('no footprint: ' + distinct.filter((r) => !r.size).map((r) => r.id).join(', '));
