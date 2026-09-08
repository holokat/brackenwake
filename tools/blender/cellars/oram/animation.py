"""Hand-authored Oram motions plus evaluated-mesh grounding at export sample rate."""
import math
import bpy
import rigkit as rk
from mathutils import Vector


def author_actions(arm):
    clips=[]
    def add(name,keys):clips.append(rk.make_action(arm,name,keys,fps=120))
    idle=[]
    for i in range(9):
        t=i/8;wave=math.sin(math.tau*t)
        idle.append((t*2.4,{'chest':(wave*.7,0,0),'head':(-wave*.5,wave*.5,0),'upperarm_R':(1+wave*.5,0,0),'upperarm_L':(-1-wave*.6,0,0),'sash':(wave*1.8,0,0),'pouch':(wave*.6,0,0)}))
    add('idle',idle)
    for name,duration,stride in [('walk',1,25),('run',.68,39)]:
        keys=[]
        for i in range(17):
            phase=i/16;wave=math.sin(math.tau*phase);poses={'chest':(4 if name=='walk' else 10,0,wave*2.5),'head':(-2,0,-wave*2),'hips':(0,0,-wave*2)}
            for s,n in [(-1,'R'),(1,'L')]:
                z=wave*s
                poses['thigh_'+n]=(stride*z,0,0)
                poses['shin_'+n]=(-max(0,-z)*(28 if name=='walk' else 57),0,0)
                poses['foot_'+n]=(-stride*z+max(0,-z)*24,0,0)
                poses['upperarm_'+n]=(-z*(11 if name=='walk' else 21),0,0)
                poses['forearm_'+n]=(max(0,z)*6,0,0)
                poses['coat_'+n]=(max(0,z)*15,0,-z*1.5)
            poses['sash']=(wave*9,0,math.cos(math.tau*phase)*5)
            poses['pouch']=(wave*4,0,-wave*2)
            keys.append((phase*duration,poses))
        add(name,keys)
    add('attack',[
        (0,{}),(.18,{'chest':(-4,0,-17),'head':(2,0,8),'upperarm_R':(105,4,-20),'forearm_R':(37,0,0),'hand_R':(-9,0,0),'upperarm_L':(8,0,10),'sash':(-9,0,0)}),
        (.32,{'chest':(-6,0,-23),'head':(2,0,10),'upperarm_R':(121,4,-24),'forearm_R':(23,0,0),'hand_R':(-3,0,0),'upperarm_L':(14,0,12),'sash':(-12,0,2)}),
        (.47,{'chest':(15,0,20),'head':(-8,0,-8),'upperarm_R':(54,5,23),'forearm_R':(-7,0,0),'hand_R':(8,0,0),'upperarm_L':(-16,0,13),'coat_R':(10,0,0),'sash':(14,0,4)}),
        (.65,{'chest':(9,0,11),'upperarm_R':(19,0,15),'forearm_R':(4,0,0),'upperarm_L':(-10,0,9),'sash':(12,0,7)}),(.92,{})])
    add('hurt',[(0,{}),(.10,{'chest':(-11,0,-9),'head':(-8,0,5),'upperarm_R':(7,0,-10),'upperarm_L':(11,0,12),'sash':(-13,0,-4),'pouch':(-7,0,0)}),(.23,{'chest':(-6,0,-3),'head':(2,0,0),'upperarm_R':(3,0,-4),'sash':(7,0,1)}),(.45,{})])
    # War cry: lifted chin, clenched blackhand and broad left arm signal.
    war=[(0,{}),(.24,{'chest':(-4,0,0),'head':(-13,0,0),'upperarm_R':(47,0,-20),'forearm_R':(46,0,0),'upperarm_L':(53,0,43),'forearm_L':(54,0,0),'sash':(-6,0,0)}),(.7,{'chest':(-8,0,0),'head':(-18,0,0),'upperarm_R':(43,0,-24),'forearm_R':(48,0,0),'upperarm_L':(55,0,48),'forearm_L':(50,0,0),'sash':(6,0,0)}),(1.1,{})]
    add('cast',war)
    add('special',[(0,{}),(.2,{'chest':(12,0,-8),'head':(-5,0,4),'upperarm_R':(54,0,-12),'forearm_R':(15,0,0),'upperarm_L':(-19,0,9),'coat_R':(7,0,0)}),(.48,{'chest':(23,0,10),'head':(-12,0,0),'upperarm_R':(77,0,9),'forearm_R':(-3,0,0),'upperarm_L':(-24,0,12),'sash':(22,0,0),'pouch':(14,0,0)}),(.74,{'chest':(7,0,8),'upperarm_R':(30,0,9),'sash':(-10,0,0)}),(1.0,{})])
    add('die',[(0,{}),(.2,{'chest':(-14,0,4),'head':(-12,0,4),'upperarm_L':(15,0,16),'upperarm_R':(9,0,-13)}),(.45,{'hips':(26,0,3),'chest':(17,0,0),'head':(8,0,0),'upperarm_L':(15,0,23),'upperarm_R':(11,0,-22),'forearm_R':(13,0,0),'coat_R':(7,0,0),'coat_L':(7,0,0),'sash':(-13,0,0)}),(.73,{'hips':(66,0,6),'chest':(8,0,0),'head':(-5,0,0),'upperarm_L':(-16,0,39),'upperarm_R':(-12,0,-36),'forearm_R':(9,0,0),'coat_R':(-5,0,0),'coat_L':(-5,0,0),'sash':(-30,0,8)}),(1.0,{'hips':(89,0,0),'chest':(0,0,0),'head':(-8,0,17),'upperarm_L':(-9,0,42),'upperarm_R':(-5,0,-32),'forearm_R':(4,0,0),'foot_R':(-5,0,0),'foot_L':(-5,0,0),'sash':(-8,0,10)}),(1.45,{'hips':(89,0,0),'head':(-8,0,17),'upperarm_L':(-9,0,42),'upperarm_R':(-5,0,-32),'forearm_R':(4,0,0),'foot_R':(-5,0,0),'foot_L':(-5,0,0),'sash':(-8,0,10)})])
    return clips


def ground_actions(arm,meshes,actions):
    """Bake minimal root-height correction from real world-space mesh vertices.

    All original bone poses are sampled before root key insertion. The horizontal
    displacement remains in place, so the authoritative game owns locomotion.
    """
    sc=bpy.context.scene;root=arm.pose.bones['hips'];M=root.bone.matrix_local.to_3x3().normalized()
    for action in actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
        arm.animation_data.action=action;rk._assign_slot(arm,action)
        frames=range(int(action.frame_range[0]),int(action.frame_range[1])+1)
        positions=[]
        for f in frames:
            sc.frame_set(f);dg=bpy.context.evaluated_depsgraph_get()
            floor=1e9
            for ob in meshes:
                ev=ob.evaluated_get(dg);mesh=ev.to_mesh()
                floor=min(floor,min((ev.matrix_world@p.co).z for p in mesh.vertices));ev.to_mesh_clear()
            delta=M.transposed()@Vector((0,0,-floor))
            positions.append((f,root.location.copy()+delta))
        for frame,pos in positions:
            root.location=pos;root.keyframe_insert('location',frame=frame)
        # Prevent Bezier overshoot between solved samples, including the death fall.
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    arm.animation_data.action=None;rk.rest_pose(arm);sc.frame_set(0)
