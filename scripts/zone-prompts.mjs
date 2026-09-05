// Assemble every final image prompt from docs/mmo/21-ZONE-PROMPTS.md.
//   node scripts/zone-prompts.mjs
// Writes docs/concepts/prompts.json (an array of { file, kind, realm, id, prompt })
// and docs/concepts/prompts.txt (the same, one block each, in the order to run
// them: each realm's wide shot, then its places). The book is the source; this
// only joins the pieces, so a prompt is never retyped and never drifts.
import fs from 'node:fs';
const md = fs.readFileSync('docs/mmo/21-ZONE-PROMPTS.md', 'utf8');
const quote = (block) => block.split('\n').filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '')).join(' ').replace(/\s+/g, ' ').trim();
const section = (title) => { const i = md.indexOf(title); if (i < 0) throw new Error(`no section ${title}`); const j = md.indexOf('\n### ', i + title.length); const k = md.indexOf('\n## ', i + title.length); const end = Math.min(...[j, k].filter((x) => x > 0)); return md.slice(i, end > 0 ? end : undefined); };
const WIDE = quote(section('### WIDE prefix'));
const PLACE = quote(section('### PLACE prefix'));
const tagsBlock = section('### Realm tags for place prompts');
const TAGS = {};
for (const m of tagsBlock.matchAll(/^- ([^:]+): "([^"]+)"/gm)) TAGS[m[1].trim()] = m[2];
const REALM_KEY = { 'The Greenwold': 'greenwold', 'Verdant Deep': 'verdant', 'The Saltmarch and the Thousand Isles': 'saltmarch', 'Ember Wastes': 'emberwastes', 'The Stormpeaks': 'stormpeaks', 'The Boneyard': 'boneyard', 'Frostreach': 'frostreach', 'The Sunken Kingdom': 'sunkenkingdom', 'The Ashen Throne': 'ashenthrone' };
const TAG_KEY = { greenwold: 'Greenwold', verdant: 'Verdant Deep', saltmarch: 'Saltmarch', emberwastes: 'Ember Wastes', stormpeaks: 'Stormpeaks', boneyard: 'Boneyard', frostreach: 'Frostreach', sunkenkingdom: 'Sunken Kingdom', ashenthrone: 'Ashen Throne' };
const out = [];
const realms = md.split(/\n## \d\. /).slice(1);
for (const r of realms) {
  const name = r.slice(0, r.indexOf(' (')).trim();
  const realm = REALM_KEY[name]; if (!realm) throw new Error(`unknown realm heading ${name}`);
  const para = quote(r.slice(r.indexOf('**REALM paragraph'), r.indexOf('**Wide shot')));
  const wideEnd = r.indexOf('\n**', r.indexOf('**Wide shot') + 12);
  const wide = quote(r.slice(r.indexOf('**Wide shot'), wideEnd));
  out.push({ file: `docs/concepts/${realm}/_realm.png`, kind: 'wide', realm, id: '_realm', prompt: `${WIDE} ${para} ${wide}` });
  const places = r.slice(wideEnd).split(/\n\*\*(?=[a-z_]+, )/).slice(1);
  for (const pl of places) {
    const id = pl.slice(0, pl.indexOf(',')).trim();
    const text = quote(pl);
    const tag = TAGS[TAG_KEY[realm]] || '';
    const tagLine = realm === 'saltmarch' && /isle|sea|reef|cay|shoal|harbour|tidewalk|wreck/i.test(id) ? tag.split(' Or for the isles: ').pop() : tag.split(' Or for the isles: ')[0];
    out.push({ file: `docs/concepts/${realm}/${id}.png`, kind: 'place', realm, id, prompt: `${PLACE} ${tagLine} ${text}` });
  }
}
fs.mkdirSync('docs/concepts', { recursive: true });
fs.writeFileSync('docs/concepts/prompts.json', JSON.stringify(out, null, 2));
fs.writeFileSync('docs/concepts/prompts.txt', out.map((o) => `### ${o.file}\n${o.prompt}\n`).join('\n'));
const wides = out.filter((o) => o.kind === 'wide').length, places = out.length - wides;
console.log(`${wides} wide shots and ${places} places -> docs/concepts/prompts.json and prompts.txt`);
if (places !== 95 || wides !== 9) { console.error('expected 9 and 95'); process.exit(1); }
