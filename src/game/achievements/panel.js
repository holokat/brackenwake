import { ACHIEVEMENTS } from './catalog.js';
import { achievementState, achievementPerks } from './progress.js';
import { ISLAND_LANDMARKS } from './locations.js';
import { ACHIEVEMENT_CSS } from './styles.js';

const CATEGORIES = ['All', 'Progression', 'Combat', 'Gathering', 'Crafting', 'Exploration', 'Community'];
const METRICS = { ownAxeWood: 'Wood with your axe', ownPickMining: 'Stone or ore with your pickaxe', smithCrafts: 'Smithing crafts',
  smithRecipes: 'Smithing recipes', craftedAxe: 'Axe', craftedPickaxe: 'Pickaxe', craftedBow: 'Bow', arrows: 'Arrows', completed: 'Achievements', categories: 'Categories' };
const sheets = ['haven-achievements-01-20-v1.png', 'haven-achievements-21-40-v1.png'];
function element(tag, className, text) {
  const el = document.createElement(tag); el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
export function achievementCompletion(row, doc) {
  return row.requirements.reduce((sum, r) => sum + Math.min(1, (doc.metrics[r.metric] || 0) / r.target), 0) / row.requirements.length;
}
export function achievementIcon(number) {
  const icon = element('span', 'bw-achievement-icon');
  const index = (number - 1) % 20;
  icon.setAttribute('aria-hidden', 'true');
  icon.style.backgroundImage = `url('/icons/achievements/${sheets[Math.floor((number - 1) / 20)]}')`;
  icon.style.backgroundPosition = `${index % 5 * 25}% ${Math.floor(index / 5) * 100 / 3}%`;
  return icon;
}
export const panel = {
  id: 'achievements', title: 'Achievements', key: 'j',
  build(root, ctx) {
    if (!document.getElementById('bw-achievement-css')) {
      const style = element('style', ''); style.id = 'bw-achievement-css'; style.textContent = ACHIEVEMENT_CSS; document.head.appendChild(style);
    }
    this.root = root; this.ctx = ctx; this.category = 'all';
    root.classList.add('bw-achievements');
    this.summary = element('header', 'bw-achievement-summary');
    this.filters = element('nav', 'bw-achievement-filters');
    this.filters.setAttribute('aria-label', 'Achievement categories');
    for (const name of CATEGORIES) {
      const button = element('button', '', name); button.type = 'button'; button.dataset.category = name.toLowerCase();
      button.addEventListener('click', () => { this.category = name.toLowerCase(); this.render(); });
      this.filters.appendChild(button);
    }
    this.list = element('div', 'bw-achievement-list');
    root.append(this.summary, this.filters, this.list);
  },
  open(ctx) {
    this.ctx = ctx;
    this.off?.();
    this.off = ctx.state?.onChange?.((state, what) => { if (what === 'achievements') this.render(); });
    this.render();
  },
  close() { this.off?.(); this.off = null; },
  render() {
    if (!this.root) return;
    const character = this.ctx.character;
    const doc = achievementState(character);
    const earned = ACHIEVEMENTS.filter(row => doc.earned[row.id]).length;
    const perks = achievementPerks(character);
    this.summary.textContent = '';
    this.summary.append(element('h2', '', 'Achievements'), element('p', 'bw-achievement-count', `${earned} of ${ACHIEVEMENTS.length} earned`));
    const title = element('label', 'bw-achievement-title', 'Displayed title');
    const select = element('select', ''); select.setAttribute('aria-label', 'Displayed achievement title');
    const standard = element('option', '', 'Use skill title'); standard.value = ''; select.appendChild(standard);
    for (const row of ACHIEVEMENTS) if (doc.earned[row.id]) { const option = element('option', '', row.title); option.value = row.id; select.appendChild(option); }
    select.value = doc.title || '';
    select.addEventListener('change', () => {
      this.ctx.achievements?.selectTitle(select.value || null);
      this.summary.querySelector('select')?.focus();
    });
    title.appendChild(select); this.summary.appendChild(title);
    this.summary.appendChild(element('p', 'bw-achievement-note', 'Progress is saved with this character. Earned perks stay active when you change titles.'));
    const rewards = [];
    if (perks.capacity) rewards.push(`+${perks.capacity} carrying capacity`);
    if (perks.quality) rewards.push(`+${perks.quality.toFixed(2)} crafting quality`);
    if (perks.constitution) rewards.push(`+${perks.constitution} Constitution`);
    if (perks.wisdom) rewards.push(`+${perks.wisdom} Wisdom, +10% skill-gain chance`);
    if (rewards.length) this.summary.appendChild(element('p', 'bw-achievement-perks', rewards.join(' · ')));
    for (const button of this.filters.children) button.setAttribute('aria-pressed', String(button.dataset.category === this.category));
    this.list.textContent = '';
    for (const row of ACHIEVEMENTS) {
      if (this.category !== 'all' && this.category !== row.category) continue;
      const done = !!doc.earned[row.id];
      const card = element('article', `bw-achievement${done ? ' earned' : ''}`);
      card.appendChild(achievementIcon(row.number));
      const body = element('div', 'bw-achievement-body');
      body.append(element('h3', '', row.name), element('p', '', row.description));
      const progress = element('progress', ''); progress.max = 1; progress.value = achievementCompletion(row, doc); progress.setAttribute('aria-label', row.name);
      body.appendChild(progress);
      body.appendChild(element('p', 'bw-achievement-progress', done ? 'Earned' : row.requirements.map(r => `${METRICS[r.metric] ? METRICS[r.metric] + ': ' : ''}${Math.min(r.target, doc.metrics[r.metric] || 0)} / ${r.target}`).join(' · ')));
      body.appendChild(element('p', 'bw-achievement-reward', `Title: ${row.title}${row.reward ? `. ${row.reward.description}` : ''}`));
      if (done) {
        const button = element('button', 'bw-achievement-equip', doc.title === row.id ? 'Title selected' : 'Use title'); button.type = 'button'; button.disabled = doc.title === row.id;
        button.addEventListener('click', () => {
          this.ctx.achievements?.selectTitle(row.id);
          this.summary.querySelector('select')?.focus();
        }); body.appendChild(button);
      }
      if (row.number === 33) {
        const details = element('details', 'bw-achievement-checklist'); details.appendChild(element('summary', '', 'Island checklist'));
        for (const place of ISLAND_LANDMARKS) details.appendChild(element('p', '', `${doc.distinct.landmarks?.includes(place.id) ? '✓' : '○'} ${place.name}`));
        body.appendChild(details);
      }
      card.appendChild(body); this.list.appendChild(card);
    }
  },
};
