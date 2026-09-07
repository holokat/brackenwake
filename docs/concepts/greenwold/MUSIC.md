# The Greenwold's music, one prompt per area

Written 2026-09-07. Today the game plays one meadow kit (theme, calm, lively,
ambience) for the whole realm, chosen by biome, and the sculpted Greenwold is
all meadow: the same track over the village, the mere and the bandit camp.
The runtime knows which space you stand in (`zoneNow`), so a kit per area is
a small wiring change once the tracks exist. This is the list of tracks.

## The palette, so twelve areas sound like one realm

English pastoral, late medieval, played on real instruments and recorded
close: a wooden flute, a fiddle, a nyckelharpa or hurdy gurdy for the drone,
a harp, a bodhran and a frame drum, a low whistle, a cello, and a small
choir used sparingly. No synth pads, no orchestral swells, no electric
anything, no film trailer percussion. The realm's motif is a rising four note
figure (think a bell peal) that every area quotes once, slower or faster,
in its own mode. Modes: the fields and village in D mixolydian, the woods and
water in A dorian, the ruin and the Legion in E aeolian.

Every track loops at the length given, with a two bar rest at the loop point
so it breathes rather than cuts. Mix the melody under the ambience bed: this
is heard for hours.

## The areas

### Hearthhome, the green (day)
`music/greenwold/hearthhome-day.mp3`, loop 3:00. A warm village at midday: a
wooden flute carries a simple round over a plucked harp and a soft frame drum,
a fiddle answers in the second half, the bell peal motif quoted once on the
harp. D mixolydian, 92 bpm, unhurried, the feeling of a place where nothing
has ever gone wrong. No choir, no drone, no minor turn.

### Hearthhome, the green (night)
`hearthhome-night.mp3`, loop 3:00. The same round slowed to 60 bpm on solo
harp with a cello underneath, one flute phrase near the end, long rests. The
inn's warmth heard through a shutter. D mixolydian, very quiet, no percussion.

### The Standing Hedge, the ring
`hedge.mp3`, loop 3:30. Old and open: a hurdy gurdy drone on A with a low
whistle playing the bell peal motif stretched over eight bars, a frame drum
heartbeat every two bars, a small choir humming one chord under the last
third. A dorian, 56 bpm. Ancient and patient, not sinister; the stones are
older than the village and kinder than they look.

### The Mill Run, the river and the wheat
`millrun.mp3`, loop 3:00. The wheel's rhythm as music: a steady hurdy gurdy
turning figure at 100 bpm under a bright fiddle reel that never quite takes
off, a flute doubling the fiddle in thirds, a bodhran keeping the wheel's
turn. D mixolydian, working and cheerful, the sound of flour and water.

### The Long Meadow
`longmeadow.mp3`, loop 3:30. The walk between places: a solo flute over a
harp ostinato, wide and slow, the bell peal motif as the opening phrase, a
fiddle drone entering halfway and leaving again. D mixolydian, 72 bpm, more
air than notes. Made for walking; nothing in it demands attention.

### The Water Meadows
`watermeadows.mp3`, loop 3:30. Wet and green: a harp playing a rippling
figure like water over stones, a low whistle above it, a cello holding A,
the frame drum brushed rather than struck. A dorian, 66 bpm. Calm with a
hint of mist; at the end one phrase in the minor before it turns back.

### The Beech Hangar, the wood (day)
`hangar-day.mp3`, loop 3:30. Under the trees: a fiddle and a flute in a slow
canon, a harp picking out light through leaves, the bodhran soft and
irregular like something moving in bracken. A dorian, 76 bpm. Green shade,
the first place that is not quite safe.

### The Beech Hangar, the wood (night)
`hangar-night.mp3`, loop 3:00. The canon reduced to a single low whistle over
a cello drone, a frame drum struck once every four bars, a long silence in
the middle of the loop, the bell peal motif inverted once. A aeolian, 56 bpm.
Something is awake in here.

### The Chalk Pits, the scar
`chalkpits.mp3`, loop 3:00. Work on the hill: a hammered dulcimer or harp
struck on the beat like picks on chalk, a fiddle sawing a two note figure, a
low whistle over the top, a frame drum on every beat at 108 bpm. D
mixolydian with a flattened seventh leaned on. Bright, dusty, a little
relentless.

### The Old Cellars, the hollow
`oldcellars.mp3`, loop 3:00. The door to the second hour: a cello and a hurdy
gurdy drone on E, a solo fiddle playing the bell peal motif slowly in the
minor, a choir entering for four bars and gone, a single frame drum stroke
at the loop point. E aeolian, 60 bpm. Not a fight yet; a warning.

### Highwayman's Hollow, the camp
`hollow.mp3`, loop 2:30. Outlaws by their fire: a fiddle playing a crooked
jig with wrong notes on purpose, a bodhran pushing at 116 bpm, a low whistle
sneering the tune back, a hurdy gurdy drone. E dorian. Fun and dangerous,
the tune the bandits would play themselves.

### The Sunken Chapel, the water
`sunkenchapel.mp3`, loop 3:30. The ghost story: a small choir humming an open
fifth on E, a harp playing the bell peal motif as a bell would, one note at a
time with long rings, a cello underneath, no drum, no pulse. E aeolian, no
tempo. The bell under the water; a track that is mostly silence.

### The Kingsroad, the paved way in
`kingsroad.mp3`, loop 3:00. The Legion, seen before it is fought: a frame
drum and bodhran in a march at 96 bpm, a hurdy gurdy drone on E, a fiddle
playing a stern square tune, a choir on the last eight bars, the bell peal
motif turned into a fanfare on the whistle. E aeolian. Ordered, cold, and
handsome; the road leads out of the zone.

### Coldwake, the hamlet
`coldwake.mp3`, loop 3:00. The second village, so the first is not the only
one: a fiddle and a flute playing a country dance at 104 bpm over harp and
bodhran, plainer and rougher than the village's round, a hurdy gurdy joining
at the end. D mixolydian. A smaller, poorer, happier place.

## The two that are not areas

### Fight, the Greenwold
`greenwold-fight.mp3`, loop 2:00. What plays when a monster has you: the
bell peal motif hammered on fiddle and hurdy gurdy over a fast bodhran at 132
bpm, a cello sawing under it, no choir, no melody that resolves. A dorian.
It should sound like the calm tracks with the tempo doubled, not like
another game; the fight ends and the calm returns without a seam.

### Dusk and dawn
`greenwold-turn.mp3`, one shot 0:40. Not a loop: a single harp and whistle
phrase, the bell peal motif rising at dawn and falling at dusk (the same
recording played once each way), for the minute the sky changes. Plays over
whatever area track is running, very quietly.

## Wiring, when the tracks exist

`audio.js` chooses a kit by biome. The change is a `SPACE_MUSIC` table from
space id to track, read against `runtime.zoneNow()` on each change of space,
with a crossfade of eight seconds and the calm track of the realm as the
fallback for the country between; the fight track cuts in on aggro and out
ten seconds after the last hit. None of that is written; this file is the
tracks.
