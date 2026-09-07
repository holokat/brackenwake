# IS2: the island grows, the monsters bite, the bar tells the truth, and a yard to learn in

Written 2026-09-08 by Fable, four requests in one afternoon on the Starting
Island.

## Forage on the island

The user: "check to see if we have sufficient foraging materials on the
island. I dont see much." Measured: none. Nine loaded chunks around the player
held zero pickables. `forage.js` made a sculpted world a blank canvas (ED3),
showing only the forage rows its space files place by hand; the Greenwold's
spaces carry 206 such rows and the island's 23 carry none.

The island's header already says `wild: true`, the word monsters and fauna
roll on. Forage now reads it too: a wild sculpt world grows its own on top of
anything authored. Measured after: 34 to 38 pickables within 40 m at the hill
field, the west wood and the downs, 249 to 295 loaded around the player;
chanterelle, porcini, honey and fiddlehead only where the wood's trees are.
Test: `forage.test.mjs`, "a sculpt world grows nothing unless its header says
wild".

## Monsters that hurt

The user: "it feels like monsters dont do enough damage. i barely get hurt."
Measured on a 157 health character in leather with 50 in every skill and 73
DEX: a wolf took 13 health in twenty seconds, a skeleton 7, a bandit about
the same. The character's own regeneration at CON 52 gave back 29 in the same
twenty seconds. Nothing on the island could wear him down.

Three numbers, each with its reason in the code:

- `IN_COMBAT_REGEN` 0.25 (actor.js): health knits at a quarter of the base
  rate in a fight; out of one it is still double. It was the base rate.
- `DEFENCE_PER_DEX` 0.2 (combat_rules.js): DEX in the defence roll was 0.4,
  and 73 DEX alone outweighed 50 points of Parrying, so a bandit (hit 42)
  landed one swing in four. The doc's formula line follows.
- `MONSTER_DAMAGE_FACTOR` 1.6 (combat_pace.js): the rows keep their written
  numbers in `baseDamage`; health already carried a 1.5 factor so a fight
  lasted, and now the fight also costs something.

Expected against that same character: a bandit lands one swing in three for
about 14, a pack of three ends him in under a minute if he does nothing. A
fresh character at skill 30 falls to two skeletons in about half a minute.
Tests updated where they asserted the written numbers; the fixtures for the
hit rate moved to DEX 100 so the two equal fighters still meet at 0.500.

## The bar tells the truth

The user: "skills should not be added to the hotbar from the start if the
player has not unlocked them yet." What was on it: every row whose skill
floor the opening met, from every class. An archer's bar carried Magic Arrow,
Hex, Life Drain and Heal, none of which a bow can cast.

`progression.starterBar` seeds a fresh bar with the opening's own group's
unlocked rows that the starting kit can actually use (the weapon check runs
against the equipment), plus Bandage. Nothing else. Later unlocks stay off
the bar and the unlock line says which slot to drag them to. `OPENING_GROUP`
moved to openings.js so progression can read it without the creation screen.
Existing characters keep the bar they have; the seed runs only on an empty
one.

## The Training Yard

The user: "place an archery target and training dummies on the island
somewhere for training weapons and stuff from 0 skill. they should be
hittable. use codex to generate models."

- `island_training.json`, "The Training Yard", at (118, 240): a rail fence
  on the lane east out of Haven, three dummies along the north rail, two
  straw targets against two hay ricks at the south end, a weapons rack, a
  spear rack, a barrel, a crate, a lamp and a fingerpost. Sited by a search
  of the island for flat ground 8 to 18 m off a lane and clear of every
  space; height spread 1.8 m across the yard.
- Two monster rows, `trainingDummy` and `archeryTarget`: tier 1 so they have
  a plate and a def of 20 to roll against, damage 0 to 0, aggro 0, run 0,
  never flee, the `dummy` tag. The row audit exempts a `dummy` from the
  damage bands and the habitat check; the document tests leave them out.
- The bodies: Codex (GPT-5.5) wrote `training_models.js`, a post-and-sacking
  dummy in three variants and a straw boss on a tripod with painted rings,
  1056 to 1188 triangles, with its own 37 check test. monster_models.js
  builds them as `still` shapes: the poser leaves them alone except for the
  knock a hit gives, and effects' clips get inert channels to write.
- Behaviour: `stepMonster` returns at once for a still body; the critter bolt
  skips it; when combat kills it, `standBackUp` puts it back at full health
  with "The training dummy rocks on its post and rights itself" instead of a
  corpse, loot or a respawn timer.
- The lesson: combat's `teach` refuses a weapon lesson once the skill reaches
  the body's `trainsTo` (TRAINING_CAP 35) and says so once per skill: "The
  training dummy has taught you what it can of Swordsmanship. Past 35 it
  takes a real fight."

Measured in the game: 13 sword hits in twenty seconds took Swordsmanship 0
to 3.3 and Tactics to 2.1; at 34.8 the next hits reached 35.0, the cap line
was said and nothing rose after; four arrows at 12 m took Archery 0 to 1.8;
the dummy was knocked to 2 health twice and stood back up twice.

## Also found

- The dev server had died and the page kept running: icons and models load
  on demand, so the bar showed broken images and the paper doll fell back to
  the hatchling. Nothing was lost; the server was restarted.
- Codex's default model (`gpt-6-astra`) refuses this CLI version; `-m gpt-5.5`
  works.
