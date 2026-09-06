// Enough of a browser for GLTFLoader to parse a TEXTURED glb under node.
//
// The Blender models carry no textures, so every test until now could run
// three's loader in bare node. The studio bodies carry one embedded texture
// each, and that path goes:
//
//   loadImageSource -> self.URL.createObjectURL(blob) -> TextureLoader
//     -> ImageLoader -> document.createElementNS('img') -> img.src = url
//
// which is three globals node does not have. Without them the load rejects
// with "self is not defined" and every check that needs the body is skipped
// while looking like it ran, which is the failure CLAUDE.md calls the test
// path not being the real path.
//
// So this installs the three globals and nothing else. The image that comes
// back is a stub with a size and no pixels: node has no GPU and nothing here
// samples a texel, and every OTHER part of the load, the skin, the bones, the
// materials, the clips, is the real GLTFLoader doing the real work.
//
//   import { installTextureStubs } from '../../tools/test-glb-env.mjs';
//   installTextureStubs();     // before the first loadModel
//
// Returns what it installed, so a test can say so.

export function installTextureStubs() {
  const g = globalThis;
  const installed = [];

  if (!g.self) { g.self = g; installed.push('self'); }

  if (typeof g.URL.createObjectURL !== 'function') {
    let n = 0;
    const blobs = new Map();
    g.URL.createObjectURL = (blob) => {
      const url = `blob:node/${++n}`;
      blobs.set(url, blob);
      return url;
    };
    g.URL.revokeObjectURL = (url) => { blobs.delete(url); };
    installed.push('URL.createObjectURL');
  }

  if (!g.document) {
    g.document = {
      createElementNS(ns, name) {
        if (name !== 'img') throw new Error(`test-glb-env: nothing here makes a <${name}>`);
        return makeImage();
      },
      createElement(name) { return this.createElementNS(null, name); },
    };
    installed.push('document.createElementNS');
  }

  return installed;
}

/** An <img> that loads the moment it is given a src, and has no pixels. */
function makeImage() {
  const listeners = new Map();
  let src = '';
  return {
    nodeName: 'IMG',
    width: 1,
    height: 1,
    naturalWidth: 1,
    naturalHeight: 1,
    crossOrigin: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (list) listeners.set(type, list.filter((f) => f !== fn));
    },
    get src() { return src; },
    set src(value) {
      src = value;
      // next microtask, the way a real decode is never synchronous
      queueMicrotask(() => {
        for (const fn of (listeners.get('load') || []).slice()) fn({ type: 'load', target: this });
      });
    },
  };
}
