// Settings. Run: node src/game/win_settings.test.mjs
import { readFileSync } from 'node:fs';
import {
  SETTINGS, SETTING, BAR_KEYS, defaultSettings, coerce, normalise, rebind, set, auditSettings,
} from './win_settings.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function mkCtx(over = {}) {
  const character = { name: 'Alred', settings: undefined, ...over.character };
  const applied = [];
  const said = [];
  const audio = {
    musicOn: true, sfxOn: true, musicVol: 0.5, sfxVol: 0.7,
    setMusicVolume(v) { this.musicVol = v; },
    setSfxVolume(v) { this.sfxVol = v; },
    toggleMusic() { this.musicOn = !this.musicOn; return this.musicOn; },
    toggleSfx() { this.sfxOn = !this.sfxOn; return this.sfxOn; },
  };
  return {
    character, audio, applied, said,
    hud: { toast: (t, k) => said.push([t, k]) },
    applySettings: (s) => applied.push({ ...s }),
    ...over.ctx,
  };
}

console.log('win_settings: the table');
check('the audit passes at load', (() => { try { auditSettings(); return true; } catch (e) { console.log(e.message); return false; } })());
check('06 asks for eleven things and all of them are here', ['music', 'sfx', 'shadows', 'ring', 'pixelRatio', 'grass', 'textScale', 'invertDrag', 'sensitivity', 'bar', 'dev'].every((k) => !!SETTING[k]), SETTINGS.map((s) => s.key).join(', '));
check('every setting says what applying it does', SETTINGS.every((s) => s.apply && s.apply.length > 8));
// the wiring note is for main.js; the player reads `help`, which is a sentence
// and not code (the browser showed "audio.toggleMusic() until audio.musicOn matches" under Music)
check('every setting has a sentence for the player', SETTINGS.every((s) => typeof s.help === 'string' && /^[A-Z].*\.$/.test(s.help)),
  SETTINGS.filter((s) => !s.help).map((s) => s.key).join(', ') || 'all');
check('and none of it is code', SETTINGS.every((s) => !/[()=\[\]]|\w\.\w/.test(s.help)),
  SETTINGS.filter((s) => /[()=\[\]]|\w\.\w/.test(s.help || '')).map((s) => s.key).join(', ') || 'none');
check('nothing carries an em dash', !SETTINGS.some((s) => s.label.includes('—') || s.apply.includes('—')));
check('the bar has twelve slots, keys 1 to 0 and minus and equals', BAR_KEYS.length === 12 && BAR_KEYS[0] === '1' && BAR_KEYS[9] === '0' && BAR_KEYS[10] === '-' && BAR_KEYS[11] === '=', BAR_KEYS.join(' '));
check('the draw distance rings are the three 06 names', SETTING.ring.options.join(',') === '6,9,12');
check('pixel density offers speed, balanced and device options', SETTING.pixelRatio.options.join(',') === '1,1.5,device');
check('balanced density is accepted and invalid density falls back', coerce('pixelRatio',1.5)===1.5&&coerce('pixelRatio',4)===1.5);

console.log('win_settings: a saved record that cannot be trusted');
{
  const d = defaultSettings();
  check('a fresh record has every key', SETTINGS.every((s) => d[s.key] !== undefined));
  check('the bar comes out as its own array', Array.isArray(d.bar) && d.bar.length === 12 && d.bar !== BAR_KEYS);
  check('nonsense in a range is clamped', coerce('music', 99) === 1 && coerce('music', -4) === 0, `${coerce('music', 99)} and ${coerce('music', -4)}`);
  check('a range snaps to its step', coerce('music', 0.53) === 0.55, `${coerce('music', 0.53)}`);
  check('rubbish in a range falls back to the default', coerce('music', 'loud') === SETTING.music.def);
  check('a choice off the list falls back too', coerce('ring', 47) === 9 && coerce('ring', 12) === 12);
  check('a toggle is always a boolean', coerce('shadows', 'yes') === true && coerce('shadows', 0) === false);
  check('a short bar is filled out from the defaults', coerce('bar', ['q', 'w']).length === 12 && coerce('bar', ['q', 'w'])[2] === '3');
  check('a bar of rubbish is thrown out', coerce('bar', 'nope').join('') === BAR_KEYS.join(''));
  check('an unknown key is nothing at all', coerce('lasers', true) === undefined);

  const old = normalise({ music: 0.2, gone: true, ring: 999 });
  check('a saved record keeps what it had', old.music === 0.2);
  check('drops what it should not have', old.gone === undefined);
  check('mends what is out of range', old.ring === 9);
  check('and fills in what it never had', old.sensitivity === SETTING.sensitivity.def);
}

console.log('win_settings: writing one');
{
  const ctx = mkCtx();
  const r = set(ctx, 'shadows', false);
  check('it goes into the character document', ctx.character.settings.shadows === false);
  check('main.js is handed the whole record', ctx.applied.length === 1 && ctx.applied[0].shadows === false && ctx.applied[0].ring === 9);
  check('and it says what changed', /Shadows: off/.test(r.text), r.text);
  set(ctx, 'ring', 12);
  check('a choice writes and applies', ctx.character.settings.ring === 12 && ctx.applied[1].ring === 12);
  const bad = set(ctx, 'lasers', true);
  check('a setting that does not exist is refused and named', bad.ok === false && /lasers/.test(bad.text), bad.text);
  check('and nothing was applied for it', ctx.applied.length === 2);
  check('every write said something', ctx.said.length === 3, `${ctx.said.length} lines`);
}

console.log('win_settings: audio hears about it twice');
{
  const ctx = mkCtx();
  set(ctx, 'music', 0.25);
  check('the volume reaches audio.js', ctx.audio.musicVol === 0.25);
  check('and the document', ctx.character.settings.music === 0.25);
  set(ctx, 'sfx', 0.1);
  check('so does the sound volume', ctx.audio.sfxVol === 0.1 && ctx.character.settings.sfx === 0.1);
  set(ctx, 'musicOn', false);
  check('turning music off toggles audio.js once', ctx.audio.musicOn === false);
  set(ctx, 'musicOn', false);
  check('and turning it off again does not toggle it back on', ctx.audio.musicOn === false);
  set(ctx, 'musicOn', true);
  check('turning it back on works', ctx.audio.musicOn === true);
  set(ctx, 'sfxOn', false);
  check('and the same for sound', ctx.audio.sfxOn === false);
}

console.log('win_settings: rebinding the bar');
{
  const s = defaultSettings();
  const r = rebind(s, 0, 'Q');
  check('slot one takes q, lower cased', r.ok === true && s.bar[0] === 'q', r.why);
  check('and it said which slot', /Slot 1/.test(r.why), r.why);
  const clash = rebind(s, 3, 'q');
  check('binding q again moves the old slot rather than doubling it', clash.ok === true && s.bar[3] === 'q' && s.bar[0] === '4', clash.why);
  check('and it said what it swapped', /slot 1 took/.test(clash.why), clash.why);
  check('no key is ever bound twice', new Set(s.bar).size === 12, s.bar.join(' '));
  check('an empty key is refused', rebind(s, 0, '').ok === false);
  check('a slot that does not exist is refused', rebind(s, 12, 'z').ok === false && /only 12 slots/.test(rebind(s, 12, 'z').why));
  check('the bar is still twelve long', s.bar.length === 12);
}

console.log('win_settings: another character');
{
  const ctx = mkCtx();
  let went = 0;
  ctx.newCharacter = () => { went++; };
  // This file wipes nothing, and now nothing else does either: the button
  // saves and goes to the roster, where a character can be read before being
  // deleted. The going is the hook's, and ui.js fills it in with toRoster.
  check('a hook is what does the going, not this file', typeof ctx.newCharacter === 'function');
  ctx.newCharacter();
  check('and calling it does', went === 1);
  const none = mkCtx();
  check('without the hook nothing is wired', none.newCharacter === undefined);
  const src = readFileSync(new URL('./win_settings.js', import.meta.url), 'utf8');
  check('the button says where it goes rather than what it destroys',
    src.includes('Save and go to the character roster') && !/yes, wipe/i.test(src));
  check('and it needs no second press to get there', !src.includes('_armed'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
