// Marketing descriptions match the four openings in src/mmo/openings.js.
// This preview deliberately owns no character save or game state.
export const CHARACTERS = Object.freeze({
  ranger: { name: 'Ranger', traits: 'Archery · Tracking · Foraging', skills: ['archery', 'tracking', 'foraging'], description: 'Keeps the distance and knows what is in the trees before it moves.' },
  warrior: { name: 'Warrior', traits: 'Swordsmanship · Parrying · Healing', skills: ['swordsmanship', 'parrying', 'healing'], description: 'Takes the hits. A sword, a shield, and enough anatomy to close a wound.' },
  wizard: { name: 'Wizard', traits: 'Magery · Meditation · Mysticism', skills: ['magery', 'meditation', 'mysticism'], description: 'Fire, cold and lightning at range, and nothing at all to take a hit with.' },
  rogue: { name: 'Rogue', traits: 'Stealth · Hiding · Lockpicking', skills: ['stealth', 'hiding', 'lockpicking'], description: 'Opens what is shut and is behind you when it matters.' },
});

export function nextTabIndex(index, key, count) {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + count - 1) % count;
  return index;
}

export function mountCharacters(section, signal) {
  const tabs = [...section.querySelectorAll('[role="tab"]')];
  const portraits = [...section.querySelectorAll('[data-portrait]')];
  const panel = section.querySelector('[role="tabpanel"]');

  function select(tab) {
    const id = tab.dataset.character;
    const character = CHARACTERS[id];
    if (!character) return;
    section.dataset.character = id;
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    }
    for (const portrait of portraits) portrait.classList.toggle('is-selected', portrait.dataset.portrait === id);
    section.querySelector('#character-name').textContent = character.name;
    section.querySelector('#character-description').textContent = character.description;
    section.querySelector('#character-traits').textContent = character.traits;
    section.querySelector('.character-echo').textContent = character.name;
    panel.setAttribute('aria-labelledby', tab.id);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab), { signal });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[nextTabIndex(index, event.key, tabs.length)];
      select(next);
      next.focus();
    }, { signal });
  });
}
