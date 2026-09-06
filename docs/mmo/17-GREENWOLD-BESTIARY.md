# The Greenwold bestiary: every body the first zone needs, and what each one does

Written 2026-09-06 from `src/mmo/monsters.js` (the rows and their tags),
`src/mmo/realms.js` (which place holds what), `src/world/fauna.js` (the
animals) and `src/game/monsters.js` and `monster_ai.js` (what the tags make a
body do). Every behaviour listed here is one the engine drives today; nothing
is promised that the code does not do. Where a number is given it is the
constant the code uses.

Every creature below already has a procedural body in `monster_models.js`
(`BODY_FAMILIES`: biped, skeleton, goblin, zombie, rat, wolf, grub, flyer, and
one per animal). Those are stand-ins. This list is what to replace them with.

## 1. The clips every body needs

The monster layer drives one set of animation states, so every model needs
these, at minimum:

| clip | what triggers it | notes for the animator |
|---|---|---|
| idle | standing, drifting about its home spot | a new spot every 3 to 7 seconds, a slow amble; the idle should loop with a breath in it |
| walk | moving below its run speed | speed scaled by the engine, so author at a natural pace and it will be stretched |
| run | chasing, fleeing, charging | fleeing is 1.1 times run speed |
| swing | a melee blow | one shot, wind up then strike; the hit lands part way through, so keep the strike beat readable |
| hurt | a blow lands on it | one shot flinch, short |
| cast | a spell or a shout | falls back to swing if there is no cast clip; bodies with a ranged or shouted move want a real one |
| die | health reaches zero | 1.1 seconds to the ground; the corpse then lies 90 seconds and can be skinned |

Then the tags add moves. Each creature's row below says which.

## 2. The animals (tier 0)

Targetable, skinnable, no gold, never attack first. They bolt when you come
within 7 metres or when anything hurts them, run until they are 25 metres
away, then walk home. Fleeing is the whole of their combat. All of them drop
meat and hide.

| animal | where | body | clips beyond the base set |
|---|---|---|---|
| Deer | meadow, in ones to fours | 1.4 m at the shoulder, hooves, ears up, carried head | graze (head down idle variant), bolt with the head high, a startle before the bolt |
| Rabbit | meadow, ones to threes | small, long ears | sit up, hop cycle instead of walk, bolt in zigzag |
| Field Mouse | meadow, ones and twos | tiny; will be seen at grass height | scurry, freeze |
| Frog | wet ground and shore | small | sit, hop, a throat pulse in the idle |
| Fox | the Beech Hangar and the Standing Hedge, ones and twos | low, brush tail | trot, an erratic approach (its path wanders rather than running straight), pounce is not needed |
| Goose | the Mill Run, in twos to sixes | upright bird, walks and swims | waddle, wing flap threat, peck idle; the flock moves as one group |
| Crow | meadow and shore, twos to fives | black bird | perch, take off, flap and glide, land, hop on the ground |
| Gull | the shore, twos to sixes | white bird | as the crow, plus a stand into the wind |
| Hawk | the Standing Hedge, alone | raptor | perch, take off, soar with rare wing beats, a stoop (dive) with wings folded, land. Tamable at Taming 45 |

**Birds fly for real.** A crow, gull or hawk stands on the ground until you
come inside 7 metres, then climbs at 3.5 metres a second to a band of 6 to 12
metres, circles there with a slow bob, and comes back down to land once you
are gone. So each bird needs: perched idle, take off, flying loop, landing.
The hawk also stoops: from the air to the ground in a fold and back up.

**Tamable animals here:** goose (Taming 10, fed bread), fox (20, game meat),
hawk (45, rat meat). A tamed animal will need a follow and a sit.

## 3. The monsters of the open Greenwold and its places

The realm's danger band is tier 1 to 2, so open country between the named places
spawns both: giant rats and goblin scouts beside boar, bandits, raiders and the
Legion by day, and zombies and skeletons beside wolves, bandits and the Legion
by night. Rolled over the real Greenwold at four thousand chunks a pass, the mix
comes out about 28 per cent tier 1 and 72 per cent tier 2 by day and by night.
The named places carry their own tables and are allowed above the band, so the
Old Cellars keep the goblin warrior and Oram Blackhand. This is the code as of
today, and the wiki's "who lives where" table is now what actually spawns.

The band is 1 to 2 and not 1 to 1 because of the con rule: a fresh opening
starts at skill 50 and reads as tier 2, so a zone of nothing but tier 1 would be
green and grey from the first morning. See docs/mmo/wiring/C3-CON-KITE.md.

### Giant Rat (tier 1, vermin)
- **Where:** everywhere in the open by day, the Mill Run, the Beech Hangar, the Chalk Pits, the Old Cellars.
- **Body:** a rat the size of a small dog, 0.5 m long plus tail. In ones to threes.
- **Moves:** bite (swing), scurry run at 5.5 m/s, flee at a quarter health, die. One bite in ten carries disease, so a wet or foaming mouth reads well.

### Goblin Scout (tier 1, humanoid, goblin body)
- **Where:** open meadow by day, Highwayman's Hollow, the Old Cellars. In twos and threes; pull one and the group comes.
- **Body:** small biped, 1.2 m, dagger, a bandolier of throwing knives.
- **Moves:** it is a **thrower**. It throws knives at anything inside fourteen metres and holds the ground it is standing on; it does not step back when you close, and inside sword reach it draws the dagger and swings that instead. So: throw (overarm), dagger swing, run, flee at a quarter health.

### Goblin Warrior (tier 2, humanoid, goblin body)
- **Where:** the Old Cellars, and whistled up by Oram Blackhand.
- **Body:** stockier goblin, 1.3 m, short sword and buckler.
- **Moves:** sword swing, shield raise (a hurt variant with the shield taking it reads well), run, flee low.

### Zombie (tier 1, undead)
- **Where:** open meadow at night, the Mill Run at night, the Sunken Chapel.
- **Body:** a dead villager, 1.7 m, one arm hanging wrong.
- **Moves:** shamble (its run is 3 m/s, so walk and run are both slow), a slow heavy swing every 3.6 seconds, hurt, die. **Never flees.** Its touch poisons, so the hands should look like it.

### Skeleton (tier 1, undead)
- **Where:** open meadow at night, the Chalk Pits at night, the Sunken Chapel.
- **Body:** bones, 1.7 m, short sword and buckler. In twos and threes, shares aggro.
- **Moves:** swing, block, walk, run at 4.5 m/s, die (a collapse into bones is the right death). Never flees. Holy damage doubles on it.

### Thorn Grub (tier 1, vermin, grub body)
- **Where:** the Chalk Pits mine, day and night.
- **Body:** a segmented grub a metre long with a thorned head.
- **Moves:** crawl (run is 2 m/s, so one slow crawl cycle), a lunging bite that poisons, hurt, die. Drops reagent.

### Bandit (tier 2, humanoid, biped)
- **Where:** the Mill Run by day, the Kingsroad, Highwayman's Hollow, the Old Cellars. Twos and threes, shares aggro. Carries coin over its tier.
- **Body:** a man or woman in stolen coats, dagger or rapier, 1.8 m.
- **Moves:** swing (a fast rapier thrust and a dagger slash, two variants), run at 6 m/s, flee at a quarter health with a look back.

### Wolf (tier 2, beast)
- **Where:** everywhere at night: the Mill Run, the Beech Hangar, the Kingsroad, the Standing Hedge, Highwayman's Hollow. Packs of two to four.
- **Body:** 0.8 m at the shoulder, lean.
- **Moves:** lope (run at 8.5 m/s, the fastest thing in the zone), bite, a circling idle when it is near you, flee low with the tail down, die. **The Fox That Is Not** is a wolf that walks like a fox at dusk; a slightly wrong fox gait on the wolf body would be enough.

### Boar (tier 2, beast)
- **Where:** the Beech Hangar, day and night. Ones and twos.
- **Body:** 1.0 m at the shoulder, tusks. **Old Grist** is a boar the size of a pony, so a scaled up variant with broken tusks.
- **Moves:** it **charges**: closes the last stretch at a run and the blow that lands hits harder. So: a head down charge run, a tusk swing (upward hook), root and dig idle, hurt, die.

### Legion Soldier (tier 2, humanoid, biped)
- **Where:** the Kingsroad by day and night, open meadow. Twos to fours.
- **Body:** a man in the Legion's black and brass: mail, a square shield with the nine skulls, a short sword. He is not a monster and he should not move like one.
- **Moves:** sword swing from behind the shield, **shield wall** (when two or more stand within 4 metres each gains armour, so a shields-up locked stance idle when another soldier is close), **war cry** (a shout that lifts allies; a cast clip with the sword raised), march (walk), run at 5.8 m/s, hurt on the shield, die.

### Legion Archer (tier 2, humanoid, biped)
- **Where:** the Kingsroad, open meadow. Twos and threes, with the soldiers.
- **Body:** the same man in half the armour with a longbow and a quiver at the hip.
- **Moves:** he is a **shooter**: stands behind the shields, draws and shoots at range, and holds his ground when you close, drawing a dagger once you are inside sword reach. So: nock, draw and release; dagger swing; run at 6.2 m/s.

### Raider (tier 2, humanoid, biped)
- **Where:** Highwayman's Hollow, open meadow. Twos to fours. Carries coin.
- **Body:** a Ridge Rider: desert cloth over stolen Legion mail, a scarf across the face, an axe taken off a convoy guard.
- **Moves:** **charges** (a run in with the axe back, the landing blow heavier), axe swing, run at 6.4 m/s, flee low.

### Drowned (tier 2, undead)
- **Where:** the Sunken Chapel, day and night.
- **Body:** a drowned man, waterlogged, weed in the hair, a rapier.
- **Moves:** slow (run 3.5 m/s), a rapier thrust every 3 seconds, hurt, die. Never flees. Water should run off it in the idle.

### Wraith (tier 4, undead, hunter)
- **Where:** the Sunken Chapel at night only. Alone. This is the zone's one red name and it is meant to be.
- **Body:** a hooded shape with no feet, 2 m, half there: half of all physical damage passes through it.
- **Moves:** a float (walk and run are the same glide, 7 m/s), a reaching touch (swing) that drains mana as well as health, a hurt that ripples rather than flinches, a die that comes apart. Never flees.

### Crab and Salt Crab (tier 1, vermin, grub body)
- **Where:** wherever the Greenwold meets the water. Crab in ones to threes; Salt Crab in twos to fours and it shares aggro.
- **Body:** Crab: a hand's span. Salt Crab: the size of a dog, white with dried salt, one claw twice the other.
- **Moves:** a sideways scuttle for both walk and run, a claw snap swing, hurt, die. The Salt Crab **grabs**: it takes hold and squeezes for two seconds, so a clamp and hold clip on it and a held pose on the player.
- The rest of the beach table (Coral Crab, Drowned Marine, Reef Eel, Harpy) is tier 2 and 3 and the Greenwold's band cuts it. They belong to the Saltmarch and are not needed for this zone.

## 4. The boss: Sergeant Oram Blackhand (the Old Cellars)

- **Body:** a bandit wearing half a Legion uniform he was given last month and has not earned: black coat, brass gorget, a sack of eggshell at his belt he will not put down even to fight. Longsword. 1.9 m. The plate over his head says champion and his name is purple.
- **Moves he shares with the soldiers:** longsword swing, **war cry**, **charge**.
- **At two thirds health:** he puts two fingers in his mouth and whistles, and two Goblin Warriors come up out of the cellar. A whistle clip, one hand to the mouth, the other holding the sack.
- **At one third health:** he drops the sack of shell and comes at you with both hands. His swings come 30 percent faster from here. So: a drop-the-sack transition, then a two-handed enraged swing set, faster.
- **Death:** he goes down holding the sack out, since the egg is the point of him. Loot rolls twice and is never worse than epic.

## 5. What the animator can skip for now

- Burrowing, ambush from hiding, dropping from above, breath, storms and
  slams exist in the engine but nothing in the Greenwold uses them.
- Nothing here swims. The Sunken Chapel is swum into by the player, not by
  the Drowned, who stand in it.
- No creature in this zone is tamed by default; taming is a later system and
  a follow and sit can wait for it.

## 6. Counted

30 rows are named for the Greenwold or its shore: 9 animals, 16 monsters,
1 boss, and 4 beach rows the band cuts. The named encounters (Old Grist, the
Fox That Is Not, the Tithe Wagon, the Legion convoy) are variants and events
on these bodies and need no body of their own.
