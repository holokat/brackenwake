"""Real portal voids, dressed vaults and ground-safe perimeter architecture."""
import math,importlib.util
from pathlib import Path
p=Path(__file__).parents[1]/'entry/architecture.py';s=importlib.util.spec_from_file_location('entry_architecture',p);entry=importlib.util.module_from_spec(s);s.loader.exec_module(entry)

def shell(g,r):
 rx,rz,h=r['rx'],r['rz'],r['ceiling'];poly=r['polygon'];doors=r['doors'];spring=h*.48
 for i,a in enumerate(poly):
  b=poly[(i+1)%len(poly)];entry.wall(g,a,b,0,spring,doors)
  n=math.ceil(math.dist(a,b))
  for j in range(n):
   t=(j+.5)/n;x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t
   if any(abs(x-d['x'])<(7 if d['axis']=='z' else 2) and abs(z-d['z'])<(7 if d['axis']=='x' else 2) for d in doors):continue
   g.body('Room masonry',(x,spring/2,z),(1.4,spring,1.4))
 entry.tiles(g,poly,0,0,0,2)
 for d in doors:entry.arch(g,d['x'],0,d['z'],13,12,2,0 if d['axis']=='z' else math.pi/2,1)
 # Curved vault sheets and rib courses: an enclosed ceiling, never hanging rocks.
 for j in range(8):
  za=-rz+j*rz/4;zb=za+rz/4
  for i in range(24):
   a=i*math.pi/24;b=(i+1)*math.pi/24
   def v(t,z):return(rx*math.cos(t),spring+(h-spring)*math.sin(t),z)
   g.mesh('ceiling',[v(a,za),v(b,za),v(b,zb),v(a,zb)],[(3,2,1,0)],.7+g.random.random()*.25)
 for zz in [-rz*.7,rz*.7]:
  entry.arch(g,0,0,zz,rx*1.7,h-.6,1.5,thick=1.1)
  for side in [-1,1]:
   x=side*rx*.87;stem=h-.6-min(rx*.85,(h-.6)*.58)
   for y,w,hh in [(.5,3,1),(stem/2,1.8,stem),(stem-.3,3,.7)]:g.box('trim',(x,y,zz),(w,hh,2.5),bevel=.12)
   g.body('Vault pier',(x,stem/2,zz),(2.7,stem,2.5))
 # Closed end gables, with curved doorway openings rather than wall planes over doors.
 for side in [-1,1]:
  for i in range(48):
   xa=-rx+i*rx/24;xb=xa+rx/24
   def low(x):return 5.5+math.sqrt(max(0,7.5**2-x*x)) if abs(x)<7.5 else 0
   def high(x):return spring+(h-spring)*math.sqrt(max(0,1-(x/rx)**2))
   a,b=low(xa),low(xb);ta,tb=high(xa),high(xb)
   g.mesh('limestone',[(xa,a,side*rz),(xb,b,side*rz),(xb,tb,side*rz),(xa,ta,side*rz)],[(0,1,2,3)],.67+(i%5)*.045)
   for y in range(math.ceil(max(a,b))+1,math.floor(min(ta,tb)),2):g.box('limestone',((xa+xb)/2,y,side*(rz-.58)),(xb-xa-.02,1.97,.15),bevel=.04,shade=.74+g.random.random()*.23)
 # Broad raised coping, inlaid central medallion and perimeter ribs.
 for radius in [10.5,11,11.7]:g.torus('bronze',(0,.045,0),radius,.045,axis='y',segments=64)
 for side in [-1,1]:
  for z in [-rz+5,rz-5]:
   for x in [side*(rx-8),side*(rx-3)]:g.box('trim',(x,.22,z),(3,.44,3),bevel=.12)
 # All route centers are model-space polylines. Main aisle remains fully open.
 r['routes']=[[[0,rz+4],[0,0],[0,-rz-4]],[[-rx-4,0],[0,0],[rx+4,0]],[[0,rz+4],[-12,rz-7],[-12,-rz+7],[0,-rz-4]],[[0,rz+4],[12,rz-7],[12,-rz+7],[0,-rz-4]]]
