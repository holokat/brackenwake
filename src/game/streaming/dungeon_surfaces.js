import * as THREE from 'three';
import {stoneSheets} from '../../world/dungeon.js';
import {assetWork} from './work_queue.js';

/** Two shared stone families, prepared under the boot cover, before gameplay. */
export async function prepareDungeonSurfaces(renderer, {work = assetWork} = {}) {
  for (const family of ['blocks', 'flags']) {
    const sheets = await work.run(() => stoneSheets(THREE, family), {priority: 2});
    for (const texture of Object.values(sheets)) await work.run(() => renderer.initTexture(texture), {priority: 2});
  }
}
