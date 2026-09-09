"""Blender-fast: bounded direct-data construction, shared materials, Metal renders."""
import bpy,sys,time,json,math,hashlib,importlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools/blender/widow'))
import geometry,textures,pack
sys.path.insert(0,str(HERE))
import architecture,props
for module in [geometry,textures,pack,architecture,props]:importlib.reload(module)
ASSET=ROOT/'assets/models/cellars/entry';DOC=ROOT/'docs/art/cellar-entry'
PALETTE={'limestone':(0x978a74,0,.95,0),'trim':(0xb0a18b,0,.85,0),'floor':(0x8d8374,0,.95,0),'ceiling':(0x706c64,0,.96,0),'wood':(0x795331,0,.86,0),'timber':(0x523b28,0,.9,0),'iron':(0x4e514f,.8,.47,0),'glow':(0xffbd67,0,.5,3),'wax':(0xd1bd8d,0,.87,0),'bottle':(0x394c38,.15,.35,0),'dark':(0x24272a,0,.97,0),'rubble':(0x8b8173,0,1,0),'coal':(0x272323,0,.95,0),'cloth':(0x60352f,0,1,0)}
def vec(p):return(p[0],-p[2],p[1])
def lin(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4

def setup():
 global scene,geo,report,layout
 if not bpy.app.background:raise RuntimeError('Use the owned background bridge')
 old=bpy.data.scenes.get('Cellar entry')
 if old:
  for ob in list(old.objects):bpy.data.objects.remove(ob,do_unlink=True)
  bpy.data.scenes.remove(old)
 scene=bpy.data.scenes.new('Cellar entry');bpy.context.window.scene=scene;geo=geometry.Geometry()
 layout=json.loads((ASSET/'layout.json').read_text())
 scene.render.engine='CYCLES';scene.cycles.samples=64;scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.use_stamp=False;scene.render.use_stamp_filename=False;scene.view_settings.view_transform='AgX'
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
 if not any(d.type=='METAL' for d in prefs.devices):raise RuntimeError('Metal required on this verified machine')
 for d in prefs.devices:d.use=d.type=='METAL'
 prefs.metalrt='AUTO';scene.cycles.device='GPU';scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=True;scene.render.use_persistent_data=True
 report={'blender':bpy.app.version_string,'profile':{'backend':'METAL','gpuOnly':True,'metalrt':prefs.metalrt,'denoiser':scene.cycles.denoiser,'gpuDenoising':True,'persistentData':True,'samples':64,'resolution':[1440,900]},'timings':{}}
 return report['profile']

def construct(stage):
 t=time.perf_counter();{'architecture':architecture,'props':props}[stage].build(geo,layout);report['timings'][stage]=time.perf_counter()-t
 return {'stage':stage,'seconds':report['timings'][stage],'parts':sum(geo.counts.values())}

def flush():
 t=time.perf_counter();images={}
 for kind in ['stone','wood']:
  path=ROOT/f'assets/models/widow-vault/{kind}-detail.png'
  images[kind]=bpy.data.images.load(str(path));images[kind].pack()
 total=0
 for key,(vv,ff,shades) in geo.parts.items():
  color,metal,rough,emission=PALETTE[key];rgb=tuple(lin(((color>>shift)&255)/255) for shift in [16,8,0])
  # Original packer understands this material prefix, final GLB names are cleaned below.
  mat=bpy.data.materials.new('Widow '+key);mat.use_nodes=True;mat.diffuse_color=rgb+(1,)
  nodes=mat.node_tree.nodes;links=mat.node_tree.links;node=nodes.get('Principled BSDF')
  node.inputs['Base Color'].default_value=rgb+(1,);node.inputs['Roughness'].default_value=rough;node.inputs['Metallic'].default_value=metal;node.inputs['Emission Color'].default_value=rgb+(1,);node.inputs['Emission Strength'].default_value=emission
  me=bpy.data.meshes.new('Cellar '+key);me.from_pydata([vec(p) for p in vv],[],ff);me.update()
  ob=bpy.data.objects.new(key,me);scene.collection.objects.link(ob);me.materials.append(mat)
  attr=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');attr.data.foreach_set('color',[c for v in shades for c in(v,v,v,1)]);me.color_attributes.active_color=attr
  vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=rgb+(1,);links.new(vc.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],node.inputs['Base Color'])
  if key in ['limestone','trim','floor','ceiling','rubble','wood','timber']:
   kind='wood' if key in ['wood','timber'] else 'stone';tex=nodes.new('ShaderNodeTexImage');tex.image=images[kind];textures.uv_map(me,.7 if kind=='wood' else .5)
   blend=nodes.new('ShaderNodeMixRGB');blend.blend_type='MULTIPLY';blend.inputs[0].default_value=1;links.new(mix.outputs[0],blend.inputs[1]);links.new(tex.outputs['Color'],blend.inputs[2]);links.new(blend.outputs[0],node.inputs['Base Color'])
   bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.045;links.new(tex.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs[0],node.inputs['Normal'])
  me.calc_loop_triangles();total+=len(me.loop_triangles)
 report['metrics']={'triangles':total,'objects':len(scene.objects),'parts':sum(geo.counts.values()),'partsByMaterial':dict(geo.counts)};report['timings']['flush']=time.perf_counter()-t
 (ASSET/'manifest.json').write_text(json.dumps({'version':1,'colliders':geo.colliders,'anchors':geo.anchors,'metrics':report['metrics']},indent=2)+'\n')
 return report['metrics']

def lighting():
 world=bpy.data.worlds.new('Cellar ambient');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.4,.55,1);world.node_tree.nodes['Background'].inputs[1].default_value=.15;scene.world=world
 def area(name,p,target,power,size,color):
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;data.color=color;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=vec(p);ob.rotation_euler=(Vector(vec(target))-ob.location).to_track_quat('-Z','Y').to_euler()
 for a in geo.anchors:
  data=bpy.data.lights.new(a['kind'],'POINT');data.energy=1700 if a['kind']=='lamp' else 3200;data.color=(1,.55,.23);data.shadow_soft_size=.55;ob=bpy.data.objects.new(a['kind'],data);scene.collection.objects.link(ob);ob.location=vec((a['x'],a['y'],a['z']))
 area('Entry cool bounce',(0,15,-2),(0,0,-8),1700,18,(.48,.65,1))
 area('Entry lantern bounce',(-12,6,8),(0,0,-2),2500,8,(1,.57,.27))
 area('Entry rack bounce',(14,7,-8),(0,1,-6),2200,8,(1,.6,.32))
 area('Nave cool bounce',(0,20,-74),(0,-3,-68),5500,35,(.44,.6,1))
 area('Portal glow',(0,9,-105),(0,0,-80),2500,10,(.44,.65,1))
 cam=bpy.data.cameras.new('Player reference');ob=bpy.data.objects.new(cam.name,cam);scene.collection.objects.link(ob);scene.camera=ob;cam.lens=22
 return {'lights':sum(o.type=='LIGHT' for o in scene.objects)}

def export():
 import struct
 t=time.perf_counter();bpy.context.window.scene=scene
 for o in scene.objects:o.select_set(o.type=='MESH')
 path=ASSET/'cellar-entry.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_extras=True)
 report['packing']=pack.pack(path,PALETTE)
 src=path.read_bytes();n=struct.unpack_from('<I',src,12)[0];doc=json.loads(src[20:20+n]);binary=src[28+n:]
 for m in doc['materials']:
  m['name']=m['name'].replace('Widow ','Cellar ');m['doubleSided']=True
 data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary)
 report['timings']['export']=time.perf_counter()-t
 bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'cellar-entry.blend'))
 report['assetBytes']=path.stat().st_size;report['assetSHA256']=hashlib.sha256(path.read_bytes()).hexdigest()
 report['sources']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.glob('*.py')}
 (DOC/'build-report.json').write_text(json.dumps(report,indent=2)+'\n');return {'bytes':report['assetBytes'],'triangles':report['metrics']['triangles'],'timings':report['timings']}

def render(view):
 views={'arrival':((0,4,14),(0,5,-22)),'nave':((0,3,-45),(0,5,-83)),'reverse':((8,5,-89),(0,4,-43))}
 p,target=views[view];scene.camera.location=vec(p);scene.camera.rotation_euler=(Vector(vec(target))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(DOC/(view+'-blender.png'))
 t=time.perf_counter();bpy.ops.render.render(write_still=True);report['timings']['render_'+view]=time.perf_counter()-t
 (DOC/'build-report.json').write_text(json.dumps(report,indent=2)+'\n');return {'view':view,'seconds':report['timings']['render_'+view]}
