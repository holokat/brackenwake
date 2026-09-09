import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLore, ORIGIN } from './lore/content.mjs';
import { atlasPage, realmPage, storyPage } from './lore/pages.mjs';
import { placePage } from './lore/place-page.mjs';
import { publishedArt } from './lore/art.mjs';

export async function buildLore(output) {
  const lore = readLore(), assets = {};
  const emit = async (path, contents) => { await mkdir(dirname(join(output, path)), { recursive: true }); await writeFile(join(output, path), contents); };
  for (const [kind, source] of [['css', 'atlas.css'], ['js', 'search.js'], ['motion', 'motion.js']]) {
    const contents = await readFile(new URL(`../src/lore/${source}`, import.meta.url));
    const hash = createHash('sha256').update(contents).digest('hex').slice(0, 10);
    const path = `lore/assets/${source.split('.')[0]}-${hash}.${kind === 'css' ? 'css' : 'js'}`;
    await emit(path, contents); assets[kind] = '/' + path;
  }
  const pages = new Map([
    ['lore/index.html', atlasPage(lore, assets)],
    ['lore/story/index.html', storyPage(lore, assets)],
    ...lore.realms.map(realm => [`lore/${realm.id}/index.html`, realmPage(realm, lore, assets)]),
    ...lore.realms.flatMap(realm => realm.places.map(place => [`lore/${realm.id}/${place.id}/index.html`, placePage(place, realm, lore, assets)])),
  ]);
  for (const [path, html] of pages) await emit(path, html);
  await mkdir(join(output, 'lore/art'), { recursive: true });
  for (const spec of publishedArt) await copyFile(new URL(`../public/lore/art/${spec.id}.webp`, import.meta.url), join(output, `lore/art/${spec.id}.webp`));
  const urls = ['/', ...[...pages.keys()].map(path => '/' + path.replace(/index\.html$/, ''))];
  await emit('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path => `<url><loc>${ORIGIN}${path}</loc></url>`).join('')}</urlset>\n`);
  await emit('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  console.log(`Lore: ${lore.realms.length} realms, ${lore.places.length} places, ${pages.size} pages → ${output}`);
  return { lore, pages, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildLore(resolve(process.argv[2] || 'dist-marketing'));
}
