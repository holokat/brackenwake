"""Braced three-storey gallery, fitted ironwork, stairs, rails and winch."""
import math,random
from geometry import rotate_y


def timber(g,name,a,b,width=.24):
    g.beam('timber',a,b,width,4,shade=.8+g.random.random()*.3)


def bolt(g,p,axis='z',radius=.085):
    d=[0,0,0];d['xyz'.index(axis)]=.12
    g.beam('iron',tuple(p[i]-d[i] for i in range(3)),tuple(p[i]+d[i] for i in range(3)),radius,6)


def gallery(g):
    # Generous 6 m headroom and three walkable decks. The existing mine keeps
    # its other six decks, while this landmark supplies three detailed ones.
    for x in [-31.5,-22.5]:
        for z in [-17,-9,-1,9]:
            g.box('timber',(x,9,z),(.7,18.8,.7),bevel=.08)
            g.body('Widow timber pier',(x,9,z),(.7,18,.7))
            for y in [.4,5.7,11.7,17.7]:
                g.box('iron',(x,y,z),(.79,.25,.8))
                for sx in [-.2,.2]:bolt(g,(x+sx,y,z+.44))
    for level in [6,12,18]:
        for j in range(48):
            z=-18+j*.58
            g.box('timber',(-27,level-.17,z),(10,.34,.54),bevel=.055,shade=.72+(j%7)*.05)
            for x in [-31,-23]:bolt(g,(x,level+.015,z),'y',.055)
        g.body('mine scaffold deck',(-27,level-.2,-4),(10,.4,28))
        for z in [-17,-9,-1,9]:
            g.box('timber',(-27,level-.55,z),(11,.6,.7),bevel=.06)
            timber(g,'brace',(-31.5,level-5.6,z),(-22.5,level-.6,z),.23)
        for x in [-31.5,-22.5]:
            for z in [-17,-9,-1]:
                timber(g,'long brace',(x,level-5.6,z),(x,level-.5,z+8),.18)
        # Handrails are interrupted only at the matching staircase landings.
        for x in [-31.7,-22.3]:
            for a,b in [(-14,-6),(-2,8)]:
                g.box('timber',(x,level+1.1,(a+b)/2),(.18,.18,b-a))
                g.body('Widow gallery rail',(x,level+.55,(a+b)/2),(.18,1.1,b-a))
                for z in range(a,b+1,2):g.box('timber',(x,level+.55,z),(.16,1.1,.16))
    for flight in range(3):
        x=-19+3.5*(flight%2);start=9 if flight%2==0 else -15;direction=-1 if flight%2==0 else 1
        for i in range(80):
            y=flight*6+(i+1)*.075;z=start+direction*i*.3
            g.box('timber',(x,y-.08,z),(3,.16,.19),bevel=.025,shade=.83+(i%5)*.035)
        for side in [-1.4,1.4]:
            timber(g,'stringer',(x+side,flight*6-.13,start),(x+side,(flight+1)*6-.13,start+direction*24),.18)
            timber(g,'rail',(x+side,flight*6+1.1,start),(x+side,(flight+1)*6+1.1,start+direction*24),.095)
            for i in range(8):g.box('timber',(x+side,flight*6+i*.75+.55,start+direction*i*3),(.13,1.1,.13))
        g.colliders.append(dict(kind='ramp',model='mine stair',x=x,y=flight*6,z=-3,w=3,d=24,h=6,direction=direction,thickness=.35,c=1,s=0))
        z=start+direction*24
        g.box('timber',(-19.5,(flight+1)*6-.2,z+direction),(9,.4,2))
        g.body('scaffold landing',(-19.5,(flight+1)*6-.2,z+direction),(9,.4,2))
    # Winch axle, cheeks, spiral cable, eight-spoked wheels and braces.
    for x in [-25.4,-21.8]:
        g.box('timber',(x,19.4,-12),(.55,2.6,2.8))
        g.torus('iron',(x,20,-12),1.3,.13,'x',segments=24)
        for i in range(8):
            a=i*math.tau/8
            g.beam('iron',(x,20,-12),(x,20+math.cos(a)*1.2,-12+math.sin(a)*1.2),.055)
    g.beam('iron',(-26,20,-12),(-20.8,20,-12),.18)
    for i in range(19):g.torus('rope',(-25+i*.16,20,-12),.87,.085,'x')
    timber(g,'jib',(-23,18,-14),(-13.5,22,-14),.28)
    timber(g,'jib support',(-23,15,-14),(-13.5,22,-14),.25)
    g.torus('iron',(-13.5,21.6,-14),.65,.12,'z',segments=20)
    g.beam('rope',(-23,20,-12),(-13.5,22,-14),.06)
    for i in range(35):g.torus('iron',(-13.5,21.2-i*.19,-14),.15,.042,'x' if i%2 else 'z',stretch=1.35,segments=8)
    # Moving cage has its own batch and runtime pivot; chain end stays attached.
    cx,cy,cz=-13.5,12.5,-14
    for y in [-1.4,1.4]:g.box('cage_iron',(cx,cy+y,cz),(2.8,.15,2.5))
    for x in [-1.3,1.3]:
        for z in [-1.15,1.15]:g.box('cage_iron',(cx+x,cy,cz+z),(.16,2.8,.16))
    for i in range(9):
        for z in [-1.2,1.2]:g.box('cage_iron',(cx-1.2+i*.3,cy,cz+z),(.06,2.8,.06))
    for x in [-1.3,1.3]:
        for i in range(7):g.box('cage_iron',(cx+x,cy,cz-1+i*.33),(.06,2.8,.06))
    g.torus('cage_iron',(cx,cy+1.75,cz),.3,.065,'z',segments=12)
    g.anchor('cage',(cx,cy,cz),pivotY=14)


def track(g,points):
    for a,b in zip(points,points[1:]):
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz);angle=math.atan2(dx,dz)
        for i in range(math.ceil(length/.9)):
            t=i/math.ceil(length/.9);x=a[0]+dx*t;z=a[1]+dz*t
            g.box('timber',(x,.14,z),(3.2,.22,.26),angle,shade=.7+(i%4)*.07)
            for side in [-1,1]:
                px=x+math.cos(angle)*side;pz=z-math.sin(angle)*side
                g.box('iron',(px,.31,pz),(.15,.2,length/math.ceil(length/.9)+.04),angle)
                g.box('iron',(px,.18,pz),(.28,.06,.32),angle)
                bolt(g,(px,.35,pz),'y',.055)


def cart(g,c,yaw=0,seed=0):
    rng=random.Random(seed)
    def box(key,p,size):
        p=rotate_y(p,yaw);g.box(key,tuple(c[i]+p[i] for i in range(3)),size,yaw,shade=.85+rng.random()*.2)
    box('timber',(0,.75,0),(2.7,.2,3.7))
    for side in [-1,1]:
        for i in range(8):box('timber',(side*1.3,1.4,-1.57+i*.45),(.16,1.2,.4))
        for i in range(6):box('timber',(-1.12+i*.45,1.4,side*1.8),(.4,1.2,.16))
        for y in [.93,1.9]:
            box('iron',(side*1.4,y,0),(.07,.14,3.85));box('iron',(0,y,side*1.9),(2.85,.14,.07))
        for z in [-1.18,1.18]:
            p=rotate_y((side*1.48,.5,z),yaw);p=tuple(c[i]+p[i] for i in range(3))
            g.torus('iron',p,.48,.12,'x',segments=14)
            for j in range(6):
                a=j*math.tau/6;q=(p[0],p[1]+math.sin(a)*.44,p[2]+math.cos(a)*.44)
                g.beam('iron',p,q,.05)
    for i in range(16):
        p=rotate_y((rng.uniform(-1,1),rng.uniform(1.1,1.75),rng.uniform(-1.4,1.4)),yaw)
        g.rock('iron_ore',tuple(c[k]+p[k] for k in range(3)),(.7,.6,.7),seed+i,.75+rng.random()*.4)
    g.body('Widow ore wagon',(c[0],c[1]+1,c[2]),(2.7,2,3.6))
    g.anchor('cart',c)


def build(g):
    gallery(g)
    track(g,[(-6,30),(-6,18),(-5,6),(-4,-6),(-3,-17)])
    track(g,[(-6,20),(-14,17),(-25,15),(-39,13),(-44,12)])
    track(g,[(-6,19),(5,17),(18,16),(30,14),(44,12)])
    for c,a,s in [((-28,0,14),math.pi/2,1),((-22,0,13),math.pi/2,2),((-10,0,-5),.1,3),((26,0,13),math.pi/2,4)]:cart(g,c,a,s)
    # Tunnel shoring ties the art directly into the existing east/west exits.
    for side in [-1,1]:
        for x in [35,39,43]:
            for z in [7,19]:
                g.box('timber',(x*side,4.2,z),(.7,8.4,.7))
                g.body('Widow tunnel timber',(x*side,4.2,z),(.7,8.4,.7))
            g.box('timber',(x*side,8.3,13),(.8,.8,13))
            for z in [7,19]:timber(g,'corner',(side*x,6,z),(side*x,8.3,z+(2 if z==7 else -2)),.24)
