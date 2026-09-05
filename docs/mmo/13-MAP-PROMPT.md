# The map of Brackenwake: an image prompt

The positions below are the world's own (`zones.js`, north up, the origin at the
centre of a 16 km square, the coast between 6.7 and 8 km out). The names are the
ones in the game. The mood is `10-STORY.md`. Use the long prompt as written;
the layout sheet after it is for placing things by hand or for a second pass.

---

## The prompt

A hand-painted fantasy world map of a single island continent called
Brackenwake, seen from directly above, north at the top, in the style of an
illuminated medieval chart crossed with a classic MMO world map: aged parchment
with foxing and a burnt-umber vignette, fine sepia ink linework, muted painted
terrain, gold-leaf accents on the compass rose, the title cartouche and the
border. The continent is roughly round, a little wider than it is tall, its
coast bulging and baying rather than smooth, and it fills most of the frame
with dark teal sea around it drawn with hatched waves that fade to pale
parchment at the edges. Ornate corners, a gold-leaf compass rose in the lower
left sea, a title cartouche in the top border reading BRACKENWAKE in Roman
capitals, a smaller scale bar reading "eight thousand paces" in the lower
right. No modern fonts, no grid lines, no icons that look like a video game UI.

The heart of the continent is a green hedged valley with a slow river winding
through it and a small walled village: THE BRACKEN VALE, painted brighter and
safer than anything around it, tiny field patterns, a mill, a ring of standing
stones drawn as dots around its boundary. Everything grows darker, wilder and
stranger with distance from this valley, in three loose rings.

The inner ring, close around the valley: due north, wheatfields and a water
mill beside a green hill with three black mine mouths, THE MILL RUN. To the
north east, a shallow tidal sound half sand and half water with stone steps
going down into it, SALTMERE. To the south east, reed marsh with a mill wheel
standing in dry grass and something long under the water, THE SEDGE FLATS. Due
south, yellow gorse heath with a row of beehive-shaped brick kilns, all cold,
KILN HEATH. To the south west, a field of a thousand grass burial mounds
arranged in a spiral with one standing stone at its centre, THE GREY BARROWS.
To the north west, dense black-green spruce forest with a single cold campfire
in a clearing, THORNWOOD.

The middle ring, the ruins of the old kingdom: due east, a coastline shattered
into sea stacks and islets with a salvager's camp on the last of the mainland,
THE BROKEN STRAND. To the south east, red rock and white sand with a mine whose
rails have warped, and a straight line of fused glass running across the sand
to the north east, THE EMBER FLATS. Due south, green downs with dark doors set
into the hillsides and a roofless watchtower, THE HOLLOW HILLS. To the south
west, a wood of pale pink blossom with no birds and a single small standing
stone, WITCHWOOD. Due west, bare grey mountain shoulders with blue ore veins
showing on the rock and two mine yards, THE IRON SHOULDER. To the north west,
an ancient forest of enormous trunks drawn as if the trees were towers, THE
LONG DARK. Due north, black burnt heather across a peat moor with one intact
grey stone hall lit by a lamp, ASHEN MOOR. To the north east, rows of carved
standing stones marching up a mountainside to a door the size of a barn, THE
STONE GARDEN.

The outer ring, the edge of the world: east and a little south, a coast of
black glass where the sea steams, with a roofless hall on a headland and a
figure on a throne inside it, CINDERREACH. Far south, a petrified forest around
a mile-wide crater with a shaft at its centre, the trees all leaning away from
it, THE SALLOW WASTES. To the south west, snow down to the waterline with
giants drawn small on the mountainside, one of them seated over a shaft, THE
FROSTCROWN. West and a little north, black rock teeth standing in rows with
nothing between them and a cave mouth strung with web, THE TEETH. Far north,
dark frozen forest with a shaft in the ground and faint ranks of soldiers
standing in the trees, THE NIGHT MARCH. To the north east, a drowned city
visible under clear water off the coast, towers and streets beneath the waves,
and stone steps climbing out of the sea onto a headland with an armoured figure
at the top, THE DROWNED COAST.

Seven small weir marks, a distinct rune like a stepped dam, are inked at the
Mill Run, Saltmere, the Sedge Flats, Kiln Heath, the Broken Strand, the Iron
Shoulder and the Stone Garden, and an eighth, larger and gold, on the Bracken
Vale. A faint dotted "glass road" runs from the Sallow Wastes north east across
the Ember Flats to Cinderreach. Small ink drawings of the four bosses sit in
their regions like the sea monsters on old charts: a king on a glass throne at
Cinderreach, a knight rising from the sea at the Drowned Coast, a spider the
size of a house at the Teeth, and a huge stone construct in the Stone Garden.
Two or three sea serpents in the open water. Ships' wrecks off the Broken
Strand. Tiny towns marked as clusters of roofs with names in small capitals:
Crookwell, Hollowcross, Coldmoor, Marlcross, Longfield, Weircross, Ashbridge,
Brackenwake. Roads as faint dashed lines linking the inner towns and thinning
to nothing at the rim. The palette runs from warm green and gold at the centre
through grey, umber and rust in the middle ring to black glass, bone white
snow, ash and deep sea teal at the edges. Painterly, detailed, legible at a
glance, made to be printed large and pinned on a wall.

## Negative prompt

photorealistic, satellite imagery, 3D render, modern typography, sans-serif,
user interface elements, health bars, minimap, hex grid, square grid, neon,
lens flare, blurry, low detail, cropped continent, text errors, duplicate
labels, watermark.

## Format

Square, 1:1, as large as the generator allows (the world is a 16 km square).
If the tool insists on a landscape frame, keep the continent whole and let the
sea take the extra width; do not stretch the land.

---

## The layout sheet

Positions as the game holds them: x east, z south, in metres from the centre.
On a 1:1 canvas, the centre of the image is (0, 0) and the edge of the canvas
is 8000 m. Radius `r` is the disc a zone owns outright; the country between
zones is the field's own.

| ring | zone | compass | x | z | r | terrain to paint |
| --- | --- | --- | --- | --- | --- | --- |
| heart | The Bracken Vale | centre | 0 | 0 | 1500 | hedged fields, slow river, walled village, boundary stones |
| inner | The Mill Run | N | 0 | -3000 | 950 | wheat, water mill, green hill with three mine mouths |
| inner | Saltmere | NE | 3000 | -2000 | 950 | tidal sound, sand and water, stone steps into the sea |
| inner | The Sedge Flats | SE | 1600 | 2700 | 950 | reed marsh, a mill wheel in dry grass |
| inner | Kiln Heath | S | -100 | 3100 | 950 | yellow gorse, a row of beehive kilns |
| inner | The Grey Barrows | SW | -2700 | 1700 | 950 | a spiral of grass mounds, one standing stone |
| inner | Thornwood | NW | -2500 | -1500 | 950 | dense spruce, one cold fire |
| middle | The Broken Strand | E | 4600 | -300 | 1500 | shattered coast, stacks and islets, boats |
| middle | The Ember Flats | SE | 3200 | 3100 | 1500 | red rock, white sand, a glass road |
| middle | The Hollow Hills | S | 0 | 4300 | 1500 | green downs, doors in hillsides, a watchtower |
| middle | Witchwood | SW | -3100 | 3100 | 1500 | pink blossom wood, one small stone |
| middle | The Iron Shoulder | W | -4400 | 0 | 1500 | bare mountain, blue ore veins, two mine yards |
| middle | The Long Dark | NW | -3100 | -3200 | 1500 | giant ancient trees |
| middle | Ashen Moor | N | -100 | -4300 | 1500 | burnt black heather, one lit stone hall |
| middle | The Stone Garden | NE | 3100 | -3100 | 1500 | rows of carved standing stones, a barn-sized door |
| outer | Cinderreach | E by S | 6100 | 2700 | 2300 | black glass coast, steaming sea, throne hall |
| outer | The Sallow Wastes | S | 1100 | 6500 | 2300 | petrified forest, a crater with a shaft |
| outer | The Frostcrown | SW | -5100 | 4200 | 2300 | snow to the sea, giants on the mountain |
| outer | The Teeth | W by N | -6000 | -2300 | 2300 | black rock teeth in rows, a webbed cave |
| outer | The Night March | N | -1100 | -6500 | 2300 | frozen forest, a shaft, ranks of the dead |
| outer | The Drowned Coast | NE | 5100 | -4200 | 2300 | a drowned city under clear water, steps from the sea |

**The coast.** Mean radius 7100 m, wobbling between 6660 and 7540 m, so the
continent is a rough disc with bays. Sand on most of the shore. The sea floor
is 30 m down by 8000 m: paint deep water at the frame's edge.

**Authored places to mark with a small symbol and a name in small capitals:**

| place | kind | x | z |
| --- | --- | --- | --- |
| the Millrun Adit | mine | -118 | -3076 |
| the Weir Steps | ruin | 3018 | -2139 |
| the Drowned Mill | ruin | 1549 | 2570 |
| Fallow's Adit | cave | -221 | 2615 |
| the Long Barrow | ruin | -2989 | 1618 |
| the Barrow Cellars | dungeon | -2678 | 2039 |
| a cold fire | camp | -2600 | -1598 |
| Crook's Delve | cave | 5060 | -287 |
| the Ember Cut | mine | 3246 | 3477 |
| the Hollow Workings | dungeon | -126 | 4429 |
| the Weir Tower | ruin | -107 | 4209 |
| Fern's Stone | shrine | -3118 | 3239 |
| the Deep Shoulder | mine | -4628 | 124 |
| the Low Shoulder | mine | -4924 | 129 |
| Marl's Seam | cave | -2762 | -3233 |
| the Ashen Steps | dungeon | -201 | -4203 |
| the Grey Hall | ruin | -244 | -4517 |
| the Warden's Cut | dungeon | 3223 | -3033 |
| the Cinder Cut | mine | 5968 | 3550 |
| the Ashen King's Hall | dungeon | 6354 | 2755 |
| the Sallow Fall | mine | 818 | 6602 |
| the Rime Cut | mine | -5095 | 4460 |
| the Frostcrown Shaft | dungeon | -5034 | 4076 |
| the Mother's Deep | dungeon | -6018 | -2161 |
| the Cold Adit | cave | -851 | -6113 |
| the Night Shaft | dungeon | -1073 | -6363 |
| the Drowned Knight's Steps | dungeon | 5096 | -4060 |
| the Bracken Sink | dungeon, sealed | in the Vale, behind a cottage |

**Symbols.** Towns as roof clusters, hamlets as a single roof, dungeons as a
dark arch, caves as a black mouth, mines as a mouth with a pick, ruins as a
broken column, shrines as a small standing stone, camps as a fire. The weir
rune: a stepped dam, three steps, in sepia; the Vale's in gold.

**Colour by ring.** Heart: spring green, gold, blue water. Inner: summer green
going to straw, grey and umber. Middle: umber, rust, slate, dark green, one
pink. Outer: black glass, bone snow, ash grey, deep teal, and the red-brown of
the crater.

**What must not appear.** No zone names for the country between zones (it has
none). No roads into the outer ring. No sun, no daylight direction; it is a
chart, not a landscape. No bridge across the sea; nothing wraps.
