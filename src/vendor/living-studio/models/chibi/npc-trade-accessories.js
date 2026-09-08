import {buildNpcApron} from './npc-apron.js';

/** Trade identifiers stay small and share the neutral outfit's existing waist binding. */
export function buildNpcTradeAccessories(p, kind, c) {
  if (kind === 'tailor') buildTailorTools(p, c);
  if (kind === 'banker') buildBankerLedger(p, c);
  if (kind === 'stablemaster') buildStableTools(p, c);
  if (kind === 'bowyer') buildBowyerTools(p, c);
}

function ellipse(p, name, x, y, z, rx, rz, radius, material) {
  const points = Array.from({length: 13}, (_, i) => {
    const a = i * Math.PI / 6;
    return [x + Math.cos(a) * rx, y, z + Math.sin(a) * rz];
  });
  return p.tube(name, points, radius, material, {sides: 5, variation: 0});
}

function buildTailorTools(p, c) {
  p.with('hips', 'cloth', () => {
    const tape = p.strip('NPC tailor folded measuring tape', [[.54, -.43, 3.16], [.61, -.56, 2.94], [.61, -.56, 2.39]],
      .12, c.shirtLight, .045);
    p.with('hips', 'trim', () => {
      for (let i = 0; i < 5; i++) p.mountedStrip(`NPC tailor tape tick ${i}`,
        [[.558, 0, 2.86 - i * .087], [i % 2 ? .59 : .61, 0, 2.86 - i * .087]], .017, c.leather, [tape], .006);
    });
  });
  p.strip('NPC tailor shears hanger', [[.73, -.04, 3.13], [.94, -.04, 2.83]], .105, c.leather, .08);
  p.with('hips', 'metal', () => {
    for (const s of [-1, 1]) {
      ellipse(p, `NPC tailor shears handle ${s}`, .94 + s * .069, -.055, 2.81, .06, .082, .022, c.metal);
      p.panel(`NPC tailor shears blade ${s}`, [[.94 + s * .049, -.075, 2.75], [.94 - s * .032, -.075, 2.68],
        [.94 - s * .11, -.075, 2.22]], .034, c.metal);
    }
  });
  p.strip('NPC tailor spool hanger', [[.74, .15, 3.11], [.98, .16, 2.98]], .09, c.leather, .075);
  p.with('hips', 'cloth', () => {
    p.loft('NPC tailor thread spool', [[.98, .16, 2.74, .10, .10], [.98, .16, 2.96, .10, .10]], c.cloth, {n: 8, variation: 0});
    p.with('hips', 'trim', () => {
      for (const z of [2.74, 2.97]) p.loft(`NPC tailor spool end ${z}`, [[.98, .16, z, .13, .13], [.98, .16, z + .043, .13, .13]],
        c.leather, {n: 8, variation: 0});
    });
  });
}

function buildBankerLedger(p, c) {
  p.strip('NPC banker ledger hanger', [[.72, -.03, 3.14], [.93, -.04, 2.86]], .14, c.leather, .08);
  p.with('hips', 'cloth', () => {
    p.cube('NPC banker ledger pages', [.93, -.04, 2.59], [.36, .25, .65], c.shirt, {bevel: .012});
    for (const y of [-.188, .106]) p.cube(`NPC banker ledger cover ${y}`, [.93, y, 2.59], [.43, .049, .73], c.clothDark, {bevel: .012});
    p.with('hips', 'leather', () => p.cube('NPC banker ledger spine', [.733, -.04, 2.59], [.08, .34, .73], c.leather));
    p.with('hips', 'trim', () => p.cube('NPC banker ledger brass clasp', [1.09, -.224, 2.59], [.15, .045, .06], c.trim, {bevel: .008}));
  });
  p.loft('NPC banker coin pouch', [[-.51, -.40, 2.48, .10, .085], [-.51, -.40, 2.57, .18, .145],
    [-.51, -.40, 2.79, .16, .125], [-.51, -.40, 2.93, .085, .075]], c.leather, {n: 8, variation: .012});
  p.shell('NPC banker pouch drawcord', [[-.51, -.40, 2.83, .117, .103], [-.51, -.40, 2.89, .097, .088]],
    c.leatherDark, {sides: 8, thickness: .03});
}

function buildStableTools(p, c) {
  buildNpcApron(p, {name: 'NPC stablemaster short leather apron', material: c.leather, bottom: 2.06, width: .58});
  p.strip('NPC stablemaster rope belt loop', [[.73, -.02, 3.13], [.94, -.025, 2.94]], .13, c.leatherDark, .08);
  p.with('hips', 'trim', () => {
    for (let i = 0; i < 3; i++) ellipse(p, `NPC stablemaster rope coil ${i}`, .94, -.07 + i * .041, 2.57,
      .17, .36, .026, c.trim);
  });
}

function buildBowyerTools(p, c) {
  p.strip('NPC bowyer shaft case hanger', [[.66, .24, 3.16], [.99, .29, 3.06]], .14, c.leather, .09);
  p.tube('NPC bowyer small hip shaft case', [[.84, .29, 2.06], [1.02, .30, 3.20]], [.13, .19], c.leatherDark,
    {sides: 8, variation: .012});
  p.tube('NPC bowyer shaft case rim', [[.995, .299, 3.05], [1.025, .30, 3.23]], [.205, .205], c.leather,
    {sides: 8, variation: .008});
  p.with('hips', 'trim', () => {
    for (let i = 0; i < 3; i++) {
      const x = .96 + i * .07, y = .29 + (i % 2) * .065, top = 3.73 + (i === 1 ? .10 : 0);
      p.tube(`NPC bowyer fletched shaft ${i}`, [[x - .08, y, 2.54], [x + .12, y + .01, top]], .018, '#977c52',
        {sides: 5, variation: 0});
      p.panel(`NPC bowyer feather ${i}`, [[x + .09, y -.013, top - .21], [x + .10, y -.013, top],
        [x + .18, y -.013, top + .025], [x + .18, y -.013, top - .12]], .027, c.shirtLight);
    }
  });
  p.strip('NPC bowyer wood tool hanger', [[.55, -.40, 3.10], [.58, -.43, 2.83]], .095, c.leather, .08);
  p.with('hips', 'trim', () => {
    p.tube('NPC bowyer shaping tool handle', [[.58, -.43, 2.83], [.62, -.43, 2.51]], .068, '#896a43', {sides: 6, variation: 0});
    p.with('hips', 'metal', () => p.panel('NPC bowyer shaping tool blade', [[.59, -.43, 2.55], [.66, -.43, 2.55],
      [.68, -.43, 2.27], [.61, -.43, 2.27]], .035, c.metal));
  });
}
