// The Homestead scene engine — tiered farm bases, plantable plots, placeable
// unlockables, ghost placement mode, and all ambient life.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  P, mat, mesh, box, cyl, cone, ball, leafMesh, tube,
  glowTexture, sunflowerFaceTexture, signTexture,
  buildCrop, buildTree, buildObject, OBJECT_RADIUS, hash32, mulberry32,
} from './assets.js';
import { getTheme, tickWater } from './themes.js';
import { seasonTint, baseTempFor } from './seasons.js';
import { WeatherMachine } from './weather.js';
import { ANIMAL_TYPES, ANIMAL_RADIUS, buildAnimal, updateAnimal, soundIntervalMs } from './animals.js';
import {
  buildFarmhouse, buildBarn, buildSilo, buildEnclosure, BUILDING_RADIUS,
} from './buildings.js';
import { buildDock, FishingSession } from './fishing.js';
import { BIRDS, BIRD_SPECIES } from './birds.js';
import { buildDeer } from './deer.js';
import { buildMeat } from './meat_models.js';
import { buildCritter } from './critter_models.js';
import { buildCamp } from './camp_models.js';
import { buildFishTrap } from './fishtrap_models.js';
import { buildBowViewmodel } from './bow_viewmodel.js';
import { buildPredator } from './predator_models.js';
import { buildGLB, glbReady } from './glb_models.js';

// campsite decor ids (catalog) → camp_models builder ids
const CAMP_IDS = new Set(['campfire', 'tent', 'camp_chair', 'camp_lantern']);
// the authored GLB animals stand ~4.5u tall in their own units; bring to farm scale
const GLB_DEER_SCALE = 0.5;
const GLB_BEAR_SCALE = 0.74; // a bear reads bigger than a deer

// Huntable quarry. `minTier` is the bow tier needed to actually down it — a bear
// shrugs off a tier-1 bow and charges the farm instead. `hitR` is the click
// target radius (smaller = harder to hit), `flee` the panic-speed multiplier,
// `hp` the [min,max] arrows-to-kill (deer take 2–3; small critters drop in one).
const QUARRY = {
  deer:     { meat: 'venison',   yield: { buck: 3, doe: 2, fawn: 1 }, minTier: 1, hitR: 0.95, base: 1.6, flee: 9.5, hp: [2, 3] },
  bunny:    { meat: 'game_meat', yield: 1, minTier: 1, hitR: 0.55, base: 4.2, flee: 7.5, hp: [1, 1], restless: true },
  squirrel: { meat: 'game_meat', yield: 1, minTier: 1, hitR: 0.5,  base: 4.6, flee: 7.8, hp: [1, 1], restless: true },
  bear:     { meat: 'bear_meat', yield: 4, minTier: 2, hitR: 1.3,  base: 1.3, flee: 4.0, hp: [3, 4], dangerous: true },
};
import { buildTurtle, buildDolphin, buildSeagull } from './beach_life.js';
import { buildProcessor, buildMerchantItem, PROCESSOR_RADIUS } from './processors.js';
import { buildPlaceholder, placeholderRadius, buildConstructionSite } from './placeholder.js';
import { INFRA_MODELS } from './infra_models.js';
import { INFRA_BY_ID } from './infrastructure.js';
import { findItem, GOODS, placementZone } from './catalog.js';

const PROC_IDS = ['mill', 'bakery', 'creamery', 'cheese_house', 'preserve_kitchen', 'smokehouse', 'juicery', 'farm_kitchen'];
const MERCH_IDS = ['gnome', 'fountain', 'flamingo', 'topiary', 'gazebo', 'flagpole'];

function emojiTexture(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '46px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PLOT_SIZE = 7;
const PLOT_PITCH = 9.5;
// plots sit IN the ground like tilled earth, not on raised beds — the group
// is sunk so the soil block's top surfaces just proud of the grass
const PLOT_SINK = -0.85;
const PLOT_TOP_Y = 1.1 + PLOT_SINK; // world height of the soil surface

// generous land: the buildable grass is much larger than the crop grid,
// and every tier expands the whole fenced clearing outward
// a generous green clearing around the plots — room for barns, animals and a
// whole little town's worth of buildings; each tier expands it a lot more, with
// the Large Plot big enough to read as a small homestead town
const TIER_LAYOUT = {
  1: { marginX: 52, front: 26, back: 28 },
  2: { marginX: 62, front: 31, back: 34 },
  3: { marginX: 74, front: 37, back: 41 },
};

const DAY_CYCLE_MS = 480000; // 8 minute day

function skyGradientTexture(stops, withStars = false) {
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

function buildingGroupFor(type, opts) {
  if (type === 'silo') return buildSilo();
  if (type === 'enclosure_small') return buildEnclosure('small');
  if (type === 'enclosure_large') return buildEnclosure('large');
  if (type.startsWith('barn')) return buildBarn(Number(type.slice(4)) || 1);
  return buildObject(type, opts);
}

export class Homestead {
  constructor(container, { cols, rows, tier = 1, themeId = 'meadow', signText, hideSign = false, farmhouseLevel = 1, onPlotHover, onPlotClick, onObjectClick, onObjectHover, onSignClick, onAnimalSound, onMarketClick, onDockClick, onFishResult, onProductReady, onConstructionKnock, onHouseClick, houseRot, houseOffset, onWindmillClick, windmillRot, onGateToggle, onDeerResult, onBowState, fenceHP, onFenceClick, onFenceState, onAnimalLost, getSeason, houseStyle } = {}) {
    this.container = container;
    this.cols = cols;
    this.rows = rows;
    this.tier = tier;
    this.theme = getTheme(themeId);
    this.hideSign = hideSign;
    this.farmhouseLevel = farmhouseLevel;
    this.signText = signText || { line1: 'HOMESTEAD', line2: 'farm through conversation' };
    this.onPlotHover = onPlotHover || (() => {});
    this.onPlotClick = onPlotClick || (() => {});
    this.onObjectClick = onObjectClick || (() => {});
    this.onObjectHover = onObjectHover || (() => {});
    this.onSignClick = onSignClick || (() => {});
    this.onAnimalSound = onAnimalSound || (() => {});
    this.onMarketClick = onMarketClick || (() => {});
    this.onDockClick = onDockClick || (() => {});
    this.onFishResult = onFishResult || (() => {});
    this.onProductReady = onProductReady || (() => {});
    this.onConstructionKnock = onConstructionKnock || (() => {});
    this.onHouseClick = onHouseClick || (() => {});
    this.onWindmillClick = onWindmillClick || (() => {});
    this.windmillRot = typeof windmillRot === 'number' ? windmillRot : null;
    this.onGateToggle = onGateToggle || (() => {});
    this.onDeerResult = onDeerResult || (() => {});
    this.onBowState = onBowState || (() => {});
    this.onFenceClick = onFenceClick || (() => {});
    this.onFenceState = onFenceState || (() => {});
    this.fenceHP = typeof fenceHP === 'number' ? fenceHP : 100; // 0..100 perimeter health
    this.hoveredFence = false;
    this.onAnimalLost = onAnimalLost || (() => {});
    this._getSeason = typeof getSeason === 'function' ? getSeason : null;
    this.houseStyle = houseStyle || null; // cosmetic house customization config
    this.forceSeason = null; // debug override ('spring'|'summer'|'fall'|'winter')
    this.forceWeather = null; // debug override ('clear'|'rain'|'snow'|'storm'|'fog')
    this.season = 'spring';  // current season id (mirror of game state)
    this.temperature = 14;   // current air temperature (°C-ish)
    this.weather = { state: 'clear', intensity: 0, precip: null };
    this.wind = { dir: 0, strength: 0.3, gust: 0 };
    this._shelters = []; // windbreak lee zones {x,z,r,reduction} that calm the wind
    this.powerDeficit = false; // set by the power economy — dims night lights
    this.decayRate = { growth: 1, weather: 1 }; // env multipliers (rain speeds wear)
    this.predators = []; // foxes (day) & wolves (night) that hunt un-penned animals
    // hunting: bow tool aims at deer; hit odds fall off with camera distance
    this.huntMode = false;
    this.hoveredDeer = null;
    this.drawing = null; // { target, at, dur } while the bow is being drawn
    this.arrows = [];   // in-flight arrow projectiles
    this.bloodFx = [];  // fading blood pools at kill sites
    this.houseRot = typeof houseRot === 'number' ? houseRot : null;
    this.houseOffset = houseOffset && Number.isFinite(houseOffset.x) ? { x: houseOffset.x, z: houseOffset.z } : null;
    this.animatedFns = [];
    this.animalRecs = new Map(); // placed id -> animal rec
    this.fishing = null;
    this.dayFactor = 1;

    this.plots = [];
    this.placed = new Map(); // id -> {kind, type, group, hit, opts}
    this.placedSerial = 0;
    this.effects = [];
    this.butterflies = [];
    this.petalPool = [];
    this.placement = null;
    this.dead = false;

    this.goldTex = glowTexture('255,214,90');
    this.blueTex = glowTexture('120,190,255');
    this.faceTex = sunflowerFaceTexture();
    this.dryCol = new THREE.Color(P.soil);
    this.wetCol = new THREE.Color(P.soilWet);
    this.ridgeDry = new THREE.Color(P.soilRidge);
    this.ridgeWet = new THREE.Color(P.ridgeWet);

    const L = TIER_LAYOUT[tier] || TIER_LAYOUT[1];
    this.gridHalfX = (cols * PLOT_PITCH) / 2;
    this.gridHalfZ = (rows * PLOT_PITCH) / 2;
    this.W = cols * PLOT_PITCH + L.marginX;
    this.zFront = this.gridHalfZ + L.front;
    this.zBack = -(this.gridHalfZ + L.back);
    this.fence = {
      x: this.W / 2 - 2.6,
      zFront: this.zFront - 2.6,
      zBack: this.zBack + 2.6,
    };

    this._setup();
    this._buildIsland();
    this._buildWindmill();
    this._buildFence();
    this._buildBaseSign();
    this._buildFarmhouse();
    this._buildMarket();
    this._buildDock();
    this._buildScatter();
    this._buildThemeScenery();
    this._buildOuterZone();
    this._buildSkyLife();
    this._buildPlots();
    this._setupPicking();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  dispose() {
    this.dead = true;
    this.renderer.dispose();
    this.renderer.domElement.remove();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  // ================= scene / world =================

  _setup() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const TC = this.theme.colors;
    this.fogDay = new THREE.Color(TC.fogDay);
    this.fogNight = new THREE.Color(TC.fogNight);
    this.scene.fog = new THREE.Fog(TC.fogDay, 280, 700);
    // solid procedural sky color behind everything — no black gaps at any angle
    this.scene.background = new THREE.Color(this.theme.skyDay?.[1] || '#9fd4f2');

    // day + night sky domes, crossfaded by the day cycle
    this.skyDayMat = new THREE.MeshBasicMaterial({
      map: skyGradientTexture(this.theme.skyDay), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false,
    });
    this.skyNightMat = new THREE.MeshBasicMaterial({
      map: skyGradientTexture(this.theme.skyNight, true), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false, opacity: 0,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), this.skyNightMat));
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1495, 24, 16), this.skyDayMat));

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1800);
    const s = this.W;
    this.camera.position.set(s * 0.72, s * 0.6, s * 1.1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 20;
    this.controls.maxDistance = s * 3.4;
    // keep the lowest view tilted enough DOWN that flat water planes (the desert
    // moat, lakes) read as rings, not big edge-on slabs grazing across the screen
    this.controls.maxPolarAngle = Math.PI / 2.3;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => { if (!this.placement) this.controls.autoRotate = true; }, 30000);
    });

    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0xa98a63, 0.9);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffe8d0, 0.22);
    this.scene.add(this.ambient);
    this.sunDayCol = new THREE.Color(TC.sunDay);
    this.sunNightCol = new THREE.Color(TC.sunNight);
    const sun = new THREE.DirectionalLight(TC.sunDay, 2.4);
    sun.position.set(90, 120, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sb = Math.max(this.W, this.zFront - this.zBack) * 0.75;
    Object.assign(sun.shadow.camera, { left: -sb, right: sb, top: sb, bottom: -sb, near: 20, far: 400 });
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sunLight = sun;
    const fill = new THREE.DirectionalLight(0x9fc0ff, 0.4);
    fill.position.set(-70, 40, -80);
    this.scene.add(fill);

    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true }));
    sunBall.position.set(240, 200, -190);
    this.scene.add(sunBall);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('255,240,190'), transparent: true, opacity: 0.8, depthWrite: false, fog: false,
    }));
    sunGlow.scale.setScalar(90);
    sunGlow.position.copy(sunBall.position);
    this.scene.add(sunGlow);
    this.sunBall = sunBall;
    this.sunGlow = sunGlow;
    // the moon rises opposite the sun
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe8ecf5, fog: false, transparent: true, opacity: 0 }));
    this.moon.position.set(-240, 190, 170);
    this.scene.add(this.moon);

    // fireflies wake up at night
    this.fireflies = [];
    for (let i = 0; i < 14; i++) {
      const fly = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('220,255,140'), color: 0xd8ff7a, transparent: true, opacity: 0, depthWrite: false,
      }));
      fly.scale.setScalar(1.1);
      fly.userData.phase = Math.random() * 20;
      fly.userData.r = 10 + Math.random() * (this.W / 2 - 14);
      this.scene.add(fly);
      this.fireflies.push(fly);
    }

    // WASD panning — fly around the valley on the horizontal plane
    this.keys = new Set();
    this._onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if ('wasd'.includes(k)) this.keys.add(k);
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._onResize = () => {
      const w2 = this.container.clientWidth, h2 = this.container.clientHeight;
      this.camera.aspect = w2 / h2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w2, h2);
    };
    window.addEventListener('resize', this._onResize);
  }

  _capShape() {
    const r = 9;
    const hw = this.W / 2;
    const zF = this.zFront, zB = this.zBack;
    const s = new THREE.Shape();
    s.moveTo(-hw + r, zB);
    s.lineTo(hw - r, zB);
    s.absarc(hw - r, zB + r, r, -Math.PI / 2, 0);
    s.lineTo(hw, zF - r);
    s.absarc(hw - r, zF - r, r, 0, Math.PI / 2);
    s.lineTo(-hw + r, zF);
    s.absarc(-hw + r, zF - r, r, Math.PI / 2, Math.PI);
    s.lineTo(-hw, zB + r);
    s.absarc(-hw + r, zB + r, r, Math.PI, Math.PI * 1.5);
    return s;
  }

  _buildIsland() {
    const grassColor = this.theme.colors.grass;
    const capGeo = new THREE.ExtrudeGeometry(this._capShape(), {
      depth: 2.0, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.3, bevelSegments: 2, curveSegments: 6,
    });
    capGeo.rotateX(Math.PI / 2);
    capGeo.translate(0, -1.1, 0);
    const cap = mesh(capGeo, mat(grassColor));
    cap.receiveShadow = true;
    cap.userData.ground = grassColor; // recoloured seasonally (golden fall, snowy winter)
    this.scene.add(cap);

    const D = this.zFront - this.zBack;
    const zc = (this.zFront + this.zBack) / 2;
    const cliffGeo = new THREE.BoxGeometry(this.W - 4, 17, D - 4, 12, 5, 12).toNonIndexed();
    const pos = cliffGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color(this.theme.colors.dirtTop), cMid = new THREE.Color(this.theme.colors.dirtDeep), cBot = new THREE.Color(this.theme.colors.rock);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y + 8.5) / 17;
      const taper = 0.72 + 0.28 * Math.pow(t, 0.8);
      x *= taper; z *= taper;
      if (t < 0.98) {
        const n = Math.sin(x * 0.33 + z * 0.51) * 1.5 + Math.sin(z * 0.87 - x * 0.23 + 2) * 0.9;
        const len = Math.hypot(x, z) || 1;
        x += (x / len) * n;
        z += (z / len) * n;
      }
      pos.setXYZ(i, x, y, z);
      tmp.copy(t > 0.6 ? cTop : t > 0.25 ? cMid : cBot);
      tmp.lerp(cMid, t > 0.6 ? (1 - t) * 1.4 : 0);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    cliffGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cliffGeo.computeVertexNormals();
    const cliff = mesh(cliffGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    cliff.position.set(0, -11, zc);
    this.scene.add(cliff);

    const tip = cone(11, 10, this.theme.colors.rock, 7);
    tip.rotation.x = Math.PI;
    tip.position.set(0, -23, zc);
    tip.scale.x = this.W / D;
    this.scene.add(tip);

    // surface boulders instead of floating shards — the land is continuous now
    this.shards = [];
    for (let i = 0; i < 5; i++) {
      const rockM = mesh(new THREE.DodecahedronGeometry(1.2 + Math.random() * 1.4, 0), mat(P.rock));
      const a = (i / 5) * Math.PI * 2 + 0.7;
      rockM.position.set(Math.cos(a) * (this.W / 2 + 10 + Math.random() * 14), -1.2, zc + Math.sin(a) * (D / 2 + 9 + Math.random() * 10));
      rockM.rotation.set(Math.random(), Math.random() * 3, Math.random());
      this.scene.add(rockM);
    }
  }

  _buildWindmill() {
    const g = new THREE.Group();
    const golden = this.tier >= 3;
    const base = cyl(3.4, 3.9, 2.6, 0xb3a894, 9);
    base.position.y = 1.3;
    g.add(base);
    const tower = cyl(2.0, 3.1, 11, P.plaster, 9);
    tower.position.y = 8;
    g.add(tower);
    for (const y of [5.2, 9.4]) {
      const band = mesh(new THREE.TorusGeometry(2.05 + (9.4 - y) * 0.11 + 0.68, 0.14, 5, 12), mat(P.wood));
      band.position.y = y;
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
    const door = box(1.5, 2.5, 0.35, P.woodDark);
    door.position.set(0, 3.9, 3.15);
    g.add(door);
    const win = box(1.0, 1.2, 0.3, 0x30414f);
    win.position.set(0, 9.3, 2.35);
    g.add(win);
    const cap = mesh(new THREE.SphereGeometry(2.35, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(golden ? P.gold : P.capRed, golden ? { metalness: 0.45, roughness: 0.35 } : {}));
    cap.position.y = 13.4;
    g.add(cap);
    const finial = ball(0.3, golden ? P.gold : P.woodDark);
    finial.position.y = 15.6;
    g.add(finial);
    if (golden) {
      const flag = leafMesh(1.6, 0.5, 0xd8302a);
      flag.position.set(0.1, 16.2, 0);
      flag.rotation.z = -Math.PI / 2;
      g.add(flag);
    }
    this.blades = new THREE.Group();
    this.blades.add(ball(0.65, P.woodDark, 1, 8));
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      const spar = box(0.26, 8.6, 0.26, P.wood);
      spar.position.y = 4.3;
      arm.add(spar);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 6.4), new THREE.MeshStandardMaterial({
        color: 0xf7efdd, roughness: 0.85, side: THREE.DoubleSide, flatShading: true,
      }));
      sail.castShadow = true;
      sail.position.set(1.0, 4.9, 0);
      sail.rotation.y = 0.22;
      arm.add(sail);
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const slat = box(1.75, 0.12, 0.1, P.woodLight);
        slat.position.set(1.0, 2.4 + sIdx * 1.55, 0.06);
        slat.rotation.y = 0.22;
        arm.add(slat);
      }
      arm.rotation.z = (i / 4) * Math.PI * 2;
      this.blades.add(arm);
    }
    this.blades.position.set(0, 12.6, 3.1);
    this.blades.rotation.x = -0.1;
    g.add(this.blades);

    g.position.set(-this.W / 2 + 9.5, 0, this.fence.zBack + 9);
    g.rotation.y = typeof this.windmillRot === 'number' ? this.windmillRot : 0.5;
    this.scene.add(g);
    this.windmillPos = g.position.clone();
    this.windmillGroup = g;
    // clickable so it can be rotated like any other structure
    this.windmillHit = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.2, 16, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.windmillHit.position.set(g.position.x, 8, g.position.z);
    this.scene.add(this.windmillHit);
  }

  setWindmillRot(rot) {
    if (this.windmillGroup) this.windmillGroup.rotation.y = rot;
    this.windmillRot = rot;
  }

  _buildFence() {
    const { x: fx, zFront: fzF, zBack: fzB } = this.fence;
    const GATE_HALF = 3.5;
    // fence runs — the front side leaves a gap where the gate stands (x = 0,
    // right where the approach path meets the farm)
    const runs = [
      [[-fx, fzB], [fx, fzB]],
      [[fx, fzB], [fx, fzF]],
      [[fx, fzF], [GATE_HALF, fzF]],
      [[-GATE_HALF, fzF], [-fx, fzF]],
      [[-fx, fzF], [-fx, fzB]],
    ];
    this.fenceGroup = new THREE.Group();
    this.scene.add(this.fenceGroup);
    this.fencePosts = []; // { post, cap, baseRotZ } — tilted/knocked as it weathers
    this.fenceRails = []; // { rail, baseY }
    this.fenceHits = [];  // invisible click zones for repair
    for (const [[ax, az], [bx, bz]] of runs) {
      const segs = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 8));
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const post = cyl(0.24, 0.3, 2.7, Math.random() > 0.5 ? P.wood : P.woodLight, 6);
        post.position.set(ax + (bx - ax) * t, 1.15, az + (bz - az) * t);
        const baseRotZ = (Math.random() - 0.5) * 0.08;
        post.rotation.z = baseRotZ;
        this.fenceGroup.add(post);
        const cap = ball(0.26, P.woodDark, 0.6, 6);
        cap.position.set(post.position.x, 2.55, post.position.z);
        this.fenceGroup.add(cap);
        this.fencePosts.push({ post, cap, baseRotZ, jitter: Math.random() });
      }
      for (const y of [1.9, 1.0]) {
        const len = Math.hypot(bx - ax, bz - az);
        const rail = box(len, 0.22, 0.22, y > 1.5 ? P.woodLight : P.wood);
        rail.position.set((ax + bx) / 2, y, (az + bz) / 2);
        rail.rotation.y = -Math.atan2(bz - az, bx - ax);
        this.fenceGroup.add(rail);
        this.fenceRails.push({ rail, baseY: y });
      }
      // an invisible click-zone along this run so the player can repair the fence
      const midx = (ax + bx) / 2, midz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 3.2, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(midx, 1.4, midz);
      hit.rotation.y = -Math.atan2(bz - az, bx - ax);
      hit.userData.fence = true;
      this.scene.add(hit);
      this.fenceHits.push(hit);
    }
    this._buildGate(0, fzF, GATE_HALF);
    this._applyFenceDamage(); // reflect the current HP on the freshly-built fence
  }

  // reflect fence HP on the posts/rails: sound at full, sagging & tilted as it
  // weathers, knocked-over gaps when broken (HP 0)
  _applyFenceDamage() {
    const hp = this.fenceHP == null ? 100 : this.fenceHP;
    const wear = 1 - hp / 100; // 0 fresh → 1 broken
    if (this.fencePosts) {
      for (const fp of this.fencePosts) {
        const lean = wear * (0.12 + fp.jitter * 0.5);
        const broken = hp <= 0 && fp.jitter > 0.55; // some posts fall over when broken
        fp.post.rotation.z = fp.baseRotZ + (broken ? (fp.jitter > 0.8 ? 1.3 : lean) : lean);
        fp.post.position.y = broken ? 0.5 : 1.15;
        fp.cap.visible = !broken;
        const col = wear > 0.5 ? 0x6a5535 : null; // greying as it weathers
        if (col && fp.post.material.color) fp.post.material.color.setHex(col);
      }
    }
    if (this.fenceRails) {
      for (const fr of this.fenceRails) {
        fr.rail.position.y = fr.baseY - wear * 0.25;
        fr.rail.rotation.z = (hp <= 0 ? (fr.baseY > 1.5 ? 0.18 : -0.12) : wear * 0.05);
        fr.rail.visible = !(hp <= 0 && fr.baseY < 1.5); // lower rails drop off when broken
      }
    }
  }

  get fenceBroken() { return (this.fenceHP == null ? 100 : this.fenceHP) <= 0; }

  // repair the whole perimeter back to full
  repairFence() {
    this.fenceHP = 100;
    this._applyFenceDamage();
  }

  // knock the fence down a bit (bear stomp, or just call for weathering)
  damageFence(amount) {
    this.fenceHP = Math.max(0, (this.fenceHP == null ? 100 : this.fenceHP) - amount);
    this._applyFenceDamage();
  }

  // ---- environment: pull the current season/temperature from game (or a debug
  // override) into scene-side fields the render loop and other systems read ----
  _updateSeason() {
    if (this.forceSeason) {
      this.season = this.forceSeason;
      this.temperature = baseTempFor(this.forceSeason);
      this.seasonPhase = 0.6; // forced season sits mid-way (so fall shows full colour)
      return;
    }
    if (this._getSeason) {
      try {
        const s = this._getSeason();
        if (s && s.id) { this.season = s.id; this.temperature = s.temperature ?? this.temperature; this.seasonPhase = s.phase ?? this.seasonPhase; }
      } catch { /* keep last known */ }
    }
  }

  // recolour tagged foliage seasonally: deciduous turns autumn in fall, and any
  // tagged canopy (incl. conifers) takes a randomized snow dusting in winter.
  _applyFoliageSeason(now) {
    if (now - (this._foliageCheck || 0) < 1500) return;
    this._foliageCheck = now;
    const fall = this.season === 'fall', winter = this.season === 'winter';
    const af = fall ? Math.min(1, 0.3 + (this.seasonPhase || 0) * 1.1) : 0;              // autumn factor
    const sf = winter ? Math.min(1, 0.45 + (this.seasonPhase || 0) * 1.0) : (fall && (this.seasonPhase || 0) > 0.85 ? 0.2 : 0); // snow factor
    const key = af.toFixed(2) + '|' + sf.toFixed(2);
    if (key === this._foliageKey) return; // nothing changed since last pass
    this._foliageKey = key;
    const c = this._folC || (this._folC = new THREE.Color());
    const c2 = this._folC2 || (this._folC2 = new THREE.Color());
    const snow = this._folSnow || (this._folSnow = new THREE.Color(0xe8eef4));
    const gold = this._folGold || (this._folGold = new THREE.Color(0xb39a4a)); // autumn grass
    const ice = this._folIce || (this._folIce = new THREE.Color(0xd6e8f0)); // frozen water
    const gc = this._folGC || (this._folGC = new THREE.Color());
    this.scene.traverse((o) => {
      if (o.userData.fallOnly) { o.visible = fall; return; } // seasonal decor (leaf piles, pumpkins)
      if (!o.isMesh || !o.material || !o.material.color) return;
      // open water freezes over in winter — the whole lake, not just the fishing hole.
      // the ripple texture would keep it reading as liquid, so drop the map and paint
      // it a solid pale ice; restore the map (and blue) once winter passes.
      if (o.userData.water != null) {
        if (winter) {
          if (o.userData._wmap === undefined) o.userData._wmap = o.material.map || null;
          if (o.material.map) { o.material.map = null; o.material.needsUpdate = true; }
          gc.setHex(o.userData.water).lerp(ice, Math.min(1, 0.6 + sf * 0.6));
          o.material.color.copy(gc);
        } else {
          if (o.userData._wmap) { o.material.map = o.userData._wmap; o.material.needsUpdate = true; }
          o.userData._wmap = undefined;
          o.material.color.setHex(o.userData.water);
        }
        return;
      }
      // ground: grass goes golden in fall, whitens across the whole zone in winter
      if (o.userData.ground != null) {
        gc.setHex(o.userData.ground);
        if (af > 0) gc.lerp(gold, af * 0.6);
        if (sf > 0) gc.lerp(snow, sf * 0.82);
        o.material.color.copy(gc);
        return;
      }
      if (o.userData.foliage == null) return;
      c.setHex(o.userData.foliage);
      if (af > 0 && o.userData.autumnCol != null) c.lerp(c2.setHex(o.userData.autumnCol), af);
      if (sf > 0) c.lerp(snow, (o.userData.snowAmt ?? 0.5) * sf);
      o.material.color.copy(c);
    });
  }

  // ---- weather + wind: tick the machine, drive particles + scene dimming ----
  _updateWeather(now) {
    if (!this._weatherM) this._weatherM = new WeatherMachine();
    this._weatherM.setSeason(this.season);
    if (this.forceWeather) this._weatherM.state = this.forceWeather; // debug override
    this._weatherM.tick(now, this.temperature);
    this.weather = { state: this._weatherM.state, intensity: this._weatherM.intensity, precip: this._weatherM.precip };
    this.wind = this._weatherM.wind;
    // weather dims the (already-set) daytime light on top of the season
    const wi = this.weather.intensity;
    if (wi > 0.02) {
      this.sunLight.intensity *= (1 - 0.5 * wi);
      this.hemi.intensity *= (1 - 0.22 * wi);
    }
    this._updatePrecip(now, wi);
    this._updateSnow(now);
    this._updateIce(now);
    this._applyFoliageSeason(now);
    // rain accelerates structural weathering; winter slows plant growth/encroach
    this.decayRate.weather = 1 + (this.weather.precip === 'rain' ? this.weather.intensity : 0) * 1.6;
    this.decayRate.growth = this.temperature <= 0 ? 0.15 : this.temperature < 8 ? 0.7 : 1.2;
  }

  // ---- buildings slowly weather (like the fence): they dull and grime over
  // time — faster in the rain — until you repair them ----
  _updateWeathering(now) {
    if (now - (this._wearCheck || 0) < 2000) return;
    const dt = (now - (this._wearCheck || now)) / 1000; this._wearCheck = now;
    for (const rec of this.placed.values()) {
      if (!/barn|silo|coop|shed|hut|house|stable|windmill|cabin|workshop|mill|kitchen|smokehouse|bakery|creamery/i.test(rec.type || '')) continue;
      rec.wear = Math.min(1, (rec.wear || 0) + dt * 0.0016 * this.decayRate.weather); // ~10 min to look shabby
      this._applyBuildingWear(rec);
    }
  }

  _applyBuildingWear(rec) {
    const wear = rec.wear || 0;
    rec.group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      if (o.material._col0 == null) o.material._col0 = o.material.color.getHex();
      const c = o.material._colScratch || (o.material._colScratch = new THREE.Color());
      c.setHex(o.material._col0).lerp(this._grimeC || (this._grimeC = new THREE.Color(0x6a5f4c)), wear * 0.5);
      o.material.color.copy(c);
    });
  }

  repairBuilding(id) {
    const rec = this.placed.get(id);
    if (!rec) return;
    rec.wear = 0;
    rec.group.traverse((o) => { if (o.isMesh && o.material && o.material._col0 != null) o.material.color.setHex(o.material._col0); });
  }

  buildingWear(id) { return this.placed.get(id)?.wear || 0; }

  // a camera-anchored point cloud of rain streaks / snow flakes, recycled
  _buildPrecipFx() {
    const N = 700;
    const pos = new Float32Array(N * 3);
    this._precipH = 58; // box height (local y 0..H, falls downward)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 95;
      pos[i * 3 + 1] = Math.random() * this._precipH;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 95;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTexture('255,255,255'), size: 0.9, transparent: true, opacity: 0,
      depthWrite: false, sizeAttenuation: true, fog: false,
    });
    this._precipPts = new THREE.Points(geo, mat);
    this._precipPts.frustumCulled = false;
    this._precipPts.renderOrder = 5;
    this.scene.add(this._precipPts);
  }

  _updatePrecip(now, wi) {
    const kind = this.weather?.precip;
    if (!this._precipPts) {
      if (!kind || wi < 0.03) return; // nothing to show yet — build lazily on first precip
      this._buildPrecipFx();
    }
    const pts = this._precipPts;
    const active = kind && wi > 0.03;
    pts.visible = active;
    if (!active) { pts.material.opacity = 0; return; }
    const snow = kind === 'snow';
    const cam = this.camera.position;
    pts.position.set(cam.x, 0, cam.z);
    const arr = pts.geometry.attributes.position.array;
    const H = this._precipH;
    const dt = Math.min(0.05, (now - (this._precipNow || now)) / 1000);
    this._precipNow = now;
    const fall = (snow ? 6 : 34) * dt;
    const w = this.wind || { dir: 0, strength: 0.3 };
    const drift = (snow ? 5 : 9) * w.strength * dt;
    const wx = Math.cos(w.dir) * drift, wz = Math.sin(w.dir) * drift;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= fall;
      arr[i] += wx + (snow ? Math.sin(now * 0.001 + i) * 0.04 : 0);
      arr[i + 2] += wz;
      if (arr[i + 1] < -6) { // recycle to the top, re-scattered around the camera
        arr[i + 1] = H;
        arr[i] = (Math.random() - 0.5) * 95;
        arr[i + 2] = (Math.random() - 0.5) * 95;
      }
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.material.size = snow ? 1.25 : 0.6;
    pts.material.color.setHex(snow ? 0xffffff : 0xbcd6ea);
    pts.material.opacity = Math.min(0.9, wi * (snow ? 0.9 : 0.75));
  }

  // a thin white sheet over the farm grass that builds up in the cold and melts
  _buildSnowFx() {
    const w = this.W || 40, d = (this.zFront - this.zBack) || 40;
    const zc = (this.zFront + this.zBack) / 2;
    const geo = new THREE.PlaneGeometry(w * 1.04, d * 1.04);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf3f7ff, roughness: 0.96, metalness: 0, transparent: true, opacity: 0, depthWrite: false });
    this._snowMesh = new THREE.Mesh(geo, mat);
    this._snowMesh.rotation.x = -Math.PI / 2;
    this._snowMesh.position.set(0, 0.08, zc);
    this._snowMesh.receiveShadow = true;
    this._snowMesh.renderOrder = 2;
    this.scene.add(this._snowMesh);
  }

  _updateSnow(now) {
    const dt = Math.min(0.1, (now - (this._snowNow || now)) / 1000); this._snowNow = now;
    const cold = this.temperature <= 0.8;
    const snowing = this.weather?.precip === 'snow';
    const target = cold ? (snowing ? 1 : 0.6) : 0; // a base cover in the cold, deeper while snowing
    const cur = this._snowDepth || 0;
    const rate = target > cur ? 0.09 : 0.16; // melts a bit faster than it builds
    this._snowDepth = cur + (target - cur) * Math.min(1, rate * dt * 4);
    if (this._snowDepth < 0.01) { if (this._snowMesh) this._snowMesh.visible = false; return; }
    if (!this._snowMesh) this._buildSnowFx();
    this._snowMesh.visible = true;
    this._snowMesh.material.opacity = Math.min(0.88, this._snowDepth);
  }

  // ---- winter ice over the fishing water: freeze, chop a hole, fish through it ----
  _buildIceFx() {
    const wz = this.deerWaterZone; if (!wz) return;
    const geo = new THREE.CircleGeometry((wz.waterR || 20) + 2, 40);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdcecf6, roughness: 0.32, metalness: 0.12, transparent: true, opacity: 0, depthWrite: false });
    this._iceMesh = new THREE.Mesh(geo, mat);
    this._iceMesh.rotation.x = -Math.PI / 2;
    this._iceMesh.position.set(wz.x, (this.dockWaterY ?? -1.8) + 0.07, wz.z);
    this._iceMesh.renderOrder = 3;
    this.scene.add(this._iceMesh);
    const hmat = new THREE.MeshBasicMaterial({ color: 0x17404e, transparent: true, opacity: 0.92, depthWrite: false });
    this._iceHoleMesh = new THREE.Mesh(new THREE.CircleGeometry(1.7, 18), hmat);
    this._iceHoleMesh.rotation.x = -Math.PI / 2;
    this._iceHoleMesh.visible = false;
    this._iceHoleMesh.renderOrder = 4;
    this.scene.add(this._iceHoleMesh);
  }

  _updateIce(now) {
    const wz = this.deerWaterZone; if (!wz) return;
    const dt = Math.min(0.1, (now - (this._iceNow || now)) / 1000); this._iceNow = now;
    const target = this.temperature <= 0 ? 1 : 0;
    const cur = this._iceFreeze || 0;
    this._iceFreeze = cur + (target - cur) * Math.min(1, (target > cur ? 0.06 : 0.1) * dt * 4);
    if (this._iceFreeze < 0.02) {
      if (this._iceMesh) this._iceMesh.visible = false;
      if (this._iceHoleMesh) this._iceHoleMesh.visible = false;
      this._iceHole = false; this._iceChop = 0; return;
    }
    if (!this._iceMesh) this._buildIceFx();
    this._iceMesh.visible = true;
    this._iceMesh.material.opacity = Math.min(0.92, this._iceFreeze);
    if (this._iceFreeze < 0.55) { this._iceHole = false; this._iceChop = 0; } // thaws → hole refreezes
    if (this._iceHoleMesh) this._iceHoleMesh.visible = !!this._iceHole;
  }

  iceState() {
    return { frozen: (this._iceFreeze || 0) >= 0.55, hole: !!this._iceHole };
  }

  // a pet reacts to being petted/played with — a burst of tail-wag + a hop
  petReact(id, kind) {
    const ar = this.animalRecs.get(id);
    if (ar) ar.state.react = { until: (this._lastNow || performance.now()) + 1500, kind };
  }

  // send a bonded pet toward where the camera is looking (the avatar-free "come here")
  callPet(id) {
    const ar = this.animalRecs.get(id);
    if (!ar) return;
    const t = this.controls.target;
    ar.state.mode = 'wander'; ar.state.tx = t.x; ar.state.tz = t.z; ar.state.until = (this._lastNow || performance.now()) + 20000; ar.state.react = null;
  }

  // toggle a trained dog's herding behavior
  setHerder(id, on) {
    if (!this._herders) this._herders = new Set();
    if (on) this._herders.add(id); else this._herders.delete(id);
  }

  _nearestPenFor(x, z) {
    let best = null, bd = 1e9;
    for (const rec of this.placed.values()) {
      if (!rec.group?.userData?.pen) continue;
      const d = (rec.x - x) ** 2 + (rec.z - z) ** 2;
      if (d < bd) { bd = d; best = { x: rec.x, z: rec.z, id: rec.id }; }
    }
    return best;
  }

  // a herding dog steers the nearest loose animal toward a pen (benevolent predator)
  _updateHerders(now) {
    if (!this._herders || !this._herders.size) return;
    for (const id of [...this._herders]) {
      const dog = this.animalRecs.get(id);
      if (!dog) { this._herders.delete(id); continue; }
      const dp = dog.group.position;
      let target = null, bd = 1e9;
      for (const [aid, ar] of this.animalRecs) {
        if (aid === id || ar.bounds || ar.type === 'dog' || ar.type === 'cat') continue;
        const d = (ar.group.position.x - dp.x) ** 2 + (ar.group.position.z - dp.z) ** 2;
        if (d < bd) { bd = d; target = ar; }
      }
      if (!target) { dog.state.until = Math.min(dog.state.until, now + 500); continue; } // nothing loose → idle
      const ax = target.group.position.x, az = target.group.position.z;
      const pen = this._nearestPenFor(ax, az);
      if (!pen) continue;
      const toPen = Math.atan2(pen.z - az, pen.x - ax);
      const flankX = ax - Math.cos(toPen) * 3.2, flankZ = az - Math.sin(toPen) * 3.2;
      dog.state.mode = 'wander'; dog.state.tx = flankX; dog.state.tz = flankZ; dog.state.until = now + 4000;
      if (Math.hypot(dp.x - flankX, dp.z - flankZ) < 3.6) { // dog is behind it → drive toward the pen
        target.state.mode = 'wander'; target.state.tx = pen.x; target.state.tz = pen.z; target.state.until = now + 3000;
      }
    }
  }

  // is there a (guard) dog near this world point? predators flee dogs
  _dogNear(px, pz, r = 14) {
    for (const ar of this.animalRecs.values()) {
      if (ar.type !== 'dog') continue;
      const g = ar.group.position;
      if ((g.x - px) ** 2 + (g.z - pz) ** 2 < r * r) return true;
    }
    return false;
  }

  // windbreaks register lee zones that calm the wind for shelter/power/heating
  setShelters(zones) { this._shelters = Array.isArray(zones) ? zones : []; }

  // effective wind strength at a world point, reduced inside windbreak shelter
  windAt(x, z) {
    let s = this.wind?.strength ?? 0.3;
    for (const sh of this._shelters) {
      const dx = x - sh.x, dz = z - sh.z;
      if (dx * dx + dz * dz < sh.r * sh.r) s *= sh.reduction;
    }
    return s;
  }

  // chop a fishing hole through the ice — call repeatedly; returns {done,hits,need}
  chopIce() {
    const st = this.iceState();
    if (!st.frozen || st.hole) return { done: true, hits: 0, need: 0 };
    this._iceChop = (this._iceChop || 0) + 1;
    const need = 4;
    const hx = this.castFrom ? this.castFrom.x : this.deerWaterZone.x;
    const hz = this.castFrom ? this.castFrom.z : this.deerWaterZone.z;
    if (this._iceHoleMesh) this._iceHoleMesh.position.set(hx, (this.dockWaterY ?? -1.8) + 0.09, hz);
    if (this._iceChop >= need) {
      this._iceHole = true;
      if (this._iceHoleMesh) this._iceHoleMesh.visible = true;
      return { done: true, hits: this._iceChop, need };
    }
    return { done: false, hits: this._iceChop, need };
  }

  // ---- predators: foxes (day) & wolves (night) hunt un-penned animals --------
  _spawnPredator(type) {
    const model = buildPredator(type);
    model.scale.setScalar(type === 'wolf' ? 1.0 : 1.15);
    const zc = (this.zFront + this.zBack) / 2;
    const a = Math.random() * Math.PI * 2, rr = this.W * 0.96; // enter from the treeline
    model.position.set(Math.cos(a) * rr, 0, zc + Math.sin(a) * rr);
    model.userData.hunt = {
      type, cz: zc, speed: type === 'wolf' ? 6.0 : 4.4, killDist: 1.8,
      legs: model.userData.legs || [], head: model.userData.head, tail: model.userData.tail,
      state: 'prowl', heading: Math.random() * Math.PI * 2, until: 2500 + Math.random() * 3000,
      // foxes raid only occasionally; night wolves are hungrier
      t0: 0, ph: Math.random() * 10,
      nextHunt: (this._lastNow || performance.now()) + (type === 'wolf' ? 4000 + Math.random() * 6000 : 30000 + Math.random() * 45000),
      hp: 1, // one solid arrow drops a predator (they flee fast — a hit is earned)
    };
    // an invisible target column so the bow can shoot the predator
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.1;
    hit.userData.predator = model;
    model.add(hit);
    model.userData.hitMesh = hit;
    this.scene.add(model);
    this.predators.push(model);
    return model;
  }

  _removePredator(p) {
    this.scene.remove(p);
    const i = this.predators.indexOf(p);
    if (i >= 0) this.predators.splice(i, 1);
  }

  _nearestPrey(px, pz) {
    let best = null, bd = Infinity;
    for (const [id, ar] of this.animalRecs) {
      if (ar.bounds) continue; // safe inside a closed pen
      const g = ar.group;
      const dd = Math.hypot(g.position.x - px, g.position.z - pz);
      if (dd < bd) { bd = dd; best = { id, ar }; }
    }
    return best;
  }

  _killPrey(pred, id, ar) {
    const rec = this.placed.get(id);
    if (rec) { this.scene.remove(rec.group); if (rec.hit) this.scene.remove(rec.hit); this.placed.delete(id); }
    this.animalRecs.delete(id);
    this._spawnBlood(ar.group.position.x, ar.group.position.z, 0.5);
    try { this.onAnimalLost(id, ar.type, pred.userData.hunt.type); } catch {}
  }

  _updatePredators(now) {
    const night = this.dayFactor < 0.4;
    // a small pack of wolves prowls every night (whether or not there are animals
    // to hunt), then melts back into the trees at dawn
    if (night) {
      if (!this._nextWolf) this._nextWolf = now + 4000;
      const wolves = this.predators.reduce((n, p) => n + (p.userData.hunt.type === 'wolf' ? 1 : 0), 0);
      if (wolves < 2 && now >= this._nextWolf) {
        this._spawnPredator('wolf'); this._nextWolf = now + 10000 + Math.random() * 14000;
      }
    } else {
      this._nextWolf = 0;
      for (const p of [...this.predators]) if (p.userData.hunt.type === 'wolf') this._removePredator(p);
    }
    const dt = Math.min(0.05, (now - (this._predNow || now)) / 1000);
    this._predNow = now;
    for (const p of [...this.predators]) {
      const h = p.userData.hunt, gp = p.position;
      h.t0 += dt * 1000;
      // a dog on patrol nearby scares predators off — the farm's guardian
      if ((h.state === 'prowl' || h.state === 'stalk') && this._dogNear(gp.x, gp.z, 15)) {
        h.state = 'flee'; h.fleeUntil = now + 3600;
        h.nextHunt = now + 9000 + Math.random() * 10000;
        if (!h._barkedAt || now - h._barkedAt > 4000) { h._barkedAt = now; try { this.onAnimalSound && this.onAnimalSound('dog'); } catch {} }
      }
      if (h.state === 'prowl' && now >= h.nextHunt) {
        const prey = this._nearestPrey(gp.x, gp.z);
        if (prey) { h.state = 'stalk'; h.targetId = prey.id; } else h.nextHunt = now + 5000 + Math.random() * 8000;
      }
      if (h.state === 'stalk') {
        const ar = this.animalRecs.get(h.targetId);
        if (!ar || ar.bounds) { h.state = 'flee'; h.fleeUntil = now + 3500; }
        else {
          const tx = ar.group.position.x, tz = ar.group.position.z;
          h.heading = Math.atan2(tz - gp.z, tx - gp.x);
          if (Math.hypot(tx - gp.x, tz - gp.z) < h.killDist) {
            this._killPrey(p, h.targetId, ar);
            h.state = 'flee'; h.fleeUntil = now + 3200;
            h.nextHunt = now + (h.type === 'wolf' ? 12000 + Math.random() * 12000 : 60000 + Math.random() * 60000);
          }
        }
      } else if (h.state === 'flee') {
        if (now >= h.fleeUntil) {
          if (h.type === 'wolf') { this._removePredator(p); continue; }
          h.state = 'prowl'; h.nextHunt = now + 8000 + Math.random() * 12000;
        } else h.heading = Math.atan2(gp.z - h.cz, gp.x); // bolt outward to the trees
      } else { // prowl
        h.heading += (Math.random() - 0.5) * 0.08;
        if (h.t0 > h.until) { h.t0 = 0; h.until = 2500 + Math.random() * 3000; h.heading = Math.random() * Math.PI * 2; }
      }
      // leash: don't let a predator wander off to the horizon — turn it back
      const leash = this.W * 1.25;
      const dc = Math.hypot(gp.x, gp.z - h.cz);
      if (dc > leash && h.state !== 'stalk') {
        const inward = Math.atan2(h.cz - gp.z, -gp.x);
        let df = inward - h.heading; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
        h.heading += df * 0.15;
      }
      const spd = (h.state === 'stalk' || h.state === 'flee') ? h.speed : h.speed * 0.45;
      gp.x += Math.cos(h.heading) * spd * dt;
      gp.z += Math.sin(h.heading) * spd * dt;
      // predators can't walk on water — if a step lands in the pond, shove it back
      // to the shore and steer it along the bank instead of straight across
      const wz = this.deerWaterZone;
      if (wz) {
        const wdx = gp.x - wz.x, wdz = gp.z - wz.z;
        const wd = Math.hypot(wdx, wdz), shore = (wz.waterR || 20) + 2;
        if (wd < shore) {
          let nx = wdx / (wd || 1), nz = wdz / (wd || 1);
          if (wd < 0.001) { nx = 1; nz = 0; } // dead-center: eject along any outward ray
          gp.x = wz.x + nx * shore;
          gp.z = wz.z + nz * shore;
          h.heading = Math.atan2(nz, nx) + (h._bankSide || (h._bankSide = Math.random() < 0.5 ? 1 : -1)) * (Math.PI / 2);
        }
      }
      // wolves can't cross an INTACT fence — they prowl the perimeter until it
      // breaks. (Foxes are sneaky and slip through regardless.)
      if (h.type === 'wolf' && this.fence && !this.fenceBroken) {
        const f = this.fence, fx = f.x + 1, fzF = f.zFront + 1, fzB = f.zBack - 1;
        if (gp.x > -fx && gp.x < fx && gp.z > fzB && gp.z < fzF) {
          const dl = gp.x + fx, dr = fx - gp.x, db = gp.z - fzB, dtp = fzF - gp.z;
          const mn = Math.min(dl, dr, db, dtp);
          if (mn === dl) gp.x = -fx; else if (mn === dr) gp.x = fx;
          else if (mn === db) gp.z = fzB; else gp.z = fzF;
        }
      }
      p.rotation.y = Math.atan2(-Math.sin(h.heading), Math.cos(h.heading));
      const gait = h.state === 'prowl' ? 150 : 80;
      const swing = Math.sin(now / gait + h.ph) * (h.state === 'prowl' ? 0.4 : 0.75);
      if (h.legs[0]) h.legs[0].rotation.x = swing;
      if (h.legs[3]) h.legs[3].rotation.x = swing;
      if (h.legs[1]) h.legs[1].rotation.x = -swing;
      if (h.legs[2]) h.legs[2].rotation.x = -swing;
      if (h.tail) h.tail.rotation.z = Math.sin(now / 300 + h.ph) * 0.15;
    }
  }

  // the front gate: arched posts, a lantern, and two picket leaves that
  // swing inward when clicked
  _buildGate(x, z, half) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = cyl(0.3, 0.38, 3.6, P.woodDark, 7);
      post.position.set(s * half, 1.7, 0);
      g.add(post);
      const cap = ball(0.36, P.wood, 0.7, 6);
      cap.position.set(s * half, 3.55, 0);
      g.add(cap);
    }
    // gentle arch spanning the posts
    const N = 5;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const x0 = -half + t0 * half * 2, x1 = -half + t1 * half * 2;
      const y0 = 3.7 + Math.sin(t0 * Math.PI) * 0.85, y1 = 3.7 + Math.sin(t1 * Math.PI) * 0.85;
      const seg = box(Math.hypot(x1 - x0, y1 - y0) + 0.14, 0.26, 0.3, P.wood);
      seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      seg.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      g.add(seg);
    }
    // little plate hanging from the arch crown
    for (const dx of [-0.5, 0.5]) {
      const chain = cyl(0.03, 0.03, 0.45, 0x6f6a63, 4);
      chain.position.set(dx, 4.28, 0);
      g.add(chain);
    }
    const plate = box(1.7, 0.65, 0.12, P.woodLight);
    plate.position.set(0, 3.8, 0);
    g.add(plate);
    // warm lantern on the right post, flowers climbing the left
    const lamp = box(0.3, 0.44, 0.3, 0x3f3a33);
    lamp.position.set(half, 2.85, 0.42);
    g.add(lamp);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa53a, emissiveIntensity: 1.4, roughness: 0.5 })
    );
    flame.position.set(half, 2.85, 0.42);
    g.add(flame);
    this.gateFlame = flame;
    const petals = [0xe06a8a, 0xf7efdd, 0xf2c14e];
    for (let i = 0; i < 3; i++) {
      const fl = ball(0.15, petals[i], 1, 6);
      fl.position.set(-half + 0.15 * (i - 1), 2.3 + i * 0.4, 0.32);
      g.add(fl);
    }
    // the two swinging leaves, hinged at their posts
    const leaf = (side) => {
      const lg = new THREE.Group();
      const w = half - 0.45;
      for (const y of [0.7, 2.0]) {
        const rail = box(w, 0.18, 0.14, P.woodLight);
        rail.position.set(side * w / 2, y, 0);
        lg.add(rail);
      }
      for (let i = 0; i < 4; i++) {
        const px = side * (0.3 + (w - 0.6) * (i / 3));
        const pk = box(0.17, 2.15, 0.13, P.wood);
        pk.position.set(px, 1.32, 0);
        lg.add(pk);
      }
      const brace = box(Math.hypot(w, 1.3), 0.12, 0.1, P.woodDark);
      brace.position.set(side * w / 2, 1.35, 0.09);
      brace.rotation.z = side * Math.atan2(1.3, w);
      lg.add(brace);
      return lg;
    };
    this.gateLeafL = leaf(1);
    this.gateLeafL.position.set(-half + 0.08, 0, 0);
    this.gateLeafR = leaf(-1);
    this.gateLeafR.position.set(half - 0.08, 0, 0);
    g.add(this.gateLeafL, this.gateLeafR);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.gateGroup = g;
    this.gateOpen = false;
    this.gateAnim = null;
    this.gateHit = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2, 4.8, 2.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.gateHit.position.set(x, 2.3, z);
    this.scene.add(this.gateHit);
  }

  // a fresh render + immediate read works without preserveDrawingBuffer
  snapshotDataUrl() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.85);
  }

  toggleGate() {
    this.gateOpen = !this.gateOpen;
    this.gateAnim = { start: performance.now() };
    this.onGateToggle(this.gateOpen);
  }

  _buildBaseSign() {
    // position is reserved even when the sign is hidden so placement rules stay stable
    this.signPos = new THREE.Vector3(-this.W / 2 + 10, 0, this.zFront - 7.5);
    if (this.hideSign) return;
    const g = new THREE.Group();
    for (const dx of [-2.6, 2.6]) {
      const post = cyl(0.18, 0.22, 3.6, P.woodDark, 6);
      post.position.set(dx, 1.8, 0);
      g.add(post);
    }
    const boardMats = [
      mat(P.wood), mat(P.wood), mat(P.wood), mat(P.wood),
      new THREE.MeshStandardMaterial({ map: signTexture(this.signText.line1, this.signText.line2), roughness: 0.85, flatShading: true }),
      mat(P.wood),
    ];
    const board = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.9, 0.35), boardMats);
    board.castShadow = true;
    board.position.y = 3.1;
    g.add(board);
    this.signBoard = board;
    g.position.copy(this.signPos);
    g.rotation.y = 0.55;
    this.scene.add(g);
    this.signGroup = g;
    this.signHit = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.6, 6, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.signHit.position.set(this.signPos.x, 3, this.signPos.z);
    this.signHit.userData.baseSign = true;
    this.scene.add(this.signHit);
  }

  setBaseSignText(line1, line2) {
    if (!this.signBoard) return;
    this.signText = { line1, line2 };
    const faceMat = this.signBoard.material[4];
    faceMat.map?.dispose();
    faceMat.map = signTexture(line1, line2);
    faceMat.needsUpdate = true;
  }

  removeBaseSign() {
    this.hideSign = true;
    if (this.signGroup) { this.scene.remove(this.signGroup); this.signGroup = null; }
    if (this.signHit) { this.scene.remove(this.signHit); this.signHit = null; }
    this.signBoard = null;
    this.hoveredSign = false;
  }

  _buildFarmhouse() {
    // the farmhouse lives on the right side of the land and levels up with engagement
    this.farmhousePos = new THREE.Vector3(
      (this.gridHalfX + this.W / 2) / 2 + 2,
      0,
      this.gridHalfZ * 0.35
    );
    // player may have relocated it — honor the saved position
    if (this.houseOffset) this.farmhousePos.set(this.houseOffset.x, 0, this.houseOffset.z);
    this._spawnFarmhouse(this.farmhouseLevel);
    // the house itself is clickable (rotate it, later maybe enter it)
    this.houseHit = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 9, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.houseHit.position.set(this.farmhousePos.x, 4, this.farmhousePos.z);
    this.scene.add(this.houseHit);
  }

  // relocate the farmhouse (and its hit column) to a new ground spot — but keep
  // the whole house INSIDE the fenced farm; it can't be dragged out into the wild
  moveHouse(x, z) {
    const m = 7; // house half-footprint kept clear of the fence
    const f = this.fence;
    if (f) {
      x = Math.max(-f.x + m, Math.min(f.x - m, x));
      z = Math.max(f.zBack + m, Math.min(f.zFront - m, z));
    }
    this.farmhousePos.set(x, 0, z);
    if (this.farmhouseGroup) this.farmhouseGroup.position.copy(this.farmhousePos);
    if (this.houseHit) this.houseHit.position.set(x, 4, z);
    try { this._refreshChimney(); } catch {}
  }

  // arm "click the ground to place the house here" — resolved in the pointerup
  armHouseMove(onDone) {
    this.houseMoveArmed = typeof onDone === 'function' ? onDone : null;
    if (this.controls) { this.controls.enabled = false; this._wasAutoRotate = this.controls.autoRotate; this.controls.autoRotate = false; }
    if (this.renderer) this.renderer.domElement.style.cursor = 'move';
  }

  cancelHouseMove() {
    if (!this.houseMoveArmed) return;
    this.houseMoveArmed = null;
    if (this.controls) { this.controls.enabled = true; if (this._wasAutoRotate != null) this.controls.autoRotate = this._wasAutoRotate; }
    if (this.renderer) this.renderer.domElement.style.cursor = 'grab';
  }

  // ---------- path paving (pen-tool drag: dirt / cobblestone) ----------
  startPaving({ type, tileCost, coins, tileSize = 3, onUpdate, onCommit, onCancel }) {
    this.cancelPaving();
    this.paving = { type, tileCost, coins, tileSize, onUpdate, onCommit, onCancel, cells: new Map(), order: [], dragging: false, lastXZ: null };
    if (this.controls) { this.controls.enabled = false; this._wasAutoRotate = this.controls.autoRotate; this.controls.autoRotate = false; } // don't orbit/spin while paving
    if (this.renderer) this.renderer.domElement.style.cursor = 'crosshair';
    if (!this.pavingGroup) { this.pavingGroup = new THREE.Group(); this.scene.add(this.pavingGroup); }
  }

  cancelPaving() {
    if (this.controls) { this.controls.enabled = true; if (this._wasAutoRotate != null) this.controls.autoRotate = this._wasAutoRotate; }
    if (this.pavingGroup) this.pavingGroup.clear();
    if (this.renderer) this.renderer.domElement.style.cursor = 'grab';
    this.paving = null;
  }

  _pavePoint(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  _paveAddCell(x, z) {
    const p = this.paving, t = p.tileSize;
    const cx = Math.round(x / t) * t, cz = Math.round(z / t) * t;
    const key = cx + ',' + cz;
    const idx = p.order.indexOf(key);
    if (idx >= 0) {
      // retracing back over an earlier tile UNDOES everything drawn after it —
      // a flexible pen tool: reverse the drag to shorten the path mid-stroke
      if (idx < p.order.length - 1) {
        for (let i = p.order.length - 1; i > idx; i--) p.cells.delete(p.order[i]);
        p.order.length = idx + 1;
      }
      return;
    }
    // paths are object-aware: never lay a tile on a crop plot, a building, the
    // house/windmill/market/dock/sign, or any placed object (trees, decor…).
    // Erasing is exempt (it only touches existing path tiles).
    if (p.type !== 'erase' && this._paveBlocked(cx, cz)) return;
    p.cells.set(key, { x: cx, z: cz });
    p.order.push(key);
  }

  _paveBlocked(cx, cz) {
    const m = (this.paving ? this.paving.tileSize : 3) * 0.42; // half a path tile
    // crop plots (roughly square footprints)
    for (const plot of this.plots) {
      const pp = plot.group.position;
      if (Math.abs(cx - pp.x) < 3.9 + m && Math.abs(cz - pp.z) < 3.9 + m) return true;
    }
    // every placed object: trees, animals, buildings, signs, decor, processors…
    for (const rec of this.placed.values()) {
      if (Math.hypot(cx - rec.x, cz - rec.z) < (this._radiusOf(rec.type) || 1.5) + m) return true;
    }
    // fixed structures
    const near = (pos, r) => pos && Math.hypot(cx - pos.x, cz - pos.z) < r + m;
    if (near(this.farmhousePos, 7)) return true;
    if (near(this.windmillPos, 5)) return true;
    if (near(this.marketPos, 4.5)) return true;
    if (near(this.dockPos, 5)) return true;
    if (near(this.signPos, 3)) return true;
    return false;
  }

  // extend the path from the last point to (x,z), filling every cell between so
  // fast drags don't leave gaps — this is the "pen tool" that bends any which way
  _paveTo(x, z) {
    const p = this.paving, t = p.tileSize;
    if (p.lastXZ) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x - p.lastXZ.x, z - p.lastXZ.z) / (t * 0.5)));
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        this._paveAddCell(p.lastXZ.x + (x - p.lastXZ.x) * u, p.lastXZ.z + (z - p.lastXZ.z) * u);
      }
    } else this._paveAddCell(x, z);
    p.lastXZ = { x, z };
    this._paveRefresh();
  }

  _paveRefresh() {
    const p = this.paving, t = p.tileSize;
    const affordable = p.tileCost > 0 ? Math.floor(p.coins / p.tileCost) : Infinity;
    this.pavingGroup.clear();
    const erase = p.type === 'erase';
    p.order.forEach((key, i) => {
      const c = p.cells.get(key);
      const ok = i < affordable;
      // high-contrast marker so it never blends into the grass: a dark outline
      // quad under a bright fill (green = affordable, red = not, orange = erase)
      const fill = erase ? 0xff8a2a : ok ? 0x39e04b : 0xff2f2f;
      const border = new THREE.Mesh(
        new THREE.PlaneGeometry(t * 0.98, t * 0.98),
        new THREE.MeshBasicMaterial({ color: 0x14240f, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })
      );
      border.renderOrder = 899; border.rotation.x = -Math.PI / 2; border.position.set(c.x, 0.15, c.z);
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(t * 0.78, t * 0.78),
        new THREE.MeshBasicMaterial({ color: fill, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })
      );
      tile.renderOrder = 900; tile.rotation.x = -Math.PI / 2; tile.position.set(c.x, 0.17, c.z);
      this.pavingGroup.add(border);
      this.pavingGroup.add(tile);
    });
    if (p.onUpdate) p.onUpdate({ count: p.order.length, cost: p.order.length * p.tileCost, affordable: p.order.length <= affordable, erase });
  }

  _paveCommit() {
    const p = this.paving;
    if (!p) return;
    const affordable = Math.floor(p.coins / p.tileCost);
    const tiles = p.order.map((k) => p.cells.get(k));
    const okAll = tiles.length > 0 && tiles.length <= affordable;
    const onCommit = p.onCommit, onCancel = p.onCancel;
    this.cancelPaving();
    if (okAll) { if (onCommit) onCommit(tiles); }
    else if (onCancel) onCancel(tiles.length);
  }

  // build the real, permanent path tiles in the scene (also called on load)
  addPathTiles(tiles, type, tileSize = 3) {
    if (!this._pathsGroup) { this._pathsGroup = new THREE.Group(); this.scene.add(this._pathsGroup); }
    for (const c of tiles) this._pathsGroup.add(this._buildPathTile(type, tileSize, c.x, c.z));
  }

  // fade path tiles by their wear (washed-out earth) and drop the fully-gone ones
  applyPathWear(paths) {
    if (!this._pathsGroup) return;
    const wearMap = new Map();
    for (const p of paths) wearMap.set(Math.round(p.x) + ',' + Math.round(p.z), p.wear || 0);
    const gone = [];
    for (const tile of this._pathsGroup.children) {
      const w = wearMap.get(Math.round(tile.position.x) + ',' + Math.round(tile.position.z)) || 0;
      if (w >= 1) { gone.push(tile); continue; }
      if (w <= 0.02) continue;
      const op = 1 - w * 0.8;
      tile.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        o.material.transparent = true; o.material.depthWrite = false; o.material.opacity = op;
      });
    }
    for (const t of gone) this._pathsGroup.remove(t);
  }

  clearPaths() {
    if (this._pathsGroup) { this.scene.remove(this._pathsGroup); this._pathsGroup = null; }
  }

  _buildPathTile(type, t, x, z) {
    const g = new THREE.Group();
    if (type === 'stone') {
      // cobblestones: a sandy mortar base packed with rounded grey stones
      const base = box(t, 0.16, t, 0x9a917f);
      base.position.y = 0.08;
      g.add(base);
      const cols = [0x8f8b83, 0xa7a29a, 0x7d7a73, 0xb4afa6, 0x86827b];
      const per = 3;
      for (let a = 0; a < per; a++) for (let b = 0; b < per; b++) {
        const jx = (a - (per - 1) / 2) * (t / per) + (((a * 7 + b * 13) % 5) - 2) * 0.06;
        const jz = (b - (per - 1) / 2) * (t / per) + (((a * 11 + b * 5) % 5) - 2) * 0.06;
        const cob = new THREE.Mesh(new THREE.DodecahedronGeometry(t / per * 0.46, 0), mat(cols[(a * per + b) % cols.length]));
        cob.scale.y = 0.5;
        cob.position.set(jx, 0.2, jz);
        cob.rotation.y = ((a * 13 + b * 7) % 6);
        g.add(cob);
      }
    } else {
      // dirt path: a flat packed-earth tile with a couple of darker patches
      const base = box(t, 0.14, t, 0xa07a4c);
      base.position.y = 0.07;
      g.add(base);
      for (let k = 0; k < 3; k++) {
        const patch = box(t * 0.3, 0.02, t * 0.3, k % 2 ? 0x8a6438 : 0xb0885a);
        patch.position.set((((k * 7) % 3) - 1) * t * 0.28, 0.15, (((k * 5) % 3) - 1) * t * 0.28);
        g.add(patch);
      }
    }
    g.position.set(x, 0, z);
    return g;
  }

  _spawnFarmhouse(level) {
    if (this.farmhouseGroup) this.scene.remove(this.farmhouseGroup);
    this.farmhouseLevel = level;
    const g = buildFarmhouse(level, this.houseStyle);
    g.position.copy(this.farmhousePos);
    g.rotation.y = this.houseRot ?? -0.6; // default: door angled toward the crops
    this.scene.add(g);
    this.farmhouseGroup = g;
    this._refreshChimney();
  }

  _refreshChimney() {
    const g = this.farmhouseGroup;
    this.chimneyWorld = null;
    if (g?.userData.chimneyTop) {
      const v = g.userData.chimneyTop.clone();
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
      v.add(g.position);
      this.chimneyWorld = v;
    }
  }

  setHouseRot(rot) {
    this.houseRot = rot;
    if (this.farmhouseGroup) {
      this.farmhouseGroup.rotation.y = rot;
      this._refreshChimney();
    }
  }

  setFarmhouseLevel(level) {
    if (level === this.farmhouseLevel) return;
    this._spawnFarmhouse(level);
    this.burstAtPosition(this.farmhousePos, true);
  }

  // apply a new cosmetic style to the house and rebuild it in place
  applyHouseCustomization(cfg) {
    this.houseStyle = cfg || {};
    this._spawnFarmhouse(this.farmhouseLevel);
  }

  _buildMarket() {
    // the market stand — every farm trades
    const g = new THREE.Group();
    for (const [dx, dz] of [[-2.2, -1.2], [2.2, -1.2], [-2.2, 1.2], [2.2, 1.2]]) {
      const post = cyl(0.14, 0.17, 3.2, P.woodDark, 6);
      post.position.set(dx, 1.6, dz);
      g.add(post);
    }
    // striped awning
    for (let i = 0; i < 6; i++) {
      const stripe = box(0.92, 0.12, 3.6, i % 2 ? 0xe8564a : 0xf7efdd);
      stripe.position.set(-2.3 + i * 0.92, 3.3 + (i % 2) * 0.02, 0);
      stripe.rotation.z = 0.08;
      g.add(stripe);
    }
    const counter = box(4.8, 1.1, 1.4, P.wood);
    counter.position.set(0, 0.55, 1.0);
    g.add(counter);
    const counterTop = box(5.1, 0.15, 1.7, P.woodLight);
    counterTop.position.set(0, 1.15, 1.0);
    g.add(counterTop);
    for (const [dx, good] of [[-1.4, 0xe8781e], [0, 0xd8302a], [1.4, 0xf5c518]]) {
      const crate = box(1.0, 0.55, 0.9, P.woodLight);
      crate.position.set(dx, 1.5, 1.0);
      g.add(crate);
      for (let i = 0; i < 3; i++) {
        const item = ball(0.18, good, 1, 6);
        item.position.set(dx - 0.25 + i * 0.25, 1.85, 1.0);
        g.add(item);
      }
    }
    // (the coin marker above the stand is the animated gold coin sprite added below)
    // the order pinboard leans beside the stand — real customers post requests here
    const board = new THREE.Group();
    for (const dx of [-1.1, 1.1]) {
      const leg = cyl(0.09, 0.12, 2.6, P.woodDark, 5);
      leg.position.set(dx, 1.3, 0);
      board.add(leg);
    }
    const panel = box(2.8, 1.8, 0.14, P.wood);
    panel.position.y = 2.1;
    board.add(panel);
    for (let i = 0; i < 3; i++) {
      const note = box(0.62, 0.5, 0.05, [0xfdf3d7, 0xf2d8e4, 0xd9ecd0][i]);
      note.position.set(-0.85 + i * 0.85, 2.15 + (i % 2) * 0.18, 0.1);
      note.rotation.z = (i - 1) * 0.1;
      board.add(note);
    }
    board.position.set(4.6, 0, 1.8);
    board.rotation.y = -0.35;
    g.add(board);

    this.marketPos = new THREE.Vector3(-(this.gridHalfX + this.W / 2) / 2 - 2, 0, this.gridHalfZ * 0.35);
    g.position.copy(this.marketPos);
    g.rotation.y = 0.7;
    this.scene.add(g);
    this.marketHit = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.marketHit.position.set(this.marketPos.x, 3, this.marketPos.z);
    this.scene.add(this.marketHit);

    // a golden coin hovering above the stand, bobbing + slowly spinning
    const coinTex = new THREE.TextureLoader().load('/ui/coin.png');
    coinTex.colorSpace = THREE.SRGBColorSpace;
    const coin = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex, transparent: true, depthWrite: false, depthTest: false }));
    coin.scale.setScalar(2.2);
    coin.position.set(this.marketPos.x, 5.6, this.marketPos.z);
    coin.renderOrder = 20; // draw last so winter ice/snow overlays never bleed over it
    this.scene.add(coin);
    this.marketCoin = { sprite: coin, baseY: 5.6 };
  }

  _buildDock() {
    this.dockGroup = buildDock();
    this.scene.add(this.dockGroup);
    this.dockHit = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 7, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.scene.add(this.dockHit);
    this.dockWaterY = -1.8;
    // default spot (themes with a lake/shore relocate it via setDockSpot)
    this._placeDock(-this.W / 2 + 1.5, -this.gridHalfZ * 0.4, Math.PI, -1.8);
  }

  _placeDock(x, z, facing, waterY, groundY = 0) {
    const g = this.dockGroup;
    this.dockPos = new THREE.Vector3(x, groundY, z);
    g.position.copy(this.dockPos);
    g.rotation.y = facing;
    const cast = (g.userData.castPoint || new THREE.Vector3(10.5, 0, 0)).clone();
    cast.applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(g.position);
    this.castFrom = new THREE.Vector3(cast.x, 1.6, cast.z);
    // rod tip in world space — the line hangs from here so it stays on the rod
    const tip = (g.userData.rodTip || new THREE.Vector3(11.05, 3.45, 0.3)).clone();
    tip.applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(g.position);
    this.rodTip = tip;
    this.dockWaterY = waterY;
    const mid = (g.userData.castPoint || new THREE.Vector3(10.5, 0, 0)).clone().multiplyScalar(0.5);
    mid.applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(g.position);
    this.dockHit.position.set(mid.x, 2, mid.z);

    // fish shadows — skinny, forward-swimming, spread across the whole lake
    if (this.fishShadows) for (const fs of this.fishShadows) this.scene.remove(fs.group);
    this.fishShadows = [];
    // roaming zone: a big disc out in the water, away from the dock/shore
    let wdx = cast.x - x, wdz = cast.z - z;
    const wdl = Math.hypot(wdx, wdz) || 1;
    wdx /= wdl; wdz /= wdl;
    const wcx = cast.x + wdx * 15, wcz = cast.z + wdz * 15;
    const zoneR = 22;
    // the open water: `r` is the disc deer steer clear of; `waterR` is the actual
    // fishable water radius (where a fish trap may be dropped)
    this.deerWaterZone = { x: wcx, z: wcz, r: zoneR + 6, waterR: zoneR };
    for (let i = 0; i < 7; i++) {
      const group = new THREE.Group();
      const smat = new THREE.MeshBasicMaterial({ color: 0x14324a, transparent: true, opacity: 0, depthWrite: false });
      const s = 0.6 + Math.random() * 1.0;
      // slim, elongated body — long in +x (nose), narrow across
      const body = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), smat);
      body.scale.set(s * 1.3, s * 0.26, 1);
      body.rotation.x = -Math.PI / 2;
      group.add(body);
      const tail = new THREE.Mesh(new THREE.CircleGeometry(0.3, 3), smat);
      tail.scale.set(s * 0.65, s * 0.42, 1);
      tail.rotation.x = -Math.PI / 2;
      tail.position.x = -1.15 * s;
      group.add(tail);
      const a0 = Math.random() * Math.PI * 2;
      const r0 = Math.sqrt(Math.random()) * zoneR;
      group.position.set(wcx + Math.cos(a0) * r0, waterY + 0.08, wcz + Math.sin(a0) * r0);
      this.scene.add(group);
      this.fishShadows.push({
        group, mat: smat,
        heading: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 1.4, // units/sec — always forward
        turn: (Math.random() - 0.5) * 0.02,
        cx: wcx, cz: wcz, zoneR,
        cyc: 12000 + Math.random() * 14000,
        ph: Math.random() * 20,
      });
    }

    // twinkling sun-glints on the water around the dock
    if (this.waterGlints) for (const s of this.waterGlints) this.scene.remove(s);
    this.waterGlints = [];
    for (let i = 0; i < 7; i++) {
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.blueTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      }));
      const a = Math.random() * Math.PI * 2;
      const rr = 4 + Math.random() * 9;
      glint.position.set(cast.x + Math.cos(a) * rr, waterY + 0.25, cast.z + Math.sin(a) * rr);
      glint.scale.setScalar(0.7 + Math.random() * 0.5);
      glint.userData.phase = Math.random() * 20;
      this.scene.add(glint);
      this.waterGlints.push(glint);
    }
  }

  _setIdleTackle(visible) {
    for (const o of this.dockGroup?.userData.idleTackle || []) o.visible = visible;
  }

  startFishing() {
    if (this.fishing) return false;
    const ice = this.iceState();
    if (ice.frozen && !ice.hole) return false; // must chop a hole through the ice first
    this.controls.autoRotate = false;
    this._setIdleTackle(false); // one bobber at a time
    try {
      this.fishing = new FishingSession({
        scene: this.scene,
        castFrom: this.castFrom,
        rodTip: this.rodTip,
        waterY: this.dockWaterY,
        themeId: this.theme.id,
        rng: Math.random,
        onState: () => {},
        onResult: (fish) => {
          this.fishing = null;
          this._setIdleTackle(true);
          this.onFishResult(fish);
        },
      });
      return true;
    } catch (err) {
      console.warn('fishing failed to start', err);
      this.fishing = null;
      return false;
    }
  }

  cancelFishing() {
    if (!this.fishing) return;
    try { this.fishing.dispose(); } catch {}
    this.fishing = null;
    this._setIdleTackle(true);
  }

  // ---- hunting: bow & arrow, hit odds fall off with camera distance --------
  setHuntMode(on, tier = 1) {
    this.huntMode = !!on;
    this.bowTier = on ? tier : 0;
    if (!on) { this.hoveredDeer = null; this.hoveredPredator = null; this.drawing = null; }
    if (this.controls && on) this.controls.autoRotate = false;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
    // the first-person bow is a real 3D model parented to the camera
    if (this.bowVM) { this.camera.remove(this.bowVM); this.bowVM = null; }
    if (on) {
      if (this.camera.parent !== this.scene) this.scene.add(this.camera); // so camera children render
      const vm = buildBowViewmodel(tier);
      // held on the LEFT of the view (opposite the crosshair area), mirrored so it
      // reads as a left-hand hold; the arrow still points forward toward center
      vm.scale.set(-0.7, 0.7, 0.7);
      vm.position.set(-0.42, -0.5, -1.5);
      vm.rotation.set(0.04, 0.22, -0.1);
      this.camera.add(vm);
      this.bowVM = vm;
      this._bowRestZ = vm.userData.arrow ? vm.userData.arrow.position.z : 0;
      this._bowFired = 0;
    }
  }

  _updateBowVM(now) {
    if (!this.bowVM || !this.bowVM.userData.arrow) return;
    const arrow = this.bowVM.userData.arrow;
    if (this.drawing) {
      const p = Math.min(1, (now - this.drawing.at) / this.drawing.dur);
      arrow.visible = true;
      arrow.position.z = this._bowRestZ + p * 0.4; // +Z = pulled back toward the archer
    } else if (this._bowFired && now - this._bowFired < 240) {
      arrow.visible = false; // the arrow has just left the bow
    } else {
      arrow.visible = true;
      arrow.position.z += (this._bowRestZ - arrow.position.z) * 0.4; // spring back to rest
    }
  }

  _deerDryPoint() {
    const zc = (this.zFront + this.zBack) / 2;
    const wz = this.deerWaterZone;
    let px = 0, pz = 0;
    for (let tries = 0; tries < 14; tries++) {
      const a = Math.random() * Math.PI * 2;
      const rr = this.W * (0.6 + Math.random() * 0.28);
      px = Math.cos(a) * rr; pz = zc + Math.sin(a) * rr;
      if (!wz || Math.hypot(px - wz.x, pz - wz.z) > wz.r + 4) break;
    }
    return { x: px, z: pz };
  }

  // click → nock & draw the bow (~0.5s), THEN loose. The draw is a real delay so
  // the shot isn't instant; _updateDraw() fires the actual shot when it completes.
  _tryShoot() {
    if (this.drawing) return; // already at full draw / mid-shot
    const pred = this.hoveredPredator; // predators take priority — they're the threat
    if (pred) {
      this.drawing = { target: pred, at: this._lastNow || performance.now(), dur: 500, isPredator: true };
      try { this.onBowState && this.onBowState('draw'); } catch {}
      return;
    }
    const deer = this.hoveredDeer;
    if (!deer || !deer.userData.roam) { this.onDeerResult({ hit: false, noTarget: true }); return; }
    const rm = deer.userData.roam;
    if (rm.state === 'dead' || rm.state === 'respawning' || rm.state === 'rage') return;
    this.drawing = { target: deer, at: this._lastNow || performance.now(), dur: 500 };
    try { this.onBowState && this.onBowState('draw'); } catch {}
  }

  _updateDraw(now) {
    if (!this.drawing) return;
    if (now - this.drawing.at >= this.drawing.dur) {
      const target = this.drawing.target;
      const isPred = this.drawing.isPredator;
      this.drawing = null;
      this._bowFired = now; // the 3D viewmodel arrow flies off briefly
      try { this.onBowState && this.onBowState('release'); } catch {}
      if (isPred) {
        if (target && target.userData.hunt && this.predators.includes(target)) this._resolvePredatorShot(target);
      } else if (target && target.userData.roam && target.visible
        && !['dead', 'respawning', 'rage'].includes(target.userData.roam.state)) {
        this._resolveShot(target);
      }
    }
  }

  _resolvePredatorShot(pred) {
    const h = pred.userData.hunt;
    const MAX_RANGE = 95, NEAR = 34;
    const tgt = pred.position.clone(); tgt.y += 1.0;
    const d = this.camera.position.distanceTo(tgt);
    const tooFar = d > MAX_RANGE;
    let hit = false;
    if (!tooFar) {
      const chance = Math.max(0.1, Math.min(0.95, 0.95 - Math.max(0, d - NEAR) / (MAX_RANGE - NEAR) * 0.85));
      hit = Math.random() < chance;
    }
    const from = this.camera.position.clone();
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    from.addScaledVector(fwd, 3).addScaledVector(down, 1.2);
    let land = tgt.clone();
    if (!hit) {
      if (tooFar) { land = from.clone().lerp(tgt, 0.6); land.y = 0.15; }
      else { land.x += (Math.random() - 0.5) * 3; land.z += (Math.random() - 0.5) * 3; land.y = 0.2; }
    }
    this._spawnArrow(from, land, () => {
      let killed = false;
      if (hit) {
        h.hp = (h.hp || 1) - 1;
        if (h.hp <= 0) { killed = true; this._spawnBlood(pred.position.x, pred.position.z, 0.5); this._removePredator(pred); }
        else { h.state = 'flee'; h.fleeUntil = (this._lastNow || performance.now()) + 3000; }
      } else {
        h.state = 'flee'; h.fleeUntil = (this._lastNow || performance.now()) + 3000;
      }
      this.onDeerResult({ hit, killed, tooFar, predator: h.type, distance: d });
    });
  }

  _resolveShot(deer) {
    const rm = deer.userData.roam;
    const q = QUARRY[rm.quarry] || QUARRY.deer;
    const MAX_RANGE = 95, NEAR = 34;
    const target = deer.position.clone(); target.y += (q.dangerous ? 1.4 : 1.0);
    const d = this.camera.position.distanceTo(target);
    const tooFar = d > MAX_RANGE;
    const tooWeak = (this.bowTier || 1) < (q.minTier || 1); // bear shrugs off a light bow
    let hit = false;
    if (!tooFar && !tooWeak) {
      const chance = Math.max(0.1, Math.min(0.95, 0.95 - Math.max(0, d - NEAR) / (MAX_RANGE - NEAR) * 0.85));
      hit = Math.random() < chance;
    }
    // arrow launches from just ahead of and below the camera
    const from = this.camera.position.clone();
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    from.addScaledVector(fwd, 3).addScaledVector(down, 1.2);
    // where the arrow lands: dead-on for a hit or a too-weak sting; short (too
    // far) or wide (ordinary miss) otherwise
    let land = target.clone();
    if (!hit) {
      if (tooWeak) { land = target.clone(); }
      else if (tooFar) { land = from.clone().lerp(target, 0.6); land.y = 0.15; }
      else { land.x += (Math.random() - 0.5) * 3.4; land.z += (Math.random() - 0.5) * 3.4; land.y = 0.2; }
    }
    const meatAmt = typeof q.yield === 'object' ? (q.yield[rm.variant] || 1) : q.yield;
    this._spawnArrow(from, land, () => {
      let killed = false, wounded = false;
      if (hit) {
        rm.hp = (rm.hp || 1) - 1; // deer take 2–3 arrows; this one may only wound
        if (rm.hp <= 0) { killed = true; this._killDeer(deer); }
        else { wounded = true; this._woundDeer(deer); }
      } else if (tooWeak && q.dangerous) {
        this._enrageBear(deer);
      } else {
        this._spookDeer(deer);
      }
      this.onDeerResult({
        hit, killed, wounded, tooFar, tooWeak, quarry: rm.quarry, variant: rm.variant,
        meatGood: q.meat, meat: killed ? meatAmt : 0, remaining: Math.max(0, rm.hp), hpMax: rm.hpMax, distance: d,
      });
    });
  }

  // a non-lethal hit: a splash of blood, then it bolts (or, for a bear, charges)
  _woundDeer(deer) {
    const rm = deer.userData.roam;
    const q = QUARRY[rm.quarry] || QUARRY.deer;
    this._spawnBlood(deer.position.x, deer.position.z, q.dangerous ? 0.7 : 0.45);
    if (q.dangerous) this._enrageBear(deer); else this._spookDeer(deer);
  }

  _spawnArrow(from, to, onDone) {
    let mesh;
    try {
      const g = new THREE.Group();
      const shaft = cyl(0.03, 0.03, 1.0, 0x6a4a2a, 5); shaft.rotation.z = Math.PI / 2; g.add(shaft);
      const tip = cone(0.06, 0.16, 0x9aa0a6, 5); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.58; g.add(tip);
      const fletch = box(0.02, 0.15, 0.15, 0xe6dfce); fletch.position.x = -0.48; g.add(fletch);
      mesh = g;
    } catch { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x6a4a2a })); }
    mesh.position.copy(from);
    this.scene.add(mesh);
    const dist = from.distanceTo(to);
    this.arrows.push({ mesh, from: from.clone(), to: to.clone(), start: this._lastNow || performance.now(), dur: Math.min(620, 170 + dist * 5), arc: Math.min(4, dist * 0.06), onDone, done: false });
  }

  _updateArrows(now) {
    if (!this.arrows || !this.arrows.length) return;
    const XAXIS = new THREE.Vector3(1, 0, 0);
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      const k = Math.min(1, (now - a.start) / a.dur);
      const p = a.from.clone().lerp(a.to, k); p.y += Math.sin(k * Math.PI) * a.arc;
      const k2 = Math.min(1, k + 0.04);
      const ahead = a.from.clone().lerp(a.to, k2); ahead.y += Math.sin(k2 * Math.PI) * a.arc;
      a.mesh.position.copy(p);
      const dir = ahead.sub(p);
      if (dir.lengthSq() > 1e-6) a.mesh.quaternion.setFromUnitVectors(XAXIS, dir.normalize());
      if (k >= 1 && !a.done) {
        a.done = true;
        this.scene.remove(a.mesh);
        try { a.onDone && a.onDone(); } catch {}
        this.arrows.splice(i, 1);
      }
    }
  }

  _killDeer(deer) {
    const rm = deer.userData.roam;
    const q = QUARRY[rm.quarry] || QUARRY.deer;
    const big = rm.quarry === 'deer' || rm.quarry === 'bear';
    rm.state = 'dead'; rm.t0 = 0;
    this._spawnBlood(deer.position.x, deer.position.z, rm.quarry === 'bear' ? 1.5 : big ? 1 : 0.55);
    try {
      const meat = buildMeat(big ? 'venison' : 'meat_cut');
      meat.scale.setScalar(rm.quarry === 'bear' ? 2.1 : rm.quarry === 'deer' ? 1.6 : 1.0);
      meat.position.set(deer.position.x, 1.0, deer.position.z);
      this.scene.add(meat);
      rm.meatFx = { mesh: meat, start: this._lastNow || performance.now(), dur: 1400 };
    } catch {}
  }

  _spookDeer(deer) {
    const rm = deer.userData.roam;
    if (rm.state === 'dead' || rm.state === 'respawning' || rm.state === 'rage') return;
    const q = QUARRY[rm.quarry] || QUARRY.deer;
    rm.state = 'flee';
    rm.fleeUntil = (this._lastNow || performance.now()) + 4500;
    rm.speed = q.base * q.flee; // sprint away — deer bolt hard, you have to chase
    rm.heading = Math.atan2(deer.position.z - this.camera.position.z, deer.position.x - this.camera.position.x);
  }

  // crossfade a GLB animal to a named animation clip
  _playClip(rm, name, speed = 1) {
    const a = rm.actions && rm.actions[name];
    if (!a) return;
    a.timeScale = speed;
    if (rm.clip === name) return;
    const prev = rm.clip && rm.actions[rm.clip];
    if (prev) prev.fadeOut(0.2);
    a.reset(); a.fadeIn(0.2).play();
    rm.clip = name;
  }

  // shot with too light a bow: the bear enrages and charges the farm for a bit
  _enrageBear(deer) {
    const rm = deer.userData.roam;
    rm.state = 'rage';
    rm.rageUntil = (this._lastNow || performance.now()) + 6500;
    rm.speed = QUARRY.bear.base * 3.6;
  }

  _spawnBlood(x, z, scl = 1) {
    try {
      const g = new THREE.Group();
      const mkDisc = (r, col, op) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; return m;
      };
      g.add(mkDisc(1.5, 0x7a1512, 0.92));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.4;
        const drop = mkDisc(0.26 + (k % 2) * 0.14, 0x8f1a15, 0.85);
        drop.position.set(Math.cos(a) * 1.45, 0.001, Math.sin(a) * 1.45);
        g.add(drop);
      }
      g.position.set(x, 0.04, z);
      g.scale.setScalar(0.1);
      g.traverse((o) => { if (o.material) o.material._op0 = o.material.opacity; });
      this.scene.add(g);
      this.bloodFx.push({ group: g, start: this._lastNow || performance.now(), grow: 500, hold: 1700, fade: 1300, max: scl });
    } catch {}
  }

  _updateBlood(now) {
    if (!this.bloodFx || !this.bloodFx.length) return;
    for (let i = this.bloodFx.length - 1; i >= 0; i--) {
      const b = this.bloodFx[i];
      const mx = b.max || 1;
      const t = now - b.start;
      if (t < b.grow) b.group.scale.setScalar(mx * (0.1 + 0.9 * (t / b.grow)));
      else if (t < b.grow + b.hold) b.group.scale.setScalar(mx);
      else if (t < b.grow + b.hold + b.fade) {
        const f = 1 - (t - b.grow - b.hold) / b.fade;
        b.group.traverse((o) => { if (o.material) o.material.opacity = (o.material._op0 || 0.9) * f; });
      } else {
        this.scene.remove(b.group);
        b.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.bloodFx.splice(i, 1);
      }
    }
  }

  collectProduct(id) {
    const rec = this.placed.get(id);
    if (!rec) return null;
    // finished craft job takes priority
    if (rec.jobReady) {
      const out = rec.jobReady;
      if (out.bubble) this.scene.remove(out.bubble);
      rec.jobReady = null;
      return { goodId: out.goodId, count: out.count };
    }
    const prod = rec.product;
    if (!prod || !prod.ready) return null;
    prod.ready = false;
    const mult = this.productionMultFor ? this.productionMultFor(rec.type) : 1;
    prod.startAt = performance.now();
    prod.nextAt = performance.now() + (120000 + Math.random() * 120000) / mult;
    if (prod.bubble) {
      this.scene.remove(prod.bubble);
      prod.bubble = null;
    }
    return { goodId: prod.goodId, count: 1 };
  }

  isProcessor(id) {
    const rec = this.placed.get(id);
    return !!rec && PROC_IDS.includes(rec.type);
  }

  setWorking(id, on, startedAt, timeMs) {
    const rec = this.placed.get(id);
    if (!rec) return;
    rec.working = on;
    if (on) { rec.jobStartedAt = startedAt || Date.now(); rec.jobTimeMs = timeMs || 0; }
    else { rec.jobStartedAt = null; rec.jobTimeMs = 0; }
  }

  setJobReady(id, goodId, count, icon) {
    const rec = this.placed.get(id);
    if (!rec || rec.jobReady) return;
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
      map: emojiTexture(icon || '📦'), transparent: true, depthWrite: false,
    }));
    bubble.scale.setScalar(2.4);
    bubble.position.set(rec.group.position.x, 7.5, rec.group.position.z);
    this.scene.add(bubble);
    rec.jobReady = { goodId, count, bubble };
    rec.working = false;
  }

  // ---- structure status: a progress bar while working, a gold glow when done ----
  // mirrors the crop plots (green bar) so every structure with a timer reads the
  // same way; the golden halo means "ready to collect" (job done / product ripe).
  _updateStructureStatus(rec, now) {
    let frac = null;   // 0..1 while working, null when idle
    let ready = false; // something to collect
    if (rec.construction && rec.buildUntil) {
      frac = Math.min(1, (Date.now() - rec.buildStart) / Math.max(1, rec.buildUntil - rec.buildStart));
    } else if (rec.working && rec.jobTimeMs) {
      frac = Math.min(1, (Date.now() - (rec.jobStartedAt || Date.now())) / rec.jobTimeMs);
    } else if (rec.product && !this.animalRecs.has(rec.id)) {
      // stationary producers (trees, hives) show a bar; wandering animals don't
      if (rec.product.ready) ready = true;
      else frac = Math.min(1, (now - rec.product.startAt) / Math.max(1, rec.product.nextAt - rec.product.startAt));
    }
    if (rec.jobReady) ready = true;
    if (frac != null && frac < 1) this._showStatusBar(rec, frac);
    else this._hideStatusBar(rec);
    if (ready) this._showReadyGlow(rec, now);
    else this._hideReadyGlow(rec);
  }

  _showStatusBar(rec, frac) {
    if (!rec.statusBar) {
      const w = 3.4, h = 0.52;
      const g = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.28, h + 0.28),
        new THREE.MeshBasicMaterial({ color: 0x2a1e11, transparent: true, opacity: 0.72, depthTest: false }));
      bg.renderOrder = 998;
      const fillGeo = new THREE.PlaneGeometry(w, h);
      fillGeo.translate(w / 2, 0, 0); // pivot on the left edge so it grows rightward
      const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x8bd450, depthTest: false }));
      fill.position.x = -w / 2; fill.position.z = 0.01; fill.renderOrder = 999;
      g.add(bg); g.add(fill);
      g.userData.fill = fill;
      this.scene.add(g);
      rec.statusBar = g;
    }
    const r = this._radiusOf(rec.type);
    const b = rec.statusBar;
    b.userData.fill.scale.x = Math.max(0.001, frac);
    b.userData.fill.material.color.setHex(rec.construction ? 0xe0a94a : 0x8bd450);
    b.position.set(rec.group.position.x, rec.group.position.y + Math.max(5.5, r * 2.3), rec.group.position.z);
    if (this.camera) b.quaternion.copy(this.camera.quaternion); // billboard toward the camera
  }

  _hideStatusBar(rec) {
    if (rec.statusBar) { this.scene.remove(rec.statusBar); rec.statusBar = null; }
  }

  _showReadyGlow(rec, now) {
    if (!rec.readyGlow) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.goldTex, color: 0xffd24a, transparent: true, opacity: 0.7,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      this.scene.add(s);
      rec.readyGlow = s;
    }
    const r = this._radiusOf(rec.type);
    rec.readyGlow.scale.setScalar(Math.max(6, r * 3.4));
    rec.readyGlow.position.set(rec.group.position.x, rec.group.position.y + Math.max(3, r * 1.3), rec.group.position.z);
    rec.readyGlow.material.opacity = 0.5 + 0.32 * (0.5 + 0.5 * Math.sin(now / 360));
  }

  _hideReadyGlow(rec) {
    if (rec.readyGlow) { this.scene.remove(rec.readyGlow); rec.readyGlow = null; }
  }

  _buildOuterZone() {
    if (!this.theme.buildOuterZone) return;
    const rng = mulberry32(4242);
    try {
      // continuous ground: the surrounding land meets the farm at grade —
      // the fence, not a cliff, is what bounds the farm
      this.theme.buildOuterZone({
        THREE,
        scene: this.scene,
        islandW: this.W,
        islandD: this.zFront - this.zBack,
        zCenter: (this.zFront + this.zBack) / 2,
        // themes with a flat inner zone sit flush with the farm; others keep a small step
        topY: this.theme.outerTopY ?? -1.6,
        clearRadius: 14 + this.tier * 10,
        addAnimated: (fn) => this.animatedFns.push(fn),
        setDockSpot: (x, z, facing, waterY, groundY) => this._placeDock(x, z, facing, waterY, groundY),
        rng,
      });
    } catch (err) {
      console.warn('outer zone failed', err);
    }
  }

  _buildThemeScenery() {
    const rng = mulberry32(1234 + this.tier);
    try {
      this.theme.buildScenery({
        THREE,
        scene: this.scene,
        islandW: this.W,
        zFront: this.zFront,
        zBack: this.zBack,
        fence: this.fence,
        scatterPoint: () => this._scatterPoint(rng, true),
        addAnimated: (fn) => this.animatedFns.push(fn),
        rng,
      });
    } catch (err) {
      console.warn('theme scenery failed', err);
    }
  }

  _scatterPoint(rand = Math.random, outerBand = false) {
    const fx = this.fence.x - 1.6;
    for (let tries = 0; tries < 40; tries++) {
      const x = (rand() * 2 - 1) * fx;
      const z = this.fence.zBack + 1.6 + rand() * (this.fence.zFront - this.fence.zBack - 3.2);
      if (Math.abs(x) < this.gridHalfX + 2.2 && Math.abs(z) < this.gridHalfZ + 2.2) continue;
      // theme scenery stays near the edges, leaving the mid-band clear for the player
      if (outerBand && Math.abs(x) < this.gridHalfX + 12 && Math.abs(z) < this.gridHalfZ + 12) continue;
      if (Math.hypot(x - this.windmillPos.x, z - this.windmillPos.z) < 7) continue;
      if (Math.hypot(x - this.signPos.x, z - this.signPos.z) < 4) continue;
      if (this.farmhousePos && Math.hypot(x - this.farmhousePos.x, z - this.farmhousePos.z) < 11) continue;
      if (this.marketPos && Math.hypot(x - this.marketPos.x, z - this.marketPos.z) < 6.5) continue;
      if (Math.hypot(x, z - this.fence.zFront) < 7) continue; // the gate stays clear
      return [x, z];
    }
    return null;
  }

  _buildScatter() {
    const hsl = this.theme.colors.tuftColorHSL || { h: 0.29, s: 0.55, l: 0.45 };
    const tuftGeo = new THREE.ConeGeometry(0.22, 1.1, 4);
    const tuftCount = 210;
    const tufts = new THREE.InstancedMesh(tuftGeo, mat(this.theme.colors.grassEdge), tuftCount);
    tufts.castShadow = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let placed = 0;
    for (let i = 0; i < tuftCount; i++) {
      const p = this._scatterPoint();
      if (!p) continue;
      const s = 0.6 + Math.random() * 0.9;
      q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.25, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25));
      m4.compose(new THREE.Vector3(p[0], 0.5 * s, p[1]), q, new THREE.Vector3(s, s, s));
      tufts.setMatrixAt(placed, m4);
      col.setHSL(hsl.h + (Math.random() - 0.5) * 0.05, hsl.s, hsl.l + (Math.random() - 0.5) * 0.1);
      tufts.setColorAt(placed, col);
      placed++;
    }
    tufts.count = placed;
    this.scene.add(tufts);

    if (!['meadow', 'sakura', 'autumn'].includes(this.theme.id)) return; // themes bring their own flora
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 4), mat(P.stem), 34);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 34);
    stems.castShadow = heads.castShadow = true;
    const petalColors = [0xf2a6c8, 0xfff3e0, 0xf5c518, 0xb89be6, 0xf28c8c];
    let fPlaced = 0;
    for (let i = 0; i < 34; i++) {
      const p = this._scatterPoint();
      if (!p) continue;
      m4.compose(new THREE.Vector3(p[0], 0.4, p[1]), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      stems.setMatrixAt(fPlaced, m4);
      m4.compose(new THREE.Vector3(p[0], 0.92, p[1]), new THREE.Quaternion(), new THREE.Vector3(1, 0.8, 1));
      heads.setMatrixAt(fPlaced, m4);
      col.set(petalColors[Math.floor(Math.random() * petalColors.length)]);
      heads.setColorAt(fPlaced, col);
      fPlaced++;
    }
    stems.count = heads.count = fPlaced;
    this.scene.add(stems, heads);
  }

  _buildSkyLife() {
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      const cMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
      for (let p = 0; p < puffs; p++) {
        const r = 3.5 + Math.random() * 3.5;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), cMat);
        // irregular clump — evenly-spaced puffs in a row read as an airship
        const ca = Math.random() * Math.PI * 2;
        const cr = Math.random() * 3.2;
        puff.position.set(Math.cos(ca) * cr, r * 0.2 + (Math.random() - 0.5) * 1.8, Math.sin(ca) * cr * 0.7);
        puff.scale.y = 0.55 + Math.random() * 0.15;
        cloud.add(puff);
      }
      cloud.position.set((Math.random() - 0.5) * 520, 55 + Math.random() * 60, (Math.random() - 0.5) * 520);
      cloud.userData = { speed: 1 + Math.random() * 2, phase: Math.random() * 10 };
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
    // the beach gets its own cast: seagulls overhead, turtles ashore, dolphins
    // out on the water; every other biome keeps deer + songbirds
    const isBeach = this.theme.id === 'oceanside';
    // birds (seagulls on the beach) wander on their own drifting flight paths
    this.birds = [];
    const species = BIRD_SPECIES;
    const bzc = (this.zFront + this.zBack) / 2;
    for (let i = 0; i < 4; i++) {
      const kind = isBeach ? 'seagull' : species[i % species.length];
      const bird = isBeach ? buildSeagull() : BIRDS[kind]();
      // smaller + slimmer (thinner across the wingspan/body) than before
      const scale = kind === 'seagull' ? 1.5 : kind === 'crane' ? 1.7 : kind === 'bluejay' ? 1.2 : 1.05;
      bird.scale.set(scale, scale, scale * (kind === 'seagull' ? 0.9 : 0.7));
      const wings = bird.userData.wings || {};
      const cx = (Math.random() - 0.5) * this.W * 0.3;
      const cz = bzc + (Math.random() - 0.5) * this.W * 0.3;
      const roamR = this.W * (0.7 + Math.random() * 0.55) + 8;
      const ang = Math.random() * Math.PI * 2;
      bird.userData.flight = {
        wings,
        phase: i * 1.9,
        cx, cz, roamR,
        x: cx + Math.cos(ang) * roamR * 0.6,
        z: cz + Math.sin(ang) * roamR * 0.6,
        heading: Math.random() * Math.PI * 2,
        wanderTurn: (Math.random() - 0.5) * 0.3,
        bank: 0,
        h: 30 + i * 7,
        // brisk cruise; cranes a touch slower, each bird a bit different
        speed: (13 + i * 3.5 + Math.random() * 4) * (kind === 'crane' ? 0.82 : 1),
        flapSpeed: kind === 'crane' ? 60 : kind === 'seagull' ? 150 : kind === 'robin' ? 120 : 90,
      };
      bird.position.set(bird.userData.flight.x, bird.userData.flight.h, bird.userData.flight.z);
      this.scene.add(bird);
      this.birds.push(bird);
    }

    // roaming ground animals beyond the fence — turtles on the beach, deer elsewhere
    this.deer = [];
    const zc = (this.zFront + this.zBack) / 2;
    const variants = ['buck', 'doe', 'fawn'];
    // spawn a huntable animal at a dry point, with a click-target column sized
    // to the quarry (small critters are deliberately fiddly to hit)
    const addQuarry = (model, quarry, variant, scaleMul = 1, anim = null) => {
      const q = QUARRY[quarry] || QUARRY.deer;
      if (scaleMul !== 1) model.scale.setScalar(scaleMul);
      const wz = this.deerWaterZone;
      let px = 0, pz = 0;
      for (let tries = 0; tries < 14; tries++) {
        const a = Math.random() * Math.PI * 2;
        const rr = this.W * (0.6 + Math.random() * 0.28);
        px = Math.cos(a) * rr; pz = zc + Math.sin(a) * rr;
        if (!wz || Math.hypot(px - wz.x, pz - wz.z) > wz.r + 4) break;
      }
      model.position.set(px, 0, pz);
      const spd = q.base * (0.85 + Math.random() * 0.4);
      const hpR = q.hp || [1, 1];
      const hp = hpR[0] + Math.floor(Math.random() * (hpR[1] - hpR[0] + 1));
      model.userData.roam = {
        legs: model.userData.legs || [], head: model.userData.head,
        cz: zc, minR: this.W * 0.5, maxR: this.W * 0.98,
        heading: Math.random() * Math.PI * 2,
        speed: spd, homeSpeed: spd,
        state: 'walk', until: 3000 + Math.random() * 4000, t0: 0,
        ph: Math.random() * 10, turtle: false, quarry, variant,
        hp, hpMax: hp, restless: !!q.restless,
        mixer: anim && anim.mixer || null, actions: anim && anim.actions || null, clip: null,
      };
      const s = scaleMul || 1; // hit column stays a fixed WORLD size despite model scale
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(q.hitR / s, q.hitR / s, Math.max(1.4, q.hitR * 2.6) / s, 6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = Math.max(0.7, q.hitR * 1.3) / s;
      hit.userData.deer = model;
      model.add(hit); model.userData.hit = hit;
      this.scene.add(model); this.deer.push(model);
    };
    if (isBeach) {
      // turtles plod ashore — ambient, not huntable
      for (let i = 0; i < 3; i++) {
        const t = buildTurtle(); t.scale.setScalar(1.5);
        const a = Math.random() * Math.PI * 2, rr = this.W * (0.6 + Math.random() * 0.25);
        t.position.set(Math.cos(a) * rr, 0, zc + Math.sin(a) * rr);
        const spd = 0.5 + Math.random() * 0.4;
        t.userData.roam = {
          legs: t.userData.legs || [], head: t.userData.head, cz: zc,
          minR: this.W * 0.55, maxR: this.W * 0.95, heading: Math.random() * Math.PI * 2,
          speed: spd, homeSpeed: spd, state: 'walk', until: 3000 + Math.random() * 4000,
          t0: 0, ph: Math.random() * 10, turtle: true, quarry: null,
        };
        this.scene.add(t); this.deer.push(t);
      }
    } else {
      // deer use the authored animated GLB when it's loaded, else the procedural fallback
      for (let i = 0; i < 3; i++) {
        const fawn = variants[i] === 'fawn';
        if (glbReady('deer')) {
          const g = buildGLB('deer');
          addQuarry(g.group, 'deer', variants[i], GLB_DEER_SCALE * (fawn ? 0.72 : 1), { mixer: g.mixer, actions: g.actions });
        } else {
          addQuarry(buildDeer(variants[i]), 'deer', variants[i], 1);
        }
      }
      for (let i = 0; i < 5; i++) addQuarry(buildCritter('bunny'), 'bunny', null, 1.5);
      for (let i = 0; i < 4; i++) addQuarry(buildCritter('squirrel'), 'squirrel', null, 1.5);
      if (glbReady('bear')) {
        const gb = buildGLB('bear');
        addQuarry(gb.group, 'bear', null, GLB_BEAR_SCALE, { mixer: gb.mixer, actions: gb.actions });
      } else {
        addQuarry(buildCritter('bear'), 'bear', null, 1.3);
      }
      // a fox prowls by day; wolves join at night (they hunt un-penned animals)
      this.predators = [];
      this._spawnPredator('fox');
    }

    // a POD of dolphins cruising the open water together — mostly submerged,
    // breaching now and then in a nose-up arc (beach only)
    this.dolphins = [];
    if (isBeach) {
      const podRad = this.W * (1.8 + Math.random() * 0.8);
      const podAng = Math.random() * Math.PI * 2;
      const podDir = Math.random() < 0.5 ? 1 : -1;
      const podSpeed = 0.09 + Math.random() * 0.04;
      const surfaceY = -0.6;   // the water line
      const submergeY = -2.6;  // cruising depth, just under the surface
      for (let i = 0; i < 3; i++) {
        const dol = buildDolphin();
        dol.scale.setScalar(1.55);
        dol.rotation.order = 'YZX'; // yaw (Y) then pitch (Z) for the leaping arc
        const swim = {
          fluke: dol.userData.fluke,
          cx: 0, cz: zc, rad: podRad + (i - 1) * 4, // staggered so they cluster, not overlap
          ang: podAng + (i - 1) * 0.05,
          dir: podDir, speed: podSpeed,
          surfaceY, submergeY,
          nextLeap: 2500 + i * 1800 + Math.random() * 4000, // staggered breaches
          leap: 0, leapMs: 1600,
        };
        dol.userData.swim = swim;
        dol.position.set(Math.cos(swim.ang) * swim.rad, submergeY, zc + Math.sin(swim.ang) * swim.rad);
        this.scene.add(dol);
        this.dolphins.push(dol);
      }
    }

  }

  _plotPosition(index) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    return new THREE.Vector3(
      (col - (this.cols - 1) / 2) * PLOT_PITCH, 0,
      (row - (this.rows - 1) / 2) * PLOT_PITCH
    );
  }

  _buildPlots() {
    const hitGeo = new THREE.BoxGeometry(PLOT_SIZE + 1.5, 9, PLOT_SIZE + 1.5);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    for (let i = 0; i < this.cols * this.rows; i++) {
      const pos = this._plotPosition(i);
      const group = new THREE.Group();
      group.position.copy(pos);
      group.position.y = PLOT_SINK;
      const soilMat = mat(P.soil);
      const soil = box(PLOT_SIZE, 1.1, PLOT_SIZE, P.soil);
      soil.material = soilMat;
      soil.position.y = 0.55;
      soil.receiveShadow = true;
      group.add(soil);
      const ridgeMat = mat(P.soilRidge);
      const ridges = [];
      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const ridge = box(PLOT_SIZE - 1, 0.4, 0.95, P.soilRidge);
        ridge.material = ridgeMat;
        ridge.position.set(0, 1.2, (rIdx - 1) * 2.2);
        ridge.castShadow = false;
        group.add(ridge);
        ridges.push(ridge);
      }
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.y = 3.5;
      group.add(hit);
      this.scene.add(group);
      const plot = {
        index: i, group, soil, hit, soilMat, ridgeMat, ridges,
        state: null, moisture: 0, cropGroup: null, growAnim: null, sparkleGroup: null, waterSlab: null,
      };
      hit.userData.plot = plot;
      this.plots.push(plot);
    }
  }

  // ================= plots =================

  setPlotState(index, state) {
    const plot = this.plots[index];
    if (!plot) return;
    const prev = plot.state;
    const same = (!prev && !state) || (prev && state && prev.type === state.type && prev.stage === state.stage);
    if (same) {
      // stage unchanged but growth/cooldown may have ticked — keep flags fresh
      if (state) {
        plot.state.prog = state.prog;
        plot.state.lastWater = state.lastWater;
        plot.state.owner = state.owner;
        this._setGrowthMeter(plot, state);
      }
      return;
    }
    plot.state = state ? { ...state } : null;
    if (plot.cropGroup) { plot.group.remove(plot.cropGroup); plot.cropGroup = null; }
    // rice floods the plot
    const wantsWater = state && state.type === 'rice';
    if (wantsWater && !plot.waterSlab) {
      const slab = box(PLOT_SIZE - 0.6, 0.25, PLOT_SIZE - 0.6, P.water, { roughness: 0.15, transparent: true, opacity: 0.8 });
      slab.position.y = 1.35;
      plot.group.add(slab);
      plot.waterSlab = slab;
      for (const r of plot.ridges) r.visible = false;
    } else if (!wantsWater && plot.waterSlab) {
      plot.group.remove(plot.waterSlab);
      plot.waterSlab = null;
      for (const r of plot.ridges) r.visible = true;
    }
    this._setSparkles(plot, !!state && state.stage === 4);
    this._setGrowthMeter(plot, state);
    if (!state) return;
    const crop = buildCrop(state.type, state.stage, hash32(`${index}:${state.type}`, 13), { faceTex: this.faceTex });
    // rice group's origin is the water surface (slab top ≈ 1.48)
    crop.position.y = state.type === 'rice' ? 1.48 : 1.35;
    plot.group.add(crop);
    plot.cropGroup = crop;
    const grew = prev && prev.type === state.type && state.stage > prev.stage;
    if (grew || (!prev && state.stage >= 0)) {
      plot.growAnim = { start: performance.now(), duration: 900, base: state.stage === 4 ? 1.22 : 1 };
      crop.scale.setScalar(0.01);
    }
  }

  _setSparkles(plot, on) {
    // harvest-ready = enchanted: a soft golden light pool on the soil and a
    // fountain of magic motes spiraling up out of the crop
    if (on && !plot.sparkleGroup) {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.goldTex, color: i % 3 ? 0xffe9a0 : 0xfff6d8, transparent: true, opacity: 0, depthWrite: false,
        }));
        sp.userData.phase = i / 7;
        sp.userData.speed = 0.8 + Math.random() * 0.7;
        sp.userData.size = 0.7 + Math.random() * 0.7;
        g.add(sp);
      }
      plot.group.add(g);
      plot.sparkleGroup = g;
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(PLOT_SIZE / 2 + 0.7, 14),
        new THREE.MeshBasicMaterial({
          color: 0xffd75a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 1.55;
      plot.group.add(pool);
      plot.glowPool = pool;
    } else if (!on && plot.sparkleGroup) {
      plot.group.remove(plot.sparkleGroup);
      plot.sparkleGroup = null;
      if (plot.glowPool) {
        plot.group.remove(plot.glowPool);
        plot.glowPool = null;
      }
    }
  }

  // subtle growth gauge on the plot's front lip while a crop is coming along
  _setGrowthMeter(plot, state) {
    const want = state && (state.stage ?? 0) < 4 && state.prog != null;
    if (want && !plot.meter) {
      const gm = new THREE.Group();
      const back = box(2.0, 0.08, 0.22, 0x2f2416, { transparent: true, opacity: 0.4 });
      back.castShadow = false;
      back.position.set(0, 1.58, PLOT_SIZE / 2 - 0.12);
      gm.add(back);
      const fill = box(1, 0.1, 0.15, 0x8fd457);
      fill.castShadow = false;
      fill.geometry.translate(0.5, 0, 0); // grows from the left
      fill.position.set(-0.97, 1.59, PLOT_SIZE / 2 - 0.12);
      gm.add(fill);
      plot.group.add(gm);
      plot.meter = { group: gm, fill };
    } else if (!want && plot.meter) {
      plot.group.remove(plot.meter.group);
      plot.meter = null;
    }
    if (plot.meter) plot.meter.fill.scale.x = Math.max(0.04, 1.94 * Math.min(1, state.prog ?? 0));
  }

  // ================= placement =================

  _radiusOf(type) {
    if (INFRA_BY_ID[type]) return placeholderRadius(INFRA_BY_ID[type]);
    return ANIMAL_RADIUS[type] || BUILDING_RADIUS[type] || PROCESSOR_RADIUS[type] || OBJECT_RADIUS[type] || 1.6;
  }

  _buildPlaceable(kind, type, opts) {
    if (type === 'fish_trap') return buildFishTrap();
    if (CAMP_IDS.has(type)) return buildCamp(type === 'camp_lantern' ? 'lantern' : type);
    if (INFRA_BY_ID[type]) {
      // hand-built models replace placeholders one batch at a time
      if (INFRA_MODELS[type]) return INFRA_MODELS[type]();
      return buildPlaceholder(INFRA_BY_ID[type]);
    }
    if (kind === 'tree') return buildTree(type);
    if (ANIMAL_TYPES.includes(type)) return buildAnimal(type);
    if (PROC_IDS.includes(type)) return buildProcessor(type);
    if (MERCH_IDS.includes(type)) return buildMerchantItem(type);
    return buildingGroupFor(type, opts);
  }

  plotPosition(index) {
    return this._plotPosition(index);
  }

  // pens keep the animals whose home is inside them
  _boundsForAnimal(x, z) {
    // only a pen with its gate CLOSED holds an animal — an open gate means
    // the residents are free to wander the whole farm
    for (const rec of this.placed.values()) {
      const pen = rec.group.userData.pen;
      if (!pen || !rec.gateClosed) continue;
      const hw = pen.w / 2, hd = pen.d / 2;
      // rectangle test in the pen's local frame (pens can be rotated)
      const dx = x - rec.x, dz = z - rec.z;
      const cos = Math.cos(-rec.group.rotation.y), sin = Math.sin(-rec.group.rotation.y);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        const r = Math.min(hw, hd) - 0.6;
        return { minX: rec.x - r, maxX: rec.x + r, minZ: rec.z - r, maxZ: rec.z + r };
      }
    }
    return null;
  }

  // swing a pen's gate and re-pen every animal by where it stands right now
  setPenGate(id, closed) {
    const rec = this.placed.get(id);
    const gate = rec?.group.userData.penGate;
    if (!gate) return;
    rec.gateClosed = !!closed;
    this.penGateAnims = this.penGateAnims || [];
    this.penGateAnims.push({ gate, from: gate.rotation.y, to: closed ? 0 : 1.9, start: performance.now() });
    for (const ar of this.animalRecs.values()) {
      ar.bounds = this._boundsForAnimal(ar.group.position.x, ar.group.position.z);
    }
  }

  placeObject({ kind, type, x, z, rot = 0, opts = {}, buildUntil }) {
    const id = `obj-${++this.placedSerial}`;
    // still under construction → show the site, not the building
    const constructing = !!buildUntil && buildUntil > Date.now();
    const radius = this._radiusOf(type);
    const group = constructing ? buildConstructionSite(radius) : this._buildPlaceable(kind, type, opts);
    // water items float at the water surface; everything else sits on the ground
    const baseY = placementZone(type) === 'water' ? (this.dockWaterY ?? 0) + 0.05 : this._groundY();
    group.position.set(x, baseY, z);
    group.rotation.y = rot;
    this.scene.add(group);
    // animals get a generous hit column — chasing a wandering cow with a
    // pixel-perfect cursor is no fun
    const hitR = ANIMAL_TYPES.includes(type) ? Math.max(2.4, radius * 1.6) : radius;
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(hitR, hitR, 6, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(x, 3, z);
    hit.userData.placedId = id;
    this.scene.add(hit);
    const rec = { id, kind, type, group, hit, opts, x, z, rot, construction: constructing };
    if (constructing) { rec.buildStart = Date.now(); rec.buildUntil = buildUntil; }
    this.placed.set(id, rec);
    if (constructing) return id; // no producers/animals until the build finishes
    // passive producers (hens lay, cows milk, trees fruit, hives honey)
    const catItem = findItem(kind === 'tree' ? 'tree' : ANIMAL_TYPES.includes(type) ? 'animal' : 'object', type);
    if (catItem?.produces) {
      const mult = this.productionMultFor ? this.productionMultFor(type) : 1;
      rec.product = {
        goodId: catItem.produces,
        startAt: performance.now(),
        nextAt: performance.now() + (45000 + Math.random() * 120000) / mult,
        ready: false, bubble: null,
      };
    }
    if (group.userData.petals) this._registerPetals(group);
    if (ANIMAL_TYPES.includes(type)) {
      const animalRec = {
        group, type, home: { x, z },
        bounds: this._boundsForAnimal(x, z),
        state: {}, rng: mulberry32(this.placedSerial * 977 + 13),
      };
      const [minMs, maxMs] = soundIntervalMs(type) || [15000, 45000];
      animalRec.soundRange = [minMs, maxMs];
      animalRec.nextSound = performance.now() + 2000 + Math.random() * maxMs;
      this.animalRecs.set(id, animalRec);
      if (type === 'dog' && opts?.herding) this.setHerder(id, true); // restore herding on load
      // hit follows a wandering animal — parent it to the group instead
      hit.position.set(0, 3, 0);
      this.scene.remove(hit);
      group.add(hit);
    }
    if (group.userData.pen) {
      // restore the saved gate state, then adopt animals standing inside
      rec.gateClosed = !!opts.gateClosed;
      if (group.userData.penGate) group.userData.penGate.rotation.y = rec.gateClosed ? 0 : 1.9;
      for (const ar of this.animalRecs.values()) {
        ar.bounds = this._boundsForAnimal(ar.group.position.x, ar.group.position.z);
      }
    }
    return id;
  }

  removeObject(id) {
    const rec = this.placed.get(id);
    if (!rec) return;
    this.scene.remove(rec.group);
    this.scene.remove(rec.hit);
    if (rec.product?.bubble) this.scene.remove(rec.product.bubble);
    if (rec.statusBar) this.scene.remove(rec.statusBar);
    if (rec.readyGlow) this.scene.remove(rec.readyGlow);
    this.placed.delete(id);
    this.animalRecs.delete(id);
    // a removed pen releases whoever it was holding
    if (rec.group.userData.pen) {
      for (const ar of this.animalRecs.values()) {
        ar.bounds = this._boundsForAnimal(ar.group.position.x, ar.group.position.z);
      }
    }
    this.petalPool = this.petalPool.filter((p) => {
      if (p.tree === rec.group) { this.scene.remove(p.sprite); return false; }
      return true;
    });
  }

  _groundY() { return 0; }

  startPlacement(kind, type, opts, cb, initialRot = 0) {
    this.cancelPlacement();
    this.controls.autoRotate = false;
    const ghost = this._buildPlaceable(kind, type, opts);
    ghost.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone ? o.material.clone() : o.material;
        if (o.material.transparent !== undefined) { o.material.transparent = true; o.material.opacity = 0.55; }
        o.castShadow = false;
      }
    });
    const radius = this._radiusOf(type);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius * 1.05, 24),
      new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ghost.add(ring);
    ghost.visible = false;
    this.scene.add(ghost);
    // a moved object keeps the angle it was rotated to
    this.placement = { kind, type, opts, cb, ghost, ring, radius, rot: initialRot || 0, valid: false };
  }

  cancelPlacement() {
    if (!this.placement) return;
    this.scene.remove(this.placement.ghost);
    const cb = this.placement.cb;
    this.placement = null;
    if (cb) cb(null);
  }

  rotatePlacement() {
    if (this.placement) this.placement.rot += Math.PI / 4;
  }

  _inWater(x, z, r = 0) {
    const wz = this.deerWaterZone;
    if (!wz) return false;
    return Math.hypot(x - wz.x, z - wz.z) < (wz.waterR || wz.r) - r;
  }

  _noOverlap(x, z, r) {
    for (const rec of this.placed.values()) {
      if (Math.hypot(x - rec.x, z - rec.z) < (r + this._radiusOf(rec.type)) * 0.8) return false;
    }
    return true;
  }

  _placementValid(x, z) {
    const r = this.placement.radius;
    const zone = placementZone(this.placement.type);
    // water items (traps, nets, piers) must sit in open water, outside the farm
    if (zone === 'water') {
      const wz = this.deerWaterZone;
      if (!wz) return false;
      const waterR = wz.waterR || wz.r;
      if (Math.hypot(x - wz.x, z - wz.z) > waterR - r - 0.5) return false;
      if (this.dockPos && Math.hypot(x - this.dockPos.x, z - this.dockPos.z) < r + 5) return false;
      return this._noOverlap(x, z, r);
    }
    // tree items (sap/resin collectors) must be next to a planted tree, on land
    if (zone === 'tree') {
      if (this._inWater(x, z, r)) return false;
      let byTree = false;
      for (const rec of this.placed.values()) {
        const d = Math.hypot(x - rec.x, z - rec.z);
        if (rec.kind === 'tree' && d < this._radiusOf(rec.type) + r + 2.5) byTree = true;
        else if (d < (r + this._radiusOf(rec.type)) * 0.8) return false;
      }
      return byTree;
    }
    // open items (turbines, solar, power lines) may go ANYWHERE on dry land in the
    // valley — inside the farm or out in the wild — just not in water or clipping
    if (zone === 'open') {
      const zc = (this.zFront + this.zBack) / 2;
      if (Math.hypot(x, z - zc) > this.W * 0.5 + 95) return false; // stay within the valley
      if (this._inWater(x, z, r)) return false;
      if (Math.abs(x) < this.gridHalfX + r + 0.6 && Math.abs(z) < this.gridHalfZ + r + 0.6) return false; // not on the plots
      if (Math.hypot(x - this.windmillPos.x, z - this.windmillPos.z) < r + 4.5) return false;
      if (this.farmhousePos && Math.hypot(x - this.farmhousePos.x, z - this.farmhousePos.z) < r + 8.5) return false;
      return this._noOverlap(x, z, r);
    }
    const f = this.fence;
    if (Math.abs(x) > f.x - r - 0.5) return false;
    if (z > f.zFront - r - 0.5 || z < f.zBack + r + 0.5) return false;
    if (Math.abs(x) < this.gridHalfX + r + 0.6 && Math.abs(z) < this.gridHalfZ + r + 0.6) return false;
    if (Math.hypot(x - this.windmillPos.x, z - this.windmillPos.z) < r + 4.5) return false;
    if (Math.hypot(x - this.signPos.x, z - this.signPos.z) < r + 3.2) return false;
    if (this.farmhousePos && Math.hypot(x - this.farmhousePos.x, z - this.farmhousePos.z) < r + 8.5) return false;
    if (this.marketPos && Math.hypot(x - this.marketPos.x, z - this.marketPos.z) < r + 4.5) return false;
    const placingAnimal = ANIMAL_TYPES.includes(this.placement?.type);
    for (const rec of this.placed.values()) {
      const rr = this._radiusOf(rec.type);
      // animals may be dropped inside pens (and near each other)
      if (placingAnimal && (rec.group.userData.pen || ANIMAL_TYPES.includes(rec.type))) {
        if (Math.hypot(x - rec.x, z - rec.z) < (ANIMAL_TYPES.includes(rec.type) ? 1.2 : 0)) return false;
        continue;
      }
      if (Math.hypot(x - rec.x, z - rec.z) < (r + rr) * 0.8) return false;
    }
    return true;
  }

  _updatePlacement() {
    const pl = this.placement;
    if (!pl || !this.pointerClient) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hitPos = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!this.raycaster.ray.intersectPlane(plane, hitPos)) { pl.ghost.visible = false; return; }
    pl.ghost.visible = true;
    const ghostY = placementZone(pl.type) === 'water' ? (this.dockWaterY ?? 0) + 0.05 : 0;
    pl.ghost.position.set(hitPos.x, ghostY, hitPos.z);
    pl.ghost.rotation.y = pl.rot;
    pl.valid = this._placementValid(hitPos.x, hitPos.z);
    pl.ring.material.color.set(pl.valid ? 0x4caf50 : 0xd64545);
    pl.pos = { x: hitPos.x, z: hitPos.z };
  }

  _confirmPlacement() {
    const pl = this.placement;
    if (!pl || !pl.valid || !pl.pos) return false;
    this.scene.remove(pl.ghost);
    const cb = pl.cb;
    const result = { x: pl.pos.x, z: pl.pos.z, rot: pl.rot };
    this.placement = null;
    if (cb) cb(result);
    return true;
  }

  _registerPetals(tree) {
    for (let i = 0; i < 5; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.blueTex, color: 0xf7bcd4, transparent: true, opacity: 0.85, depthWrite: false,
      }));
      sprite.scale.setScalar(0.5);
      this.scene.add(sprite);
      this.petalPool.push({ sprite, tree, phase: Math.random() * 10, speed: 0.5 + Math.random() * 0.5 });
    }
  }

  // ================= effects =================

  waterDropAt(index) {
    const plot = this.plots[index];
    if (!plot) return;
    const drop = mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial({
      color: 0x64b5f6, transparent: true, opacity: 0.9, roughness: 0.2,
    }));
    drop.position.copy(plot.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 3, 16, (Math.random() - 0.5) * 3));
    this.scene.add(drop);
    this.effects.push({ kind: 'drop', mesh: drop, start: performance.now(), duration: 700, plot });
    plot.moisture = 1;
  }

  goldBurstAt(index) {
    const plot = this.plots[index];
    if (!plot) return;
    this._burst(plot.group.position, this.goldTex, 0xffd75a, 10);
  }

  popAt(index) {
    const plot = this.plots[index];
    if (!plot) return;
    this._burst(plot.group.position, this.blueTex, 0xffffff, 6);
  }

  burstAtPosition(pos, gold = true) {
    this._burst(pos, gold ? this.goldTex : this.blueTex, gold ? 0xffd75a : 0xffffff, 10);
  }

  _burst(pos, tex, color, n) {
    for (let i = 0; i < n; i++) {
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false }));
      spark.position.copy(pos).add(new THREE.Vector3(0, 4, 0));
      spark.scale.setScalar(1.6);
      const dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.2, (Math.random() - 0.5)).normalize();
      this.scene.add(spark);
      this.effects.push({ kind: 'spark', mesh: spark, dir, start: performance.now(), duration: 1100 });
    }
  }

  butterflyAt(index) {
    const plot = this.plots[index];
    if (!plot || this.butterflies.length >= 14) return;
    const color = new THREE.Color().setHSL(Math.random(), 0.85, 0.62);
    const wingMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.9, 0.9, 1.15, 0.15, 0.55, -0.2);
    s.bezierCurveTo(0.9, -0.6, 0.35, -0.9, 0, -0.25);
    s.lineTo(0, 0);
    const wingGeo = new THREE.ShapeGeometry(s, 6);
    const group = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, wingMat);
    left.scale.x = -1;
    const right = new THREE.Mesh(wingGeo, wingMat);
    const bodyM = mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 5), mat(0x3a3040));
    group.add(left, right, bodyM);
    group.position.copy(plot.group.position).add(new THREE.Vector3(0, 26, 18));
    this.scene.add(group);
    this.butterflies.push({
      group, left, right,
      home: plot.group.position.clone().add(new THREE.Vector3(0, 5.5, 0)),
      born: performance.now(),
      life: 20000 + Math.random() * 15000,
      phase: Math.random() * 10,
      radius: 2.5 + Math.random() * 2,
    });
  }

  // ================= picking =================

  _setupPicking() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerClient = { x: e.clientX, y: e.clientY };
      if (this.paving && this.paving.dragging) {
        const pt = this._pavePoint(e);
        if (pt) this._paveTo(pt.x, pt.z);
      }
      // moving the house: it follows the cursor in real time (drop with a click)
      if (this.houseMoveArmed) {
        const pt = this._pavePoint(e);
        if (pt) this.moveHouse(pt.x, pt.z);
      }
    });
    el.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.pointerClient = null;
      this.onPlotHover(null);
    });
    el.addEventListener('pointerdown', (e) => {
      if (this.paving) {
        this.paving.dragging = true;
        this.paving.lastXZ = null;
        const pt = this._pavePoint(e);
        if (pt) this._paveTo(pt.x, pt.z);
        return;
      }
      this._downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    });
    el.addEventListener('pointerup', (e) => {
      // finishing a paved path (commit if affordable, else redo)
      if (this.paving) { this._paveCommit(); return; }
      if (!this._downAt) return;
      const moved = Math.hypot(e.clientX - this._downAt.x, e.clientY - this._downAt.y);
      const quick = moved < 6 && Date.now() - this._downAt.t < 500;
      this._downAt = null;
      if (!quick) return;
      // relocating the house: this click drops it on the ground point
      if (this.houseMoveArmed) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
          this.moveHouse(hit.x, hit.z);
          const cb = this.houseMoveArmed;
          this.houseMoveArmed = null;
          if (this.controls) { this.controls.enabled = true; if (this._wasAutoRotate != null) this.controls.autoRotate = this._wasAutoRotate; }
          this.renderer.domElement.style.cursor = 'grab';
          try { cb({ x: hit.x, z: hit.z }); } catch {}
        }
        return;
      }
      if (this.fishing) { try { this.fishing.clickNow(); } catch {} return; }
      if (this.huntMode) { try { this._tryShoot(); } catch {} return; }
      if (this.placement) { this._confirmPlacement(); return; }
      if (this.hovered != null) { this.onPlotClick(this.hovered.index); return; }
      if (this.hoveredObject) { this.onObjectClick(this.hoveredObject); return; }
      if (this.hoveredSign) { this.onSignClick(); return; }
      if (this.hoveredMarket) { this.onMarketClick(); return; }
      if (this.hoveredDock) { this.onDockClick(); return; }
      if (this.hoveredHouse) { this.onHouseClick(); return; }
      if (this.hoveredWindmill) { this.onWindmillClick(); return; }
      if (this.hoveredGate) { this.toggleGate(); return; }
      if (this.hoveredFence) { this.onFenceClick(); }
    });
  }

  // ================= loop =================

  _animate(now) {
    if (this.dead) return;
    requestAnimationFrame(this._animate);

    // WASD flight (camera-relative, horizontal plane, brisk)
    const dt = Math.min(0.05, (now - (this._lastNow || now)) / 1000);
    this._lastNow = now;
    if (this.keys.size) {
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() > 0.0001) fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const move = new THREE.Vector3();
      if (this.keys.has('w')) move.add(fwd);
      if (this.keys.has('s')) move.sub(fwd);
      if (this.keys.has('d')) move.add(right);
      if (this.keys.has('a')) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(95 * dt);
        this.camera.position.add(move);
        this.controls.target.add(move);
        this.controls.autoRotate = false;
      }
    }

    // ---- day / night cycle ----
    const cycleMs = this.dayLengthMs || 360000; // one full day→night→day loop
    const tphase = ((now / cycleMs) + 0.12) % 1;
    let d = 0.5 + 0.5 * Math.cos(tphase * Math.PI * 2);
    d = Math.max(0, Math.min(1, d * 1.4 - 0.2)); // day & night plateaus, soft dawn/dusk
    if (this.forceDay != null) d = this.forceDay; // test / debug override
    const prevDay = this.dayFactor;
    this.dayFactor = d;
    this.sunLight.intensity = 0.14 + 2.3 * d;
    this.sunLight.color.lerpColors(this.sunNightCol, this.sunDayCol, d);
    this.hemi.intensity = 0.2 + 0.7 * d;
    this.ambient.intensity = 0.1 + 0.13 * d;
    this.scene.fog.color.lerpColors(this.fogNight, this.fogDay, d);
    // ---- seasonal modulation layered on top of the day/night + biome ----
    this._updateSeason();
    const tint = seasonTint(this.season);
    if (tint.sunMix > 0) {
      const tc = this._tintC || (this._tintC = new THREE.Color());
      this.sunLight.color.lerp(tc.setHex(tint.sun), tint.sunMix * d); // tint only the daytime sun
      this.scene.fog.color.lerp(tc.setHex(tint.fog), tint.fogMix);
    }
    this.hemi.intensity *= tint.hemi;
    this.ambient.intensity *= tint.ambient;
    this._updateWeather(now); // rain/snow particles + wind + weather dimming
    this.skyDayMat.opacity = d;
    this.sunBall.material.opacity = d;
    this.sunGlow.material.opacity = 0.8 * d * (0.9 + 0.1 * Math.sin(now / 2400));
    this.moon.material.opacity = (1 - d) * 0.95;
    // occasional rolling fog drifting across the valley
    if (!this._fogNext) this._fogNext = now + 45000 + Math.random() * 90000;
    if (now >= this._fogNext && !this._fogEvent) {
      this._fogEvent = { start: now, dur: 26000 + Math.random() * 34000 };
      this._fogNext = now + 150000 + Math.random() * 210000;
    }
    let fogFar = 700;
    if (this._fogEvent) {
      const ft = (now - this._fogEvent.start) / this._fogEvent.dur;
      if (ft >= 1) this._fogEvent = null;
      else fogFar = 700 - Math.sin(ft * Math.PI) * 560; // dip toward ~140 mid-roll
    }
    if (this.weather && this.weather.intensity > 0.02) fogFar *= (1 - 0.55 * this.weather.intensity); // rain/snow closes in
    this.scene.fog.far = fogFar;
    this.scene.fog.near = Math.min(90, fogFar * 0.28);
    // fireflies at night — but only when the farm has no lanterns/fires of its own
    if (now - (this._lightsCheck || 0) > 1500) {
      this._lightsCheck = now; this._hasLights = false;
      for (const rec of this.placed.values()) {
        if (/lantern|campfire|lamp/i.test(rec.type)) { this._hasLights = true; break; }
      }
      if (this.powerDeficit) this._hasLights = false; // no power → lights go dark, fireflies return
    }
    for (const fly of this.fireflies) {
      const night = 1 - d;
      if (night > 0.05) {
        const ph = fly.userData.phase;
        fly.position.set(
          Math.cos(now / 2600 + ph) * fly.userData.r,
          2 + Math.sin(now / 700 + ph * 2) * 1.4,
          Math.sin(now / 3100 + ph) * fly.userData.r * 0.7
        );
      }
      fly.material.opacity = (0.35 + 0.55 * Math.abs(Math.sin(now / 400 + fly.userData.phase * 3)))
        * Math.max(0, 1 - d * 1.6) * (this._hasLights ? 0.12 : 1);
    }
    // the perimeter fence slowly weathers; it shows cracks, then falls open
    if (this.fenceHP > 0) {
      const wdt = Math.min(0.1, (now - (this._fenceNow || now)) / 1000);
      this._fenceNow = now;
      this.fenceHP = Math.max(0, this.fenceHP - wdt * 0.07); // ~24 min to fully weather
    } else { this._fenceNow = now; }
    if (now - (this._fenceVis || 0) > 1000) {
      this._fenceVis = now;
      this._applyFenceDamage();
      const st = this.fenceHP <= 0 ? 'broken' : this.fenceHP < 55 ? 'cracked' : 'ok';
      const changed = st !== this._fenceState;
      this._fenceState = st;
      try { this.onFenceState(Math.round(this.fenceHP), st, changed); } catch {}
    }
    this._updateWeathering(now); // buildings dull & grime over time
    // roosters greet the dawn
    if (prevDay < 0.3 && d >= 0.3) {
      for (const ar of this.animalRecs.values()) {
        if (ar.type === 'rooster') this.onAnimalSound('rooster');
      }
    }
    // farmhouse chimney smoke — every lived-in house puffs; grander homes puff livelier
    if (this.chimneyWorld && now - (this._lastSmoke || 0) > 3100 - this.farmhouseLevel * 280) {
      this._lastSmoke = now;
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.blueTex, color: 0xd8d4cc, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      puff.position.copy(this.chimneyWorld);
      puff.scale.setScalar(1.2);
      this.scene.add(puff);
      this.effects.push({ kind: 'smoke', mesh: puff, start: now, duration: 3200 });
    }

    // pen gates swinging shut/open
    if (this.penGateAnims?.length) {
      for (let i = this.penGateAnims.length - 1; i >= 0; i--) {
        const a = this.penGateAnims[i];
        const t = Math.min(1, (now - a.start) / 500);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        a.gate.rotation.y = a.from + (a.to - a.from) * e;
        if (t >= 1) this.penGateAnims.splice(i, 1);
      }
    }

    // gate swing + lantern flicker
    if (this.gateAnim && this.gateLeafL) {
      const t = Math.min(1, (now - this.gateAnim.start) / 650);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const target = this.gateOpen ? 1.75 : 0;
      const from = this.gateOpen ? 0 : 1.75;
      const a = from + (target - from) * e;
      this.gateLeafL.rotation.y = a;
      this.gateLeafR.rotation.y = -a;
      if (t >= 1) this.gateAnim = null;
    }
    if (this.gateFlame) {
      this.gateFlame.material.emissiveIntensity = 1.3 + Math.sin(now / 90) * 0.18 + Math.sin(now / 37) * 0.1;
    }

    // flowing water (all themes) driven from one shared texture
    try { tickWater(now * 0.001); } catch {}
    // the market coin hovers and bobs
    if (this.marketCoin) {
      this.marketCoin.sprite.position.y = this.marketCoin.baseY + Math.sin(now / 700) * 0.35;
      const sc = 2.2 + Math.sin(now / 900) * 0.12;
      this.marketCoin.sprite.scale.set(sc, sc, sc);
    }

    // theme scenery animations
    for (const fn of this.animatedFns) {
      try { fn(now); } catch {}
    }

    // ambient butterflies drift in over the crops on their own
    if (d > 0.5 && this.butterflies.length < 3 && this.plots.length && Math.random() < 0.004) {
      this.butterflyAt(Math.floor(Math.random() * this.plots.length));
    }

    // sun-glints twinkle on the water by the dock
    if (this.waterGlints) {
      for (const glint of this.waterGlints) {
        glint.material.opacity = Math.max(0, Math.sin(now / 900 + glint.userData.phase * 7)) * 0.55 * d;
      }
    }

    // fish shadows cruise beneath the surface, fading in and out sporadically
    if (this.fishShadows) {
      const fdt = Math.min(0.05, (now - (this._fishNow || now)) / 1000);
      this._fishNow = now;
      for (const f of this.fishShadows) {
        const gp = f.group.position;
        // gentle wandering — the heading only drifts, so motion is forward-only
        f.turn += (Math.random() - 0.5) * 0.03;
        f.turn = Math.max(-0.025, Math.min(0.025, f.turn));
        f.heading += f.turn;
        // steer back toward the zone center if it strays toward the shore/edge
        const toCx = f.cx - gp.x, toCz = f.cz - gp.z;
        if (Math.hypot(toCx, toCz) > f.zoneR) {
          const target = Math.atan2(toCz, toCx);
          let d = target - f.heading;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          f.heading += d * 0.05;
        }
        // advance strictly forward along the heading
        gp.x += Math.cos(f.heading) * f.speed * fdt;
        gp.z += Math.sin(f.heading) * f.speed * fdt;
        // face the direction of travel (local +x is the nose)
        f.group.rotation.y = -f.heading;
        // sporadic sightings — fade in and out
        const u = ((now + f.ph * 1000) % f.cyc) / f.cyc;
        const vis = u < 0.6 ? Math.sin((u / 0.6) * Math.PI) : 0;
        f.mat.opacity = 0.24 * vis;
        // tail wiggle
        f.group.children[1].rotation.z = Math.sin(now / 140 + f.ph) * 0.5;
      }
    }

    // ---- animals ----
    for (const ar of this.animalRecs.values()) {
      try { updateAnimal(ar, now); } catch {}
      if (now > ar.nextSound) {
        ar.nextSound = now + ar.soundRange[0] + Math.random() * (ar.soundRange[1] - ar.soundRange[0]);
        this.onAnimalSound(ar.type);
      }
    }

    // ---- passive production ----
    for (const rec of this.placed.values()) {
      const prod = rec.product;
      if (!prod) continue;
      if (!prod.ready && now >= prod.nextAt) {
        prod.ready = true;
        const good = GOODS[prod.goodId];
        const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
          map: emojiTexture(good?.icon || '🎁'), transparent: true, depthWrite: false,
        }));
        bubble.scale.setScalar(2.2);
        this.scene.add(bubble);
        prod.bubble = bubble;
        this.onProductReady(rec.id, prod.goodId);
      }
      if (prod.bubble) {
        const src = this.animalRecs.get(rec.id)?.group || rec.group;
        prod.bubble.position.set(src.position.x, src.position.y + 5 + Math.sin(now / 400) * 0.35, src.position.z);
      }
    }

    // ---- fishing ----
    if (this.fishing) {
      try { this.fishing.update(now); } catch {}
    }

    // windmill sails turn with the wind (accumulate so speed can vary smoothly)
    this.blades.rotation.z += (0.12 + 0.9 * (this.wind?.strength || 0.3)) * (this._bladeDt || 0.016);
    this._bladeDt = Math.min(0.05, (now - (this._bladeNow || now)) / 1000); this._bladeNow = now;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * 0.03;
      if (cloud.position.x > 340) cloud.position.x = -340;
    }
    const bdt = Math.min(0.05, (now - (this._birdNow || now)) / 1000);
    this._birdNow = now;
    for (const bird of this.birds) {
      const f = bird.userData.flight;
      if (!f) continue;
      // organic wander: let the turn rate drift so paths curve unpredictably
      // (sometimes near-straight, sometimes banking arcs) instead of a circle
      f.wanderTurn += (Math.random() - 0.5) * 1.6 * bdt;
      f.wanderTurn = Math.max(-0.6, Math.min(0.6, f.wanderTurn * 0.985));
      let turn = f.wanderTurn;
      // steer back toward the home range when it drifts too far out
      const dx = f.x - f.cx, dz = f.z - f.cz;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > f.roamR) {
        const inward = Math.atan2(-dz, -dx);
        let df = inward - f.heading;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        turn += df * Math.min(1.4, (dist - f.roamR) / 18 + 0.3);
      }
      f.heading += turn * bdt;
      f.x += Math.cos(f.heading) * f.speed * bdt;
      f.z += Math.sin(f.heading) * f.speed * bdt;
      bird.position.set(f.x, f.h + Math.sin(now / 1400 + f.phase) * 2, f.z);
      // face the actual travel direction (model faces +X) — always nose-forward
      bird.rotation.y = Math.atan2(-Math.sin(f.heading), Math.cos(f.heading));
      // bank into turns for life
      const targetBank = Math.max(-0.5, Math.min(0.5, -turn * 0.9));
      f.bank += (targetBank - f.bank) * 0.08;
      bird.rotation.z = f.bank;
      const flap = Math.sin(now / f.flapSpeed + f.phase);
      if (f.wings.left) f.wings.left.rotation.z = flap * 0.85;
      if (f.wings.right) f.wings.right.rotation.z = -flap * 0.85;
    }
    // deer wander the meadow: walk / graze, legs swinging, staying in a ring
    if (this.deer) {
      const ddt = Math.min(0.05, (now - (this._deerNow || now)) / 1000);
      this._deerNow = now;
      for (const d of this.deer) {
        const rm = d.userData.roam;
        rm.t0 += ddt * 1000;
        const gp = d.position;
        // authored GLB animals animate via their clips; drive them by state
        if (rm.mixer) {
          rm.mixer.update(ddt);
          const walkClip = rm.actions.DeerWalk ? 'DeerWalk' : rm.actions.BearWalk ? 'BearWalk' : null;
          const idleClip = rm.actions.DeerIdle ? 'DeerIdle' : rm.actions.BearIdle ? 'BearIdle' : null;
          const st = rm.state;
          if (st === 'walk' && walkClip) this._playClip(rm, walkClip, 1);
          else if ((st === 'flee' || st === 'rage') && walkClip) this._playClip(rm, walkClip, st === 'flee' ? 2.3 : 1.6);
          else if (st === 'graze' && idleClip) this._playClip(rm, idleClip, 1);
          else if ((st === 'dead' || st === 'respawning') && rm.clip) {
            if (rm.actions[rm.clip]) rm.actions[rm.clip].fadeOut(0.3);
            rm.clip = null;
          }
        }
        // a venison haunch floats up and fades after a kill (any state)
        if (rm.meatFx) {
          const mt = (now - rm.meatFx.start) / rm.meatFx.dur;
          if (mt >= 1) { this.scene.remove(rm.meatFx.mesh); rm.meatFx = null; }
          else {
            rm.meatFx.mesh.position.y = 1.0 + mt * 2.2;
            rm.meatFx.mesh.rotation.y += ddt * 2.4;
            const s = 1.6 * (1 - Math.max(0, mt - 0.7) / 0.3);
            rm.meatFx.mesh.scale.setScalar(Math.max(0.001, s));
          }
        }
        // ---- downed: tip over, blood pools, then sink out and schedule respawn
        if (rm.state === 'dead') {
          const tp = Math.min(1, rm.t0 / 600);
          d.rotation.z = tp * (Math.PI / 2) * (rm.variant === 'fawn' ? 0.9 : 1);
          for (const leg of rm.legs) if (leg) leg.rotation.x *= 0.85;
          if (rm.t0 > 2000) {
            const sink = Math.min(1, (rm.t0 - 2000) / 700);
            d.position.y = -sink * 2.2;
            d.scale.setScalar(1 - sink * 0.6);
            if (sink >= 1) { d.visible = false; rm.state = 'respawning'; rm.respawnAt = now + 120000; }
          }
          continue;
        }
        if (rm.state === 'respawning') {
          if (now >= (rm.respawnAt || 0)) {
            const pt = this._deerDryPoint();
            d.position.set(pt.x, 0, pt.z);
            d.rotation.z = 0; d.scale.setScalar(1); d.visible = true;
            rm.state = 'walk'; rm.t0 = 0; rm.until = 3000 + Math.random() * 4000;
            rm.speed = rm.homeSpeed || rm.speed; rm.heading = Math.random() * Math.PI * 2;
          }
          continue;
        }
        if (rm.state === 'walk' || rm.state === 'flee' || rm.state === 'rage') {
          const fleeing = rm.state === 'flee';
          const raging = rm.state === 'rage';
          if (raging) {
            // charge the farm: bear-line for the center, but don't barge into the
            // plots — circle menacingly once it reaches the fence line
            const toCx = 0 - gp.x, toCz = rm.cz - gp.z;
            const cdist = Math.hypot(toCx, toCz) || 1;
            if (cdist > rm.minR * 0.75) rm.heading = Math.atan2(toCz, toCx);
            else rm.heading += 0.05;
            if (now >= (rm.rageUntil || 0)) { rm.state = 'flee'; rm.fleeUntil = now + 3000; rm.speed = QUARRY.bear.base * QUARRY.bear.flee; rm.t0 = 0; }
          } else if (fleeing) {
            rm.heading += (Math.random() - 0.5) * 0.03; // hold a near-fixed bolt
            if (now >= (rm.fleeUntil || 0)) { rm.state = 'walk'; rm.speed = rm.homeSpeed || rm.speed; rm.t0 = 0; rm.until = 2500 + Math.random() * 3000; }
          } else {
            rm.heading += (Math.random() - 0.5) * 0.06;
          }
          // ring pull (looser while fleeing; skipped while raging so it can close on the farm)
          const dx = gp.x, dz = gp.z - rm.cz;
          const dist = Math.hypot(dx, dz) || 1;
          const ringMax = fleeing ? rm.maxR * 1.25 : rm.maxR;
          if (!raging && (dist > ringMax || (!fleeing && dist < rm.minR))) {
            const inward = dist > ringMax ? Math.atan2(-dz, -dx) : Math.atan2(dz, dx);
            let df = inward - rm.heading;
            while (df > Math.PI) df -= Math.PI * 2;
            while (df < -Math.PI) df += Math.PI * 2;
            rm.heading += df * (fleeing ? 0.12 : 0.06);
          }
          // steer away from the open water — deer keep to dry land (not turtles)
          const wz = this.deerWaterZone;
          if (wz && !rm.turtle) {
            const wdx2 = gp.x - wz.x, wdz2 = gp.z - wz.z;
            const wd = Math.hypot(wdx2, wdz2) || 1;
            if (wd < wz.r + 6) {
              const away = Math.atan2(wdz2, wdx2);
              let df = away - rm.heading;
              while (df > Math.PI) df -= Math.PI * 2;
              while (df < -Math.PI) df += Math.PI * 2;
              rm.heading += df * Math.min(0.6, (wz.r + 6 - wd) / 10 + 0.12);
            }
          }
          gp.x += Math.cos(rm.heading) * rm.speed * ddt;
          gp.z += Math.sin(rm.heading) * rm.speed * ddt;
          if (wz && !rm.turtle) {
            const wdx3 = gp.x - wz.x, wdz3 = gp.z - wz.z;
            const wd3 = Math.hypot(wdx3, wdz3) || 1;
            if (wd3 < wz.r) { gp.x = wz.x + (wdx3 / wd3) * wz.r; gp.z = wz.z + (wdz3 / wd3) * wz.r; }
          }
          // object avoidance: an INTACT fence keeps deer/critters/bear out — clamp
          // them to the fence edge. A broken fence lets them wander in (to eat crops).
          if (this.fence && !this.fenceBroken) {
            const fx = this.fence.x + 2.5, fzF = this.fence.zFront + 2.5, fzB = this.fence.zBack - 2.5;
            if (gp.x > -fx && gp.x < fx && gp.z > fzB && gp.z < fzF) {
              const dl = gp.x + fx, dr = fx - gp.x, db = gp.z - fzB, dt = fzF - gp.z;
              const mn = Math.min(dl, dr, db, dt);
              if (mn === dl) gp.x = -fx; else if (mn === dr) gp.x = fx;
              else if (mn === db) gp.z = fzB; else gp.z = fzF;
              rm.heading = Math.atan2(gp.z - rm.cz, gp.x); // steer back out of the farm
            }
          }
          d.rotation.y = Math.atan2(-Math.sin(rm.heading), Math.cos(rm.heading));
          const gait = (fleeing || raging) ? 70 : 150;
          const swing = Math.sin(now / gait + rm.ph) * ((fleeing || raging) ? 0.8 : 0.5);
          if (rm.legs[0]) rm.legs[0].rotation.x = swing;
          if (rm.legs[3]) rm.legs[3].rotation.x = swing;
          if (rm.legs[1]) rm.legs[1].rotation.x = -swing;
          if (rm.legs[2]) rm.legs[2].rotation.x = -swing;
          if (rm.head) rm.head.rotation.x = Math.sin(now / 600 + rm.ph) * 0.05;
          if (!fleeing && !raging && rm.t0 > rm.until) {
            if (rm.restless) {
              // bunnies & squirrels never rest — dart off in a new direction
              rm.heading = Math.random() * Math.PI * 2;
              rm.t0 = 0; rm.until = 500 + Math.random() * 1100;
            } else if (rm.quarry === 'bear') {
              // a bear prowls almost constantly — turn and keep walking (legs moving)
              rm.heading += (Math.random() - 0.5) * 1.4;
              rm.t0 = 0; rm.until = 2500 + Math.random() * 3500;
            } else {
              rm.state = 'graze'; rm.t0 = 0; rm.until = 2500 + Math.random() * 4000;
            }
          }
        } else {
          // grazing: legs still, head dips to the grass
          for (const leg of rm.legs) if (leg) leg.rotation.x *= 0.9;
          if (rm.head) rm.head.rotation.x = 0.5 + Math.sin(now / 500 + rm.ph) * 0.05;
          if (rm.t0 > rm.until) { rm.state = 'walk'; rm.t0 = 0; rm.until = 3000 + Math.random() * 5000; rm.heading = Math.random() * Math.PI * 2; }
        }
        // a charging bear rears up on its hind legs at the fence, front paws up
        if (rm.quarry === 'bear') {
          const cdist = Math.hypot(gp.x, gp.z - rm.cz);
          const rearing = rm.state === 'rage' && cdist < rm.minR * 1.05; // reached the farm edge
          const target = rearing ? 1.0 : 0; // radians of nose-up pitch when reared
          rm.rear = (rm.rear || 0) + (target - (rm.rear || 0)) * Math.min(1, ddt * 5);
          if (rm.rear > 0.01) {
            // pitch about the LOCAL lateral axis (after yaw) so it rears cleanly
            // instead of rolling onto its side
            const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rotation.y);
            const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rm.rear);
            d.quaternion.copy(qYaw.multiply(qPitch));
            if (rearing) { // paw the air with the front legs — and pound the fence
              if (rm.legs[0]) rm.legs[0].rotation.x = Math.sin(now / 120) * 0.6 - 0.4;
              if (rm.legs[1]) rm.legs[1].rotation.x = Math.cos(now / 120) * 0.6 - 0.4;
              if (now - (this._bearStomp || 0) > 900) { this._bearStomp = now; this.damageFence(4); } // stomps the fence down
            }
          }
        }
      }
    }
    this._updateDraw(now);
    this._updateBowVM(now);
    this._updateArrows(now);
    this._updateBlood(now);
    this._updatePredators(now);
    this._updateHerders(now);
    // dolphins lap the island out on the water and periodically breach in a
    // nose-up arc before splashing back down
    if (this.dolphins && this.dolphins.length) {
      const dt = Math.min(0.05, (now - (this._dolNow || now)) / 1000);
      this._dolNow = now;
      for (const dol of this.dolphins) {
        const s = dol.userData.swim;
        s.ang += s.dir * s.speed * dt;
        const heading = s.ang + s.dir * Math.PI / 2; // travel tangent to the ring
        dol.position.x = s.cx + Math.cos(s.ang) * s.rad;
        dol.position.z = s.cz + Math.sin(s.ang) * s.rad;
        dol.rotation.y = Math.atan2(-Math.sin(heading), Math.cos(heading));
        if (s.leap > 0) {
          s.leap += (dt * 1000) / s.leapMs;
          if (s.leap >= 1) { s.leap = 0; s.nextLeap = 5000 + Math.random() * 9000; dol.rotation.z = 0; dol.position.y = s.submergeY; }
          else {
            const u = s.leap;
            // arc up FROM under the surface, clear out of the water, and back under
            dol.position.y = s.submergeY + Math.sin(u * Math.PI) * (5.6 + (s.surfaceY - s.submergeY));
            dol.rotation.z = Math.cos(u * Math.PI) * 1.0; // nose up → level → nose down
          }
        } else {
          // cruising submerged, with a gentle vertical sway well under the surface
          dol.position.y = s.submergeY + Math.sin(now / 700 + s.ang) * 0.25;
          dol.rotation.z = 0;
          s.nextLeap -= dt * 1000;
          if (s.nextLeap <= 0) s.leap = 0.0001; // trigger the next breach
        }
        if (s.fluke) s.fluke.rotation.z = Math.sin(now / 170 + s.ang * 3) * 0.4; // fluke pump
      }
    }
    if (this.ripples) {
      for (const rp of this.ripples) {
        rp.position.x += rp.userData.speed * 0.016;
        if (rp.position.x > this.W / 2 - 1) rp.position.x = -this.W / 2 + 1;
      }
    }
    if (this.foams) {
      for (const foam of this.foams) {
        foam.scale.setScalar(0.8 + Math.sin(now / 300 + foam.userData.phase) * 0.25);
      }
    }

    for (const plot of this.plots) {
      if (plot.growAnim && plot.cropGroup) {
        const t = Math.min((now - plot.growAnim.start) / plot.growAnim.duration, 1);
        const back = 1.7;
        const e = 1 + (back + 1) * Math.pow(t - 1, 3) + back * Math.pow(t - 1, 2);
        plot.cropGroup.scale.setScalar(Math.max(0.01, e) * plot.growAnim.base);
        if (t >= 1) plot.growAnim = null;
      }
      if (plot.moisture > 0.002) {
        // dries over ~90s — wet soil doubles as the watering-cooldown indicator
        plot.moisture *= 0.999;
        plot.soilMat.color.lerpColors(this.dryCol, this.wetCol, plot.moisture);
        plot.ridgeMat.color.lerpColors(this.ridgeDry, this.ridgeWet, plot.moisture);
      }
      if (plot.cropGroup && !plot.growAnim) {
        // a breath of wind through the crops
        plot.cropGroup.rotation.z = Math.sin(now / 1100 + plot.index * 1.7) * 0.02;
      }
      // two states only: NEEDS WATER (can be watered right now → show the drop)
      // vs. doesn't (still in the 90s cooldown, or fully grown → no drop).
      // "needs water" == you're allowed to water it and it's still growing.
      // NB: lastWater is Date.now()-based, so the cooldown must compare against
      // Date.now() — NOT the rAF `now` (performance.now), which uses a different
      // epoch and made this always-false (the icon never appeared).
      const thirsty = plot.state && (plot.state.stage ?? 0) < 4 && plot.state.owner
        && (Date.now() - (plot.state.lastWater || 0)) >= 90000;
      if (thirsty && !plot.thirstIcon) {
        const drop = new THREE.Sprite(new THREE.SpriteMaterial({
          map: emojiTexture('💧'), transparent: true, opacity: 0.5, depthWrite: false,
        }));
        drop.scale.setScalar(2.0);
        this.scene.add(drop);
        plot.thirstIcon = drop;
      } else if (!thirsty && plot.thirstIcon) {
        this.scene.remove(plot.thirstIcon);
        plot.thirstIcon = null;
      }
      if (plot.thirstIcon) {
        const gp = plot.group.position;
        plot.thirstIcon.position.set(gp.x, gp.y + 4.4 + Math.sin(now / 520 + plot.index) * 0.3, gp.z);
        plot.thirstIcon.material.opacity = 0.34 + 0.18 * (0.5 + 0.5 * Math.sin(now / 380 + plot.index * 2));
      }
      if (plot.sparkleGroup) {
        // magic motes: each spirals upward out of the crop, fading in and out
        for (const sp of plot.sparkleGroup.children) {
          const u = ((now / 2800) * sp.userData.speed + sp.userData.phase) % 1;
          const r = 2.3 - u * 1.2;
          const a = sp.userData.phase * Math.PI * 2 + u * 2.8 + now / 5000;
          sp.position.set(Math.cos(a) * r, 1.7 + u * 3.6, Math.sin(a) * r);
          sp.material.opacity = Math.sin(u * Math.PI) * 0.9;
          sp.scale.setScalar(sp.userData.size * (0.55 + 0.6 * Math.sin(u * Math.PI)));
        }
      }
      if (plot.glowPool) {
        plot.glowPool.material.opacity = 0.12 + 0.07 * (0.5 + 0.5 * Math.sin(now / 520 + plot.index));
      }
    }

    // processor & merchant-item animations
    for (const rec of this.placed.values()) {
      const ud = rec.group.userData;
      if (ud.spin) {
        // wind turbines spin with the wind; other spinners keep their old behavior
        const windDriven = /windturbine|turbine|windmill/i.test(rec.type || '');
        ud.spin.rotation.z += windDriven ? (0.01 + 0.08 * (this.wind?.strength || 0.3)) : (rec.working ? 0.035 : 0.005);
      }
      if (ud.workGlow?.material?.emissive) {
        ud.workGlow.material.emissiveIntensity = rec.working ? 1.1 + Math.sin(now / 180) * 0.4 : 0.12;
      }
      if (ud.smokeTop && rec.working && now - (rec._lastSmoke || 0) > 1400) {
        rec._lastSmoke = now;
        const p = ud.smokeTop.clone();
        p.applyAxisAngle(new THREE.Vector3(0, 1, 0), rec.group.rotation.y).add(rec.group.position);
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.blueTex, color: 0xd8d4cc, transparent: true, opacity: 0.45, depthWrite: false,
        }));
        puff.position.copy(p);
        puff.scale.setScalar(0.9);
        this.scene.add(puff);
        this.effects.push({ kind: 'smoke', mesh: puff, start: now, duration: 2600 });
      }
      if (ud.flag?.geometry) {
        const pos = ud.flag.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          pos.setZ(i, Math.sin(now / 220 + x * 2.2) * 0.16 * Math.max(0, x));
        }
        pos.needsUpdate = true;
      }
      if (ud.waterRing) {
        const s = 1 + Math.sin(now / 500) * 0.06;
        ud.waterRing.scale.set(s, ud.waterRing.scale.y, s);
      }
      if (rec.jobReady?.bubble) {
        rec.jobReady.bubble.position.y = 7.5 + Math.sin(now / 400) * 0.35;
      }
    }

    // placed-object animations
    for (const rec of this.placed.values()) {
      // status bar (working) + gold glow (ready to collect), like the crop plots
      this._updateStructureStatus(rec, now);
      // construction sites: hammer knocks + dust puffs until the build lands
      if (rec.construction) {
        if (now - (rec._lastKnock || 0) > 1500 + Math.random() * 900) {
          rec._lastKnock = now;
          this.onConstructionKnock(rec.id);
          const dust = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.blueTex, color: 0xc7ad84, transparent: true, opacity: 0.4, depthWrite: false,
          }));
          dust.position.set(
            rec.group.position.x + (Math.random() - 0.5) * 3,
            rec.group.position.y + 1 + Math.random(),
            rec.group.position.z + (Math.random() - 0.5) * 3
          );
          dust.scale.setScalar(0.9);
          this.scene.add(dust);
          this.effects.push({ kind: 'smoke', mesh: dust, start: now, duration: 1600 });
        }
        continue;
      }
      const sway = rec.group.userData.sway;
      if (sway) {
        // trees/decor lean and rustle harder in stronger wind, biased downwind
        const ws = this.wind?.strength || 0.3;
        rec.group.rotation.z = Math.sin(now / 1400 * sway.speed + sway.phase) * sway.amp * (0.5 + 1.6 * ws)
          + Math.cos(this.wind?.dir || 0) * ws * 0.08;
      }
      const anim = rec.group.userData.anim;
      if (!anim) continue;
      if (anim.kind === 'lantern') {
        const pw = this.powerDeficit ? 0.12 : 1; // lamps gutter out on a power shortfall
        const f = 0.9 + Math.sin(now / 90) * 0.08 + Math.sin(now / 41) * 0.05;
        const nightBoost = 0.45 + 0.75 * (1 - this.dayFactor);
        anim.glow.material.opacity = 0.55 * f * nightBoost * pw;
        anim.flame.material.emissiveIntensity = 1.2 * f * nightBoost * pw;
      } else if (anim.kind === 'beehive') {
        anim.bees.forEach((bee, i) => {
          const a = now / 500 + i * 2.1;
          bee.position.set(Math.cos(a) * (1.3 + i * 0.2), 1.2 + Math.sin(a * 1.7) * 0.5, Math.sin(a) * (1.3 + i * 0.2));
        });
      } else if (anim.kind === 'pond') {
        anim.fishes.forEach((fish, i) => {
          const a = now / 2200 * (i ? -1 : 1) + i * 2;
          fish.position.set(Math.cos(a) * 1.5, 0.16, Math.sin(a) * 1.2);
          fish.rotation.y = -a + (i ? Math.PI / 2 : -Math.PI / 2);
        });
      } else if (anim.kind === 'chicken') {
        if (!anim.target || now > anim.next) {
          const a = Math.random() * Math.PI * 2;
          anim.target = new THREE.Vector3(anim.homeX + Math.cos(a) * 5, 0, anim.homeZ + Math.sin(a) * 5);
          anim.next = now + 3000 + Math.random() * 4000;
        }
        const gp = rec.group.position;
        const d = anim.target.clone().sub(gp);
        d.y = 0;
        if (d.length() > 0.3) {
          d.normalize();
          gp.addScaledVector(d, 0.025);
          rec.group.rotation.y = Math.atan2(d.x, d.z) - Math.PI / 2;
          anim.bodyG.position.y = Math.abs(Math.sin(now / 130)) * 0.12;
          anim.bodyG.rotation.x = 0;
        } else {
          anim.bodyG.rotation.x = Math.sin(now / 400) > 0.6 ? 0.35 : 0; // peck
        }
      }
    }

    // cherry petals
    for (const p of this.petalPool) {
      const t = ((now / 1000) * p.speed + p.phase) % 4;
      const a = p.phase + t * 1.5;
      const base = p.tree.position;
      p.sprite.position.set(
        base.x + Math.cos(a) * (1.5 + t * 0.5),
        base.y + 5.5 - t * 1.3,
        base.z + Math.sin(a) * (1.5 + t * 0.5)
      );
      p.sprite.material.opacity = 0.85 * (1 - t / 4);
    }

    // one-shot effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      const t = (now - fx.start) / fx.duration;
      if (t >= 1) {
        this.scene.remove(fx.mesh);
        this.effects.splice(i, 1);
        continue;
      }
      if (fx.kind === 'drop') {
        fx.mesh.position.y = fx.plot.group.position.y + 16 - t * t * 14.5;
        fx.mesh.material.opacity = 0.9 * (1 - t * 0.5);
        if (t > 0.9) fx.mesh.scale.set(1.6, 0.4, 1.6);
      } else if (fx.kind === 'spark') {
        fx.mesh.position.addScaledVector(fx.dir, 0.18);
        fx.mesh.material.opacity = 1 - t;
      } else if (fx.kind === 'smoke') {
        fx.mesh.position.y += 0.035;
        fx.mesh.position.x += Math.sin((now - fx.start) / 600) * 0.01;
        fx.mesh.scale.setScalar(1.2 + t * 2.4);
        fx.mesh.material.opacity = 0.5 * (1 - t);
      }
    }

    // butterflies
    for (let i = this.butterflies.length - 1; i >= 0; i--) {
      const b = this.butterflies[i];
      const age = now - b.born;
      const flap = Math.sin(now / 70) * 1.0;
      b.left.rotation.y = flap;
      b.right.rotation.y = -flap;
      if (age > b.life) {
        b.group.position.y += 0.25;
        b.group.position.x += 0.1;
        if (b.group.position.y > 80) {
          this.scene.remove(b.group);
          this.butterflies.splice(i, 1);
        }
        continue;
      }
      const arrive = Math.min(age / 2500, 1);
      const a = now / 1400 + b.phase;
      const orbit = new THREE.Vector3(Math.cos(a) * b.radius, Math.sin(now / 900 + b.phase) * 1.2, Math.sin(a) * b.radius);
      const target = b.home.clone().add(orbit);
      b.group.position.lerp(target, arrive < 1 ? 0.02 + arrive * 0.02 : 0.06);
      b.group.lookAt(b.home.x, b.group.position.y, b.home.z);
    }

    // placement ghost or hover picking
    if (this.placement) {
      this._updatePlacement();
      this.renderer.domElement.style.cursor = this.placement?.valid ? 'copy' : 'not-allowed';
    } else if (this.pointerClient && now - (this._lastPick || 0) > 70) {
      this._lastPick = now;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      // angle-proof plot picking: project the ray onto the soil plane and map
      // the exact point to a plot — tall hitboxes shadow each other at low angles
      let plot = null;
      const soilPt = new THREE.Vector3();
      const soilPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLOT_TOP_Y);
      let plotDist = Infinity;
      if (this.raycaster.ray.intersectPlane(soilPlane, soilPt)) {
        const col = Math.round(soilPt.x / PLOT_PITCH + (this.cols - 1) / 2);
        const row = Math.round(soilPt.z / PLOT_PITCH + (this.rows - 1) / 2);
        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
          const idx = row * this.cols + col;
          const c = this._plotPosition(idx);
          const half = PLOT_SIZE / 2 + 0.8;
          if (Math.abs(soilPt.x - c.x) <= half && Math.abs(soilPt.z - c.z) <= half) {
            plot = this.plots[idx] || null;
            if (plot) plotDist = this.raycaster.ray.origin.distanceTo(soilPt);
          }
        }
      }
      if (!plot) {
        // fallback: tall crops clicked above the soil footprint
        const plotHits = this.raycaster.intersectObjects(this.plots.map((p) => p.hit), false);
        plot = plotHits[0]?.object.userData.plot || null;
        if (plot) plotDist = plotHits[0].distance;
      }
      // objects are always tested — an animal or building standing between
      // the camera and the soil must win the click over the plot behind it
      const objHits = this.raycaster.intersectObjects([...this.placed.values()].map((r) => r.hit), false);
      let objId = objHits[0]?.object.userData.placedId || null;
      if (plot && objId) {
        if (objHits[0].distance < plotDist + 0.5) plot = null;
        else objId = null;
      }
      this.hoveredObject = objId;
      this.hoveredSign = !!this.signHit && !plot && !objId && this.raycaster.intersectObject(this.signHit, false).length > 0;
      this.hoveredMarket = !plot && !objId && !this.hoveredSign && this.raycaster.intersectObject(this.marketHit, false).length > 0;
      this.hoveredDock = !plot && !objId && !this.hoveredSign && !this.hoveredMarket && this.raycaster.intersectObject(this.dockHit, false).length > 0;
      this.hoveredHouse = !plot && !objId && !this.hoveredSign && !this.hoveredMarket && !this.hoveredDock &&
        !!this.houseHit && this.raycaster.intersectObject(this.houseHit, false).length > 0;
      this.hoveredGate = !plot && !objId && !this.hoveredSign && !this.hoveredMarket && !this.hoveredDock && !this.hoveredHouse &&
        !!this.gateHit && this.raycaster.intersectObject(this.gateHit, false).length > 0;
      this.hoveredWindmill = !plot && !objId && !this.hoveredSign && !this.hoveredMarket && !this.hoveredDock && !this.hoveredHouse && !this.hoveredGate &&
        !!this.windmillHit && this.raycaster.intersectObject(this.windmillHit, false).length > 0;
      // the perimeter fence is hoverable (to repair it) only once it's damaged
      this.hoveredFence = !plot && !objId && !this.hoveredSign && !this.hoveredMarket && !this.hoveredDock && !this.hoveredHouse && !this.hoveredGate && !this.hoveredWindmill
        && this.fenceHP < 100 && !!this.fenceHits && this.raycaster.intersectObjects(this.fenceHits, false).length > 0;
      // hunting: pick the live deer under the cursor (generous target columns)
      this.hoveredDeer = null;
      if (this.huntMode && this.deer && this.deer.length) {
        const targets = this.deer.filter((d) => d.userData.hit && d.visible && d.userData.roam
          && d.userData.roam.state !== 'dead' && d.userData.roam.state !== 'respawning');
        const dHits = this.raycaster.intersectObjects(targets.map((d) => d.userData.hit), false);
        if (dHits.length) this.hoveredDeer = dHits[0].object.userData.deer;
      }
      // predators are shootable too — defend the farm
      this.hoveredPredator = null;
      if (this.huntMode && this.predators && this.predators.length) {
        const pHits = this.raycaster.intersectObjects(this.predators.map((p) => p.userData.hitMesh).filter(Boolean), false);
        if (pHits.length) this.hoveredPredator = pHits[0].object.userData.predator;
      }
      if (plot !== this.hovered) {
        this.hovered = plot;
        this.onPlotHover(plot ? plot.index : null, this.pointerClient);
      } else if (plot) {
        this.onPlotHover(plot.index, this.pointerClient);
      }
      // placed objects get the same hover treatment (tooltip in main)
      if (objId !== this._lastObjHover || objId) {
        this._lastObjHover = objId;
        this.onObjectHover(objId, this.pointerClient);
      }
      this.renderer.domElement.style.cursor = this.huntMode ? 'crosshair'
        : plot || objId || this.hoveredSign || this.hoveredMarket || this.hoveredDock || this.hoveredHouse || this.hoveredGate || this.hoveredWindmill || this.hoveredFence ? 'pointer' : 'grab';
    }

    this.controls.update();
    // world boundary: the mountain ring is the edge of the map (WASD, pan, everything)
    {
      const zc = (this.zFront + this.zBack) / 2;
      const dx = this.controls.target.x, dz = this.controls.target.z - zc;
      const dist = Math.hypot(dx, dz);
      const lim = this.W * 2.2;
      if (dist > lim) {
        const k = lim / dist;
        const shiftX = dx * k - dx, shiftZ = dz * k - dz;
        this.controls.target.x += shiftX;
        this.controls.target.z += shiftZ;
        this.camera.position.x += shiftX;
        this.camera.position.z += shiftZ;
      }
      // keep the look-at target near ground level so panning can't tilt the view
      // up into a flat, grazing line across the water/land
      if (this.controls.target.y < 0) this.controls.target.y = 0;
      else if (this.controls.target.y > 18) this.controls.target.y = 18;
    }
    // hard floor for the camera — the underside of the world stays private
    if (this.camera.position.y < 3.5) this.camera.position.y = 3.5;
    this.renderer.render(this.scene, this.camera);
  }
}
