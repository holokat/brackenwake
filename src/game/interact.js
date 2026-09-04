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
import { CARRIED } from './state.js';

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
  ore: 'ore seam', rock: 'boulder', boulders: 'boulder', trees: 'tree', woods: 'tree',
};

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

export function createInteract({ sc, runtime, player, state, hud, input, audio, progression }) {
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

  function creditYield(res, noun) {
    const good = res.wood != null ? 'wood' : res.stone != null ? 'stone' : res.ore != null ? 'ore' : null;
    if (!good) { say(`the ${noun} comes apart and leaves nothing`); return; }
    const n = res[good];
    const { added, dropped } = state.add(good, n);
    if (added && dropped) say(`${added} ${good} from the ${noun}, and ${dropped} left behind, your pack is full`);
    else if (added) say(`${added} ${good} from the ${noun}`);
    else say(`your pack is full, the ${n} ${good} stays on the ground`);
    // a full pack is a refusal, and it should not sound like a reward
    audio?.play?.(added ? 'pickup' : 'denied', { gain: added ? 0.6 : 1 });
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
          creditYield(res, noun);
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
