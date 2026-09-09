"""One dedicated Blender process for build, preview and refinement."""
import runpy,json,sys
from pathlib import Path
program=runpy.run_path(str(Path(__file__).with_name('build.py')))
print('MEADOW_RESULT',json.dumps(program['build']()),flush=True)
print('MEADOW_RENDER',json.dumps(program['render']('preview')),flush=True)
# Keep the same renderer resident for final renders and camera revisions.
for line in sys.stdin:
 try:
  command=json.loads(line)
  if command.get('action')=='render':print('MEADOW_RENDER',json.dumps(program['render'](command.get('profile','final'))),flush=True)
  elif command.get('action')=='execute':
   ns={'program':program};exec(command['code'],ns);print('MEADOW_EDIT',json.dumps(ns.get('result',{})),flush=True)
  elif command.get('action')=='quit':break
 except Exception as e:print('MEADOW_ERROR',str(e),flush=True)
