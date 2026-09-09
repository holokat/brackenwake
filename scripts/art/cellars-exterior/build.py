"""Build the Old Cellars exterior from the generated concept, in metres, Z up.
The doorway is the origin, facing Blender -Y (glTF +Z). No scene is cleared.
"""
import bpy, bmesh, math, random, time, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/models/cellars/exterior'
NAME = 'Brackenwake Old Cellars exterior'
PREFIX = 'bw_cellars_ext_'
rng = random.Random(419)
parts = []


def linear(hexcode):
    rgb = [int(hexcode[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb)


PALETTE = {k: linear(v) for k, v in {
    'stone': '9c9077', 'light': 'b3a588', 'dark_stone': '6e695a',
    'earth': '62503b', 'grass': '687b36', 'moss': '77843c',
    'wood': '59412a', 'root': '72603e', 'iron': '332d28',
    'red': '74352c', 'gold': 'c49a49', 'black': '171c16', 'amber': 'ffb248',
}.items()}


def material(name, emissive=False):
    m = bpy.data.materials.new(PREFIX+name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    col = m.node_tree.nodes.new('ShaderNodeVertexColor'); col.layer_name = 'Color'
    m.node_tree.links.new(col.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = .91
    if emissive:
        bs.inputs['Emission Color'].default_value = (*PALETTE['amber'], 1)
        bs.inputs['Emission Strength'].default_value = 1.8
    return m


def mesh(name, vertices, faces, shade, bevel=0, glow=False, vary=.075):
    data = bpy.data.meshes.new(PREFIX+name)
    data.from_pydata(vertices, [], faces); data.update()
    if bevel:
        bm = bmesh.new(); bm.from_mesh(data)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES')
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data); bm.free()
    else:
        bm = bmesh.new(); bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data); bm.free()
    data.materials.append(emit_mat if glow else base_mat)
    attr = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    data.color_attributes.active_color = attr
    for polygon in data.polygons:
        color = PALETTE[shade[polygon.index % len(shade)] if isinstance(shade,list) else shade]
        tint = rng.uniform(1-vary,1+vary)
        for li in polygon.loop_indices:
            attr.data[li].color = tuple(min(1,c*tint) for c in color)+(1,)
    obj = bpy.data.objects.new(PREFIX+name, data); collection.objects.link(obj)
    obj['assembly'] = name.split('_')[0]; obj['asset_owner'] = NAME
    parts.append(obj)
    return obj


def box(name, at, size, shade='stone', bevel=.05, angle=0):
    x,y,z = at; w,d,h = [s/2 for s in size]
    vertices = [(a*w,b*d,c*h) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    if shade in ('stone','light','dark_stone') and name.startswith(('jamb','wing','crown')):
        vertices=[tuple(v+rng.uniform(-.028,.028) for v in p) for p in vertices]
    obj=mesh(name,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],shade,bevel)
    obj.location=at; obj.rotation_euler.z=angle
    return obj


def beam(name, a, b, radius, shade='wood', sides=6):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    u=axis.cross(Vector((0,0,1)))
    if u.length < .01: u=axis.cross(Vector((0,1,0)))
    u.normalize(); v=axis.cross(u)
    verts=[tuple(p+radius*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)) for p in (a,b) for i in range(sides)]
    faces=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    return mesh(name,verts,faces,shade, vary=.08)


def wedge(name, a, b, inner, outer, y0, y1, spring, shade='stone'):
    verts=[]
    for y in (y0,y1):
        for r,t in [(inner,a),(outer,a),(outer,b),(inner,b)]:
            verts.append((r*math.cos(t),y,spring+r*math.sin(t)))
    return mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],shade,.035)


def rock(name, at, scale):
    bm=bmesh.new(); bmesh.ops.create_icosphere(bm,subdivisions=1,radius=1)
    verts=[tuple(v.co[i]*scale[i]*rng.uniform(.86,1.14)+at[i] for i in range(3)) for v in bm.verts]
    for i,v in enumerate(bm.verts): v.index=i
    faces=[tuple(v.index for v in f.verts) for f in bm.faces]; bm.free()
    return mesh(name,verts,faces,['stone','dark_stone','stone','light'])


def cloth_marking(name, cloth, polygons):
    """Clip each emblem piece onto each cloth face so it follows the folds."""
    verts=[];faces=[]
    cross=lambda a,b,p:(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    for face in cloth.data.polygons:
        tri=[cloth.data.vertices[i].co.copy() for i in face.vertices]
        edges=[(p.x,p.z) for p in tri]
        sign=1 if cross(edges[0],edges[1],edges[2])>0 else -1
        normal=(tri[1]-tri[0]).cross(tri[2]-tri[0])
        for polygon in polygons:
            clipped=polygon[:]
            for i in range(3):
                a,b=edges[i],edges[(i+1)%3];out=[]
                for j,p in enumerate(clipped):
                    q=clipped[(j+1)%len(clipped)];dp=cross(a,b,p)*sign;dq=cross(a,b,q)*sign
                    if dp>=-1e-9:out.append(p)
                    if (dp>0)!=(dq>0):
                        t=dp/(dp-dq);out.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
                clipped=out
            if len(clipped)<3:continue
            first=len(verts)
            for x,z in clipped:
                y=tri[0].y-(normal.x*(x-tri[0].x)+normal.z*(z-tri[0].z))/normal.y
                verts.append((x,y-.02,z))
            faces.extend((first,first+i,first+i+1) for i in range(1,len(clipped)-1))
    return mesh(name,verts,faces,'gold',vary=0)


def terrain():
    # The front ring has a true arched opening; no mound face crosses the door.
    rings=[(0.32,2.17,2.13),(1.4,2.75,1.35),(3.1,4.0,.28),(5.6,4.6,.08)]
    verts=[]
    for row,(y,rx,base) in enumerate(rings):
        for i in range(13):
            t=i*math.pi/12
            x=rx*math.cos(t)
            z=base+2.13*math.sin(t) if row==0 else base+([0,2.55,3.7,.16][row])*math.sin(t)
            if i not in (0,12): z+=rng.uniform(-.16,.16)
            verts.append((x,y,z))
    faces=[]
    for j in range(3):
        for i in range(12):
            a=j*13+i; b=a+13
            faces.extend([(a,b,b+1),(a,b+1,a+1)])
    mesh('mound_roof',verts,faces,['grass','grass','moss','earth','grass','grass','moss'],vary=.14)
    for sign in (-1,1):
        verts=[]
        for row,(y,rx,base) in enumerate(rings):
            inner=(sign*rx,y,base)
            middle=(sign*(4.0+(.3 if row==1 else .75 if row==3 else 0)),y,.95 if row<3 else .05)
            outer=(sign*(5.0 if row<3 else 4.85),y,-.12)
            verts.extend([inner,middle,outer])
        faces=[]
        for j in range(3):
            for k in range(2):
                a=j*3+k;b=a+3;faces.extend([(a,b,b+1),(a,b+1,a+1)])
        mesh('mound_shoulder_'+str(sign),verts,faces,['grass','earth','grass','moss'],vary=.16)
        # Triangular lips blend into the world at the sides of the entry steps.
        mesh('mound_front_'+str(sign),[(sign*2.17,.32,2.13),(sign*4,.32,.95),(sign*5,.32,-.12),(sign*4.8,-1.65,-.12),(sign*2.2,-1.5,.12)],[(0,1,4),(1,3,4),(1,2,3)],['earth','grass','moss'])


def architecture():
    for s in (-1,1):
        for i in range(4):
            box(f'jamb_{s}_{i}',(s*1.78,-.04,.29+i*.52),(.76,.95,.52),'light' if i%3==0 else 'stone',.055,rng.uniform(-.017,.017))
    for i in range(11):
        a=i*math.pi/11+.009;b=(i+1)*math.pi/11-.009
        wedge(f'arch_{i}',a,b,1.40,2.12+(.18 if i==5 else 0),-.58,.48,2.08,'light' if i==5 else 'stone')
        wedge(f'bank_backing_{i}',i*math.pi/11,(i+1)*math.pi/11,1.67,2.4,.05,.78,2.08,'earth')
    # Inner shell, kept darker toward the rear to read as depth in daylight.
    for j in range(4):
        for s in (-1,1):
            for i in range(4):
                box(f'tunnel_{j}_{s}_{i}',(s*1.65,.96+j*.78,.34+i*.48),(.45,.76,.47),'dark_stone',.02)
        for i in range(9): wedge(f'vault_{j}_{i}',i*math.pi/9+.01,(i+1)*math.pi/9-.01,1.4,1.68,.52+j*.78,1.28+j*.78,2.08,'dark_stone')
    # Steps remain above the uncut outdoor terrain; the actual descent follows E.
    for i in range(4):
        box(f'step_approach_{i}',(0,-1.64+i*.4,.055+i*.04),(2.85,.46,.11+i*.08),'stone',.035)
    for i in range(7):
        box(f'step_inner_{i}',(0,.2+i*.48,.22-i*.028),(2.76,.51,.44-i*.056),'dark_stone',.025)
    box('tunnel_dark_end',(0,3.52,1.55),(2.8,.03,3.1),'black',0)
    for s in (-1,1):
        for row in range(2):
            for i in range(3-row):
                box(f'wing_{s}_{row}_{i}',(s*(2.45+i*.73),-.05+i*.3,.34+row*.62),(.79,.87,.66),'stone',.065,rng.uniform(-.1,.1))
        rock('rubble_front_'+str(s),(s*3.9,-.67,.49),(.85,.76,.85))
        rock('rubble_small_'+str(s),(s*2.47,-1.23,.19),(.38,.42,.35))
    roof=next(o for o in parts if o.name==PREFIX+'mound_roof')
    surface=BVHTree.FromPolygons([v.co for v in roof.data.vertices],[p.vertices[:] for p in roof.data.polygons])
    for i in range(8):
        x=-2.8+i*.78;y=2.65+rng.uniform(-.18,.18)
        at,normal,index,distance=surface.ray_cast(Vector((x,y,12)),Vector((0,0,-1)))
        if at is None: raise RuntimeError('Crown stone has no turf support')
        support=[surface.ray_cast(Vector((x+dx,y+dy,12)),Vector((0,0,-1)))[0] for dx in (-.4,.4) for dy in (-.3,.3)]
        z=min(p.z for p in support if p is not None)+.26
        box('crown_'+str(i),(x,y,z),(.83,.63,.66),'stone',.08,rng.uniform(-.12,.12))
        if i==2:box('crown_remnant',(x,y,z+.57),(.75,.6,.68),'stone',.075,.035)


def dressing():
    for s in (-1,1):
        x=s*1.97
        box('bracket_back_'+str(s),(x,-.62,2.11),(.22,.18,.78),'wood',.025)
        beam('bracket_arm_'+str(s),(x,-.56,2.42),(x,-1.06,2.42),.095)
        beam('bracket_strut_'+str(s),(x,-.61,1.87),(x,-1,2.38),.062)
        beam('lantern_hanger_'+str(s),(x,-1.06,2.4),(x,-1.06,2.22),.027,'iron')
        z=1.9;y=-1.06
        box('lantern_base_'+str(s),(x,y,z-.24),(.36,.32,.1),'iron',.03)
        box('lantern_roof_'+str(s),(x,y,z+.3),(.42,.38,.12),'iron',.04)
        for a in (-1,1):
            for b in (-1,1): beam(f'lantern_post_{s}_{a}_{b}',(x+a*.14,y+b*.12,z-.2),(x+a*.14,y+b*.12,z+.26),.025,'iron',4)
        o=box('lantern_glass_'+str(s),(x,y,z),(.22,.19,.39),'amber',.01)
        o.data.materials.clear();o.data.materials.append(emit_mat)
    for branch,path in enumerate([
        [(-3.12,1.75,2.65),(-2.8,.6,2.42),(-2.5,-.18,1.83),(-2.65,-.65,.68),(-3.1,-1,.17)],
        [(-3.65,2.25,2.3),(-3.32,.7,1.75),(-3.6,-.05,.75),(-4.2,-.38,.23)],
        [(-2.8,.6,2.42),(-3.28,.3,1.5),(-3.2,-.63,.65)],
    ]):
        for i in range(len(path)-1): beam(f'root_{branch}_{i}',path[i],path[i+1],.15-i*.018,'root',6)
    # Low-poly hanging cloth, one sided geometry gets actual thickness.
    beam('banner_pole',(-3.7,1.4,-.1),(-4,1.4,4.95),.095,'wood')
    beam('banner_crossbar',(-4.42,1.4,4.57),(-3.1,1.4,4.67),.067,'wood')
    vertices=[(-3.99,1.32,4.5),(-3.1,1.34,4.58),(-3.06,1.18,3.48),(-3.24,1.12,2.88),(-3.43,1.17,3.1),(-3.62,1.28,2.85),(-3.92,1.32,3.03)]
    cloth=mesh('banner_cloth',vertices,[(0,1,2),(0,2,6),(6,2,4),(2,3,4),(4,5,6)],'red')
    solid=cloth.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.025;solid.offset=0
    # Two broad angular stripes on the front, geometrically painted on the cloth.
    for i in range(2):
        z=3.72-i*.32
        stripe=[(-3.85,1.1,z-.12),(-3.56,1.1,z+.15),(-3.18,1.1,z-.04),(-3.18,1.1,z-.2),(-3.56,1.1,z-.01),(-3.85,1.1,z-.28)]
        cloth_marking('banner_chevron_'+str(i),cloth,[[(stripe[n][0],stripe[n][2]) for n in ids] for ids in [(0,1,4,5),(1,2,3,4)]])
    for i in range(23):
        s=-1 if i%2 else 1;x=s*rng.uniform(2.3,4.75);y=rng.uniform(-1.6,1.0)
        for blade in range(3):
            a=blade*2.1+rng.random();h=rng.uniform(.2,.43);w=.08
            mesh(f'grass_{i}_{blade}',[(x-w,y,.04),(x+w,y,.04),(x+math.cos(a)*.16,y+math.sin(a)*.16,h)],[(0,1,2)],'grass')


def merged_export(scene):
    export=bpy.data.scenes.new(NAME+' export'); ec=bpy.data.collections.new(PREFIX+'export');export.collection.children.link(ec)
    deps=scene.view_layers[0].depsgraph
    for mat in (base_mat,emit_mat):
        verts=[];faces=[];colors=[]
        for obj in parts:
            if obj.data.materials[0] != mat: continue
            evaluated=obj.evaluated_get(deps);data=evaluated.to_mesh();offset=len(verts)
            verts.extend(tuple(obj.matrix_world@v.co) for v in data.vertices)
            color=data.color_attributes.get('Color')
            for p in data.polygons:
                faces.append(tuple(offset+i for i in p.vertices))
                colors.extend(tuple(color.data[li].color) for li in p.loop_indices)
            evaluated.to_mesh_clear()
        data=bpy.data.meshes.new(mat.name+'_merged');data.from_pydata(verts,[],faces);data.materials.append(mat)
        attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');data.color_attributes.active_color=attr
        for i,col in enumerate(colors):attr.data[i].color=col
        obj=bpy.data.objects.new(mat.name+'_merged',data);ec.objects.link(obj)
    return export


def stage(scene):
    world=bpy.data.worlds.new(PREFIX+'world');world.use_nodes=True;scene.world=world
    world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.23,.15,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.65
    ground_mesh=bpy.data.meshes.new(PREFIX+'display_ground')
    ground_mesh.from_pydata([(-100,-100,-.13),(100,-100,-.13),(100,100,-.13),(-100,100,-.13)],[],[(0,1,2,3)])
    ground_mat=bpy.data.materials.new(PREFIX+'display_ground');ground_mat.diffuse_color=(*linear('48553a'),1)
    ground_mat.use_nodes=True;ground_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=ground_mat.diffuse_color
    ground_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1
    ground_mesh.materials.append(ground_mat);ground=bpy.data.objects.new(PREFIX+'display_ground',ground_mesh);scene.collection.objects.link(ground)
    for name,at,power,size in [('key',(-4,-7,12),1900,8),('fill',(6,-1,8),1100,7),('rim',(0,8,10),1900,6)]:
        data=bpy.data.lights.new(PREFIX+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        o=bpy.data.objects.new(PREFIX+name,data);scene.collection.objects.link(o);o.location=at;o.rotation_euler=(Vector((0,1,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(PREFIX+'camera');camera=bpy.data.objects.new(PREFIX+'camera',data);scene.collection.objects.link(camera)
    camera.location=(10,-15,10);camera.rotation_euler=(Vector((0,1.1,1.8))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=14.6;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.use_stamp=False;scene.render.use_stamp_filename=False
    scene.render.film_transparent=False;scene.view_settings.view_transform='AgX'


def build():
    global collection,base_mat,emit_mat
    started=time.perf_counter(); original=bpy.context.window.scene
    existing=bpy.data.scenes.get(NAME)
    if existing:
        # Revisions replace only this asset's owned data, after visual inspection.
        if original.name.startswith(NAME): raise RuntimeError('Return to the original scene before rebuilding')
        for o in list(bpy.data.objects):
            if o.name.startswith(PREFIX):bpy.data.objects.remove(o,do_unlink=True)
        for s in list(bpy.data.scenes):
            if s.name.startswith(NAME):bpy.data.scenes.remove(s)
        for c in list(bpy.data.collections):
            if c.name.startswith(PREFIX):bpy.data.collections.remove(c)
    scene=bpy.data.scenes.new(NAME);collection=bpy.data.collections.new(PREFIX+'editable');scene.collection.children.link(collection)
    base_mat=material('matte');emit_mat=material('lantern',True)
    terrain();architecture();dressing()
    bpy.context.window.scene=scene;scene.view_layers[0].update()
    construction=time.perf_counter()-started
    stage(scene);scene.view_layers[0].update()
    export=merged_export(scene);bpy.context.window.scene=export
    export_path=ROOT/'public/models/props/old_cellars_entrance.glb'
    bpy.ops.export_scene.gltf(filepath=str(export_path),export_format='GLB',use_active_scene=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=False,export_apply=True)
    bpy.context.window.scene=scene
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.data.libraries.write(str(OUT/'old-cellars-entrance.blend'),{scene},fake_user=True,compress=True)
    corners=[o.matrix_world@v.co for o in parts for v in o.data.vertices]
    report={'sourceObjects':len(parts),'sourceTriangles':sum(len(p.vertices)-2 for o in parts for p in o.data.polygons),'materials':2,
      'boundsZUp':[[min(v[i] for v in corners) for i in range(3)],[max(v[i] for v in corners) for i in range(3)]],
      'constructionSeconds':round(construction,3),'exportBytes':export_path.stat().st_size,
      'blender':bpy.app.version_string}
    evidence={'originalScene':original.name,'originalFile':bpy.data.filepath,'originalObjects':len(original.objects)}
    (ROOT/'.unlazy/cellars-entrance/work/scene-preservation.json').write_text(json.dumps(evidence,indent=2)+'\n')
    (OUT/'model.json').write_text(json.dumps(report,indent=2)+'\n')
    bpy.context.window.scene=original
    return {'scene':scene.name,'report':report,'secondsThroughSave':round(time.perf_counter()-started,3)}

if __name__=='__main__': result=build()
