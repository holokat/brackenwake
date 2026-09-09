"""Build the real batched geometry without bpy and audit its actual mesh data."""
import importlib.util
import math
from pathlib import Path
import sys
import types

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]


class Vector:
    """The elementary vector subset Geometry.beam uses, with no Blender scene."""
    def __init__(self,values):self.values=tuple(values)
    def __iter__(self):return iter(self.values)
    def __add__(self,other):return Vector(a+b for a,b in zip(self,other))
    def __sub__(self,other):return Vector(a-b for a,b in zip(self,other))
    def __mul__(self,scalar):return Vector(a*scalar for a in self)
    __rmul__=__mul__
    @property
    def length(self):return math.sqrt(sum(a*a for a in self))
    def normalized(self):
        length=self.length
        if length==0:raise ValueError('Zero length geometry beam')
        return self*(1/length)
    def normalize(self):self.values=self.normalized().values
    def cross(self,other):
        a,b,c=self;d,e,f=other
        return Vector((b*f-c*e,c*d-a*f,a*e-b*d))


# Only mathutils is replaced. The production Geometry methods create every vertex.
try:
    import mathutils
except ImportError:
    mathutils=types.ModuleType('mathutils');mathutils.Vector=Vector;sys.modules['mathutils']=mathutils


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


geometry=load('ornament_geometry',ROOT/'tools/blender/widow/geometry.py')
settings=load('ornament_settings',HERE/'settings.py')
architecture=load('ornament_architecture',HERE/'architecture.py')
fittings=load('ornament_fittings',HERE/'fittings.py')
ornaments=load('ornament_builder',HERE/'ornaments.py')


class MeasuredGeometry(geometry.Geometry):
    def __init__(self):
        super().__init__();self.record=False;self.additions=[]
    def mesh(self,key,vertices,faces,shade=1):
        vertices=list(vertices);faces=list(faces)
        super().mesh(key,vertices,faces,shade)
        if self.record:self.additions.append((key,vertices,faces))


def clip_height(poly,height,above):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ain=(a[1]>=height) if above else (a[1]<=height)
        bin=(b[1]>=height) if above else (b[1]<=height)
        if ain:out.append(a)
        if ain!=bin:
            t=(height-a[1])/(b[1]-a[1]);out.append(tuple(a[k]+t*(b[k]-a[k]) for k in range(3)))
    return out


def area2(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

def point_segment(p,a,b):
    dx,dz=b[0]-a[0],b[1]-a[1];length=dx*dx+dz*dz
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)) if length else 0
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)


def segment_distance(a,b,c,d):
    cross1,cross2=area2(a,b,c),area2(a,b,d)
    cross3,cross4=area2(c,d,a),area2(c,d,b)
    if cross1*cross2<0 and cross3*cross4<0:return 0
    return min(point_segment(a,c,d),point_segment(b,c,d),point_segment(c,a,b),point_segment(d,a,b))


def point_inside(p,poly):
    inside=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:inside=not inside
    return inside


def route_distance(poly,a,b):
    if point_inside(a,poly) or point_inside(b,poly):return 0
    return min(segment_distance(a,b,c,d) for c,d in zip(poly,poly[1:]+poly[:1]))


def rect_overlap(poly,rect):
    xmin,xmax,zmin,zmax=rect
    if (max(p[0] for p in poly)<xmin or min(p[0] for p in poly)>xmax or
            max(p[1] for p in poly)<zmin or min(p[1] for p in poly)>zmax):return False
    box=[(xmin,zmin),(xmax,zmin),(xmax,zmax),(xmin,zmax)]
    if any(xmin<=x<=xmax and zmin<=z<=zmax for x,z in poly):return True
    if any(point_inside(p,poly) for p in box):return True
    return any(route_distance(poly,a,b)<1e-8 for a,b in zip(box,box[1:]+box[:1]))


def validate(g,r,require_counts=True):
    errors=[];protected=[];triangles=0
    for key,(vertices,faces,shades) in g.parts.items():
        if key not in settings.PALETTE:errors.append('unknown material '+key)
        if len(vertices)!=len(shades):errors.append('vertex shade count')
        if any(len(v)!=3 or not all(math.isfinite(a) for a in v) for v in vertices):errors.append('nonfinite vertex')
        for face in faces:
            if len(face)<3 or any(not isinstance(i,int) or i<0 or i>=len(vertices) for i in face):errors.append('invalid face')
            triangles+=max(0,len(face)-2)
    if triangles>=400000:errors.append(f'room exceeds triangle budget: {triangles}')
    rx,rz=r['rx'],r['rz'];routes=r['routes']
    portals=[(-5.9,5.9,-rz-4,-rz+2),(-5.9,5.9,rz-2,rz+4),
             (-rx-4,-rx+2,-5.9,5.9),(rx-2,rx+4,-5.9,5.9)]
    for key,vertices,faces in g.additions:
        if any(abs(x)>rx+.1 or abs(z)>rz+.1 or y<-.15 or y>r['ceiling']+.1 for x,y,z in vertices):
            errors.append(f'ornament bounds: {key} {vertices[:1]}')
        # The octagonal perimeter must not grow opaque corner blocks beyond the wall.
        if any(abs(x)+abs(z)>rx+rz-4.7 for x,y,z in vertices):errors.append('ornament outside chamfered plan')
        if r['theme']=='titan' and min(v[1] for v in vertices)<11.9:
            for face in faces:
                poly=clip_height(clip_height([vertices[i] for i in face],.15,True),11.9,False)
                if len(poly)>1 and rect_overlap([(p[0],p[2]) for p in poly],(-23,-14,-20.5,-13.5)):
                    errors.append('ornament intersects royal throne');break
        if min(v[1] for v in vertices)>2.6 or max(v[1] for v in vertices)<.15:continue
        for face in faces:
            # Clip the actual polygon to the player's vertical band before projecting.
            poly=[vertices[i] for i in face]
            poly=clip_height(clip_height(poly,.15,True),2.6,False)
            if len(poly)<2:continue
            flat=[(p[0],p[2]) for p in poly]
            if rect_overlap(flat,(-12,12,-rz,rz)):
                errors.append('opaque geometry in central 24 m space');break
            if any(rect_overlap(flat,rect) for rect in portals):
                errors.append('opaque geometry in 12 m portal');break
            if any(route_distance(flat,a,b)<1.0 for route in routes for a,b in zip(route,route[1:])):
                errors.append('opaque geometry intersects declared route');break
        protected.append(key)
    if require_counts:
        if len(g.additions)<1000:errors.append('architectural dressing unexpectedly sparse')
        low=min((v[1] for _,vv,_ in g.additions for v in vv),default=math.inf)
        high=max((v[1] for _,vv,_ in g.additions for v in vv),default=-math.inf)
        if high-low<r['ceiling']*.65:errors.append('detail does not develop room height')
        if not any(c['model']=='Carved wall pier' for c in g.colliders):errors.append('no architectural supports')
        if r['theme'] in ('archive','command'):
            flights=[c for c in g.colliders if c['model']=='Supported gallery stair']
            expected=4 if r['theme']=='archive' else 2
            if len(flights)!=expected:errors.append('missing accessible gallery flight')
            if not all(c['kind']=='ramp' and c['h']>6 and c['d']>10 for c in flights):errors.append('invalid stair ramp contract')
    return sorted(set(errors)),triangles


def main():
    # Verify the vector stand-in's normalization and orientation independently.
    v=Vector((3,0,4));assert abs(v.normalized().length-1)<1e-10
    assert tuple(Vector((1,0,0)).cross(Vector((0,1,0))))==(0,0,1)
    results=[]
    for source in settings.ROOMS:
        g=MeasuredGeometry();r=settings.room_spec(source)
        architecture.shell(g,r);fittings.build(g,r)
        g.record=True;report=ornaments.build(g,r)
        errors,triangles=validate(g,r)
        if errors:raise AssertionError(r['id']+': '+ '; '.join(errors))
        results.append((r['id'],report['parts'],triangles))
    # Prove all absence checks can detect actual bad geometry, not missing data.
    r=settings.room_spec(settings.ROOMS[1]);base=MeasuredGeometry();architecture.shell(base,r)
    for label,key,c,size,expected in [
            ('route','limestone',(13,1,0),(.2,2,.2),'opaque geometry intersects declared route'),
            ('portal','limestone',(r['rx']-1,1,0),(2,2,12),'opaque geometry in 12 m portal'),
            ('central','limestone',(0,1,0),(2,2,2),'opaque geometry in central 24 m space'),
            ('material','unregistered',(20,1,-15),(1,1,1),'unknown material unregistered'),
            ('bounds','trim',(r['rx']+3,1,0),(2,2,2),'ornament bounds:')]:
        bad=MeasuredGeometry();bad.record=True;bad.box(key,c,size)
        errors,_=validate(bad,r,False)
        assert any(e.startswith(expected) for e in errors),label+' positive control escaped its intended check'
    for room,parts,triangles in results:print(f'{room}: {parts} added parts, {triangles} total room triangles')
    print('CELLAR_ORNAMENTS_VERIFIED')


if __name__=='__main__':main()
