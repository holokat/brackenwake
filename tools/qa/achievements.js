// Real game boot. Test data stays in memory; the player's saved characters are never read.
const memory = new Map();
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key), clear: () => memory.clear(), key: index => [...memory.keys()][index] ?? null, get length() { return memory.size; } };
Object.defineProperty(window, 'localStorage', {value: storage});
Object.defineProperty(window, 'sessionStorage', {value: storage});
const report = document.querySelector('#report');
const lines = [];
function write(value) { lines.push(typeof value === 'string' ? value : JSON.stringify(value)); report.textContent = lines.join('\n'); }
window.addEventListener('error', e => write(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', e => write(`Rejection: ${e.reason}`));
const wait = (fn, timeout = 60000) => new Promise((resolve, reject) => {
  const start = performance.now();
  const check = () => fn() ? resolve() : performance.now() - start > timeout ? reject(Error('Playtest timed out')) : requestAnimationFrame(check);
  check();
});
await import('/src/game/main.js');
await wait(() => window.__bw?.creating);
const name = document.querySelector('input[placeholder="a name"]');
name.value = 'Achievement playtest'; name.dispatchEvent(new Event('input', {bubbles: true}));
[...document.querySelectorAll('button')].find(button => /create character/i.test(button.textContent)).click();
await wait(() => window.__bw?.openAchievements);
const b = window.__bw;
await b.runtime.ready;
b.openAchievements();
write({storage: 'Temporary memory only', achievements: document.querySelectorAll('.bw-achievement').length, tab: !!document.querySelector('[data-tab="achievements"]')});
document.querySelector('#book').onclick = () => b.openAchievements();
document.querySelector('#hide').onclick = () => document.querySelector('#qa').style.display = 'none';
document.querySelector('#recall').onclick = async event => {
  event.currentTarget.disabled = true;
  try {
    b.windows.closeAll();
    b.runtime.enterDungeon({id: 's:island_cellars', sub: 'oldcellars', kind: 'dungeon', x: 120, z: -110, cx: 0, cz: 0, name: 'The Old Cellars'});
    await b.runtime.dungeonScene.ready;
    write({beforeRecall: {inDungeon: b.runtime.inDungeon, position: {...b.player.pos}}});
    const result = b.abilities.useById('recall', performance.now() / 1000);
    write({castAccepted: result.ok, castTime: result.record?.castTime});
    if (!result.ok) throw Error(result.reason || 'Recall was refused');
    await wait(() => !b.runtime.inDungeon, 12000);
    write({afterRecall: {inDungeon: b.runtime.inDungeon, position: {...b.player.pos}}, savedPosition: b.state.pos});
    document.querySelector('#recall').textContent = 'Recall tested';
  } catch (error) { write(`Recall test failed: ${error.message}`); }
};
