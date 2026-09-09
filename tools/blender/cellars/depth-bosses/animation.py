"""Boss-specific eight-clip action sets and exact floor correction of rigid skins."""
import math
import bpy,numpy as np
import rigkit as rk
FPS=24

def animate(arm,kind,height):
    names={b.name for b in arm.pose.bones};limbs=[n for n in names if ('arm' in n or 'leg' in n) and not n.endswith('_tip')];tails=[n for n in names if n.startswith(('cape','robe','book'))];actions=[]
    def pose(t,mode):
        q={};wave=math.sin(t*math.tau);half=math.sin(t*math.tau+math.pi/2)
        q['chest']=(1.2*wave,0,1*half);q['head']=(-1*wave,2*half,0)
        for j,n in enumerate(sorted(limbs)):
            side=-1 if n.endswith('L') or '-1_' in n else 1
            phase=math.sin(t*math.tau+j%2*math.pi)
            if mode in ['walk','run']:
                amp=13 if mode=='walk' else 24
                q[n]=(amp*phase,0,side*2*phase)
                if n+'_tip' in names:q[n+'_tip']=(max(0,-phase)*amp*.65,0,0)
                q['chest']=(3*wave,0,2*wave)
            else:q[n]=(2*wave,0,side*1.3*half)
        for j,n in enumerate(tails):q[n]=(3*math.sin(t*math.tau+j*.75),2*wave,3*half)
        if kind=='ilexChainArchivist':q['hips']=(0,0,0,0,0,height*.012*(wave+1))
        return q
    for mode,duration in [('idle',2.4),('walk',1.3),('run',.8)]:
        actions.append(rk.make_action(arm,mode,[(duration*i/8,pose(i/8,mode)) for i in range(9)],FPS))
    armL=next((n for n in ['upperarm_L','leg-1_1'] if n in names),'chest')
    armR=next((n for n in ['upperarm_R','leg1_1'] if n in names),'chest')
    for mode,duration in [('attack',1.25),('cast',1.8),('hurt',.55),('special',2.1),('die',2.35)]:
        keys=[]
        for i in range(9):
            t=i/8;q=pose(t,'idle');envelope=math.sin(t*math.pi)
            if mode=='attack':
                strike=math.sin(t*math.pi*1.85)
                q['chest']=(12*envelope,0,-13*strike);q[armL]=(68*strike,0,-12*envelope);q[armR]=(24*strike,0,16*envelope)
                if kind=='morvaOssuaryMother':q[armL]=(24*strike,0,23*envelope);q[armR]=(24*strike,0,-23*envelope)
                if kind=='vossInvertedSaint':q[armL]=(22*strike,0,-4*envelope);q[armR]=(22*strike,0,4*envelope)
            elif mode=='cast':
                q['chest']=(-7*envelope,0,0);q['head']=(-12*envelope,0,0)
                q[armL]=(22*envelope,32*envelope,0);q[armR]=(22*envelope,-32*envelope,0)
                for n in tails:q[n]=(8*envelope,0,9*envelope)
            elif mode=='special':
                q['chest']=(-9*envelope,0,20*math.sin(t*TAU));q[armL]=(25*envelope,42*envelope,0);q[armR]=(25*envelope,-42*envelope,0)
                for n in names:
                    if n.startswith('extraarm'):q[n]=(30*envelope,27*envelope*(1 if n.endswith('L') else -1),0)
            elif mode=='hurt':q['chest']=(-14*envelope,0,4*envelope);q['head']=(12*envelope,0,0)
            elif mode=='die':
                fall=min(1,max(0,(t-.15)/.61));q={n:(0,0,0) for n in names}
                q['hips']=(82*fall,0,6*fall);q['head']=(11*fall,0,14*fall);q[armL]=(14*fall,0,-20*fall);q[armR]=(20*fall,0,20*fall)
                if kind=='sextonBellkeeper':
                    q['hips']=(90*fall,0,0);q['head']=(0,0,0);q[armL]=(0,0,0);q[armR]=(0,0,0)
                if kind in ['morvaOssuaryMother','vossInvertedSaint']:
                    q['hips']=(5*fall,0,3*fall)
                    for n in limbs:
                        side=-1 if n.endswith('L') or '-1_' in n else 1
                        q[n]=(0,-side*58*fall,0)
                        if n+'_tip' in names:q[n+'_tip']=(0,side*80*fall,0)
            keys.append((duration*t,q))
        actions.append(rk.make_action(arm,mode,keys,FPS))
    for action in actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    return actions
TAU=math.tau

def ground(arm,meshes,actions,floating=False):
    groups={}
    for ob in meshes:
        by={v.index:v.name for v in ob.vertex_groups}
        for p in ob.data.vertices:
            name=by[p.groups[0].group];groups.setdefault(name,[]).append((*p.co,1))
    groups={name:np.array(points,dtype=np.float64) for name,points in groups.items()}
    rest={name:arm.data.bones[name].matrix_local.inverted() for name in groups};root=arm.pose.bones['hips'];basis=root.bone.matrix_local.to_3x3().normalized()
    from mathutils import Vector
    for action in actions:
        arm.animation_data.action=action;rk._assign_slot(arm,action);keys=[]
        for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            floor=min(float((vs@np.array(arm.pose.bones[name].matrix@rest[name]).T)[:,2].min()) for name,vs in groups.items())
            target=.2 if floating and action.name!='die' else 0
            keys.append((frame,root.location.copy()+basis.transposed()@Vector((0,0,target-floor))))
        for frame,loc in keys:root.location=loc;root.keyframe_insert('location',frame=frame)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    arm.animation_data.action=None;rk.rest_pose(arm);bpy.context.scene.frame_set(0)
