# Kaldera: the world, the Bond, and Wyrmsoul

This replaces `10-STORY.md`, `11-CAST.md` and `12-UNFORGETTABLE.md` as the
story the zones are written from. Those three stay in the repository as the
record of a direction the user turned down; nothing in them is canon now.

The user's brief: epic and adventurous, a dragon companion, a big ability
that unlocks and grows, at least nine large zones that each feel like a totally
different place with their own storyline and memorable cast, all biomes
covered, and a name that is awesome and easy to say.

---

## 0. The name

**Kaldera.** Three syllables, said the way it looks: kal-DEH-ra. A caldera is
the bowl a volcano leaves when it has finished with itself, and the continent
is one: a ring of very different lands around a central sea, with the
Wyrmking's volcano on the eastern rim still burning. The game is *Kaldera*. The
big ability is *Wyrmsoul*. The player is *Dragonsworn*.

If Kaldera does not land: *Ashfall* (soft, mournful, easy) or *Skarrow* (hard,
northern, a real place name sound). Everything below works with any of the
three; only the word changes.

---

## 1. The pitch

Ten thousand years ago dragons ruled Kaldera and the first riders made a pact
with them at the Firstfire Crater: a soul shared willingly, rider and dragon
each carrying half. The Dragonsworn kept the peace of the continent from the
Eyrie in the Stormpeaks for an age.

Then a man found the other way. Malachar, a knight of the Eyrie, learned that a
dragon's heart eaten fresh gives the eater the dragon's fire without the dragon.
He ate nine. He is the Wyrmking now, something no longer a man, on a throne in
a live volcano, and the dragons are dead to the last egg.

The last egg is the one that hatched on your arm this morning.

You are nobody in particular: a farmhand, a hedge knight, a hedge wizard. But
the hatchling chose you over every knight in the kingdom, and in choosing you it
made the old pact for the first time in a thousand years. You share a soul with
the last dragon in the world. Every realm you cross, it grows, and it takes back
something its kind lost there. The Wyrmking wants its heart. You cross nine
realms to become strong enough that he cannot have it.

*He is what happens when you take. You are what happens when you are given.*

---

## 2. Who you are, and who rides with you

**You** are whatever the player made at creation. The ten openings stand. The
name is the player's. Nobody in Kaldera calls you "Dragonsworn" to your face
until the Stormpeaks, where the last of the Eyrie's ghosts do, and it lands
because you have earned it by then.

**The dragon.** The player names it at hatching, and the name is used
everywhere. It has a true name too, which it does not know: it learns it in the
Boneyard, from the bones of its mother, and from then on the player may use
either. It cannot die. When it falls in a fight it goes still and the Bond
empties, and it wakes when the Bond has climbed back to a quarter. It cannot be
sold, stabled or left behind: it follows you into every dungeon and onto every
boat, and it is the one companion in the game.

It has four ages, and each is a body:

| age | when | size | what it does |
| --- | --- | --- | --- |
| hatchling | the Greenwold | a cat, on your shoulder | bites what you fight, flinches at fire |
| drake | after Verdant Deep and the Saltmarch | a large dog, at your heel | fights beside you, carries a little |
| young dragon | after Ember Wastes and the Stormpeaks | a horse, and you ride it | mount, flight in Wyrmsoul, breath in fights |
| dragon | after the Boneyard and Frostreach | a house | mount and flight always, the Wyrmking's equal |

**The Bond** is the number between you. It fills from fighting beside the
dragon (every hit either of you lands while both are in the fight), from feeding
it (meat it likes, which changes by age), and from taking a blow meant for it
(stand between it and an attacker). It empties slowly when you are more than
forty metres apart and faster when it has fallen. At full Bond you can call
Wyrmsoul.

---

## 3. Wyrmsoul

For about ten seconds you and the dragon are one creature. Your eyes go gold,
wings of fire spread from your back, and the world drops into **dragon time**:
everything but you and the dragon moves at a fifth of its speed. Arrows hang. A
wolf mid-leap hangs. You move through them at full speed, the dragon's breath
comes out of your hands, and when the ten seconds end everything you touched
happens at once.

### The rules, exactly

- **Calling it.** Bond at 100. A key on the bar (the big slot at the far right,
  where nothing else may go). Not while stunned, not while dead, not without
  the dragon within forty metres and awake.
- **Duration.** Six seconds at the base, ten after Frostreach.
- **Dragon time.** The world clock runs at one fifth: monster movement and
  swings, projectiles, cast bars of enemies, the day and the water. The player,
  the dragon, the player's own projectiles and the HUD run at full speed. The
  player's cooldowns and casts run at full speed, so a rogue gets ten seconds of
  free hits; a mage gets ten seconds of casts that all land as time resumes.
- **The breath.** While Wyrmsoul is up, the bar's first slot becomes the
  breath: a cone from the player's hands, fifteen metres, fire, no mana, one
  second between breaths. After Frostreach a second breath, frost, on the
  second slot.
- **Wings.** Cosmetic until the Stormpeaks; after that, Space flies for the
  duration and you land where you are when it ends.
- **The end.** Everything that would have happened in those seconds resolves
  in order over half a second: damage lands, floaters fly, the roar (after the
  Boneyard) stuns what is left standing. Bond goes to zero. The dragon is tired
  for thirty seconds: it fights, but no Bond is gained.
- **Cost of failure.** If the player is killed during Wyrmsoul, Bond empties and
  the dragon falls too. If the dragon is more than forty metres away when
  called, the call fails with a sentence ("it is too far to answer").

### What it gains, realm by realm

| after | Wyrmsoul gains | in the engine |
| --- | --- | --- |
| the Greenwold | the base: six seconds of dragon time and a fire breath | time scale, the breath projectile |
| Verdant Deep | the dragon's senses: in dragon time you see through leaves, walls and dark | a material pass and a light during the effect |
| the Saltmarch | the tail: a sweep that knocks everything within four metres off its feet | a knockback pulse on call |
| Ember Wastes | true fire: the breath ignites the ground and burns after time resumes | a ground decal with a damage-over-time zone |
| Stormpeaks | wings: for the duration you fly | the dev fly camera's movement, bounded |
| the Boneyard | the roar: monsters under your tier flee, the rest are stunned as time resumes | fleeCheck and a stun on the end pulse |
| Frostreach | frost breath, and ten seconds | a second projectile, a longer clock |
| the Sunken Kingdom | the deep: Wyrmsoul works underwater and can be called while drowning | remove the underwater guard |
| the Ashen Throne | the last: for one fight, the dragon takes your death and you take its | a one-time death swap in the boss fight |

### What the player sees

A **Bond meter** in the HUD beside the three pools: a long gold arc, filling,
with the dragon's name over it. It glows when full. The big slot at the right of
the bar holds the Wyrmsoul mark and lights with the meter. Calling it: the
screen's edges go amber, the sky darkens, sound drops to a low roar and a
heartbeat, every moving thing gets a faint gold trail, the player's rig shows
the wings (an additive fire shell on the back anchor) and gold eyes. Ending it:
a flash, the trails snap back, the sound returns, the numbers fly.

### What the story does with it

The Wyrmking's power is the same thing taken the other way. He ate nine hearts
and the fire never leaves him and never answers him either: he is in dragon
time all the time, which is why the world around his throne moves like glass
and why he cannot bear to be touched. In the last fight he pulls you into his
time and the player learns what Wyrmsoul is when it is stolen. The dragonriders'
Eyrie, the dead dragons of the Boneyard and the Firstfire Crater are the three
places the pact is explained, and each explanation is a piece of the ability.

---

## 4. The shape of the world

Kaldera is a ring of realms around a central sea, the Caldera Sea, with the
Wyrmking's volcano on the eastern rim. The game's three-ring danger layout
stays under the hood: the Greenwold is the heart, three realms sit close, three
further, three at the rim, and the sea has its own realm in the middle of it
all. Each realm is one large zone with four to six named areas inside it, and
no two share a biome.

| realm | biome the engine draws | where | danger | Wyrmsoul gift |
| --- | --- | --- | --- | --- |
| the Greenwold | meadow, river | centre west, home | 1 | the base |
| Verdant Deep | sakura and dense forest | south | 1 to 2 | senses |
| the Saltmarch and the Thousand Isles | fen, beach, islands | south east | 2 | the tail |
| Ember Wastes | desert, glass, crater | north east | 3 | true fire |
| the Stormpeaks | highland mountain, storm | north | 3 to 4 | wings |
| the Boneyard | graveyard, ash plain, ruins | west | 3 to 4 | the roar |
| Frostreach | snow, boreal, glacier | north west | 4 | frost breath |
| the Sunken Kingdom | ocean, drowned city, reef | the Caldera Sea | 4 to 5 | the deep |
| the Ashen Throne | volcano, cinder, caves | east rim | 5 | the last |

---

## 5. The nine realms

Each realm is written to one frame:

- **Arrival**, the entry cinematic in one paragraph.
- **The feel**, what makes it a different place to stand in.
- **The story here**, and how it advances the whole.
- **The cast**, three or four people built to be remembered: a contradiction,
  a signature, a secret, something the player does with them, and a return.
- **Underground and the boss.**
- **Out in the open**, the named encounters and events.
- **The dragon here**: what it eats, how it grows, what it takes back.

### 1. The Greenwold

**Arrival.** Wheat to the horizon, a river with a mill on it, a village with a
green and a stone bridge. A farmhand asleep against a haystack. An egg the size
of a loaf in the straw beside them, cracking. The camera goes into the crack.

**The feel.** Home. Hedges, orchards, geese on the road, church bells. The
safest place in the game and the one every act comes back to.

**The story here.** The egg hatches on your arm, and the village has a problem
in an hour: the Wyrmking's men, the Ashen Legion, have been searching every
farm on the continent for it and they are two days away. Act I is the Greenwold
learning to hide a dragon, and you learning to be hidden. You meet the Legion's
scouts, your first Bond fills in a barn fight, and the village's oldest
resident tells you the one thing that sets the whole journey: the riders'
Eyrie in the Stormpeaks is not a legend, and it is where a Dragonsworn goes to
learn what they are.

**The cast.**
- **Bram Haywood.** Farmer, fifties, your employer, a man who has never left
  the Greenwold and has opinions about everywhere else. Signature: he chews a
  straw and takes it out to disagree with you. Secret: he was a Legion soldier
  as a boy and deserted after Malachar's ninth dragon; he knows the Legion's
  ways and has been waiting forty years to be asked. He teaches the first sword
  lesson in the barn with a hay rake. Returns in Act IV leading the Greenwold's
  farmers to the Throne with that rake.
- **Old Wynn Ashby.** The village's oldest, ninety, blind, sits on the green
  and tells lies to children. Signature: every story starts "when the sky had
  wings." Secret: none of them are lies; she was a girl at the Eyrie when it
  fell. She names the dragon's egg for what it is, says the word Dragonsworn
  first, and tells you where the Eyrie is. She does not survive to see you come
  back, and her chair on the green is empty in Act II.
- **Captain Serle Vane.** The Legion officer hunting the egg, thirties, correct,
  courteous, the first face of the enemy and the most reasonable man you meet.
  Signature: he removes his glove before he speaks to you. Secret: he does not
  believe the Wyrmking is a monster. He believes he is order. He lets you go
  once in the Greenwold because you saved his sergeant from a boar, and the
  favour costs him in the Stormpeaks. Returns in every act, one step behind,
  and at the Throne he is the one who opens the door.
- **Pip.** The miller's daughter, nine, the first person the hatchling likes.
  Signature: she carries it in a bread basket. She is the game's measure of the
  dragon's growth: in each act she is a year older and the dragon is bigger
  than her by a new margin, and in Act IV she cannot lift its head.

**Underground and the boss.** *The Old Cellars* under the mill, where the
Legion's advance party has holed up: bandits, goblins in the Legion's pay, and
*Sergeant Oram Blackhand*, a Bandit promoted, who has the egg's shell fragments
in a sack and means to bring them to Malachar. Beating him is the first fight
Bond fills in, and Wyrmsoul's first call is here, by the game's design, in a
cellar too low to fly in.

**Out in the open.** *Old Grist*, a boar the size of a pony in the beech hangar.
*The Tithe Wagon*, an event: the Legion's tax wagon crosses the Greenwold every
third day with a Goblin Warrior escort and can be robbed. *The Fox That Is Not*,
a Wolf that has learned to walk like a fox at dusk and takes geese.

**The dragon here.** Eats eggs and mice. Hatchling. Takes back nothing yet; the
Greenwold gives Wyrmsoul its base.

### 2. Verdant Deep

**Arrival.** A forest of flowering giants, blossom falling on a river, a
temple of faces cut into a cliff with vines over every mouth. Someone in the
canopy, watching, with a bow. A spider the size of a cart passing under them
without looking up.

**The feel.** Wet, green, loud with birds, the blossom of the sakura biome over
old-forest trunks. Verticality: rope bridges, platforms, the canopy village.
Nothing here is straight.

**The story here.** The Verdant Court, an elven people who kept the old dragon
temples and have forgotten why, live in the canopy and do not come down. They
know the dragon for what it is on sight and split over it: the Speaker wants to
give it to the Legion and buy peace; the Huntress wants to raise it as a weapon.
You have to win the Court without losing the dragon, and the temple under the
faces holds the first of the dragon's lost gifts: the sight. The Legion is here
too, quietly, buying the Court.

**The cast.**
- **Speaker Ilthenar.** The Court's voice, ancient, exquisite manners, a man
  who has kept his people alive by giving away everything else. Signature: he
  never says no; he says "that is one path." Secret: he has already promised the
  egg to Serle Vane. He can be turned by the temple's truth, or not, and the
  Court's fate in Act IV follows.
- **Saelith Thornwake.** The Huntress, the bow in the canopy, brilliant,
  impatient, half your age and better than you at everything. Signature: she
  answers a question by shooting something. Secret: she is Ilthenar's daughter
  and has not spoken to him in ten years. She wants the dragon as a weapon and
  she is not wrong that it is one. Teaches archery and tracking. Returns as an
  ally in the Boneyard and the Throne if the Court is won; as an enemy on the
  Legion's side if it is sold.
- **Brother Tomas.** A human monk of the dragon temples, the only one left,
  forty, lives among the faces and talks to them. Signature: he addresses the
  carved faces by name. Secret: the faces are the first Dragonsworn, and one of
  them is Malachar's, young, before. Tomas has the temple's key and gives it for
  a promise: bring the dragon back here when it is grown, so the faces can see.
- **Mother Web.** The Blossom Mother, a Giant Spider the Court has fed for a
  century so it will not eat them. The Court's darkest bargain. Killing her
  frees the Court and ends the blossom for a season.

**Underground and the boss.** *The Temple of Faces*: a dungeon behind the cliff
where the first riders learned the sight. Spiders, cultists of the Legion, and
*the Keeper of Faces*, a Wraith that was the temple's last priest and tests you
with the dragon's own eyes. Beating it grants the sight and puts a new face on
the cliff: yours.

**Out in the open.** *Mother Web* in her canopy. *The Blossom Fall*, an event
each dawn when the whole canopy sheds and, for a minute, everything hidden is
visible. *The Legion's Purse*, a Bandit captain in Court robes buying elders.

**The dragon here.** Eats fish and fruit. Becomes a drake at the end of the
realm, and the Court sees it happen, which decides the Speaker.

### 3. The Saltmarch and the Thousand Isles

**Arrival.** Reed marsh to the horizon under a white sky, then the marsh
breaks into water, and the water into a thousand islands, each with one tree
and one wreck. A boat with a red sail beating between them, and something with
a fin longer than the boat following it.

**The feel.** Two places in one realm: the fen inland (knee-deep water, sedge,
eels, will-o'-wisps) and the archipelago beyond it (sand, palms, coral, the
first open sea). You get a boat here. Sailing is a zone.

**The story here.** The Isles are the pirate republic of Kaldera and the only
people on the continent who do not fear the Legion, because the Legion cannot
sail. Their queen wants the dragon for the same reason: a dragon on a mast
would make the Isles unbeatable. The Sunken Kingdom's ghosts rise on certain
nights from the deep water between the islands, and the Leviathan that follows
your boat is the dragon's cousin: the last of the sea-wyrms, dying, and it has
something for the dragon.

**The cast.**
- **Queen Maravel of the Isles.** Pirate queen, forties, one eye, the best
  captain alive, funny, ruthless, likes you immediately, which is the danger.
  Signature: she settles every argument with a coin toss and the coin has two
  heads. Secret: she is dying of the sea-rot and the Isles do not know; the
  dragon is her succession plan. Gives you the boat. Returns with a fleet at the
  Throne if you did not take her deal, or against you if you did and broke it.
- **Aldo Reeve.** The fen's eel-man, sixties, has never left the marsh, guides
  the paths with sticks only he can read. Signature: he never looks at the
  water directly. Secret: he is the last keeper of the sea-wyrm, feeding it a
  sheep a month for fifty years, and he knows what it carries for the dragon.
  He walks you to it. He dies doing it, of old age, in the boat, and asks you to
  put him in the water.
- **Little Sorrow.** A Drowned girl who walks the tide line on the largest isle
  and leads boats onto the rocks. Signature: she hums a song the Isles have
  forgotten. Secret: she is Maravel's daughter, lost at sea at eight, and
  Maravel does not know she walks. The player can tell her, or not, and what
  Maravel does about it is the realm's ending.
- **Grey Tancred.** The Legion's admiral, who cannot sail and has come anyway
  with a barge fleet across the Caldera Sea's calm shallows. Correct, seasick,
  brave. Signature: he is always green. A rival to Vane, and the two of them
  do not agree about you. He drowns at the Isles if the player sides with
  Maravel; he lives to command the Throne's outer wall if not.

**Underground and the boss.** *The Leviathan's Rest*: a sea cave under the
largest isle where the last sea-wyrm lies. Crabs, drowned, a Mire Troll, and
*Thalassa the Sea-Wyrm*, a Hydra promoted with a name, who is not fought unless
you fail to bring Aldo: with him she lets the dragon close and gives it the
tail, and dies. Without him she is the realm's boss.

**Out in the open.** *The Ghost Tide*, an event: on moonless nights the drowned
of the Sunken Kingdom walk up out of the sea between the isles in ranks and
board any boat at anchor. *Long Sarah*, a Bog Crawler grown beyond its kind in
the fen. *The Red Sail*, Maravel's own ship, which challenges yours to a race
once and pays in charts.

**The dragon here.** Eats fish and crab, and learns to swim. Takes back the
tail from Thalassa.

### 4. Ember Wastes

**Arrival.** Red rock and white sand under a sun too big, a line of fused glass
across the desert like a road, a city of brass on the horizon that is moving.
The dragon's shadow on the sand, and for the first time it is bigger than
yours.

**The feel.** Heat, glass, silence, mirage. The Legion's heartland: this is
where Malachar's armies are forged, and the glass road is where he dragged the
nine hearts north. The desert biome, with the crater biome at its centre: the
Firstfire Crater, where the pact was first made.

**The story here.** The Legion's foundries run on emberite, and the emberite
comes from the Firstfire Crater, and the crater is the holiest place a dragon
has. The realm is a heist: get the dragon into the crater under the Legion's
nose so it can take back true fire, and get out. The people of the Wastes are
the Ashwalkers, nomads who have served the Legion for coin and are ready to
stop. The Brass City is the Legion's machine, walking, and it has a heart of
its own.

**The cast.**
- **Nadira of the Long Walk.** Ashwalker matriarch, sixties, has crossed the
  Wastes two hundred times and remembers every well. Signature: she draws the
  map in the sand with a finger and wipes it before she finishes. Secret: she
  sold the Legion the route to the ninth dragon and has walked the desert since
  as penance. She knows the way into the crater because she showed it to
  Malachar. Returns at the Throne with every well poisoned behind her.
- **Foreman Isk.** The Brass City's engineer, a small furious man who loves
  the machine and hates its master, forties, hands burned to leather. Signature:
  he talks to the city and it answers with steam. Secret: he built a second
  heart into the city that answers to whoever holds a dragon's fire, because he
  always meant to take it from Malachar himself. The player can let him or stop
  him. Either way he is the Brass City's boss or its pilot in Act IV.
- **Sister Halessa.** A Legion chaplain who has begun to doubt, thirties,
  clean robes in a filthy country, a cup of water that is always cold.
  Signature: she offers water first. Secret: she has kept a record of every
  dragon the Legion killed and where the hearts went, and she gives it to you
  when she decides, which is late, and it costs her everything. The Wastes'
  conscience. She dies at the Throne, and Vane closes her eyes.
- **The Manticore Noon.** Hunts only at midday on the same red rock, a
  sundial you can set your watch by, and the Ashwalkers do.

**Underground and the boss.** *The Firstfire Crater*: down through a Legion
foundry into the crater's throat, where the first pact was made and the walls
remember it. Cultists, cyclops, iron golems, and *the Brass Heart*, the city's
first heart, an Iron Golem the size of a house that Isk built and Malachar
bent. Beating it with the dragon at your side gives true fire; the crater
walls light for the first time in a thousand years and every Ashwalker sees it.

**Out in the open.** *Noon* on his rock. *The Glass Road*, an event: a Legion
convoy of hearts' worth of emberite crosses it weekly and can be taken. *The
Brass City* itself, walking, a moving dungeon whose door is only open when it
kneels to take on water.

**The dragon here.** Eats emberite, which is the first thing it eats that
worries you. Becomes a young dragon after the Stormpeaks; here it is a drake
that has begun to breathe fire on its own. Takes back true fire.

### 5. The Stormpeaks

**Arrival.** Highland moor climbing into mountains, heather and granite,
weather coming across it in walls. Lightning striking the same peak three
times. On the peak, a ruin with wide steps built for something that landed, and
a figure in a tattered cloak on the top step, waiting, translucent.

**The feel.** Highlands: wind, rain, scree, black lochs, storm on the tops.
The mountain biome under storm sky. The Eyrie of the dragonriders on the
highest peak, and the ghosts of every rider who died at the fall still keeping
watch.

**The story here.** This is where the game says what you are. The Eyrie's
ghosts are the last Dragonsworn, and they cannot rest until a living one stands
on their steps. They train you, they tell you what Malachar was, and they give
the dragon its wings. The Legion holds the passes below with its finest, and
Captain Vane is in command, and the favour from the Greenwold comes due. The
Stormpeaks are also where the player first flies, in Wyrmsoul, over a fight,
and never sees the game the same way again.

**The cast.**
- **Marshal Eowen Skyward.** The last Marshal of the Eyrie, a ghost, a woman
  of sixty who died at forty, unbending, kind underneath in a way she has
  forgotten. Signature: she salutes the dragon and not you. Secret: she trained
  Malachar, loved him, and did not see it. She teaches the Bond's true use and
  gives the wings. At the Throne her ghost is on the wall, and Malachar sees
  her, and stops.
- **Kestrel.** A living highland girl, seventeen, who has been climbing to the
  Eyrie every week since she was ten to leave flowers for ghosts she cannot see.
  Signature: she whistles the riders' recall, which the ghosts taught her in
  dreams. Secret: she is Skyward's great-great-granddaughter and the only one
  the ghosts can touch. She is the realm's living heart and the one who sees
  you fly first. Returns at the Throne on the back of the dragon behind you,
  because somebody has to.
- **Captain Serle Vane**, again, in the passes, with orders to take the
  dragon and a memory of the boar. The player's choice with him here decides
  whether the Throne's door opens from inside.
- **The Storm Wyvern Skreel**, an old wyvern who nests on the Eyrie's lightning
  peak and has learned to ride the strikes. The ghosts call it the last of their
  mounts' bastards. It can be fought or, after the wings, out-flown, and if
  out-flown it follows you and is the dragon's first friend of its own kind.

**Underground and the boss.** *The Eyrie's Roost*: the dragonriders' hall
cut into the peak, three levels down to the mounting stair. Ogres of the
Legion's mountain corps, iron golems, wyverns, and *Warden Hask*, the Legion's
mountain commander, an Ogre promoted with a name and a Legion breastplate, who
has been trying to break into the Roost for twenty years and cannot pass the
ghosts. You can. That is the point.

**Out in the open.** *Skreel* on the peak. *The Wall of Weather*, an event: a
storm crosses the highlands every real hour and anything on the tops in it takes
lightning; anything under Wyrmsoul does not. *The Cairn Road*, where every cairn
is a rider's grave and speaks a line if the dragon is near.

**The dragon here.** Eats goats and lightning, apparently. Becomes a young
dragon here: the player rides it down from the Eyrie. Takes back wings.

### 6. The Boneyard

**Arrival.** A grey plain of ash where nothing grows, and out of the ash the
ribs of dragons rise like cathedrals, nine of them, each the size of a hill. A
lodge built inside the largest skull, with lights in the eye sockets. The
dragon on your shoulder goes very still.

**The feel.** Graveyard and ruin biome on an ash plain: bone, ash, wind, the
Legion's hunting lodge, undead that were the dragons' riders. The saddest place
in the game and the one the dragon has to face.

**The story here.** The nine dragons Malachar ate fell here, because he brought
them here to die: it is his trophy hall. Their riders died with them and did
not stay dead. The dragon learns its true name from its mother's bones, learns
what it is the last of, and takes back the roar. The Legion's lodge is where
Malachar comes to hunt, and he is there, once, in this realm: the first time
the player sees him, from a distance, and he sees the dragon, and knows.

**The cast.**
- **Ghost-Rider Corvane.** The dead rider of the dragon's mother, a Bone
  Knight who kept his mind, courteous, exhausted, still guarding a corpse the
  size of a hill. Signature: he calls the dragon by its true name before it
  knows it. Secret: he let Malachar take the mother, to save the egg, and has
  never forgiven himself; the egg is the one on your arm. He is the dragon's
  godfather and the game's most tender undead. He rests when the roar is
  taken, and the player can ask him not to.
- **Huntmaster Gallow.** Master of the Legion's lodge, Malachar's oldest
  friend, sixties, a great hunter and a genuinely warm host who has personally
  killed four dragons. Signature: he offers you a drink from a dragon's skull.
  Secret: he is the one who taught Malachar the heart-eating, out of a book he
  found in the Temple of Faces, and he has never eaten one himself because he
  is afraid. The realm's boss, in his own lodge, and he asks to be.
- **Malachar, the Wyrmking**, seen for the first time from across the ash, on a
  hunt, and he stops, and looks at your shoulder, and the whole plain goes
  quiet. No fight. He leaves. The Legion's pursuit becomes something else after
  this day.
- **The Counting Wraith**, which walks the nine ribs every night counting to
  nine, and if you say "ten" aloud it turns and comes.

**Underground and the boss.** *The Skull Lodge*: Gallow's hall inside the
largest skull, down into the throat where the trophies are. Bone knights,
wraiths, vampire knights of Malachar's court, and *Huntmaster Gallow* himself,
a Vampire Knight promoted with a name, four dragon-fang daggers and the manners
to explain each one before he uses it. He can be spared, and if spared he tells
you how the Wyrmking dies.

**Out in the open.** *The Counting Wraith*. *The Bone Wind*, an event: once a
day the ash rises in a storm and the nine dead dragons' shapes stand up in it
for a minute, and the dragon sings, and Bond fills to full. *Gallow's Hounds*,
a Werewolf pack the lodge keeps, with a leader who was a rider.

**The dragon here.** Eats nothing for the whole realm, and the player has to
notice. Takes back the roar and its true name. After Frostreach it is grown.

### 7. Frostreach

**Arrival.** Snow to the horizon, a glacier with a fortress frozen into it,
pines black under white, a giant's footprint filling with snow. Inside the
glacier, visible through the ice, a dragon curled around something, frozen
mid-breath.

**The feel.** Glacial cold: snow and boreal biome, an ice vault, frost giants,
the White Pack. The one realm where the environment fights you: cold is a bar,
fire is life, and the dragon is a heater.

**The story here.** The tenth dragon. There was one Malachar never found:
Vaelith the Frost, who fled north with her rider and froze herself into the
glacier rather than be eaten, alive, mid-breath, and has been waiting a
thousand years for another dragon to come and take her breath from her, as a
gift. The frost giants guard her because their thane promised her rider. The
Legion has finally found the glacier and is cutting toward her. Race, siege,
and a gift given freely, which is the game's whole thesis.

**The cast.**
- **Thane Ulfra Coldseat.** Frost giant, forty feet, matriarch, has sat at the
  glacier's mouth for three hundred years keeping a promise her grandmother
  made. Signature: she shivers, and does not care that you are cold too.
  Secret: the promise was to a human, the tenth rider, whose bones are in her
  hall, and she is in love with a woman a thousand years dead. She lets the
  dragon in. Returns at the Throne, and the giants come with her, and the
  Legion's outer wall does not survive them.
- **Brenna Coldseat.** Her daughter and the giants' smith, who works rimesteel,
  the metal the frozen dragon's breath made of the glacier. Signature: she
  bends cold metal with her hands. Secret: she wants her mother off the ice and
  would break the promise to do it. Teaches the last tier of smithing. The
  player can side with her and lose Ulfra's help, or not.
- **Rimemouth.** Leader of the White Pack, a Dire Wolf with frost in his coat
  that does not melt, who has hunted the glacier's edge since the Frost dragon
  froze and thinks the dragon is his. He is a rival, not a boss: he challenges
  the dragon at the full moon and, beaten, follows the pack behind you into the
  final act.
- **Legate Ossory.** The Legion's northern commander, seventies, the last of
  Malachar's original companions, a decent man in an indecent army who wants
  to bring the Frost dragon's heart home and end his service. Signature: he
  writes letters he never sends and reads them to you. Secret: he was the
  tenth rider's brother. He is the realm's boss and the saddest fight in the
  game, and he asks you to tell his sister's bones he came.

**Underground and the boss.** *The Ice Vault*: down through the glacier along
the Legion's cutting to the frozen dragon. Dire wolves, frost giants gone wrong,
Legion sappers, and *Legate Ossory* with his guard, a Bone Knight commander
promoted, still alive, in rimesteel plate. Beyond him, Vaelith, who cannot be
fought, only reached: the dragon touches her, she breathes once, and the ice
comes down, and Wyrmsoul has a second breath and ten seconds.

**Out in the open.** *Rimemouth* and the White Pack. *The Long Night*, an
event: for one in-game day each week the sun does not rise in Frostreach and
the giants light the glacier from inside. *The Frozen Fleet*, a Legion barge
fleet caught in the ice a century ago, with its crew.

**The dragon here.** Eats ice, and the frozen fish in it. Becomes a dragon,
full grown, when Vaelith breathes. Takes back frost.

### 8. The Sunken Kingdom

**Arrival.** From the deck of a boat, the Caldera Sea flat and clear, and under
the keel a city: towers, streets, a coliseum, fish moving down its avenues, all
lit from below by something on the sea floor that glows and turns. A stair
comes up out of the water onto a reef, and a crowned figure stands at the top
of it, water pouring off him, looking at your dragon.

**The feel.** The ocean biome as a zone: sailing on top, and, after the deep is
taken, walking and fighting under. Coral, drowned marble, air pockets in
palaces, pearl light. The one realm with no land but reefs.

**The story here.** Before the dragons ruled, the Sunken Kingdom did. Its king
made the first bargain with the sea-wyrms and broke it, and the sea took the
kingdom in a night and left the king alive to do his rounds. He has been
walking up the stair every night for three thousand years to find the sea still
there. He holds the pearl that lets a dragon breathe under water, the deep, and
he will give it to a Dragonsworn who can tell him the sea-wyrms are gone,
because then his punishment is over. Thalassa was the last. The player knows
what happened to her.

**The cast.**
- **King Caradoc the Drowned.** Not a villain. A king of three thousand years
  who broke a promise and has kept the punishment perfectly. Signature: water
  pours off him and the pool at his feet never grows. Secret: he could have
  left the stair a thousand years ago and did not, because the sea is the only
  place his people are. He gives the deep or fights for it; he laughs once
  either way, when told about Thalassa, and it is the saddest sound in the
  game.
- **Pearl.** A living girl who dives the drowned city for salvage and has
  never been caught by the drowned, twenty, reckless, the best swimmer alive.
  Signature: she is always wet and never cold. Secret: she is Caradoc's blood,
  the last of the kingdom's line above water, which is why the drowned let her
  pass; she does not know until he tells her, and then she has to decide whose
  she is. Teaches swimming to the cap. Returns at the Throne with the drowned
  legion at her back, if the king gave the deep.
- **The Harbourmaster.** A Drowned in a chain of office who checks every boat
  that anchors over the city and knows the name of every ship that has ever
  sunk in the Caldera Sea, including yours if you are not careful.
- **Admiral Tancred**, if he lived, cannot follow you here, and stands on the
  Isles' shore watching the sea he cannot cross, and it is the closest the
  Legion comes to pity.

**Underground and the boss.** *The Drowned Palace*: the king's own, a
dungeon entirely under water once the deep is taken, air pockets as rooms.
Drowned, vampire knights of the old court, a Bone Dragon that was the
kingdom's guardian and drowned with it, and *King Caradoc*, who is fought only
if the player lies to him about Thalassa. Told the truth, he gives the pearl
and walks down the stair for the last time.

**Out in the open.** *The Ghost Tide* rises from here. *The Coliseum*, an
event: on the full moon the drowned fight in their old arena and a living
champion may enter and win the pearl the hard way. *The Glow*, the thing on the
sea floor, which is the sea-wyrms' egg-chamber, empty, and the source of every
light in the kingdom.

**The dragon here.** Eats pearls, which it should not. Takes back the deep.

### 9. The Ashen Throne

**Arrival.** A volcano that is the whole eastern rim, black glass slopes, red
rivers, a fortress cut into the crater wall with nine dragon skulls on its
gate. Inside, a throne room where the air moves like glass and a man sits with
fire coming off him like breath, and behind him, on the wall, nine dragon
hearts still beating in nine iron cages.

**The feel.** Volcano and caves: lava, cinder, ash, sulphur light, the Legion's
fortress and the crater under it. The end of the world, on purpose.

**The story here.** Everything comes here. The Legion's army stands in the
outer works, and every ally the player made across eight realms stands against
it: Bram with a rake and the Greenwold behind him, the Court's archers or the
Court's traitors, Maravel's fleet or Maravel's absence, the Ashwalkers with the
wells poisoned, the Brass City walking or burning, the ghosts of the Eyrie on
the wall, the White Pack, the giants, the drowned. Vane opens the door or does
not. Inside, Malachar, who has been in dragon time for a thousand years and has
not been touched in all of them, and who wants one thing: to be given a dragon,
once, instead of taking one.

**The cast.**
- **Malachar, the Wyrmking.** Not a monster who wants anything. A knight of the
  Eyrie who loved a dragon that died of a sickness he could not cure, and ate
  its heart to keep it with him, and found that it worked, and could not stop.
  Signature: he does not move except in dragon time, and when he speaks the
  words arrive before his mouth. Secret: he knows the pact would have saved
  his dragon and he did not know it then. He asks, at the end, to be given
  yours. The last fight is his answer to no.
- **Captain Serle Vane**, at the door, glove off.
- **Sister Halessa**, if she lived, with the record of the nine, which she reads
  aloud as the hearts are freed.
- **Marshal Skyward's ghost**, on the wall, whom Malachar sees, and stops for,
  and that is the opening the player gets.

**Underground and the boss.** *The Throne of Ash*: the fortress, the crater,
the heart-hall. The Legion's best, bone knights, the Brass Heart if it was not
turned, and *Malachar*, in three phases: the knight, who fights like Skyward
taught him; the Wyrmking, who pulls you into his dragon time so that for once
the world moves at your speed and he at his, and you learn what stolen
Wyrmsoul is; and the last, where the nine hearts on the wall answer your
dragon's roar and he is, for the first time in a thousand years, alone in his
own time.

**The last gift.** In this fight only, the dragon takes your death and you take
its: if you fall, it falls in your place and you stand, once. If it falls, you
fall in its place and it stands, once. The Bond decides who, and the player
never chooses it.

**The endings.**
- **The hearts freed.** Nine hearts released; they fly, and Kaldera has dragons
  again, somewhere, small and far. Malachar dies a man. The dragon is the
  first of a new age, and so are you.
- **The hearts eaten.** The player takes what Malachar offers instead of
  killing him: eat the hearts, become what he is, with the dragon willing. The
  Legion kneels. The dragon stays, and it is not yours any more; you are its.
  The world is safe and the player is the new Wyrmking, and the game keeps
  going, and every named ally reacts.
- **The hearts given.** Your dragon gives its own heart to Malachar, freely, the
  thing he asked for. He is healed and unmade at once, and dies grateful. Your
  dragon is a dragon without a heart, and it lives, because the pact holds two
  halves and you have one. It never flies again. You carry it.

---

## 6. For the cinematics

Every Arrival above is the shot list. Rules across all nine: the dragon is in
every one, and in each it is bigger. No narration. The realm's one line is the
only text, in the banner's serif. Weather and hour are the realm's own: the
Wastes at noon, the Boneyard in ash wind, Frostreach in the long night, the
Sunken Kingdom from under the keel, the Throne in sulphur light.

---

## 7. The build order

1. **The dragon companion**: an entity that follows, fights, eats, sleeps, has
   four bodies and a mood, and is drawn by a procedural model until the user's
   Blender dragons arrive (three sizes, one rig). Saves with the character.
2. **The Bond**: the meter, its fills and drains, the HUD arc, the save.
3. **Wyrmsoul core**: the world clock at one fifth with the player, dragon and
   the player's projectiles exempt; the call, the end pulse, the resolve; the
   fire breath; the visual and audio shell. The bar's fixed last slot.
4. **The gifts**: nine flags on the character, each unlocking one line of the
   table, and the realm dungeons that set them.
5. **The world**: nine zone records replacing twenty one, each with four to six
   subzone records and the biome overrides above; the map, compass and
   discovery already nest.
6. **The story system**: facts, named cast, readables, the journal, as
   `10-STORY.md` section 8 laid out; that design stands, only the content moved.
7. **The Legion**: a human faction with patrols, convoys, camps and officers,
   and Serle Vane as a recurring named encounter who is never a boss until he
   chooses to be.
