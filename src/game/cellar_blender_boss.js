import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { enableSpellBloom } from './vfx/bloom.js';
const assetUrl = new URL('../../assets/models/cellars/vharos.glb', import.meta.url).href;
let assetPromise = null;
export function preloadVharos() {
    if (!assetPromise)
        assetPromise = new GLTFLoader().loadAsync(assetUrl).catch(error => { assetPromise = null; throw error; });
    return assetPromise;
}
/** Stable synchronous boss contract, with the Blender rig swapped in after loading. */
export function createBlenderVharos(fallback, { load = preloadVharos } = {}) {
    const group = new T.Group();
    group.name = 'Vharos, the buried cathedral';
    group.add(fallback.group);
    const hit = new T.Mesh(new T.CylinderGeometry(12, 12, 38, 12), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = 19;
    group.add(hit);
    let disposed = false, loaded = false, dead = false, time = 0, deathTime = 0, mixer = null, current = null, event = null, model = null;
    const materials = [], actions = new Map(), emission = [];
    const light = new T.PointLight(0xffa543, 40, 24, 1.5);
    light.position.set(0, 25, 4);
    group.add(light);
    function play(name, offset = 0) {
        const next = actions.get(name);
        if (!next)
            return;
        if (current !== next) {
            next.reset().setEffectiveWeight(1).play();
            if (current)
                next.crossFadeFrom(current, .22, false);
            current = next;
        }
        next.time = offset;
    }
    const ready = (typeof window !== 'undefined' || load !== preloadVharos ? load() : Promise.resolve(null)).then(gltf => {
        if (disposed || !gltf)
            return false;
        model = cloneRig(gltf.scene);
        model.name = 'Vharos Blender rig';
        model.traverse(o => {
            if (!o.isMesh)
                return;
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
            const owned = o.material.clone();
            materials.push(owned);
            o.material = owned;
            if (owned.emissive?.getHex() !== 0 && owned.emissiveIntensity > 0) {
                owned.emissiveIntensity *= .4;
                enableSpellBloom(owned);
                emission.push({ material: owned, base: owned.emissiveIntensity });
            }
        });
        mixer = new T.AnimationMixer(model);
        for (const clip of gltf.animations) {
            const action = mixer.clipAction(clip);
            action.setLoop(clip.name === 'idle' ? T.LoopRepeat : T.LoopOnce, clip.name === 'idle' ? Infinity : 1);
            action.clampWhenFinished = true;
            actions.set(clip.name, action);
        }
        mixer.addEventListener('finished', ({ action }) => { if (!dead && action === current) {
            event = null;
            play('idle');
        } });
        group.add(model);
        fallback.dispose();
        loaded = true;
        play(dead ? 'die' : 'idle');
        return true;
    }).catch(error => { if (!disposed)
        console.warn('Vharos model could not load', error.message); return false; });
    return { group, hit, ready, height: 38, radius: 12, get loaded() { return loaded; },
        setDead(value) { if (value === dead)
            return; dead = value; deathTime = 0; event = null; if (loaded)
            play(value ? 'die' : 'idle');
        else
            fallback.setDead(value); },
        cancelAttack() { event = null; if (loaded && !dead)
            play('idle'); },
        get animation() { return current?.getClip().name ?? 'loading'; },
        setAttack(attack, now) {
            if (!loaded || dead || !attack)
                return;
            const name = attack.id.toLowerCase();
            if (!actions.has(name))
                return;
            const offset = Math.max(0, (now - (attack.landAt - attack.windup)) / 1000);
            if (event !== attack.event) {
                event = attack.event;
                play(name, offset);
            }
            else if (current === actions.get(name))
                current.time = offset;
        },
        update(dt, phase = 1, attacking = false) {
            const step = Math.max(0, Math.min(.1, dt));
            time += step;
            if (dead)
                deathTime += step;
            if (loaded)
                mixer.update(step);
            else
                fallback.update(step, phase, attacking);
            const strength = dead ? Math.max(0, 1 - deathTime / 3) : 1 + Math.sin(time * 3) * .09 + (phase - 1) * .08;
            for (const e of emission)
                e.material.emissiveIntensity = e.base * strength;
            light.intensity = 40 * strength;
        },
        dispose() { if (disposed)
            return; disposed = true; if (!loaded)
            fallback.dispose(); if (mixer) {
            mixer.stopAllAction();
            mixer.uncacheRoot(model);
        } for (const m of materials)
            m.dispose(); hit.geometry.dispose(); hit.material.dispose(); light.dispose(); group.removeFromParent(); },
    };
}
