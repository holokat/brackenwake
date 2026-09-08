import {outfitParts, sideParts, buildBoots, buildTrousers, buildBelt} from './outfit-parts.js';
import {buildNpcAccessories} from './npc-accessories.js';

const NPCS = new Set(['blacksmith', 'provisioner', 'healer', 'weaponsmaster', 'innkeeper', 'alchemist',
  'tailor', 'banker', 'stablemaster', 'bowyer']);
const tint = (hex, factor) => /^#[\da-f]{6}$/i.test(hex) ? `#${[1, 3, 5].map(i =>
  Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor)).toString(16).padStart(2, '0')).join('')}` : hex;

function npcColors(kind, colors) {
  const leather = colors.leather || '#68503c', cloth = colors.cloth || '#655044';
  return {cloth, clothDark: tint(cloth, .84), leather, leatherDark: tint(leather, .66),
    trim: colors.trim || '#b8a078', metal: colors.metal || '#8c8b82', metalEdge: '#a6a297',
    shirt: colors.secondary || '#d1c5a5', shirtLight: tint(colors.secondary || '#d1c5a5', 1.065),
    accent: colors.scarf || colors.trim || '#779086',
    dark: kind === 'weaponsmaster' ? '#45483d' : kind === 'healer' ? '#636658' : '#56583f'};
}

/** Occupation variants share the existing neutral body, bindings, and wardrobe primitives. */
export function buildNpcWardrobe(h, {kind, slots = {}, bodyType = 'neutral', colors = {}}) {
  if (!NPCS.has(kind)) throw new RangeError(`Unknown NPC occupation: ${kind}`);
  const before = new Set(h.root.children), c = npcColors(kind, colors);
  const part = (slot, role = 'cloth') => outfitParts(h, {slot, itemId: slots[slot], role});
  if (slots.chest && slots.chest !== 'none') buildNpcChest(part('chest'), kind, c);
  if (slots.legs && slots.legs !== 'none') buildTrousers(part('legs'), c, 'cloth');
  if (slots.feet && slots.feet !== 'none') buildBoots(part('feet', 'leather'), c, 'leather');
  if (slots.waist && slots.waist !== 'none') {
    const p = part('waist', 'leather');
    buildBelt(p, c, 'leather', false);
    buildNpcAccessories(p, kind, c);
  }
  const meshes = h.root.children.filter(mesh => !before.has(mesh));
  for (const mesh of meshes) {
    mesh.userData.chibiNpc = kind;
    mesh.userData.chibiBodyType = bodyType;
    if (mesh.userData.armorBinding === 'chest') mesh.userData.fittedTorso = true;
  }
  return meshes;
}

function buildNpcChest(p, kind, c) {
  let shirt, vest;
  p.with('chest', 'cloth', () => {
    shirt = p.shell('NPC cream linen shirt', [[0, .015, 2.73, .74, .445], [0, .01, 3.55, .74, .45],
      [0, .01, 4.36, .93, .505], [0, .01, 4.68, .97, .505], [0, .01, 4.89, .64, .41],
      [0, .01, 5.04, .35, .30]], c.shirt, {sides: 12, thickness: .055});
    const positions = shirt.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i), x = positions.getX(i), y = positions.getY(i) - .01;
      if (y >= 0 || (Math.abs(z - 4.89) > .001 && Math.abs(z - 5.04) > .001)) continue;
      const front = (-y / Math.hypot(x, y)) ** 2;
      positions.setZ(i, z - front * (z > 5 ? .16 : .08));
    }
    positions.needsUpdate = true;
    shirt.geometry.computeVertexNormals();
  });
  for (const [s, side] of sideParts) p.with('arm', 'cloth', () => {
    const sleeve = p.tube(`NPC cream rolled sleeve ${side}`, [[s * .76, .005, 4.88], [s * .98, 0, 4.54],
      [s * 1.20, -.005, 4.12], [s * 1.35, -.015, 3.76]], [[.42, .42], [.39, .40], [.34, .35], [.32, .33]],
      c.shirt, {sides: 8, variation: .012});
    sleeve.userData.armorSide = side;
    const cuff = p.tube(`NPC turned linen cuff ${side}`, [[s * 1.325, -.01, 3.86], [s * 1.405, -.025, 3.62]],
      [[.375, .38], [.37, .375]], c.shirtLight, {sides: 8, variation: .008});
    cuff.userData.armorSide = side;
  });
  p.with('chest', kind === 'blacksmith' ? 'leather' : 'cloth', () => {
    vest = p.shell('NPC fitted V-neck vest', [[0, .015, 2.92, .75, .425], [0, .01, 3.60, .79, .49],
      [0, .01, 4.28, .97, .555], [0, .01, 4.90, 1.015, .565]], c.cloth, {sides: 12, thickness: .07});
    // The top ring follows a V neckline; the rest is one continuous, thick garment.
    const positions = vest.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) if (positions.getZ(i) > 4.89) {
      const x = positions.getX(i), y = positions.getY(i);
      if (y < -.2) positions.setZ(i, 4.46 + Math.min(1, Math.abs(x) / .48) * .43);
      else positions.setZ(i, 4.84 + Math.max(0, y) * .10);
    }
    positions.needsUpdate = true;
    vest.geometry.computeVertexNormals();
  });
  const supports = [shirt, vest];
  p.with('chest', 'leather', () => {
    for (let i = 0; i < 3; i++) {
      const z = 4.34 - i * .24;
      if (kind === 'banker') p.with('chest', 'trim', () => p.mountedStrip(`NPC banker brass button ${i}`,
        [[0, 0, z + .028], [0, 0, z - .028]], .065, c.trim, [vest], .024));
      else for (const s of [-1, 1]) p.mountedStrip(`NPC vest crossed lace ${i} ${s}`,
        [[-.12, 0, z + s * .068], [.12, 0, z - s * .068]], .043, c.trim, [vest], .022);
    }
  });
  const long = kind === 'healer';
  const apron = ['blacksmith', 'innkeeper', 'stablemaster'].includes(kind);
  p.with('skirt', 'cloth', () => p.skirt('NPC split vest tails', {top: 3.01, bottom: long ? 1.65 : 2.21,
    width: .78, flare: long ? 1.035 : .99, depth: .485, gap: apron ? .63 : .19, material: c.cloth,
    trim: long ? c.accent : undefined, hem: .085}));
  if (['healer', 'alchemist', 'weaponsmaster'].includes(kind)) p.with('chest', 'cloth', () => {
    for (const s of [-1, 1]) p.mountedStrip(`NPC ${kind} vest facing ${s}`,
      [[s * .49, 0, 4.77], [s * .24, 0, 4.32], [s * .22, 0, 3.17]], long ? .11 : .065,
      c.accent, supports, .023);
  });
  if (kind === 'weaponsmaster') {
    p.with('chest', 'cloth', () => {
      for (const s of [-1, 1]) p.mountedStrip(`NPC padded vest seam ${s}`,
        [[s * .58, 0, 4.39], [s * .47, 0, 3.82], [s * .43, 0, 3.21]], .05, c.clothDark, [vest], .023);
    });
    for (const [s, side] of sideParts) p.with(`upperArm${side}`, 'leather', () => p.tube(`NPC shoulder reinforcement ${side}`,
      [[s * .76, .005, 4.90], [s * 1.03, -.002, 4.49]], [[.45, .455], [.43, .435]],
      c.leather, {sides: 6, variation: .008}));
  }
  if (kind === 'blacksmith') buildApronBib(p, c, vest);
}

function buildApronBib(p, c, vest) {
  p.with('chest', 'leather', () => {
    for (const s of [-1, 1]) p.mountedStrip(`NPC blacksmith apron shoulder strap ${s}`,
      [[s * .54, 0, 4.75], [s * .41, 0, 4.27], [s * .33, 0, 3.91]], .13, c.leatherDark, [vest], .035);
    const bib = p.mountedStrip('NPC blacksmith leather apron bib', [[0, 0, 4.20], [0, 0, 3.11]],
      .82, c.leatherDark, [vest], .045);
    bib.userData.fittedTorso = true;
  });
}
