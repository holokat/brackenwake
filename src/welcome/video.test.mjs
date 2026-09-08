import assert from 'node:assert/strict';
import { mountBackgroundVideo } from './video.js';

const saved = new Map(['window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function fixture(reduced = false) {
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  const page = Object.assign(new EventTarget(), { hidden: false });
  const classes = new Set();
  const video = Object.assign(new EventTarget(), {
    dataset: { src: '/ui/brackenwake-ambient-loop.mp4' },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    src: '', paused: true, calls: 0, unloaded: false,
    getAttribute(name) { return this[name]; },
    removeAttribute(name) { this[name] = ''; },
    play() { this.calls++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    load() { this.unloaded = true; },
  });
  Object.assign(globalThis, { document: page, window: { matchMedia: () => preference } });
  const lifecycle = new AbortController();
  return { video, page, preference, classes, lifecycle };
}

try {
  const f = fixture(true);
  mountBackgroundVideo(f.video, f.lifecycle.signal);
  assert.equal(f.video.src, '', 'Reduced motion must avoid a video download');
  assert.equal(f.video.calls, 0);
  f.preference.matches = false;
  f.preference.dispatchEvent(new Event('change'));
  await Promise.resolve();
  assert.equal(f.video.src, f.video.dataset.src);
  assert.equal(f.video.muted, true);
  assert.equal(f.video.loop, true);
  assert.equal(f.video.playsInline, true);
  assert.equal(f.classes.size, 0, 'Loading alone must not obscure the fallback');
  f.video.dispatchEvent(new Event('playing'));
  assert.ok(f.classes.has('is-playing'));
  f.page.hidden = true;
  f.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.paused, true);
  f.page.hidden = false;
  f.page.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  assert.equal(f.video.paused, false);
  f.video.dispatchEvent(new Event('error'));
  assert.equal(f.classes.size, 0, 'Decode errors must reveal the fallback');
  f.video.dispatchEvent(new Event('playing'));
  f.preference.matches = true;
  f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.video.paused, true);
  assert.equal(f.classes.size, 0);
  f.lifecycle.abort();
  assert.equal(f.video.src, '');
  assert.equal(f.video.unloaded, true);
  const calls = f.video.calls;
  f.preference.matches = false;
  f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.video.calls, calls, 'Disposal must remove preference listeners');

  const denied = fixture();
  denied.video.play = () => Promise.reject(new Error('Autoplay denied'));
  mountBackgroundVideo(denied.video, denied.lifecycle.signal);
  await Promise.resolve();
  assert.equal(denied.classes.size, 0);
  denied.lifecycle.abort();

  const race = fixture();
  let resolvePlay;
  race.video.play = () => new Promise((resolve) => { resolvePlay = resolve; });
  mountBackgroundVideo(race.video, race.lifecycle.signal);
  race.page.hidden = true;
  race.page.dispatchEvent(new Event('visibilitychange'));
  race.video.paused = false;
  resolvePlay();
  await Promise.resolve();
  assert.equal(race.video.paused, true, 'Late playback must not restart a hidden page');
  race.lifecycle.abort();
} finally {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('Welcome video: playback, fallback, reduced motion, visibility, autoplay denial and cleanup passed.');
