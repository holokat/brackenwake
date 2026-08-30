> **SUPERSEDED by `docs/hud-rework-v2.md`.**
> This document describes the 6-tab + sub-tab-strip HUD that v2 replaces.
> Kept for the art-kit guidance (generate a kit of 9-slice pieces, never baked
> screens), which still applies.

# Integrated HUD Spec — art-generation checklist

The goal: kill the sidebar, move everything into game-styled HUD surfaces, and generate
the art **once**. The key lesson from the current frame: a single baked image forced us
to pixel-measure every hotspot, locked the slot count to 13, and can't show
hover/active states. So —

## Rule #1: generate a KIT of pieces, not baked screens

Every panel is assembled in CSS from reusable pieces (9-slice borders + tiling fills +
standalone buttons). Layout changes then never require new art. All pieces:
transparent PNG, same rendering style/palette as the current frame, generated at 2–3×
display size. Square-ish pieces with generous margins slice cleanly.

## Full inventory — everything the HUD must house

### 1. Bottom action bar (exists, keep the concept)
- 6 top-tier tabs: Crops · Animals · Build · Craft · Style · Inventory
- 2nd-tier sub-tab strip (attaches ABOVE the bar; 2–6 chips; must never shift the bar)
- 3 tool cells (hand / watering can / fishing rod)
- item slots — flexible count (see kit: individual slot cell), page arrows as fallback
- lock toggle, collection-book button (both live ON the bar today)

### 2. Top-left: farmer plaque (replaces sidebar header)
- avatar ring + display name + farm tier name ("Medium Plot")
- prestige stars ⭐ and farmhouse level icon
- "visiting X's farm" state variant + a "go home" button when visiting
- click → opens the Farm Panel (see 6)

### 3. Top-right: resource strip
- coins plaque (the count-up number lives here; floats target it)
- engagement chips (likes/replies/reposts/zaps) — small, collapsible
- storage gauge (n/cap) once storage matters

### 4. Right rail: order tracker + daily
- 2–3 pinned order cards (customer avatar, wants, reward) — mini version of the
  market's order board so demand is visible without opening the market
- daily streak flame 🔥n + "chest ready" glow
- space reserved for future: quest log / festival banner

### 5. Left rail: social
- friends fly-out (avatar stack → expands to list, click = visit)
- visit-by-npub input (small, collapsed behind a 🔍 button)
- future: guestbook bell, notifications ("fiatjaf watered your crops")

### 6. Panels (all share one parchment/scroll panel style)
- **Farm Panel**: tier progress + upgrade button, homestead progression, theme
  switcher, harvest stats  ← the rest of today's sidebar
- **Market**: orders / buy / sell / merchant (exists, restyle with kit)
- **Collection Book**: exists (CSS book) — optional art upgrade: open-book spread bg
- **Settings**: music + sfx sliders, HUD lock, quality, sign out, reset, test mode
  (currently 3 floating corner buttons — fold into one ⚙ gear)
- **Welcome-back / daily chest** modal (exists, restyle)
- **Map picker** (first run, restyle)
- **Compose** ("post to nostr") — becomes a feather-quill button near the social rail

### 7. Ephemeral (no layout, just skins)
- tooltip popover (parchment scrap)
- toast card + "big moment" golden variant
- floating +N numbers (pure text, no art needed)

## Layout sketch

```
┌ farmer plaque ─┐                    ┌ coins ┊ engagement ┊ storage ┐
│ 🧑 name ⭐⭐ T2 │                    └───────────────────────────────┘
└────────────────┘                                  ┌ order card ────┐
│ friends                                           │ 🧑 wants 2🍅 16🪙│
│ rail    ┊🔍                                        └ order card ┊🔥3 ┘
│                        (3D world)                                  │
│  ✎ quill                                                   ⚙ gear  │
│                                                                    │
│           ┌──── sub-tab chips (only when needed) ────┐             │
│  ┌📔┬─────┴─ tabs: Crops Animals Build Craft Style ──┴────────┬🔒┐ │
│  └──┴ tools ┊ ‹ item slots (flex count) › ┊───────────────────┴──┘ │
```

## Art kit manifest (generate these, nothing else)

Chrome / structural
1. **Panel 9-slice** — wooden frame + parchment fill, ~600×600, corners ≥90px.
   One asset skins EVERY panel (market, farm, settings, modals) at any size.
2. **Panel header ribbon** — 9-slice horizontally, holds panel titles.
3. **Divider rule** — thin horizontal flourish, tileable.
4. **Bar end-caps + tileable bar middle** — OR keep the current hud-frame.png for the
   bottom bar only (it works; kit pieces extend it).

Buttons & cells (each in 3 states: normal / hover / active-pressed; +disabled where noted)
5. **Tab plate** — single tab, text area blank (we set text in CSS). States: active
   (lit/raised) + inactive. Individual plates = free positioning, any tab count.
6. **Sub-tab chip** — smaller plate, 9-slice horizontally so width fits any label.
7. **Item slot cell** — square, ~112px display. States: empty, selected-glow,
   locked (darkened inset). Individual cells = flexible slot count, no more 13-limit.
8. **Round icon button** — for lock, book, gear, quill, search, close ×, arrows ‹ ›.
   One blank round wooden button; glyphs overlaid in CSS.
9. **Small plaque** — 9-slice, for coins chip, engagement chips, farmer plaque bg.

Special
10. **Order card** — small pinned-note (paper + pin), 9-slice.
11. **Tooltip parchment scrap** — 9-slice, torn edges.
12. **Toast strip** — 9-slice; plus a golden-trim variant for big moments.
13. **Open-book spread** (optional) — for the Collection Book background.
14. **Avatar ring** — circular frame for profile pictures (plain + gold for owner).

## Sizing & delivery notes
- Deliver each piece on a transparent canvas with ~8% empty margin.
- Keep a consistent light direction (top-left, like the current frame).
- 9-slice pieces: corners must be self-similar so CSS `border-image` can stretch the
  edges — avoid unique ornaments mid-edge (center of a top edge is fine: we can slice
  around one centered ornament if it's exactly centered).
- States of the same button must be pixel-aligned to each other (same canvas, same
  position) so CSS swaps don't jump.
- Don't bake text into anything. Ever. (Labels, numbers, and names are all live data.)

## Deliberately excluded (don't generate art for these yet)
- Minimap — world is small; reserve the bottom-left corner but skip the art.
- Mobile layout — same kit reflows; no separate art needed.
- Seasons/festival banners, leaderboard frame — future; the panel 9-slice covers them.
