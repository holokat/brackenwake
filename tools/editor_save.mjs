// The editor's one door to the disk, open only while `vite` is running.
//
// The in game editor (src/game/editor/) writes two kinds of file and no
// others: the spaces it lays out, and the terrain edits the terrain half of it
// paints. Both go through here, because a dev server that will write any path
// a page asks for is a dev server that will overwrite this file.
//
//   POST /__editor/save   { path, json }   writes one file, answers what it wrote
//   GET  /__editor/list                    the spaces on disk, with their counts
//
// WHAT IT WILL WRITE, and nothing else:
//
//   src/mmo/spaces/<id>.json      a space
//   public/terrain/<id>.json      a terrain edit set (the terrain half's own)
//
// Anything else is 400 with the reason in words. `..`, an absolute path, a
// nested folder, a name with a slash or a dot in it, a file that is not .json,
// a path that resolves outside the repo: all refused, and `editor.test.mjs`
// drives every one of them the wrong way as well as the right way.
//
// AFTER A SPACE IS WRITTEN the generated index is rewritten, so the new file is
// in the module graph before Vite reloads. That is what makes a space saved at
// 3pm a space the game builds at 3pm, without a manifest fetch and without a
// glob that node cannot run.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import {installEditorRefresh, refreshEditorModules} from './editor_refresh.mjs';

/** The two folders, relative to the repo root, and what may be written in each. */
export const SAVE_DIRS = ['src/mmo/spaces', 'public/terrain'];
/** The folder a space lives in. The only one this file regenerates an index for. */
export const SPACE_DIR = 'src/mmo/spaces';
/** A space or terrain id: letters, digits, dash and underscore, and no more. */
export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
/** How big a single file may be, in bytes. A space of a thousand pieces is 200 kB. */
export const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Where a request's `path` really lands, or why it does not land anywhere.
 *
 * Pure but for `resolve`, so the test drives it with no server and no disk.
 * Returns { ok: true, dir, id, abs } or { ok: false, why }.
 */
export function safePath(root, path) {
  if (typeof path !== 'string' || !path) return { ok: false, why: 'no path was asked for' };
  if (path.includes('\0')) return { ok: false, why: 'that path has a null in it' };
  const norm = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const cut = norm.lastIndexOf('/');
  const dir = cut < 0 ? '' : norm.slice(0, cut);
  const file = cut < 0 ? norm : norm.slice(cut + 1);
  if (!SAVE_DIRS.includes(dir)) {
    return { ok: false, why: `"${path}" is not in ${SAVE_DIRS.join(' or ')}, and those are the only two folders the editor may write` };
  }
  if (!file.endsWith('.json')) return { ok: false, why: `"${file}" is not a .json file` };
  const id = file.slice(0, -5);
  if (!ID_RE.test(id)) return { ok: false, why: `"${id}" is not a name: letters, digits, dash and underscore only` };
  const abs = resolve(root, dir, file);
  // The belt to the braces above: even with the folder and the name checked,
  // the resolved path has to be inside the repo, or a root with a symlink in it
  // could still take a write out of the tree.
  const inside = resolve(root, dir) + sep;
  if (!abs.startsWith(inside)) return { ok: false, why: `"${path}" resolves outside the repository` };
  return { ok: true, dir, id, abs };
}

/** The space ids on disk, sorted. */
export function spaceIdsOnDisk(root) {
  const dir = resolve(root, SPACE_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => ID_RE.test(id)).sort();
}

/** The generated list.js, as text, for the ids given. */
export function spaceIndexSource(ids) {
  const lines = [
    '// GENERATED. Do not write this file by hand.',
    '//',
    "// The editor's save endpoint (tools/editor_save.mjs, wired up in",
    '// vite.config.js) rewrites this file every time a space is written to disk, so',
    '// the import graph is STATIC: one `import` per space file, the same in node and',
    '// in the browser, with no glob, no manifest fetch and no directory read at',
    '// runtime. That is what lets `src/mmo/spaces/spaces.test.mjs` and the running',
    '// game load exactly the same spaces the same way.',
    '//',
    '// A new space appears here the moment it is saved. Vite reloads the module and',
    '// the world rebuilds around it.',
    '',
  ];
  const safe = ids.filter((id) => ID_RE.test(id));
  for (const id of safe) lines.push(`import ${varOf(id)} from './${id}.json' with { type: 'json' };`);
  if (safe.length) lines.push('');
  lines.push(`export const FILES = {${safe.length ? '\n' + safe.map((id) => `  '${id}': ${varOf(id)},`).join('\n') + '\n' : ''}};`);
  lines.push('');
  return lines.join('\n');
}

/** A JavaScript name for a space id, which may carry a dash. */
export const varOf = (id) => 'sp_' + id.replace(/[^a-z0-9_]/gi, '_');

/** Rewrite the generated index from what is on disk. Answers the ids it wrote. */
export function writeSpaceIndex(root) {
  const ids = spaceIdsOnDisk(root);
  writeFileSync(resolve(root, SPACE_DIR, 'list.js'), spaceIndexSource(ids), 'utf8');
  return ids;
}

/**
 * Write one file. `json` is an object or a string of JSON; either way what
 * lands on disk is pretty printed, because these files are read and edited by
 * hand as often as by the editor.
 */
export function saveEditorFile(root, path, json) {
  const at = safePath(root, path);
  if (!at.ok) return { ok: false, status: 400, text: at.why };
  let text;
  try {
    const value = typeof json === 'string' ? JSON.parse(json) : json;
    if (!value || typeof value !== 'object') return { ok: false, status: 400, text: 'that is not an object, so there is nothing to save' };
    text = JSON.stringify(value, null, 2) + '\n';
  } catch (err) {
    return { ok: false, status: 400, text: 'that is not JSON: ' + (err && err.message) };
  }
  if (Buffer.byteLength(text) > MAX_BYTES) {
    return { ok: false, status: 400, text: `that file is ${Math.round(Buffer.byteLength(text) / 1024)} kB and the limit is ${MAX_BYTES / 1024} kB` };
  }
  mkdirSync(resolve(root, at.dir), { recursive: true });
  writeFileSync(at.abs, text, 'utf8');
  const out = { ok: true, status: 200, path: `${at.dir}/${at.id}.json`, bytes: Buffer.byteLength(text), id: at.id, dir: at.dir };
  if (at.dir === SPACE_DIR) out.spaces = writeSpaceIndex(root);
  out.text = `wrote ${out.path}, ${out.bytes} bytes`;
  return out;
}

/** Every space on disk, with enough of each to fill a list. */
export function listSpaces(root) {
  const out = [];
  for (const id of spaceIdsOnDisk(root)) {
    try {
      const j = JSON.parse(readFileSync(join(resolve(root, SPACE_DIR), id + '.json'), 'utf8'));
      out.push({
        id, name: j.name || id, at: j.at || null, radius: j.radius || 0, note: j.note || '',
        counts: {
          pieces: (j.pieces || []).length, runs: (j.runs || []).length, areas: (j.areas || []).length,
          trees: (j.trees || []).length, rocks: (j.rocks || []).length, markers: (j.markers || []).length,
          people: (j.people || []).length, spawns: (j.spawns || []).length,
        },
      });
    } catch (err) { out.push({ id, broken: String(err && err.message) }); }
  }
  return out;
}

/** Read one space off disk, or null. The editor's Reload. */
export function readSpace(root, id) {
  if (!ID_RE.test(String(id))) return null;
  try { return JSON.parse(readFileSync(join(resolve(root, SPACE_DIR), id + '.json'), 'utf8')); } catch { return null; }
}

const body = (req) => new Promise((res, rej) => {
  let n = 0; const parts = [];
  req.on('data', (c) => { n += c.length; if (n > MAX_BYTES) { rej(new Error('too much')); req.destroy(); } else parts.push(c); });
  req.on('end', () => res(Buffer.concat(parts).toString('utf8')));
  req.on('error', rej);
});

/**
 * The Vite plugin. Dev only: `apply: 'serve'` means it is not in the build, so
 * a deployed Brackenwake has no write endpoint at all.
 */
export function editorSavePlugin(root = process.cwd()) {
  return {
    name: 'kaldera-editor-save',
    apply: 'serve',
    configureServer(server) {
      installEditorRefresh(server, root, () => writeSpaceIndex(root));
      const send = (res, status, obj) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      server.middlewares.use('/__editor/list', (req, res, next) => {
        if (req.method !== 'GET') return next();
        try { send(res, 200, { ok: true, spaces: listSpaces(root) }); }
        catch (err) { send(res, 500, { ok: false, text: String(err && err.message) }); }
      });
      server.middlewares.use('/__editor/save', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let payload;
        try { payload = JSON.parse(await body(req)); }
        catch (err) { return send(res, 400, { ok: false, text: 'the request was not JSON: ' + (err && err.message) }); }
        const out = saveEditorFile(root, payload && payload.path, payload && payload.json);
        if (out.ok) {
          server.config.logger.info(`[editor] ${out.text}`);
          // vite.config.js keeps the watcher off the space folders so a save
          // does not reload every tab, which also meant Vite's module graph
          // never heard about the write and served the OLD JSON on the next
          // load until the server was restarted (2026-09-08, twice in a day).
          // The written file and the index are dropped from the graph here, so
          // the next request re-reads them and nothing is reloaded now.
          let dropped = 0;
          try {
            dropped = refreshEditorModules(server, root);
          } catch (err) { server.config.logger.warn(`[editor] could not refresh the module graph: ${err && err.message}`); }
          out.refreshed = dropped;
        } else server.config.logger.warn(`[editor] refused: ${out.text}`);
        send(res, out.status, out);
      });
      // The index is rewritten at boot too, so a space file dropped in by hand
      // while the server was down is in the graph the next time it starts.
      try { writeSpaceIndex(root); } catch (err) { server.config.logger.warn(`[editor] could not write the space index: ${err && err.message}`); }
    },
  };
}
