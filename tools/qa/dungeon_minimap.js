import { createContextMinimap } from '../../src/game/context_minimap.js';
import { createOldCellars } from '../../src/world/old_cellars.js';
import { createShoulderWorking } from '../../src/world/shoulder_working.js';
import { generateDungeon, worldOf, walkable } from '../../src/world/dungeon_gen.js';

const player = { pos: { x: 0, z: 0 }, yaw: 0 }, camera = { forwardYaw: Math.PI };
let layout, character = {}, path = [], step = 0, walking = false, clock = 0;
const choice = document.getElementById('layout'), report = document.getElementById('report');
const button = document.getElementById('walk');
const map = createContextMinimap(document.getElementById('bw-hud'), {
  player, camera, character: () => character, dungeon: () => layout,
});

function route() {
  const start = layout.entrance.gz * layout.w + layout.entrance.gx;
  const destination = layout.stair || { gx: layout.rooms[7]?.cx ?? layout.rooms[2].cx,
    gz: layout.rooms[7]?.cz ?? layout.rooms[2].cz };
  const end = destination.gz * layout.w + destination.gx;
  const previous = new Int32Array(layout.cells.length).fill(-1), queue = [start];
  previous[start] = start;
  for (let at = 0; at < queue.length && previous[end] < 0; at++) {
    const i = queue[at], x = i % layout.w, z = Math.floor(i / layout.w);
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = (z + dz) * layout.w + x + dx;
      if (!walkable(layout, x + dx, z + dz) || previous[next] >= 0) continue;
      previous[next] = i; queue.push(next);
    }
  }
  if (previous[end] < 0) throw Error('No carved route to the destination');
  const points = [];
  for (let i = end; ; i = previous[i]) {
    points.push(worldOf(layout, i % layout.w, Math.floor(i / layout.w)));
    if (i === start) return points.reverse();
  }
}

function load() {
  const site = { id: 'oldcellars' };
  layout = choice.value === 'mine' ? createShoulderWorking(1, { id: 'shoulder-working' })
    : choice.value === 'generated' ? generateDungeon(1, { id: 'qa-generated', name: 'Generated dungeon', kind: 'dungeon', cx: 3, cz: 7 })
      : createOldCellars(1, site, Number(choice.value));
  path = route(); step = 0; walking = false; player.pos = { ...path[0] };
  camera.forwardYaw = Math.PI; button.textContent = 'Walk onward';
}
choice.addEventListener('change', load);
button.addEventListener('click', () => {
  walking = !walking; button.textContent = walking ? 'Pause' : 'Walk onward';
});
document.getElementById('back').addEventListener('click', () => {
  path = path.slice(0, Math.ceil(step) + 1).reverse(); step = 0; walking = true; button.textContent = 'Pause';
});
document.getElementById('reset').addEventListener('click', () => { character = {}; load(); });
load();
let before = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - before) / 1000); before = now; clock += dt;
  if (walking && step < path.length - 1) {
    step = Math.min(path.length - 1, step + dt * 6);
    const i = Math.floor(step), a = path[i], b = path[Math.min(i + 1, path.length - 1)], t = step - i;
    player.pos = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (a !== b) camera.forwardYaw = Math.atan2(b.x - a.x, b.z - a.z);
  }
  map.update(dt);
  if (clock > .5) {
    const e = map.exploration;
    report.textContent = `${e.seen.reduce((n, v, i) => n + (v && layout.cells[i] === 1 ? 1 : 0), 0)} floor cells mapped · ${map.span} m across`;
    clock = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
