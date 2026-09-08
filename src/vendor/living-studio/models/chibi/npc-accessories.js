import {buildNpcTradeAccessories} from './npc-trade-accessories.js';
import {buildNpcApron} from './npc-apron.js';

/** Small occupation tools are attached to the existing waist, never a second prop rig. */
export function buildNpcAccessories(p, kind, c) {
  p.with('hips', 'leather', () => {
    if (kind === 'blacksmith') buildSmithTools(p, c);
    if (kind === 'provisioner') buildBag(p, c, 'provisioner', c.leather, c.leatherDark);
    if (kind === 'healer') buildBag(p, c, 'healer', c.shirt, c.accent);
    if (kind === 'innkeeper') buildShortApron(p, c);
    if (kind === 'alchemist') buildBottles(p, c);
    buildNpcTradeAccessories(p, kind, c);
  });
}

function buildSmithTools(p, c) {
  buildNpcApron(p, {name: 'NPC blacksmith apron skirt', material: c.leatherDark, bottom: 1.88, width: .62});
  p.strip('NPC hammer belt hanger', [[.72, -.03, 3.14], [.94, -.03, 2.78]], .13, c.leather, .09);
  p.shell('NPC hammer loop', [[.94, -.025, 2.70, .135, .135], [.94, -.025, 2.84, .135, .135]],
    c.leather, {sides: 8, thickness: .035});
  p.with('hips', 'trim', () => {
    p.tube('NPC smith hammer handle', [[.94, -.025, 2.03], [.94, -.025, 2.97]], .076, '#7c6042', {sides: 6, variation: 0});
    p.with('hips', 'metal', () => p.cube('NPC smith hammer head', [.94, -.025, 3.00], [.43, .25, .255], c.metal, {bevel: .035}));
  });
}

function buildBag(p, c, kind, material, flapMaterial) {
  p.strip(`NPC ${kind} bag front hanger`, [[.68, -.21, 3.14], [.90, -.14, 2.94], [.93, -.10, 2.73]], .12, c.leather, .085);
  p.strip(`NPC ${kind} bag rear hanger`, [[.68, .23, 3.14], [.88, .29, 2.92], [.93, .29, 2.73]], .12, c.leather, .075);
  p.with('hips', kind === 'healer' ? 'cloth' : 'leather', () => {
    p.cube(`NPC ${kind} shoulder bag`, [.94, .09, 2.53], [.46, .45, .69], material, {bevel: .055});
    p.cube(`NPC ${kind} bag folded flap`, [.94, .065, 2.79], [.485, .50, .19], flapMaterial, {bevel: .028});
    p.with('hips', 'leather', () => p.cube(`NPC ${kind} bag fastening`, [.94, -.20, 2.64], [.085, .07, .29], c.leather, {bevel: .012}));
    p.with('hips', 'trim', () => p.cube(`NPC ${kind} bag stud`, [.94, -.245, 2.62], [.064, .027, .067], c.trim, {bevel: .009}));
  });
}

function buildShortApron(p, c) {
  buildNpcApron(p, {name: 'NPC innkeeper cream apron', material: c.shirt, bottom: 2.08,
    width: .57, role: 'cloth', pocketMaterial: c.shirtLight});
}

function buildBottles(p, c) {
  for (const [i, x, y] of [[0, .66, -.345], [1, .97, -.04]]) {
    p.strip(`NPC bottle leather hanger ${i}`, [[i === 1 ? .73 : x - .06, y + .015, 3.10], [x, y + .015, 2.77]], .095, c.leather, .095);
    p.with('hips', 'trim', () => {
      p.loft(`NPC alchemist bottle ${i}`, [[x, y, 2.37, .09, .09], [x, y, 2.42, .135, .125],
        [x, y, 2.69, .135, .125], [x, y, 2.77, .062, .062], [x, y, 2.90, .062, .062]],
        i === 0 ? c.accent : '#91849c', {n: 8, variation: .012});
      p.loft(`NPC bottle cork ${i}`, [[x, y, 2.88, .068, .068], [x, y, 2.98, .073, .073]],
        c.leather, {n: 6, variation: 0});
    });
    p.shell(`NPC bottle retaining band ${i}`, [[x, y, 2.52, .149, .139], [x, y, 2.60, .149, .139]],
      c.leather, {sides: 8, thickness: .025});
  }
}
