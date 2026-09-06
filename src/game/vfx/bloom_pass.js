// The selective spell bloom, and the composer that runs it only while a spell
// is alive.
//
// PORTED from the studio's src/scene/SelectiveSpellBloomPass.ts and
// src/scene/createSpellPostprocessing.ts.
//
// WHY IT IS OPTIONAL HERE AND WAS NOT THERE. The studio was a single character
// on a plinth and could afford a composer every frame. Kaldera renders a
// streamed world, so `render(delta, active)` takes the plain
// `renderer.render(scene, camera)` path whenever nothing is glowing, and the
// composer costs exactly nothing on those frames. `active` is what
// spell_vfx.js answers: true while any spell effect is alive.
//
// Two more guards live inside the pass itself and are the studio's: the bright
// pass is skipped entirely unless some VISIBLE material in the scene asked for
// bloom (bloom.js's selection), and the combine still runs so the frame is
// identical either way.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createSpellBloomSelection } from './bloom.js';

/** Bloom contains only opted-in VFX. The lit character never enters it. */
export class SelectiveSpellBloomPass extends Pass {
  constructor(scene, camera, resolutionScale = 1) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.resolutionScale = resolutionScale;
    this.source = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.52, 0.34, 0.65);
    this.selection = createSpellBloomSelection(scene);
    this.clearColor = new THREE.Color();
    this.combine = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tBase: { value: null }, tBloom: { value: null }, uBloomActive: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tBase;uniform sampler2D tBloom;uniform float uBloomActive;varying vec2 vUv;
        void main(){vec4 base=texture2D(tBase,vUv);gl_FragColor=vec4(base.rgb+texture2D(tBloom,vUv).rgb*uBloomActive,base.a);}`,
    });
    this.quad = new FullScreenQuad(this.combine);
    this.renderer = null;
    this.source.texture.name = 'Spell bloom emission';
    this.combine.uniforms.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
    this.drawEmission = () => {
      const renderer = this.renderer;
      renderer.setRenderTarget(this.source);
      renderer.clear(true, true, true);
      renderer.render(this.scene, this.camera);
    };
  }

  render(renderer, writeBuffer, readBuffer, delta) {
    const background = this.scene.background;
    const oldTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    let active = false;
    try {
      this.renderer = renderer;
      this.scene.background = null;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      active = this.selection.render(this.drawEmission);
    } finally {
      this.scene.background = background;
      renderer.setClearColor(this.clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.setRenderTarget(oldTarget);
      this.renderer = null;
    }
    if (active) this.bloom.render(renderer, writeBuffer, this.source, delta, false);
    // Use the blurred texture, not the emission source, to avoid adding the
    // spell core twice.
    this.combine.uniforms.tBase.value = readBuffer.texture;
    this.combine.uniforms.uBloomActive.value = active ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  setSize(width, height) {
    const scaledWidth = Math.max(1, Math.round(width * this.resolutionScale));
    const scaledHeight = Math.max(1, Math.round(height * this.resolutionScale));
    this.source.setSize(scaledWidth, scaledHeight);
    this.bloom.setSize(scaledWidth, scaledHeight);
  }

  dispose() {
    this.source.dispose();
    this.bloom.dispose();
    this.combine.dispose();
    this.quad.dispose();
  }
}

const DISTORTION_SHADER = {
  name: 'LocalizedSpellDistortion',
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uRadius: { value: 0.14 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uStrength;
    uniform float uRadius;
    uniform float uAspect;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 fromCenter = vUv - uCenter;
      vec2 metric = vec2(fromCenter.x * uAspect, fromCenter.y);
      float distanceFromCenter = length(metric);
      float mask = 1.0 - smoothstep(uRadius * 0.28, uRadius, distanceFromCenter);
      vec2 direction = metric / max(distanceFromCenter, 0.0001);
      float wave = sin(distanceFromCenter * 92.0 - uTime * 15.0) * 0.55
        + sin(distanceFromCenter * 47.0 + uTime * 9.0) * 0.45;
      vec2 offset = direction * wave * mask * uStrength * 0.006;
      offset.x /= uAspect;
      gl_FragColor = texture2D(tDiffuse, clamp(vUv + offset, vec2(0.001), vec2(0.999)));
    }
  `,
};

/**
 * `render(delta, active)`. With `active` false this is one plain
 * renderer.render and no composer work at all; with it true the frame goes
 * through the render pass, the selective bloom, the heat shimmer and the
 * output pass.
 */
export function createSpellComposer(renderer, scene, camera, options = {}) {
  const composer = new EffectComposer(renderer);
  let composerPixelRatio = renderer.getPixelRatio();
  composer.setPixelRatio(composerPixelRatio);
  // Keep renderer.info representative of the WHOLE composer frame rather than
  // of its last pass. Without this the dev bench's draw count would collapse
  // to a handful the moment a spell was cast, which is a readout that lies
  // exactly when someone is looking at it. Every path below resets it once at
  // the top of the frame, the composed one and the plain one alike.
  renderer.info.autoReset = false;
  if (renderer.capabilities && renderer.capabilities.isWebGL2) {
    composer.renderTarget1.samples = 2;
    composer.renderTarget2.samples = 2;
  }
  const renderPass = new RenderPass(scene, camera);
  const distortionPass = new ShaderPass(DISTORTION_SHADER);
  const bloomPass = new SelectiveSpellBloomPass(scene, camera, options.resolutionScale === undefined ? 1 : options.resolutionScale);
  const outputPass = new OutputPass();
  distortionPass.enabled = false;
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(distortionPass);
  composer.addPass(outputPass);

  const worldPosition = new THREE.Vector3();
  const projectedPosition = new THREE.Vector3();
  let requestedStrength = 0;
  let requestedRadius = 0.14;
  let elapsedTime = 0;
  let frames = 0;

  function updateDistortion() {
    projectedPosition.copy(worldPosition).project(camera);
    const visible = requestedStrength > 0.0001
      && projectedPosition.z >= -1 && projectedPosition.z <= 1
      && Math.abs(projectedPosition.x) < 1.3 && Math.abs(projectedPosition.y) < 1.3;
    distortionPass.enabled = visible;
    if (!visible) return;
    distortionPass.uniforms.uCenter.value.set(projectedPosition.x * 0.5 + 0.5, projectedPosition.y * 0.5 + 0.5);
    distortionPass.uniforms.uStrength.value = requestedStrength;
    distortionPass.uniforms.uRadius.value = requestedRadius;
    distortionPass.uniforms.uTime.value = elapsedTime;
  }

  return {
    composer,
    /** How many frames have gone through the composer rather than past it. */
    get composedFrames() { return frames; },
    render(deltaSeconds = 0, active = true) {
      renderer.info.reset();
      if (!active) {
        distortionPass.enabled = false;
        renderer.render(scene, camera);
        return false;
      }
      const safeDelta = Number.isFinite(deltaSeconds) ? THREE.MathUtils.clamp(deltaSeconds, 0, 0.05) : 0;
      elapsedTime += safeDelta;
      updateDistortion();
      composer.render(safeDelta);
      frames += 1;
      return true;
    },
    setSize(width, height) {
      const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
      const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
      const nextPixelRatio = renderer.getPixelRatio();
      if (Math.abs(composerPixelRatio - nextPixelRatio) > 0.0001) {
        composerPixelRatio = nextPixelRatio;
        composer.setPixelRatio(composerPixelRatio);
      }
      composer.setSize(safeWidth, safeHeight);
      distortionPass.uniforms.uAspect.value = safeWidth / safeHeight;
    },
    /** Where the heat shimmer sits and how strong it is, or null for none. */
    setPresentation(value) {
      if (!value) {
        requestedStrength = 0;
        distortionPass.enabled = false;
        return;
      }
      worldPosition.copy(value.position);
      const finite = Number.isFinite(worldPosition.x) && Number.isFinite(worldPosition.y) && Number.isFinite(worldPosition.z);
      requestedStrength = finite && Number.isFinite(value.strength) ? THREE.MathUtils.clamp(value.strength, 0, 1) : 0;
      const radius = value.radius === undefined ? 0.14 : value.radius;
      requestedRadius = Number.isFinite(radius) ? THREE.MathUtils.clamp(radius, 0.04, 0.32) : 0.14;
    },
    dispose() {
      renderer.info.autoReset = true;
      distortionPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}
