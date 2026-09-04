# Stats and skills

Everything a character is. Both tables are data, both are pure, both are
node-testable, and nothing below reads THREE.

## The five stats

| stat | short | what it decides |
| --- | --- | --- |
| Strength | STR | melee damage bonus, carry capacity, armour and weapon requirements |
| Dexterity | DEX | swing speed, dodge, ranged accuracy, stamina pool |
| Intellect | INT | spell damage, spell critical chance, identify quality |
| Constitution | CON | health pool, health regeneration, stun resistance |
| Wisdom | WIS | mana pool, mana regeneration, spell duration and efficiency |

**Starting total 250**, spread by the opening you choose. **Per stat cap 100**
at the start. **Total cap 400**, so a fully grown character has 150 points more
than a new one and still cannot be excellent at everything.

Stats rise from use, the way skills do: a heavy swing that lands has a chance to
raise STR, a dodge raises DEX, casting raises INT, taking a hit raises CON,
meditating or healing raises WIS. Chance falls as the stat grows.

```
statGainChance(stat) = clamp(0.06 * (1 - stat / 110), 0.002, 0.06)
```

At 30 STR that is 3.6% a swing; at 90 it is 0.6%; at 100 it is 0.33%. A gain is
always exactly +1 and is always announced.

### The formulas everything else uses

```
maxHealth  = 30 + CON * 2.0 + STR * 0.5
maxMana    = 10 + WIS * 2.0 + INT * 0.5
maxStamina = 20 + DEX * 1.5 + CON * 0.5
carry      = 40 + STR * 2.0                    (stones)
healthRegen  = 0.4 + CON * 0.020               (per second, out of combat x2)
manaRegen    = 0.3 + WIS * 0.025 + Meditation * 0.010
staminaRegen = 1.0 + DEX * 0.030
```

A fresh warrior (STR 60, CON 55) has 140 health. A fresh mage (WIS 60, INT 65)
has 162 mana. Both feel like the character they chose from the first minute.

## Skills

**0.0 to 100.0** each, one decimal place. **Total cap 700.0**, which is seven
grandmasteries or a wider spread of good. Raising a skill when at cap lowers the
skill you have marked to fall, exactly as UO did; nothing is lost silently.

### The gain curve

The requirement was fast early and hard at the end. Gains come in bands:

| skill | gain per successful use | uses to the next band |
| --- | --- | --- |
| 0.0 to 30.0 | +0.3 | 100 |
| 30.0 to 50.0 | +0.2 | 100 |
| 50.0 to 70.0 | +0.1 | 200 |
| 70.0 to 85.0 | +0.05 | 300 |
| 85.0 to 95.0 | +0.03 | 333 |
| 95.0 to 100.0 | +0.01 | 500 |

A gain also has to be earned by the attempt being worth learning from:

```
gainChance(skill, difficulty) = clamp(0.55 - (skill - difficulty) * 0.006, 0.02, 0.90)
```

Difficulty is the task's own number: a copper vein is 10, a starfall vein is 92,
a rat is 5, a wraith is 70. Grinding rats at 90 swordsmanship gives a 0.02
chance of a 0.03 gain, which is the UO lesson: work at the edge of what you can
do. **A failed attempt still teaches**, at half the chance, which is why the
requirement says "per hit or miss".

Total uses from 0 to grandmaster in one skill, at a fair difficulty: about
1,533 successful lessons. At three seconds a swing that is roughly 77 minutes
of focused work for the first, and much longer for the last five points, which
is the shape UO had.

### Every skill

Nine groups, 44 skills. Every one is learnable by anyone.

**Combat, melee**
| skill | what it does |
| --- | --- |
| Swordsmanship | hit chance and damage with blades |
| Macefighting | hit chance and damage with maces, mauls, hammers; chance to stun |
| Fencing | hit chance and damage with daggers, rapiers, spears; faster swings |
| Wrestling | unarmed hit chance and damage; disarm chance |
| Polearms | hit chance and damage with halberds and glaives; reach and cleave |
| Tactics | flat damage multiplier for every melee weapon |
| Anatomy | damage bonus and the ceiling on Healing |
| Parrying | chance to block with a shield or a second weapon |

**Combat, ranged**
| skill | what it does |
| --- | --- |
| Archery | hit chance and damage with bows |
| Marksmanship | crossbows and thrown; slower, harder hitting |
| Tracking | reveals what is nearby and how far; range from skill |

**Magic**
| skill | what it does |
| --- | --- |
| Magery | the classic circles: fire, cold, lightning, blink, shield |
| Evaluating Intelligence | spell damage bonus, the mage's Tactics |
| Meditation | mana regeneration; blocked by heavy armour |
| Resisting Spells | reduces incoming magic damage and effect duration |
| Necromancy | raising, summoning, draining, fear |
| Spirit Speak | strengthens necromancy, lets you hear the dead |
| Chivalry | the paladin's small holy magic, works in plate |
| Mysticism | wards, curses, the odd and the elemental |
| Inscription | writes scrolls, raises spell damage a little |

**Healing and support**
| skill | what it does |
| --- | --- |
| Healing | bandages, cures, resurrection at high skill |
| Veterinary | the same, for animals and summons |
| Poisoning | applies poison to blades and food |
| Musicianship | the gate to the bard skills below |
| Provocation | sets two monsters on each other |
| Peacemaking | calms a fight, drops aggro |
| Discordance | weakens a monster's stats while it hears you |

**Gathering**
| skill | what it does |
| --- | --- |
| Mining | which ore you can extract, yield, and the chance of a rare vein |
| Lumberjacking | which wood you can fell, yield, damage bonus with axes |
| Foraging | herbs, mushrooms, berries, reagents |
| Fishing | fish, and what comes up with them |
| Skinning | hides and scales from what you kill |

**Crafting**
| skill | what it does |
| --- | --- |
| Blacksmithing | weapons and metal armour; quality and rarity chance |
| Tailoring | cloth and leather armour, bags |
| Carpentry | bows, staves, furniture, house parts |
| Tinkering | tools, traps, keys, clockwork |
| Alchemy | potions from what Foraging brings |
| Cooking | food that buffs; the cheapest useful skill |
| Fletching | arrows and bolts |
| Masonry | stone, and the good foundations |

**Roguery**
| skill | what it does |
| --- | --- |
| Stealth | moving unseen |
| Hiding | becoming unseen while still |
| Lockpicking | chests and doors |
| Detect Hidden | seeing what hides, including traps |
| Stealing | from monsters and, later, players |
| Remove Trap | chests that would otherwise take a hand off |

**Beasts**
| skill | what it does |
| --- | --- |
| Animal Taming | wins you a pet; difficulty scales hard with the beast |
| Animal Lore | how good the pet gets and what it can learn |
| Herding | moves animals without fighting them |

**Body**
| skill | what it does |
| --- | --- |
| Camping | logging out safely, resting bonus, campfires |
| Swimming | speed and stamina in water |
| Focus | stamina regeneration and resistance to interruption |

### Skill locks

Each skill is **up**, **locked**, or **down**. At the 700 cap, a gain in an
"up" skill takes 0.1 from the highest "down" skill. If nothing is marked down,
the gain is refused and says so. This is the whole of the UO respec system and
it needs no other machinery.

## What the player sees

Every gain is a floating line above the character in the WoW manner: bright
green, large, rising and fading over 1.4 s.

```
+0.3  Mining
+1    STR
```

A skill reaching a round ten, and any skill reaching 100.0, gets a bigger
centre-screen line and a sound. Reaching 100.0 says **Grandmaster Mining**.
