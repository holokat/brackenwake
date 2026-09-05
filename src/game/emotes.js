// The emotes: eight things a person does on purpose, and the rules that say
// when one is running and what ends it.
//
// There is nothing in this file but data and arithmetic. No THREE, no document,
// no clock of its own: `now` is handed in, so the whole of it can be driven
// frame by frame from a test and the test path is the real path.
//
//   src/game/player.js            EMOTE_POSES: what the body looks like
//   src/game/emotes.js            this file: which one, for how long, and why it ended
//   src/game/win_emotes.js        the wheel on X
//   src/game/app/systems/emotes.js  the wiring, one frame at a time
//
// THE TWO KINDS. A timed emote runs for its `seconds` and goes back to the idle
// with nothing more said, because a wave that stops waving is its own
// announcement. A `held` emote runs until something ends it, and something
// always does: walking, swinging, casting, or being hit.
//
// EVERY END SAYS WHY. A pose that vanishes with no line is indistinguishable
// from a bug, so `endLineFor` has a sentence for each of the four ways an emote
// can be taken off you, and only the clean expiry of a timed one is silent.
//
// THE DURATIONS ARE IN SECONDS, and they are the numbers the poses in player.js
// are enveloped over. "wave, 2 s" means poseWave fades out at t = 2 and this
// file stops it at t = 2. If one moves the other has to.

/** Eight emotes, in the order the wheel draws them, clockwise from the top. */
export const EMOTES = Object.freeze([
  {
    id: 'wave', name: 'Wave', glyph: 'wave',
    line: 'you wave', noun: 'wave', endLine: 'you put your hand down',
    seconds: 2, held: false, locks: false,
  },
  {
    id: 'sit', name: 'Sit', glyph: 'sit',
    line: 'you sit down on the grass', noun: 'sit', endLine: 'you get up',
    seconds: null, held: true, locks: true,
  },
  {
    id: 'bow', name: 'Bow', glyph: 'bow',
    line: 'you bow', noun: 'bow', endLine: 'you straighten up',
    seconds: 1.5, held: false, locks: false,
  },
  {
    id: 'cheer', name: 'Cheer', glyph: 'cheer',
    line: 'you throw your arms up and cheer', noun: 'cheer', endLine: 'you stop cheering',
    seconds: 1.5, held: false, locks: false,
  },
  {
    id: 'point', name: 'Point', glyph: 'point',
    line: 'you point straight ahead', noun: 'point', endLine: 'you lower your arm',
    seconds: 2, held: false, locks: false,
  },
  {
    id: 'dance', name: 'Dance', glyph: 'dance',
    line: 'you dance', noun: 'dance', endLine: 'you stop dancing',
    seconds: null, held: true, locks: false,
  },
  {
    id: 'laugh', name: 'Laugh', glyph: 'laugh',
    line: 'you laugh', noun: 'laugh', endLine: 'you get your breath back',
    seconds: 1.5, held: false, locks: false,
  },
  {
    id: 'lie', name: 'Lie down', glyph: 'lie',
    line: 'you lie back and look at the sky', noun: 'rest', endLine: 'you get up',
    seconds: null, held: true, locks: true,
  },
]);

/** The ids, in the wheel's order. */
export const EMOTE_IDS = EMOTES.map((e) => e.id);

const BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

/** One emote by id, or null. Never throws on rubbish. */
export const emoteById = (id) => BY_ID.get(String(id)) || null;

/**
 * The slash commands, for the chat line the game does not have yet.
 *
 * THERE IS NO CHAT INPUT IN BRACKENWAKE TODAY. Nothing reads this table; it is
 * exported so that whoever builds the chat has one line of work to do rather
 * than a second list of names to keep in step. `commandFor('/sit down')`
 * already parses the trailing words away.
 */
export const EMOTE_COMMANDS = Object.freeze(Object.assign(
  Object.create(null),
  Object.fromEntries(EMOTES.map((e) => [`/${e.id}`, e.id])),
  { '/sitdown': 'sit', '/liedown': 'lie', '/laydown': 'lie', '/dancing': 'dance' },
));

/**
 * The emote a typed line asks for, or null. Case is ignored and anything after
 * the first word is dropped, so "/Wave at the guard" is a wave.
 */
export function commandFor(text) {
  const word = String(text == null ? '' : text).trim().split(/\s+/)[0].toLowerCase();
  if (!word.startsWith('/')) return null;
  return EMOTE_COMMANDS[word] || null;
}

/** The record the system keeps. One emote at a time, and never two. */
export function createEmoteState() {
  return { id: null, at: 0, until: 0 };
}

/** Which pose the rig should wear this instant, or null for the gait. */
export const poseFor = (state) => (state && state.id ? state.id : null);

/** How long the running emote has been running, in seconds. */
export function elapsed(state, now) {
  if (!state || !state.id) return 0;
  return Math.max(0, (Number(now) - state.at) / 1000);
}

/**
 * Start one. Returns `{ ok, emote, line, replaced }`; `line` is what the log
 * should say and is never empty on success, because a state change with no
 * words is a broken button.
 */
export function startEmote(state, id, now) {
  const e = emoteById(id);
  if (!e) return { ok: false, emote: null, line: null, reason: 'unknown', replaced: null };
  const replaced = state.id && state.id !== e.id ? state.id : null;
  const t = Number.isFinite(now) ? now : 0;
  state.id = e.id;
  state.at = t;
  state.until = e.held ? Infinity : t + e.seconds * 1000;
  return { ok: true, emote: e, line: e.line, replaced };
}

/**
 * The sentence an ending owes the player.
 *   'done'   the clip simply ran out. Silence: the body says it.
 *   'move'   you walked out of it.
 *   'swing'  you took a swing.
 *   'cast'   you started a spell.
 *   'hit'    something hit you. `by` names it when the name is not in doubt.
 *   'down'   you were put on the floor for real.
 */
export function endLineFor(emote, why, opts = {}) {
  const e = emoteById(emote && emote.id ? emote.id : emote);
  if (!e) return null;
  if (why === 'done') return null;
  if (why === 'swing') return `you swing, and that is the end of your ${e.noun}`;
  if (why === 'cast') return `you break off your ${e.noun} to cast`;
  if (why === 'hit') return `${opts.by ? `the ${opts.by}` : 'something'} ends your ${e.noun}`;
  if (why === 'down') return `you go down, and your ${e.noun} with you`;
  return e.endLine;
}

/**
 * Take the running emote off. Returns `{ ended, why, line }`; `ended` is null
 * when there was nothing running, and `line` is null only for a clean expiry.
 */
export function endEmote(state, why = 'stop', opts = {}) {
  const e = emoteById(state && state.id);
  if (!e) return { ended: null, why, line: null };
  state.id = null;
  state.at = 0;
  state.until = 0;
  return { ended: e.id, why, line: endLineFor(e, why, opts) };
}

/**
 * One frame of it. `moving` is the system's answer to "is this player walking,
 * jumping or leaning on a movement key", and it is the only thing this file
 * needs to know about the world.
 *
 * Returns `{ pose, elapsed, ended, why, line }`. `pose` is the anim name the
 * rig should wear, or null; a frame that ends an emote wears no pose, so the
 * gait has the body back the instant the emote is over.
 */
export function emoteStep(state, now, moving) {
  const nothing = { pose: null, elapsed: 0, ended: null, why: null, line: null };
  if (!state || !state.id) return nothing;
  const t = Number.isFinite(now) ? now : 0;
  if (moving) return { ...nothing, ...endEmote(state, 'move') };
  if (t >= state.until) return { ...nothing, ...endEmote(state, 'done') };
  return { pose: state.id, elapsed: Math.max(0, (t - state.at) / 1000), ended: null, why: null, line: null };
}

/**
 * Fails loudly when a row of the table is missing something every row needs, or
 * when the two kinds of emote get mixed up. Called by emotes.test.mjs, and by
 * the system at boot, so a ninth emote with no line cannot ship quietly.
 */
export function auditEmotes(list = EMOTES) {
  const bad = (m) => { throw new Error(`auditEmotes: ${m}`); };
  if (!Array.isArray(list) || !list.length) bad('there are no emotes at all');
  const seen = new Set();
  for (const e of list) {
    if (!e || !e.id) bad('an emote with no id');
    if (seen.has(e.id)) bad(`two emotes called "${e.id}"`);
    seen.add(e.id);
    for (const k of ['name', 'glyph', 'line', 'noun', 'endLine']) {
      if (typeof e[k] !== 'string' || !e[k]) bad(`"${e.id}" has no ${k}`);
    }
    if (e.held === !!(Number.isFinite(e.seconds) && e.seconds > 0)) {
      bad(`"${e.id}" must be held OR timed, and is ${e.held ? 'both' : 'neither'}`);
    }
    if (!e.held && !(e.seconds > 0.2)) bad(`"${e.id}" lasts ${e.seconds} s, which nobody would see`);
    if (typeof e.locks !== 'boolean') bad(`"${e.id}" does not say whether it locks movement`);
    if (e.locks && !e.held) bad(`"${e.id}" locks movement but is over on its own anyway`);
    if (e.locks && e.endLine !== 'you get up') bad(`"${e.id}" takes you off your feet and does not say you get up`);
    if (/—/.test(`${e.line}${e.endLine}`)) bad(`"${e.id}" has an em dash in it`);
  }
  for (const [cmd, id] of Object.entries(EMOTE_COMMANDS)) {
    if (!cmd.startsWith('/')) bad(`command "${cmd}" is not a command`);
    if (!seen.has(id)) bad(`command "${cmd}" points at "${id}", which is not an emote`);
  }
  for (const id of seen) if (EMOTE_COMMANDS[`/${id}`] !== id) bad(`"${id}" has no /${id} command`);
  return true;
}
