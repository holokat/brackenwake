// The emote rules, driven frame by frame. Run: node src/game/emotes.test.mjs
//
// Everything here goes through the real exported functions with a real clock in
// milliseconds, sixty frames to the second, because the claim worth proving is
// not "there is a duration field" but "a wave is over on the 120th frame and
// not the 119th".

import {
  EMOTES, EMOTE_IDS, EMOTE_COMMANDS, emoteById, commandFor,
  createEmoteState, startEmote, emoteStep, endEmote, endLineFor, poseFor, elapsed,
  auditEmotes,
} from './emotes.js';
import { EMOTE_POSES, EMOTE_ANIMS, auditEmotePoses } from './player.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const DT = 1000 / 60;

console.log('emotes: the table');
{
  check('there are eight emotes', EMOTES.length === 8, EMOTE_IDS.join(','));
  check('and they are the eight that were asked for',
    EMOTE_IDS.join(',') === 'wave,sit,bow,cheer,point,dance,laugh,lie', EMOTE_IDS.join(','));
  check('no id is written twice', new Set(EMOTE_IDS).size === 8);
  check('every one has a name, a glyph, a line, a noun and an ending',
    EMOTES.every((e) => e.name && e.glyph && e.line && e.noun && e.endLine));
  const held = EMOTES.filter((e) => e.held).map((e) => e.id);
  const timed = EMOTES.filter((e) => !e.held).map((e) => e.id);
  check('three are held until something ends them', held.join(',') === 'sit,dance,lie', held.join(','));
  check('and five run for a fixed time', timed.join(',') === 'wave,bow,cheer,point,laugh', timed.join(','));
  check('the durations are the ones the brief asked for',
    emoteById('wave').seconds === 2 && emoteById('bow').seconds === 1.5
    && emoteById('cheer').seconds === 1.5 && emoteById('point').seconds === 2
    && emoteById('laugh').seconds === 1.5,
    timed.map((id) => `${id} ${emoteById(id).seconds}s`).join(', '));
  const locks = EMOTES.filter((e) => e.locks).map((e) => e.id);
  check('sit and lie are the two that take you off your feet', locks.join(',') === 'sit,lie', locks.join(','));
  check('and both of them get you up again in those words',
    locks.every((id) => emoteById(id).endLine === 'you get up'));
  check('no line has an em dash in it',
    !EMOTES.some((e) => /—/.test(`${e.line} ${e.endLine} ${e.name}`)));
  check('emoteById is safe on rubbish', emoteById('nonsense') === null && emoteById(null) === null && emoteById(undefined) === null);
}

console.log('emotes: the audit fails in both directions');
{
  check('the real table passes', auditEmotes() === true);
  const clone = (over) => [{ ...EMOTES[0], ...over }];
  check('a row with no line is refused', /has no line/.test(threw(() => auditEmotes(clone({ line: '' }))) || ''));
  check('a row with no glyph is refused', /has no glyph/.test(threw(() => auditEmotes(clone({ glyph: '' }))) || ''));
  check('held AND timed is refused', /must be held OR timed/.test(threw(() => auditEmotes(clone({ held: true }))) || ''));
  check('neither held nor timed is refused', /must be held OR timed/.test(threw(() => auditEmotes(clone({ held: false, seconds: null }))) || ''));
  check('a duration nobody could see is refused', /nobody would see/.test(threw(() => auditEmotes(clone({ seconds: 0.05 }))) || ''));
  check('two rows with one id are refused',
    /two emotes called/.test(threw(() => auditEmotes([EMOTES[0], EMOTES[0]])) || ''));
  check('a locking emote that does not say you get up is refused',
    /does not say you get up/.test(threw(() => auditEmotes([{ ...EMOTES[1], endLine: 'you stand' }])) || ''));
  check('an em dash is refused', /em dash/.test(threw(() => auditEmotes(clone({ line: 'you wave — at nobody' }))) || ''));
  check('an empty table is refused', /no emotes at all/.test(threw(() => auditEmotes([])) || ''));
}

console.log('emotes: every emote has a body, and every body an emote');
{
  check('auditEmotePoses passes on the real pair', auditEmotePoses(EMOTE_IDS) === true);
  check('there are eight poses', EMOTE_ANIMS.length === 8, EMOTE_ANIMS.join(','));
  check('and they answer to the eight emote ids by name',
    EMOTE_IDS.every((id) => typeof EMOTE_POSES[id] === 'function'), EMOTE_ANIMS.join(','));
  check('a ninth emote with no body stops the boot',
    /has no pose/.test(threw(() => auditEmotePoses([...EMOTE_IDS, 'shrug'])) || ''));
  check('and a body with no emote does too',
    /answers to no emote/.test(threw(() => auditEmotePoses(EMOTE_IDS.slice(0, 7))) || ''));
  check('an anim name that is not an emote is not one',
    EMOTE_POSES.walk === undefined && EMOTE_POSES.idle === undefined && EMOTE_POSES.constructor === undefined);
}

console.log('emotes: starting one');
{
  for (const e of EMOTES) {
    const st = createEmoteState();
    const r = startEmote(st, e.id, 10000);
    const ok = r.ok && r.line === e.line && st.id === e.id && st.at === 10000
      && (e.held ? st.until === Infinity : st.until === 10000 + e.seconds * 1000);
    check(`${e.id}: "${r.line}"`, ok, `until ${st.until === Infinity ? 'held' : `${st.until - st.at} ms`}`);
  }
  const st = createEmoteState();
  const bad = startEmote(st, 'shrug', 0);
  check('an emote nobody wrote is refused, and nothing starts', bad.ok === false && st.id === null, bad.reason);
  startEmote(st, 'sit', 1000);
  const swap = startEmote(st, 'dance', 2000);
  check('starting a second one replaces the first and says which', swap.replaced === 'sit' && st.id === 'dance', String(swap.replaced));
  check('poseFor reads the running one', poseFor(st) === 'dance' && poseFor(createEmoteState()) === null);
  check('elapsed counts from the start', elapsed(st, 2500) === 0.5, String(elapsed(st, 2500)));
}

console.log('emotes: a timed emote ends at its duration, and not a frame before');
{
  for (const e of EMOTES.filter((x) => !x.held)) {
    const st = createEmoteState();
    startEmote(st, e.id, 0);
    let now = 0, frames = 0, end = null;
    while (frames < 600 && !end) {
      now += DT; frames++;
      const r = emoteStep(st, now, false);
      if (r.ended) end = { r, now, frames };
    }
    const want = e.seconds * 1000;
    const near = createEmoteState();
    startEmote(near, e.id, 0);
    const oneBefore = emoteStep(near, want - 1, false);
    check(`${e.id} runs ${e.seconds} s: ended on frame ${end.frames} at ${end.now.toFixed(1)} ms`,
      end && end.now >= want && end.now - want < DT, `wanted ${want} ms`);
    check(`  and is still running one millisecond short of it`, oneBefore.pose === e.id, oneBefore.pose || 'null');
    check(`  the clean expiry says nothing, because the body already did`,
      end.r.why === 'done' && end.r.line === null, String(end.r.line));
    check(`  and the frame it ends on wears no pose`, end.r.pose === null);
  }
}

console.log('emotes: a held emote runs until you move');
{
  for (const e of EMOTES.filter((x) => x.held)) {
    const st = createEmoteState();
    startEmote(st, e.id, 0);
    let now = 0, frames = 0, stopped = null;
    for (let i = 0; i < 1800 && !stopped; i++) { now += DT; frames++; const r = emoteStep(st, now, false); if (r.ended) stopped = r; }
    check(`${e.id} is still going after ${frames} frames (${(now / 1000).toFixed(1)} s) of standing still`,
      stopped === null && st.id === e.id, stopped ? `ended: ${stopped.why}` : 'held');
    const r = emoteStep(st, now + DT, true);
    check(`  and one frame of walking ends it: "${r.line}"`,
      r.ended === e.id && r.why === 'move' && r.line === e.endLine && st.id === null, `${r.why}, ${r.line}`);
    check('  with no pose on the frame it ends', r.pose === null);
  }
}

console.log('emotes: a timed emote is cut short by walking too');
{
  const st = createEmoteState();
  startEmote(st, 'wave', 0);
  const held = emoteStep(st, 500, false);
  const cut = emoteStep(st, 520, true);
  check('half a second in, the wave is still a wave', held.pose === 'wave' && Math.abs(held.elapsed - 0.5) < 1e-9, `${held.elapsed}s`);
  check('and walking ends it before its two seconds are up', cut.ended === 'wave' && cut.why === 'move', `${cut.why}`);
  check('with the words for it', cut.line === 'you put your hand down', String(cut.line));
}

console.log('emotes: what a fight does to an emote');
{
  const st = createEmoteState();
  startEmote(st, 'dance', 0);
  const hit = endEmote(st, 'hit', { by: 'wolf' });
  check('a wolf ends your dance, by name', hit.line === 'the wolf ends your dance', hit.line);
  check('and the state is clear afterwards', st.id === null && st.until === 0);

  startEmote(st, 'dance', 0);
  check('something with no name still says something',
    endEmote(st, 'hit').line === 'something ends your dance');
  startEmote(st, 'sit', 0);
  check('your own swing ends it and says so',
    endEmote(st, 'swing').line === 'you swing, and that is the end of your sit');
  startEmote(st, 'lie', 0);
  check('and so does a spell, in the right noun',
    endEmote(st, 'cast').line === 'you break off your rest to cast');
  check('ending nothing ends nothing and says nothing',
    (() => { const r = endEmote(createEmoteState(), 'hit'); return r.ended === null && r.line === null; })());
  check('every emote has a sentence for all four ways of losing it',
    EMOTES.every((e) => ['move', 'swing', 'cast', 'hit'].every((why) => {
      const l = endLineFor(e, why, { by: 'bear' });
      return typeof l === 'string' && l.length > 4;
    })));
  check('and only the clean expiry is silent',
    EMOTES.every((e) => endLineFor(e, 'done') === null));
}

console.log('emotes: stepping a state with nothing in it');
{
  const st = createEmoteState();
  const a = emoteStep(st, 1000, false), b = emoteStep(st, 1000, true);
  check('does nothing, either way', a.pose === null && a.ended === null && b.pose === null && b.ended === null);
  check('and elapsed on an empty state is zero', elapsed(st, 99999) === 0);
}

console.log('emotes: the slash commands the chat does not have yet');
{
  check('there are eight, one per emote, plus the ways people actually type them',
    EMOTE_IDS.every((id) => EMOTE_COMMANDS[`/${id}`] === id), Object.keys(EMOTE_COMMANDS).join(' '));
  check('/wave is a wave', commandFor('/wave') === 'wave');
  check('and so is "/Wave at the guard"', commandFor('/Wave at the guard') === 'wave');
  check('/sitdown and /liedown land where they read', commandFor('/sitdown') === 'sit' && commandFor('/laydown') === 'lie');
  check('a word with no slash is not a command', commandFor('wave') === null);
  check('a slash nobody wrote is not either', commandFor('/shrug') === null && commandFor('') === null && commandFor(null) === null);
}

console.log(`\nemotes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
