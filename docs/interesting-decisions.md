# Where we fail Sid Meier's test

Measured against the GDC 2010 talk, working from the transcript. Timestamps are
his; the evidence is ours.

The uncomfortable finding first: **we have independently rebuilt three of the
mistakes he stands on stage and confesses to.** Not similar mistakes. The same
ones.

---

# The three we already made

## 1. We made his exact "my bad": the player is an observer

> "The original prototype of civilization was real time... what we found was
> that the player really became an observer, was watching what's going on...
> and we found that when we made it a turn-based game, all of a sudden the
> player was no longer an observer, they were the star of the game."
> [26:15]

This is the most serious thing in this document.

Our loop is: act, then watch. Plant, and watch it grow. Start a recipe, and
watch a bar. Chop a tree, and watch it regrow. The numbers:

```
craft a recipe        45 to 300 seconds, 96 average
tree regrows          4 to 9 minutes
watering cooldown     90 seconds
```

During every one of those windows there is nothing to decide. The player is
doing what Sid's real-time Civ players did: watching something happen. The pull
is a countdown, not anticipation.

**What fixes it is not shorter timers.** It is giving the player something to
decide while the timer runs. We have exactly one system that does this already,
and it is the story cards. A card that arrives mid-wait converts dead time into
a decision, which is the loop he is describing. Right now they fire at most once
every eight minutes. That is a decision every eight minutes.

The other half is that a player should always have something they can *do*
without waiting for permission. Fishing is the best candidate we already own,
and it is behind a dock most players never visit.

## 2. Punishment with no explanation and no prevention

> "If something bad happens to the player, your game is broken, there's
> something horribly wrong, the game is cheating. It's really important that the
> player understand why those things happened and especially how to prevent that
> from happening the next time."
> [06:50]

A wolf takes a cow you paid 100 coins for. The game offers:

- no warning that this specific animal was being stalked
- no visible probability, anywhere, ever
- no action available in the moment
- no explanation afterwards of what would have prevented it

Every clause of his warning, failed. The player will not conclude "I should have
closed that gate." They will conclude the game reached in and took something,
and they will be right, because from their side that is exactly what happened.

**Fix, in order of value:**

1. **Telegraph the stalk.** A marker on the targeted animal and a few seconds of
   warning. Click the animal to spook it, or the dog to intercept. The loss
   becomes the player's miss, which he says they forgive instantly.
2. **Say what would have worked.** One line, after the fact: "a closed gate
   would have stopped that." That is the "next time" seed he calls the route to
   replayability.
3. **Never take the last one.** Losing one of six cows is a setback. Losing your
   only cow is a story about a broken game.

The same applies to building wear, path wear and storage overflow. Each removes
value on a timer with no decision attached to it.

## 3. Significant randomness, which he says produces paranoia

> "Whenever anything random happens to the player, paranoia strikes in... the
> player feels that the computer did that, rolled that random number just to
> make their life more difficult, or they were just about to win... random
> events have to be treated very very carefully because if they're significant,
> the player will find the worst and most paranoid explanation."
> [29:45]

Our fox and wolf raids are random, unannounced, and cost real money. Our weather
is random and silently multiplies growth. Our crop harvest has a hidden 10% "×2
bumper" and 1% "×5 golden" roll.

The bumper roll is fine: he says low-level randomness helps variety. The
predators are not, because they are significant.

Worth noting he goes further than most designers would dare, and it is the part
people forget:

> "We actually take into account the results of previous battles now when we do
> our combat calculations."
> [24:32]

He tracks your recent losses and quietly tilts the next roll. If two animals are
taken in quick succession, our game should make the third raid fail. Not because
it is honest, but because two in a row reads as the game having it in for you.

---

# The ones we have not made yet, but are about to

## 4. Style consistency, and the blood

> "If you have a lighthearted music, atmosphere, cartoony graphics, and all of a
> sudden people's heads start exploding, then you haven't lived up to the
> alliance... that's when the player loses their suspension of disbelief and
> turns off your game."
> [18:01]

We are a warm, cosy, low-poly farm with wind chimes and a child's crayon
drawing on the wall.

`farm.js` calls `_spawnBlood()` in three places: when a predator kills your
animal, when you shoot a predator, and when you shoot a deer.

That is his example almost exactly. It is a small change to make the same events
read in our register: a burst of feathers, a scatter of wool, a puff of dust.
The event stays. The blood does not belong in this game.

## 5. The covert action rule: our centre of gravity is missing

> "There were really two games fighting very hard against each other... you'd
> pop out of the building at the end, and I was like, what was I doing, why did
> I go into that building... the centre of gravity of your game has to be in one
> place. Everything else supports that."
> [73:00]

Count what we are asking a player to hold at once: crops, animals, fishing,
hunting, crafting across eight processors and 46 recipes, construction across 52
buildings, decorating, paths, energy, storage logistics, story cards, and
visiting other people's farms.

Ask his question of our game: what is the centre of gravity? I cannot answer it,
and that is the problem. Fishing and hunting in particular are separate small
games you drop into and come back out of, which is his precise failure case.

This does not mean cutting them. It means deciding what the game is *about* and
making everything else visibly feed it. If the answer is "grow things and turn
them into more valuable things," then hunting and fishing need to feed the
crafting chain rather than sit beside it as parallel income.

## 6. The first fifteen minutes

> "The first 15 minutes have to be really compelling, really fun, kind of almost
> a foreshadowing of all the cool stuff that's going to happen later... you can
> almost not reward the player enough in the very early stages."
> [07:48]

Ours, measured:

```
starting coins        120
first crop            Carrots, 3 units at 3 coins = 9 coins a harvest
watering cooldown     90 seconds
first mission reward  15 coins
```

Nine coins. Then ninety seconds of nothing. The cheapest thing worth buying is a
20 coin crop upgrade.

There is no foreshadowing at all. A new player cannot see the wolves, the
festival, the workshops, Mira, or the fact that a strawberry becomes jam becomes
a jam sandwich worth 80. They see a carrot.

**Fix:** front-load hard. Give the opening fifteen minutes a visible glimpse of
each of the game's later pillars: a story card in the first two minutes, a
processor that can be afforded almost immediately, and something on the horizon
the player can *see* and cannot yet reach. He is explicit that over-rewarding
early is nearly impossible.

## 7. We put the cheat on the main menu

> "There on the main menu was cheat... Brian, can't we just bury it one or two
> levels deeper, because I want the players to play the real game first."
> [45:29]

`index.html` line 17: a test mode button, in the top toolbar, permanently
visible, that unlocks everything and grants unlimited gold.

It has been extremely useful to us. It should not ship where it currently sits.

---

# Two things we are already doing right

Worth naming, because they came from the same instinct he is describing.

**The AI comments on what you are doing.** He says single-player validation
matters enormously:

> "Having them acknowledge what you're doing, be aware of it, is really
> validating for the player... the more that the other leaders reflected on what
> you were doing and reacted, the more the player felt that somebody understood
> them, they weren't just playing in a vacuum."
> [41:25]

Bram counting the nine trips you made to the water butt is exactly this. The
story system is the strongest thing in the game by his measure, which is an
argument for more of it rather than more content elsewhere.

**Going with the flow.** He describes saving millions by letting a text box do
what a model would have done, because the player is already inclined to believe
it [34:15]. Mira's crate at your gate is never rendered. The Ridge Farm is never
seen. That was the right instinct, and it should be the default whenever we are
tempted to build an asset.

---

# What almost nothing we ask is a decision

Separate from his list, but it is the thing underneath several of them. He
defines the coolest decisions as:

> "The ones where the player chooses path A but they're saying, well next time,
> that path B looks kind of interesting too."
> [52:12]

We have no path B. Nothing is exclusive. Given enough time you buy everything,
so no choice forecloses another. I checked all ten infrastructure categories:

```
storage      has a trade-off
workshops    has a trade-off
commerce     has a trade-off
livestock    STRICT LADDER
fields       STRICT LADDER
soil         STRICT LADDER
water        STRICT LADDER
machines     STRICT LADDER
energy       STRICT LADDER
landmarks    STRICT LADDER
```

Seven of ten are pure ladders: more money buys a strictly better thing. Crops
are the same, and worse, because every crop grows in an identical 10 or 16
points, so price is the only variable:

```
crop            price   value per harvest
Carrots             0          9
Tomatoes           40         15
Strawberries      200         30
Grape Trellis     280         39
```

Choosing a crop is not a decision. It is a receipt for how much money you have.

The three categories that are interesting are the three where I happened to
build a difference of *scope* rather than *size*. A Millstone and a Bakery
Workshop are not comparable, so you have to think. A Water Tower is a Sprinkler
with a bigger number, so you do not.

**The test for any new item:** can I describe a situation where the cheaper one
is the right buy? If not, it is not a rung. It is a wall.

---

# What I would do, in order

1. **Telegraph the predator stalk, explain the loss afterwards, and never take
   the last animal.** Directly implements [06:50]. Removes the single most
   trust-destroying event we have.
2. **Raise story card frequency hard, and bias them toward idle moments.** This
   is the answer to [26:15], and the machinery already exists. It converts
   waiting into deciding, which is the whole loop.
3. **Replace the blood with feathers, wool and dust.** One afternoon. Fixes
   [18:01].
4. **Rebuild the first fifteen minutes as a trailer for the rest of the game.**
   [07:48]
5. **Split the crop curve** so cheap is fast and expensive is slow. One data
   change that turns ten receipts into ten decisions.
6. **Decide the centre of gravity and make fishing and hunting feed it.**
   [73:00]. The largest and least urgent of these, but the one that decides
   whether the game is *about* anything.
7. **Bury the test button.**

The catalog, the art pipeline, the audio and the story system are in good shape.
What is missing is that the player is watching rather than deciding, and that
when the game takes something from them it does not explain itself.
