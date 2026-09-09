import {resolve, sep} from 'node:path';
import {realpathSync} from 'node:fs';

/** Invalidate cached editor data without broadcasting an HMR reload to players. */
export function refreshEditorModules(server, root) {
  const roots = new Set([resolve(root), realpathSync(root)]);
  const prefixes = [...roots].flatMap(base => ['src/mmo/spaces', 'public/terrain'].map(dir => resolve(base, dir) + sep));
  let refreshed = 0;
  const seen = new Set();
  for (const [file, modules] of server.moduleGraph.fileToModulesMap) {
    if (!prefixes.some(prefix => file.startsWith(prefix))) continue;
    for (const module of modules) {
      server.moduleGraph.invalidateModule(module, seen);
      refreshed++;
    }
  }
  return refreshed;
}

/** External scripts bypass the save endpoint, so a page navigation must refresh too. */
export function installEditorRefresh(server, root, refreshIndex) {
  server.middlewares.use((req, res, next) => {
    if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
      try {
        refreshIndex();
        refreshEditorModules(server, root);
      } catch (error) {
        server.config.logger.warn(`[editor] could not refresh saved world data: ${error.message}`);
      }
    }
    next();
  });
}
