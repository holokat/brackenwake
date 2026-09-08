"""Deterministic faceted geometry, authored in metres with game Y up and +Z forward."""
import math
import random
from collections import Counter
import bpy
import bmesh
from mathutils import Vector

PALETTE = {
    'stone':(0x485465,.0,.88,0), 'stone_light':(0x697789,0,.85,0),
    'stone_dark':(0x29313f,0,.95,0), 'rock':(0x344050,0,.92,0),
    'mortar':(0x202936,0,.97,0), 'bone':(0xb8ae87,0,.86,0),
    'bone_light':(0xd4c7a1,0,.8,0), 'iron':(0x303440,.7,.55,0),
    'brass':(0xa4823e,.7,.38,0), 'gold':(0xd9af58,.65,.32,0),
    'wood':(0x593d2b,0,.83,0), 'wood_light':(0x816043,0,.8,0),
    'red':(0x701f2b,0,.96,0), 'purple':(0x4b276a,0,.95,0),
    'book_red':(0x6e3640,0,.9,0), 'book_green':(0x35544f,0,.9,0),
    'book_blue':(0x39465b,0,.9,0), 'pages':(0xb7aa81,0,.88,0),
    'wax':(0xdac899,0,.65,0), 'fire':(0xffb54c,0,.4,3),
    'fire_core':(0xffead2,0,.4,5), 'soul':(0x49cee7,0,.3,3),
    'arcane':(0xa16aec,0,.35,3), 'water':(0x28656b,.45,.25,.04),
    'water_light':(0x44868a,.25,.28,.03), 'moss':(0x4a6250,0,1,0),
    'void':(0x080c17,0,1,0), 'ceiling':(0x263040,0,.96,0),
    'stone_floor':(0x485465,0,.88,0), 'stone_floor_light':(0x697789,0,.85,0),
}
for stone_name in ('stone','stone_light','stone_dark'):
    PALETTE[stone_name+'_structure']=PALETTE[stone_name]

def blender_point(p):
    return (p[0],-p[2],p[1])

def material(name, values):
    color,metal,rough,emission=values
    srgb=[((color>>s)&255)/255 for s in (16,8,0)]
    rgba=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in srgb)+(1,)
    m=bpy.data.materials.new('Cellar '+name); m.diffuse_color=rgba; m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=rgba;p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough;p.inputs['Emission Color'].default_value=rgba
    p.inputs['Emission Strength'].default_value=emission
    return m

class Room:
    def __init__(self, level, title, ceiling):
        self.level=level;self.title=title;self.ceiling=ceiling
        self.rx=82 if level==8 else 48;self.rz=82 if level==8 else 38
        self.rng=random.Random(91871+level*771);self.batches={};self.parts=Counter()
        self.collision=[];self.anchors=[];self.routes=[];self.landmarks=[];self.objects=[]
        self.features={};self.holes=[]

    def mesh(self,name,verts,faces,mat):
        vertices,polygons=self.batches.setdefault(mat,([],[]));offset=len(vertices)
        vertices.extend(tuple(p) for p in verts)
        polygons.extend(tuple(i+offset for i in face) for face in faces)
        self.parts[name]+=1

    def box(self,name,c,size,mat='stone',angle=0,bevel=.05):
        x,y,z=c;w,h,d=size;b=min(bevel,w*.15,h*.15,d*.15)
        ring=[(-w/2+b,-d/2), (w/2-b,-d/2),(w/2,-d/2+b),(w/2,d/2-b),
              (w/2-b,d/2),(-w/2+b,d/2),(-w/2,d/2-b),(-w/2,-d/2+b)]
        ca,sa=math.cos(angle),math.sin(angle);verts=[]
        for yy,scale in [(-h/2,.97),(h/2,1)]:
            verts.extend((x+(xx*ca+zz*sa)*scale,y+yy,z+(-xx*sa+zz*ca)*scale) for xx,zz in ring)
        faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]
        for j in range(1):
            for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
        self.mesh(name,verts,faces,mat)

    def simplebox(self,name,c,size,mat='stone',angle=0):
        x,y,z=c;w,h,d=[s/2 for s in size];ca,sa=math.cos(angle),math.sin(angle)
        verts=[(x+xx*ca+zz*sa,y+yy,z-xx*sa+zz*ca) for xx,yy,zz in
               [(-w,-h,-d),(w,-h,-d),(w,-h,d),(-w,-h,d),(-w,h,-d),(w,h,-d),(w,h,d),(-w,h,d)]]
        self.mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)

    def beam(self,name,a,b,r,mat='stone',segments=6):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u).normalized();verts=[]
        for p in (a,b):
            for i in range(segments):
                t=math.tau*i/segments;verts.append(p+(u*math.cos(t)+v*math.sin(t))*r)
        faces=[tuple(range(segments-1,-1,-1)),tuple(range(segments,2*segments))]
        faces.extend((i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments))
        self.mesh(name,verts,faces,mat)

    def loft(self,name,rings,mat='stone',segments=12,caps=True):
        verts=[]
        for y,rx,rz,x,z in rings:
            verts.extend((x+math.cos(i*math.tau/segments)*rx,y,z+math.sin(i*math.tau/segments)*rz) for i in range(segments))
        faces=[]
        if caps:faces=[tuple(range(segments-1,-1,-1)),tuple(range((len(rings)-1)*segments,len(verts)))]
        for j in range(len(rings)-1):
            for i in range(segments):
                a=j*segments+i;b=j*segments+(i+1)%segments
                faces.append((a,b,b+segments,a+segments))
        self.mesh(name,verts,faces,mat)

    def tube(self,name,points,r,mat='stone',segments=6):
        for a,b in zip(points,points[1:]):self.beam(name,a,b,r,mat,segments)

    def ring(self,name,c,r,t,mat='iron',normal=(0,1,0),segments=32):
        n=Vector(normal).normalized();u=n.cross(Vector((0,0,1)))
        if u.length<.01:u=n.cross(Vector((0,1,0)))
        u.normalize();v=n.cross(u).normalized();cv=Vector(c);verts=[]
        for i in range(segments):
            a=math.tau*i/segments;rad=u*math.cos(a)+v*math.sin(a)
            for j in range(4):
                b=math.tau*j/4;verts.append(cv+rad*(r+t*math.cos(b))+n*t*math.sin(b))
        self.mesh(name,verts,[(i*4+j,((i+1)%segments)*4+j,((i+1)%segments)*4+(j+1)%4,i*4+(j+1)%4) for i in range(segments) for j in range(4)],mat)

    def rock(self,name,c,size,mat='rock'):
        x,y,z=c;w,h,d=size;verts=[]
        for yy,scale in [(-.5,.65),(-.18,1),(.25,.86),(.5,.38)]:
            for i in range(7):
                a=math.tau*i/7;f=self.rng.uniform(.82,1.16)
                verts.append((x+math.cos(a)*w*scale*f,y+yy*h,z+math.sin(a)*d*scale*f))
        faces=[tuple(range(6,-1,-1)),tuple(range(21,28))]
        for j in range(3):
            for i in range(7):
                a=j*7+i;b=j*7+(i+1)%7
                faces.extend([(a,b,b+7),(a,b+7,a+7)])
        self.mesh(name,verts,faces,mat)

    def collision_box(self,name,x,y,z,w,h,d,angle=0):
        self.collision.append(dict(kind='box',model=name,x=x,y=y,z=z,w=w,h=h,d=d,c=math.cos(angle),s=math.sin(angle)))

    def anchor(self,name,kind,p,color=None,intensity=1,radius=8):
        ident=f'cellar{self.level}_{name}_{len(self.anchors):03d}'
        self.anchors.append(dict(name=ident,kind=kind,x=p[0],y=p[1],z=p[2],color=color,intensity=intensity,radius=radius))

    def finish(self):
        for name,(verts,faces) in self.batches.items():
            mesh=bpy.data.meshes.new('Cellar '+name);mesh.from_pydata([blender_point(v) for v in verts],[],faces);mesh.update()
            bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
            ob=bpy.data.objects.new('Cellar '+str(self.level)+' '+name,mesh);bpy.context.collection.objects.link(ob)
            ob.data.materials.append(material(name,PALETTE[name]));self.objects.append(ob)
        for anchor in self.anchors:
            ob=bpy.data.objects.new(anchor['name'],None);ob.location=blender_point((anchor['x'],anchor['y'],anchor['z']))
            ob.empty_display_size=.25;bpy.context.collection.objects.link(ob);self.objects.append(ob)
        return self.objects
