"""Grounded cellar fittings, suspended lanterns, and accessible nave galleries."""
import math,random

def barrel(g,p,r=.8,length=1.6,axis='y'):
    x,y,z=p;n=14
    def at(u,v,w):
        return (x+u,y+w,z+v) if axis=='y' else (x+w,y+u,z+v)
    profile=[(-length/2,.82),(-length*.36,.98),(0,1.05),(length*.36,.98),(length/2,.82)]
    for i in range(n):
        a=math.tau*i/n+.013;b=math.tau*(i+1)/n-.013;vv=[]
        for yy,rr in profile:
            for angle in [a,b]:vv.append(at(math.cos(angle)*r*rr,math.sin(angle)*r*rr,yy))
        g.mesh('wood',vv,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],.62+g.random.random()*.35)
    for d in [-.49,-.28,.28,.49]:
        rr=r*(.83 if abs(d)>.4 else 1.03)
        centre=(x,y+length*d,z) if axis=='y' else(x+length*d,y,z)
        g.torus('iron',centre,rr,.045,axis=axis,segments=18)
    for side in [-1,1]:
        points=[at(math.cos(i*math.tau/n)*r*.82,math.sin(i*math.tau/n)*r*.82,side*length/2) for i in range(n)]
        g.mesh('wood',points,[tuple(range(n))],.8)
    if axis=='y':g.body('Standing cask',p,(r*2,length,r*2))

def crate(g,x,y,z,size=2,yaw=0):
    g.box('wood',(x,y+size*.5,z),(size,size,size),yaw,bevel=.05,shade=.65)
    for i in range(6):
        g.box('wood',(x-size/2+(i+.5)*size/6,y+size/2,z+size/2+.015),(size/6-.03,size-.1,.09),yaw,shade=.75+(i%3)*.08)
    for side in [-1,1]:
        for yy in [.1,size-.1]:g.box('timber',(x,y+yy,z+side*size/2),(size,.16,.17),yaw)
        g.beam('timber',(x-size*.44,y+.15,z+side*size*.51),(x+size*.44,y+size-.15,z+side*size*.51),.09,4)
    g.body('Storage crate',(x,y+size/2,z),(size,size,size))

def lantern(g,x,y,z,top):
    # All links end at a ceiling beam or a masonry bracket.
    for yy in [y+.9+i*.25 for i in range(max(1,int((top-y-.9)/.25)))]:g.torus('iron',(x,yy,z),.085,.022,axis='x' if int(yy*4)%2 else 'z',stretch=1.4,segments=8)
    for yy in [-.55,.55]:g.box('iron',(x,y+yy,z),(.65,.12,.65),bevel=.05)
    for a in [-1,1]:
        for b in [-1,1]:g.beam('iron',(x+a*.28,y-.55,z+b*.28),(x+a*.28,y+.55,z+b*.28),.036,4)
    g.rock('glow',(x,y,z),(.25,.8,.25),seed=int((x+z)*21))
    g.box('iron',(x,y+.76,z),(.48,.3,.48),bevel=.12)
    g.anchor('lamp',(x,y,z),ceiling=top)
    # Horizontal forged brackets terminate in the actual wall or pier.
    if abs(x)>20:wall=math.copysign(35,x)
    elif abs(x)>10:wall=math.copysign(18.92,x)
    elif x:wall=math.copysign(5.7,x)
    else:wall=None
    if wall is not None:g.beam('iron',(x,top,z),(wall,top,z),.065,6)

def candle(g,x,y,z,h=.45):
    g.beam('wax',(x,y,z),(x,y+h,z),.065,8)
    g.rock('glow',(x,y+h+.13,z),(.07,.27,.07))

def bottle(g,x,y,z,scale=1):
    g.beam('bottle',(x,y,z),(x,y+.48*scale,z),.16*scale,8)
    g.beam('bottle',(x,y+.48*scale,z),(x,y+.7*scale,z),.07*scale,8)
    g.beam('wood',(x,y+.67*scale,z),(x,y+.75*scale,z),.06*scale,8)

def brazier(g,x,y,z):
    for a in range(4):
        angle=a*math.pi/2;dx=math.sin(angle)*.6;dz=math.cos(angle)*.6
        g.beam('iron',(x+dx,y,z+dz),(x+dx*.7,y+1.5,z+dz*.7),.085,6)
    g.torus('iron',(x,y+1.5,z),.62,.07,axis='y')
    g.rock('coal',(x,y+1.3,z),(1.05,.45,1.05),seed=int(x*31+z))
    g.anchor('fire',(x,y+1.5,z),intensity=2.2)
    g.body('Iron brazier',(x,y+.8,z),(1.3,1.6,1.3))

def stairs(g,x,z,start=-3,rise=7,length=22,width=5):
    n=70
    for i in range(n):
        t=(i+.5)/n;g.box('trim',(x,start+rise*t-.10,z-length*t),(width,.2,length/n+.025),bevel=.025,shade=.86+(i%3)*.035)
    g.colliders.append(dict(kind='ramp',model='Nave gallery stair',x=x,y=start,z=z-length/2,w=width,d=length,h=rise,direction=-1,thickness=.4,c=1,s=0))
    for side in [-1,1]:
        sx=x+side*(width/2-.15)
        g.beam('trim',(sx,start+1.1,z),(sx,start+rise+1.1,z-length),.13,6)
        for i in range(16):
            t=i/15;g.box('trim',(sx,start+rise*t+.5,z-length*t),(.2,1,.2))
        # Solid carved stringer reaches the floor instead of unsupported treads.
        g.mesh('limestone',[(sx-.3,start,z),(sx+.3,start,z),(sx+.3,start+rise,z-length),(sx-.3,start+rise,z-length),(sx-.3,start,z-length),(sx+.3,start,z-length)],[(0,1,2,3),(3,2,5,4),(0,4,5,1),(0,3,4),(1,5,2)])

def banner(g,x,y,z,w=1.8,h=7):
    vv=[]
    for row in range(9):
        for col in range(5):
            u=col/4;v=row/8
            vv.append((x+(u-.5)*w,y-h*v,z+.12*math.sin(u*math.pi*5+v)*v))
    ff=[]
    for row in range(8):
        for col in range(4):
            i=row*5+col;ff.append((i,i+1,i+6,i+5))
    g.mesh('cloth',vv,ff)
    g.beam('iron',(x-w*.65,y+.1,z),(x+w*.65,y+.1,z),.06,6)
    g.beam('iron',(x,y+.1,z-.8),(x,y+.1,z),.06,6)

def build(g,layout):
    # Entry rack bays fit between the structural piers.
    for side in [-1,1]:
        x=side*18.4
        for zz in [-8,8]:
            for z in [zz-3.5,zz+3.5]:g.box('timber',(x,3.6,z),(3.5,7.2,.32),bevel=.06)
            for row in range(3):
                yy=.25+row*2.15
                g.box('timber',(x,yy,zz),(3.7,.24,7.4))
                for n in range(3):barrel(g,(x,yy+.98,zz+(n-1)*2.15),.92,2.9,'x')
            g.body('Wine rack',(x,3.6,zz),(3.8,7.2,7.5))
        crate(g,side*14,0,14,2.2)
        barrel(g,(side*16,1.1,12),.85,2.2)
        # Wheel resting on a crate, with radial spokes.
        wx=side*14;wy=3.3;wz=14.1
        g.torus('wood',(wx,wy,wz),1.25,.12,axis='z',segments=20)
        g.torus('iron',(wx,wy,wz),1.36,.04,axis='z',segments=20)
        for n in range(10):
            a=n*math.tau/10;g.beam('timber',(wx,wy,wz),(wx+math.cos(a)*1.22,wy+math.sin(a)*1.22,wz),.045,4)
        for zz in [-13.6,0,13.6]:lantern(g,side*16.5,6.7,zz,9)
        for zz in [-12,-3,6,15]:
            g.box('dark',(side*7,.013,zz),(1,.02,8.9))
            for i in range(18):g.box('iron',(side*7,.035,zz-4.4+i*.5),(1.05,.055,.09))
        for zz in [-20,-42]:lantern(g,side*4.5,5 if zz==-20 else 2,zz,8 if zz==-20 else 5)
    for zz in [-5,-31]:lantern(g,0,10 if zz==-5 else 4,zz,18 if zz==-5 else 8.7)
    # Nave gallery architecture is supported by arches, piers and continuous stairs.
    for side in [-1,1]:
        x=side*28;deckY=4
        g.box('limestone',(x,deckY-.55,-75),(10,1.1,24),bevel=.1)
        g.body('Nave gallery',(x,deckY-.55,-75),(10,1.1,24))
        stairs(g,side*22,-44,length=20)
        for zz in [-65,-75,-85]:
            g.box('limestone',(x,-.2,zz),(1.8,5.5,1.8),bevel=.1)
            g.body('Gallery pier',(x,-.2,zz),(1.8,5.5,1.8))
        for zz in range(-86,-66,2):
            # Leave the stair landing at the south end unrailed.
            g.box('trim',(side*23,4.6,zz),(.24,1.2,.24))
        g.box('timber',(side*23,5.3,-77),(.23,.22,20))
        g.body('Gallery parapet',(side*23,4.75,-77),(.28,1.5,20))
        for zz in [-89,-51]:
            # Camp fittings stay off all four main passages.
            tx=side*15
            for dx in [-1.5,1.5]:
                for dz in [-.7,.7]:g.box('timber',(tx+dx,-2.1,zz+dz),(.16,1.8,.16))
            g.box('wood',(tx,-1.16,zz),(3.6,.16,1.9))
            g.body('Bandit table',(tx,-2,zz),(3.6,2,1.9))
            for dx in [-1,0,1]:bottle(g,tx+dx,-1.06,zz,.8)
            candle(g,tx+.6,-1.05,zz+.4,.6)
            for dz in [-1.8,1.8]:g.box('wood',(tx,-2.3,zz+dz),(3,.25,.55))
        for xx,zz in [(side*28,-91),(side*31,-54),(side*18,-91)]:
            barrel(g,(xx,-1.9,zz),.9,2.2);crate(g,xx-side*2.1,-3,zz,1.8)
        for zz in [-86,-70,-54]:
            lantern(g,side*29.5,8,zz,11)
            if zz!=-70:banner(g,side*29.5,12,zz+1.2,2.2,6)
        for zz in [-88,-51]:brazier(g,side*10,-3,zz)
    # Octagonal dry fountain and a broken pedestal, firmly on the nave floor.
    for radius,yy,thick in [(4.8,-2.82,.23),(4.4,-2.45,.35),(4.2,-1.9,.35),(4.25,-1.3,.42)]:
        for i in range(8):
            a=(i+.5)*math.tau/8;g.box('trim',(math.cos(a)*radius,yy,-70+math.sin(a)*radius),(radius*.81,thick,.65),math.pi/2-a,bevel=.09)
    g.rock('limestone',(0,-1.2,-70),(2.2,3.6,2.2),seed=61)
    g.colliders.append(dict(kind='circle',model='Dry octagonal fountain',x=0,y=-3,z=-70,r=5,h=3.6))
    for i in range(28):
        a=i*2.4;r=3.1+(i%3)*.8;g.rock('rubble',(math.sin(a)*r,-2.65,-70+math.cos(a)*r),(.35+(i%4)*.17,.45,.65),seed=i)
    # Grounded debris at room edges, never random floating silhouettes.
    for room in layout['rooms']:
        for i in range(70):
            a=i*2.399;r=.91+.035*math.sin(i)
            x=room['x']+math.cos(a)*room['rx']*r;z=room['z']+math.sin(a)*room['rz']*r
            if any(abs(x-room['x']-d['x'])<8 and abs(z-room['z']-d['z'])<8 for d in room['doors']):continue
            g.rock('rubble',(x,room['y']+.14,z),(.3+(i%5)*.22,.3+(i%3)*.13,.6),seed=i+room['id']*90,shade=.7+g.random.random()*.3)
