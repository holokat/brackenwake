const ROOM_PATH = /^\/ws\/([a-z0-9_-]{1,40})$/;

export { Room } from './room.mjs';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(ROOM_PATH);
    if (match) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      return env.ROOM.getByName(match[1]).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
