/** Authored in metres, with the doorway at (0, 0), facing local +Z. */
export const OLD_CELLARS_EXTERIOR = Object.freeze({
  id: 'old_cellars_entrance',
  footprint: [10, 7.5, 5],
  // x, z, width, depth, height, bottom. Keep the 2.8 m doorway open.
  walls: [
    [-1.8, -1.45, .8, 3.9, 2.7, 0], [1.8, -1.45, .8, 3.9, 2.7, 0],
    [0, -.1, 4.25, 1, 1.35, 2.8],
    [-3.55, -2.55, 2.7, 5.8, 2.7, 0], [3.55, -2.55, 2.7, 5.8, 2.7, 0],
    [0, -4.7, 8.5, 1.8, 2.6, 0],
  ],
});
