"""Batched direct-data scenes, reusable detail maps, supported GPU rendering."""
import bpy,sys,math,json,time,hashlib,importlib.util,struct
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).parent;ROOT=HERE.parents[3];ASSET=ROOT/'assets/models/cellars/descent';DOC=ROOT/'docs/art/cellars-descent'
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
settings=module('descent_settings',HERE/'settings.py');architecture=module('descent_architecture',HERE/'architecture.py');fittings=module('descent_fittings',HERE/'fittings.py');geometry=module('widow_geometry',ROOT/'tools/blender/widow/geometry.py');textures=module('widow_textures',ROOT/'tools/blender/widow/textures.py');pack=module('widow_pack',ROOT/'tools/blender/widow/pack.py')
ornaments=module('descent_ornaments',HERE/'ornaments.py')
def vec(p):return(p[0],-p[2],p[1])
def lin(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4

def setup(id):
 global scene,geo,r,report,palette
 if not bpy.app.background:raise RuntimeError('Owned background Blender required')
 old=bpy.data.scenes.get('Descent room')
 if old:
  for o in list(old.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.scenes.remove(old)
 # Discard only unused datablocks created inside this owned background process.
 for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.images]:
  for item in list(collection):
   if item.users==0:collection.remove(item)
 r=settings.room_spec(next(r for r in settings.ROOMS if r['id']==id));geo=geometry.Geometry();palette=dict(settings.PALETTE)
 accent=settings.COLORS[r['theme']];palette['rune']=(accent,.2,.45,.4);palette['cloth']=(sum(round(((accent>>shift)&255)*.5)<<shift for shift in (16,8,0)),0,1,0)
 if r['theme']=='command':palette['limestone']=(0x95877a,0,.95,0)
 if r['theme']=='furnace':palette['rune']=(0xff7832,.1,.5,1.3);palette['limestone']=(0x68615f,0,.95,0)
 scene=bpy.data.scenes.new('Descent room');bpy.context.window.scene=scene
 scene.render.engine='CYCLES';scene.cycles.samples=64;scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.use_stamp=False;scene.view_settings.view_transform='AgX'
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
 if not any(d.type=='METAL' for d in prefs.devices):raise RuntimeError('Metal device missing')
 for d in prefs.devices:d.use=d.type=='METAL'
 prefs.metalrt='AUTO';scene.cycles.device='GPU';scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=True;scene.render.use_persistent_data=True
 report={'id':id,'blender':bpy.app.version_string,'profile':{'backend':'METAL','gpuOnly':True,'metalrt':prefs.metalrt,'denoiser':scene.cycles.denoiser,'gpuDenoising':True,'persistentData':True,'samples':64,'resolution':[1440,900]},'timings':{}}
 return report['profile']

def construct(stage):
 t=time.perf_counter();{'architecture':architecture.shell,'fittings':fittings.build,'ornaments':ornaments.build}[stage](geo,r);report['timings'][stage]=time.perf_counter()-t;return {'stage':stage,'seconds':report['timings'][stage],'parts':sum(geo.counts.values())}

def flush():
 t=time.perf_counter();images={}
 for kind in ['stone','wood']:
  images[kind]=bpy.data.images.load(str(ROOT/f'assets/models/widow-vault/{kind}-detail.png'));images[kind].pack()
 total=0
 for key,(vv,ff,shades) in geo.parts.items():
  color,metal,rough,emission=palette[key];rgb=tuple(lin(((color>>s)&255)/255) for s in [16,8,0]);mat=bpy.data.materials.new('Widow '+key);mat.use_nodes=True;mat.diffuse_color=rgb+(1,)
  nodes=mat.node_tree.nodes;links=mat.node_tree.links;node=nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=rgb+(1,);node.inputs['Roughness'].default_value=rough;node.inputs['Metallic'].default_value=metal;node.inputs['Emission Color'].default_value=rgb+(1,);node.inputs['Emission Strength'].default_value=emission
  me=bpy.data.meshes.new(r['id']+' '+key);me.from_pydata([vec(p) for p in vv],[],ff);me.update();ob=bpy.data.objects.new(key,me);scene.collection.objects.link(ob);me.materials.append(mat)
  attr=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');attr.data.foreach_set('color',[c for v in shades for c in(v,v,v,1)]);me.color_attributes.active_color=attr
  vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=rgb+(1,);links.new(vc.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],node.inputs['Base Color'])
  if key in ['limestone','trim','floor','ceiling','rubble','wood','timber']:
   kind='wood' if key in ['wood','timber'] else 'stone';textures.uv_map(me,.5 if kind=='stone' else .7);tex=nodes.new('ShaderNodeTexImage');tex.image=images[kind];blend=nodes.new('ShaderNodeMixRGB');blend.blend_type='MULTIPLY';blend.inputs[0].default_value=1;links.new(mix.outputs[0],blend.inputs[1]);links.new(tex.outputs['Color'],blend.inputs[2]);links.new(blend.outputs[0],node.inputs['Base Color'])
   bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.3;bump.inputs['Distance'].default_value=.035;links.new(tex.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs[0],node.inputs['Normal'])
  me.calc_loop_triangles();total+=len(me.loop_triangles)
 report['metrics']={'triangles':total,'objects':len(scene.objects),'parts':sum(geo.counts.values())};report['timings']['flush']=time.perf_counter()-t
 return report['metrics']

def lighting():
 world=bpy.data.worlds.new('Subterranean bounce');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.33,.45,1);world.node_tree.nodes['Background'].inputs[1].default_value=.12;scene.world=world
 def area(name,p,target,power,size,color):
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=vec(p);o.rotation_euler=(Vector(vec(target))-o.location).to_track_quat('-Z','Y').to_euler()
 for a in geo.anchors:
  if a['kind'] not in ['lamp','fire','candle']:continue
  d=bpy.data.lights.new(a['kind'],'POINT');d.energy=1000 if a['kind']=='candle' else 1800;d.color=(1,.58,.3);d.shadow_soft_size=.55;o=bpy.data.objects.new(a['kind'],d);scene.collection.objects.link(o);o.location=vec((a['x'],a['y'],a['z']))
 area('Vault cool bounce',(0,r['ceiling']*.7,0),(0,0,0),4500,25,(.43,.58,.84))
 area('Open onward portal',(0,9,-r['rz']-2),(0,3,6),2600,10,(.46,.65,1))
 area('Player-side bounce',(0,8,r['rz']-3),(0,4,0),2500,12,(.58,.64,.75))
 d=bpy.data.cameras.new('Player reference');o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);scene.camera=o;d.lens=19
 return {'lights':sum(o.type=='LIGHT' for o in scene.objects)}

def export():
 t=time.perf_counter();bpy.context.window.scene=scene
 for o in scene.objects:o.select_set(o.type=='MESH')
 path=ASSET/(r['id']+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_extras=True)
 report['packing']=pack.pack(path,palette)
 src=path.read_bytes();n=struct.unpack_from('<I',src,12)[0];doc=json.loads(src[20:20+n]);binary=src[28+n:]
 for m in doc['materials']:m['name']=m['name'].replace('Widow ','Descent ');m['doubleSided']=True
 data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4);path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/(r['id']+'.blend')))
 report['timings']['export']=time.perf_counter()-t;report['bytes']=path.stat().st_size;report['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();report['sources']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.glob('*.py')}
 (ASSET/(r['id']+'.json')).write_text(json.dumps({**r,'colliders':geo.colliders,'anchors':geo.anchors,'metrics':report['metrics'],'bytes':report['bytes']},indent=2)+'\n');(DOC/(r['id']+'-build.json')).write_text(json.dumps(report,indent=2)+'\n')
 return {'id':r['id'],'bytes':report['bytes'],'triangles':report['metrics']['triangles'],'timings':report['timings']}

def render(view='hero'):
 p,target=((0,3.2,r['rz']-4),(0,7,-7)) if view=='hero' else ((10,5,-r['rz']+6),(0,7,10))
 scene.camera.location=vec(p);scene.camera.rotation_euler=(Vector(vec(target))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(DOC/(r['id']+'-'+view+'.png'))
 t=time.perf_counter();bpy.ops.render.render(write_still=True);seconds=time.perf_counter()-t;return {'id':r['id'],'view':view,'renderSeconds':seconds}
