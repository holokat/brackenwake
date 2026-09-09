"""Batched game-coordinate geometry. Y is up; all distances are metres."""
import math, random
from collections import defaultdict
from mathutils import Vector


class Geometry:
    def __init__(self):
        self.parts = defaultdict(lambda: [[], [], []])
        self.counts = defaultdict(int)
        self.colliders = []
        self.anchors = []
        self.random = random.Random(7631)

    def mesh(self, key, vertices, faces, shade=1):
        vv, ff, cc = self.parts[key]
        offset = len(vv)
        vv.extend(tuple(v) for v in vertices)
        ff.extend(tuple(offset + i for i in f) for f in faces)
        cc.extend([shade] * len(vertices))
        self.counts[key] += 1

    def box(self, key, c, size, yaw=0, bevel=.04, shade=1):
        x, y, z = (n / 2 for n in size)
        b = min(bevel, x*.3, y*.3, z*.3)
        ring = [(-x+b,-y),(x-b,-y),(x,-y+b),(x,y-b),(x-b,y),(-x+b,y),(-x,y-b),(-x,-y+b)]
        verts = [(a,yy,zz) for zz in [-z,z] for a,yy in ring]
        co, si = math.cos(yaw), math.sin(yaw)
        verts = [(c[0]+a*co+zz*si,c[1]+yy,c[2]+zz*co-a*si) for a,yy,zz in verts]
        faces = [tuple(range(7,-1,-1)), tuple(range(8,16))]
        faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
        self.mesh(key,verts,faces,shade)

    def beam(self, key, a, b, radius, sides=6, shade=1, end_radius=None):
        a,b = Vector(a),Vector(b)
        axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.01: u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u).normalized()
        end_radius=radius if end_radius is None else end_radius
        points=[]
        for p,r in [(a,radius),(b,end_radius)]:
            points.extend(tuple(p+r*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)) for i in range(sides))
        faces=[tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))]
        faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        self.mesh(key,points,faces,shade)

    def rock(self,key,c,size,seed=0,shade=1):
        rng=random.Random(seed);n=rng.choice([5,6,7,8]);phase=rng.random()*math.tau;vertices=[]
        for level in range(4):
            y=(-.5,-.36,.32,.5)[level]
            scale=(.65,1,.93,.43)[level]
            for i in range(n):
                a=phase+math.tau*(i+.08*(level%2))/n
                r=scale*rng.uniform(.85,1.12)
                px=math.cos(a)*size[0]*r*.5;pz=math.sin(a)*size[2]*r*.5
                tilt=.28*math.sin(seed*2.71)
                vertices.append((c[0]+px,c[1]+size[1]*(y+rng.uniform(-.055,.055))+px*tilt+pz*tilt*.5,c[2]+pz))
        faces=[tuple(range(n-1,-1,-1)),tuple(range(3*n,4*n))]
        for level in range(3):
            for i in range(n):
                a=level*n+i;b=level*n+(i+1)%n
                faces.extend([(a,b,b+n),(a,b+n,a+n)])
        self.mesh(key,vertices,[tuple(reversed(f)) for f in faces],shade)

    def torus(self,key,c,major,minor,axis='z',stretch=1,segments=16,shade=1):
        vertices=[]
        for i in range(segments):
            a=i*math.tau/segments
            for j in range(5):
                b=j*math.tau/5;r=major+minor*math.cos(b)
                p=[math.cos(a)*r,math.sin(a)*r*stretch,math.sin(b)*minor]
                if axis=='x':p=[p[2],p[1],p[0]]
                if axis=='y':p=[p[0],p[2],p[1]]
                vertices.append(tuple(c[k]+p[k] for k in range(3)))
        faces=[]
        for i in range(segments):
            for j in range(5):faces.append((i*5+j,((i+1)%segments)*5+j,((i+1)%segments)*5+(j+1)%5,i*5+(j+1)%5))
        self.mesh(key,vertices,faces,shade)

    def line(self,key,points,r=.025,sides=4):
        for a,b in zip(points,points[1:]):self.beam(key,a,b,r,sides)

    def body(self,model,c,size,kind='box',**extra):
        x,y,z=c;w,h,d=size
        self.colliders.append(dict(kind=kind,model=model,x=x,y=y-h/2,z=z,w=w,h=h,d=d,c=1,s=0,**extra))

    def anchor(self,kind,p,**extra):
        self.anchors.append(dict(kind=kind,x=p[0],y=p[1],z=p[2],**extra))


def rotate_y(p,a):
    return (p[0]*math.cos(a)+p[2]*math.sin(a),p[1],p[2]*math.cos(a)-p[0]*math.sin(a))
