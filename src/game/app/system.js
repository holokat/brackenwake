// The system contract, and the runner that puts systems in order.
//
// A system is one concern: the world, the player, the fight, the windows. It
// is a plain object, it is created once, and it says what it needs by name
// rather than by import, so adding a feature is adding a file to the list in
// main.js and nothing else.
//
//   system = {
//     name: 'combat',
//     deps: ['player'],              // names that must exist before create runs
//     create(ctx) -> instance,       // registered on the context under `name`
//     ready?(ctx),                   // once, after every system has been created
//     hotkeys?(ctx, frame),          // keys that are not movement
//     click?(ctx, ray, frame),       // return truthy to say "I handled it"
//     move?(ctx, frame),             // whoever moves the eye this frame
//     update?(ctx, frame),           // the world and the fight
//     late?(ctx, frame),             // whatever reads what the fight decided
//     render?(ctx, frame),           // the picture
//     save?(ctx),                    // on the save tick and on the way out
//     dispose?(),
//   }
//
// WHY SIX PER FRAME HOOKS AND NOT ONE. The frame is not a list of independent
// updates; it has joints, and the old main.js frame had all of them:
//
//   move    the player walks (or the dev camera flies) before the world can
//           stream around the eye, so `frame.centre` is this frame's, not the
//           last one's.
//   update  the world streams, then the monsters queue, the resolver settles
//           and the bar reacts.
//   late    the pools, the death count, the target ring, the HUD: everything
//           that must read numbers the resolver has already written. A single
//           pass in list order would put the player's pools before the fight
//           that empties them.
//   render  the sky, then the water that reflects it, then the frame itself.
//           Last, always, or the picture is a frame behind what it draws.
//
// Most systems only want `update`. A system that wants none of them is still a
// system: `create` alone is a perfectly good one.
//
// ORDER. `deps` decides the order things are BUILT in; the list decides the
// order they RUN in. They are not the same order and were never the same order:
// the window layer has to exist before the ability bar can ask it whether a
// window is open, and the ability bar still runs after the fight. So `create`
// runs in topological order over `deps` and every per frame hook runs in list
// order, which is the frame order documented in docs/mmo/07-RUNTIME-CONTRACT.md
// and in docs/mmo/wiring/R1.md.
//
// WIRING LATE. A system created early cannot hold a reference to one created
// late, so the later one holds the wire: combat.js registers the death hook
// that calls the player, abilities.js registers the hit hook that bursts an
// effect. Anything called after boot may simply ask `ctx.get(name)` at the
// moment it fires.

/** Every per frame hook, in the order the loop calls them. */
export const PHASES = ['hotkeys', 'click', 'move', 'update', 'late', 'render'];

function validate(s, i) {
  if (!s || typeof s !== 'object') throw new Error(`system ${i} is not an object`);
  if (typeof s.name !== 'string' || !s.name) throw new Error(`system ${i} has no name`);
  if (typeof s.create !== 'function') throw new Error(`system "${s.name}" has no create(ctx)`);
  if (s.deps !== undefined && !Array.isArray(s.deps)) throw new Error(`system "${s.name}" has deps that are not an array`);
  for (const p of [...PHASES, 'ready', 'save', 'dispose']) {
    if (s[p] !== undefined && typeof s[p] !== 'function') throw new Error(`system "${s.name}" has a ${p} that is not a function`);
  }
}

/**
 * Build every system in the list against one context and return the runner.
 *
 * A system whose name is already registered on the context is left alone and
 * used as it stands. That is not a convenience: the world is raised before the
 * character creation screen, because creation.js turns its rig over real
 * ground, so main.js builds the world system first and then builds the rest
 * with the same call and the same list.
 */
export function createSystems(ctx, list) {
  if (!ctx || typeof ctx.register !== 'function') throw new Error('createSystems needs a context from createContext()');
  if (!Array.isArray(list)) throw new Error('createSystems needs a list of systems');

  const byName = new Map();
  list.forEach((s, i) => {
    validate(s, i);
    if (byName.has(s.name)) throw new Error(`two systems are called "${s.name}"`);
    byName.set(s.name, s);
  });

  // ---- the build order: depth first over deps, cycles named out loud -------
  const order = [];
  const mark = new Map();
  const path = [];
  function visit(s) {
    const m = mark.get(s.name);
    if (m === 'done') return;
    if (m === 'open') throw new Error(`system dependency cycle: ${[...path, s.name].join(' -> ')}`);
    mark.set(s.name, 'open');
    path.push(s.name);
    for (const d of s.deps || []) {
      const dep = byName.get(d);
      if (!dep) throw new Error(`system "${s.name}" needs "${d}", which is not in the list (have: ${[...byName.keys()].join(', ')})`);
      visit(dep);
    }
    path.pop();
    mark.set(s.name, 'done');
    order.push(s);
  }
  for (const s of list) visit(s);

  for (const s of order) {
    if (ctx.has(s.name)) continue;              // already standing, see above
    ctx.register(s.name, s.create(ctx) ?? {});
  }

  const each = (hook) => (a, b) => { for (const s of list) s[hook]?.(ctx, a, b); };

  return {
    /** Names in the order they were built. */
    built: order.map((s) => s.name),
    /** Names in the order every frame hook runs them. */
    order: list.map((s) => s.name),

    ready() { for (const s of list) s.ready?.(ctx); },

    hotkeys: each('hotkeys'),
    move: each('move'),
    update: each('update'),
    late: each('late'),
    render: each('render'),

    /** The first system that says it handled the click ends the click. */
    click(ray, frame) {
      for (const s of list) {
        const handled = s.click?.(ctx, ray, frame);
        if (handled) return handled;
      }
      return false;
    },

    save() { for (const s of list) s.save?.(ctx); },
    dispose() { for (let i = list.length - 1; i >= 0; i--) list[i].dispose?.(); },
  };
}
