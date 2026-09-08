# Openings and abilities

There are four openings: Warrior, Ranger, Rogue and Wizard. Each is a spread
of the 250 stat points, a handful of skills already at 30 to 50, a kit, and
the abilities those skills unlock. Nothing is locked after the first minute.

## The openings

Each starts with 250 stat points and 200 skill points spread as shown, plus a
few coins and a kit. Skills listed at 0 are not restricted, just not begun.

| opening | STR | DEX | INT | CON | WIS | skills at start | kit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Warrior | 65 | 50 | 25 | 65 | 45 | Swordsmanship 50, Tactics 50, Parrying 40, Anatomy 30, Healing 30 | longsword, kite shield, leather outfit, 6 bandages |
| Ranger | 45 | 70 | 35 | 50 | 50 | Archery 50, Tracking 45, Tactics 35, Foraging 35, Animal Lore 35 | shortbow, 60 arrows, dagger, leather outfit |
| Rogue | 40 | 75 | 40 | 45 | 50 | Fencing 50, Stealth 45, Hiding 40, Lockpicking 35, Poisoning 30 | two daggers, leather outfit, 3 lockpicks |
| Wizard | 30 | 40 | 70 | 45 | 65 | Magery 50, Mysticism 30, Evaluating Intelligence 45, Meditation 45, Resisting Spells 30 | staff, cloth outfit, 4 mana potions |

**Customising:** after picking an opening you may move up to 30 stat points and
30 skill points around before you set foot in the world, so a Warrior can be
built quick rather than strong.

**Appearance:** body (three builds), skin (eight), hair (twelve styles, ten
colours), face marks, height 1.6 to 2.0 m. Cosmetic. Saved with the character.

## Abilities

An ability is `{ id, skill, minSkill, cost, cooldown, castTime, moving, range,
target, effect }`. Every ability unlocks from a skill, not an opening: at
Swordsmanship 30 anyone gets Power Strike. The bar shows twelve slots; drag any
learned ability onto it.

**Casting rules.** `castTime 0` fires instantly. The `moving` column
decides the rest: a short cast marked `yes` (none is longer than 0.8 s) may be
cast on the run and is interrupted only by taking damage over 10% of your
health (Focus reduces that chance). A cast marked `no` roots you for that
long and moving ends it outright. Every cast over one second is rooted.
Powerful spells are the rooted ones; the small ones travel. Melee abilities
replace the next swing.

**Costs.** Melee abilities cost stamina; spells cost mana. Mana cost is
`base * (1 - lowerManaCost)`. Armour burdens casting (C1, 02-COMBAT "Armour
and casting"): cloth not at all, leather a little, plate mostly; a cast takes
longer by the burden and fizzles by it times 0.6. Chivalry is exempt.

**Gain.** Using an ability is a lesson in its skill at the ability's difficulty
(its minSkill + 20).

### Warrior (Swordsmanship, Macefighting, Fencing, Polearms, Tactics, Parrying)

| ability | unlocks | cost | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Power Strike | weapon skill 30 | 15 stam | 6 s | 0 | yes | next swing +60% damage |
| Whirlwind | weapon skill 50, Tactics 40 | 30 stam | 12 s | 0.4 s | no | hits everything within 3 m for 80% |
| Leap Slam | weapon skill 60, STR 50 | 25 stam | 10 s | 0 | yes | jump up to 8 m, land for 120% in a 2.5 m ring, knockback |
| Shield Bash | Parrying 40 | 20 stam | 9 s | 0 | yes | 50% damage, stun 2 s; needs a shield |
| Rend | Swordsmanship 45 | 20 stam | 8 s | 0 | yes | 70% damage plus bleed 3 a second for 8 s |
| Crushing Blow | Macefighting 45 | 20 stam | 8 s | 0 | yes | 90% damage, stuns 3 s, breaks 10 AR for 10 s |
| Lunge | Fencing 45 | 15 stam | 7 s | 0 | yes | dash 5 m and hit for 110% |
| Sweep | Polearms 45 | 25 stam | 9 s | 0 | yes | hits a 120 degree arc for 75%, knockback |
| Battle Cry | Tactics 60 | 30 stam | 30 s | 0 | yes | +20% damage to you and allies within 10 m for 12 s |
| Berserk | Tactics 80, CON 60 | 40 stam | 60 s | 0 | yes | +40% damage and swing speed, -30% AR, 15 s |
| Disarm | Wrestling 50 | 20 stam | 15 s | 0 | yes | target drops its weapon for 6 s |
| Riposte | Parrying 70 | 0 | 0 | 0 | passive | a parry counters for 50% |

### Ranger (Archery, Marksmanship, Tracking, Animal Lore)

| ability | unlocks | cost | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Aimed Shot | Archery 30 | 15 stam | 6 s | 1.2 s | no | +80% damage, +20% hit |
| Double Shot | Archery 45 | 20 stam | 8 s | 0 | yes | two arrows at 70% each |
| Volley | Archery 60 | 35 stam | 15 s | 1.5 s | no | rains arrows on a 5 m circle, 60% to each thing in it |
| Piercing Arrow | Archery 55 | 20 stam | 10 s | 0 | yes | ignores 50% AR, passes through to a second target |
| Crippling Shot | Marksmanship 40 | 15 stam | 10 s | 0 | yes | 60% damage, target slowed 50% for 6 s |
| Disengage | Archery 40, DEX 55 | 15 stam | 12 s | 0 | yes | leap 6 m backwards, +30% run speed for 3 s |
| Fleet Foot | Tracking 50 | 0 | 0 | 0 | passive | +10% run speed, +20% at Tracking 90 |
| Hunter's Mark | Tracking 40 | 10 stam | 20 s | 0 | yes | target takes +15% from you for 30 s and cannot hide |
| Snare | Tinkering 30 or Tracking 60 | 10 stam | 20 s | 0.8 s | no | a trap that roots the first thing to step in it for 4 s |
| Beast Call | Animal Lore 50 | 30 stam | 90 s | 2 s | no | the nearest wild beast fights for you for 30 s |

### Mage (Magery, Evaluating Intelligence, Meditation)

Spell damage: `base * (1 + INT * 0.008 + EvaluatingIntelligence * 0.006 + spellDamage%)`.

| spell | unlocks | mana | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Magic Arrow | Magery 0 | 4 | 0 | 0 | yes | 8 to 12 energy, the spell you learn on |
| Fireball | Magery 25 | 9 | 3 s | 0.6 s | yes | 18 to 26 fire, burns 2 a second for 4 s |
| Ice Shard | Magery 30 | 9 | 3 s | 0.6 s | yes | 14 to 22 cold, slows 30% for 4 s |
| Lightning | Magery 45 | 14 | 5 s | 0 | yes | 30 to 42 energy, instant |
| Blink | Magery 40 | 12 | 10 s | 0 | yes | teleport 12 m the way you face |
| Mana Shield | Magery 50 | 20 | 30 s | 0 | yes | damage comes off mana at 2:1 for 15 s |
| Frost Nova | Magery 60 | 25 | 14 s | 0.8 s | no | 20 to 30 cold to all within 5 m, roots 3 s |
| Chain Lightning | Magery 70 | 28 | 10 s | 1.2 s | no | 40 to 55, jumps to three more at 70%, 50%, 30% |
| Meteor | Magery 85 | 45 | 25 s | 2.5 s | no | 90 to 130 fire in a 6 m circle after a 1.5 s fall you can see coming |
| Arcane Mastery | Evaluating Intelligence 80 | 0 | 0 | 0 | passive | +10% spell crit |

### Sorcerer (Mysticism, Alchemy)

| spell | unlocks | mana | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Hex | Mysticism 20 | 8 | 6 s | 0 | yes | target -15% hit and defence for 12 s |
| Stone Skin | Mysticism 35 | 15 | 20 s | 0.5 s | yes | +30 AR for 12 s, -20% run speed |
| Eldritch Bolt | Mysticism 30 | 10 | 2 s | 0 | yes | 12 to 20 energy, 20% to silence 2 s |
| Ward | Mysticism 50 | 25 | 30 s | 1.5 s | no | a 4 m circle: allies inside take 30% less for 10 s |
| Transmute | Mysticism 55, Alchemy 40 | 20 | 20 s | 1 s | no | one stack of ore becomes the next tier up, 30% loss |
| Spell Plague | Mysticism 65 | 30 | 18 s | 1.2 s | no | 25 poison, then each spell you land on the target explodes for 15 to all nearby |
| Rift | Mysticism 80 | 40 | 40 s | 2 s | no | a 3 m tear that pulls in and holds monsters for 4 s, 10 a second |
| Elemental Kin | Mysticism 90 | 0 | 0 | 0 | passive | +15% to all typed resists |

### Necromancer (Necromancy, Spirit Speak)

Summons last 60 s + Spirit Speak seconds, follow you, fight what you fight, and
count toward one pet limit of 2 + floor(Spirit Speak / 40).

| spell | unlocks | mana | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Life Drain | Necromancy 20 | 8 | 4 s | 0 | yes | 10 to 16, you heal half |
| Raise Skeleton | Necromancy 30 | 20 | 20 s | 1.5 s | no | a skeleton warrior from any corpse within 6 m |
| Summon Imp | Necromancy 40 | 18 | 25 s | 1.2 s | no | a fast fire-flinging imp for the duration |
| Bone Spear | Necromancy 45 | 14 | 5 s | 0.5 s | yes | 26 to 38 physical, passes through in a line |
| Fear | Necromancy 50 | 15 | 15 s | 0 | yes | beasts and humanoids within 6 m flee for 5 s |
| Corpse Explosion | Necromancy 60 | 20 | 8 s | 0 | yes | a corpse within 10 m bursts for 35 to 50 in 4 m |
| Summon Hound | Necromancy 65 | 28 | 30 s | 1.5 s | no | a shadow hound, fast, bleeds what it bites |
| Curse of Weakness | Spirit Speak 50 | 15 | 20 s | 0 | yes | -20% damage, -20% AR for 15 s |
| Lich Form | Necromancy 85, Spirit Speak 70 | 50 | 120 s | 3 s | no | 30 s: spells cost health not mana, +30% necromancy damage, you cannot be healed |
| Raise Champion | Necromancy 95 | 60 | 180 s | 3 s | no | one bone knight, as strong as you, for 2 minutes |

### Healer (Healing, Anatomy, Chivalry, Veterinary)

Bandages are Healing's first tool: 4 s to apply, heal `Healing * 0.4 +
Anatomy * 0.2`, cure poison at Healing 60, resurrect at Healing 80 and Anatomy
80. Chivalry is holy magic that works in plate.

| ability | unlocks | cost | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Bandage | Healing 0 | 1 bandage | 0 | 4 s | no | as above; interrupted by damage |
| Heal | Chivalry 20 | 10 mana | 3 s | 0.8 s | yes | 20 + Chivalry * 0.3 |
| Cleanse | Chivalry 35 | 12 mana | 8 s | 0 | yes | removes poison, bleed and one curse |
| Greater Heal | Chivalry 50 | 22 mana | 6 s | 1.5 s | no | 50 + Chivalry * 0.6 |
| Bless | Chivalry 40 | 15 mana | 20 s | 0.5 s | yes | +5 to all stats for 30 s |
| Sanctuary | Chivalry 65 | 30 mana | 45 s | 1.5 s | no | a 5 m circle where nothing can be attacked for 6 s |
| Consecrate Weapon | Chivalry 45 | 12 mana | 15 s | 0 | yes | your hits do holy damage to undead, +50%, for 20 s |
| Smite | Chivalry 60 | 18 mana | 10 s | 0 | yes | 30 to 45 energy, x2 to undead |
| Resurrect | Healing 80 and Anatomy 80, or Chivalry 85 | 40 mana | 60 s | 5 s | no | raises a fallen player where they lie |
| Lay on Hands | Chivalry 90 | 50 mana | 90 s | 0 | yes | heal to full, once |

### Rogue (Fencing, Stealth, Hiding, Poisoning, Stealing)

| ability | unlocks | cost | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Hide | Hiding 0 | 10 stam | 8 s | 1 s | no | invisible while still; Stealth lets you move |
| Dual Strike | Fencing 30 | 15 stam | 5 s | 0 | yes | two dagger cuts, one from each hand |
| Backstab | Fencing 40, Hiding 30 | 20 stam | 6 s | 0 | yes | from behind or from hiding: x3 damage |
| Deep Cut | Fencing 45 | 18 stam | 8 s | 0 | yes | x0.75 damage, then 3 physical a second for 6 s |
| Throwing Knife | Fencing 35 | 12 stam | 6 s | 0 | yes | 8 to 14 physical at short range |
| Poison Blade | Poisoning 30 | 1 poison | 0 | 0 | yes | next 5 hits poison at your Poisoning level / 20 |
| Kidney Shot | Fencing 55, Hiding 40 | 25 stam | 18 s | 0 | yes | x0.5 damage and a 2 s stun from behind or hiding |
| Finishing Strike | Fencing 60 | 22 stam | 10 s | 0 | yes | x2 damage against a target under half health |
| Shadowstep | Stealth 60 | 20 stam | 15 s | 0 | yes | appear behind the target within 10 m |
| Vanish | Hiding 70 | 30 stam | 60 s | 0 | yes | drop aggro, hide instantly, even in a fight |
| Pick Pocket | Stealing 30 | 10 stam | 30 s | 1 s | no | take gold or a common item from a humanoid monster |
| Evasion | Fencing 60, DEX 70 | 25 stam | 45 s | 0 | yes | dodge everything for 4 s |
| Expose Weakness | Anatomy 60 | 15 stam | 20 s | 0 | yes | target takes +25% damage from all for 10 s |

### Bard (Musicianship, Provocation, Peacemaking, Discordance)

| ability | unlocks | cost | cd | cast | moving | effect |
| --- | --- | --- | --- | --- | --- | --- |
| Provoke | Provocation 20 | 15 stam | 12 s | 1 s | no | two monsters fight each other for 20 s |
| Peace | Peacemaking 20 | 15 stam | 15 s | 1 s | no | drops all aggro within 8 m; monsters stand down 8 s |
| Discord | Discordance 20 | 15 stam | 15 s | 1 s | no | target -20% to all stats and skills for 20 s |
| Marching Song | Musicianship 40 | 10 stam | 30 s | 0 | yes | allies within 12 m +15% run speed for 30 s |
| War Drum | Musicianship 60 | 20 stam | 30 s | 0 | yes | allies +10% damage and swing speed for 20 s |
| Lullaby | Peacemaking 70 | 30 stam | 60 s | 2 s | no | everything within 10 m sleeps 6 s or until struck |

### Everyone

| ability | unlocks | cost | cd | notes |
| --- | --- | --- | --- | --- |
| Jump | always | 5 stam | 0 | 1.2 m; a swing in the air is a jump attack |
| Sprint | always | 3 stam/s | 0 | shift; RUN_SPEED |
| Bandage | Healing 0 | a bandage | 0 | anyone can bind a wound |
| Meditate | Meditation 0 | 0 | 0 | sit still, mana regen x3, broken by anything |
| Camp | Camping 20 | wood | 0 | a fire: rested bonus, safe log out |
| Recall | always | 10 stam | 120 | 3 s standing still, then home on the green at Haven (2026-09-08) |

## Balance intent

Every opening kills the same rat at the same speed and the same skeleton at
roughly the same speed; the difference is how. Warriors take hits, Wizards
avoid them, rangers keep distance, and rogues choose the angle. The check
that pins it: `docs/mmo/balance.test.mjs` runs each opening against the tier 2
skeleton with a fixed seed and asserts kill times within 25% of each other and
no opening dying to it more than one time in twenty.
