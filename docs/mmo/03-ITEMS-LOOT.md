# Items, loot, ore and crafting

An item is a small record: `{ id, base, rarity, seed, identified, affixes,
quality, durability, maker }`. Everything visible about it is derived from that
record and the tables here, deterministically, so a server and a client agree.

## Slots

Fourteen. The paper doll shows all of them.

| slot | takes |
| --- | --- |
| head | helm, hood, hat, circlet |
| neck | amulet |
| chest | tunic, robe, breastplate |
| back | cloak |
| hands | gloves, gauntlets |
| wrists | bracers |
| waist | belt, sash |
| legs | leggings, greaves |
| feet | boots, sandals |
| ring1, ring2 | rings |
| mainHand | any one-handed or two-handed weapon; a staff |
| offHand | shield, second one-handed weapon (Fencing and Swordsmanship only), tome, torch |
| ranged | bow, crossbow; quiver rides with it |

A two-handed weapon empties offHand. A bow in `ranged` is used when the mainHand
is empty or when the ranged ability is fired.

## Armour tiers

Six materials, each a full set of eight pieces (head, chest, hands, wrists,
waist, legs, feet, back). AR is per piece; a full set is the sum.

| tier | material | AR per piece (chest x2) | weight per piece | STR needed | Meditation | typed resist per piece |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cloth | 1 (2) | 1 | 0 | full | energy 1 |
| 2 | Leather | 3 (6) | 2 | 15 | full | cold 1, poison 1 |
| 3 | Studded leather | 5 (10) | 3 | 25 | 75% | poison 2 |
| 4 | Ringmail | 7 (14) | 5 | 40 | 40% | physical 1, fire 1 |
| 5 | Chainmail | 9 (18) | 6 | 55 | 20% | physical 2 |
| 6 | Platemail | 12 (24) | 9 | 75 | 0% | physical 3, fire 2 |

Full plate: AR 108 before affixes, 72 stones, needs 75 STR, no mana
regeneration from Meditation. Full cloth: AR 9, 8 stones, casts freely. This is
the whole warrior-and-wizard split; nothing else forbids anything.

Wearing armour above your STR is allowed and halves its AR, slows your swing by
10% per missing 10 STR, and says so when you put it on.

Shields: buckler (parry 0.6, weight 3), kite (0.9, 6, STR 30), tower (1.2, 10,
STR 55). A shield's parryFactor multiplies the Parrying roll.

## Weapons

Every weapon: `{ skill, hands, minDamage, maxDamage, speed, weight, strReq,
reach, damageType }`. Base table (before material and affixes):

| weapon | skill | hands | dmg | speed s | wt | STR | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dagger | Fencing | 1 | 3 to 8 | 2.0 | 1 | 0 | fast, backstab weapon |
| Rapier | Fencing | 1 | 6 to 12 | 2.4 | 2 | 15 | |
| Spear | Fencing | 2 | 10 to 20 | 3.2 | 6 | 35 | reach 3 m |
| Shortsword | Swordsmanship | 1 | 6 to 12 | 2.5 | 3 | 15 | |
| Longsword | Swordsmanship | 1 | 9 to 16 | 3.0 | 4 | 30 | |
| Greatsword | Swordsmanship | 2 | 16 to 28 | 3.8 | 9 | 60 | cleave 2 |
| Axe | Swordsmanship | 1 | 8 to 15 | 3.1 | 5 | 30 | also fells trees |
| Battleaxe | Swordsmanship | 2 | 15 to 27 | 3.9 | 10 | 60 | fells faster |
| Mace | Macefighting | 1 | 8 to 14 | 3.0 | 5 | 30 | stun 8% |
| Warhammer | Macefighting | 2 | 14 to 26 | 4.0 | 12 | 65 | stun 15% |
| Maul | Macefighting | 2 | 12 to 24 | 3.6 | 9 | 55 | armour piercing 20% |
| Halberd | Polearms | 2 | 14 to 25 | 3.9 | 11 | 60 | reach 3.5 m, cleave 3 |
| Glaive | Polearms | 2 | 12 to 22 | 3.5 | 9 | 50 | reach 3.5 m |
| Quarterstaff | Macefighting | 2 | 6 to 12 | 2.6 | 3 | 10 | a mage's stick, casts with it |
| Shortbow | Archery | 2 | 7 to 13 | 2.8 | 3 | 15 | range 25 m |
| Longbow | Archery | 2 | 11 to 19 | 3.4 | 5 | 35 | range 35 m |
| Crossbow | Marksmanship | 2 | 14 to 24 | 4.2 | 7 | 30 | range 30 m |
| Throwing knives | Marksmanship | 1 | 5 to 9 | 1.8 | 1 | 0 | range 12 m |
| Fists | Wrestling | 0 | 1 to 4 | 2.2 | 0 | 0 | |

## Rarity

Six tiers. Colour is the whole language.

| tier | colour | affixes | drop weight (base monster) | crafted chance at GM |
| --- | --- | --- | --- | --- |
| Common | white | 0 | 70 | 60% |
| Uncommon | green | 1 | 20 | 25% |
| Rare | blue | 2 | 7 | 10% |
| Epic | purple | 3 | 2.4 | 4% |
| Mythic | gold | 4 | 0.5 | 0.9% |
| Legendary | orange | 5 + a named power | 0.1 | 0.1% |

Monster tier shifts the weights up one row per two tiers. Luck (an affix and a
stat of some rings) adds `luck * 0.5%` to every roll above common. Bosses roll
twice and keep the better.

## Identify

A dropped item above common arrives **unidentified**: you see its colour and its
base ("a green longsword") and nothing else. Clicking it in the pack identifies
it: the affixes roll from `hash(item.seed)` so the result was always going to
be that, and the pack cannot be reloaded into a better sword. Identify costs
nothing; INT decides how much it tells you: below 40 INT one affix's number is
shown as a range, above 80 every number is exact. An Inscription scroll of
Identify tells everything regardless.

## Affixes

Sixty. Each has: a stat it changes, a range per rarity tier, which item kinds it
may sit on, and a name prefix or suffix. The roller picks distinct affixes from
what the base allows, weighted so defensive ones favour armour and offensive
ones weapons.

**Stat lines** (any slot): +STR, +DEX, +INT, +CON, +WIS (1 to 3 / 2 to 5 / 4 to
8 / 6 to 12 / 9 to 15 by tier from uncommon).

**Pools and regeneration** (any): +Health 5 to 40, +Mana 5 to 40, +Stamina 5 to
30, Health Regen 1 to 6 per 10 s, Mana Regen 1 to 6, Stamina Regen 2 to 8.

**Defence** (armour, shields, rings): +AR 2 to 15, Physical Resist 2 to 12%,
Fire Resist, Cold Resist, Poison Resist, Energy Resist (each 3 to 15%), Defence
Chance 2 to 12%, Dodge 1 to 8%, Parry 2 to 10%, Damage Reflect 3 to 15%,
Thorns (attackers take 1 to 6), Stun Resist 10 to 50%.

**Offence** (weapons, gloves, rings): Damage +5 to 30%, Swing Speed +5 to 25%,
Hit Chance +3 to 15%, Critical Chance +2 to 10%, Critical Damage +10 to 50%,
Armour Piercing 5 to 25%, Life Leech 3 to 12%, Mana Leech 3 to 12%, Stamina
Leech 3 to 10%.

**Hit effects** (weapons): Hit Fireball, Hit Lightning, Hit Frost, Hit Harm, Hit
Life Drain (each a 10 to 40% chance per hit of a small spell at half the
wielder's skill), Hit Fatigue, Hit Dispel.

**Magic** (robes, staves, rings, amulets): Spell Damage +5 to 30%, Cast Speed
+1 to 3, Cast Recovery +1 to 4, Lower Mana Cost 5 to 25%, Spell Channeling
(cast with the weapon held), Mage Armour (this piece does not block
Meditation), Faster Summons, Longer Buffs +10 to 40%.

**Skill lines** (any): +Skill 2 to 10 in one named skill; +All Combat Skills 1
to 5; +All Crafting Skills 1 to 5.

**Utility** (boots, cloaks, belts, rings): Run Speed +5 to 20%, Jump Height
+10 to 40%, Carry +10 to 60 stones, Night Sight, Water Walking, Fall Damage
Reduction 20 to 60%, Gold Find +5 to 40%, Luck 5 to 40, Harvest Yield +10 to
50%, Mining Speed +10 to 50%, Lumber Speed +10 to 50%, Self Repair 1 to 5.

**Named powers** (legendary only, one each, never rolled elsewhere):
Vampiric (all damage leeches 25%), Stormcaller (every hit chains lightning to
two others), Everfrost (hits slow 40% and can freeze), Phoenix (once a day,
death becomes 30% health), Sunder (ignores 50% AR), Windrunner (run speed +40%,
never falls), Archmage (cast while moving, always), Shepherd (pets +50% health
and damage), Kingsguard (nearby allies take 15% less), Undying (regeneration
tripled).

Names: prefix from the strongest affix, suffix from the second. "Vampiric
Longsword of the Stormcaller". Common items are just their base.

## Ore

Ten tiers. Each vein needs a Mining skill to work at all, yields ingots the
smith needs, and lends its property to everything forged from it.

| tier | ore | Mining to work | Mining to work well | colour | lends to gear |
| --- | --- | --- | --- | --- | --- |
| 1 | Copper | 0 | 20 | warm brown | nothing, learns you the trade |
| 2 | Tin | 10 | 30 | grey white | with copper makes Bronze: +1 AR |
| 3 | Iron | 20 | 45 | dark grey | the standard; +2 AR, +5% dmg |
| 4 | Silver | 35 | 55 | bright | +10% damage to undead, holy work |
| 5 | Coldiron | 45 | 65 | blue black | +12% damage to fae and summons, cold resist 5 |
| 6 | Emberite | 55 | 75 | red veined | fire damage 10%, fire resist 8 |
| 7 | Rimesteel | 65 | 82 | pale blue | cold damage 10%, cold resist 8, slows |
| 8 | Verdite | 72 | 88 | green gold | +poison resist 10, +Harvest Yield, light |
| 9 | Voidrock | 82 | 94 | matte black, no shine | +15% damage, ignores 10% AR, heavy |
| 10 | Starfall | 92 | 100 | grey with a white flash | +20% all, +1 affix roll, found only where meteorites lie |

Veins are placed by biome and depth: copper, tin and iron everywhere, silver
and coldiron in mountain caves, emberite in desert caves, rimesteel in snow,
verdite in sakura and deep forest, voidrock only in dungeon levels two and
three, starfall at named craters (a new site kind, rare). A vein above your
skill says so and gives nothing; a vein far below it gives full yield and no
lesson.

**Yield per break:** `1 + floor((Mining - tier.workAt) / 15)` ingots' worth of
ore, so a grandmaster gets 4 to 7 per copper vein and 1 to 2 per starfall.
**Rare vein chance** `Mining * 0.1%`: a vein that pays double and rolls a gem.

**Gems** (from rare veins, some monsters): amber, jade, garnet, sapphire, ruby,
diamond, starstone. Set into rings and amulets by Tinkering for a fixed affix.

**Wood** mirrors it in four tiers: oak (0), ash (30), heartwood (60), ironbark
(85), for bows, staves and hafts.

**Leather:** hide (any beast), thick hide (bear, dire wolf), scaled hide
(wyvern, drake), by Skinning skill.

## Crafting

A recipe: `{ result, skill, difficulty, materials: {...}, station }`.

**Success:** `chance = clamp(0.5 + (skill - difficulty) * 0.01, 0.05, 0.98)`.
Failure eats half the materials and still teaches.

**Quality** on success: `quality = clamp(0.9 + (skill - difficulty) * 0.005 + random(-0.2, 0.2), 0.5, 1.3)`, multiplies the item's damage or AR. An
exceptional roll (quality above 1.15, needs skill 20 over difficulty) marks the
item "exceptional" and lets the maker sign it. At exactly 20 over that is one
roll in eight; at 40 over, three in eight; at 70 over, three in four.

**Rarity from crafting:** every success rolls the "crafted chance" column above
scaled by `skill / 100`, and an exceptional roll adds one tier. A grandmaster
smith making a starfall greatsword has real odds of a purple and a small chance
of gold; a legendary needs starfall, exceptional, and luck.

Stations: **forge** (metal), **loom** (cloth), **tanning rack** (leather),
**workbench** (wood), **alchemy table**, **kitchen**, **inscription desk**.
Towns have them near the well; houses will later.

**Recipe families to author** (the data module holds the full list): every
weapon above in every metal it can take; every armour piece in every tier;
shields; bows, staves, arrows; potions (heal, mana, stamina, cure, strength,
agility, night sight, invisibility); food (six meals with stat buffs); tools
(axe, pickaxe, hatchet, sewing kit, tongs, saw, tinker's tools); bags (4, 8,
12, 16 slots); scrolls for each spell; house parts, later.

## Inventory

A pack has slots (starting 20, bags add theirs) and a weight limit from STR.
Items stack when identical and common (ingots, ore, wood, arrows, potions,
food). Over the weight limit you walk at half speed and cannot run; the HUD
weight readout turns red. Gold is weightless and unlimited.

Materials wood, stone and ore from the current game become stacks in this pack;
the 150 caps go away, the weight limit replaces them.
