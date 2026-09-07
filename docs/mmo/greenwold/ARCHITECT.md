# Greenwold authoring pass

The current canon is `14-KALDERA.md`, the current place brief is
`22-GREENWOLD-SPACES.md`, and the painted map supplies the geography.
The superseded story documents are historical, not a source for new content.

Greenwold must be a walkable landscape with deliberate compositions. Every
location needs an approach, a landmark, something the player can do, and a
legible way out. The character, equipment, and structure model projects stay
outside this pass; existing model IDs remain replacement points.

## Acceptance checks

- All twelve named subareas connected by authored, bidirectional walking routes.
- Roads sampled through the real height field and walked with `stepPlayer`.
- River crossings have a traversable surface. No road ends underwater.
- Cliff faces and high ground frame playable routes and views.
- Trees arranged as specific stands, boundaries, and clearings. No jittered
  grid, random scattering, or random encounter placement in this zone.
- Story people and triggers, waystones, dungeon entrances, resource harvesting,
  and signs use the positions of the authored spaces.
- Forage and ore reach the real inventory and progression code. No decorative
  resource promises. Night encounters tested in daylight and after dark.
- Full automated suite and production build, plus visual review in the user's
  existing Brave window. Use an in-memory playtest character, never a user save.

## Initial findings

The starting draft contains 76 Greenwold spaces and 1,712 terrain strokes.
The woods were generated on jittered grids. The chalk face was a rounded hill.
Story triggers and fast travel still refer to the generated world's layout.
The hand-built NPC rows have null names; story names were left as editor
markers. Forage is disabled in sculpt mode. Placed resource meshes are site
scenery, and the cellar space is not an enterable dungeon site.

The base terrain and user-authored tile spaces are preserved. Changes are
recorded in focused authoring modules and tested against the live runtime.
