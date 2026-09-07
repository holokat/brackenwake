// Everything a player can pick in the Greenwold, read off the forage table,
// and everything that should stand about the zone to make it read as a place:
// the dressing the game already draws, and the dressing still wanted, each
// with the words a modeller needs.
//
//   node scripts/export-greenwold-dressing.mjs
//
// Writes docs/concepts/greenwold/FORAGE-AND-DRESSING.md and
// wiki/site/dressing.html. The forage half is generated from
// src/world/forage.js so a new pickable cannot be left off; the dressing half
// is a table typed here on purpose (it is a design, not a fact about the
// code), checked against the dressing kinds and the props footprints so a
// thing the game already has is marked as had and never asked for twice.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORAGE, weightFor, WET_MOIST } from '../src/world/forage.js';
import { ALL_KINDS } from '../src/world/dressing.js';
import { FOOTPRINT } from '../src/mmo/plans/footprints.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_MD = join(ROOT, 'docs', 'concepts', 'greenwold', 'FORAGE-AND-DRESSING.md');
const OUT_HTML = join(ROOT, 'wiki', 'site', 'dressing.html');

// ---- the forage, read -------------------------------------------------------
const PLACE_WORDS = {
  nearTree: 'at the foot of a tree, within a few metres of the trunk',
  trunk: 'on the trunk itself, at chest height',
  clearing: 'in the open, on grass with no tree over it',
  any: 'anywhere on the ground',
};
/** What the pickable looks like on the ground: the body the game draws, in words for a modeller. */
const LOOK = {
  chanterelle: 'a clump of three to five egg yellow funnel mushrooms, 8 cm, gills running down the stem',
  porcini: 'two fat brown capped mushrooms with pale bulbous stems, 15 cm',
  fly_agaric: 'one red cap with white flecks on a white stem, 12 cm, the poison one everybody knows',
  morel: 'two honeycomb capped mushrooms, brown, 10 cm, spring only',
  oyster_mushroom: 'a shelf of pale grey fans growing out of the bark, 20 cm across',
  honey: 'a wild bee nest in a hollow of the trunk, a dark hole with a comb showing and bees about it',
  blueberry: 'a low bush, 40 cm, blue berries among small leaves',
  blackberry: 'a bramble arch, 1 m, thorned canes with black fruit',
  raspberry: 'a cane bush, 1 m, red fruit',
  wild_strawberry: 'a ground patch of three-lobed leaves with tiny red fruit, 30 cm',
  elderberry: 'a small tree or big bush, 2.5 m, flat heads of black berries',
  rosehip: 'a dog rose bush, 1.5 m, red hips on thorned stems',
  hazelnut: 'a hazel bush, 2.5 m, nuts in green cups',
  wild_garlic: 'a carpet of broad green leaves with white star flowers, 30 cm, under trees',
  nettle: 'a stand of nettles, 80 cm, the plant you learn about once',
  fiddlehead: 'a fern with curled new fronds, 50 cm',
  nut: 'a spread of spiky green chestnut cases on the ground under a tree, some split',
  dandelion: 'a patch of yellow heads and clocks in the grass, 20 cm',
  fig: 'a fig bush, 3 m, broad leaves, purple fruit; only in the wettest meadow',
  wild_ginger: 'a ground plant with heart shaped leaves and a red flower at the base; only in the wettest meadow',
  cacao: 'pods on a trunk; only in the wettest meadow, and a stretch for the Greenwold',
};
const forage = FORAGE.filter((f) => weightFor(f, 'meadow', 0.4) > 0 || weightFor(f, 'meadow', 0.9) > 0).map((f) => ({
  id: f.id, name: f.name, many: f.many, tag: f.tag, difficulty: f.difficulty, seasons: f.seasons.join(', '),
  place: PLACE_WORDS[f.place] || f.place, per: f.per, cluster: f.cluster,
  dry: weightFor(f, 'meadow', 0.4), wet: weightFor(f, 'meadow', 0.9), colour: f.colour, look: LOOK[f.id] || '',
}));
forage.sort((a, b) => (b.dry - a.dry) || a.difficulty - b.difficulty);

// ---- the dressing, designed -------------------------------------------------
const drawn = new Set(ALL_KINDS.filter((k) => k.startsWith('greenwold:')).map((k) => k.split(':')[1]));
/**
 * The dressing table. `id` is the model id it would be filed under; `have`
 * says what the game has today (a code body from dressing_models, a prop in
 * the footprints table, or nothing), worked out below and not typed. `where`
 * is the area of the zone it belongs to and `n` a rough count for the whole
 * zone. `size` is width by depth by height in metres, the footprint row a
 * made model would get.
 */
const T = (area, rows) => rows.map((r) => ({ area, ...r }));
const DRESSING = [
  ...T('Hearthhome, the green', [
    { id: 'water_trough', what: 'a stone trough on the green, water in it, moss on the rim', size: '2 by 0.7 by 0.6', n: 2 },
    { id: 'washing_line', what: 'two posts and a line with shirts and sheets pegged on it, cloth as alpha cards that can sway', size: '5 by 0.2 by 2', n: 3 },
    { id: 'woodpile', what: 'split logs stacked against a wall under a plank, an axe in the block beside it', size: '2 by 0.8 by 1.2', n: 5 },
    { id: 'chopping_block', what: 'a round of oak with an axe sunk in it and chips about', size: '0.6 by 0.6 by 0.5', n: 3 },
    { id: 'herb_bed', what: 'a low raised bed edged with stones, rosemary, sage and lavender in it', size: '2 by 1 by 0.5', n: 4 },
    { id: 'chicken_coop', what: 'a small timber hut with a ramp and a wire run', size: '2 by 1.5 by 1.4', n: 2 },
    { id: 'rain_barrel', what: 'a barrel under a downpipe, the lid off, a dipper on a hook', size: '0.8 by 0.8 by 1.1', n: 6 },
    { id: 'notice_board', what: 'a roofed board on two posts with papers pinned to it (the game can paint the notices)', size: '1.4 by 0.3 by 2.2', n: 1 },
    { id: 'inn_sign', what: 'a round painted sign on a wrought bracket, swinging: the Bracken Arms', size: '0.9 by 0.1 by 0.9', n: 1 },
    { id: 'dovecote', what: 'a tall round dovecote on a stone base, a dozen holes, a pigeon or two', size: '1.6 by 1.6 by 4', n: 1 },
    { id: 'pig_sty', what: 'a low stone pen with a lean-to roof and a trough, mud in the corner', size: '3 by 2.5 by 1.4', n: 1 },
    { id: 'apple_tree', what: 'an orchard apple, 4 m, low spreading crown, fruit as cards in autumn', size: '4 by 4 by 4', n: 12 },
    { id: 'lychgate', what: 'the chapel gate: a timber arch with a little roof over the churchyard path', size: '2.6 by 1.2 by 3', n: 1 },
    { id: 'headstone_row', what: 'the chapel yard: leaning headstones in grass, the same five shapes the sunken chapel uses', size: '0.7 by 0.3 by 1', n: 12 },
    { id: 'village_stocks', what: 'the stocks on the green, empty, a worn seat behind', size: '1.6 by 0.6 by 1', n: 1 },
    { id: 'market_produce', what: 'baskets of apples, cabbages, loaves and cheeses on a stall counter, three sets', size: '1 by 0.5 by 0.4', n: 6 },
    { id: 'lantern_post', what: 'a short timber post with an iron lantern, lit at dusk, for lanes too narrow for the iron lamp post', size: '0.3 by 0.3 by 2.4', n: 10 },
    { id: 'cat', what: 'a cat asleep on a wall or a step (a creature, one idle and a stretch)', size: '0.5 by 0.2 by 0.25', n: 3 },
  ]),
  ...T('The fields and the lanes', [
    { id: 'kissing_gate', what: 'a swing gate in a V of rails at a footpath', size: '1.6 by 1.4 by 1.2', n: 8 },
    { id: 'cattle_trough', what: 'a long stone or timber trough by a gate, water in it', size: '2.4 by 0.6 by 0.6', n: 6 },
    { id: 'plough', what: 'a wooden plough with an iron share left at the headland', size: '2.4 by 1 by 1.1', n: 3 },
    { id: 'harrow', what: 'a timber frame harrow with iron teeth, grass through it', size: '2 by 1.6 by 0.4', n: 2 },
    { id: 'hay_wain', what: 'a four wheeled wagon heaped with hay, shafts down', size: '4 by 2 by 2.6', n: 2 },
    { id: 'shepherds_hut', what: 'a hut on iron wheels with a stove pipe and a step, the door open', size: '3.6 by 2 by 2.8', n: 2 },
    { id: 'sheep', what: 'a sheep (a creature: graze, walk, a startle), in flocks on the pastures and the ring', size: '1 by 0.4 by 0.8', n: 40 },
    { id: 'cow', what: 'a red cow (a creature: graze, walk, a low), in the ox pasture', size: '2 by 0.7 by 1.4', n: 6 },
    { id: 'horse', what: 'a farm horse (a creature) in a paddock, and one in the traces of the mill cart', size: '2.2 by 0.7 by 1.7', n: 3 },
    { id: 'pollard_willow', what: 'a willow cut back to a knuckle head with young rods, along the ditches', size: '3 by 3 by 5', n: 20 },
    { id: 'dead_oak', what: 'a dead oak, bare, a crow on it, at a field corner', size: '8 by 8 by 10', n: 4 },
    { id: 'ivy_stump', what: 'a big stump grown over with ivy', size: '1.6 by 1.6 by 1', n: 8 },
    { id: 'log_pile', what: 'trunks stacked at a lane side waiting for the cart', size: '4 by 1.5 by 1.2', n: 4 },
    { id: 'poppy_patch', what: 'red poppies in the wheat, a ground card patch', size: '3 by 3 by 0.5', n: 30 },
    { id: 'cowslip_patch', what: 'yellow cowslips on the pasture, a card patch', size: '2 by 2 by 0.3', n: 40 },
    { id: 'cow_parsley', what: 'tall white umbels along every lane in spring and summer, a card strip', size: '3 by 0.6 by 1.1', n: 80 },
    { id: 'thistle_clump', what: 'a clump of purple thistles on rough grass', size: '1 by 1 by 0.9', n: 30 },
    { id: 'gorse', what: 'a gorse bush, yellow flowered, on the downs', size: '2 by 2 by 1.5', n: 60 },
    { id: 'bramble_thicket', what: 'a wide bramble tangle at a hedge foot, thorned, dark', size: '3 by 2 by 1.2', n: 30 },
    { id: 'molehills', what: 'a scatter of six molehills, a ground decal with a little height', size: '3 by 3 by 0.2', n: 40 },
    { id: 'puddle', what: 'a lane puddle in a rut, a reflective decal', size: '1.5 by 0.8 by 0', n: 40 },
    { id: 'cart_ruts', what: 'wheel ruts along the lanes, a tiling ground decal', size: '4 by 2 by 0', n: 100 },
    { id: 'rabbit_warren', what: 'a bank with four holes and a bare sand fan', size: '3 by 2 by 0.8', n: 10 },
    { id: 'crow_on_post', what: 'a fence post with a crow on it (the crow is the bird rig, perched)', size: '0.2 by 0.2 by 1.4', n: 10 },
    { id: 'crossroads_gibbet', what: 'a gibbet post with an empty iron cage at the Kingsroad crossing, the Legion\'s notice nailed to it', size: '0.5 by 0.5 by 4.5', n: 1 },
    { id: 'cairn', what: 'a walker\'s cairn of chalk lumps on a hilltop', size: '1 by 1 by 1', n: 6 },
    { id: 'hawthorn', what: 'a hawthorn, 4 m, the tree the Standing Hedge is named for, white in spring and red berried in autumn', size: '4 by 4 by 4', n: 40 },
  ]),
  ...T('The Beech Hangar and the woods', [
    { id: 'charcoal_clamp', what: 'a charcoal burner\'s clamp: a turf covered mound with smoke, a rake and a hut beside', size: '5 by 5 by 2', n: 1 },
    { id: 'saw_pit', what: 'a saw pit with a trunk across it and the long saw left in the cut', size: '4 by 1.5 by 1.2', n: 1 },
    { id: 'coppice_stool', what: 'a hazel stool with a dozen straight rods from it', size: '2 by 2 by 3', n: 30 },
    { id: 'leaf_litter', what: 'a ground decal of beech mast and brown leaves for the wood floor, tiling', size: '4 by 4 by 0', n: 200 },
    { id: 'bluebell_patch', what: 'bluebells under the beeches in spring, a card patch', size: '3 by 3 by 0.4', n: 60 },
    { id: 'bracken', what: 'a bracken stand, waist high, green then rust in autumn', size: '2 by 2 by 1', n: 80 },
    { id: 'foxglove', what: 'three spikes of foxglove at a wood edge', size: '0.6 by 0.6 by 1.4', n: 30 },
    { id: 'mushroom_ring', what: 'a fairy ring of small white mushrooms in a clearing (decorative, not the forage)', size: '3 by 3 by 0.15', n: 6 },
    { id: 'boar_wallow', what: 'a churned mud hollow with hoof marks, a ground body', size: '3 by 2.5 by 0.3', n: 4 },
    { id: 'deer_rub', what: 'a sapling with the bark rubbed off at a metre', size: '0.4 by 0.4 by 3', n: 6 },
    { id: 'hunters_seat', what: 'a high seat: a ladder to a plank platform against a trunk', size: '1.2 by 1.2 by 4', n: 2 },
    { id: 'snare', what: 'a wire snare on a peg at a rabbit run', size: '0.3 by 0.3 by 0.3', n: 6 },
    { id: 'fox_earth', what: 'a hole under roots with feathers about it', size: '1.5 by 1 by 0.6', n: 4 },
    { id: 'birds_nest', what: 'a nest in a fork, eggs in it in spring', size: '0.3 by 0.3 by 0.2', n: 10 },
    { id: 'woodcutters_hut', what: 'a small plank hut with a lean-to woodstore and a fire ring', size: '3 by 2.5 by 2.6', n: 1 },
    { id: 'rope_swing', what: 'a rope from a branch over the river bend with a stick seat', size: '0.2 by 0.2 by 6', n: 1 },
  ]),
  ...T('The river, the mill and the water meadows', [
    { id: 'mooring_post', what: 'a post at the bank with a rope and a ring', size: '0.3 by 0.3 by 1.2', n: 6 },
    { id: 'rowing_boat', what: 'a sound rowing boat pulled up on the bank, oars in it (the sunken chapel has the rotten one)', size: '4 by 1.5 by 0.9', n: 2 },
    { id: 'eel_trap', what: 'a woven willow eel trap on the bank, a funnel basket', size: '0.9 by 0.4 by 0.4', n: 6 },
    { id: 'millstones', what: 'two spare millstones leant against the mill wall', size: '1.4 by 0.5 by 1.4', n: 1 },
    { id: 'sluice_gate', what: 'a timber sluice with a rack and a wheel at the leat', size: '2 by 0.6 by 2', n: 1 },
    { id: 'duck', what: 'a duck (the bird rig at goose size, brown), on the mill pond and the meadow ponds', size: '0.5 by 0.3 by 0.35', n: 12 },
    { id: 'heron', what: 'a grey heron standing in the shallows (the bird rig, tall, a slow flap)', size: '0.6 by 0.6 by 1', n: 2 },
    { id: 'rushes', what: 'a stand of rushes at the water\'s edge, cards', size: '1.5 by 1.5 by 1.2', n: 60 },
    { id: 'yellow_iris', what: 'yellow flag iris at the pond edges in early summer', size: '1 by 1 by 1', n: 20 },
    { id: 'dragonfly', what: 'a dragonfly (a tiny flyer, a dart and hover) over the ponds', size: '0.1 by 0.1 by 0.05', n: 10 },
    { id: 'plank_walk', what: 'a run of planks on posts across the wet ground', size: '6 by 0.8 by 0.4', n: 3 },
    { id: 'flour_sacks', what: 'a stack of flour sacks with dust on them at the mill door', size: '1.2 by 1 by 1', n: 2 },
    { id: 'mill_cart_horse', what: 'the mill cart with the horse in the traces, dozing', size: '5 by 2 by 2.2', n: 1 },
  ]),
  ...T('The chalk hills and the pits', [
    { id: 'chalk_figure', what: 'a giant cut into the turf of the escarpment, white chalk lines 40 m tall, seen from the whole realm (a ground decal on the slope)', size: '30 by 40 by 0', n: 1 },
    { id: 'chalk_boulder', what: 'a rounded white chalk lump with flint in it, three sizes', size: '1.5 by 1.2 by 1', n: 40 },
    { id: 'flint_nodules', what: 'a scatter of black flints on the white, a decal with height', size: '2 by 2 by 0.2', n: 30 },
    { id: 'beacon_brazier', what: 'a hilltop beacon: an iron basket on a post with a ladder, unlit', size: '1.2 by 1.2 by 5', n: 1 },
    { id: 'timber_prop', what: 'pit props: a frame of squared timbers at the mine mouth and along the cut', size: '2.4 by 0.4 by 2.4', n: 8 },
    { id: 'lantern_hook', what: 'an iron hook on a post with a miner\'s lantern, lit', size: '0.3 by 0.3 by 1.8', n: 6 },
    { id: 'kestrel', what: 'a kestrel hovering over the scar (the bird rig, small, a hover)', size: '0.35 by 0.35 by 0.2', n: 2 },
    { id: 'sheep_track', what: 'a worn track along the hillside, a ground decal', size: '10 by 0.6 by 0', n: 20 },
  ]),
  ...T('The Sunken Chapel and the Hollow', [
    { id: 'drowned_wall', what: 'a run of churchyard wall going down into the water, weed on it', size: '4 by 0.5 by 1', n: 6 },
    { id: 'bell_buoy', what: 'a floating marker with a small bell, ringing in the wind', size: '0.6 by 0.6 by 1.2', n: 1 },
    { id: 'mist_bank', what: 'a low mist over the mere at night (VFX, not a model)', size: '', n: 1 },
    { id: 'wanted_poster', what: 'a poster nailed to a tree: the highwayman\'s face and a price', size: '0.4 by 0.05 by 0.6', n: 6 },
    { id: 'gibbet_cage', what: 'an iron cage hung from a branch over the Hollow\'s track, empty', size: '0.6 by 0.6 by 1.8', n: 1 },
    { id: 'tripwire', what: 'a line of cord between two pegs with bells on it at the camp edge', size: '4 by 0.1 by 0.3', n: 3 },
    { id: 'stolen_goods', what: 'a heap of stolen goods under a tarp: a chest, rolled cloth, a clock', size: '2 by 1.5 by 1', n: 2 },
  ]),
  ...T('Coldwake and the Kingsroad', [
    { id: 'duck_pond', what: 'a round pond on Coldwake\'s green with a rail and ducks (the water is a stroke; this is the rail and the ramp)', size: '8 by 8 by 0.6', n: 1 },
    { id: 'maypole', what: 'a tall pole with ribbons on the green', size: '0.4 by 0.4 by 8', n: 1 },
    { id: 'legion_barrier', what: 'a striped timber barrier on trestles across the road at the camp, a lantern on it', size: '5 by 0.6 by 1.2', n: 1 },
    { id: 'watch_fire', what: 'a fire in an iron basket by the road with a soldier\'s stool', size: '1 by 1 by 1', n: 2 },
    { id: 'road_sign', what: 'a Legion road sign: a black board on a post with brass letters', size: '1.2 by 0.2 by 2.4', n: 3 },
    { id: 'tithe_wagon', what: 'the covered wagon with the strongbox (already in the structures list; it belongs on the road)', size: '6 by 2.4 by 3', n: 1 },
  ]),
  ...T('In the air, at night, on the ground', [
    { id: 'butterflies', what: 'white and orange butterflies over the flower patches by day (VFX)', size: '', n: 1 },
    { id: 'fireflies', what: 'fireflies over the water meadows at night (VFX)', size: '', n: 1 },
    { id: 'chimney_smoke', what: 'smoke from every lit chimney (VFX, on the cottage models\' chimney anchors)', size: '', n: 1 },
    { id: 'pollen_motes', what: 'drifting motes in the wood in a shaft of light (VFX)', size: '', n: 1 },
    { id: 'crow_flock', what: 'a flock of crows lifting off a field when you come near (the bird rig, grouped)', size: '', n: 6 },
  ]),
];
const haveWord = (id) => {
  if (drawn.has(id) || drawn.has(id.replace(/_[a-z]$/, ''))) return 'drawn in code';
  if (FOOTPRINT[id]) return 'in the footprints table';
  return 'to make';
};
const rows = DRESSING.map((r) => ({ ...r, have: haveWord(r.id) }));
const want = rows.filter((r) => r.have === 'to make');

// what the game draws already, said once so the reader knows what not to ask for
const DRAWN = [...drawn].sort();
const PROPS_DRESSING = Object.keys(FOOTPRINT).filter((id) => (FOOTPRINT[id][2] || 0) < 2.5).sort();

const date = new Date().toISOString().slice(0, 10);

// ---- markdown ----------------------------------------------------------------
const md = [];
md.push('# The Greenwold: what you can pick, and what should stand about the place');
md.push('');
md.push(`Generated ${date} by scripts/export-greenwold-dressing.mjs. The forage table is read from src/world/forage.js; the dressing table is a design typed in the script and checked against the dressing kinds the game draws and the props footprints, so nothing already had is asked for twice.`);
md.push('');
md.push('## The forage');
md.push('');
md.push(`${forage.length} pickables grow in meadow ground. Each is a clump on the ground or on a trunk, picked with Foraging against its difficulty, in its seasons only, two of each per tree at most, and it regrows in three days. "per" is roughly how many bunches a wooded 64 m chunk carries in season; "dry" and "wet" are the weight in ordinary meadow and in the wettest band (moisture over ${WET_MOIST}), which in the Greenwold is the water meadows.`);
md.push('');
md.push('**In the sculpt world only what a space names grows.** A sculpt world does not roll pickables off its trees; each space carries a `forage` list (id, spot, one or two plants) and `authored_resources.js` stands those. The Greenwold spaces carry 17 such clumps today (the hangar\'s chanterelles, garlic, oyster mushrooms and fiddleheads; strawberries and rosehips at Coldwake and the Long Meadow; blackberries and nettles at the mill and the Hollow; dandelions on the green; nettles and fiddleheads in the water meadows). The woods\' 5,000 trees grow nothing on their own; a rule that seeds the table\'s tree pickables under a space\'s trees is the change that would fill them, and it is not written.');
md.push('');
md.push('| id | name | tag | difficulty | seasons | where it grows | per chunk | cluster | dry | wet | looks like |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of forage) md.push(`| \`${f.id}\` | ${f.name} | ${f.tag} | ${f.difficulty} | ${f.seasons} | ${f.place} | ${f.per} | ${f.cluster[0] === f.cluster[1] ? f.cluster[0] : `${f.cluster[0]} to ${f.cluster[1]}`} | ${f.dry.toFixed(1)} | ${f.wet.toFixed(1)} | ${f.look} |`);
md.push('');
md.push('Every pickable has a code body today (forage.js builds them by colour). A made model per row is the same clump with the leaf and cap shapes real: 300 to 800 triangles, a 512 texture, the row\'s colour as the key. Keep the base on y = 0 and the whole thing under a metre except the bushes.');
md.push('');
md.push('## The dressing the game already draws');
md.push('');
md.push(`Code bodies from dressing_models.js, placed by the dressing system in a generated world and by a space\'s \`rocks\` list in the sculpt world: ${DRAWN.map((k) => `\`${k}\``).join(', ')}. A made model for any of these replaces the code body under the same id.`);
md.push('');
md.push(`Small props already in the footprints table (under 2.5 m), most of them stand-ins until made: ${PROPS_DRESSING.map((k) => `\`${k}\``).join(', ')}.`);
md.push('');
md.push('## The dressing still wanted');
md.push('');
md.push(`${want.length} things, by the part of the zone they belong to, with a rough count for the whole realm and the footprint a model would get (width by depth by height, metres). Creatures are marked; VFX rows are not models. Sizes are for the modeller; a row with no size is not a model.`);
md.push('');
let lastArea = null;
for (const r of rows) {
  if (r.area !== lastArea) { md.push(''); md.push(`### ${r.area}`); md.push(''); md.push('| id | what | size | about how many | status |'); md.push('|---|---|---|---|---|'); lastArea = r.area; }
  md.push(`| \`${r.id}\` | ${r.what} | ${r.size} | ${r.n} | ${r.have} |`);
}
md.push('');
md.push('## The order that changes the zone most');
md.push('');
md.push('1. The ground: cart ruts, puddles, leaf litter, molehills, the sheep tracks, the chalk figure. Decals cost nothing and are what makes a lane a lane.');
md.push('2. The flowers and the rough: poppies in the wheat, cowslips on the pasture, cow parsley on every lane, bracken and bluebells in the hangar, gorse on the downs. Card patches, one texture each.');
md.push('3. The animals that are not fights: sheep on the ring and the pastures, cows in the ox pasture, ducks on the ponds, a heron, crows on posts. The bird rig is one skeleton for four of them.');
md.push('4. The working country: troughs, gates, the plough at the headland, the hay wain, the shepherd\'s hut, the charcoal clamp, the saw pit, the sluice.');
md.push('5. The village small stuff: washing lines, woodpiles, herb beds, the inn sign, the dovecote, the notice board, a cat.');
md.push('6. The ones with a story in them: the crossroads gibbet, the wanted posters, the gibbet cage, the beacon, the bell buoy.');
md.push('');
mkdirSync(dirname(OUT_MD), { recursive: true });
writeFileSync(OUT_MD, md.join('\n'));

// ---- the codex page -----------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = [];
h.push(`<title>Greenwold Forage and Dressing</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"><style>
:root{--ground:#f3ecdc;--panel:#eae1cb;--ink:#23201a;--ink2:#4f4838;--mute:#7d735f;--gold:#8a6d2a;--rule:#cdbf9c;--sel:#e0d2ad;--red:#9b3b2a;--green:#3f6b3a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ground:#15130f;--panel:#1d1a14;--ink:#e8dfc8;--ink2:#c9bda0;--mute:#8d8368;--gold:#c9a75a;--rule:#3a332a;--sel:#2a251c;--red:#d0705c;--green:#7fae72}}
:root[data-theme="dark"]{--ground:#15130f;--panel:#1d1a14;--ink:#e8dfc8;--ink2:#c9bda0;--mute:#8d8368;--gold:#c9a75a;--rule:#3a332a;--sel:#2a251c;--red:#d0705c;--green:#7fae72}
body{background:var(--ground);color:var(--ink);font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;line-height:1.5;margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:40px 28px 90px}
h1,h2,h3{font-family:Cinzel,Georgia,serif;font-weight:600;letter-spacing:.02em;text-wrap:balance;color:var(--ink)}
h1{font-size:34px;margin:0 0 6px}h2{font-size:22px;margin:44px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--rule);color:var(--gold)}h3{font-size:19px;margin:30px 0 6px}
.lede{color:var(--ink2);font-style:italic;margin:0 0 10px;max-width:70ch}
p{max-width:80ch}
.tbl{overflow-x:auto;margin:10px 0 18px}
table{border-collapse:collapse;width:100%;font-size:16px}
th{font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule)}
td{padding:7px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover{background:var(--sel)}
li{max-width:90ch;margin:3px 0}
code{font-family:ui-monospace,Menlo,monospace;font-size:14px;background:var(--panel);padding:1px 5px;border-radius:3px}
.no{color:var(--red);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.yes{color:var(--green);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.todo{color:var(--gold);font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.note{color:var(--mute);font-size:16px}
.count{color:var(--mute);font-size:15px;margin:2px 0 14px}
.back{display:inline-block;margin-bottom:18px;color:var(--gold)}
.swatch{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;margin-right:6px;border:1px solid var(--rule)}
</style><div class="wrap"><a class="back" href="index.html">The codex</a><h1>The Greenwold: what you can pick, and what should stand about the place</h1><p class="lede">The forage read off the table that grows it; the dressing a design, checked against what the game already draws so nothing is asked for twice.</p>`);
h.push(`<h2>The forage <span class="note">${forage.length} pickables</span></h2>`);
h.push(`<p>Each is a clump on the ground or on a trunk, picked with Foraging against its difficulty, in its seasons only, two of each per tree at most, and it regrows in three days. "Per chunk" is roughly how many bunches a wooded 64 m chunk carries in season; "dry" and "wet" are the weight in ordinary meadow and in the wettest band, which in the Greenwold is the water meadows.</p>`);
h.push('<p><span class="todo">In the sculpt world only what a space names grows.</span> A sculpt world does not roll pickables off its trees; each space carries a forage list (id, spot, one or two plants). The Greenwold spaces carry 17 such clumps today. The woods\' 5,000 trees grow nothing on their own; a rule that seeds the tree pickables under a space\'s trees is the change that would fill them, and it is not written.</p>');
h.push('<div class="tbl"><table><thead><tr><th>id</th><th>name</th><th>tag</th><th>difficulty</th><th>seasons</th><th>where it grows</th><th>per chunk</th><th>cluster</th><th>dry</th><th>wet</th><th>looks like</th></tr></thead><tbody>');
for (const f of forage) h.push(`<tr><td><span class="swatch" style="background:${esc(f.colour)}"></span><code>${esc(f.id)}</code></td><td>${esc(f.name)}</td><td>${esc(f.tag)}</td><td class="num">${f.difficulty}</td><td>${esc(f.seasons)}</td><td>${esc(f.place)}</td><td class="num">${f.per}</td><td>${f.cluster[0] === f.cluster[1] ? f.cluster[0] : `${f.cluster[0]} to ${f.cluster[1]}`}</td><td class="num">${f.dry.toFixed(1)}</td><td class="num">${f.wet.toFixed(1)}</td><td>${esc(f.look)}</td></tr>`);
h.push('</tbody></table></div>');
h.push('<p class="note">Every pickable has a code body today. A made model per row is the same clump with the leaf and cap shapes real: 300 to 800 triangles, a 512 texture, the row\'s colour as the key, base on y = 0, under a metre except the bushes.</p>');
h.push('<h2>The dressing the game already draws</h2>');
h.push(`<p>Code bodies, placed by the dressing system in a generated world and by a space's <code>rocks</code> list in the sculpt world: ${DRAWN.map((k) => `<code>${esc(k)}</code>`).join(', ')}. A made model for any of these replaces the code body under the same id.</p>`);
h.push(`<p class="note">Small props already in the footprints table (under 2.5 m), most of them stand-ins until made: ${PROPS_DRESSING.map((k) => `<code>${esc(k)}</code>`).join(', ')}.</p>`);
h.push(`<h2>The dressing still wanted <span class="note">${want.length} things</span></h2>`);
h.push('<p>By the part of the zone each belongs to, with a rough count for the whole realm and the footprint a model would get (width by depth by height, metres). Creatures are marked; VFX rows are not models.</p>');
lastArea = null;
for (const r of rows) {
  if (r.area !== lastArea) { if (lastArea) h.push('</tbody></table></div>'); h.push(`<h3>${esc(r.area)}</h3><div class="tbl"><table><thead><tr><th>id</th><th>what</th><th>size</th><th>about how many</th><th>status</th></tr></thead><tbody>`); lastArea = r.area; }
  const st = r.have === 'to make' ? '<span class="todo">to make</span>' : `<span class="yes">${esc(r.have)}</span>`;
  h.push(`<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.what)}</td><td>${esc(r.size)}</td><td class="num">${r.n}</td><td>${st}</td></tr>`);
}
h.push('</tbody></table></div>');
h.push('<h2>The order that changes the zone most</h2><ol>');
for (const line of ['The ground: cart ruts, puddles, leaf litter, molehills, the sheep tracks, the chalk figure. Decals cost nothing and are what makes a lane a lane.', 'The flowers and the rough: poppies in the wheat, cowslips on the pasture, cow parsley on every lane, bracken and bluebells in the hangar, gorse on the downs. Card patches, one texture each.', 'The animals that are not fights: sheep on the ring and the pastures, cows in the ox pasture, ducks on the ponds, a heron, crows on posts. The bird rig is one skeleton for four of them.', 'The working country: troughs, gates, the plough at the headland, the hay wain, the shepherd\'s hut, the charcoal clamp, the saw pit, the sluice.', 'The village small stuff: washing lines, woodpiles, herb beds, the inn sign, the dovecote, the notice board, a cat.', 'The ones with a story in them: the crossroads gibbet, the wanted posters, the gibbet cage, the beacon, the bell buoy.']) h.push(`<li>${esc(line)}</li>`);
h.push('</ol></div>');
writeFileSync(OUT_HTML, h.join('\n'));

console.log(`${forage.length} pickables in meadow ground; ${rows.length} dressing rows, ${want.length} to make, ${rows.length - want.length} already had; ${DRAWN.length} code-drawn dressing kinds, ${PROPS_DRESSING.length} small props in the footprints table.`);
console.log(`written: ${OUT_MD}\n         ${OUT_HTML}`);
