// story_engine.js — evaluates story triggers, remembers answers, applies effects.
// See docs/living-valley.md. Card data lives in stories.js.
//
// Design constraints that shaped this:
//  - Cards must never fire in a burst. One per in-game day, hard-capped, with a
//    quiet period after any card the player dismissed without engaging.
//  - A trigger must never throw. A bad predicate silently disqualifies its card
//    rather than taking the game loop down.
//  - Effects are declarative. The only imperative escape hatch is `act`, which
//    the host wires up — the engine never reaches into the scene itself.

import { STORIES, STORY_BY_ID, CHARACTERS } from './stories.js';

export { STORIES, STORY_BY_ID, CHARACTERS };

const DAY_MS = 1000 * 60 * 60 * 24;
const MIN_GAP_MS = 1000 * 60 * 8;   // never two cards inside eight minutes
const SNUB_GAP_MS = 1000 * 60 * 25; // longer quiet period after one is waved away

// ---------------------------------------------------------------------------
// persistent story state — lives in the save under `story`
// ---------------------------------------------------------------------------
export function blankStory() {
  return {
    seen: {},        // id -> { at, choice }
    flags: {},       // flag -> timestamp set
    rep: {},         // character -> number
    modifiers: [],   // { key, value, until }
    lastCardAt: 0,
    nextEligibleAt: 0,
  };
}

export function normalizeStory(raw) {
  const s = { ...blankStory(), ...(raw && typeof raw === 'object' ? raw : {}) };
  s.seen = s.seen || {}; s.flags = s.flags || {}; s.rep = s.rep || {};
  s.modifiers = Array.isArray(s.modifiers) ? s.modifiers : [];
  return s;
}

// ---------------------------------------------------------------------------
// the snapshot every trigger reads
// ---------------------------------------------------------------------------
// Built fresh each evaluation. Helper METHODS (has, stat, rep, flag…) keep the
// card predicates short and readable, which matters when there are forty of them.
export function buildState(game, farm, story, extra = {}) {
  const inv = game?.inventory || {};
  const stats = game?.stats || {};
  const season = game?.season || { id: 'spring', phase: 0 };
  const now = Date.now();
  return {
    now,
    season: season.id,
    seasonPhase: season.phase ?? 0,
    temp: farm?.temperature ?? game?.temperature ?? 14,
    weather: farm?.weather?.state || 'clear',
    night: (farm?.dayFactor ?? 1) < 0.42,
    coins: game?.coins ?? 0,
    days: stats.days || 0,
    prestige: extra.prestige || 0,
    placedCount: (game?.placed || []).length,
    storageFrac: game?.storageFrac ? game.storageFrac() : 0,
    plantedPlots: (game?.plots || []).filter(Boolean).length,
    ripePlots: extra.ripePlots || 0,
    runningJobs: Object.keys(game?.jobs || {}).length,
    processorCount: extra.processorCount || 0,
    autoWaterCount: extra.autoWaterCount || 0,
    coveredStorage: extra.coveredStorage || 0,
    treesStandingFrac: extra.treesStandingFrac ?? 1,
    lakeFrozen: !!extra.lakeFrozen,
    deerNear: !!extra.deerNear,
    deerCount: extra.deerCount || 0,
    loosePenAnimals: extra.loosePenAnimals || 0,
    foxRaids: extra.foxRaids || 0,
    missedBites: extra.missedBites || 0,
    junkRun: extra.junkRun || 0,
    dryDays: extra.dryDays || 0,
    idleJobDays: extra.idleJobDays || 0,
    powerDeficitNights: extra.powerDeficitNights || 0,
    storageFullEvents: extra.storageFullEvents || 0,

    has: (id, n = 1) => (inv[id] || 0) >= n,
    stat: (k) => stats[k] || 0,
    owns: (id) => (game?.owned || []).includes(id),
    ownsAnimal: (type) => (game?.placed || []).some((e) => e.type === type),
    goodStalled: (id) => !(inv[id] > 0),
    rep: (who) => story.rep[who] || 0,
    flag: (f) => !!story.flags[f],
    seen: (id) => !!story.seen[id],
    daysSinceFlag: (...flags) => {
      const t = flags.map((f) => story.flags[f]).filter(Boolean).sort((a, b) => b - a)[0];
      return t ? (now - t) / DAY_MS : -1;
    },
  };
}

// ---------------------------------------------------------------------------
// picking a card
// ---------------------------------------------------------------------------
function eligible(card, s, story) {
  const rec = story.seen[card.id];
  if (rec && card.once !== false) return false;                       // one-shot, already fired
  if (rec && card.cooldown && s.now - rec.at < card.cooldown) return false;
  try {
    return !!card.when(s);
  } catch {
    return false; // a broken predicate disqualifies its card, never the game
  }
}

export function pickCard(game, farm, story, extra = {}) {
  if (!game) return null;
  const s = buildState(game, farm, story, extra);
  if (s.now < (story.nextEligibleAt || 0)) return null;
  if (s.now - (story.lastCardAt || 0) < MIN_GAP_MS) return null;

  const pool = STORIES.filter((c) => eligible(c, s, story));
  if (!pool.length) return null;
  // one-shots first: a card that can only ever fire once should not lose its
  // slot to an ambient repeat
  const oneshots = pool.filter((c) => c.once !== false);
  const from = oneshots.length ? oneshots : pool;
  const total = from.reduce((a, c) => a + (c.weight || 1), 0);
  let r = Math.random() * total;
  for (const c of from) { r -= (c.weight || 1); if (r <= 0) return c; }
  return from[from.length - 1];
}

// ---------------------------------------------------------------------------
// answering
// ---------------------------------------------------------------------------
// `host` supplies the few things the engine cannot do itself:
//   { game, toast, act(name, value, card, choice), refresh() }
export function canPick(choice, game) {
  if (!choice.needs) return true;
  return Object.entries(choice.needs).every(([id, n]) => (game.inventory[id] || 0) >= n);
}

export function applyChoice(card, choice, story, host) {
  const { game } = host;
  const now = Date.now();

  if (choice.coins) {
    game.coins = Math.max(0, game.coins + choice.coins);
  }
  if (choice.goods) {
    for (const [id, n] of Object.entries(choice.goods)) {
      if (n > 0) game.addGood(id, n);
      else game.inventory[id] = Math.max(0, (game.inventory[id] || 0) + n);
    }
  }
  if (choice.rep) {
    for (const [who, n] of Object.entries(choice.rep)) {
      story.rep[who] = (story.rep[who] || 0) + n;
    }
  }
  if (choice.flag) story.flags[choice.flag] = now;
  if (choice.unlock && !game.owned.includes(choice.unlock)) game.owned.push(choice.unlock);
  if (choice.modifier) {
    const m = choice.modifier;
    story.modifiers = story.modifiers.filter((x) => x.key !== m.key);
    story.modifiers.push({ key: m.key, value: m.value, until: now + (m.days || 1) * DAY_MS });
  }
  if (choice.act && host.act) {
    for (const [name, value] of Object.entries(choice.act)) {
      try { host.act(name, value, card, choice); } catch (e) { /* an action must never break the card */ }
    }
  }

  story.seen[card.id] = { at: now, choice: choice.label };
  story.lastCardAt = now;
  story.modifiers = story.modifiers.filter((m) => m.until > now);
  game.save();
  host.refresh?.();
}

// waving a card away without engaging buys a longer quiet period — the player
// is telling us they are busy
export function dismissCard(card, story, game) {
  const now = Date.now();
  story.seen[card.id] = { at: now, choice: null };
  story.lastCardAt = now;
  story.nextEligibleAt = now + SNUB_GAP_MS;
  game?.save();
}

export function modifier(story, key, fallback = 1) {
  const now = Date.now();
  const m = story.modifiers.find((x) => x.key === key && x.until > now);
  return m ? m.value : fallback;
}
