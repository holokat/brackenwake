// stories.js — The Living Valley. 36 cards of ambient narrative.
// Pure data: no imports, no logic. See docs/living-valley.md for the design.
//
// THE RULE: every card is triggered by state the game already tracks, and every
// choice costs or gives something the game already models. Fetch quests are the
// order board's job; these are for what a numbers system cannot say.
//
// Card shape
//   id        stable key — used for save flags, never rename one that shipped
//   who       portrait/voice: mira | bram | sedge | ridge | land | valley
//   art       /ui/story/<id>.png — one image per card, 4:3, see the art notes
//   title     short. shown above the body.
//   body      3-4 lines. array = separate paragraphs, OR a function(state) that
//             returns one — use the function form whenever the copy would
//             otherwise claim a NUMBER, so the card never says "six of them"
//             when there are two.
//
// WRITING RULE, learned the hard way: name the subject in the first line.
// "Heard them on the ridge last night" reads as atmosphere to the author and
// as nonsense to the player, who has no idea what "them" is. Voice comes from
// how a character says a thing, never from withholding what the thing is.
//   when(s)   trigger predicate over a snapshot (see story_engine.js buildState)
//   once      true = fires at most once ever (default true; false = repeatable)
//   cooldown  ms before it may fire again when once:false
//   weight    relative pick chance when several cards qualify (default 1)
//   moment    true = centre of screen with the game dimmed behind it. RARE.
//             A card that stops the game had better be worth stopping for; if
//             every card does it, players learn to resent all of them. Default
//             is the bottom-right knock-at-the-door, which does not interrupt.
//   choices   [{ label, hint, effects, rep, flag, sets }]
//
//   pledge    a promise you have to COME BACK to, listed in the Mission Book
//             with progress until you deliver it. Use this whenever a choice
//             says "I'll do X" rather than doing X on the spot — otherwise the
//             card vanishes and the player has nowhere to go and say they did.
//               { id, text, need: {good:n}, reward: {coins,goods,rep}, days }
//   revisit   days after which a DECLINE may be offered again. A neighbour you
//             turned down in a tight year should be able to ask once more.
//
// Effects vocabulary — every key maps to something real (story_engine.apply):
//   coins            +/- coins
//   goods            { id: n } — positive gives, negative takes
//   needs            { id: n } — required to pick the choice at all
//   rep              { who: n } — reputation with a character
//   flag             sets a save flag other cards can read
//   unlock           an item id added to owned
//   modifier         { key, value, days } — a timed world modifier
//   act              a named engine action (harvestAll, waterAll, openPanel, ...)

export const CHARACTERS = {
  mira:   { name: 'Mira',           sub: 'two farms over',      art: '/ui/story/who-mira.png' },
  bram:   { name: 'Bram',           sub: 'been here longest',   art: '/ui/story/who-bram.png' },
  sedge:  { name: 'Sedge',          sub: 'trader, in season',   art: '/ui/story/who-sedge.png' },
  ridge:  { name: 'The Ridge Farm', sub: 'up the valley',       art: '/ui/story/who-ridge.png' },
  land:   { name: '',               sub: '',                    art: null },
  valley: { name: 'The Valley',     sub: '',                    art: '/ui/story/who-valley.png' },
};

const S = (o) => o; // identity, purely so each card reads as a block below

export const STORIES = [

  // ===========================================================
  // I. WEATHER AND SEASON — the useful ones
  // ===========================================================
  S({
    id: 'first_frost', who: 'bram', art: '/ui/story/first-frost.png',
    title: 'The first frost',
    body: [
      "Ground'll be hard by morning. Anything still standing out there is a gamble.",
      "I've been wrong before. Not often.",
    ],
    when: (s) => s.season === 'fall' && s.temp < 4 && s.ripePlots > 0,
    once: false, cooldown: 1000 * 60 * 60 * 24,
    choices: [
      { label: 'Pull everything in tonight', hint: 'harvest every ripe plot now, at reduced yield',
        act: { harvestAll: { yieldPct: 0.7 } } },
      { label: 'Leave it standing', hint: 'a coin-flip: full yield, or the frost takes the lot',
        act: { frostGamble: true } },
    ],
    teaches: 'the temperature readout means something',
  }),

  S({
    id: 'storm_ridge', who: 'land', art: '/ui/story/storm-ridge.png',
    title: 'Storm coming in',
    body: [
      "The wind is turning and the lamps are already guttering.",
      'Your machines are mid-job, and weather like this chews through a building.',
    ],
    when: (s) => s.weather === 'storm' && s.runningJobs > 0,
    once: false, cooldown: 1000 * 60 * 60 * 6,
    choices: [
      { label: 'Shut the machines down', hint: 'jobs pause — but nothing weathers tonight',
        act: { pauseJobs: true }, modifier: { key: 'wearMult', value: 0, days: 1 } },
      { label: 'Run through it', hint: 'keep working, and pay for it in wear',
        modifier: { key: 'wearMult', value: 2.2, days: 1 } },
    ],
    teaches: 'building wear exists, and rain drives it',
  }),

  S({
    id: 'dry_stretch', who: 'land', art: '/ui/story/dry-stretch.png',
    title: 'A dry stretch',
    body: ['The stream is showing its stones. Third day of it now.'],
    when: (s) => s.dryDays >= 3 && s.autoWaterCount === 0 && s.plantedPlots > 0,
    once: false, cooldown: 1000 * 60 * 60 * 24,
    choices: [
      { label: 'Haul water by hand', hint: 'every plot watered once — it will cost you the day',
        act: { waterAll: true }, coins: -25 },
      { label: 'Let them thirst', hint: 'growth stalls until the rain comes',
        modifier: { key: 'growthMult', value: 0.6, days: 2 } },
      { label: 'What would fix this properly?', hint: 'open the Water shelf', act: { openPanel: 'wat' } },
    ],
    teaches: 'the Water category, at the exact moment it would have helped',
  }),

  S({
    id: 'hungry_winter', who: 'bram', art: '/ui/story/hungry-winter.png',
    title: 'Wolves on the ridge',
    body: (s) => [
      'Heard the wolves up there again last night. Thin this year, and thin makes them brave.',
      // the trigger guarantees at least one, but the card browser renders it
      // out of context — so the zero case still has to read like a sentence
      s.loosePenAnimals > 1
        ? `You have ${s.loosePenAnimals} animals out in the open, none of them behind a closed gate.`
        : 'Your animals are out in the open, and not one of them is behind a closed gate.',
    ],
    when: (s) => s.season === 'winter' && s.night && s.loosePenAnimals > 0,
    once: false, cooldown: 1000 * 60 * 60 * 24,
    choices: [
      { label: 'Bring them in', hint: 'they stop producing overnight, and nothing takes them',
        act: { penAnimals: true } },
      { label: 'Post a watch', hint: 'costs coin, costs you nothing else', coins: -60,
        modifier: { key: 'predatorOdds', value: 0, days: 1 } },
      { label: "They'll be fine", hint: 'the odds are worse than usual tonight',
        modifier: { key: 'predatorOdds', value: 1.8, days: 1 } },
    ],
    teaches: 'pens actually protect animals, which the game never says out loud',
  }),

  S({
    id: 'lake_ice', who: 'land', art: '/ui/story/lake-ice.png',
    title: 'Ice on the lake',
    body: ['Solid enough to stand on. Not solid enough to be careless.'],
    when: (s) => s.season === 'winter' && s.lakeFrozen,
    once: false, cooldown: 1000 * 60 * 60 * 48,
    choices: [
      { label: 'Cut a hole', hint: 'ice fishing, for as long as it holds', act: { cutIce: true } },
      { label: 'Let it rest', hint: 'the fish come back stronger — bites come quicker for a month',
        modifier: { key: 'fishLuck', value: 1.4, days: 30 } },
    ],
    teaches: 'ice fishing exists',
  }),

  // ===========================================================
  // II. MIRA — the neighbour who becomes a friend
  // ===========================================================
  S({
    id: 'mira_strawberries', who: 'mira', art: '/ui/story/mira-strawberries.png',
    title: 'A bad year for strawberries',
    body: [
      "My strawberries came up small and sour, the whole row. My daughter Ren won't eat toast without jam, and I'd rather not tell her why she has to.",
      "Could you spare a few, when you have them? I'll pay over the odds. Gladly.",
    ],
    when: (s) => s.has('strawberry') || s.stat('planted') > 12,
    choices: [
      { label: "I'll grow you extra", hint: 'a standing order for 12 — and a better price meanwhile',
        rep: { mira: 1 }, modifier: { key: 'sellBonus:strawberry', value: 1.4, days: 12 }, flag: 'mira_deal',
        pledge: { id: 'mira_strawberries', text: 'Grow 12 strawberries for Mira', days: 12,
          need: { strawberry: 12 }, reward: { coins: 320, rep: { mira: 3 }, flag: 'mira_kept_word' } } },
      { label: 'Take some of mine now', hint: 'give 5 strawberries — she will not forget it',
        needs: { strawberry: 5 }, goods: { strawberry: -5 }, rep: { mira: 3 }, flag: 'mira_gift' },
      { label: 'Sorry — tight year', hint: 'she understands. She may ask again.',
        flag: 'mira_declined', revisit: 6 },
    ],
    teaches: 'that a neighbour is a price channel, not a quest giver',
  }),

  S({
    id: 'mira_drawing', moment: true, who: 'mira', art: '/ui/story/mira-drawing.png',
    title: "Ren's drawing",
    body: [
      "Ren made you this. It's supposed to be your farm.",
      'The purple thing is your windmill, apparently.',
    ],
    when: (s) => s.rep('mira') >= 2 && s.daysSinceFlag('mira_gift', 'mira_deal') >= 2,
    choices: [
      { label: 'Put it on the wall', hint: 'yours, permanently', unlock: 'story_drawing', rep: { mira: 1 } },
    ],
    teaches: 'that a card can ask for nothing at all',
  }),

  S({
    id: 'mira_returns', who: 'mira', art: '/ui/story/mira-returns.png',
    title: 'Returning the favour',
    body: [
      "Don't argue. You did it for me.",
      "There's a crate at your gate. It's mostly jam. Sorry.",
    ],
    when: (s) => s.rep('mira') >= 3 && s.storageFrac < 0.15,
    choices: [
      { label: 'Take it', hint: 'a generous parcel',
        goods: { strawberry_jam: 4, bread: 3, cheese: 2 }, rep: { mira: 1 } },
      { label: 'She needs it more', hint: 'decline — and she remembers that too',
        rep: { mira: 3 }, flag: 'mira_refused_help' },
    ],
    teaches: 'that reputation is a real number with real returns',
  }),

  S({
    id: 'mira_recipe', moment: true, who: 'mira', art: '/ui/story/mira-recipe.png',
    title: 'The recipe',
    body: [
      "My mother's preserve recipe. Nobody outside this house has ever had it written down.",
      "Don't give it to Sedge. He'd sell it back to me.",
    ],
    when: (s) => s.rep('mira') >= 6,
    choices: [
      { label: 'Accept', hint: 'a preserve that exists nowhere else', unlock: 'recipe_mira_preserve', rep: { mira: 1 } },
    ],
    teaches: 'recipes have sources',
  }),

  // ===========================================================
  // III. BRAM — the old man who was here first
  // ===========================================================
  S({
    id: 'bram_foundation', who: 'bram', art: '/ui/story/bram-foundation.png',
    title: 'The foundation',
    body: [
      "There's a stone footing under that back corner. Older than my father.",
      "Somebody built there once. Didn't stay.",
    ],
    when: (s) => s.placedCount >= 20,
    choices: [
      { label: 'Dig it out', hint: 'a day of hauling, and good cut stone',
        goods: { stone: 40 }, coins: -40, rep: { bram: 1 } },
      { label: 'Build over it', hint: 'good ground — a permanent yield bonus there',
        modifier: { key: 'yieldBonus', value: 1, days: 9999 } },
      { label: 'Leave it alone', hint: 'Bram approves. Something grows there later.',
        rep: { bram: 3 }, flag: 'foundation_left' },
    ],
  }),

  S({
    id: 'bram_axe', who: 'bram', art: '/ui/story/bram-axe.png',
    title: "The axe he won't explain",
    body: [
      "Take this axe. Don't ask where it came from.",
      "It's not sharper than yours. It just doesn't argue with the wood.",
    ],
    when: (s) => s.owns('axe'),
    choices: [
      { label: 'Take it', hint: 'swings come round quicker',
        rep: { bram: 1 }, modifier: { key: 'chopSpeed', value: 0.85, days: 9999 } },
    ],
    teaches: 'that tools have properties',
  }),

  S({
    id: 'bram_woods', who: 'bram', art: '/ui/story/bram-woods.png',
    title: 'What the woods are telling you',
    body: [
      "You've been busy. I can see the ridge from my kitchen now. Never used to.",
      "It comes back. Slower than you'd think.",
    ],
    when: (s) => s.stat('chopped') >= 60 && s.treesStandingFrac < 0.4,
    choices: [
      { label: 'Plant for the ones after', hint: 'spend timber — the woods come back faster, for good',
        needs: { wood: 30 }, goods: { wood: -30 }, rep: { bram: 2 },
        modifier: { key: 'regrowMult', value: 0.6, days: 9999 } },
      { label: 'I needed the timber', hint: 'no argument. The regrowth slows.',
        modifier: { key: 'regrowMult', value: 1.4, days: 60 } },
    ],
    teaches: 'trees regrow at a rate — they are not a spawner',
  }),

  S({
    id: 'bram_last', moment: true, who: 'bram', art: '/ui/story/bram-last.png',
    title: 'Bram is getting old',
    body: [
      "I'm not going anywhere yet. I'm just saying this valley is yours to run now, not mine.",
      "Don't let the far field go to thistle.",
    ],
    when: (s) => s.prestige >= 60 && s.rep('bram') >= 3,
    choices: [
      { label: 'Ask him to stay on', hint: 'Bram works the farm with you — everything produces more',
        rep: { bram: 1 }, modifier: { key: 'productionMult', value: 1.15, days: 9999 } },
      { label: 'Thank him', hint: 'he leaves you his field', act: { grantLand: true }, rep: { bram: 2 } },
    ],
    teaches: 'the only card that closes a character out',
  }),

  // ===========================================================
  // IV. SEDGE — the trader you cannot quite trust
  // ===========================================================
  S({
    id: 'sedge_seed', who: 'sedge', art: '/ui/story/sedge-seed.png',
    title: 'A seed with no name',
    body: [
      "No, I don't know what it is either. That's rather the point.",
      "Forty coins. It's either the best money you've spent or it's a turnip.",
    ],
    when: (s) => s.coins >= 200,
    once: false, cooldown: 1000 * 60 * 60 * 72,
    choices: [
      { label: 'Buy it', hint: '40 coins, and no promises', coins: -40, act: { mysterySeed: true } },
      { label: 'Haggle', hint: 'he might come down. He might walk.', act: { haggleSeed: true } },
      { label: 'Pass', hint: 'he offers it up the valley instead', flag: 'seed_passed', revisit: 4 },
    ],
  }),

  S({
    id: 'sedge_map', who: 'sedge', art: '/ui/story/sedge-map.png',
    title: 'The map',
    body: [
      'Valley survey. Very old. Very possibly accurate.',
      "There's an X. I make no promises about the X.",
    ],
    when: (s) => s.seen('sedge_seed') && s.coins >= 300,
    choices: [
      { label: 'Buy the map', hint: '120 coins — then take a pick to the marked spot',
        coins: -120, pledge: { id: 'dig_site', text: 'Dig the marked site — 30 stone to clear it', days: 20,
          need: { stone: 30 }, reward: { coins: 520, goods: { stone: 60 } } } },
      { label: 'Dig it together', hint: 'cheaper, and he takes half of whatever is down there',
        coins: -50, pledge: { id: 'dig_site', text: 'Dig the marked site with Sedge — 30 stone', days: 20,
          need: { stone: 30 }, reward: { coins: 260, goods: { stone: 30 } } } },
      { label: 'Not today', hint: 'he passes through again', revisit: 5 },
    ],
  }),

  S({
    id: 'sedge_your_goods', who: 'sedge', art: '/ui/story/sedge-your-goods.png',
    title: 'He is selling your own goods',
    body: [
      "Sedge has a cart full of produce with your farm's crates under it.",
      '"Fine quality, these. Where do I get them? Trade secret."',
      '"...why are you looking at me like that."',
    ],
    when: (s) => s.stat('sold') >= 50,
    choices: [
      { label: 'Buy them back, laughing', hint: 'he is not even embarrassed',
        coins: -80, unlock: 'story_crate', rep: { sedge: 2 } },
      { label: 'Undercut him', hint: 'prices valley-wide take the hit, and so does he',
        rep: { sedge: -2 }, modifier: { key: 'sellBonusAll', value: 0.85, days: 12 } },
    ],
    teaches: 'the market has a supply side',
  }),

  // ===========================================================
  // V. THE RIDGE FARM — the one you never meet
  // ===========================================================
  S({
    id: 'ridge_smoke', moment: true, who: 'ridge', art: '/ui/story/ridge-smoke.png',
    title: 'No smoke from the ridge',
    body: [
      'There is a farm up the valley on the ridge. You have never met them; you just see their chimney most mornings.',
      'There has been no smoke from it for two days, and their lamps are not lit either.',
    ],
    when: (s) => s.season === 'winter' && s.storageFrac > 0.4,
    choices: [
      { label: 'Send a crate', hint: 'food. No coin comes back.',
        needs: { }, act: { sendCrate: 'food' }, flag: 'ridge_helped', rep: { ridge: 3 } },
      { label: 'Send firewood', hint: '25 wood. No coin comes back.',
        needs: { wood: 25 }, goods: { wood: -25 }, flag: 'ridge_helped', rep: { ridge: 3 } },
      { label: "It isn't your business", hint: 'nothing happens. Nothing at all.',
        flag: 'ridge_ignored' },
    ],
    teaches: 'that a choice can have no reward and still be the one you remember',
  }),

  S({
    id: 'ridge_ditch', moment: true, who: 'ridge', art: '/ui/story/ridge-ditch.png',
    title: 'Someone cleared the ditch',
    body: [
      'Along your north fence. Properly, too.',
      'No note.',
    ],
    when: (s) => s.flag('ridge_helped') && s.season === 'spring',
    choices: [
      { label: 'Leave a lamp lit for them', hint: 'it stays lit', unlock: 'story_lamp', rep: { ridge: 2 } },
    ],
  }),

  S({
    id: 'ridge_thistle', who: 'ridge', art: '/ui/story/ridge-thistle.png',
    title: 'The fields go over',
    body: ['The ridge fields are thistle to the treeline now. Nobody came back for them.'],
    when: (s) => s.flag('ridge_ignored') && s.season === 'spring',
    choices: [
      { label: 'Take the land', hint: 'cheap, and it is good ground', coins: -200, act: { grantLand: true } },
      { label: 'Leave it', hint: 'the thistle spreads to your border',
        modifier: { key: 'yieldBonus', value: -1, days: 9999 } },
    ],
  }),

  // ===========================================================
  // VI. THE LAND AND THE ANIMALS
  // ===========================================================
  S({
    id: 'the_fox', who: 'land', art: '/ui/story/the-fox.png',
    title: 'The fox that keeps coming back',
    body: [
      'Same fox. Same gap in the fence.',
      'It looked at you this time.',
    ],
    when: (s) => s.foxRaids >= 2,
    choices: [
      { label: 'Set a trap', hint: 'no more raids. No more fox.', act: { removeFox: true } },
      { label: 'Mend the gap', hint: '15 wood — it gives up for a season',
        needs: { wood: 15 }, goods: { wood: -15 }, modifier: { key: 'predatorOdds', value: 0.4, days: 12 } },
      { label: 'Leave the scraps out', hint: 'it stops hunting your birds. It starts driving off others.',
        act: { tameFox: true }, flag: 'fox_fed' },
    ],
    teaches: 'the predator system has states, not just spawns',
  }),

  S({
    id: 'the_stray', who: 'land', art: '/ui/story/the-stray.png',
    title: 'Something under the porch',
    body: [
      'An animal has been under there since the rain started. Too big for a cat.',
      'It is not going to come out while you are watching.',
    ],
    when: (s) => s.weather === 'storm' && s.night && !s.ownsAnimal('dog'),
    choices: [
      { label: 'Leave food out', hint: 'give it three days', act: { strayDog: 'slow' } },
      { label: 'Leave the door open', hint: 'tonight, then. It will be skittish a while.',
        act: { strayDog: 'now' } },
      { label: 'Chase it off', hint: 'you see it once more, later', flag: 'stray_chased' },
    ],
  }),

  S({
    id: 'the_old_tree', who: 'land', art: '/ui/story/the-old-tree.png',
    title: 'The old tree',
    body: [
      'It was here before the fence.',
      "There's a nest in it, and something old under the roots.",
    ],
    when: (s) => s.stat('chopped') >= 15,
    choices: [
      { label: 'Fell it', hint: 'triple timber — and the birds leave this zone',
        goods: { wood: 45 }, flag: 'old_tree_felled' },
      { label: 'Leave it standing', hint: 'it becomes a landmark',
        unlock: 'story_old_tree', modifier: { key: 'prestige', value: 15, days: 9999 } },
    ],
    teaches: 'some things are worth more standing',
  }),

  S({
    id: 'bees_gone', who: 'land', art: '/ui/story/bees-gone.png',
    title: 'The hive is quiet',
    body: ['Not dead. Just empty.'],
    when: (s) => s.ownsAnimal('beehive') && s.goodStalled('honey'),
    choices: [
      { label: 'Plant for them', hint: 'they come back, and so does the yield',
        coins: -90, unlock: 'eco_pollinator_garden', modifier: { key: 'yieldBonus', value: 1, days: 9999 } },
      { label: 'Buy a new colony', hint: 'a fresh hive, delivered. It will happen again.',
        coins: -120, act: { grantBeehive: true }, flag: 'bees_rebought', revisit: 14 },
    ],
    teaches: 'some problems have a cause',
  }),

  S({
    id: 'deer_in_wheat', who: 'land', art: '/ui/story/deer-in-wheat.png',
    title: 'Deer in the wheat',
    body: (s) => [
      `Deer are in the crops — ${s.deerCount || 'several'} of them, and no hurry about it.`,
      'They will strip a row a night if nothing stops them.',
    ],
    when: (s) => s.plantedPlots >= 6 && s.deerNear,
    once: false, cooldown: 1000 * 60 * 60 * 36,
    choices: [
      { label: 'Hunt', hint: 'meat now — and they avoid your land for a while',
        act: { huntDeer: true }, modifier: { key: 'predatorOdds', value: 0.6, days: 12 } },
      { label: 'Fence the field', hint: '20 wood — nothing gets at the crops again',
        needs: { wood: 20 }, goods: { wood: -20 }, flag: 'deer_fenced',
        modifier: { key: 'predatorOdds', value: 0.25, days: 9999 } },
      { label: 'Plant them a strip', hint: 'give up a plot — they stay, and they leave the rest alone',
        act: { deerStrip: true }, flag: 'deer_strip',
        modifier: { key: 'predatorOdds', value: 0.5, days: 9999 } },
    ],
    teaches: 'three systems solve the same problem differently',
  }),

  // ===========================================================
  // VII. THE GAME TEACHING ITSELF
  // ===========================================================
  S({
    id: 'never_fished', who: 'sedge', art: '/ui/story/never-fished.png',
    title: 'A very expensive jetty',
    body: ["You've a dock and no rod. That's a jetty, then."],
    when: (s) => s.days >= 5 && s.stat('fish') === 0,
    choices: [
      { label: 'Take the loaner', hint: 'one cast, on him', act: { openTool: 'fish' }, rep: { sedge: 1 } },
      { label: "I'll buy one properly", hint: 'open the tool list', act: { openTool: 'picker' } },
    ],
  }),

  S({
    id: 'overflowing_barn', who: 'mira', art: '/ui/story/overflowing-barn.png',
    title: 'That is a full barn creaking',
    body: ["You're losing food. I can hear it from here."],
    when: (s) => s.storageFullEvents >= 3,
    choices: [
      { label: 'Sell the surplus', hint: 'everything above 80% goes to market now', act: { sellSurplus: true } },
      { label: 'Tell me about the co-op', hint: 'shared granary — more room, a small cut of sales',
        unlock: 'story_coop', modifier: { key: 'storageBonus', value: 250, days: 9999 } },
      { label: 'Show me the storage shelf', hint: '', act: { openPanel: 'sto' } },
    ],
    teaches: 'the storage cap, at the moment it is costing money',
  }),

  S({
    id: 'wet_season', who: 'bram', art: '/ui/story/wet-season.png',
    title: 'Grain in an open shed',
    body: ['In November that is just an expensive way to feed rats.'],
    when: (s) => s.season === 'fall' && s.storageFrac > 0.5 && s.coveredStorage === 0,
    choices: [
      { label: 'Build now', hint: 'open Storage', act: { openPanel: 'sto' } },
      { label: 'Risk it', hint: 'a little spoils on every wet day — until you build',
        modifier: { key: 'spoilRate', value: 1, days: 20 }, revisit: 4 },
    ],
    teaches: 'why the storage tiers differ',
  }),

  S({
    id: 'nothing_running', who: 'mira', art: '/ui/story/nothing-running.png',
    title: "You're selling carrots",
    body: [
      'You could be selling carrot *soup*.',
      "I'm not going to say it twice. I am, obviously.",
    ],
    when: (s) => s.processorCount >= 3 && s.idleJobDays >= 2,
    choices: [
      { label: 'Show me', hint: 'queue the best recipe you can make right now', act: { queueBestRecipe: true } },
      { label: 'I know what I am doing', hint: 'she will mention it again', revisit: 4 },
    ],
    teaches: 'the entire crafting economy, which is easy to never notice',
  }),

  S({
    id: 'dark_farm', who: 'land', art: '/ui/story/dark-farm.png',
    title: 'Third night with the lamps down',
    body: ["The machines haven't turned since Tuesday."],
    when: (s) => s.powerDeficitNights >= 3,
    choices: [
      { label: 'The cheap fix', hint: 'a generator now, at twice the price',
        unlock: 'enr_generator', coins: -480, act: { placeGenerator: true } },
      { label: 'Do it properly', hint: 'open Energy', act: { openPanel: 'mac' } },
    ],
    teaches: 'the power system, which otherwise only dims the lamps',
  }),

  // ===========================================================
  // VIII. EVENTS WITH A CLOCK
  // ===========================================================
  S({
    id: 'harvest_festival', who: 'valley', art: '/ui/story/harvest-festival.png',
    title: 'Harvest festival',
    body: [
      'Judging is Sunday. One entry each.',
      'Bram has won four years running and would like everyone to know it.',
    ],
    when: (s) => s.season === 'fall' && s.seasonPhase > 0.75,
    once: false, cooldown: 1000 * 60 * 60 * 24 * 10,
    choices: [
      { label: 'Enter your best crop', hint: 'bring 5 of your finest to the judging',
        pledge: { id: 'festival_crop', text: 'Take 5 watermelons to the judging', days: 4,
          need: { watermelon: 5 }, reward: { coins: 400, rep: { bram: 1, mira: 1, sedge: 1 } } } },
      { label: 'Enter a dish', hint: 'a cooked entry scores higher — if you can make one',
        pledge: { id: 'festival_dish', text: 'Take 3 cakes to the judging', days: 4,
          need: { cake: 3 }, reward: { coins: 750, rep: { bram: 2, mira: 2, sedge: 1 } } } },
      { label: 'Just go and eat', hint: 'no risk, and everyone is pleased to see you',
        rep: { mira: 1, bram: 1, sedge: 1 } },
    ],
  }),

  S({
    id: 'midwinter', who: 'valley', art: '/ui/story/midwinter.png',
    title: 'Midwinter lamps',
    body: [
      "Everyone lights what they've got.",
      'You can see the whole valley from up here on a clear one.',
    ],
    when: (s) => s.season === 'winter' && s.seasonPhase > 0.45 && s.seasonPhase < 0.6,
    once: false, cooldown: 1000 * 60 * 60 * 24 * 20,
    choices: [
      { label: 'Light the farm', hint: 'it costs the night’s power',
        act: { lightFarm: true }, modifier: { key: 'prestige', value: 10, days: 9999 } },
      { label: 'Sit it out', hint: 'the valley lights up anyway' },
    ],
  }),

  S({
    id: 'wheat_glut', who: 'sedge', art: '/ui/story/wheat-glut.png',
    title: 'Everyone planted wheat',
    body: [
      '*Everyone.* You could roof a house with it.',
      "Prices are on the floor and I'm not the one who did it.",
    ],
    when: (s) => s.has('wheat', 10),
    once: false, cooldown: 1000 * 60 * 60 * 24 * 14,
    choices: [
      { label: 'Sell anyway', hint: 'wheat at 40% — take what you can get',
        act: { sellGood: 'wheat' }, modifier: { key: 'sellBonus:wheat', value: 0.4, days: 10 } },
      { label: 'Hold it', hint: 'prices recover — if you have the room',
        modifier: { key: 'sellBonus:wheat', value: 0.4, days: 10 } },
      { label: 'Mill it', hint: 'flour is untouched by this', act: { queueRecipe: 'flour' } },
    ],
    teaches: 'processing is price insurance, which is the real reason it exists',
  }),

  // ===========================================================
  // IX. QUIET ONES
  // ===========================================================
  S({
    id: 'first_spring', moment: true, who: 'land', art: '/ui/story/first-spring.png',
    title: 'First morning of spring',
    body: [
      "Something's different in the light.",
      "It's not warm yet. It's just not winter.",
    ],
    when: (s) => s.season === 'spring' && s.seasonPhase < 0.08,
    once: false, cooldown: 1000 * 60 * 60 * 24 * 30,
    choices: [
      { label: 'Stand there a minute', hint: '' },
    ],
  }),

  S({
    id: 'old_letter', who: 'land', art: '/ui/story/old-letter.png',
    title: 'A letter for someone else',
    body: [
      'Addressed to whoever farmed here before you.',
      'The postmark is eleven years old.',
    ],
    when: (s) => s.days >= 3,
    choices: [
      { label: 'Open it', hint: '', act: { readLetter: true }, flag: 'letter_read' },
      { label: 'Leave it in the drawer', hint: 'it turns up again', flag: 'letter_kept', revisit: 8 },
    ],
  }),

  S({
    id: 'letter_answered', who: 'bram', art: '/ui/story/letter-answered.png',
    title: 'About that old letter',
    body: [
      'You show Bram the letter you found. He barely glances at it.',
      '"Ah. Her. She had this place four owners back. Good with pears. Terrible with money."',
    ],
    when: (s) => s.flag('letter_kept') && s.days >= 12,
    choices: [
      { label: 'What happened to her?', hint: '', rep: { bram: 1 }, act: { readLetter: true } },
    ],
  }),

  S({
    id: 'one_that_got_away', who: 'land', art: '/ui/story/got-away.png',
    title: 'That was a big one',
    body: [
      'Third bite you have missed. Whatever is down there is not in a hurry.',
      'You could keep casting, or pack the rod away.',
    ],
    when: (s) => s.missedBites >= 3,
    once: false, cooldown: 1000 * 60 * 60 * 8,
    choices: [
      { label: 'Try again', hint: 'better odds on the next cast',
        modifier: { key: 'fishLuck', value: 1.5, days: 1 } },
      { label: 'Call it a day', hint: '', act: { openTool: 'picker' } },
    ],
  }),

  S({
    id: 'junk_haul', who: 'sedge', art: '/ui/story/junk-haul.png',
    title: 'Boot, boot, and a kettle',
    body: [
      'You want me to take those off your hands?',
      '...no reason.',
    ],
    when: (s) => s.junkRun >= 3,
    choices: [
      { label: 'Sell him the junk', hint: 'more than it is worth, somehow',
        act: { sellJunk: true }, coins: 60, rep: { sedge: 1 } },
      { label: 'Keep the kettle', hint: 'it will matter later', unlock: 'story_kettle', flag: 'kept_kettle' },
    ],
  }),

  // ===========================================================
  // X. LATE ADDITIONS — the valley reacting to how you play
  // ===========================================================
  S({
    id: 'the_kettle_matters', who: 'sedge', art: '/ui/story/kettle-matters.png',
    title: 'About that kettle',
    body: [
      "Funny thing. There's a collector asking after exactly that pattern.",
      'I told him I had no idea where one might be. Obviously.',
    ],
    when: (s) => s.flag('kept_kettle') && s.days >= 20,
    choices: [
      { label: 'Sell it', hint: 'a genuinely absurd amount of coin', coins: 900, rep: { sedge: 1 } },
      { label: 'Keep the kettle', hint: 'you like the kettle', rep: { sedge: -1 }, flag: 'kettle_forever' },
    ],
  }),

  S({
    id: 'too_many_buildings', who: 'bram', art: '/ui/story/too-many-buildings.png',
    title: 'You have built a town',
    body: [
      "Used to be able to see the far fence from here.",
      "Not saying it's wrong. Saying I noticed.",
    ],
    when: (s) => s.placedCount >= 60,
    choices: [
      { label: 'It is a working farm', hint: 'he shrugs', rep: { bram: 0 } },
      { label: 'Open a view back up', hint: 'sell three structures back at half', act: { openPanel: 'sto' } },
    ],
  }),

  S({
    id: 'visitor_left_something', who: 'valley', art: '/ui/story/visitor.png',
    title: 'Someone came by while you were out',
    body: [
      'Gate latched behind them, which is more than most manage.',
      "There's something on the step.",
    ],
    when: (s) => s.stat('posts') >= 1 || s.days >= 8,
    once: false, cooldown: 1000 * 60 * 60 * 24 * 6,
    choices: [
      { label: 'Open it', hint: '', act: { visitorGift: true } },
    ],
  }),

  S({
    id: 'counterfeit', who: 'sedge', art: '/ui/story/counterfeit.png',
    title: 'Check your coin',
    body: [
      'There are underweight coins going round the valley — forgeries, and good ones. They ring wrong if you listen.',
      "I'd not take a big payment off a stranger this week.",
    ],
    when: (s) => s.coins >= 2000,
    once: false, cooldown: 1000 * 60 * 60 * 24 * 21,
    choices: [
      { label: 'Weigh every coin', hint: 'slow going — you lose a little, and catch the rest', coins: -100 },
      { label: 'Risk it', hint: 'most of it will be fine', act: { counterfeit: true } },
    ],
  }),

  S({
    id: 'exclusive_contract', who: 'valley', art: '/ui/story/contract.png',
    title: 'An exclusive offer',
    body: [
      'A buyer in town wants everything you grow. All of it. One price, agreed now.',
      'You would not sell to anyone else.',
    ],
    when: (s) => s.stat('sold') >= 200,
    choices: [
      { label: 'Sign', hint: 'every sale at +25% for a month — and no order board',
        modifier: { key: 'sellBonusAll', value: 1.25, days: 30 }, flag: 'contract_signed',
        pledge: { id: 'contract', text: 'Supply the town buyer — 40 goods over the month', days: 30,
          need: { wheat: 40 }, reward: { coins: 900 } } },
      { label: 'Stay independent', hint: 'the board stays open, and Mira is relieved',
        rep: { mira: 1 } },
    ],
    teaches: 'that the order board is worth something',
  }),
];

export const STORY_BY_ID = Object.fromEntries(STORIES.map((c) => [c.id, c]));
