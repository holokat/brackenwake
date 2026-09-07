// Every monster and animal the Greenwold can put in front of a player, read
// off the tables that spawn them, grouped by the SKELETON each body shares.
//
//   node scripts/export-greenwold-monsters.mjs
//
// Writes docs/concepts/greenwold/MONSTERS.md and wiki/site/monsters.html and
// prints the counts. Rerun it whenever monsters.js, the habitat tables, the
// fauna table or a greenwold space changes; the list is generated, never
// typed, so a row that spawns cannot be quietly left off it.
//
// WHO IS ON IT. The union of: the meadow habitat (the open country between the
// places, day and night), the nine Greenwold places' own tables, every spawn
// row in the greenwold_* spaces, the bosses whose lair is one of those places,
// and the animals fauna.js grows in the meadow. Anything spawned that has no
// row in monsters.js is flagged in red, because that is a bug and not a gap.
//
// THE RIGS. One skeleton per family, so a bandit, a bandit archer, a Legion
// soldier and a scarecrow are ONE rig with swappable heads, outfits and
// weapons, and every clip authored once retargets to all of them. The rig
// table below is the modelling plan; `auditRigs` fails the run if a roster id
// has no rig, so a new row cannot arrive without saying what skeleton it rides.

import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../src/mmo/monsters.js';
import { PLACES, REALMS } from '../src/mmo/realms.js';
import { CRITTERS } from '../src/world/fauna.js';
import { TIER_HEIGHT, FAMILY_HEIGHT, MONSTER_SCALE } from '../src/game/monster_models.js';
import { RANGED_TAGS } from '../src/game/monster_ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_MD = join(ROOT, 'docs', 'concepts', 'greenwold', 'MONSTERS.md');
const OUT_HTML = join(ROOT, 'wiki', 'site', 'monsters.html');
const GLB_DIR = join(ROOT, 'public', 'models', 'mmo');

const ROWS = new Map((M.MONSTER_LIST || Object.values(M.MONSTERS)).map((r) => [r.id, r]));
for (const b of M.BOSSES) if (!ROWS.has(b.id)) ROWS.set(b.id, { ...b, boss: true });
const realm = REALMS.find((r) => r.id === 'greenwold');
const PLACE_NAME = Object.fromEntries((realm.places || []).map((p) => [p.id, p.name]));
const GREENWOLD_PLACES = (realm.places || []).map((p) => p.id);

// ---- where each id turns up ------------------------------------------------
/** id -> Set of "place, day|night" strings */
const WHERE = new Map();
const at = (id, words) => { if (!WHERE.has(id)) WHERE.set(id, new Set()); WHERE.get(id).add(words); };
for (const id of M.HABITAT.meadow.day) at(id, 'the open country by day');
for (const id of M.HABITAT.meadow.night) at(id, 'the open country by night');
for (const pid of GREENWOLD_PLACES) {
  const h = M.HABITAT_BY_PLACE[pid];
  if (!h) continue;
  const name = PLACE_NAME[pid] || pid;
  const both = new Set(h.day.filter((id) => h.night.includes(id)));
  for (const id of new Set([...h.day, ...h.night])) {
    at(id, both.has(id) ? name : h.day.includes(id) ? `${name} by day` : `${name} by night`);
  }
}
const SPACE_DIR = join(ROOT, 'src', 'mmo', 'spaces');
const spaceSpawns = new Map();
for (const f of readdirSync(SPACE_DIR).filter((x) => x.startsWith('greenwold_') && x.endsWith('.json'))) {
  const s = JSON.parse(readFileSync(join(SPACE_DIR, f), 'utf8'));
  for (const sp of s.spawns || []) {
    at(sp.id, `${s.name}${sp.night ? ' by night' : ''} (placed)`);
    spaceSpawns.set(sp.id, (spaceSpawns.get(sp.id) || 0) + 1);
  }
}
for (const b of M.BOSSES) if (GREENWOLD_PLACES.includes(b.lair)) at(b.id, `${PLACE_NAME[b.lair] || b.lair}, its lair`);
for (const [id, c] of Object.entries(CRITTERS)) if ((c.biomes || []).includes('meadow')) at(id, 'grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it)');

const ROSTER = [...WHERE.keys()].sort((a, b) => {
  const ra = ROWS.get(a), rb = ROWS.get(b);
  return ((ra?.tier ?? 99) - (rb?.tier ?? 99)) || a.localeCompare(b);
});
const missing = ROSTER.filter((id) => !ROWS.has(id));

// ---- the rigs: one skeleton, many bodies -----------------------------------
const RIGS = [
  {
    id: 'human', name: 'The human rig', height: '1.7 to 1.9 m',
    skeleton: 'The game\'s own human skeleton: the same one the player bodies (human-slim, human-medium, human-heavy) ride, so every clip already authored for the player retargets. One skin per body, under 100 bones, feet on y = 0.',
    parts: [
      'base body: slim, medium or heavy, the three the studio already exports',
      'head set: six heads and four hairs, swapped per row so a pack of three bandits is three faces',
      'outfit sets, one per row family: stolen coats (bandit, raider), hedgerow green (bandit archer), a good dark coat and cloak (highwayman), black Legion plate with the square shield (soldier) and its lighter archer cut, a breastplate over the plate (Oram Blackhand), sacking and straw over poles (scarecrow), the rotten villager (zombie), the waterlogged sailor (drowned), a hooded shade with no legs (wraith)',
      'weapon sets on the hand bones: dagger, rapier, axe, shortsword and buckler, shortsword and square shield, bow and quiver, longsword',
    ],
    clips: 'idle, walk, run, swing (a dagger slash and a rapier thrust as two variants), hurt, die, cast. The archers use `cast` as draw and loose, so author it as one; the Legion wants block and a shield raise; the scarecrow, the zombie and the drowned want a slow shamble in place of run (their run speed is 3 to 3.6 m/s); the wraith hovers, so its idle and walk are a drift a hand off the ground.',
    ids: ['bandit', 'banditArcher', 'highwayman', 'raider', 'legionSoldier', 'legionArcher', 'oramBlackhand', 'scarecrow', 'zombie', 'drowned', 'wraith'],
  },
  {
    id: 'skeleton', name: 'The skeleton rig', height: '1.8 m',
    skeleton: 'The human skeleton again, with a bones mesh on it: the same bone names and rest pose, so it shares every human clip, and only its die (a collapse into a heap) is its own.',
    parts: ['the bones', 'shortsword and buckler on the hand bones', 'a rusted helm and a torn tabard as optional swaps, for the warrior variant later'],
    clips: 'the human set, plus a collapse for die.',
    ids: ['skeleton'],
  },
  {
    id: 'goblin', name: 'The goblin rig', height: '1.2 to 1.35 m',
    skeleton: 'A short biped with a big head and long arms. Its own skeleton, because the proportions do not retarget cleanly from the human one; two bodies share it.',
    parts: ['scout: dagger and a bandolier of throwing knives, leather', 'warrior: shortsword and buckler, a stockier torso and a scrap helm'],
    clips: 'idle, walk, run, swing, hurt, die, cast. The scout is a thrower: its `cast` is an overarm knife throw and it holds its ground, so a wary idle with the knife up reads right.',
    ids: ['goblinScout', 'goblinWarrior'],
  },
  {
    id: 'canine', name: 'The canine rig', height: '0.4 to 0.8 m at the shoulder',
    skeleton: 'One four legged runner. The wolf is the base; the wild dog is it at three quarters, the badger at a half with a flatter back, the fox a lean tail-heavy variant of the same bones.',
    parts: ['wolf: grey, lean', 'wild dog: a mongrel coat, ragged ears', 'badger: black and white face, low and broad, the same skeleton squashed', 'fox: russet, brush tail, on the same bones scaled'],
    clips: 'idle, walk, lope (run at up to 8.5 m/s), bite, hurt, die, plus a howl (the wild dog pack), a circling idle for the wolf near you, a tail-down flee.',
    ids: ['wolf', 'wildDog', 'badger', 'fox'],
  },
  {
    id: 'boar', name: 'The boar rig', height: '1.0 m at the shoulder; Old Grist the size of a pony',
    skeleton: 'A heavy quadruped with a short neck and a charge. Old Grist is the same skeleton scaled up with a grey spine and one broken tusk; the code stands him on the wolf body today, which is why the row says wolf.',
    parts: ['boar: black bristles, tusks', 'Old Grist: scaled 1.6, grey spined, one tusk broken, scars'],
    clips: 'idle (rooting), walk, run, charge (a lowered head run, one shot), gore (swing), hurt, die.',
    ids: ['boar', 'oldGrist'],
  },
  {
    id: 'rat', name: 'The rat rig', height: '0.5 m long plus tail; the mouse a tenth of it',
    skeleton: 'A scurrier. The giant rat is the base; the field mouse is the same bones tiny.',
    parts: ['giant rat: mangy, a wet mouth', 'field mouse: the same at a tenth'],
    clips: 'idle, scurry (walk and run), bite, hurt, die, a freeze for the mouse.',
    ids: ['giantRat', 'fieldMouse'],
  },
  {
    id: 'spider', name: 'The spider rig', height: '0.8 m, a metre and a half across',
    skeleton: 'Eight legs and an abdomen. One body here; the blossom spider of the next realm is a recolour.',
    parts: ['giant spider: brown, banded legs'],
    clips: 'idle, walk, run, bite, hurt, die, and a web spit (its `cast`, which roots you).',
    ids: ['giantSpider'],
  },
  {
    id: 'grub', name: 'The grub rig', height: '1.0 m long',
    skeleton: 'A segmented crawler with a thorned head, a spine of ten segments.',
    parts: ['thorn grub: pale, thorned head'],
    clips: 'idle, crawl (its run is 2 m/s, so one cycle serves for walk and run), a lunging bite, hurt, die.',
    ids: ['thornGrub'],
  },
  {
    id: 'wisp', name: 'The wisp', height: '0.4 m, in the air',
    skeleton: 'No skeleton: a light with a core, a shader thing. Flies, drifts, and its `cast` is a flare.',
    parts: ['a core, a halo, a trail'],
    clips: 'a drift loop, a flare (cast), a gutter (hurt), a going out (die).',
    ids: ['wisp'],
  },
  {
    id: 'bird', name: 'The bird rig', height: '0.3 to 0.7 m',
    skeleton: 'One bird skeleton with wings, scaled: the goose walks and swims, the hawk soars and stoops, the crow and the gull are the same at their sizes.',
    parts: ['goose: white, upright', 'hawk: raptor, barred', 'crow: black', 'gull: white and grey'],
    clips: 'perched idle, walk (a waddle for the goose), take off, fly loop, land, and for the hawk a stoop with the wings folded; a wing flap threat for the goose.',
    ids: ['goose', 'hawk', 'crow', 'gull'],
  },
  {
    id: 'deer', name: 'The deer rig', height: '1.4 m at the shoulder',
    skeleton: 'A long legged quadruped with a carried head. Its own bones; nothing else here walks like it.',
    parts: ['deer: red brown, a doe and a stag with antlers as the one swap'],
    clips: 'graze idle, walk, bolt (run with the head high), a startle, hurt, die.',
    ids: ['deer'],
  },
  {
    id: 'small', name: 'The small animals', height: '0.15 to 0.4 m',
    skeleton: 'Three tiny bodies, each its own: they hop or sit rather than walk, and none of them fights.',
    parts: ['rabbit: long ears, a hop cycle', 'squirrel: a tail, a climb', 'frog: a sit, a hop, a throat pulse'],
    clips: 'sit idle, hop (walk and run), a startle, die.',
    ids: ['rabbit', 'squirrel', 'frog'],
  },
];
const RIG_OF = new Map();
for (const rig of RIGS) for (const id of rig.ids) RIG_OF.set(id, rig.id);
function auditRigs() {
  const bad = [];
  for (const id of ROSTER) if (!RIG_OF.has(id) && ROWS.has(id)) bad.push(`${id} spawns in the Greenwold and rides no rig`);
  for (const [id, rig] of RIG_OF) if (!ROWS.has(id)) bad.push(`the ${rig} rig names ${id}, which is not a monster`);
  if (bad.length) throw new Error(`auditRigs: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
}
auditRigs();

// ---- the words for each row ------------------------------------------------
const TAG_MOVE = {
  charges: 'a charge', knockback: 'a charge that throws you', alpha: 'a charge', howl: 'a howl', warCry: 'a shout', shield: 'a block',
  shieldWall: 'a shield raise', ambush: 'a crouched wait', awakens: 'a wake from stillness', flying: 'take off, fly, land', dives: 'a stoop',
  casts: 'a cast', webRoot2: 'a web spit', summons: 'a whistle', bow: 'draw and loose', throwsKnives: 'an overarm throw',
  slow: 'a shamble in place of run', incorporeal50: 'a hover', manaDrain: 'a reach', poisonTouch: 'clawed hands', disease10: 'a wet mouth',
  poison1: 'a lunge', poison2: 'a lunge', erratic: 'a wandering approach', dives2: 'a stoop',
};
const movesOf = (r) => {
  const out = [];
  for (const t of r.notes || []) {
    const key = Object.keys(TAG_MOVE).find((k) => t === k || t.startsWith(k.replace(/\d+$/, '')));
    if (key && !out.includes(TAG_MOVE[key])) out.push(TAG_MOVE[key]);
  }
  const ranged = (r.notes || []).map((t) => RANGED_TAGS[t]).find(Boolean);
  if (ranged && !out.some((m) => /throw|draw/.test(m))) out.push(`ranged, ${ranged}`);
  return out;
};
const standIn = (r) => {
  const base = FAMILY_HEIGHT[r.family] ?? TIER_HEIGHT[r.tier] ?? 1;
  return `${(base * (MONSTER_SCALE[r.id] ?? 1)).toFixed(2)} m`;
};
const glbs = existsSync(GLB_DIR) ? readdirSync(GLB_DIR).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')) : [];
const GLB_FOR = { giantRat: 'monster-rat', goblinScout: 'monster-goblin', goblinWarrior: 'monster-goblin', skeleton: 'monster-skeleton', zombie: 'monster-zombie', giantSpider: 'monster-spider', caveBat: 'monster-bat' };
const fileOf = (id) => (GLB_FOR[id] && glbs.includes(GLB_FOR[id]) ? `${GLB_FOR[id]}.glb (stand-in)` : '');
const groupWords = (g) => (!g ? '' : g[0] === g[1] ? (g[0] === 1 ? 'alone' : `${g[0]}`) : `${g[0]} to ${g[1]}`);
const kindWord = (r) => (r.boss ? 'boss' : M.isUniqueRow && M.isUniqueRow(r) ? 'unique' : r.kind);

// ---- counts, the variety measured -----------------------------------------
const byTier = {}, byKind = {}, byRig = {};
let dayN = 0, nightN = 0;
for (const id of ROSTER) {
  const r = ROWS.get(id); if (!r) continue;
  byTier[r.tier] = (byTier[r.tier] || 0) + 1;
  byKind[kindWord(r)] = (byKind[kindWord(r)] || 0) + 1;
  byRig[RIG_OF.get(id)] = (byRig[RIG_OF.get(id)] || 0) + 1;
  const w = [...WHERE.get(id)].join(' ');
  if (/by day|^the open country by day|\(placed\)$/.test(w) || !/by night/.test(w)) dayN++;
  if (/night/.test(w)) nightN++;
}
const fighters = ROSTER.filter((id) => ROWS.get(id) && ROWS.get(id).tier >= 1);
const date = new Date().toISOString().slice(0, 10);

// The gaps a read of the counts shows. Wants, not rows: none of these is in
// the code, and the day one is, this list is what says it is no longer a gap.
const GAPS = [
  'Nothing flies at you by day: the wisp and the wraith are night rows, the hawk is an animal. A daytime flyer over the downs (a carrion crow that mobs, or a harpy scout from the next realm at tier 3) would give the archers something to shoot up.',
  'Only one boss and one unique in the realm: Oram Blackhand under the Cellars and Old Grist in the hangar. The Sunken Chapel\'s wraith is the closest thing to a third; the doc names a skeleton sexton for the chapel and a bandit chief for the Hollow, and neither is a row yet.',
  'The undead are all night rows except in the chapel and the pits. A daytime undead in the Cellars\' mouth (a bone hound at tier 3) would make the first dungeon door read as one.',
  'Every humanoid is a coat on the human rig. That is the point of the rig, and it also means the zone\'s variety by day is bandits of four names; the goblin warrior only ever stands in the Cellars.',
];

// ---- markdown ----------------------------------------------------------------
const md = [];
md.push('# The Greenwold: every monster and animal, by the skeleton it rides');
md.push('');
md.push(`Generated ${date} by scripts/export-greenwold-monsters.mjs from src/mmo/monsters.js (rows, habitat, places, bosses), src/world/fauna.js (the animals) and the ${readdirSync(SPACE_DIR).filter((x) => x.startsWith('greenwold_')).length} greenwold spaces' spawn rows. ${ROSTER.length} bodies: ${fighters.length} that fight and ${ROSTER.length - fighters.length} animals, on ${RIGS.filter((r) => r.ids.some((id) => ROSTER.includes(id))).length} rigs.${missing.length ? ` **${missing.length} spawn with no row in monsters.js: ${missing.join(', ')}.**` : ''}`);
md.push('');
md.push('What each one DOES in play, tag by tag and number by number, is docs/mmo/17-GREENWOLD-BESTIARY.md; this file is the modelling list. Every body has a procedural stand-in in monster_models.js today, and a few ride a studio glb; the file column says which.');
md.push('');
md.push('## The plan: one skeleton per rig, many bodies');
md.push('');
md.push('A rig is one skeleton, one rest pose, one set of clips. The bodies on it swap heads, outfits and weapons on the same bones, so a bandit archer is a bandit with a bow and a green coat and not a second model. Author the clips once per rig. The list of clips every body needs, and what triggers each, is section 1 of the bestiary doc: idle, walk, run, swing, hurt, cast, die; the rows below add to it.');
md.push('');
for (const rig of RIGS) {
  const here = rig.ids.filter((id) => ROSTER.includes(id));
  if (!here.length) continue;
  md.push(`### ${rig.name} (${here.length} ${here.length === 1 ? 'body' : 'bodies'}, ${rig.height})`);
  md.push('');
  md.push(rig.skeleton);
  md.push('');
  md.push('Swappable parts:');
  for (const p of rig.parts) md.push(`- ${p}`);
  md.push('');
  md.push(`Clips: ${rig.clips}`);
  md.push('');
  md.push('| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const id of here) {
    const r = ROWS.get(id);
    md.push(`| \`${id}\` | ${r.name} | ${r.tier} | ${kindWord(r)} | ${groupWords(r.group)} | ${r.run ?? ''} | ${movesOf(r).join(', ') || 'the base set'} | ${[...WHERE.get(id)].join('; ')} | ${standIn(r)} | ${fileOf(id) || 'code body'} |`);
  }
  md.push('');
}
md.push('## The variety, counted');
md.push('');
md.push(`By tier: ${Object.entries(byTier).map(([t, n]) => `tier ${t}: ${n}`).join(', ')}. By kind: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}. By rig: ${Object.entries(byRig).map(([k, n]) => `${k} ${n}`).join(', ')}. ${dayN} can be met by day and ${nightN} by night.`);
md.push('');
md.push('Gaps a read of the counts shows. These are wants, not rows; nothing here is in the code.');
md.push('');
for (const g of GAPS) md.push(`- ${g}`);
md.push('');
if (missing.length) {
  md.push('## Spawned with no row');
  md.push('');
  for (const id of missing) md.push(`- \`${id}\`: ${[...WHERE.get(id)].join('; ')}`);
  md.push('');
}
mkdirSync(dirname(OUT_MD), { recursive: true });
writeFileSync(OUT_MD, md.join('\n'));

// ---- the codex page -----------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = [];
h.push(`<title>Greenwold Monsters</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"><style>
:root{--ground:#f3ecdc;--panel:#eae1cb;--ink:#23201a;--ink2:#4f4838;--mute:#7d735f;--gold:#8a6d2a;--rule:#cdbf9c;--sel:#e0d2ad;--red:#9b3b2a;--green:#3f6b3a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ground:#15130f;--panel:#1d1a14;--ink:#e8dfc8;--ink2:#c9bda0;--mute:#8d8368;--gold:#c9a75a;--rule:#3a332a;--sel:#2a251c;--red:#d0705c;--green:#7fae72}}
:root[data-theme="dark"]{--ground:#15130f;--panel:#1d1a14;--ink:#e8dfc8;--ink2:#c9bda0;--mute:#8d8368;--gold:#c9a75a;--rule:#3a332a;--sel:#2a251c;--red:#d0705c;--green:#7fae72}
body{background:var(--ground);color:var(--ink);font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;line-height:1.5;margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:40px 28px 90px}
h1,h2,h3{font-family:Cinzel,Georgia,serif;font-weight:600;letter-spacing:.02em;text-wrap:balance;color:var(--ink)}
h1{font-size:34px;margin:0 0 6px}h2{font-size:22px;margin:44px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--rule);color:var(--gold)}h3{font-size:19px;margin:30px 0 6px}
.lede{color:var(--ink2);font-style:italic;margin:0 0 10px;max-width:70ch}
p{max-width:80ch}
.tbl{overflow-x:auto;margin:10px 0 18px}
table{border-collapse:collapse;width:100%;font-size:16px}
th{font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule)}
td{padding:7px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover{background:var(--sel)}
li{max-width:90ch;margin:3px 0}
code{font-family:ui-monospace,Menlo,monospace;font-size:14px;background:var(--panel);padding:1px 5px;border-radius:3px}
.no{color:var(--red);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.note{color:var(--mute);font-size:16px}
.count{color:var(--mute);font-size:15px;margin:2px 0 14px}
.back{display:inline-block;margin-bottom:18px;color:var(--gold)}
strong{color:var(--ink)}
</style><div class="wrap"><a class="back" href="index.html">The codex</a><h1>The Greenwold: every monster and animal, by the skeleton it rides</h1><p class="lede">Read off the tables that spawn them, the places' own lists, the spaces' placed spawns and the fauna table, so what is here is what a player meets.</p>`);
h.push(`<p class="count">${ROSTER.length} bodies: ${fighters.length} that fight and ${ROSTER.length - fighters.length} animals, on ${RIGS.filter((r) => r.ids.some((id) => ROSTER.includes(id))).length} rigs. Generated ${date}.${missing.length ? ` <span class="no">${missing.length} spawn with no row: ${esc(missing.join(', '))}</span>` : ''}</p>`);
h.push('<p>A rig is one skeleton, one rest pose, one set of clips. The bodies on it swap heads, outfits and weapons on the same bones, so a bandit archer is a bandit with a bow and a green coat and not a second model. Author the clips once per rig. What each body does in play is the <a href="bestiary.html">bestiary</a>; this page is the modelling list. The stand-in column is the height of the code body the game draws today.</p>');
for (const rig of RIGS) {
  const here = rig.ids.filter((id) => ROSTER.includes(id));
  if (!here.length) continue;
  h.push(`<h2>${esc(rig.name)} <span class="note">${here.length} ${here.length === 1 ? 'body' : 'bodies'}, ${esc(rig.height)}</span></h2>`);
  h.push(`<p>${esc(rig.skeleton)}</p><p class="note">Swappable parts:</p><ul>${rig.parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p class="note">Clips: ${esc(rig.clips)}</p>`);
  h.push('<div class="tbl"><table><thead><tr><th>id</th><th>name</th><th>tier</th><th>kind</th><th>group</th><th>run m/s</th><th>moves beyond the base clips</th><th>where</th><th>stand-in</th><th>file</th></tr></thead><tbody>');
  for (const id of here) {
    const r = ROWS.get(id);
    h.push(`<tr><td><code>${esc(id)}</code></td><td>${esc(r.name)}</td><td class="num">${r.tier}</td><td>${esc(kindWord(r))}</td><td>${esc(groupWords(r.group))}</td><td class="num">${r.run ?? ''}</td><td>${esc(movesOf(r).join(', ') || 'the base set')}</td><td>${esc([...WHERE.get(id)].join('; '))}</td><td>${esc(standIn(r))}</td><td>${esc(fileOf(id) || 'code body')}</td></tr>`);
  }
  h.push('</tbody></table></div>');
}
h.push('<h2>The variety, counted</h2>');
h.push(`<p>By tier: ${esc(Object.entries(byTier).map(([t, n]) => `tier ${t}: ${n}`).join(', '))}. By kind: ${esc(Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', '))}. By rig: ${esc(Object.entries(byRig).map(([k, n]) => `${k} ${n}`).join(', '))}. ${dayN} can be met by day and ${nightN} by night.</p>`);
h.push('<p class="note">Gaps a read of the counts shows. Wants, not rows; nothing here is in the code.</p><ul>');
for (const g of GAPS) h.push(`<li>${esc(g)}</li>`);
h.push('</ul>');
if (missing.length) { h.push('<h2>Spawned with no row</h2><ul>'); for (const id of missing) h.push(`<li><code>${esc(id)}</code>: ${esc([...WHERE.get(id)].join('; '))}</li>`); h.push('</ul>'); }
h.push('</div>');
writeFileSync(OUT_HTML, h.join('\n'));

console.log(`${ROSTER.length} bodies (${fighters.length} fight, ${ROSTER.length - fighters.length} animals) on ${Object.keys(byRig).length} rigs; by tier ${JSON.stringify(byTier)}; ${missing.length} spawned with no row${missing.length ? ': ' + missing.join(', ') : ''}.`);
console.log(`written: ${OUT_MD}\n         ${OUT_HTML}`);
