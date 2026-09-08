"""Render the exported GLB, not the authoring scene, through Blender MCP."""
import os,sys,math,json
import bpy
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.abspath(os.path.join(HERE,'../../..'))
OUT=os.path.join(ROOT,'docs/art/old-cellars/blender/vharos-review')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'assets/models/cellars/vharos.glb'))
sc=bpy.context.scene
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=24
sc.cycles.use_denoising=True
sc.render.resolution_x=768;sc.render.resolution_y=1024;sc.render.resolution_percentage=100
sc.render.film_transparent=False
sc.view_settings.view_transform='AgX'
sc.world.color=(.15,.15,.15)
sc.world.use_nodes=True
sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.24,.29,1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value=.4
# Ground and lights exist in the review only; none is in the asset GLB.
bpy.ops.mesh.primitive_plane_add(size=400,location=(0,0,-.12));plane=bpy.context.object
mat=bpy.data.materials.new('Review floor');mat.diffuse_color=(.12,.13,.15,1);plane.data.materials.append(mat)
for name,loc,power,color,size in [('key',(-35,-45,55),70000,(1,.78,.51),25),('fill',(35,-15,30),24000,(.43,.63,1),25),('rim',(5,35,45),90000,(.6,.73,1),20)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,20))-ob.location).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('Review camera');cd.type='ORTHO';cd.ortho_scale=42
cam=bpy.data.objects.new('Review camera',cd);bpy.context.collection.objects.link(cam);sc.camera=cam
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for track in arm.animation_data.nla_tracks:track.mute=True
arm.animation_data.action=None
angles=[0,35,90,180]
metadata=[]
for angle in angles:
 cam.location=(math.sin(math.radians(angle))*85,-math.cos(math.radians(angle))*85,25)
 cam.rotation_euler=(Vector((0,0,19))-cam.location).to_track_quat('-Z','Y').to_euler()
 sc.render.filepath=os.path.join(OUT,'front.png' if angle==0 else str(angle)+'.png')
 bpy.ops.render.render(write_still=True)
 metadata.append({'angle':angle,'image':sc.render.filepath})
open(os.path.join(OUT,'captures.json'),'w').write(json.dumps(metadata,indent=2))
print('VHAROS_EXPORT_RENDERS_SAVED',len(metadata))
