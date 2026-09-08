"""Faceted, riggable geometry for the authored Cellars assets.

Authoring coordinates match the game: Y up, forward +Z, metres.
Only this module converts to Blender's Z up and forward -Y.
"""
import bpy
import bmesh
import math
from mathutils import Vector


def v(p):
    return Vector((p[0], -p[2], p[1]))


def material(name, color, metal=0, rough=.75, emission=0):
    rgb=[((color>>shift)&255)/255 for shift in [16,8,0]]
    rgba=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)
    m=bpy.data.materials.new(name)
    m.diffuse_color=rgba
    m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=rgba
    n.inputs['Metallic'].default_value=metal
    n.inputs['Roughness'].default_value=rough
    n.inputs['Emission Color'].default_value=rgba
    n.inputs['Emission Strength'].default_value=emission
    return m


class Kit:
    def __init__(self, palette):
        self.materials=palette
        self.objects=[]

    def mesh(self,name,verts,faces,mat,bone=None):
        me=bpy.data.meshes.new(name)
        me.from_pydata([v(p) for p in verts],[],faces)
        me.update()
        bm=bmesh.new();bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(me);bm.free()
        ob=bpy.data.objects.new(name,me)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(self.materials[mat])
        if bone:
            vg=ob.vertex_groups.new(name=bone)
            vg.add(list(range(len(me.vertices))),1,'REPLACE')
        ob['part']=name
        self.objects.append(ob)
        return ob

    def plate(self,name,points,depth,mat,bone,center=(0,0,0),bevel=.12,ridge=.25):
        """Closed chamfered polygon with a faceted, convex front surface."""
        cx,cy,cz=center;n=len(points)
        mx=sum(p[0] for p in points)/n;my=sum(p[1] for p in points)/n
        verts=[]
        for scale,z in [(1,-depth/2),(1,depth/2-bevel),(.9,depth/2)]:
            verts.extend((cx+mx+(x-mx)*scale,cy+my+(y-my)*scale,cz+z) for x,y in points)
        faces=[tuple(range(n-1,-1,-1))]
        for ring in range(2):
            for i in range(n):
                j=(i+1)%n;faces.append((ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i))
        if ridge:
            verts.append((cx+mx,cy+my,cz+depth/2+ridge))
            faces.extend((2*n+i,2*n+(i+1)%n,3*n) for i in range(n))
        else:faces.append(tuple(range(2*n,3*n)))
        return self.mesh(name,verts,faces,mat,bone)

    def box(self,name,c,size,mat,bone=None,bevel=.08):
        x,y,z=size
        points=[(-x/2+bevel,-y/2),(x/2-bevel,-y/2),(x/2,-y/2+bevel),(x/2,y/2-bevel),(x/2-bevel,y/2),(-x/2+bevel,y/2),(-x/2,y/2-bevel),(-x/2,-y/2+bevel)]
        return self.plate(name,points,z,mat,bone,c,bevel,0)

    def loft(self,name,rings,mat,bone=None,segments=8):
        verts=[]
        for y,rx,rz,x,z in rings:
            for i in range(segments):
                a=math.tau*(i+.5)/segments
                verts.append((x+math.cos(a)*rx,y,z+math.sin(a)*rz))
        faces=[tuple(range(segments-1,-1,-1))]
        for j in range(len(rings)-1):
            for i in range(segments):
                a=j*segments+i;b=j*segments+(i+1)%segments
                if j%2:
                    faces.extend([(a,b,b+segments),(a,b+segments,a+segments)])
                else:faces.append((a,b,b+segments,a+segments))
        faces.append(tuple(range((len(rings)-1)*segments,len(verts))))
        return self.mesh(name,verts,faces,mat,bone)

    def beam(self,name,a,b,width,mat,bone=None,segments=6):
        av=Vector(a);bv=Vector(b);axis=(bv-av).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();w=axis.cross(u).normalized()
        verts=[]
        for p in [av,bv]:
            for i in range(segments):
                t=math.tau*i/segments
                verts.append(p+(u*math.cos(t)+w*math.sin(t))*width)
        faces=[tuple(range(segments-1,-1,-1)),tuple(range(segments,segments*2))]
        faces.extend((i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments))
        return self.mesh(name,verts,faces,mat,bone)

    def torus(self,name,c,radius,tube,mat,bone=None,rotate=False):
        verts=[];faces=[];n=10;m=4
        for i in range(n):
            a=math.tau*i/n
            for j in range(m):
                b=math.tau*j/m;r=radius+tube*math.cos(b)
                x,y,z=math.cos(a)*r,math.sin(a)*r,tube*math.sin(b)
                if rotate:x,z=z,x
                verts.append((c[0]+x,c[1]+y,c[2]+z))
        for i in range(n):
            for j in range(m):faces.append((i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m))
        return self.mesh(name,verts,faces,mat,bone)

    def join_slots(self):
        result=[]
        grouped=[(mat,[o for o in self.objects if o.data.materials[0]==mat]) for mat in self.materials.values()]
        for mat,obs in grouped:
            if not obs:continue
            bpy.ops.object.select_all(action='DESELECT')
            for ob in obs:ob.select_set(True)
            bpy.context.view_layer.objects.active=obs[0]
            bpy.ops.object.join()
            ob=obs[0];ob.name=mat.name
            result.append(ob)
        self.objects=result
        return result
