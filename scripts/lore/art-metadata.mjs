import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publishedArt, sharedRealmArt, artPrompt, artPath } from './art.mjs';

export function webpDimensions(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 < data.length;) {
    const kind = data.toString('ascii', offset, offset + 4), size = data.readUInt32LE(offset + 4), start = offset + 8;
    if (kind === 'VP8 ') return { width: data.readUInt16LE(start + 6) & 16383, height: data.readUInt16LE(start + 8) & 16383 };
    if (kind === 'VP8X') return { width: data.readUIntLE(start + 4, 3) + 1, height: data.readUIntLE(start + 7, 3) + 1 };
    if (kind === 'VP8L') { const bits = data.readUInt32LE(start + 1); return { width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 }; }
    offset = start + size + (size % 2);
  }
  throw new Error('Unsupported WebP image');
}

export function readArtMetadata(spec) {
  const data = readFileSync(new URL('../../public' + artPath(spec.id), import.meta.url));
  return { id: spec.id, title: spec.title, file: 'public' + artPath(spec.id), ...webpDimensions(data), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), prompt: artPrompt(spec) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const images = publishedArt.map(readArtMetadata);
  const manifest = { generator: 'Built-in image_gen tool', status: 'Concept art for a world in development, not gameplay screenshots', encoding: 'WebP, cwebp quality 84, original composition and dimensions preserved', source: 'src/mmo/realms.js and docs/mmo/14-KALDERA.md', sharedRealmArt, images };
  writeFileSync(new URL('../../docs/art/lore/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Recorded ${images.length} generated illustrations and their prompts.`);
}
