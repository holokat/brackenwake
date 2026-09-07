// The affix roller, driven both ways. Run: node src/mmo/affixes.test.mjs
//
// Determinism, distinctness, the kind restrictions, the named powers, the
// weighting, naming and identify. Every count printed here was measured by the
// run that printed it, not asserted from the shape of the code.
import {
  AFFIXES, AFFIX_BY_ID, AFFIX_TIERS, POWERS, SKILL_NAMES, band, allowedOn, candidatesFor,
  weightFor, familyOf, rollAffixes, withAffixes, ranked, nameFor, identify, describe,
  lineFor, rangeLineFor, vagueCount, auditAffixes,
} from './affixes.js';
import { makeItem, baseFor, RARITY, RARITY_ORDER, BASES, takesRarity, FOOD_BASES, MEAL_BASES } from './items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
const item = (base, rarity, seed) => makeItem({ base, rarity, seed });

// ------------------------------------------------------------- the table
{
  const n = AFFIXES.length;
  check('every line of the Affixes section is here', n === 62, `${n} affixes; the section heading says "Sixty" and lists 62`);
  check('no affix id is used twice', new Set(AFFIXES.map((a) => a.id)).size === n);
  const groups = {};
  for (const a of AFFIXES) groups[a.group] = (groups[a.group] || 0) + 1;
  check('the eight groups have the counts the document lists',
    groups.stat === 5 && groups.pool === 6 && groups.defence === 12 && groups.offence === 9
    && groups.hit === 7 && groups.magic === 8 && groups.skill === 3 && groups.utility === 12,
    Object.entries(groups).map(([k, v]) => `${k}:${v}`).join(' '));
  check('every affix has all five tier ranges',
    AFFIXES.every((a) => AFFIX_TIERS.every((t) => Array.isArray(a.ranges[t]) && a.ranges[t].length === 2)));
  check('every range is whole and runs the right way',
    AFFIXES.every((a) => AFFIX_TIERS.every((t) => Number.isInteger(a.ranges[t][0]) && Number.isInteger(a.ranges[t][1]) && a.ranges[t][0] <= a.ranges[t][1])));
  check('every affix has a prefix and a suffix', AFFIXES.every((a) => a.prefix && a.suffix));
  check('every affix names the kinds it may sit on', AFFIXES.every((a) => a.kinds.length > 0));

  // The band curve is taken from the document's own stat table, so it has to
  // reproduce it exactly.
  const s = band(1, 15);
  check('band(1, 15) is the document stat table',
    JSON.stringify([s.uncommon, s.rare, s.epic, s.mythic, s.legendary]) === JSON.stringify([[1, 3], [2, 5], [4, 8], [6, 12], [9, 15]]),
    AFFIX_TIERS.map((t) => `${t} ${s[t][0]} to ${s[t][1]}`).join(', '));
  const h = band(5, 40);
  check('band(5, 40) spans the whole documented range',
    h.uncommon[0] === 5 && h.legendary[1] === 40, `uncommon ${h.uncommon.join(' to ')}, legendary ${h.legendary.join(' to ')}`);
  check('+STR carries the document numbers', JSON.stringify(AFFIX_BY_ID.str.ranges.epic) === '[4,8]');

  check('ten named powers', POWERS.length === 10, POWERS.map((p) => p.name).join(', '));
  check('no named power is also an ordinary affix', POWERS.every((p) => !AFFIX_BY_ID[p.id]));
  check('every named power has a prefix, a suffix and a sentence', POWERS.every((p) => p.prefix && p.suffix && p.text));
  check('the +Skill line names every skill in skills.js', SKILL_NAMES.length === 52 && SKILL_NAMES[0] === 'Swordsmanship',
    `${SKILL_NAMES.length} skills, taken from skills.js rather than copied; that document's heading says 44 and its tables list 52`);
}

// ------------------------------------------------------------ determinism
{
  let same = 0;
  for (let s = 0; s < 1000; s++) {
    const it = item('longsword', 'epic', s);
    if (JSON.stringify(rollAffixes(it)) === JSON.stringify(rollAffixes(it))) same++;
  }
  check('the same seed rolls the same affixes, a thousand times', same === 1000, `${same} of 1000`);

  let differ = 0;
  for (let s = 0; s < 1000; s++) {
    const a = JSON.stringify(rollAffixes(item('longsword', 'epic', s)));
    const b = JSON.stringify(rollAffixes(item('longsword', 'epic', s + 1000000)));
    if (a !== b) differ++;
  }
  check('a different seed rolls something else', differ >= 995, `${differ} of 1000 pairs differ`);

  // Two fresh records of the same seed, built independently, agree: this is
  // what lets a server and a client hold the same sword.
  let agree = 0;
  for (let s = 0; s < 1000; s++) {
    const a = withAffixes(makeItem({ base: 'plate_chest', rarity: 'mythic', seed: s }));
    const b = withAffixes(makeItem({ base: 'plate_chest', rarity: 'mythic', seed: s }));
    if (JSON.stringify(a) === JSON.stringify(b)) agree++;
  }
  check('two independently built records of one seed are identical', agree === 1000, `${agree} of 1000`);

  check('a common item rolls nothing', rollAffixes(item('longsword', 'common', 7)).length === 0);
  const counts = {};
  for (const r of AFFIX_TIERS) counts[r] = rollAffixes(item('ring', r, 3)).length;
  check('each rarity rolls its documented affix count',
    counts.uncommon === 1 && counts.rare === 2 && counts.epic === 3 && counts.mythic === 4 && counts.legendary === 6,
    `${AFFIX_TIERS.map((r) => `${r}:${counts[r]}`).join(' ')} (legendary is 5 plus its named power)`);
}

// ------------------------------------------------------- distinct, always
{
  let dupes = 0, rolls = 0;
  for (const base of ['longsword', 'plate_chest', 'ring', 'cloth_chest', 'buckler']) {
    for (const rarity of ['rare', 'epic', 'mythic', 'legendary']) {
      for (let s = 0; s < 250; s++) {
        const list = rollAffixes(item(base, rarity, s));
        rolls++;
        if (new Set(list.map((e) => e.id)).size !== list.length) dupes++;
      }
    }
  }
  check('no rolled item ever carries the same affix twice', dupes === 0, `${rolls} rolls, ${dupes} duplicates`);
}

// ---------------------------------------------------- the kind restrictions
{
  const N = 5000;
  const seen = (base, rarity, n) => {
    const s = new Set();
    for (let i = 0; i < n; i++) for (const e of rollAffixes(item(base, rarity, i))) if (!e.power) s.add(e.id);
    return s;
  };
  const robe = seen('cloth_chest', 'legendary', N);
  check('a robe never rolls Damage %', !robe.has('damage'), `${N} legendary robes, ${robe.size} distinct affixes seen`);
  check('a robe never rolls any offence or hit line',
    ![...robe].some((id) => AFFIX_BY_ID[id] && (AFFIX_BY_ID[id].group === 'offence' || AFFIX_BY_ID[id].group === 'hit')));
  check('a robe does roll Spell Damage', robe.has('spellDamage'));

  const hammer = seen('warhammer', 'legendary', N);
  check('a warhammer never rolls Spell Damage', !hammer.has('spellDamage'), `${N} legendary warhammers, ${hammer.size} distinct affixes seen`);
  check('a warhammer never rolls a defence or magic line',
    ![...hammer].some((id) => AFFIX_BY_ID[id] && (AFFIX_BY_ID[id].group === 'defence' || AFFIX_BY_ID[id].group === 'magic')));
  check('a warhammer does roll Damage % and hit effects', hammer.has('damage') && [...hammer].some((id) => AFFIX_BY_ID[id].group === 'hit'));

  const staff = seen('quarterstaff', 'legendary', N);
  check('a quarterstaff does roll Spell Damage, being a mage stick', staff.has('spellDamage'));
  const gloves = seen('plate_hands', 'legendary', N);
  check('gauntlets do roll Damage %, being gloves', gloves.has('damage'));
  const boots = seen('leather_feet', 'legendary', N);
  check('boots do roll Run Speed', boots.has('runSpeed'));
  check('a breastplate never rolls Run Speed', !seen('plate_chest', 'legendary', N).has('runSpeed'));
  const ring = seen('ring', 'legendary', N);
  const ringGroups = new Set([...ring].map((id) => AFFIX_BY_ID[id].group));
  check('a ring rolls from every group but the weapon only hit effects',
    ringGroups.size === 7 && !ringGroups.has('hit'), [...ringGroups].sort().join(' '));

  // And the predicate itself, both ways.
  check('allowedOn says yes to a legal pairing', allowedOn(AFFIX_BY_ID.damage, 'longsword') === true);
  check('allowedOn says no to an illegal one', allowedOn(AFFIX_BY_ID.damage, 'cloth_chest') === false);
  check('allowedOn says no for a base that is not there', allowedOn(AFFIX_BY_ID.damage, 'moonsword') === false);
}

// ------------------------------------------------------------ named powers
{
  const N = 5000;
  let legendaryWithOne = 0, legendaryOther = 0;
  const powerIds = new Set();
  for (let s = 0; s < N; s++) {
    const list = rollAffixes(item(s % 2 ? 'longsword' : 'plate_chest', 'legendary', s));
    const powers = list.filter((e) => e.power);
    if (powers.length === 1) legendaryWithOne++; else legendaryOther++;
    for (const p of powers) powerIds.add(p.id);
  }
  check('every legendary carries exactly one named power', legendaryWithOne === N && legendaryOther === 0, `${legendaryWithOne} of ${N}`);
  check('the powers that turn up are real powers', [...powerIds].every((id) => POWERS.some((p) => p.id === id)), `${powerIds.size} distinct powers seen`);

  let below = 0, belowRolls = 0;
  for (const rarity of ['uncommon', 'rare', 'epic', 'mythic']) {
    for (let s = 0; s < 1250; s++) {
      belowRolls++;
      if (rollAffixes(item(s % 2 ? 'longsword' : 'plate_chest', rarity, s)).some((e) => e.power)) below++;
    }
  }
  check('nothing below legendary ever carries one', below === 0, `${belowRolls} rolls below legendary, ${below} powers`);

  // Weapon only powers stay on weapons.
  const onArmour = new Set();
  for (let s = 0; s < 2000; s++) for (const e of rollAffixes(item('plate_chest', 'legendary', s))) if (e.power) onArmour.add(e.id);
  check('a breastplate never gets Vampiric, Stormcaller, Everfrost or Sunder',
    !['vampiric', 'stormcaller', 'everfrost', 'sunder'].some((id) => onArmour.has(id)), `saw ${[...onArmour].join(', ')}`);
  const onWeapon = new Set();
  for (let s = 0; s < 2000; s++) for (const e of rollAffixes(item('longsword', 'legendary', s))) if (e.power) onWeapon.add(e.id);
  check('a longsword can get all ten', onWeapon.size === 10, `${onWeapon.size} of 10`);
}

// -------------------------------------------------------------- weighting
{
  const share = (base, n = 5000) => {
    const g = {}; let total = 0;
    for (let s = 0; s < n; s++) for (const e of rollAffixes(item(base, 'mythic', s))) { g[e.group] = (g[e.group] || 0) + 1; total++; }
    const out = {};
    for (const k of Object.keys(g)) out[k] = g[k] / total;
    return out;
  };
  const p = share('plate_chest');
  const l = share('longsword');
  const gl = share('plate_hands');
  const defensiveOnArmour = (p.defence || 0) + (p.pool || 0);
  const offensiveOnWeapon = (l.offence || 0) + (l.hit || 0);
  check('defensive lines dominate armour', defensiveOnArmour > 0.75,
    `plate chest: defence ${(p.defence * 100).toFixed(1)}%, pool ${(p.pool * 100).toFixed(1)}%, stat ${(p.stat * 100).toFixed(1)}%, skill ${(p.skill * 100).toFixed(1)}%`);
  check('offensive lines dominate weapons', offensiveOnWeapon > 0.75,
    `longsword: offence ${(l.offence * 100).toFixed(1)}%, hit ${(l.hit * 100).toFixed(1)}%, stat ${(l.stat * 100).toFixed(1)}%, pool ${(l.pool * 100).toFixed(1)}%`);
  check('a weapon almost never rolls a pool line', (l.pool || 0) < 0.08, `${((l.pool || 0) * 100).toFixed(1)}%`);
  check('gauntlets take offence lines but rarely', (gl.offence || 0) > 0 && (gl.offence || 0) < 0.12,
    `gauntlets: offence ${((gl.offence || 0) * 100).toFixed(1)}%, defence ${((gl.defence || 0) * 100).toFixed(1)}%`);

  // The multiplier itself, both ways.
  check('a defence line weighs three on armour and a third on a weapon',
    weightFor(AFFIX_BY_ID.ar, 'plate_chest') === 3 && Math.abs(weightFor(AFFIX_BY_ID.health, 'longsword') - 1 / 3) < 1e-9);
  check('an offence line weighs three on a weapon and a third on armour',
    weightFor(AFFIX_BY_ID.damage, 'longsword') === 3 && Math.abs(weightFor(AFFIX_BY_ID.damage, 'plate_hands') - 1 / 3) < 1e-9);
  check('a ring nudges nothing', weightFor(AFFIX_BY_ID.damage, 'ring') === 1 && weightFor(AFFIX_BY_ID.ar, 'ring') === 1);
  check('a stat line is never nudged', weightFor(AFFIX_BY_ID.str, 'plate_chest') === 1 && weightFor(AFFIX_BY_ID.str, 'longsword') === 1);
  check('familyOf sorts bases the way the rule needs',
    familyOf('longsword') === 'weapon' && familyOf('plate_chest') === 'armour' && familyOf('buckler') === 'armour' && familyOf('ring') === 'other');
}

// -------------------------------------------------------------- the values
{
  let inBand = 0, total = 0;
  for (const rarity of AFFIX_TIERS) {
    for (let s = 0; s < 500; s++) {
      for (const e of rollAffixes(item('ring', rarity, s))) {
        if (e.power) continue;
        total++;
        const [lo, hi] = AFFIX_BY_ID[e.id].ranges[rarity];
        if (e.value >= lo && e.value <= hi && e.range[0] === lo && e.range[1] === hi) inBand++;
      }
    }
  }
  check('every rolled value sits inside its own tier band', inBand === total, `${inBand} of ${total}`);

  // A high tier really is worth more than a low one.
  const mean = (rarity) => {
    let sum = 0, n = 0;
    for (let s = 0; s < 3000; s++) for (const e of rollAffixes(item('ring', rarity, s))) if (e.id === 'health') { sum += e.value; n++; }
    return n ? sum / n : 0;
  };
  const mu = AFFIX_TIERS.map(mean);
  check('+Health climbs with rarity', mu.every((v, i) => i === 0 || v > mu[i - 1]), AFFIX_TIERS.map((t, i) => `${t} ${mu[i].toFixed(1)}`).join(', '));

  const skilled = [];
  for (let s = 0; s < 2000; s++) for (const e of rollAffixes(item('ring', 'legendary', s))) if (e.id === 'skill') skilled.push(e.skill);
  check('the +Skill line names a real skill every time', skilled.length > 0 && skilled.every((k) => SKILL_NAMES.includes(k)),
    `${skilled.length} rolls, ${new Set(skilled).size} distinct skills`);
}

// ----------------------------------------------------------------- naming
{
  check('a common item is just its base', nameFor(item('longsword', 'common', 4)) === baseFor('longsword').name, nameFor(item('longsword', 'common', 4)));
  check('an unrolled item is just its base', nameFor(item('longsword', 'epic', 4)) === 'Longsword');

  let prefixOk = 0, suffixOk = 0, twoParts = 0;
  const samples = [];
  for (let s = 0; s < 500; s++) {
    const it = withAffixes(item(s % 2 ? 'longsword' : 'plate_chest', 'legendary', s));
    const order = ranked(it.affixes);
    const name = nameFor(it);
    if (name.startsWith(order[0].prefix)) prefixOk++;
    if (name.endsWith(order[1].suffix)) suffixOk++;
    if (name !== baseFor(it).name) twoParts++;
    if (s < 4) samples.push(name);
  }
  check('the prefix is always the strongest affix', prefixOk === 500, `${prefixOk} of 500`);
  check('the suffix is always the second', suffixOk === 500, `${suffixOk} of 500`);
  check('a named item never reads as a plain base', twoParts === 500);
  console.log('  names:', samples.join(' | '));

  const one = withAffixes(item('ring', 'uncommon', 11));
  check('a single affix gives a prefix and no suffix',
    nameFor(one) === `${one.affixes[0].prefix} Ring`, nameFor(one));

  // ranked is a total order, and it does not disturb the array it is given.
  const it = withAffixes(item('longsword', 'legendary', 3));
  const before = JSON.stringify(it.affixes);
  const a = ranked(it.affixes).map((e) => e.id).join(' ');
  const b = ranked(it.affixes).map((e) => e.id).join(' ');
  check('ranked is stable and leaves its input alone', a === b && JSON.stringify(it.affixes) === before, a);
  check('the named power ranks first', ranked(it.affixes)[0].power === true);
}

// --------------------------------------------------------------- identify
{
  const it = item('longsword', 'legendary', 5150);
  const low = identify(it, 20);
  const mid = identify(it, 60);
  const high = identify(it, 85);
  const scroll = identify(it, 0, { scroll: true });
  const ranges = (x) => x.shown.filter((s) => s.range).length;

  check('identify sets identified', low.identified === true && it.identified === false, 'and leaves the original alone');
  check('identify attaches the affixes the seed always meant',
    JSON.stringify(low.affixes.map((e) => e.id).sort()) === JSON.stringify(rollAffixes(it).map((e) => e.id).sort()));
  check('below 40 INT at least one number is a range', ranges(low) >= 1, `INT 20 blurs ${ranges(low)} of ${low.shown.length}`);
  check('at 39 INT at least one number is a range', ranges(identify(it, 39)) >= 1, `INT 39 blurs ${ranges(identify(it, 39))}`);
  check('above 80 INT no number is a range', ranges(high) === 0, `INT 85 blurs ${ranges(high)}`);
  check('at exactly 80 INT no number is a range', ranges(identify(it, 80)) === 0);
  check('at 79 INT one number is a range', ranges(identify(it, 79)) === 1);
  check('the fog lifts as INT climbs', ranges(low) >= ranges(mid) && ranges(mid) >= ranges(high), `20:${ranges(low)} 60:${ranges(mid)} 85:${ranges(high)}`);
  check('an Inscription scroll tells everything at any INT', ranges(scroll) === 0);
  check('a blurred line shows the band and no number',
    low.shown.some((s) => s.range && s.exact === null && / to /.test(s.text)), low.shown.filter((s) => s.range).map((s) => s.text).join(' | '));
  check('an exact line shows the number', high.shown.every((s) => s.exact !== null || s.power));
  check('the weakest lines are the blurred ones',
    low.shown.slice(0, low.shown.length - ranges(low)).every((s) => !s.range));
  check('the named power is never blurred away', low.shown[0].power === true);

  // vagueCount, both directions and at the joints.
  check('vagueCount blurs four at INT 0 and none at INT 100', vagueCount(0, 5) === 4 && vagueCount(100, 5) === 0,
    [0, 20, 39, 40, 60, 79, 80, 100].map((i) => `${i}:${vagueCount(i, 5)}`).join(' '));
  check('vagueCount never asks for more lines than there are', vagueCount(0, 1) === 1 && vagueCount(0, 0) === 0);

  // An uncommon item has one affix, and the rule still holds on it.
  const small = item('ring', 'uncommon', 9);
  check('one affix at low INT is a range and at high INT is not',
    identify(small, 10).shown[0].range !== null && identify(small, 90).shown[0].range === null);
}

// --------------------------------------------------------------- describe
{
  const un = item('longsword', 'rare', 77);
  const lines = describe(un);
  check('an unidentified item gives up its base and its rarity label, and no colour word',
    lines.length === 2 && lines[0] === 'Longsword' && /^Unidentified rare weapon/.test(lines[1]) && !/blue/.test(lines.join(' ')), lines.join(' | '));

  // rarity never hops: what dropped blue is blue when identified, with the
  // number of lines blue promises, and the colour every cell draws from is the
  // same before and after. Measured across every rarity and a hundred seeds.
  {
    let hopped = 0, wrongCount = 0, n = 0;
    for (const r of ['uncommon', 'rare', 'epic', 'mythic', 'legendary']) {
      for (let seed = 1; seed <= 100; seed++) {
        const before = item('longsword', r, seed);
        const after = identify(before, 100);
        n++;
        if (after.rarity !== before.rarity) hopped++;
        const want = RARITY[r].affixes + (RARITY[r].namedPower ? 1 : 0);
        if ((after.affixes || []).length !== want) wrongCount++;
      }
    }
    check('identify never changes the rarity it was handed', hopped === 0, `${hopped} of ${n} hopped`);
    check('and rolls exactly the lines that rarity promises, never fewer to look like the tier below', wrongCount === 0, `${wrongCount} of ${n} off`);
  }

  const id = identify(un, 90);
  const idLines = describe(id);
  check('an identified item names itself first', idLines[0] === nameFor(id), idLines[0]);
  check('the tooltip carries a line for every affix',
    id.affixes.every((e) => idLines.some((l) => l === lineFor(e))), idLines.join(' | '));
  check('the affix lines come strongest first', (() => {
    const order = ranked(id.affixes).map((e) => lineFor(e));
    const at = order.map((l) => idLines.indexOf(l));
    return at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1]));
  })());
  check('a weapon tooltip states damage, speed, skill and weight',
    idLines.some((l) => /9 to 16 physical damage, 1.26 s base swing/.test(l)) && idLines.some((l) => /Swordsmanship/.test(l)) && idLines.some((l) => /4 stones, needs 30 STR/.test(l)),
    idLines.join(' | '));

  const plate = { ...withAffixes(item('plate_chest', 'epic', 12)), identified: true };
  const pl = describe(plate);
  check('an armour tooltip states AR, resists and the Meditation cost',
    pl.some((l) => /Armour 24/.test(l)) && pl.some((l) => /Resist physical 3, fire 2/.test(l)) && pl.some((l) => /Blocks Meditation entirely/.test(l)), pl.join(' | '));

  const shield = { ...withAffixes(item('tower', 'rare', 2)), identified: true };
  check('a shield tooltip states its parry factor', describe(shield).some((l) => /Parry x1.2/.test(l)));

  const made = { ...makeItem({ base: 'longsword', maker: 'Bram', quality: 1.2 }), identified: true };
  const ml = describe(made);
  check('an exceptional crafted item says so and names its maker',
    ml.includes('Exceptional') && ml.includes('Crafted by Bram'), ml.join(' | '));
  check('quality moves the damage a tooltip shows', ml.some((l) => /11 to 19 physical damage/.test(l)), ml.join(' | '));
  check('describe survives a base that is not there', describe({ base: 'moonsword' }).length === 1);

  // Every unit renders, and its blurred twin renders too.
  const units = ['flat', 'percent', 'perTen', 'stones', 'flag'];
  const one = (unit) => AFFIXES.find((a) => a.unit === unit);
  check('every unit has a line and a range line', units.every((u) => {
    const a = one(u);
    const e = { id: a.id, label: a.label, unit: a.unit, value: a.ranges.epic[0], range: a.ranges.epic, power: false };
    return typeof lineFor(e) === 'string' && lineFor(e).length > 0 && typeof rangeLineFor(e) === 'string';
  }), units.map((u) => { const a = one(u); return lineFor({ label: a.label, unit: a.unit, value: 7, range: [4, 9] }); }).join(' | '));
}

// ------------------------------------------------------------------ audit
{
  check('the affix table audits clean', auditAffixes().affixes === 62);

  const kinds = AFFIX_BY_ID.damage.kinds;
  AFFIX_BY_ID.damage.kinds = [];
  check('an affix that fits nothing throws', threw(auditAffixes));
  AFFIX_BY_ID.damage.kinds = kinds;

  const r = AFFIX_BY_ID.str.ranges.epic;
  AFFIX_BY_ID.str.ranges.epic = [8, 4];
  check('a range that runs backwards throws', threw(auditAffixes));
  AFFIX_BY_ID.str.ranges.epic = [3, 6];
  check('a stat band that no longer matches the document throws', threw(auditAffixes));
  AFFIX_BY_ID.str.ranges.epic = r;

  const removed = POWERS.pop();
  check('nine named powers throws', threw(auditAffixes));
  POWERS.push(removed);

  const skill = SKILL_NAMES.pop();
  check('a missing skill throws', threw(auditAffixes));
  SKILL_NAMES.push(skill);

  check('everything is whole again', auditAffixes().affixes === 62);
}

// ------------------------------------- rarity IS the chance of an effect
//
// "Rarity only applies to items and has a chance of adding an effect to items."
// The effect is the affix, and the chance is the drop weight: a green sword is
// one line, a blue two, an orange five and a named power. Measured over a
// thousand seeds per tier, and the table printed, so a change to RARITY's affix
// counts shows up here as numbers rather than as silence.
{
  const N = 1000;
  const rows = [];
  let wrong = 0;
  for (const r of RARITY_ORDER) {
    let min = Infinity, max = -Infinity, sum = 0;
    for (let s = 0; s < N; s++) {
      const n = rollAffixes(item('longsword', r, s)).length;
      if (n < min) min = n;
      if (n > max) max = n;
      sum += n;
    }
    const want = RARITY[r].affixes + (RARITY[r].namedPower ? 1 : 0);
    if (min !== want || max !== want) wrong++;
    rows.push(`${r} ${min === max ? min : `${min} to ${max}`} (want ${want})`);
  }
  console.log(`     a longsword, ${N} seeds per tier: ${rows.join(', ')}`);
  check('every rarity rolls exactly the number of lines its row promises', wrong === 0, rows.join(', '));
  check('common rolls none, at every one of the thousand seeds',
    Array.from({ length: N }, (_, s) => rollAffixes(item('longsword', 'common', s)).length).every((n) => n === 0));
  check('and every rarity above common rolls at least one',
    RARITY_ORDER.slice(1).every((r) => Array.from({ length: N }, (_, s) => rollAffixes(item('longsword', r, s)).length).every((n) => n >= 1)));
}

// ------------------------------------------- and it never touches a carrot
{
  // rollAffixes, withAffixes and identify, each driven with a food and with a
  // sword, at every rarity a caller could hand them.
  const foods = [...FOOD_BASES, ...MEAL_BASES];
  let rolled = 0, changed = 0, identifiedAway = 0;
  for (const id of foods) {
    for (const r of RARITY_ORDER) {
      // makeItem coerces to common, so the rarity is written on by hand here:
      // this is the pack of a save made before the rule, and it must still be
      // a carrot when it comes out.
      const planted = { ...makeItem({ base: id, seed: 7 }), rarity: r };
      if (rollAffixes(planted).length) rolled++;
      if (withAffixes(planted) !== planted) changed++;
      if (identify(planted, 100) !== planted) identifiedAway++;
    }
  }
  check(`${foods.length} foods at all six rarities roll no affixes at all`, rolled === 0, `${rolled}`);
  check('withAffixes hands every one of them straight back', changed === 0, `${changed}`);
  check('and identify does the same, because there is nothing to find out', identifiedAway === 0, `${identifiedAway}`);

  // The other direction: the same three functions really do work on a sword.
  const sword = item('longsword', 'rare', 4);
  check('while a rare longsword still rolls two lines', rollAffixes(sword).length === 2);
  check('withAffixes really attaches them', withAffixes(sword).affixes.length === 2 && withAffixes(sword) !== sword);
  check('and identify really reads them out', identify(sword, 100).shown.length === 2);

  // The tooltip does not call a carrot common, and does say what eating it does.
  const carrot = makeItem({ base: 'carrot', seed: 1 });
  const lines = describe(carrot);
  check('a carrot tooltip is "Carrot", "food", what it heals and what it weighs',
    lines[0] === 'Carrot' && lines[1] === 'food' && lines.some((l) => /^Heals \d+ to \d+ over \d+ seconds$/.test(l)),
    lines.join(' | '));
  check('and it never says Common', !lines.some((l) => /common/i.test(l)), lines.join(' | '));
  check('while a common longsword still says Common weapon',
    describe(makeItem({ base: 'longsword', seed: 1 })).includes('Common weapon'));
  check('a cooked meal says what the buff is and how long it lasts',
    describe(makeItem({ base: 'hearty_stew', seed: 1 })).some((l) => /Hearty stew for 5 minutes/.test(l)),
    describe(makeItem({ base: 'hearty_stew', seed: 1 })).join(' | '));
  check('and a healing draught says what it heals',
    describe(makeItem({ base: 'healing_draught', seed: 1 })).some((l) => /Heals 25 to 40/.test(l)));

  check('no base that takes no rarity offers a single candidate affix',
    Object.values(BASES).filter((b) => !takesRarity(b)).every((b) => candidatesFor(b).length === 0));
  check('and every base that does takes at least five, so a legendary can fill itself',
    Object.values(BASES).filter((b) => takesRarity(b) && b.slot).every((b) => candidatesFor(b).length >= 5));
}

// -------------------------------------------------------------------- cost
{
  const t0 = performance.now();
  for (let s = 0; s < 20000; s++) rollAffixes(item('longsword', 'legendary', s));
  const ms = (performance.now() - t0) / 20000;
  check('a legendary rolls in well under a millisecond', ms < 0.5, `${(ms * 1000).toFixed(1)} microseconds`);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
