"""Reference details: silk, cocoons, eggs, lanterns and discarded equipment."""
import math,random
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def lantern(g,p,scale=1):
    x,y,z=p;s=scale
    g.box('iron',(x,y-.6*s,z),(.55*s,.12*s,.55*s))
    g.box('iron',(x,y+.65*s,z),(.7*s,.15*s,.7*s))
    g.rock('lantern_glow',(x,y,z),(.37*s,1.05*s,.37*s),31)
    for dx in [-.26,.26]:
        for dz in [-.26,.26]:g.beam('iron',(x+dx*s,y-.55*s,z+dz*s),(x+dx*s,y+.6*s,z+dz*s),.035*s,5)
    g.torus('iron',(x,y+.84*s,z),.19*s,.04*s,'z',segments=10)
    for yy in [-.25,.25]:g.box('iron',(x,y+yy*s,z),(.61*s,.045*s,.61*s))
    g.anchor('lamp',(x,y,z),color=0xffb363,intensity=75)


def brazier(g,x,z):
    for y in [.35,1.05,1.75]:g.rock('stone_arch',(x,y,z),(2.6,.85,2.6),int(y*100),.88)
    for h,r in [(2.3,1.18),(2.7,1.12)]:g.torus('iron',(x,h,z),r,.08,'y',segments=18)
    for i in range(12):
        a=i*math.tau/12
        g.beam('iron',(x+math.cos(a)*.7,2,z+math.sin(a)*.7),(x+math.cos(a)*1.2,2.85,z+math.sin(a)*1.2),.065)
    for i in range(9):
        a=i*2.4;r=.3+(i%3)*.18
        g.rock('flame',(x+math.cos(a)*r,2.65+(i%2)*.18,z+math.sin(a)*r),(.35,1+(i%3)*.25,.3),i)
    g.anchor('fire',(x,2.65,z),color=0xff9a44,intensity=110)
    g.body('Widow brazier',(x,1,z),(2.5,2,2.5))


def crate(g,c,s=1.5):
    x,y,z=c
    for i in range(6):
        u=(i/5-.5)*s*.85
        for side in [-1,1]:
            g.box('timber',(x+u,y+s*.5,z+side*s*.47),(s*.15,s,.12),shade=.75+i*.055)
            g.box('timber',(x+side*s*.47,y+s*.5,z+u),(.12,s,s*.15),shade=.87)
        g.box('timber',(x+u,y+s,z),(s*.15,.12,s),shade=.9)
    for side in [-1,1]:
        g.beam('timber',(x-s*.4,y+.12,z+side*s*.55),(x+s*.4,y+s-.12,z+side*s*.55),.13,4)
    g.body('Widow crate',(x,y+s/2,z),(s,s,s))


def barrel(g,c,s=1):
    x,y,z=c
    for i in range(14):
        a=i*math.tau/14;b=(i+.88)*math.tau/14;vv=[]
        for h,r in [(0,.56),(.25,.66),(1.1,.72),(1.9,.59)]:
            vv.extend([(x+math.cos(t)*r*s,y+h*s,z+math.sin(t)*r*s) for t in [a,b]])
        g.mesh('timber',vv,[(0,1,3,2),(2,3,5,4),(4,5,7,6)],.72+(i%5)*.06)
    for h,r in [(.22,.66),(.7,.71),(1.52,.65),(1.82,.61)]:g.torus('iron',(x,y+h*s,z),r*s,.05*s,'y',segments=18)
    g.rock('timber',(x,y+1.84*s,z),(1.1*s,.08,1.1*s),17,.7)
    g.body('Widow barrel',(x,y+.95*s,z),(1.3*s,1.9*s,1.3*s))


def web(g,anchors,seed):
    rng=random.Random(seed)
    attached=[]
    for p in anchors:
        point,normal,_,distance=g.rock_tree.find_nearest(Vector(p))
        if point is None:raise ValueError('No rock for web attachment')
        attached.append(tuple(point))
        g.anchor('webAnchor',tuple(point),normal=list(normal),offset=distance)
    a,b,c,d=attached;rows=[];n=28
    for i in range(n+1):
        row=[]
        for j in range(n+1):
            edge=min(i,j,n-i,n-j)
            u=(i+rng.uniform(-.44,.44)*(edge>0))/n
            v=(j+rng.uniform(-.44,.44)*(edge>0))/n
            p=tuple(a[k]*(1-u)*(1-v)+b[k]*u*(1-v)+c[k]*u*v+d[k]*(1-u)*v for k in range(3))
            sag=math.sin(u*math.pi)*math.sin(v*math.pi)
            row.append((p[0]+sag*math.sin(v*11)*.6,p[1]-sag*3.2,p[2]+sag*.8))
        rows.append(row)
    # A torn sheet network, not concentric rings or a rectangular woven net.
    for i in range(n):
        for j in range(n):
            if rng.random()<.27:continue
            a,b,c,d=rows[i][j],rows[i+1][j],rows[i+1][j+1],rows[i][j+1]
            diagonal=(a,c) if rng.random()<.5 else (b,d)
            g.line('silk_threads',diagonal,rng.uniform(.005,.014),3)
            if rng.random()<.64:g.line('silk_threads',[a,b],.007,3)
            if rng.random()<.5:g.line('silk_threads',[a,d],.006,3)
            if rng.random()<.23:g.mesh('silk_veil',[a,b,c,d],[(0,1,2),(0,2,3)],rng.uniform(.4,1))
    for edge in [rows[0],rows[-1],[r[0] for r in rows],[r[-1] for r in rows]]:g.line('silk_threads',edge,.018,3)


def cocoon(g,p,h,seed):
    x,y,z=p
    top=Vector((x,y+h*.55,z));point,normal,_,distance=g.rock_tree.ray_cast(top,Vector((0,1,0)))
    if point is None:point,normal,_,distance=g.rock_tree.find_nearest(top)
    g.beam('silk_threads',tuple(top),tuple(point),.025,5)
    g.anchor('cocoonAnchor',tuple(point),normal=list(normal))
    g.rock('silk_cocoon',(x,y,z),(h*.38,h,h*.35),seed)
    for i in range(20):
        yy=-h*.42+i*h*.044;r=math.sin((i+1)/22*math.pi)*h*.2
        g.torus('silk_threads',(x,y+yy,z),max(.03,r),.013,'y',segments=12)


def build(g):
    rng=random.Random(918)
    vertices=[];faces=[]
    for key,(vv,ff,_) in g.parts.items():
        if key not in ['stone_shell','stone_walls','stone_arch','stone_nursery','stone_ceiling']:continue
        offset=len(vertices);vertices.extend(vv);faces.extend(tuple(offset+i for i in f) for f in ff)
    g.rock_tree=BVHTree.FromPolygons(vertices,faces)
    for p in [(-22,4,-14),(-22,10,-14),(-22,16,-14),(-22,4,3),(-22,10,3),(-22,16,3),(-31,4,13),(36,4,8),(-36,4,8),(14,4,-20)]:lantern(g,p,1.15)
    for x in [-14,8]:brazier(g,x,-12)
    # Silk nests span actual ledges and stone columns on the room's right.
    web(g,[(16,21,-18),(33,25,-19),(35,13,-8),(22,7,-8)],2)
    web(g,[(27,16,-9),(39,21,-5),(37,5,4),(25,5,0)],6)
    web(g,[(-13,22,-18),(-5,28,-19),(7,21,-18),(-3,15,-19)],9)
    web(g,[(-14,17,-18),(-10,20,-18),(-8,7,-19),(-14,3,-18)],11)
    web(g,[(23,30,-20),(35,35,-13),(39,24,-4),(32,16,-9)],14)
    for i,p in enumerate([(23,16,-9),(32,23,-15),(35,14,-5),(29,28,-15),(12,20,-20)]):cocoon(g,p,2.4+(i%3)*.7,800+i)
    for x,y,z in [(26,6.3,-8),(34,12.4,-18),(20,5.4,-21),(32,.1,1)]:
        for i in range(12):
            a=i*2.4;r=.25+math.sqrt(i)*.3
            g.rock('eggs',(x+math.cos(a)*r,y+.45+(i%3)*.2,z+math.sin(a)*r),(.7,1,.7),77+i,.8+(i%4)*.08)
    for p in [(-15,0,15),(-17,0,15),(-33,0,18),(-35,0,20),(-29,0,9),(-32,6,-6),(-27,12,-15),(-30,18,3),(35,0,21)]:barrel(g,p,1+(rng.random()*.25))
    for p in [(-13,0,14),(-15,0,13),(-31,0,19),(-34,0,16),(-30,6,-12),(-25,12,-10),(-29,18,5),(32,0,20)]:crate(g,p,1.6)
    for i in range(24):
        x=rng.choice([-1,1])*rng.uniform(18,34);z=rng.uniform(-8,22)
        if -24<x<-12:continue
        g.box('timber',(x,.08,z),(rng.uniform(.8,2.3),.1,.16),rng.random()*math.pi,shade=.65)
    for x,z in [(-30,18),(31,19),(-29,8)]:
        g.beam('timber',(x,.15,z),(x+.4,1.8,z+.25),.075)
        g.beam('iron',(x-.45,1.65,z+.2),(x+1.1,1.9,z+.3),.09)
    for p in [(-8,.3,-8),(23,.4,5),(-23,.3,5)]:g.anchor('dust',p)
    for p in [(22,.2,13),(15,.2,-6)]:g.anchor('mist',p)
