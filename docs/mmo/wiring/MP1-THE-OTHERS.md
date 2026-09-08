# MP1: the others. A room per world, and a hand on another player's shoulder

Written 2026-09-08 by Fable. The user: "lets make it multiplayer. set up a
server, test healing on other characters etc".

## What it is

One WebSocket room per world, a Cloudflare Durable Object, deployed with the
same Worker that serves the game. Every client says where its body is ten
times a second; every other client draws that body where it was said to be;
a heal, a group blessing or a cure that lands on another player's body is
carried to that player's client, which applies it to the real one and says
who did it. Monsters are still each client's own. This is presence and
helping hands, not a shared fight yet.

Run it: `npm run server` (wrangler dev on 8787, the room and the built
assets) beside `npm run dev` (Vite on 5198, which proxies `/ws` to 8787).
The deployed game reaches the room on its own origin at `wss://host/ws/<world>`.
`?solo` on the URL leaves the wire off.

## The pieces

- `server/room_logic.mjs` (Codex, GPT-5.5): the room as a pure module, tested
  in node. `join` seats a player under its character's pid; the same character
  arriving again empties the old seat (the socket is closed, the others get a
  `leave`) rather than being numbered `ada#2`. `handle` relays `state` to the
  others, `cast` to its one target as `effect`, `say` to all. `sweep` empties
  seats nobody has spoken from in 45 s; the room's alarm calls it every 20 s.
- `server/room.mjs`: the Durable Object, WebSocket Hibernation API, the
  player kept on the socket's attachment so a hibernated object rebuilds.
- `server/worker.mjs`: `/ws/<world>` to the room by name, everything else to
  the assets. `wrangler.jsonc` carries the binding, the migration and
  `run_worker_first` for `/ws/*`.
- `src/game/net.js`: the client's pure half. `roomNameFor` (the sculpt
  header's world), `helloFor` (id, name, appearance, opening, the bases in
  the hands and on the body), `encodeState`, `createRemotes` (the others and
  their last second of samples, drawn 120 ms behind the newest so there is
  always a next sample to lean on), `createNetClient` (the hello on open,
  reconnect that backs off 1 s to 10 s). 28 checks, against a fake socket and
  against the real room logic.
- `src/game/app/systems/net.js`: the system. A remote body is a real player
  rig off their look, walked by `stepPlayer` toward the wire's point so it
  strides and stops like a player; a plate with the name and a health bar; a
  mirror actor, `faction: 'player'`, `remote: true`, with the pools the wire
  last reported. `others()` feeds `ability_hooks.allies`; `pick` lets the
  cursor choose one (the hover says "tour, a fellow traveller, click to
  choose"); `sendEffect` turns `onAllyEffect` into a `cast`; `takeRemoteEffect`
  on the runtime applies what arrives. A heartbeat on the wall clock keeps a
  hidden tab present. The remotes are timed on the wall clock too: network
  time is wall time, and the frame clock stops in a hidden tab.
- `targeting.set` accepts a friend and keeps them across frames; `con.js` has
  a seventh rung, `friend`, "a fellow traveller", in blue; the target ring
  takes the colour.

## Measured, two tabs on one machine, the user's own character in the room too

- Both tabs joined the island room; each listed the other by name, and a third
  player, `sdf`, who was the user playing at the same time.
- rangertest, Healing 100 with a staff, chose tour (4.5 m off) and cast Heal.
  The healer's log: "Heal. 38 health back to tour." The other tab's log:
  "rangertest heals you with Heal: 38 health back." A screenshot in the
  healer's tab shows the heal ring and "+38" over tour's body on Haven's
  green, with tour's blue plate.
- The friendly target used to clear on the very next frame ("Target cleared."
  in the log); `targeting.update` now lets a friend stand.

## Not yet

- Monsters are per client. Two players see two different bandits. A shared
  fight needs the room to own the spawns, which is the next thing.
- Chat: `chat_box.js`, a draggable parchment box on the HUD (Enter focuses it,
  Escape gives the keys back, it remembers where it was dragged). The room
  relays `say` to everyone. Nostr relays (kind 42 channel messages) would be
  a second transport for the same box, and are not wired.
- The other player's swings and casts are not animated on their body yet;
  only walking, running and standing.
- A player who dies is a plate at 0; resurrection across the wire is not wired.
