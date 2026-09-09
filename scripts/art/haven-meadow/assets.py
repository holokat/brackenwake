"""Original low-poly coastal props, composed with the shared mesh builder."""
import math, random
from bw_meadow_geometry import Mesh, barrel, cloth

def windmill():
 m=Mesh();m.beam((0,0,-.45),(0,0,1.6),2.35,'stone',10,r2=2.15)
 # Faceted plaster shaft and its timber framing.
 m.beam((0,0,1.5),(0,0,6.9),2.12,'plaster',8,r2=1.42)
 for i in range(8):
  a=math.tau*i/8;m.beam((2.15*math.cos(a),2.15*math.sin(a),1.5),(1.45*math.cos(a),1.45*math.sin(a),6.9),.09)
 for h,r in[(1.65,2.1),(4.1,1.78),(6.7,1.46)]:m.ring((0,0,h),r,.095,'wood')
 m.beam((0,0,6.85),(0,0,8.55),2.0,'roof',8,r2=.05)
 m.beam((0,0,8.55),(0,0,9.1),.065,'gold')
 m.add([(-.05,0,9),(.85,0,9.13),(.65,0,8.8),(-.05,0,8.8)],[(0,1,2,3)],'gold')
 for row in range(3):
  for i in range(11):
   a=math.tau*(i+(row%2)*.5)/11
   if math.sin(a)<-.8:continue  # Leave the door reveal clear of projecting stone.
   m.box((2.2*math.cos(a),2.2*math.sin(a),.25+row*.48),(.94,.45,.43),'chalk'if i%4==0 else'stone',a+math.pi/2,.035)
 # Closed door, wooden lintel and window shutters.
 m.box((0,-2.42,.96),(1.2,.13,1.8),'dark')
 for i in range(6):m.box((-.5+i*.2,-2.51,.95),(.17,.08,1.67),'wood')
 for h in(.4,1.5):m.box((0,-2.57,h),(1.15,.09,.1),'iron')
 m.box((.37,-2.63,.94),(.09,.08,.14),'gold')
 m.box((0,-2.5,1.94),(1.45,.28,.2),'woodlight')
 for x in(-1,1):
  m.box((x*.82,-1.78,4.48),(.72,.15,.96),'dark')
  m.box((x*.82,-1.87,4.48),(.06,.1,.96),'woodlight')
  m.box((x*.82,-1.87,4.48),(.72,.1,.06),'woodlight')
 barrel(m,2.4,-1.4,r=.44);barrel(m,-2.35,-.65,r=.38,h=.8)
 rotor=Mesh(8)
 rotor.beam((0,-.15,0),(0,.18,0),.38,'iron',10)
 for i in range(4):
  a=i*math.pi/2+.28;c,s=math.cos(a),math.sin(a)
  def p(x,z,y=0):return(x*c-z*s,y,x*s+z*c)
  rotor.beam(p(0,.25),p(0,4.6),.065,'woodlight')
  rotor.beam(p(.9,1.15),p(.9,4.35),.04,'wood')
  for j in range(5):
   z=1.18+j*.64;rotor.beam(p(-.13,z),p(1.02,z),.025,'woodlight',4)
   rotor.add([p(.05,z,-.03),p(.92,z,-.03),p(.92,z+.58,-.085),p(.05,z+.58,-.03)],[(0,1,2),(0,2,3)],'teal'if j%3==1 else'cream',.025)
 return [('body',m,None),('sails',rotor,(0,-2.35,6.8))]

def arbor(fishing=False):
 m=Mesh(4 if fishing else 5);w=6 if fishing else 6.8;d=4.5;h=3.65 if fishing else 3.4
 for x in(-w/2,w/2):
  for y in(-d/2,d/2):
   m.beam((x,y,-.7),(x,y,h+.28),.095,'wood',6)
   m.beam((x,y,h-.9),(x+(1 if x<0 else-1)*.8,y,h),.06,'woodlight')
 for y in(-d/2,d/2):m.beam((-w/2-.3,y,h),(w/2+.3,y,h),.11,'wood')
 cloth(m,w+.15,d,h,stripes=fishing)
 # Table and two benches, leaving both side aisles clear.
 for x in(-.9,.9):
  for y in(-.42,.42):m.box((x,y,.4),(.14,.14,1.1),'wood')
 for y in(-.42,0,.42):m.box((0,y,.93),(2.6,.39,.13),'woodlight',bevel=.015)
 for y in(-1.15,1.15):
  m.box((0,y,.49),(2.7,.4,.15),'woodlight',bevel=.025)
  for x in(-1,1):m.box((x,y,.2),(.14,.35,.55),'wood')
 barrel(m,w/2-.5,d/2-.65,r=.43,h=.85)
 if fishing:
  # Net hung at one side, never across the walking entrance.
  x=-w/2+.07
  for j in range(9):
   y=-1.6+j*.39;m.beam((x,y,.5),(x,y,2.35),.013,'rope',4)
  for j in range(7):
   z=.5+j*.3;m.beam((x,-1.6,z),(x,1.52,z),.013,'rope',4)
  for y in(-1.2,.0,1.2):m.rock((x,y,2.35),(.09,.13,.12),['gold'])
  m.box((.1,0,1.05),(1.1,.54,.09),'teal');m.rock((0,0,1.14),(.36,.1,.07),['chalk'])
 else:
  for x in(-.7,.2,.7):m.beam((x,0,1),(x,0,1.16),.15,'cream',10)
  m.box((-.15,.1,1.03),(.63,.44,.04),'red')
  # Climbing stems and leaf clusters frame the back corners.
  for side in(-1,1):
   for i in range(7):
    z=.3+i*.48;m.beam((side*w/2,d/2,z-.3),(side*(w/2-.12),d/2,z),.025,'stem',4)
    m.rock((side*(w/2-.28),d/2,z),(.33,.2,.24),['leaf','leaflight'],i)
 return [('body',m,None)]

def cart():
 m=Mesh(21)
 for i in range(6):m.box((-.9+i*.36,0,.8),(.33,1.1,.1),'woodlight')
 for y in(-.65,.65):
  for z in(.95,1.25):m.box((0,y,z),(2.3,.12,.22),'wood')
 for x in(-1.12,1.12):m.box((x,0,1.1),(.12,1.4,.53),'wood')
 for x in(-.9,.9):
  m.beam((x,-.65,.6),(x,-2,.33),.065,'wood')
 for x in(-1.25,1.25):
  # Wheel in the YZ plane.
  for i in range(12):
   a=i*math.tau/12;b=(i+1)*math.tau/12
   m.beam((x,.57*math.cos(a),.6+.57*math.sin(a)),(x,.57*math.cos(b),.6+.57*math.sin(b)),.055,'woodlight',4)
   if i%2==0:m.beam((x,0,.6),(x,.55*math.cos(a),.6+.55*math.sin(a)),.035,'wood',4)
 for i in range(17):m.rock((-.8+(i%6)*.3,-.4+(i//6)*.3,1.12),(.16,.16,.15),['red'if i%3 else'gold'],i)
 return [('body',m,None)]

def skiff():
 m=Mesh(2)
 # Five curved ribs make an open hull, with seats and a gunwale.
 rows=[]
 for y,r,z in[(-2.6,.03,.7),(-1.8,.7,.25),(0,.95,0),(1.8,.7,.25),(2.6,.04,.75)]:
  rows.append([(-r,y,z+.9),(-r*.72,y,z+.25),(0,y,z),(r*.72,y,z+.25),(r,y,z+.9)])
 for a,b in zip(rows,rows[1:]):
  for i in range(4):m.add([a[i],a[i+1],b[i+1],b[i]],[(0,1,2,3)],'woodlight'if i%2 else'wood')
  for i in(0,4):m.beam(a[i],b[i],.065,'dark')
 for y in(-1.2,0,1.2):m.box((0,y,.72),(1.42,.3,.13),'woodlight')
 m.beam((-.7,-2,.94),(.55,1.7,1.02),.035,'woodlight');m.box((.54,1.5,1.03),(.25,.72,.06),'teal',-.32)
 return [('body',m,None)]

def wall():
 m=Mesh(42)
 for row in range(2):
  for i in range(5):m.box((-1.6+i*.8+(row%2)*.12,0,.23+row*.4),(.76,.72,.4),'stone'if(i+row)%3 else'chalk',m.rng.uniform(-.025,.025),.06)
 for i in range(6):m.box((-1.82+i*.72,0,.91),(.7,.85,.18),'chalk',m.rng.uniform(-.02,.02),.03)
 return [('body',m,None)]

def kite():
 m=Mesh();m.beam((0,0,-.6),(0,0,7.5),.09,'woodlight',6,r2=.04)
 m.beam((0,0,7.1),(1.0,0,8.3),.022,'rope',4)
 clothmesh=Mesh(11)
 points=[(0,0,1.65),(1.0,.08,0),(0,.18,-1.2),(-1.0,.08,0),(0,-.12,0)]
 for i in range(4):clothmesh.add(points,[(i,(i+1)%4,4)],'gold'if i%2 else'cream')
 clothmesh.beam((0,0,-1.15),(0,0,1.65),.025,'woodlight',4)
 clothmesh.beam((-1,0,0),(1,0,0),.02,'woodlight',4)
 for i in range(13):
  def p(t):return(.6*math.sin(t*1.4),.13*t,-1.2-t*.32)
  a=p(i);b=p(i+1);clothmesh.beam(a,b,.017,'rope',4)
  if i%2==0:
   x,y,z=a;clothmesh.add([(x-.22,y,z+.15),(x,y,z),(x-.25,y,z-.15),(x+.22,y,z+.15),(x+.25,y,z-.15)],[(0,1,2),(3,4,1)],'teal')
 return [('body',m,None),('kite',clothmesh,(1,0,8.2))]

def flowers(kind):
 m=Mesh({'lavender':9,'yellow':10,'white':12}[kind]);r=m.rng
 for i in range(48):
  a=r.random()*math.tau;rad=math.sqrt(r.random());x=math.cos(a)*3.5*rad;y=math.sin(a)*2.6*rad;h=r.uniform(.38,.82)
  m.beam((x,y,-.22),(x+.08,y,h),.017,'stem',3)
  m.add([(x,y,.1),(x-.25,y+.08,.33),(x-.07,y+.06,.35),(x+.25,y-.09,.24)],[(0,1,2),(0,2,3)],'leaf')
  if kind=='lavender':
   for j in range(3):m.rock((x+.08,y,h+j*.12),(.075,.075,.13),['purple','lavender'],i+j)
  else:
   verts=[(x+.08,y,h+.045)]+[(x+.08+math.sin(j*math.tau/6)*.16,y+math.cos(j*math.tau/6)*.16,h)for j in range(6)]
   m.add(verts,[(0,j+1,(j+1)%6+1)for j in range(6)],kind)
   m.beam((x+.08,y,h+.04),(x+.08,y,h+.07),.045,'gold',5)
 return [('body',m,None)]

def grasses():
 m=Mesh(21);r=m.rng
 for i in range(30):
  x=r.uniform(-2.6,2.6);y=r.uniform(-1.8,1.8)
  for j in range(4):
   a=j*1.6;h=r.uniform(.4,1.25)
   m.add([(x-.035,y,-.18),(x+.035,y,-.18),(x+.3*math.sin(a),y+.3*math.cos(a),h)],[(0,1,2)],'leaflight'if i%3 else'sand')
 return [('body',m,None)]

def chalk():
 m=Mesh(32)
 for i,(p,s)in enumerate([((0,0,.85),(1.8,1.25,1.6)),((1.8,.5,.5),(1,.8,.95)),((-1.4,-.8,.25),(.8,.6,.6))]):m.rock(p,s,seed=i)
 return [('body',m,None)]

FACTORIES={'meadow_windmill':windmill,'meadow_arbor':arbor,'meadow_fishing_awning':lambda:arbor(True),'meadow_cart':cart,'meadow_skiff':skiff,'meadow_wall':wall,'meadow_kite':kite,'meadow_lavender':lambda:flowers('lavender'),'meadow_daisies':lambda:flowers('white'),'meadow_buttercups':lambda:flowers('yellow'),'meadow_grasses':grasses,'meadow_chalk':chalk}
