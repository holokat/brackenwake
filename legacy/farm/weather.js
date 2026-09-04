// Pure weather + wind model (no THREE imports). The farm owns an instance,
// ticks it each frame with the current season + temperature, and renders the
// result (precipitation particles, fog/light dimming, wind-driven sway).
//
// WIND lives here too, single-sourced: it's an ambient vector every system
// reads (turbine/windmill spin, tree/flag sway, and later power + wind-chill).

const WEATHER_TABLES = {
  spring: [['clear', 30], ['cloudy', 25], ['rain', 30], ['fog', 5], ['storm', 5], ['snow', 5]],
  summer: [['clear', 55], ['cloudy', 20], ['rain', 15], ['storm', 10]],
  fall:   [['clear', 25], ['cloudy', 30], ['rain', 25], ['fog', 15], ['storm', 5]],
  winter: [['clear', 22], ['cloudy', 26], ['snow', 42], ['fog', 10]],
};

// target haze/precip intensity per state (0..1)
const STATE_INTENSITY = { clear: 0, cloudy: 0.16, fog: 0.14, rain: 0.75, snow: 0.7, storm: 1 };

function pickWeighted(table, r) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [id, w] of table) { x -= w; if (x <= 0) return id; }
  return table[0][0];
}

export class WeatherMachine {
  constructor(rng) {
    this.rng = typeof rng === 'function' ? rng : Math.random;
    this.season = 'spring';
    this.state = 'clear';
    this.intensity = 0;        // eased haze/precip strength
    this.precip = null;        // 'rain' | 'snow' | null
    this._target = 0;
    this._next = 0;            // next state-change time (ms)
    this.wind = {
      dir: this.rng() * Math.PI * 2,   // heading the wind blows toward (radians)
      target: this.rng() * Math.PI * 2,
      strength: 0.35,                  // 0 calm … 1 gale
      gust: 0,
      _gustNext: 0, _gustPeak: 0, _gustAmt: 0, _dirNext: 0,
    };
    this._seed = this.rng() * 1000;
  }

  setSeason(id) { this.season = id || 'spring'; }

  // now = wall-clock ms; temperature = °C-ish. Returns the current state.
  tick(now, temperature) {
    // --- discrete weather state on a timer, weighted by season ---
    if (!this._next) this._next = now + 20000 + this.rng() * 20000;
    if (now >= this._next) {
      let s = pickWeighted(WEATHER_TABLES[this.season] || WEATHER_TABLES.spring, this.rng());
      if (s === 'rain' && temperature <= 0) s = 'snow';   // freezing → snow not rain
      if (s === 'snow' && temperature > 1.5) s = 'rain';   // too warm → rain not snow
      this.state = s;
      this._next = now + 30000 + this.rng() * 75000;
    }
    this._target = STATE_INTENSITY[this.state] ?? 0;
    this.precip = (this.state === 'rain' || this.state === 'storm')
      ? (temperature <= 0 ? 'snow' : 'rain')
      : (this.state === 'snow' ? 'snow' : null);
    this.intensity += (this._target - this.intensity) * 0.02; // smooth ease in/out

    // --- wind (continuous, always blowing a little) ---
    const w = this.wind;
    const t = now / 1000;
    let base = 0.32 + 0.26 * Math.sin(t * 0.021 + this._seed) + 0.14 * Math.sin(t * 0.077 + this._seed * 2);
    base = Math.max(0.06, base);
    if (now >= w._gustNext) {
      w._gustNext = now + 3000 + this.rng() * 7000;
      w._gustPeak = now + 400 + this.rng() * 700;
      w._gustAmt = 0.18 + this.rng() * 0.4;
    }
    if (w._gustPeak) w.gust = Math.max(0, 1 - Math.abs(now - w._gustPeak) / 1100) * (w._gustAmt || 0);
    const stormBoost = this.state === 'storm' ? 0.4 : 0;
    w.strength = Math.min(1, base + w.gust + stormBoost);
    if (now >= (w._dirNext || 0)) { w.target = this.rng() * Math.PI * 2; w._dirNext = now + 20000 + this.rng() * 40000; }
    let da = w.target - w.dir; da = Math.atan2(Math.sin(da), Math.cos(da));
    w.dir += da * 0.0025;
    return this.state;
  }
}

export const WEATHER_LABEL = {
  clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', fog: 'Fog', storm: 'Storm',
};
export const WEATHER_ICON = {
  clear: '', cloudy: '☁️', rain: '🌧️', snow: '🌨️', fog: '🌫️', storm: '⛈️',
};
