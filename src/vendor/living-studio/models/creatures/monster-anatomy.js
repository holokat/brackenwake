import {undeadAnatomies} from './undead-anatomy.js';
import {spectralAnatomies} from './spectral-anatomy.js';
import {goblinAnatomies} from './goblin-anatomy.js';

/** Each creature owns its rest anatomy. Only the animation joint names are shared. */
export const monsterAnatomies={...undeadAnatomies,...spectralAnatomies,...goblinAnatomies};
