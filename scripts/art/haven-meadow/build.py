"""Build/export the reusable meadow kit without altering the user's scene."""
import bpy, sys, time, json, math, importlib.util
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);mod=importlib.util.module_from_spec(spec);sys.modules[name]=mod;spec.loader.exec_module(mod);return mod
geometry=module('bw_meadow_geometry','geometry.py');assets=module('bw_meadow_assets','assets.py')
Mesh=geometry.Mesh;vertex_material=geometry.vertex_material;linear=geometry.linear;FACTORIES=assets.FACTORIES
PREFIX='Brackenwake kite meadow'
OUT=ROOT/'assets/models/haven-meadow'

def build():
 if not bpy.app.background:raise RuntimeError('Use the dedicated background authoring process; keep the open user scene intact')
 original=bpy.context.window.scene;before=(original.name,len(original.objects),bpy.data.filepath)
 start=time.perf_counter();material=vertex_material();models={};stats={}
 # All asset scenes are owned; unrelated Blender objects and scenes survive.
 for name,factory in FACTORIES.items():
  print('MEADOW_BUILD',name,flush=True)
  scene=bpy.data.scenes.new(PREFIX+' '+name);col=scene.collection
  parts=[]
  for suffix,mesh,pivot in factory():
   obj=mesh.object(name+'_'+suffix,col,material)
   if pivot:obj.location=pivot
   if suffix=='sails':obj['bwMotion']={'kind':'spin','axis':'z','speed':.32}
   if suffix=='kite':obj['bwMotion']={'kind':'sway','axis':'z','amplitude':.085,'speed':1.3}
   parts.append(obj)
  scene.view_layers[0].update();models[name]=(scene,parts)
 construction=time.perf_counter()-start
 for name,(scene,parts)in models.items():
  bpy.context.window.scene=scene
  path=ROOT/'public/models/props'/f'{name}.glb'
  bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,
   export_yup=True,export_cameras=False,export_lights=False,export_extras=True,export_apply=True,export_animations=False)
  vertices=[o.matrix_world@v.co for o in parts for v in o.data.vertices]
  stats[name]={'triangles':sum(len(f.vertices)-2 for o in parts for f in o.data.polygons),
   'meshes':len(parts),'bytes':path.stat().st_size,
   'boundsZUp':[[min(v[i]for v in vertices)for i in range(3)],[max(v[i]for v in vertices)for i in range(3)]]}
 print('MEADOW_EXPORTED',flush=True)
 # Preview uses the same meshes and placements as the exported game space.
 preview=bpy.data.scenes.new(PREFIX+' landscape')
 layout=json.loads((ROOT/'src/mmo/spaces/island_kite_meadow.json').read_text())
 terrain=json.loads((HERE/'work/terrain.json').read_text())
 grid={(v[0],v[1]):v[2]for v in terrain['samples']}
 def h(x,z):
  x0=math.floor(x/2)*2;z0=math.floor(z/2)*2;tx=(x-x0)/2;tz=(z-z0)/2
  return (grid.get((x0,z0),4)*(1-tx)+grid.get((x0+2,z0),4)*tx)*(1-tz)+(grid.get((x0,z0+2),4)*(1-tx)+grid.get((x0+2,z0+2),4)*tx)*tz
 ground=Mesh(100)
 for x,z,y,word in terrain['samples']:
  if (x+2,z+2)not in grid:continue
  ground.add([(x,-z,y),(x+2,-z,grid[x+2,z]),(x+2,-z-2,grid[x+2,z+2]),(x,-z-2,grid[x,z+2])],[(0,2,1),(0,3,2)],'sand'if word in('path','sand')else'leaf')
 ground.object('Meadow terrain preview',preview.collection,material)
 for p in layout['pieces']:
  if p['model']not in models:continue
  x=layout['at']['x']+p['x'];z=layout['at']['z']+p['z'];scale=p.get('scale',1)
  root=bpy.data.objects.new('Placement '+p['model'],None);preview.collection.objects.link(root)
  root.location=(x,-z,h(x,z));root.rotation_euler.z=-math.radians(p.get('yaw',0));root.scale=(scale,)*3
  for o in models[p['model']][1]:
   clone=o.copy();clone.data=o.data;preview.collection.objects.link(clone);clone.parent=root
 # Low-poly tree stand-ins for preview composition only; game uses its own arbor trees.
 trees=Mesh(31)
 for t in layout['trees']:
  x=layout['at']['x']+t['x'];y=-(layout['at']['z']+t['z']);z=h(x,-y);k=t.get('scale',1)
  trees.beam((x,y,z-.2),(x+.8,y,z+7*k),.4*k,'wood',6,r2=.16*k)
  for i in range(4):trees.rock((x+math.sin(i*2)*2*k,y+math.cos(i*2)*1.5*k,z+(7+i*.4)*k),(2.7*k,2.4*k,2*k),['leaf','leaflight'],i)
 trees.object('Composition tree proxies, game uses arbor',preview.collection,material)
 stage(preview)
 print('MEADOW_PREVIEW_STAGED',flush=True)
 OUT.mkdir(parents=True,exist_ok=True)
 bpy.context.window.scene=preview;preview.view_layers[0].update()
 # Blender 5.2 partial scene-library writes crash in BKE_view_layer_copy_data.
 # This process was started solely for the meadow, so a normal save is safe.
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'kite-meadow.blend'),compress=True)
 report={'blender':bpy.app.version_string,'constructionSeconds':round(construction,3),'throughExportAndSaveSeconds':round(time.perf_counter()-start,3),'models':stats,'originalScenePreserved':before[:2]==(original.name,len(original.objects)),'isolatedProcess':bpy.app.background,'scene':preview.name}
 (OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n');bpy.context.window.scene=original
 return report

def stage(scene):
 world=bpy.data.worlds.new(PREFIX+' sky');world.use_nodes=True;scene.world=world
 world.node_tree.nodes['Background'].inputs['Color'].default_value=(.44,.59,.7,1)
 world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
 data=bpy.data.lights.new('Meadow sun','SUN');sun=bpy.data.objects.new('Meadow sun',data);scene.collection.objects.link(sun)
 sun.rotation_euler=(math.radians(28),math.radians(-22),math.radians(-35));data.energy=2.3;data.angle=.12
 camera=bpy.data.objects.new('Meadow camera',bpy.data.cameras.new('Meadow camera'));scene.collection.objects.link(camera)
 camera.location=(-89,-474,113);target=Vector((33,-392,4));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
 camera.data.type='ORTHO';camera.data.ortho_scale=160;scene.camera=camera
 scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
 scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.use_stamp=False;scene.render.use_stamp_filename=False
 scene.view_settings.view_transform='AgX'

def revise_asset(name):
 """Replace one owned mesh and its linked preview instances in this process."""
 fresh=module('bw_meadow_assets','assets.py')
 scene=bpy.data.scenes.get(PREFIX+' '+name)
 if scene is None:raise RuntimeError('Build before revising')
 original=bpy.context.window.scene;start=time.perf_counter()
 for suffix,mesh,pivot in fresh.FACTORIES[name]():
  obj=scene.objects[name+'_'+suffix];old=obj.data
  replacement=mesh.object(name+'_revision',scene.collection,old.materials[0])
  for shared in list(bpy.data.objects):
   if shared.type=='MESH' and shared.data==old:shared.data=replacement.data
  bpy.data.objects.remove(replacement,do_unlink=True)
  if pivot:obj.location=pivot
 scene.view_layers[0].update();bpy.context.window.scene=scene
 path=ROOT/'public/models/props'/f'{name}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,
  export_yup=True,export_cameras=False,export_lights=False,export_extras=True,export_apply=True,export_animations=False)
 parts=[o for o in scene.objects if o.type=='MESH'];vertices=[o.matrix_world@v.co for o in parts for v in o.data.vertices]
 report=json.loads((OUT/'build.json').read_text());report['models'][name]={
  'triangles':sum(len(f.vertices)-2 for o in parts for f in o.data.polygons),
  'meshes':len(parts),'bytes':path.stat().st_size,
  'boundsZUp':[[min(v[i]for v in vertices)for i in range(3)],[max(v[i]for v in vertices)for i in range(3)]]}
 report['lastRevisionSeconds']=round(time.perf_counter()-start,3)
 (OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n')
 bpy.context.window.scene=original
 return report['models'][name]

def render(profile='preview'):
 scene=bpy.data.scenes.get(PREFIX+' landscape');original=bpy.context.window.scene
 if scene is None:raise RuntimeError('Build before rendering')
 start=time.perf_counter();bpy.context.window.scene=scene
 try:
  if profile=='preview':
   scene.render.engine='CYCLES';scene.cycles.samples=8
  else:scene.render.engine='CYCLES';scene.cycles.samples=64
  prefs=bpy.context.preferences.addons['cycles'].preferences
  old_backend=prefs.compute_device_type;old_rt=prefs.metalrt
  prefs.compute_device_type='METAL';prefs.get_devices();old_devices=[(d,d.use)for d in prefs.devices]
  try:
   if not any(d.type=='METAL'for d in prefs.devices):raise RuntimeError('Metal GPU unavailable')
   for d in prefs.devices:d.use=d.type=='METAL'
   prefs.metalrt='AUTO';scene.cycles.device='GPU';scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=True;scene.render.use_persistent_data=True
   scene.render.filepath=str(ROOT/'docs/art/haven-meadow'/f'blender-{profile}.png')
   bpy.ops.render.render(write_still=True)
  finally:
   for d,use in old_devices:d.use=use
   prefs.metalrt=old_rt;prefs.compute_device_type=old_backend
  return {'renderSeconds':round(time.perf_counter()-start,3),'path':scene.render.filepath,'samples':scene.cycles.samples,'resolution':[1600,1100]}
 finally:bpy.context.window.scene=original

if __name__=='__main__':result=build()
