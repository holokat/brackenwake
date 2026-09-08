import {cellar_raid} from './cellar_raid.js';
// The systems, in the order the frame runs them.
//
// This list is the whole of what the game is made of. Adding a feature is
// writing one file next to these and putting it in this list; nothing else in
// the boot has to be edited. `deps` decides what is built before what, which is
// not the same question as what runs before what: see src/game/app/system.js.

import { world } from './world.js';
import { player } from './player.js';
import { emotes } from './emotes.js';
import { combat } from './combat.js';
import { abilities } from './abilities.js';
import { inventory } from './inventory.js';
import { world_life } from './world_life.js';
import { events } from './events.js';
import { story } from './story.js';
import { ui } from './ui.js';
import { sound } from './sound.js';
import { context_menu } from './context_menu.js';
import { dev } from './dev.js';
import { input } from './input.js';
import { net } from './net.js';

/** The frame order of docs/mmo/07-RUNTIME-CONTRACT.md, by name. */
export const FRAME_ORDER = ['world', 'player', 'emotes', 'combat', 'abilities', 'inventory', 'world_life', 'events', 'story', 'ui', 'sound', 'net', 'cellar_raid', 'context_menu', 'dev', 'input'];

export const SYSTEMS = [world, player, emotes, combat, abilities, inventory, world_life, events, story, ui, sound, net, cellar_raid, context_menu, dev, input];

export { world, player, emotes, combat, abilities, inventory, world_life, events, story, ui, sound, net, cellar_raid, context_menu, dev, input };
