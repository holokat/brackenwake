// The con rule, counted. Run: node src/game/con.test.mjs
//
// Nothing here is asserted from the shape of the code: the table of every
// monster tier against every player band is PRINTED, and the checks read that
// table. The one that matters most is the last block: the same wolf, seen by
// two characters, has to be two different colours, because the rule is about
// the player and not about the wolf.
//
// The rule the whole file turns on: a player reads one rung BELOW their skill
// band. Every opening but Blank starts at 50, which is band 3, and the zone
// written to meet a new character is the Greenwold at tier 1 to 2. Read off the
// band a fresh Warrior saw his entire starting zone as grey. Read off the rung
// he sees a wolf as a fair fight, which is what the zone is for.

import {
  conOf, conLabel, playerTier, conTier, tierForSkill, bestCombatSkill, auditCon,
  CON_LEVELS, CON_BY_LEVEL, CON_SKILLS, CASTING_ATTACK_SKILLS,
  PLAYER_TIER_FLOORS, MAX_PLAYER_TIER, BOSS_TIER, SKULL_LEVELS, CON_TIER_DROP,
} from './con.js';
import { OPENINGS } from '../mmo/openings.js';
import { REALMS } from '../mmo/realms.js';
import { TIERS, MONSTERS, MONSTER_LIST } from '../mmo/monsters.js';
import { COMBAT_SKILLS } from '../mmo/items.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** A character whose one skill is `v`. The rule reads the best, so one is enough. */
const at = (v, skill = 'swordsmanship') => ({ skills: { [skill]: v } });
const mon = (tier, extra = {}) => ({ name: 'thing', tier, ...extra });

// --- the table it is built from ------------------------------------------------
console.log('con: the bands are monsters.js TIERS, not a second copy');
ck('the six player floors are the six tier floors',
  PLAYER_TIER_FLOORS.join(',') === [0, 1, 2, 3, 4, 5].map((t) => TIERS[t].band[0]).join(','),
  PLAYER_TIER_FLOORS.join(','));
ck('the boss tier is 6 and monsters.js still has one', BOSS_TIER === 6 && !!TIERS[6]);
ck('the audit passes at import and returns what it counted', JSON.stringify(auditCon().floors) === JSON.stringify(PLAYER_TIER_FLOORS));

console.log('con: the skills that count');
ck('items.js COMBAT_SKILLS are all in the list', COMBAT_SKILLS.every((s) => CON_SKILLS.includes(s)), `${COMBAT_SKILLS.length} of them`);
ck('and the four attacking schools are added', CASTING_ATTACK_SKILLS.every((s) => CON_SKILLS.includes(s)), CASTING_ATTACK_SKILLS.join(' '));
ck('fifteen skills in all, no duplicates', CON_SKILLS.length === 15 && new Set(CON_SKILLS).size === 15, String(CON_SKILLS.length));
ck('a craft skill is NOT one of them', !CON_SKILLS.includes('tailoring') && !CON_SKILLS.includes('blacksmithing'));
ck('and neither is the magic that does not attack',
  !CON_SKILLS.includes('inscription') && !CON_SKILLS.includes('meditation') && !CON_SKILLS.includes('spiritSpeak'));

// --- the player's tier ---------------------------------------------------------
console.log('con: the player tier, at the edge of every band');
for (const [v, want] of [[0, 0], [9.9, 0], [10, 1], [24.9, 1], [27, 1], [30, 2], [45, 2], [50, 3], [69, 3], [70, 4], [89, 4], [90, 5], [100, 5]]) {
  ck(`skill ${v} is tier ${want}`, tierForSkill(v) === want, `read ${tierForSkill(v)}`);
}
ck('a grandmaster is never read as the boss tier', playerTier(at(100)) === MAX_PLAYER_TIER && MAX_PLAYER_TIER === 5);
ck('nothing above 10 is tier 0', playerTier({ skills: { swordsmanship: 9, tailoring: 100 } }) === 0);
ck('a grandmaster tailor with no weapon is still tier 0',
  playerTier({ skills: { tailoring: 100, mining: 100, cooking: 100 } }) === 0);
ck('the best skill wins, not the first', playerTier({ skills: { swordsmanship: 12, magery: 74 } }) === 4,
  `swordsmanship 12 and magery 74 reads tier ${playerTier({ skills: { swordsmanship: 12, magery: 74 } })}`);
ck('a necromancer is measured too', playerTier(at(92, 'necromancy')) === 5);
ck('and a paladin', playerTier(at(52, 'chivalry')) === 3);
ck('an empty character is tier 0, and does not throw', playerTier() === 0 && playerTier({}) === 0 && playerTier(null) === 0);
ck('a bare skill map works as well as a character', playerTier({ swordsmanship: 70 }) === 4);
ck('the best skill can be named', bestCombatSkill({ skills: { swordsmanship: 12, archery: 40 } }).id === 'archery');

// --- the rung, which is what the colours are read from -------------------------
console.log('con: the rung is the band less one, floored at zero');
ck('the drop is one rung', CON_TIER_DROP === 1, String(CON_TIER_DROP));
for (const [v, band, rung] of [[0, 0, 0], [9.9, 0, 0], [10, 1, 0], [24.9, 1, 0], [30, 2, 1], [50, 3, 2], [70, 4, 3], [90, 5, 4], [100, 5, 4]]) {
  ck(`skill ${v} is band ${band} and reads as tier ${rung}`,
    playerTier(at(v)) === band && conTier(at(v)) === rung,
    `band ${playerTier(at(v))}, rung ${conTier(at(v))}`);
}
ck('bands 0 and 1 both floor at rung 0, so nothing reads below zero',
  conTier(at(0)) === 0 && conTier(at(10)) === 0 && conTier(at(24)) === 0);
ck('and a grandmaster reads as 4, one below the 5 he stands in',
  playerTier(at(100)) === MAX_PLAYER_TIER && conTier(at(100)) === MAX_PLAYER_TIER - 1,
  `band ${playerTier(at(100))}, rung ${conTier(at(100))}`);

// --- every tier against every player band --------------------------------------
console.log('con: the whole table, monster tier down the side, player BAND across');
console.log('       (the rung under each band is what the colour is read from)');
{
  const bands = [0, 1, 2, 3, 4, 5];
  const rung = (b) => Math.max(0, b - CON_TIER_DROP);
  console.log(`             ${bands.map((b) => `b${b}/r${rung(b)}`.padEnd(9)).join('')}`);
  const grid = [];
  for (const t of [0, 1, 2, 3, 4, 5, 6]) {
    const row = [];
    for (const b of bands) {
      // the player's skill is that band's floor, so every cell is a real character
      const c = conOf(mon(t, { boss: t === 6 }), at(PLAYER_TIER_FLOORS[b]));
      row.push(c.level);
    }
    grid.push(row);
    console.log(`       m${t}    ${row.map((r) => r.padEnd(9)).join('')}`);
  }
  const cell = (t, b) => grid[t][b];
  ck('a monster of your own RUNG is even and yellow every time',
    bands.every((b) => cell(rung(b), b) === 'even'), bands.map((b) => cell(rung(b), b)).join(','));
  ck('one below the rung is easy every time',
    bands.filter((b) => rung(b) >= 1).every((b) => cell(rung(b) - 1, b) === 'easy'),
    bands.filter((b) => rung(b) >= 1).map((b) => cell(rung(b) - 1, b)).join(','));
  ck('one above the rung is hard every time',
    bands.filter((b) => rung(b) + 1 <= 5).every((b) => cell(rung(b) + 1, b) === 'hard'),
    bands.filter((b) => rung(b) + 1 <= 5).map((b) => cell(rung(b) + 1, b)).join(','));
  ck('two or more below the rung is trivial every time',
    grid.slice(0, 6).every((row, t) => row.every((lvl, b) => (t - rung(b) <= -2 ? lvl === 'trivial' : true))));
  ck('two or more above the rung is deadly every time',
    grid.slice(0, 6).every((row, t) => row.every((lvl, b) => (t - rung(b) >= 2 ? lvl === 'deadly' : true))));
  ck('and the boss row is purple for every player, grandmaster included',
    grid[6].every((l) => l === 'boss'), grid[6].join(','));
  ck('no band reads its whole tier 1 to 2 world as grey any more',
    bands.every((b) => !(cell(1, b) === 'trivial' && cell(2, b) === 'trivial') || rung(b) >= 4),
    bands.map((b) => `b${b}:${cell(1, b)}/${cell(2, b)}`).join(' '));
  // 42 cells, and every one of them is a level the ladder knows
  const cells = grid.flat();
  ck('every one of the 42 cells is a level with a colour',
    cells.length === 42 && cells.every((l) => !!CON_BY_LEVEL[l]), `${cells.length} cells`);
}

// --- the ends of the ladder ----------------------------------------------------
console.log('con: the two open ends');
ck('three rungs below is still grey, not something new', conOf(mon(0), at(70)).level === 'trivial');
ck('five above the rung is still red', conOf(mon(5), at(9)).level === 'deadly');
ck('and the raw delta is kept, unclamped, so a caller can say how far',
  conOf(mon(5), at(9)).delta === 5 && conOf(mon(0), at(90)).delta === -4,
  `${conOf(mon(5), at(9)).delta} and ${conOf(mon(0), at(90)).delta}`);
ck('and the band it came from is reported beside the rung',
  conOf(mon(2), at(90)).band === 5 && conOf(mon(2), at(90)).mine === 4,
  `band ${conOf(mon(2), at(90)).band}, rung ${conOf(mon(2), at(90)).mine}`);

console.log('con: the colours and the words');
for (const c of CON_LEVELS) ck(`${c.level} is ${c.colour} and says "${c.word}"`, /^#[0-9a-f]{6}$/i.test(c.colour) && c.word.length > 0);
ck('the five below the boss are floaters.js\'s own palette',
  CON_LEVELS.slice(0, 5).map((c) => c.colour).join(',') === '#9aa0a6,#7ee07a,#ffd23f,#ff9a3c,#ff5a4d',
  CON_LEVELS.slice(0, 5).map((c) => c.colour).join(','));
ck('the boss purple is not the epic item purple', CON_BY_LEVEL.boss.colour !== '#a335ee', CON_BY_LEVEL.boss.colour);
ck('the skull goes on red and purple, and on nothing else',
  SKULL_LEVELS.join(',') === 'deadly,boss', SKULL_LEVELS.join(','));
ck('a fair fight carries no skull', conOf(mon(2), at(50)).skull === false);
ck('and a thing that will kill you does', conOf(mon(4), at(30)).skull === true);

console.log('con: the label a hover reads');
ck('"Wolf, a fair fight"', conLabel({ name: 'Wolf', tier: 2 }, at(50)) === 'Wolf, a fair fight', conLabel({ name: 'Wolf', tier: 2 }, at(50)));
ck('and the same wolf to a beginner', conLabel({ name: 'Wolf', tier: 2 }, at(0)) === 'Wolf, it will kill you', conLabel({ name: 'Wolf', tier: 2 }, at(0)));
ck('a nameless thing is still named', conLabel({ tier: 1 }, at(30)) === 'something, a fair fight', conLabel({ tier: 1 }, at(30)));

// --- bosses --------------------------------------------------------------------
console.log('con: a boss is purple however you got there');
{
  const king = MONSTERS.ashenKing;
  ck('the Ashen King is tier 6 in the table', king.tier === 6 && king.boss === true, `tier ${king.tier}`);
  ck('and reads purple to a grandmaster', conOf(king, at(100)).level === 'boss', conOf(king, at(100)).colour);
  ck('and purple to a beginner too', conOf(king, at(0)).level === 'boss');
  ck('a row flagged boss at tier 5 is still purple', conOf(mon(5, { boss: true }), at(90)).level === 'boss');
  ck('a tier 6 row that forgot its flag is purple by its tier alone', conOf(mon(6), at(90)).level === 'boss');
  ck('the boss word is the boss word', conOf(king, at(50)).word === 'a boss');
}

// --- every row in the table ----------------------------------------------------
console.log('con: every monster in monsters.js reads as something');
{
  const fresh = { skills: {} };
  const gm = at(100);
  let bad = 0, counts = {};
  for (const m of MONSTER_LIST) {
    const a = conOf(m, fresh), b = conOf(m, gm);
    if (!CON_BY_LEVEL[a.level] || !CON_BY_LEVEL[b.level]) bad++;
    counts[a.level] = (counts[a.level] || 0) + 1;
  }
  ck(`all ${MONSTER_LIST.length} rows read as a level for a fresh character and for a grandmaster`, bad === 0,
    Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') + ' to a fresh character');
  const tier0 = MONSTER_LIST.filter((m) => m.tier === 0);
  ck('a tier 0 critter is even to a character with nothing trained, not grey',
    tier0.length === 0 || conOf(tier0[0], fresh).level === 'even',
    tier0.length ? `${tier0[0].name} reads ${conOf(tier0[0], fresh).level}` : 'no tier 0 rows yet');
  ck('and grey to a grandmaster',
    tier0.length === 0 || conOf(tier0[0], gm).level === 'trivial');
}

// --- the point of the whole thing ----------------------------------------------
//
// The rule is about the player's skills, so it moves as they train. One wolf,
// two characters, and the wolf never changes.
console.log('con: the same wolf, trained past');
{
  const wolf = MONSTERS.wolf;
  const before = JSON.stringify(wolf);
  const fresh = { skills: { swordsmanship: 0 } };
  const gm = { skills: { swordsmanship: 100 } };
  const a = conOf(wolf, fresh), b = conOf(wolf, gm);
  ck(`the wolf is tier ${wolf.tier} in the table`, wolf.tier === 2);
  ck('to a fresh character it is red and says it will kill you',
    a.level === 'deadly' && a.colour === '#ff5a4d' && a.word === 'it will kill you', `${a.level} ${a.colour} "${a.word}"`);
  ck('to a grandmaster the same wolf is grey and no threat',
    b.level === 'trivial' && b.colour === '#9aa0a6' && b.word === 'no threat', `${b.level} ${b.colour} "${b.word}"`);
  ck('the wolf itself was not touched by being looked at', JSON.stringify(wolf) === before);
  // and the whole way up, one step at a time
  const walk = [0, 10, 30, 50, 70, 90, 100].map((v) => conOf(wolf, at(v)).level);
  ck('training swordsmanship 0 to 100 walks the wolf down the ladder and never back up',
    walk.join(',') === 'deadly,deadly,hard,even,easy,trivial,trivial', walk.join(','));
  // the same walk in magery, because a mage is measured too
  const mage = [0, 30, 50, 90].map((v) => conOf(wolf, at(v, 'magery')).level);
  ck('and a mage walks the same path', mage.join(',') === 'deadly,hard,even,trivial', mage.join(','));
}

// --- the bug this rule was changed to fix --------------------------------------
//
// A fresh Warrior walks out of Hearthhome with swordsmanship 50 and looks at
// the Greenwold. Before the rung, every name in it was grey. What it has to say
// now is measured against the REAL rows and the REAL realm band, not against a
// tier typed in here.
console.log('con: a fresh Warrior reading the starting zone');
{
  const warrior = OPENINGS.find((o) => o.id === 'warrior') || OPENINGS.find((o) => o.skills && o.skills.swordsmanship);
  ck('the Warrior opening really does start at swordsmanship 50',
    warrior.skills.swordsmanship === 50, `${warrior.skills.swordsmanship}`);
  const fresh = { skills: { ...warrior.skills } };
  ck('which is band 3, and reads as tier 2', playerTier(fresh) === 3 && conTier(fresh) === 2,
    `band ${playerTier(fresh)}, rung ${conTier(fresh)}`);

  const greenwold = REALMS.find((r) => r.id === 'greenwold');
  ck('and the Greenwold he is standing in is a tier 1 to 2 realm',
    greenwold.danger[0] === 1 && greenwold.danger[1] === 2, greenwold.danger.join(' to '));

  const wolf = conOf(MONSTERS.wolf, fresh);
  ck('a wolf, tier 2, is yellow and a fair fight',
    wolf.level === 'even' && wolf.colour === '#ffd23f' && wolf.word === 'a fair fight',
    `${wolf.level} ${wolf.colour} "${wolf.word}"`);
  const scout = conOf(MONSTERS.goblinScout, fresh);
  ck('a goblin scout, tier 1, is green', scout.level === 'easy' && scout.colour === '#7ee07a',
    `${scout.level} ${scout.colour}`);
  const rabbit = conOf(MONSTERS.rabbit, fresh);
  ck('a rabbit, tier 0, is grey', rabbit.level === 'trivial' && rabbit.colour === '#9aa0a6',
    `${rabbit.level} ${rabbit.colour}`);
  const three = conOf(mon(3), fresh);
  ck('a tier 3 row is orange', three.level === 'hard' && three.colour === '#ff9a3c', `${three.level} ${three.colour}`);
  const boss = conOf(MONSTERS.oramBlackhand, fresh);
  ck('and the boss in the Old Cellars is purple',
    boss.level === 'boss' && boss.colour === '#c07bf0', `${boss.level} ${boss.colour}`);

  // and no row the open Greenwold can produce is grey to him any more
  const openGreenwold = ['giantRat', 'goblinScout', 'skeleton', 'zombie', 'wolf', 'boar', 'bandit', 'legionSoldier', 'legionArcher', 'raider'];
  const greys = openGreenwold.filter((id) => conOf(MONSTERS[id], fresh).level === 'trivial');
  ck('not one of the ten rows the open Greenwold spawns reads grey to him',
    greys.length === 0, greys.length ? greys.join(', ') : openGreenwold.map((id) => `${id}:${conOf(MONSTERS[id], fresh).level}`).join(' '));
}

console.log('con: the other end of it, both ways');
{
  // Nobody starts with nothing since the Blank opening went (2026-09-08, four
  // classes only), but a character with every combat skill at 0 is still the
  // other end of the ladder, and a tier 1 goblin ought to worry them.
  ck('no opening left starts with every combat skill at 0',
    OPENINGS.every((o) => CON_SKILLS.some((id) => (o.skills || {})[id] > 0)),
    OPENINGS.map((o) => o.id).join(','));
  const nothing = { skills: {} };
  ck('so an empty sheet is band 0 and reads as tier 0', playerTier(nothing) === 0 && conTier(nothing) === 0);
  ck('and a goblin scout is orange to him, not green',
    conOf(MONSTERS.goblinScout, nothing).level === 'hard', conOf(MONSTERS.goblinScout, nothing).level);

  // A grandmaster is band 5 and reads as 4, so the top of the ladder is still
  // above him. Before the rung, tier 5 was his own colour and nothing on the
  // Ashen Throne read as a threat.
  const gm = at(100);
  ck('a grandmaster at 100 reads tier 5 as hard, not even',
    conOf(mon(5), gm).level === 'hard', conOf(mon(5), gm).level);
  ck('and tier 4 as a fair fight', conOf(mon(4), gm).level === 'even', conOf(mon(4), gm).level);
  ck('and a boss is still purple to him', conOf(mon(6, { boss: true }), gm).level === 'boss');
  ck('MAX_PLAYER_TIER is untouched at 5', MAX_PLAYER_TIER === 5);
}

// --- every surface that names a monster ----------------------------------------
//
// The failure this block exists to catch is the one the repo has shipped
// before: a rule with a writer and no consumer. Each file below is READ, and
// the check says so in its name, because the ui system needs a document, a
// renderer and a WebGL context and cannot be booted in node. What the surfaces
// then DO with the rule is measured for real in targeting.test.mjs (the frame,
// the plate, the ring, the floaters) and hud.test.mjs (the pixels).
console.log('con: the surfaces read the rule (read from source)');
{
  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = (f) => readFileSync(join(HERE, f), 'utf8');
  const surfaces = [
    ['targeting.js', 'targeting.js', /from '\.\/con\.js'/, /conOf\(target, character\)/],
    ['target_ring.js', 'target_ring.js', /from '\.\/con\.js'/, /CON_BY_LEVEL\[l\]/],
    ['the hover hint in app/systems/ui.js', 'app/systems/ui.js', /from '\.\.\/\.\.\/con\.js'/, /hover = conLabel\(who, character\)/],
  ];
  for (const [name, file, imports, uses] of surfaces) {
    const text = src(file);
    ck(`${name} imports the rule and uses it`, imports.test(text) && uses.test(text),
      `${imports.test(text) ? 'imports' : 'NO import'}, ${uses.test(text) ? 'uses' : 'NO use'}`);
  }
  const ui = src('app/systems/ui.js');
  ck('the hover line hands the colour to setHint, not just the words',
    /hud\.setHint\?\.\(hover, hoverColour/.test(ui), ui.split('\n').find((l) => l.includes('setHint?.(hover'))?.trim());
  const targeting = src('targeting.js');
  ck('targeting pushes the level to the floaters and the ring every frame',
    /setAnger\(f \? f\.level : null\)/.test(targeting) && /setRingCon\(f \? f\.level : null\)/.test(targeting));
  ck('and hands the HUD a plate on the same call', /hud\?\.setNameplate\?\.\(plate\)/.test(targeting));
  const hud = src('hud.js');
  ck('hud.js draws the plate, the skull and the con colour',
    /setNameplate\(p\)/.test(hud) && /SKULL_MARK/.test(hud) && /plateName\.style\.color = colour/.test(hud));
  const floaters = src('floaters.js');
  ck('floaters.js reddens only the number you take', /kind === 'taken' && ANGRY_LEVELS\.has\(level\)/.test(floaters));
  // and the one surface that is deliberately NOT wired
  const dev = src('win_dev.js');
  ck('the dev bench readout is left alone: it names tiers, not colours',
    !/con\.js/.test(dev) && !/conOf/.test(dev));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
