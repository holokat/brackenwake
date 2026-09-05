// The cursor's end of the game: what you are pointing at, and what happens when
// you click it.
//
// Two swings never come from one frame's worth of clicking, a tree never falls
// to a pickaxe, and nothing changes without a line of text saying it did. The
// decision itself is pulled out into `decide`, which is pure and tested both
// ways for every branch: it is easier to prove that a bow does not fell an oak
// than to prove that the code which felled it was reachable.
//
// A click asks two questions in one order. `combat.js` is asked first, because
// the animal in front of a tree is what you were aiming at; the tree wins back
// the moment it is the nearer of the two to the cursor. Both sides share one
// `lastSwingAt`, because it is one arm.
//
// Sound is optional here on purpose. Every cue is `audio?.play?.(...)`, so the
// module runs headless in its test with no audio passed at all.

import * as THREE from 'three';
import { chopTree } from '../farm/tree_edit.js';
import { pickTarget, resolveSwing, swingText, nameFor, LOOT } from './combat.js';
import { CARRIED, materialFamilyOf } from './state.js';
import { makeItem, LOG_OF, ORE_OF, BASES } from '../mmo/items.js';
import { describeItem, currentDrops } from './loot_drops.js';

/**
 * Every species combat.js can drop loot for names a good the pack can really
 * hold. Run at module load, the same way combat.js audits its loot against the
 * catalog: a seventh animal dropping a good `state.addGood` refuses would
 * otherwise put "2 pelts in the pack" on screen over a pack that gained
 * nothing, which is the silent-effect bug this file exists to prevent.
 */
export function auditLootCarry() {
  const bad = [];
  for (const [kind, row] of Object.entries(LOOT)) {
    if (!CARRIED.includes(row.good)) bad.push(`${kind} drops "${row.good}", which the pack cannot hold`);
  }
  if (bad.length) throw new Error(`interact: loot the pack cannot take (${bad.join('; ')})`);
  return true;
}
auditLootCarry();

// ---------------------------------------------------------------------------
// WHAT A FELLED TREE LEAVES
//
// The user: "when chopping down trees, we should see visible wood fall to the
// ground that we can pick up as loot."
//
// So the axe no longer teleports a number into the pack. The tree goes over and
// a pile of cut logs is left at the stump, in the wood of the tree that fell,
// and it is picked up with E or a click exactly like any sack: `loot_drops` is
// the one thing that owns something lying on the ground, and this goes through
// it rather than growing a second kind of pickup nobody has to maintain.
//
// A seam does the same with ore. STONE DOES NOT. A boulder is quarried away
// rather than felled, there is nothing to leave lying there that is not already
// lying there, and the pickaxe would otherwise put a bag on the ground every
// time you tapped a rock. Stone goes straight into the pack, as it always did.
//
// The join from a field to a wood is the field's NAME. `flora.js` builds every
// stand as `world:<kind>` and a dungeon builds `dungeon:<id>:<level>:ore`, and
// the last segment is the kind: that is the same read `nounFor` has always
// done. It is NOT `field.species`, which is the Arbor recipe and says `spruce`
// for a fir.
// ---------------------------------------------------------------------------

/** Every tree kind `world/flora.js` ALL_KINDS grows. `interact.test.mjs` drives both lists against each other. */
export const GROWN_KINDS = [
  'oak', 'beech', 'birch', 'pine', 'spruce', 'fir', 'willow', 'palm', 'sakura', 'dead', 'cactus',
];
/**
 * Tree words `NOUNS` knows that no field in this world grows, and so no axe can
 * fell. Kapok and fig are Arbor recipes used by the tropical forest type, which
 * no biome in `field.js` selects; if one ever does, they need a log and this
 * list is where the audit will say so.
 */
export const NO_LOG = ['kapok', 'fig', 'trees', 'woods', 'rock', 'boulders', 'ore'];
/** The wood a felled field leaves, or null when the field is not a tree we know. */
export function logBaseFor(field) {
  const tail = String(field?.name || '').split(':').pop();
  return LOG_OF[tail] || null;
}
/** When a field is a tree but nothing says which, it is oak. Said once, here. */
export const DEFAULT_LOG = 'oak_log';
/**
 * The vein a seam gives up. A rock field may name it with `oreId`; none does
 * yet, because neither `flora.js` nor `dungeon.js` has a tier on a seam, so
 * every seam in the game today is copper. That is a real gap and it is written
 * down in docs/mmo/wiring/G9.md rather than guessed at here.
 */
export const DEFAULT_ORE = 'copper_ore';
export function oreBaseFor(field, rec) {
  const want = typeof rec?.tier === 'string' ? rec.tier : typeof field?.oreId === 'string' ? field.oreId : null;
  return (want && ORE_OF[want]) || DEFAULT_ORE;
}

/**
 * Every tree this world grows leaves a real log, and every tree word the cursor
 * knows either leaves one or is on the list of words that cannot be chopped.
 * Runs at module load beside `auditLootCarry`, for the same reason: a species
 * added tomorrow with no log would drop nothing and say nothing.
 */
export function auditHarvestDrops() {
  const bad = [];
  for (const k of GROWN_KINDS) {
    const id = LOG_OF[k];
    if (!id) { bad.push(`the forest grows "${k}" and items.js has no log for it`); continue; }
    if (!BASES[id]) bad.push(`"${k}" joins to "${id}", which is not a base`);
    if (materialFamilyOf(id) !== 'wood') bad.push(`"${id}" does not count as wood in the pack`);
    if (logBaseFor({ name: `world:${k}` }) !== id) bad.push(`a world:${k} field does not resolve to ${id}`);
  }
  for (const word of Object.keys(NOUNS)) {
    if (NO_LOG.includes(word)) {
      // driven the other way too: a word on the no-log list must really have no
      // log, or the list is hiding a species that does drop one
      if (LOG_OF[word]) bad.push(`"${word}" is on NO_LOG and items.js does have a ${LOG_OF[word]}`);
      continue;
    }
    if (!LOG_OF[word]) bad.push(`the cursor can name a "${word}" and nothing says what it leaves`);
  }
  if (!BASES[DEFAULT_LOG]) bad.push(`the default log "${DEFAULT_LOG}" is not a base`);
  if (!BASES[DEFAULT_ORE]) bad.push(`the default ore "${DEFAULT_ORE}" is not a base`);
  if (materialFamilyOf(DEFAULT_ORE) !== 'ore') bad.push(`"${DEFAULT_ORE}" does not count as ore in the pack`);
  if (bad.length) throw new Error(`interact: harvest drops (${bad.join('; ')})`);
  return { kinds: GROWN_KINDS.length, named: Object.keys(NOUNS).length - NO_LOG.length };
}

export const REACH = 6;        // metres, horizontal, player to the point you hit
export const SITE_REACH = 14;  // you have to stand at a mouth to go down it
export const SWING_MS = 450;   // one swing per 450 ms, however fast you click

// Which tool a field answers to. A rock field is a rock field whether it holds
// hillside boulders or the ore seams at a cave mouth.
export const TOOL_FOR = { tree: 'axe', rock: 'pickaxe' };

// The last segment of a field name is what the thing is: `world:oak`,
// `world:ore`, `dungeon:12,3:2:ore`.
const NOUNS = {
  oak: 'oak', spruce: 'spruce', palm: 'palm', cactus: 'cactus', sakura: 'cherry tree',
  birch: 'birch', pine: 'pine', fir: 'fir', willow: 'willow', dead: 'dead tree', beech: 'beech',
  kapok: 'kapok', fig: 'fig tree',
  ore: 'ore seam', rock: 'boulder', boulders: 'boulder', trees: 'tree', woods: 'tree',
};

auditHarvestDrops();

/** What to call the thing under the cursor. Never invents a name it cannot read. */
export function nounFor(field) {
  if (!field) return 'something';
  const tail = String(field.name || '').split(':').pop();
  if (NOUNS[tail]) return NOUNS[tail];
  if ((field.kind || 'tree') === 'rock') return field.yield === 'ore' ? 'ore seam' : 'boulder';
  return 'tree';
}

/** "a boulder", "an oak", "an ore seam". */
export const anA = (noun) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

const horiz = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));

/** Where a picked tree or rock actually stands, in world space if we were given it. */
function hitPoint(t) {
  if (!t) return null;
  if (t.point && typeof t.point.x === 'number') return t.point;
  const rec = t.field?.trees?.[t.index];
  return rec ? { x: rec.x, z: rec.z } : null;
}

/**
 * How far the thing under the cursor stands FROM the cursor. Infinity for a
 * pick that is not a tree or a rock, which is what lets an animal win by
 * default when there is nothing else there.
 */
export function aimDistTo(pick, aim) {
  if (!aim || !pick || pick.kind !== 'tree') return Infinity;
  const p = hitPoint(pick.tree);
  return p ? Math.hypot(p.x - aim.x, p.z - aim.z) : Infinity;
}

const exitDir = (e) => (typeof e === 'string' ? e : (e?.dir || e?.exit || null));

/**
 * The whole interaction rulebook, with no THREE, no DOM and no side effects.
 *
 * @param pick        what runtime.pick returned, or null
 * @param tool        'hand' | 'axe' | 'pickaxe' | 'bow'
 * @param playerPos   { x, z }
 * @param now         ms
 * @param lastSwingAt ms of the last swing that actually landed
 * @returns {{ action: string, reason: string, [k: string]: any }}
 *
 * Actions: 'none' | 'chop' | 'mine' | 'enter' | 'exit' | 'name' | 'blocked'.
 * Precedence for a tree or a rock is tool, then reach, then regrowth, then the
 * swing timer: being told "you need an axe" is worth more than being told you
 * are standing too far from a tree you could never have chopped anyway.
 */
export function decide(pick, tool, playerPos, now, lastSwingAt) {
  if (!pick) return { action: 'none', reason: 'nothing' };

  if (pick.kind === 'exit') {
    const dir = exitDir(pick.exit);
    if (dir !== 'up' && dir !== 'down') return { action: 'none', reason: 'nothing' };
    return { action: 'exit', reason: dir, dir };
  }

  if (pick.kind === 'site') {
    const site = pick.site;
    if (!site) return { action: 'none', reason: 'nothing' };
    if (site.kind === 'dungeon' || site.kind === 'cave') {
      const d = horiz(playerPos, site);
      if (d > SITE_REACH) return { action: 'blocked', reason: 'too_far', site, dist: d };
      return { action: 'enter', reason: site.kind, site };
    }
    if (site.kind === 'town' || site.kind === 'hamlet') return { action: 'name', reason: 'market', site };
    return { action: 'name', reason: 'site', site };
  }

  if (pick.kind === 'tree') {
    const t = pick.tree;
    const field = t?.field;
    if (!field) return { action: 'none', reason: 'nothing' };
    const kind = field.kind || 'tree';
    const need = TOOL_FOR[kind] || 'axe';
    if (tool !== need) {
      return { action: 'blocked', reason: tool === 'hand' || !tool ? 'no_tool' : 'wrong_tool', need, kind, field };
    }
    const p = hitPoint(t);
    const d = p ? horiz(playerPos, p) : Infinity;
    if (d > REACH) return { action: 'blocked', reason: 'too_far', need, kind, field, dist: d };
    const rec = field.trees?.[t.index];
    if (!rec || rec.felledUntil) return { action: 'blocked', reason: 'regrowing', kind, field };
    if (isFinite(lastSwingAt) && now - lastSwingAt < SWING_MS) return { action: 'blocked', reason: 'cooldown', kind, field };
    return { action: kind === 'rock' ? 'mine' : 'chop', reason: kind, field, index: t.index };
  }

  return { action: 'none', reason: 'nothing' };
}

export function createInteract({ sc, runtime, player, state, hud, input, audio, progression, loot }) {
  // Where a felled tree leaves its wood. `main.js` builds `loot` (createLootDrops)
  // before it builds this, so passing it is one word at the call site; until it
  // does, `runtime.loot` is tried and then the pack, so nothing is ever lost.
  const lootSink = () => loot || runtime?.loot || currentDrops();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aimHit = new THREE.Vector3();
  let lastSwingAt = -Infinity;
  let lastHint = null;

  const say = (text, kind) => hud?.toast?.(text, kind);
  const hint = (text) => { if (text !== lastHint) { lastHint = text; hud?.setHint?.(text); } };

  /** The one pick used by both hover and click, so the two can never disagree. */
  function pickNow() {
    if (!runtime?.pick) return null;
    ndc.set(input?.pointer?.x ?? 0, input?.pointer?.y ?? 0);
    raycaster.setFromCamera(ndc, sc.camera);
    return runtime.pick(raycaster) || null;
  }

  /**
   * Where the cursor meets the ground the player is standing on. Only valid
   * straight after `pickNow()`, which is what aims the raycaster. Null when the
   * cursor is on the sky, which is a real answer: you cannot swing at the sky.
   */
  function aimNow() {
    aimPlane.constant = -(player?.pos?.y ?? 0);
    const p = raycaster.ray.intersectPlane(aimPlane, aimHit);
    return p ? { x: p.x, z: p.z } : null;
  }

  /**
   * The animal the cursor means, or null. `pickTarget` only looks: it takes no
   * hp and starts no flee, so asking is free and both the hover line and the
   * click can ask the same question and get the same answer.
   *
   * `runtime.inDungeon` hands combat.js no fauna at all: the animals are still
   * standing in memory with the overworld switched off, and their coordinates
   * are the ones directly over your head, so without this you would club an
   * invisible deer through the roof of the dungeon.
   */
  function beastNow(aim) {
    return pickTarget({
      fauna: runtime?.inDungeon ? null : runtime?.fauna,
      tool: state.tool, playerPos: player?.pos, aimPos: aim,
    });
  }

  /** Whichever of the two is nearer the cursor. A tie goes to the animal. */
  const beastWins = (beast, pick, aim) => !!beast.animal && beast.aimDist <= aimDistTo(pick, aim);

  function hoverText(pick) {
    if (!pick) return '';
    if (pick.kind === 'exit') {
      const dir = exitDir(pick.exit);
      if (dir === 'down') return 'a stair down, click it';
      if (dir === 'up') return 'the way up, click it';
      return '';
    }
    if (pick.kind === 'site') {
      const s = pick.site;
      if (!s) return '';
      if (s.kind === 'dungeon' || s.kind === 'cave') {
        const d = horiz(player?.pos, s);
        return d > SITE_REACH ? `${s.name}, too far, ${Math.round(d)} m` : `${s.name}, E to enter`;
      }
      if (s.kind === 'town' || s.kind === 'hamlet') return `${s.name}, B opens the market`;
      return s.name || '';
    }
    if (pick.kind === 'tree') {
      const t = pick.tree;
      const field = t?.field;
      if (!field) return '';
      const noun = nounFor(field);
      const p = hitPoint(t);
      const d = p ? horiz(player?.pos, p) : Infinity;
      if (d > REACH) return `${noun}, too far`;
      return `${noun}, the ${TOOL_FOR[field.kind || 'tree'] || 'axe'}`;
    }
    return '';
  }

  function update() {
    const pick = pickNow();
    const aim = aimNow();
    // the same precedence as the click, computed the same way, so the hint can
    // never name one thing while the click hits another
    const beast = beastNow(aim);
    if (beastWins(beast, pick, aim)) {
      hint(`${nameFor(beast.animal.userData?.wild?.kind)}, click to swing`);
      return;
    }
    hint(hoverText(pick));
  }

  /**
   * Stone. The one yield that still goes straight into the pack, because a
   * boulder is quarried away rather than felled and there is nothing left
   * standing to leave a bag beside. Unchanged words, on purpose.
   */
  function creditStone(n, noun) {
    const { added, dropped } = state.add('stone', n);
    if (added && dropped) say(`${added} stone from the ${noun}, and ${dropped} left behind, your pack is full`);
    else if (added) say(`${added} stone from the ${noun}`);
    else say(`your pack is full, the ${n} stone stays on the ground`);
    // a full pack is a refusal, and it should not sound like a reward
    audio?.play?.(added ? 'pickup' : 'denied', { gain: added ? 0.6 : 1 });
  }

  /**
   * Wood and ore. Neither goes into the pack: both are left lying at the stump
   * or the seam, as a real pile you can see and walk over to, and the pack does
   * not change at all until it is picked up.
   *
   * Says what is on the ground, in the same words the sack will use when it is
   * taken, so "four oak logs" is one phrase from the axe to the pack.
   *
   * If there is no loot layer at all (a headless harness, or a `main.js` that
   * has not been given one) the wood goes into the pack instead and the line
   * says so, because a swing that quietly produced nothing is the one outcome
   * that must never happen.
   */
  function dropYield(baseId, n, noun, verb, dropAt, at) {
    const item = makeItem({ base: baseId, count: n, rarity: 'common' });
    const words = describeItem(item);
    const sink = lootSink();
    if (sink?.drop) {
      const bag = sink.drop(dropAt || { x: 0, y: 0, z: 0 }, { items: [item], gold: 0 });
      if (bag) {
        say(`the ${noun} ${verb} and leaves ${words}`);
        audio?.play?.('pickup', { at, gain: 0.45 });
        return { dropped: bag, added: 0 };
      }
    }
    const family = materialFamilyOf(baseId);
    const r = state.addMaterial ? state.addMaterial(baseId, n) : state.add(family, n);
    if (r.added && r.dropped) say(`the ${noun} ${verb}, ${r.added} into the pack and ${r.dropped} left behind, your pack is full`);
    else if (r.added) say(`the ${noun} ${verb}, ${words} into the pack`);
    else say(`your pack is full, ${words} stay on the ground`);
    audio?.play?.(r.added ? 'pickup' : 'denied', { at, gain: r.added ? 0.6 : 1 });
    return { dropped: null, added: r.added };
  }

  /** What the swing that felled the thing leaves behind, and where. */
  function creditYield(res, noun, field, dropAt, at, rec) {
    if (res.stone != null) return creditStone(res.stone, noun);
    // the record's own tier (a mine seam, a cave ring) beats the field's, which beats copper
    if (res.ore != null) return dropYield(oreBaseFor(field, rec), res.ore, noun, 'breaks open', dropAt, at);
    if (res.wood != null) return dropYield(logBaseFor(field) || DEFAULT_LOG, res.wood, noun, 'comes down', dropAt, at);
    say(`the ${noun} comes apart and leaves nothing`);
    audio?.play?.('denied');
  }

  /**
   * What a kill leaves, and where it went. The line and the state change say the
   * same thing on purpose: `swingText` never promises loot, and this is the only
   * place that speaks about it, after the pack has really taken it.
   */
  function creditLoot(loot, animalName, at) {
    if (!loot) return `${animalName} leaves nothing worth carrying`;
    const { added, dropped } = state.addGood?.(loot.good, loot.n) ?? { added: 0, dropped: loot.n };
    const meat = (k) => `${k} ${loot.name.toLowerCase()}`;
    audio?.play?.(added ? 'pickup' : 'denied', { at, gain: added ? 0.6 : 1 });
    if (added && dropped) return `${meat(added)} in the pack, and ${meat(dropped)} left on the ground, your pack is full`;
    if (added) return `${meat(added)} in the pack`;
    return `your pack is full, ${meat(loot.n)} stays on the ground`;
  }

  /**
   * Swing what is in hand at what is in front of you. One arm: `lastSwingAt` is
   * shared with chopping, so a swing at a deer and a swing at an oak cannot be
   * alternated for double the rate. Each side applies its own gate to it.
   */
  function swing(aim, now) {
    const res = resolveSwing({
      fauna: runtime?.inDungeon ? null : runtime?.fauna,
      tool: state.tool,
      playerPos: player?.pos,
      aimPos: aim,
      now,
      lastSwingAt,
    });
    if (res.hit) lastSwingAt = now;
    const line = swingText(res);
    if (res.hit) {
      const p = res.animal?.position;
      const at = p ? { x: p.x, z: p.z } : undefined;
      // the closest thing in the folder to a blow landing on something alive
      audio?.play?.('beastHit', { at });
      if (res.killed) say(`${line}, ${creditLoot(res.loot, `the ${nameFor(res.kind)}`, at)}`);
      else say(line);
    } else if (line) say(line);
    // 'cooldown' says nothing, for the same reason a chop on cooldown says
    // nothing: the swing 400 ms ago already spoke.
    return { action: res.hit ? (res.killed ? 'kill' : 'hit') : 'blocked', reason: res.reason, swing: res };
  }

  function act(d) {
    switch (d.action) {
      case 'chop':
      case 'mine': {
        lastSwingAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const noun = nounFor(d.field);
        // read the record before the swing: where the sound comes from
        const rec = d.field.trees?.[d.index];
        const at = rec ? { x: rec.x, z: rec.z } : undefined;
        // the bag needs a height as well as a place: `gy` is the ground the
        // trunk stands on, and a pile of logs floating a metre up is the sort
        // of thing that only shows up in the browser
        const dropAt = rec ? { x: rec.x, y: rec.gy ?? 0, z: rec.z } : (player?.pos || { x: 0, y: 0, z: 0 });
        const res = chopTree(d.field, d.index);
        // chopTree refuses a record that is gone or already down
        if (!res) { say('a sapling is coming back here'); audio?.play?.('denied'); return d; }
        // the tool lands on every swing, including the last one
        audio?.play?.(d.action === 'mine' ? 'mine' : 'chop', { at });
        // every swing that lands is a lesson: Lumberjacking for wood, Mining for
        // stone and ore. A tree is difficulty 10, rock 10, an ore seam 25, the
        // bottom of the ore ladder in 05-WORLD-CONTENT until seams carry tiers.
        if (progression?.lesson) {
          const isOre = d.action === 'mine' && (rec?.ore != null || res.ore != null);
          progression.lesson(d.action === 'mine' ? 'mining' : 'lumberjacking', isOre ? 25 : 10, true);
        }
        if (res.felled) {
          if (d.action === 'mine') audio?.play?.(res.ore != null ? 'oreBreak' : 'rockBreak', { at });
          // the tree takes 1500 ms to go over (DUR in farm/tree_edit.js), so
          // the thud waits for the ground instead of landing with the swing
          else audio?.play?.('chopDown', { at, delay: 1300 });
          creditYield(res, noun, d.field, dropAt, at, rec);
        } else say(d.action === 'mine'
          ? `the ${noun} cracks, ${res.remaining} more`
          : `the ${noun} takes the blow, ${res.remaining} more`);
        return d;
      }
      case 'enter': {
        const r = runtime.enterDungeon?.(d.site);
        say(r ? `you go in under ${d.site.name}` : `${d.site.name} will not open`);
        return d;
      }
      case 'exit': {
        const r = runtime.dungeonGo?.(d.dir);
        if (!r) say(d.dir === 'down' ? 'the shaft ends here' : 'there is no way up from here');
        else if (r.inside === false) say('you climb out into the open air');
        else say(d.dir === 'down' ? `down to level ${r.level}` : `up to level ${r.level}`);
        return d;
      }
      case 'name': {
        if (d.reason === 'market') say(`${d.site.name}, there is a market here. B opens it.`);
        else say(`${d.site.article ? d.site.article + ', ' : ''}${d.site.name}`);
        return d;
      }
      case 'blocked': {
        if (d.reason === 'no_tool') { say(`you need ${d.need === 'axe' ? 'an axe' : 'a pickaxe'}, the market in town sells one`); audio?.play?.('denied'); }
        else if (d.reason === 'wrong_tool') { say(`${anA(state.tool)} is no use on ${anA(nounFor(d.field))}, you want the ${d.need}`); audio?.play?.('denied'); }
        else if (d.reason === 'too_far') say(d.site ? `${d.site.name} is ${Math.round(d.dist)} m off, walk to the mouth` : 'too far, get closer');
        else if (d.reason === 'regrowing') say('a sapling is coming back here');
        // 'cooldown' says nothing on purpose: the swing 450 ms ago already
        // spoke, and a toast per click would bury it. It gets no cue either:
        // it is the branch a held mouse button hits at frame rate, which is
        // roughly fourteen refusals per swing. 'too_far' and 'regrowing' are
        // silent for the same reason, since pointing at a distant tree and
        // clicking is something a player does over and over.
        return d;
      }
      default:
        return d;
    }
  }

  return {
    REACH,
    update,
    /** @returns the decision that was taken, so main.js and the tests can see it */
    click() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const pick = pickNow();
      const aim = aimNow();
      // Which did you mean? Whichever is nearer the cursor. A deer standing in
      // front of an oak is what you were aiming at, and an oak nearer the cursor
      // than a rabbit at your feet is still the oak, which is what keeps
      // chopping usable in a meadow full of them.
      const beast = beastNow(aim);
      if (beastWins(beast, pick, aim)) return swing(aim, now);
      return act(decide(pick, state.tool, player?.pos, now, lastSwingAt));
    },
    /** E, or the HUD. Same rules as clicking a mouth. */
    enter() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const d = decide(pickNow(), state.tool, player?.pos, now, lastSwingAt);
      if (d.action === 'enter' || d.action === 'exit' || (d.action === 'blocked' && d.site)) return act(d);
      // E never moves you on its own. Underground a stray press would otherwise
      // climb a level, which is a real change nobody asked for.
      say(runtime.inDungeon ? 'point at a stair to take it' : 'there is nothing to go into here');
      return { action: 'none', reason: 'nothing' };
    },
    /** Straight back to the surface, wherever you are. */
    leave() {
      if (!runtime.inDungeon) { say('you are already out in the open'); return false; }
      const out = runtime.leaveDungeon?.();
      say(out ? 'you climb out into the open air' : 'there is no way out from here');
      return !!out;
    },
    get lastSwingAt() { return lastSwingAt; },
  };
}
