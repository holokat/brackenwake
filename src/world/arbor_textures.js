// Canvas textures for the Arbor forest, ported from docs/reference/arbor-forest-studio.jsx.
//
// Everything here draws on a 2D canvas and wraps the result in a THREE texture.
// The reference reached straight for `document.createElement('canvas')`, which
// makes the whole growth pipeline unloadable in node. Here the canvas comes
// from an injectable factory, so `arbor.test.mjs` can stub it and still build
// real geometry and real materials.
//
//   setCanvasFactory(stubCanvasFactory);   // node: textures become blank
//   setCanvasFactory(null);                // browser: back to document
//
// Sizes, loop counts, colours and the mulberry32 seeds (7 for bark, 3 for
// grass, 11 for ground) are the reference's. What is new here is the caching
// (the reference redrew a bark sheet per prototype even though makeBark is
// fully deterministic, so eight prototypes of one species drew eight identical
// 256x512 sheets), and two leaf kinds the game needs: 'blossom' and 'frond'.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// ---------------------------------------------------------------- canvas ----

let canvasFactory = null;

/** Inject a canvas maker. Pass null to go back to `document.createElement`. */
export function setCanvasFactory(fn) {
  canvasFactory = fn || null;
  clearTextureCache();
}

function canvasOf(w, h) {
  if (canvasFactory) return canvasFactory(w, h);
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  throw new Error('arbor_textures: no canvas available. Call setCanvasFactory() first.');
}

/**
 * A canvas that swallows every drawing call and hands back blank pixels.
 * Real geometry, real materials, no DOM. This is what the node test injects,
 * and it is committed here rather than living in the test so that any other
 * headless caller (an asset baker, a placement tool) gets the same one.
 */
export function stubCanvasFactory(w, h) {
  const noop = () => {};
  const ctx = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    globalCompositeOperation: 'source-over', globalAlpha: 1, filter: 'none',
    fillRect: noop, clearRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, arc: noop, ellipse: noop,
    fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop,
    drawImage: noop, putImageData: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: (x, y, gw, gh) => ({ width: gw, height: gh, data: new Uint8ClampedArray(gw * gh * 4) }),
    createImageData: (gw, gh) => ({ width: gw, height: gh, data: new Uint8ClampedArray(gw * gh * 4) }),
  };
  const c = { width: w, height: h, getContext: () => ctx, __stub: true };
  ctx.canvas = c;
  return c;
}

// --------------------------------------------------------------- helpers ----

function tex(c, srgb, rep) {
  const t = new THREE.CanvasTexture(c);
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

/** Height field to tangent-space normal map, exactly the reference's kernel. */
export function normalFromHeight(hc) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const c = canvasOf(w, h);
  const x = c.getContext('2d');
  const out = x.createImageData(w, h);
  const H = (i, j) => src[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * 3, dz = (H(i, j + 1) - H(i, j - 1)) * 3;
    const l = Math.hypot(dx, dz, 1);
    const o = (j * w + i) * 4;
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[o + 1] = (-dz / l * 0.5 + 0.5) * 255;
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return c;
}

// ------------------------------------------------------------------ bark ----

export const BARK_STYLES = ['rough', 'plates', 'smooth', 'birch'];

const barkCache = new Map();

/**
 * Bark albedo plus a normal map derived from a parallel height sheet.
 * 256 x 512, wrapping. Cached: makeBark is deterministic in (style, colour),
 * so every prototype of a species shares one pair of textures.
 */
export function makeBark(style, color) {
  const key = style + '|' + color;
  const hit = barkCache.get(key);
  if (hit) return hit;
  const W = 256, Hh = 512;
  const c = canvasOf(W, Hh); const x = c.getContext('2d');
  const hc = canvasOf(W, Hh); const hx = hc.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, W, Hh);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, Hh);
  const r = mulberry32(7);
  if (style === 'rough' || style === 'plates') {
    const n = style === 'plates' ? 420 : 900;
    for (let i = 0; i < n; i++) {
      const px = r() * W, py = r() * Hh;
      const w = style === 'plates' ? 8 + r() * 22 : 1 + r() * 3;
      const h = style === 'plates' ? 10 + r() * 30 : 14 + r() * 90;
      const d = r() < 0.55;
      x.fillStyle = (d ? 'rgba(0,0,0,' : 'rgba(255,240,220,') + (0.05 + r() * 0.14) + ')';
      x.fillRect(px, py, w, h);
      hx.fillStyle = (d ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.25 + r() * 0.4) + ')';
      hx.fillRect(px, py, w, h);
      if (px + w > W) { x.fillRect(px - W, py, w, h); hx.fillRect(px - W, py, w, h); }
    }
  }
  if (style === 'smooth') {
    for (let i = 0; i < 1500; i++) {
      const px = r() * W, py = r() * Hh;
      x.fillStyle = (r() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.02 + r() * 0.05) + ')';
      x.fillRect(px, py, 2 + r() * 6, 2 + r() * 6);
      hx.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.1) + ')';
      hx.fillRect(px, py, 3 + r() * 8, 3 + r() * 8);
    }
    for (let i = 0; i < 60; i++) {
      const py = r() * Hh;
      x.fillStyle = 'rgba(70,80,60,' + (0.08 + r() * 0.15) + ')';
      x.fillRect(0, py, W, 1 + r() * 3);
    }
  }
  if (style === 'birch') {
    for (let i = 0; i < 70; i++) {
      const py = r() * Hh, w = 10 + r() * 70, h = 2 + r() * 7;
      x.fillStyle = 'rgba(20,18,16,' + (0.6 + r() * 0.4) + ')';
      x.fillRect(r() * W, py, w, h);
      hx.fillStyle = 'rgba(0,0,0,0.5)';
      hx.fillRect(r() * W, py, w, h);
    }
    for (let i = 0; i < 400; i++) {
      x.fillStyle = 'rgba(120,110,100,' + (0.05 + r() * 0.1) + ')';
      x.fillRect(r() * W, r() * Hh, 1, 4 + r() * 20);
    }
  }
  const made = { map: tex(c, true, true), normalMap: tex(normalFromHeight(hc), false, true) };
  barkCache.set(key, made);
  return made;
}

// ------------------------------------------------------------------ leaf ----

export const LEAF_KINDS = ['oval', 'tropical', 'needle', 'blossom', 'frond'];

const leafCache = new Map();

/**
 * One leaf (or needle spray, blossom cluster, palm frond) as a white mask on a
 * 128 x 128 sheet. The mesh tints it through vertex colours, so the sheet only
 * carries shape and shading.
 *
 * 'oval', 'tropical' and 'needle' are the reference's, unchanged. 'blossom'
 * (sakura) and 'frond' (palm) are new, drawn in the same idiom.
 */
export function makeLeafTex(kind) {
  const hit = leafCache.get(kind);
  if (hit) return hit;
  const c = canvasOf(128, 128);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = '#ffffff';
  if (kind === 'oval') {
    x.beginPath(); x.moveTo(64, 4);
    x.bezierCurveTo(118, 40, 106, 110, 64, 126);
    x.bezierCurveTo(22, 110, 10, 40, 64, 4); x.fill();
  } else if (kind === 'tropical') {
    x.beginPath(); x.moveTo(64, 2);
    x.bezierCurveTo(100, 30, 104, 96, 64, 127);
    x.bezierCurveTo(24, 96, 28, 30, 64, 2); x.fill();
  } else if (kind === 'blossom') {
    // five petals around a small centre, the sakura answer to the oval leaf
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = 64 + Math.cos(a) * 30, py = 68 + Math.sin(a) * 30;
      x.beginPath(); x.ellipse(px, py, 26, 20, a, 0, 6.28318); x.fill();
    }
    x.beginPath(); x.arc(64, 68, 16, 0, 6.28318); x.fill();
  } else if (kind === 'frond') {
    // a rachis with pinnae down both sides, longer and narrower than a leaf
    x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(64, 4); x.lineTo(64, 126); x.stroke();
    x.lineWidth = 4.2;
    for (let i = 0; i < 26; i++) {
      const t = i / 26, y = 8 + t * 112, l = 40 * Math.sin(Math.PI * (0.18 + t * 0.72));
      x.beginPath();
      x.moveTo(64, y); x.lineTo(64 - l, y + l * 0.5);
      x.moveTo(64, y); x.lineTo(64 + l, y + l * 0.5);
      x.stroke();
    }
  } else {
    x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(64, 6); x.lineTo(64, 124); x.stroke();
    x.lineWidth = 2.2;
    for (let i = 0; i < 20; i++) {
      const t = i / 20, y = 12 + t * 108, l = 22 * (1 - t * 0.5) + 6;
      x.beginPath();
      x.moveTo(64, y); x.lineTo(64 - l, y + l * 0.7);
      x.moveTo(64, y); x.lineTo(64 + l, y + l * 0.7);
      x.stroke();
    }
  }
  if (kind !== 'needle' && kind !== 'frond') {
    x.globalCompositeOperation = 'source-in';
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c4c8b8');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.globalCompositeOperation = 'source-over';
    if (kind !== 'blossom') {
      x.strokeStyle = 'rgba(50,70,35,0.45)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(64, 10); x.lineTo(64, 122); x.stroke();
      x.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const yy = 20 + i * 16;
        x.beginPath(); x.moveTo(64, yy); x.lineTo(64 + (i % 2 ? 26 : -26), yy + 14); x.stroke();
      }
    }
  }
  const t = tex(c, true, false);
  leafCache.set(kind, t);
  return t;
}

// ---------------------------------------------------------------- ground ----

let grassTexCache = null;
/** A tuft of blades, 128 x 256, alpha tested. */
export function makeGrassTex() {
  if (grassTexCache) return grassTexCache;
  const c = canvasOf(128, 256);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 256);
  const r = mulberry32(3);
  x.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const bx = 8 + r() * 112, top = 10 + r() * 70;
    const g = x.createLinearGradient(0, 256, 0, top);
    g.addColorStop(0, '#9aa68a'); g.addColorStop(1, '#ffffff');
    x.strokeStyle = g; x.lineWidth = 2.2 + r() * 2.6;
    x.beginPath(); x.moveTo(bx, 256);
    x.quadraticCurveTo(bx + (r() - 0.5) * 40, 140, bx + (r() - 0.5) * 70, top);
    x.stroke();
  }
  grassTexCache = tex(c, true, false);
  return grassTexCache;
}

let groundTexCache = null;
/** Tileable grain for the forest floor, 256 x 256, wrapping. */
export function makeGroundTex() {
  if (groundTexCache) return groundTexCache;
  const c = canvasOf(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 256, 256);
  const r = mulberry32(11);
  for (let i = 0; i < 9000; i++) {
    const l = r();
    x.fillStyle = l < 0.5 ? 'rgba(0,0,0,' + (0.04 + r() * 0.12) + ')' : 'rgba(255,255,255,' + (0.03 + r() * 0.1) + ')';
    const s = 1 + r() * 4;
    x.fillRect(r() * 256, r() * 256, s, s * (0.5 + r()));
  }
  for (let i = 0; i < 180; i++) {
    x.fillStyle = 'rgba(110,90,50,' + (0.12 + r() * 0.25) + ')';
    x.beginPath(); x.ellipse(r() * 256, r() * 256, 3 + r() * 5, 2 + r() * 3, r() * 3.14, 0, 6.28); x.fill();
  }
  groundTexCache = tex(c, true, true);
  return groundTexCache;
}

/** Drop every cached sheet. Called when the canvas factory changes. */
export function clearTextureCache() {
  for (const b of barkCache.values()) { b.map.dispose?.(); b.normalMap.dispose?.(); }
  barkCache.clear();
  for (const t of leafCache.values()) t.dispose?.();
  leafCache.clear();
  grassTexCache?.dispose?.(); grassTexCache = null;
  groundTexCache?.dispose?.(); groundTexCache = null;
}

/** What the caches are holding, for the test and for a memory readout. */
export const textureStats = () => ({
  bark: barkCache.size, leaf: leafCache.size,
  grass: grassTexCache ? 1 : 0, ground: groundTexCache ? 1 : 0,
});
