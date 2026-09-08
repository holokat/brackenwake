/** Short front aprons share the belt seam and flex independently with both thighs. */
export function buildNpcApron(p, {name, material, bottom = 2.08, width = .58, role = 'leather', pocketMaterial}) {
  const top = 3.035, frontY = z => -.49 - (top - z) / (top - bottom) * .24;
  const bind = (mesh, side) => {
    Object.assign(mesh.userData, {armorSide: side, skirtFollowSpan: .65, skirtFollowMax: .90, npcApron: true});
    return mesh;
  };
  const panels = [];
  p.with('skirt', role, () => {
    for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
      const front = [];
      for (const z of [top, 2.65, bottom]) {
        const t = (top - z) / (top - bottom), x = .49 + (width - .49) * t;
        front.push([0, frontY(z), z], [s * x, frontY(z), z]);
      }
      const apron = bind(p.solidStrip(`${name} ${side}`, front, material, .085), side);
      panels.push(apron);
      if (pocketMaterial) {
        const pocket = bind(p.panel(`NPC innkeeper apron pocket ${side}`,
          [[0, frontY(2.63) - .032, 2.63], [s * .25, frontY(2.63) - .032, 2.63],
            [s * .23, frontY(2.30) - .032, 2.30], [0, frontY(2.30) - .032, 2.30]], .057, pocketMaterial), side);
        panels.push(pocket);
      }
    }
  });
  return panels;
}
