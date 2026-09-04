// The monster tables, driven both ways. Run: node src/mmo/monsters.test.mjs
//
// Every number printed here was measured in this file. Where a rule is
// asserted, a row that breaks it is planted and the same check is run again, so
// a passing line means the check can actually fail.
import { readFileSync } from 'node:fs';
import {
  MONSTERS, MONSTER_LIST, BOSSES, HABITAT, TIERS, TEMPERAMENT_BANDS, AGGRO_BY_TEMPERAMENT,
  RESPAWN_MIN_S, RESPAWN_MAX_S, NO_RESPAWN_RADIUS, HIT_SLACK, LOOT_KINDS, DOC_REFS,
  aggroRadius, leashRadius, spawnRollFor, goldFor, respawnDelay, monstersOfTier, auditMonsters,
} from './monsters.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('monsters.js');

// --- the audit, both directions -------------------------------------------
const shape = auditMonsters();
check('auditMonsters passes on the real table', true, `${shape.monsters} monsters, ${shape.bosses} bosses, ${shape.places} places`);

// Plant one bad row at a time and prove the audit catches each kind of rot.
const plants = [
  ['a duplicate id', { ...MONSTERS.wolf }],
  ['a hit outside its tier band', { ...MONSTERS.wolf, id: 'plantHit', hit: 5 }],
  ['a def above its tier band', { ...MONSTERS.wolf, id: 'plantDef', def: 99 }],
  ['an unknown kind', { ...MONSTERS.wolf, id: 'plantKind', kind: 'ghostly' }],
  ['an unknown note tag', { ...MONSTERS.wolf, id: 'plantNote', notes: ['poison9'] }],
  ['a loot kind that is not an item', { ...MONSTERS.wolf, id: 'plantLoot', lootTable: ['unobtainium'] }],
  ['gold that does not match its tier', { ...MONSTERS.wolf, id: 'plantGold', gold: [1, 2] }],
  ['an aggro outside its temperament band', { ...MONSTERS.wolf, id: 'plantAggro', aggro: 24 }],
  ['a monster that lives nowhere', { ...MONSTERS.wolf, id: 'plantHomeless' }],
];
for (const [what, row] of plants) {
  MONSTER_LIST.push(row);
  const caught = throws(auditMonsters);
  MONSTER_LIST.pop();
  check(`auditMonsters rejects ${what}`, caught);
}
// And a bad habitat entry, which is the failure this module exists to prevent.
HABITAT.meadow.day.push('sabreToothedAccountant');
const caughtHabitat = throws(auditMonsters);
HABITAT.meadow.day.pop();
check('auditMonsters rejects a habitat id with no monster behind it', caughtHabitat);
HABITAT.desert.day.push('frostGiant');
const caughtSnow = throws(auditMonsters);
HABITAT.desert.day.pop();
check('auditMonsters rejects a snow only monster placed in the desert', caughtSnow);
check('auditMonsters passes again once the plants are pulled', !throws(auditMonsters));

// --- the roster -----------------------------------------------------------
const ids = MONSTER_LIST.map((m) => m.id);
check('every id is unique', new Set(ids).size === ids.length, `${ids.length} monsters`);
for (let t = 1; t <= 5; t++) {
  check(`tier ${t} is not empty`, monstersOfTier(t).length > 0, `${monstersOfTier(t).length} rows`);
}
check('tier 0 holds the seven critters', monstersOfTier(0).length === 7, monstersOfTier(0).map((m) => m.id).join(' '));
check('critters carry no gold', monstersOfTier(0).every((m) => m.gold[0] === 0 && m.gold[1] === 0));
check('critters never attack first', monstersOfTier(0).every((m) => aggroRadius(m) === 0));
check('critters flee at any damage', monstersOfTier(0).every((m) => m.flees === 'always'));
check('critter health is inside the document 1 to 8', monstersOfTier(0).every((m) => m.hp >= 1 && m.hp <= 8),
  monstersOfTier(0).map((m) => m.hp).join(' '));

check('there are four bosses', BOSSES.length === 4, BOSSES.map((b) => b.id).join(' '));
check('every boss changes phase at 66% and 33%', BOSSES.every((b) => b.phases[0] === 0.66 && b.phases[1] === 0.33));
check('every boss is 2,000 to 4,000 health', BOSSES.every((b) => b.hp >= 2000 && b.hp <= 4000), BOSSES.map((b) => b.hp).join(' '));
check('every boss drops a purple or better', BOSSES.every((b) => b.notes.includes('purpleFloor')));

// The band, measured rather than trusted.
let worstHit = 0, worstAt = '';
for (const m of MONSTER_LIST) {
  const short = TIERS[m.tier].band[0] - m.hit;
  if (short > worstHit) { worstHit = short; worstAt = m.id; }
}
check('no row falls further under its tier band than HIT_SLACK', worstHit <= HIT_SLACK,
  `worst shortfall ${worstHit} on ${worstAt}, slack ${HIT_SLACK}`);

// --- aggro ----------------------------------------------------------------
check('aggroRadius comes from temperament, not from the row',
  aggroRadius(MONSTERS.wolf) === AGGRO_BY_TEMPERAMENT.normal
  && aggroRadius(MONSTERS.direWolf) === AGGRO_BY_TEMPERAMENT.hunter
  && aggroRadius(MONSTERS.giantRat) === AGGRO_BY_TEMPERAMENT.vermin
  && aggroRadius(MONSTERS.rabbit) === 0
  && aggroRadius(MONSTERS.ashenKing) === AGGRO_BY_TEMPERAMENT.boss,
  `wolf ${aggroRadius(MONSTERS.wolf)}, dire wolf ${aggroRadius(MONSTERS.direWolf)}, rat ${aggroRadius(MONSTERS.giantRat)}, rabbit 0, boss ${aggroRadius(MONSTERS.ashenKing)}`);
check('leash is 2.5x aggro', leashRadius(MONSTERS.wolf) === aggroRadius(MONSTERS.wolf) * 2.5,
  `${leashRadius(MONSTERS.wolf)} m`);
check('an unknown monster has no aggro radius rather than a wrong one', aggroRadius('nothingAtAll') === 0);
let bandOk = true, bandBad = '';
for (const m of MONSTER_LIST) {
  const [lo, hi] = TEMPERAMENT_BANDS[m.temperament];
  if (m.aggro < lo || m.aggro > hi) { bandOk = false; bandBad = `${m.id} ${m.aggro} not in ${lo}..${hi}`; }
}
check('every tabled aggro sits inside its temperament band', bandOk, bandBad || 'all 48 rows');

// --- habitat --------------------------------------------------------------
const snowOnly = MONSTER_LIST.filter((m) => m.notes.includes('snowOnly')).map((m) => m.id);
check('there is a snow only monster to test with', snowOnly.length > 0, snowOnly.join(' '));
const desertRoster = [...HABITAT.desert.day, ...HABITAT.desert.night];
check('no snow only monster stands in the desert', snowOnly.every((id) => !desertRoster.includes(id)),
  `desert holds ${desertRoster.join(', ')}`);
check('the snow only monster does stand in the snow', HABITAT.snow.night.includes('frostGiant'));
const fenOnly = MONSTER_LIST.filter((m) => m.notes.includes('fenOnly')).map((m) => m.id);
const outsideFen = Object.entries(HABITAT).filter(([p, h]) => p !== 'fen' && fenOnly.some((id) => [...h.day, ...h.night].includes(id)));
check('no fen only monster lives outside the fen', outsideFen.length === 0, `fen only: ${fenOnly.join(' ')}`);

check('meadow at night holds wolves', HABITAT.meadow.night.includes('wolf'));
check('meadow by day does not', !HABITAT.meadow.day.includes('wolf'), `day: ${HABITAT.meadow.day.join(', ')}`);
check('every monster above tier 0 lives somewhere', (() => {
  const placed = new Set(Object.values(HABITAT).flatMap((h) => [...h.day, ...h.night]));
  return MONSTER_LIST.filter((m) => m.tier > 0).every((m) => placed.has(m.id));
})());

// --- spawnRollFor ---------------------------------------------------------
{
  const rng = lcg(20260904);
  const day = new Set(), night = new Set();
  for (let i = 0; i < 4000; i++) {
    const d = spawnRollFor('meadow', false, rng); if (d) day.add(d.id);
    const n = spawnRollFor('meadow', true, rng); if (n) night.add(n.id);
  }
  check('4,000 meadow day rolls never turn up a wolf', !day.has('wolf'), `day rolled: ${[...day].sort().join(', ')}`);
  check('4,000 meadow night rolls do turn up wolves', night.has('wolf'), `night rolled: ${[...night].sort().join(', ')}`);
  check('day and night are different rosters', [...day].sort().join() !== [...night].sort().join());
}
{
  const rng = lcg(7);
  let counts = { min: 99, max: 0 }, n = 0;
  for (let i = 0; i < 3000; i++) {
    const s = spawnRollFor('boreal', true, rng);
    if (!s) continue;
    n++;
    const [lo, hi] = s.monster.group;
    if (s.count < lo || s.count > hi) { counts.bad = `${s.id} rolled ${s.count} outside ${lo}..${hi}`; }
    counts.min = Math.min(counts.min, s.count); counts.max = Math.max(counts.max, s.count);
  }
  check('every group size is inside the monster group range', !counts.bad, counts.bad || `${n} rolls, sizes ${counts.min} to ${counts.max}`);
}
check('a place nobody lives in rolls nothing', spawnRollFor('ocean', false, lcg(1)) === null && spawnRollFor('ocean', true, lcg(1)) === null);
check('a graveyard is empty by day and busy at night',
  spawnRollFor('graveyard', false, lcg(1)) === null && spawnRollFor('graveyard', true, lcg(1)) !== null);
check('a place that does not exist rolls nothing', spawnRollFor('the moon', false, lcg(1)) === null);
check('the document word "coast" reaches the beach roster', (() => {
  const rng = lcg(3); const got = new Set();
  for (let i = 0; i < 300; i++) { const s = spawnRollFor('coast', false, rng); if (s) got.add(s.id); }
  return got.size > 0 && [...got].every((id) => HABITAT.beach.day.includes(id));
})());

// --- gold and respawn -----------------------------------------------------
{
  const rng = lcg(99);
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 5000; i++) { const g = goldFor('wolf', rng); lo = Math.min(lo, g); hi = Math.max(hi, g); }
  check('wolf gold stays inside the tier 2 range', lo >= 12 && hi <= 30, `measured ${lo} to ${hi}, tier band 12 to 30`);
  let critterGold = 0;
  for (let i = 0; i < 500; i++) critterGold += goldFor('rabbit', rng);
  check('500 rabbits give no gold at all', critterGold === 0, `${critterGold} gold`);
}
{
  const rng = lcg(5);
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 5000; i++) { const d = respawnDelay(rng); lo = Math.min(lo, d); hi = Math.max(hi, d); }
  check('respawn is 8 to 15 minutes', lo >= RESPAWN_MIN_S && hi <= RESPAWN_MAX_S,
    `measured ${(lo / 60).toFixed(2)} to ${(hi / 60).toFixed(2)} minutes`);
}
check('the no respawn radius is 30 m', NO_RESPAWN_RADIUS === 30);

// --- the documents --------------------------------------------------------
// Every id this module hardcodes from a table it does not own has to be a word
// that is actually in the markdown. This is the check that catches items.js or
// 05-WORLD-CONTENT.md moving under us.
const doc = ['03-ITEMS-LOOT.md', '05-WORLD-CONTENT.md', '02-COMBAT.md']
  .map((f) => readFileSync(new URL(`../../docs/mmo/${f}`, import.meta.url), 'utf8')).join('\n').toLowerCase();
const missingBases = Object.entries(DOC_REFS.bases).filter(([, phrase]) => !doc.includes(phrase.toLowerCase()));
check('every loot base kind is a word in the documents', missingBases.length === 0,
  missingBases.length ? missingBases.map(([id]) => id).join(', ') : `${Object.keys(DOC_REFS.bases).length} base kinds checked`);
const missingNames = Object.entries(DOC_REFS.monsters).filter(([, name]) => !doc.includes(name.toLowerCase()));
check('every monster name is a word in the documents', missingNames.length === 0,
  missingNames.length ? missingNames.map(([id]) => id).join(', ') : `${Object.keys(DOC_REFS.monsters).length} names checked`);
check('the doc check would fail on a name that is not there', !doc.includes('the accountant of the deep'));
check('every loot kind used is declared in LOOT_KINDS', (() => {
  const declared = new Set(LOOT_KINDS);
  return MONSTER_LIST.every((m) => m.lootTable.every((k) => declared.has(k)));
})());
check('no em dash anywhere in this table', !JSON.stringify(MONSTER_LIST).includes('—'));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
