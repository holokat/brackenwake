import * as T from 'three';
import { createRaidImpacts } from './cellar_raid_effects.js';
import { RAID } from '../mmo/cellar_raid_rules.js';
export function createRaidView(scene, root, onAttack) {
    const impacts = createRaidImpacts(scene);
    let pending = null;
    const group = new T.Group();
    group.name = 'Cellar raid warnings';
    scene.add(group);
    let event = null;
    const panel = document.createElement('section');
    panel.className = 'cellar-raid-panel';
    panel.hidden = true;
    const style = document.createElement('style');
    style.textContent = `.cellar-raid-panel{position:absolute;top:108px;left:50%;transform:translateX(-50%);width:min(480px,calc(100% - 40px));box-sizing:border-box;padding:14px 18px;color:#eee3ca;background:linear-gradient(120deg,#101623ed,#251e29e8);border:1px solid #ad8a5759;box-shadow:0 10px 40px #0008;border-radius:6px;font:14px Georgia,serif;text-align:center;z-index:22;pointer-events:auto}.cellar-raid-panel[hidden]{display:none}.cellar-raid-panel strong{display:block;font-size:19px;font-weight:500;margin-bottom:8px}.cellar-raid-panel progress{width:100%;height:7px;accent-color:#dbae67}.cellar-raid-panel p{line-height:1.4;margin:10px 0;font-variant-numeric:tabular-nums}.cellar-raid-panel button{min-height:40px;padding:8px 22px;color:#f5dfaa;background:#4b3424;border:1px solid #ae8753;border-radius:4px;cursor:pointer;transition:transform 120ms,background 120ms}.cellar-raid-panel button:hover:not(:disabled){background:#62462e}.cellar-raid-panel button:focus-visible{outline:2px solid #ffe2a0;outline-offset:3px}.cellar-raid-panel button:active{transform:scale(.96)}.cellar-raid-panel button:disabled{opacity:.45;cursor:default}@media(max-height:580px){.cellar-raid-panel{top:56px;padding:8px 12px;width:min(380px,calc(100% - 24px))}.cellar-raid-panel strong{font-size:16px}.cellar-raid-panel p{margin:5px 0}}`;
    const name = document.createElement('strong');
    name.textContent = RAID.name;
    const health = document.createElement('progress');
    health.max = RAID.maxHealth;
    health.value = RAID.maxHealth;
    health.setAttribute('aria-label', 'Shared boss health');
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'off');
    const button = document.createElement('button');
    button.textContent = 'Attack';
    button.onclick = onAttack;
    panel.append(name, health, message, button);
    root.append(style, panel);
    const clear = () => { for (const o of [...group.children]) {
        o.geometry.dispose();
        o.material.dispose();
        group.remove(o);
    } };
    function draw(attack) {
        if ((attack?.event || null) === event)
            return;
        clear();
        event = attack?.event || null;
        if (!attack)
            return;
        const mat = () => new T.MeshBasicMaterial({ color: attack.color, transparent: true, opacity: .24, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
        const add = (geo, x, z) => { const mesh = new T.Mesh(geo, mat()); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .14, z); group.add(mesh); };
        if (attack.shape === 'circle')
            add(new T.CircleGeometry(attack.radius, 64), RAID.x, RAID.z);
        if (attack.shape === 'outside')
            add(new T.RingGeometry(attack.radius, RAID.radius, 64), RAID.x, RAID.z);
        if (attack.shape === 'cross') {
            add(new T.PlaneGeometry(attack.width, RAID.radius * 2), RAID.x, RAID.z);
            add(new T.PlaneGeometry(RAID.radius * 2, attack.width), RAID.x, RAID.z);
        }
        if (attack.shape === 'marks')
            for (const [x, z] of attack.marks)
                add(new T.CircleGeometry(attack.radius, 32), x, z);
    }
    return { update(snapshot, { visible, connected, attacking, now }) {
            panel.hidden = !visible;
            group.visible = visible;
            const fighting = visible && snapshot?.status === 'fighting';
            if (!fighting) {
                pending = null;
                impacts.reset();
                draw(null);
            }
            impacts.prepare(fighting ? snapshot.attack : null, now);
            if (pending && now >= pending.landAt) {
                impacts.trigger(pending, now);
                pending = null;
            }
            impacts.update(now, visible);
            if (!visible)
                return;
            health.value = snapshot?.hp ?? RAID.maxHealth;
            button.disabled = !connected || snapshot?.status !== 'fighting';
            button.textContent = attacking ? 'Stop attacking' : 'Attack';
            const text = !connected ? 'Connect online and gather ten players to awaken the cathedral.' : snapshot?.status === 'defeated' ? 'Vharos has fallen. The vault is silent.' : snapshot?.attack ? `${snapshot.attack.warning} ${Math.max(0, (snapshot.attack.landAt - now) / 1000).toFixed(1)}s` : snapshot?.status === 'fighting' ? `Phase ${snapshot.phase} · ${Math.ceil(snapshot.hp).toLocaleString()} health · ${snapshot.players} adventurers` : `${snapshot?.players || 0} of ${RAID.minPlayers} adventurers gathered. Ten living players must remain in the arena.`;
            if (message.textContent !== text)
                message.textContent = text;
            if (fighting && snapshot?.attack)
                pending = snapshot.attack;
            draw(fighting ? snapshot.attack : null);
            for (const o of group.children)
                o.material.opacity = .19 + Math.sin(now * .007) * .08;
        }, dispose() { impacts.dispose(); clear(); group.removeFromParent(); panel.remove(); style.remove(); } };
}
