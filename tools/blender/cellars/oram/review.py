"""Import the delivered GLB, sample all clips, and render reference-facing views.

Runs through the same isolated Oram MCP bridge, after build.py has saved sources.
"""
from pathlib import Path
import bpy,sys,math,json,hashlib
from mathutils import Vector
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.path[:0]=[str(HERE.parent.parent),str(HERE.parent)]
import rigkit as rk
from meshkit import v,material
ART=ROOT/'docs/art/old-cellars/blender/oram';GLB=ROOT/'assets/models/cellars/oram/oram.glb'
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
bpy.context.scene.render.fps=120
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
bpy.ops.import_scene.gltf(filepath=str(GLB))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
for ob in list(bpy.data.objects):
    if ob.type=='MESH' and ob not in meshes:bpy.data.objects.remove(ob,do_unlink=True)
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
actions=list(bpy.data.actions)
for track in arm.animation_data.nla_tracks:track.mute=True
by_name={a.name.split('|')[-1]:a for a in actions}
# Imported animation frame range respects the current 120 fps scene.
measurements=rk.measure_clips(arm,meshes,actions)
report={'glbSha256':hashlib.sha256(GLB.read_bytes()).hexdigest(),'source':'actual glTF import through Blender MCP','armature':arm.name,'bones':[b.name for b in arm.data.bones],'meshes':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'clips':{a.name:{'seconds':float(a.frame_range[1]-a.frame_range[0])/120,**measurements[a.name]} for a in actions}}
arm.animation_data.action=None;rk.rest_pose(arm);sc=bpy.context.scene;sc.frame_set(0)
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=True
sc.render.resolution_x=700;sc.render.resolution_y=850;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1);sc.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
sc.view_settings.view_transform='AgX'
floor_mat=material('Oram review floor',0x777975,0,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));floor=bpy.context.object;floor.name='Review floor';floor.data.materials.append(floor_mat)
def aim(ob,point):ob.rotation_euler=(Vector(point)-ob.location).to_track_quat('-Z','Y').to_euler()
def light(name,p,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);sc.collection.objects.link(ob);ob.location=v(p);aim(ob,v((0,1,0)))
light('Review key',(-2.6,3.5,3.4),460,3.2)
light('Review fill',(2.9,2.2,2),240,3)
light('Review rim',(1.7,3.2,-2.3),510,2.2)
cam_data=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',cam_data);sc.collection.objects.link(cam);sc.camera=cam
cam_data.type='ORTHO';cam_data.ortho_scale=2.25;cam_data.lens=70
captures=[]
def render(name,p,target=(0,.97,0),scale=2.25,clip=None,seconds=0):
    if clip:
        arm.animation_data.action=by_name[clip];rk._assign_slot(arm,by_name[clip]);sc.frame_set(round(seconds*120))
    else:arm.animation_data.action=None;rk.rest_pose(arm);sc.frame_set(0)
    cam.location=v(p);aim(cam,v(target));cam.data.ortho_scale=scale
    if clip:
        bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();points=[]
        for ob in meshes:
            ev=ob.evaluated_get(dg);me=ev.to_mesh();points.extend(ev.matrix_world@vv.co for vv in me.vertices);ev.to_mesh_clear()
        inv=cam.matrix_world.inverted();projected=[inv@pt for pt in points]
        low=[min(pt[i] for pt in projected) for i in range(2)];high=[max(pt[i] for pt in projected) for i in range(2)]
        offset=cam.rotation_euler.to_matrix()@Vector(((low[0]+high[0])/2,(low[1]+high[1])/2,0))
        cam.location+=offset;cam.data.ortho_scale=max(high[1]-low[1],(high[0]-low[0])*850/700)*1.16
    path=ART/(name+'.png');sc.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    captures.append({'file':str(path.relative_to(ROOT)),'clip':clip,'seconds':seconds,'cameraGame':p,'targetGame':target})
render('front',(0,1.03,4))
render('profile',(-4,1.03,0))
render('rear',(0,1.03,-4))
render('three-quarter',(-3,1.9,4))
render('idle',(-2.7,1.9,4),clip='idle',seconds=.6)
render('walk',(-2.7,1.9,4),clip='walk',seconds=.25)
render('attack-windup',(-2.7,1.9,4),target=(-.05,1.05,0),scale=2.65,clip='attack',seconds=.30)
render('attack-impact',(-2.7,1.9,4),target=(-.05,1.05,.15),scale=2.65,clip='attack',seconds=.47)
render('hurt',(-2.7,1.9,4),clip='hurt',seconds=.10)
render('war-cry',(-2.7,1.9,4),target=(0,1.1,0),scale=2.7,clip='cast',seconds=.7)
render('die',(-2.7,2.7,3),target=(0,.35,.9),scale=2.6,clip='die',seconds=1.43)
report['captures']=captures
(ART/'import-review.json').write_text(json.dumps(report,indent=2)+'\n')
print('ORAM_IMPORT_REVIEW',json.dumps(report,indent=2))
