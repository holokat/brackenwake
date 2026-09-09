// Local, read-only rendering of the real templates while artwork is generated.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { readLore, escapeHtml as e } from '../../scripts/lore/content.mjs';
import { artPath } from '../../scripts/lore/art.mjs';
import { atlasPage, realmPage, storyPage } from '../../scripts/lore/pages.mjs';
import { placePage } from '../../scripts/lore/place-page.mjs';
const origin = 'http://localhost:8797';
const assets = { css: '/lore/assets/atlas.css', js: '/lore/assets/search.js', motion: '/lore/assets/motion.js' };
const lore = readLore();
const pages = new Map([
  ['/lore/', () => atlasPage(lore, assets)],
  ['/lore/story/', () => storyPage(lore, assets)],
  ...lore.realms.map(realm => [`/lore/${realm.id}/`, () => realmPage(realm, lore, assets)]),
  ...lore.realms.flatMap(realm => realm.places.map(place => [`/lore/${realm.id}/${place.id}/`, () => placePage(place, realm, lore, assets)])),
]);
const mobileReview = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Illustrated lore mobile review</title><style>body{margin:0;background:#30352f;color:#eee;font:14px system-ui}nav{padding:12px;display:flex;gap:24px}a{color:#eedaaa}iframe{display:block;width:390px;height:844px;margin:16px auto;border:1px solid #aaa}</style></head><body><nav><a href="/lore/" target="mobile">Atlas</a><a href="/lore/frostreach/" target="mobile">Frostreach</a><a href="/lore/frostreach/coldseat/" target="mobile">Coldseat</a><a href="/lore/saltmarch/" target="mobile">Long realm title</a></nav><iframe title="Actual lore page at 390 pixels" name="mobile" src="/lore/"></iframe></body></html>`;
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    if (req.method === 'POST' && path === '/audit-result') {
      if (req.headers.origin !== origin) { res.writeHead(403); res.end(); return; }
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 250000) { res.writeHead(413); res.end(); return; } }
      const evidence = JSON.parse(raw);
      if (!Array.isArray(evidence.results) || !Array.isArray(evidence.failures)) { res.writeHead(400); res.end(); return; }
      await writeFile(new URL('../../outputs/lore-browser-audit.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
      res.writeHead(200); res.end('Saved'); return;
    }
    let data, type;
    if (pages.has(path)) { data = pages.get(path)(); type = 'text/html'; }
    else if (path === '/mobile/') { data = mobileReview; type = 'text/html'; }
    else if (path === '/audit/') {
      data = `<!doctype html><html><head><title>Lore responsive audit</title><style>body{margin:20px;background:#132019;color:#eee;font:14px system-ui}button{font:inherit;padding:14px}pre{white-space:pre-wrap}iframe{height:900px;background:#111;border:1px solid #aaa}</style></head><body><h1>Lore responsive audit</h1><button>Check every page</button><pre>Ready to check the real pages at four widths.</pre><iframe title="Real lore page under review"></iframe><script type="application/json" id="paths">${JSON.stringify([...pages.keys()])}</script><script type="module" src="/audit.js"></script></body></html>`; type = 'text/html';
    }
    else if (path === '/audit.js') { data = await readFile(new URL('./illustrated-lore-audit.js', import.meta.url)); type = 'text/javascript'; }
    else if (path.startsWith('/review/')) {
      const realm = lore.realms.find(realm => path === `/review/${realm.id}/`);
      if (!realm) { res.writeHead(404); res.end('Unknown realm'); return; }
      data = `<!doctype html><html><head><title>${e(realm.name)} artwork review</title><style>body{margin:16px;background:#132019;color:#eee;font:14px system-ui}h1{font:24px Georgia}nav{display:flex;gap:18px;margin-bottom:20px}a{color:#d8be84}main{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px}figure{margin:0}img{width:100%;aspect-ratio:3/2;object-fit:contain;background:#29372f}figcaption{padding:10px 0;font-size:14px}small{display:block;color:#b4c5b6;font-size:11px;line-height:1.4}</style></head><body><h1>${e(realm.name)} · Concept art review</h1><nav>${lore.realms.map(item => `<a href="/review/${item.id}/">${e(item.name)}</a>`).join('')}</nav><main>${[{ id: realm.id, name: realm.name, geography: realm.line }, ...realm.places].map(place => `<figure><img src="${artPath(place.id)}" alt="${e(place.name)}"><figcaption>${e(place.name)}<small>${e(place.geography)}</small></figcaption></figure>`).join('')}</main></body></html>`; type = 'text/html';
    }
    else if (path === '/lore/assets/atlas.css') { data = await readFile(new URL('../../src/lore/atlas.css', import.meta.url)); type = 'text/css'; }
    else if (path === '/lore/assets/motion.js') { data = await readFile(new URL('../../src/lore/motion.js', import.meta.url)); type = 'text/javascript'; }
    else if (path === '/lore/assets/search.js') { data = await readFile(new URL('../../src/lore/search.js', import.meta.url)); type = 'text/javascript'; }
    else if (/^\/lore\/art\/[a-z0-9_-]+\.webp$/.test(path) || path === '/welcome-sigil.svg') { data = await readFile(new URL('../../public' + path, import.meta.url)); type = path.endsWith('.webp') ? 'image/webp' : 'image/svg+xml'; }
    else { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type.startsWith('text/') ? `${type}; charset=utf-8` : type, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found.'); }
}).listen(8797, '127.0.0.1', () => console.log(`Illustrated lore preview: ${origin}/lore/`));
