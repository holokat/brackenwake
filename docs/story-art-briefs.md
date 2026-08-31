# The Living Valley: art briefs

61 cards. Each one is a **complete themed panel**, not an image dropped into a
shared frame. The panel border, background, texture and mood all belong to the
event; only the text is drawn at runtime.

## The panel, and where the text goes

Author every panel at **800 x 1200** (2:3). It is displayed at 340px wide in
the corner and 400px wide centred, so anything smaller than about 24px in the
master will disappear.

```
  0 ---------------------------------------------- 800
  |                                                 |   SCENE BAND   0 to 620
  |     the event. full bleed. this is the art.     |   the picture lives here,
  |                                                 |   edge to edge, no inset
  620 --------------------------------------------- |
  |  QUIET BAND   620 to 1200                       |   text is drawn on top of
  |  same world, drastically simplified: a wall,    |   this at runtime. keep it
  |  a table top, sky, snow, planking. low          |   calm, low contrast, no
  |  contrast, no focal detail, nothing to read.    |   detail, no lettering.
  1200 -------------------------------------------- |
```

The quiet band is not a box or a plaque. It is the same scene continuing into
something plain: the sky above a ridge, a scrubbed table, a snowfield, the
boards of a porch. Text sits directly on it. If a reader would struggle to read
four lines of dark type over it, it is too busy.

**Border**: draw the frame as part of the artwork and let it belong to the
event. Rope and tarred timber for the storm cards, whitewashed batten for
Mira's kitchen, dark stone for the ridge, birch and paper for winter. Keep the
outer 20px clear of anything that matters, it gets clipped by the corner radius.

**Never in the image**: lettering of any kind, buttons, icons, UI chrome,
watermarks, borders drawn as a separate floating rectangle, or a person looking
into camera unless the brief says so.

## Two formats, decided by the file

The card reads the image's own proportions and lays itself out accordingly, so
you can move a card between formats without anyone touching code:

- **taller than 4:3** (e.g. 800x1200): treated as a full themed panel. The card
  loses its own border entirely, the art becomes the whole card, and the text is
  drawn over the quiet band. This is the format described above and the one to
  aim for.
- **4:3 or wider** (e.g. 640x480): treated as an inset picture, dropped into the
  standard wooden card frame with the text underneath.

Verified working at 800x1200. Until a file exists the card shows a placeholder
naming the file it wants, so these can be made in any order.

## House style

Flat, warm, low saturation, matching the game palette: muted wood browns,
greyed stone, olive greens, barn red used sparingly. Painterly rather than
vector, but simple: readable shapes, no rendered realism, no gloss, no lens
effects. The cards that land hardest have almost nothing in them.

Light does the emotional work. Cold blue for the ridge and winter cards, low
gold for anything to do with Bram or the end of a season, flat grey daylight
for the ones that are just information.

## Cast

- **bram**: Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
- **mira**: Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
- **sedge**: Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
- **ren**: Ren: a girl of about eight, Mira's daughter, muddy knees, entirely certain of herself.
- **ridge**: No person in frame. The Ridge Farm is only ever seen at a distance: smoke, lamps, the state of their fields.
- **land**: No person in frame. The land itself is the subject.
- **valley**: The valley as a whole. People may appear small and distant, never as portraits.

Faces stay consistent across every card a character appears in. Where a
character is present, they are doing something, never posing.

---

# The 61 briefs

### `first-frost.png`
**The first frost** · bram

> Ground'll be hard by morning. Anything still standing out there is a gamble. I've been wrong before. Not often.

**Prompt.** A field at first light, every leaf edged white with frost. A low sun barely clearing the ridge. One row still unharvested. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Pull everything in tonight / Leave it standing*

### `storm-ridge.png`
**Storm coming in** · land

> The wind is turning and the lamps are already guttering. Your machines are mid-job, and weather like this chews through a building.

**Prompt.** A dark ridge line with rain sheeting sideways. A lantern on a post whipping in the wind, flame nearly out. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Shut the machines down / Run through it*

### `dry-stretch.png`
**A dry stretch** · land

> The stream is showing its stones. Third day of it now.

**Prompt.** A shrunken stream showing bare rounded stones. Cracked mud at the banks. Hard flat midday light. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Haul water by hand / Let them thirst / What would fix this properly?*

### `hungry-winter.png`
**Wolves on the ridge** · bram

> Heard the wolves up there again last night. Thin this year, and thin makes them brave. You have 3 animals out in the open, none of them behind a closed gate.

**Prompt.** Snow on open ground at dusk, blue shadows. Wolf tracks crossing the foreground toward an open gate. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Bring them in / Post a watch / They'll be fine*

### `lake-ice.png`
**Ice on the lake** · land

> Solid enough to stand on. Not solid enough to be careless.

**Prompt.** A frozen lake surface seen low and close, pale grey ice with white stress lines running out toward the far bank. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Cut a hole / Let it rest*

### `mira-strawberries.png`
**A bad year for strawberries** · mira

> My strawberries came up small and sour, the whole row. My daughter Ren won't eat toast without jam, and I'd rather not tell her why she has to. Could you spare a few, when you have them? I'll pay over the odds. Gladly.

**Prompt.** A woman in her thirties leaning on a low fence, an empty preserving jar held loosely in one hand. Behind her a poor row of small strawberry plants. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: I'll grow you extra / Take some of mine now / Sorry, it is a tight year*

### `mira-drawing.png`  · CENTRED
**Ren's drawing** · mira

> Ren made you this. It's supposed to be your farm. The purple thing is your windmill, apparently.

**Prompt.** A child's crayon drawing of a farm pinned to a plank wall. Wonky windmill, coloured purple. Warm indoor light. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Put it on the wall*

### `mira-returns.png`
**Returning the favour** · mira

> Don't argue. You did it for me. There's a crate at your gate. It's mostly jam. Sorry.

**Prompt.** A wooden crate left at a farm gate at dawn, cloth over the top, jars visible underneath. Nobody in frame. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Take it / She needs it more*

### `mira-recipe.png`  · CENTRED
**The recipe** · mira

> My mother's preserve recipe. Nobody outside this house has ever had it written down. Don't give it to Sedge. He'd sell it back to me.

**Prompt.** A single handwritten recipe card on a scrubbed kitchen table, ink faded, corners soft with age. A jar beside it. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Accept*

### `bram-foundation.png`
**The foundation** · bram

> There's a stone footing under that back corner. Older than my father. Somebody built there once. Didn't stay.

**Prompt.** An old stone footing half buried in grass at the corner of a field, moss in the joints, clearly older than everything around it. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Dig it out / Build over it / Leave it alone*

### `bram-axe.png`
**The axe he won't explain** · bram

> Take this axe. Don't ask where it came from. It's not sharper than yours. It just doesn't argue with the wood.

**Prompt.** An old felling axe held out handle first toward the viewer, worn haft, honest steel. An old man's hands and forearms only. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Take it*

### `bram-woods.png`
**What the woods are telling you** · bram

> You've been busy. I can see the ridge from my kitchen now. Never used to. It comes back. Slower than you'd think.

**Prompt.** A hillside that used to be forest, now stumps and low scrub, with a thin remaining treeline on the skyline. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Plant for the ones after / I needed the timber*

### `bram-last.png`  · CENTRED
**Bram is getting old** · bram

> I'm not going anywhere yet. I'm just saying this valley is yours to run now, not mine. Don't let the far field go to thistle.

**Prompt.** An old farmer sitting on a gate at golden hour, looking out over fields, not at the camera. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Ask him to stay on / Thank him*

### `sedge-seed.png`
**A seed with no name** · sedge

> No, I don't know what it is either. That's rather the point. Forty coins. It's either the best money you've spent or it's a turnip.

**Prompt.** A grinning trader holding one unidentifiable seed between finger and thumb, cart piled with oddments behind him. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Buy it / Haggle / Pass*

### `sedge-map.png`
**The map** · sedge

> Valley survey. Very old. Very possibly accurate. There's an X. I make no promises about the X.

**Prompt.** A creased hand-drawn valley survey spread on a cart tailgate, one inked X, a thumb holding the corner down. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Buy the map / Dig it together / Not today*

### `sedge-your-goods.png`
**He is selling your own goods** · sedge

> Sedge has a cart full of produce with your farm's crates under it. "Fine quality, these. Where do I get them? Trade secret." "...why are you looking at me like that."

**Prompt.** A trader's cart stacked with produce crates, one crate clearly stencilled with the player's own farm mark. He is looking innocent. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Buy them back, laughing / Undercut him*

### `ridge-smoke.png`  · CENTRED
**No smoke from the ridge** · ridge

> There is a farm up the valley on the ridge. You have never met them; you just see their chimney most mornings. There has been no smoke from it for two days, and their lamps are not lit either.

**Prompt.** A distant farmhouse on a high ridge at dusk, cold chimney, no lamps lit. Everything blue and very quiet. No person in frame. The Ridge Farm is only ever seen at a distance: smoke, lamps, the state of their fields.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Send a crate / Send firewood / It isn't your business*

### `ridge-ditch.png`  · CENTRED
**Someone cleared the ditch** · ridge

> Along your north fence. Properly, too. No note.

**Prompt.** A field-edge ditch freshly dug out and clear of weed, spade marks in the bank, nobody about. No person in frame. The Ridge Farm is only ever seen at a distance: smoke, lamps, the state of their fields.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Leave a lamp lit for them*

### `ridge-thistle.png`
**The fields go over** · ridge

> The ridge fields are thistle to the treeline now. Nobody came back for them.

**Prompt.** An abandoned hillside field gone entirely to thistle and dock, fence posts leaning, seed heads blowing. No person in frame. The Ridge Farm is only ever seen at a distance: smoke, lamps, the state of their fields.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Take the land / Leave it*

### `the-fox.png`
**The fox that keeps coming back** · land

> Same fox. Same gap in the fence. It looked at you this time.

**Prompt.** A red fox sitting square in a gap in a fence line, absolutely still, looking directly out of frame at the viewer. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Set a trap / Mend the gap / Leave the scraps out*

### `the-stray.png`
**Something under the porch** · land

> An animal has been under there since the rain started. Too big for a cat. It is not going to come out while you are watching.

**Prompt.** A dark shape under a farmhouse porch in heavy rain, only two eyes and the curve of a wet back catching the light. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Leave food out / Leave the door open / Chase it off*

### `the-old-tree.png`
**The old tree** · land

> It was here before the fence. There's a nest in it, and something old under the roots.

**Prompt.** A single enormous old tree standing alone in a field, far bigger than anything near it, a bird nest visible high in the crown. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Fell it / Leave it standing*

### `bees-gone.png`
**The hive is quiet** · land

> Not dead. Just empty.

**Prompt.** An open hive box with the lid tilted off, empty combs inside, no bees anywhere. Bright still afternoon. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Plant for them / Buy a new colony*

### `deer-in-wheat.png`
**Deer in the wheat** · land

> Deer are in the crops. 5 of them, and no hurry about it. They will strip a row a night if nothing stops them.

**Prompt.** Several deer standing in a wheat field at dawn, heads up, entirely unhurried, crop flattened around them. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Hunt / Fence the field / Plant them a strip*

### `never-fished.png`
**A very expensive jetty** · sedge

> You've a dock and no rod. That's a jetty, then.

**Prompt.** A wooden dock reaching out over flat water with nothing on it. No rod, no bucket, no chair. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Take the loaner / I'll buy one properly*

### `overflowing-barn.png`
**That is a full barn creaking** · mira

> You're losing food. I can hear it from here.

**Prompt.** A barn with its door pushed part open by the sacks piled behind it, grain spilling over the threshold. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Sell the surplus / Tell me about the co-op / Show me the storage shelf*

### `wet-season.png`
**Grain in an open shed** · bram

> In November that is just an expensive way to feed rats.

**Prompt.** Sacks of grain stacked in an open-sided shed with rain coming in sideways at the edges. Puddles on the floor. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Build now / Risk it*

### `nothing-running.png`
**You're selling carrots** · mira

> You could be selling carrot *soup*. I'm not going to say it twice. I am, obviously.

**Prompt.** A cold, spotless workshop bench with tools hung up unused, and a crate of raw vegetables beside it. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show me / I know what I am doing*

### `dark-farm.png`
**Third night with the lamps down** · land

> The machines haven't turned since Tuesday.

**Prompt.** A farmyard at night with every lamp dark, one faint moonlit outline of a silent machine. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: The cheap fix / Do it properly*

### `harvest-festival.png`
**Harvest festival** · valley

> Judging is Sunday. One entry each. Bram has won four years running and would like everyone to know it.

**Prompt.** Trestle tables under bunting with prize vegetables laid out on cloth, ribbon rosettes waiting. The valley as a whole. People may appear small and distant, never as portraits.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Enter your best crop / Enter a dish / Just go and eat*

### `midwinter.png`
**Midwinter lamps** · valley

> Everyone lights what they've got. You can see the whole valley from up here on a clear one.

**Prompt.** A whole valley at night seen from above, small warm lights scattered across it, deep snow between them. The valley as a whole. People may appear small and distant, never as portraits.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Light the farm / Sit it out*

### `wheat-glut.png`
**Everyone planted wheat** · sedge

> *Everyone.* You could roof a house with it. Prices are on the floor and I'm not the one who did it.

**Prompt.** An absurd quantity of wheat sacks stacked far higher than a person, a trader looking up at it with a flat expression. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Sell anyway / Hold it / Mill it*

### `first-spring.png`  · CENTRED
**First morning of spring** · land

> Something's different in the light. It's not warm yet. It's just not winter.

**Prompt.** Bare wet fields with the very first green showing, low clear morning light, breath visible in the air. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Stand there a minute*

### `old-letter.png`
**A letter for someone else** · land

> Addressed to whoever farmed here before you. The postmark is eleven years old.

**Prompt.** A single unopened envelope on a dusty windowsill, handwriting in faded ink, an old postmark. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Open it / Leave it in the drawer*

### `letter-answered.png`
**About that old letter** · bram

> You show Bram the letter you found. He barely glances at it. "Ah. Her. She had this place four owners back. Good with pears. Terrible with money."

**Prompt.** An old man holding a letter at arm's length in poor light, reading it without much interest. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: What happened to her?*

### `got-away.png`
**That was a big one** · land

> Third bite you have missed. Whatever is down there is not in a hurry. You could keep casting, or pack the rod away.

**Prompt.** A slack fishing line trailing on still water, ripples widening away from where something just left. No person in frame. The land itself is the subject.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Try again / Call it a day*

### `junk-haul.png`
**Boot, boot, and a kettle** · sedge

> You want me to take those off your hands? ...no reason.

**Prompt.** A boot, another boot and a dented kettle laid out on a dock beside a fishing net. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Sell him the junk / Keep the kettle*

### `kettle-matters.png`
**About that kettle** · sedge

> Funny thing. There's a collector asking after exactly that pattern. I told him I had no idea where one might be. Obviously.

**Prompt.** A battered old kettle sitting alone on a cart tailgate, a trader eyeing it with poorly hidden interest. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Sell it / Keep the kettle*

### `too-many-buildings.png`
**You have built a town** · bram

> Used to be able to see the far fence from here. Not saying it's wrong. Saying I noticed.

**Prompt.** A farm so densely built out that the far fence is no longer visible, roofs behind roofs. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: It is a working farm / Open a view back up*

### `visitor.png`
**Someone came by while you were out** · valley

> Gate latched behind them, which is more than most manage. There's something on the step.

**Prompt.** A small parcel left on a farmhouse step, gate latched behind, nobody in sight. The valley as a whole. People may appear small and distant, never as portraits.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Open it*

### `counterfeit.png`
**Check your coin** · sedge

> There are underweight coins going round the valley. Forgeries, and good ones. They ring wrong if you listen. I'd not take a big payment off a stranger this week.

**Prompt.** A scatter of coins on dark wood, one of them visibly thinner and paler than the rest. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Weigh every coin / Risk it*

### `contract.png`
**An exclusive offer** · valley

> A buyer in town wants everything you grow. All of it. One price, agreed now. You would not sell to anyone else.

**Prompt.** A single sheet of contract paper and a pen laid on a table, one line for a signature. The valley as a whole. People may appear small and distant, never as portraits.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Sign / Stay independent*

### `nudge-sprinkler.png`
**The long way to the water butt** · bram

> You have carried that can out to the same corner nine times this week. I counted, which tells you how my week went. There is a thing that does the same job standing still.

**Prompt.** A well-worn footpath through grass from a water butt to a vegetable bed, a watering can set down at the end of it. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show me the thing / I like the walk*

### `nudge-bow.png`
**Something has been at the lettuces** · mira

> I sat out on the step half of last night waiting for it. When it finally came it looked straight at me and carried on eating. A bow would have settled the argument. I keep saying I will get one and I keep not getting one.

**Prompt.** A woman sitting on her back step at night with a blanket round her, staring out at a raided lettuce bed. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: A bow, you say / Where would a person even get one? / Let it have the lettuces*

### `sedge-bow.png`
**You were asking about a bow** · sedge

> I have a bow. It is a good bow, seasoned yew, and I will not insult you by pretending I have a second one in the cart. So neither of us is in a strong position here. Mine is slightly better.

**Prompt.** A yew longbow laid unstrung across a trader's cart tailgate, clearly the only one he has, nothing else on the cart to compare it to. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Name your price / I will find my own*

### `nudge-pickaxe.png`
**You have been buying stone** · bram

> Half this valley is stone. It is lying about in the open with nothing better to do. A pick costs less than one season of paying somebody else to swing one.

**Prompt.** Big field boulders sitting in open grass with nothing done to them, a pickaxe leaning unused against a fence. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Where do I get a pick / My back is fine as it is*

### `nudge-axe.png`
**Timber, is it** · sedge

> I can sell you timber. I would like to sell you timber. It is most of what I do. Or you buy one axe, once, and never buy a plank off me again. I am telling you this against my own interests and I would like that noted.

**Prompt.** A trader's cart loaded with sawn planks, and one axe hanging on the side of it almost as an afterthought. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show me the axes / Sell me the timber then*

### `nudge-pen.png`
**Loose stock** · bram

> Anything wandering loose out there is not livestock. It is a shopping list, and somebody reads it every night. Gate shut, they stay yours. Gate open, they are on offer.

**Prompt.** Loose farm animals scattered across open ground at dusk, no fence anywhere near them, an open gate behind. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show me the pens / They know their way home*

### `nudge-timber.png`
**You keep walking to the treeline** · bram

> Every time you want a plank you go out to the woods and take one off the valley. Trees grow where you put them. That has been true the whole time.

**Prompt.** A row of young pine saplings in pots waiting to be planted, with a cleared treeline in the distance. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Plant my own / The woods can spare it*

### `nudge-paths.png`
**You have worn a line** · mira

> Gate to the water butt, water butt to the beds. Same line every day until the grass gave up arguing. You may as well admit it is a path and put something down before it turns to soup.

**Prompt.** A bare worn track through grass between a gate and a water butt, mud where it has been walked to death. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Lay something down / I like the mud*

### `nudge-orders.png`
**The board at your own stand** · sedge

> There is a board nailed to your market stand with people's names on it. Have you read it. They want particular things on particular days and they pay over the odds for the trouble of asking. It is free money and it is bolted to your own fence.

**Prompt.** A weathered notice board nailed to a market stall, several handwritten notes pinned to it, unread. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Go and read it / I will get to it*

### `nudge-collection.png`
**Do you write them down** · ren

> Mum says you have grown things she has never heard of. She says one of them was purple. You should write them down. If you do not write them down then when you are old you will not know what you did.

**Prompt.** A child holding out a battered notebook and a stub of pencil, expectantly. Ren: a girl of about eight, Mira's daughter, muddy knees, entirely certain of herself.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show her the book / I remember them all*

### `nudge-visiting.png`
**You do know there are others** · sedge

> Farms, I mean. Real ones, worked by real people, further down the valley than my cart goes. You can walk over and look at what they have done. Nobody has ever once stopped me.

**Prompt.** A track leading away over a rise toward other farms in the far distance, gate standing open. Sedge: a travelling trader, fifties, too many layers, an expression of permanent delighted opportunism.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Take me to a gate / I have enough to look at here*

### `nudge-biome.png`
**Land is not a sentence** · bram

> People get the idea that where they started is where they have to finish. It is not written down anywhere. Sand, snow, blossom. I have seen all three worked well. Nobody is holding you to this valley.

**Prompt.** Four small views stitched side by side: meadow, dunes, snow forest and blossom, like a page of samples. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show me what is out there / I am staying put*

### `nudge-farmhouse.png`
**The barn is nicer than the house** · mira

> I walked past yesterday and had to look twice. That barn is a fine building. You sleep in the other one. I am not saying anything. I am just saying I noticed.

**Prompt.** A magnificent barn beside a small shabby cottage, the size difference obvious and slightly comic. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Perhaps it is time / The barn earns its keep*

### `nudge-seasonal.png`
**Plan backwards from January** · mira

> Fresh things fetch nothing once it turns cold. Nobody wants a soft tomato in a frost. Anything in a jar fetches double. Work back from the worst month and you will eat well through it.

**Prompt.** A shelf of preserving jars glowing in low winter light next to a bowl of soft, past-it tomatoes. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Show me what keeps / I will risk the tomatoes*

### `bram-hunt.png`
**Bring nothing** · bram

> I have two of everything and one spare temper. Wind is off the river, which means we go the long way and we go quietly. You will not hit anything today. That is not what today is for.

**Prompt.** Two figures walking away from camera into a misty treeline at first light, bows carried low at their sides, frost on the grass. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Go with him / Another day*

### `mira-preserving.png`
**Bring me whatever is about to turn** · mira

> Not the good stuff. The bruised things, the ones you were going to feel guilty about. I will run one batch through with you watching. After that you are on your own, and I will want the jars back.

**Prompt.** Two pairs of hands working over a steaming pot on a range, empty jars sterilising in a rack alongside, a bowl of bruised fruit waiting. Mira: a woman in her thirties, sleeves pushed up, apron, hair tied back badly. Warm, direct, always mid-task.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Watch her do it / I will work it out*

### `the-wager.png`
**A small bet** · bram

> Bet you cannot fill that barn before the frost. No money in it. I would just like us both to know where we stand by December.

**Prompt.** Two men shaking hands over a gate with a half-empty barn behind them. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Take the bet / I do not bet*

### `the-apprentice.png`
**There is a boy at your gate** · ren

> He says he will work for nothing if somebody teaches him something. He has been stood there an hour. Mum says do not encourage him. Mum also made him a sandwich, so.

**Prompt.** A boy of about twelve stood dead still at a farm gate with a bag over his shoulder, waiting. Ren: a girl of about eight, Mira's daughter, muddy knees, entirely certain of herself.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Teach him the beds / Teach him the animals / Send him home*

### `nudge-repair.png`
**Rain is getting in** · bram

> Somewhere on that roof there is a nail doing nothing and a gap doing a great deal. It does not improve on its own. It only ever gets dearer.

**Prompt.** A close look at a barn roof with two slates missing and a dark wet stain spreading on the timber beneath. Bram: a weathered farmer in his seventies, flat cap, canvas coat worn at the cuffs, hands like tree roots. Never smiling exactly, never unfriendly.
Full themed panel, 800x1200. Scene fills the top 620px edge to edge; below
that the same world simplifies into a plain quiet band for text. Frame drawn
into the art and matched to this scene. Flat warm low-saturation painting, no
text, no UI, no logos.

*Answers on this card: Which building / It has held this long*

---

# The six portraits

Separate from the card panels. These appear as small round faces beside a name
on the Valley page of the Mission Book, next to how that person feels about
you, so they are read at about 22px. Anything subtle is wasted.

**Format:** 512 x 512, square, head and shoulders, plain flat background in a
muted tone that is not skin. No frame, no border, no text. The game crops them
to a circle, so keep the head centred and leave room at the edges.

They also set the canonical face for each character. Whoever appears in a card
panel has to be recognisably this person.

### `who-bram.png`
Weathered farmer, seventies. Flat cap, grey stubble, deep lines, a canvas coat
worn through at the collar. Looking slightly off camera, mouth closed, not
unfriendly and not smiling. Cold overcast light.

### `who-mira.png`
Woman in her thirties. Hair tied back badly with strands loose, sleeves rolled,
an apron strap visible at the shoulder. Mid-expression, as though she was
talking a second ago. Warm indoor light.

### `who-sedge.png`
Travelling trader, fifties. Too many layers, a scarf, a hat that has been
rained on many times. Openly pleased with himself. Bright flat daylight.

### `who-ren.png`
Girl of about eight, Mira's daughter. Dark hair, a smudge of dirt on one cheek,
entirely certain of herself. Looking straight ahead. Warm light.

### `who-ridge.png`
No person. A distant farmhouse on a ridge at dusk, small in frame, one chimney,
seen across a valley. This is a place, not a face, and should read as such even
at 22px: a dark silhouette against a pale cold sky.

### `who-valley.png`
No person. The valley itself from above at golden hour, fields and hedgerows,
no buildings picked out. A landscape reduced to a few flat shapes.
