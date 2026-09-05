# Abilities and spells

Every ability in the game, from `src/mmo/abilities.js`. Cost, cooldown, cast time, whether it can be used on the move, what has to be in your hands, what unlocks it, and what it does.

The **In hand** column is `weaponCheck` in words, and it is not decoration: an ability whose row is not satisfied is greyed on the bar and refuses with a sentence naming what you are holding instead. Every spell reads **wand or staff**, because a spell goes through a focus or it does not go. Consecrate Weapon is the one row in the four casting groups that does not, since what it enchants is the blade already in your hand.

**And what you are wearing counts too.** Every spell but the nine Chivalry rows pays the worn armour's cast burden: the cast takes `1 + burden` times as long and has a `burden * 0.6` chance to fizzle outright, which is nothing in cloth, about one cast in seventeen in leather, and three in five in full plate. The Healer's Heal, Cleanse, Greater Heal, Bless, Sanctuary, Consecrate Weapon, Smite, Resurrect and Lay on Hands are exempt, because holy magic works in plate; that is what a paladin is. The table of burdens is in `docs/mmo/02-COMBAT.md`.

## Warrior (12)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Power Strike | 15 stam | 6 s | 0 s | yes | any weapon you swing | Swordsmanship 30 | The next swing lands with your shoulder behind it, for sixty percent more. |
| Whirlwind | 30 stam | 12 s | 0.4 s | no | any weapon you swing | Swordsmanship 50, tactics 40 | A turn on the spot that opens everything standing within three metres. |
| Leap Slam | 25 stam | 10 s | 0 s | yes | any weapon you swing | Swordsmanship 60, str 50 | Eight metres of air and then the ground, and whatever was standing on it. |
| Shield Bash | 20 stam | 9 s | 0 s | yes | a shield | Parrying 40 | The shield is a weapon too. Half the damage and two seconds of nothing. |
| Rend | 20 stam | 8 s | 0 s | yes | a sword or an axe | Swordsmanship 45 | A cut that keeps opening. Three a second for eight seconds after. |
| Crushing Blow | 20 stam | 8 s | 0 s | yes | a mace, hammer, maul or quarterstaff | Macefighting 45 | Armour dents. Ten points of it, for ten seconds, and the wearer sits down. |
| Lunge | 15 stam | 7 s | 0 s | yes | a dagger, rapier or spear | Fencing 45 | Five metres closed in one step, with the point arriving first. |
| Sweep | 25 stam | 9 s | 0 s | yes | a halberd or a glaive | Polearms 45 | The haft comes round in a wide arc and puts the front rank on its back. |
| Battle Cry | 30 stam | 30 s | 0 s | yes | nothing | Tactics 60 | Everyone within ten metres hits a fifth harder for twelve seconds. |
| Berserk | 40 stam | 60 s | 0 s | yes | nothing | Tactics 80, con 60 | Fifteen seconds of forty percent more, and a third of your armour forgotten. |
| Disarm | 20 stam | 15 s | 0 s | yes | empty hands | Wrestling 50 | A twist of the wrist. It fights you barehanded for six seconds. |
| Riposte | 0 stam | 0 s | 0 s | yes | a shield | Parrying 70 | Every parry answers back for half a swing. Always on. |

## Ranger (10)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aimed Shot | 15 stam | 6 s | 1.2 s | no | a bow and arrows | Archery 30 | Stand still, breathe out, and put it where you meant to. |
| Double Shot | 20 stam | 8 s | 0 s | yes | a bow and arrows | Archery 45 | Two arrows off the string before the first one lands. |
| Volley | 35 stam | 15 s | 1.5 s | no | a bow and arrows | Archery 60 | Arrows come down on a five metre circle rather than at anything in it. |
| Piercing Arrow | 20 stam | 10 s | 0 s | yes | a bow and arrows | Archery 55 | Half the armour counts, and the shaft carries on into whatever is behind. |
| Crippling Shot | 15 stam | 10 s | 0 s | yes | a crossbow, and bolts | Marksmanship 40 | A bolt through the leg. It comes on at half speed for six seconds. |
| Disengage | 15 stam | 12 s | 0 s | yes | nothing | Archery 40, dex 55 | Six metres of backwards, and three seconds of running to make them count. |
| Fleet Foot | 0 stam | 0 s | 0 s | yes | nothing | Tracking 50 | A tenth quicker on your feet, and a fifth once Tracking reaches ninety. |
| Hunter's Mark | 10 stam | 20 s | 0 s | yes | nothing | Tracking 40 | You have its scent. Fifteen percent more from you, and nowhere to hide. |
| Snare | 10 stam | 20 s | 0.8 s | no | nothing | Tinkering 30 | A loop of wire in the grass. The first thing through it stops for four seconds. |
| Beast Call | 30 stam | 90 s | 2 s | no | nothing | Animal Lore 50 | Whatever is closest and wild takes your side for half a minute. |

## Mage (10)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Magic Arrow | 4 mana | 0 s | 0 s | yes | wand or staff | Magery 0 | The spell you learn on, and the one you never quite stop using. |
| Fireball | 9 mana | 3 s | 0.6 s | yes | wand or staff | Magery 25 | It lands hot and keeps burning for four seconds after. |
| Ice Shard | 9 mana | 3 s | 0.6 s | yes | wand or staff | Magery 30 | Less than a fireball and it takes something off their speed instead. |
| Lightning | 14 mana | 5 s | 0 s | yes | wand or staff | Magery 45 | No wind up at all. It is simply there, and then it is over. |
| Blink | 12 mana | 10 s | 0 s | yes | wand or staff | Magery 40 | Twelve metres the way you are looking, through whatever was between. |
| Mana Shield | 20 mana | 30 s | 0 s | yes | wand or staff | Magery 50 | For fifteen seconds every wound costs mana at two for one instead of blood. |
| Frost Nova | 25 mana | 14 s | 0.8 s | no | wand or staff | Magery 60 | The floor goes white for five metres and nothing on it moves for three seconds. |
| Chain Lightning | 28 mana | 10 s | 1.2 s | no | wand or staff | Magery 70 | It jumps to three more, weaker each time, and finds them all itself. |
| Meteor | 45 mana | 25 s | 2.5 s | no | wand or staff | Magery 85 | A second and a half of shadow on the ground before anything happens. |
| Arcane Mastery | 0 mana | 0 s | 0 s | yes | nothing | Evaluating Intelligence 80 | You have read enough to know where the seams are. Ten percent more crits. |

## Sorcerer (8)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hex | 8 mana | 6 s | 0 s | yes | wand or staff | Mysticism 20 | It misses more and blocks less for twelve seconds, and does not know why. |
| Stone Skin | 15 mana | 20 s | 0.5 s | yes | wand or staff | Mysticism 35 | Thirty armour for twelve seconds, and you walk like the stone you are wearing. |
| Eldritch Bolt | 10 mana | 2 s | 0 s | yes | wand or staff | Mysticism 30 | Cheap, quick, and one time in five it stops them casting for two seconds. |
| Ward | 25 mana | 30 s | 1.5 s | no | wand or staff | Mysticism 50 | Four metres of floor where everything hurts a third less, for ten seconds. |
| Transmute | 20 mana | 20 s | 1 s | no | wand or staff | Mysticism 55, alchemy 40 | One stack of ore becomes the tier above it, and you lose three tenths in the change. |
| Spell Plague | 30 mana | 18 s | 1.2 s | no | wand or staff | Mysticism 65 | Twenty five poison, and after it every spell you land there bursts on its neighbours. |
| Rift | 40 mana | 40 s | 2 s | no | wand or staff | Mysticism 80 | A three metre tear that drags monsters in and holds them there for four seconds. |
| Elemental Kin | 0 mana | 0 s | 0 s | yes | nothing | Mysticism 90 | The elements stopped arguing with you. Fifteen percent off each of them. |

## Necromancer (10)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Life Drain | 8 mana | 4 s | 0 s | yes | wand or staff | Necromancy 20 | Half of what it loses arrives in you. The necromancer never needs a bandage. |
| Raise Skeleton | 20 mana | 20 s | 1.5 s | no | wand or staff | Necromancy 30 | Any corpse within six metres gets up and takes your side. |
| Summon Imp | 18 mana | 25 s | 1.2 s | no | wand or staff | Necromancy 40 | Small, quick, and it throws fire from further back than you would. |
| Bone Spear | 14 mana | 5 s | 0.5 s | yes | wand or staff | Necromancy 45 | It goes through the first one and keeps going down the line. |
| Fear | 15 mana | 15 s | 0 s | yes | wand or staff | Necromancy 50 | Beasts and men within six metres run. Undead and constructs do not. |
| Corpse Explosion | 20 mana | 8 s | 0 s | yes | wand or staff | Necromancy 60 | What you killed is still useful. It goes off for four metres around itself. |
| Summon Hound | 28 mana | 30 s | 1.5 s | no | wand or staff | Necromancy 65 | A shadow hound. Fast, and what it bites keeps bleeding. |
| Curse of Weakness | 15 mana | 20 s | 0 s | yes | wand or staff | Spirit Speak 50 | Fifteen seconds of hitting a fifth softer and wearing a fifth less armour. |
| Lich Form | 50 mana | 120 s | 3 s | no | wand or staff | Necromancy 85, spiritSpeak 70 | Thirty seconds where spells are paid for in blood and nobody can help you. |
| Raise Champion | 60 mana | 180 s | 3 s | no | wand or staff | Necromancy 95 | One bone knight, as strong as you are, for two minutes. |

## Healer (9)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Heal | 10 mana | 3 s | 0.8 s | yes | wand or staff | Chivalry 20 | Twenty and a share of your Chivalry, on anyone you can see. |
| Cleanse | 12 mana | 8 s | 0 s | yes | wand or staff | Chivalry 35 | Poison, bleed and one curse, gone, with no wind up at all. |
| Greater Heal | 22 mana | 6 s | 1.5 s | no | wand or staff | Chivalry 50 | A second and a half of standing still buys fifty and more. |
| Bless | 15 mana | 20 s | 0.5 s | yes | wand or staff | Chivalry 40 | Five to everything for thirty seconds. Cheap, and it adds up in a party. |
| Sanctuary | 30 mana | 45 s | 1.5 s | no | wand or staff | Chivalry 65 | Five metres where nothing can be attacked, for six seconds. Long enough. |
| Consecrate Weapon | 12 mana | 15 s | 0 s | yes | any weapon you swing | Chivalry 45 | Twenty seconds where your blade means half again to anything already dead. |
| Smite | 18 mana | 10 s | 0 s | yes | wand or staff | Chivalry 60 | Thirty to forty five, and twice that on the undead. |
| Resurrect | 40 mana | 60 s | 5 s | no | wand or staff | Healing 80 | Five seconds of standing over them, and they get up where they fell. |
| Lay on Hands | 50 mana | 90 s | 0 s | yes | wand or staff | Chivalry 90 | All of it, at once, and then a minute and a half of not being able to. |

## Rogue (8)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hide | 10 stam | 8 s | 1 s | no | nothing | Hiding 0 | Stand still for a second and you are not there. Stealth is what lets you walk. |
| Backstab | 20 stam | 10 s | 0 s | yes | a dagger, rapier or spear | Fencing 40, hiding 30 | From behind, or out of hiding, three times the damage. From the front, nothing. |
| Poison Blade | 1 poisonVial | 0 s | 0 s | yes | any weapon you swing | Poisoning 30 | Five hits carry poison at your Poisoning divided by twenty. |
| Shadowstep | 20 stam | 15 s | 0 s | yes | nothing | Stealth 60 | Ten metres and you are behind it, which is where Backstab wants you. |
| Vanish | 30 stam | 60 s | 0 s | yes | nothing | Hiding 70 | Out of a fight, instantly, with everything forgetting it was chasing you. |
| Pick Pocket | 10 stam | 30 s | 1 s | no | nothing | Stealing 30 | Gold, or something common, off a humanoid that has not noticed you yet. |
| Evasion | 25 stam | 45 s | 0 s | yes | nothing | Fencing 60, dex 70 | Four seconds where nothing lands. Pick them carefully. |
| Expose Weakness | 15 stam | 20 s | 0 s | yes | nothing | Anatomy 60 | You point at the gap and everyone else gets a quarter more for ten seconds. |

## Bard (6)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Provoke | 15 stam | 12 s | 1 s | no | a lute | Provocation 20 | Two monsters decide the other one started it, and settle it for twenty seconds. |
| Peace | 15 stam | 15 s | 1 s | no | a lute | Peacemaking 20 | Everything within eight metres stands down for eight seconds and forgets you. |
| Discord | 15 stam | 15 s | 1 s | no | a lute | Discordance 20 | A fifth off everything it has, for twenty seconds, while it can hear you. |
| Marching Song | 10 stam | 30 s | 0 s | yes | a lute | Musicianship 40 | Half a minute of everyone within twelve metres moving fifteen percent quicker. |
| War Drum | 20 stam | 30 s | 0 s | yes | a lute | Musicianship 60 | Ten percent more damage and ten percent faster swings for twenty seconds. |
| Lullaby | 30 stam | 60 s | 2 s | no | a lute | Peacemaking 70 | Ten metres of sleeping, six seconds, or until somebody hits one of them. |

## Everyone (5)

| Ability | Cost | Cooldown | Cast | Moving | In hand | Unlocks at | What it does |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jump | 5 stam | 0 s | 0 s | yes | nothing | none | One metre twenty. A swing taken in the air is a jump attack. |
| Sprint | 3 stam | 0 s | 0 s | yes | nothing | none | Hold shift. Three stamina a second for as long as you can pay it. |
| Bandage | 1 bandage | 0 s | 4 s | no | nothing | Healing 0 | Four seconds of binding. Anyone can do it; Anatomy decides how well. |
| Meditate | 0 stam | 0 s | 0 s | no | nothing | Meditation 0 | Sit still and mana comes back three times as fast, until anything at all happens. |
| Camp | 1 wood | 0 s | 0 s | no | nothing | Camping 20 | A fire, a rested bonus, and the only place it is safe to log out. |

