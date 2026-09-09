"""Update existing collision metadata without rebuilding any room artwork.

Run with Blender --background --factory-startup --python <this file>.
The room builder also generates these colliders on subsequent full exports.
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ASSETS = ROOT / 'assets/models/cellars/descent'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


geometry = load('statue_geometry', ROOT / 'tools/blender/widow/geometry.py')
fittings = load('statue_fittings', HERE / 'fittings.py')
manifest_path = ASSETS / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
changed = []
updates = []
for room in manifest['rooms']:
    original = room['colliders']
    statues = [c for c in original if c['model'] == 'Funeral statue']
    if not statues:
        continue
    replacement = []
    for body in original:
        if body['model'] != 'Funeral statue':
            replacement.append(body)
            continue
        if body.get('part') == 'figure':
            continue
        g = geometry.Geometry()
        fittings.statue(g, body['x'], body['z'], body['w'] / 2.5)
        replacement.extend(g.colliders)
    if replacement == original:
        continue
    sidecar_path = ASSETS / (room['id'] + '.json')
    sidecar = json.loads(sidecar_path.read_text())
    assert sidecar['colliders'] == original, f"Divergent metadata: {room['id']}"
    room['colliders'] = sidecar['colliders'] = replacement
    updates.append((sidecar_path, json.dumps(sidecar, indent=2) + '\n'))
    changed.append({'room': room['id'], 'statues': sum(c.get('part') != 'figure' for c in statues),
                    'bodies': sum(c['model'] == 'Funeral statue' for c in replacement)})
if changed:
    # Validate every matching sidecar before writing any of them.
    for path, content in updates:
        path.write_text(content)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('STATUE_COLLISION_UPDATED', json.dumps(changed), flush=True)
