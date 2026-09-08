import {creatureById} from '../../data/creature-catalog.js';
import {createHuman} from './humans.js';
import {createGoblin} from './goblins.js';
import {createQuadruped} from './quadrupeds.js';
import {createCrawler} from './crawlers.js';
import {createBird} from './birds.js';
import {createSmall} from './small.js';
import {createWisp} from './wisp.js';
import {isChibiCreature} from '../../data/chibi-creatures.js';
import {createChibiHuman} from './chibi-humans.js';
import {isChibiMonster} from '../../data/chibi-monsters.js';
import {createChibiMonster} from './chibi-monsters.js';

/** Build a grounded Y-up creature with exportable, deterministic animation clips. */
export function createCreatureModel(id,options={}){
 const entry=creatureById.get(id);if(!entry)throw new Error(`Unknown creature: ${id}`);
 if(options===null||typeof options!=='object'||Array.isArray(options))throw new Error('Creature options must be an object');
 if(entry.id==='deer'&&options.antlers!==undefined&&!['stag','doe'].includes(options.antlers))throw new Error(`Unknown antler variant: ${options.antlers}`);
 if(entry.id==='skeleton'&&options.armor!==undefined&&!['bare','warrior'].includes(options.armor))throw new Error(`Unknown skeleton armor: ${options.armor}`);
 const build={human:createHuman,skeleton:createHuman,goblin:createGoblin,canine:createQuadruped,boar:createQuadruped,rat:createQuadruped,deer:createQuadruped,spider:createCrawler,grub:createCrawler,bird:createBird,small:createSmall,wisp:createWisp}[entry.rig];
 const actor=isChibiMonster(id)?createChibiMonster(entry,options):isChibiCreature(id)?createChibiHuman(entry,options):build(entry,options);actor.group.userData.variant={...actor.variants};return actor;
}
