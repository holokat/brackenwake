import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { runBoot } from '../app/boot_lifecycle.js';
import { inlineBootScreenPlugin } from '../../../tools/boot_screen.mjs';

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./boot-screen.js', import.meta.url), 'utf8');
const servedHtml = inlineBootScreenPlugin().transformIndexHtml.handler(html);

// Run the shipped, pre-bundle controller with a deterministic browser clock.
// No game state, storage or WebGL is involved in the loading screen.
function screen({ reducedMotion = false } = {}) {
  let now = 0, nextTimer = 0, reloads = 0;
  const timers = new Map(), frames = [], elements = new Map(), registrations = new Set();
  for (const match of html.matchAll(/id="([^"]+)"/g)) {
    const id = match[1], node = new EventTarget();
    const opening = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))[0];
    Object.assign(node, {
      textContent: html.match(new RegExp(`id="${id}"[^>]*>([^<]*)`))?.[1] || '',
      hidden: /\bhidden\b/.test(opening), inert: /\binert\b/.test(opening),
      dataset: { state: 'loading' }, attributes: new Map(), removed: false,
      setAttribute(key, value) { this.attributes.set(key, value); },
      remove() { this.removed = true; },
      contains(other) { return !!other?.id?.startsWith('bw-loading'); },
      focus() { document.activeElement = this; }, id,
    });
    elements.set(id, node);
  }
  const document = { getElementById: id => elements.get(id), activeElement: null };
  const window = new EventTarget();
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  window.addEventListener = (name, fn, options) => { registrations.add(name); add(name, fn, options); };
  window.removeEventListener = (name, fn, options) => { registrations.delete(name); remove(name, fn, options); };
  window.matchMedia = () => ({ matches: reducedMotion });
  window.location = { reload: () => reloads++ };
  const setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; };
  const clearTimeout = id => timers.delete(id);
  runInNewContext(controller, { window, document, setTimeout, clearTimeout, requestAnimationFrame: fn => frames.push(fn) });
  const report = detail => window.dispatchEvent(new CustomEvent('brackenwake:boot', { detail }));
  return {
    window, document, timers, registrations, report,
    root: elements.get('bw-loading'), get: name => elements.get('bw-loading-' + name),
    reloads: () => reloads,
    frame() { frames.splice(0).forEach(fn => fn()); },
    advance(ms) {
      const until = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      now = until;
    },
    error(error, target = null) {
      const event = new Event('error');
      Object.defineProperties(event, { error: { value: error }, target: { value: target } });
      window.dispatchEvent(event);
    },
  };
}

test('the loading screen is present before the game module and starts without game dependencies', () => {
  const s = screen();
  assert.equal(s.get('heading').textContent, 'A moment by the fire');
  assert.equal(s.get('status').textContent, 'Opening Brackenwake');
  assert.equal(s.get('retry').hidden, true);
  assert.equal(s.document.getElementById('game').inert, true);
  assert(servedHtml.includes('<script>' + controller + '</script>'));
  assert(servedHtml.indexOf(controller) < servedHtml.indexOf('src="/src/game/main.js"'));
  assert.equal(inlineBootScreenPlugin().transformIndexHtml.handler('<title>Welcome</title>'), '<title>Welcome</title>');
  assert(!/\bimport\s/.test(controller));
  assert(!/localStorage|sessionStorage/.test(controller));
});

test('slow and very slow loads remain live, offer retry, and can finish normally', async () => {
  const s = screen();
  let finish;
  const result = runBoot(() => new Promise(resolve => { finish = resolve; }), s.report);
  assert.equal(s.get('status').textContent, 'Preparing the world');
  s.advance(7999);
  assert.equal(s.get('status').textContent, 'Preparing the world');
  s.advance(1);
  assert.equal(s.get('status').textContent, 'Still loading');
  s.advance(37000);
  assert.equal(s.root.dataset.state, 'loading');
  assert.equal(s.get('retry').hidden, false);
  assert.equal(s.get('details').hidden, true);
  assert.match(s.get('copy').textContent, /keep waiting/);
  s.advance(180000);
  finish({ roster: true }); await result;
  assert.equal(s.root.removed, false);
  s.frame(); assert.equal(s.root.dataset.state, 'loading');
  s.frame(); assert.equal(s.root.dataset.state, 'ready');
  assert.equal(s.document.getElementById('game').inert, true);
  s.advance(240);
  assert.equal(s.root.removed, true);
  assert.equal(s.document.getElementById('game').inert, false);
  assert.equal(s.document.getElementById('hud').inert, false);
  assert.equal(s.timers.size, 0);
  assert.equal(s.registrations.size, 0);
});

test('a resolved terrain failure never disappears as a successful boot', async () => {
  const s = screen();
  await runBoot(async () => ({ loadingError: true }), s.report);
  s.advance(60000); s.frame(); s.frame();
  assert.equal(s.root.dataset.state, 'failed');
  assert.equal(s.root.removed, false);
  assert.equal(s.document.getElementById('game').attributes.get('aria-busy'), 'false');
  assert.equal(s.get('retry').hidden, false);
  assert.equal(s.get('details').hidden, false);
  assert.match(s.get('diagnostic').textContent, /Greenwold/);
  s.get('retry').dispatchEvent(new Event('click'));
  assert.equal(s.reloads(), 1);
});

test('synchronous and asynchronous boot errors show the real diagnostic and keep rejecting', async () => {
  for (const asyncFailure of [false, true]) {
    const s = screen(), error = new Error('Renderer could not start');
    await assert.rejects(runBoot(() => {
      if (asyncFailure) return Promise.reject(error);
      throw error;
    }, s.report), /Renderer could not start/);
    assert.equal(s.root.dataset.state, 'failed');
    assert.match(s.get('diagnostic').textContent, /Renderer could not start/);
    assert.equal(s.get('details').hidden, false);
  }
});

test('failed entry imports are caught before any boot hook can run', () => {
  const s = screen();
  s.error(null, { tagName: 'SCRIPT', type: 'module', src: 'https://brackenwake.com/assets/game.js' });
  assert.equal(s.root.dataset.state, 'failed');
  assert.match(s.get('diagnostic').textContent, /game module could not be loaded/);
  assert.equal(s.get('retry').hidden, false);
});

test('recoverable asset errors preserve diagnostics without declaring the whole boot failed', async () => {
  const s = screen();
  s.error(new Error('<img src=x onerror=alert(1)>'));
  s.error(new Error('Second error'));
  assert.equal(s.get('details').hidden, true);
  s.advance(8000);
  assert.equal(s.root.dataset.state, 'loading');
  assert.equal(s.get('details').hidden, false);
  assert.match(s.get('diagnostic').textContent, /<img src=x/);
  assert(!s.get('diagnostic').textContent.includes('Second error'));
  await runBoot(async () => ({ creating: true }), s.report);
  s.frame(); s.frame(); s.advance(240);
  assert.equal(s.root.removed, true);
});

test('rejections are retained for diagnosis, and late events cannot reopen a completed screen', async () => {
  const s = screen();
  const event = new Event('unhandledrejection');
  event.reason = new Error('Optional audio failed');
  s.window.dispatchEvent(event);
  s.advance(8000);
  assert.match(s.get('diagnostic').textContent, /Optional audio failed/);
  await runBoot(async () => ({ step() {} }), s.report);
  s.frame(); s.frame(); s.advance(240);
  s.report({ phase: 'failed', error: 'Late failure' });
  assert.equal(s.root.dataset.state, 'ready');
});

test('reduced motion skips the fade delay and restores focus when a loading control held it', async () => {
  const s = screen({ reducedMotion: true });
  s.advance(45000);
  s.get('retry').focus();
  await runBoot(async () => ({ roster: true }), s.report);
  s.frame(); s.frame(); s.advance(0);
  assert.equal(s.root.removed, true);
  assert.equal(s.document.activeElement.id, 'game');
});

test('redirects leave the cover in place until navigation', async () => {
  const s = screen();
  await runBoot(async () => null, s.report);
  s.frame(); s.frame(); s.advance(240);
  assert.equal(s.root.dataset.state, 'loading');
  assert.equal(s.root.removed, false);
});
