"""Original tileable material detail created inside Blender, with no downloads."""
import bpy,math
from mathutils import Vector,noise


def create(kind,directory):
    size=512;image=bpy.data.images.new('Widow '+kind,width=size,height=size)
    pixels=[]
    for y in range(size):
        v=y/size*math.tau
        for x in range(size):
            u=x/size*math.tau
            p=Vector((math.cos(u)*2.7+math.sin(v),math.sin(u)*2.7,math.cos(v)*2.7))
            n=noise.noise(p);fine=noise.noise(p*8.3);grain=noise.noise(p*39)
            if kind=='wood':
                rings=abs(math.sin(u*38+noise.noise(p*.7)*8))
                value=.54+.28*rings+.09*fine+.04*grain
            else:
                vein=max(0,1-abs(noise.noise(p*2.1))/.035)*.19
                value=.83+.12*n+.09*fine+.035*grain-vein
            value=max(.28,min(1,value));pixels.extend((value,value,value,1))
    image.pixels.foreach_set(pixels);image.filepath_raw=str(directory/(kind+'-detail.png'));image.file_format='PNG';image.save();image.pack()
    return image


def uv_map(mesh,scale):
    uv=mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        n=face.normal;axis=max(range(3),key=lambda i:abs(n[i]))
        a,b=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            p=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(p[a]*scale,p[b]*scale)
