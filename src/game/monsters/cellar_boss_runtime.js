import { getCellarBoss } from '../../mmo/cellar_bosses.js';
import { createCellarBossState, resetCellarBoss, stepCellarBoss, cellarShapeContains } from '../cellar_boss_combat.js';
import { createCellarBossTelegraphs } from './cellar_boss_telegraphs.js';

/** Thin production adapter; health, death, loot and save slots stay in their existing owners. */
export function createCellarBossRuntime({ group, combat, say, spawn, despawn, live, heightAt, clampXZ, stats, cap, stepToward, speedOf }) {
  const owned = new Map();
  const entries = mon => {
    let entry = owned.get(mon.key);
    if (!entry) {
      const state = createCellarBossState(mon.id);
      if (!state) return null;
      entry = { state, visuals: createCellarBossTelegraphs(group), hitAt: 0 };
      owned.set(mon.key, entry);
      mon.cellarCombat = state;
      // Home stays fixed for authored arena lanes and leash resets.
      mon.actor.ai.home = { ...mon.actor.ai.home, y: mon.actor.pos.y };
    }
    return entry;
  };
  const clearBrood = mon => {
    for (const child of [...live.values()]) if (child.rec.cellarSummoner === mon.key) despawn(child.key);
  };
  const summon = (mon, mark, target) => {
    const def = getCellarBoss(mon.id), brood = def.summon;
    if (!brood || live.size >= cap) return;
    if ([...live.values()].filter(m => m.rec.cellarSummoner === mon.key).length >= brood.cap) return;
    const [x, z] = clampXZ(mark.shape.x, mark.shape.z);
    const child = spawn({ id: mark.summon, key: `${mon.key}:summon:${mark.id}`, groupKey: `${mon.key}:summon`,
      x, z, y: heightAt(x, z), ephemeral: true, underground: true, cellarSummoner: mon.key, noLoot: true });
    if (child) {
      child.actor.ai.target = target; child.actor.ai.state = 'chase';
      stats.summoned++;
    }
  };
  return {
    step(mon, dt, now, player, allies = []) {
      const def = getCellarBoss(mon.id);
      if (!def) return false;
      const entry = entries(mon), a = mon.actor;
      const candidates = [player, ...allies].filter(who => who && who.health > 0 && who.pos && who !== a);
      // Direct retaliation retains a living player or player-owned ally. Never acquire a hostile summon.
      const target = candidates.includes(a.ai.target) ? a.ai.target : candidates[0] || null;
      const events = stepCellarBoss(entry.state, { now, actor: a, target });
      const struck = new Map();
      for (const event of events) {
        if (event.type === 'engage') {
          a.ai.target = target; a.ai.state = 'attack';
        } else if (event.type === 'phase') {
          mon.phase = event.phase; stats.phases++; say(event.line, 'bad');
        } else if (event.type === 'attack') {
          a.yaw = event.yaw; mon.model.setAnim('cast');
          say(`${event.spec.name}: ${event.spec.cue}`, 'bad');
        } else if (event.type === 'telegraph') {
          entry.visuals.add(event.mark); stats.marks++;
        } else if (event.type === 'impact' || event.type === 'cancel') {
          const mark = event.mark;
          entry.visuals.remove(mark, event.type === 'impact', now);
          if (event.type !== 'impact') continue;
          mon.model.setAnim(mark.animation); entry.hitAt = now + 500;
          let hit = false;
          const impactKey = `${mark.attackId}:${mark.impactAt}`;
          const already = struck.get(impactKey) || new Set();
          struck.set(impactKey, already);
          // Simultaneous crossing regions form one impact, including their intersection.
          for (const who of new Set(candidates)) {
            if (already.has(who) || !cellarShapeContains(mark.shape, who.pos)) continue;
            already.add(who);
            const result = combat?.queueSpell?.(a, {
              id: mark.attackId, name: mark.name, damageType: mark.damageType,
              base: mon.row.damage.map(v => Math.max(1, Math.round(v * mark.damageScale))),
            }, who, { now, travel: 0 });
            hit ||= !!result?.queued;
          }
          if (mark.summon) summon(mon, mark, target);
          if (hit) say(`${mark.name} catches you.`, 'bad');
        } else if (event.type === 'reset') {
          entry.visuals.clear(); clearBrood(mon); combat?.forget?.(a);
          a.ai.target = null; a.ai.state = 'idle'; a.ai.leashSince = null;
          a.health = a.maxHealth; a.status = {}; a.dots = [];
          Object.assign(a.pos, a.ai.home); mon.phase = 0; mon.lastHealth = a.health;
          entry.hitAt = 0;
          say(`${mon.name} settles back into the chamber. The fight resets.`);
        }
      }
      // Attacks lock their facing at wind-up. Recovery offers a clear opening.
      if (entry.state.active) {
        a.ai.target = target; a.ai.state = entry.state.attack ? 'attack' : 'chase';
        if (!entry.state.attack && target) a.yaw = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
      }
      let moved = 0;
      // Move only between casts, keeping every warned region fixed. Reuse the
      // ordinary collision and crowd-control path so bosses cannot cross walls.
      if (entry.state.active && !entry.state.attack && target && stepToward
          && Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z) > 8) {
        const step = stepToward(a.pos, target.pos, speedOf(a, now), dt, heightAt, clampXZ);
        moved = step.moved; Object.assign(a.pos, { x: step.x, y: step.y, z: step.z });
      }
      if (a.anim === 'hurt') { mon.model.setAnim('hurt'); a.anim = 'idle'; }
      else if (entry.hitAt <= now) mon.model.setAnim(entry.state.attack ? 'cast' : moved > 0 ? 'run' : 'idle');
      mon.lastSpeed = dt > 0 ? moved / dt : 0;
      mon.model.group.position.set(a.pos.x, a.pos.y, a.pos.z);
      mon.model.group.rotation.y = a.yaw || 0;
      mon.model.update(dt, mon.lastSpeed); entry.visuals.update(now);
      return true;
    },
    clear(mon) {
      const entry = owned.get(mon.key);
      if (!entry) return;
      entry.visuals.clear(); resetCellarBoss(entry.state); owned.delete(mon.key);
      clearBrood(mon);
    },
    warnings(now) {
      return [...owned.values()].flatMap(({ state }) => state.pending.map(mark => ({
        id: mark.id, kind: mark.attackId, shape: mark.shape, x: mark.shape.x, z: mark.shape.z,
        radius: mark.shape.radius, left: Math.max(0, (mark.impactAt - now) / 1000),
      })));
    },
  };
}
