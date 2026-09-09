"""Finish the GLB with explicit portable PBR colors and loss-bounded normals.

Blender's nested MixRGB graph is retained in the editable scene. glTF cannot
represent that graph; its equivalent is the base color factor times the detail
texture times COLOR_0. Height detail is not a tangent-space normal texture.
"""
import json,struct,math,hashlib


def pack(path,palette):
    source=path.read_bytes();n=struct.unpack_from('<I',source,12)[0]
    doc=json.loads(source[20:20+n]);binary=source[28+n:]
    for material in doc['materials']:
        key=material['name'].split('Widow ',1)[1].split('.')[0]
        color=palette[key][0]
        rgb=[]
        for shift in [16,8,0]:
            v=((color>>shift)&255)/255;rgb.append(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)
        pbr=material['pbrMetallicRoughness'];alpha=pbr.get('baseColorFactor',[1,1,1,1])[3]
        pbr['baseColorFactor']=rgb+[alpha]
        material.pop('normalTexture',None)
        material['doubleSided']=key in ['silk_veil','water','silk_threads','ground','stone_shell']
        material['name']='Widow '+key
    used=set();normal_ids=set();unaltered_ids=set();unaltered={}
    for mesh in doc['meshes']:
        mesh['name']=mesh['name'].split('.')[0]
        for primitive in mesh['primitives']:
            primitive['attributes'].pop('COLOR_1',None) # redundant unused export color
            used.update(primitive['attributes'].values());used.add(primitive['indices'])
            normal_ids.add(primitive['attributes']['NORMAL']);unaltered_ids.update([primitive['attributes']['POSITION'],primitive['indices']])
    chunks=[];views=[];accessors=[];accessor_map={};offset=0;max_error=0;normal_count=0
    def append(data,**extra):
        nonlocal offset
        data+=b'\0'*((-len(data))%4)
        index=len(views);views.append(dict(buffer=0,byteOffset=offset,byteLength=len(data),**extra));chunks.append(data);offset+=len(data)
        return index
    for index in sorted(used):
        a=dict(doc['accessors'][index]);view=doc['bufferViews'][a['bufferView']]
        if a.get('byteOffset',0) or view.get('byteStride'):raise ValueError('Inspect interleaved export before packing')
        data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        extra={k:v for k,v in view.items() if k in ['target']}
        if index in unaltered_ids:unaltered[str(len(accessors))]=hashlib.sha256(data).hexdigest()
        if index in normal_ids:
            if a['componentType']!=5126 or a['type']!='VEC3':raise ValueError('Expected float normals')
            packed=bytearray(a['count']*8)
            for i in range(a['count']):
                values=struct.unpack_from('<3f',data,i*12)
                quant=[round(max(-1,min(1,v))*32767) for v in values]
                struct.pack_into('<3h',packed,i*8,*quant)
                max_error=max(max_error,max(abs(v-q/32767) for v,q in zip(values,quant)))
            data=bytes(packed);a['componentType']=5122;a['normalized']=True;extra['byteStride']=8;normal_count+=a['count']
        a['bufferView']=append(data,**extra);accessor_map[index]=len(accessors);accessors.append(a)
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            p['attributes']={k:accessor_map[v] for k,v in p['attributes'].items()};p['indices']=accessor_map[p['indices']]
    for im in doc.get('images',[]):
        view=doc['bufferViews'][im['bufferView']];start=view.get('byteOffset',0)
        im['bufferView']=append(binary[start:start+view['byteLength']])
    doc['bufferViews']=views;doc['accessors']=accessors;doc['buffers']=[{'byteLength':offset}]
    for key in ['extensionsUsed','extensionsRequired']:
        doc[key]=sorted(set(doc.get(key,[])+['KHR_mesh_quantization']))
    data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4);blob=b''.join(chunks)
    result=struct.pack('<III',0x46546c67,2,28+len(data)+len(blob))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(blob),0x004e4942)+blob
    path.write_bytes(result)
    return {'sourceBytes':len(source),'packedBytes':len(result),'normalVertices':normal_count,'maxNormalComponentError':max_error,'positionsAndIndices':'byte-identical','sourceAccessorHashes':unaltered,'removed':'unused duplicate COLOR_1; height texture normal bindings'}
