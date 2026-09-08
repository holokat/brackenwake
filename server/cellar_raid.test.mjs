import assert from 'node:assert/strict';
import { createRoomLogic } from './room_logic.mjs';
import { RAID, RAID_ATTACKS, attackHits } from '../src/mmo/cellar_raid_rules.js';
import { createCellarRaid } from './cellar_raid.mjs';
let clock = 100000;
Date.now = () => clock;
const room = createRoomLogic();
const state = (i, layer = RAID.layer, hp = 200) => ({ t: 'state', layer, p: [RAID.x + 12, 0, RAID.z + i * .1], hp, mhp: 200, mp: 100, mmp: 100, st: 100, mst: 100, yaw: 0, sp: 0 });
for (let i = 0; i < 9; i++) {
    room.join('c' + i, { id: 'p' + i, name: 'Test ' + i });
    room.handle('c' + i, state(i));
}
clock += 1001;
room.sweep(clock);
assert.equal(room.saveRaid().status, 'sealed');
room.join('c9', { id: 'p9', name: 'Test 9' });
room.handle('c9', state(9, 'oldcellars:7'));
clock += 1001;
room.sweep(clock);
assert.equal(room.saveRaid().status, 'sealed', 'wrong floor cannot count');
room.handle('c9', state(9, RAID.layer, 0));
clock += 1001;
room.sweep(clock);
assert.equal(room.saveRaid().status, 'sealed', 'dead players cannot count');
for (let i = 0; i < 10; i++)
    room.handle('c' + i, state(i));
clock += 1001;
room.sweep(clock);
assert.equal(room.saveRaid().status, 'fighting');
const run = room.saveRaid().run;
const hit = { t: 'raidStrike', run, seq: 1, kind: 'melee', damage: 999999 };
room.handle('c0', hit);
assert.equal(room.saveRaid().hp, RAID.maxHealth - 350, 'damage bounded');
room.handle('c0', hit);
assert.equal(room.saveRaid().hp, RAID.maxHealth - 350, 'replay refused');
room.handle('c0', { ...hit, seq: 2 });
assert.equal(room.saveRaid().hp, RAID.maxHealth - 350, 'burst refused');
room.handle('c1', { ...hit, damage: NaN });
assert.equal(room.saveRaid().hp, RAID.maxHealth - 350, 'invalid damage refused');
room.handle('c1', state(1, 'world'));
room.handle('c1', { ...hit, seq: 3 });
assert.equal(room.saveRaid().hp, RAID.maxHealth - 350, 'wrong layer hit refused');
clock += 1001;
for (let i = 0; i < 10; i++)
    room.handle('c' + i, state(i));
room.sweep(clock);
const persisted = room.saveRaid(), recovered = createCellarRaid(persisted);
assert.equal(recovered.save().hp, persisted.hp);
const crowd = room.players().map(p => ({ ...p, seenAt: clock }));
clock = persisted.nextAttack + 1;
crowd.forEach(p => p.seenAt = clock);
let packets = recovered.tick(crowd, clock, true);
assert(recovered.save().attack);
const attack = recovered.save().attack;
clock = attack.landAt + 1;
crowd.forEach(p => p.seenAt = clock);
packets = recovered.tick(crowd, clock, true);
assert.equal(packets.filter(p => p.msg?.t === 'raidDamage').length, 10);
assert.equal(recovered.tick(crowd, clock + 1, true).filter(p => p.msg?.t === 'raidDamage').length, 0, 'hazard lands once');
for (const a of RAID_ATTACKS) {
    const attack = { ...a, marks: [[RAID.x, RAID.z]] };
    const inside = [RAID.x, 0, RAID.z], outside = [RAID.x + 50, 0, RAID.z + 40];
    assert.equal(attackHits(attack, inside), a.shape !== 'outside');
    assert.equal(attackHits(attack, outside), a.shape === 'outside');
}
// Ten actual room seats contribute to one health pool, all the way to defeat.
for (let round = 2; room.saveRaid().hp > 0; round++) {
    clock += 800;
    for (let i = 0; i < 10; i++) {
        room.handle('c' + i, state(i));
        packets = room.handle('c' + i, { ...hit, seq: round, damage: 350 });
    }
    if (round > 1000)
        throw Error('raid did not finish');
}
assert.equal(room.saveRaid().status, 'defeated');
assert.equal(Object.keys(room.saveRaid().contributors).length, 10);
clock += 1001;
const rewards = room.sweep(clock).to.filter(x => x.msg.t === 'raidReward');
assert.equal(rewards.length, 10);
for (let i = 0; i < 10; i++)
    room.handle('c' + i, { t: 'raidAck', run });
clock += 1001;
assert.equal(room.sweep(clock).to.filter(x => x.msg.t === 'raidReward').length, 0);
const sealed = createCellarRaid();
const nine = crowd.slice(0, 9);
assert.equal(sealed.strike(nine[0], hit, nine, clock).length, 0);
console.log('Raid passed: ten seats, floor/life gates, shared health, bounds, cooldown, replay, persistence, four hazard shapes, one death, ten rewards, acknowledgement.');
