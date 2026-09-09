/** The public site and game share a hostname, while retaining separate releases. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const legacyPlay = url.pathname === '/' && url.searchParams.has('play');
    const play = url.pathname === '/play' || url.pathname === '/play/';

    if (legacyPlay || play) {
      const canonical = new URL(url);
      canonical.pathname = '/play';
      canonical.searchParams.delete('play');
      if (canonical.hostname === 'www.brackenwake.com') canonical.hostname = 'brackenwake.com';
      if (canonical.href !== url.href) return Response.redirect(canonical.href, 308);
      return env.GAME.fetch(request);
    }

    // Preserve the upgrade request and response, including the existing room identity.
    if (url.pathname.startsWith('/ws/')) return env.GAME.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
    }

    const site = await env.ASSETS.fetch(request);
    if (site.status !== 404) return site;

    // Game bundles and public assets use root-relative URLs. Marketing assets win
    // when present; missing files are streamed from the deployed game collection.
    const game = await env.GAME.fetch(request);
    if (game.headers.get('content-type')?.includes('text/html')) {
      // The game's SPA fallback must not turn an unknown website URL into the game.
      await game.body?.cancel();
      return site;
    }
    await site.body?.cancel();
    return game;
  },
};
