// Preallocated camera-facing particles for spell fire, smoke and sparks.
//
// PORTED from the studio's src/vfx/spells/createSpellParticleLayer.ts, whose
// own harness (scripts/validate-spell-particle-layer.mjs over there) is the
// reason the guards below are guards and not comments: a zero capacity, an
// atlas that addresses frames it does not have, a NaN position and a write
// past the end all fail loudly instead of corrupting a GPU buffer.
//
// ONE DRAW CALL PER LAYER. The geometry is instanced and its instanceCount is
// the number `commit` was last given, so a layer with nothing alive submits no
// draw at all (mesh.visible goes false).

import * as THREE from 'three';
import { enableSpellBloom } from './bloom.js';

const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function validatedAtlas(atlas) {
  const columns = positiveInteger((atlas && atlas.columns) || 1, 'Atlas columns');
  const rows = positiveInteger((atlas && atlas.rows) || 1, 'Atlas rows');
  const frames = positiveInteger((atlas && atlas.frames) || 1, 'Atlas frames');
  if (frames > columns * rows) throw new Error('Atlas frames cannot exceed its cell count.');
  return { columns, rows, frames };
}

export function createSpellParticleLayer(options) {
  const capacity = positiveInteger(options.capacity, 'Particle capacity');
  const atlas = validatedAtlas(options.atlas);
  const hasTexture = options.texture !== undefined && options.texture !== null;

  if (hasTexture) {
    // Three uploads sRGB textures as SRGB8_ALPHA8, so shader samples arrive in
    // linear sRGB. Alpha stays linear, which is right for a straight-alpha atlas.
    let textureChanged = false;
    if (options.texture.colorSpace === THREE.NoColorSpace) {
      options.texture.colorSpace = THREE.SRGBColorSpace;
      textureChanged = true;
    }
    if (!options.texture.flipY) {
      options.texture.flipY = true;
      textureChanged = true;
    }
    if (textureChanged) options.texture.needsUpdate = true;
  }

  const centers = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const rotations = new Float32Array(capacity);
  const colorsAndAlpha = new Float32Array(capacity * 4);
  const frames = new Float32Array(capacity);
  const stretches = new Float32Array(capacity);
  stretches.fill(1);

  const centerAttribute = new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttribute = new THREE.InstancedBufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);
  const rotationAttribute = new THREE.InstancedBufferAttribute(rotations, 1).setUsage(THREE.DynamicDrawUsage);
  const colorAlphaAttribute = new THREE.InstancedBufferAttribute(colorsAndAlpha, 4).setUsage(THREE.DynamicDrawUsage);
  const frameAttribute = new THREE.InstancedBufferAttribute(frames, 1).setUsage(THREE.DynamicDrawUsage);
  const stretchAttribute = new THREE.InstancedBufferAttribute(stretches, 1).setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0.5, 0.5, 0,
    -0.5, 0.5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setAttribute('aCenter', centerAttribute);
  geometry.setAttribute('aSize', sizeAttribute);
  geometry.setAttribute('aRotation', rotationAttribute);
  geometry.setAttribute('aColorAlpha', colorAlphaAttribute);
  geometry.setAttribute('aFrame', frameAttribute);
  geometry.setAttribute('aStretch', stretchAttribute);
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    defines: hasTexture ? { USE_PARTICLE_ATLAS: 1 } : {},
    uniforms: {
      uMap: { value: hasTexture ? options.texture : null },
      uAtlas: { value: new THREE.Vector3(atlas.columns, atlas.rows, atlas.frames) },
      uHdr: { value: THREE.MathUtils.clamp(finiteOr(options.hdr === undefined ? 1 : options.hdr, 1), 0, 16) },
      uSurfacePoint: { value: new THREE.Vector3() },
      uSurfaceNormal: { value: new THREE.Vector3(0, 1, 0) },
      uSurfaceSoftness: { value: 0 },
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute vec3 aCenter;
      attribute float aSize;
      attribute float aRotation;
      attribute vec4 aColorAlpha;
      attribute float aFrame;
      attribute float aStretch;

      uniform vec3 uSurfacePoint;
      uniform vec3 uSurfaceNormal;

      varying vec2 vUv;
      varying vec4 vColorAlpha;
      varying float vFrame;
      varying float vSurfaceDistance;

      void main() {
        vUv = uv;
        vColorAlpha = aColorAlpha;
        vFrame = aFrame;

        vec2 corner = position.xy;
        corner.y *= aStretch;
        float cosine = cos(aRotation);
        float sine = sin(aRotation);
        corner = mat2(cosine, -sine, sine, cosine) * corner;

        vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
        float worldScale = (
          length(modelMatrix[0].xyz)
          + length(modelMatrix[1].xyz)
          + length(modelMatrix[2].xyz)
        ) / 3.0;
        centerView.xy += corner * max(0.0, aSize) * worldScale;
        vec3 surfaceNormalView = normalMatrix * uSurfaceNormal;
        vec4 surfacePointView = modelViewMatrix * vec4(uSurfacePoint, 1.0);
        // Keep the transformed normal unnormalized: its scale converts the view-space
        // dot product back to the layer-local distance used by uSurfaceSoftness.
        vSurfaceDistance = dot(centerView.xyz - surfacePointView.xyz, surfaceNormalView);
        gl_Position = projectionMatrix * centerView;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uAtlas;
      uniform float uHdr;
      uniform float uSurfaceSoftness;

      varying vec2 vUv;
      varying vec4 vColorAlpha;
      varying float vFrame;
      varying float vSurfaceDistance;

      #ifdef USE_PARTICLE_ATLAS
        vec2 atlasUv(float frameIndex) {
          float column = mod(frameIndex, uAtlas.x);
          float row = floor(frameIndex / uAtlas.x);
          return vec2(
            (column + vUv.x) / uAtlas.x,
            1.0 - (row + 1.0 - vUv.y) / uAtlas.y
          );
        }
      #endif

      void main() {
        vec4 particle;
        #ifdef USE_PARTICLE_ATLAS
          float boundedFrame = clamp(vFrame, 0.0, uAtlas.z - 1.0);
          float firstFrame = floor(boundedFrame);
          float secondFrame = min(firstFrame + 1.0, uAtlas.z - 1.0);
          vec4 firstSample = texture2D(uMap, atlasUv(firstFrame));
          vec4 secondSample = texture2D(uMap, atlasUv(secondFrame));
          float frameBlend = fract(boundedFrame);
          float blendedAlpha = mix(firstSample.a, secondSample.a, frameBlend);
          vec3 blendedPremultiplied = mix(
            firstSample.rgb * firstSample.a,
            secondSample.rgb * secondSample.a,
            frameBlend
          );
          particle = vec4(blendedPremultiplied / max(blendedAlpha, 0.0001), blendedAlpha);
        #else
          vec2 disc = vUv * 2.0 - 1.0;
          float radiusSquared = dot(disc, disc);
          float softEdge = 1.0 - smoothstep(0.2, 1.0, radiusSquared);
          float hotCore = exp(-radiusSquared * 8.0);
          particle = vec4(vec3(0.72 + softEdge * 0.28), softEdge);
          particle.rgb *= 0.72 + hotCore * 0.65;
        #endif

        float surfaceFade = uSurfaceSoftness > 0.0
          ? smoothstep(0.0, uSurfaceSoftness, vSurfaceDistance)
          : 1.0;
        float alpha = particle.a * vColorAlpha.a * surfaceFade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(particle.rgb * vColorAlpha.rgb * uHdr, alpha);
      }
    `,
  });
  // Tone mapping and output conversion belong to the composer's OutputPass.
  material.toneMapped = false;
  if (options.additive) enableSpellBloom(material);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  // Straight-alpha smoke first, then additive flame and sparks, so smoke cannot
  // erase the hot core when several layers share one object origin.
  mesh.renderOrder = options.additive ? 8 : 7;
  mesh.visible = false;

  const attributes = [
    centerAttribute, sizeAttribute, rotationAttribute,
    colorAlphaAttribute, frameAttribute, stretchAttribute,
  ];

  return {
    mesh,
    get capacity() { return capacity; },
    setParticle(index, position, size, rotation, color, opacity, frame, stretch = 1) {
      if (!Number.isInteger(index) || index < 0 || index >= capacity) {
        throw new RangeError(`Particle index ${index} is outside capacity ${capacity}.`);
      }
      const centerOffset = index * 3;
      centers[centerOffset] = finiteOr(position.x, 0);
      centers[centerOffset + 1] = finiteOr(position.y, 0);
      centers[centerOffset + 2] = finiteOr(position.z, 0);
      sizes[index] = Math.max(0, finiteOr(size, 0));
      rotations[index] = finiteOr(rotation, 0);
      const colorOffset = index * 4;
      colorsAndAlpha[colorOffset] = finiteOr(color.r, 0);
      colorsAndAlpha[colorOffset + 1] = finiteOr(color.g, 0);
      colorsAndAlpha[colorOffset + 2] = finiteOr(color.b, 0);
      colorsAndAlpha[colorOffset + 3] = THREE.MathUtils.clamp(finiteOr(opacity, 0), 0, 1);
      frames[index] = THREE.MathUtils.clamp(finiteOr(frame, 0), 0, atlas.frames - 1);
      stretches[index] = THREE.MathUtils.clamp(finiteOr(stretch, 1), 0.05, 16);
    },
    setSurfaceFade(point, normal, softness) {
      const pointIsFinite = Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
      const normalIsFinite = Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z);
      const normalLengthSquared = normalIsFinite ? normal.lengthSq() : 0;
      if (!pointIsFinite || normalLengthSquared < 1e-12 || !Number.isFinite(softness) || softness <= 0) {
        material.uniforms.uSurfaceSoftness.value = 0;
        return;
      }
      material.uniforms.uSurfacePoint.value.copy(point);
      material.uniforms.uSurfaceNormal.value.copy(normal).multiplyScalar(1 / Math.sqrt(normalLengthSquared));
      material.uniforms.uSurfaceSoftness.value = softness;
    },
    commit(count) {
      const committed = THREE.MathUtils.clamp(Math.floor(finiteOr(count, 0)), 0, capacity);
      geometry.instanceCount = committed;
      mesh.visible = committed > 0;
      for (let index = 0; index < attributes.length; index += 1) attributes[index].needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
