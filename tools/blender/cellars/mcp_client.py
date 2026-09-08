"""Client for the installed Blender MCP extension's documented socket bridge."""
import argparse,json,socket,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=9877);p.add_argument('--script');p.add_argument('--code');p.add_argument('--timeout',type=int,default=600);a=p.parse_args()
if not (9877<=a.port<=9879):raise ValueError('Use an isolated Cellars bridge port')
if a.script:
 path=Path(a.script).resolve()
 workspace=Path(__file__).resolve().parents[3]
 if not path.is_relative_to(workspace):raise ValueError('Script must belong to this Brackenwake checkout')
 code='import runpy\nrunpy.run_path('+repr(str(path))+',run_name="__main__")\nresult={"executed":'+repr(str(path))+'}'
else:code=a.code
if not code:raise ValueError('Provide a script or code')
with socket.create_connection(('127.0.0.1',a.port),timeout=a.timeout) as s:
 s.sendall(json.dumps({'type':'execute','strict_json':True,'code':code}).encode()+b'\0')
 data=b''
 while b'\0' not in data:
  part=s.recv(65536)
  if not part:raise RuntimeError('Blender MCP disconnected before returning a result')
  data+=part
  if len(data)>16000000:raise RuntimeError('MCP response is too large')
 result=json.loads(data.split(b'\0')[0]);print(json.dumps(result,indent=2))
 if result.get('status')!='ok':sys.exit(1)
