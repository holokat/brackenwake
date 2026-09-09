// Use the actual initial HTML, CSS and watchdog. The game entry is omitted so
// visual review can linger on this screen without opening any character saves.
const frame = document.querySelector('iframe');
const response = await fetch('/index.html');
if (!response.ok) throw Error(`Could not load game HTML: ${response.status}`);
const page = new DOMParser().parseFromString(await response.text(), 'text/html');
const livePage = page.cloneNode(true);
const memory = livePage.createElement('script');
memory.textContent = `
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
  Object.defineProperty(window, 'localStorage', { value: storage });
  Object.defineProperty(window, 'sessionStorage', { value: storage });
`;
livePage.body.prepend(memory);
const liveSource = '<!doctype html>\n' + livePage.documentElement.outerHTML;
page.querySelectorAll('script[type="module"], link[rel="modulepreload"]').forEach(node => node.remove());
const game = page.querySelector('#game');
game.innerHTML = '<p style="padding:40px;color:#e8d9b5;font:18px Georgia">Loading screen dismissed. Use Restart to preview again.</p>';
const source = '<!doctype html>\n' + page.documentElement.outerHTML;
frame.srcdoc = source;
document.querySelector('nav').addEventListener('click', event => {
  const phase = event.target.dataset.phase;
  if (!phase) return;
  if (phase === 'restart') { frame.srcdoc = source; return; }
  if (phase === 'game') { frame.srcdoc = liveSource; return; }
  if (phase === 'narrow') {
    frame.style.width = frame.style.width ? '' : '390px';
    frame.style.height = frame.style.width ? 'min(844px, 100%)' : '';
    frame.style.left = frame.style.width ? 'calc(50% - 195px)' : '';
    return;
  }
  if (phase === 'hide') { document.querySelector('nav').hidden = true; return; }
  frame.contentWindow.dispatchEvent(new frame.contentWindow.CustomEvent('brackenwake:boot', {
    detail: { phase, error: phase === 'failed' ? 'Preview: terrain could not be loaded.' : undefined },
  }));
});
