import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import spec from '../../assets/models/widow-vault/manifest.json' with {type:'json'};
import {worldOf} from './dungeon_gen.js';
import {mineHeight} from './shoulder_working.js';
import {enableSpellBloom} from '../game/vfx/bloom.js';

const url=new URL('../../assets/models/widow-vault/widow-vault.glb',import.meta.url).href;
let cached=null;
function disposeAsset(asset){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    asset.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
    for(const item of [...geometries,...materials,...textures])item.dispose();
}
function acquire(){
    if(!cached){
        const entry={refs:0,asset:null};cached=entry;
        entry.promise=new GLTFLoader().loadAsync(url).then(asset=>{entry.asset=asset;if(entry.refs===0)disposeAsset(asset);return asset;}).catch(error=>{if(cached===entry)cached=null;throw error;});
    }
    const entry=cached;entry.refs++;
    return {promise:entry.promise,release(){entry.refs--;if(entry.refs===0){if(entry.asset)disposeAsset(entry.asset);if(cached===entry)cached=null;}}};
}
export function widowOrigin(L){const r=L.rooms[7],p=worldOf(L,r.cx,r.cz);return {...p,y:mineHeight(p.z)};}
export function inWidowVault(L,x,z,pad=0){
    const p=widowOrigin(L),dx=x-p.x,dz=z-p.z;
    return (dx/(45+pad))**2+(dz/(31+pad))**2<1 || (Math.abs(dx+3)<12+pad&&dz>-46-pad&&dz<-20);
}
function filterGeology(mesh,L){
    const geo=mesh.geometry,position=geo.attributes.position,index=geo.index;
    const keep=[],count=index?index.count:position.count;
    for(let i=0;i<count;i+=3){
        const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
        const x=ids.reduce((s,k)=>s+position.getX(k)/3,0),z=ids.reduce((s,k)=>s+position.getZ(k)/3,0);
        if(!inWidowVault(L,x,z,2))keep.push(...ids);
    }
    geo.setIndex(keep);geo.computeBoundingSphere();
}
function supportPreview(colliders){
    const group=new T.Group(),material=new T.MeshStandardMaterial({color:0x795b3d,roughness:.9});
    const geometries=[];
    for(const c of colliders){
        if(!/mine scaffold deck|mine stair|scaffold landing/.test(c.model))continue;
        let geometry;
        if(c.kind==='ramp'){
            const x=c.w/2,z=c.d/2,d=c.direction;
            const low=-z*d,high=z*d;
            geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([
                -x,0,low,x,0,low,x,c.h,high,-x,0,low,x,c.h,high,-x,c.h,high,
                -x,-.3,low,x,-.3,low,x,c.h-.3,high,-x,-.3,low,x,c.h-.3,high,-x,c.h-.3,high,
            ],3));geometry.computeVertexNormals();
        }else geometry=new T.BoxGeometry(c.w,c.h,c.d);
        const mesh=new T.Mesh(geometry,material);material.side=T.DoubleSide;
        mesh.position.set(c.x,c.y+(c.kind==='ramp'?0:c.h/2),c.z);group.add(mesh);geometries.push(geometry);
    }
    return {group,dispose(){group.removeFromParent();for(const g of geometries)g.dispose();material.dispose();}};
}
export function furnishWidowVault(built,L,{load=null}={}){
    const origin=widowOrigin(L),group=new T.Group();group.name='The widow vault';group.position.set(origin.x,origin.y,origin.z);built.group.add(group);
    const colliders=spec.colliders.map(c=>({...c,x:c.x+origin.x,y:c.y+origin.y,z:c.z+origin.z}));
    built.physicalBodies.push(...colliders);
    const preview=supportPreview(spec.colliders);group.add(preview.group);
    const anchors=spec.anchors.map(a=>({...a,x:a.x+origin.x,y:a.y+origin.y,z:a.z+origin.z}));
    const key=new T.DirectionalLight(0xb2c6e5,2.6),fill=new T.DirectionalLight(0x95b1d8,2),bounce=new T.HemisphereLight(0x8ca7ce,0x6882a6,1.15),grotto=new T.PointLight(0x9abde5,110,40,1.7);
    key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-52,right:52,top:48,bottom:-48,near:.5,far:110});key.shadow.normalBias=.075;key.shadow.bias=-.00015;
    key.position.set(-8,32,18);key.target.position.set(0,8,-8);fill.position.set(26,16,-10);fill.target.position.set(-15,7,0);grotto.position.set(-3,13,-33);group.add(key,key.target,fill,fill.target,bounce,grotto);
    const materials=[],surfaces=[],glows=[],clock={value:0};let loaded=false,disposed=false,cage=null,active=false;
    const lease=load?{promise:Promise.resolve().then(load),release(){}}:globalThis.window?.document?acquire():{promise:Promise.resolve(null),release(){}};
    const ready=lease.promise.then(asset=>{
        if(!asset||disposed)return false;
        const model=asset.scene.clone(true);
        model.traverse(o=>{
            if(!o.isMesh)return;
            o.castShadow=true;o.receiveShadow=true;
            const material=o.material.clone();o.material=material;materials.push(material);
            if(o.name==='ground'||o.name.startsWith('stone_')){material.side=T.DoubleSide;surfaces.push(o);if(material.map){material.bumpMap=material.map;material.bumpScale=.06;}}
            if(o.name==='timber'&&material.map){material.bumpMap=material.map;material.bumpScale=.025;}
            if(material.emissive?.getHex()&&material.emissiveIntensity>0){enableSpellBloom(material);o.renderOrder=20;glows.push({material,base:material.emissiveIntensity});}
            if(o.name==='cage_iron')cage={object:o,x:o.position.x,y:o.position.y,z:o.position.z};
            if(o.name==='water'){
                material.onBeforeCompile=shader=>{shader.uniforms.widowTime=clock;shader.vertexShader='uniform float widowTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y += sin(position.x*1.7+widowTime*.4)*sin(position.z*1.3-widowTime*.3)*.009;');};
                material.customProgramCacheKey=()=> 'widow-water-v1';
            }
        });
        group.add(model);group.updateMatrixWorld(true);
        for(const mesh of [built.parts.ceiling,...built.parts.walls])filterGeology(mesh,L);
        built.mine.addSurfaces(surfaces);
        preview.dispose();loaded=true;return true;
    }).catch(error=>{if(!disposed)console.warn('Widow vault artwork unavailable',error.message);return false;});
    return {group,ready,anchors,colliders,spec,surfaces,get loaded(){return loaded;},get active(){return active;},
        update(time,pos){
            clock.value=time;
            const distance=pos?Math.hypot(pos.x-origin.x,pos.z-origin.z):0;
            const visibility=T.MathUtils.smoothstep(100-distance,0,50);active=visibility>.01;key.intensity=2.6*visibility;fill.intensity=2*visibility;bounce.intensity=1.15*visibility;grotto.intensity=110*visibility;
            for(const [i,g]of glows.entries())g.material.emissiveIntensity=g.base*(.94+.06*Math.sin(time*3.2+i));
            if(cage){cage.object.rotation.y=Math.sin(time*.35)*.017;cage.object.position.y=cage.y+Math.sin(time*.7)*.018;}
        },
        dispose(){if(disposed)return;disposed=true;built.mine.removeSurfaces(surfaces);preview.dispose();for(const m of materials)m.dispose();key.shadow.dispose();group.removeFromParent();lease.release();},
    };
}
