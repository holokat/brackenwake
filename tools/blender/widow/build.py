"""Repeatable Blender Lab build with distinct geometry, export and render stages."""
import bpy,sys,time,json,math,hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import geometry,environment,infrastructure,dressing,textures,pack,importlib
for module in [geometry,environment,infrastructure,dressing,textures,pack]:importlib.reload(module)
ASSET=ROOT/'assets/models/widow-vault'
DOC=ROOT/'docs/art/widow-vault'
PALETTE={
 'stone_shell':(0x6b7886,0,.94,0), 'stone_walls':(0x697888,0,.96,0),
 'stone_arch':(0x78818a,0,.92,0), 'stone_nursery':(0x667589,0,.9,0), 'stone_strata':(0x778391,0,.94,0),
 'stone_ceiling':(0x566476,0,.96,0), 'stone_rubble':(0x677078,0,.95,0),
 'ground':(0x655e52,0,.97,0), 'timber':(0x795b3d,0,.84,0),
 'iron':(0x59616b,.78,.37,0), 'iron_ore':(0x7d8794,.78,.4,0),
 'rope':(0x87725c,0,.95,0), 'cage_iron':(0x606774,.75,.42,0),
 'water':(0x59788a,.3,.16,0), 'silk_threads':(0xbfc7ca,0,.86,.03),
 'silk_veil':(0xafbec8,0,.92,0), 'silk_cocoon':(0xc0b8a5,0,.9,0),
 'eggs':(0xa4ac87,0,.48,.09), 'lantern_glow':(0xffb85b,0,.3,1.4),
 'flame':(0xffae47,0,.3,1.8),
}

def vec(p):return (p[0],-p[2],p[1])
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4

def setup():
    global scene,geo,report
    if not bpy.app.background:raise RuntimeError('Use the owned background bridge, not the user scene')
    old=bpy.data.scenes.get('WWIDOW_VAULT')
    if old:
        for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(old)
    scene=bpy.data.scenes.new('WWIDOW_VAULT');bpy.context.window.scene=scene
    scene.render.engine='CYCLES';scene.cycles.samples=64
    scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.use_stamp=False;scene.render.use_stamp_filename=False
    if hasattr(scene.render,'metadata_input'):scene.render.metadata_input='SCENE'
    scene.view_settings.view_transform='AgX'
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='METAL';prefs.get_devices()
    if not any(d.type=='METAL' for d in prefs.devices):raise RuntimeError('Expected Metal GPU unavailable')
    for d in prefs.devices:d.use=d.type=='METAL'
    prefs.metalrt='AUTO';scene.cycles.device='GPU';scene.cycles.use_denoising=True
    scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=True;scene.render.use_persistent_data=True
    geo=geometry.Geometry()
    report={'blender':bpy.app.version_string,'profile':{'backend':prefs.compute_device_type,'devices':[d.name for d in prefs.devices if d.use],'metalrt':prefs.metalrt,'sceneDevice':scene.cycles.device,'denoiser':scene.cycles.denoiser,'gpuDenoising':scene.cycles.denoising_use_gpu,'persistentData':scene.render.use_persistent_data,'samples':64,'resolution':[1440,900]},'timings':{}}
    return report['profile']

def construct(stage):
    t=time.perf_counter()
    {'environment':environment,'infrastructure':infrastructure,'dressing':dressing}[stage].build(geo)
    report['timings'][stage]=time.perf_counter()-t
    return {'stage':stage,'seconds':report['timings'][stage],'parts':sum(geo.counts.values()),'vertices':sum(len(x[0]) for x in geo.parts.values())}

def flush():
    t=time.perf_counter();total_tri=0
    ASSET.mkdir(parents=True,exist_ok=True);DOC.mkdir(parents=True,exist_ok=True)
    images={kind:textures.create(kind,ASSET) for kind in ['stone','wood']}
    report['timings']['textures']=time.perf_counter()-t;t=time.perf_counter()
    for key,(vv,ff,shades) in geo.parts.items():
        color,metal,rough,emission=PALETTE[key]
        rgb=tuple(linear(((color>>shift)&255)/255) for shift in [16,8,0])
        mat=bpy.data.materials.new('Widow '+key);mat.use_nodes=True;mat.diffuse_color=rgb+(1,)
        node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=rgb+(1,)
        node.inputs['Roughness'].default_value=rough;node.inputs['Metallic'].default_value=metal
        node.inputs['Emission Color'].default_value=rgb+(1,);node.inputs['Emission Strength'].default_value=emission
        if key=='silk_veil':node.inputs['Alpha'].default_value=.09
        if key=='water':node.inputs['Alpha'].default_value=.7
        if key in ['silk_veil','water'] and hasattr(mat,'surface_render_method'):mat.surface_render_method='DITHERED'
        pivot=(-13.5,12.5,-14) if key=='cage_iron' else (0,0,0)
        me=bpy.data.meshes.new('Widow '+key)
        me.from_pydata([vec(tuple(p[i]-pivot[i] for i in range(3))) for p in vv],[],ff);me.update()
        ob=bpy.data.objects.new(key,me);scene.collection.objects.link(ob);ob.location=vec(pivot)
        ob.data.materials.append(mat);ob['mineable']=key.startswith('stone_') or key=='ground'
        attr=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        attr.data.foreach_set('color',[c for value in shades for c in (value,value,value,1)])
        me.color_attributes.active_color=attr
        vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color'
        mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=rgb+(1,)
        mat.node_tree.links.new(vc.outputs['Color'],mix.inputs[2]);mat.node_tree.links.new(mix.outputs[0],node.inputs['Base Color'])
        if key.startswith('stone_') or key in ['ground','timber']:
            kind='wood' if key=='timber' else 'stone';tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=images[kind]
            textures.uv_map(me,.3 if kind=='stone' else .7)
            multiply=mat.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
            mat.node_tree.links.new(mix.outputs[0],multiply.inputs[1]);mat.node_tree.links.new(tex.outputs['Color'],multiply.inputs[2]);mat.node_tree.links.new(multiply.outputs[0],node.inputs['Base Color'])
            bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.055
            mat.node_tree.links.new(tex.outputs['Color'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],node.inputs['Normal'])
        me.calc_loop_triangles();total_tri+=len(me.loop_triangles)
    report['timings']['flush']=time.perf_counter()-t
    report['metrics']={'objects':len(scene.objects),'materials':len(geo.parts),'triangles':total_tri,'sourceParts':sum(geo.counts.values()),'partsByMaterial':dict(geo.counts)}
    ASSET.mkdir(parents=True,exist_ok=True);DOC.mkdir(parents=True,exist_ok=True)
    manifest={'version':1,'origin':{'x':7,'y':8,'z':-139},'roomIndex':7,'colliders':geo.colliders,'anchors':geo.anchors,'metrics':report['metrics'],'routes':[[[-6,30],[-6,19],[-4,-6],[-3,-17]],[[-44,12],[-35,13],[-6,19],[30,14],[44,12]]],'stairSamples':3}
    (ASSET/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return report['metrics']

def lighting():
    world=bpy.data.worlds.new('Widow cool bounce');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.24,.34,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.32;scene.world=world
    def area(name,p,target,color,power,size):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=vec(p)
        ob.rotation_euler=(Vector(vec(target))-ob.location).to_track_quat('-Z','Y').to_euler()
    area('Cool cavern bounce',(0,36,7),(0,7,-10),(.52,.69,1),15000,35)
    area('Entrance bounce',(-2,18,28),(0,8,-9),(.62,.72,1),8000,30)
    for a in geo.anchors:
        if a['kind'] not in ['lamp','fire']:continue
        data=bpy.data.lights.new('Warm '+a['kind'],'POINT');data.energy=180 if a['kind']=='lamp' else 950
        data.color=(1,.51,.18);data.shadow_soft_size=.6
        ob=bpy.data.objects.new(data.name,data);scene.collection.objects.link(ob);ob.location=vec((a['x'],a['y'],a['z']))
    camera=bpy.data.cameras.new('Widow review camera');ob=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(ob);scene.camera=ob;camera.lens=23
    ob.location=vec((-1,5,29));ob.rotation_euler=(Vector(vec((-3,13,-10)))-ob.location).to_track_quat('-Z','Y').to_euler()
    return {'lights':sum(o.type=='LIGHT' for o in scene.objects)}

def export():
    t=time.perf_counter()
    bpy.context.window.scene=scene
    for o in scene.objects:o.select_set(o.type=='MESH')
    opts=dict(filepath=str(ASSET/'widow-vault.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_extras=True)
    bpy.ops.export_scene.gltf(**opts)
    report['packing']=pack.pack(ASSET/'widow-vault.glb',PALETTE)
    report['timings']['export']=time.perf_counter()-t
    t=time.perf_counter();bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'widow-vault.blend'));report['timings']['save']=time.perf_counter()-t
    report['assetBytes']=(ASSET/'widow-vault.glb').stat().st_size
    report['assetSHA256']=hashlib.sha256((ASSET/'widow-vault.glb').read_bytes()).hexdigest()
    (DOC/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    return {'bytes':report['assetBytes'],'sha256':report['assetSHA256'],'timings':report['timings']}

def render(view):
    views={'hero':((-1,5,29),(-3,13,-10)),'reverse':((-3,7,-30),(-8,9,9)),'gallery':((-27,13.8,6),(-16,14,-15))}
    p,target=views[view];scene.camera.location=vec(p)
    scene.camera.rotation_euler=(Vector(vec(target))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(DOC/(view+'-blender.png'));t=time.perf_counter();bpy.ops.render.render(write_still=True)
    seconds=time.perf_counter()-t;report['timings']['render_'+view]=seconds
    (DOC/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    return {'view':view,'seconds':seconds,'file':scene.render.filepath}
