import { SPACES } from '../../mmo/spaces/index.js';

// Named, walkable island destinations, excluding construction tiles and repeated woodland sections.
const IDS = ['town', 'quay', 'training', 'pond', 'tarn', 'mine', 'mine_east', 'cellars',
  'barrow', 'bandit_camp', 'downs', 'eastfield', 'hillfield', 'pasture', 'westfield'];
export const ISLAND_LANDMARKS = Object.freeze(IDS.map(id => {
  const space = SPACES[`island_${id}`];
  if (!space?.at) throw new Error(`Achievement landmark island_${id} is missing`);
  return Object.freeze({ id: space.id, name: space.name, x: space.at.x, z: space.at.z, radius: 40 });
}));
