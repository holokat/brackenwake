"""Continuous cellar masonry. Portals are omitted from the shell itself."""
import math,random

def arch(g,x,y,z,width,height,depth=1.2,yaw=0,thick=.7,legs=True):
    r=width/2;rise=min(r,height*.58);stem=height-rise
    def point(a,b):return(x+a*math.cos(yaw),y+b,z-a*math.sin(yaw))
    for side in [-1,1]:
        if not legs:continue
        for j in range(max(1,math.ceil(stem/1.4))):
            n=math.ceil(stem/1.4);h=stem/n
            g.box('limestone',point(side*(r+thick/2),(j+.5)*h),(thick,h-.025,depth),yaw,bevel=.07,shade=.83+(j%3)*.06)
        for yy in [.18,stem-.1]:g.box('trim',point(side*(r+thick/2),yy),(thick*1.35,.36,depth*1.2),yaw)
    for i in range(24):
        a=i*math.pi/24+.008;b=(i+1)*math.pi/24-.008
        vv=[]
        for dd in [-depth/2,depth/2]:
            for rr,angle in [(r,a),(r,b),(r+thick,b),(r+thick,a)]:
                p=point(math.cos(angle)*rr,stem+math.sin(angle)*(rise+rr-r))
                vv.append((p[0]+math.sin(yaw)*dd,p[1],p[2]+math.cos(yaw)*dd))
        g.mesh('trim',vv,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],.85+(i%4)*.045)

def wall(g,a,b,y,height,doors):
    dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz);yaw=math.atan2(-dz,dx)
    n=math.ceil(length/2.2);rows=math.ceil(height/1.25)
    for row in range(rows):
        for i in range(n):
            t=(i+.5)/n;x=a[0]+dx*t;z=a[1]+dz*t;cy=y+(row+.5)*height/rows
            skip=False
            for door in doors:
                along=abs(x-door['x']) if door['axis']=='z' else abs(z-door['z'])
                normal=abs(z-door['z']) if door['axis']=='z' else abs(x-door['x'])
                # Squared portal void is crowned by the separate voussoir arch.
                if normal<2 and along<door['width']/2+1.8 and cy<y+door['width']/2+6:skip=True
            if not skip:g.box('limestone',(x,cy,z),(length/n-.035,height/rows-.035,1.1),yaw,bevel=.09,shade=.67+g.random.random()*.3)
    # Substantial stone coping binds the wall to the vaulted roof.
    g.box('trim',((a[0]+b[0])/2,y+height-.25,(a[1]+b[1])/2),(length,.45,1.5),yaw)

def roof(g,room):
    x,z,y=room['x'],room['z'],room['y'];rx=room['rx'];rz=room['rz'];peak=room['ceiling'];spring=peak*.47
    for j in range(8):
        za=z-rz+j*rz/4;zb=za+rz/4
        for i in range(24):
            a=i*math.pi/24;b=(i+1)*math.pi/24
            vv=[(x+rx*math.cos(a),y+spring+(peak-spring)*math.sin(a),za),(x+rx*math.cos(b),y+spring+(peak-spring)*math.sin(b),za),(x+rx*math.cos(b),y+spring+(peak-spring)*math.sin(b),zb),(x+rx*math.cos(a),y+spring+(peak-spring)*math.sin(a),zb)]
            g.mesh('ceiling',vv,[(3,2,1,0)],.75+g.random.random()*.2)
    for zz in [z-rz*.68,z,z+rz*.68]:
        portal_crossing=room['id']==1 and zz==z
        arch(g,x,y,zz,rx*1.72,peak-.6,1.35,thick=1,legs=not portal_crossing)
        for side in [-1,1]:
            px=x+side*rx*.86
            if portal_crossing:
                sy=y+(peak-.6)*.42
                g.beam('trim',(px,sy,zz),(x+side*rx,sy,zz),.6,6)
                continue
            for yy,w,h in [(1,2.8,2),(spring*.5,1.9,spring-2), (spring-.2,2.8,.7)]:
                g.box('trim' if w>2 else 'limestone',(px,y+yy,zz),(w,h,2.4),bevel=.12)
            g.body('Vault pier',(px,y+spring/2,zz),(2.3,spring,2.4))
    # Narrow inner rib bays give the central aisle human-scale proportions.
    inner=9 if room['id']==0 else 17
    for zz in ([z-13,z,z+13] if room['id']==0 else [z-19,z+19]):
        arch(g,x,y,zz,inner*2,peak-1.4,1.3,thick=.85)
        for side in [-1,1]:
            px=x+side*(inner+.425);h=(peak-1.4)-min(inner,(peak-1.4)*.58)
            for yy,w,hh in [(.45,2.2,.9),(h/2,1.35,h),(h-.2,2.1,.6)]:g.box('trim',(px,y+yy,zz),(w,hh,1.9),bevel=.12)
            g.body('Aisle pier',(px,y+h/2,zz),(1.8,h,1.9))
    # Closed end vaults. The portal opening is cut to the arch curvature,
    # rather than leaving a rectangular hole above a semicircular frame.
    for side in [-1,1]:
        door=next(d for d in room['doors'] if d['axis']=='z' and d['z']*side>0)
        radius=(door['width']+1)/2;stem=5;outer=radius+.9
        for i in range(88):
            xa=-rx+i*rx/44;xb=xa+rx/44
            def lower(xx):return stem+math.sqrt(max(0,outer*outer-xx*xx)) if abs(xx)<outer else 0
            def upper(xx):return spring+(peak-spring)*math.sqrt(max(0,1-(xx/rx)**2))
            a,b=lower(xa),lower(xb);ta,tb=upper(xa),upper(xb)
            g.mesh('limestone',[(x+xa,y+a,z+side*rz),(x+xb,y+b,z+side*rz),(x+xb,y+tb,z+side*rz),(x+xa,y+ta,z+side*rz)],[(0,1,2,3)],.7+(i%4)*.04)
            # Cross-bonded stone courses dress the upper face.
            for yy in range(math.ceil(max(a,b))+1,math.floor(min(ta,tb))):
                g.box('limestone',(x+(xa+xb)/2,y+yy,z+side*rz-side*.58),(xb-xa-.015,.95,.12),bevel=.025,shade=.7+g.random.random()*.23)

def inside(p,poly):
    x,z=p;hit=False
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)]
        if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit

def tiles(g,poly,x,z,y,size=2):
    for xx in range(math.floor(min(p[0] for p in poly)),math.ceil(max(p[0] for p in poly)),size):
        for zz in range(math.floor(min(p[1] for p in poly)),math.ceil(max(p[1] for p in poly)),size):
            if not inside((xx+size/2,zz+size/2),poly):continue
            g.box('floor',(x+xx+size/2,y-.1,z+zz+size/2),(size-.025,.2,size-.025),bevel=.06,shade=.65+g.random.random()*.32)

def build(g,layout):
    for room in layout['rooms']:
        x,z,y=room['x'],room['z'],room['y'];poly=room['polygon'];height=room['ceiling']*.5
        doors=[dict(d,x=x+d['x'],z=z+d['z']) for d in room['doors']]
        for i,a in enumerate(poly):
            b=poly[(i+1)%len(poly)];wall(g,(x+a[0],z+a[1]),(x+b[0],z+b[1]),y,height,doors)
            # Every opaque wall has matching collision, with open portal segments.
            length=math.dist(a,b);n=math.ceil(length)
            for j in range(n):
                t=(j+.5)/n;px=x+a[0]+(b[0]-a[0])*t;pz=z+a[1]+(b[1]-a[1])*t
                if any(abs(px-d['x'])<(d['width']/2+1 if d['axis']=='z' else 2) and abs(pz-d['z'])<(d['width']/2+1 if d['axis']=='x' else 2) for d in doors):continue
                g.body('Cellar masonry',(px,y+height/2,pz),(1.4,height,1.4))
        tiles(g,poly,x,z,y)
        for d in doors:arch(g,d['x'],y,d['z'],d['width']+1,d['width']/2+5.5,1.8,0 if d['axis']=='z' else math.pi/2,1)
        roof(g,room)
    # The 22m connector descends three metres to the nave.
    for j in range(22):
        z=-20-j-.5;y=-3*((-20-z)/22)
        for x in range(-5,5,2):g.box('floor',(x+1,y-.12,z),(1.97,.24,.99),shade=.75+g.random.random()*.2)
        for side in [-1,1]:
            for row in range(6):g.box('limestone',(side*5.7,y+row+0.5,z),(1.2,.97,.97),shade=.8+g.random.random()*.15)
    for z in [-20,-26,-32,-38,-42]:arch(g,0,-3*((-20-z)/22),z,10.4,10,1.1,thick=.7)
    for i in range(12):
        a=i*math.pi/12;b=(i+1)*math.pi/12
        g.mesh('ceiling',[(5.7*math.cos(a),4.5+5.7*math.sin(a),-20),(5.7*math.cos(b),4.5+5.7*math.sin(b),-20),(5.7*math.cos(b),1.5+5.7*math.sin(b),-42),(5.7*math.cos(a),1.5+5.7*math.sin(a),-42)],[(3,2,1,0)])
    # Framed return stair; exit interaction remains at its foot.
    for i in range(16):g.box('trim',(0,(i+1)*.18-.1,12+i*.5),(6,.2,.52))
    g.body('Returning stair',(0,1.44,16),(6,2.88,8),kind='ramp',direction=1,thickness=.35)
