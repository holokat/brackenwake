"""Run through the installed Blender MCP socket bridge, in the isolated room process."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
for module in ('themes','architecture','geometry'):sys.modules.pop(module,None)
import bpy
import hashlib
import json
import os
import time
import struct
from geometry import Room
from themes import BUILDERS,NAMES,CEILINGS

ROOT=HERE.parents[3]
OUT=ROOT/'assets/models/cellars/rooms'
DOC=ROOT/'docs/art/old-cellars/blender/rooms'
OUT.mkdir(parents=True,exist_ok=True);DOC.mkdir(parents=True,exist_ok=True)

def clear():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users==0:bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users==0:bpy.data.materials.remove(mat)

def build(level):
    clear();start=time.time();r=Room(level,NAMES[level-1],CEILINGS[level-1]);BUILDERS[level-1](r);r.finish()
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    source_triangles=0
    for ob in r.objects:
        if ob.type=='MESH':ob.data.calc_loop_triangles();source_triangles+=len(ob.data.loop_triangles)
    # Collapse small repeated bevels before export when the authored room exceeds its budget.
    # Material boundaries remain separate, with the original deterministic source retained.
    if source_triangles>190000:
        protected={'Cellar stone_floor','Cellar stone_floor_light','Cellar ceiling','Cellar gold','Cellar purple','Cellar red','Cellar fire','Cellar soul','Cellar arcane',
                   'Cellar stone_structure','Cellar stone_light_structure','Cellar stone_dark_structure'}
        protected_triangles=sum(len(ob.data.loop_triangles) for ob in r.objects if ob.type=='MESH' and ob.data.materials[0].name in protected)
        ratio=max(.1,(198000-protected_triangles)/(source_triangles-protected_triangles))
        r.features['structuralPreservation']={'protectedMaterials':sorted(name for name in protected if name.endswith('_structure')),
            'sourceTriangles':source_triangles,'protectedTriangles':protected_triangles,'remainingMeshRatio':ratio}
        print('CELLAR_STRUCTURAL_BUDGET',level,source_triangles,protected_triangles,ratio,flush=True)
        for ob in r.objects:
            if ob.type!='MESH':continue
            if ob.data.materials[0].name in protected:continue
            bpy.context.view_layer.objects.active=ob
            modifier=ob.modifiers.new('Room triangle budget','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    triangles=0;vertices=0;bounds=[[float('inf')]*3,[-float('inf')]*3]
    for ob in r.objects:
        if ob.type!='MESH':continue
        # Blender's exporter performs this same repair. Apply it before saving
        # the editable source as well, removing degenerate collapsed bevel faces.
        ob.data.validate(clean_customdata=False)
        ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles);vertices+=len(ob.data.vertices)
        for v in ob.data.vertices:
            p=(v.co.x,v.co.z,-v.co.y)
            for i in range(3):bounds[0][i]=min(bounds[0][i],p[i]);bounds[1][i]=max(bounds[1][i],p[i])
    filename=f'cellar-room-{level:02d}';blend=OUT/(filename+'.blend');glb=OUT/(filename+'.glb')
    bpy.context.scene['source']='Original authored geometry built through installed lab_blender_org Blender MCP'
    bpy.context.scene['room_level']=level;bpy.context.scene['coordinate_contract']='Game Y up, +Z forward, metres; Blender x,-z,y'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True,export_animations=False)
    raw=glb.read_bytes();gltf=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    triangles=sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf['meshes'] for p in mesh['primitives'])
    bounds=[[min(gltf['accessors'][p['attributes']['POSITION']]['min'][i] for mesh in gltf['meshes'] for p in mesh['primitives']) for i in range(3)],
            [max(gltf['accessors'][p['attributes']['POSITION']]['max'][i] for mesh in gltf['meshes'] for p in mesh['primitives']) for i in range(3)]]
    manifest=dict(version=1,level=level,title=r.title,file=f'assets/models/cellars/rooms/{filename}.glb',blend=f'assets/models/cellars/rooms/{filename}.blend',
        roomIndex=2 if level==8 else 4,coordinates={'up':'+Y','forward':'+Z','units':'metres','origin':'room center at cellarHeight'},
        bounds={'min':bounds[0],'max':bounds[1]},ceiling=r.ceiling,collision=r.collision,anchors=r.anchors,routes=r.routes,
        landmarks=r.landmarks,features=r.features,parts=dict(r.parts),metrics={'triangles':triangles,'vertices':vertices,'materialBatches':len(r.batches),'meshCount':len(r.batches),'glbBytes':glb.stat().st_size,'blendBytes':blend.stat().st_size},
        source={'builder':'tools/blender/cellars/rooms/build.py','transport':'installed Blender MCP execute socket','port':9879,'blender':bpy.app.version_string,'seed':91871+level*771,'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(HERE.glob('*.py'))}},
        assetSha256=hashlib.sha256(glb.read_bytes()).hexdigest())
    (OUT/(filename+'.json')).write_text(json.dumps(manifest,indent=2)+'\n')
    print('CELLAR_ROOM_BUILT',level,triangles,glb.stat().st_size,round(time.time()-start,2),flush=True)
    return manifest

levels=json.loads(os.environ.get('CELLAR_ROOM_LEVELS','[1,2,3,4,5,6,7,8]'))
manifests=[build(level) for level in levels]
if len(levels)==8:
    (OUT/'index.json').write_text(json.dumps({'version':1,'rooms':[{'level':m['level'],'file':m['file'],'manifest':f'assets/models/cellars/rooms/cellar-room-{m["level"]:02d}.json'} for m in manifests]},indent=2)+'\n')
    combined={'version':1,'coordinates':{'up':'+Y','forward':'+Z','units':'metres'},'rooms':[]}
    for m in manifests:
        combined['rooms'].append(dict(level=m['level'],roomIndex=m['roomIndex'],glb=Path(m['file']).name,bounds=m['bounds'],ground=m['features']['groundOverride'],colliders=m['collision'],anchors=m['anchors'],routes=m['routes'],landmarks=m['landmarks'],metrics=m['metrics'],features=m['features']))
    (OUT/'manifest.json').write_text(json.dumps(combined,indent=2)+'\n')
(DOC/'build-provenance.json').write_text(json.dumps({'transport':'installed lab_blender_org Blender MCP','bridgePort':9879,'blender':bpy.app.version_string,'levels':levels,'rooms':[{'level':m['level'],'sha256':m['assetSha256'],'triangles':m['metrics']['triangles']} for m in manifests]},indent=2)+'\n')
print('CELLAR_ROOMS_BUILD_FINISHED',flush=True)
