"""The cavern shell, layered slate arch, stone platforms and floor."""
import math,random
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def build(g):
    rng=random.Random(3981)
    # An irregular oval shell. Low openings meet the existing mine routes.
    n=80;levels=[0,5,12,22,33,41,46];radii=[1,1.015,1.02,.96,.82,.54,.03]
    vertices=[]
    for layer,(y,r) in enumerate(zip(levels,radii)):
        for i in range(n):
            a=i*math.tau/n;wave=1+.025*math.sin(a*7)+.013*math.cos(a*13+layer*.6)
            vertices.append((44*math.cos(a)*r*wave,y+(math.sin(a*5)*.8 if layer else 0),30*math.sin(a)*r*wave))
    faces=[]
    for j in range(len(levels)-1):
        for i in range(n):
            a=(i+.5)*math.tau/n
            x,z=44*math.cos(a),30*math.sin(a)
            portal=(z>25 and abs(x+6)<12) or (abs(x)>35 and 5<z<24) or (z<-25 and abs(x+3)<10)
            if portal and j<(3 if z<-25 else 2):continue
            v=j*n+i;w=j*n+(i+1)%n
            faces.extend([(v,w+n,w),(v,v+n,w+n)])
    vertices.append((0,47,0));center=len(vertices)-1
    for i in range(n):faces.append((center,6*n+i,6*n+(i+1)%n))
    g.mesh('stone_shell',vertices,faces)
    shell_tree=BVHTree.FromPolygons(vertices,faces)
    # Faceted horizontal floor remains exactly walkable. No deceptive craters.
    for x in range(-44,44,2):
        for z in range(-44,30,2):
            if ((x+1)/44)**2+((z+1)/30)**2>1 and not (-11<x<6 and z<-20):continue
            vv=[(x,.018,z),(x+2,.02,z),(x+2,.018,z+2),(x,.02,z+2)]
            g.mesh('ground',vv,[(0,2,1),(0,3,2)],rng.uniform(.91,1.06))
    # Broad layered wall plates create a visible rock volume, not cone spikes.
    for i in range(76):
        a=i*math.tau/76;x,z=42*math.cos(a),28.8*math.sin(a)
        portal=(z>24 and abs(x+6)<12) or (abs(x)>34 and 4<z<24) or (z<-24 and abs(x+3)<11)
        for j in range(6):
            if portal and j<(4 if z<-24 else 2):continue
            y=3+j*6;inset=1 if j<4 else .87
            size=(5.5+rng.random()*2,6.2+rng.random()*3,4.4+rng.random()*3)
            g.rock('stone_walls',(x*inset,y,z*inset),size,i*13+j,rng.uniform(.67,1.13))
            if j==0:g.body('Widow cavern wall',(x,5,z),(size[0]*.72,10,size[2]*.72))
            # Smaller slanted slate plates break up the large structural masses.
            for k in range(2):
                g.rock('stone_strata',(x*inset*.974+rng.uniform(-1.7,1.7),y-2+k*2.1+rng.uniform(-1,1),z*inset*.971+rng.uniform(-.6,.6)),(rng.uniform(2.1,4.5),rng.uniform(1.8,3.7),rng.uniform(1.1,2.2)),3000+i*23+j*3+k,rng.uniform(.66,1.16))
    # The signature north arch is a solid asymmetric rock formation.
    for side in [-1,1]:
        for j in range(8):
            y=1.8+j*3.4;x=-3+side*(12.6-j*.35)
            g.rock('stone_arch',(x,y,-17.5),(7.2-j*.33,5.5,8.1-j*.35),81+j*3+side,rng.uniform(.8,1.1))
        g.body('Widow arch foot',(-3+side*12,3,-17.5),(7,6,7))
    for band in range(3):
        for i in range(17):
            a=.08+i/16*(math.pi-.16);r=11.4+band*1.5
            x=-3+math.cos(a)*r;y=17+math.sin(a)*r*.86
            g.rock('stone_arch',(x,y,-18+band*.7),(3.7,4.8,6.3),i+band*33,rng.uniform(.84,1.16))
    for x,y,z,w,h,d in [(-16,12,-21,7,25,8),(14,11,-20,7,24,8),(-10,31,-20,6,12,7),(9,31,-20,6,13,7),(1,35,-21,6,15,7)]:
        g.rock('stone_arch',(x,y,z),(w,h,d),int(x*21+y),.88)
    for side in [-1,1]:
        for j in range(16):
            y=1+j*1.6+rng.uniform(-.5,.5);x=-3+side*(12.6-j*.14)
            g.rock('stone_strata',(x,y,-13.9),(rng.uniform(1.2,2.3),rng.uniform(2.8,4.5),1.6),8100+j+side,rng.uniform(.75,1.2))
    # A deep grotto behind the signature arch gives its opening real depth.
    for z in [-27,-32,-37,-42]:
        for side in [-1,1]:
            g.body('Widow grotto wall',(-3+side*8,15,z),(3.2,30,6.5))
            for y in [3,10,18,25]:g.rock('stone_walls',(-3+side*8,y,z),(4,7,7),int(z*y*side),.7)
        for x in [-8,-3,2]:g.rock('stone_ceiling',(x,30,z),(8,5,7),int(z*x),.7)
    for x in [-9,-3,3]:g.rock('stone_walls',(x,14,-45),(7,31,4),900+x,.68)
    # Nursery rock shelves follow the reference's right-hand silhouette.
    for k,(x,z,h,w,d) in enumerate([(28,-9,6,15,11),(34,-17,12,12,11),(21,-20,5,12,9)]):
        for j in range(3):g.rock('stone_nursery',(x,h*(j+.5)/3,z),(w-j*.7,h/3+1,d-j*.4),440+k*7+j,.82+j*.08)
        g.body('Widow nursery rock',(x,h*.5,z),(w*.73,h,d*.7))
        g.anchor('nest',(x,h+.3,z))
    # Tapered, bent pendants rooted in the exact dome, rather than floating
    # generic rock primitives positioned by an approximate roof formula.
    for i in range(150):
        a=rng.random()*math.tau;r=rng.uniform(.18,.94)
        x=42*r*math.cos(a);z=28*r*math.sin(a)
        hit,_,_,_=shell_tree.ray_cast(Vector((x,1,z)),Vector((0,1,0)))
        if hit is None:continue
        roof=hit.y+.3;h=rng.uniform(2.2,8.2);w=rng.uniform(.8,2.1);n=6;vv=[]
        for y,scale in [(0,1),(-h*.25,.83),(-h*.72,.34),(-h,.015)]:
            for j in range(n):
                a=j*math.tau/n;rr=scale*w*.5*rng.uniform(.83,1.18)
                vv.append((x+math.cos(a)*rr+y*.045,roof+y,z+math.sin(a)*rr))
        ff=[tuple(range(n-1,-1,-1)),tuple(range(3*n,4*n))]
        for k in range(3):
            for j in range(n):ff.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
        g.mesh('stone_ceiling',vv,ff,rng.uniform(.78,1.08))
    # Peripheral rubble, geodes and floor seams leave the main routes clear.
    for i in range(260):
        a=rng.random()*math.tau;r=rng.uniform(.6,.95);x=42*r*math.cos(a);z=28*r*math.sin(a)
        if (abs(z-14)<4 or abs(x+6)<5 or -24<x<-12):continue
        size=rng.uniform(.2,1.5)
        g.rock('stone_rubble',(x,size*.3,z),(size,size*.6,size*.85),900+i,rng.uniform(.65,1.1))
    for x,z in [(30,6),(34,-2),(-34,-16),(17,-25)]:
        for i in range(8):
            g.rock('iron_ore',(x+rng.uniform(-1.4,1.4),rng.uniform(.25,1.2),z+rng.uniform(-1,1)),(.5,1.2,.7),1400+i,.9)
    # Water is a thin irregular reflective layer beside the path.
    for x,z,rx,rz in [(22,13,5,2),(-9,5,2.8,1.4),(15,-6,3.4,1.3)]:
        vv=[(x,.05,z)]+[(x+math.cos(i*math.tau/20)*rx*(1+.12*math.sin(i*3)),.05,z+math.sin(i*math.tau/20)*rz) for i in range(20)]
        g.mesh('water',vv,[(0,1+(i+1)%20,1+i) for i in range(20)])

    # Broken slate beside the haul road supplies foreground scale without a
    # collision obstacle. Keep pieces below the player step tolerance.
    for i in range(420):
        x=rng.uniform(-35,35);z=rng.uniform(-12,27)
        if abs(x+6)<2 or -24<x<-12 and z<10:continue
        size=rng.uniform(.18,.8)
        g.rock('stone_rubble',(x,.07,z),(size,.14,size*.7),14000+i,rng.uniform(.55,.95))
