"""Rebuild via MCP and retain byte-level output reproducibility evidence."""
from pathlib import Path
import hashlib,json,runpy,bpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
GLB=ROOT/'assets/models/cellars/oram/oram.glb';ART=ROOT/'docs/art/old-cellars/blender/oram'
before=hashlib.sha256(GLB.read_bytes()).hexdigest()
# Prevent backup proliferation for this deterministic source artifact.
bpy.context.preferences.filepaths.save_version=0
runpy.run_path(str(HERE/'build.py'),run_name='__main__')
after=hashlib.sha256(GLB.read_bytes()).hexdigest()
assert before==after,f'Rebuild changed GLB: {before} -> {after}'
report={'method':'Two consecutive builds through isolated Blender MCP 9878','beforeSha256':before,'afterSha256':after,'identical':before==after,'builderSha256':hashlib.sha256((HERE/'build.py').read_bytes()).hexdigest(),'repeatScriptSha256':hashlib.sha256((HERE/'repeat.py').read_bytes()).hexdigest()}
(ART/'reproducibility.json').write_text(json.dumps(report,indent=2)+'\n')
print('ORAM_REBUILD_IDENTICAL',json.dumps(report))
