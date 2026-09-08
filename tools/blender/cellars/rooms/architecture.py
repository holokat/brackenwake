"""Reusable authored stonework, stairs and furnishing details for the eight rooms."""
import math
import random

def move(p,c,angle=0):
    x,y,z=p;ca,sa=math.cos(angle),math.sin(angle)
    return(c[0]+x*ca+z*sa,c[1]+y,c[2]-x*sa+z*ca)

def structure_material(r,mat):
    # Only the cathedral requires budget decimation. Retain the exact authored
    # prisms in its load-bearing arcade instead of collapsing them into needles.
    return mat+'_structure' if r.level==8 and mat in ('stone','stone_light','stone_dark') else mat

def arch(r,c,width,height,depth=1.1,angle=0,mat='stone',pointed=True):
    mat=structure_material(r,mat)
    radius=width/2;spring=height-radius*(1.4 if pointed else 1)
    for side in (-1,1):
        n=max(2,int(spring/1.7))
        for j in range(n):
            r.box('Arch pier ashlar',move((side*(radius+.48),spring*(j+.5)/n,0),c,angle),(.95,spring/n-.04,depth),mat,angle,.08)
    points=[]
    for i in range(13):
        t=math.pi*i/12;x=math.cos(t)*radius
        y=spring+math.sin(t)*radius*(1.4 if pointed else 1)
        points.append((x,y,0))
    for a,b in zip(points,points[1:]):
        av,bv=move(a,c,angle),move(b,c,angle)
        r.beam('Arch voussoir',av,bv,.65,mat,4)
    r.box('Arch keystone',move((0,height+.12,0),c,angle),(1.05,1.35,depth+.3),structure_material(r,'stone_light'),angle,.12)

def pillar(r,x,y,z,h,size=1.6):
    r.box('Pillar foot',(x,y+.25,z),(size*1.5,.5,size*1.5),structure_material(r,'stone_dark'))
    for j in range(max(2,int(h/2))):
        n=max(2,int(h/2));r.box('Pillar shaft',(x,y+(j+.5)*h/n,z),(size,h/n-.04,size),structure_material(r,'stone'))
    for yy in (y+.7,y+h-.5):r.box('Pillar collar',(x,yy,z),(size*1.35,.35,size*1.35),structure_material(r,'stone_light'))

def railing(r,a,b,height=1.1,mat='iron'):
    d=math.dist(a,b);count=max(1,int(d/1.9))
    r.beam('Gallery handrail',(a[0],a[1]+height,a[2]),(b[0],b[1]+height,b[2]),.1,mat,4)
    for i in range(count+1):
        t=i/count;p=tuple(a[j]+(b[j]-a[j])*t for j in range(3))
        r.beam('Railing spindle',p,(p[0],p[1]+height,p[2]),.065,mat,4)
        if i%3==0:r.loft('Rail finial',[(p[1]+height,.14,.14,p[0],p[2]),(p[1]+height+.3,0,0,p[0],p[2])], 'brass',4)

def deck(r,name,x,y,z,w,d,rail=False):
    r.box(name,(x,y-.35,z),(w,.7,d),'stone_dark')
    for ix in range(max(1,int(w/2.4))):
        for iz in range(max(1,int(d/2.6))):
            nx=max(1,int(w/2.4));nz=max(1,int(d/2.6))
            paving_y=y-.06+(.03 if 'landing' in name.lower() else 0)
            r.box('Gallery paving',(x-w/2+(ix+.5)*w/nx,paving_y,z-d/2+(iz+.5)*d/nz),(w/nx-.05,.16,d/nz-.05),'stone_light' if (ix+iz)%5==0 else 'stone',bevel=.04)
    r.collision_box(name,x,y-.7,z,w,.7,d)
    if rail:
        for xx in (x-w/2+.15,x+w/2-.15):railing(r,(xx,y,z-d/2),(xx,y,z+d/2))

def stairs(r,name,x,y,z,w,rise,d,direction):
    count=max(12,math.ceil(rise/.28));step=d/count
    for i in range(count):
        h=rise*(i+1)/count;zz=z+direction*(-d/2+(i+.5)*step)
        r.box('Stair tread',(x,y+h-.16,zz),(w,.32,step+.02),structure_material(r,'stone_light'),bevel=.045)
    # Closed sloping underside and risers are intentionally built independently of physics ramp.
    za=z-direction*d/2;zb=z+direction*d/2
    r.mesh('Stair stringer',[(x-w/2,y-.35,za),(x+w/2,y-.35,za),(x-w/2,y+rise-.35,zb),(x+w/2,y+rise-.35,zb),
                           (x-w/2,y+.1,za),(x+w/2,y+.1,za),(x-w/2,y+rise,zb),(x+w/2,y+rise,zb)],
           [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],structure_material(r,'stone_dark'))
    r.collision.append(dict(kind='ramp',model=name,x=x,y=y,z=z,w=w,h=rise,d=d,c=1,s=0,direction=direction))
    r.routes.append(dict(name=name,start=[x,y,za],end=[x,y+rise,zb],width=w,rise=rise,length=d))
    for xx in (x-w/2+.15,x+w/2-.15):railing(r,(xx,y,za),(xx,y+rise,zb))

def crossing(r,name,y,width,length):
    deck(r,name+' north south bridge',0,y,0,width,length)
    span=(length-width)/2
    for side in (-1,1):
        deck(r,name+' transverse paving',side*(width/2+span/2),y,0,span,width)
        r.collision.pop()
    r.collision_box(name+' east west bridge',0,y-.7,0,length,.7,width)

def galleries(r,levels=1,x=30,length=50,rise=5.5):
    r.features['galleryLevels']=levels
    for side in (-1,1):
        for floor in range(1,levels+1):
            y=floor*rise;sx=side*(x-7-(6.2 if floor%2==0 else 0));direction=1 if floor%2 else -1
            deck(r,'Walkable side gallery',side*x,y,0,6,length)
            # Rail interruptions at both stair landing connections preserve access.
            for z1,z2 in [(-length/2,-14.8),(-10,10),(14.8,length/2)]:
                railing(r,(side*(x-3),y,z1),(side*(x-3),y,z2))
            railing(r,(side*(x+3),y,-length/2),(side*(x+3),y,length/2))
            stairs(r,f'Gallery {side} level {floor}',sx,(floor-1)*rise,0,5,rise,24,direction)
            for zz in (-13.5,13.5):
                deck(r,'Stair landing',side*(x-6.7),y,zz,19.4,3)
                if floor==1:deck(r,'Ground stair landing',sx,0,zz,5,3)
            for zz in range(-int(length/2)+4,int(length/2),9):
                arch(r,(side*x,(floor-1)*rise,zz),6,rise-.7,1.2,math.pi/2)
                if floor==1:r.collision_box('Gallery pier',side*x,0,zz,1.3,rise-.7,1.3)
                candles(r,(side*(x+1),y,zz),3,.6)

def skull(r,c,s=1,angle=0):
    def p(v):return tuple(x*s for x in v)
    def plate(name,points,depth=.24,mat='bone'):
        verts=[move(p((x,y,z)),c,angle) for z in (.28-depth,.28) for x,y in points];n=len(points)
        r.mesh(name,verts,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    r.rock('Skull cranium',move(p((0,.52,-.25)),c,angle),(s*.65,s*.95,s*.54),'bone')
    for side in (-1,1):
        plate('Eye socket',[(side*.10,.34),(side*.57,.44),(side*.48,.02),(side*.17,.01)],.3,'void')
        plate('Skull angled brow',[(side*.06,.53),(side*.47,.70),(side*.68,.48),(side*.12,.32)],.38)
        plate('Skull cheek bone',[(side*.61,.49),(side*.72,.16),(side*.50,-.17),(side*.38,-.03),(side*.47,.07),(side*.49,.32)],.3)
    plate('Skull nasal bridge',[(-.075,.53),(.075,.53),(.13,.02),(0,.14),(-.13,.02)],.37)
    plate('Skull jaw',[(-.47,-.16),(-.34,-.34),(.34,-.34),(.47,-.16),(.38,-.07),(-.38,-.07)],.32)
    for i in range(7):
        x=(i-3)*.115;r.beam('Skull tapered tooth',move(p((x,-.03,.38)),c,angle),move(p((x*.94,-.23,.37)),c,angle),.046*s,'bone_light',5)

def niche(r,c,scale=1,angle=0,skeleton=False):
    w=3.5*scale;h=6.5*scale
    r.box('Niche recess',move((0,h*.46,-.35*scale),c,angle),(w,h*.88,.4*scale),'void',angle)
    arch(r,c,w,h,.7*scale,angle)
    for yy in (1.2,3.15):
        r.box('Burial shelf',move((0,yy*scale,.1),c,angle),(w,.24*scale,1.2*scale),'stone_light',angle)
        for i in (-1,0,1):skull(r,move((i*.95*scale,(yy+.48)*scale,.3*scale),c,angle),.62*scale,angle)
    if skeleton:
        for side in (-1,1):r.beam('Entombed leg',move((side*.27*scale,.4*scale,.4),c,angle),move((side*.3*scale,2.2*scale,.4),c,angle),.12*scale,'bone')

def candles(r,c,count=5,spread=1.5):
    for i in range(count):
        a=i*2.399;x=c[0]+math.cos(a)*spread*(.35+.6*(i%3)/2);z=c[2]+math.sin(a)*spread*.6
        h=.24+(i%4)*.18
        r.loft('Wax candle',[(c[1],.10,.10,x,z),(c[1]+h,.09,.09,x,z)],'wax',6)
        r.loft('Candle flame',[(c[1]+h,.085,.085,x,z),(c[1]+h+.26,0,0,x+.03,z)],'fire',5)
    r.anchor('candles','candle',(c[0],c[1]+.6,c[2]),'#ffc27c',.7,5)

def brazier(r,c,s=1,soul=False,hanging=False):
    x,y,z=c
    if not hanging:
        r.loft('Brazier stone plinth',[(y,1.05*s,1.05*s,x,z),(y+.4*s,1.2*s,1.2*s,x,z),(y+1.6*s,.6*s,.6*s,x,z),(y+2*s,1*s,1*s,x,z)],'stone',8)
    by=y+(0 if hanging else 2*s)
    r.loft('Brazier iron bowl',[(by,.45*s,.45*s,x,z),(by+.7*s,1.2*s,1.2*s,x,z),(by+.85*s,1.22*s,1.22*s,x,z)],'iron',10)
    r.ring('Brazier brass rim',(x,by+.84*s,z),1.22*s,.08*s,'brass',segments=12)
    for i in range(5):
        a=i*math.tau/5;xx=x+math.cos(a)*.5*s;zz=z+math.sin(a)*.5*s
        r.loft('Sculpted flame',[(by+.7*s,.45*s,.45*s,xx,zz),(by+1.6*s,.24*s,.26*s,xx+.15*s,zz),(by+(2.1+i%2*.3)*s,0,0,xx-.12*s,zz)],'soul' if soul else 'fire',5)
    r.anchor('brazier','soulFlame' if soul else 'fire',(x,by+1.35*s,z),'#63cbff' if soul else '#ffa855',3*s,12*s)

def chain(r,a,b,size=.25):
    length=math.dist(a,b);n=max(2,math.ceil(length/(size*1.55)))
    for i in range(n+1):
        t=i/n;c=tuple(a[j]+(b[j]-a[j])*t for j in range(3))
        r.ring('Forged chain link',c,size,.065 if size<.3 else size*.24,'iron',(0,0,1) if i%2 else (1,0,0),10)

def banner(r,c,w=3,h=7,angle=0,red=False):
    pts=[(-w/2,0,0),(w/2,0,0),(w*.47,-h*.7,.14),(w*.43,-h,.04),(w*.1,-h*.88,.18),(-w*.12,-h,.12),(-w*.45,-h*.94,0)]
    r.mesh('Hanging cloth banner',[move(p,c,angle) for p in pts],[(0,1,2),(0,2,6),(2,3,4),(2,4,5),(2,5,6)],'red' if red else 'purple')
    r.beam('Banner suspension',move((-w*.6,.1,0),c,angle),move((w*.6,.1,0),c,angle),.1,'brass')
    diamond=[(0,-h*.22,.3),(w*.24,-h*.45,.3),(0,-h*.67,.3),(-w*.24,-h*.45,.3),(0,-h*.22,.3)]
    r.tube('Gold diamond embroidery',[move(p,c,angle) for p in diamond],.055,'gold',4)
    r.tube('Inner diamond embroidery',[move((p[0]*.48,(p[1]+h*.45)*.48-h*.45,p[2]+.01),c,angle) for p in diamond],.038,'gold',4)

def coffin(r,c,s=1,angle=0,upright=False):
    # Body and lid use a six-sided coffin outline, never a rectangular box.
    outline=[(-.65,-1.8),(.65,-1.8),(1, .65),(.6,1.7),(-.6,1.7),(-1,.65)]
    verts=[]
    for hh in (0,.65):
        for x,z in outline:
            p=(x*s,hh*s,z*s) if not upright else (x*s,(z+1.8)*s,hh*s)
            verts.append(move(p,c,angle))
    r.mesh('Sarcophagus body',verts,[(5,4,3,2,1,0),(6,7,8,9,10,11)]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)],'stone_light')
    for i,(a,b) in enumerate(zip(outline,outline[1:]+outline[:1])):
        def pp(v):return (v[0]*s,.72*s,v[1]*s) if not upright else(v[0]*s,(v[1]+1.8)*s,.72*s)
        r.beam('Coffin gilt edge',move(pp(a),c,angle),move(pp(b),c,angle),.06*s,'brass',4)
    if upright:
        skull(r,move((0,2.6*s,.75*s),c,angle),.55*s,angle)
        for side in (-1,1):
            for j in range(5):
                yy=(2.16-j*.15)*s
                r.tube('Sarcophagus carved ribs',[move((side*.08*s,yy,.78*s),c,angle),move((side*.38*s,yy-.08*s,.90*s),c,angle),move((side*.40*s,yy-.18*s,.78*s),c,angle)],.07*s,'bone',5)
            r.beam('Sarcophagus carved leg',move((side*.17*s,.35*s,.78*s),c,angle),move((side*.19*s,1.35*s,.78*s),c,angle),.1*s,'bone',5)
            r.beam('Sarcophagus folded arm',move((side*.52*s,2.2*s,.81*s),c,angle),move((side*.08*s,1.8*s,.95*s),c,angle),.11*s,'bone',5)
        r.beam('Sarcophagus relief spine',move((0,1.25*s,.8*s),c,angle),move((0,2.35*s,.8*s),c,angle),.1*s,'bone_light',5)
    else:
        r.beam('Coffin cross',move((0,.76*s,-1.15*s),c,angle),move((0,.76*s,.9*s),c,angle),.08*s,'brass',4)
        r.beam('Coffin cross',move((-.5*s,.76*s,.3*s),c,angle),move((.5*s,.76*s,.3*s),c,angle),.08*s,'brass',4)

def lantern(r,c,s=1):
    x,y,z=c
    r.loft('Gothic lantern base',[(y-1.8*s,.85*s,.85*s,x,z),(y-1.5*s,1*s,1*s,x,z)],'brass',6)
    r.loft('Gothic lantern cap',[(y+1.5*s,1*s,1*s,x,z),(y+2.3*s,0,0,x,z)],'brass',6)
    # Open cage sides expose the warm flame.
    for i in range(6):
        a=i*math.tau/6;xx=x+math.cos(a)*s;zz=z+math.sin(a)*s
        r.beam('Lantern cage',(xx,y-1.5*s,zz),(xx,y+1.5*s,zz),.1*s,'brass')
    r.loft('Lantern flame',[(y-s,.3*s,.3*s,x,z),(y+.5*s,.3*s,.3*s,x,z),(y+1.1*s,0,0,x,z)],'fire',5)
    r.anchor('lantern','fire',(x,y,z),'#ffc17c',3*s,12*s)

def cavern_vault(r,rx,rz):
    """Broken geological roof, with no repeated radial seams or broad central fan."""
    rng=random.Random(51901+r.level*203);rings=[]
    radii=(.07,.21,.37,.53,.69,.85,1.025)
    counts=(8,14,20,26,32,38,44)
    relief=min(4.5,r.ceiling*.075)
    for j,(t,segments) in enumerate(zip(radii,counts)):
        ring=[]
        for i in range(segments):
            # Stagger neighboring rings and disturb both axes so diagonal facets
            # cannot form the straight center-to-wall spokes of a radial roof.
            a=(i+.48*(j%2)+rng.uniform(-.18,.18))*math.tau/segments
            radius=t+rng.uniform(-.025,.025)*min(1,t*8)
            x=math.cos(a)*rx*radius+rx*.016*math.sin(j*1.7)
            z=math.sin(a)*rz*radius+rz*.019*math.cos(j*1.1)
            y=r.ceiling*(1.03-.15*t*t)+relief*(.4+t*(.3*math.sin(a*3+j*2)+rng.uniform(-.12,.5)))
            ring.append((x,y,z))
        rings.append(ring)
    vertices=[p for ring in rings for p in ring];faces=[]
    offset=0
    for inner,outer in zip(rings,rings[1:]):
        ni,no=len(inner),len(outer);a=b=0;next_offset=offset+ni
        # Unequal ring counts eliminate narrow central spokes. Advance whichever
        # rim reaches its next angular vertex first, forming a broad rock facet.
        while a<ni or b<no:
            if a<ni and (b>=no or (a+1)/ni<(b+1)/no):
                faces.append((offset+a%ni,next_offset+b%no,offset+(a+1)%ni));a+=1
            else:
                faces.append((offset+a%ni,next_offset+b%no,next_offset+(b+1)%no));b+=1
        offset=next_offset
    # The central closure is only three metres across, offset and irregular.
    # Its triangles therefore never span the visible vault.
    faces.append(tuple(range(counts[0]-1,-1,-1)))
    r.mesh('Irregular layered cave vault',vertices,faces,'ceiling')
    candidates=[f for f in faces if len(f)==3 and min(f)>=sum(counts[:2]) and max(f)<sum(counts[:6])]
    for face in rng.sample(candidates,70 if r.level==8 else 42):
        center=[sum(vertices[i][axis] for i in face)/3 for axis in range(3)]
        x,y,z=center;length=rng.uniform(.8,2.7)*(1.5 if r.level==8 else 1)
        width=rng.uniform(.22,.6)*(1.4 if r.level==8 else 1)
        r.loft('Small roof stalactite',[(y+.35,width*1.3,width,x,z),
            (y-length*.27,width*.7,width*.65,x+.12,z-.08),
            (y-length,0,0,x+.2,z-.14)],'ceiling',5)
    r.features['caveVault']={'irregularRings':len(radii),'staggeredSectors':list(counts),
        'smallStalactites':70 if r.level==8 else 42,'material':'Cellar ceiling'}
    # Keep the original shell's random stream position. Furnishings, collision
    # envelopes and route anchors must not move during a ceiling-only revision.
    for _ in range(128):r.rng.random()

def shell(r,pit=False):
    rx,rz=r.rx-2,r.rz-2;segments=64
    r.holes=[dict(kind='rectangle',x=0,z=0,w=30,d=30,depth=16)] if pit else []
    # A tiled floor with individually chamfered stones and a recessed mortar bed.
    tile=2.6
    for ix in range(-int(rx/tile),int(rx/tile)+1):
        for iz in range(-int(rz/tile),int(rz/tile)+1):
            x=ix*tile+(iz%2)*tile/2;z=iz*tile
            if ((abs(x)+tile/2)/rx)**2+((abs(z)+tile/2)/rz)**2>1:continue
            if pit and abs(x)<15 and abs(z)<15:continue
            r.simplebox('Floor flagstone',(x,-.14,z),(tile-.055,.28,tile-.055),'stone_floor_light' if r.rng.random()<.07 else 'stone_floor')
            if r.rng.random()<.07:
                r.tube('Split flagstone crack',[(x-.9,.009,z-.4),(x-.15,.009,z+.05),(x+.25,.009,z-.2),(x+.8,.009,z+.38)],.02,'mortar',4)
    for i in range(segments):
        a=i*math.tau/segments;b=(i+1)*math.tau/segments
        x,z=math.cos(a)*rx,math.sin(a)*rz
        if not pit:r.mesh('Floor substructure',[(0,-.3,0),(math.cos(a)*rx,-.3,math.sin(a)*rz),(math.cos(b)*rx,-.3,math.sin(b)*rz)],[(0,2,1)],'mortar')
        # Four open doorways, each wide enough for the generated corridor.
        if abs(x)<12.5 or abs(z)<12.5:continue
        h=r.ceiling*(.9+.08*math.sin(i*3))
        r.rock('Cavern buttress',(x,h*.48,z),(3.7,h,3.6),'rock')
        r.collision_box('Cavern boundary buttress',x*.99,0,z*.99,8.6,h,8.6)
        if i%2==0:
            r.rock('Cavern high facet',(x*.96,h*.8,z*.96),(4.2,h*.48,4.1),'stone_dark')
            # Exposed limestone blocks break up the cave boundary at human scale.
            yaw=-a-math.pi/2
            r.collision_box('Ancient wall ashlar',x*.965,0,z*.965,4,6.8 if r.level<8 else 10.9,1.6,yaw)
            for j in range(5 if r.level<8 else 8):
                r.box('Ancient wall ashlar',(x*.965,j*1.35+.6,z*.965),(3.6,1.22,1.25),structure_material(r,'stone_light' if (i+j)%5==0 else 'stone'),yaw,.12)
        for j in range(2):
            r.loft('Vault stalactite',[(h-1-j*1.2,.3,.35,x*.88,z*.88),(h-5-j*2.5,0,0,x*.86,z*.86)],'rock',5)
        if i%3==0:r.rock('Fallen masonry',(x*.89,.25,z*.89),(1.4,.8,1.1),'stone_light')
    r.features['portalWidth']=16
    r.features['groundOverride']={'shape':'ellipse','rx':rx,'rz':rz,'height':0,'holes':r.holes,'blendMargin':3}
    # Dust belongs to library VFX at runtime.
    for side in (-1,1):r.anchor('dust','dust',(side*rx*.45,r.ceiling*.4,0),'#9cacc7',.4,rz)
    # Small funerary clusters fill the perimeter without narrowing the cardinal routes.
    for side in (-1,1):
        for dz in (-1,1):
            x=side*rx*.42;z=dz*rz*.60
            if r.level in (2,6):continue
            if r.level!=1:coffin(r,(x,0,z),.8,side*.4)
            for i in range(9):
                xx=x+r.rng.uniform(-3,3);zz=z+r.rng.uniform(-2,2)
                r.rock('Fallen funerary rubble',(xx,.25,zz),(.25+i%3*.18,.3+i%2*.2,.35),'stone_dark')
            candles(r,(x+2,0,z+1),7,1.15)
            skull(r,(x+1.5,.5,z-1),.65,side*.4)
    # The overhead evidence view hides this one named batch as a cutaway.
    cavern_vault(r,rx,rz)
    for z in (-rz+2,rz-2):arch(r,(0,0,z),18,max(14,min(r.ceiling*.72,34)),1.8)
