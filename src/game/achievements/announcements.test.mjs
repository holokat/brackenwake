import test from 'node:test';
import assert from 'node:assert/strict';
import {createAchievementAnnouncements} from './announcements.js';
import {achievementArt} from './art.js';
import {ACHIEVEMENTS} from './catalog.js';
import {createAchievementTracker} from './tracker.js';
import {CUES, urlFor, createAudio} from '../audio.js';
import {readFileSync} from 'node:fs';

test('a real achievement outcome enqueues its reward and plays success on reveal only', () => {
  const banners = [], logs = [], sounds = [];
  const notify = createAchievementAnnouncements({hud: {unlock: row => banners.push(row), log: text => logs.push(text)},
    audio: {play: cue => sounds.push(cue)}});
  const character = {skills: {}, stats: {}, equipment: {}};
  const tracker = createAchievementTracker({character, actor: {}, notify});
  tracker.record({type: 'camp'});
  assert.equal(banners.length, 1);
  const row = ACHIEVEMENTS.find(row => row.requirements.some(r => r.metric === 'campfire'));
  assert.equal(banners[0].id, `achievement:${row.id}`);
  assert.deepEqual(banners[0].art, achievementArt(row.number));
  assert.match(banners[0].key, new RegExp(row.title));
  assert.equal(sounds.length, 0);
  banners[0].onShow();
  assert.deepEqual(sounds, ['achievementSuccess']);
  tracker.record({type: 'camp'}); notify([row]);
  assert.equal(banners.length, 1);
  assert.equal(logs.length, 1);
  tracker.dispose();
});

test('every achievement atlas crop is valid, unique, and shared with the unlock banner', () => {
  const crops = ACHIEVEMENTS.map(row => achievementArt(row.number));
  assert.equal(new Set(crops.map(crop => crop.src + crop.position)).size, 40);
  assert.equal(achievementArt(21).position, '0% 0%');
  assert.equal(achievementArt(40).position, '100% 100%');
  assert.equal(achievementArt(0), null);
});

test('achievement cue resolves to the shipped CC0 audio instead of a cave or failure cue', () => {
  const cue = CUES.achievementSuccess;
  assert.equal(urlFor(cue), '/audio/sfx/achievement-success.mp3');
  assert.notEqual(cue.file, CUES.enterCave.file);
  assert.notEqual(cue.file, CUES.denied.file);
  assert.equal(readFileSync(new URL('../../../public/audio/sfx/achievement-success.mp3', import.meta.url)).byteLength, 9656);
});

test('achievement success respects gesture unlock, saved volume and saved mute', () => {
  const values = new Map(), played = [];
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const makeElement = url => ({src: url, volume: 1, addEventListener() {}, pause() {},
    play() {played.push({url: this.src, volume: this.volume}); return Promise.resolve();}});
  const audio = createAudio({storage, makeElement, listen: false});
  assert.equal(audio.play('achievementSuccess'), null);
  audio.setSfxVolume(.4); audio.unlock(); audio.play('achievementSuccess');
  assert.deepEqual(played, [{url: '/audio/sfx/achievement-success.mp3', volume: .2}]);
  audio.toggleSfx(); audio.play('achievementSuccess');
  assert.equal(played.length, 1);
  audio.dispose();
  const restored = createAudio({storage, makeElement, listen: false});
  restored.unlock(); restored.play('achievementSuccess');
  assert.equal(restored.sfxOn, false);
  assert.equal(restored.sfxVolume, .4);
  assert.equal(played.length, 1);
  restored.dispose();
});
