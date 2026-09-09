"""Rebuild six optimized Blender bosses through dedicated background Lab port 9878."""
import bpy,bmesh,sys,json,math,hashlib,time,importlib
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.dont_write_bytecode=True;sys.path[:0]=[str(HERE),str(HERE.parent),str(HERE.parent.parent)]
import rigkit as rk
import geometry,creatures,animation,surfaces,details
importlib.reload(geometry);importlib.reload(creatures);importlib.reload(animation);importlib.reload(surfaces);importlib.reload(details)
from meshkit import material,v
OUT=ROOT/'assets/models/cellars/depth-bosses';ART=ROOT/'docs/art/cellar-depth-bosses';OUT.mkdir(exist_ok=True,parents=True);ART.mkdir(exist_ok=True,parents=True)
PALETTE={'bone':(0xb0aa8e,.05,.8,0),'dark':(0x14171a,0,.94,0),'iron':(0x343d44,.7,.49,0),'bronze':(0x8a7150,.68,.5,0),'trim':(0xb4a075,.63,.49,0),'chitin':(0x304345,.32,.55,0),'soul':(0x65bfac,.1,.48,2),'cloth':(0x292c32,0,.95,0),'weed':(0x3c5042,0,1,0),'wood':(0x463b2e,0,.9,0),'ember':(0xfc8f3a,.05,.68,3),'parchment':(0xa2997a,0,.9,0),'stone':(0x8a8d88,.05,.86,0),'cape':(0x523536,0,.96,0),'steel':(0x95998f,.77,.34,0)}

def configure(sc):
    sc.render.engine='CYCLES';p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='METAL';p.get_devices()
    if not any(d.type=='METAL' for d in p.devices):raise RuntimeError('Metal unavailable')
    for d in p.devices:d.use=d.type=='METAL'
    p.metalrt='AUTO';sc.cycles.device='GPU';sc.cycles.use_denoising=True;sc.cycles.denoiser='OPENIMAGEDENOISE';sc.cycles.denoising_use_gpu=True;sc.render.use_persistent_data=True
    sc.cycles.samples=40;sc.render.resolution_x=1050;sc.render.resolution_y=1050;sc.render.resolution_percentage=100
    sc.render.use_stamp=False;sc.render.use_stamp_filename=False;sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
    return {'backend':p.compute_device_type,'devices':[d.name for d in p.devices if d.use],'MetalRT':p.metalrt,'device':sc.cycles.device,'denoiser':sc.cycles.denoiser,'gpuDenoiser':sc.cycles.denoising_use_gpu,'persistentData':sc.render.use_persistent_data}

def build(index):
    start=time.monotonic();id,name,height,fn=creatures.BUILDERS[index]
    # Owned background process only. Each scene is persisted before the next.
    for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
    for coll in [bpy.data.actions,bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images]:
        for item in list(coll):coll.remove(item)
    sc=bpy.context.scene;sc.name=name;sc.render.fps=animation.FPS;sc.frame_start=0;sc.frame_end=58;profile=configure(sc)
    s=details.finish(fn(),id);allvs=[p for data in s.parts.values() for p in data[0]];low=min(p[1] for p in allvs);high=max(p[1] for p in allvs);scale=height/(high-low)
    def transform(p):return (p[0]*scale,(p[1]-low)*scale,p[2]*scale)
    meshes=[]
    for slot,(verts,faces,bones,colors,smoothing) in s.parts.items():
        col,metal,rough,emit=PALETTE[slot]
        if slot=='soul':col={'ilexChainArchivist':0xad8ae9,'vossInvertedSaint':0x77b7dd,'abbotCinder':0xfda344,'asterFirstKing':0xddb564}.get(id,col)
        mat=material(name+' '+slot,col,metal,rough,emit)
        mat.use_backface_culling=True
        if slot in ['cloth','cape','parchment','weed']:mat.use_backface_culling=False
        surfaces.apply(mat,slot,col)
        me=bpy.data.meshes.new(id+'_'+slot);me.from_pydata([v(transform(p)) for p in verts],[],faces);me.materials.append(mat);me.update()
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        for p,smooth in zip(me.polygons,smoothing):p.use_smooth=smooth
        attr=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='POINT');rgb=rk.hex_linear(col)
        for i,shade in enumerate(colors):attr.data[i].color=tuple(min(1,max(0,c*shade)) for c in rgb[:3])+(1,)
        uv=me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                p=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(p.x/height*3+p.y/height*.47+.5,p.z/height*3)
        ob=bpy.data.objects.new(id+'_'+slot,me);bpy.context.collection.objects.link(ob);groups={}
        for i,bone in enumerate(bones):groups.setdefault(bone,[]).append(i)
        for bone,indices in groups.items():ob.vertex_groups.new(name=bone).add(indices,1,'REPLACE')
        meshes.append(ob)
    arm=rk.build_armature(id,[(n,v(transform(p)),v(transform(q)),parent,con) for n,p,q,parent,con in s.bones]);rk.bind(meshes,arm)
    actions=animation.animate(arm,id,height);animation.ground(arm,meshes,actions,id=='ilexChainArchivist');rk.stash(arm,actions)
    for ob in meshes:ob['concept']='docs/art/cellar-depth-bosses/concepts.png'
    arm['bossId']=id;arm['bodyHeight']=height;arm['conceptFeatures']=json.dumps(dict(s.features))
    glb=OUT/(id+'.glb');bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_vertex_color='NONE',export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_optimize_animation_size=True,export_anim_single_armature=True,export_reset_pose_bones=True,export_nla_strips=True,export_morph=False,export_extras=False)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(id+'.blend')),compress=True)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    report={'id':id,'name':name,'height':height,'features':dict(s.features),'meshes':len(meshes),'triangles':triangles,'bones':len(arm.data.bones),'vertices':sum(len(o.data.vertices) for o in meshes),'glbBytes':glb.stat().st_size,'glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'clips':[a.name for a in actions],'renderProfile':profile,'buildSeconds':round(time.monotonic()-start,3)}
    (ART/(id+'-build.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True);return report
if __name__=='__main__':
    result={'models':[build(i) for i in range(6)]}
