import { RAID, RAID_ATTACKS, inRaid, attackHits } from '../src/mmo/cellar_raid_rules.js';
const fresh = () => ({ version: 1, revision: 0, run: 0, hp: RAID.maxHealth, status: 'sealed', phase: 1, attack: null, nextAttack: 0, sequence: 0, lastActive: 0, contributors: {}, claimed: {}, lastStrikes: {} });
export function createCellarRaid(saved) {
    let s = saved?.version === 1 ? { ...fresh(), ...saved } : fresh(), lastTick = 0, lastCrowd = 0;
    const eligible = (players, now) => players.filter(p => inRaid(p.state) && now - p.seenAt < 5000);
    const packet = (players, now) => ({ t: 'raid', id: RAID.id, run: s.run, revision: s.revision, hp: s.hp, maxHealth: RAID.maxHealth, status: s.status, phase: s.phase, attack: s.attack, players: eligible(players, now).length, required: RAID.minPlayers, now });
    function tick(players, now, force = false) {
        if (!force && now - lastTick < 1000)
            return [];
        lastTick = now;
        const crowd = eligible(players, now), out = [];
        if (s.status === 'sealed' && crowd.length < RAID.minPlayers) {
            if (crowd.length === lastCrowd)
                return [];
            lastCrowd = crowd.length;
            return [{ broadcast: packet(players, now) }];
        }
        if (s.status === 'defeated') {
            if (!crowd.length && now - s.lastActive > RAID.resetMs) {
                s = { ...fresh(), run: s.run, revision: s.revision + 1 };
            }
            else {
                const out = [{ broadcast: packet(players, now) }];
                for (const p of crowd)
                    if (s.contributors['p:' + p.pid] && !s.claimed['p:' + p.pid])
                        out.push({ to: p.connId, msg: { t: 'raidReward', run: s.run, gold: 2500, base: 'starfall_ore', count: 36 } });
                return out;
            }
        }
        if (crowd.length >= RAID.minPlayers) {
            s.lastActive = now;
            if (s.status === 'sealed') {
                s.status = 'fighting';
                s.run++;
                s.nextAttack = now + 4500;
            }
            if (s.status === 'shielded')
                s.status = 'fighting';
        }
        else if (s.status === 'fighting') {
            s.status = 'shielded';
            s.attack = null;
        }
        if (['fighting', 'shielded'].includes(s.status) && now - s.lastActive > RAID.resetMs) {
            s = { ...fresh(), run: s.run, revision: s.revision + 1 };
        }
        if (s.status === 'fighting') {
            if (s.attack && now >= s.attack.landAt) {
                for (const p of crowd)
                    if (attackHits(s.attack, p.state.p))
                        out.push({ to: p.connId, msg: { t: 'raidDamage', run: s.run, event: s.attack.event, damage: s.attack.damage, name: s.attack.name } });
                s.attack = null;
                s.nextAttack = now + Math.max(1800, 3900 - s.phase * 650);
            }
            if (!s.attack && now >= s.nextAttack) {
                const spec = RAID_ATTACKS[s.sequence % RAID_ATTACKS.length];
                s.sequence++;
                s.attack = { ...spec, event: s.run + ':' + s.sequence, landAt: now + spec.windup, marks: spec.shape === 'marks' ? crowd.slice(0, 8).map(p => [p.state.p[0], p.state.p[2]]) : [] };
            }
        }
        s.revision++;
        out.unshift({ broadcast: packet(players, now) });
        return out;
    }
    return {
        tick, packet,
        strike(player, msg, players, now) {
            if (s.status !== 'fighting' || eligible(players, now).length < RAID.minPlayers || !inRaid(player?.state))
                return [];
            if (msg.run !== s.run || !Number.isSafeInteger(msg.seq) || msg.seq < 0)
                return [];
            const old = s.lastStrikes['p:' + player.pid];
            if (old && (msg.seq <= old.seq || now - old.at < 700))
                return [];
            const range = msg.kind === 'spell' ? 48 : 18;
            if (Math.hypot(player.state.p[0] - RAID.x, player.state.p[2] - RAID.z) > range)
                return [];
            // Client combat resolves gear and skills; the room bounds claimed damage,
            // reach, cadence and sequence and owns shared health and completion.
            const amount = Number(msg.damage);
            if (!Number.isFinite(amount) || amount <= 0)
                return [];
            const damage = Math.min(350, Math.round(amount));
            s.lastStrikes['p:' + player.pid] = { seq: msg.seq, at: now };
            s.contributors['p:' + player.pid] = true;
            s.hp = Math.max(0, s.hp - damage);
            s.phase = s.hp > RAID.maxHealth * .66 ? 1 : s.hp > RAID.maxHealth * .33 ? 2 : 3;
            s.revision++;
            const out = [];
            if (!s.hp) {
                s.status = 'defeated';
                s.attack = null;
                s.lastActive = now;
                for (const p of eligible(players, now))
                    if (s.contributors['p:' + p.pid])
                        out.push({ to: p.connId, msg: { t: 'raidReward', run: s.run, gold: 2500, base: 'starfall_ore', count: 36 } });
            }
            out.unshift({ broadcast: packet(players, now) });
            return out;
        },
        ack(pid, run) { if (run === s.run && s.status === 'defeated' && s.contributors['p:' + pid] && !s.claimed['p:' + pid]) {
            s.claimed['p:' + pid] = true;
            s.revision++;
        } },
        save: () => structuredClone(s),
        restore(raw) { if (raw?.version === 1)
            s = { ...fresh(), ...raw }; },
        get active() { return s.status === 'fighting' || s.status === 'shielded'; },
        get revision() { return s.revision; },
    };
}
