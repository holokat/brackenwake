// The Old Cellars' furnishings. Codex's authoring pass (commit 77cbe8c) made
// dungeon.js import `createCellarFurnishings` from here and never wrote the
// file, which broke the import of every module above it: the game would not
// load. This stands in until the real one lands: it furnishes nothing, and
// dungeon.js already treats a null return as "no furniture".
export function createCellarFurnishings() {
  return null;
}
