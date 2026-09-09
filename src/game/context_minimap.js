import { createMinimap } from './minimap.js';
import { createDungeonMap } from './dungeon_map/view.js';

/** One HUD widget and drag position, with an independent map for each context. */
export function createContextMinimap(root, opts = {}) {
  const outdoor = createMinimap(root, opts);
  if (!opts.dungeon) return outdoor;
  const dungeon = createDungeonMap(outdoor.el, opts);
  const outdoorTitle = outdoor.el?.title;
  let inside = false, frames = 0;
  const active = () => inside ? dungeon : outdoor;
  return {
    el: outdoor.el,
    get box() { return outdoor.box; },
    get canvas() { return active().canvas; }, get liveCanvas() { return active().liveCanvas; },
    get view() { return active().view; }, get span() { return active().span; },
    get last() { return active().last; }, get live() { return active().live; },
    get paints() { return outdoor.paints + dungeon.paints; },
    get lives() { return outdoor.lives + dungeon.lives; }, get frames() { return frames; },
    get readout() { return active().readout; },
    get shown() { return outdoor.shown; },
    get inDungeon() { return inside; },
    get exploration() { return inside ? dungeon.exploration : null; },
    worldAt: (x, y) => active().worldAt(x, y), pixelAt: (x, z) => active().pixelAt(x, z),
    say: outdoor.say,
    setShown(value) { outdoor.setShown(value); dungeon.setShown(inside && value); },
    invalidate() { outdoor.invalidate(); dungeon.invalidate(); },
    update(dt = 0) {
      frames++;
      const layout = typeof opts.dungeon === 'function' ? opts.dungeon() : opts.dungeon;
      const next = !!layout;
      if (next !== inside) {
        inside = next;
        dungeon.setShown(inside && outdoor.shown);
        if (outdoor.el) outdoor.el.title = inside ? dungeon.el?.title || 'Dungeon map' : outdoorTitle;
        if (outdoor.canvas) outdoor.canvas.style.visibility = inside ? 'hidden' : '';
        if (outdoor.liveCanvas) outdoor.liveCanvas.style.visibility = inside ? 'hidden' : '';
        const rd = outdoor.el?.querySelector?.('.rd');
        if (rd) rd.style.visibility = inside ? 'hidden' : '';
        outdoor.invalidate();
      }
      return inside ? dungeon.update(dt, layout) : outdoor.update(dt);
    },
    dispose() { dungeon.dispose(); outdoor.dispose(); },
  };
}
