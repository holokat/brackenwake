"""Batched, flat-shaded vertex-colour meshes. Blender Z up, metres."""
import bpy, bmesh, math, random
from mathutils import Vector

PALETTE = {
 'wood':'795436','woodlight':'b08a53','dark':'413c35','iron':'484c49',
 'stone':'b2aa8a','chalk':'d2c7a6','stonedark':'898971','plaster':'e2d3a5',
 'cream':'f3e2b2','teal':'669e98','tealdark':'3a7275','roof':'536a77',
 'gold':'e9b646','red':'c56545','leaf':'729344','leaflight':'99ad54',
 'stem':'587740','lavender':'a893c5','purple':'8273ab','white':'ece8ca',
 'yellow':'ead25e','sand':'b8a576','rope':'b4a27a',
}
def linear(hexcode):
 return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in [int(hexcode[i:i+2],16)/255 for i in (0,2,4)])

def vertex_material():
 m=bpy.data.materials.new('bw_meadow_matte');m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.86
 vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color'
 m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
 m.use_backface_culling=False
 return m

class Mesh:
 def __init__(self,seed=91):self.vertices=[];self.faces=[];self.colors=[];self.rng=random.Random(seed)
 def add(self,verts,faces,shade,vary=.065):
  n=len(self.vertices);self.vertices.extend(tuple(v) for v in verts)
  shades=shade if isinstance(shade,list) else [shade]
  for i,f in enumerate(faces):
   self.faces.append(tuple(n+j for j in f));t=self.rng.uniform(1-vary,1+vary)
   self.colors.append(tuple(min(1,c*t) for c in linear(PALETTE[shades[i%len(shades)]]))+(1,))
 def box(self,at,size,shade,angle=0,bevel=0):
  w,d,h=[s/2 for s in size]
  v=[(a*w,b*d,c*h)for a,b,c in[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
  if bevel:
   bm=bmesh.new();vv=[bm.verts.new(p)for p in v]
   for f in faces:bm.faces.new([vv[i]for i in f])
   bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=1,affect='EDGES');bm.verts.ensure_lookup_table()
   for i,p in enumerate(bm.verts):p.index=i
   v=[tuple(p.co)for p in bm.verts];faces=[tuple(p.index for p in f.verts)for f in bm.faces];bm.free()
  c,s=math.cos(angle),math.sin(angle)
  self.add([(at[0]+x*c-y*s,at[1]+x*s+y*c,at[2]+z)for x,y,z in v],faces,shade)
 def beam(self,a,b,r,shade='wood',sides=6,r2=None):
  a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
  if u.length<.01:u=axis.cross(Vector((0,1,0)))
  u.normalize();v=axis.cross(u)
  verts=[p+rad*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)for p,rad in[(a,r),(b,r if r2 is None else r2)]for i in range(sides)]
  faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)]
  self.add(verts,faces,shade)
 def rock(self,at,scale,shade=('chalk','stone','chalk'),seed=3):
  bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=1,radius=1)
  rng=random.Random(seed)
  for i,p in enumerate(bm.verts):p.index=i
  self.add([tuple(p.co[i]*scale[i]*rng.uniform(.9,1.12)+at[i]for i in range(3))for p in bm.verts],
   [tuple(p.index for p in f.verts)for f in bm.faces],list(shade));bm.free()
 def ring(self,center,r,t,shade,segments=12):
  x,y,z=center
  for i in range(segments):
   a=i*math.tau/segments;b=(i+1)*math.tau/segments
   self.beam((x+r*math.cos(a),y+r*math.sin(a),z),(x+r*math.cos(b),y+r*math.sin(b),z),t,shade,4)
 def object(self,name,collection,material):
  data=bpy.data.meshes.new(name);data.from_pydata(self.vertices,[],self.faces);data.update()
  data.materials.append(material);attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');data.color_attributes.active_color=attr
  for face,color in zip(data.polygons,self.colors):
   for i in face.loop_indices:attr.data[i].color=color
  obj=bpy.data.objects.new(name,data);collection.objects.link(obj);obj['asset_owner']='brackenwake_haven_meadow'
  return obj

def barrel(m,x,y,z=0,r=.45,h=.95):
 profile=[(r*.8,z),(r,z+h*.28),(r,z+h*.72),(r*.8,z+h)]
 for i in range(12):
  a=i*math.tau/12;b=(i+1)*math.tau/12
  for (r0,z0),(r1,z1)in zip(profile,profile[1:]):
   m.add([(x+r0*math.cos(a),y+r0*math.sin(a),z0),(x+r0*math.cos(b),y+r0*math.sin(b),z0),(x+r1*math.cos(b),y+r1*math.sin(b),z1),(x+r1*math.cos(a),y+r1*math.sin(a),z1)],[(0,1,2,3)],'woodlight'if i%3 else'wood')
 for height in(.15,.8):m.ring((x,y,z+h*height),r*.95,.032,'iron')
 m.beam((x,y,z+h-.035),(x,y,z+h),r*.81,'wood',12)

def cloth(m,width,depth,height,shade='cream',stripes=False):
 for i in range(8):
  x0=-width/2+i*width/8;x1=x0+width/8
  for j in range(6):
   y0=-depth/2+j*depth/6;y1=y0+depth/6
   def p(x,y):return(x,y,height-.48*(1-(2*y/depth)**2)+.09*math.sin(x*2))
   m.add([p(x0,y0),p(x1,y0),p(x1,y1),p(x0,y1)],[(0,1,2),(0,2,3)],'teal'if stripes and i%2 else shade,.02)
 for i in range(8):
  x=-width/2+i*width/8
  m.add([(x,-depth/2,height),(x+width/8,-depth/2,height),(x+width/16,-depth/2-.05,height-.35)],[(0,1,2)],'teal'if stripes and i%2 else shade)
