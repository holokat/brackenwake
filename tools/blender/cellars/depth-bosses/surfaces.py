"""Deterministic packed PBR surface maps, generated with Blender's bundled NumPy."""
import bpy,numpy as np
SIZE=512

def smooth_noise(rng,cells):
    grid=rng.random((cells+1,cells+1));points=np.linspace(0,cells,SIZE,endpoint=False);i=points.astype(int);t=points-i;t=t*t*(3-2*t)
    a=grid[i[:,None],i[None,:]];b=grid[i[:,None]+1,i[None,:]];c=grid[i[:,None],i[None,:]+1];d=grid[i[:,None]+1,i[None,:]+1]
    return (a*(1-t[:,None])+b*t[:,None])*(1-t[None,:])+(c*(1-t[:,None])+d*t[:,None])*t[None,:]

def texture(name,slot,color):
    seed=sum(ord(c)*(i+1) for i,c in enumerate(slot));rng=np.random.default_rng(seed)
    broad=smooth_noise(rng,9);med=smooth_noise(rng,38);grain=rng.random((SIZE,SIZE));detail=.50+.31*broad+.23*med+.06*smooth_noise(rng,100)
    yy,xx=np.mgrid[:SIZE,:SIZE]/SIZE
    cloth=slot in ['cloth','cape','parchment','weed','wood']
    # Narrow fracture networks are buried in the stone and bone albedo.
    if slot in ['bone','stone','chitin']:
        cracks=np.ones((SIZE,SIZE))
        for j in range(15):
            path=(j+.5)/15 + .008*np.sin(yy*24+j*5)+.004*np.sin(yy*91+j)
            distance=np.abs(xx-path)
            mask=(distance<.0013)&(med>.4)&(broad>.39)
            cracks[mask]=.26
        detail*=cracks
    if cloth:detail*=.9+.1*np.sin(xx*SIZE*np.pi)*np.cos(yy*SIZE*np.pi)
    rgb=np.array([((color>>shift)&255)/255 for shift in [16,8,0]])
    pixels=rgb[None,None,:]*detail[:,:,None]
    if slot in ['iron','bronze','trim','steel','chitin']:
        patina=np.clip((broad-.54)*2.5,0,.6)[:,:,None]
        rust=np.array([.2,.14,.08]) if slot in ['iron','steel'] else np.array([.105,.18,.15])
        pixels=pixels*(1-patina)+rust*patina
    if slot=='ember':
        fire=np.clip(.3+np.sin(xx*24+med*7)*.35+med*.6,0,1)
        pixels=np.stack([.46+.53*fire,.08+.41*fire,.015+.08*fire],axis=2)
    image=bpy.data.images.new(name+' worn albedo',SIZE,SIZE,alpha=False);data=np.concatenate([np.round(np.clip(pixels,0,1)*63)/63,np.ones((SIZE,SIZE,1))],axis=2).astype(np.float32);image.pixels.foreach_set(data.ravel());image.pack()
    return image

def apply(mat,slot,color):
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    img=nodes.new('ShaderNodeTexImage');img.image=texture(mat.name,slot,color);img.interpolation='Linear';links.new(img.outputs['Color'],bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value=max(.67,bsdf.inputs['Roughness'].default_value)
    bsdf.inputs['Metallic'].default_value=min(.5,bsdf.inputs['Metallic'].default_value)
