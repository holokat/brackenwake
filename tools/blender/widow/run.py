"""Run the trusted builder through the installed Blender Lab bridge."""
import sys,json,time,argparse,os
from pathlib import Path
SKILL=Path(os.environ.get('BLENDER_FAST_SKILL',Path.home()/'.codex/skills/blender-fast'))/'scripts'
sys.path.insert(0,str(SKILL))
from blender_client import execute,status
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=9877);parser.add_argument('--render',choices=['hero','reverse','gallery']);args=parser.parse_args()
records=[];start=time.perf_counter()
if args.render:
    commands=[f"result=bpy.app.driver_namespace['widow_build']['render']({args.render!r})"]
else:
    before,ms=status(port=args.port)
    (ROOT/'docs/art/widow-vault/bridge-before.json').write_text(json.dumps(before,indent=2)+'\n')
    if not before['background']:raise RuntimeError('Bridge must be an isolated background process')
    if before['polling']['timer_interval_active']>.051 or before['polling']['timer_interval_idle']>.251:
        raise RuntimeError('Inspect and tune polling once before building')
    commands=[f"import runpy\nbpy.app.driver_namespace['widow_build']=runpy.run_path({str(Path(__file__).with_name('build.py'))!r})\nresult=bpy.app.driver_namespace['widow_build']['setup']()"]
    commands += [f"result=bpy.app.driver_namespace['widow_build']['construct']({stage!r})" for stage in ['environment','infrastructure','dressing']]
    commands += [f"result=bpy.app.driver_namespace['widow_build'][{stage!r}]()" for stage in ['flush','lighting','export']]
for command in commands:
    result,ms=execute('import bpy\n'+command,port=args.port,timeout=180)
    entry={'result':result,'roundTripMs':ms};records.append(entry);print(json.dumps(entry),flush=True)
out={'bridgeCalls':len(commands),'elapsedSeconds':time.perf_counter()-start,'records':records}
name='bridge-render-'+args.render if args.render else 'bridge-build'
(ROOT/f'docs/art/widow-vault/{name}.json').write_text(json.dumps(out,indent=2)+'\n')
