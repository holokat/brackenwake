# Achievements in Brackenwake

Project: /Users/k/brackenwake. Local game: http://localhost:5198/?play.

Open the codex with C and choose the visible Achievements tab beside Map, or press J directly. Escape closes it. The panel includes category filters, exact progress, the island exploration checklist, earned titles and permanent perk descriptions.

Progress lives in the character save. Older saves start activity counters empty; legitimate existing skills can satisfy skill milestones. Starter inventory, purchases, failed crafts, full-pack refusals, developer actions and repeated reward claims do not count as new activity. Crafted-tool and outfit requirements use saved character ownership, not the item's displayed maker name. Permanent perks apply once and do not depend on the selected title.

The current game owns normal character activity locally. The room relay accepts known title IDs and displays them to nearby players; it does not independently validate locally saved achievements. Vharos defeat credit follows the server-confirmed raid reward and its existing replay protection.

## Port decisions

The original catalog and two PNG sheets were implemented in /Users/k/code/mmo, a different engine. This implementation uses Brackenwake's existing systems. The optional question about unsupported milestones received no answer during implementation, so the stated default was to use current gameplay milestones. All 40 art positions and catalog IDs stay stable.

Brackenwake caps a skill at 100, combines armour into outfits, adds 2 health per Constitution, and expresses craft quality as a multiplier capped at 1.30. The six permanent perks total +20 carrying capacity, +0.03 crafting quality, +1 Constitution, and +10 Wisdom with 10% higher skill-gain chance. Skills retain their individual and aggregate caps.

Unavailable original requirements were replaced: resin slimes with giant rats; yarrow with dandelions; fishing with skinning; tracking signs with Mark on different species; taming with summoning; leather pieces with an outfit; honeyed tonics with healing draughts; repairs with exceptional crafts; building a fire with the Camp ability; housing with dungeon exploration; stocked player chests with opening dungeon chests. The island checklist contains 15 authored destinations from the actual island spaces.

## Catalog

| # | Achievement | Requirement | Title | Permanent perk |
| --- | --- | --- | --- | --- |
| 1 | Finding your feet | Reach 50 in any skill. | The newcomer | None |
| 2 | A practiced hand | Reach 100 in any skill. | The adept | None |
| 3 | Several strings to your bow | Reach 50 in three different skills. | The versatile | None |
| 4 | Island experience | Earn 500 total skill points. | The seasoned | None |
| 5 | First blood | Defeat your first hostile creature. | The blooded | None |
| 6 | Trouble underfoot | Defeat 25 giant rats. | The rat catcher | None |
| 7 | Holding Haven | Defeat 100 hostile creatures. | The defender of Haven | +1 Constitution, giving 2 additional maximum health. |
| 8 | Close quarters | Defeat 25 hostile creatures with melee weapons. | The skirmisher | None |
| 9 | A steady hand | Defeat 25 hostile creatures with a bow. | The marksman | None |
| 10 | Stand firm | Successfully block 25 enemy attacks. | The stalwart | None |
| 11 | Without a scratch | Defeat a hostile creature from full health without taking damage during the fight. | The untouched | None |
| 12 | Trust your own steel | Defeat 10 hostile creatures using weapons you crafted. | The resourceful | None |
| 13 | Timber for tomorrow | Personally gather 100 wood. | The woodcutter | None |
| 14 | Beneath the surface | Personally gather 100 stone or ore. | The miner | None |
| 15 | A useful basket | Gather five different forage resources. | The forager | None |
| 16 | Knowing your herbs | Personally gather 50 dandelions. | The herbalist | None |
| 17 | What the wild leaves | Successfully skin 25 creatures. | The skinner | None |
| 18 | Tools of your own | Gather 25 wood with your crafted axe and 25 stone or ore with your crafted pickaxe. | The provider | +10 carrying capacity. |
| 19 | Know your quarry | Mark three different creature species. | The tracker | None |
| 20 | A little company | Successfully summon an ally. | The caller | None |
| 21 | Made by hand | Craft your first tool, weapon, or armor piece. | The maker | None |
| 22 | Learning the recipes | Complete 10 different crafting recipes. | The artisan | +0.02 quality on future crafts, up to the 1.30 quality cap. |
| 23 | Ready for work | Craft an axe and a pickaxe. | The toolmaker | None |
| 24 | Hammer and heat | Complete 25 blacksmithing crafts across at least three recipes. | The smith | None |
| 25 | String and feather | Craft a bow and 48 arrows. | The bowyer | None |
| 26 | Cut and stitched | Craft a leather outfit. | The leatherworker | None |
| 27 | Enough to share | Prepare 25 servings of food. | The camp cook | None |
| 28 | A measured mixture | Craft 10 healing draughts. | The alchemist | None |
| 29 | Care in the making | Craft 10 exceptional equipment items. | The craftsperson | +0.01 quality on future crafts, up to the 1.30 quality cap. |
| 30 | Dressed in your own work | Wear an outfit you personally crafted. | The outfitter | None |
| 31 | Something worth noticing | Discover your first point of interest. | The curious | None |
| 32 | Getting your bearings | Discover five different points of interest. | The wayfinder | None |
| 33 | Knowing Haven | Visit all 15 places on the island checklist. | The island explorer | None |
| 34 | The long way round | Walk through 500 different outdoor map cells (4 metres across). | The rambler | None |
| 35 | After sundown | Visit five different landmarks at night. | The night wanderer | None |
| 36 | A little warmth | Light a campfire with the Camp ability and become rested. | The camper | None |
| 37 | Below the island | Explore three different dungeon floors. | The delver | None |
| 38 | Putting something aside | Open 10 different dungeon chests. | The quartermaster | +10 carrying capacity. |
| 39 | A fair exchange | Complete your first trade with another player. | The trader | None |
| 40 | A place in Haven | Complete 25 other Haven achievements, including at least one from each category. | Of Haven | +10 Wisdom and 10% higher skill-gain chance. Skill caps still apply. |

## Verification

Run npm test and npm run build. Focused tests live in src/game/achievements and cover actual crafting, foraging, combat, multiplayer title relay, raid reward retries, save/open, ownership, caps and permanent perk effects. Window tests cover J, Escape and the new tab's measured space. The real-game browser harness is tools/qa/achievements.html; it uses temporary in-memory storage and never reads saved characters. It also casts Recall from inside the Old Cellars. Live Brave review confirmed all 40 entries and their artwork, the visible Achievements tab, exploration filtering, live progress, and an earned title retained when the panel reopened. The real three-second Recall cast left the Old Cellars and returned both the player and saved position to Haven at x 46, z 306. A separate no-watch Vite server on port 5199 prevented concurrent dungeon edits from interrupting the check. The one-run Recall harness disables its button to prevent a second test from re-entering the dungeon while Recall is on cooldown.

The focused achievement, title relay, Recall, window, state and gameplay checks passed, as did the production build. The full test run also encountered existing editor fixture and wayside timing failures, plus two dungeon-work failures that were subsequently corrected and checked within that task. This repository uses npm and has no check script.
