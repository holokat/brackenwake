import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mountMotion } from './motion.js';

const html = readFileSync(new URL('../../welcome/index.html', import.meta.url), 'utf8');
assert.match(html, /class="game-button" href="\/play"/);
for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  // The game entry is a routed document, exercised by server/marketing.test.mjs.
  if (path === '/play') continue;
  assert.ok(
    existsSync(new URL(`../../public${path}`, import.meta.url)) ||
    existsSync(new URL(`../..${path}`, import.meta.url)), path,
  );
}

// Mount the actual motion controller against a hero-only document. Any access
// to a removed section or control fails, instead of hiding a runtime crash.
const saved = new Map(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const preference = Object.assign(new EventTarget(), { matches: false });
const coarsePointer = Object.assign(new EventTarget(), { matches: false });
const properties = new Map();
const classes = new Set();
const world = { style: { setProperty(key, value) { properties.set(key, value); } } };
const canvas = { getContext() { return null; } };
const page = Object.assign(new EventTarget(), {
  hidden: false,
  body: { classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } } },
  querySelector(selector) {
    if (selector === '.world') return world;
    if (selector === '.atmosphere') return canvas;
    throw new Error(`Unexpected DOM dependency: ${selector}`);
  },
});
const viewport = Object.assign(new EventTarget(), {
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  matchMedia(query) { return query.includes('prefers-reduced-motion') ? preference : coarsePointer; },
});
const frames = new Map();
let nextFrame = 0;
let time = 0;
function step() {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(time += 16);
}
function pointer(type, x, y) {
  viewport.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: type, clientX: x, clientY: y }));
}
try {
  Object.assign(globalThis, {
    window: viewport, document: page,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const lifecycle = new AbortController();
  mountMotion(lifecycle.signal);
  assert.equal(frames.size, 1);
  pointer('touch', 1440, 900);
  step();
  assert.equal(parseFloat(properties.get('--vista-x')), 0);
  pointer('mouse', 1440, 900);
  step();
  assert.ok(parseFloat(properties.get('--vista-x')) < 0);
  assert.ok(parseFloat(properties.get('--figure-x')) > 0);
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 0);
  assert.ok(classes.has('motion-off'));
  assert.equal(parseFloat(properties.get('--vista-x')), 0);
  preference.matches = false;
  preference.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 1);
  page.hidden = true;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 0);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 1);
  lifecycle.abort();
  assert.equal(frames.size, 0);
  preference.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 0);
} finally {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
console.log('Welcome: hero-only boot, real assets, pointer depth, reduced motion, background suspension and cleanup passed.');
