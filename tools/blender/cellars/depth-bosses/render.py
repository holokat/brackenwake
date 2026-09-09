"""Sequential Cycles review, same Metal worker and fixed light/camera recipe."""
import bpy,sys,math,time,json
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];sys.path.insert(0,str(HERE))
import build
ART=ROOT/'docs/art/cellar-depth-bosses';OUT=ROOT/'assets/models/cellars/depth-bosses'
def aim(ob,at):ob.rotation_euler=(Vector(at)-ob.location).to_track_quat('-Z','Y').to_euler()
def render(index,clip=None,seconds=0,angle='hero'):
    id,name,height,_=build.creatures.BUILDERS[index];bpy.ops.wm.open_mainfile(filepath=str(OUT/(id+'.blend')));sc=bpy.context.scene;build.configure(sc)
    arm=next(o for o in sc.objects if o.type=='ARMATURE')
    if clip:
        arm.animation_data.action=bpy.data.actions[clip];build.rk._assign_slot(arm,bpy.data.actions[clip]);sc.frame_set(round(seconds*24))
    ground=bpy.data.materials.new('Review ground');ground.diffuse_color=(.052,.06,.065,1);ground.use_nodes=True;ground.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.052,.06,.065,1);ground.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
    me=bpy.data.meshes.new('Review ground');n=height*12;me.from_pydata([(-n,-n,-.015),(n,-n,-.015),(n,n,-.015),(-n,n,-.015)],[],[(0,1,2,3)]);ob=bpy.data.objects.new('Review ground',me);sc.collection.objects.link(ob);me.materials.append(ground)
    cam=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));sc.collection.objects.link(cam);sc.camera=cam
    cam.location=(height*.87,-height*2.45,height*1.3) if angle=='hero' else (height*.2,-height*3,height*1.1)
    aim(cam,(0,0,height*.46));cam.data.type='ORTHO';cam.data.ortho_scale=height*(2.1 if index==0 else 1.4 if index==3 else 1.29);cam.data.lens=55
    if clip:
        bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();points=[]
        for ob in sc.objects:
            if ob.type=='MESH' and ob.name!='Review ground':
                ev=ob.evaluated_get(dg);mesh=ev.to_mesh();points.extend(ev.matrix_world@p.co for p in mesh.vertices);ev.to_mesh_clear()
        low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(low+high)*.5
        cam.location=center+Vector((height*.87,-height*2.45,height*.95));aim(cam,center);cam.data.ortho_scale=max(height*1.4,(high-low).x*1.2)
    for label,power,size,pos,col in [('Key',height*height*65,height*1.4,(-height*.9,-height*1.1,height*1.8),(1,.86,.66)),('Fill',height*height*34,height,(height,-height*.35,height*.9),(.65,.8,1)),('Rim',height*height*95,height,(0,height*.9,height*1.6),(.78,.89,1))]:
        data=bpy.data.lights.new(label,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=col;ob=bpy.data.objects.new(label,data);sc.collection.objects.link(ob);ob.location=pos;aim(ob,(0,0,height*.48))
    sc.world.color=(.13,.13,.13);sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.25,.3,1);sc.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.4
    sc.view_settings.view_transform='AgX';sc.render.filepath=str(ART/(id+('-'+clip if clip else '')+'-'+angle+'.png'));start=time.monotonic();bpy.ops.render.render(write_still=True);print(json.dumps({'id':id,'renderSeconds':round(time.monotonic()-start,2),'file':sc.render.filepath}),flush=True)
if __name__=='__main__':
    for i in range(6):render(i)
