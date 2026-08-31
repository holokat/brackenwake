# If we built it right

## The one sentence

**You are turning a piece of wild valley into a place that does not need
anybody, and then deciding what to do with that.**

The homestead is the point. Seasons are the pressure that makes building it a
decision rather than decorating. The land you settle is the constraint that
makes your homestead different from someone else's.

Those three things in that order. We currently have the third as a skin, the
second as a tint, and the first as a shop.

---

## The finding that hurts

The very first question the game asks is *where will you settle?* Five biomes,
a real choice screen, nice art.

It changes **nothing**. Not one yield, price, growth rate or availability.
`game.biome` is read in three places: to show the picker, to hide the picker,
and to save the string. It is a wallpaper selector wearing the costume of the
most important decision in the game.

Fixing that one thing gives us the strongest opening decision a homestead game
can have, and we already built the art for it.

---

# The shape of the game

## Act 1: Shelter

You arrive on land nobody has worked. You cannot make anything yourself, so you
buy: feed, timber, seed, stone. The market is your lifeline and the neighbours
are ahead of you.

The measure of Act 1 is **you get through your first winter**, badly, and
understand exactly why.

## Act 2: Self-sufficiency

The middle game, and the real one. You stop buying things one loop at a time.

This is the actual verb of a homestead game, and we have never named it. Every
purchase you make is a loop you have not closed yet:

```
you buy feed         ->  until you grow fodder and keep a hayloft
you buy timber       ->  until you plant a woodlot and wait for it
you buy preserves    ->  until you have jars, a kitchen and a cool room
you buy stone        ->  until you work a quarry
you rely on weather  ->  until you have irrigation and a windbreak
you rely on daylight ->  until you have power that does not care
```

Every one of those is already in the game as a *building you can buy*. None of
them is framed as **closing a loop**, which is the difference between a shop and
a homestead.

The measure of Act 2 is a winter you barely notice.

## Act 3: The valley

You have surplus. Nobody makes you do anything with it.

This is the endgame, and it is not a score. Other farms are real people on the
same clock, and every winter somebody is short. The Ridge Farm card we already
wrote is the whole thesis in miniature: no smoke for two days, and helping costs
you and pays nothing.

**The endgame is becoming the farm that carries other farms.** You started as
the one who needed the valley. You finish as the one the valley needs.

That is an ending with a shape, it needs no boss and no score, and it uses the
one thing we have that nobody else does.

---

# The four decisions that matter

Everything else is texture. If a system does not feed one of these, it is decor,
which is fine, but it should know that it is.

## 1. Where you settle. Once, permanently.

Give each biome a real hand, strong in one direction and genuinely short in
another. Not a difficulty slider: a **different homestead**.

```
                 strong                    short                    so you
Meadow           balanced, forgiving       nothing exceptional      learn here
Oceanside        fish, long mild autumn    poor soil, no timber     trade or starve
Boreal           timber, stone, furs       short season, hard winter build early
Desert           stone, high crop prices   water, wood, brutal heat  irrigate or fail
Sakura           fertile, fast growth      no stone, wet, pests      grow, do not build
```

Now the opening question is the best decision in the game, and it produces the
strongest thing Sid names: you finish a run in the boreal forest and think *next
time I want to see what the sea is like*. That is path B, and it is free,
because the art already exists.

It also makes the neighbours real. A boreal farm has timber a sakura farm cannot
get. Trading stops being flavour.

## 2. What you commit the land to, each season

You have 12 plots at the start and 30 at the top, and **a plot committed for a
season is refused to everything else**. That single rule turns planting from a
receipt into a trade-off.

Then make crops genuinely different rather than a price ladder:

```
                 seasons  yield   keeps?   the bet
carrots, wheat      1      low     no      safe, feeds you, boring
squash, roots       1      mid     YES     the unglamorous winter answer
strawberries        1      high    no      worthless in February unless you preserve it
grapes, fruit       2      huge    yes     you find out next year
```

A two-season crop is the strongest item on that list. Six real days of a plot,
committed against a winter you cannot see yet.

## 3. Which loop you close next

The spine of Act 2, and the decision the player will actually spend their time
on. Every loop costs land, coin and attention, and you cannot close them all at
once.

Do you plant a woodlot now and wait two seasons for timber, or keep buying from
Sedge and put the land into something that pays this year? Do you grow fodder,
or buy feed and use the ground for a crop?

This is where the 52 buildings finally mean something, because each one is the
end of a loop rather than a tier of a ladder.

## 4. What you do with surplus

Act 3, and the only decision in the game with no correct answer.

Sell it. Hoard it against a worse year. Or carry the farm up the ridge that has
no smoke, for nothing.

---

# Seasons: the pressure, not the point

Three numbers we already have:

```
season length        3 real days, a year is 12
winter growth        x0.12       crops effectively stop
preserved in winter  x1.5        the only thing worth having
```

That is already the right pressure and we do nothing with it. Winter is
currently a *tax* you wait out with a coin pile. It should be the *deadline*
that makes every building decision urgent.

Two mechanisms, both small:

**The Commit.** A season opens on a planning view: plots, stores, animals,
promises. You spend the season's decisions at once, then close it and the three
days play out. This is the fix for the observer problem: a timer you are waiting
on is dead time, a timer settling a bet you placed is suspense.

**The Ledger.** The season ends on a page. What went in, what came out, what it
cost, what you promised and whether you kept it, who thinks what of you, and one
line on what went wrong. Then the next Commit is right there, which is where
"one more turn" lives.

**And the rule that keeps it cosy:** you never lose the farm. Winter can cost
you a herd, a reputation and a year. It can never cost you the save.

---

# The thing only we can do

Seasons run on wall-clock time, so **every player in the world hits winter in
the same hour**. That is a property we already have and have never used.

It means winter is an *event*, not a state. The whole valley is short at once,
which is exactly when goods are worth most and generosity costs most. And it
means Act 3 has real people in it: someone you actually follow is having a worse
winter than you, you can see it on their farm, and helping is a real cost.

No other farming game can do this, because they all run private clocks.

---

# The first fifteen minutes

Currently: 120 coins, a carrot worth nine, a ninety second wait, no calendar and
no stakes.

Instead, **you arrive in late autumn and winter is two days out.**

- you pick your land, and the pick visibly matters: the boreal plot shows a wall
  of timber and frost on the ground, the oceanside plot shows fish and thin soil
- a barn with not quite enough in it, and a number that says so
- one Commit to make, with fewer plots than you want
- Bram at the fence with one flat sentence about the frost
- the whole valley visible, including everything you cannot reach yet

The tutorial is your first winter. You scrape through it badly, lose something,
and understand precisely why. Then spring arrives and it feels earned, because
it is.

---

# What changes

Almost nothing is thrown away.

**Keep:** the valley and all five biomes, weather, day and night, all 61 story
cards and the engine, the 52 buildings, the audio, the animals, the art
pipeline, the collection book.

**Re-point rather than rebuild:**

| system | today | becomes |
| --- | --- | --- |
| Biome | a skin | the opening decision, and your constraints |
| Seasons | a tint and a multiplier | the turn, and the deadline |
| Buildings | a shop of tiers | the loops you close |
| Crafting | a value ladder | preservation, which is how food survives winter |
| Fishing, hunting | minigames beside the game | what you do when nothing grows |
| Energy | dims the lamps | keeps animals alive in January |
| Story cards | ambient flavour | the events of the season |
| Nostr | visiting farms | a valley on one clock, and Act 3 |

**Genuinely new, and it is six things:**

1. Biome modifiers, so where you settle matters.
2. The **Commit** screen.
3. The **Ledger**.
4. **Spoilage**, so fresh and preserved are different things. Half built.
5. **Animal upkeep** in winter, so livestock is a bet and not a bank.
6. **Multi-season crops**, a field on a crop and a check on harvest.

---

# If I could only do three

1. **Make the biome matter.** Cheapest by far, it is a modifier table. It
   converts the game's existing opening screen from a lie into the best decision
   we have, and it makes replaying the game a different game.
2. **Spoilage and preservation.** One rule. It gives winter teeth and makes the
   entire crafting chain mean something instead of being a value ladder.
3. **The Ledger.** It makes seasons feel like units before anything else
   changes, and it delivers "reflect progress constantly" on its own.

The Commit screen is the biggest and the one that truly converts watching into
deciding, but the three above are worth shipping even if it never arrives.

---

# The question I would want answered first

Is the fantasy **"I built this"** or **"I made it through"**?

Everything above assumes the first, with the second as pressure. If it is
actually the second, the game is a survival game with a farm in it, and Act 2
should be much longer and much harder.

I think it is the first, because the thing players will screenshot is their
farm, not their barn inventory. But it is your call and it changes the tuning of
everything.
