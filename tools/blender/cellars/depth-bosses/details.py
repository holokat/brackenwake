"""Second-pass silhouette and construction details identified in concept comparison."""
import math
TAU=math.tau

def finish(s,id):
    if id=='morvaOssuaryMother':
        s.bone='chest'
        # Jagged armored shell skirt breaks up the smooth carapace edge.
        for i in range(27):
            a=i*TAU/27;x=2.06*math.cos(a);z=1.78*math.sin(a)
            s.beam('bone',(x,2.72,z),(x*1.13,2.2+(i%3)*.14,z*1.12),.11,.018,6)
        for i in range(16):
            a=i*TAU/16;x=2.09*math.cos(a);z=1.8*math.sin(a)
            s.curve('trim',[(x,2.55,z),(x*.98,2.3,z*1.06),(x*.96,2.05,z*1.08)],.018,5)
    elif id=='sextonBellkeeper':
        s.bone='chest';s.beam('bone',(0,4.1,.14),(0,4.74,.72),.14,.1,10)
        # Bell yoke iron straps and rivets read as a load-bearing assembly.
        for x in [-.96,.96]:
            for y in [4,4.6,5.3]:
                s.ring('iron',(x,y,-.8),.19,.035,'y',n=12)
                s.ellipsoid('trim',(x,y,-.57),(.048,.048,.028),8,5)
        for j in range(12):
            a=j*TAU/12;x=math.cos(a)*.9;z=-1.12+math.sin(a)*.9
            s.beam('iron',(x,4.0,z),(x*.7,4.36,-1.12+(z+1.12)*.7),.02,n=5)
        s.bone='forearm_L'
        for y in [1.94,2.34]:s.ring('iron',(-1.95,y,1.4),.479,.025,'y')
        for i in range(12):
            a=i*TAU/12;s.beam('bronze',(-1.95+.475*math.cos(a),1.83,1.4+.475*math.sin(a)),(-1.95+.475*math.cos(a),2.49,1.4+.475*math.sin(a)),.027,n=5)
    elif id=='abbotCinder':
        s.bone='chest'
        for j in range(18):
            a=j*TAU/18;x=math.cos(a)*1.14;z=math.sin(a)*.81
            if z>.5:continue
            s.beam('bronze',(x,3.09,z),(x*.98,5.68,z*.95),.045,n=6)
        for y in [3.1,5.78]:
            for i in range(24):
                a=i*TAU/24;s.ellipsoid('trim',(1.15*math.cos(a),y,.85*math.sin(a)),(.058,.058,.058),6,4)
        # Genuine internal coals and individual licking flame tongues replace a flat glow plate.
        for j in range(15):
            x=s.rng.uniform(-.57,.57);y=s.rng.uniform(3.35,3.82)
            s.ellipsoid('ember',(x,y,.99),(.12,.10,.1),8,5)
            if j%3==0:s.beam('ember',(x,y+.1,.99),(x+.1,y+s.rng.uniform(.4,.9),.94),.12,.007,7)
        s.bone='head';s.beam('bone',(0,5.98,0),(0,6.43,.1),.095)
        # Sit the mitre directly on the cranium.
        for slot,data in s.parts.items():
            vs,_,bones,_,_=data
            for i,p in enumerate(vs):
                if bones[i]=='head' and p[1]>6.77:vs[i]=(p[0],p[1]-.2,p[2])
    elif id=='ilexChainArchivist':
        s.bone='chest';s.beam('bone',(0,6.88,0),(0,7.54,.1),.12,.085,10)
        for side in [-1,1]:
            s.chain((side*.45,6.72,.57),(side*.72,5.13,.53),.072)
            for j in range(3):
                x=side*(.5+j*.12);s.box('parchment',(x,4.7-j*.35,.57),(.14,.71,.11));s.ring('bronze',(x,4.7-j*.35,.57),.1,.019,'y',n=10)
        # Broken foil crown has connected plates instead of isolated straw-like spikes.
        s.bone='head'
        for i in range(9):
            a=i*TAU/9;x=math.cos(a)*.39;z=math.sin(a)*.39;s.beam('bronze',(x,7.97,z),(x*1.3,8.38+.12*(i%2),z*1.3),.083,.024,5)
        for bone in [b[0] for b in s.bones if b[0].startswith('book')]:
            s.bone=bone;center=next(b[1] for b in s.bones if b[0]==bone);x,y,z=center
            for side in [-1,1]:
                for j in range(8):
                    xx=x+side*.42;yy=y+.4-j*.115
                    for k in range(3):
                        xx2=xx+(k-1)*.16
                        s.curve('soul',[(xx2,yy,z+.213),(xx2+.025,yy+.047,z+.214),(xx2+.06,yy+.019,z+.214)],.008,4)
                for yy in [-.56,.56]:
                    for xx in [x+side*.06,x+side*.75]:s.box('bronze',(xx,y+yy,z+.25),(.12,.15,.07))
    elif id=='vossInvertedSaint':
        s.bone='chest'
        for side in [-1,1]:
            x=side*1.36
            for j in range(4):
                z=.92-j*.96
                for ox in [-.23,0,.23]:
                    s.beam('stone',(x,5.57,z+ox),(x,6.68,z+ox),.036,n=6)
                s.ring('trim',(x,6.84,z),.16,.031,'x',n=12)
            for j in range(5):
                z=1.38-j*.96
                for yy in [5.54,5.93,6.36,6.81]:s.box('trim',(x,yy,z),(.37,.08,.35))
        for z,h in [(.9,4.7),(-.8,3.85),(-2.2,3)]:
            for side in [-1,1]:
                x=side*.35
                s.beam('trim',(x,7.15,z),(x,7.15+h*.53,z),.05,n=6)
                s.arch((x,7.34,z+.33),.23,h*.42,'trim',.026)
                for zz in [-.26,.26]:s.spire((x*1.12,7.46,z+zz),h*.46,.07)
            s.ring('trim',(0,7.25,z+.36),.25,.041,n=18)
            for j in range(8):
                a=j*TAU/8;s.beam('stone',(0,7.25,z+.36),(.24*math.cos(a),7.25+.24*math.sin(a),z+.36),.027,n=5)
        # Incised branching masonry cracks articulate the great limb masses.
        for bone,p,q,_,_ in s.bones:
            if 'arm' not in bone and 'leg' not in bone:continue
            s.bone=bone
            for j in range(3):
                y=p[1]+(q[1]-p[1])*(j+.3)/3;x=p[0]+(q[0]-p[0])*(j+.3)/3;z=p[2]+(q[2]-p[2])*(j+.3)/3+.57
                s.curve('dark',[(x-.25,y+.16,z-.07),(x-.05,y+.05,z),(x+.09,y-.13,z-.02),(x+.29,y-.23,z-.08)],.013,4)
    elif id=='asterFirstKing':
        s.bone='chest';s.beam('bone',(0,10.28,0),(0,11.72,.17),.18,.13,12)
        # Burial plates close the waist and hang in separate heavy lappets.
        s.bone='hips'
        for j in range(9):
            a=TAU*j/9;x=1.15*math.cos(a);z=.76*math.sin(a)
            s.plate('iron',(x,4.91,z),[(-.32,-1.05),(.32,-1.05),(.39,.85),(0,1.06),(-.39,.85)],.17,.06)
            s.curve('bronze',[(x-.24,5.6,z+.15),(x,5.84,z+.19),(x+.24,5.6,z+.15)],.029)
        for bone,p,q,_,_ in s.bones:
            if 'arm' not in bone:continue
            s.bone=bone
            for j in range(5):
                t=j/5;x=p[0]+(q[0]-p[0])*t;y=p[1]+(q[1]-p[1])*t;z=p[2]+(q[2]-p[2])*t+.23
                s.ellipsoid('bronze',(x,y,z),(.041,.041,.025),7,4)
        s.bone='head'
        for y,r in [(12.42,.72),(12.67,.79)]:s.ring('bronze',(0,y,0),r,.048,'y',n=24)
        for i in range(11):
            a=i*TAU/11;x=math.cos(a)*.74;z=math.sin(a)*.74;s.beam('trim',(x,12.44,z),(x*1.1,12.83,z*1.1),.037,.023,6)
    return s
