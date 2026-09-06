# The Greenwold, read from the concept images

Fable's reading of the nine place images and the wide shot, 2026-09-06. This
is the source the plan loader builds from (`src/mmo/plans/<place>.json`) and
the list the user models from (`MODELS.md` beside it). Coordinates are metres
from the place's centre in `zones.js` LAYOUT: x east, z north, yaw in degrees
clockwise from north. Sizes are read off the paintings against the people and
the doors in them; where the sheet gives a size, the sheet wins.

Every image was judged against the sheet. All nine pass. Notes where the game
will differ from the painting are marked "game:".

## hearthhome (hub)

The painting: a walled village about 90 m across, oval, a flint wall 3 m
high with a timber gate tower at the south east gate, the road crossing a
stone bridge over the river just outside that gate, the river running along
the east wall. Inside, a green with a roofed well pavilion at the centre and
six market stalls (striped awnings) around it. Buildings clockwise from the
gate: the standing stone with a carved face on a fenced mound just inside
the gate to the west; the inn (two storeys, thatch, a round sign, barrels,
a bench) on the west; the smithy (stone chimney, open forge, anvil) north
west of the green; two thatched cottages behind it; the stone manor with a
square tower (slate roof, a stair to its door) at the north, above the roofs;
a thatched cottage north east; the chapel with a bell tower and a spire on
the east; the stable with pens and a hay rick south east; the healer's
cottage (herbs and flowers drying on the wall) south of the stable; the
bank (a square stone house, blue slate roof, one door, a low flight of
steps) east of the green. Lanes of packed earth run from the gate to the
green and out to each door. Wheat and hedgerows outside the wall.

game: the town precinct is 120 m radius with the wall at 66 m; the plan uses
the painting's compactness, wall at 46 m, fields on the flat ground outside.
The chapel is the sheet's church. The manor is the keep T2 built; the plan
replaces T2's keep precinct with the painting's manor and tower for
Hearthhome only.

Layout (metres from centre):
- well pavilion 0,0. stalls at radius 12: yaw 20, 80, 140, 200, 260, 320.
- gate tower and gate at 32,-30 facing 135 (south east). bridge 44,-40 over
  the river, road leaving south east.
- standing stone on a fenced mound at 10,-22, face toward the gate.
- inn at -30,-8 yaw 90 (door east), 14 by 9 m footprint, two storeys, sign.
- smithy at -22,16 yaw 120, 9 by 7, forge on the east face.
- cottage at -34,26 yaw 110 and cottage at -14,30 yaw 170.
- manor at 4,38 yaw 180, 18 by 10 with a 6 by 6 tower on its west end
  rising 16 m; stair to the door.
- cottage at 26,32 yaw 220.
- chapel at 32,14 yaw 250, 12 by 7 with a 5 by 5 bell tower and spire 18 m.
- stable at 36,-6 yaw 270, 12 by 8 with a 10 by 8 pen and a hay rick.
- healer at 24,-18 yaw 300, 8 by 7, herbs on the south wall.
- bank at 16,4 yaw 270, 8 by 8 stone, blue slate, steps.
- wall: an oval 46 by 40 m radii, flint, 3 m, one gate.
- lanes: gate to centre; centre to each door; a ring lane at radius 18.
- trees: eight oaks and beeches inside the wall between the houses.
- people (S2 names): Nan Ockley at the inn door, Cobb Ashby at the forge,
  Alys Fenn at the healer's door, Udd at the stable, Hald at the bank steps,
  Old Wynn Ashby on the bench by the standing stone, Bram Haywood at the
  gate, Pip by the well, the traders at the stalls.
- arrival: 40,-46 on the road at the bridge, facing the gate.

## waystones (megastructure)

The painting: one sarsen 5 m tall, carved with a bearded face, amber light
in the carved lines at dusk; a worn circular path around it, offerings at
its foot (bowls, jugs, flowers, a ring of pebbles), eight small boundary
stones knee high around the path; a hedgerow behind, wheat beyond, two more
tall stones far off on the ring.

game: the ring is a mile across with nine tall stones; each of the nine is
this composition. The sheet says 3 m; the painting says 5; the game takes
4 m so a player at 1.8 m reads it as tall and the face is at eye height plus
one.

Layout per stone (repeated at each of the nine):
- stone at 0,0, face toward the ring's centre.
- worn path a ring of radius 5, bare earth.
- offerings on the face side at radius 1.5: two bowls, a jug, a candle, a
  ring of pebbles, wildflowers.
- eight boundary stones 0.7 m at radius 6.5, yaw every 45.
- a hedgerow run 30 m long 12 m behind the stone (away from the centre).
- arrival for the tour stop: 12,0 on the path, facing the face.

## millrun (landmark)

The painting: a stone and timber mill with a thatched roof and a chimney,
the wheel (6 m) on its east wall in a mill race, the river coming from the
north east, a millpond in front (south) with four geese, three eel weirs of
woven willow across the river downstream (east), a plank footbridge with
a lantern post at its west end crossing the pond's outflow, a ford of
stepping stones across the river south of the footbridge, the miller's
house (thatch, flowers) west of the mill, a granary on stilts further west,
a laden cart on the lane, willows along the far bank, wheat behind.

Layout:
- mill at 0,0 yaw 90, 12 by 8, wheel on the east face in a race 3 m wide.
- millpond 14 by 10 south of the mill centred 0,-12; geese on it.
- river from 30,40 past the wheel to 24,-30 and on south east.
- weirs at 20,10, 24,-2, 26,-14 across the river.
- footbridge 8 m at -6,-24 running east west; lantern post at -11,-24.
- ford of stepping stones at 18,-30.
- miller's house at -22,4 yaw 90, 10 by 7.
- granary on stilts at -34,10 yaw 90, 5 by 5.
- cart at -30,-8; lane from -40,-20 to the mill door.
- willows at 34,30, 40,18, 38,4, 36,-12, 30,-26; osiers along the race.
- Ivy Weir at the mill door.
- arrival: -40,-20 on the lane.

## oldcellars (dungeon mouth)

The painting: a stone arch 4 m wide half sunk in a grass slope, brick
vaulting inside, a stair going down, a lantern on a chain in the arch, a
Legion banner (black, brass finial) planted crooked to the right of the
door, a broken cart to the left, rats, footprints in the mud in front, a
low flint wall along the top of the slope.

Layout:
- arch at 0,0 facing south (yaw 180), 4 wide, 3.5 high; stair into the hill.
- lantern on a chain inside the arch at 0,1.
- banner at 6,-1 leaning 15 degrees.
- broken cart at -6,-3.
- mud apron 8 by 5 in front, footprints.
- flint wall run along the slope top at z 8, 20 m long.
- three rats.
- arrival: 0,-12 facing the arch.

## beechhangar (open country)

The painting: a hollow way (a sunken path 3 m wide, banks 1 m high) running
through old beeches with grey trunks 1.2 m across, copper leaf litter, a
fallen beech across the left bank thick with bracket fungus, badger setts
in the roots on both sides, boar rootings (turned earth) in the path,
ferns, wheat visible at the wood's edge behind, a great black boar in the
shade to the right.

Layout (a 120 m circle of the ridge):
- hollow way from -50,-40 to 50,40 curving, 3 m wide, banks 1 m.
- beeches: a stand of 40 over the circle, the largest (2 m trunks) at
  -8,4, 12,-6, 20,14, -18,-16; canopy closed.
- fallen beech across the way at -14,-8, 14 m long, fungus.
- setts at -20,6, 8,-14, 26,10 (dark holes under roots, spoil).
- rootings at 0,0, 10,8, -6,-16 (turned earth patches).
- Old Grist's stand at 30,-10 by night.
- wheat begins at the circle's south edge.
- arrival: -50,-40 on the way.

## kingsroad (road)

The painting: a paved road 6 m wide with kerbs, a fork with a fingerpost,
iron lamp posts, milestones (waist high), a stone arch bridge over a
stream, the Tithe Wagon (black canvas, brass, an iron strongbox in the
back) with four Legion soldiers in black plate with square shields, and
beside the road a Legion camp: two black tents with brass finials, a brass
sun standard 6 m tall, a spear rack, two braziers, crates, a low fence.

game: the wagon and its escort are E2's event and walk; the plan places the
camp, the road furniture and the bridge. The camp is Captain Serle Vane's
first camp from the sheet.

Layout (along the road running south west to north east through 0,0):
- road centreline from -60,-40 to 60,40, 6 m paved, kerbs.
- bridge at 0,0 over a stream running north west to south east, 10 m span,
  lantern posts at both ends on the north side.
- fork at 30,20: a second road leaving south east; fingerpost with three
  boards at 33,17.
- lamp posts every 24 m on the north verge; milestones at -48,-32 and 48,32.
- camp north of the road centred -20,10: tents at -26,12 yaw 150 and
  -14,16 yaw 130; standard at -20,6; spear rack -10,10; braziers -24,4 and
  -14,4; crates -8,14; fence along z 2 from -30 to -6.
- hedgerow along both verges outside the camp; wheat beyond.
- arrival: -60,-40 on the road.

## greenwoldpits (mine)

The painting: a white chalk cut 12 m high with green (copper) and grey
(tin, with a dark seam) bands, two mine mouths braced with timber, the
left under a timber headframe with a winding wheel, an ore cart on rails
running out of the left mouth, a spoil heap of chalk and green ore, picks
and a barrow, a foreman's hut with a lantern on the right, grass and wheat
above the lip.

Layout:
- cut face along z 10 from -24 to 24, 12 m high, chalk with two seams.
- headframe 8 m at -12,8 over the left mouth at -12,10 (yaw 180).
- right mouth at 8,10, timber braced.
- rails from the left mouth to -12,-16, cart at -10,-6.
- spoil heap at 6,-8, 5 m across.
- foreman's hut at 18,2 yaw 240, 5 by 4, lantern.
- picks and barrow at -2,0.
- yard bare earth 40 by 20 south of the face.
- the foreman at the hut door.
- arrival: 0,-20.

## highwaymanshollow (camp)

The painting: a chalk overhang 12 m high curving around a hollow 25 m
across, a stake palisade of sharpened logs across the open south side
with a gap, a lookout platform in an oak on the west at 5 m with a
ladder, four tents against the back wall, a covered cart under a tarp on
the east, a campfire ring at the centre with five men on crates and logs,
a weapons rack with spears and swords on the east, loot sacks and crates,
a target dummy (straw, a hood, a painted target) with arrows on the south
east, a sheep skeleton by the fire, a stone-flagged path in from the south.

game: the camp moves between three hollows after raids (sheet mechanic);
this is the plan of one hollow, placed at each of the three.

Layout:
- overhang wall an arc from yaw 200 through north to yaw 160 at radius 14,
  12 m high.
- palisade across the south from -12,-12 to 12,-12 with a 3 m gap at 0.
- lookout oak at -12,-4, platform at 5 m, ladder.
- tents at -6,8 yaw 170, 0,10 yaw 180, 6,8 yaw 190, 10,4 yaw 220.
- covered cart at 10,-2.
- fire ring at 0,-2; five seats around it; the Miller's Son and his six by
  night (monsters: bandit rows), the sheet's names on the plates.
- weapons rack at 12,-6; crates and sacks at 8,-8.
- target dummy at 8,-14 (outside the palisade line), arrows in it.
- sheep skeleton at 3,-6.
- flagged path from 0,-30 to the gap.
- arrival: 0,-30.

## sunkenchapel (ruin)

The painting: a flooded meadow at night under blue fog, a stone chapel
with the water at its eaves, a bell in an open belfry above the roof, the
west door arch under the surface, a stone cross at the west gable, a
rotting rowing boat aground to the south west, seven headstones leaning
out of the water to the east and south east, water lilies, four willows
standing in the water, a skeleton in a sexton's coat waist deep among the
graves.

Layout:
- chapel at 0,0 yaw 90 (west door at -6,0), 12 by 7, roof ridge 4.5 m;
  belfry on the west gable, bell at 6 m; water level at 3.6 m relative to
  the chapel floor, so the eaves sit at the surface.
- flooded meadow: water over a 60 m circle; the ground under it 3 m below
  the surface; the chapel floor on the old ground.
- headstones at 10,-2, 12,-6, 8,-10, 14,2, 16,-4, 6,-14, 18,-8, leaning.
- boat at -14,-10 yaw 60.
- willows at -18,10, -8,16, 16,12, 20,-14.
- lilies in drifts.
- the Skeleton Sexton at 12,-8 by night (monster row skeleton, named plate).
- arrival: -30,0 on the dry bank, west.
