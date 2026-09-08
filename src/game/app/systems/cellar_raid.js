import * as T from 'three';
import { preloadVharos } from '../../cellar_blender_boss.js';
import { spawnMonster } from '../../actor.js';
import { RAID } from '../../../mmo/cellar_raid_rules.js';
import { createRaidView } from '../../cellar_raid_view.js';
import { applyRaidReward } from '../../cellar_rewards.js';
export const cellar_raid = {
  name: 'cellar_raid', deps: ['world', 'player', 'combat', 'abilities', 'inventory', 'net'],
  create(ctx) {
    const runtime = ctx.get('world').runtime, net = ctx.get('net'), player = ctx.get('player'), fight = ctx.get('combat'), abilities = ctx.get('abilities');
    let snapshot = null, actor = null, model = null, active = false, seq = Date.now() * 10, unregister = null, offset = 0, lastAttackEvent = '', lastDepth = 0;
    const damageEvents = new Set();
    let preloaded = false;
    const releaseEffects = ctx.sc?.addEffectSource?.(() => runtime.inDungeon && runtime.dungeonLayout()?.siteId === 'oldcellars');
    const now = () => Date.now() + offset;
    function toggle() { if (!actor || snapshot?.status !== 'fighting' || !net.connected)
      return; active = !active; if (active)
      fight.targeting.set(actor, 'click'); }
    const view = typeof document !== 'undefined' ? createRaidView(ctx.sc.scene, ctx.hudRoot || document.body, toggle) : null;
    function clear() { if (actor && fight.targeting.current === actor)
      fight.targeting.clear(); unregister?.(); unregister = null; actor = null; model = null; active = false; }
    const off = net.onMessage(msg => {
      if (msg.t === 'raid') {
        snapshot = msg;
        offset = msg.now - Date.now();
        seq = Math.max(seq, msg.now * 10);
        if (msg.status !== 'fighting')
          active = false;
      }
      if (msg.t === 'raidDamage' && net.layer() === RAID.layer && !damageEvents.has(msg.event)) {
        damageEvents.add(msg.event);
        if (damageEvents.size > 200)
          damageEvents.delete(damageEvents.values().next().value);
        fight.combat.hurt(player.actor, msg.damage, { now: ctx.frame.now, kind: 'damage' });
        abilities.effects.burst?.(player.rig.pos, 0xffa96b, 2);
        ctx.hud.toast(msg.name + ' hits you.', 'bad');
      }
      if (msg.t === 'raidReward') {
        const result = applyRaidReward(ctx.state, msg, net.instance());
        if (result.complete)
          net.send({ t: 'raidAck', run: msg.run });
        if (result.changed)
          ctx.hud.toast(result.complete ? 'Vharos’s vault: 2,500 gold and 36 starfall ore.' : 'Some ore remains unclaimed. Make room in your pack.', 'good');
      }
    });
    return { toggle, get actor() { return actor; },
      step(frame) {
        const raid = runtime.dungeonScene?.raid, layout = runtime.inDungeon ? runtime.dungeonLayout() : null;
        if (layout?.siteId === 'oldcellars' && layout.level >= 7 && !preloaded && typeof window !== 'undefined') {
          preloaded = true;
          preloadVharos().catch(() => { preloaded = false; });
        }
        if (layout?.siteId === 'oldcellars' && layout.level !== lastDepth) {
          lastDepth = layout.level;
          ctx.hud.toast(`Depth ${layout.level} of 8: ${layout.name}.`, 'ability');
        }
        else if (!layout)
          lastDepth = 0;
        if (!raid) {
          if (actor)
            clear();
          view?.update(snapshot, { visible: false });
          return;
        }
        if (raid.model !== model) {
          clear();
          model = raid.model;
          actor = spawnMonster('ironGolem', { x: RAID.x, y: 0, z: RAID.z });
          actor.id = 'raid:sepulcher';
          actor.name = RAID.name;
          actor.radius = 12;
          actor.height = 38;
          actor.maxHealth = RAID.maxHealth;
          actor.health = RAID.maxHealth;
          actor.tier = 6;
          actor.externalHealth = true;
          actor.model = model.group;
          actor.resists = {};
          actor.ar = 35;
          actor.damageReceiver = (damage, { attacker, kind } = {}) => { if (attacker !== player.actor || snapshot?.status !== 'fighting' || !net.connected)
            return; net.send({ t: 'raidStrike', run: snapshot.run, seq: ++seq, kind, damage }); };
          unregister = fight.monsters.registerExternalTarget(actor);
        }
        actor.health = snapshot?.hp ?? RAID.maxHealth;
        actor.dead = snapshot?.status === 'defeated';
        actor.godMode = snapshot?.status !== 'fighting';
        model.setDead(actor.dead);
        if (snapshot?.status !== 'fighting')
          model.cancelAttack?.();
        else
          model.setAttack?.(snapshot?.attack, now());
        model.update(frame.dt, snapshot?.phase || 1, !!snapshot?.attack);
        if (snapshot?.attack && snapshot.attack.event !== lastAttackEvent) {
          lastAttackEvent = snapshot.attack.event;
          ctx.hud.toast(snapshot.attack.warning, 'bad');
        }
        if (active && player.actor.health > 0 && net.connected && snapshot?.status === 'fighting') {
          fight.swingAt(actor, frame.now, frame.nowS, true);
        }
        const visible = Math.hypot(player.rig.pos.x - RAID.x, player.rig.pos.z - RAID.z) < RAID.radius + 10;
        view?.update(snapshot, { visible, connected: net.connected, attacking: active, now: now() });
      },
      click(ray) { if (!actor || !model || ctx.input.click?.button === 2)
        return false; const hit = ray.intersectObject(model.hit, false)[0]; if (!hit) {
        active = false;
        return false;
      } fight.targeting.set(actor, 'click'); if (ctx.get('abilities').abilities.pending)
        return ctx.get('abilities').abilities.onTargetPicked(actor, ctx.frame.nowS); if (ctx.input.dblclick)
        toggle(); return true; },
      dispose() { releaseEffects?.(); off(); clear(); view?.dispose(); },
    };
  }, update(ctx, frame) { ctx.get('cellar_raid').step(frame); }, click(ctx, ray) { return ctx.get('cellar_raid').click(ray); }, dispose(ctx) { ctx.get('cellar_raid').dispose(); },
};
