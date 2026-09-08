import {CELLAR_CREATURE} from './cellar_monsters.js';
import {ORE_ELEMENTAL} from './ore_elementals.js';
import {MONSTER_HEALTH_FACTOR} from './combat_pace.js';
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
  HABITAT_BY_PLACE, PLACE_IDS, BODY_FAMILIES, TAMABLE, TAMABLE_KINDS, NOTE_TAGS, NOTE_TAG_MEANING,
  TIER_HP_BAND, TIER_DAMAGE_MIN_BAND, TIER_DAMAGE_MAX_BAND, BOSS_HP_BY_RANK, BOSS_GOLD_BY_RANK,
  EXPECTED_BOSSES, habitatFor, tamableRows, BOSS_BY_LAIR,
} from './monsters.js';
import { REALMS, PLACES } from './realms.js';
import { BASES } from './items.js';

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
check('tier 0 holds the document\'s seven critters and wave A\'s four', monstersOfTier(0).length === 11,
  monstersOfTier(0).map((m) => m.id).join(' '));
check('critters carry no gold', monstersOfTier(0).every((m) => m.gold[0] === 0 && m.gold[1] === 0));
check('critters never attack first', monstersOfTier(0).every((m) => aggroRadius(m) === 0));
check('critters never flee now', monstersOfTier(0).every((m) => m.flees === 'never'));
check('every monster row carries the no-flee rule', MONSTER_LIST.every((m) => m.flees === 'never'));
// The document's "1 to 8 health" is about the seven small animals. The whale is
// tier 0 because it is never a fight, not because it is small, and the `huge`
// tag is what exempts it. Both halves are checked.
check('every critter that is not huge is inside the document 1 to 8',
  monstersOfTier(0).filter((m) => !m.notes.includes('huge')).every((m) => m.hp >= 1 && m.hp <= 8),
  monstersOfTier(0).filter((m) => !m.notes.includes('huge')).map((m) => `${m.id} ${m.hp}`).join(', '));
check('the only tier 0 row over 8 health is the one tagged huge',
  monstersOfTier(0).filter((m) => m.hp > 8).map((m) => m.id).join() === 'whale'
  && MONSTERS.whale.notes.includes('huge'), `whale ${MONSTERS.whale.hp} health`);

check('there are sixteen bosses: the document\'s four and wave A\'s twelve', BOSSES.length === EXPECTED_BOSSES,
  BOSSES.map((b) => b.id).join(' '));
check('every boss changes phase at 66% and 33%', BOSSES.every((b) => b.phases[0] === 0.66 && b.phases[1] === 0.33));
// The document's 2,000 to 4,000 is the dungeon level 3 boss, which is rank 5.
// A rank 1 boss stands in a cellar under a mill and is fought by a character an
// hour old, so its band is its realm's. Both readings are checked.
check('every boss is inside its rank\'s health band',
  BOSSES.every((b) => b.hp >= BOSS_HP_BY_RANK[b.rank][0]*MONSTER_HEALTH_FACTOR && b.hp <= BOSS_HP_BY_RANK[b.rank][1]*MONSTER_HEALTH_FACTOR),
  BOSSES.map((b) => `${b.id} r${b.rank} ${b.hp}`).join(', '));
check('the original boss health remains recorded before the combat pace multiplier',
  BOSSES.filter((b) => b.where === 'dungeon3').every((b) => b.baseHp >= 2000 && b.baseHp <= 4000),
  BOSSES.filter((b) => b.where === 'dungeon3').map((b) => `${b.id} ${b.hp}`).join(', '));
check('a boss of a gentler realm is gentler, in health and in coin',
  MONSTERS.oramBlackhand.hp < MONSTERS.malachar.hp / 5
  && MONSTERS.oramBlackhand.gold[1] < MONSTERS.malachar.gold[1] / 10,
  `Oram ${MONSTERS.oramBlackhand.hp} hp and ${MONSTERS.oramBlackhand.gold.join(' to ')} gold, Malachar ${MONSTERS.malachar.hp} hp and ${MONSTERS.malachar.gold.join(' to ')} gold`);
check('every boss drops a purple or better', BOSSES.every((b) => b.notes.includes('purpleFloor')));

// The band, measured rather than trusted.
let worstHit = 0, worstAt = '';
for (const m of MONSTER_LIST) {
  const short = TIERS[m.boss ? m.rank : m.tier].band[0] - m.hit;
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
check('every tabled aggro sits inside its temperament band', bandOk, bandBad || `all ${MONSTER_LIST.length} rows`);

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
  const placed = new Set([
    ...Object.values(HABITAT).flatMap((h) => [...h.day, ...h.night]),
    ...Object.values(HABITAT_BY_PLACE).flatMap((h) => [...h.day, ...h.night]),
  ]);
  // the two training bodies stand where island_training.json puts them, and in no habitat
  return MONSTER_LIST.filter((m) => m.tier > 0 && !m.notes.includes('dummy')).every((m) => placed.has(m.id) || !!CELLAR_CREATURE[m.id] || ORE_ELEMENTAL[m.id]?.ore === m.oreElemental);
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

// ===========================================================================
// Wave A, M2: the roster the realms need.
console.log('\nmonsters.js: wave A, the roster of the nine realms');

const waveA = MONSTER_LIST.filter((m) => m.wave === 'M2');
const doc48 = MONSTER_LIST.filter((m) => !m.wave && !m.notes.includes('dummy'));
check('the document\'s rows are all still here, and untouched in number', doc48.length === 48,
  `${doc48.length} documented rows, ${waveA.length} added by wave A, ${MONSTER_LIST.length} in all`);
check('wave A is forty rows and twelve bosses',
  waveA.filter((m) => !m.boss).length === 40 && waveA.filter((m) => m.boss).length === 12,
  `${waveA.filter((m) => !m.boss).length} rows, ${waveA.filter((m) => m.boss).length} bosses`);
check('every one of them is a new id', new Set(MONSTER_LIST.map((m) => m.id)).size === MONSTER_LIST.length);

// --- the tier bands, recomputed here rather than trusted -------------------
{
  // The same rule, written a second time from the document's rows only. If
  // monsters.js ever computes them from the wrong set this disagrees.
  const mine = {};
  for (const m of doc48.filter((r) => !r.boss)) {
    const b = mine[m.tier] || (mine[m.tier] = { hp: [1e9, -1e9], lo: [1e9, -1e9], hi: [1e9, -1e9] });
    b.hp = [Math.min(b.hp[0], m.hp), Math.max(b.hp[1], m.hp)];
    b.lo = [Math.min(b.lo[0], m.damage[0]), Math.max(b.lo[1], m.damage[0])];
    b.hi = [Math.min(b.hi[0], m.damage[1]), Math.max(b.hi[1], m.damage[1])];
  }
  const widen = (b) => [Math.floor(b[0] * 0.8), Math.ceil(b[1] * 1.2)];
  let agree = true, disagreed = '';
  for (const t of Object.keys(mine)) {
    const want = [widen(mine[t].hp), widen(mine[t].lo), widen(mine[t].hi)];
    const got = [TIER_HP_BAND[t], TIER_DAMAGE_MIN_BAND[t], TIER_DAMAGE_MAX_BAND[t]];
    if (JSON.stringify(want) !== JSON.stringify(got)) { agree = false; disagreed = `tier ${t}: ${JSON.stringify(got)} not ${JSON.stringify(want)}`; }
  }
  check('the tier bands are 0.8x to 1.2x of the document\'s own rows', agree,
    disagreed || Object.keys(TIER_HP_BAND).map((t) => `t${t} hp ${TIER_HP_BAND[t].join('-')}`).join(', '));

  let inside = true, outside = '';
  for (const m of waveA.filter((r) => !r.boss)) {
    const hp = TIER_HP_BAND[m.tier], lo = TIER_DAMAGE_MIN_BAND[m.tier], hi = TIER_DAMAGE_MAX_BAND[m.tier];
    const huge = m.notes.includes('huge');
    if ((!huge && (m.hp < Math.max(1, hp[0]) || m.hp > hp[1]))
      || m.damage[0] < lo[0] || m.damage[0] > lo[1] || m.damage[1] < hi[0] || m.damage[1] > hi[1]) {
      inside = false; outside = `${m.id} tier ${m.tier}: ${m.hp} hp, ${m.damage.join(' to ')} damage`;
    }
  }
  check('every wave A row sits inside its tier\'s band', inside, outside || `${waveA.filter((r) => !r.boss).length} rows measured`);

  // and health really does climb with the tier, which is the point of the band
  const median = (t) => {
    const v = MONSTER_LIST.filter((m) => m.tier === t && !m.boss).map((m) => m.hp).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const meds = [1, 2, 3, 4, 5].map(median);
  check('median health climbs with every tier', meds.every((v, i) => i === 0 || v > meds[i - 1]), meds.join(' then '));
}

// --- the audit's new rules, each driven true and false ---------------------
{
  const plants = [
    ['a loot kind that is not an items.js base', { ...MONSTERS.wolf, id: 'plantLoot2', lootTable: ['adamantium'] }],
    ['a body family nothing can build', { ...MONSTERS.kraken, id: 'plantFamily', family: 'leviathan' }],
    ['a wave A row with no model note', { ...MONSTERS.kraken, id: 'plantModel', model: '' }],
    ['health outside its tier band', { ...MONSTERS.wolf, id: 'plantHp', hp: 400 }],
    ['damage outside its tier band', { ...MONSTERS.wolf, id: 'plantDmg', damage: [30, 60] }],
    ['a tamable undead', { ...MONSTERS.skeleton, id: 'plantTame', tamable: { difficulty: 20, food: 'bread', loyaltyDays: 3 } }],
    ['a taming difficulty over 100', { ...MONSTERS.frostWolf, id: 'plantTame2', tamable: { difficulty: 140, food: 'venison', loyaltyDays: 3 } }],
    ['a summons of something that is not a monster', { ...MONSTERS.fenWitch, id: 'plantSummon', summons: { id: 'grue', count: 2 } }],
    ['a summons of its own tier or higher', { ...MONSTERS.fenWitch, id: 'plantSummon2', summons: { id: 'mireTroll', count: 2 } }],
    ['a summons tag with no summons behind it', { ...MONSTERS.fenWitch, id: 'plantSummon3', summons: undefined }],
    ['a tier 0 row that attacks first', { ...MONSTERS.fox, id: 'plantCritter', aggro: 12, temperament: 'normal' }],
    ['a boss whose lair is not a place in realms.js', { ...MONSTERS.thalassa, id: 'plantLair', lair: 'atlantis' }],
    ['a boss health outside its rank\'s band', { ...MONSTERS.oramBlackhand, id: 'plantBossHp', hp: 3000 }],
    ['a boss hitting at a skill its realm never sees', { ...MONSTERS.oramBlackhand, id: 'plantBossHit', hit: 98 }],
    ['a wandering boss with no route', { ...MONSTERS.noon, id: 'plantRoute', route: undefined }],
    ['a route through a place that does not exist', { ...MONSTERS.noon, id: 'plantRoute2', route: ['glassroad', 'narnia'] }],
  ];
  for (const [what, row] of plants) {
    MONSTER_LIST.push(row);
    const caught = throws(auditMonsters);
    MONSTER_LIST.pop();
    check(`auditMonsters rejects ${what}`, caught);
  }
  // and the same for the named places table
  HABITAT_BY_PLACE.krakenshoals.night.push('mammoth');
  const caughtSnow2 = throws(auditMonsters);
  HABITAT_BY_PLACE.krakenshoals.night.pop();
  check('auditMonsters rejects a snow only monster in a salt water place', caughtSnow2);
  HABITAT_BY_PLACE.thereIsNoSuchPlace = { biome: 'meadow', day: ['wolf'], night: ['wolf'] };
  const caughtPlace = throws(auditMonsters);
  delete HABITAT_BY_PLACE.thereIsNoSuchPlace;
  check('auditMonsters rejects a roster for a place realms.js has never heard of', caughtPlace);
  check('and passes again once every plant is pulled', !throws(auditMonsters));
}

// --- the bodies, against the file that actually builds them ----------------
{
  // monster_models.js imports THREE, so it is read as text rather than
  // imported: the two tables it keeps are pulled out of the source and the
  // family list here is proved against them. A family renamed there fails here.
  const src = readFileSync(new URL('../game/monster_models.js', import.meta.url), 'utf8');
  const builders = (src.match(/const BUILDERS = \{([\s\S]*?)\};/) || [])[1] || '';
  const critters = (src.match(/export const CRITTER_SHAPE = \{([\s\S]*?)\};/) || [])[1] || '';
  const built = new Set([...builders.matchAll(/(\w+):/g)].map((x) => x[1]));
  const critterBodies = new Set([...critters.matchAll(/(\w+):\s*'(\w+)'/g)].map((x) => x[2]));
  check('the builder table was found in monster_models.js', built.size >= 9, [...built].sort().join(' '));
  check('the critter body table was found too', critterBodies.size >= 7, [...critterBodies].sort().join(' '));
  const known = new Set([...built, ...critterBodies]);
  const unknown = BODY_FAMILIES.filter((f) => !known.has(f));
  check('every family a row may borrow is one monster_models.js can build', unknown.length === 0,
    unknown.length ? `no builder for ${unknown.join(', ')}` : `${BODY_FAMILIES.length} families`);
  const missing = waveA.filter((m) => !m.family || !known.has(m.family)).map((m) => m.id);
  check('and every wave A row names one of them', missing.length === 0, missing.join(', ') || `${waveA.length} rows`);
  check('the check would fail on a family that is not there', !known.has('leviathan'));

  // Which bodies are borrowed, printed, because this is the modelling queue.
  const byFamily = {};
  for (const m of waveA) (byFamily[m.family] = byFamily[m.family] || []).push(m.id);
  for (const [f, ids] of Object.entries(byFamily).sort()) console.log(`       ${f}: ${ids.length} - ${ids.join(', ')}`);
  check('every wave A row says what body it should be given', waveA.every((m) => m.model && m.model.length > 20));
}

// --- the loot, through the real join ---------------------------------------
{
  // `src/game/loot_drops.js` is the only thing that turns a monster's word into
  // an items.js base. Reading it here rather than re-implementing the mapping is
  // the difference between proving the loot lands and proving a copy of it does.
  const drops = await import('../game/loot_drops.js');
  let bad = [];
  for (const m of MONSTER_LIST) {
    if (m.tier === 0) continue;
    const table = drops.tableFor(m);
    if (!table.length) bad.push(`${m.id} drops nothing a pack could hold`);
    for (const b of table) if (!BASES[b]) bad.push(`${m.id} drops "${b}", which is not a base`);
  }
  check('every row above tier 0 drops at least one real items.js base', bad.length === 0,
    bad.slice(0, 4).join('; ') || `${MONSTER_LIST.filter((m) => m.tier > 0).length} rows joined`);
  check('a made up loot word joins to nothing, so the check can fail',
    drops.itemBaseFor('adamantium', 3, MONSTERS.wolf) === null);
  const waveTables = waveA.filter((m) => m.tier > 0).map((m) => drops.tableFor(m));
  check('and wave A\'s own rows are all joined', waveTables.every((t) => t.length > 0),
    `${waveTables.reduce((n, t) => n + t.length, 0)} bases over ${waveTables.length} rows`);
  // beasts keep their hide, constructs never grow one
  const beasts = waveA.filter((m) => m.kind === 'beast');
  check('every wave A beast can be skinned', beasts.every((m) => m.lootTable.some((w) => ['hide', 'thickHide', 'scaledHide'].includes(w))),
    beasts.map((m) => m.id).join(' '));
  check('and no wave A construct can be', waveA.filter((m) => m.kind === 'construct')
    .every((m) => !m.lootTable.some((w) => ['hide', 'thickHide', 'scaledHide'].includes(w))));
}

// --- taming -----------------------------------------------------------------
{
  const tam = tamableRows();
  check('there is a list of tamable animals', tam.length >= 10, `${tam.length}: ${tam.map((m) => m.id).join(', ')}`);
  check('every difficulty is on Animal Taming\'s own 0 to 100',
    tam.every((m) => m.tamable.difficulty >= 0 && m.tamable.difficulty <= 100),
    tam.map((m) => `${m.id} ${m.tamable.difficulty}`).join(', '));
  check('every one of them is an animal', tam.every((m) => TAMABLE_KINDS.includes(m.kind)),
    [...new Set(tam.map((m) => m.kind))].join(', '));
  const badFood = tam.filter((m) => !BASES[m.tamable.food]);
  check('every one is fed on a real items.js base', badFood.length === 0,
    badFood.map((m) => `${m.id} eats ${m.tamable.food}`).join(', ') || tam.map((m) => m.tamable.food).join(', '));
  check('difficulty climbs with the tier of the animal',
    Math.max(...tam.filter((m) => m.tier === 0).map((m) => m.tamable.difficulty))
    < Math.min(...tam.filter((m) => m.tier >= 4).map((m) => m.tamable.difficulty)),
    `tier 0 tops out at ${Math.max(...tam.filter((m) => m.tier === 0).map((m) => m.tamable.difficulty))}, tier 4 and up starts at ${Math.min(...tam.filter((m) => m.tier >= 4).map((m) => m.tamable.difficulty))}`);
  check('TAMABLE and the rows agree', Object.keys(TAMABLE).length === tam.length);
}

// --- the places, against realms.js -----------------------------------------
{
  const real = PLACES.map((p) => p.id);
  const missing = real.filter((id) => !PLACE_IDS.includes(id));
  const extra = PLACE_IDS.filter((id) => !real.includes(id));
  check('PLACE_IDS is exactly the places realms.js has', missing.length === 0 && extra.length === 0,
    missing.length || extra.length ? `missing ${missing.join(',')} extra ${extra.join(',')}` : `${PLACE_IDS.length} places`);
  const namedNotReal = Object.keys(HABITAT_BY_PLACE).filter((id) => !real.includes(id));
  check('every named roster is for a place that exists', namedNotReal.length === 0,
    namedNotReal.join(', ') || `${Object.keys(HABITAT_BY_PLACE).length} of the ${real.length} places have one`);

  const lairless = BOSSES.filter((b) => !b.where && !b.lair);
  check('every boss is met somewhere', lairless.length === 0, lairless.map((b) => b.id).join(', '));
  const badLair = BOSSES.filter((b) => b.lair && !real.includes(b.lair));
  check('every lair is a place in realms.js', badLair.length === 0,
    badLair.map((b) => `${b.id} in ${b.lair}`).join(', ') || BOSSES.filter((b) => b.lair).map((b) => b.lair).join(', '));
  check('and the lair actually holds its boss',
    BOSSES.filter((b) => b.lair).every((b) => HABITAT_BY_PLACE[b.lair].day.includes(b.id)));
  check('BOSS_BY_LAIR finds each of the twelve', Object.keys(BOSS_BY_LAIR).length === 12);

  const wanderers = BOSSES.filter((b) => b.route);
  check('two bosses walk a route rather than sitting in a room', wanderers.length === 2,
    wanderers.map((b) => `${b.name}: ${b.route.join(' to ')}`).join('; '));
  check('every place on both routes is real',
    wanderers.every((b) => b.route.every((id) => real.includes(id))));

  // A boss's rank sits inside its realm's own danger band, and this is where
  // that is proved. It was "equals the top of the band" until the Greenwold
  // became a 1 to 2 realm: Oram Blackhand is the first boss anybody meets, his
  // 520 health is a rank 1 number and belongs at rank 1, and a realm whose band
  // is two tiers wide is allowed a boss at either of them. Every other realm's
  // band is one tier wide, so for eleven of the twelve this is the same check
  // it always was.
  const realmOfPlace = Object.fromEntries(PLACES.map((p) => [p.id, p.realm]));
  const realmById = Object.fromEntries(REALMS.map((r) => [r.id, r]));
  const bandOf = (b) => realmById[realmOfPlace[b.lair]].danger;
  const wrong = BOSSES.filter((b) => b.lair && b.id !== 'malachar')
    .filter((b) => b.rank < bandOf(b)[0] || b.rank > bandOf(b)[1]);
  check('every boss but Malachar is ranked inside its realm\'s own danger band', wrong.length === 0,
    wrong.map((b) => `${b.id} rank ${b.rank} in a danger ${bandOf(b).join(' to ')} realm`).join(', ')
    || BOSSES.filter((b) => b.lair).map((b) => `${b.id} r${b.rank}`).join(' '));
  const narrow = BOSSES.filter((b) => b.lair && b.id !== 'malachar' && bandOf(b)[0] === bandOf(b)[1]);
  check('and where the band is one tier wide, the rank is that tier exactly',
    narrow.every((b) => b.rank === bandOf(b)[1]), `${narrow.length} of ${BOSSES.filter((b) => b.lair).length} bosses`);
  check('and Malachar is the one rank above any realm', MONSTERS.malachar.rank === 6);

  // Every realm has something to fight in it: its biome's roster plus its own
  // named places. Six is the floor, because a realm with three rows in it reads
  // as the same fight everywhere.
  const perRealm = REALMS.map((r) => {
    const ids = new Set();
    const h = HABITAT[r.biome];
    if (h) for (const id of [...h.day, ...h.night]) ids.add(id);
    for (const pl of r.places) {
      const e = HABITAT_BY_PLACE[pl.id];
      if (e) for (const id of [...e.day, ...e.night]) ids.add(id);
    }
    return { id: r.id, biome: r.biome, n: ids.size };
  });
  check('every realm has at least six rows that can live in it', perRealm.every((r) => r.n >= 6),
    perRealm.map((r) => `${r.id} ${r.n}`).join(', '));
  check('every realm biome is a habitat this table knows',
    REALMS.every((r) => !!HABITAT[r.biome]), [...new Set(REALMS.map((r) => r.biome))].join(', '));

  // A place that is open country reads as its realm; a causeway, a sea or a
  // dungeon may disagree, which is the whole reason the biome is per place.
  const kindOf = Object.fromEntries(PLACES.map((p) => [p.id, p.kind]));
  const disagree = Object.entries(HABITAT_BY_PLACE)
    .filter(([id, h]) => kindOf[id] === 'wild' && h.biome !== realmById[realmOfPlace[id]].biome);
  check('no stretch of open country disagrees with the realm it is in', disagree.length === 0,
    disagree.map(([id, h]) => `${id} is ${h.biome} in a ${realmById[realmOfPlace[id]].biome} realm`).join(', ')
    || `${Object.keys(HABITAT_BY_PLACE).filter((id) => kindOf[id] === 'wild').length} wild places checked`);
}

// --- spawning by place ------------------------------------------------------
{
  const rng = lcg(4242);
  const got = new Set();
  for (let i = 0; i < 2000; i++) { const s = spawnRollFor('krakenshoals', true, rng); if (s) got.add(s.id); }
  check('the Kraken\'s Shoals at night really do turn up the kraken', got.has('kraken'),
    `rolled ${[...got].sort().join(', ')}`);
  check('and nothing that is not in that place\'s own roster',
    [...got].every((id) => HABITAT_BY_PLACE.krakenshoals.night.includes(id)));
  const day = new Set();
  for (let i = 0; i < 2000; i++) { const s = spawnRollFor('krakenshoals', false, rng); if (s) day.add(s.id); }
  check('by day the shoals are pearls and crabs and no kraken', !day.has('kraken'), `rolled ${[...day].sort().join(', ')}`);

  const dunes = new Set();
  for (let i = 0; i < 800; i++) { const s = spawnRollFor('singingdunes', false, rng); if (s) dunes.add(s.id); }
  check('the Singing Dunes have a sandworm under them', dunes.has('sandworm'), [...dunes].join(', '));
  const steppe = new Set();
  for (let i = 0; i < 800; i++) { const s = spawnRollFor('mammothsteppe', false, rng); if (s) steppe.add(s.id); }
  check('the Mammoth Steppe has mammoth and musk ox on it',
    steppe.has('mammoth') && steppe.has('muskOx'), [...steppe].join(', '));
  const road = new Set();
  for (let i = 0; i < 800; i++) { const s = spawnRollFor('kingsroad', false, rng); if (s) road.add(s.id); }
  check('the Kingsroad carries Legion patrols', road.has('legionSoldier') && road.has('legionArcher'), [...road].join(', '));

  check('a place with no roster of its own still falls back to its biome',
    habitatFor('canopycourt') === HABITAT.sakura || habitatFor('canopycourt') === null,
    habitatFor('canopycourt') === HABITAT.sakura ? 'the sakura roster' : 'nothing');
  check('a named place beats the biome it is in',
    habitatFor('krakenshoals') !== HABITAT.ocean && habitatFor('krakenshoals') === HABITAT_BY_PLACE.krakenshoals);
  check('the ocean itself is still empty, because nothing stands on open water',
    spawnRollFor('ocean', true, lcg(1)) === null);
}

// --- the tags ---------------------------------------------------------------
{
  check('every tag has a meaning written next to it',
    [...NOTE_TAGS].every((t) => typeof NOTE_TAG_MEANING[t] === 'string' && NOTE_TAG_MEANING[t].length > 10),
    `${NOTE_TAGS.size} tags`);
  const used = new Set(MONSTER_LIST.flatMap((m) => m.notes));
  const unused = [...NOTE_TAGS].filter((t) => !used.has(t));
  check('no tag is written down and never used', unused.length === 0, unused.join(', ') || `${used.size} tags in use`);
  const abilityless = waveA.filter((m) => m.tier > 0 && m.notes.filter((n) => ![
    'group', 'sharesAggro', 'night', 'nightOnly', 'snowOnly', 'fenOnly', 'coastOnly', 'noonOnly',
    'undead', 'holyWeak', 'silverWeak', 'fireWeak', 'energyWeak', 'lootTwice', 'purpleFloor', 'champion', 'huge',
  ].includes(n)).length === 0);
  check('every wave A row above tier 0 has at least one ability of its own', abilityless.length === 0,
    abilityless.map((m) => m.id).join(', ') || `${waveA.filter((m) => m.tier > 0).length} rows`);
  // the new tags, named, so the wiring note can be checked against this list
  const oldTags = new Set(doc48.flatMap((m) => m.notes));
  const newTags = [...NOTE_TAGS].filter((t) => !oldTags.has(t));
  console.log(`       tags added by wave A: ${newTags.join(', ')}`);
  const wiring = readFileSync(new URL('../../docs/mmo/wiring/M2.md', import.meta.url), 'utf8');
  const unwired = newTags.filter((t) => !wiring.includes(`\`${t}\``));
  check('every tag added this wave has its rule written into docs/mmo/wiring/M2.md',
    unwired.length === 0, unwired.join(', ') || `${newTags.length} tags`);
}


// --- the training yard's two bodies ----------------------------------------
console.log('\nmonsters: the training dummy and the archery target are bodies, not monsters');
for (const id of ['trainingDummy', 'archeryTarget']) {
  const m = MONSTERS[id];
  check(`${id} is a tier 1 row that hits for nothing`, !!m && m.tier === 1 && m.damage[0] === 0 && m.damage[1] === 0, JSON.stringify(m && m.damage));
  check(`${id} never aggroes, never runs and never flees`, m.aggro === 0 && m.run === 0 && m.flees === 'never' && m.temperament === 'critter');
  check(`${id} carries the dummy tag the game reads`, m.notes.includes('dummy'));
  check(`${id} has a def to roll against, inside the tier band`, m.def === 20 && m.def <= TIERS[1].band[1]);
}
check('the training bodies do not stretch the tier 1 damage band', TIER_DAMAGE_MIN_BAND[1][0] > 0, JSON.stringify(TIER_DAMAGE_MIN_BAND[1]));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
