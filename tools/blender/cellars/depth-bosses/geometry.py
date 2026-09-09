"""Material-batched, rigid-skinned sculptural mesh construction in game metres."""
import math, random
from collections import defaultdict
from mathutils import Vector
TAU=math.tau
class Sculpt:
    def __init__(self):
        self.parts=defaultdict(lambda:[[],[],[],[],[]]);self.bones=[];self.bone='hips';self.rng=random.Random(3281);self.features=defaultdict(int)
    def joint(self,name,p,q,parent='hips'):
        self.bones.append((name,p,q,parent,False));return name
    def mesh(self,mat,vs,fs,shade=1,smooth=False):
        verts,faces,bones,colors,smoothing=self.parts[mat];n=len(verts)
        verts.extend(tuple(v) for v in vs);faces.extend(tuple(n+i for i in f) for f in fs)
        bones.extend([self.bone]*len(vs));shade*=self.rng.uniform(.88,1.07)
        colors.extend([shade]*len(vs));smoothing.extend([smooth]*len(fs))
    def beam(self,mat,a,b,r,end=None,n=8):
        a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,0,1)))
        if u.length<.01:u=d.cross(Vector((0,1,0)))
        u.normalize();w=d.cross(u);end=r if end is None else end
        vs=[p+rr*(math.cos(i*TAU/n)*u+math.sin(i*TAU/n)*w) for p,rr in [(a,r),(b,end)] for i in range(n)]
        fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.mesh(mat,vs,fs)
    def curve(self,mat,pts,r,n=7):
        for a,b in zip(pts,pts[1:]):self.beam(mat,a,b,r,n=n)
    def ellipsoid(self,mat,c,size,n=16,m=10):
        vs=[]
        for j in range(m+1):
            a=math.pi*j/m
            for i in range(n):
                b=TAU*i/n;vs.append((c[0]+math.sin(a)*math.cos(b)*size[0],c[1]+math.cos(a)*size[1],c[2]+math.sin(a)*math.sin(b)*size[2]))
        fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(m) for i in range(n)]
        self.mesh(mat,vs,fs,smooth=True)
    def loft(self,mat,rings,n=20):
        vs=[(x+rx*math.cos(i*TAU/n),y,z+rz*math.sin(i*TAU/n)) for x,y,z,rx,rz in rings for i in range(n)]
        fs=[tuple(range(n-1,-1,-1)),tuple(range((len(rings)-1)*n,len(rings)*n))]
        fs +=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
        self.mesh(mat,vs,fs)
    def plate(self,mat,c,points,depth=.1,ridge=.03):
        x,y,z=c;n=len(points);vs=[(x+a,y+b,z+v) for v in [-depth/2,depth/2] for a,b in points];vs.append((x,y,z+depth/2+ridge))
        fs=[tuple(range(n-1,-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[(n+i,n+(i+1)%n,2*n) for i in range(n)]
        self.mesh(mat,vs,fs)
    def box(self,mat,c,s):
        x,y,z=s;self.plate(mat,c,[(-x/2,-y/2),(x/2,-y/2),(x/2,y/2),(-x/2,y/2)],z,0)
    def ring(self,mat,c,r,t=.04,axis='z',stretch=1,n=20,m=5):
        vs=[]
        for i in range(n):
            a=i*TAU/n
            for j in range(m):
                b=j*TAU/m;rr=r+t*math.cos(b);p=[rr*math.cos(a),rr*math.sin(a)*stretch,t*math.sin(b)]
                if axis=='x':p=[p[2],p[1],p[0]]
                if axis=='y':p=[p[0],p[2],p[1]]
                vs.append(tuple(c[k]+p[k] for k in range(3)))
        self.mesh(mat,vs,[(i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m) for i in range(n) for j in range(m)])
    def chain(self,a,b,r=.08,mat='bronze'):
        a,b=Vector(a),Vector(b);count=max(2,int((b-a).length/(r*1.65)))
        for i in range(count):self.ring(mat,a.lerp(b,i/(count-1)),r,.025,axis='x' if i%2 else 'z',stretch=1.3,n=10,m=4)
        self.features['chainLinks']+=count
    def skull(self,c,r=1,mat='bone',eyes=True):
        x,y,z=c;self.features['skulls']+=1
        detail=r>=.4
        self.ellipsoid(mat,(x,y+r*.12,z),(r*.63,r*.86,r*.57),14 if detail else 8,9 if detail else 5)
        self.ellipsoid(mat,(x,y-r*.47,z+r*.18),(r*.43,r*.39,r*.46),12 if detail else 8,6 if detail else 4)
        for side in [-1,1]:
            self.plate('dark',(x+side*r*.285,y+r*.1,z+r*.583),[(side*u*r,v*r) for u,v in [(-.18,.10),(.16,.24),(.25,.02),(.13,-.20),(-.13,-.21),(-.22,-.08)]],r*.005,0)
            self.plate(mat,(x+side*r*.285,y+r*.28,z+r*.60),[(side*u*r,v*r) for u,v in [(-.24,-.075),(.24,.065),(.25,.22),(-.23,.085)]],r*.11,r*.025)
            if eyes:self.ellipsoid('soul',(x+side*r*.28,y+r*.07,z+r*.607),(r*.024,r*.024,r*.016),8 if detail else 5,6 if detail else 4)
        self.plate('dark',(x,y-r*.21,z+r*.665),[(-r*.105,-r*.12),(r*.1,-r*.12),(0,r*.11)],.01,0)
        for i in range(7):
            xx=x+(i-3)*r*.108;yy=y-r*.55+abs(i-3)*r*.015
            self.beam(mat,(xx,yy+r*.12,z+r*.59),(xx,yy-r*.15,z+r*.62),r*.027,r*.022,6 if detail else 4)
        self.curve(mat,[(x-r*.46,y-r*.39,z+r*.37),(x-r*.36,y-r*.77,z+r*.43),(x,y-r*.83,z+r*.49),(x+r*.36,y-r*.77,z+r*.43),(x+r*.46,y-r*.39,z+r*.37)],r*.047,7 if detail else 4)
    def ribcage(self,c,w,h,depth):
        x,y,z=c
        self.beam('bone',(x,y-h*.5,z),(x,y+h*.5,z),w*.065)
        for j in range(7):
            yy=y+h*.45-j*h*.135;ww=w*(.68+.30*math.sin(j*.5))
            for s in [-1,1]:
                self.curve('bone',[(x,yy,z+depth*.83),(x+s*ww*.35,yy-.055*h,z+depth*.97),(x+s*ww*.69,yy-.035*h,z+depth*.78),(x+s*ww*.94,yy+.02*h,z+depth*.36),(x+s*ww*.98,yy+.065*h,z-depth*.15),(x+s*ww*.78,yy+.09*h,z-depth*.5)],w*.043,8)
    def cloth(self,c,width,length,mat='cloth',pieces=9,flare=.4):
        x,y,z=c
        for i in range(pieces):
            xx=(i/(pieces-1)-.5)*width;long=length*self.rng.uniform(.72,1);pts=[]
            for j in range(7):
                t=j/6;cx=x+xx*(1+flare*t)+math.sin(t*5+i)*width*.055;zz=z+math.sin(t*3.8+i*.7)*.13*width
                for s in [-1,1]:pts.append((cx+s*width/pieces*.7*(1-.16*t)*self.rng.uniform(.78,1.1),y-long*t+(s*.038*long if j==6 else 0),zz))
            self.mesh(mat,pts,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(6)])
            if i%3==0:self.curve('trim',[pts[j*2] for j in range(7)],width*.006,5)
    def spire(self,c,height,r=.18):
        x,y,z=c;self.beam('stone',c,(x,y+height*.65,z),r,r*.8,8);self.beam('bronze',(x,y+height*.65,z),(x,y+height,z),r*1.1,.008,8)
        self.ring('trim',(x,y+height*.61,z),r*1.11,.025,'y',n=12)
    def arch(self,c,w,h,mat='trim',r=.035):
        x,y,z=c;pts=[(x-w/2,y,z),(x-w/2,y+h*.66,z),(x-w*.34,y+h*.87,z),(x,y+h,z),(x+w*.34,y+h*.87,z),(x+w/2,y+h*.66,z),(x+w/2,y,z)];self.curve(mat,pts,r)
    def bell(self,c,r=1,h=1.6):
        x,y,z=c;self.features['bells']+=1
        rings=[(x,y,z,r,r),(x,y+h*.07,z,r*1.05,r*1.05),(x,y+h*.15,z,r*.9,r*.9),(x,y+h*.6,z,r*.55,r*.55),(x,y+h*.85,z,r*.48,r*.48),(x,y+h,z,r*.2,r*.2)]
        self.loft('bronze',rings,24)
        for yy,rr in [(y+.06*h,r*1.05),(y+.21*h,r*.85),(y+.76*h,r*.49)]:self.ring('trim',(x,yy,z),rr,.036,'y',n=24)
        self.beam('iron',(x,y-.2*h,z),(x,y+.3*h,z),r*.065);self.ellipsoid('iron',(x,y-.17*h,z),(r*.14,r*.13,r*.14),10,6)
    def hand(self,c,size=.4,mat='bone',spread=1):
        x,y,z=c;self.ellipsoid(mat,c,(size*.7,size*.75,size*.34),12,7)
        for i in range(4):
            xx=x+(i-1.5)*size*.36
            self.curve(mat,[(xx,y-size*.34,z),(xx+(i-1.5)*size*.13*spread,y-size*1.1,z+size*.2),(xx+(i-1.5)*size*.2*spread,y-size*1.65,z+size*.53)],size*.11,7)
        self.curve(mat,[(x-size*.6,y,z),(x-size*1.05,y-size*.4,z+size*.35),(x-size*.9,y-size*.9,z+size*.65)],size*.15,7)
