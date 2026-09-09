"""Reference-led, route-safe architectural dressing in game coordinates.

Call build(geometry, room_spec) after architecture.shell and fittings.build.
No bpy operators, random placement, scene mutations or new materials are used.
"""
import math

TAU = math.tau


class Face:
    """A wall plane with local u horizontal, y vertical and d into the room."""
    def __init__(self, g, origin, axis='z', inward=1):
        self.g, self.origin, self.axis, self.inward = g, origin, axis, inward

    def p(self, u, y, d=0):
        x, z = self.origin
        return (x + u, y, z + self.inward*d) if self.axis == 'z' else (x + self.inward*d, y, z + u)

    def box(self, key, u, y, d, width, height, depth, **kw):
        size = (width, height, depth) if self.axis == 'z' else (depth, height, width)
        self.g.box(key, self.p(u, y, d), size, **kw)

    def beam(self, key, a, b, radius=.06, sides=6):
        self.g.beam(key, self.p(*a), self.p(*b), radius, sides)

    def ring(self, key, u, y, d, radius, minor=.05, segments=20):
        self.g.torus(key, self.p(u, y, d), radius, minor, axis=self.axis, segments=segments)

    def mesh(self, key, vertices, faces, shade=1):
        self.g.mesh(key, [self.p(*p) for p in vertices], faces, shade)

    def book(self,key,u,y,d,width,height,depth,shade=1):
        # Shelf books have square bindings. Eight vertices preserve their silhouette
        # without spending twenty-eight triangles on a bevel invisible from the nave.
        vertices=[(u+x*width/2,y+yy*height/2,d+z*depth/2)
                  for z in (-1,1) for yy in (-1,1) for x in (-1,1)]
        self.mesh(key,vertices,[(0,2,3,1),(4,5,7,6),(0,1,5,4),
                                (2,6,7,3),(0,4,6,2),(1,3,7,5)],shade)

    def body(self, name, u, y, d, width, height, depth):
        size = (width, height, depth) if self.axis == 'z' else (depth, height, width)
        self.g.body(name, self.p(u, y, d), size)


def curve(face, key, points, radius=.055, sides=6):
    for a, b in zip(points, points[1:]):
        face.beam(key, a, b, radius, sides)


def pointed(face, u, base, width, height, d=.35, layers=2, legs=True):
    """Layered ogee voussoirs with carved outer mouldings and a clear void."""
    spring = base + height*.42
    rise = height*.58
    angle=math.acos(.6/1.6)
    def arc(t,half):
        return half*(1.6*math.cos(angle*t)-.6), spring+rise*math.sin(angle*t)/math.sin(angle)
    for layer in range(layers):
        half = width/2 + layer*.26
        depth = d + .15*layer
        for side in (-1, 1):
            if legs:
                face.beam('trim', (u+side*half, base, depth), (u+side*half, spring, depth), .12, 6)
            pts = []
            for i in range(19):
                t = i/18
                x,y=arc(t,half)
                pts.append((u+side*x,y,depth))
            curve(face, 'trim' if layer % 2 == 0 else 'limestone', pts, .14 if layer == 0 else .095)
        face.box('trim', u, base+height+.12, depth, .36, .42, .4, bevel=.07)
    # A leaf on each shoulder reads as carved crocketing at player height.
    for side in (-1, 1):
        for t in (.2, .43, .66):
            x,y=arc(t,width/2+.6);x=u+side*x
            face.beam('trim', (x,y,d+.15), (x+side*.22,y+.35,d+.23), .14, 5)


def pier(face, u, height, base=0):
    """Clustered shafts, coursed plinth and foliated capitals, attached to masonry."""
    span = height-base
    for y, w, hh, depth in [(base+.18,2,.36,1.1), (base+.5,1.75,.25,.95),
                             (height-.8,1.7,.25,1.05), (height-.42,2.1,.42,1.25)]:
        face.box('trim',u,y,.45,w,hh,depth,bevel=.08)
    face.box('limestone',u,base+span/2,.25,1.15,span,.8,bevel=.09,shade=.8)
    for dx in (-.54,0,.54):
        face.beam('trim',(u+dx,base+.65,.86),(u+dx,height-.9,.86),.13,8)
        for y in (base+.8,base+span*.32,base+span*.65,height-1):
            face.box('trim',u+dx,y,.87,.36,.15,.42,bevel=.035)
    for dx in (-.66,-.33,0,.33,.66):
        face.beam('limestone',(u+dx*.5,height-1.4,.6),(u+dx,height-.65,1),.13,5)
    if base < .1:
        face.body('Carved wall pier',u,height/2,.4,1.8,height,1.15)


def candle_ledge(face,u,y,width=3):
    face.box('trim',u,y,.55,width,.22,1.15,bevel=.055)
    for dx in (-width*.32,width*.32):
        face.beam('limestone',(u+dx,y-.7,.05),(u+dx,y-.12,.85),.15,5)
    n=max(3,int(width/.4))
    for i in range(n):
        x=u+(i-(n-1)/2)*width/(n+1); h=.24+(i%3)*.16
        face.beam('wax',(x,y+.13,.75),(x,y+.13+h,.75),.06,7)
        face.g.rock('glow',face.p(x,y+.22+h,.75),(.065,.2,.065),seed=i)
    # One modest source per shelf, never one light per candle.
    face.g.anchor('candle',face.p(u,y+.65,.8),intensity=.55)


def emblem(face,theme,u,y,d=1,scale=1,key='bronze'):
    """Raised, readable heraldry. Symbols are geometry, never invented text."""
    def line(points,r=.055):
        curve(face,key,[(u+x*scale,y+yy*scale,d) for x,yy in points],r*scale,5)
    if theme in ('ossuary','crypt'):
        for i in range(11):
            a=-math.pi*.72+i*math.pi*1.44/10
            tip=(math.sin(a)*1.5,math.cos(a)*1.35+.15)
            line([(0,-1.3),(tip[0]*.62,tip[1]*.52),tip],.065)
        line([(math.sin(-math.pi*.72+i*math.pi*1.44/32)*1.5,
               math.cos(-math.pi*.72+i*math.pi*1.44/32)*1.35+.15) for i in range(33)])
        line([(-.5,-1.25),(.5,-1.25)])
    elif theme=='archive':
        for side in (-1,1):
            line([(0,-1.1),(side*1.4,-.8),(side*1.4,1.05),(0,.85),(0,-1.1)])
            for yy in (-.6,-.1,.4):line([(side*.25,yy),(side*1.1,yy+.16)],.035)
        for side in (-1,1):
            for yy in (-1,0,1):face.ring(key,u+side*2*scale,y+yy*.9*scale,d,.28*scale,.055*scale,10)
    elif theme=='store':
        line([(-.75,-1.4),(-1.15,-.55),(-1.15,.6),(-.75,1.4),(.75,1.4),
              (1.15,.6),(1.15,-.55),(.75,-1.4),(-.75,-1.4)],.07)
        for xx in (-.45,0,.45):line([(xx,-1.3),(xx*1.5,0),(xx,1.3)],.04)
        for yy in (-.8,.8):line([(-1.03,yy),(1.03,yy)],.09)
    elif theme=='furnace':
        line([(0,-1.5),(-1.1,-.8),(-.85,.2),(-.25,1.5),(0,.45),(.6,1),
              (1.05,-.3),(.8,-1.1),(0,-1.5)],.08)
        line([(0,-1.2),(-.38,-.55),(0,.3),(.35,-.6),(0,-1.2)])
    elif theme=='bells':
        line([(-1.4,-.7),(-.9,-.1),(-.65,1),(.65,1),(.9,-.1),(1.4,-.7),(-1.4,-.7)],.08)
        face.ring(key,u,y+1.3*scale,d,.22*scale,.055*scale,12)
        line([(0,-.65),(0,-1.2)]);face.ring(key,u,y-1.2*scale,d,.18*scale,.065*scale,12)
    elif theme=='command':
        # The command reference uses an open hand, with five unequal fingers.
        line([(-.65,-1.3),(.7,-1.3),(.95,-.45),(.98,.75),(.78,.86),
              (.62,.7),(.58,.15),(.55,1.32),(.3,1.43),(.12,1.26),(.08,.27),
              (-.02,1.6),(-.3,1.62),(-.45,1.44),(-.35,.24),(-.65,1.25),
              (-.91,1.19),(-1.02,.97),(-.77,-.08),(-1.3,.2),
              (-1.52,.02),(-1.47,-.25),(-.88,-.75),(-.65,-1.3)],.09)
        line([(-.48,-.65),(.5,-.5),(.61,-.1)],.035)
    elif theme=='titan':
        line([(-1.5,-.8),(-1.6,.9),(-.8,0),(0,1.5),(.8,0),(1.6,.9),(1.5,-.8),(-1.5,-.8)],.085)
        line([(-1.3,-.5),(1.3,-.5)])
        for xx in (-.85,0,.85):face.ring(key,u+xx*scale,y-.17*scale,d,.13*scale,.05*scale,10)
    elif theme=='inverted':
        line([(-1.1,1.1),(1.1,1.1),(1.35,-.9),(0,-1.5),(-1.35,-.9),(-1.1,1.1)],.08)
        line([(0,-1.3),(0,.8)]);line([(-.65,-.45),(.65,-.45)])
    elif theme=='chapel':
        line([(0,-1.6),(0,.65),(0,1.55)],.09)
        for side in (-1,1):
            for yy in (-.4,.3,1):
                line([(0,yy-.4),(side*.72,yy),(side*1.08,yy+.6)],.06)
                line([(side*.72,yy),(side*.32,yy+.52)],.045)
        line([(-.85,-1.6),(0,-1.12),(.85,-1.6)],.06)
    else:
        face.ring(key,u,y,d,1.25*scale,.055*scale,28)
        line([(0,-1.65),(0,1.65)],.09);line([(-1.05,.2),(1.05,.2)],.085)
        for a in range(8):
            t=a*TAU/8;line([(math.cos(t)*1.5,math.sin(t)*1.5),(math.cos(t)*1.85,math.sin(t)*1.85)],.04)


def banner(face,theme,u,top,width=2.4,height=6):
    bottom=top-height
    face.mesh('cloth',[(u-width/2,top,.65),(u+width/2,top,.65),
                     (u+width/2,bottom+.65,.7),(u,bottom,.75),(u-width/2,bottom+.65,.7)],[(0,1,2,3,4)],.85)
    face.beam('iron',(u-width*.62,top+.14,.4),(u+width*.62,top+.14,.4),.075,6)
    face.beam('iron',(u,top+.14,-1.2),(u,top+.14,.55),.085,6)
    for side in (-1,1):
        face.beam('bronze',(u+side*(width/2-.09),top-.12,.71),
                  (u+side*(width/2-.09),bottom+.78,.75),.035,4)
    emblem(face,theme,u,top-height*.42,.81,min(width/3.7,.8),
           key='dark' if theme=='command' else 'bronze')


def library_panel(face,u,base,width,height):
    face.box('wood',u,base+height/2,.1,width,height,.25,shade=.58)
    rows=int(height/1.15); cols=max(5,int(width/.42))
    for j in range(rows+1):
        y=base+j*1.15
        face.box('timber',u,y,.38,width+.15,.15,.65,bevel=.03)
        if j==rows:continue
        for i in range(cols):
            x=u-width/2+.25+i*(width-.5)/(cols-1);h=.55+((i*3+j*7)%5)*.085
            face.book('book' if (i+j)%4 else 'cloth',x,y+.09+h/2,.46,.3,h,.42,shade=.6+((i+j)%5)*.08)
    for side in (-1,1):face.box('timber',u+side*width/2,base+height/2,.36,.18,height,.7)


def niche(face,theme,u,base,width,height):
    # The dark recess is attached to the wall. The front remains open.
    face.box('dark',u,base+height*.46,.03,width*.83,height*.92,.09,bevel=.025)
    pointed(face,u,base,width,height,.3,layers=2)
    if theme=='archive':
        library_panel(face,u,base+.35,width*.76,height*.65)
    elif theme in ('ossuary','crypt','inverted'):
        for row in range(max(2,min(5,int(height/2.2)))):
            y=base+.7+row*1.5
            face.box('trim',u,y,.4,width*.8,.17,.8,bevel=.035)
            for col in range(5):
                x=u+(col-2)*width*.135
                face.g.rock('bone',face.p(x,y+.4,.62),(.48,.56,.4),seed=col+row*5)
                for eye in (-1,1):
                    face.g.rock('dark',face.p(x+eye*.11,y+.42,.83),(.12,.15,.04),seed=eye+3)
    else:
        emblem(face,theme,u,base+height*.48,.38,min(width/4.4,height/4.7),key='limestone')
    candle_ledge(face,u,base+.1,width*.86)


def wall_details(g,r):
    rx,rz,h=r['rx'],r['rz'],r['ceiling'];theme=r['theme'];large=r['level']>0
    for end in (-1,1):
        face=Face(g,(0,end*(rz-1.25)),inward=-end)
        # Dress the existing open portal, entirely above player clearance.
        pointed(face,0,3.6,15.4,min(13.1,h-4.1),.35,layers=3)
        for side in (-1,1):
            banner(face,theme,side*10.2,min(h-1.3,18.4),2.1,min(6.5,h-10))
        centres=[15.9,23.0] if large else [15.7]
        widths=[6.7,4.9] if large else [5.5]
        piers=[13.2,19.5,25.7] if large else [13.2,18.6]
        for side in (-1,1):
            for u in piers:
                top=h*.48+h*.52*math.sqrt(max(0,1-(u/rx)**2))-2
                base=12 if theme=='titan' and end==-1 and side==-1 else 0
                pier(face,side*u,top,base)
            for centre,width in zip(centres,widths):
                top=h*.48+h*.52*math.sqrt(max(0,1-((centre+width/2)/rx)**2))-2.2
                base=13 if theme=='titan' and end==-1 and side==-1 else 1.05
                available=top-base
                if available>3:
                    niche(face,theme,side*centre,base,width,min(available,18 if theme=='archive' else 12))
                if available>16:
                    upper=base+(18.8 if theme=='archive' else 12.8)
                    if top-upper>3.8:niche(face,theme,side*centre,upper,width*.86,top-upper-.4)
                if available>9 and theme!='archive':
                    banner(face,theme,side*centre,top-.7,width*.55,min(5,available*.34))
        if h>25:
            cy=h*.82;rad=min(4.1,(h-18)*.2)
            for rr in (rad,rad+.3):face.ring('trim',0,cy,.2,rr,.13,40)
            face.ring('bronze',0,cy,.39,rad*.32,.07,24)
            for i in range(12):
                a=i*TAU/12
                face.beam('trim',(math.sin(a)*rad*.3,cy+math.cos(a)*rad*.3,.22),
                          (math.sin(a)*rad*.93,cy+math.cos(a)*rad*.93,.22),.075,6)
                face.ring('trim',math.sin(a)*rad*.65,cy+math.cos(a)*rad*.65,.26,rad*.2,.07,12)
        elif h>=25:
            face.ring('trim',0,h-3.3,.25,2.35,.14,36)
            emblem(face,theme,0,h-3.3,.43,1.22)
        if h>39:
            # The large rooms need a tall blind arcade above the working doorway.
            # Its base is well above movement clearance and the existing royal throne.
            pointed(face,0,17,21,h*.86-17,.18,layers=3)
            for side in (-1,1):
                banner(face,theme,side*9.15,h*.69,3.3,min(11,h*.22))
            emblem(face,theme,0,h*.49,.42,2.7)
    # Side portal segments stay open; flanking bays frame them above and below.
    for side in (-1,1):
        face=Face(g,(side*(rx-1.3),0),'x',-side)
        limit=rz-5.2; top=h*.48-1
        for u in (-limit,limit):pier(face,u,top)
        for u in (-(rz*.54),rz*.54):
            niche(face,theme,u,1.1,6 if large else 4.8,max(5,top-2))
        side_top=h*.48+h*.52*math.sqrt(1-((rx-1.8)/rx)**2)-.7
        pointed(face,0,3.6,15.4,min(13,side_top-3.6),.25,layers=2)
    return 4*len(centres)+4


def vault_ribs(g,r):
    """Slender web ribs follow the existing barrel vault and meet its masonry piers."""
    rx,rz,h=r['rx'],r['rz'],r['ceiling']
    for end in (-1,1):
        for side in (-1,1):
            pts=[]
            for i in range(33):
                t=i/32;x=side*rx*.89*(1-t)
                y=h*.48+h*.52*math.sqrt(1-(x/rx)**2)-.58
                z=end*(rz-5.6)*(1-t)+end*4.8*t
                pts.append((x,y,z))
            for a,b in zip(pts,pts[1:]):g.beam('trim',a,b,.115,7)
        g.rock('trim',(0,h-.57,end*4.8),(.9,.42,.9),seed=4+end)
        g.torus('bronze',(0,h-.8,end*4.8),.43,.055,axis='y',segments=16)


def stair(g,x,start_z,end_z,base,rise,width=3.1):
    length=abs(end_z-start_z);n=math.ceil(rise/.22)
    for i in range(n):
        t=(i+.5)/n;y=base+rise*t
        g.box('trim',(x,y-.08,start_z+(end_z-start_z)*t),(width,.16,length/n+.035),bevel=.023,shade=.84+(i%3)*.045)
    for side in (-1,1):
        xx=x+side*(width/2-.1)
        g.beam('trim',(xx,base+1.05,start_z),(xx,base+rise+1.05,end_z),.1,6)
        for i in range(17):
            t=i/16;y=base+rise*t;z=start_z+(end_z-start_z)*t
            g.beam('trim',(xx,y,z),(xx,y+1,z),.065,5)
        # Load-bearing diagonal stringers leave the bookshelves below visible.
        g.beam('timber',(xx,base+.1,start_z),(xx,base+rise-.15,end_z),.25,4,shade=.78)
    g.body('Supported gallery stair',(x,base+rise/2,(start_z+end_z)/2),(width,rise,length),
           kind='ramp',direction=1 if end_z>start_z else -1,thickness=.3)


def gallery(g,r):
    if r['theme'] not in ('archive','command'):return 0
    rx,rz=r['rx'],r['rz'];tiers=2 if r['theme']=='archive' else 1;rise=8.4 if tiers==2 else 6.5
    near=-6.8;far=-rz+3.4;back=-rz+.8;front=-rz+5.8
    first=18.3 if tiers==2 else 16.8;second=14.7;width=2.8 if tiers==2 else 3.1
    first_slot=(first-width/2-.25,first+width/2+.25)
    second_slot=(second-width/2-.2,second+width/2+.2)
    left,right=(13.0 if tiers==2 else 13.8),rx-4.7

    def subtract(rect,cuts):
        pieces=[rect]
        for a,b,c,d in cuts:
            clipped=[]
            for x0,x1,z0,z1 in pieces:
                ax,bx,cz,dz=max(a,x0),min(b,x1),max(c,z0),min(d,z1)
                if ax>=bx or cz>=dz:clipped.append((x0,x1,z0,z1));continue
                for part in [(x0,ax,z0,z1),(bx,x1,z0,z1),(ax,bx,z0,cz),(ax,bx,dz,z1)]:
                    if part[1]-part[0]>.025 and part[3]-part[2]>.025:clipped.append(part)
            pieces=clipped
        return pieces

    def deck(side,top,rect,cuts,name):
        # Mesh and collision share every opening. No slab spans an ascending flight.
        for x0,x1,z0,z1 in subtract(rect,cuts):
            c=(side*(x0+x1)/2,top-.22,(z0+z1)/2);size=(x1-x0,.44,z1-z0)
            g.box('wood',c,size,bevel=.04);g.body(name,c,size)

    def frame(side,top,z,cuts):
        for a,b,_,_ in subtract((left,right,z-.21,z+.21),cuts):
            g.box('timber',(side*(a+b)/2,top-.6,z),(b-a,.4,.42))

    def post(side,x,z,top,width=1.05):
        g.box('limestone',(side*x,top/2,z),(width,top,width),bevel=.08)
        g.body('Gallery load-bearing pier',(side*x,top/2,z),(width,top,width))
        g.box('trim',(side*x,top-.64,z),(width+.32,.28,width+.32),bevel=.055)

    def rail(side,a,b,z,y):
        if b-a<.15:return
        g.beam('timber',(side*a,y+1.12,z),(side*b,y+1.12,z),.09,6)
        count=max(1,math.ceil((b-a)/.65))
        for i in range(count+1):
            x=a+(b-a)*i/count;g.beam('iron',(side*x,y,z),(side*x,y+1.1,z),.045,5)

    for side in (-1,1):
        stair(g,side*first,near,far,0,rise,width)
        for tier in range(tiers):
            top=rise*(tier+1);slot=second_slot if tier else first_slot
            cuts=[(slot[0],slot[1],far,near+.5)]
            deck(side,top,(left,right,back,front),cuts,'Supported gallery landing')
            for z in (back+.2,front-.3):
                # Upper posts never occupy the return flight. The north row supports
                # its landing, while the outer row carries the long gallery frame.
                xs=(14.4,21.6,rx-5.5) if z<far or tier==0 else (22.7,rx-5.5)
                for x in xs:post(side,x,z,top)
                frame(side,top,z,cuts)
            # The upper outboard aisle joins this landing across its front edge.
            rail_start=19.4 if tier else slot[1]
            for a,b in [(left,slot[0]),(rail_start,right)]:rail(side,a,b,front,top)
            # Headers sit beyond the stair endpoint, and trimmers frame the opening.
            g.box('timber',(side*(slot[0]+slot[1])/2,top-.6,far-.55),
                  (slot[1]-slot[0],.4,.4))
            for x in slot:g.box('timber',(side*x,top-.6,(far+front)/2),(.18,.4,front-far))
        if tiers==2:
            stair(g,side*second,far,near,rise,rise,width)
            upper_left=second_slot[0];upper_right=19.3;arrival=near+2.4
            deck(side,rise*2,(upper_left,upper_right,front,arrival),
                 [(second_slot[0],second_slot[1],front,near)],'Upper archive gallery')
            # The return flight exits onto a cap, then turns onto the outboard aisle.
            # Its posts stand ahead and to the sides, never under the stair endpoint.
            for x in (13.8,18.7):post(side,x,arrival-.3,rise*2,.8)
            for x in (second_slot[1]+.15,upper_right-.2):
                g.beam('timber',(side*x,rise*2-.62,front),(side*x,rise*2-.62,arrival),.2,4)
            rail(side,upper_left,upper_right,arrival,rise*2)
            for x in (upper_left+.08,upper_right-.08):
                g.beam('timber',(side*x,rise*2+1.12,front),(side*x,rise*2+1.12,arrival),.09,6)
    return tiers*2


def floor_engraving(g,r):
    # The existing three concentric border rings remain the outer frame.
    theme=r['theme'];scale=3.15
    class FloorFace(Face):
        def p(self,u,y,d=0):return (u,.062+d*.004,-y)
        def ring(self,key,u,y,d,radius,minor=.05,segments=20):
            self.g.torus(key,self.p(u,y,d),radius,min(minor,.025),axis='y',segments=segments)
        def beam(self,key,a,b,radius=.06,sides=6):
            self.g.beam(key,self.p(*a),self.p(*b),min(radius,.028),4)
    face=FloorFace(g,(0,0));emblem(face,theme,0,0,0,scale,'bronze')
    for i in range(32):
        a=i*TAU/32
        # Short border glyphs, not a generic sunburst through the central symbol.
        radial=(math.sin(a),math.cos(a))
        for rr in (9.55,9.9):
            g.beam('bronze',(radial[0]*rr,.06,radial[1]*rr),
                   (radial[0]*(rr+.14),.06,radial[1]*(rr+.14)),.022,4)


def codex_binding(g,r):
    """Metal tooling is fixed to the existing archive codex cover."""
    if r['theme']!='archive':return
    face=Face(g,(0,-18.42))
    for side in (-1,1):
        points=[(-1.6+3.2*i/16,21+side*.68*math.sin(math.pi*i/16),0) for i in range(17)]
        curve(face,'bronze',points,.065,5)
    face.ring('bronze',0,21,0,.44,.06,20)
    face.beam('bronze',(0,20.68,0),(0,21.32,0),.12,6)
    for x in (-3.25,3.25):
        for y in (17.4,24.6):
            curve(face,'bronze',[(x,y+.32,0),(x+.25,y,0),(x,y-.32,0),
                                (x-.25,y,0),(x,y+.32,0)],.07,5)


def build(g,r):
    before=sum(g.counts.values())
    bays=wall_details(g,r)
    vault_ribs(g,r)
    landings=gallery(g,r)
    floor_engraving(g,r)
    codex_binding(g,r)
    report={'bays':bays,'galleryLandings':landings,'theme':r['theme'],
            'parts':sum(g.counts.values())-before,'centralClearance':24}
    r['ornaments']=report
    return report
