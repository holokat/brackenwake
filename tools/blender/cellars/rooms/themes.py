"""Eight original low-poly environment compositions following the saved room sheets."""
import math
from architecture import arch,banner,brazier,candles,chain,coffin,crossing,deck,galleries,lantern,move,niche,pillar,railing,shell,skull,stairs

def cask(r,c,s=1,angle=0):
    n=14;rings=[(-1.2,.8),(-1,1),(-.2,1.08),(.7,1.04),(1.2,.82)]
    for i in range(n):
        a=i*math.tau/n+.014;b=(i+1)*math.tau/n-.014;v=[]
        for z,rad in rings:
            for t in (a,b):v.append(move((math.cos(t)*rad*s,math.sin(t)*rad*s,z*s),c,angle))
        r.mesh('Individual cask stave',v,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],'wood_light' if i%3 else 'wood')
    for z,rad in (rings[1],rings[3]):r.ring('Cask iron hoop',move((0,0,z*s),c,angle),rad*s,.08*s,'iron',(math.sin(angle),0,math.cos(angle)),n)
    for zz in (-1.21,1.21):
        for i in range(-3,4):
            x=i*.23;h=2*math.sqrt(max(0,.82**2-x*x))
            r.box('Cask end plank',move((x*s,0,zz*s),c,angle),(.22*s,h*s,.08*s),'wood_light',angle,.015)
        r.ring('Cask end rim',move((0,0,zz*s),c,angle),.83*s,.075*s,'iron',(math.sin(angle),0,math.cos(angle)),n)
    r.box('Cask timber cradle',move((0,-1*s,0),c,angle),(2.1*s,.22*s,2*s),'wood',angle)
    r.collision_box('Wine cask',c[0],c[1]-1.05*s,c[2],2.12*s,2.15*s,2.4*s,angle)

def table(r,c,width=10,red=False):
    x,y,z=c
    for i in range(5):r.box('Feast table plank',(x,y+1.4,z+(i-2)*.55),(width,.2,.52),'wood_light')
    r.collision_box('Feast table',x,y,z,width,1.5,2.8)
    for xx in (-width*.37,width*.37):
        for zz in (-.8,.8):r.box('Table carved leg',(x+xx,y+.68,z+zz),(.35,1.35,.35),'wood')
    for side in (-1,1):
        r.box('Feast bench',(x,y+.65,z+side*2.15),(width,.25,.65),'wood')
        for xx in (-width*.38,width*.38):r.box('Bench leg',(x+xx,y+.27,z+side*2.15),(.35,.55,.6),'wood')
    if red:r.box('Table cloth runner',(x,y+1.52,z),(width-.5,.03,.72),'red')
    candles(r,(x,y+1.52,z),5,width*.3)
    for i in range(6):
        xx=x-width*.4+i*width*.16
        for side in (-1,1):
            r.loft('Pewter feast plate',[(y+1.52,.34,.34,xx,z+side*.8),(y+1.57,.38,.38,xx,z+side*.8)],'brass',8)
            r.loft('Feast goblet',[(y+1.55,.09,.09,xx+.45,z+side*.7),(y+1.84,.11,.11,xx+.45,z+side*.7),(y+1.98,.19,.19,xx+.45,z+side*.7)],'gold',6)

def wine(r):
    shell(r);galleries(r,1,29,46,5.5)
    for side in (-1,1):
        for z in (-21,-12,12,21):
            for floor,s in ((0,2.5),(5.5,2)):
                cask(r,(side*36,floor+s*1.05,z),s,-side*math.pi/2)
            r.box('Timber upright',(side*33,8.6,z),(1.05,17.2,1.05),'wood')
            r.beam('Timber roof rib',(side*33,14.4,z),(side*13,17.1,z),.5,'wood',4)
            r.beam('Timber knee brace',(side*33,10.5,z),(side*26,16,z),.4,'wood_light',4)
        for z in (-18,18):banner(r,(side*27,16,z),3.5,7,red=True)
    for z in (-10,10):table(r,(-8,0,z),14,True)
    for x,z in ((15,-14),(18,14),(-18,20),(21,-20)):cask(r,(x,1.2,z),1)
    for x,z in ((13,2),(-15,-22)):
        brazier(r,(x,0,z),1.2)
        for i in range(8):r.rock('Campfire stone',(x+math.cos(i*math.tau/8)*2.2,.3,z+math.sin(i*math.tau/8)*2.2),(.65,.6,.6),'stone_dark')
    for side in (-1,1):niche(r,(side*37,0,-24),.75,-side*.5)
    r.landmarks=['Two tiers of individually staved casks','Timber ribs and braces','Feast tables and benches','Red gold-embroidered banners']

def drowned(r):
    shell(r);galleries(r,1,30,48,6)
    # Four recessed pools around broad, flush cruciform crossings.
    for side in (-1,1):
        for dz in (-1,1):
            x=side*13;z=dz*13
            r.box('Ossuary pool',(x,.015,z),(17,.03,17),'water',bevel=0)
            for i in range(16):
                xx=x+r.rng.uniform(-7,7);zz=z+r.rng.uniform(-7,7)
                r.simplebox('Water reflected facet',(xx,.04,zz),(r.rng.uniform(.3,1.9),.01,.12),'water_light',r.rng.random()*math.tau)
            for i in range(4):
                xx=x+(i%2*2-1)*6;zz=z+(i//2*2-1)*6
                r.rock('Drowned broken column',(xx,1.2,zz),(.9,2.7,.9),'stone_dark')
                r.loft('Pool stalagmite',[(0,.8,.7,xx+1.6,zz),(3+i*.3,0,0,xx+1.6,zz)],'rock',5)
            r.anchor('pool','water',(x,.1,z),'#49aab7',1,12)
    crossing(r,'Ossuary',.4,7,48)
    for z,direction in ((-27,1),(27,-1)):stairs(r,'Ossuary bridge approach',0,0,z,7,.4,6,direction)
    r.loft('Fish altar platform',[(.12,8,8,0,0),(.46,8,8,0,0)],'stone_light',12)
    for z in (-5,4):
        pillar(r,0,.42,z,5.5,.85)
        r.collision_box('Fish altar mounting pier',0,.42,z,.85,5.5,.85)
        r.beam('Fish skeleton mounting fork',(-1.5,7,z),(0,5.8,z),.16,'brass')
        r.beam('Fish skeleton mounting fork',(1.5,7,z),(0,5.8,z),.16,'brass')
    # Skeleton rests above the altar, with complete paired ribs and an articulated tail.
    for i in range(10):
        z=-9+i*1.8;y=7.7+math.sin(i*.32)*.6
        r.rock('Fish vertebra',(0,y,z),(.55,.6,.5),'bone_light')
        if i<8:
            for side in (-1,1):
                points=[(side*math.sin(j*math.pi/9)*3.9,y-(1-math.cos(j*math.pi/9))*3.4,z) for j in range(8)]
                r.tube('Fish rib',points,.16,'bone',6)
            r.beam('Fish dorsal spine',(0,y,z),(0,y+1.8,z-.4),.16,'bone_light')
    r.rock('Fish skull braincase',(0,8.5,9),(2.4,3.8,2.2),'bone')
    for side in (-1,1):
        r.tube('Fish long upper jaw',[(side*2.2,8.7,9),(side*1.8,8.2,11),(side*.65,7.5,15)],.27,'bone_light',6)
        r.tube('Fish long lower jaw',[(side*1.7,6.9,9),(side*1.8,5.7,11.5),(side*.6,6,15)],.25,'bone',6)
        r.box('Fish recessed eye',(side*1.5,8.9,10.6),(.7,.8,.3),'void',side*.5)
        r.beam('Fish slanted brow',(side*.7,9.7,10.2),(side*2.2,9.5,10),.32,'bone')
        for i in range(7):
            t=i/7;x=side*(1.8-t*1.15);z=11+t*4
            r.loft('Fish upper fang',[(8.2-t*.7,.13,.13,x,z),(7.3-t*.7,0,0,x,z)],'bone_light',5)
            r.loft('Fish lower fang',[(5.7+t*.3,.12,.12,x,z),(6.3+t*.3,0,0,x,z)],'bone_light',5)
    for side in (-1,1):
        r.beam('Fish tail fin',(0,7.7,-9),(side*3,9,-14),.25,'bone')
        r.beam('Fish tail fin',(0,7.7,-9),(side*2,5,-13),.22,'bone')
        for z in (-21,0,21):
            niche(r,(side*37,1,z),1,-side*math.pi/2)
            if z:brazier(r,(side*19,.4,z*.8),.9,True)
    for x,z in ((-6,-6),(6,6),(-6,6),(6,-6)):candles(r,(x,.4,z),8,1)
    r.landmarks=['Four drowned pools','Cruciform stone bridges','Giant articulated skeletal fish altar','Skull burial niches and cyan flames']

def bell(r):
    shell(r);galleries(r,2,30,48,6)
    # The outer and inner bell surfaces share a jagged open seam, a real fracture through metal.
    rings=[(10,7),(10.6,7.3),(11.2,6.7),(13,5.4),(17,4.5),(21,4),(22,2.7),(22.6,1.8)]
    n=48;verts=[]
    for inner in (False,True):
        for j,(y,rad) in enumerate(rings):
            for i in range(n):
                a=math.tau*i/n+.075*math.sin(j*3.3);rr=rad-(.45 if inner else 0)
                verts.append((math.cos(a)*rr,y,math.sin(a)*rr))
    faces=[];offset=n*len(rings);gap=8;broken={gap,gap+1}
    for inner in range(2):
        for j in range(len(rings)-1):
            for i in range(n):
                if i in broken:continue
                a=inner*offset+j*n+i;b=inner*offset+j*n+(i+1)%n
                faces.append((a,b,b+n,a+n) if not inner else(a,a+n,b+n,b))
    for i in range(n):
        if i not in broken:faces.append((i,(i+1)%n,(i+1)%n+offset,i+offset))
    for i in (gap,(gap+2)%n):
        for j in range(len(rings)-1):a=j*n+i;faces.append((a,a+n,a+n+offset,a+offset))
    r.mesh('Cracked great bell',verts,faces,'brass')
    for y,rad in ((10.7,7.32),(12,6.05),(20,4.13)):
        points=[(math.cos(i*math.tau/n)*rad,y,math.sin(i*math.tau/n)*rad) for i in range(gap+2,n+gap+1)]
        r.tube('Bell cast band',points,.10,'gold',5)
    r.beam('Bell clapper shaft',(0,21,0),(0,11,0),.3,'iron')
    r.rock('Bell clapper',(0,10.7,0),(.85,1.5,.85),'iron')
    r.ring('Bell crown',(0,23,0),1.1,.25,'brass',(0,0,1),16)
    for side in (-1,1):
        for dz in (-1,1):chain(r,(side*17,26,dz*14),(side*2,22.7,dz*2),.43)
        for z in (-20,0,20):
            for y in (0,6,12):niche(r,(side*37,y,z),.84,-side*math.pi/2)
        banner(r,(side*16,22,-17),4,10)
        brazier(r,(side*8,0,7),1.2,True)
    for i in range(12):
        a=i*math.tau/12;candles(r,(math.cos(a)*10,0,math.sin(a)*10),5,.7)
    r.anchor('bell','bell',(0,15,0),'#819fd0',1,18)
    r.landmarks=['Hollow jagged cracked bell','Four diagonal suspension chains','Two levels of tomb galleries','Ritual candles beneath the clapper']

def furnace(r):
    shell(r);galleries(r,2,30,48,7)
    # Monumental face grows out of the back wall, its mouth remains an open passage.
    arch(r,(0,0,-27),18,16,3.4,mat='stone_dark',pointed=False)
    for side in (-1,1):
        r.rock('Furnace face cheek',(side*14,13,-28),(4.7,21,3.9),'stone')
        r.rock('Furnace angular brow',(side*5.3,22,-26),(5,3.8,3),'stone_light')
        r.mesh('Furnace burning eye',[(side*2.3,20.9,-23.4),(side*8,22,-24),(side*7.1,19.4,-23.5)],[(0,1,2)],'fire')
        r.box('Furnace jamb fire',(side*8.6,6,-28),(1.2,10,1.5),'fire',bevel=.1)
        r.anchor('furnace_eye','fire',(side*5,20.5,-23),'#ff883e',4,20)
    r.rock('Furnace forehead',(0,26,-28),(7.5,8,4),'stone_dark')
    r.rock('Furnace nose',(0,18,-25),(1.8,6.5,2.5),'stone_light')
    for z in (-14,0,14):
        for side in (-1,1):
            x=side*12;r.box('Molten floor channel',(x,.02,z),(17,.04,3.8),'fire')
            for i in range(27):r.simplebox('Molten channel grate',(x-8+i*.62,.15,z),(.18,.22,4),'iron')
            r.anchor('molten_grate','fire',(x,.3,z),'#ff7940',2,12)
    for side in (-1,1):
        deck(r,'Coffin conveyor support',side*13,4,0,6,43)
        for z in (-18,-6,6,18):
            for dx in (-2,2):
                pillar(r,side*13+dx,0,z,3.65,.7)
                r.collision_box('Conveyor support pier',side*13+dx,0,z,.7,3.65,.7)
        for xx in (side*13-2.7,side*13+2.7):r.beam('Conveyor track',(xx,4.4,-21),(xx,4.4,21),.16,'iron',6)
        for z in range(-20,21,2):r.beam('Conveyor roller',(side*13-2.5,4.25,z),(side*13+2.5,4.25,z),.17,'iron',6)
        for z in (-17,-8,1,10,19):
            coffin(r,(side*13,4.55,z),1)
            for dz in (-1.5,1.5):r.ring('Conveyor cart wheel',(side*13-2,4,z+dz),.5,.11,'iron',(1,0,0),10)
        for z in (-14,14):
            brazier(r,(side*21,14,z),1.6,False,True)
            for offset in (-.8,.8):chain(r,(side*21+offset,31,z),(side*21+offset,15,z),.29)
    r.landmarks=['Monumental burning furnace face','Raised coffin conveyor lanes and rollers','Molten channels with iron grates','Four chained hanging braziers']

def bookcase(r,c,width=7,height=6,angle=0):
    r.box('Bookcase backing',move((0,height/2,-.4),c,angle),(width,height,.4),'wood',angle)
    for side in (-1,1):r.box('Bookcase stile',move((side*(width/2-.18),height/2,.1),c,angle),(.35,height,1.3),'wood_light',angle)
    for j in range(6):
        yy=.2+j*(height-.4)/5
        r.box('Bookcase shelf',move((0,yy,.1),c,angle),(width,.16,1.3),'wood_light',angle)
        if j==5:continue
        for i in range(13):
            xx=-width/2+.5+i*(width-.9)/13;h=r.rng.uniform(.46,.86)*(height/6)
            mat=['book_red','book_green','book_blue','wood_light'][r.rng.randrange(4)]
            r.simplebox('Individual bound volume',move((xx,yy+.09+h/2,.18),c,angle),((width-.9)/14,h,.7),mat,angle)
            if i%3==0:r.simplebox('Book spine gilding',move((xx,yy+h*.72,.55),c,angle),(.24,.038,.024),'brass',angle)

def library(r):
    shell(r);galleries(r,3,30,48,7)
    for side in (-1,1):
        for z in (-20,-10,0,10,20):
            for level in range(4):bookcase(r,(side*36,level*7,z),8.5,6.7,-side*math.pi/2)
        for z in (-20,20):
            for y in (0,7,14,21):table(r,(side*30,y,z),5)
        for z in (-16,16):banner(r,(side*25,30,z),3.6,11)
    # Suspended illuminated grimoire: separate pages, covers, bands and clasps.
    for side in (-1,1):
        for offset,mat in ((-.4,'purple'),(0,'pages')):
            v=[(x,10+abs(x)*.6+yy+offset,z) for yy in (0,.22) for x,z in [(side*.1,-2.7),(side*3.8,-2.7),(side*3.8,2.7),(side*.1,2.7)]]
            r.mesh('Floating grimoire '+mat,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
        for i in range(12):r.beam('Grimoire engraved script',(side*.7,10.65,-2.15+i*.38),(side*3.2,12.15,-2.15+i*.38),.035,'wood',4)
        for z in (-2.65,2.65):r.beam('Grimoire gold clasp',(side*.1,10.35,z),(side*3.85,12.6,z),.12,'gold',4)
    r.box('Grimoire spine',(0,10.15,0),(.4,.7,5.7),'brass')
    for side in (-1,1):
        for dz in (-1,1):chain(r,(side*25,25,dz*18),(side*3.7,10,dz*2.5),.24)
    r.loft('Grimoire altar',[(0,3.7,3.7,0,0),(1.5,3.2,3.2,0,0),(2.3,4.1,4.1,0,0)],'stone_dark',8)
    r.anchor('grimoire','arcane',(0,11,0),'#a574ff',5,20)
    for n,normal in enumerate(((0,1,0),(.7,.6,.3),(-.5,.3,.8))):r.ring('Brass orrery orbital ring',(0,27,0),6+n*.35,.11,'gold',normal,48)
    r.rock('Orrery central sphere',(0,27,0),(1.8,3.6,1.8),'brass')
    chain(r,(0,38,0),(0,29,0),.3)
    for i in range(7):
        a=i*math.tau/7;r.rock('Orrery planet',(math.cos(a)*6,27+math.sin(a)*2,math.sin(a)*6),(.35,.7,.35),'gold')
    for x,z in ((-13,15),(13,-15)):table(r,(x,0,z),8)
    r.landmarks=['Three accessible gallery levels','Forty tall bookcases with individual books','Chained floating grimoire','Suspended brass astronomical orrery']

def inverted(r):
    shell(r,True);galleries(r,3,31,49,8)
    # Deep shaft is below the traversable bridge plane, with an actual missing floor.
    for side in (-1,1):
        r.box('Pit shaft wall',(side*15,-8,0),(1,16,30),'stone_dark')
        r.box('Pit shaft wall',(0,-8,side*15),(30,16,1),'stone_dark')
    r.box('Pit deep shadow',(0,-16.1,0),(30,.2,30),'void')
    r.collision_box('Pit bottom',0,-16.3,0,30,.3,30)
    for i in range(20):
        a=i*math.tau/20;rad=11+(i%3)
        r.loft('Pit arcane crystal',[(-15,1.1,1.1,math.cos(a)*rad,math.sin(a)*rad),(-9+i%4,0,0,math.cos(a)*rad,math.sin(a)*rad)],'arcane' if i%4==0 else 'rock',5)
    crossing(r,'Pit',0,6,33)
    stairs(r,'Pit escape lower flight',11,-16,0,5,8,24,1)
    deck(r,'Pit escape middle landing',7.9,-8,13.5,11.2,3)
    stairs(r,'Pit escape upper flight',4.8,-8,0,5,8,24,-1)
    deck(r,'Pit escape rim landing',4.8,0,-15,5,6)
    r.features['pitEscape']={'lowerX':11,'upperX':4.8,'bottom':-16,'middle':-8,'top':0,'flights':2}
    for side in (-1,1):
        for z1,z2 in ((-15,-4),(4,15)):railing(r,(side*3,0,z1),(side*3,0,z2),1.25)
        for x1,x2 in ((-15,-4),(4,15)):railing(r,(x1,0,side*3),(x2,0,side*3),1.25)
    r.ring('Suspended coffin crown',(0,34,0),15,.34,'iron',segments=48)
    for i in range(9):
        a=i*math.tau/9;x=math.cos(a)*15;z=math.sin(a)*15;y=18+2*math.sin(i*2)
        coffin(r,(x,y,z),2.5,-a+math.pi/2,True)
        chain(r,(x,43,z),(x,y+9,z),.36)
        for side in (-1,1):chain(r,(x,34,z),(x+side*1.8,y+8.5,z),.24)
        r.loft('Crown thorn',[(34,.3,.3,x,z),(36.3,0,0,x,z)],'iron',5)
    for side in (-1,1):
        for z in (-20,0,20):
            for y in (0,8,16,24):niche(r,(side*38,y,z),.95,-side*math.pi/2)
        banner(r,(side*24,34,-20),4,12)
        brazier(r,(side*20,0,20),1,True)
    r.anchor('ritual_pit','arcane',(0,-9,0),'#9465ff',7,27)
    r.landmarks=['Nine hanging carved sarcophagi','Forged suspension crown and chain network','Sixteen metre ritual shaft','Safe cruciform pit crossings and three galleries']

def titan(r):
    shell(r);galleries(r,2,31,49,9)
    skull(r,(0,30,-23),15)
    deck(r,'Titan rib bridge',0,18,-2,6,40,True)
    deck(r,'Titan rib bridge landing',0,18,-22,62,4)
    for z in (-17,-7,3,13):
        for side in (-1,1):chain(r,(side*3,26,z),(side*2.5,18,z),.25)
    for i in range(8):
        z=-17+i*5
        r.rock('Titan great vertebra',(0,26,z),(3.4,1.6,1.1),'bone')
        for side in (-1,1):
            points=[]
            for j in range(11):
                a=j*math.pi*.48/10;points.append((side*(3+math.sin(a)*16),4+math.cos(a)*22,z))
            points.append((side*19,1.5,z))
            r.tube('Titan massive rib arch',points,.75+(8-i)*.04,'bone',7)
            r.rock('Titan rib foot',(side*19,.7,z),(1.45,1.8,1.35),'bone')
            r.collision_box('Titan rib foot',side*19,0,z,2.9,1.6,2.7)
    # Two stair approaches leave a clear axial route through the shrine undercroft.
    deck(r,'Titan shrine',0,10,-22,20,10)
    for side in (-1,1):
        stairs(r,'Titan shrine stair',side*8,0,0,6,10,34,-1)
        for z in (-18,0,18):
            arch(r,(side*36,0,z),6,14,2,-side*math.pi/2)
            coffin(r,(side*36,1,z),1.4,-side*math.pi/2,True)
            r.box('Mausoleum pediment',move((0,14,0),(side*36,0,z),-side*math.pi/2),(8,1.1,3),'stone_light',-side*math.pi/2)
        banner(r,(side*24,23,16),4,10)
        brazier(r,(side*14,0,24),1.5)
    for i in range(14):candles(r,(-8+i*1.25,10,-22),3,.4)
    # Monumental broken sword beside the ribs, modeled as bevelled steel and gold furniture.
    r.box('Titan broken blade',(17,.8,9),(2.5,1,25),'iron',.6,.16)
    r.box('Titan sword crossguard',(10,1.2,-1),(11,1.7,2),'brass',.6,.15)
    r.box('Titan sword grip',(7,.9,-5),(1.2,1.2,8),'wood',.6,.08)
    r.landmarks=['Colossal faceted skull shrine','Sixteen titan rib arches and suspended spine bridge','Mausoleum side tombs','Twin stair routes and the king’s fallen blade']

def cathedral(r):
    shell(r);galleries(r,3,62,96,9)
    # Tall interior arcade creates the nave scale, with open cardinal corridors.
    for side in (-1,1):
        for z in (-45,-27,-9,9,27,45):
            pillar(r,side*52,0,z,48,2.8)
            for y in (0,9,18):niche(r,(side*71,y,z),1.2,-side*math.pi/2,True)
            banner(r,(side*50,38,z),5.3,14,-side*math.pi/2)
            lantern(r,(side*42,35,z),1.4)
            chain(r,(side*42,65,z),(side*42,38,z),.34)
            # Great pointed transverse vault ribs close above the arena, not across the exit floor.
            pts=[(side*(52-j*5.2),48+math.sin(j*math.pi/20)*25,z) for j in range(11)]
            r.tube('Cathedral great vault rib',pts,.75,'stone_light',7)
            for y in (9,18,27):candles(r,(side*61,y,z),6,1.2)
    for side in (-1,1):
        for j in range(5):arch(r,(side*62,0,-36+j*18),13,24,2.6,math.pi/2)
    # Thin gold inlays preserve the arena as open playable floor.
    for rad in (16,27,37,39):r.ring('Thin gold arena circle',(0,.045,0),rad,.055,'gold',segments=128)
    for i in range(16):
        a=i*math.tau/16
        r.beam('Gold radial inlay',(math.cos(a)*16,.047,math.sin(a)*16),(math.cos(a)*39,.047,math.sin(a)*39),.045,'gold',4)
    for scale in (7,11):r.tube('Diamond arena inlay',[(0,.055,-scale),(scale*.7,.055,0),(0,.055,scale),(-scale*.7,.055,0),(0,.055,-scale)],.075,'gold',4)
    for side in (-1,1):
        for z in (-53,-33,-13,13,33,53):
            brazier(r,(side*42,0,z),1.45)
            coffin(r,(side*67,0,z),1.8,side*.25)
            candles(r,(side*57,0,z+3),8,1.5)
    for z in (-60,60):
        arch(r,(0,0,z),20,52,3.5)
        for side in (-1,1):
            pillar(r,side*20,0,z,51,3)
            banner(r,(side*21,36,z),5,16)
            niche(r,(side*30,0,z),1.6,0 if z<0 else math.pi,True)
    for z in (-25,25):
        r.ring('Great chandelier',(0,48,z),8,.28,'brass',segments=32)
        for i in range(10):
            a=i*math.tau/10;x=math.cos(a)*8;zz=z+math.sin(a)*8
            lantern(r,(x,46,zz),.65);chain(r,(0,64,z),(x,48,zz),.22)
    r.features['bossClearance']={'x':0,'z':0,'radius':35,'height':44}
    r.landmarks=['Gothic nave and great vaulted ribs','Three levels of skull niches and galleries','Purple banners with gold diamond emblems','Thin gold arena inlays','Chained lanterns and two great chandeliers']

BUILDERS=[wine,drowned,bell,furnace,library,inverted,titan,cathedral]
NAMES=['Broken wine vault','The sunken reliquary','The bellkeeper’s tomb','The funeral furnace','The lich’s archive','The hanging sarcophagi','The grave of the first king','The heart beneath the world']
CEILINGS=[18,23,28,33,39,46,55,82]
