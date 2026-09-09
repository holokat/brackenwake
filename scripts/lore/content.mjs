import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REALMS } from '../../src/mmo/realms.js';

export const ORIGIN = 'https://brackenwake.com';
export const REPOSITORY = 'https://github.com/holokat/brackenwake';
export const WORLD_SOURCE = `${REPOSITORY}/blob/main/src/mmo/realms.js`;
export const STORY_SOURCE = `${REPOSITORY}/blob/main/docs/mmo/14-KALDERA.md`;
export const DEVELOPMENT_NOTE = 'World lore and story plans. Some places, characters and events are still in development.';

function between(source, start, end) {
  const at = source.indexOf(start);
  assert(at !== -1, `Lore source is missing ${start}`);
  const to = source.indexOf(end, at + start.length);
  assert(to !== -1, `Lore source is missing ${end}`);
  return source.slice(at + start.length, to).replace(/\n---\s*$/, '').trim();
}

/** Read only the current canon. The older three story books are superseded. */
export function readLore() {
  const source = readFileSync(new URL('../../docs/mmo/14-KALDERA.md', import.meta.url), 'utf8');
  const chapters = between(source, '## 5. The nine realms', '## 6. For the cinematics');
  const sections = [...chapters.matchAll(/^### (\d+)\. (.+)\n([\s\S]*?)(?=^### \d+\. |$(?![\s\S]))/gm)];
  assert.equal(sections.length, REALMS.length, 'Every realm needs its current story chapter');
  const realms = REALMS.map((realm, index) => {
    const section = sections[index];
    assert.equal(section[2].trim(), realm.name, 'Realm geography and story order must agree');
    const blocks = [...section[3].matchAll(/^\*\*(.+?)\.\*\*\s*([\s\S]*?)(?=^\*\*.+?\.\*\*|$(?![\s\S]))/gm)]
      .map(([, title, body]) => ({ title, body: body.replace(/\n---\s*$/, '').trim() }));
    assert(blocks.some(block => block.title === 'The cast'), `${realm.name} needs its cast`);
    assert(blocks.some(block => block.title === 'The story here'), `${realm.name} needs its story`);
    return { ...realm, chapter: index + 1, story: blocks };
  });
  return {
    realms,
    places: realms.flatMap(realm => realm.places.map(place => ({ ...place, realmId: realm.id, realmName: realm.name }))),
    premise: between(source, '## 1. The pitch', '## 2. Who you are, and who rides with you'),
    dragon: between(source, '**The dragon.**', 'It has four ages'),
    bond: between(source, '**The Bond**', '## 3. Wyrmsoul'),
    wyrmsoul: between(source, '## 3. Wyrmsoul', '### The rules, exactly'),
  };
}

export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function inline(text) {
  return escapeHtml(text.replace(/\s*\n\s*/g, ' '))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
}

/** The selected story excerpts contain paragraphs and lists, not arbitrary HTML. */
export function storyHtml(text) {
  assert(!/^#{1,6} |^```|^\|/m.test(text), 'New story formatting needs an explicit renderer');
  return text.split(/\n\s*\n/).filter(Boolean).map(block => {
    if (/^- /m.test(block)) {
      const items = block.split(/^- /m).filter(Boolean);
      return `<ul>${items.map(item => `<li>${inline(item.trim())}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(block)}</p>`;
  }).join('\n');
}
