import { STORIES } from '../src/farm/stories.js';
import { normalizeStory, applyChoice, durationMs } from '../src/farm/story_engine.js';

// a stand-in Game with the same contract main.js relies on
function mkGame(cap = 200) {
  return {
    coins: 5000, storageCap: cap, inventory: { wood: 300, stone: 300, strawberry: 30, wheat: 60, carrot: 60, watermelon: 10, cake: 5, honey: 5 },
    owned: [], placed: [], plots: [], jobs: {}, stats: {},
    materialCap: { wood: 400, stone: 400 },
    isMaterial: (id) => id === 'wood' || id === 'stone',
    inventoryTotal() { return Object.entries(this.inventory).reduce((a,[k,v]) => a + (this.isMaterial(k)?0:v), 0); },
    capFor(id) { return this.isMaterial(id) ? this.materialCap[id] : this.storageCap; },
    roomFor(id) { const used = this.isMaterial(id) ? (this.inventory[id]||0) : this.inventoryTotal(); return Math.max(0, this.capFor(id)-used); },
    addGood(id, n=1) { const add = Math.max(0, Math.min(n, this.roomFor(id))); if (add>0) this.inventory[id]=(this.inventory[id]||0)+add; return n-add; },
    addCoins(n){ this.coins+=n; }, save(){}, nextTierDef: null,
  };
}

const rows = [];
for (const card of STORIES) {
  for (const ch of card.choices) {
    const g = mkGame();
    const story = normalizeStory(null);
    const before = { coins: g.coins, inv: JSON.stringify(g.inventory), owned: g.owned.length,
      rep: JSON.stringify(story.rep), mods: story.modifiers.length, pledges: story.pledges.length,
      flags: Object.keys(story.flags).length, revisit: Object.keys(story.revisit).length };
    const acts = [];
    applyChoice(card, ch, story, { game: g, refresh(){}, act(n,v){ acts.push(n); } });
    const changed = [];
    if (g.coins !== before.coins) changed.push(`coins ${g.coins - before.coins > 0 ? '+' : ''}${g.coins - before.coins}`);
    if (JSON.stringify(g.inventory) !== before.inv) changed.push('goods');
    if (g.owned.length !== before.owned) changed.push('unlock');
    if (JSON.stringify(story.rep) !== before.rep) changed.push('rep');
    if (story.modifiers.length !== before.mods) changed.push('modifier');
    if (story.pledges.length !== before.pledges) changed.push('pledge');
    if (Object.keys(story.flags).length !== before.flags) changed.push('flag');
    if (Object.keys(story.revisit).length !== before.revisit) changed.push('revisit');
    if (acts.length) changed.push('act:' + acts.join('+'));
    rows.push({ card: card.id, label: ch.label, changed });
  }
}
const silent = rows.filter(r => !r.changed.length);
// a change the PLAYER can see without opening a panel
const visible = (r) => r.changed.some(c => c.startsWith('coins') || c === 'goods' || c === 'unlock' || c.startsWith('act:'));
const invisible = rows.filter(r => r.changed.length && !visible(r));
console.log('choices tested:', rows.length);
console.log('changed nothing at all:', silent.length);
console.log('changed something the player CANNOT see without opening a panel:', invisible.length);
console.log('\n--- nothing at all ---');
silent.forEach(r => console.log('  ', r.card.padEnd(22), r.label));
console.log('\n--- invisible without a confirmation message ---');
invisible.forEach(r => console.log('  ', r.card.padEnd(22), (r.label.slice(0,30)).padEnd(32), r.changed.join(', ')));
