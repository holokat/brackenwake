"""Deterministic Oram Blackhand builder, executed in an isolated Blender MCP session.

Python client: tools/blender/cellars/mcp_client.py --port 9878 --script tools/blender/cellars/oram/build.py
Authoring scale: 1.90 m. Game integration preserves existing boss scale.
"""
import os,sys,math,json,hashlib,importlib
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path[:0]=[str(HERE),str(HERE.parent),str(HERE.parent.parent)]
import bpy
import rigkit as rk
from meshkit import Kit,material,v
import geometry,animation
importlib.reload(geometry);importlib.reload(animation)
from geometry import shell,sheet,band,stud,shell_fragment,finger
from animation import author_actions,ground_actions
OUT=ROOT/'assets/models/cellars/oram';ART=ROOT/'docs/art/old-cellars/blender/oram'
OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
# Only the dedicated background session is touched. Preserve the MCP extension.
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
for collection in [bpy.data.actions,bpy.data.materials,bpy.data.meshes,bpy.data.armatures]:
    for item in list(collection):
        collection.remove(item)
sc=bpy.context.scene;sc.render.fps=120;sc.frame_start=0;sc.frame_end=120
palette={name:material('Oram '+name,col,metal,rough) for name,col,metal,rough in [
 ('coat',0x292c30,0,.88),('cloth edges',0x4a4945,0,.91),('brass',0xbaa16a,.68,.43),
 ('iron',0x676b73,.68,.46),('iron dark',0x36393c,.62,.53),('black glove',0x232324,.35,.65),
 ('leather',0x514234,0,.89),('sash',0x743d3e,0,.94),('skin',0xb18060,0,.9),
 ('skin shade',0x825b43,0,.92),('hair',0x222120,0,.93),('eye',0x191716,0,.75),
 ('eggshell',0xe4d9bc,0,.9),('blade',0x9ca0a5,.76,.33) ]}
k=Kit(palette)
bones=[('hips',(0,1.025,0),(0,1.19,0),None,False),('chest',(0,1.19,0),(0,1.535,0),'hips',True),('head',(0,1.535,0),(0,1.88,0),'chest',True)]
for s,n in [(-1,'R'),(1,'L')]:
    specs=[('upperarm',(s*.247,1.48,0),(s*.337,1.22,0),'chest'),('forearm',(s*.337,1.22,0),(s*.397,1.01,.045),'upperarm_'+n),('hand',(s*.397,1.01,.045),(s*.405,.914,.07),'forearm_'+n),('thigh',(s*.11,1.025,0),(s*.145,.585,0),'hips'),('shin',(s*.145,.585,0),(s*.155,.13,0),'thigh_'+n),('foot',(s*.155,.13,0),(s*.155,.065,.14),'shin_'+n),('coat',(s*.15,1.075,0),(s*.205,.58,.1),'hips')]
    bones.extend((name+'_'+n,a,b,p,False) for name,a,b,p in specs)
bones.extend([('sash',(.22,1.10,.04),(.27,.73,.06),'hips',False),('pouch',(-.23,1.10,.12),(-.27,.90,.15),'hips',False)])
arm=rk.build_armature('Oram',[(n,v(a),v(b),p,c) for n,a,b,p,c in bones])
# Tailored uniform: faceted torso, shoulder slopes, flared waist.
shell(k,'tailored uniform',[(1.065,.187,.114,0,0),(1.17,.176,.115,0,0),(1.35,.231,.14,0,0),(1.465,.249,.126,0,0),(1.53,.125,.087,0,0)],'coat','chest',16,facets=.035)
shell(k,'trouser seat',[(.90,.17,.108,0,0),(1.04,.19,.12,0,0),(1.12,.17,.11,0,0)],'leather','hips',12,facets=.04)
# Chest facing strips follow the chest volume, double row brass buttons.
for s,n in [(-1,'R'),(1,'L')]:
    sheet(k,'front seam '+n,[[(s*.142,1.13,.113),(s*.157,1.13,.114)],[(s*.181,1.42,.119),(s*.199,1.42,.115)],[(s*.117,1.50,.106),(s*.139,1.50,.096)]],'brass','chest',.005)
    for i in range(4):
        yy=1.18+i*.07;xx=s*(.107+i*.01)
        stud(k,'uniform button '+n+str(i),(xx,yy,.143),.016,'brass','chest')
    # Sewn lapels, stand-up collar and shoulder braid.
    k.plate('lapel '+n,[(s*.02,1.36),(s*.038,1.49),(s*.105,1.515),(s*.158,1.46),(s*.075,1.37)],.017,'cloth edges','chest',(0,0,.127),.003,.006)
    k.beam('shoulder braid '+n,(s*.13,1.501,.005),(s*.272,1.466,.003),.017,'brass','chest',6)
    k.beam('epaulette cloth '+n,(s*.135,1.513,.01),(s*.27,1.478,.005),.011,'coat','chest',6)
    stud(k,'shoulder stud '+n,(s*.205,1.497,.023),.013,'brass','chest')
# High collar and brass gorget wrap the neck with a dipped convex breast.
band(k,'standing collar',1.535,.108,.085,.09,'coat','chest')
band(k,'collar brass piping',1.583,.112,.089,.008,'brass','chest')
shell(k,'neck',[(1.51,.067,.062,0,0),(1.655,.062,.058,0,0)],'skin','head',10)
sheet(k,'brass gorget',[[(-.105,1.552,.092),(-.062,1.552,.123),(0,1.553,.14),(.062,1.552,.123),(.105,1.552,.092)],[(-.109,1.493,.09),(-.062,1.475,.141),(0,1.464,.165),(.062,1.475,.141),(.109,1.493,.09)]],'brass','chest',.013)
for s in [-1,1]:stud(k,'gorget rivet '+str(s),(s*.091,1.53,.111),.009,'brass','chest')
# Red sash crosses the belly and travels around the back, with a separate torn tail.
band(k,'waist sash',1.112,.192,.13,.07,'sash','hips',.09)
band(k,'sash fold',1.105,.199,.137,.019,'sash','hips',-.17)
band(k,'officer belt',1.067,.198,.137,.054,'leather','hips')
k.box('buckle',(0,1.066,.150),(.088,.068,.023),'brass','hips',.01)
k.box('buckle inset',(0,1.066,.166),(.057,.043,.007),'leather','hips',.004)
k.beam('buckle tongue',(-.02,1.066,.174),(.025,1.066,.174),.003,'brass','hips')
for xx in [.06,.08,.1,.12]:stud(k,'belt hole '+str(xx),(xx,1.066,.14),.004,'eye','hips')
for s in [-1,1]:
    k.box('belt keeper '+str(s),(s*.153,1.07,.115),(.019,.07,.025),'leather','hips',.005)
    stud(k,'rear waist button '+str(s),(s*.079,1.105,-.139),.014,'brass','hips')
sheet(k,'ragged red sash tail',[[(.20,1.104,.015),(.27,1.098,.018),(.29,1.072,.04)],[(.23,.98,.079),(.289,.953,.08),(.302,.977,.025)],[(.225,.825,.134),(.317,.785,.07),(.329,.864,.039)],[(.244,.696,.171),(.303,.733,.115),(.354,.653,.061)]],'sash','sash',.012)
sheet(k,'sash hanging crease',[[(.227,1.089,.046),(.245,1.084,.055)],[(.257,.94,.096),(.275,.95,.105)],[(.291,.737,.122),(.311,.687,.126)]],'sash','sash',.009)
# Four tapered skirt panels with damaged edge profiles. Each side has its own joint.
for s,n in [(-1,'R'),(1,'L')]:
    x=[.029,.078,.128,.172,.204]
    top=[(s*a,1.08,.133-.049*i/4) for i,a in enumerate(x)]
    mid=[(s*a,.84,.156-.075*i/4) for i,a in enumerate([.059,.125,.193,.249,.275])]
    bot=[(s*a,y,z) for a,y,z in zip([.108,.143,.209,.264,.305],[.528,.57,.547,.63,.568],[.166,.16,.13,.094,.04])]
    sheet(k,'torn front halfcoat '+n,[top,mid,bot],'coat','coat_'+n,.014)
    sheet(k,'coat front brass edging '+n,[[(s*.029,1.08,.139),(s*.042,1.08,.139)],[(s*.058,.84,.161),(s*.075,.84,.161)],[(s*.108,.528,.171),(s*.124,.55,.171)]],'cloth edges','coat_'+n,.006)
    for i in [1,2,3]:
        a=bot[i];b=bot[i-1]
        sheet(k,'frayed facing '+n+str(i),[[(a[0],a[1]+.045,a[2]+.004),(b[0],b[1]+.055,b[2]+.004)],[(a[0],a[1],a[2]+.004),(b[0],b[1],b[2]+.004)]],'cloth edges','coat_'+n,.004)
    rear_top=[(s*a,1.08,-.132+.055*i/4) for i,a in enumerate([.009,.059,.11,.16,.208])]
    rear_mid=[(s*a,.815,-.151+.08*i/4) for i,a in enumerate([.014,.086,.162,.239,.277])]
    rear_end=[(s*a,y,z) for a,y,z in zip([.022,.097,.182,.242,.305],[.59,.54,.604,.567,.608],[-.167,-.17,-.142,-.1,-.047])]
    sheet(k,'ragged back halfcoat '+n,[rear_top,rear_mid,rear_end],'coat','coat_'+n,.014)
    # Side seam joins front and back skirt, retaining an open slit at the knee.
    sheet(k,'coat side gusset '+n,[[top[-1],(s*.214,1.08,-.002),rear_top[-1]],[mid[-1],(s*.299,.83,-.005),rear_mid[-1]],[bot[-1],(s*.315,.654,-.007),rear_end[-1]]],'coat','coat_'+n,.012)
    stud(k,'skirt button '+n,(s*.12,.834,.155),.012,'brass','coat_'+n)
# Limbs with cuff overlap hide rigid deformation boundaries.
for s,n in [(-1,'R'),(1,'L')]:
    ua='upperarm_'+n;fa='forearm_'+n;hand='hand_'+n;th='thigh_'+n;sh='shin_'+n;fo='foot_'+n
    shell(k,'upper sleeve '+n,[(1.203,.076,.079,s*.342,0),(1.318,.087,.096,s*.308,0),(1.451,.095,.094,s*.261,0),(1.485,.06,.065,s*.235,0)],'coat',ua,10,facets=.08)
    shell(k,'elbow folds '+n,[(1.17,.071,.079,s*.354,.004),(1.227,.08,.086,s*.337,0),(1.26,.073,.08,s*.326,0)],'cloth edges',fa,10,facets=.12)
    shell(k,'lower sleeve '+n,[(.997,.059,.065,s*.399,.041),(1.1,.075,.083,s*.371,.026),(1.218,.07,.082,s*.343,.002)],'coat',fa,10,facets=.045)
    band(k,'linen cuff '+n,1.007,.064,.071,.024,'cloth edges',fa,x=s*.398,z=.04,segments=10)
    # Left simple leather hand; the right's fingers are steel black gauntlet plates.
    hmat='black glove' if n=='R' else 'leather'
    shell(k,'palm '+n,[(.912,.047,.044,s*.41,.073),(.987,.05,.041,s*.40,.056),(1.018,.042,.04,s*.398,.044)],hmat,hand,8)
    for i in range(4):
        xx=s*(.376+i*.022)
        finger(k,'finger '+n+str(i),(xx,.946,.105),(xx,.899,.107),(xx,.888,.071),.012,hmat,hand)
        if n=='R':k.box('knuckle plate '+str(i),(xx,.946,.114),(.018,.025,.011),'iron dark',hand,.003)
    finger(k,'thumb '+n,(s*.363,.978,.064),(s*.35,.933,.091),(s*.364,.913,.094),.016,hmat,hand)
    # Tall folded riding boots, shaped soles and toes.
    shell(k,'trouser leg '+n,[(.464,.072,.077,s*.15,0),(.60,.082,.082,s*.146,0),(.82,.105,.095,s*.128,0),(1.003,.098,.103,s*.111,0)],'leather',th,10,facets=.09)
    shell(k,'boot shaft '+n,[(.108,.057,.071,s*.155,0),(.232,.062,.074,s*.153,0),(.363,.081,.091,s*.153,0),(.443,.077,.088,s*.151,0)],'leather',sh,10,facets=.07)
    shell(k,'turned boot cuff '+n,[(.36,.092,.103,s*.153,0),(.381,.10,.106,s*.153,0),(.439,.097,.103,s*.153,0),(.459,.081,.095,s*.151,0)],'leather',sh,10,facets=.08)
    shell(k,'boot sole '+n,[(0,.082,.139,s*.155,.049),(.028,.088,.146,s*.155,.05),(.042,.083,.14,s*.155,.05)],'leather',fo,12)
    shell(k,'boot upper '+n,[(.039,.08,.135,s*.155,.05),(.088,.079,.132,s*.155,.047),(.138,.062,.094,s*.155,.012),(.185,.055,.069,s*.155,0)],'leather',fo,12,facets=.06)
    k.beam('boot ankle strap '+n,(s*.224,.139,.028),(s*.096,.113,.094),.011,'cloth edges',fo,6)
    k.box('boot buckle '+n,(s*.131,.127,.09),(.033,.033,.015),'brass',fo,.005)
    k.box('boot buckle hole '+n,(s*.131,.127,.101),(.019,.02,.006),'leather',fo,.002)
# The single left pauldron rises to an angular crown, then layers over the sleeve.
for i in range(3):
    pts=[(.213+i*.019,1.458-i*.047),(.223+i*.018,1.553-i*.046),(.252+i*.025,1.58-i*.047),(.328+i*.022,1.479-i*.047),(.357+i*.015,1.404-i*.047),(.296+i*.021,1.423-i*.047)]
    k.plate('single pauldron lame '+str(i),pts,.168-i*.016,'iron' if i==0 else 'iron dark','upperarm_L',(0,0,0),.013,.023)
    k.beam('pauldron rim '+str(i),(pts[-1][0],pts[-1][1],.105-i*.004),(pts[-2][0],pts[-2][1],.105-i*.004),.006,'iron','upperarm_L')
    for ri,(xx,yy) in enumerate([pts[-1],pts[-2]]):stud(k,'pauldron rivet %s %s'%(i,ri),(xx,yy+.013,.104-i*.004),.007,'blade','upperarm_L')
# Right black vambrace has a flared elbow, layered wrist and etched ridge.
k.plate('blackhand vambrace',[(-.327,1.197),(-.307,1.139),(-.359,1.021),(-.420,1.019),(-.421,1.109),(-.394,1.206)],.093,'iron dark','forearm_R',(0,0,.043),.012,.013)
k.beam('vambrace ridge',(-.363,1.187,.111),(-.389,1.04,.112),.008,'iron','forearm_R')
band(k,'gauntlet wrist ring',1.018,.061,.065,.023,'black glove','hand_R',x=-.40,z=.045,segments=8)
# Left sleeve strap and right rank chevrons.
k.beam('left forearm brass strap',(.338,1.099,.087),(.414,1.139,.087),.012,'brass','forearm_L')
for i in range(2):
    sheet(k,'sergeant chevron '+str(i),[[(-.356,1.352-i*.025,.064),(-.303,1.322-i*.025,.09),(-.265,1.341-i*.025,.064)],[(-.356,1.339-i*.025,.064),(-.303,1.309-i*.025,.09),(-.265,1.328-i*.025,.064)]],'brass','upperarm_R',.004)
# Eggshell sack at the right hip, with a lipped opening and leather sling.
shell(k,'eggshell sack',[(.805,.064,.046,-.244,.127),(.837,.083,.061,-.251,.138),(.939,.087,.063,-.255,.146),(.979,.071,.055,-.252,.139)],'leather','pouch',11,facets=.10)
band(k,'sack open mouth',.978,.077,.058,.028,'leather','pouch',x=-.252,z=.14,segments=11)
k.plate('pouch dark opening',[(-.066,-.014),(-.038,.01),(.052,.011),(.068,-.014)],.067,'eye','pouch',(-.251,.979,.14),.003,0)
for i,(xx,yy,zz,r) in enumerate([(-.29,.99,.145,.027),(-.253,1.004,.158,.032),(-.213,.997,.139,.025),(-.276,.993,.111,.024)]):
    shell_fragment(k,'broken eggshell '+str(i),(xx,yy,zz),r,'eggshell','pouch',i)
k.beam('pouch upper hanger',(-.228,1.103,.109),(-.302,.963,.174),.012,'leather','pouch')
k.beam('pouch folded rim',(-.323,.965,.167),(-.185,.996,.175),.014,'leather','pouch')
k.beam('pouch closing strap',(-.302,.964,.188),(-.292,.828,.191),.008,'cloth edges','pouch')
# Longsword held vertically, slight diagonal cant. It is part of the hand skin.
# All blade cross-sections form a diamond ridge, a straight edge and sharp tapered tip.
sx=-.405;sy=.868;sz=.075
k.beam('sword grip',(sx,.963,sz),(sx,.873,sz),.017,'leather','hand_R',8)
for i in range(5):band(k,'sword grip wrap '+str(i),.883+i*.014,.019,.019,.004,'black glove','hand_R',x=sx,z=sz,segments=8)
stud(k,'sword pommel',(sx,.975,sz),.027,'brass','hand_R')
k.plate('sword crossguard',[(-.075,-.013),(-.055,.018),(-.019,.02),(.019,.02),(.06,.01),(.077,-.018),(.058,-.024),(.038,-.01),(-.042,-.004),(-.064,-.031)],.028,'brass','hand_R',(sx,sy,sz),.004,.003)
verts=[]
for yy,w,xx in [(.853,.035,sx),(.80,.034,sx-.006),(.31,.028,sx-.08),(.194,0,sx-.102)]:
    verts.extend([(xx-w,yy,sz),(xx,yy,sz+.014),(xx+w,yy,sz),(xx,yy,sz-.012)])
faces=[(3,2,1,0)]
for j in range(3):
    for i in range(4):faces.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
k.mesh('longsword diamond blade',verts,faces,'blade','hand_R')
# Angular head, sloping temples and broad jaw. Face is shaped in depth.
shell(k,'head sculpt',[(1.615,.055,.049,0,.008),(1.649,.079,.064,0,.004),(1.702,.091,.075,0,0),(1.759,.087,.073,0,0),(1.814,.085,.077,0,-.007),(1.853,.063,.063,0,-.006)],'skin','head',12,facets=.028)
for s in [-1,1]:
    k.plate('ear '+str(s),[(s*.082,1.699),(s*.098,1.694),(s*.107,1.733),(s*.103,1.756),(s*.086,1.754)],.029,'skin','head',(0,0,-.001),.003,.002)
    k.plate('ear fold '+str(s),[(s*.092,1.707),(s*.098,1.731),(s*.09,1.741)],.009,'skin shade','head',(0,0,.018),.001,.001)
    k.plate('cheek plane '+str(s),[(s*.025,1.725),(s*.071,1.743),(s*.086,1.716),(s*.056,1.675),(s*.025,1.689)],.014,'skin','head',(0,0,.064),.003,.012)
    k.plate('socket '+str(s),[(s*.014,1.762),(s*.07,1.765),(s*.076,1.747),(s*.02,1.744)],.009,'skin shade','head',(0,0,.068),.002,0)
    k.plate('eye slit '+str(s),[(s*.019,1.755),(s*.065,1.754),(s*.061,1.748),(s*.021,1.749)],.003,'eggshell','head',(0,0,.077),.0004,0)
    k.box('dark pupil '+str(s),(s*.038,1.752,.081),(.008,.008,.003),'eye','head',.001)
    k.plate('angry eyebrow '+str(s),[(s*.012,1.762),(s*.07,1.774),(s*.076,1.76),(s*.013,1.751)],.012,'hair','head',(0,0,.079),.002,0)
    # Beard sideburns continue onto the cheek, avoid a painted square face.
    k.plate('beard cheek '+str(s),[(s*.081,1.749),(s*.087,1.674),(s*.056,1.633),(s*.025,1.641),(s*.046,1.676),(s*.06,1.694),(s*.069,1.739)],.022,'hair','head',(0,0,.06),.003,.007)
# Nose has a bridge, wing corners and projecting triangular tip.
k.mesh('nose bridge',[(-.013,1.764,.078),(.013,1.764,.078),(-.018,1.706,.094),(.018,1.706,.094),(0,1.711,.128),(0,1.756,.095),(0,1.703,.096)],[(0,1,5),(0,5,4,2),(5,1,3,4),(2,4,6),(4,3,6),(0,2,6,3,1)],'skin','head')
for s in [-1,1]:k.beam('nostril '+str(s),(s*.013,1.706,.103),(s*.022,1.706,.092),.004,'skin shade','head')
k.plate('mouth shadow',[(-.033,1.678),(-.024,1.687),(.02,1.688),(.034,1.679),(.019,1.67),(-.025,1.671)],.005,'eye','head',(0,0,.079),.001,0)
k.plate('lower lip',[(-.023,1.673),(0,1.676),(.022,1.673),(.016,1.666),(-.018,1.666)],.006,'skin','head',(0,0,.083),.001,.002)
k.plate('short beard',[(-.058,1.663),(-.033,1.645),(0,1.653),(.033,1.645),(.058,1.663),(.065,1.616),(.031,1.605),(0,1.6),(-.036,1.607),(-.064,1.626)],.045,'hair','head',(0,0,.054),.005,.01)
for s in [-1,1]:k.plate('moustache '+str(s),[(0,1.701),(s*.032,1.697),(s*.051,1.676),(s*.029,1.682),(s*.014,1.69),(0,1.69)],.015,'hair','head',(0,0,.083),.002,.003)
# Cropped black hair follows the skull and projects jagged locks around the crown.
shell(k,'cropped hair',[(1.781,.088,.079,0,-.01),(1.838,.095,.083,0,-.016),(1.871,.077,.072,0,-.017),(1.89,.039,.039,0,-.008)],'hair','head',11,facets=.10)
for i in range(7):
    a=math.tau*i/7;xx=math.cos(a)*.05;zz=-.01+math.sin(a)*.043
    k.loft('cropped hair peak '+str(i),[(1.855,.035,.028,xx,zz),(1.882+(i%3)*.009,.018,.016,xx+.008,zz-.008)],'hair','head',5)
# Back and side hair drops to the nape instead of exposing the rear skull.
verts=[];N=16
for j in range(2):
    for i in range(N):
        a=math.tau*(i+.5)/N
        y=(1.79 if math.sin(a)>.3 else 1.71 if math.sin(a)>-.2 else 1.667) if j==0 else 1.824
        verts.append((math.cos(a)*(.087 if j==0 else .091),y,-.009+math.sin(a)*(.078 if j==0 else .083)))
k.mesh('cropped nape hair',verts,[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],'hair','head')
# A leather brow band with one brass stud at the right temple.
band(k,'brow band',1.803,.09,.082,.022,'leather','head',.05,z=-.004,segments=14)
stud(k,'brass brow stud',(-.063,1.801,.061),.014,'brass','head')
# Per-face colour variation is retained as COLOR_0, keeping the draw count fixed.
# Cloth and leather retain their muted, worn reference palette at small game sizes.
for ob in k.objects:
    mat=ob.data.materials[0];base=mat.diffuse_color
    name=ob.name;slot=mat.name.replace('Oram ','')
    amount=.22 if slot in ['coat','leather','hair','sash'] else .11
    tone=.72 if slot=='coat' else .5 if slot=='leather' and ('boot' in name or 'trouser' in name) else 1
    ca=ob.data.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
    for face in ob.data.polygons:
        factor=tone*(1+amount*math.sin(face.index*17.34+sum(ord(c) for c in name)*.13))
        for li in face.loop_indices:ca.data[li].color=tuple(min(1,c*factor) for c in base[:3])+(1,)
for mat in palette.values():
    nt=mat.node_tree;attr=nt.nodes.new('ShaderNodeVertexColor');attr.layer_name='Col'
    nt.links.new(attr.outputs['Color'],nt.nodes.get('Principled BSDF').inputs['Base Color'])
# Preserve semantic part inventory before joining by material.
part_names=[o.name for o in k.objects]
meshes=k.join_slots();rk.bind(meshes,arm)
actions=author_actions(arm)
ground_actions(arm,meshes,actions)
rk.stash(arm,actions);arm.animation_data.action=None;rk.rest_pose(arm);sc.frame_set(0)
blend=ART/'oram.blend';glb=OUT/'oram.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
rk.export_glb(str(glb))
clip_measurements=rk.measure_clips(arm,meshes,actions)
verts=[o.matrix_world@p.co for o in meshes for p in o.data.vertices]
lo=[min(p[i] for p in verts) for i in range(3)];hi=[max(p[i] for p in verts) for i in range(3)]
report={'name':'Sergeant Oram Blackhand','authoringHeightMetres':1.90,'reference':'docs/art/old-cellars/references/01-oram-turnaround.png','mcpPort':9878,'parts':part_names,'vertices':sum(len(o.data.vertices) for o in meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'bones':len(arm.data.bones),'materials':len(meshes),'boundsGame':{'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]},'clips':{a.name:{'seconds':float(a.frame_range[1]-a.frame_range[0])/120,**clip_measurements[a.name]} for a in actions},'sourceFiles':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [HERE/'build.py',HERE/'geometry.py',HERE/'animation.py',HERE.parent/'meshkit.py',HERE.parent.parent/'rigkit.py']},'glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest()}
(ART/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('ORAM_BUILD',json.dumps({key:val for key,val in report.items() if key not in ['parts','sourceFiles']},indent=2))
