import { MODES, toolsFor, heightOf, PROP_HEIGHT } from './modes.js';
import { LISTS, labelOf, pointOf } from './space_doc.js';
import { PERSON } from '../../mmo/story.js';

export const SEARCH_LIMIT = 30;
export const SEARCH_SCOPES = [['all', 'All'], ['library', 'Library'], ['placed', 'Placed'], ['places', 'Places']];
const normal = text => String(text || '').replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (...values) => normal(values.filter(Boolean).join(' '));
const extraLists = ['forage', 'stations', 'living'];
const titleOf = (list, e) => (list === 'people' && PERSON[e.name]?.name) || e.name || e.label || e.model || e.species || e.kind || e.id || labelOf(list, e);

/** Metadata only. No models, thumbnails, scene traversal or work in the frame loop. */
export function buildSearchIndex(spaces, options = {}) {
  const rows = [], seen = new Set();
  for (const mode of MODES) for (const tool of toolsFor(mode.id, options)) {
    const key = `library:${tool.tab}:${tool.brush || ''}:${tool.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, scope: 'library', label: tool.label, detail: `${mode.label} · Select tool`, tool,
      name: normal(tool.label), text: words(tool.id, tool.label, tool.hint, mode.label, tool.tab) });
  }
  for (const space of spaces) {
    rows.push({ key: `place:${space.id}`, scope: 'places', label: space.name || space.id,
      detail: `Place · ${space.id}`, spaceId: space.id, name: normal(space.name || space.id),
      text: words(space.id, space.name, space.note, space.realm, space.kind) });
    for (const list of [...LISTS, ...extraLists]) (space[list] || []).forEach((entry, index) => {
      const point = pointOf(list, entry);
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return;
      const label = titleOf(list, entry);
      rows.push({ key: `placed:${space.id}:${list}:${index}`, scope: 'placed', label,
        detail: `${space.name || space.id} · ${list}`, spaceId: space.id, list, entry,
        name: normal(label), text: words(label, entry.name, entry.model, entry.species, entry.kind, entry.id, entry.role, entry.note, list, space.name, space.id) });
    });
  }
  return rows;
}

export function searchIndex(rows, query, scope = 'all', limit = SEARCH_LIMIT) {
  const q = normal(query), tokens = q.split(' ').filter(Boolean), found = [];
  for (const row of rows) {
    if (scope !== 'all' && row.scope !== scope) continue;
    if (!tokens.every(token => row.text.includes(token))) continue;
    const score = q ? (row.name === q ? 0 : row.name.startsWith(q) ? 1 : row.name.includes(q) ? 2 : 3) : row.scope === 'places' ? 0 : 1;
    found.push({ row, score });
  }
  found.sort((a, b) => a.score - b.score || a.row.label.localeCompare(b.row.label) || a.row.key.localeCompare(b.row.key));
  return { total: found.length, rows: found.slice(0, limit).map(r => r.row) };
}

/** Resolve against live arrays before opening, so a deleted row cannot select its neighbour. */
export function locateResult(result, spaces) {
  const space = spaces.find(s => s.id === result.spaceId);
  if (!space) return null;
  if (result.scope === 'places') return { space, point: space.at, selection: null };
  const index = (space[result.list] || []).indexOf(result.entry);
  if (index < 0) return null;
  const point = pointOf(result.list, space[result.list][index]);
  return { space, point: { x: space.at.x + point.x, z: space.at.z + point.z },
    selection: LISTS.includes(result.list) ? { list: result.list, index } : null };
}

export function modeForResult(row) {
  if (row.tool) return row.tool.mode;
  if (row.list === 'pieces' || row.list === 'runs') return heightOf(row.entry.model) >= PROP_HEIGHT ? 'buildings' : 'objects';
  return { trees: 'foliage', rocks: 'objects', people: 'people', spawns: 'creatures', markers: 'markers', areas: 'paint' }[row.list] || 'markers';
}

/** Keep the actual fly controller's angles in sync; the next frame preserves this view. */
export function focusSearchPoint(ctx, point, reach = 16) {
  const camera = ctx.sc?.camera;
  if (!camera || !ctx.dev?.on) return false;
  const height = (x, z) => ctx.runtime?.heightAt?.(x, z) || 0;
  const y = height(point.x, point.z), range = Math.max(12, Math.min(90, reach));
  camera.position.set(point.x, Math.max(y + range * .75, height(point.x, point.z + range) + 3), point.z + range);
  ctx.camera.yaw = Math.PI;
  ctx.camera.pitch = Math.atan2(camera.position.y - y, range);
  camera.lookAt(point.x, y, point.z);
  camera.updateMatrixWorld(true);
  return true;
}
