"""Hand-authored room landmarks, attached to their architectural supports."""
import math,importlib.util
from pathlib import Path
p=Path(__file__).parents[1]/'entry/props.py';s=importlib.util.spec_from_file_location('entry_props',p);old=importlib.util.module_from_spec(s);s.loader.exec_module(old)
p=Path(__file__).parents[1]/'entry/architecture.py';s=importlib.util.spec_from_file_location('entry_arch',p);arch=importlib.util.module_from_spec(s);s.loader.exec_module(arch)
p=Path(__file__).with_name('statue_collision.py');s=importlib.util.spec_from_file_location('statue_collision',p);collision=importlib.util.module_from_spec(s);s.loader.exec_module(collision)

def chain(g,x,z,a,b,r=.17):
 for i in range(max(1,int((b-a)/(.42*r/.17)))):
  y=a+i*.42*r/.17;g.torus('iron',(x,y,z),r,r*.27,axis='x' if i%2 else 'z',stretch=1.45,segments=8)

def skull(g,x,y,z,k=1):
 g.rock('bone',(x,y+.32*k,z),(.6*k,.68*k,.48*k),seed=int((x+z)*11))
 for side in [-1,1]:g.rock('dark',(x+side*.14*k,y+.35*k,z+.23*k),(.19*k,.21*k,.08*k),seed=2)
 g.box('bone',(x,y+.03*k,z+.1*k),(.38*k,.17*k,.32*k),bevel=.02)
 for side in [-1,1]:g.box('dark',(x+side*.07*k,y+.02*k,z+.27*k),(.024*k,.12*k,.02*k))

def statue(g,x,z,k=1):
 start={key:len(part[1]) for key,part in g.parts.items()}
 # Hood, bent sleeves and held funerary sword create a readable sculpted figure.
 g.box('trim',(x,.4*k,z),(2.5*k,.8*k,2.3*k),bevel=.15)
 g.rock('limestone',(x,2.7*k,z),(1.6*k,4.2*k,1.35*k),seed=17)
 g.rock('trim',(x,5*k,z),(.92*k,1.3*k,.9*k),seed=40)
 g.rock('dark',(x,4.9*k,z+.38*k),(.54*k,.65*k,.2*k),seed=3)
 for side in [-1,1]:
  g.beam('limestone',(x+side*.65*k,4.1*k,z),(x+side*1.05*k,3*k,z+.3*k),.35*k,6)
  g.beam('limestone',(x+side*1.05*k,3*k,z+.3*k),(x+side*.22*k,2.9*k,z+.6*k),.27*k,6)
 g.beam('iron',(x,.85*k,z+.7*k),(x,3.25*k,z+.7*k),.1*k,4)
 g.box('bronze',(x,3*k,z+.7*k),(.9*k,.12*k,.15*k))
 collision.add_statue_bodies(g,start,k)

def tomb(g,x,y,z,k=1):
 for yy,w,d,h in [(.16,2.8,5.8,.32),(.8,2.4,5.3,1),(1.5,2.7,5.6,.35)]:g.box('trim' if yy!=.8 else 'limestone',(x,y+yy*k,z),(w*k,h*k,d*k),bevel=.12*k)
 g.rock('limestone',(x,y+1.9*k,z),(.9*k,.65*k,3.9*k),seed=14)
 for side in [-1,1]:g.box('bronze',(x+side*1.3*k,y+.8*k,z),(.09*k,.6*k,3.7*k))
 if y<1:g.body('Sarcophagus',(x,y+1.05*k,z),(2.8*k,2.1*k,5.8*k))

def candles(g,x,y,z,n=8):
 for i in range(n):old.candle(g,x+(i%4-.5)*.3,y,z+(i//4-.5)*.35,.3+(i%3)*.17)
 g.anchor('candle',(x,y+1,z),color=0xffba71,intensity=1)

def bell(g,x,z,y=5,r=2):
 profile=[(0,1.3),(.25,1.25),(.7,.9),(1.7,.7),(2.7,.58),(3.1,.2)];n=24
 for (ya,ra),(yb,rb) in zip(profile,profile[1:]):
  vv=[]
  for yy,rr in [(ya,ra),(yb,rb)]:vv.extend((x+math.cos(i*math.tau/n)*rr*r,y+yy*r,z+math.sin(i*math.tau/n)*rr*r) for i in range(n))
  g.mesh('bronze',vv,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],.9)
 for yy,rr in [(0,1.3),(.25,1.25),(1.7,.72),(2.8,.55)]:g.torus('bronze',(x,y+yy*r,z),rr*r,.09*r,axis='y',segments=24)
 g.beam('iron',(x,y-.1*r,z),(x,y+2.8*r,z),.12*r,8)
 g.rock('iron',(x,y-.18*r,z),(.5*r,.7*r,.5*r),seed=4)
 for side in [-1,1]:g.box('timber',(x+side*3.1*r,y+1.5*r,z),(.55*r,8*r,.65*r),bevel=.05)
 g.box('timber',(x,y+4*r,z),(7*r,.65*r,1*r))
 chain(g,x,z,y+3*r,y+4*r)
 for side in [-1,1]:g.beam('iron',(x+side*3*r,y+2.5*r,z),(x+side*.8*r,y+3.8*r,z),.14*r,4)
 g.body('Bell gantry',(x,y+1.5*r,z),(6.8*r,8*r,1.2*r))

def bookshelf(g,x,z,height=15,width=8):
 for side in [-1,1]:g.box('timber',(x+side*width/2,height/2,z),(.38,height,1.8))
 g.box('wood',(x,height/2,z-.8),(width,height,.2),shade=.55)
 for row in range(int(height/1.3)):
  y=row*1.3+.15;g.box('wood',(x,y,z),(width+.25,.2,1.9))
  for j in range(int(width/.35)):
   xx=x-width/2+.4+j*.34;h=.6+(j*7+row)%5*.1
   g.box('book' if (j+row)%3 else 'cloth',(xx,y+.1+h/2,z+.45),(.27,h,1.05),bevel=.015,shade=.5+g.random.random()*.5)
   for yy in [.2,h-.1]:g.box('bronze',(xx,y+.12+yy,z+1),(.23,.035,.035))
 g.body('Archive shelves',(x,height/2,z),(width+.4,height,2))

def channels(g,r,fire=False):
 # Shallow inlaid water, never a hidden falling pit. Bridges are flush and continuous.
 for side in [-1,1]:
  x=side*(r['rx']-8)
  for z in [-12,12]:
   g.box('dark',(x,-.03,z),(7,.08,12))
   g.box('rune' if fire else 'water',(x,.025,z),(6,.018,11.4))
   for dx in [-3.25,3.25]:g.box('trim',(x+dx,.18,z),(.4,.35,12))
   for zz in [z-5.6,z+5.6]:g.box('trim',(x,.18,zz),(7,.35,.4))
   # Stone crossing cuts across channel without a raised lip.
   g.box('floor',(x,.05,z),(7.3,.1,3.5),bevel=.02)
   for dz in [-1.9,1.9]:
    for i in range(8):g.box('bronze',(x-3.3+i*.95,.12,z+dz),(.14,.2,.35))
   if fire:g.anchor('fire',(x,.15,z-3.8),color=0xff8538,intensity=2)
   else:g.anchor('water',(x,.06,z-3.8),color=0x4ab1b5,intensity=.5)

def furnace(g,x,z):
 g.box('dark',(x,4.5,z),(9,9,4))
 arch.arch(g,x,0,z+2.05,7,8,1.5,thick=.8)
 g.box('rune',(x,3.7,z+2.12),(6.8,6.7,.12))
 for dx in range(-3,4):g.box('iron',(x+dx,3.7,z+2.25),(.24,7,.3))
 for yy in [1,3,5,7]:g.box('iron',(x,yy,z+2.4),(7.7,.2,.25))
 for dx in [-2.5,0,2.5]:
  g.beam('iron',(x+dx,8,z),(x+dx,14-abs(dx),z),.6,12)
  for yy in [8,10,11]:g.torus('bronze',(x+dx,yy,z),.64,.1,axis='y',segments=12)
 g.anchor('fire',(x,2,z+3),color=0xff8538,intensity=3)
 g.body('Funeral kiln',(x,7,z),(9,14,4.5))

def build(g,r):
 theme=r['theme'];rx,rz=r['rx'],r['rz'];large=r['level']>0
 for side in [-1,1]:
  for z in [-rz+8,rz-8]:
   x=side*(rx-3.8)
   arch.arch(g,x,0,z,5,10,1.5,math.pi/2,thick=.65)
   g.box('trim',(x,2,z),(3,.45,5.5))
   candles(g,x-side*.3,2.25,z,10)
   old.brazier(g,side*(rx-10),0,z)
   for yy in [6,10]:
    g.box('trim',(x,yy,z),(2.8,.25,5.4))
    for i in range(6):skull(g,x-side*.8,yy+.15,z-2+i*.75,.8)
   if theme not in ['bells','furnace','archive','command','store']:statue(g,side*(rx-5),z,1.2 if theme!='titan' else 2.1)
   # Wall-attached heraldry remains above all traversable aisles.
   old.banner(g,side*(rx-1),min(r['ceiling']*.58,19),z+2,2.4,7)
   g.anchor('lamp',(side*(rx-7),5,z),color=0xffb674,intensity=1.4)
 if theme in ['ossuary','furnace']:channels(g,r,theme=='furnace')
 if theme=='bells':
  for side in [-1,1]:
   for z in [-13,13]:bell(g,side*23,z,3.8,1.5)
  for x in [-13,13]:bell(g,x,-18,5,1.2)
 if theme=='furnace':
  for side in [-1,1]:
   for z in [-14,14]:furnace(g,side*25,z)
  for x in [-4,-2,0,2,4]:
   g.beam('iron',(x,14,-20),(x,27-abs(x)*1.5,-20),.7,12)
   for y in [15,19,22]:g.torus('bronze',(x,y,-20),.76,.1,axis='y')
 if theme=='archive':
  for side in [-1,1]:
   for z in [-14,14]:bookshelf(g,side*24,z,23,8)
  # Giant codex is chained directly to the roof above the open onward portal.
  g.box('pages',(0,21,-20),(8,9,1.4));g.box('book',(0,21,-18.9),(8.7,9.6,.4))
  for x in [-3.8,3.8]:
   g.box('bronze',(x,21,-18.6),(.22,9.2,.14));chain(g,x,-20,25.6,36)
  g.torus('bronze',(0,21,-18.6),2,.16,segments=16)
  for z in [14]:
   for x in [-18,18]:
    g.box('wood',(x,1.6,z),(4,.3,2));g.body('Scribe desk',(x,.9,z),(4,1.8,2))
    for dx in [-1.5,1.5]:g.box('timber',(x+dx,.7,z),(.25,1.4,1.5))
    candles(g,x,1.8,z,4)
 if theme=='inverted':
  for x,z,y in [(-18,-12,18),(18,-12,19),(-18,12,18),(18,12,18),(0,-9,28),(0,9,29)]:
   tomb(g,x,y,z,1.4)
   for dx in [-1.3,1.3]:
    for dz in [-2.5,2.5]:chain(g,x+dx,z+dz,y+2.7,min(43,r['ceiling']-3),.23)
   g.rock('trim',(x,y-2,z),(3.2,5,5.7),seed=70)
 if theme=='titan':
  for x in [-22,22]:
   for z in [-12,12]:
    if x<0 and z<0:continue
    tomb(g,x,0,z,1.6)
  x=-18.5;z=-17
  for i in range(5):g.box('trim',(x,.15+i*.25,z),(9-i*.5,.3,7-i*.3))
  g.box('limestone',(x,6,z-2),(8,10,1.5),bevel=.25);g.box('limestone',(x,2.5,z),(7,3,6),bevel=.2)
  for side in [-1,1]:g.box('trim',(x+side*3.5,4,z),(1.3,4.5,5))
  g.body('Titan throne',(x,5.5,z),(9,11,7))
  for i in range(7):g.beam('bronze',(x+(i-3)*.9,10,z-1.5),(x+(i-3)*1.1,12-abs(i-3)*.25,z-1.5),.25,5,end_radius=.04)
 if theme in ['command','store']:
  for side in [-1,1]:
   for z in [-rz+8,rz-8]:
    x=side*(rx-5)
    for row in range(3):
     y=.2+row*2.15;g.box('timber',(x,y,z),(6.5,.3,4))
     for i in range(3):old.barrel(g,(x+(i-1)*2.05,y+1,z),.9,2.9,'y')
    for dx in [-3.25,3.25]:g.box('timber',(x+dx,3.5,z),(.3,7,4.2))
    g.body('Wine fortress rack',(x,3.5,z),(7,7,4.2))
    old.crate(g,side*(rx-9.7),0,z+3,1.6)
 if theme in ['crypt','chapel','ossuary']:
  for side in [-1,1]:
   for z in [-rz+6,rz-6]:tomb(g,side*(rx-9),0,z,.8 if not large else 1)
 if theme=='chapel':bell(g,-15,-12,1.8,.65)
 # Grounded rubble is kept out of all four cardinal paths and both side fighting aisles.
 for i in range(50):
  side=-1 if i%2 else 1;x=side*(rx-2-g.random.random()*2);z=(g.random.random()-.5)*rz*1.6
  if abs(z)<8:continue
  g.rock('rubble',(x,.16,z),(.4+g.random.random()*.8,.32,.5),seed=i)
