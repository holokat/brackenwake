import { createAtmosphere } from './atmosphere.js';

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const scrollProgress = (scrollY, top, travel) => clamp((scrollY - top) / Math.max(1, travel));

export function mountMotion(signal) {
  const world = document.querySelector('.world');
  const stage = document.querySelector('.world-stage');
  const calling = document.querySelector('.calling');
  const begin = document.querySelector('.begin');
  const canvas = document.querySelector('.atmosphere');
  const button = document.querySelector('.motion-toggle');
  const label = button.querySelector('.motion-label');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const atmosphere = createAtmosphere(canvas);
  let wanted = true;
  try { wanted = localStorage.getItem('brackenwake:welcome:motion') !== 'off'; } catch { /* Storage is optional. */ }
  let enabled = wanted && !preference.matches;
  let frame = 0;
  let lastTime = 0;
  let animationTime = 0;
  let pointer = { x: 0, y: 0 };
  let eased = { x: 0, y: 0 };
  let dimensions = {};

  function measure() {
    dimensions = {
      height: window.innerHeight,
      worldTop: world.offsetTop,
      travel: world.offsetHeight - stage.offsetHeight,
      callingTop: calling.offsetTop,
      callingHeight: calling.offsetHeight,
      beginTop: begin.offsetTop,
    };
    atmosphere.resize();
  }

  function renderScene() {
    const scroll = window.scrollY;
    const progress = enabled ? scrollProgress(scroll, dimensions.worldTop, dimensions.travel) : 0;
    const x = enabled ? eased.x : 0;
    const y = enabled ? eased.y : 0;
    world.style.setProperty('--vista-x', `${x * -9}px`);
    world.style.setProperty('--vista-y', `${progress * 25 + y * -6}px`);
    world.style.setProperty('--vista-scale', String(1.03 + progress * .1));
    world.style.setProperty('--copy-y', `${progress * -95}px`);
    world.style.setProperty('--copy-opacity', String(1 - progress * .86));
    world.style.setProperty('--figure-x', `${x * 16}px`);
    world.style.setProperty('--figure-y', `${progress * 70 + y * 9}px`);
    world.style.setProperty('--mist-x', `${x * -19}px`);
    const offset = enabled ? clamp((scroll - dimensions.callingTop + dimensions.height * .5) / dimensions.height, -1, 1) : 0;
    calling.style.setProperty('--character-y', `${offset * -28}px`);
    calling.style.setProperty('--portrait-x', `${x * 11}px`);
    calling.style.setProperty('--portrait-y', `${y * 7}px`);
    begin.style.setProperty('--begin-y', `${enabled ? clamp((scroll - dimensions.beginTop) * .12, -70, 70) : 0}px`);
  }

  function tick(time) {
    frame = 0;
    if (!enabled || document.hidden) return;
    // Bound the delta after backgrounding so particles never jump.
    const delta = lastTime ? Math.min(time - lastTime, 48) : 16;
    lastTime = time;
    animationTime += delta;
    const smoothing = 1 - Math.exp(-delta / 160);
    eased.x += (pointer.x - eased.x) * smoothing;
    eased.y += (pointer.y - eased.y) * smoothing;
    renderScene();
    atmosphere.draw(animationTime, delta, window.scrollY < dimensions.callingTop - dimensions.height * .2);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (enabled && !document.hidden && !frame) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function sync() {
    enabled = wanted && !preference.matches;
    document.body.classList.toggle('motion-off', !enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.disabled = preference.matches;
    label.textContent = preference.matches ? 'Motion reduced' : enabled ? 'Motion on' : 'Motion off';
    button.title = preference.matches ? 'Your device prefers reduced motion' : enabled ? 'Pause ambient motion' : 'Enable ambient motion';
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    atmosphere.clear();
    renderScene();
    start();
  }

  button.hidden = false;
  button.addEventListener('click', () => {
    wanted = !wanted;
    try { localStorage.setItem('brackenwake:welcome:motion', wanted ? 'on' : 'off'); } catch { /* Keep in-memory preference. */ }
    sync();
  }, { signal });
  preference.addEventListener('change', sync, { signal });
  window.addEventListener('pointermove', (event) => {
    if (!enabled || coarsePointer.matches || event.pointerType === 'touch') return;
    pointer = { x: event.clientX / window.innerWidth * 2 - 1, y: event.clientY / window.innerHeight * 2 - 1 };
  }, { passive: true, signal });
  document.addEventListener('pointerleave', () => { pointer = { x: 0, y: 0 }; }, { signal });
  window.addEventListener('resize', () => { measure(); renderScene(); }, { passive: true, signal });
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else start();
  }, { signal });
  signal.addEventListener('abort', () => { cancelAnimationFrame(frame); atmosphere.clear(); }, { once: true });
  measure();
  sync();
}
