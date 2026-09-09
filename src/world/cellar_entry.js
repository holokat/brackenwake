import {cutCellarGeology} from './cellar_mesh_cut.js';
import {createCellarLoadingGeometry} from './cellar_loading_geometry.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import manifest from '../../assets/models/cellars/entry/manifest.json' with {type:'json'};
import {CELLAR_ENTRY_PLAN as plan, hasCellarEntry, inEntryRegion} from './cellar_entry_layout.js';
import {enableSpellBloom} from '../game/vfx/bloom.js';

const url=new URL('../../assets/models/cellars/entry/cellar-entry.glb',import.meta.url).href;
let cache=null;
function acquire(){
    if(!cache){const entry={refs:0,asset:null};cache=entry;
        entry.promise=new GLTFLoader().loadAsync(url).then(a=>{entry.asset=a;return a;}).catch(e=>{if(cache===entry)cache=null;throw e;});}
    const entry=cache;entry.refs++;
    return{promise:entry.promise,release(){entry.refs--;if(entry.refs===0){entry.promise.then(a=>{
        if(entry.refs)return;const geos=new Set(),mats=new Set(),textures=new Set();
        a.scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of [].concat(o.material||[])){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
        for(const v of [...geos,...mats,...textures])v.dispose();if(cache===entry)cache=null;
    }).catch(()=>{});}}};
}
function clearLegacy(built,L){
    cutCellarGeology(built,(x,z)=>inEntryRegion(L,x,z,1.5));
    for(const o of built.group.children)if(o.userData.exit==='up'&&!built.exits.includes(o))o.visible=false;
}
export function furnishCellarEntry(built,L,{load=null}={}){
    if(!hasCellarEntry(L))return null;
    const group=new T.Group();group.name='Blender: Arrival cellar and broken nave';group.position.set(plan.origin.x,plan.origin.y,plan.origin.z);built.group.add(group);
    built.physicalBodies.push(...manifest.colliders.map(c=>({...c,x:c.x+plan.origin.x,y:c.y+plan.origin.y,z:c.z+plan.origin.z})));
    const proxy=createCellarLoadingGeometry(manifest.colliders);group.add(proxy.group);
    const clock={value:0},mats=[],glows=[];let disposed=false,loaded=false,active=false;
    const lease=load?{promise:load(),release(){}}:typeof window!=='undefined'&&window.document?acquire():{promise:Promise.resolve(null),release(){}};
    const ready=lease.promise.then(asset=>{
        if(!asset||disposed)return false;
        const model=asset.scene.clone(true);
        model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;const m=o.material.clone();o.material=m;mats.push(m);
            // The fixed architectural shadow maps contain only static masonry
            // and furnishings, so moving actors never leave frozen silhouettes.
            if(m.name!=='Cellar cloth')o.layers.enable(3);
            if(m.emissiveIntensity>0&&m.emissive.getHex()){enableSpellBloom(m);glows.push({m,base:m.emissiveIntensity});}
            if(m.name==='Cellar cloth'){
                m.onBeforeCompile=s=>{s.uniforms.entryTime=clock;s.vertexShader='uniform float entryTime;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.z += sin(position.y*.8 + position.x + entryTime*.7)*.055*clamp((12.0-position.y)/6.0,0.0,1.0);');};
                m.customProgramCacheKey=()=> 'cellar-entry-cloth-v1';
            }
        });
        group.add(model);proxy.dispose();clearLegacy(built,L);for(const light of lights)light.shadow.needsUpdate=true;loaded=true;return true;
    }).catch(error=>{if(!disposed)console.warn('Cellar entry artwork could not load:',error.message);return false;});
    const anchors=manifest.anchors.map(a=>({...a,x:a.x+plan.origin.x,y:a.y+plan.origin.y,z:a.z+plan.origin.z}));
    // Fixed shadow lights expose the masonry relief; flames use the existing pool.
    const lights=[];
    for(const [x,y,z,power,range]of[[-15,5,3,70,38],[15,5,-12,65,36],[-18,4,-54,110,46],[18,5,-87,115,50]]){
        const l=new T.PointLight(0xffb564,power,range,1.4);l.position.set(x,y,z);l.castShadow=true;l.visible=false;l.shadow.mapSize.set(512,512);l.shadow.bias=-.0005;l.shadow.normalBias=.035;l.shadow.camera.near=.2;l.shadow.camera.layers.set(3);l.shadow.autoUpdate=false;l.shadow.needsUpdate=true;group.add(l);lights.push(l);
    }
    return{group,ready,anchors,get loaded(){return loaded;},get active(){return active;},
        update(time,pos){clock.value=time;active=loaded&&(!pos||inEntryRegion(L,pos.x,pos.z,25));for(const l of lights)l.visible=active;for(const {m,base}of glows)m.emissiveIntensity=base*(.96+Math.sin(time*3.2)*.04);},
        dispose(){if(disposed)return;disposed=true;group.removeFromParent();proxy.dispose();for(const l of lights){l.shadow.map?.dispose();l.dispose();}for(const m of mats)m.dispose();lease.release();},
    };
}
