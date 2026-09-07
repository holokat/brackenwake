// The in-game ability sweep. Runs INSIDE the game tab, not under node: paste the
// whole file into the Browser pane's javascript_tool (or the devtools console)
// with a character logged in, then
//
//   await window.__sweep(['fireball', 'rift'], { settle: 5, naked: true, cursor: true })
//
// It is the harness behind docs/mmo/wiring/AB-SWEEP.md. Every read of live
// state goes through window.__bw; items.js and abilities.js are imported again
// only for their pure tables (makeItem, weaponNeeds, ABILITIES).
//
// For each ability: every skill and stat at 100, full pools, the weapon the
// ability wants in the main hand (a kite shield or a lute in the off hand),
// ammo, bandages and reagents in the pack, a bandit at the right range (killed
// by Lightning for a corpse ability, so the monsters system makes a real
// corpse), then the REAL useById through the real targeting, the game stepped
// through the cast and a settle, and a record of what the player would have
// seen: the runtime's answer, every line it said, damage, what was paid, buffs,
// summons, marks, statuses.
//
// opts:
//   settle         seconds after release (default 1.6); dots need 5
//   naked          take the armour off, so leather does not fizzle a sorcerer
//   pack           extra item bases to carry (['woodland_poison'] for Poison Blade)
//   extra          a second bandit beside the first (Provoke, Chain Lightning)
//   cursor         put the mouse over the bandit first, the way a player aims a
//                  ground ability; without it the automation tab's cursor is at
//                  (0,0) and a Rift lands 2.4 m behind you
//   freshCooldowns clear every cooldown first
//   trace          sample the bandit's health every half second
//   shot           stop shotFrames after release, for a screenshot
//
// Gotchas that cost time: bw.recompute(actor) needs its argument (with none it
// returns quietly and the shield you gave is not on the arm); spawnAt is
// positional (id, x, z) and returns a record whose .actor is the target; forward
// is (sin yaw, cos yaw) so yaw PI faces -z.
window.__sweepSetup = async function () {
  const b = window.__bw;
  if (!b || !b.player) throw new Error('no player');
  window.__items = await import('/src/mmo/items.js');
  window.__abil = await import('/src/mmo/abilities.js');
  return true;
};

/** Move the real mouse over a world position and report where the ground point landed, relative to it. */
window.__aimAt = function (p) {
  const b = window.__bw;
  const cam = b.sc.camera;
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  cam.updateMatrixWorld();
  const v = cam.position.clone();
  v.set(p.x, (p.y || 0) + 0.2, p.z);
  v.project(cam);
  const cx = rect.left + (v.x + 1) / 2 * rect.width, cy = rect.top + (1 - v.y) / 2 * rect.height;
  for (const type of ['pointermove', 'mousemove']) canvas.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true }));
  b.step(16.7);
  const g = b.targeting.groundPoint(b.player.pos.y);
  return g ? [Math.round((g.x - p.x) * 10) / 10, Math.round((g.z - p.z) * 10) / 10] : null;
};

window.__sweep = async function (ids, opts = {}) {
  const b = window.__bw;
  const items = window.__items, abil = window.__abil;
  const out = [];
  const nowS = () => b.now / 1000;
  const closeWin = () => { const c = [...document.querySelectorAll('button')].find((x) => /^close$/i.test(x.textContent.trim()) && x.offsetParent); if (c) c.click(); };
  const give = (base, n = 1) => items.makeItem({ base, count: n });
  const packHas = (base) => b.character.pack.items.some((i) => i && i.base === base);
  const ensurePack = (base, n = 1) => { try { if (!packHas(base)) b.inventory.add(give(base, n), { quiet: true }); } catch (e) { /* unknown base */ } };
  const WEAPON_FOR = { swordsmanship: 'longsword', fencing: 'rapier', macefighting: 'mace', polearms: 'halberd', archery: 'longbow', marksmanship: 'crossbow', wrestling: null };
  for (const id of ids) {
    const a = abil.ABILITIES.find((x) => x.id === id);
    const rec = { id };
    if (!a) { rec.error = 'no such ability'; out.push(rec); continue; }
    try {
      closeWin();
      b.targeting.clear(); b.stopAttack && b.stopAttack(); b.monsters.despawnDev && b.monsters.despawnDev();
      if (opts.freshCooldowns) for (const k of Object.keys(b.abilities.cooldowns)) delete b.abilities.cooldowns[k];
      for (const k of Object.keys(b.character.skills)) b.character.skills[k] = 100;
      for (const k of Object.keys(b.character.stats)) b.character.stats[k] = 100;
      b.recompute(b.actor);
      b.actor.health = b.actor.maxHealth; b.actor.mana = b.actor.maxMana; b.actor.stamina = b.actor.maxStamina;
      // the hands
      const needs = abil.weaponNeeds(a);
      const eq = b.character.equipment;
      const skill = (needs.skills || [])[0];
      let want = null;
      if (needs.kind === 'melee') want = WEAPON_FOR[skill] || 'longsword';
      else if (needs.kind === 'anyMelee') want = 'longsword';
      else if (needs.kind === 'ranged') want = WEAPON_FOR[skill] || 'longbow';
      else if (needs.kind === 'focus') want = 'staff';
      else if (needs.kind === 'unarmed') want = null;
      else if (needs.kind === 'instrument') want = 'rapier';
      else if (needs.kind === 'shield') want = 'longsword';
      else want = eq.mainHand ? eq.mainHand.base : null;
      eq.mainHand = want ? give(want) : null;
      eq.offHand = needs.kind === 'shield' ? give('kite') : needs.kind === 'instrument' ? give('lute') : (needs.kind === 'unarmed' || (want && items.twoHanded && items.twoHanded(want))) ? null : eq.offHand;
      for (const ammo of needs.ammo || []) ensurePack(ammo, 40);
      ensurePack('bandage', 5); ensurePack('reagent', 20);
      for (const x of (opts.pack || [])) ensurePack(x, 5);
      if (opts.naked) for (const s of Object.keys(eq)) if (!['mainHand', 'offHand'].includes(s)) eq[s] = null;
      b.recompute(b.actor);
      if (b.player.dress) b.player.dress();
      if (needs.kind === 'shield') rec.shield = b.actor.shield ? b.actor.shield.id : null;
      // where the player stands and looks
      const px = b.player.pos.x, pz = b.player.pos.z;
      b.player.yaw = Math.PI;
      const meleeish = ['melee', 'anyMelee', 'unarmed', 'shield'].includes(needs.kind);
      const dist = a.target === 'enemy' ? (meleeish ? 1.6 : Math.min(10, (a.range || 12) * 0.6)) : a.target === 'ground' ? 4 : 2;
      let mon = null, actor = null, hp0 = 0;
      if (a.target !== 'ally' && !(a.effect && a.effect.kind === 'summon')) {
        mon = b.monsters.spawnAt('bandit', px, pz - dist);
        for (let i = 0; i < 12; i++) b.step(16.7);
        actor = mon && mon.actor;
        if (actor && a.target === 'corpse') {
          b.targeting.set(actor); b.abilities.useById('lightning', nowS(), {});
          for (let i = 0; i < 90; i++) b.step(16.7);
          b.targeting.clear();
        } else if (actor) { if (a.target === 'enemy') b.targeting.set(actor); hp0 = actor.health; }
      }
      if (opts.extra && mon) {
        const m2 = b.monsters.spawnAt('bandit', px + 1.2, pz - dist - 0.8);
        for (let i = 0; i < 6; i++) b.step(16.7);
        rec.extra = m2 && m2.actor ? Math.round(m2.actor.health) : null; window.__m2 = m2;
      }
      if (opts.cursor && actor) rec.aim = window.__aimAt(actor.pos);
      const useOpts = {};
      if (a.target === 'corpse' && actor) useOpts.target = actor;
      if (actor) rec.rel = [Math.round((actor.pos.x - px) * 10) / 10, Math.round((actor.pos.z - pz) * 10) / 10];
      const pools0 = { h: b.actor.health, m: b.actor.mana, s: b.actor.stamina };
      const summons0 = b.summons ? b.summons.length : 0;
      const r = b.abilities.useById(id, nowS(), useOpts);
      rec.ok = !!r.ok; rec.reason = r.reason || null; rec.cast = r.record ? r.record.castTime : null;
      if (r.record && r.record.ground) rec.ground = [Math.round((r.record.ground.x - px) * 10) / 10, Math.round((r.record.ground.z - pz) * 10) / 10];
      const lines = [b.abilities.lastLine || ''];
      const cast = r.record ? r.record.castTime : 0;
      const frames = opts.shot ? Math.ceil(cast * 60) + (opts.shotFrames || 8) : Math.ceil((cast + (opts.settle || 1.6)) * 60);
      let buffsPeak = 0, minMana = b.actor.mana, minStam = b.actor.stamina;
      const hpTrace = [];
      for (let i = 0; i < frames; i++) {
        try { b.step(16.7); } catch (e) { rec.stepError = String(e.message).slice(0, 120); break; }
        const L = b.abilities.lastLine || '';
        if (L !== lines[lines.length - 1]) lines.push(L);
        minMana = Math.min(minMana, b.actor.mana); minStam = Math.min(minStam, b.actor.stamina);
        if (i % 6 === 0) buffsPeak = Math.max(buffsPeak, b.abilities.buffsView(nowS()).length);
        if (opts.trace && actor && i % 30 === 0) hpTrace.push(Math.round(actor.health));
      }
      rec.lines = lines.map((s) => s.slice(0, 110));
      rec.dmg = actor && a.target !== 'corpse' ? Math.round(hp0 - actor.health) : null;
      if (opts.trace) rec.hpTrace = hpTrace;
      rec.paid = [Math.round(pools0.m - minMana), Math.round(pools0.s - minStam), Math.round(b.actor.health - pools0.h)];
      rec.buffs = buffsPeak;
      rec.sum = (b.summons ? b.summons.length : 0) - summons0;
      if (window.__m2 && window.__m2.actor) { rec.extraAfter = Math.round(window.__m2.actor.health); window.__m2 = null; }
      rec.tgt = actor ? [Math.round(actor.health), (actor.marks || []).length, actor.status ? Object.keys(actor.status).join('+') : ''] : null;
    } catch (e) { rec.error = String(e && e.message || e).slice(0, 160); }
    out.push(rec);
  }
  return out;
};
