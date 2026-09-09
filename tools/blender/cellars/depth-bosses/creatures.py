"""Six concept-led boss silhouettes. Each builder authors its own load-bearing anatomy."""
import math
from geometry import Sculpt,TAU

def base(hip=(0,2,0),chest=(0,3,0),head=(0,4,0)):
    s=Sculpt();s.joint('hips',hip,(hip[0],hip[1]+.4,hip[2]),None);s.joint('chest',chest,head);s.joint('head',head,(head[0],head[1]+.5,head[2]),'chest');return s

def morva():
    s=base((0,2.05,0),(0,2.8,0),(0,3.25,1.5));s.bone='chest'
    s.ellipsoid('chitin',(0,2.5,-.1),(2.2,1.65,1.95),32,16)
    # A vaulted ossuary dome, actual distinct skulls follow its curvature.
    for ring in range(5):
        theta=.22+ring*.235;count=7+ring*5
        for i in range(count):
            a=TAU*(i+.4*(ring%2))/count
            c=(2.12*math.sin(theta)*math.cos(a),2.6+1.6*math.cos(theta),-.1+1.89*math.sin(theta)*math.sin(a))
            starts={slot:len(data[0]) for slot,data in s.parts.items()};s.skull(c,.23+ring*.026,eyes=i%5==0)
            yaw=s.rng.uniform(-.31,.31)
            for slot,data in s.parts.items():
                for j in range(starts.get(slot,0),len(data[0])):
                    p=data[0][j];dx=p[0]-c[0];dz=p[2]-c[2];data[0][j]=(c[0]+dx*math.cos(yaw)+dz*math.sin(yaw),p[1],c[2]+dz*math.cos(yaw)-dx*math.sin(yaw))
    s.bone='head';s.skull((0,3,1.7),.95)
    for side in [-1,1]:
        for i in range(3):
            n=f'leg{side}_{i}';p=(side*1.55,2.45,-1.05+i*.95);k=(side*(3.0+.2*(i%2)),1.85,-1.6+i*1.8);q=(side*(3.6+.25*(i%2)),.035,-1.9+i*2.05)
            s.joint(n,p,k,'chest');s.joint(n+'_tip',k,q,n);s.bone=n
            s.beam('chitin',p,k,.31,.2,10);s.ellipsoid('iron',p,(.38,.32,.35),12,8);s.ellipsoid('chitin',k,(.29,.3,.29),12,8)
            s.curve('trim',[(p[0],p[1]+.23,p[2]),(k[0],k[1]+.18,k[2])],.036)
            for j in range(3):
                t=(j+.5)/3;c=tuple(p[a]+(k[a]-p[a])*t for a in range(3));s.beam('bone',c,(c[0]+side*.15,c[1]+.36,c[2]-.1),.11,.008)
            s.bone=n+'_tip';s.beam('chitin',k,q,.18,.014,10);s.beam('bone',(q[0],q[1]+.7,q[2]),q,.09,.014)
        n='upperarm_'+('L' if side<0 else 'R');p=(side*1.35,2.35,1.15);k=(side*2.13,1.35,2.35);q=(side*1.5,.8,3.35)
        s.joint(n,p,k,'chest');s.joint(n.replace('upperarm','forearm'),k,q,n);s.bone=n;s.beam('chitin',p,k,.38,.27,12)
        s.bone=n.replace('upperarm','forearm');s.ellipsoid('chitin',(side*1.9,1.2,2.65),(.58,.57,.9),16,10)
        for offset in [-1,1]:
            s.curve('bone',[(side*1.9+offset*.4,1.12,2.9),(side*1.8+offset*.45,.83,3.35),(side*1.64+offset*.17,.75,3.72)],.13,9)
        s.bone='chest'
        for j in range(4):
            x=side*(.6+j*.35);s.chain((x,2.5,1.4),(x,1.1,1.5),.065)
            if j%2==0:s.bell((x,1.05,1.5),.17,.33)
        s.cloth((side*1.3,2.65,1.05),1,1.7,'weed',pieces=6,flare=.15)
    return s

def sexton():
    s=base((0,2.5,0),(0,3.75,-.18),(0,4.95,.82));s.bone='chest'
    s.ribcage((0,3.9,.05),.83,1.5,.49)
    s.loft('cloth',[(0,.15,0,1.03,.68),(0,1.5,0,.75,.53),(0,3.2,-.12,.68,.45),(0,4.4,-.3,1.04,.5),(0,4.9,-.28,.52,.3)],18)
    for side in [-1,1]:
        n='leg_'+('L' if side<0 else 'R');p=(side*.4,2.45,0);q=(side*.53,.25,.18);s.joint(n,p,q);s.bone=n
        s.beam('bone',p,q,.14,.11);s.ellipsoid('iron',(side*.52,.15,.42),(.25,.15,.54),12,7)
    s.bone='chest';s.cloth((0,4.35,.47),1.7,4.15,pieces=13,flare=.3)
    s.bell((0,3.75,-1.12),1.05,1.85)
    for side in [-1,1]:
        s.curve('wood',[(side*.91,3.75,-.8),(side*.94,5.55,-.8),(side*.66,5.84,-.3)],.15,8)
    s.beam('wood',(-1.0,5.55,-.6),(1.0,5.55,-.6),.18)
    s.bone='head';s.skull((0,4.82,1.03),.48)
    # Hood is open in front; a ribbed arch frames the skull instead of burying it.
    for i in range(14):
        a=math.pi*i/13;s.curve('cloth',[(math.cos(a)*.63,4.67+math.sin(a)*.72,1.1),(math.cos(a)*.64,4.66+math.sin(a)*.7,.67),(math.cos(a)*.59,4.65+math.sin(a)*.63,.2)],.11,7)
    s.arch((0,4.46,1.1),1.17,1.0,'trim',.045)
    for side in [-1,1]:
        n='upperarm_'+('L' if side<0 else 'R');p=(side*.91,4.3,.18);k=(side*1.2,2.72,.8);q=(side*.91,2.05,1.15)
        s.joint(n,p,k,'chest');s.joint(n.replace('upperarm','forearm'),k,q,n);s.bone=n
        s.beam('bone',p,k,.115,.095);s.ellipsoid('bone',k,(.16,.17,.15),10,6);s.cloth(p,.51,1.75,pieces=4,flare=.2)
        s.bone=n.replace('upperarm','forearm');s.beam('bone',k,q,.1,.08);s.hand(q,.18)
    s.bone='forearm_L';s.beam('wood',(-2.07,2.09,1.4),(1.95,2.09,1.4),.08,n=10)
    s.beam('iron',(-1.95,1.6,1.4),(-1.95,2.7,1.4),.47,n=20)
    for yy in [1.61,1.74,2.55,2.7]:s.ring('trim',(-1.95,yy,1.4),.49,.05,'y')
    s.bone='chest'
    for side in [-1,1]:
        for j in range(3):
            c=(side*(.53+j*.22),3.65-j*.35,.66);s.chain(c,(c[0],c[1]-.55,c[2]),.06);s.bell((c[0],c[1]-.72,c[2]),.12,.2)
    return s

def furnace():
    s=base((0,2.6,0),(0,4.1,0),(0,6.25,0));s.bone='chest'
    # Hollow furnace shell: rear + sides with a dark arched mouth and real grate.
    s.loft('iron',[(0,2.6,0,1.1,.69),(0,3.05,0,1.26,.81),(0,5.72,0,1.12,.74),(0,6.1,0,.79,.56)],24)
    s.plate('dark',(0,4.45,.84),[(-.87,-1.21),(.87,-1.21),(.87,.6),(.5,1.08),(0,1.3),(-.5,1.08),(-.87,.6)],.04,0)
    s.plate('ember',(0,4.22,.874),[(-.67,-.85),(.67,-.85),(.7,.58),(0,1.16),(-.7,.58)],.02,0)
    s.arch((0,3.05,.97),1.96,2.68,'trim',.075);s.arch((0,3.22,.99),1.62,2.31,'bronze',.038)
    for x in [-.64,-.43,-.21,0,.21,.43,.64]:
        top=5.28+.28*(1-abs(x)/.65);s.beam('iron',(x,3.26,1.05),(x,top,1.05),.045,n=8)
    for y in [3.55,4.03,4.56]:s.beam('iron',(-.75,y,1.05),(.75,y,1.05),.037)
    for y in [2.8,3.06,5.78,6.03]:s.ring('bronze',(0,y,0),1.14,.074,'y',n=24)
    for side in [-1,1]:
        for j in range(3):s.spire((side*(.65+j*.23),5.82,-.1),.55+.18*(j%2),.05)
        n='leg_'+('L' if side<0 else 'R');p=(side*.69,2.77,0);k=(side*.91,1.45,.12);q=(side*1.18,.19,.12);s.joint(n,p,k);s.joint(n+'_tip',k,q,n);s.bone=n
        s.beam('bone',p,k,.22,.18);s.plate('iron',(side*.9,1.95,.34),[(-.4,-.61),(.39,-.65),(.47,.53),(0,.8),(-.45,.46)],.26,.14)
        s.bone=n+'_tip';s.beam('iron',k,q,.27,.24);s.ellipsoid('iron',(side*1.18,.17,.43),(.44,.17,.79),12,7)
        s.plate('trim',(side*1.05,.89,.4),[(-.21,-.57),(.24,-.58),(.32,.36),(0,.61),(-.33,.32)],.08,.03)
        for tier in range(2):
            n=('upperarm_' if tier==0 else 'extraarm_')+('L' if side<0 else 'R');p=(side*1.17,5.38-tier*1.29,0);k=(side*(2.05+.22*tier),5.38-tier*2.07,.15);q=(side*(2.55+.1*tier),6.36-tier*3.47,.27)
            s.joint(n,p,k,'chest');s.joint(n+'_tip',k,q,n);s.bone=n;s.beam('iron',p,k,.17,.13,10);s.ellipsoid('bronze',p,(.28,.28,.28),12,8)
            s.bone=n+'_tip';s.beam('bone',k,q,.12,.09,10);s.hand(q,.21,'iron',1.4)
            if tier==1:s.chain(q,(q[0],q[1]-.73,q[2]),.075);s.bell((q[0],q[1]-.91,q[2]),.21,.38)
    s.bone='head';s.skull((0,6.38,.1),.41)
    s.plate('bone',(0,7.03,.02),[(-.4,-.28),(.4,-.28),(.39,.23),(0,.68),(-.39,.23)],.28,.06)
    s.plate('bronze',(0,7.06,.19),[(-.055,-.24),(.055,-.24),(.1,.4),(0,.59),(-.1,.4)],.025,0)
    s.bone='hips';s.cloth((0,2.7,.77),1.6,2.45,pieces=7,flare=.25)
    return s

def archivist():
    s=base((0,4.2,0),(0,5.7,0),(0,7.45,0));s.bone='chest'
    s.ribcage((0,6.2,.08),.88,1.7,.5)
    s.loft('cloth',[(0,3.5,-.2,.66,.31),(0,4.5,0,.61,.31),(0,5.6,-.1,.61,.35),(0,6.7,-.2,.9,.41)],16)
    s.cloth((0,6.45,-.4),2.1,5.65,pieces=19,flare=1.65)
    s.bone='hips';s.cloth((0,4.5,.35),1.52,3.52,'cloth',pieces=11,flare=1.6)
    for side in [-1,1]:
        n='robe_'+('L' if side<0 else 'R');s.joint(n,(side*.7,5.2,0),(side*1.4,2.2,0),'chest');s.bone=n;s.cloth((side*.8,5.45,.26),.78,3.7,'parchment',pieces=4,flare=.6)
    s.bone='head';s.skull((0,7.48,.12),.47)
    s.ring('bronze',(0,7.94,0),.41,.055,'y',n=18)
    for i in range(9):
        a=i*TAU/9;xx=math.cos(a)*.38;zz=math.sin(a)*.38
        s.beam('parchment',(xx,7.9,zz),(xx*1.65,8.6+.3*(i%3),zz*1.65),.1,.025,5)
    s.bone='chest';s.ring('bronze',(0,6.35,.65),.33,.065);s.ellipsoid('soul',(0,6.35,.65),(.19,.19,.07),12,7)
    for side in [-1,1]:
        for tier in range(2):
            n=('upperarm_' if tier==0 else 'extraarm_')+('L' if side<0 else 'R');p=(side*.91,6.62-tier*.65,.02);k=(side*2,6.2-tier*1.4,.17);q=(side*3.65,7.05-tier*2.6,.25)
            s.joint(n,p,k,'chest');s.joint(n+'_tip',k,q,n);s.bone=n;s.beam('bone',p,k,.105,.07);s.plate('iron',(side*.93,6.7-tier*.6,.14),[(-.5,-.21),(.5,-.21),(.63,.17),(0,.48),(-.55,.19)],.25,.06)
            s.bone=n+'_tip';s.chain(k,q,.11)
            bname='book'+n;s.joint(bname,q,(q[0],q[1]+.7,q[2]),n+'_tip');s.bone=bname;book(s,q,.95)
            s.chain((q[0]-.53,q[1],q[2]),(q[0]-.53,q[1]-1.23,q[2]),.065);s.bell((q[0]-.53,q[1]-1.38,q[2]),.13,.22)
    return s

def book(s,c,r):
    x,y,z=c;s.features['books']+=1
    for side in [-1,1]:
        cx=x+side*r*.41;s.box('iron',(cx,y,z),(r*.89,r*1.35,r*.23));s.box('parchment',(cx,y,z+.14),(r*.76,r*1.18,r*.09))
        for yy in [-.63,.63]:s.box('bronze',(cx,y+yy*r,z+.2),(r*.9,r*.067,r*.12))
        for j in range(8):
            length=r*(.44+.17*math.sin(j*2.5)**2);s.beam('soul',(cx-length/2,y+r*(.43-j*.12),z+.205),(cx+length/2,y+r*(.43-j*.12),z+.205),.011,n=5)
    s.beam('bronze',(x,y-r*.72,z+.08),(x,y+r*.72,z+.08),.066)


def saint():
    s=base((0,3.1,-.3),(0,4.8,.15),(0,4.68,2.2));s.bone='chest'
    s.ellipsoid('stone',(0,4.0,-.37),(1.95,1.32,2.7),24,12)
    for side in [-1,1]:
        for j in range(4):
            s.curve('trim',[(side*.1,4.9,1.4-j*.85),(side*1.32,4.9,1.4-j*.85),(side*1.91,4.3,1.4-j*.85)],.095,8)
        for i in range(2):
            n=('upperarm_' if i==0 else 'leg_')+('L' if side<0 else 'R');p=(side*1.62,4.12,1.47-i*3.2);k=(side*2.75,2.62,2.48-i*4.1);q=(side*3.02,.45,3.25-i*5.35)
            s.joint(n,p,k,'chest');s.joint(n+'_tip',k,q,n);s.bone=n;s.beam('stone',p,k,.75,.59,12)
            for j in range(4):
                t=j/4;c=tuple(p[a]+(k[a]-p[a])*t for a in range(3));s.ellipsoid('stone',c,(.78,.57,.65),10,6)
            s.bone=n+'_tip';s.beam('stone',k,q,.63,.5,12);s.ellipsoid('stone',q,(.71,.44,.62),12,7)
            for j in range(4):
                x=q[0]+(j-1.5)*.29;s.curve('stone',[(x,q[1],q[2]+.18),(x,q[1]*.5,q[2]+.83),(x,q[1]*.2,q[2]+1.15)],.19,8)
            s.ring('bronze',(q[0],q[1]+.72,q[2]-.13),.56,.065,'y')
    s.bone='head';s.skull((0,4.06,2.65),.88,'stone');s.arch((0,3.47,3.18),1.81,1.67,'trim',.095)
    s.cloth((0,4.02,2.9),1.54,1.44,pieces=9,flare=.15)
    s.bone='chest'
    # Architectural back mass uses open arches, flying buttresses and tall spires.
    s.box('stone',(0,5.3,-.46),(3.1,.4,4.85))
    for x in [-1.36,1.36]:
        for j in range(5):
            z=1.38-j*.96;s.beam('stone',(x,5.35,z),(x,7.32,z),.17,n=8);s.spire((x,7.28,z),1.33+.18*(j%2),.14)
            if j<4:
                # Side arches transformed by swapping x/z from a frontal arch.
                old=len(s.parts['trim'][0]);s.arch((0,5.4,0),.78,1.67,'trim',.065)
                verts=s.parts['trim'][0]
                for k in range(old,len(verts)):
                    a,b,c=verts[k];verts[k]=(x+side*.01,b,z-.47+a)
                s.beam('stone',(x,7.28,z),(x,7.28,z-.96),.1)
            s.curve('stone',[(x,6.55,z),(x*1.36,5.8,z),(x*1.56,5.4,z)],.13)
    for z,h in [(.9,4.7),(-.8,3.85),(-2.2,3.0)]:
        s.box('stone',(0,6.28,z),(1.42,2.0,1.01));s.arch((0,5.5,z+.525),1.0,1.95,'trim',.08)
        s.plate('soul',(0,6.25,z+.51),[(-.31,-.69),(.31,-.69),(.31,.37),(0,.69),(-.31,.37)],.01,0)
        for xx in [-.19,0,.19]:s.beam('stone',(xx,5.57,z+.55),(xx,6.75,z+.55),.026)
        s.spire((0,7.1,z),h,.38)
    for side in [-1,1]:
        for j in range(3):s.chain((side*1.54,5.37,.7-j*1.3),(side*1.75,2.1,.7-j*1.3),.115)
    return s


def king():
    s=base((0,5.3,0),(0,8.5,0),(0,11.75,0));s.bone='chest'
    s.ribcage((0,9.17,.22),1.5,2.88,.84)
    s.bone='hips';s.loft('iron',[(0,3.3,0,1.55,.69),(0,5.1,0,1.03,.59),(0,6.9,0,1.08,.61)],18)
    s.cloth((0,5.1,.72),2.07,4.65,pieces=12,flare=.55)
    for side in [-1,1]:
        n='cape_'+('L' if side<0 else 'R');s.joint(n,(side*1.6,10.72,-.59),(side*2.1,5.5,-1.1),'chest');s.bone=n
        s.cloth((side*1.12,10.65,-.89),2.48,10.1,'cape',pieces=13,flare=.54)
        n='leg_'+('L' if side<0 else 'R');p=(side*.8,5.75,0);k=(side*1.05,2.76,.17);q=(side*1.29,.25,.3);s.joint(n,p,k);s.joint(n+'_tip',k,q,n);s.bone=n
        s.beam('bone',p,k,.32,.28,12)
        for j in range(4):
            y=5.7-j*.67;s.plate('iron',(side*1.02,y,.59),[(-.66,-.65),(.65,-.64),(.62,.37),(0,.55),(-.62,.36)],.3,.19)
            s.curve('bronze',[(side*1.02-.6,y-.49,.91),(side*1.02,y-.62,.99),(side*1.02+.6,y-.49,.91)],.045)
        s.bone=n+'_tip';s.beam('bone',k,q,.32,.24,12);s.plate('iron',(side*1.22,1.48,.59),[(-.47,-1.08),(.47,-1.08),(.61,.8),(0,1.26),(-.62,.8)],.43,.2)
        s.curve('bronze',[(side*1.22,2.67,.89),(side*1.22,1.48,1.04),(side*1.22,.4,.86)],.058)
        s.ellipsoid('iron',(side*1.32,.24,.69),(.61,.24,1.16),16,8)
        n='upperarm_'+('L' if side<0 else 'R');p=(side*1.77,10.51,0);k=(side*2.25,8.76,.25);q=(side*2.61,6.97,.6)
        s.joint(n,p,k,'chest');s.joint(n.replace('upperarm','forearm'),k,q,n);s.bone=n;s.beam('bone',p,k,.24,.2,12)
        for j in range(3):
            s.plate('iron',(side*(1.72+.15*j),10.71-j*.33,.24),[(-.93,-.26),(.9,-.26),(.83,.26),(0,.55),(-.84,.26)],.7,.16)
            s.curve('bronze',[(side*(1.72+.15*j)-.8,10.43-j*.33,.78),(side*(1.72+.15*j),10.47-j*.33,.86),(side*(1.72+.15*j)+.8,10.43-j*.33,.78)],.042)
        s.bone=n.replace('upperarm','forearm');s.beam('bone',k,q,.18,.16,12);s.plate('iron',(side*2.48,7.82,.63),[(-.38,-.72),(.38,-.72),(.45,.67),(0,.94),(-.45,.67)],.31,.13);s.hand(q,.4)
    s.bone='chest';s.ring('bronze',(0,10,.99),.49,.105);s.ellipsoid('bronze',(0,10,.99),(.36,.36,.13),16,8)
    for i in range(12):
        a=i*TAU/12;s.beam('trim',(math.cos(a)*.22,10+math.sin(a)*.22,1.14),(math.cos(a)*.43,10+math.sin(a)*.43,1.13),.026)
    s.bone='head';s.skull((0,11.82,.23),.72);s.ring('bronze',(0,12.35,0),.68,.093,'y',n=24)
    for i in range(11):
        a=i*TAU/11;x=math.cos(a)*.65;z=math.sin(a)*.65;s.beam('bronze',(x,12.34,z),(x*1.44,13.4+.5*(i%3==0),z*1.44),.12,.009,8)
        s.curve('trim',[(x,12.41,z),(x*1.28,12.91,z*1.28)],.03)
    s.bone='forearm_L';sword(s,(-2.66,6.73,.83),6.6)
    return s

def sword(s,c,length):
    x,y,z=c;s.features['swords']+=1
    s.beam('iron',(x,y-.4,z),(x,y+1.48,z),.12,n=12);s.ellipsoid('bronze',(x,y+1.58,z),(.24,.31,.24),12,8)
    for j in range(8):s.ring('trim',(x,y+.27+j*.13,z),.125,.027,'y',n=12)
    s.curve('bronze',[(x-.95,y-.28,z),(x-.66,y+.02,z),(x,y+.08,z),(x+.66,y+.02,z),(x+.95,y-.28,z)],.1,9)
    s.plate('steel',(x,y-length/2-.06,z),[(-.43,length/2),(.43,length/2),(.34,-length/2+.58),(0,-length/2),(-.34,-length/2+.58)],.14,.12)
    s.beam('bronze',(x,y-.13,z+.2),(x,y-length+.55,z+.2),.045,.012,6)

BUILDERS=[('morvaOssuaryMother','Morva',4.8,morva),('sextonBellkeeper','Sexton',6,sexton),('abbotCinder','Abbot Cinder',7.5,furnace),('ilexChainArchivist','Ilex',9,archivist),('vossInvertedSaint','Voss',11,saint),('asterFirstKing','Aster',14,king)]
