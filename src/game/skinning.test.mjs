// Skinning: the knife, the roll, and the hide. Run: node src/game/skinning.test.mjs
//
// Every gate is driven BOTH ways: a skeleton and a wolf, a knife and no knife,
// 2.9 m and 3.1 m, a first cut and a second. The roll is driven with a pinned
// rng so a success and a ruin are both certain, not likely.
import {
  createSkinning, auditSkinnable, difficultyFor, chanceFor, yieldFor, makeHide,
  knifeOf, SKIN_REACH, SKIN_DIFFICULTY_PER_TIER, SKIN_COOLDOWN_MS, YIELD_STEP,
} from './skinning.js';
import { skinWordFor, itemBaseFor, tableFor, auditLootWords, SKINNING_WORDS, UNJOINED } from './loot_drops.js';
import { MONSTERS } from '../mmo/monsters.js';
import { LEATHER_BASE, LEATHER_MATERIAL, HIDE_BASES, BASES, makeItem } from '../mmo/items.js';
import { LEATHERS } from '../mmo/ores.js';
import { createInventory } from './inventory.js';
import { countMaterial } from './win_crafting.js';
import { RECIPE } from '../mmo/recipes.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// --------------------------------------------------------------- the fakes
const corpseOf = (id, x = 0, z = 0) => ({
  key: `k:${id}`, id, row: MONSTERS[id], actor: { pos: { x, y: 0, z } },
  pos: { x, y: 0, z }, skinned: false,
});

function harness(o = {}) {
  const said = [];
  const cues = [];
  const taught = [];
  const character = {
    name: 'You', gold: 0,
    skills: { skinning: o.skill ?? 0 },
    equipment: { mainHand: o.hand ? makeItem({ base: o.hand }) : null },
    pack: { slots: o.slots ?? 20, items: new Array(o.slots ?? 20).fill(null) },
  };
  if (o.knifeInPack) character.pack.items[0] = makeItem({ base: 'skinning_knife' });
  if (o.fillPack) for (let i = 0; i < character.pack.slots; i++) if (!character.pack.items[i]) character.pack.items[i] = makeItem({ base: 'longsword', seed: i });

  const added = [];
  const inventory = {
    add(item) {
      const free = character.pack.items.indexOf(null);
      if (free < 0) return { ok: false, added: 0, dropped: item.count ?? 1 };
      character.pack.items[free] = item;
      added.push(item);
      return { ok: true, added: item.count ?? 1, dropped: 0 };
    },
  };
  const progression = { lesson: (skill, difficulty, success) => { taught.push({ skill, difficulty, success }); return { gained: false }; } };
  const monsters = { corpsesNear: (pos, r) => (o.corpses || []).filter((c) => Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) <= r) };

  const rolls = o.rolls ? [...o.rolls] : null;
  const rng = () => (rolls && rolls.length ? rolls.shift() : (o.roll ?? 0));

  const skinning = createSkinning({
    monsters, inventory, progression, character, rng,
    at: o.at || { x: 0, y: 0, z: 0 },
    hud: { log: (t) => said.push(t) },
    audio: { play: (c) => cues.push(c) },
  });
  return { skinning, character, said, cues, taught, added, inventory };
}

// ===================================================== which bodies skin at all
console.log('skinning: the table says which bodies carry a hide');
{
  const a = auditSkinnable();
  check('every row is read', a.rows === Object.keys(MONSTERS).length, `${a.rows} rows`);
  // the count moves with the roster (M2 took it from 29 to 52); the rule is what holds
  check('every row that can be skinned carries exactly one hide word',
    a.skinnable === Object.values(MONSTERS).filter((m) => skinWordFor(m)).length && a.skinnable > 29,
    `${a.skinnable} of ${a.rows} rows: ${JSON.stringify(a.byWord)}`);
  check('every beast carries one', Object.values(MONSTERS).filter((m) => m.kind === 'beast').every((m) => !!skinWordFor(m)));
  check('no construct does', Object.values(MONSTERS).filter((m) => m.kind === 'construct').every((m) => !skinWordFor(m)));
  check('a skeleton carries none', skinWordFor('skeleton') === null);
  check('a wolf carries a plain hide', skinWordFor('wolf') === 'hide');
  check('a dire wolf carries a thick one', skinWordFor('direWolf') === 'thickHide');
  check('a wyvern carries scales', skinWordFor('wyvern') === 'scaledHide');
  check('a bone dragon is undead and its own row still says scales', skinWordFor('boneDragon') === 'scaledHide');
}

// =============================================================== the loot join
console.log('skinning: the loot join resolves every word in every table');
{
  const res = auditLootWords();
  check('every word in every monster table joins to a real base', !!res, JSON.stringify(res));
  check('and only the scroll is left unjoined', UNJOINED.join(',') === 'scroll');

  // both directions of the hide join, base by base
  for (const l of LEATHERS) {
    const base = LEATHER_BASE[l.id];
    check(`${l.id} joins to ${base}`, !!BASES[base] && BASES[base].stack === true);
    check(`  and back again`, LEATHER_MATERIAL[base] === l.id);
    check(`  and itemBaseFor says the same`, itemBaseFor(l.id, 3) === base);
  }
  check('there are exactly three hide bases', HIDE_BASES.length === 3, HIDE_BASES.join(', '));

  // the words are joined AND still not in a sack
  let inSacks = 0;
  for (const m of Object.values(MONSTERS)) {
    for (const b of tableFor(m)) if (HIDE_BASES.includes(b)) inSacks++;
  }
  check('no monster drops a hide in a sack', inSacks === 0, `${inSacks} would`);
  check('the words are named as Skinning\'s', SKINNING_WORDS.join(',') === 'hide,thickHide,scaledHide');
  // and every monster that keeps a hide back still drops something
  const withHide = Object.values(MONSTERS).filter((m) => m.tier > 0 && skinWordFor(m));
  const empty = withHide.filter((m) => tableFor(m).length === 0);
  check(`all ${withHide.length} skinnable monsters above tier 0 still drop something`, empty.length === 0, empty.map((m) => m.id).join(', '));
}

// =================================================================== the rules
console.log('skinning: the numbers');
{
  check('difficulty is five a tier', difficultyFor('wolf') === 10 && difficultyFor('hydra') === 25,
    `wolf ${difficultyFor('wolf')}, hydra ${difficultyFor('hydra')}, step ${SKIN_DIFFICULTY_PER_TIER}`);
  check('a critter is nothing at all', difficultyFor('rabbit') === 0);
  check('a beginner on a wolf is 40%', Math.abs(chanceFor(0, 10) - 0.4) < 1e-9, `${chanceFor(0, 10)}`);
  check('a grandmaster on a wolf is capped at 98%', chanceFor(100, 10) === 0.98);
  check('a beginner on a hydra is 25%', Math.abs(chanceFor(0, 25) - 0.25) < 1e-9, `${chanceFor(0, 25)}`);
  check('one hide at the difficulty', yieldFor(10, 10) === 1);
  check(`and one more every ${YIELD_STEP} over it`, yieldFor(35, 10) === 2 && yieldFor(60, 10) === 3 && yieldFor(100, 10) === 4,
    `35->${yieldFor(35, 10)} 60->${yieldFor(60, 10)} 100->${yieldFor(100, 10)}`);
  check('never fewer than one, however far under', yieldFor(0, 95) === 1);
}

// ================================================================== the knife
console.log('skinning: no knife refuses, both hands checked');
{
  const wolf = corpseOf('wolf');
  const bare = harness({ corpses: [wolf], skill: 50, roll: 0 });
  const r = bare.skinning.skin(wolf, 1000);
  check('empty handed is refused', r.ok === false && r.reason.includes('dagger'), r.reason);
  check('and the wolf is not marked skinned', wolf.skinned === false);
  check('and it said so out loud', bare.said.length === 1, bare.said[0]);
  check('and the denied cue played', bare.cues.includes('denied'));

  const axe = harness({ corpses: [corpseOf('wolf')], hand: 'longsword', skill: 50 });
  check('a longsword in hand is not a knife', axe.skinning.skin(corpseOf('wolf'), 1000).ok === false);

  check('a dagger in hand counts', knifeOf({ equipment: { mainHand: makeItem({ base: 'dagger' }) } }).ok === true);
  check('a skinning knife in hand counts', knifeOf({ equipment: { mainHand: makeItem({ base: 'skinning_knife' }) } }).ok === true);
  check('a skinning knife in the pack counts', knifeOf({ pack: { items: [makeItem({ base: 'skinning_knife' })] } }).ok === true);
  check('an empty character does not', knifeOf({}).ok === false);
  // T3: the same rule the axe and the pickaxe go through, so the lens that
  // lends you an axe lends you a knife too and cannot leave one out
  check('but dev mode lends one, so a kill can still be skinned under the lens',
    knifeOf({}, { dev: true }).ok === true && knifeOf({}, { dev: true }).what === 'skinning knife',
    knifeOf({}, { dev: true }).what);
  check('and a knife you really carry still reports where it really is',
    knifeOf({ pack: { items: [makeItem({ base: 'skinning_knife' })] } }, { dev: true }).where === 'pack');
  check('and neither does one holding nothing but a sword',
    knifeOf({ equipment: { mainHand: makeItem({ base: 'greatsword' }) }, pack: { items: [] } }).ok === false);

  const packKnife = harness({ corpses: [corpseOf('wolf')], knifeInPack: true, skill: 50, roll: 0 });
  const c = corpseOf('wolf');
  check('and a knife in the pack really does skin', packKnife.skinning.skin(c, 1000).ok === true);
}

// ================================================================== the reach
console.log('skinning: three metres, and three point one');
{
  const near = corpseOf('wolf', 2.9, 0);
  const h1 = harness({ corpses: [near], hand: 'dagger', skill: 50, roll: 0 });
  check('2.9 m is in reach', h1.skinning.skin(near, 1000).ok === true, `reach ${SKIN_REACH}`);

  const far = corpseOf('wolf', 3.1, 0);
  const h2 = harness({ corpses: [far], hand: 'dagger', skill: 50, roll: 0 });
  const r = h2.skinning.skin(far, 1000);
  check('3.1 m is not', r.ok === false && r.reason === 'too_far' === false && /3\.1 m off/.test(r.reason), r.reason);
  check('and the body is untouched', far.skinned === false);
  check('and nothing went in the pack', h2.added.length === 0);
  check('nearest() finds the near one and not the far one',
    h1.skinning.nearest({ x: 0, z: 0 })?.pos.x === 2.9 && h2.skinning.nearest({ x: 0, z: 0 }) === null);
}

// ============================================================ the skeleton
console.log('skinning: a skeleton gives nothing and says so');
{
  const bones = corpseOf('skeleton');
  const h = harness({ corpses: [bones], hand: 'dagger', skill: 50, roll: 0 });
  const r = h.skinning.skin(bones, 1000);
  check('refused', r.ok === false);
  check('and the line names the skeleton', /nothing to skin on a skeleton/i.test(r.reason), r.reason);
  check('nothing went in the pack', h.added.length === 0);
  check('and nothing was taught', h.taught.length === 0);
  check('and the bones are not marked skinned', bones.skinned === false);

  const golem = corpseOf('ironGolem');
  const g = harness({ corpses: [golem], hand: 'dagger', skill: 50, roll: 0 });
  const gr = g.skinning.skin(golem, 1000);
  check('an iron golem refuses in its own words', gr.ok === false && /^An iron golem is stone and iron/.test(gr.reason), gr.reason);
}

// ================================================================== the wolf
console.log('skinning: a wolf skinned once gives a hide, and twice says so');
{
  const wolf = corpseOf('wolf');
  const h = harness({ corpses: [wolf], hand: 'dagger', skill: 50, rolls: [0.1, 0.5] });
  const r = h.skinning.skin(wolf, 1000);
  check('it came off', r.ok === true, r.text);
  check('one hide, at skill 50 against difficulty 10', r.count === 2, `${r.count} (yield ${yieldFor(50, 10)})`);
  check('and it is the hide base', r.item.base === 'hide');
  check('with the ores.js id stamped on it', r.item.material === 'hide');
  check('it went in the pack', h.added.length === 1 && h.character.pack.items[0] === r.item);
  check('and the line says how many and off what', /2 hides off the wolf/.test(r.text), r.text);
  check('Skinning was taught, at the difficulty, as a success',
    h.taught.length === 1 && h.taught[0].skill === 'skinning' && h.taught[0].difficulty === 10 && h.taught[0].success === true,
    JSON.stringify(h.taught));
  check('the body is marked', wolf.skinned === true);

  // the second try, past the cooldown so it is the flag and not the timer
  const again = h.skinning.skin(wolf, 1000 + SKIN_COOLDOWN_MS + 1);
  check('a second try is refused', again.ok === false);
  check('and says it is already skinned', /already skinned/.test(again.reason), again.reason);
  check('nothing more went in the pack', h.added.length === 1);
  check('and nothing more was taught', h.taught.length === 1);
}

console.log('skinning: the two heavier hides');
{
  const bear = corpseOf('stonebackBear');
  const h = harness({ corpses: [bear], hand: 'dagger', skill: 0, rolls: [0.1, 0.5] });
  const r = h.skinning.skin(bear, 1000);
  check('a stoneback bear gives a thick hide', r.ok === true && r.item.base === 'thick_hide', r.text);
  check('stamped thickHide for the tanning rack', r.item.material === 'thickHide');
  check('one of it, at skill 0 against difficulty 15', r.count === 1, `${r.count}`);
  check('and the yield rule says so', yieldFor(0, 15) === 1);

  const wyv = corpseOf('wyvern');
  const w = harness({ corpses: [wyv], hand: 'skinning_knife', skill: 0, rolls: [0.1, 0.5] });
  const wr = w.skinning.skin(wyv, 1000);
  check('a wyvern gives scaled hide', wr.ok === true && wr.item.base === 'scaled_hide', wr.text);
  check('stamped scaledHide', wr.item.material === 'scaledHide');
}

// ================================================================== a ruin
console.log('skinning: a failed roll ruins the hide, and still teaches');
{
  const wolf = corpseOf('wolf');
  // chance at skill 0 against difficulty 10 is 0.40; a roll of 0.99 misses
  const h = harness({ corpses: [wolf], hand: 'dagger', skill: 0, rolls: [0.99, 0.5] });
  const r = h.skinning.skin(wolf, 1000);
  check('the roll missed', r.ok === false && r.success === false, `chance ${r.chance}`);
  check('the chance is the one the formula gives', Math.abs(r.chance - 0.4) < 1e-9, `${r.chance}`);
  check('and it said what happened', /Nothing comes off the wolf whole/.test(r.text), r.text);
  check('nothing went in the pack', h.added.length === 0);
  check('the body is spent all the same', wolf.skinned === true);
  check('and it still taught, as a failure',
    h.taught.length === 1 && h.taught[0].success === false, JSON.stringify(h.taught));
}

// ================================================================= the pack
console.log('skinning: a hide that will not fit stays on the body');
{
  const wolf = corpseOf('wolf');
  const h = harness({ corpses: [wolf], hand: 'dagger', skill: 50, fillPack: true, rolls: [0.1, 0.5] });
  const r = h.skinning.skin(wolf, 1000);
  check('refused for want of room', r.ok === false && r.reason === 'no_room', r.text);
  check('and the line says the wolf keeps it', /the wolf keeps it/.test(r.text), r.text);
  check('the body is NOT marked skinned, so it can be tried again', wolf.skinned === false);
  check('and nothing was taught for work that did not happen', h.taught.length === 0);
}

// ============================================================== the cooldown
console.log('skinning: one cut per swing, however fast you click');
{
  const bodies = [corpseOf('wolf', 0, 0), corpseOf('wolf', 1, 0)];
  const h = harness({ corpses: bodies, hand: 'dagger', skill: 50, roll: 0.1 });
  let done = 0;
  for (let i = 0; i < 12; i++) if (h.skinning.skin(bodies[0], 1000 + i).ok) done++;
  check('12 clicks in 12 ms is one cut', done === 1, `${done}`);
  check('and one attempt counted', h.skinning.stats.attempts === 1);
  const spread = harness({ corpses: bodies, hand: 'dagger', skill: 50, roll: 0.1 });
  let n = 0;
  const two = [corpseOf('wolf', 0, 0), corpseOf('boar', 1, 0)];
  for (const [i, c] of two.entries()) if (spread.skinning.skin(c, 1000 + i * (SKIN_COOLDOWN_MS + 1)).ok) n++;
  check(`two cuts ${SKIN_COOLDOWN_MS + 1} ms apart are two cuts`, n === 2, `${n}`);
}

// ============================================== what monsters.js still owes
console.log('skinning: it says what it is missing rather than pretending');
{
  const h = harness({ corpses: [corpseOf('wolf')], hand: 'dagger' });
  check('corpsesNear is provided by the fake', h.skinning.needs().includes('monsters.corpsesNear(pos, radius)') === false);
  check('and pickCorpse is not, so it is named', h.skinning.needs().includes('monsters.pickCorpse(raycaster)'));
  check('pick returns null rather than throwing', h.skinning.pick({}) === null);

  const none = createSkinning({ monsters: {}, character: { skills: {} } });
  check('with no monsters at all it wants both', none.needs().length === 2, none.needs().join('; '));
  check('and finds nothing', none.nearest({ x: 0, z: 0 }) === null && none.corpsesNear({ x: 0, z: 0 }).length === 0);
  const r = none.skin(null, 0);
  check('and skinning nothing says there is nothing there', r.ok === false && /nothing there to skin/.test(r.reason), r.reason);
}

// ====================================== the real pack, and the real forge
//
// The point of the material stamp: a tanning rack has to be able to SEE the
// hides. This section uses W3's real inventory and W5's real countMaterial,
// against the real leather recipe, so the claim is not about a fake.
console.log('skinning: the real pack and the real tanning rack');
{
  const character = {
    name: 'You', gold: 0, skills: { skinning: 60, tailoring: 50 },
    stats: { STR: 60 },
    equipment: { mainHand: makeItem({ base: 'dagger' }) },
    pack: { slots: 20, items: [] },
  };
  const inventory = createInventory({ character });
  const wolf = corpseOf('wolf');
  const skinning = createSkinning({
    monsters: { corpsesNear: () => [wolf] }, inventory, character,
    rng: () => 0.1, at: { x: 0, y: 0, z: 0 },
  });
  const r = skinning.skin(wolf, 1000);
  check('the real pack took the hides', r.ok === true && r.count === 3, `${r.count} hides`);
  check('and they are one stack', character.pack.items.filter(Boolean).length === 1);

  const ctx = { character, inventory };
  check('countMaterial finds them by the ores.js id', countMaterial(ctx, 'hide') === 3, `${countMaterial(ctx, 'hide')}`);
  check('and does not count them as thickHide', countMaterial(ctx, 'thickHide') === 0);

  const bear = corpseOf('stonebackBear');
  const s2 = createSkinning({ monsters: { corpsesNear: () => [bear] }, inventory, character, rng: () => 0.1 });
  s2.skin(bear, 1000);
  check('a thick hide lands in its own stack', character.pack.items.filter(Boolean).length === 2);
  check('and counts as thickHide and not as hide, at skill 60 against difficulty 15',
    countMaterial(ctx, 'thickHide') === 2 && countMaterial(ctx, 'hide') === 3,
    `thick ${countMaterial(ctx, 'thickHide')}, plain ${countMaterial(ctx, 'hide')}`);

  const tunic = RECIPE['leather_chest_hide'] || Object.values(RECIPE).find((x) => x.materials && x.materials.hide && x.station === 'tanningRack');
  check('there is a tanning rack recipe that asks for hide', !!tunic, tunic?.id);
  if (tunic) {
    const need = tunic.materials.hide;
    check(`it wants ${need} hide and the pack has 3`, countMaterial(ctx, 'hide') === 3);
  }

  // and the stack really stacks, rather than filling the pack a hide at a time
  const wolf2 = corpseOf('wolf');
  const s3 = createSkinning({ monsters: { corpsesNear: () => [wolf2] }, inventory, character, rng: () => 0.1 });
  s3.skin(wolf2, 1000);
  check('a second wolf joins the first stack', character.pack.items.filter(Boolean).length === 2);
  check('and the count is six', countMaterial(ctx, 'hide') === 6, `${countMaterial(ctx, 'hide')}`);
}

console.log('skinning: makeHide refuses a word it does not know');
{
  let threw = '';
  try { makeHide('pelt', 1); } catch (e) { threw = e.message; }
  check('an unknown hide throws rather than making a lie', /not one of/.test(threw), threw);
  const one = makeHide('scaledHide', 1, 5);
  check('and a known one stacks and carries its material', one.base === 'scaled_hide' && one.material === 'scaledHide' && one.count === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
