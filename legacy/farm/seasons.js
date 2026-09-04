// Pure, dependency-free season + temperature model (no THREE imports).
//
// Seasons advance on REAL wall-clock time — a season lasts a few real days and
// keeps moving while the game is closed, computed from a persisted `seasonEpoch`.
// game.js owns the persisted epoch; farm.js reads season/temperature to render;
// every other system (power/heating, crop growth, decay, pets, regrow) reads the
// same canonical signal so the environment is single-sourced.

export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_LABEL = { spring: 'Spring', summer: 'Summer', fall: 'Autumn', winter: 'Winter' };
export const SEASON_ICON = { spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️' };

// ~3 real days per season → a full 4-season year ≈ 12 real days. Tunable.
export const SEASON_MS = 3 * 24 * 60 * 60 * 1000;
export const YEAR_MS = SEASON_MS * 4;

// baseline mid-season air temperature (°C-ish); blended across season boundaries
const SEASON_TEMP = { spring: 12, summer: 26, fall: 9, winter: -4 };

// where in [0,1] of a season the temperature starts easing toward the next one
const TEMP_BLEND_START = 0.7;

export function seasonAt(epoch, now) {
  const elapsed = Math.max(0, now - epoch);
  const fIndex = (elapsed % YEAR_MS) / SEASON_MS; // 0..4 through the year
  const index = Math.floor(fIndex) % 4;
  const phase = fIndex - Math.floor(fIndex);       // 0..1 within the season
  return { id: SEASONS[index], index, phase, year: Math.floor(elapsed / YEAR_MS) };
}

// smooth temperature that ramps between seasons rather than snapping — so a cold
// snap can arrive late in autumn (enabling early snow) before winter proper
export function temperatureAt(epoch, now) {
  const { id, index, phase } = seasonAt(epoch, now);
  const cur = SEASON_TEMP[id];
  const next = SEASON_TEMP[SEASONS[(index + 1) % 4]];
  const blend = phase < TEMP_BLEND_START ? 0 : (phase - TEMP_BLEND_START) / (1 - TEMP_BLEND_START);
  return cur + (next - cur) * blend;
}

// day/night light + fog modulation applied ON TOP of the biome theme.
//   sun/fog   : hex the theme color is nudged toward
//   sunMix    : how strongly (0..1)
//   ambient/hemi : intensity multipliers (winter dimmer, summer brighter)
export function seasonTint(id) {
  switch (id) {
    case 'winter': return { sun: 0xcfe0ff, sunMix: 0.55, fog: 0xdfe8f4, fogMix: 0.5, ambient: 0.8, hemi: 0.78 };
    case 'fall':   return { sun: 0xffcf8a, sunMix: 0.38, fog: 0xe9d8bd, fogMix: 0.3, ambient: 0.95, hemi: 0.95 };
    case 'summer': return { sun: 0xfff3cc, sunMix: 0.28, fog: 0xe0f0ea, fogMix: 0.15, ambient: 1.1, hemi: 1.1 };
    default:       return { sun: 0xffffff, sunMix: 0.0, fog: 0xffffff, fogMix: 0.0, ambient: 1.0, hemi: 1.0 }; // spring = neutral
  }
}

// crop/plant growth multiplier by season — winter is near-dormant, which is the
// engine that makes food preservation and stockpiling matter.
export function seasonGrowthFactor(id) {
  switch (id) {
    case 'spring': return 1.35;
    case 'summer': return 1.15;
    case 'fall':   return 0.8;
    case 'winter': return 0.12;
    default: return 1;
  }
}

// seasonal market demand multiplier by good category (fresh vs preserved/hearty)
export function seasonalDemand(kind, id) {
  if (id === 'winter') {
    if (kind === 'preserved') return 1.5;
    if (kind === 'hearty') return 1.4;
    if (kind === 'fresh') return 0.7;
  }
  if (id === 'fall' && (kind === 'preserved' || kind === 'hearty')) return 1.15;
  return 1;
}

// precipitation type from temperature: snow when at/below freezing, else rain
export function precipFor(temperature) { return temperature <= 0 ? 'snow' : 'rain'; }

// baseline temperature for a season id (used by the farm's forceSeason debug override)
export function baseTempFor(id) { return SEASON_TEMP[id] ?? 12; }
