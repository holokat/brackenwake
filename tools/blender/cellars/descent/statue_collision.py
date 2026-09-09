"""Static height bands fitted to the same vertices that form each statue."""


def clip_height(poly, height, above):
    out = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ain = a[1] >= height if above else a[1] <= height
        bin = b[1] >= height if above else b[1] <= height
        if ain:
            out.append(a)
        if ain != bin:
            t = (height - a[1]) / (b[1] - a[1])
            out.append(tuple(a[k] + t * (b[k] - a[k]) for k in range(3)))
    return out


def add_statue_bodies(g, start, scale):
    # Capture only geometry appended by this statue, never surrounding shelves.
    polygons = []
    for key, (vertices, faces, _) in g.parts.items():
        first = start.get(key, 0)
        polygons.extend([vertices[i] for i in face] for face in faces[first:])
    bottom = min(p[1] for poly in polygons for p in poly)
    top = max(p[1] for poly in polygons for p in poly)
    # Keep the plinth's real top as a support; finer bands follow the robe,
    # projecting sleeves and hood without making a pedestal-wide invisible wall.
    edges = [bottom, .8 * scale] + [i * .4 * scale for i in range(3, 15)]
    edges = sorted({y for y in edges if bottom <= y < top} | {top})
    for low, high in zip(edges, edges[1:]):
        points = [p for poly in polygons
                  if max(v[1] for v in poly) > low + 1e-7
                  and min(v[1] for v in poly) < high - 1e-7
                  for p in clip_height(clip_height(poly, low, True), high, False)]
        if not points:
            continue
        xmin, xmax = min(p[0] for p in points), max(p[0] for p in points)
        zmin, zmax = min(p[2] for p in points), max(p[2] for p in points)
        g.body('Funeral statue', ((xmin+xmax)/2, (low+high)/2, (zmin+zmax)/2),
               (xmax-xmin, high-low, zmax-zmin), part='plinth' if low == bottom else 'figure')
