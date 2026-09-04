# Combat

Every fight is the same arithmetic, whether the thing swinging is you, a
skeleton, or a wolf. One resolver, called by everyone.

## The swing

```
swingSeconds = weapon.speed * (1 - DEX * 0.003) * (1 - swingSpeedBonus)
```
A 3.0 s longsword at 60 DEX swings every 2.46 s; a 2.0 s dagger at 90 DEX every
1.46 s. Floor 0.9 s. Each swing costs stamina equal to the weapon's weight in
stones; at zero stamina every swing is slowed by half and misses more.

## Hit or miss

```
attackerSkill = weaponSkill + Tactics * 0.25 + attackerHitBonus
defenderSkill = defender.weaponSkill * 0.5 + defender.Parrying * 0.5 + DEX * 0.4 + defenceBonus
hitChance = clamp(0.50 + (attackerSkill - defenderSkill) * 0.005, 0.10, 0.95)
```

Two equals hit each other half the time. Fifty skill points of difference move
the chance by 25. A grandmaster against a rat hits 95%; a beginner against a
wraith hits 10%. **Every attempt is a skill lesson**, miss or hit.

**Dodge** is rolled after a hit, from DEX and any dodge property, capped at 40%:
`dodge = clamp(DEX * 0.002 + dodgeBonus, 0, 0.40)`. A dodge shows as a grey
"dodge" over the defender and raises DEX.

**Parry** is rolled after that if a shield or second weapon is held:
`parry = Parrying * 0.004 * shield.parryFactor`, cap 45%. A parry takes no
damage and shows "parry". Parry teaches Parrying.

## Damage

```
weaponRoll = random(weapon.minDamage, weapon.maxDamage)
strengthBonus = STR * 0.006                      (60 STR: +36%)
tacticsBonus  = Tactics * 0.005                  (100: +50%)
anatomyBonus  = Anatomy * 0.003
raw = weaponRoll * (1 + strengthBonus + tacticsBonus + anatomyBonus + damageBonus%)
```
Ranged replaces STR with DEX in the strength bonus. Spells use their own
formula (below).

**Critical:** `critChance = 0.05 + critBonus`, crit multiplies raw by
`1.5 + critDamageBonus`. A crit is a yellow number, larger, with a sound.

**Armour** reduces what lands:
```
reduction = AR / (AR + 120)                      (AR 60: 33%; AR 120: 50%; AR 240: 67%)
final = max(1, round(raw * (1 - reduction) * (1 - resist[damageType])))
```
Resistances are per damage type (physical, fire, cold, poison, energy), each
capped at 70%. Armour gives physical AR and small typed resists by tier.

**Damage types:** physical, fire, cold, poison, energy. Poison ticks: a
poisoned target loses `level * 2` health a second for `level * 6` seconds,
Healing or a cure potion ends it.

## Health, death, respawn

Health 0 is death. The body drops; for now every item stays with you. You
respawn at the nearest **shrine** you have discovered, else the nearest
settlement well, after a 5 s count, at full health and half mana. A death is
announced in red across the centre: "You have died." Then the place you woke:
"You wake at Fern's Stone." Killing you costs the monster nothing; later,
item loss is one flag in the death resolver, which is written to accept it.

## Falling

Falling is the one damage nothing resists.
```
fallDamage = max(0, (fallMetres - 4) * 6)
```
A 4 m drop is free; 10 m costs 36; 25 m kills a fresh character outright. A
jump from standing rises 1.2 m and lands without damage. Landing shows the
number in orange.

## Jumping and moving in combat

Space jumps: 1.2 m, 0.7 s in the air, keeps horizontal momentum. A melee swing
started in the air is a **jump attack**: +25% damage, lands where you land,
knocks a target smaller than you back one metre. Casting rules are in
`04-CLASSES-ABILITIES.md`: fast spells cast while moving, powerful ones root you.

## Monsters

Every monster has: health, damage range, swing speed, hit skill, defence skill,
AR, resists, speed, **aggro radius**, **leash radius**, flee threshold, loot
table, gold range, and what it is (undead, beast, humanoid, elemental) because
some spells care.

**Aggro:** a monster whose aggro radius you enter turns and comes. Radius by
temperament: critters 0 (they never aggro), vermin 6 m, most monsters 12 m,
hunters 18 m, bosses 25 m. Aggro breaks if you get past the leash radius (2.5x
aggro) for 6 s; the monster walks home.

**Fleeing:** critters flee at any damage. Vermin and beasts flee below 25%
health and return healed. Undead and constructs never flee. A fleeing thing can
be run down.

**Fighting back:** a monster uses the same resolver against you, with its own
numbers. Anything you can hit can hit you. Monsters target whoever hit them
last unless a Provocation or Peacemaking roll says otherwise.

**Groups:** goblins, bandits and skeletons come in twos and threes and share
aggro: pull one and its friends within 8 m come too.

The monster roster with numbers is in `05-WORLD-CONTENT.md`.

## Floating numbers

| event | colour | size |
| --- | --- | --- |
| damage you deal | white | 1.0 |
| critical you deal | yellow | 1.5, shakes |
| damage you take | red | 1.2 |
| heal | green | 1.0 |
| miss, dodge, parry | grey | 0.8, the word |
| fall | orange | 1.2 |
| skill gain | bright green | 1.3, "+0.3 Mining" |
| stat gain | bright green | 1.6, "+1 STR" |
| gold | gold | 1.0, "+14 gold" |
| loot | rarity colour | 1.2, the item name |

Numbers rise 1.6 m over 1.2 s and fade in the last third. Never more than six
live at once over one target; the oldest goes early.

## The resolver's shape

```js
resolveMelee({ attacker, defender, weapon, now }) -> {
  hit, dodged, parried, crit, damage, damageType, killed,
  lessons: [{ who, skill, difficulty, success }],   // for the gain roll
  numbers: [{ over, text, kind }],                    // for the floating text
}
```
Pure. Same function for player-on-monster, monster-on-player, and later
player-on-player. Tested against fixed rolls both ways: a grandmaster kills a
rat in one hit, a rat needs many to kill a grandmaster, AR 120 halves, resist
caps at 70, dodge caps at 40.
