// The con rule, counted. Run: node src/game/con.test.mjs
//
// Nothing here is asserted from the shape of the code: the table of every
// monster tier against every player tier is PRINTED, and the checks read that
// table. The one that matters most is the last block: the same wolf, seen by
// two characters, has to be two different colours, because the rule is about
// the player and not about the wolf.

import {
  conOf, conLabel, playerTier, tierForSkill, bestCombatSkill, auditCon,
  CON_LEVELS, CON_BY_LEVEL, CON_SKILLS, CASTING_ATTACK_SKILLS,
  PLAYER_TIER_FLOORS, MAX_PLAYER_TIER, BOSS_TIER, SKULL_LEVELS,
} from './con.js';
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

// --- every tier against every player tier --------------------------------------
console.log('con: the whole table, monster tier down the side, player tier across');
{
  const head = ['      ', ...[0, 1, 2, 3, 4, 5].map((p) => `p${p}`.padEnd(9))].join('');
  console.log(`       ${head}`);
  const grid = [];
  for (const t of [0, 1, 2, 3, 4, 5, 6]) {
    const row = [];
    for (const p of [0, 1, 2, 3, 4, 5]) {
      // the player's skill is that tier's floor, so every cell is a real character
      const c = conOf(mon(t, { boss: t === 6 }), at(PLAYER_TIER_FLOORS[p]));
      row.push(c.level);
    }
    grid.push(row);
    console.log(`       m${t}    ${row.map((r) => r.padEnd(9)).join('')}`);
  }
  // the diagonal is the player's own tier and must be yellow all the way down
  ck('the diagonal, a monster of your own tier, is even and yellow every time',
    [0, 1, 2, 3, 4, 5].every((i) => grid[i][i] === 'even'), grid.map((r, i) => r[i]).join(','));
  ck('one below the diagonal is easy every time',
    [0, 1, 2, 3, 4].every((i) => grid[i][i + 1] === 'easy'),
    [0, 1, 2, 3, 4].map((i) => grid[i][i + 1]).join(','));
  ck('one above the diagonal is hard every time',
    [1, 2, 3, 4, 5].every((i) => grid[i][i - 1] === 'hard'), [1, 2, 3, 4, 5].map((i) => grid[i][i - 1]).join(','));
  ck('two or more below is trivial every time',
    grid.slice(0, 6).every((row, t) => row.every((lvl, p) => (t - p <= -2 ? lvl === 'trivial' : true))));
  ck('two or more above is deadly every time',
    grid.slice(0, 6).every((row, t) => row.every((lvl, p) => (t - p >= 2 ? lvl === 'deadly' : true))));
  ck('and the boss row is purple for every player, grandmaster included',
    grid[6].every((l) => l === 'boss'), grid[6].join(','));
  // 42 cells, and every one of them is a level the ladder knows
  const cells = grid.flat();
  ck('every one of the 42 cells is a level with a colour',
    cells.length === 42 && cells.every((l) => !!CON_BY_LEVEL[l]), `${cells.length} cells`);
}

// --- the ends of the ladder ----------------------------------------------------
console.log('con: the two open ends');
ck('three tiers below is still grey, not something new', conOf(mon(0), at(70)).level === 'trivial');
ck('four tiers above is still red', conOf(mon(5), at(9)).level === 'deadly');
ck('and the raw delta is kept, unclamped, so a caller can say how far',
  conOf(mon(5), at(9)).delta === 5 && conOf(mon(0), at(90)).delta === -5,
  `${conOf(mon(5), at(9)).delta} and ${conOf(mon(0), at(90)).delta}`);

console.log('con: the colours and the words');
for (const c of CON_LEVELS) ck(`${c.level} is ${c.colour} and says "${c.word}"`, /^#[0-9a-f]{6}$/i.test(c.colour) && c.word.length > 0);
ck('the five below the boss are floaters.js\'s own palette',
  CON_LEVELS.slice(0, 5).map((c) => c.colour).join(',') === '#9aa0a6,#7ee07a,#ffd23f,#ff9a3c,#ff5a4d',
  CON_LEVELS.slice(0, 5).map((c) => c.colour).join(','));
ck('the boss purple is not the epic item purple', CON_BY_LEVEL.boss.colour !== '#a335ee', CON_BY_LEVEL.boss.colour);
ck('the skull goes on red and purple, and on nothing else',
  SKULL_LEVELS.join(',') === 'deadly,boss', SKULL_LEVELS.join(','));
ck('a fair fight carries no skull', conOf(mon(2), at(30)).skull === false);
ck('and a thing that will kill you does', conOf(mon(4), at(30)).skull === true);

console.log('con: the label a hover reads');
ck('"Wolf, a fair fight"', conLabel({ name: 'Wolf', tier: 2 }, at(30)) === 'Wolf, a fair fight', conLabel({ name: 'Wolf', tier: 2 }, at(30)));
ck('and the same wolf to a beginner', conLabel({ name: 'Wolf', tier: 2 }, at(0)) === 'Wolf, it will kill you', conLabel({ name: 'Wolf', tier: 2 }, at(0)));
ck('a nameless thing is still named', conLabel({ tier: 1 }, at(10)) === 'something, a fair fight');

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
  ck('a tier 0 critter is even to a fresh character, not grey',
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
    walk.join(',') === 'deadly,hard,even,easy,trivial,trivial,trivial', walk.join(','));
  // the same walk in magery, because a mage is measured too
  const mage = [0, 30, 50, 90].map((v) => conOf(wolf, at(v, 'magery')).level);
  ck('and a mage walks the same path', mage.join(',') === 'deadly,even,easy,trivial', mage.join(','));
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
