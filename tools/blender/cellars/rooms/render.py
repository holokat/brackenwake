"""Import final exported GLBs and render three evidence views with Cycles CPU."""
import bpy
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE))
from geometry import blender_point
OUT=ROOT/'assets/models/cellars/rooms';DOC=ROOT/'docs/art/old-cellars/blender/rooms'

def light(name,p,color,energy,size=5,kind='AREA',target=(0,0,0)):
    data=bpy.data.lights.new(name,kind);data.color=color;data.energy=energy
    if kind=='AREA':data.shape='DISK';data.size=size
    else:data.shadow_soft_size=size
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=blender_point(p)
    ob.rotation_euler=(Vector(blender_point(target))-ob.location).to_track_quat('-Z','Y').to_euler()

def render(level):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    manifest=json.loads((OUT/f'cellar-room-{level:02d}.json').read_text())
    bpy.ops.import_scene.gltf(filepath=str(OUT/f'cellar-room-{level:02d}.glb'))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
    scene.cycles.use_denoising=True;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.07
    scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.render.resolution_x=1120;scene.render.resolution_y=840;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.7
    world=bpy.data.worlds.new('Review world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.007,.012,.024,1);world.node_tree.nodes['Background'].inputs[1].default_value=.1;scene.world=world
    ceiling=manifest['ceiling'];factor=2 if level==8 else 1
    light('Cool vault skylight',(0,ceiling*.86,-8*factor),(.22,.4,1),9000*factor,12*factor,target=(0,0,0))
    light('Soft entrance fill',(12*factor,ceiling*.5,24*factor),(.45,.6,1),1800*factor,18*factor,target=(0,9,-10*factor))
    light('Warm side bounce',(-20*factor,ceiling*.36,0),(1,.43,.15),8000*factor,12*factor,target=(0,8,0))
    for a in manifest['anchors']:
        if a['kind'] not in ('fire','soulFlame','candle','arcane'):continue
        c=a.get('color') or '#ffc17c';color=tuple(int(c[i:i+2],16)/255 for i in (1,3,5))
        light(a['name'],(a['x'],a['y']+.35,a['z']),color,(260 if a['kind']=='candle' else 900)*a['intensity'],.8,'POINT')
    data=bpy.data.cameras.new('Export review camera');camera=bpy.data.objects.new('Export review camera',data);bpy.context.collection.objects.link(camera);scene.camera=camera
    views=[('hero',(17*factor,ceiling*.49,27*factor),(0,ceiling*.37,-9*factor)),
           ('reverse',((0 if level==4 else -6 if level==3 else -17)*factor,9 if level==4 else ceiling*.49,(-23 if level==4 else -27)*factor),(0,ceiling*.37,9*factor)),
           ('overhead',(0,ceiling+95*factor,4*factor),(0,0,0))]
    paths=[]
    for view,p,target in views:
        for ob in scene.objects:
            if ob.type=='MESH' and any('ceiling' in mat.name for mat in ob.data.materials):ob.hide_render=view=='overhead'
        camera.location=blender_point(p);camera.rotation_euler=(Vector(blender_point(target))-camera.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO' if view=='overhead' else 'PERSP';data.ortho_scale=182 if level==8 else 106;data.lens=18 if level<8 else 21;data.clip_end=700
        path=DOC/f'cellar-room-{level:02d}-{view}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);paths.append(str(path.relative_to(ROOT)))
        print('CELLAR_ROOM_RENDERED',level,view,flush=True)
    return dict(level=level,assetSha256=manifest['assetSha256'],renderer='Cycles CPU',samples=24,overheadCutaway='Only the named ceiling material is hidden in overhead views',views=paths)

levels=json.loads(os.environ.get('CELLAR_RENDER_LEVELS','[1,2,3,4,5,6,7,8]'))
records=json.loads((DOC/'render-evidence.json').read_text()) if len(levels)<8 and (DOC/'render-evidence.json').exists() else []
records=[r for r in records if r['level'] not in levels]+[render(i) for i in levels]
records.sort(key=lambda r:r['level'])
(DOC/'render-evidence.json').write_text(json.dumps(records,indent=2)+'\n')
print('CELLAR_ROOM_EXPORT_RENDERS_FINISHED',flush=True)
