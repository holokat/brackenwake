// The infrastructure catalog — merged data + effect helpers.
// infrastructure_a.js holds the 52 FUNCTIONAL items (one effect per category,
// one rung per step); infrastructure_b.js holds the DECOR that has no effect at
// all. retired.js maps everything cut in between onto a survivor.
// See docs/asset-cut-list.txt for why the cut looks like this.

import { INFRA_A } from './infrastructure_a.js';
import { INFRA_B } from './infrastructure_b.js';
import { RETIRED, liveId } from './retired.js';
import { BUILDINGS } from './catalog.js';

export { RETIRED, liveId };

export const INFRA = [...INFRA_A, ...INFRA_B];

export const INFRA_BY_ID = Object.fromEntries(INFRA.map((a) => [a.id, a]));

// a handful of base structures (silo, barns) also carry an effect even though
// they live in the catalog rather than the infra tech tree
const BASE_EFFECT_BY_ID = Object.fromEntries(
  BUILDINGS.filter((b) => b.effect).map((b) => [b.id, b.effect])
);

// HUD grouping: category keys → tab definitions. One tab per effect now.
export const INFRA_TABS = [
  { id: 'wat', label: '💧 Water', cats: ['wat'] },
  { id: 'fld', label: '🌱 Fields', cats: ['fld', 'soil'] },
  { id: 'sto', label: '📦 Storage', cats: ['sto'] },
  { id: 'liv', label: '🐮 Husbandry', cats: ['liv'] },
  { id: 'wrk', label: '⚒️ Workshops', cats: ['wrk'] },
  { id: 'mac', label: '🚜 Machines', cats: ['mac', 'enr'] },
  { id: 'com', label: '🏪 Commerce', cats: ['com'] },
  { id: 'cap', label: '🏛️ Landmarks', cats: ['cap'] },
];

// everything with no effect at all — the decor shelf
export const INFRA_DECOR = INFRA.filter((a) => a.decor);
export const INFRA_FUNCTIONAL = INFRA.filter((a) => !a.decor);

export function infraForTab(tabId) {
  const tab = INFRA_TABS.find((t) => t.id === tabId);
  if (!tab) return [];
  return INFRA.filter((a) => tab.cats.includes(a.cat)).sort((x, y) => x.tier - y.tier || x.price - y.price);
}

export function isInfra(id) {
  return !!INFRA_BY_ID[id];
}

// aggregate the active effects of everything placed on a farm
export function computeEffects(placedEntries) {
  const fx = {
    freeWater: [],     // {x, z, r}
    autoWater: [],     // {x, z, r, everyMs, last: 0}
    autoCollect: [],   // {x, z, r, everyMs, last: 0}
    autoSell: [],      // {everyMs, last: 0}
    yieldZones: [],    // {x, z, r, bonus}
    growthMult: 1,
    craftSpeedMult: 1,        // farm-wide (Tool Shed + Energy)
    craftSpeedFamily: {},     // processor id -> extra mult (Workshops)
    sellBonusPct: 0,
    productionMult: {},   // species -> mult (max, not stacked)
    productionMultAll: 1,
    storageCap: 50,           // produce & goods
    materialCap: {},          // 'wood' | 'stone' -> extra capacity beyond the base
    harvestBonus: {},         // 'wood' | 'stone' -> extra per chop / per break
    prestige: 0,
  };
  for (const entry of placedEntries) {
    const asset = INFRA_BY_ID[entry.type];
    const e = (asset && asset.effect) || BASE_EFFECT_BY_ID[entry.type];
    if (!e) continue;
    switch (e.type) {
      case 'water_aura': fx.freeWater.push({ x: entry.x, z: entry.z, r: e.radius }); break;
      case 'auto_water': fx.autoWater.push({ x: entry.x, z: entry.z, r: e.radius, plots: e.plots || 1, everyMs: e.everyMs, last: 0 }); break;
      case 'auto_collect': fx.autoCollect.push({ x: entry.x, z: entry.z, r: e.radius, everyMs: e.everyMs, last: 0 }); break;
      case 'auto_sell': fx.autoSell.push({ everyMs: e.everyMs, last: 0 }); break;
      case 'yield_bonus': fx.yieldZones.push({ x: entry.x, z: entry.z, r: e.radius, bonus: e.bonus }); break;
      case 'growth_mult': fx.growthMult = Math.min(3, fx.growthMult * e.mult); break;
      case 'craft_speed':
        // no family = farm-wide (Tool Shed, Energy). A family list scopes the
        // bonus to those processors, which is what makes ten workshops a real
        // choice instead of ten copies of the same number.
        if (e.family && e.family.length) {
          for (const proc of e.family) {
            fx.craftSpeedFamily[proc] = Math.min(3, (fx.craftSpeedFamily[proc] || 1) * e.mult);
          }
        } else {
          fx.craftSpeedMult = Math.min(4, fx.craftSpeedMult * e.mult);
        }
        break;
      case 'sell_bonus': fx.sellBonusPct = Math.min(50, fx.sellBonusPct + e.pct); break;
      case 'storage': fx.storageCap += e.cap; break;
      // wood and stone live in their OWN pools, so a morning of chopping can
      // never crowd the harvest out of the barn
      case 'material_storage': fx.materialCap[e.good] = (fx.materialCap[e.good] || 0) + e.cap; break;
      case 'harvest_bonus': fx.harvestBonus[e.good] = (fx.harvestBonus[e.good] || 0) + e.amount; break;
      case 'prestige': fx.prestige += e.amount; break;
      case 'production_mult':
        if (e.species === 'all') fx.productionMultAll = Math.max(fx.productionMultAll, e.mult);
        else for (const s of e.species || []) fx.productionMult[s] = Math.max(fx.productionMult[s] || 1, e.mult);
        break;
      default: break;
    }
  }
  return fx;
}

export function inZone(zones, x, z) {
  return zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) <= zn.r);
}

export function zoneBonus(zones, x, z) {
  return zones.reduce((sum, zn) => sum + (Math.hypot(x - zn.x, z - zn.z) <= zn.r ? zn.bonus : 0), 0);
}

// recipe families, named the way the Craft menu names them
const FAMILY_LABEL = {
  mill: 'milling', bakery: 'baking', creamery: 'dairy', cheese_house: 'cheese',
  preserve_kitchen: 'preserves', smokehouse: 'curing', juicery: 'pressing',
  farm_kitchen: 'cooking',
};

// what one recipe actually runs at: farm-wide speed x this family's workshop
export function craftSpeedFor(fx, processorId) {
  return (fx.craftSpeedMult || 1) * (fx.craftSpeedFamily?.[processorId] || 1);
}

export function effectLabel(asset) {
  // decor has no effect ON PURPOSE — say so, rather than implying it is unfinished
  if (asset.decor) return 'decorative — no effect';
  const e = asset.effect || { type: 'none' };
  switch (e.type) {
    case 'water_aura': return `free watering · ${e.radius}m`;
    case 'auto_water': return `auto-waters ${e.plots || 1} nearby plot${(e.plots || 1) > 1 ? 's' : ''}`;
    case 'auto_collect': return `auto-collects · ${e.radius}m`;
    case 'auto_sell': return 'sells goods automatically';
    case 'yield_bonus': return `+${e.bonus} yield · ${e.radius}m`;
    case 'growth_mult': return `×${e.mult} growth speed`;
    case 'craft_speed': return e.family && e.family.length
      ? `×${e.mult} speed · ${e.family.map((f) => FAMILY_LABEL[f] || f).join(' + ')}`
      : `×${e.mult} craft speed`;
    case 'material_storage': return `+${e.cap} ${e.good} storage`;
    case 'harvest_bonus': return e.good === 'wood'
      ? `+${e.amount} wood from every tree you fell`
      : `+${e.amount} stone from every boulder you break`;
    case 'sell_bonus': return `+${e.pct}% sale prices`;
    case 'storage': return `+${e.cap} storage`;
    case 'prestige': return `+${e.amount} prestige`;
    case 'production_mult': return e.species === 'all'
      ? `×${e.mult} animal production`
      : `×${e.mult} production · ${(e.species || []).join(' & ')}`;
    default: return 'coming soon';
  }
}
