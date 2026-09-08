import { createAtmosphere } from './atmosphere.js';

export function mountMotion(signal) {
  const world = document.querySelector('.world');
  const canvas = document.querySelector('.atmosphere');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const atmosphere = createAtmosphere(canvas);
  let enabled = !preference.matches;
  let frame = 0;
  let lastTime = 0;
  let animationTime = 0;
  let pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };

  function renderScene() {
    const x = enabled ? eased.x : 0;
    const y = enabled ? eased.y : 0;
    world.style.setProperty('--vista-x', `${x * -9}px`);
    world.style.setProperty('--vista-y', `${y * -6}px`);
    world.style.setProperty('--figure-x', `${x * 16}px`);
    world.style.setProperty('--figure-y', `${y * 9}px`);
    world.style.setProperty('--mist-x', `${x * -19}px`);
  }

  function tick(time) {
    frame = 0;
    if (!enabled || document.hidden) return;
    const delta = lastTime ? Math.min(time - lastTime, 48) : 16;
    lastTime = time;
    animationTime += delta;
    const smoothing = 1 - Math.exp(-delta / 160);
    eased.x += (pointer.x - eased.x) * smoothing;
    eased.y += (pointer.y - eased.y) * smoothing;
    renderScene();
    atmosphere.draw(animationTime, delta, true);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (enabled && !document.hidden && !frame) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function sync() {
    enabled = !preference.matches;
    document.body.classList.toggle('motion-off', !enabled);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    atmosphere.clear();
    renderScene();
    start();
  }

  preference.addEventListener('change', sync, { signal });
  window.addEventListener('pointermove', (event) => {
    if (!enabled || coarsePointer.matches || event.pointerType === 'touch') return;
    pointer = { x: event.clientX / window.innerWidth * 2 - 1, y: event.clientY / window.innerHeight * 2 - 1 };
  }, { passive: true, signal });
  document.addEventListener('pointerleave', () => { pointer = { x: 0, y: 0 }; }, { signal });
  window.addEventListener('resize', () => { atmosphere.resize(); renderScene(); }, { passive: true, signal });
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else start();
  }, { signal });
  signal.addEventListener('abort', () => { cancelAnimationFrame(frame); atmosphere.clear(); }, { once: true });
  sync();
}
