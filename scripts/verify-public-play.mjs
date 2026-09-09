// Checks the real HTTP and WebSocket routes without opening or modifying a character.
// Usage: node scripts/verify-public-play.mjs [https://brackenwake.com]
import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || 'https://brackenwake.com');
const checks = [];
async function request(path, options = {}) {
  return fetch(new URL(path, origin), {redirect: 'manual', signal: AbortSignal.timeout(20000), ...options});
}
const home = await request('/');
assert.equal(home.status, 200);
assert.match(await home.text(), /class="game-button" href="https:\/\/brackenwake\.com\/play"/);
checks.push('Homepage links to brackenwake.com/play');

const play = await request('/play', {headers: {'Sec-Fetch-Mode': 'navigate', Accept: 'text/html'}});
assert.equal(play.status, 200, 'Game page must stay at /play without a redirect');
const html = await play.text();
assert.match(html, /id="game"/);
assert.match(html, /\/assets\/game-[^" ]+\.js/);
checks.push('Clean game entry serves the production game HTML');

const modules = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.js)"/g)].map(match => match[1]))];
assert(modules.length > 0);
for (const path of modules) {
  const response = await request(path, {method: 'HEAD'});
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /javascript/, path);
}
checks.push(`${modules.length} game entry modules resolve on the same origin`);
for (const [path, type] of [
  ['/models/mmo/human-heavy.glb', /gltf|octet-stream/],
  ['/terrain/island.json', /json/],
  ['/ui/roster-bg.webp', /image/],
]) {
  const response = await request(path, {method: 'HEAD'});
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), type, path);
}
checks.push('Model, terrain and artwork requests resolve');

for (const path of ['/play/?solo=1', '/?play&solo=1']) {
  const response = await request(path);
  assert.equal(response.status, 308, path);
  assert.equal(new URL(response.headers.get('location')).pathname, '/play');
  assert.equal(new URL(response.headers.get('location')).search, '?solo=1');
}
assert.equal((await request('/welcome')).status, 301);
assert.equal((await request('/missing-website-page')).status, 404);
assert.equal((await request('/ws/public-url-check')).status, 426);
checks.push('Canonical redirects, website 404 and WebSocket-only response are correct');

const socketUrl = new URL(`/ws/url-check-${Date.now().toString(36)}`, origin);
socketUrl.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
await new Promise((resolve, reject) => {
  const socket = new WebSocket(socketUrl);
  const timer = setTimeout(() => {socket.close(); reject(Error('WebSocket upgrade timed out'));}, 20000);
  socket.addEventListener('open', () => {clearTimeout(timer); socket.close(1000, 'URL check complete'); resolve();}, {once: true});
  socket.addEventListener('error', () => {clearTimeout(timer); reject(Error('WebSocket upgrade failed'));}, {once: true});
});
checks.push('A real WebSocket upgrades through the game binding; no character or chat was sent');
console.log(JSON.stringify({origin: origin.origin, checks, modules}, null, 2));
