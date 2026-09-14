# Character rework verification

Reviewed on 2026-09-14 in the Brackenwake repository.

## Acceptance coverage

| Area | Evidence |
| --- | --- |
| Levels and talents | All four openings start at level 1; level 99 caps XP; rank, prerequisite and point gates apply in the UI and cast path; earned talents and action-bar bindings survive hydration. |
| Kill credit | Direct attacks, damage over time and owned friendly summons credit actual deaths once. Other players, released animals and excluded targets do not award XP. |
| Equipment | Twelve live slots, including two rings and two hands. Worn legacy outfits split into seven distinct pieces with preserved armor and weight, and only one copy of their affixes. Occupied migration slots preserve displaced items in the pack. |
| Corpse loot | Individual/all claims use real inventory capacity. Leftovers remain; stale, distant and repeated claims cannot duplicate rewards. Raid rewards reopen through the defeated boss or nearby interaction and retain claim checkpoints. |
| Blood and grass | Real combat resolution drove blood particles and ground splats in the isolated browser harness. Grass retains two instanced meshes and excludes roads/water/interiors. |
| Road generation | The existing cold-generation timing gate passed at a worst median of 1.58 ms against its 2 ms budget, compared with 2.69 ms before the redundant work was removed. Placement checks remained unchanged. |

The full run covered 209 test suites: 208 passed and one unchanged terrain timing check exceeded its 3 microsecond budget while the live 3D review was running. With that review paused, the terrain suite passed all 221 checks, measuring 2.898 microseconds per sample. No timing thresholds were changed. Focused checks for the final talent and equipment layout edits also passed.

The production Vite build, JavaScript syntax checks and Wrangler deployment dry run passed. No dependencies or production infrastructure configuration changed.

## Browser and visual review

The grass/blood contact sheet and original canvas captures are in `work/game-rework/`. The captured combat event used the real resolver, producing 11 droplets and 2 splats; no shader failures were reported. These checks are not a claim of consistent 60 FPS.

The isolated browser run verified the level-1 mage kit, learning Fireball at level 2, save hydration, all 12 equipment slots and corpse-held rewards with no floor bag. A real hostile kill awarded 43 XP. Taking its loot transferred one item and 23 gold; repeating the claim was refused. Unequipping the chest piece reduced armor from 3 to 0, and equipping it restored armor to 3. All equipment IDs survived saving and hydration. The game reported no shader errors.

Native Brave screenshots were reviewed as contact sheets and targeted originals. The skill trees were compacted to show more connected nodes, and the corpse panel was checked in the existing game theme. The equipment review caught old painted slot artwork showing through and rails crowding the statistics and inventory. Opaque rail backings and narrower measured bounds address those issues; geometry regression checks keep all twelve cells outside both side panels. The final screenshot after narrowing remains pending because macOS locked again. No actual player save was used by either harness.

Open `http://localhost:5210/tools/qa/progression.html?solo` in the existing Brave session for the final review. The page replaces browser storage with memory before it boots the game. The character page is `C`; Skill trees is `P`.
