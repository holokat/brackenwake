// The stage: renderer, sky, fog and the four lights that make a day.
//
// Lifted out of the farm's `_setup()` and the day/night block of `_animate`.
// The farm's version read its colours from whichever theme the player had
// picked. Brackenwake has one sky, so the palette is pinned to the meadow
// entry in THEMES and nothing here asks a theme a question again.
//
// Nothing in this file knows about the player, the camera rig, or the world.
// It owns the scene graph nodes it makes, and the names it gives them are the
// handle world_runtime.js uses to switch the overworld off when you go under
// the ground:
//
//   'sky'  - a group holding both sky domes, the sun disc, its glow, the moon
//   'sun-light' 'hemi-light' 'ambient-light' 'fill-light'
//
// Renaming any of those breaks the descent. There is a test for it.

import * as THREE from 'three';
import { THEMES } from '../farm/themes.js';
import { mulberry32, glowTexture } from '../farm/assets.js';

/** One full day to night to day again. Six minutes, per docs/OPEN-WORLD.md. */
export const DAY_CYCLE_MS = 360000;

/** The one sky. THEMES is a data table; this is the row we live in. */
export const PALETTE = THEMES.find((t) => t.id === 'meadow');

/** How far the fog reaches in the open. The streamed ring is 576 m. */
export const WORLD_FOG = { near: 90, far: 536 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The day curve, pure so it can be checked in node.
 *
 * A raw cosine spends almost all its time changing. This one is stretched by
 * 1.4 and pulled down by 0.2, then clamped, which buys a flat night and a flat
 * day with a short dawn and dusk between them. The 0.12 phase offset means
 * t = 0 is not midnight.
 */
export function dayFactorAt(nowMs, cycleMs = DAY_CYCLE_MS) {
  const tphase = ((nowMs / cycleMs) + 0.12) % 1;
  const raw = 0.5 + 0.5 * Math.cos(tphase * Math.PI * 2);
  return clamp01(raw * 1.4 - 0.2);
}

/** A vertical gradient painted to a canvas, optionally salted with stars. */
export function skyGradientTexture(stops, withStars = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  if (withStars) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const rng = mulberry32(7);
    for (let i = 0; i < 90; i++) {
      const y = rng() * 300;
      ctx.globalAlpha = 0.3 + rng() * 0.7;
      ctx.fillRect(rng() * 64, y, rng() > 0.85 ? 2 : 1, rng() > 0.85 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScene(container) {
  const w = container.clientWidth || 800, h = container.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const TC = PALETTE.colors;
  const fogDay = new THREE.Color(TC.fogDay);
  const fogNight = new THREE.Color(TC.fogNight);
  scene.fog = new THREE.Fog(TC.fogDay, WORLD_FOG.near, WORLD_FOG.far);
  // a solid colour behind everything, so no angle finds a black gap
  scene.background = new THREE.Color(PALETTE.skyDay[1]);

  // ---- sky: two domes crossfaded by the day, plus the two lamps in it ----
  const sky = new THREE.Group();
  sky.name = 'sky';
  scene.add(sky);

  const skyDayMat = new THREE.MeshBasicMaterial({
    map: skyGradientTexture(PALETTE.skyDay), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false,
  });
  const skyNightMat = new THREE.MeshBasicMaterial({
    map: skyGradientTexture(PALETTE.skyNight, true), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false, opacity: 0,
  });
  const skyDomes = [
    new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), skyNightMat),
    new THREE.Mesh(new THREE.SphereGeometry(1495, 24, 16), skyDayMat),
  ];
  sky.add(...skyDomes);

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(9, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true })
  );
  sunBall.position.set(240, 200, -190);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('255,240,190'), transparent: true, opacity: 0.8, depthWrite: false, fog: false,
  }));
  sunGlow.scale.setScalar(90);
  sunGlow.position.copy(sunBall.position);
  // the moon rises opposite the sun
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(7, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf5, fog: false, transparent: true, opacity: 0 })
  );
  moon.position.set(-240, 190, 170);
  sky.add(sunBall, sunGlow, moon);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0xa98a63, 0.9);
  hemi.name = 'hemi-light';
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe8d0, 0.22);
  ambient.name = 'ambient-light';
  scene.add(ambient);

  const sunDayCol = new THREE.Color(TC.sunDay);
  const sunNightCol = new THREE.Color(TC.sunNight);
  const sun = new THREE.DirectionalLight(TC.sunDay, 2.4);
  sun.name = 'sun-light';
  sun.position.set(90, 120, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // The farm sized this box to its island. A third person camera never sees
  // more than the near ring of chunks, so 55 m each way around the player is
  // the whole of what can cast a shadow you would notice.
  const SB = 55;
  Object.assign(sun.shadow.camera, { left: -SB, right: SB, top: SB, bottom: -SB, near: 20, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.target.name = 'sun-target';
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.4);
  fill.name = 'fill-light';
  fill.position.set(-70, 40, -80);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1800);
  camera.position.set(0, 8, 12);

  // While the fog colour is pinned (underground) the day/night pass leaves it
  // alone. setFog with a colour pins; setFog without one hands it back.
  let fogPinned = false;
  let day = 1;

  function setFog(near, far, colorHex) {
    scene.fog.near = near;
    scene.fog.far = far;
    if (colorHex != null) { scene.fog.color.setHex(colorHex); fogPinned = true; }
    else fogPinned = false;
  }

  function setDay(dayFactor) {
    const d = clamp01(dayFactor);
    day = d;
    sun.intensity = 0.14 + 2.3 * d;
    sun.color.lerpColors(sunNightCol, sunDayCol, d);
    hemi.intensity = 0.2 + 0.7 * d;
    ambient.intensity = 0.1 + 0.13 * d;
    if (!fogPinned) scene.fog.color.lerpColors(fogNight, fogDay, d);
    skyDayMat.opacity = d;
    sunBall.material.opacity = d;
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    sunGlow.material.opacity = 0.8 * d * (0.9 + 0.1 * Math.sin(t / 2400));
    moon.material.opacity = (1 - d) * 0.95;
  }

  // The sky is painted at a fixed offset from whatever it is told to follow,
  // so it never gets closer and the shadow box stays under the player.
  function follow(pos) {
    sky.position.set(pos.x, pos.y, pos.z);
    sun.position.set(pos.x + 90, pos.y + 120, pos.z + 50);
    sun.target.position.set(pos.x, pos.y, pos.z);
    sun.target.updateMatrixWorld();
  }

  function resize() {
    const w2 = container.clientWidth || w, h2 = container.clientHeight || h;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
  }
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  setDay(1);

  return {
    renderer, scene, camera,
    lights: { sun, hemi, ambient, fill },
    sky, skyDomes,
    setDay, setFog, follow, resize,
    render() { renderer.render(scene, camera); },
    dayFactor(nowMs) { return dayFactorAt(nowMs); },
    get day() { return day; },
    get fogPinned() { return fogPinned; },
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
