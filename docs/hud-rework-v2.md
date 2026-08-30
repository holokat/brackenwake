# HUD Rework v2 — the layout we're building

Supersedes `docs/hud-spec.md` (that one describes the 6-tab + sub-tab-strip HUD we are
replacing). Art is being generated against this document; the rewire happens after.

## The principle

The old bar did two unrelated jobs at once — it was an **action bar** (things you touch
constantly while playing) *and* a **shop** (5 tabs, 8 sub-categories, paginated rows).
Those want different shapes, which is why the floating sub-tab strip never fitted the
frame art.

Three zones instead:

1. **Always there** — hand + one tool slot. The swap you make hundreds of times.
2. **What I own** — Stores.
3. **What I can buy** — panels, opened from labelled buttons.

---

## Layout

### Top-left — nameplate
- avatar ring, display name
- prestige star, friends, mute toggle
- **biome switcher lives here** (this is where the old Style tab goes). Players should
  be able to change biome freely and often; it just doesn't deserve action-bar space.
- visiting-someone-else's-farm state + "go home" still needed

### Top-centre — purse
`🪙 coins · 🪵 wood · 🪨 stone` — the three tracked resources, nothing else.
Everything with a *count* lives in Stores, not up here.

### Top-right — world state
`temperature · season · clock`

### Bottom-left — action slots
| slot | key | behaviour |
| --- | --- | --- |
| ✋ hand | `1` | **Permanent. Never changes.** Harvest, move, manage. |
| tool | `2` | Holds the last tool you loaded. Caret opens the picker. |

The point of the pair: the constant swap is two fixed, adjacent buttons — one click or
one keypress each. The picker is only for *changing which tool is loaded*, which is rare.

**Tool picker** (opens above the slot) holds every tool, including both bows:
watering can · fishing rod · axe · pickaxe · hunting bow · composite bow.
Locked tools show a coin price and are bought in one click — the same pattern as seeds.
This is what kills the current split where the axe sits in a strip and bows sit in
Inventory.

### Bottom-centre — crop bar
**10 fixed slots — one per crop. No pager.** The moment it paginates it stops being
"always there" and the argument for the width collapses.

It is a hotbar *and* the crop shop, which is why it earns the space:
- locked crop → shows its coin price
- owned crop → no price, click to arm planting

This already works in code: `showBadge` is `!isUnlocked` for non-recurring items.
Real prices climb `0, 0, 20, 40, 70, 100, 140, 200, 280, 380` — carrot and wheat are
free, so a new player sees 2 bare slots and 8 priced ones, and the bar visibly fills in
as they progress. That contrast is the progression cue; art should show the mixed state.

### Bottom-right — destinations
`Build · Animals · Stores · Missions`

Each opens a **panel** with categories on a vertical rail — not a floating strip. Room
for names and full costs.

| button | holds |
| --- | --- |
| **Build** | structures, water, fields, storage, machines, commerce, wild, paths, **workshops** |
| **Animals** | animals + husbandry (kept separate because "Build a cow" reads wrong) |
| **Stores** | every good with a count — merged Inventory + Pantry |
| **Missions** | mission book; badge = claimable count |

### Far bottom-right — note / publish
Deliberately outside the wooden frame language (paper + pencil) to signal "this is not a
game system". See open items — it currently carries more visual weight than Missions.

---

## What moves where

| today | goes to |
| --- | --- |
| Crops tab | the crop bar (it *is* the crop shop) |
| Craft tab | **deleted** — tools & bows → picker, workshops → Build |
| Style tab | nameplate biome switcher |
| Inventory tab | Stores |
| Pantry (🥫 corner button) | Stores |
| tool strip (hand/can/rod/axe/pick) | hand slot + tool slot + picker |
| bows (in Inventory) | tool picker |
| sub-tab strip | vertical rail inside each panel |

Nothing ends up homeless — that was the check.

**Real crafting is unaffected.** Recipes are triggered by clicking a processor building
in the world, never from a menu. The old "Craft" tab only ever held things to *buy*.

---

## Code touchpoints for the rewire

- `main.js` `GROUPS` (~1417) — the tab/sub-tab tree being replaced
- `main.js` `TOOLS` (~1444), `AXES` / `BOWS` (~1470) — merge into one picker list
- `main.js` `showBadge` (~1980) — the price-until-owned rule the crop bar relies on
- `main.js` `renderPantry` / `openPantry` — becomes the Stores panel
- helpers already in place and reusable: `canAfford`, `payFor`, `priceLabel`,
  `badgeLabel`, `materialsStatus` (the green/red have-vs-need tally)
- `catalog.js` `goodCategory` — **needs a `materials` bucket**; wood and stone currently
  fall through to `fresh`, so Stores files them under "perishable, eat before winter"

---

## Energy — decide before giving it HUD space

Energy is currently **orphaned**: a genuinely detailed simulation wired to a cosmetic
outcome.

What exists (`tickPower`, main.js ~1652):
- supply from 11 generator types — wind scales with local wind, solar with daylight,
  the rest flat
- demand from night lighting, every *running* machine (3 each), and winter heating that
  scales with animal count and is eased by windbreaks

What a shortfall actually does: **the night lamps dim.** That is the entire consequence
(`farm.js:3104`, `farm.js:3658`).

Two coherent options — pick one before spending HUD real estate:

**A. Give it teeth.** A deficit pauses or halves running processors. The demand side
already models running machines at 3 power each, so the simulation is done; this is a
rule, not a system. Power then becomes a real constraint, generators become meaningful
purchases, and it earns a persistent readout.

**B. Accept it as atmosphere.** Then it needs no permanent slot — only a warning chip
that appears while in deficit.

**Placement note if we keep it visible:** power is a *rate*, not a stock. Putting `⚡ +12`
beside `🪵 2,450` invites reading it as a stockpile. It belongs in the **top-right world
cluster** (temperature · season · clock) — it describes the state of the farm right now,
like weather — not in the purse.

Recommendation: **A**, chip in the top-right cluster.

---

## Open items

1. **Tool slot must show the loaded tool**, not a generic crossed-tools icon. The slot's
   whole job is to say what pressing `2` will do. (User is handling this in art.)
2. **Economy scaling.** Mock shows 2,450 wood / 1,320 stone; a Grand Barn costs 45 wood
   / 22 stone. Either raise building costs by roughly an order of magnitude or keep
   stockpiles far smaller. Numbers in the mock are placeholder, but the decision is real.
3. **Note/Publish weight** — largest element on the bar, most optional feature now that
   nostr feeds no progression. Consider matching the others' size.
4. **Biome switcher** — needs a home inside the nameplate.

## Parked

**Seasonal crop rotation** — showing only in-season crops would cap the bar forever and
give seasons real teeth. Parked because winter has nothing to grow: growth factor is
already `0.12` (crops crawl), so gating planting would punish the same season twice, and
making it playable needs a greenhouse — model, cost, mechanic, balance. Revisit if the
greenhouse gets built.

Worth recording: orders and missions are **not** coupled to specific crops. `makeOrder()`
draws from `obtainableGoods()` (a live pool) and missions count actions, not crop ids —
so seasonal planting would not require rewiring them. Only winter blocks it.

Related: resist growing the crop list much. Ten crops keeps the bar at ten slots forever,
and depth is cheaper to add through the 104 existing recipes than through new raw inputs.
