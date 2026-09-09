# Dungeon minimap

The HUD switches to the current dungeon's floor grid on entry and restores the outdoor map on exit. Exiting keeps the character's explored cells and discovered stairs. Re-entering the same floor restores that chart. This includes generated dungeons and caverns, the Shoulder Working, and each Old Cellars depth.

- Nearby cells are mapped within 18 metres of the player's grid cell. Walls stop discovery, including diagonal gaps between touching walls.
- Previously explored ground stays visible in a dimmer colour. A soft gradient fades mapped floor into unmapped ground wherever a route continues. Known walls keep a defined edge.
- Entrances and stairs appear only after discovery. Undiscovered rooms, enemies, chests and outdoor landmarks are not shown.
- The gold arrow uses the same camera heading as the outdoor map. North stays up. The mouse wheel zooms from 48 metres across to the full floor's extent.
- Exploration continues while the widget is hidden. Teleports reveal their destination without mapping the intervening ground.

Exploration is packed into `character.dungeonMaps` and follows the existing five-second autosave, page-hide save, and roster loading paths. Records are separate for each character, dungeon instance, seed and depth. A changed floor grid receives a new chart, so rebuilt dungeons do not inherit stale mapping. Charts use bounded, validated hex bitsets, retaining up to 128 recently updated maps within a one-million-character storage budget.

The map is a plan of the current dungeon level. Bridges and galleries within that level share its floor grid; they are not separate elevation layers.

Implementation is split between `exploration.js` (visibility and persistence), `paint.js` (floor drawing), `view.js` (widget state and input), and `context_minimap.js` (switching between outdoor and dungeon maps). The runtime's actual layout supplies geometry; this feature does not alter dungeon generation, collisions, or network messages.

Run `node --test src/game/dungeon_map/*.test.mjs` for discovery, persistence, renderer and context-switch tests. These tests cover every authored depth and generated dungeon family, saved-character reopening, hidden-map exploration, and idle repaint suppression. The exit regression visits all eight authored island Cellars floors, returns outside after each, regenerates their layouts, and compares every mapped cell. It then saves and reopens the character with a new HUD, checks the remembered floor paint and stairs, and verifies that switching characters neither shares nor erases their charts.

The local page at `/tools/qa/dungeon_minimap.html` renders the same minimap against actual dungeon generators. Its walking controls follow carved routes. It keeps test exploration in memory and does not read or modify character saves. It is not a production build entry.
