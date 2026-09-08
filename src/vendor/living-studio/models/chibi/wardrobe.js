import {buildHeadwear} from './headwear.js';
import {outfitParts, sideParts, buildBoots, buildTrousers, buildCuffs, buildBelt} from './outfit-parts.js';

const WIZARDS = new Set(['wizard', 'mage', 'sorcerer']);
const SLOTS = ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back'];

function tint(hex, amount) {
  if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
  const channels = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * amount));
  return `#${channels.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
}

function palette(kind, colors) {
  const wizard = WIZARDS.has(kind);
  const cloth = colors.cloth || (wizard ? '#435582' : kind === 'ranger' ? '#626847' : '#494641');
  const leather = colors.leather || '#625043';
  return {cloth, clothDark: tint(cloth, .77), leather, leatherDark: tint(leather, .69),
    trim: colors.trim || '#bfa274', metal: colors.metal || '#777a7a', metalEdge: colors.metalEdge || '#a4a29a',
    dark: colors.dark || (wizard ? '#303443' : '#34332f'), hood: colors.hood || '#44413e',
    scarf: kind === 'ranger' ? tint(cloth, .88) : colors.scarf || '#864a47'};
}

export function chibiMaterialRole(itemId) {
  if (/^(plate|chain|ring|scale)_/.test(itemId) || /helmet|cuirass/.test(itemId)) return 'metal';
  if (/^cloth_|robe|cape/.test(itemId)) return 'cloth';
  return 'leather';
}

/**
 * Build slot-owned chibi clothing in the same native space as the anatomy.
 * No object transforms are used: bindCharacter bakes each root mesh independently.
 * Missing/none slots remain empty; the caller supplies its selected equipment defaults.
 */
export function buildChibiWardrobe(h, {kind, slots = {}, bodyType = 'male', equipmentMaterials = {}, colors = {}}) {
  const before = new Set(h.root.children), wizard = WIZARDS.has(kind), c = palette(kind, colors);
  for (const slot of SLOTS) {
    const itemId = slots[slot];
    if (!itemId || itemId === 'none') continue;
    const role = chibiMaterialRole(itemId), slotColors = {...c};
    const grade = equipmentMaterials[slot]?.leather;
    if (role === 'leather' && grade === 'thickHide') slotColors.leather = tint(c.leather, .86);
    if (role === 'leather' && grade === 'scaledHide') slotColors.leather = tint(c.leather, 1.10);
    const p = outfitParts(h, {slot, itemId, role});
    const context = {kind, wizard, role, colors: slotColors};
    if (slot === 'head') buildHeadwear(p, context);
    if (slot === 'chest') buildChest(p, context);
    if (slot === 'legs') buildTrousers(p, slotColors, role);
    if (slot === 'feet') buildBoots(p, slotColors, role);
    if (slot === 'hands' || slot === 'wrists') buildCuffs(p, slotColors, role, slot);
    if (slot === 'waist') buildBelt(p, slotColors, role, wizard);
    if (slot === 'back') buildBack(p, context);
  }
  const meshes = h.root.children.filter(mesh => !before.has(mesh));
  // Body morphing belongs to the caller and is applied once to both clothing and anatomy.
  for (const mesh of meshes) mesh.userData.chibiBodyType = bodyType;
  return meshes;
}

function buildChest(p, {kind, wizard, role, colors: c}) {
  const robe = wizard && role === 'cloth', plated = role === 'metal';
  const ranger = kind === 'ranger' && role !== 'metal';
  const fabric = role === 'cloth' || ranger ? c.cloth : role === 'leather' ? c.leatherDark : c.dark;
  let tunic;
  p.with('chest', role === 'metal' ? 'cloth' : role, () => {
    tunic = p.shell('Chibi fitted tunic', [[0, .015, 2.73, .76, .46], [0, .005, 3.45, .725, .445],
      [0, .01, 4.35, .95, .51], [0, .015, 4.68, 1.015, .51], [0, .015, 4.95, .61, .415]],
      fabric, {sides: 10, thickness: .075});
  });
  for (const [s, side] of sideParts) p.with('arm', role === 'metal' ? 'cloth' : role, () => {
    const sleeve = robe || ranger ? c.cloth : c.dark;
    p.tube(`Chibi ${robe ? 'robe' : 'short'} sleeve ${side}`, [[s * .76, .005, 4.88], [s * .98, 0, 4.54], [s * 1.13, -.005, 4.23],
      [s * (robe ? 1.38 : 1.23), -.018, robe ? 3.72 : 4.03]], [[.42, .42], [.405, .405], [.36, .375],
      [robe ? .395 : .32, robe ? .395 : .33]], sleeve, {sides: 8, variation: .018});
    if (robe) p.with(`upperArm${side}`, 'trim', () => p.tube(`Chibi robe cuff facing ${side}`,
      [[s * 1.348, -.018, 3.81], [s * 1.40, -.022, 3.65]], [[.408, .408], [.408, .408]],
      c.trim, {sides: 8, variation: .012}));
  });
  if (plated) buildBreastplate(p, c, tunic);
  else if (robe) buildRobeFront(p, c, tunic);
  else buildLeatherFront(p, c, kind, tunic);
  if (ranger) buildRangerShoulders(p, c);
  buildCollar(p, c, robe, plated);
  if (robe) p.with('skirt', 'cloth', () => {
    const coat = p.skirt('Chibi split wizard coat',
      {material: c.cloth, trim: c.trim, top: 2.98, bottom: 1.01, width: .78, flare: 1.29, gap: .19, hem: .15});
    buildWizardDiamonds(p, c, coat);
  });
  else buildTassets(p, c, plated, role, ranger);
}

function buildWizardDiamonds(p, c, coat) {
  p.with('skirt', 'trim', () => {
    for (const [s, side] of sideParts) {
      const x = s * .79, z = 1.48;
      const front = p.mountedStrip(`Chibi wizard front hem diamond ${side}`,
        [[x, 0, z + .19], [x + .12, 0, z], [x, 0, z - .19], [x - .12, 0, z], [x, 0, z + .19]],
        .052, c.trim, coat, .014);
      front.userData.armorSide = side;
      const rear = p.mountedStrip(`Chibi wizard back diamond ${side}`,
        [[0, 0, 2.20], [s * .29, 0, 1.77], [0, 0, 1.34]], .075, c.trim, coat, .014, 1);
      rear.userData.armorSide = side;
    }
  });
}

function buildRobeFront(p, c, tunic) {
  const supports = [tunic];
  p.with('chest', 'trim', () => {
    for (const s of [-1, 1]) {
      supports.push(p.mountedStrip(`Chibi robe front facing ${s}`, [[s * .43, 0, 4.78], [s * .30, 0, 4.37], [s * .13, 0, 3.16]],
        .10, c.trim, [tunic], .037));
      p.panel(`Chibi robe collar point ${s}`, [[s * .70, -.38, 4.83], [s * .31, -.56, 4.60],
        [s * .40, -.57, 4.28]], .065, c.trim);
    }
  });
  p.with('chest', 'leather', () => p.mountedStrip('Chibi wizard diagonal book strap', [[-.65, 0, 4.68], [-.23, 0, 4.24],
    [.59, 0, 3.18]], .23, c.leather, supports, .060));
}

function buildLeatherFront(p, c, kind, tunic) {
  const supports = [tunic];
  p.with('chest', 'leather', () => {
    supports.push(p.mountedStrip('Chibi diagonal chest strap', [[-.65, 0, 4.68], [-.32, 0, 4.32], [.59, 0, 3.18]],
      .26, c.leather, [tunic], .060));
    if (kind === 'rogue' || kind === 'ranger') supports.push(p.mountedStrip('Chibi crossing chest strap', [[.65, 0, 4.68], [.28, 0, 4.18], [-.60, 0, 3.20]],
      .23, c.leather, supports, .048));
    if (kind === 'ranger') p.with('chest', 'trim', () => {
      for (const [x, z] of [[-.43, 4.48], [.41, 4.31], [-.34, 3.69]]) {
        const y = -.58;
        p.mountedStrip(`Chibi ranger strap buckle upper ${x}`, [[x - .115, y, z + .085], [x + .04, y, z + .19]], .045, c.trim, supports, .035);
        p.mountedStrip(`Chibi ranger strap buckle lower ${x}`, [[x - .04, y, z - .19], [x + .115, y, z - .085]], .045, c.trim, supports, .035);
        p.mountedStrip(`Chibi ranger strap buckle left ${x}`, [[x - .115, y, z + .085], [x - .04, y, z - .19]], .045, c.trim, supports, .035);
        p.mountedStrip(`Chibi ranger strap buckle right ${x}`, [[x + .04, y, z + .19], [x + .115, y, z - .085]], .045, c.trim, supports, .035);
      }
    });
  });
}

function buildRangerShoulders(p, c) {
  for (const [s, side] of sideParts) p.with(`upperArm${side}`, 'leather', () => {
    // Three overlapping lamellae sit directly on the upper sleeve.
    for (let i = 0; i < 3; i++) {
      const x = s * (.89 + i * .145), z = 4.95 - i * .225;
      p.tube(`Chibi ranger shoulder lamella ${side} ${i}`, [[x - s * .11, .005, z], [x + s * .10, -.006, z - .29]],
        [[.47 - i * .020, .475 - i * .022], [.45 - i * .015, .455 - i * .018]], c.leather, {sides: 6, variation: .012});
    }
  });
}

function buildBreastplate(p, c, tunic) {
  const supports = [tunic];
  p.with('chest', 'metal', () => {
    supports.push(p.shell('Chibi steel cuirass', [[0, .01, 3.22, .79, .475], [0, .01, 3.95, .88, .525],
      [0, .01, 4.49, 1.015, .545], [0, .02, 4.80, .73, .435]], c.metal, {sides: 8, thickness: .085}));
    supports.push(p.shell('Chibi cuirass collar rim', [[0, .02, 4.63, .89, .495], [0, .02, 4.80, .748, .451]],
      c.metalEdge, {sides: 8, thickness: .05}));
  });
  p.with('chest', 'leather', () => {
    supports.push(p.mountedStrip('Chibi cuirass diagonal baldric', [[-.65, 0, 4.65], [-.33, 0, 4.24], [.59, 0, 3.18]], .27, c.leather, supports, .058));
    p.mountedStrip('Chibi cuirass return strap', [[.65, 0, 4.65], [.32, 0, 4.20], [-.59, 0, 3.18]], .22, c.leatherDark, supports, .045);
  });
  for (const [s, side] of sideParts) p.with(`upperArm${side}`, 'metal', () => {
    p.tube(`Chibi broad pauldron crown ${side}`, [[s * .74, 0, 4.94], [s * .96, 0, 4.66], [s * 1.11, -.006, 4.43]],
      [[.45, .47], [.465, .48], [.43, .445]], c.metal, {sides: 6, variation: .008});
    p.tube(`Chibi broad pauldron lower plate ${side}`, [[s * 1.08, -.004, 4.54], [s * 1.25, -.012, 4.18]],
      [[.445, .455], [.405, .415]], c.metalEdge, {sides: 6, variation: .008});
  });
}

function buildCollar(p, c, robe, plated) {
  p.with('chest', 'cloth', () => {
    if (robe) p.shell('Chibi robe folded shoulder collar', [[0, .025, 4.70, .93, .54], [0, .01, 5.10, .57, .425]],
      c.clothDark, {sides: 8, thickness: .075});
    p.shell('Chibi neck scarf wrap', [[0, .02, 4.95, .62, .455], [0, .02, 5.26, .74, .55]],
      c.scarf, {sides: 8, thickness: .09});
    if (!plated) p.panel('Chibi pointed neck scarf fold', [[-.70, -.367, 5.18], [0, -.59, 5.08], [.70, -.367, 5.18],
      [.41, -.53, 4.83], [0, -.64, 4.69], [-.41, -.53, 4.83]], .08, c.scarf);
  });
}

function buildTassets(p, c, plated, role, ranger) {
  p.with('skirt', plated ? 'metal' : role, () => {
    for (const s of [-1, 1]) {
      p.panel(`Chibi split hip tasset ${s}`, [[s * .11, -.50, 3.10], [s * .68, -.35, 3.09], [s * 1.00, -.39, 2.17],
        [s * .59, -.54, 1.96], [s * .31, -.57, 2.38]], .105, plated ? c.metal : ranger ? c.cloth : c.leather);
      p.panel(`Chibi side tasset ${s}`, [[s * .65, -.15, 3.06], [s * .76, .31, 3.05], [s * 1.01, .35, 2.16],
        [s * 1.07, -.18, 2.10]], .08, plated ? c.metal : ranger ? c.clothDark : c.leatherDark);
      if (ranger) p.with('skirt', 'trim', () => p.strip(`Chibi ranger tunic hem ${s}`,
        [[s * .31, -.595, 2.38], [s * .59, -.56, 1.96], [s * 1.00, -.414, 2.17]], .09, c.trim, .04));
    }
    p.panel('Chibi back tunic tail', [[-.69, .42, 3.08], [.69, .42, 3.08], [.88, .51, 2.18], [0, .59, 2.06],
      [-.88, .51, 2.18]], .075, plated ? c.dark : c.leatherDark);
    if (plated) p.with('skirt', 'cloth', () => p.panel('Chibi burgundy tabard', [[-.36, -.53, 3.15], [.36, -.53, 3.15],
      [.40, -.63, 1.85], [0, -.69, 1.76], [-.40, -.63, 1.85]], .085, c.scarf));
  });
}

function buildBack(p, {kind, wizard, role, colors: c}) {
  if (kind === 'ranger') {
    p.with('chest', 'cloth', () => {
      p.panel('Chibi ranger shoulder cape', [[-.83, .36, 4.86], [0, .67, 4.95], [.83, .36, 4.86],
        [.98, .74, 3.18], [1.15, .97, 2.04], [.22, 1.12, 1.57], [-.37, 1.08, 1.94], [-1.16, .90, 2.15]], .09, c.cloth);
      p.with('chest', 'trim', () => {
        p.strip('Chibi ranger cape pointed gold hem', [[-1.16, 1.00, 2.15], [-.37, 1.18, 1.94], [.22, 1.22, 1.57],
          [1.15, 1.07, 2.04]], .12, c.trim, -.04);
        p.strip('Chibi ranger cape stem emblem', [[.22, 1.227, 1.66], [.10, 1.12, 2.73]], .06, c.trim, -.03);
        p.strip('Chibi ranger cape left leaf emblem', [[.14, 1.17, 2.28], [-.14, 1.15, 2.53]], .06, c.trim, -.03);
        p.strip('Chibi ranger cape right leaf emblem', [[.13, 1.15, 2.37], [.34, 1.13, 2.67]], .06, c.trim, -.03);
      });
    });
    if (kind === 'ranger') buildQuiver(p, c);
  } else {
    if (kind === 'warrior') p.with('chest', 'metal', () => p.panel('Chibi warrior plain backplate',
      [[-.65, .49, 4.72], [.65, .49, 4.72], [.83, .49, 4.22], [.63, .49, 3.30], [-.63, .49, 3.30],
        [-.83, .49, 4.22]], .07, c.metal));
    p.with('chest', 'cloth', () => {
      p.loft('Chibi scarf back knot', [[.20, .48, 4.76, .27, .18], [.20, .49, 5.17, .29, .18]],
        c.scarf, {n: 6, variation: .018});
      p.panel('Chibi trailing scarf', [[-.04, .58, 5.12], [.47, .55, 5.08], [.55, .67, 4.16], [.86, .79, 2.49],
        [.44, .82, 2.76], [.19, .73, 3.29]], .08, c.scarf);
      p.panel('Chibi shorter scarf end', [[-.03, .61, 5.08], [.31, .62, 5.01], [-.11, .72, 3.71], [-.49, .80, 3.18],
        [-.33, .79, 3.94]], .07, c.scarf);
    });
  }
}

function buildQuiver(p, c) {
  p.with('chest', 'leather', () => {
    p.tube('Chibi ranger quiver', [[.30, .74, 2.80], [.68, .80, 3.65], [1.02, .83, 4.49]],
      [.22, .255, .285], c.leather, {sides: 8, variation: .018});
    p.tube('Chibi quiver mouth binding', [[.974, .826, 4.36], [1.065, .838, 4.58]], [.307, .307], c.leatherDark,
      {sides: 8, variation: .012});
    p.tube('Chibi quiver base binding', [[.30, .74, 2.78], [.38, .755, 2.98]], [.242, .251], c.leatherDark,
      {sides: 8, variation: .012});
    p.strip('Chibi quiver shoulder support', [[-.60, .39, 4.79], [0, .765, 4.10], [.67, .71, 3.30]], .23, c.leather, .075);
  });
  p.with('chest', 'trim', () => {
    for (let i = 0; i < 3; i++) {
      const x = .94 + i * .14, y = .77 + i % 2 * .10, top = 5.47 + (i === 1 ? .12 : 0);
      p.tube(`Chibi quiver arrow shaft ${i}`, [[x - .25, y, 3.95], [x + .38, y + .05, top]], .028,
        '#9c8664', {sides: 5, variation: 0});
      p.panel(`Chibi quiver arrow feather ${i}`, [[x + .29, y - .015, top - .28], [x + .32, y - .015, top],
        [x + .47, y - .015, top + .045], [x + .46, y - .015, top - .16]], .035, '#bdb399');
    }
  });
}
