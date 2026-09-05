// realms: the world sheet holds its promises, and the audit catches a realm that breaks one.
import { REALMS, PLACES, KINDS, REALM_COUNT, auditRealms } from './realms.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

console.log('realms: the sheet');
check('nine realms', REALM_COUNT === 9, String(REALM_COUNT));
check('every realm has a hub, town or hamlet', REALMS.every((r) => r.places.some((p) => ['hub', 'town', 'hamlet'].includes(p.kind))));
// the Greenwold's is its ring of stones and the Isles' is the Harbour itself,
// so the mega structure may be a place of that kind or the named hub
check('every realm has a mega structure', REALMS.every((r) => r.mega && (r.places.some((p) => p.kind === 'megastructure') || r.places.some((p) => ['hub', 'landmark'].includes(p.kind) && r.mega.toLowerCase().includes(p.name.replace(/^the /i, '').toLowerCase().split(' ')[0])))),
  REALMS.filter((r) => !r.places.some((p) => p.kind === 'megastructure')).map((r) => r.id).join(', '));
check('every realm has a dungeon with a boss', REALMS.every((r) => r.places.some((p) => p.kind === 'dungeon' && p.boss)));
check('every realm has a mine', REALMS.every((r) => r.places.some((p) => p.kind === 'mine')));
check('every realm has at least three places with a mechanic of their own', REALMS.every((r) => r.places.filter((p) => p.mechanic).length >= 3),
  REALMS.map((r) => `${r.id} ${r.places.filter((p) => p.mechanic).length}`).join(', '));
check('every place kind is known', PLACES.every((p) => KINDS.includes(p.kind)));
check('no two places share an id', new Set(PLACES.map((p) => p.id)).size === PLACES.length, `${PLACES.length} places`);
check('the rings run 0 to 3 and the danger bands rise with them', REALMS.every((r) => r.ring >= 0 && r.ring <= 3 && r.danger[0] <= r.danger[1]) && REALMS.filter((r) => r.ring === 3).every((r) => r.danger[1] >= 4));
check('every realm sits inside the 16 km square', REALMS.every((r) => Math.abs(r.x) + r.r <= 8400 && Math.abs(r.z) + r.r <= 8400));
check('no em dashes anywhere', !JSON.stringify(REALMS).includes('—'));
console.log(`  ${PLACES.length} places: ${Object.entries(PLACES.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {})).map(([k, v]) => `${v} ${k}`).join(', ')}`);

console.log('realms: the audit both ways');
check('the real sheet passes', auditRealms() === 9);
const broken = JSON.parse(JSON.stringify(REALMS));
broken[0].places = broken[0].places.filter((p) => p.kind !== 'mine');
let threw = null; try { auditRealms(broken); } catch (e) { threw = e.message; }
check('a realm without a mine is refused, by name', /greenwold: no mine/.test(threw || ''), threw || 'no throw');
const dup = JSON.parse(JSON.stringify(REALMS)); dup[1].places[0].id = dup[0].places[0].id;
threw = null; try { auditRealms(dup); } catch (e) { threw = e.message; }
check('a duplicate id is refused', /duplicate id/.test(threw || ''), threw || 'no throw');

console.log(`\nrealms: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
