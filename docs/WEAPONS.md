# Weapons

Base shapes from `src/mmo/items.js` and every metal they can be forged in from `src/mmo/recipes.js` and `src/mmo/ores.js`. Any base can also drop from a monster in any rarity with affixes; a legendary carries a named power.

## The three ways to fight

A weapon is a decision about which skill you raise. There are three of them and
every settler is handed all three in the first minute: something to swing,
a bow with forty arrows, and a wand.

**A focus** is the third. `casts` in the notes column means a spell will go
through this and only this: `abilities.js` refuses every ability that costs
mana unless a wand, a staff or a bone staff is in the main hand, and says so by
name ("Fireball wants a wand or a staff in your hand, and you are holding a
Longsword"). A wand takes one hand, so a caster can still carry a shield; a
staff takes two and taps harder. Both train Magery when they are swung, and
both are worse in a fight than anything else that costs a hand, which is what
they pay for casting.

**The Quarterstaff is not one of them.** It is a Macefighting stick, it hits
harder than the mage's staff, and no spell goes through it. It used to carry a
`casts` flag that nothing in the game read.

## Base shapes

| Weapon | Skill | Hands | Damage | Speed | Weight | STR | Reach or range | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dagger | fencing | 1 | 3 to 8 | 2 s | 1 | 0 | 1.5 m |  |
| Rapier | fencing | 1 | 6 to 12 | 2.4 s | 2 | 15 | 1.5 m |  |
| Spear | fencing | 2 | 10 to 20 | 3.2 s | 6 | 35 | 3 m |  |
| Shortsword | swordsmanship | 1 | 6 to 12 | 2.5 s | 3 | 15 | 1.5 m |  |
| Longsword | swordsmanship | 1 | 9 to 16 | 3 s | 4 | 30 | 1.5 m |  |
| Greatsword | swordsmanship | 2 | 16 to 28 | 3.8 s | 9 | 60 | 1.5 m | cleave 2 |
| Axe | swordsmanship | 1 | 8 to 15 | 3.1 s | 5 | 30 | 1.5 m | fells trees |
| Battleaxe | swordsmanship | 2 | 15 to 27 | 3.9 s | 10 | 60 | 1.5 m | fells trees |
| Mace | macefighting | 1 | 8 to 14 | 3 s | 5 | 30 | 1.5 m |  |
| Warhammer | macefighting | 2 | 14 to 26 | 4 s | 12 | 65 | 1.5 m |  |
| Maul | macefighting | 2 | 12 to 24 | 3.6 s | 9 | 55 | 1.5 m |  |
| Halberd | polearms | 2 | 14 to 25 | 3.9 s | 11 | 60 | 3.5 m | cleave 3 |
| Glaive | polearms | 2 | 12 to 22 | 3.5 s | 9 | 50 | 3.5 m |  |
| Quarterstaff | macefighting | 2 | 6 to 12 | 2.6 s | 3 | 10 | 1.5 m |  |
| Wand | magery | 1 | 2 to 6 | 2.2 s | 1 | 0 | 1.5 m | focus, energy, casts |
| Staff | magery | 2 | 5 to 11 | 2.8 s | 4 | 10 | 1.5 m | focus, energy, casts |
| Shortbow | archery | 2 | 7 to 13 | 2.8 s | 3 | 15 | 25 m range |  |
| Longbow | archery | 2 | 11 to 19 | 3.4 s | 5 | 35 | 35 m range |  |
| Crossbow | marksmanship | 2 | 14 to 24 | 4.2 s | 7 | 30 | 30 m range |  |
| Throwing Knives | marksmanship | 1 | 5 to 9 | 1.8 s | 1 | 0 | 12 m range |  |
| Fists | wrestling | 0 | 1 to 4 | 2.2 s | 0 | 0 | 1.2 m |  |

## Forged variants (140 recipes)

Each shape in each metal, with the Blacksmithing difficulty. Metal order is the ore ladder.

| Shape | Copper | Tin | Iron | Silver | Coldiron | Emberite | Rimesteel | Verdite | Voidrock | Starfall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dagger | 5 |  | 19 | 26 | 33 | 40 | 47 | 54 | 61 | 68 |
| throwingKnives | 6 |  | 20 | 27 | 34 | 41 | 48 | 55 | 62 | 69 |
| rapier | 10 |  | 24 | 31 | 38 | 45 | 52 | 59 | 66 | 73 |
| shortsword | 10 |  | 24 | 31 | 38 | 45 | 52 | 59 | 66 | 73 |
| mace | 12 |  | 26 | 33 | 40 | 47 | 54 | 61 | 68 | 75 |
| longsword | 12 |  | 26 | 33 | 40 | 47 | 54 | 61 | 68 | 75 |
| axe | 14 |  | 28 | 35 | 42 | 49 | 56 | 63 | 70 | 77 |
| spear | 16 |  | 30 | 37 | 44 | 51 | 58 | 65 | 72 | 79 |
| glaive | 18 |  | 32 | 39 | 46 | 53 | 60 | 67 | 74 | 81 |
| maul | 20 |  | 34 | 41 | 48 | 55 | 62 | 69 | 76 | 83 |
| halberd | 22 |  | 36 | 43 | 50 | 57 | 64 | 71 | 78 | 85 |
| warhammer | 22 |  | 36 | 43 | 50 | 57 | 64 | 71 | 78 | 85 |
| battleaxe | 24 |  | 38 | 45 | 52 | 59 | 66 | 73 | 80 | 87 |
| greatsword | 25 |  | 39 | 46 | 53 | 60 | 67 | 74 | 81 | 88 |
