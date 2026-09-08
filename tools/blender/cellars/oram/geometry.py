"""Oram-specific sculpting helpers. All coordinates use game Y up, +Z forward."""
import math
from mathutils import Vector


def shell(k,name,rings,mat,bone,segments=12,phase=0,facets=.0):
    """Triangulated variable-section volume; deterministic off-ring facets."""
    verts=[]
    for j,(y,rx,rz,x,z) in enumerate(rings):
        for i in range(segments):
            a=math.tau*(i+.5)/segments+phase
            f=1+facets*math.sin(i*7.13+j*13.1)
            verts.append((x+math.cos(a)*rx*f,y,z+math.sin(a)*rz*f))
    faces=[tuple(range(segments-1,-1,-1))]
    for j in range(len(rings)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.extend([(a,b,a+segments),(b,b+segments,a+segments)])
    faces.append(tuple(range((len(rings)-1)*segments,len(verts))))
    return k.mesh(name,verts,faces,mat,bone)


def sheet(k,name,rows,mat,bone,thickness=.009):
    """A shaped sewn panel, with real thickness and irregular silhouette."""
    width=len(rows[0]);verts=[p for row in rows for p in row];n=len(verts)
    verts += [(x,y,z-thickness) for x,y,z in verts]
    faces=[]
    for j in range(len(rows)-1):
        for i in range(width-1):
            a=j*width+i;b=a+1;c=a+width;d=c+1
            faces.extend([(a,b,c),(b,d,c),(a+n,c+n,b+n),(b+n,c+n,d+n)])
    border=list(range(width))+[j*width+width-1 for j in range(1,len(rows))]+list(range(n-2,n-width-1,-1))+[j*width for j in range(len(rows)-2,0,-1)]
    for i,a in enumerate(border):
        b=border[(i+1)%len(border)];faces.append((a,a+n,b+n,b))
    return k.mesh(name,verts,faces,mat,bone)


def band(k,name,y,rx,rz,height,mat,bone,tilt=0,x=0,z=0,segments=16):
    verts=[]
    for ring in range(4):
        for i in range(segments):
            a=math.tau*(i+.5)/segments
            inward=.011 if ring>=2 else 0
            xx=math.cos(a)*(rx-inward)
            verts.append((x+xx,y+(-height/2 if ring%2==0 else height/2)+tilt*xx,z+math.sin(a)*(rz-inward)))
    faces=[]
    for i in range(segments):
        j=(i+1)%segments
        faces.extend([(i,j,j+segments,i+segments),(i+segments,j+segments,j+3*segments,i+3*segments),(i+2*segments,j+2*segments,j,i),(i+2*segments,i+3*segments,j+3*segments,j+2*segments)])
    return k.mesh(name,verts,faces,mat,bone)


def stud(k,name,p,r,mat,bone):
    x,y,z=p
    return k.loft(name,[(y-r,.7*r,.45*r,x,z),(y,r,.5*r,x,z),(y+r,.5*r,.3*r,x,z)],mat,bone,8)


def shell_fragment(k,name,c,r,mat,bone,index):
    x,y,z=c;segments=7
    verts=[]
    for ring in range(3):
        for i in range(segments):
            a=math.tau*i/segments
            rr=r*(.55 if ring==0 else 1 if ring==1 else .82)
            yy=y+(-r*.4 if ring==0 else r*(.2+.33*math.sin(i*3.4+index)))
            verts.append((x+math.cos(a)*rr,yy,z+math.sin(a)*rr))
    faces=[]
    for i in range(segments):
        j=(i+1)%segments
        faces.extend([(i,j,j+segments,i+segments),(i+segments,j+segments,j+2*segments,i+2*segments),(i+2*segments,j+2*segments,j,i)])
    return k.mesh(name,verts,faces,mat,bone)


def finger(k,name,a,b,c,r,mat,bone):
    k.beam(name+' proximal',a,b,r,mat,bone,6)
    k.beam(name+' curled',b,c,r*.83,mat,bone,6)
