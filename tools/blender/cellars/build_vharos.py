"""Build Vharos from the generated front/profile/rear reference sheet.

blender --background --python tools/blender/cellars/build_vharos.py
Outputs stay outside public so this can be reviewed before integration.
"""
import os,sys,math,json
sys.dont_write_bytecode=True
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path[:0]=[HERE,os.path.dirname(HERE)]
import bpy
import importlib,meshkit
importlib.reload(meshkit)
import rigkit as rk
from meshkit import Kit,material,v
ROOT=os.path.abspath(os.path.join(HERE,'../../..'))
OUT=os.path.join(ROOT,'assets/models/cellars')
ART=os.path.join(ROOT,'docs/art/old-cellars/blender')
os.makedirs(OUT,exist_ok=True);os.makedirs(ART,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.armatures,bpy.data.actions]:
 for block in list(collection):
  if block.users==0 or collection==bpy.data.actions:collection.remove(block)
bpy.context.scene.render.fps=30
bpy.context.scene.frame_start=0
palette={
 'Vharos slate':material('Vharos slate',0x344257,0,.83),
 'Vharos facets':material('Vharos facets',0x5d6c84,0,.8),
 'Vharos obsidian':material('Vharos obsidian',0x151e2b,0,.9),
 'Vharos gold':material('Vharos gold',0xb69256,.72,.38),
 'Vharos ivory':material('Vharos ivory',0xc7b995,0,.78),
 'Vharos furnace':material('Vharos furnace',0xff9c1d,.15,.35,2),
 'Vharos furnace core':material('Vharos furnace core',0xffe292,0,.3,3.5),
}
k=Kit(palette)
S='Vharos slate';E='Vharos facets';D='Vharos obsidian';G='Vharos gold';B='Vharos ivory';F='Vharos furnace';C='Vharos furnace core'
bones=[('hips',(0,20,0),(0,23,0),None,False),('chest',(0,23,0),(0,29,0),'hips',True),('head',(0,29,0),(0,34,0),'chest',True)]
for side,n in [(-1,'R'),(1,'L')]:
 for name,a,b,parent in [('upperarm',(side*5.5,29,0),(side*7.2,24,0),'chest'),('forearm',(side*7.2,24,0),(side*8.6,20,.4),'upperarm_'+n),('hand',(side*8.6,20,.4),(side*9,18,1.2),'forearm_'+n),('thigh',(side*3.2,20,0),(side*4.8,12,0),'hips'),('shin',(side*4.8,12,0),(side*5.8,3,0),'thigh_'+n),('foot',(side*5.8,3,0),(side*5.8,1,3),'shin_'+n)]:bones.append((name+'_'+n,a,b,parent,False))
arm=rk.build_armature('Vharos',[(n,v(a),v(b),p,c) for n,a,b,p,c in bones])
# Ribcage and pelvis are closed volumes, with separate stone armour laminae.
k.loft('ribcage',[(20.7,2.5,2.1,0,0),(23,3.4,2.7,0,0),(27,5,3,0,0),(29.2,3.3,2.25,0,0)],D,'chest',10)
k.loft('pelvic shell',[(18.9,2.5,2.1,0,0),(20.5,3.2,2.45,0,0),(22,2.7,2.2,0,0)],S,'hips',8)
for side,n in [(-1,'R'),(1,'L')]:
 def mirror(points):return [(side*x,y) for x,y in points]
 k.plate('rib shell '+n,mirror([(1.8,20.5),(3.2,21),(5.1,26),(4.4,28.7),(2.9,27.8)]),3.6,S,'chest',bevel=.22,ridge=.6)
 k.plate('thoracic border '+n,mirror([(2.35,20.5),(2.8,21),(4.3,27.5),(3.5,28.5),(3.1,27.3)]),.45,G,'chest',(0,0,2.5),ridge=.12)
 k.plate('neck buttress '+n,mirror([(1.1,29),(2.3,31.7),(3.9,29.8),(5,28.5),(3.7,27.7)]),3.3,S,'chest',bevel=.25,ridge=.5)
 for i in range(6):
  yy=27.9-i*1.22;outer=3.2-i*.18
  pts=mirror([(.35,yy),(.35,yy-.42),(outer,yy-1.6),(outer+.03,yy-1.05)])
  k.plate('rib gold %s %s'%(n,i),pts,.35,G,'chest',(0,0,2.85),bevel=.07,ridge=.05)
  k.plate('rib stone %s %s'%(n,i),mirror([(.42,yy-.48),(.5,yy-.94),(outer-.1,yy-2.05),(outer,yy-1.65)]),.5,E,'chest',(0,0,2.57),ridge=.12)
 k.plate('hip tasset '+n,mirror([(2,21),(3.5,21.5),(5.1,19.2),(4.5,18.2),(2.8,19.5)]),3.8,E,'hips',ridge=.45)
 # Back armour follows the reverse sheet rather than repeating a front face.
 for i in range(5):
  y=22+i*1.25
  k.beam('back rib '+n+str(i),(side*.45,y,-2.6),(side*(2.7+i*.2),y+1,-2.4),.22,G,'chest')
 k.beam('back rim '+n,(side*2,21,-2),(side*4.2,27,-2.1),.3,E,'chest')
# Recessed amber furnace, with a hotter thin core and broken stone borders.
k.plate('furnace aperture',[(-.35,22),(-.33,28.2),(0,29),(.33,28.2),(.35,22),(0,20.7)],.5,F,'chest',(0,0,3.01),bevel=.02,ridge=.07)
k.plate('furnace hot seam',[(-.13,22.1),(-.1,28.2),(.08,28.55),(.17,22.1),(0,21.3)],.15,C,'chest',(0,0,3.35),ridge=0)
k.box('vertebral gold spine',(0,25,-2.7),(.6,7,.5),G,'chest')
k.box('rear furnace vent',(0,25,-2.95),(1,3.5,.25),F,'chest')
for i in range(7):k.box('vent slat '+str(i),(0,23.5+i*.45,-3.1),(1.25,.2,.2),G,'chest')
# Long slate tabard bordered by gold, finishing in a spear tip.
tab=[(-1.25,20.3),(0,21.5),(1.25,20.3),(.9,13.1),(0,12),(-.9,13.1)]
k.plate('gold tabard',tab,.65,G,'hips',(0,0,2.55),ridge=.16)
k.plate('slate tabard',[(x*.7,(y-16.5)*.9+16.5) for x,y in tab],.27,S,'hips',(0,0,3),ridge=.3)
k.beam('tabard centre line',(0,13.25,3.4),(0,20.1,3.4),.075,G,'hips')
# Hood with a recessed skull. Separate brow, cheeks, nasal bridge and teeth leave real openings.
k.loft('stone cowl',[(29.2,1.9,1.8,0,0),(31.3,2.7,2.1,0,0),(33.7,2.2,1.7,0,0)],S,'head',8)
k.plate('face recess',[(-1.25,29.6),(-1.45,32.4),(0,33.2),(1.45,32.4),(1.25,29.6),(0,29.05)],.2,D,'head',(0,0,2.05),ridge=0)
k.plate('cranium',[(-1.12,32),(-.95,32.9),(0,33.35),(.95,32.9),(1.12,32),(0,31.7)],1.2,B,'head',(0,0,2.05),ridge=.2)
for side in [-1,1]:
 k.plate('brow '+str(side),[(side*.13,32.28),(side*.3,31.85),(side*1.1,31.5),(side*1.13,32.2)],.5,B,'head',(0,0,2.64),ridge=.1)
 k.plate('cheek '+str(side),[(side*1.15,31.6),(side*.99,30.8),(side*.48,30.45),(side*.66,31.35)],.5,B,'head',(0,0,2.4),ridge=.12)
 k.plate('jaw '+str(side),[(side*.98,30.7),(side*.79,29.55),(side*.25,29.23),(side*.28,30.2)],.7,B,'head',(0,0,2.2),ridge=.15)
 k.plate('hood trim '+str(side),[(side*1.42,29.3),(side*1.65,33.5),(side*1.99,33.5),(side*1.73,29.85)],.45,G,'head',(0,0,2.1),ridge=.05)
k.plate('nasal bridge',[(-.16,31.85),(0,32.25),(.16,31.85),(.14,31.1),(0,31.36),(-.14,31.1)],.6,B,'head',(0,0,2.6),ridge=.1)
for i in range(7):
 x=(i-3)*.19
 k.box('upper tooth '+str(i),(x,30.55,2.79),(.14,.39,.3),B,'head',.03)
 k.box('lower tooth '+str(i),(x,30.01,2.69),(.14,.27,.3),B,'head',.03)
# Nine illuminated cathedral spires: five above the head and two per shoulder.
def tower(name,x,y,z,h,bone):
 k.loft(name+' tower',[(y,.32,.42,x,z),(y+h,.29,.35,x,z)],S,bone,4)
 k.box(name+' window',(x,y+h*.53,z+.36),(.13,h*.65,.08),F,bone,.02)
 k.loft(name+' collar',[(y,.52,.52,x,z),(y+.22,.52,.52,x,z)],G,bone,6)
 k.loft(name+' roof',[(y+h,.51,.51,x,z),(y+h+1.45,0,0,x,z)],G,bone,4)
for i in range(-2,3):tower('crown '+str(i),i*.95,33.7,-.1,2.9-abs(i)*.63,'head')
k.loft('crown coronet',[(33.35,2.7,2.1,0,0),(33.9,2.8,2.15,0,0)],G,'head',8)
for side,n in [(-1,'R'),(1,'L')]:
 ua='upperarm_'+n;fa='forearm_'+n;hand='hand_'+n;th='thigh_'+n;shin='shin_'+n;foot='foot_'+n
 k.loft('upper arm '+n,[(23.6,1.18,1.4,side*7.2,0),(24.9,1.5,1.8,side*6.9,0),(26.2,1.85,2.1,side*6.4,0),(27.2,1.65,1.9,side*6.1,0),(28.6,1.7,1.8,side*5.7,0)],S,ua,8)
 k.loft('elbow '+n,[(23.25,1.1,1.3,side*7.3,.1),(24.5,1.25,1.45,side*7.05,.1)],D,fa,8)
 k.loft('forearm '+n,[(19.6,1.25,1.5,side*8.7,.3),(20.5,1.55,1.9,side*8.5,.2),(21.5,2,2.3,side*8.15,.2),(22.6,1.7,1.85,side*7.75,.1),(23.2,1.45,1.6,side*7.55,.1)],S,fa,8)
 k.loft('elbow cuff '+n,[(22.6,1.5,1.65,side*7.7,.15),(23.3,1.5,1.65,side*7.45,.15)],G,fa,8)
 shoulder=[(-1.9,.35),(-.4,2.4),(2.2,.35),(1.4,-1.55),(-.5,-1.4)]
 if side<0:shoulder=[(-x,y) for x,y in shoulder]
 k.plate('pauldron gold '+n,shoulder,3.2,G,ua,(side*5.7,28.5,.35),ridge=.4)
 k.plate('pauldron slate '+n,[(x*.77,y*.77) for x,y in shoulder],1.6,E,ua,(side*5.7,28.5,1.7),ridge=.3)
 k.plate('pauldron diamond '+n,[(0,.45),(.3,0),(0,-.45),(-.3,0)],.1,G,ua,(side*5.7,28.7,2.85),ridge=.1)
 for i in range(2):tower('shoulder %s %s'%(n,i),side*(5+i*1.1),29.7,-.2,2.8-i*1.5,ua)
 # Gauntlet fingers curl over a transverse handle. They are separate, jointed volumes.
 k.loft('palm '+n,[(18.2,1.5,1.25,side*8.95,1),(20,1.4,1.5,side*8.65,.6)],D,hand,8)
 for finger in range(4):
  x=side*(7.8+finger*.72)
  k.beam('finger proximal '+n+str(finger),(x,19.4,1.5),(x,18.5,2.6),.4,E,hand)
  k.beam('finger distal '+n+str(finger),(x,18.5,2.6),(x,17.7,2.35),.32,S,hand)
 k.beam('thumb '+n,(side*7.45,19.2,1.4),(side*7.4,18.1,2.1),.43,E,hand)
 shield=[(-1.5,6),(-2.15,4.8),(-1.25,-5.2),(0,-6.6),(1.25,-5.2),(2.15,4.8),(1.5,6)]
 k.plate('coffin shield gold '+n,shield,1.05,G,hand,(side*9.2,12.6,2.25),bevel=.16,ridge=.16)
 k.plate('coffin shield inset '+n,[(x*.78,y*.88) for x,y in shield],.5,S,hand,(side*9.2,12.6,2.99),ridge=.35)
 k.plate('shield diamond '+n,[(0,1.3),(.68,0),(0,-1.3),(-.68,0)],.28,G,hand,(side*9.2,15.2,3.52),ridge=.15)
 k.beam('shield gold spine '+n,(side*9.2,6.9,3.37),(side*9.2,17.9,3.37),.1,G,hand)
 for i in range(14):
  t=i/13;x=side*(7.5+t*3);y=28.5-t*9.5;z=.5+math.sin(t*math.pi)*.5
  k.torus('arm chain %s %s'%(n,i),(x,y,z),.32,.09,G,ua if i<6 else fa,rotate=i%2==1)
 k.loft('thigh '+n,[(11.8,1.5,1.8,side*4.8,0),(14,1.8,2.1,side*4.5,0),(16.8,2.15,2.35,side*3.9,0),(18.7,1.7,1.8,side*3.45,0),(20,1.6,1.9,side*3.2,0)],S,th,8)
 k.plate('thigh chevron '+n,[(-1.9,-2.2),(0,2.4),(1.9,-2.2),(0,-.4)],.75,E,th,(side*4.2,15.8,1.5),ridge=.8)
 k.plate('thigh trim '+n,[(-1.9,-2.2),(0,2.4),(1.9,-2.2),(0,.2)],.22,G,th,(side*4.2,15.8,2),ridge=.4)
 k.loft('knee '+n,[(10.4,1.65,1.85,side*5,0),(12,1.8,2,side*4.8,0),(13.2,1.25,1.4,side*4.65,0)],D,shin,8)
 k.plate('kneecap '+n,[(-1.55,0),(0,1.8),(1.55,0),(0,-1.8)],1.3,E,shin,(side*4.85,11.7,1.5),ridge=.6)
 k.loft('calf '+n,[(2.6,1.4,1.75,side*5.8,0),(4.2,1.65,1.9,side*5.6,0),(7.5,1.95,2.3,side*5.3,0),(9.6,1.55,1.85,side*5.1,0),(10.7,1.55,1.8,side*5,0)],S,shin,8)
 greave=[(-1.5,3),(0,4.3),(1.5,3),(.75,-2.9),(0,-4),(-.75,-2.9)]
 k.plate('greave gold '+n,greave,.5,G,shin,(side*5.4,6.9,1.75),ridge=.35)
 k.plate('greave slate '+n,[(x*.72,y*.78) for x,y in greave],.5,E,shin,(side*5.4,6.9,2.05),ridge=.6)
 k.loft('instep '+n,[(.4,2.1,2.5,side*5.8,1.2),(1.5,1.9,2.7,side*5.8,1),(3.5,1.5,1.9,side*5.8,.15)],S,foot,8)
 for i in range(3):
  x=side*5.8+(i-1)*1.75
  k.loft('claw toe %s %s'%(n,i),[(.08,.8,2.35,x,2.85),(.65,.96,2.25,x,2.7),(2.1,.65,1.5,x,1.8)],E,foot,6)
  k.plate('toe gold %s %s'%(n,i),[(-.14,-.55),(0,.8),(.14,-.55)],.1,G,foot,(x,1.4,3.6),ridge=.06)
# Layered armour plates wrap the joint volumes rather than forming one flat shell.
for side,n in [(-1,'R'),(1,'L')]:
 ua='upperarm_'+n;fa='forearm_'+n;shin='shin_'+n;foot='foot_'+n
 for i in range(3):
  xx=side*(5.9+i*.5);yy=27.1-i*1.25
  pts=[(-1.6,.1),(-.85,1.15),(.8,.85),(1.65,-.1),(1,-1.1),(-1,-.7)]
  k.plate('bicep armour %s %s'%(n,i),pts,1.1,E if i%2==0 else S,ua,(xx,yy,1.4),bevel=.15,ridge=.5)
 gaunt=[(-1.5,-1.9),(-2,.1),(-.7,2),(.8,2.2),(1.7,.3),(1.5,-1.7),(0,-2.4)]
 k.plate('gauntlet cuff gold '+n,gaunt,.55,G,fa,(side*8.1,21.2,1.4),bevel=.12,ridge=.25)
 k.plate('gauntlet outer stone '+n,[(x*.79,y*.78) for x,y in gaunt],1,S,fa,(side*8.1,21.2,2),bevel=.18,ridge=.6)
 for i in range(2):
  y=3.4+i*1.15;x=side*(5.8-i*.15)
  k.plate('ankle arch '+n+str(i),[(-1.7,-.7),(0,.95),(1.7,-.7),(1.1,-1.25),(0,-.3),(-1.1,-1.25)],.8,E,shin,(x,y,1.35),ridge=.25)
 k.plate('instep gold chevron '+n,[(-1.7,-.2),(0,1.1),(1.7,-.2),(1.35,-.55),(0,.5),(-1.35,-.55)],.35,G,foot,(side*5.8,2.8,1.85),ridge=.2)
 for i in range(4):
  x=side*(7.8+i*.72)
  k.loft('knuckle %s %s'%(n,i),[(18.55,.43,.43,x,2.4),(18.95,.53,.53,x,2.25),(19.3,.33,.33,x,2)],E,'hand_'+n,6)
# Chiselled forehead seam and individual nasal sides keep eye and nose cavities distinct.
for side in [-1,1]:
 k.plate('maxilla '+str(side),[(side*.1,30.88),(side*.42,31.28),(side*.69,30.89),(side*.6,30.72),(side*.14,30.72)],.45,B,'head',(0,0,2.7),bevel=.04,ridge=.07)
# Join by material, retaining vertex groups so the GLB draws only seven skinned meshes.
meshes=k.join_slots();rk.bind(meshes,arm)
from vharos_animation import author_actions
actions=author_actions(arm);rk.stash(arm,actions)
arm.animation_data.action=None;rk.rest_pose(arm);bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART,'vharos.blend'))
rk.export_glb(os.path.join(OUT,'vharos.glb'))
report={'vertices':sum(len(o.data.vertices) for o in meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'bones':len(arm.data.bones),'materials':len(meshes),'clips':{a.name:float(a.frame_range[1]-a.frame_range[0])/30 for a in actions}}
open(os.path.join(ART,'vharos-build.json'),'w').write(json.dumps(report,indent=2))
print('VHAROS_BUILD',json.dumps(report))
