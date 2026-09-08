"""Inspect the four impact poses on the exported rig in the MCP review scene."""
import bpy,math,os,json
from mathutils import Vector
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
out=os.path.join(root,'docs/art/old-cellars/blender/vharos-review')
sc=bpy.context.scene
arm=next(o for o in sc.objects if o.type=='ARMATURE')
for track in arm.animation_data.nla_tracks:track.mute=True
sc.camera.location=(55,-85,35)
sc.camera.rotation_euler=(Vector((0,0,24))-sc.camera.location).to_track_quat('-Z','Y').to_euler()
sc.camera.data.ortho_scale=57
sc.cycles.samples=20
records=[]
for name,seconds in [('gravesurge',3.65),('funeralcross',4.8),('hollowstar',5),('tombfall',3.4),('die',8)]:
    action=next(a for a in bpy.data.actions if a.name==name or a.name.startswith(name+'.'))
    arm.animation_data.action=action
    if action.slots:arm.animation_data.action_slot=action.slots[0]
    sc.frame_set(round(seconds*sc.render.fps))
    deps=bpy.context.evaluated_depsgraph_get()
    points=[o.matrix_world@Vector(p) for o in sc.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers) for p in o.evaluated_get(deps).bound_box]
    centre=sum(points,Vector())/len(points)
    sc.camera.location=centre+Vector((55,-85,15))
    sc.camera.rotation_euler=(centre-sc.camera.location).to_track_quat('-Z','Y').to_euler()
    inverse=sc.camera.matrix_world.inverted()
    bpy.context.view_layer.update();inverse=sc.camera.matrix_world.inverted()
    view=[inverse@p for p in points]
    sc.camera.data.ortho_scale=max(max(p.y for p in view)-min(p.y for p in view),(max(p.x for p in view)-min(p.x for p in view))/(sc.render.resolution_x/sc.render.resolution_y))*1.16
    sc.render.filepath=os.path.join(out,name+'.png')
    bpy.ops.render.render(write_still=True)
    records.append({'clip':name,'seconds':seconds,'image':sc.render.filepath})
open(os.path.join(out,'poses.json'),'w').write(json.dumps(records,indent=2))
print('VHAROS_ATTACK_POSES_SAVED',len(records))
