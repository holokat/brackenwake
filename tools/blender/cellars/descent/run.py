import sys,json,argparse,time
from pathlib import Path
sys.path.insert(0,str(Path.home()/'.codex/skills/blender-fast/scripts'))
from blender_client import execute,status
HERE=Path(__file__).parent.resolve();ROOT=HERE.parents[3]
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=9877);p.add_argument('--id',default='boss-02');p.add_argument('--render',choices=['hero','reverse']);p.add_argument('--all',action='store_true');a=p.parse_args()
ids=['boss-%02d'%i for i in range(1,8)]+['regular-crypt','regular-store','regular-chapel'] if a.all else [a.id]
for id in ids:
 commands=[f"import runpy\nbpy.app.driver_namespace['descent']=runpy.run_path({str(HERE/'build.py')!r})\nresult=bpy.app.driver_namespace['descent']['setup']({id!r})"]
 commands += [f"result=bpy.app.driver_namespace['descent']['construct']({stage!r})" for stage in ['architecture','fittings','ornaments']]
 commands += [f"result=bpy.app.driver_namespace['descent'][{stage!r}]()" for stage in ['flush','lighting','export']]
 if a.render:commands.append(f"result=bpy.app.driver_namespace['descent']['render']({a.render!r})")
 for c in commands:
  result,ms=execute('import bpy\n'+c,port=a.port,timeout=180);print(json.dumps({'result':result,'roundTripMs':ms}),flush=True)
files=sorted((ROOT/'assets/models/cellars/descent').glob('*.json'));specs=[json.loads(f.read_text()) for f in files if f.name!='manifest.json']
(ROOT/'assets/models/cellars/descent/manifest.json').write_text(json.dumps({'version':1,'rooms':specs},indent=2)+'\n')
