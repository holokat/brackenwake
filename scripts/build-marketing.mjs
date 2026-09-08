import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist-marketing');
const gameUrl = 'https://brackenwake.cogentgene.workers.dev/?play';
const origin = 'https://brackenwake.com';
const assets = [
  'welcome-sigil.svg',
  'ui/roster-bg.webp',
  'ui/brackenwake-ambient-loop.mp4',
  'ui/brackenwake-og-v1.png',
  'ui/classes/ranger.webp',
  'ui/classes/rogue.webp',
];

// This release includes only the marketing entry and its artwork. The game
// has its own Worker, assets and multiplayer deployment lifecycle.
await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: true,
    rolldownOptions: { input: join(root, 'welcome/index.html') },
  },
  plugins: [{
    name: 'marketing-game-entry',
    transformIndexHtml(html) {
      const entry = 'class="game-button" href="/?play"';
      assert.equal(html.split(entry).length, 2, 'Expected one game entry link');
      return html.replace(entry, `class="game-button" href="${gameUrl}"`);
    },
  }],
});

await rename(join(output, 'welcome/index.html'), join(output, 'index.html'));
for (const asset of assets) {
  await mkdir(dirname(join(output, asset)), { recursive: true });
  await copyFile(join(root, 'public', asset), join(output, asset));
}
const html = await readFile(join(output, 'index.html'), 'utf8');
assert.ok(html.includes(`content="${origin}/ui/brackenwake-og-v1.png"`));
assert.ok(html.includes(`class="game-button" href="${gameUrl}"`));
assert.ok(!html.includes('/src/game/'), 'Marketing must not boot the game');
await writeFile(join(output, '_redirects'), '/welcome / 301\n/welcome/ / 301\n');
console.log(`Marketing build ready: ${output}`);
