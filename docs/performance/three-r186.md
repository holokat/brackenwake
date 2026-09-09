# Three.js r186 upgrade

Brackenwake updates from 0.185.1 to 0.186.0. The npm registry reports the release
at 2026-09-08 19:25:22 UTC, or 9 September at 04:25 in Asia/Tokyo. The package
manifest and npm lockfile both select the stable r186 release.

Official release: https://github.com/mrdoob/three.js/releases/tag/r186
Migration guide: https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186

The migration audit found no custom Object3D subclasses overriding dispose, no
use of toTrianglesDrawMode or SimplifyModifier, and no use of the renamed
LightProbeGrid, Source, or Sky up-uniform APIs in game sources. The game already
uses WebGLRenderer with PCFShadowMap; the removed WebGPU PCFSoftShadowMap path
does not apply. Static shadows, asynchronous room shader preparation, custom
cloth vertex shaders and postprocessing still require rendered verification.

The production build passes on r186. Runtime checks are being completed before
release. This version update is not itself evidence of improved FPS.

## Automated validation

The production build, ten loader tests, six shared banner/achievement tests,
293 existing HUD assertions, 148 audio assertions and the shader/shadow warm-up
tests pass. Achievement tests also exercise gesture unlock, saved volume and
saved mute through the real audio service.

The full npm suite completed with three failing suites. No test thresholds or
authored island content were changed for this update:

- Editor: eight fixture-count assertions fail with both current source and the
  clean previously released source, which contains more authored objects than
  those assertions expect.
- Terrain edits: the timing check measured 3.103 microseconds per sample against
  a 3-microsecond limit. This unchanged sampler has no Three.js dependency. A
  separate rerun measured 4.186 microseconds.
- Wayside: the timing check measured 2.21 milliseconds against a 2-millisecond
  limit. A separate rerun measured 2.89 milliseconds. The prior r185 production
  report already recorded this failure at 2.61 milliseconds.
