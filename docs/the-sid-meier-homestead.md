# The homesteading game Sid Meier would have made

Designed from his principles rather than checked against them. Blank slate.

---

# Part one: the two problems that fight the genre

Everything else in this document falls out of solving these.

## "Real time made the player an observer" [26:15]

> "The original prototype of civilization was real time... what we found was
> that the player really became an observer... and when we made it a turn-based
> game, all of a sudden the player was no longer an observer, they were the star
> of the game."

**Every homesteading game ever made is real time.** If he is right, every one of
them has this bug, and the reason they feel like chores at hour twenty is that
the player has become a maintenance worker for a simulation that is running
whether they are there or not.

So the game is turn-based. The question is what a turn is.

**A turn is a week, and the currency of a turn is daylight.**

You have a number of workable hours in a week, and they change with the season
because that is simply true and every player already knows it [36:50]:

```
midsummer week      14 hours of usable light
spring, autumn      10
deep winter          6
```

You spend those hours on the week's work. Clear a field. Split rails. Plant.
Preserve. Ride to town. Sit with a neighbour. Then you commit the week, it plays
out in about twenty seconds of montage, and something happens.

This solves more than the observer problem:

- **It makes the season structural rather than decorative.** Winter is not a
  tint and a growth penalty. Winter is *fewer turns' worth of action*, which is
  the actual experience of winter on a farm.
- **It creates exclusivity for free.** Hours spent on the roof are hours not
  spent on the field. Every week is a real trade-off with no money involved.
- **A week is thirty seconds, a year is twenty minutes, a life is a long
  evening.** That is "one more turn" [53:24] at exactly the right grain.

## "We look for topics that are epic and larger than life" [57:39]

A homestead is small, domestic and quiet. Civ says *build a civilization to
stand the test of time* and the player thinks *yeah, I can do that*. What is the
equivalent sentence for a farm?

It is not "run a farm." It is this:

> **Build a home that outlasts you.**

The epic in homesteading is not scale, it is **permanence**. You are not
managing a farm, you are founding a place. The stone wall you build in year four
is still there in year forty when your daughter is running it, and it is still
there when her son is. That is Sid's Walter Mitty fantasy in domestic clothes,
and it is genuinely the fantasy people have about homesteading: not wealth,
*rootedness*.

**So the game spans generations.** You play a lifetime, roughly thirty in-game
years, and then you hand it on and keep playing as the next one. Everything
physical you built persists. So does your standing in the valley. So does one
inherited trait, earned by how you actually played.

That gives us [54:00] directly:

> "The player comes to the end of that journey and suddenly realises that this
> is only one segment of this epic journey."

---

# Part two: the game

## The pitch

You arrive in a valley in autumn with a wagon, a winter's food and no house.
Fifty years later somebody is born in a room you built.

## The centre of gravity [73:00]

One question, asked every week, and every system answers it:

> **Can this place feed itself yet, and who else can it feed?**

Nothing exists that does not point at that. If a feature cannot be described as
an answer to it, it is decoration, and decoration is allowed as long as it knows
what it is.

## What a week looks like

```
   WEEK 34 · LATE SUMMER                          hours: 12

   The forecast says fair, but the swallows are low.

   THE LAND                        YOUR PEOPLE
   wheat        ready              you          strong, tired
   turnips      two weeks          Anna         handy with animals
   south field  uncleared          the boy      too young to be useful

   SPEND YOUR HOURS
   [4] bring in the wheat           it will not wait
   [3] split rails for the pen      the fox has been back
   [5] clear the south field        one week of eight
   [2] ride to town                 Sedge has seed
   [3] sit with the Hallorans       they lost a cow
   [1] do nothing                   you are tired
```

You have twelve hours. Those options total eighteen. That is the game.

## The five decisions that carry it

**1. Where you build the house.** Once, in the first ten minutes, permanently.
Near the river is good water and bad flooding. On the rise is a hard walk and a
dry cellar. In the trees is timber and shade and no sun for wheat.

You will look at that decision for fifty years. It is the single most Sid thing
in the design: an early, irreversible, clearly explained choice whose
consequences you feel forever, and which makes you want to play again and choose
differently [50:45].

**2. Where you spend the week.** Above. Constant, small, always short.

**3. Which loop you close next.** The spine of the middle game.

Every purchase is a loop still open. You buy feed until you grow fodder. You buy
timber until you plant a woodlot and wait eight years for it. You buy cloth
until you keep sheep, and a spinning wheel, and someone who can use it.

Closing a loop costs years and land, so you can only close them one at a time,
and the order is the shape of your homestead. A player who closed timber first
has a different farm from one who closed food first, and they will argue about
it.

**4. What you teach the children.** Late game, and it is how the generational
handoff gets teeth. What you spend hours on around them becomes what they are
good at. Raise them in the barn and you inherit an animal handler. Raise them in
the workshop and you inherit a builder who is hopeless with stock.

**5. What you do when a neighbour is short.** The only decision with no correct
answer, and the only moral question in the game. See below.

---

# Part three: every principle, and how it is honoured

## The winner paradox [04:14]

**You never lose the homestead.** Not on any difficulty, not ever. A catastrophic
year costs you a herd, a building, a season of progress and a person's respect.
It never costs the save.

What varies is not *whether* you succeed but *what kind* of place you end up
with, and that is the satisfactory conclusion he describes.

## Reward and punishment [06:00]

> "It's really important that the player understand why those things happened
> and especially how to prevent that from happening the next time."

Every setback ends with an old neighbour telling you plainly what would have
stopped it. Not a tooltip. A person, at your fence, the following week:

> "Roof went because you laid the shingles green. They shrink. Everybody does it
> once."

That single mechanic does three of his principles at the same time: the lesson
[06:50], the "next time" seed for replay [07:20], and NPC validation in single
player [41:25].

And rewards are given freely and early. He is explicit that you almost cannot
over-reward in the first fifteen minutes [07:48].

## The first fifteen minutes [07:48]

You arrive in **autumn**, not spring. Winter is nine weeks out and you have no
house. Within fifteen minutes you will have:

- chosen where the house stands, forever
- put up a shelter that is visibly not good enough
- met three neighbours, each of whom does one thing you cannot
- watched the first frost arrive and been slightly frightened
- been given something for nothing by somebody who had little

You will get through that first winter badly. That is the tutorial, and it is
the best teacher available, because his whole point about setbacks is that they
teach when they are explained.

And you can see everything you cannot yet reach: the good bottom land across the
creek, the stone in the hillside, the big house up the valley.

## Nine difficulty levels [08:47]

Not a slider. **Harder ground.**

```
1  the bottoms      good soil, mild, neighbours close
4  the ridge        thin soil, wind, a long walk to anyone
7  the high valley  four months of snow, stone everywhere, nobody
9  the barrens      you should not be able to do this
```

Difficulty as *place* rather than as multipliers gives the same escalation he
wants and doubles as content and as replayability. It also means the difficulty
is diegetic: the game never tells you it is being harder on you, the land is
just worse, which protects the unholy alliance [10:11].

## The unholy alliance, and the flight simulator [10:11, 11:14]

> "The player went from I'm good, to I'm not good, I'm confused."

The single greatest risk to a homesteading game is realism. Real homesteading is
a spreadsheet of nitrogen, feed conversion and moisture content, and every
simulation that has chased that has produced the flight simulator problem.

**Rule: the game models outcomes, never chemistry.** You never see a soil pH.
You see a neighbour saying the ground looks tired, and you know to rest it. All
depth lives in decisions, none in units.

## Moral clarity [14:02, 61:44]

> "I am not a fan of morally gray games."

There are no villains and no betrayals. Nobody in the valley is secretly bad.
There is no twist where the kindly neighbour turns out to have wronged you.

The antagonist is the **land and the calendar**, which are impartial and
therefore never feel like cheating.

The one moral question is unambiguous in both directions and is the endgame:
when somebody is short, you help or you do not, and both are understandable, and
the game never scores it.

## Value the player's time [15:33]

Nothing in the game destroys work retroactively. A fire takes a building, never
the year. A bad winter costs you animals, never your cleared land. Cleared land
stays cleared. Walls stay up. Everything physical you make is permanent, which
is also the thesis.

## Style consistency [18:01]

Warm, still, quiet, and unbroken. Nothing gory, nothing horrific, no jump. When
an animal dies you see the empty stall in the morning, not the event. The
register never breaks, so the alliance holds.

## Perceived probability [19:26 to 25:12]

> "There's this point around 3:1, 4:1 where people do expect to pretty much win
> every time."

**The game never shows a number.** It shows *readiness*, in the words a person
would use:

```
the roof will hold          you are safe
the roof should hold        you are probably safe
I would not trust that roof you are not safe and you were told
```

Behind it, the tuning is his:

- Anything reading as "should hold" is roughly 90% and not 75%, because 75%
  feels like cheating.
- **Consecutive bad outcomes are suppressed.** Two failures in a row inside a
  season and the third is a success, because two in a row reads as the game
  having it in for you however honest the roll was [24:32].
- The first winter is quietly rigged so you survive it and lose something.

## Randomness and paranoia [28:32, 29:45]

> "Players want to be in control, they really want to know what's going on."

Weather is the only significant randomness, and it is **forecast, imperfectly,
in advance**. You get a week's warning that reads like a warning:

> "Sky's wrong. I would get that hay in."

Which means every weather loss is a decision you got wrong, not a die that was
rolled against you. That is the whole difference between drama and paranoia.

There are no random disasters. Every bad thing is either forecast or caused.

## Use the player's imagination [34:15]

> "There's no dancing bears. There's no Sultan of Zanzibar. There's no caravan."

Enormous parts of this game are text over a still valley, and they will be the
parts people remember. The neighbour's illness, the child's first word, the year
of the flood. None of it is modelled. All of it is remembered.

Spend the art budget on the four things the player looks at constantly: the
land, the light, the buildings they made, and the people at their fence.

## What the player already knows [36:50]

Nothing needs explaining. Everyone knows that hay must be dry, that a fox takes
chickens, that you cannot plough frozen ground, that a roof matters, that
January is hard. The game leans on a lifetime of inherited knowledge and spends
zero tutorial on any of it.

## AI as a metric, not a person [38:08]

The neighbours are not competitors and there is no opposing intelligence, so his
AI trap does not apply directly. What replaces it is **the valley as a
benchmark**. Other homesteads visibly progress at a steady, predictable pace.
You can see how they are doing from your own hill.

They are the yardstick against which you feel yourself improving, which is
exactly the role he assigns AI [41:04], without ever being an opponent.

## NPC validation [41:25]

> "Having them acknowledge what you're doing is really validating for the
> player... they weren't just playing in a vacuum."

The neighbours notice everything and mention it. Not quest text: observation.

> "That's a good wall."
>
> "You have been at that field three weeks."
>
> "Your girl is going to be better at this than you are."

This is the emotional engine of the whole game and it is nearly free to build.

## Protect the player from themselves [42:25]

**No save scumming.** One save, and it is autosaved at the end of each week. The
game commits when you commit, which is also thematically exactly right: a
homesteader does not get to reload the spring.

Built into the fantasy rather than announced as a restriction, which is his
Pirates trick [43:52].

And the settings menu contains no gameplay [44:24]. You cannot turn off the
weather.

## Interesting decisions and path B [50:45]

> "The coolest decisions are the ones where the player chooses path A but is
> saying, well next time, that path B looks kind of interesting."

The house site. The order you close your loops. What you teach the child. Which
land you settle at the start.

Every one of them is exclusive, permanent and visible, and every one of them
produces a specific and articulable "next time I will."

## Reflect progress constantly [52:33]

> "You cannot reward and acknowledge and reflect this progress too much."

**The Almanac.** One page per year, kept forever, written in the game's own
voice:

```
YEAR SEVEN

Cleared the south field, finally. Eight weeks.
Twenty-one bushels, the best yet.
Lost the grey cow in February. Should have brought her in.
Anna is better with the stock than I am now.
The Hallorans came through it because we carried them.
```

Forty of those pages is the game's real trophy, and it is text.

## One more turn [53:24]

A week takes thirty seconds. There is always something ripening, always
something half built, always a neighbour who said they would come by. The
forecast for next week is on this screen.

## Replayability, epic squared [54:00]

Three layers:

1. **Another generation**, which is the same land and a new person.
2. **Another valley**, which is a different difficulty and a genuinely different
   game.
3. **Another life entirely.** The Almanac from your last homestead is still in
   your shelf, and the new one starts a page one.

---

# Part four: the ending

There has to be one, because Sid says the player wants a satisfactory conclusion
[05:53].

You get old. The hours in your week shrink whatever the season. Eventually you
cannot bring the hay in yourself and you watch somebody else do it.

Then one week the option list has one entry:

```
   [12] sit on the porch
```

You take it. The game plays out the rest of the year without you in it: the
fields worked, the stock brought in, the smoke going up from a chimney you
built, and someone who is not you doing it well.

The last page of the Almanac writes itself.

Then you are asked whether you would like to keep going, and you are the child.

---

# Part five: what makes it not a farm game

Five sentences, and if any of them stops being true the design has drifted.

1. **The scarce thing is hours, not money.** Money is a minor convenience.
2. **The turn is a week, and winter is fewer hours.** The calendar is the
   opponent.
3. **Everything you build is permanent, across generations.** That is the point.
4. **The game never shows you a number it would not say out loud.**
5. **You always survive. Only what you built and who you were to your
   neighbours varies.**
