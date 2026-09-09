import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnlockBanner} from './unlock_banner.js';
import {bannerAt, UNLOCK_BANNER, UNLOCK_TOTAL} from '../hud.js';
import {achievementArt} from '../achievements/art.js';

function setup(t, queueMax = 6) {
  const previous = globalThis.document;
  const node = () => ({children: [], style: {}, attributes: {}, classList: {add() {}, remove() {}},
    appendChild(child) {this.children.push(child);}, setAttribute(key, value) {this.attributes[key] = value;},
    removeAttribute(key) {delete this[key];}});
  globalThis.document = {createElement: node};
  t.after(() => {globalThis.document = previous;});
  const root = node();
  const banner = createUnlockBanner(root, {shape: UNLOCK_BANNER, total: UNLOCK_TOTAL, queueMax, phaseAt: bannerAt});
  return {banner, box: root.children[0]};
}

test('achievements and abilities use one queue, with sprite cleanup and one cue on each reveal', t => {
  const {banner, box} = setup(t), heard = [];
  banner.enqueue({id: 'fireball', name: 'Fireball', key: 'Press 3', onShow: () => heard.push('ability')});
  banner.enqueue({id: 'achievement:first-blood', name: 'First blood', label: 'Achievement unlocked',
    key: 'Title unlocked: The blooded.', art: achievementArt(5), onShow: () => heard.push('achievement')});
  assert.deepEqual(heard, ['ability']);
  assert.equal(banner.state.queued, 1);
  banner.update(UNLOCK_TOTAL);
  assert.deepEqual(heard, ['ability', 'achievement']);
  assert.equal(box.children[0].textContent, 'Achievement unlocked');
  assert.match(box.children[1].style.backgroundImage, /haven-achievements-01-20/);
  assert.equal(box.children[1].style.backgroundPosition, '100% 0%');
  assert.equal(box.children[1].children[0].style.display, 'none');
  assert.equal(box.attributes['aria-live'], 'polite');
  banner.update(.5); banner.update(.5);
  assert.equal(heard.length, 2);
  banner.enqueue({id: 'lightning', name: 'Lightning'});
  banner.update(UNLOCK_TOTAL);
  assert.equal(box.children[0].textContent, "You've unlocked");
  assert.equal(box.children[1].style.backgroundImage, '');
  assert.equal(box.children[1].children[0].style.display, '');
  banner.update(UNLOCK_TOTAL);
  assert.equal(banner.state.phase, 'done');
});

test('only shown entries play cues, and optional audio errors do not break the queue', t => {
  const {banner} = setup(t, 1), heard = [];
  banner.enqueue({name: 'First', onShow() {throw Error('Audio unavailable');}});
  banner.enqueue({name: 'Dropped', onShow: () => heard.push('dropped')});
  banner.enqueue({name: 'Next', onShow: () => heard.push('next')});
  banner.update(UNLOCK_TOTAL);
  assert.equal(banner.state.name, 'Next');
  assert.deepEqual(heard, ['next']);
  assert.equal(banner.enqueue(null), null);
});
