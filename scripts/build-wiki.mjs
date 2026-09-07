#!/usr/bin/env node
// Builds the Brackenwake Codex: one HTML page holding every rule table the
// game runs on, read from the rules modules themselves so it cannot drift.
//
//   node scripts/build-wiki.mjs [out.html]
//
// Icons under public/icons are embedded as data URIs so the page stands alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = process.argv[2] || path.join(root, 'docs', 'codex.html');

const A = await import('../src/mmo/abilities.js');
const K = await import('../src/mmo/skills.js');
const O = await import('../src/mmo/openings.js');
const I = await import('../src/mmo/items.js');
const R = await import('../src/mmo/ores.js');
const F = await import('../src/mmo/affixes.js');
const M = await import('../src/mmo/monsters.js');
const C = await import('../src/mmo/combat_rules.js');
const S = await import('../src/mmo/stats.js');
const N = await import('../src/mmo/npcs.js');
const RC = await import('../src/mmo/recipes.js');
const ART = await import('../src/game/icon_art.js');
const W = await import('../src/mmo/realms.js');

// ------------------------------------------------------------------ icons
function dataUri(rel) {
  const p = path.join(root, 'public', rel);
  if (!fs.existsSync(p)) return null;
  return `data:image/webp;base64,${fs.readFileSync(p).toString('base64')}`;
}
const abilityIcons = Object.fromEntries(Object.entries(ART.ABILITY_ICONS).map(([k, v]) => [k, dataUri(v)]));
const itemIcons = Object.fromEntries(Object.entries(ART.ITEM_ICONS).map(([k, v]) => [k, dataUri(v)]));
const gemIcons = Object.fromEntries(Object.entries(ART.GEM_ICONS).map(([k, v]) => [k, dataUri(v)]));
const skillIcons = Object.fromEntries(Object.entries(ART.SKILL_ICONS || {}).map(([k, v]) => [k, dataUri(v)]));

// -------------------------------------------------------------- abilities
const abilities = A.ABILITIES.map((a) => ({
  id: a.id, name: a.name, group: a.group, skill: a.skill, minSkill: a.minSkill, extraReq: a.extraReq, anyOf: a.anyOf,
  cost: a.cost, cooldown: a.cooldown, castTime: a.castTime, moving: a.moving, rooted: a.rooted, range: a.range,
  target: a.target, effect: a.effect, passive: a.passive, requiresShield: a.requiresShield,
  needs: a.needs, description: a.description, spell: A.isSpell ? A.isSpell(a) : !!(a.cost && a.cost.mana),
  needsWords: (() => { const n = A.weaponNeeds ? A.weaponNeeds(a) : a.needs; if (!n) return 'nothing'; if (n.kind === 'none') return 'nothing'; if (n.kind === 'focus') return 'a wand or a staff'; if (n.kind === 'shield') return 'a shield'; if (n.kind === 'instrument') return 'an instrument'; if (n.kind === 'ranged') return 'a bow or crossbow and ammunition'; if (n.kind === 'unarmed') return 'empty hands'; if (n.kind === 'anyMelee') return 'any weapon you swing'; if (n.kind === 'melee' && n.skills) return n.skills.map((s) => A.WEAPON_WORDS[s] || s).join(' or '); return n.kind; })(),
}));

// ----------------------------------------------------------------- skills
const skills = K.SKILLS.map((s) => ({ id: s.id, name: s.name, group: s.group, description: s.description,
  abilities: abilities.filter((a) => a.skill === s.id || (a.anyOf || []).includes(s.id)).map((a) => a.id) }));

// --------------------------------------------------------------- openings
const openings = O.OPENINGS.map((o) => ({
  id: o.id, name: o.name, blurb: o.blurb, stats: o.stats, skills: o.startingSkills || o.skills, coins: o.coins,
  kit: (o.kit || []).map((e) => ({ base: O.itemBaseFor ? O.itemBaseFor(e.base) : e.base, kitId: e.base, count: e.count || 1 })),
  unlocked: abilities.filter((a) => a.skill && (o.startingSkills || o.skills)[a.skill] >= (a.minSkill || 0) && (o.startingSkills || o.skills)[a.skill] > 0).map((a) => a.id),
}));

// ------------------------------------------------------------------ items
const weapons = Object.values(I.WEAPONS).map((w) => ({ ...w, trains: (I.WEAPON_TRAINS || {})[w.id] }));
const tiers = I.ARMOR_TIERS.map((t) => ({ ...t }));
const pieces = I.ARMOR_PIECES.map((p) => ({ ...p }));
const shields = Object.values(I.SHIELDS);
const bases = Object.values(I.BASES).map((b) => ({ id: b.id, name: b.name, kind: b.kind, kinds: b.kinds, slot: b.slot, weight: b.weight, strReq: b.strReq, stack: !!b.stack, material: b.material || null, use: b.use || null, ar: b.ar, tier: b.tier, hands: b.hands, resist: b.resist || null, durability: b.durability }));
const rarity = I.RARITY_ORDER.map((id) => I.RARITY[id]);

// -------------------------------------------------------------- materials
const materials = { ores: R.ORES, alloys: Object.values(R.ALLOYS), woods: R.WOODS, gems: R.GEMS, leathers: R.LEATHERS, woodUses: R.WOOD_USES };

// --------------------------------------------------------------- affixes
const affixes = F.AFFIXES.map((a) => ({ id: a.id, label: a.label, group: a.group, unit: a.unit, kinds: a.kinds, ranges: a.ranges, prefix: a.prefix, suffix: a.suffix, flag: a.flag }));
const powers = F.POWERS.map((p) => ({ id: p.id, name: p.name, prefix: p.prefix, suffix: p.suffix, kinds: p.kinds, text: p.text }));

// --------------------------------------------------------------- monsters
const monsters = M.MONSTER_LIST.map((m) => ({ ...m }));
const bosses = (M.BOSSES || []).map((m) => ({ ...m }));
const habitat = M.HABITAT;
const tierBands = M.TIERS;
// where each monster lives, by named place (M2), inverted from HABITAT_BY_PLACE
const placeName = Object.fromEntries(W.PLACES.map((p) => [p.id, p.name]));
const placeRealm = Object.fromEntries(W.PLACES.map((p) => [p.id, W.REALM_BY_ID?.[p.realm]?.name || p.realm]));
const habitatByPlace = Object.fromEntries(Object.entries(M.HABITAT_BY_PLACE || {}).map(([id, h]) => [id, { name: placeName[id] || id, realm: placeRealm[id] || '', biome: h.biome, day: h.day || [], night: h.night || [] }]));
const livesAt = {};
for (const [id, h] of Object.entries(habitatByPlace)) for (const mid of new Set([...h.day, ...h.night])) (livesAt[mid] ||= []).push(h.name);
const tagMeaning = M.NOTE_TAG_MEANING || {};
const lairName = Object.fromEntries(Object.entries(M.BOSS_BY_LAIR || {}).map(([lair, b]) => [b.id || b, placeName[lair.replace(/_deep$|_throat$/, '')] || lair]));

// ------------------------------------------------------------------ rules
const rules = {
  stats: {
    formulas: [
      ['max health', '30 + CON x 2.0 + STR x 0.5'],
      ['max mana', '10 + WIS x 2.0 + INT x 0.5'],
      ['max stamina', '20 + DEX x 1.5 + CON x 0.5'],
      ['carry (stones)', '40 + STR x 2.0'],
      ['health regen /s', '0.4 + CON x 0.020, doubled out of combat'],
      ['mana regen /s', '0.3 + WIS x 0.025 + Meditation x 0.010, the Meditation part scaled by armour'],
      ['stamina regen /s', '1.0 + DEX x 0.030'],
    ],
    caps: { statCap: S.STAT_CAP, startTotal: S.STAT_START_TOTAL, totalCap: S.STAT_TOTAL_CAP, minAtCreation: S.STAT_MIN_AT_CREATION, skillCap: K.SKILL_CAP, skillTotalCap: K.TOTAL_CAP },
    bands: K.BANDS,
  },
  combat: {
    HIT_BASE: C.HIT_BASE, HIT_PER_SKILL: C.HIT_PER_SKILL, HIT_MIN: C.HIT_MIN, HIT_MAX: C.HIT_MAX, TACTICS_TO_HIT: C.TACTICS_TO_HIT,
    DODGE_PER_DEX: C.DODGE_PER_DEX, DODGE_CAP: C.DODGE_CAP, PARRY_PER_SKILL: C.PARRY_PER_SKILL, PARRY_CAP: C.PARRY_CAP,
    DAMAGE_PER_STR: C.DAMAGE_PER_STR, DAMAGE_PER_TACTICS: C.DAMAGE_PER_TACTICS, DAMAGE_PER_ANATOMY: C.DAMAGE_PER_ANATOMY,
    CRIT_BASE_CHANCE: C.CRIT_BASE_CHANCE, CRIT_BASE_MULT: C.CRIT_BASE_MULT, AR_CONSTANT: C.AR_CONSTANT, RESIST_CAP: C.RESIST_CAP,
    SWING_FLOOR: C.SWING_FLOOR, SWING_DEX_PER_POINT: C.SWING_DEX_PER_POINT, JUMP_ATTACK_MULT: C.JUMP_ATTACK_MULT,
    SPELL_PER_INT: C.SPELL_PER_INT, SPELL_PER_EVAL_INT: C.SPELL_PER_EVAL_INT, SPELL_CRIT_PER_INT: C.SPELL_CRIT_PER_INT,
    RESIST_SPELLS_PER_POINT: C.RESIST_SPELLS_PER_POINT, FALL_FREE_METRES: C.FALL_FREE_METRES, FALL_PER_METRE: C.FALL_PER_METRE,
    POISON_PER_LEVEL: C.POISON_PER_LEVEL, POISON_SECONDS_PER_LEVEL: C.POISON_SECONDS_PER_LEVEL, FLEE_THRESHOLD: C.FLEE_THRESHOLD,
    NEVER_FLEE: C.NEVER_FLEE, AGGRO_RADIUS: C.AGGRO_RADIUS,
  },
};

// ------------------------------------------------------------------ npcs
const npcs = N.NPC_LIST.map((n) => ({ id: n.id, name: n.name, appearsIn: n.appearsIn, sells: n.sells, buys: n.buys, teaches: n.teaches, services: n.services, sellsToTier: n.sellsToTier, nightOnly: !!n.nightOnly, lines: n.lines }));

// --------------------------------------------------------------- recipes
const recipes = (Array.isArray(RC.RECIPES) ? RC.RECIPES : Object.values(RC.RECIPES)).map((r) => ({ id: r.id, name: r.name, family: r.family, skill: r.skill, difficulty: r.difficulty, materials: r.materials, station: r.station, result: r.result }));
const forageRecipes = (RC.FORAGE_RECIPES || []).map((r) => ({ id: r.id, name: r.name, skill: r.skill, difficulty: r.difficulty, materials: r.materials, station: r.station, result: r.result }));

const realms = W.REALMS.map((r) => ({ ...r }));
const DATA = { realms, livesAt, habitatByPlace, tagMeaning, lairName, abilities, skills, skillGroups: K.SKILL_GROUPS, openings, weapons, tiers, pieces, shields, bases, rarity, materials, affixes, powers, monsters, bosses, habitat, tierBands, rules, npcs, recipes, forageRecipes, icons: { abilities: abilityIcons, items: itemIcons, gems: gemIcons, skills: skillIcons }, built: new Date().toISOString().slice(0, 10) };

const json = JSON.stringify(DATA).replace(/<\/script/g, '<\\/script');

const html = String.raw`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Kaldera Codex</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
:root{--ground:#f3ecdc;--panel:#eae1cb;--panel2:#e2d7bd;--ink:#23201a;--ink2:#4f4838;--mute:#7d735f;--gold:#8a6d2a;--gold2:#b59a5e;--rule:#cdbf9c;--sel:#e0d2ad;--red:#9b3b2a;--green:#3f6b3a;--blue:#2b5f9e;--amber:#9a6b12;
 --c-common:#6b6b6b;--c-uncommon:#2f9a1e;--c-rare:#0f5fb8;--c-epic:#8a34c9;--c-mythic:#b8930c;--c-legendary:#d06a12}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ground:#15130f;--panel:#1d1a14;--panel2:#252017;--ink:#e8dcc0;--ink2:#c3b69a;--mute:#8b7f66;--gold:#c9a24a;--gold2:#7d6a3a;--rule:#3a3324;--sel:#2b2619;--red:#ff8f7a;--green:#8fb27f;--blue:#7fb0ee;--amber:#e0b064;
 --c-common:#d8d8d8;--c-uncommon:#1eff00;--c-rare:#4d9dff;--c-epic:#c076ff;--c-mythic:#ffd100;--c-legendary:#ff8000}}
:root[data-theme="dark"]{--ground:#15130f;--panel:#1d1a14;--panel2:#252017;--ink:#e8dcc0;--ink2:#c3b69a;--mute:#8b7f66;--gold:#c9a24a;--gold2:#7d6a3a;--rule:#3a3324;--sel:#2b2619;--red:#ff8f7a;--green:#8fb27f;--blue:#7fb0ee;--amber:#e0b064;
 --c-common:#d8d8d8;--c-uncommon:#1eff00;--c-rare:#4d9dff;--c-epic:#c076ff;--c-mythic:#ffd100;--c-legendary:#ff8000}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:"Cormorant Garamond",Georgia,serif;font-size:17px;line-height:1.45}
a{color:var(--gold)}
button{font:inherit}
.wrap{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;background:var(--panel);border-right:1px solid var(--rule);padding:22px 18px 30px}
.brand{font-family:Cinzel,serif;font-weight:700;letter-spacing:.1em;font-size:14px;color:var(--gold);text-transform:uppercase}
.brand small{display:block;font-family:"Cormorant Garamond",serif;text-transform:none;letter-spacing:0;color:var(--mute);font-size:14px;margin-top:3px;font-weight:500}
.search{margin:16px 0 12px}
.search input{width:100%;padding:8px 10px;border:1px solid var(--rule);background:var(--ground);color:var(--ink);font:inherit;font-size:15px;border-radius:3px}
.search input:focus{outline:2px solid var(--gold);outline-offset:1px}
.secs{display:flex;flex-direction:column;gap:2px}
.xlink{display:block;margin-top:18px;padding:7px 10px;border-top:1px solid var(--rule);font-family:Cinzel,serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);text-decoration:none}
.xlink small{display:block;font-family:"Cormorant Garamond",serif;text-transform:none;letter-spacing:0;color:var(--mute);font-size:13px}
.secs button{all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;padding:7px 10px;border-radius:3px;font-family:Cinzel,serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
.secs button small{font-family:"Cormorant Garamond",serif;text-transform:none;letter-spacing:0;color:var(--mute);font-size:13px}
.secs button[aria-selected="true"]{background:var(--ground);color:var(--gold);box-shadow:inset 3px 0 0 var(--gold)}
.secs button:hover{color:var(--gold)}
.secs button:focus-visible{outline:2px solid var(--gold)}
main{padding:34px 40px 100px;max-width:1500px;min-width:0}
h1{font-family:Cinzel,serif;font-weight:600;font-size:30px;margin:0 0 4px;text-wrap:balance}
.lede{color:var(--ink2);max-width:70ch;margin:0 0 22px;font-size:18px}
h2{font-family:Cinzel,serif;font-weight:600;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin:32px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--rule)}
h2:first-of-type{margin-top:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
.chip{cursor:pointer;border:1px solid var(--rule);background:var(--panel);color:var(--ink2);padding:4px 10px;border-radius:2px;font-family:Cinzel,serif;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
.chip[aria-pressed="true"]{border-color:var(--gold);color:var(--gold);background:var(--sel)}
.tbl{overflow-x:auto;margin:0 0 18px;border:1px solid var(--rule);border-radius:3px}
table{border-collapse:collapse;width:100%;font-size:15.5px;font-variant-numeric:tabular-nums}
th{font-family:Cinzel,serif;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);text-align:left;padding:8px 10px;border-bottom:1px solid var(--gold2);background:var(--panel);position:sticky;top:0;cursor:pointer;white-space:nowrap}
th.sorted::after{content:" ▾";color:var(--mute)}
td{padding:6px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
tr:hover td{background:var(--sel)}
td.num{text-align:right;white-space:nowrap}
.ico{width:34px;height:34px;object-fit:cover;border:1px solid var(--rule);vertical-align:middle;border-radius:2px;background:#000}
.ico.sm{width:24px;height:24px}
.ico.lg{width:64px;height:64px}
.glyph{display:inline-block;width:34px;height:34px;border:1px dashed var(--rule);border-radius:2px;vertical-align:middle;color:var(--mute);text-align:center;line-height:32px;font-size:11px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:20px}
.card{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:12px;background:var(--panel);border:1px solid var(--rule);border-radius:3px;cursor:pointer;align-items:start}
.card:hover{border-color:var(--gold)}
.card .nm{font-family:Cinzel,serif;font-weight:600;font-size:15px;color:var(--ink)}
.card .ch{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 6px}
.card .ch span{font-family:Cinzel,serif;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);background:var(--ground);border:1px solid var(--rule);padding:1px 6px}
.card .ds{font-size:15px;color:var(--ink2);line-height:1.35}
.card .rq{font-family:Cinzel,serif;font-size:10.5px;letter-spacing:.06em;color:var(--mute);margin-top:6px}
.card .hand{font-size:13.5px;font-style:italic;color:var(--red);margin-top:3px}
.grp{font-family:Cinzel,serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin:18px 0 8px}
.bars{display:grid;grid-template-columns:auto 1fr auto;gap:3px 8px;align-items:center;font-size:13px;margin:8px 0}
.bars .k{font-family:Cinzel,serif;font-size:10px;letter-spacing:.1em;color:var(--mute)}
.bars .b{height:6px;background:var(--ground);border:1px solid var(--rule)}
.bars .b i{display:block;height:100%;background:var(--gold)}
.kit{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.kit img,.kit span.glyph{width:26px;height:26px;line-height:24px;font-size:9px}
.rar-common{color:var(--c-common)}.rar-uncommon{color:var(--c-uncommon)}.rar-rare{color:var(--c-rare)}.rar-epic{color:var(--c-epic)}.rar-mythic{color:var(--c-mythic)}.rar-legendary{color:var(--c-legendary)}
.sw{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:middle;margin-right:6px;border:1px solid rgba(0,0,0,.3)}
.note{background:var(--panel);border-left:3px solid var(--gold2);padding:8px 12px;margin:8px 0 16px;color:var(--ink2);font-size:15.5px;max-width:80ch}
.calc{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:22px}
.calc .box{background:var(--panel);border:1px solid var(--rule);padding:12px 14px;border-radius:3px}
.calc .box h3{font-family:Cinzel,serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin:0 0 8px}
.calc label{display:grid;grid-template-columns:1fr auto;font-size:14px;color:var(--ink2);margin:6px 0 2px}
.calc input[type=range]{width:100%;accent-color:var(--gold)}
.calc .out{font-family:Cinzel,serif;font-size:20px;color:var(--ink);margin-top:8px}
.calc .out small{font-family:"Cormorant Garamond",serif;font-size:14px;color:var(--mute);display:block;font-weight:400;text-transform:none;letter-spacing:0}
.formula{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--ink2);background:var(--panel);padding:2px 6px;border-radius:2px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.modal[data-open]{display:flex}
.modal .box{background:var(--panel);border:1px solid var(--gold);max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:20px 22px;border-radius:3px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.modal .box h3{font-family:Cinzel,serif;font-size:20px;margin:0 0 6px}
.modal pre{white-space:pre-wrap;font-size:13px;background:var(--ground);border:1px solid var(--rule);padding:10px;border-radius:3px}
.modal .x{float:right;cursor:pointer;border:1px solid var(--rule);background:var(--ground);color:var(--ink2);padding:2px 10px;border-radius:2px}
.count{color:var(--mute);font-size:14px;margin:-8px 0 12px}
.hl{background:var(--sel)}
.empty{color:var(--mute);font-style:italic;padding:10px 0}
.tag{display:inline-block;font-family:Cinzel,serif;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);background:var(--ground);border:1px solid var(--rule);padding:1px 6px;margin:1px 2px 1px 0}
.foot{margin-top:40px;color:var(--mute);font-size:14px;border-top:1px solid var(--rule);padding-top:12px}
@media (max-width:900px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--rule)}main{padding:22px 16px 80px}.secs{flex-direction:row;flex-wrap:wrap}}
</style>
<div class="wrap">
<nav>
  <div class="brand">Kaldera<small>The codex of rules, from the rules themselves</small></div>
  <div class="search"><input id="q" type="search" placeholder="Search everything" aria-label="Search"></div>
  <div class="secs" id="secs" role="tablist"></div>
  <a class="xlink" href="books.html">The books<small>the world, the story, the cast</small></a>
  <a class="xlink" href="bestiary.html">Greenwold bestiary<small>every body the first zone needs</small></a>
  <a class="xlink" href="craftables.html">Craftables<small>every item the recipes make</small></a>
  <a class="xlink" href="structures.html">Greenwold structures<small>every building and kit piece the first zone needs</small></a>
  <a class="xlink" href="monsters.html">Greenwold monsters<small>every body, by the skeleton it rides</small></a>
  <a class="xlink" href="dressing.html">Greenwold forage and dressing<small>what you can pick, and what should stand about</small></a>
</nav>
<main id="main"></main>
</div>
<div class="modal" id="modal" role="dialog"><div class="box" id="modalBox"></div></div>
<script type="application/json" id="data">${json}</script>
<script>
(function(){
const D = JSON.parse(document.getElementById('data').textContent);
const main = document.getElementById('main'), secs = document.getElementById('secs'), q = document.getElementById('q');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cap = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());
const words = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
const num = (v, d = 0) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d || 2)) : '');
const abById = Object.fromEntries(D.abilities.map((a) => [a.id, a]));
const skById = Object.fromEntries(D.skills.map((s) => [s.id, s]));
const baseById = Object.fromEntries(D.bases.map((b) => [b.id, b]));
const GROUP_LABEL = { warrior: 'Warrior', ranger: 'Ranger', mage: 'Mage', sorcerer: 'Sorcerer', necromancer: 'Necromancer', healer: 'Healer', rogue: 'Rogue', bard: 'Bard', everyone: 'Everyone', paladin: 'Paladin', artisan: 'Artisan', blank: 'Blank' };
const GROUP_COLOUR = { warrior: '#c8553d', ranger: '#5f9e4a', mage: '#4a8fe0', sorcerer: '#a06be0', necromancer: '#7fb27f', healer: '#e0c066', rogue: '#c0a070', bard: '#d977a8', everyone: '#a0a0a0', paladin: '#e0d0a0' };
const icoA = (id, cls = 'ico') => D.icons.abilities[id] ? '<img class="' + cls + '" src="' + D.icons.abilities[id] + '" alt="">' : '<span class="glyph">' + esc(id.slice(0, 3)) + '</span>';
const icoS = (id, cls = 'ico') => D.icons.skills && D.icons.skills[id] ? '<img class="' + cls + '" src="' + D.icons.skills[id] + '" alt="">' : '';
const icoI = (id, cls = 'ico') => D.icons.items[id] ? '<img class="' + cls + '" src="' + D.icons.items[id] + '" alt="">' : '<span class="glyph" title="no painting yet">' + esc((baseById[id] || { name: id }).name.slice(0, 3)) + '</span>';
const rar = (id) => '<span class="rar-' + id + '">' + cap(id) + '</span>';
let filter = '';
let active = 'overview';

// --- sections
const SECTIONS = [
  ['overview', 'Overview', ''],
  ['world', 'The World', D.realms.length + ' realms, ' + D.realms.reduce((n, r) => n + r.places.length, 0) + ' places'],
  ['classes', 'Classes', D.openings.length],
  ['skills', 'Skills', D.skills.length],
  ['abilities', 'Abilities', D.abilities.length],
  ['weapons', 'Weapons', D.weapons.length],
  ['armour', 'Armour and shields', D.tiers.length + ' tiers'],
  ['materials', 'Materials', D.materials.ores.length + D.materials.woods.length + D.materials.gems.length + ' kinds'],
  ['consumables', 'Consumables', D.bases.filter((b) => b.use).length],
  ['rarity', 'Rarity and affixes', D.affixes.length],
  ['monsters', 'Monsters', D.monsters.length + D.bosses.length],
  ['crafting', 'Crafting', D.recipes.length + D.forageRecipes.length],
  ['people', 'Townsfolk', D.npcs.length],
  ['rules', 'Rules and calculators', ''],
];
for (const [id, label, n] of SECTIONS) {
  const b = document.createElement('button'); b.setAttribute('role', 'tab'); b.dataset.id = id;
  b.innerHTML = esc(label) + (n !== '' ? '<small>' + esc(n) + '</small>' : '');
  b.addEventListener('click', () => { show(id); history.replaceState(null, '', '#' + id); });
  secs.appendChild(b);
}
q.addEventListener('input', () => { filter = q.value.trim().toLowerCase(); render(); });
function show(id) { active = id; Array.prototype.forEach.call(secs.children, (b) => b.setAttribute('aria-selected', b.dataset.id === id ? 'true' : 'false')); render(); main.scrollIntoView(); }
const hit = (s) => !filter || String(s).toLowerCase().includes(filter);

// --- helpers
function table(cols, rows, opts = {}) {
  // cols: [label, key or fn, {num, sort}] ; rows: objects
  const id = 'T' + Math.random().toString(36).slice(2, 8);
  let sortKey = opts.sort || null, dir = 1;
  const wrap = document.createElement('div'); wrap.className = 'tbl';
  function draw() {
    const list = rows.slice();
    if (sortKey != null) list.sort((a, b) => { const c = cols[sortKey]; const va = typeof c[1] === 'function' ? c[1](a, true) : a[c[1]]; const vb = typeof c[1] === 'function' ? c[1](b, true) : b[c[1]]; if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir; return String(va ?? '').localeCompare(String(vb ?? '')) * dir; });
    let h = '<table><thead><tr>' + cols.map((c, i) => '<th data-i="' + i + '" class="' + (sortKey === i ? 'sorted' : '') + '">' + esc(c[0]) + '</th>').join('') + '</tr></thead><tbody>';
    for (const r of list) h += '<tr>' + cols.map((c) => { const raw = typeof c[1] === 'function' ? c[1](r) : r[c[1]]; const cls = (c[2] && c[2].num) ? ' class="num"' : ''; return '<td' + cls + '>' + (c[2] && c[2].html ? raw : esc(raw ?? '')) + '</td>'; }).join('') + '</tr>';
    h += '</tbody></table>';
    if (!list.length) h = '<div class="empty" style="padding:10px">nothing matches</div>';
    wrap.innerHTML = h;
    wrap.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => { const i = +th.dataset.i; if (sortKey === i) dir = -dir; else { sortKey = i; dir = 1; } draw(); }));
  }
  draw();
  return wrap;
}
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d; };
function costText(c) { if (!c) return 'free'; if (c.stamina) return c.stamina + ' stamina'; if (c.mana) return c.mana + ' mana'; if (c.item) return (c.count || 1) + ' ' + words(c.item); return 'free'; }
function effectText(e) {
  if (!e) return '';
  if (e.kind === 'combo') return e.parts.map(effectText).join('; ');
  const t = [];
  for (const [k, v] of Object.entries(e)) { if (k === 'kind') continue; t.push(k + ' ' + (typeof v === 'object' ? JSON.stringify(v) : v)); }
  return words(e.kind) + (t.length ? ' (' + t.join(', ') + ')' : '');
}
function reqText(a) {
  const parts = [];
  if (a.skill && a.minSkill) parts.push(cap(words(skById[a.skill]?.name || a.skill)) + ' ' + a.minSkill);
  if (a.anyOf && a.anyOf.length) parts.push(a.anyOf.map((alt) => (alt.all || [alt]).map((r) => (skById[r.skill]?.name || r.skill || r) + (r.min != null ? ' ' + r.min : '')).join(' and ')).join(', or '));
  if (a.extraReq) parts.push(typeof a.extraReq === 'string' ? a.extraReq : Object.entries(a.extraReq).map(([k, v]) => (skById[k]?.name || cap(k)) + ' ' + v).join(', '));
  return parts.join(' and ') || 'nothing';
}
function openModal(html) { const m = document.getElementById('modal'); document.getElementById('modalBox').innerHTML = '<button class="x" id="mx">close</button>' + html; m.setAttribute('data-open', ''); document.getElementById('mx').onclick = () => m.removeAttribute('data-open'); m.onclick = (e) => { if (e.target === m) m.removeAttribute('data-open'); }; }

function abilityCard(a) {
  const c = document.createElement('div'); c.className = 'card';
  c.style.borderLeft = '3px solid ' + (GROUP_COLOUR[a.group] || '#888');
  const chips = [costText(a.cost), a.cooldown ? a.cooldown + ' s cooldown' : null, a.castTime ? a.castTime + ' s cast' + (a.rooted ? ', rooted' : '') : null, a.range ? a.range + ' m' : null, a.passive ? 'passive' : null, a.spell ? 'spell' : null].filter(Boolean);
  c.innerHTML = icoA(a.id, 'ico lg') + '<div><div class="nm">' + esc(a.name) + '</div><div class="ch">' + chips.map((x) => '<span>' + esc(x) + '</span>').join('') + '</div><div class="ds">' + esc(a.description) + '</div><div class="rq">' + esc(reqText(a)) + '</div>' + (a.needsWords !== 'nothing' ? '<div class="hand">in hand: ' + esc(a.needsWords) + '</div>' : '') + '</div>';
  c.addEventListener('click', () => openModal('<h3>' + esc(a.name) + '</h3><div class="ch chips">' + chips.map((x) => '<span class="chip">' + esc(x) + '</span>').join('') + '</div><p>' + esc(a.description) + '</p><p><b>Group:</b> ' + esc(GROUP_LABEL[a.group] || a.group) + ' · <b>Requires:</b> ' + esc(reqText(a)) + ' · <b>In hand:</b> ' + esc(a.needsWords) + ' · <b>Target:</b> ' + esc(a.target || '') + (a.moving ? ' · can move while casting' : '') + '</p><p><b>Effect:</b> ' + esc(effectText(a.effect)) + '</p><pre>' + esc(JSON.stringify(a.effect, null, 2)) + '</pre>'));
  return c;
}

// --- renderers
const R = {};
R.overview = () => {
  const f = el('<h1>The Kaldera Codex</h1><p class="lede">Every rule the game runs on, read straight from the rules modules on ' + esc(D.built) + ', so this page cannot say something the code does not. Search at the left works on every section. Click any ability or monster for its full record. Column headers sort.</p>');
  const tiles = [['classes', D.openings.length, 'openings, each a kit, stats and skills'], ['skills', D.skills.length, 'skills in ' + D.skillGroups.length + ' groups, 0 to 100, ' + D.rules.stats.caps.skillTotalCap + ' in all'], ['abilities', D.abilities.length, 'abilities, ' + D.abilities.filter((a) => a.spell).length + ' of them spells'], ['weapons', D.weapons.length, 'weapons across ' + new Set(D.weapons.map((w) => w.skill)).size + ' skills'], ['armour', D.tiers.length, 'armour tiers by eight pieces, ' + D.shields.length + ' shields'], ['materials', D.materials.ores.length, 'ores, ' + D.materials.woods.length + ' woods, ' + D.materials.gems.length + ' gems, ' + D.materials.leathers.length + ' hides'], ['rarity', D.affixes.length, 'affixes over ' + D.rarity.length + ' rarities, ' + D.powers.length + ' named powers'], ['monsters', D.monsters.length, 'monsters and ' + D.bosses.length + ' bosses'], ['crafting', D.recipes.length + D.forageRecipes.length, 'recipes'], ['people', D.npcs.length, 'kinds of townsfolk']];
  const grid = document.createElement('div'); grid.className = 'cards';
  for (const [id, n, t] of tiles) { const c = document.createElement('div'); c.className = 'card'; c.style.gridTemplateColumns = '1fr'; c.innerHTML = '<div><div class="nm" style="font-size:26px">' + n + '</div><div class="ds">' + esc(t) + '</div></div>'; c.addEventListener('click', () => show(id)); grid.appendChild(c); }
  f.appendChild(grid);
  f.appendChild(el('<h2>How the pieces bear on each other</h2><div class="note">You are what you practise: there are no levels. Every swing, cast and craft rolls a gain in the skill it used, along the bands in Rules. Stats (five, capped at ' + D.rules.stats.caps.statCap + ' each and ' + D.rules.stats.caps.totalCap + ' together) set health, mana, stamina and carry. Weapons train the skill they belong to and decide reach, speed and damage type. Armour tiers trade armour rating against weight, strength and the caster’s mana regeneration, and carry resistances. Rarity is only the number of affixes an item rolls; the affix tables say what those can be. Monsters carry a tier, resistances and weaknesses, and drop from loot tables by their kind. The calculators under Rules let you try the arithmetic.</div>'));
  return f;
};

const KIND_WORD = { hub: 'hub', town: 'town', hamlet: 'hamlet', landmark: 'landmark', megastructure: 'mega structure', dungeon: 'dungeon', mine: 'mine', cave: 'cave', ruin: 'ruin', shrine: 'shrine', camp: 'camp', wild: 'open country', sea: 'open water', road: 'road' };
const KIND_COLOUR = { megastructure: 'var(--gold)', dungeon: 'var(--red)', hub: 'var(--green)', town: 'var(--green)', hamlet: 'var(--green)', mine: 'var(--amber)', camp: 'var(--amber)', sea: 'var(--blue)', wild: 'var(--ink2)' };
let worldKind = 'all';
R.world = () => {
  const total = D.realms.reduce((n, r) => n + r.places.length, 0);
  const f = el('<h1>The World of Kaldera</h1><p class="lede">' + D.realms.length + ' realms in a ring around the Caldera Sea, ' + total + ' named places inside them. Every realm has a hub, a mega structure you can see from its edge, a dungeon with a boss, a mine, open country and its own encounters. A place with a <b>mechanic</b> is a place with a rule of its own, not a backdrop. This is the sheet the painted map and the zone table are drawn from.</p>');
  const kinds = ['all', ...Array.from(new Set(D.realms.flatMap((r) => r.places.map((p) => p.kind))))];
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const k of kinds) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = k === 'all' ? 'all places' : (KIND_WORD[k] || k); b.setAttribute('aria-pressed', worldKind === k); b.onclick = () => { worldKind = k; render(); }; chips.appendChild(b); }
  f.appendChild(chips);
  const ringWord = ['the heart', 'the near ring', 'the middle ring', 'the rim'];
  for (const r of D.realms) {
    const places = r.places.filter((p) => (worldKind === 'all' || p.kind === worldKind) && hit(p.name + ' ' + p.geography + ' ' + p.contains + ' ' + (p.mechanic || '') + ' ' + r.name));
    if (!places.length && filter) continue;
    f.appendChild(el('<h2>' + esc(r.name) + ' <small style="color:var(--mute);letter-spacing:0;text-transform:none;font-family:\'Cormorant Garamond\',serif;font-size:14px">' + esc(r.biome) + ', ' + ringWord[r.ring] + ', danger ' + r.danger.join(' to ') + ', centre ' + r.x + ', ' + r.z + ' m, ' + (r.r / 1000).toFixed(1) + ' km across</small></h2>'));
    f.appendChild(el('<div class="note" style="max-width:none"><i>' + esc(r.line) + '</i><br>' + esc(r.geography) + '<br><b>Mega structure:</b> ' + esc(r.mega) + '<br><b>Encounters:</b> ' + r.encounters.map(esc).join('; ') + '</div>'));
    if (places.length) f.appendChild(table([
      ['place', (p) => '<b>' + esc(p.name) + '</b>', { html: true }],
      ['kind', (p) => '<span class="tag" style="color:' + (KIND_COLOUR[p.kind] || 'var(--ink2)') + '">' + esc(KIND_WORD[p.kind] || p.kind) + '</span>' + (p.boss ? '<br><span class="tag">boss: ' + esc(p.boss) + '</span>' : '') + (p.levels ? '<br><span class="tag">' + p.levels + ' level' + (p.levels > 1 ? 's' : '') + '</span>' : ''), { html: true }],
      ['geography', 'geography'],
      ['what is there', 'contains'],
      ['mechanic', (p) => p.mechanic ? '<span style="color:var(--gold)">' + esc(p.mechanic) + '</span>' : '', { html: true }],
    ], places));
    else f.appendChild(el('<div class="empty">no places of that kind here</div>'));
  }
  return f;
};

R.classes = () => {
  const f = el('<h1>Classes</h1><p class="lede">The eleven openings. A class here is a starting position, never a cage: the kit, the stats and the skills you begin with, and the abilities those skills already unlock.</p>');
  const grid = document.createElement('div'); grid.className = 'cards'; grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(360px,1fr))';
  for (const o of D.openings.filter((o) => hit(o.name + ' ' + o.blurb))) {
    const c = document.createElement('div'); c.className = 'card'; c.style.gridTemplateColumns = '1fr'; c.style.cursor = 'default';
    const bars = ['str', 'dex', 'int', 'con', 'wis'].map((k) => '<span class="k">' + k.toUpperCase() + '</span><span class="b"><i style="width:' + (o.stats[k] || 0) + '%"></i></span><span>' + (o.stats[k] || 0) + '</span>').join('');
    const sk = Object.entries(o.skills || {}).filter(([, v]) => v > 0).map(([k, v]) => '<span class="tag">' + esc(skById[k]?.name || k) + ' ' + v + '</span>').join('');
    const kit = o.kit.map((e) => '<span title="' + esc((baseById[e.base] || { name: e.kitId }).name + (e.count > 1 ? ' x' + e.count : '')) + '">' + icoI(e.base, 'ico sm') + '</span>').join('');
    const un = o.unlocked.map((id) => '<span title="' + esc(abById[id].name) + '">' + icoA(id, 'ico sm') + '</span>').join('');
    c.innerHTML = '<div><div class="nm" style="font-size:19px">' + esc(o.name) + '</div><div class="ds">' + esc(o.blurb) + '</div><div class="bars">' + bars + '</div><div class="grp" style="margin:8px 0 4px">starting skills</div><div>' + (sk || '<span class="empty">none placed</span>') + '</div><div class="grp" style="margin:8px 0 4px">the kit</div><div class="kit">' + kit + '</div><div class="grp" style="margin:8px 0 4px">abilities open from the first minute (' + o.unlocked.length + ')</div><div class="kit">' + (un || '<span class="empty">none yet</span>') + '</div></div>';
    grid.appendChild(c);
  }
  f.appendChild(grid);
  return f;
};

R.skills = () => {
  const f = el('<h1>Skills</h1><p class="lede">' + D.skills.length + ' skills, 0.0 to 100.0 each, ' + D.rules.stats.caps.skillTotalCap + ' points in all. Gains come from use along the bands under Rules. The last column is every ability that skill unlocks.</p>');
  for (const g of D.skillGroups) {
    const rows = D.skills.filter((s) => s.group === g && hit(s.name + ' ' + s.description));
    if (!rows.length) continue;
    f.appendChild(el('<h2>' + esc(g) + ' <small style="color:var(--mute);letter-spacing:0;text-transform:none;font-family:\'Cormorant Garamond\',serif;font-size:14px">' + rows.length + '</small></h2>'));
    f.appendChild(table([['', (s) => icoS(s.id, 'ico lg'), { html: true }], ['skill', 'name'], ['what it does', 'description'], ['abilities it unlocks', (s) => s.abilities.map((id) => '<span title="' + esc(abById[id].name) + '">' + icoA(id, 'ico sm') + '</span>').join(' ') || '<span class="empty">none</span>', { html: true }]], rows));
  }
  return f;
};

let abGroup = 'all', abOnly = 'all';
R.abilities = () => {
  const f = el('<h1>Abilities</h1><p class="lede">' + D.abilities.length + ' abilities. Each unlocks at a skill value, costs stamina, mana or an item, and most want something particular in hand. Click a card for the whole record.</p>');
  const groups = ['all', ...Array.from(new Set(D.abilities.map((a) => a.group)))];
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const g of groups) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = g === 'all' ? 'all' : (GROUP_LABEL[g] || g); b.setAttribute('aria-pressed', abGroup === g); b.onclick = () => { abGroup = g; render(); }; chips.appendChild(b); }
  for (const [k, t] of [['all', 'everything'], ['spell', 'spells only'], ['melee', 'weapon abilities'], ['passive', 'passives']]) { const b = document.createElement('button'); b.className = 'chip'; b.style.marginLeft = k === 'all' ? '14px' : ''; b.textContent = t; b.setAttribute('aria-pressed', abOnly === k); b.onclick = () => { abOnly = k; render(); }; chips.appendChild(b); }
  f.appendChild(chips);
  const list = D.abilities.filter((a) => (abGroup === 'all' || a.group === abGroup) && (abOnly === 'all' || (abOnly === 'spell' && a.spell) || (abOnly === 'passive' && a.passive) || (abOnly === 'melee' && !a.spell && !a.passive)) && hit(a.name + ' ' + a.description + ' ' + a.group + ' ' + (a.skill || '') + ' ' + a.needsWords));
  f.appendChild(el('<div class="count">' + list.length + ' shown</div>'));
  const byGroup = {};
  for (const a of list) (byGroup[a.group] ||= []).push(a);
  for (const [g, rows] of Object.entries(byGroup)) {
    f.appendChild(el('<div class="grp" style="color:' + (GROUP_COLOUR[g] || 'var(--mute)') + '">' + esc(GROUP_LABEL[g] || g) + '</div>'));
    const grid = document.createElement('div'); grid.className = 'cards';
    for (const a of rows.sort((x, y) => (x.minSkill || 0) - (y.minSkill || 0))) grid.appendChild(abilityCard(a));
    f.appendChild(grid);
  }
  return f;
};

R.weapons = () => {
  const f = el('<h1>Weapons</h1><p class="lede">Every weapon trains the skill in its row. One hand leaves the off hand free for a shield, a tome, a torch or a lute; two hands do not. Reach is melee, range is ranged. Speed is seconds per swing before Dexterity.</p>');
  const rows = D.weapons.filter((w) => hit(w.name + ' ' + w.skill + ' ' + w.damageType));
  f.appendChild(table([
    ['', (w) => icoI(w.id), { html: true }], ['weapon', 'name'], ['skill', (w) => skById[w.skill]?.name || w.skill], ['hands', 'hands', { num: true }],
    ['damage', (w, s) => s ? (w.minDamage + w.maxDamage) / 2 : w.minDamage + ' to ' + w.maxDamage, { num: true }], ['speed s', 'speed', { num: true }], ['weight', 'weight', { num: true }], ['STR', 'strReq', { num: true }],
    ['reach / range', (w, s) => s ? (w.range || w.reach || 0) : (w.range != null ? w.range + ' m range' : (w.reach || '') + ' m'), { num: true }], ['type', 'damageType'],
    ['special', (w) => Object.entries(w).filter(([k]) => ['cleave', 'stun', 'armourPiercing', 'fellsTrees', 'casts', 'bleed', 'knockback'].includes(k)).map(([k, v]) => words(k) + (v === true ? '' : ' ' + v)).join(', ')],
  ], rows, { sort: 2 }));
  f.appendChild(el('<h2>The two hand rule</h2><div class="note">A one handed weapon may be joined by anything the off hand takes. Drawing a two hander sends the off hand item to your pack; raising a shield with a two hander in hand sends the two hander to your pack. Bows and crossbows ride the ranged slot. Wands and staves are foci: every spell needs one in the main hand, and neither is a weapon you swing for a warrior ability.</div>'));
  return f;
};

R.armour = () => {
  const f = el('<h1>Armour and shields</h1><p class="lede">Six tiers by eight pieces. Armour rating halves damage at ' + D.rules.combat.AR_CONSTANT + ' and takes two thirds at ' + (D.rules.combat.AR_CONSTANT * 2) + '. The Meditation fraction is how much of that skill’s mana regeneration the piece still allows, averaged over the eight slots.' + (D.tiers[0].castBurden != null ? ' Cast burden is the casting penalty: cast time stretches by it, and a spell fizzles by it times 0.6 (paladin spells are exempt).' : '') + '</p>');
  const cols = [['tier', 'tier', { num: true }], ['material', 'material'], ['AR per piece', 'ar', { num: true }], ['AR full set', (t) => t.ar * D.pieces.reduce((s, p) => s + p.arMul, 0), { num: true }], ['weight / piece', 'weight', { num: true }], ['STR', 'strReq', { num: true }], ['meditation', (t) => Math.round(t.meditation * 100) + '%']];
  if (D.tiers[0].castBurden != null) cols.push(['cast burden', (t) => Math.round(t.castBurden * 100) + '%']);
  cols.push(['resists', (t) => Object.entries(t.resist || {}).map(([k, v]) => k + ' +' + v).join(', ') || 'none']);
  f.appendChild(table(cols, D.tiers.filter((t) => hit(t.material))));
  f.appendChild(el('<h2>Pieces</h2>'));
  f.appendChild(table([['piece', 'id'], ['slot', 'slot'], ['AR multiplier', 'arMul', { num: true }]], D.pieces));
  f.appendChild(el('<h2>Shields</h2><div class="note">Parry chance is Parrying x ' + D.rules.combat.PARRY_PER_SKILL + ' x the shield’s factor, capped at ' + Math.round(D.rules.combat.PARRY_CAP * 100) + '%. No shield, no parry.</div>'));
  f.appendChild(table([['shield', 'name'], ['parry factor', 'parryFactor', { num: true }], ['weight', 'weight', { num: true }], ['STR', 'strReq', { num: true }], ['parry at 100 Parrying', (s) => Math.round(Math.min(D.rules.combat.PARRY_CAP, 100 * D.rules.combat.PARRY_PER_SKILL * s.parryFactor) * 100) + '%']], D.shields));
  f.appendChild(el('<h2>Other things you wear or hold</h2>'));
  f.appendChild(table([['', (b) => icoI(b.id), { html: true }], ['item', 'name'], ['kind', 'kind'], ['slot', 'slot'], ['weight', 'weight', { num: true }], ['tags', (b) => (b.kinds || []).join(', ')]], D.bases.filter((b) => ['jewellery', 'offhand', 'instrument', 'tool'].includes(b.kind) && hit(b.name))));
  return f;
};

R.materials = () => {
  const f = el('<h1>Materials</h1><p class="lede">Ores by tier and the Mining needed to take them; alloys; the woods a bow or staff can be made of; gems and the affix each carries; the three hides.</p>');
  f.appendChild(el('<h2>Ores</h2>'));
  f.appendChild(table([['', (o) => icoI(o.id + '_ore'), { html: true }], ['ore', 'name'], ['tier', 'tier', { num: true }], ['mine from', 'workAt', { num: true }], ['work well at', 'workWell', { num: true }], ['colour', 'colour'], ['lends to gear', (o) => Object.entries(o.lends || {}).map(([k, v]) => k + ' +' + v).join(', ') || 'nothing'], ['note', 'note']], D.materials.ores.filter((o) => hit(o.name + ' ' + (o.note || '')))));
  f.appendChild(el('<h2>Ingots and alloys</h2>'));
  f.appendChild(table([['', (o) => icoI(o.id + '_ingot'), { html: true }], ['metal', 'name'], ['tier', 'tier', { num: true }], ['from', (o) => (o.from || []).join(' + ') || o.id + ' ore'], ['lends', (o) => Object.entries(o.lends || {}).map(([k, v]) => k + ' +' + v).join(', ') || 'nothing']], [...D.materials.ores.filter((o) => o.id !== 'tin'), ...D.materials.alloys]));
  f.appendChild(el('<h2>Woods</h2><div class="note">Used for ' + D.materials.woodUses.join(', ') + '. Every felled tree drops its own log (oak, birch, beech, fir, spruce, pine, sakura, willow, palm, deadwood, cactus wood); the four below are the crafting tiers.</div>'));
  f.appendChild(table([['', (w) => icoI(w.id + '_log'), { html: true }], ['wood', 'name'], ['tier', 'tier', { num: true }], ['fell from Lumberjacking', 'workAt', { num: true }], ['where', 'where']], D.materials.woods));
  f.appendChild(el('<h2>Gems</h2>'));
  f.appendChild(table([['', (g) => D.icons.gems[g.id] ? '<img class="ico" src="' + D.icons.gems[g.id] + '" alt="">' : '', { html: true }], ['gem', 'name'], ['colour', 'colour'], ['affix it carries', (g) => words(g.affix)]], D.materials.gems));
  f.appendChild(el('<h2>Hides</h2>'));
  f.appendChild(table([['', (h) => icoI(h.id === 'hide' ? 'hide' : h.id === 'thickHide' ? 'thick_hide' : 'scaled_hide'), { html: true }], ['hide', 'name'], ['tier', 'tier', { num: true }], ['from', (h) => h.from.join(', ')]], D.materials.leathers));
  return f;
};

R.consumables = () => {
  const f = el('<h1>Consumables</h1><p class="lede">Everything you eat, drink or apply, with what it really does, read from the item table. Food and meals heal; potions do what their row says; forage is what cooking and alchemy are made from.</p>');
  const use = (b) => { const u = b.use || {}; const t = []; if (u.heal) t.push('heals ' + u.heal[0] + ' to ' + u.heal[1] + (u.seconds ? ' over ' + u.seconds + ' s' : '')); if (u.mana) t.push('mana ' + (Array.isArray(u.mana) ? u.mana.join(' to ') : u.mana)); if (u.stamina) t.push('stamina ' + (Array.isArray(u.stamina) ? u.stamina.join(' to ') : u.stamina)); if (u.buff) t.push((u.buff.name || 'buff') + ' for ' + Math.round((u.buff.seconds || 0) / 60) + ' min'); if (u.cure) t.push('cures poison'); if (u.poison) t.push('poisons at level ' + u.poison); if (u.nightsight) t.push('night sight'); for (const [k, v] of Object.entries(u)) if (!['heal', 'mana', 'stamina', 'buff', 'cure', 'poison', 'seconds', 'nightsight'].includes(k)) t.push(k + ' ' + JSON.stringify(v)); return t.join(', ') || 'nothing yet'; };
  const groups = [['Food', (b) => b.kind === 'food'], ['Meals', (b) => b.kind === 'meal' || (b.kinds || []).includes('meal')], ['Potions', (b) => (b.kinds || []).includes('potion')], ['Forage', (b) => (b.kinds || []).includes('forage')], ['Other', (b) => b.use && !['food', 'meal'].includes(b.kind) && !(b.kinds || []).some((k) => ['potion', 'forage', 'meal'].includes(k))]];
  for (const [label, pred] of groups) {
    const rows = D.bases.filter((b) => pred(b) && hit(b.name + ' ' + (b.kinds || []).join(' ')));
    if (!rows.length) continue;
    f.appendChild(el('<h2>' + label + '</h2>'));
    f.appendChild(table([['', (b) => icoI(b.id), { html: true }], ['item', 'name'], ['what it does', use], ['weight', 'weight', { num: true }], ['tags', (b) => (b.kinds || []).filter((k) => k !== 'material').join(', ')]], rows));
  }
  return f;
};

R.rarity = () => {
  const f = el('<h1>Rarity and affixes</h1><p class="lede">Rarity is the number of affixes an item rolls, and its colour. Nothing else. An item that drops blue stays blue when identified; identifying only reads the lines it always had. Legendary adds a named power on top of five lines.</p>');
  f.appendChild(table([['rarity', (r) => '<span class="sw" style="background:' + r.colour + '"></span>' + rar(r.id), { html: true }], ['affixes', 'affixes', { num: true }], ['drop weight', 'weight', { num: true }], ['share of drops', (r, s) => { const tot = D.rarity.reduce((a, x) => a + x.weight, 0); return s ? r.weight / tot : (100 * r.weight / tot).toFixed(1) + '%'; }, { num: true }], ['crafted chance', (r) => (r.crafted * 100).toFixed(1) + '%'], ['named power', (r) => r.namedPower ? 'yes' : '']], D.rarity));
  f.appendChild(el('<h2>Affixes</h2><div class="note">The range each rarity can roll for the line. "flag" lines are on or off. The kinds column says what the affix can appear on.</div>'));
  const rows = D.affixes.filter((a) => hit(a.label + ' ' + a.group + ' ' + (a.prefix || '') + ' ' + (a.suffix || '')));
  f.appendChild(table([['affix', 'label'], ['group', 'group'], ['on', (a) => (a.kinds || []).join(', ')], ['prefix / suffix', (a) => [a.prefix, a.suffix].filter(Boolean).join(' / ')], ['unit', 'unit'],
    ...D.rarity.filter((r) => r.affixes > 0).map((r) => [r.id, (a) => a.ranges && a.ranges[r.id] ? (a.flag ? 'on' : a.ranges[r.id].join(' to ')) : '', { num: true }])], rows));
  f.appendChild(el('<h2>Named powers (legendary)</h2>'));
  f.appendChild(table([['power', 'name'], ['prefix / suffix', (p) => [p.prefix, p.suffix].filter(Boolean).join(' / ')], ['on', (p) => (p.kinds || []).join(', ')], ['what it does', 'text']], D.powers));
  return f;
};

let monTier = 'all';
R.monsters = () => {
  const f = el('<h1>Monsters</h1><p class="lede">The roster by tier. Hit and defence are skill values the combat rules read like a player’s. Notes are the flags the rules layer acts on (undead, poison, night, group, flees). Click a row for the record; the habitat table says what walks where by day and by night.</p>');
  const tiers = ['all', ...Array.from(new Set(D.monsters.map((m) => m.tier))).sort()];
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const t of tiers) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = t === 'all' ? 'all tiers' : 'tier ' + t; b.setAttribute('aria-pressed', monTier === t); b.onclick = () => { monTier = t; render(); }; chips.appendChild(b); }
  f.appendChild(chips);
  const rows = D.monsters.filter((m) => (monTier === 'all' || m.tier === monTier) && hit(m.name + ' ' + m.kind + ' ' + (m.family || '') + ' ' + (m.notes || []).join(' ') + ' ' + (m.lootTable || []).join(' ') + ' ' + (D.livesAt[m.id] || []).join(' ')));
  const noteHtml = (m) => (m.notes || []).map((n) => '<span class="tag" title="' + esc(D.tagMeaning[n] || '') + '">' + esc(words(n)) + '</span>').join(' ');
  const tameText = (m) => m.tamable ? 'Taming ' + m.tamable.difficulty + ', fed ' + words(m.tamable.food) : '';
  const t = table([['monster', 'name'], ['tier', 'tier', { num: true }], ['kind', 'kind'], ['family', (m) => words(m.family || '')], ['health', 'hp', { num: true }], ['damage', (m, s) => s ? (m.damage[0] + m.damage[1]) / 2 : m.damage.join(' to '), { num: true }], ['swing s', 'speed', { num: true }], ['hit', 'hit', { num: true }], ['def', 'def', { num: true }], ['AR', 'ar', { num: true }], ['aggro m', 'aggro', { num: true }], ['gold', (m) => (m.gold || []).join(' to ')], ['drops', (m) => (m.lootTable || []).map(words).join(', ')], ['tamable', tameText], ['lives at', (m) => (D.livesAt[m.id] || []).join(', ')], ['notes', noteHtml, { html: true }]], rows, { sort: 1 });
  t.querySelectorAll('tbody tr').forEach((tr, i) => tr.addEventListener('click', () => { const nm = tr.children[0].textContent; const m = D.monsters.find((x) => x.name === nm); if (m) openModal('<h3>' + esc(m.name) + '</h3><pre>' + esc(JSON.stringify(m, null, 2)) + '</pre>'); }));
  f.appendChild(t);
  f.appendChild(el('<h2>Bosses</h2>'));
  const bt = table([['boss', 'name'], ['lair', (m) => D.lairName[m.id] || (m.lair ? words(m.lair) : '')], ['health', 'hp', { num: true }], ['damage', (m) => m.damage.join(' to ')], ['hit', 'hit', { num: true }], ['def', 'def', { num: true }], ['AR', 'ar', { num: true }], ['phases at', (m) => (m.phases || []).map((p) => Math.round(p * 100) + '%').join(', ')], ['summons', (m) => m.summons ? m.summons.count + ' ' + ((D.monsters.find((x) => x.id === m.summons.id) || { name: words(m.summons.id) }).name) : ''], ['gold', (m) => (m.gold || []).join(' to ')], ['drops', (m) => (m.lootTable || []).map(words).join(', ')], ['notes', noteHtml, { html: true }]], D.bosses.filter((m) => hit(m.name + ' ' + (D.lairName[m.id] || ''))));
  bt.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => { const m = D.bosses.find((x) => x.name === tr.children[0].textContent); if (m) openModal('<h3>' + esc(m.name) + '</h3><pre>' + esc(JSON.stringify(m, null, 2)) + '</pre>'); }));
  f.appendChild(bt);
  f.appendChild(el('<h2>Tier bands</h2><div class="note">A tier’s band is the skill range of the player it is meant for; its gold is what one kill leaves.</div>'));
  f.appendChild(table([['tier', 'tier', { num: true }], ['for skills', (t) => t.band.join(' to ')], ['gold per kill', (t) => t.gold.join(' to ')]], Object.entries(D.tierBands).map(([k, v]) => ({ tier: +k, ...v }))));
  f.appendChild(el('<h2>Who lives where</h2><div class="note">By named place, day and night. A place with nothing listed spawns from its biome table below.</div>'));
  const nm = (id) => (D.monsters.find((m) => m.id === id) || { name: words(id) }).name;
  f.appendChild(table([['place', 'name'], ['realm', 'realm'], ['biome', 'biome'], ['by day', (h) => h.day.map(nm).join(', ') || 'nothing'], ['by night', (h) => h.night.map(nm).join(', ') || 'nothing']], Object.values(D.habitatByPlace).filter((h) => hit(h.name + ' ' + h.realm + ' ' + [...h.day, ...h.night].map(nm).join(' '))), { sort: 1 }));
  f.appendChild(el('<h2>Habitat by biome</h2>'));
  f.appendChild(table([['biome', 'biome'], ['by day', (h) => h.day.map((id) => (D.monsters.find((m) => m.id === id) || { name: id }).name).join(', ') || 'nothing'], ['by night', (h) => h.night.map((id) => (D.monsters.find((m) => m.id === id) || { name: id }).name).join(', ') || 'nothing']], Object.entries(D.habitat).map(([k, v]) => ({ biome: k, ...v }))));
  return f;
};

let rcFamily = 'all';
R.crafting = () => {
  const f = el('<h1>Crafting</h1><p class="lede">' + D.recipes.length + ' recipes plus ' + D.forageRecipes.length + ' from the forage. Difficulty is against the skill named; the station is where you stand. Materials are ingots, logs, hides and what the woods give.</p>');
  const fams = ['all', ...Array.from(new Set(D.recipes.map((r) => r.family)))];
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const g of fams) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = g; b.setAttribute('aria-pressed', rcFamily === g); b.onclick = () => { rcFamily = g; render(); }; chips.appendChild(b); }
  f.appendChild(chips);
  const rows = D.recipes.filter((r) => (rcFamily === 'all' || r.family === rcFamily) && hit(r.name + ' ' + r.skill + ' ' + r.station + ' ' + Object.keys(r.materials || {}).join(' ')));
  f.appendChild(el('<div class="count">' + rows.length + ' shown' + (rows.length > 300 ? ', search or pick a family to narrow' : '') + '</div>'));
  f.appendChild(table([['', (r) => icoI(r.result && r.result.base), { html: true }], ['recipe', 'name'], ['family', 'family'], ['skill', (r) => skById[r.skill]?.name || r.skill], ['difficulty', 'difficulty', { num: true }], ['materials', (r) => Object.entries(r.materials || {}).map(([k, v]) => v + ' ' + words(k)).join(', ')], ['station', 'station']], rows.slice(0, 400), { sort: 4 }));
  if (D.forageRecipes.length) { f.appendChild(el('<h2>From the forage</h2>')); f.appendChild(table([['', (r) => icoI(r.result && r.result.base), { html: true }], ['recipe', 'name'], ['skill', (r) => skById[r.skill]?.name || r.skill], ['difficulty', 'difficulty', { num: true }], ['materials', (r) => Object.entries(r.materials || {}).map(([k, v]) => v + ' ' + words(k)).join(', ')], ['station', 'station']], D.forageRecipes.filter((r) => hit(r.name)))); }
  return f;
};

R.people = () => {
  const f = el('<h1>Townsfolk</h1><p class="lede">The kinds of people a town or hamlet can hold: what they sell, buy and teach, and what they will do for you. A trainer teaches to the cap in the row and no further.</p>');
  f.appendChild(table([['role', 'name'], ['found in', (n) => (n.appearsIn || []).join(', ') + (n.nightOnly ? ', night only' : '')], ['sells', (n) => (n.sells || []).join(', ')], ['buys', (n) => (n.buys || []).join(', ')], ['teaches', (n) => (n.teaches || []).map((s) => skById[s]?.name || s).join(', ')], ['services', (n) => (n.services || []).join(', ')], ['sells up to tier', 'sellsToTier', { num: true }], ['a line', (n) => (n.lines || [])[0] || '']], D.npcs.filter((n) => hit(n.name + ' ' + (n.teaches || []).join(' ') + ' ' + (n.sells || []).join(' ')))));
  return f;
};

R.rules = () => {
  const c = D.rules.combat, st = D.rules.stats;
  const f = el('<h1>Rules and calculators</h1><p class="lede">The arithmetic, as the code has it, with sliders to try it. Every constant here is the one the game uses.</p>');
  f.appendChild(el('<h2>Stats</h2>'));
  f.appendChild(table([['derived', 0], ['formula', 1]], st.formulas.map((r) => ({ 0: r[0], 1: r[1] }))));
  f.appendChild(el('<div class="note">Caps: each stat ' + st.caps.statCap + ', all five ' + st.caps.totalCap + ' ever, ' + st.caps.startTotal + ' to place at creation with no stat under ' + st.caps.minAtCreation + '. Each skill ' + st.caps.skillCap + ', all skills ' + st.caps.skillTotalCap + '.</div>'));
  f.appendChild(el('<h2>Skill gain bands</h2><div class="note">Every use of a skill rolls a gain. The step is what one gain adds; "uses" is roughly how many uses cross the band.</div>'));
  f.appendChild(table([['from', 'min', { num: true }], ['to', 'max', { num: true }], ['gain per success', 'step', { num: true }], ['uses across the band', 'uses', { num: true }]], st.bands));
  f.appendChild(el('<h2>Combat</h2>'));
  f.appendChild(table([['rule', 0], ['formula', 1]], [
    ['attack skill', 'weapon skill + Tactics x ' + c.TACTICS_TO_HIT + ' + hit bonus (minus ' + 20 + ' at zero stamina)'],
    ['defence skill', 'weapon skill x 0.5 + Parrying x 0.5 + DEX x 0.4 + defence bonus'],
    ['hit chance', 'clamp(' + c.HIT_BASE + ' + (attack - defence) x ' + c.HIT_PER_SKILL + ', ' + c.HIT_MIN + ', ' + c.HIT_MAX + ')'],
    ['dodge', 'clamp(DEX x ' + c.DODGE_PER_DEX + ' + bonus, 0, ' + c.DODGE_CAP + '), rolled after a hit lands'],
    ['parry', 'Parrying x ' + c.PARRY_PER_SKILL + ' x shield factor, cap ' + c.PARRY_CAP + '; no shield, no parry'],
    ['melee damage', 'weapon roll x (1 + STR x ' + c.DAMAGE_PER_STR + ' + Tactics x ' + c.DAMAGE_PER_TACTICS + ' + Anatomy x ' + c.DAMAGE_PER_ANATOMY + '); ranged reads DEX for STR'],
    ['critical', c.CRIT_BASE_CHANCE * 100 + '% for x' + c.CRIT_BASE_MULT],
    ['armour', 'damage x ' + c.AR_CONSTANT + ' / (' + c.AR_CONSTANT + ' + AR): AR ' + c.AR_CONSTANT + ' halves'],
    ['resistance', 'percent points off that damage type, capped at ' + c.RESIST_CAP],
    ['spell damage', 'roll x (1 + INT x ' + c.SPELL_PER_INT + ' + Evaluating Intelligence x ' + c.SPELL_PER_EVAL_INT + ' + bonus); spell crit +' + c.SPELL_CRIT_PER_INT + ' per INT'],
    ['resisting spells', 'incoming magic x (1 - skill x ' + c.RESIST_SPELLS_PER_POINT + ')'],
    ['swing time', 'weapon speed x (1 - DEX x ' + c.SWING_DEX_PER_POINT + '), floor ' + c.SWING_FLOOR + ' s, doubled at zero stamina; stamina cost is the weapon’s weight'],
    ['jump attack', 'x' + c.JUMP_ATTACK_MULT],
    ['falling', 'free for ' + c.FALL_FREE_METRES + ' m, then ' + c.FALL_PER_METRE + ' a metre'],
    ['poison', c.POISON_PER_LEVEL + ' health a second per level for ' + c.POISON_SECONDS_PER_LEVEL + ' s per level'],
    ['fleeing', 'below ' + c.FLEE_THRESHOLD * 100 + '% health, never for ' + c.NEVER_FLEE.join(' or ')],
    ['aggro radius', Object.entries(c.AGGRO_RADIUS).map(([k, v]) => k + ' ' + v + ' m').join(', ')],
  ].map((r) => ({ 0: r[0], 1: r[1] }))));
  f.appendChild(el('<h2>Try it</h2>'));
  const calc = el('<div class="calc">' +
    '<div class="box"><h3>Hit chance</h3><label>your weapon skill <span id="v1"></span></label><input type="range" id="s1" min="0" max="100" value="50"><label>your Tactics <span id="v2"></span></label><input type="range" id="s2" min="0" max="100" value="30"><label>their weapon skill <span id="v3"></span></label><input type="range" id="s3" min="0" max="100" value="40"><label>their Parrying <span id="v4"></span></label><input type="range" id="s4" min="0" max="100" value="0"><label>their DEX <span id="v5"></span></label><input type="range" id="s5" min="10" max="100" value="50"><div class="out" id="o1"></div></div>' +
    '<div class="box"><h3>Armour</h3><label>armour rating <span id="v6"></span></label><input type="range" id="s6" min="0" max="300" value="60"><label>resist to this type, % <span id="v7"></span></label><input type="range" id="s7" min="0" max="70" value="0"><label>incoming damage <span id="v8"></span></label><input type="range" id="s8" min="1" max="200" value="40"><div class="out" id="o2"></div></div>' +
    '<div class="box"><h3>Mana regeneration</h3><label>Wisdom <span id="v9"></span></label><input type="range" id="s9" min="10" max="100" value="50"><label>Meditation <span id="v10"></span></label><input type="range" id="s10" min="0" max="100" value="50"><label>armour tier worn on all eight pieces</label><select id="s11">' + D.tiers.map((t) => '<option value="' + t.meditation + '">' + esc(t.material) + '</option>').join('') + '<option value="1" selected>nothing</option></select><div class="out" id="o3"></div></div>' +
    '<div class="box"><h3>Swing time</h3><label>weapon</label><select id="s12">' + D.weapons.map((w) => '<option value="' + w.speed + '">' + esc(w.name) + ' (' + w.speed + ' s)</option>').join('') + '</select><label>Dexterity <span id="v13"></span></label><input type="range" id="s13" min="10" max="100" value="50"><div class="out" id="o4"></div></div>' +
    '<div class="box"><h3>Spell damage</h3><label>spell</label><select id="s14">' + D.abilities.filter((a) => a.spell && JSON.stringify(a.effect).includes('spellDamage')).map((a) => '<option value="' + a.id + '">' + esc(a.name) + '</option>').join('') + '</select><label>Intellect <span id="v15"></span></label><input type="range" id="s15" min="10" max="100" value="50"><label>Evaluating Intelligence <span id="v16"></span></label><input type="range" id="s16" min="0" max="100" value="0"><div class="out" id="o5"></div></div>' +
    '</div>');
  f.appendChild(calc);
  setTimeout(() => {
    const g = (id) => +document.getElementById(id).value;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    function upd() {
      for (let i = 1; i <= 16; i++) { const e = document.getElementById('s' + i); if (e && e.type === 'range') set('v' + i, e.value); }
      const atk = g('s1') + g('s2') * c.TACTICS_TO_HIT, def = g('s3') * 0.5 + g('s4') * 0.5 + g('s5') * 0.4;
      const hc = Math.max(c.HIT_MIN, Math.min(c.HIT_MAX, c.HIT_BASE + (atk - def) * c.HIT_PER_SKILL));
      const dodge = Math.min(c.DODGE_CAP, g('s5') * c.DODGE_PER_DEX);
      document.getElementById('o1').innerHTML = Math.round(hc * 100) + '% to hit<small>attack ' + atk.toFixed(1) + ' vs defence ' + def.toFixed(1) + '; then they dodge ' + Math.round(dodge * 100) + '% of landed hits</small>';
      const ar = g('s6'), res = g('s7'), dmg = g('s8');
      const after = dmg * (1 - ar / (ar + c.AR_CONSTANT)) * (1 - res / 100);
      document.getElementById('o2').innerHTML = Math.max(1, Math.round(after)) + ' damage taken<small>of ' + dmg + ': armour keeps ' + Math.round(100 * ar / (ar + c.AR_CONSTANT)) + '%, resist keeps ' + res + '% of the rest</small>';
      const med = +document.getElementById('s11').value; const mr = 0.3 + g('s9') * 0.025 + g('s10') * 0.010 * med;
      document.getElementById('o3').innerHTML = mr.toFixed(2) + ' mana a second<small>' + (med < 1 ? 'the armour keeps ' + Math.round(med * 100) + '% of the Meditation part' : 'nothing in the way of Meditation') + '</small>';
      const sp = +document.getElementById('s12').value; let sw = sp * Math.max(0.1, 1 - g('s13') * c.SWING_DEX_PER_POINT); if (sw < c.SWING_FLOOR) sw = c.SWING_FLOOR;
      document.getElementById('o4').innerHTML = sw.toFixed(2) + ' s a swing<small>floor ' + c.SWING_FLOOR + ' s; doubled at zero stamina</small>';
      const a = abById[document.getElementById('s14').value]; const find = (e) => { if (!e) return null; if (e.kind === 'spellDamage') return e; if (e.parts) for (const p of e.parts) { const r = find(p); if (r) return r; } return null; }; const roll = find(a && a.effect);
      if (roll) { const mult = 1 + g('s15') * c.SPELL_PER_INT + g('s16') * c.SPELL_PER_EVAL_INT; document.getElementById('o5').innerHTML = Math.round(roll.min * mult) + ' to ' + Math.round(roll.max * mult) + ' ' + esc(roll.type || '') + '<small>base ' + roll.min + ' to ' + roll.max + ' x ' + mult.toFixed(2) + '</small>'; }
    }
    calc.querySelectorAll('input,select').forEach((e) => e.addEventListener('input', upd));
    upd();
  }, 0);
  return f;
};

function render() {
  main.textContent = '';
  const r = R[active] || R.overview;
  main.appendChild(r());
  main.appendChild(el('<div class="foot">Generated from src/mmo by scripts/build-wiki.mjs on ' + esc(D.built) + '. Rebuild it after a rules change and republish; nothing here is typed by hand.</div>'));
}
const want = (location.hash || '').slice(1);
show(R[want] ? want : 'overview');
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (R[h]) show(h); });
})();
</script>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const kb = Math.round(fs.statSync(out).size / 1024);
console.log(`codex: ${abilities.length} abilities, ${skills.length} skills, ${openings.length} openings, ${weapons.length} weapons, ${tiers.length} tiers, ${bases.length} bases, ${affixes.length} affixes, ${monsters.length} monsters, ${bosses.length} bosses, ${recipes.length} recipes, ${npcs.length} npcs -> ${out} (${kb} KB)`);
