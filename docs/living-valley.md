# The Living Valley — ambient story, not a quest log

> **STATUS: shipped.** All 42 cards are live in `src/farm/stories.js`, the
> engine in `src/farm/story_engine.js`, the UI in `main.js`. Art filenames are
> listed in `docs/story-art-list.txt`; a card with no art file yet shows a
> labelled placeholder naming the file it wants. In test mode a browser at the
> bottom-right cycles every card (`[` and `]` also work) so the art can be
> designed against the real UI.

A system for cards that appear because of something **true about your farm right
now**, and that change something real when you answer them.

## The rule that makes this work

> Every card is triggered by state the game already tracks, and every choice
> costs or gives something the game already models.

No card may be a chore. "Bring me 10 apples" is the market order board's job and
it already does it well. These are for the things a numbers system can't say:
that winter is close and your generator is a campfire, that the woods you have
been felling are thinning, that somebody a valley over is having a worse year
than you.

## Writing rule — name the subject in the first line

Learned the hard way. The wolf card opened *"Heard them on the ridge last
night"* — atmospheric to write, meaningless to read. The player has no idea
what "them" is, and no way to find out.

Voice comes from **how** a character says a thing, never from withholding
**what** the thing is. Bram is still Bram in "Heard the wolves up there again
last night" — he has just stopped being cryptic at the player's expense.

Two supporting rules:

- **Never claim a number you have not counted.** A body may be a
  `function(state)` returning its lines, so "six of them" is only ever written
  when there are six. Where the count is unavailable, say "several".
- **A card is read cold.** Assume the player has never seen this character,
  place or object before. The Ridge Farm needs one line saying a farm is up
  there before its chimney can mean anything.

## Shape

A card is a portrait or scene, three or four lines, and **two to three answers
with different consequences**. Never a lone OK button — a card you can only
dismiss teaches the player to dismiss cards.

```
trigger   a predicate on real state (season, weather, stats, inventory, placed)
voice     who is speaking — recurring people matter more than one-off events
body      3-4 lines. concise. no exposition dumps.
choices   2-3, each with a real cost/reward/state change. one may be "not now".
memory    what the world remembers about your answer
teaches   the mechanic this quietly puts in front of the player
art       one image
```

**Frequency**: at most one card per in-game day, hard-capped, with a cooldown
after any card the player dismissed without engaging. Rarity is what keeps them
feeling like events rather than notifications.

**Memory is the whole trick.** A neighbour who thanks you *by name* for the jam
you sent two seasons ago is worth more than twenty new characters. Keep a small
reputation number per person and let it gate later cards.

---

## The people

Four recurring, so the valley has faces rather than a stream of strangers.

- **Mira** — two farms over, jam and preserves, a small daughter. Warm, direct,
  slightly embarrassed to ask for anything.
- **Bram** — old, been here longest, speaks in short sentences, knows where
  everything is buried. Never explains himself the first time.
- **Sedge** — a trader who comes through on a cart. Cheerful, sells things of
  unclear value, always a little too pleased with the deal.
- **The Ridge Farm** — never named, never seen. Smoke, lamps, and the state of
  their fields are all you get. They are doing worse than you.

---

# THE CARDS

## I. Weather and season — the ones that are actually useful

**1 · The first frost**
*trigger* autumn, temperature crossing below 4° for the first time this year
*voice* Bram
> Ground'll be hard by morning. Anything still standing out there is a gamble.
> I've been wrong before. Not often.

- **Pull everything in now** — harvest every ripe plot instantly at 70% yield
- **Leave it** — full yield if the frost misses, total loss on the plots it hits
- *teaches* the temperature readout means something

**2 · Storm on the ridge**
*trigger* weather machine entering `storm`, player has running machines
*voice* the sky
> Wind's turning. The lamps are already guttering.

- **Shut the machines down** — running jobs pause, buildings take no extra wear
- **Run through it** — jobs continue, wear accelerates for the storm's duration
- *teaches* building wear exists and rain drives it

**3 · A dry stretch**
*trigger* 3+ consecutive in-game days without rain, no auto-watering placed
*voice* the land
> The stream is showing its stones. Third day of it now.

- **Haul water by hand** — all plots watered once, costs a real chunk of energy
- **Let them thirst** — growth stalls until rain or irrigation
- *teaches* the Water category, at the exact moment it would have helped

**4 · Hungrier than usual**
*trigger* first winter night with un-penned animals
*voice* Bram
> Heard them on the ridge last night. They're thin this year, and thin makes
> them brave. Yours are out in the open.

- **Bring them in** — animals move to the nearest closed pen, production pauses overnight
- **Post a watch** — costs coins, no losses tonight
- **They'll be fine** — normal predator odds, raised
- *teaches* pens actually protect, which the game never says out loud

**5 · Ice on the lake**
*trigger* the lake freezes over
*voice* the lake
> Solid enough to stand on. Not solid enough to be careless.

- **Cut a hole** — enables ice fishing for the season
- **Leave it** — the lake rests; fish stock recovers faster for spring
- *teaches* ice fishing exists

---

## II. Mira — the neighbour who becomes a friend

**6 · A bad year for strawberries** *(the opener)*
*trigger* player has harvested strawberries at least once, autumn
*voice* Mira
> Mine came up small and sour, the whole row. Ren won't eat toast without jam
> and I'd rather not tell her why she has to.
> Could you spare a few, when you have them? I'll pay over the odds. Gladly.

- **I'll grow you extra** — a standing order: strawberries sell at +40% to Mira for the season
- **Take some of mine now** — give strawberries from stores, +reputation, no coins
- **Sorry, tight year** — no penalty, but she does not ask twice
- *memory* Mira remembers exactly which one you chose
- *art* a woman at a fence with an empty jar

**7 · Ren's drawing**
*trigger* two seasons after any kindness to Mira
*voice* Mira
> Ren made you this. It's supposed to be your farm. The purple thing is your
> windmill, apparently.

- **Put it on the wall** — a small placeable decor item, permanent
- *this one has a single answer on purpose* — it asks nothing

**8 · Returning the favour**
*trigger* your stores drop below 15% while Mira's reputation is high
*voice* Mira
> Don't argue. You did it for me.
> There's a crate at your gate. It's mostly jam. Sorry.

- **Take it** — a generous parcel of preserved goods
- **She needs it more** — decline; reputation to maximum, and something later
- *teaches* that reputation is a real number

**9 · The recipe**
*trigger* Mira at maximum reputation
*voice* Mira
> This was my mother's. Don't give it to Sedge, he'd sell it back to me.

- **Accept** — unlocks a preserve recipe that exists nowhere else
- *teaches* recipes have sources

---

## III. Bram — the old man who was here first

**10 · The foundation**
*trigger* player places their 20th structure
*voice* Bram
> There's a stone footing under that back corner. Older than my father.
> Somebody built there once. Didn't stay.

- **Dig it out** — costs a day of stone-hauling; yields cut stone and a keepsake
- **Build over it** — that plot gets a permanent small yield bonus, "good ground"
- **Leave it alone** — Bram approves. Something grows there on its own, later.

**11 · The tool he won't explain**
*trigger* player crafts their first axe
*voice* Bram
> Take this. Don't ask.
> It's not sharper. It just doesn't argue with the wood.

- **Take it** — a cosmetic axe skin, and chop cooldown down 15%
- *teaches* that tools have properties

**12 · What the woods are telling you**
*trigger* `stats.chopped` exceeds 60 and the local tree field is below 40% standing
*voice* Bram
> You've been busy. I can see the ridge from my kitchen now. Never used to.
> It comes back. Slower than you'd think.

- **Plant for the ones after** — spend wood on saplings; regrow rate up permanently
- **I needed the timber** — no penalty, but regrow slows in that zone
- *teaches* trees are a renewable resource with a rate, not a spawner

**13 · The last frost he'll see**
*trigger* very late game, high prestige
*voice* Bram
> I'm not going anywhere. I'm just saying you've got the run of it now.
> Don't let the far field go to thistle.

- **Ask him to stay on** — Bram appears as a farmhand NPC, small passive bonus
- **Thank him** — he leaves you his field: a permanent land extension
- *this is the only card that closes a character's story*

---

## IV. Sedge — the trader you cannot quite trust

**14 · A seed with no name**
*trigger* Sedge's cart arrives, player has 200+ coins
*voice* Sedge
> No, I don't know what it is either. That's rather the point.
> Forty coins. It's either the best money you've spent or it's a turnip.

- **Buy it** — plants into a crop rolled from a rare table; sometimes genuinely a turnip
- **Haggle** — succeed and pay 25, fail and he won't sell it at all
- **Pass** — he offers it to the Ridge Farm instead, and you can see it growing there

**15 · The map**
*trigger* Sedge's second visit
*voice* Sedge
> Valley survey. Very old. Very possibly accurate.
> There's an X. I make no promises about the X.

- **Buy the map** — marks a real dig site in your outer zone
- **Buy the map and dig together** — cheaper, he takes half of whatever's there

**16 · He's back with your own goods**
*trigger* you have sold 50+ of any one good
*voice* Sedge
> Fine quality, these. Where do I get them? Trade secret.
> ...why are you looking at me like that.

- **Buy them back, laughing** — coins for reputation, a decor item
- **Undercut him at market** — sell prices for that good drop valley-wide for a season
- *teaches* the market has a supply side

---

## V. The Ridge Farm — the one you never meet

**17 · Smoke, and then none**
*trigger* mid-winter, player's stores are healthy
*voice* narration
> There's been no smoke from the ridge for two days.
> Their lamps aren't lit either.

- **Send a crate** — costs real goods, no coins, no reward given
- **Send firewood** — costs wood
- **It isn't your business** — nothing happens. Nothing at all.
- *memory* this is the card that decides everything the Ridge Farm does later

**18 · Repayment, of a sort**
*trigger* spring after helping the Ridge Farm
*voice* narration
> Someone has cleared the ditch along your north fence. Properly, too.
> No note.

- **Leave a lamp lit for them** — a small permanent ambient light on your fence line
- *no cost, no reward, and it is the card players will talk about*

**19 · The fields go over**
*trigger* spring after ignoring the Ridge Farm
*voice* narration
> The ridge fields are thistle to the treeline now. Nobody came back for them.

- **Take the land** — a genuine, cheap land expansion
- **Leave it** — the thistle spreads; your border plots lose a little yield each year
- *this is a real fork with a real cost either way*

---

## VI. The land and the animals

**20 · The fox that keeps coming back**
*trigger* a fox raids twice without a kill
*voice* narration
> Same fox. Same gap in the fence. It looked at you this time.

- **Set a trap** — fox gone, no more raids, no more fox
- **Mend the gap** — costs wood; raids stop for a season
- **Leave the scraps out** — it stops hunting your birds and starts driving off *other* foxes
- *teaches* the predator system has states, not just spawns

**21 · The stray**
*trigger* a storm at night, player has no dog
*voice* narration
> Something's under the porch. It's been there since the rain started.
> It is not going to come out while you're watching.

- **Leave food** — a dog joins the farm in three days
- **Leave the door open** — it comes in tonight, and is skittish for a season
- **Chase it off** — it goes. You see it once more, thinner, later.

**22 · The old tree**
*trigger* player selects the largest tree in their zone with the axe
*voice* the tree
> It was here before the fence. There's a nest in it, and something old under
> the roots.

- **Fell it** — triple wood, and the birds do not come back to that zone
- **Leave it** — becomes a named landmark, small permanent prestige
- *teaches* that some things are worth more standing

**23 · The bees are gone**
*trigger* player owns a beehive and honey production has stalled a full season
*voice* narration
> The hive is quiet. Not dead. Just empty.

- **Plant for them** — a pollinator garden; bees return and nearby yield rises
- **Buy a new colony** — costs coins, fixes the symptom, happens again
- *teaches* that some problems have a cause

**24 · Deer in the wheat**
*trigger* deer near the farm, standing crops, no fence upgrade
*voice* narration
> Six of them, and no hurry about it.

- **Hunt** — meat now, and they avoid your land for a season
- **Fence it** — costs wood, permanent
- **Plant them a strip** — sacrifice one plot; deer stay, and hunting them there is easy
- *teaches* three systems solve the same problem differently

---

## VII. The game teaching itself

These exist because a mechanic is being ignored, and a person saying something
lands better than a tooltip.

**25 · You have never once been fishing**
*trigger* 5+ in-game days played, `stats.fish` is 0
*voice* Sedge
> You've a dock and no rod. That's a jetty, then. A very expensive jetty.

- **Take the loaner** — a free rod, one use
- **Buy one properly** — normal purchase

**26 · The overflowing barn**
*trigger* storage has hit 100% three times
*voice* Mira
> You're losing food. I can hear it from here — that's a full barn creaking.

- **Sell the surplus** — instant market sale of everything above 80%
- **Ask about the co-op** — unlocks a shared granary: +storage, small cut of sales
- *teaches* the storage cap, at the moment it is costing money

**27 · The wet season is coming**
*trigger* late autumn, no covered storage, high inventory
*voice* Bram
> Grain in an open shed in November is just an expensive way to feed rats.

- **Build now** — opens the Storage panel with the granary pre-selected
- **Risk it** — a real chance of spoilage per rainy day
- *teaches* why storage tiers differ

**28 · Nothing is running**
*trigger* player owns 3+ processors and has run no job for 2 in-game days
*voice* Mira
> You're selling carrots. You could be selling carrot *soup*.
> I'm not going to say it twice. I am, obviously.

- **Show me** — opens a processor with its most profitable available recipe queued
- *teaches* the entire crafting economy, which is easy to never notice*

**29 · The dark farm**
*trigger* power deficit at night, three nights running
*voice* narration
> Third night with the lamps down. The machines haven't turned since Tuesday.

- **Cheap fix** — a generator, financed: pay double over the season
- **Do it properly** — opens Energy
- *teaches* the power system, which currently only dims lamps

---

## VIII. Events with a clock

**30 · Harvest festival**
*trigger* last week of autumn, annual
*voice* the valley
> Judging is Sunday. One entry each. Bram has won four years running and would
> like everyone to know it.

- **Enter your best crop** — scored against your own best-ever; prizes and prestige
- **Enter a dish** — scored higher, needs the crafting chain
- **Just go and eat** — small reputation with everyone, no risk
- *a recurring annual card the player starts planning for*

**31 · Midwinter lamps**
*trigger* the longest night
*voice* the valley
> Everyone lights what they've got. You can see the whole valley from up here
> on a clear one.

- **Light the farm** — costs power for the night; the whole valley lights up in the distance and prestige rises
- **Sit it out** — nothing, but the valley is visibly lit and you are not in it

**32 · The wheat glut**
*trigger* whenever the game decides, once a year
*voice* Sedge
> Everyone planted wheat. *Everyone.* You could roof a house with it.
> Prices are on the floor and I'm not the one who did it.

- **Sell anyway** — wheat at 40% for the season
- **Hold** — store it; prices recover, if you have room
- **Mill it** — flour is unaffected: the crafting chain as a hedge
- *teaches* processing as price insurance, which is the real reason it exists

---

## IX. Quiet ones

Not every card needs a decision with teeth. These are texture, and they should
be the most common kind.

**33 · First morning of spring**
*trigger* season turns
> Something's different in the light. It's not warm yet. It's just not winter.
- **Stand there a minute** — nothing happens. That is the point.

**34 · The letter for someone else**
*trigger* random, early
> A letter, addressed to whoever farmed here before you. The postmark is
> eleven years old.
- **Open it** — a short, ordinary, slightly sad note about a good crop year
- **Leave it in the drawer** — it turns up again much later, and Bram explains it

**35 · The one that got away**
*trigger* losing a fish after three missed bites
> That was a big one. You know it was.
- **Try again** — next cast has better odds
- **Call it a day** — the rod goes away; a small energy refund

**36 · Something in the net**
*trigger* fishing up junk three times in a row
*voice* Sedge
> Boot, boot, and a kettle. You want me to take those off your hands?
> ...no reason.
- **Sell him the junk** — surprisingly good coins
- **Keep the kettle** — decor. Much later, it matters.

---

## What to build first

If only three of these ship, make them **6 (Mira's strawberries)**, **17 (the
Ridge Farm)** and **20 (the fox)**. Between them they prove the whole idea: a
person who remembers you, a consequence that arrives a season late, and a
system the player thought was just an enemy spawner turning out to have doors
in it.

The engine needed is small — a trigger evaluator over existing state, a card
renderer, and a `story` block in the save holding flags and per-character
reputation. Everything above is content on top of that.

## Art

One image per card. The style is already set by the game: flat, warm, low
saturation. Portraits should be waist-up and plain — a person at a fence, a
crate at a gate, smoke on a ridge. The cards that land hardest have the least
in them.
