"""Use the installed Blender Lab bridge, never replace the user's active scene."""
import sys,json,time,argparse,os
from pathlib import Path
sys.path.insert(0,str(Path.home()/'.codex/skills/blender-fast/scripts'))
from blender_client import execute,status
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=9877);p.add_argument('--render',choices=['arrival','nave','reverse']);a=p.parse_args()
records=[];start=time.perf_counter()
if a.render:commands=[f"result=bpy.app.driver_namespace['entry_build']['render']({a.render!r})"]
else:
 before,ms=status(port=a.port)
 if not before['background']:raise RuntimeError('Expected owned background bridge')
 commands=[f"import runpy\nbpy.app.driver_namespace['entry_build']=runpy.run_path({str(HERE/'build.py')!r})\nresult=bpy.app.driver_namespace['entry_build']['setup']()"]
 commands += [f"result=bpy.app.driver_namespace['entry_build']['construct']({stage!r})" for stage in ['architecture','props']]
 commands += [f"result=bpy.app.driver_namespace['entry_build'][{stage!r}]()" for stage in ['flush','lighting','export']]
for c in commands:
 result,ms=execute('import bpy\n'+c,port=a.port,timeout=180);row={'result':result,'roundTripMs':ms};records.append(row);print(json.dumps(row),flush=True)
(ROOT/'docs/art/cellar-entry'/('bridge-'+(a.render or 'build')+'.json')).write_text(json.dumps({'elapsedSeconds':time.perf_counter()-start,'records':records},indent=2)+'\n')
