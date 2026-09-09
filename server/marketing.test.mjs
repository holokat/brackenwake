import test from 'node:test';
import assert from 'node:assert/strict';
import marketing from './marketing.mjs';

function setup({site, game} = {}) {
  const calls = [];
  const env = {
    ASSETS: {fetch: async request => {calls.push(['site', request]); return site?.(request) ?? new Response('Missing', {status: 404});}},
    GAME: {fetch: async request => {calls.push(['game', request]); return game?.(request) ?? new Response('Game', {headers: {'content-type': 'text/html'}});}},
  };
  return {calls, fetch: request => marketing.fetch(request instanceof Request ? request : new Request(request), env)};
}

test('the homepage and marketing artwork stay in the site asset collection', async () => {
  const response = new Response('Website'), h = setup({site: () => response});
  assert.equal(await h.fetch('https://brackenwake.com/'), response);
  assert.deepEqual(h.calls.map(([service]) => service), ['site']);
});

test('lore pages and their static assets stay in marketing, without starting the game', async () => {
  for (const path of ['/lore/', '/lore/greenwold/', '/lore/story/', '/lore/assets/search.js', '/sitemap.xml', '/robots.txt']) {
    const response = new Response('Lore'), h = setup({site: () => response});
    assert.equal(await h.fetch('https://brackenwake.com' + path), response);
    assert.deepEqual(h.calls.map(([service]) => service), ['site']);
  }
});

test('the clean play URL uses the existing game without a redirect or request rewrite', async () => {
  const request = new Request('https://brackenwake.com/play?solo=1', {headers: {'Sec-Fetch-Mode': 'navigate'}});
  const response = new Response('Game', {headers: {'content-type': 'text/html'}}), h = setup({game: () => response});
  assert.equal(await h.fetch(request), response);
  assert.deepEqual(h.calls, [['game', request]]);
});

test('legacy links, trailing slashes and www play links canonicalize without losing other options', async () => {
  for (const url of ['https://brackenwake.com/?play&solo=1', 'https://brackenwake.com/play/?solo=1', 'https://www.brackenwake.com/play?solo=1']) {
    const h = setup(), response = await h.fetch(url);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://brackenwake.com/play?solo=1');
    assert.equal(h.calls.length, 0);
  }
});

test('WebSocket upgrades go directly to the game and retain room, query and headers', async () => {
  const request = new Request('https://brackenwake.com/ws/greenwold?version=1', {headers: {Upgrade: 'websocket', Origin: 'https://brackenwake.com'}});
  const response = {status: 101, webSocket: {}}, h = setup({game: () => response});
  assert.equal(await h.fetch(request), response);
  assert.deepEqual(h.calls, [['game', request]]);
});

test('game assets retain streaming bodies, range requests, cache headers and status', async () => {
  const request = new Request('https://brackenwake.com/models/mmo/human-heavy.glb', {headers: {Range: 'bytes=0-3'}});
  const response = new Response(new Uint8Array([1, 2, 3, 4]), {status: 206, headers: {'content-type': 'model/gltf-binary', 'content-range': 'bytes 0-3/400', 'cache-control': 'public, max-age=31536000'}});
  const h = setup({game: () => response});
  assert.equal(await h.fetch(request), response);
  assert.deepEqual(h.calls.map(([service]) => service), ['site', 'game']);
  assert.equal(h.calls[1][1], request);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
});

test('HEAD and conditional asset responses survive forwarding unchanged', async () => {
  const request = new Request('https://brackenwake.com/assets/game.js', {method: 'HEAD', headers: {'If-None-Match': 'game-v1'}});
  const response = new Response(null, {status: 304, headers: {ETag: 'game-v1'}}), h = setup({game: () => response});
  assert.equal(await h.fetch(request), response);
  assert.equal(h.calls[1][1], request);
});

test('unknown website pages remain 404 even when the game has an HTML SPA fallback', async () => {
  const h = setup();
  const response = await h.fetch('https://brackenwake.com/missing-page');
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Missing');
});

test('site errors are preserved and unsupported writes never reach either asset service', async () => {
  const h = setup({site: () => new Response('Unavailable', {status: 503})});
  assert.equal((await h.fetch('https://brackenwake.com/')).status, 503);
  assert.equal(h.calls.length, 1);
  const write = setup(), response = await write.fetch(new Request('https://brackenwake.com/anything', {method: 'POST', body: 'body'}));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.equal(write.calls.length, 0);
});
