# LP1: the forest in facets

Written 2026-09-08 by Fable. The user: "I think I will change the models and
armor etc.. can we change trees to low poly style".

## What it is

A second way to make a tree out of the same species table. Arbor grows one
(tubes, thousands of textured leaf quads); `src/world/lowpoly_trees.js`
builds one out of faceted solids with a colour on every face: a trunk of five
to seven sides that leans and flares at the foot, a canopy of icosahedra
jittered along their own vertices so no two blobs are the same blob, cones
stacked for the conifers, frond strips for the palm, bare tubes in two orders
for the snag, hanging whips under a willow. No texture, no canvas; it runs in
node.

The style is arbor's to choose. `arbor.getTreeStyle()` is `'lowpoly'` at boot;
`?trees=grown` on the URL brings the grown forest back, and
`arbor.setTreeStyle()` drops the prototype cache so a change is a change.
`arbor.prototypeFor` picks the builder, so flora's streamer, the editor's
Trees tab and a space's authored trees all follow it without knowing.

## The seams

- A low poly prototype has the shape `arbor.buildPrototype` returns (`bark`,
  `leaf`, the three materials, `height` off the vertices, `radius` by arbor's
  own trunk rule so the axe collides with the same trunk, `crownRadius`,
  `hasLeaves`) plus `bands`: near, mid and far built directly, not derived.
  `arbor.bandsFor(proto)` hands flora whichever a prototype has; a grown one
  is still cut down by branch order and leaf stride.
- Materials are shared per species (`lowPolyMaterials`), coloured per vertex,
  the leaf hooked to the same wind field as the grass. The palm's fronds are
  drawn from both sides.
- `plan_models.treeProto` and `speciesProto` go through `prototypeFor` now
  (they called `buildPrototype` directly, which would have kept the authored
  trees grown while the forest went faceted).

## Measured

`node src/world/lowpoly_trees.test.mjs`, 115 checks: every species at every
band under budget (near 1400, mid 420, far 90 triangles; the dearest near
band is a willow at 546), no NaN, the foot on the ground, the top inside the
species' height range, seeds repeat and differ, autumn recolours the canopy
and leaves the wood alone, foliage 0 bares an oak, a willow's whips stop
above the turf, the style switch hands out one kind of tree and then the
other.

`node src/world/flora.test.mjs`: the grown baseline stays pinned to
`'grown'`; a last section builds the same 169 chunk boreal worst case low
poly through the real streamer: 673 trees, 95 draw calls, 0.19 M triangles a
frame against 0.79 M grown.

In the browser, on the island (oak, beech, willow): the stand round Haven
drawn near, and the far band 400 m off, both rendered off the hidden tab
through a scratch drop box. Spruce, pine, palm, sakura and dead are measured
in node and not yet looked at in a world.

## Not yet

- The far band is one icosahedron on a stick. Past 140 m that is what a tree
  is, but it is stark when a free camera walks up to it.
- Snow on the canopy: flora tags `snowAmt` on the leaf mesh as before, whatever
  reads it has not been checked against per vertex colour.
