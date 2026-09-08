// The Greenwold's people and its first hour, as data.
//
// `src/mmo/realms.js` is the geography of the nine places; `docs/mmo/14-KALDERA.md`
// section 5.1 is the story of them. This file is the cast and the script: who
// stands where, what they say, what they will do for you, and the seven things
// that happen to a character in their first hour at home, each with a trigger
// the code can read and words for every state it changes.
//
// PURE. No THREE, no DOM, no game imports. It reads `realms.js` for the places
// and `npcs.js` for the roles that already exist, both of which are pure data,
// so `auditStory()` can prove at load that every person stands in a place the
// world really has and keeps a role something really knows how to draw.
//
// WHY SOME OF THE CAST HAVE ROLES OF THEIR OWN.
//
//   Three of the people here keep a building a town already has: the Bracken
//   Arms' keeper is the Innkeeper, the smith is the Blacksmith, the healer is
//   the Healer. Those three carry `over`, and `story_runtime` gives their names
//   and their lines to the person `npcs_runtime` has already stood in that
//   doorway, so the shop under the name is the shop that was always there.
//
//   The rest keep nothing. A farmer, a blind woman on the green, a nine year
//   old with a bread basket, a miller, a Legion captain and an outlaw are not
//   roles a town rolls, and adding them to `npcs.js` would put a Farmer in the
//   square of all seven precinct towns and break two audits in files S2 does
//   not own (`npcs_runtime.auditNpcSpots` wants a tunic colour for every role,
//   and `npcs.test.mjs` counts fifteen of them). So the six carry STORY_ROLES,
//   which are the same shape a role in `npcs.js` is and are read by the same
//   `win_talk` engine. `docs/mmo/wiring/S2.md` carries the two lines it would
//   take to move them into the table if that is ever wanted.
//
// VOICE. Three to six lines each, in that person's own mouth, the subject named
// in the first breath, and no em dash anywhere. `auditStory()` fails on all
// three, so a line that reads like a tooltip cannot ship.

import { REALMS } from './realms.js';
import { NPCS } from './npcs.js';

/** The realm this whole file is about. Nothing here fires anywhere else. */
export const REALM = 'greenwold';

const PLACES = new Set(REALMS.flatMap((r) => r.places.map((p) => p.id)));
const GREENWOLD_PLACES = new Set(
  (REALMS.find((r) => r.id === REALM)?.places || []).map((p) => p.id),
);

// ---------------------------------------------------------------------------
// The roles the sheet's cast needs and the town table does not have.
//
// Same fields `npcs.js` uses, so `win_talk.createTalkEngine` and `tabsFor` read
// them without knowing where they came from. A role with nothing to sell, buy
// or teach is legal HERE and is not legal there: an officer of the Ashen Legion
// standing on the Kingsroad is a conversation and not a shop, and the person
// who carries such a role has to say why in `talkOnly`.

const R = (r) => ({ sells: [], buys: [], teaches: [], services: [], ...r });

export const STORY_ROLES = {
  farmer: R({
    id: 'farmer', name: 'Farmer',
    sells: ['food'], buys: ['food', 'herbs'],
    teaches: ['swordsmanship', 'tactics'],
  }),
  elder: R({ id: 'elder', name: 'Elder' }),
  child: R({ id: 'child', name: 'Child' }),
  miller: R({
    id: 'miller', name: 'Miller',
    sells: ['food'], buys: ['food'],
    teaches: ['cooking'],
  }),
  officer: R({ id: 'officer', name: 'Captain of the Ashen Legion' }),
  outlaw: R({ id: 'outlaw', name: 'Outlaw' }),
  sexton: R({ id: 'sexton', name: 'Sexton' }),
};

/** A role by id, whether it belongs to the town table or to this file. */
export const roleOf = (id) => NPCS[id] || STORY_ROLES[id] || null;

// ---------------------------------------------------------------------------
// The cast.
//
// `at` is one of two things and never both:
//
//   { kind: 'door', lot }   the person keeps a building the town plan lays out,
//                           and `over` names the role already standing in that
//                           doorway. No second body is built.
//   { kind: 'spot', bearing, out }
//                           the person stands `out` metres from the middle of
//                           their place on that bearing, in radians, and
//                           `story_runtime` raises a body for them.
//
// `body: false` is the third case and there is exactly one of it: a person the
// story names whose body belongs to the monster runtime. The audit demands that
// such a person be spoken for by a beat, or they are a name in a file and
// nothing else.

const P = (p) => ({ talkOnly: null, over: null, body: true, ...p });

export const PEOPLE = [
  P({
    id: 'bram', name: 'Bram Haywood', title: 'the farmer',
    role: 'farmer', place: 'hearthhome',
    at: { kind: 'spot', bearing: 0.35, out: 11 },
    knows: 'the Legion, from the inside, forty years ago',
    lines: [
      'The hay can wait. Nobody has said that on this farm in my lifetime and I have just said it.',
      'The Legion is two days out, and they are not coming here to count bushels.',
      'Hold the rake with both hands and your weight on the back foot. It is the same lesson with a sword in it.',
      'The Legion counts things. Bushels, roofs, boys. Whatever they are counting for now, they are two days out.',
      'Bring me anything you grow or shoot and I will trade you for it, and I will not rob you.',
    ],
  }),
  P({
    id: 'wynn', name: 'Old Wynn Ashby', title: 'the oldest woman in the Greenwold',
    role: 'elder', place: 'hearthhome',
    at: { kind: 'spot', bearing: 2.1, out: 11 },
    talkOnly: 'she has nothing to sell and nothing to drill. What she has is the old road to the Eyrie.',
    knows: 'the Eyrie, because she was a girl there when it fell',
    lines: [
      'When the sky had wings, a road stone could move an army. Sit down.',
      'The ring of stones out on the fields is the Standing Hedge, and it is older than the village and older than the wheat.',
      'Touch one of the nine and the stone will know you. After that they carry you.',
      'The old riders are gone. The stones still remember hands.',
      'The Eyrie is in the Stormpeaks, north and north again, and it is not a story. I was a girl there the night it came down.',
    ],
  }),
  P({
    id: 'pip', name: 'Pip', title: 'the miller\'s daughter',
    role: 'child', place: 'hearthhome',
    at: { kind: 'spot', bearing: 3.9, out: 11 },
    talkOnly: 'she is nine. She tells you where the Legion went with the sack.',
    knows: 'what went down into the Old Cellars, and what it was carrying',
    lines: [
      'Da says I am not to go near the cellars. Sergeant Blackhand went down there with a sack and the sack rattled.',
      'I am not meant to know what brass on a collar means, but I know.',
      'The geese hated the sack. The geese hate everything, so it is not much of a test.',
    ],
  }),
  P({
    id: 'nan', name: 'Nan Ockley', title: 'who keeps the Bracken Arms',
    role: 'innkeeper', over: 'innkeeper', place: 'hearthhome',
    at: { kind: 'door', lot: 'inn' }, body: false,
    knows: 'who in the village would talk to a Legion officer, and who would not',
    lines: [
      'The Bracken Arms has one bed free and it is the good one, by the chimney.',
      'Keep your name quiet in the taproom. Half of them would tell and I do not know which half.',
      'A bed, a fire, and you wake whole. That has been the whole trade here for ninety years.',
    ],
  }),
  P({
    id: 'cobb', name: 'Cobb Ashby', title: 'the smith',
    role: 'blacksmith', over: 'blacksmith', place: 'hearthhome',
    at: { kind: 'door', lot: 'forge' }, body: false,
    knows: 'his grandmother, who is Old Wynn, and every word she has ever said',
    lines: [
      'The forge is yours for the morning. My grandmother says to shoe you properly before you go and she is not to be argued with.',
      'Bring me copper out of the chalk pits and I will make it into something that holds an edge.',
      'I have never made anything for a Legion man and I am not starting the week they arrive.',
    ],
  }),
  P({
    id: 'alys', name: 'Alys Fenn', title: 'the healer',
    role: 'healer', over: 'healer', place: 'hearthhome',
    at: { kind: 'door', lot: 'healer' }, body: false,
    knows: 'what the Legion soldiers brought in wounded',
    lines: [
      'Sit down and let me see it. You will heal. Everything in the Greenwold heals.',
      'A wound tells the truth if you clean it and wait.',
      'Bandages by the bundle, and no patience at all for people who save them for later.',
    ],
  }),
  P({
    id: 'ivy', name: 'Ivy Weir', title: 'the miller',
    role: 'miller', place: 'millrun',
    at: { kind: 'spot', bearing: 1.2, out: 9 },
    knows: 'that the cellars under her own mill are full of somebody else\'s men',
    lines: [
      'The mill is grinding and I am not stopping it to talk, so walk beside me.',
      'Something is living in my cellars. It was bandits last month and now it is bandits with brass on their collars.',
      'Pip is mine. If she is with you then she is your business until supper.',
      'Flour, meal and bread. I will buy grain off anybody who brings it in dry.',
    ],
  }),
  P({
    id: 'vane', name: 'Captain Serle Vane', title: 'of the Ashen Legion',
    role: 'officer', place: 'kingsroad',
    at: { kind: 'spot', bearing: 5.0, out: 10 },
    talkOnly: 'he is the enemy, he is courteous about it, and he sells nothing to anybody.',
    knows: 'exactly what he is looking for, and he will tell you so',
    lines: [
      'Captain Serle Vane, of the Ashen Legion. I take the glove off to speak to people. It costs me nothing and it seems to matter.',
      'I am looking for a sack taken from my sergeant. You would know if you had seen one, so I will ask plainly and take your answer.',
      'The tithe is not theft. It is a road, a bridge and a garrison, and somebody pays for those whether I like it or not.',
      'If you are hiding it, hide it better than this. That is not a kindness. It is the last hour of my patience.',
    ],
  }),
  P({
    id: 'millersson', name: 'The Miller\'s Son', title: 'who took the tithe',
    role: 'outlaw', place: 'highwaymanshollow',
    at: { kind: 'spot', bearing: 0.9, out: 8 },
    talkOnly: 'he is six men and a stolen wagon. What he trades in is whether you walk out of the hollow.',
    knows: 'where the tithe went, and that his mother\'s name will buy him',
    lines: [
      'They call me the Miller\'s Son. My mother is Ivy Weir and if you use her name I will hear you out.',
      'We took the tithe wagon on the Kingsroad and we would take it again tomorrow, and the week after that.',
      'Six of us and one of you. Say the mill\'s name or draw, and do it now.',
    ],
  }),
  P({
    id: 'sexton', name: 'The Skeleton Sexton', title: 'of the Sunken Chapel',
    role: 'sexton', place: 'sunkenchapel',
    at: { kind: 'spot', bearing: 0, out: 6 }, body: false,
    talkOnly: 'he is dead, he is the monster runtime\'s to raise, and he speaks once, when the bell is rung.',
    knows: 'who is buried under the water and what they were buried holding',
    lines: [
      'The sexton sits up in the water with the rope still in his hands and looks at you without any eyes.',
      'One ring of the bell and the congregation sits up and gives back what it was buried with.',
      'Two rings and they do not lie down again, and the chapel is yours to leave if you can.',
    ],
  }),
];

export const PERSON = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// The first hour.
//
// Seven beats. Each has a trigger the runtime can read off one plain object,
// words in somebody's mouth, and, where it changes anything at all, an effect
// with words of its own. Each fires once per character and is remembered in
// `character.story.beats`, and none of them fires outside the Greenwold: the
// runtime refuses on the realm before it ever reads `when`.
//
// The view a trigger is given, and every field in it, is built by
// `story_runtime.viewNow()` off the running world. The test drives every one of
// these true AND false with a view of its own.

/** How near the mouth of the Old Cellars counts as having found it. */
export const CELLAR_MOUTH_M = 45;
/** How near the Tithe Wagon counts as having seen it. */
export const WAGON_SEEN_M = 140;
/** How near the middle of Hearthhome counts as being in it. */
export const HEARTHHOME_M = 110;

const B = (b) => ({ effect: null, ...b });

export const BEATS = [
  B({
    id: 'arrival',
    who: 'wynn', place: 'hearthhome',
    trigger: 'standing inside Hearthhome for the first time',
    when: (v) => v.realm === REALM && v.inHearthhome,
    words: [
      'The village sees the road dust before it sees you. A dozen people look east and then very carefully at the ground.',
      'Old Wynn Ashby does not look at anything. She says: when the sky had wings, that road would have moved a kingdom.',
      'She says the ring of stones on the fields is the Standing Hedge, that nine of them hum at dusk, and that you are to go and put your hand on one.',
    ],
    effect: { kind: 'waypoint', place: 'waystones', name: 'The Standing Hedge' },
  }),
  B({
    id: 'firststone',
    who: 'wynn', place: 'waystones',
    trigger: 'the first waystone owned',
    when: (v) => v.realm === REALM && v.stonesOwned >= 1,
    words: [
      'The stone knows you. It is warm where your hand was and it will be warm there tomorrow.',
      'Old Wynn was telling the truth, which is the thing about Old Wynn nobody in the village has worked out yet.',
      'Any other stone you take this way will answer this one, once a day, from wherever the two of them stand.',
    ],
  }),
  B({
    id: 'tithewagon',
    who: 'bram', place: 'kingsroad',
    trigger: 'the Tithe Wagon seen on the Kingsroad for the first time',
    when: (v) => v.realm === REALM && v.wagonNear,
    words: [
      'The Tithe Wagon is on the Kingsroad, four soldiers and an archer walking it at the pace of the oxen.',
      'It belongs to Captain Serle Vane, who is camped where the road comes into the Greenwold and looking for a sack his sergeant lost.',
      'The tithe is the year off the Greenwold: grain, wool, iron and a tenth of everything else, going east to a man on a volcano.',
    ],
  }),
  B({
    id: 'firstwolf',
    who: 'bram', place: 'beechhangar',
    trigger: 'the first wolf killed after dark',
    when: (v) => v.realm === REALM && v.wolfKilledAtNight,
    words: [
      'The wolf goes down and the wood keeps making the noise it was making.',
      'Bram Haywood takes the straw out of his mouth for this one. He says the Beech Hangar\'s wolves are worse this year than he has ever known them.',
      'He says Old Grist is up there too, a boar the size of a pony, and that two men have seen him this month and neither of them went back.',
    ],
  }),
  B({
    id: 'cellarsmouth',
    who: 'pip', place: 'oldcellars',
    trigger: 'standing at the mouth of the Old Cellars',
    when: (v) => v.realm === REALM && v.atCellarMouth,
    words: [
      'The Old Cellars go in under the mill and then under the river, and they are older than either.',
      'Pip is at your elbow, which she is not supposed to be. She says Sergeant Blackhand went down there with a sack.',
      'She says the sack rattled, and she is nine, and she knows exactly what was in it and so do you.',
    ],
  }),
  B({
    id: 'oram',
    who: 'pip', place: 'oldcellars',
    trigger: 'Sergeant Oram Blackhand killed',
    when: (v) => v.realm === REALM && v.oramDown,
    words: [
      'Sergeant Oram Blackhand goes down in a cellar too low to stand straight in, and the sack on his belt comes off with him.',
      'Inside is a broken seal, a brass order and enough ash to blacken both hands.',
      'Pip says the sack rattled louder before the sergeant carried it below.',
    ],
  }),
  B({
    id: 'chapelbell',
    who: 'sexton', place: 'sunkenchapel',
    trigger: 'the bell of the Sunken Chapel rung under water',
    when: (v) => v.realm === REALM && v.bellRung,
    words: [
      'The bell of the Sunken Chapel rings under the water, which is a sound you feel in your teeth before you hear it.',
      'The congregation sits up in its pews. The Skeleton Sexton has the rope in his hands and no eyes to look at you with.',
      'They will give back what they were buried with, for a minute, and then they will want it back.',
    ],
  }),
];

export const BEAT = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const BEAT_IDS = BEATS.map((b) => b.id);

/** Every field a trigger is allowed to read. The runtime fills all of them. */
export const VIEW_KEYS = Object.freeze([
  'realm', 'inHearthhome', 'stonesOwned', 'wagonNear', 'wolfKilledAtNight',
  'atCellarMouth', 'oramDown', 'bellRung',
]);

/** A view with nothing true in it. The runtime starts from this every frame. */
export function blankView() {
  return {
    realm: null, inHearthhome: false, stonesOwned: 0, wagonNear: false,
    wolfKilledAtNight: false, atCellarMouth: false, oramDown: false, bellRung: false,
  };
}

// ---------------------------------------------------------------------------

const hasEmDash = (s) => String(s).includes('—');

/**
 * Every claim this file makes, checked at load.
 *
 * It takes the two tables rather than reading the module's own, so the test can
 * drive it false: a rule nothing has ever seen fail is a rule nobody has read.
 */
export function auditStory(people = PEOPLE, beats = BEATS) {
  const bad = [];
  const seen = new Set();
  const personOf = Object.fromEntries(people.map((p) => [p.id, p]));

  for (const p of people) {
    const at = `person ${p.id}`;
    if (seen.has(p.id)) bad.push(`${at}: two people share an id`);
    seen.add(p.id);
    if (!p.name) bad.push(`${at}: no name`);
    if (!p.title) bad.push(`${at}: no title, so the plate would read as a bare name`);
    const role = roleOf(p.role);
    if (!role) bad.push(`${at}: keeps the role "${p.role}", which neither npcs.js nor this file has`);
    if (!PLACES.has(p.place)) bad.push(`${at}: stands at "${p.place}", which is no place in realms.js`);
    else if (!GREENWOLD_PLACES.has(p.place)) bad.push(`${at}: stands at "${p.place}", which is not in the Greenwold`);
    if (!p.at || (p.at.kind !== 'door' && p.at.kind !== 'spot')) bad.push(`${at}: stands neither at a door nor on a spot`);
    if (p.at?.kind === 'door') {
      if (!p.over) bad.push(`${at}: keeps a door and names nobody to stand over`);
      if (p.body) bad.push(`${at}: keeps a door and would raise a second body in it`);
      if (!p.at.lot) bad.push(`${at}: keeps a door with no building under it`);
    }
    if (p.at?.kind === 'spot') {
      if (!Number.isFinite(p.at.bearing)) bad.push(`${at}: a spot with no bearing`);
      if (!(p.at.out > 0)) bad.push(`${at}: a spot no distance out from the middle of the place`);
    }
    if (p.over && !NPCS[p.over]) bad.push(`${at}: stands over "${p.over}", which is not a role a town has`);
    if (p.over && p.over !== p.role) bad.push(`${at}: stands over the ${p.over} while keeping the ${p.role}, so the shop and the name disagree`);
    if (!Array.isArray(p.lines) || p.lines.length < 3 || p.lines.length > 6) {
      bad.push(`${at}: ${p.lines ? p.lines.length : 0} lines, wanted three to six`);
    }
    for (const l of p.lines || []) {
      if (typeof l !== 'string' || !l.trim()) bad.push(`${at}: an empty line`);
      else if (hasEmDash(l)) bad.push(`${at}: em dash in "${l.slice(0, 34)}"`);
      else if (l.length > 150) bad.push(`${at}: a line of ${l.length} characters is a paragraph`);
    }
    if (!p.knows) bad.push(`${at}: knows nothing, so there is no reason to walk up to them`);
    // A person who offers nothing has to say why, and a person who offers
    // something must not claim to be talk only.
    const offers = role
      ? (role.sells.length + role.buys.length + role.teaches.length + role.services.length) > 0
      : false;
    if (!offers && !p.talkOnly) bad.push(`${at}: the panel would open on a Talk tab and nothing else, and no reason is given`);
    if (offers && p.talkOnly) bad.push(`${at}: says it is talk only and its role trades`);
    // The one person with no body of their own has to be spoken for by a beat.
    if (!p.body && !p.over && !beats.some((b) => b.who === p.id)) {
      bad.push(`${at}: no body, no doorway and no beat, so nothing in the game would ever reach them`);
    }
  }

  // Every named building a person stands at is one every town has. The list is
  // town_layout.REQUIRED_LOTS, copied rather than imported because this file is
  // pure data with no world in it; `story.test.mjs` proves the copy against the
  // real export, so it cannot drift.
  const LOTS = ['inn', 'smith', 'forge', 'healer', 'stable', 'pens', 'bank'];
  for (const p of people) {
    if (p.at?.kind === 'door' && !LOTS.includes(p.at.lot)) {
      bad.push(`person ${p.id}: stands at a ${p.at.lot}, which is not a building every town has`);
    }
  }

  const ids = new Set();
  for (const b of beats) {
    const at = `beat ${b.id}`;
    if (ids.has(b.id)) bad.push(`${at}: two beats share an id`);
    ids.add(b.id);
    if (typeof b.when !== 'function') bad.push(`${at}: no trigger a machine can read`);
    if (!b.trigger) bad.push(`${at}: no trigger written down in words`);
    if (b.who && !personOf[b.who]) bad.push(`${at}: put in the mouth of "${b.who}", who is not in the cast`);
    if (!PLACES.has(b.place)) bad.push(`${at}: happens at "${b.place}", which is no place in realms.js`);
    else if (!GREENWOLD_PLACES.has(b.place)) bad.push(`${at}: happens outside the Greenwold`);
    if (!Array.isArray(b.words) || b.words.length < 2 || b.words.length > 4) {
      bad.push(`${at}: ${b.words ? b.words.length : 0} lines, wanted two to four`);
    }
    for (const l of b.words || []) {
      if (typeof l !== 'string' || !l.trim()) bad.push(`${at}: an empty line`);
      else if (hasEmDash(l)) bad.push(`${at}: em dash in "${l.slice(0, 34)}"`);
    }
    if (b.effect) {
      const k = b.effect.kind;
      if (k !== 'waypoint') bad.push(`${at}: an effect of kind "${k}", which the runtime cannot apply`);
      if (k === 'waypoint' && !PLACES.has(b.effect.place)) bad.push(`${at}: points the compass at "${b.effect.place}", which is no place`);
    }
    // Every trigger has to be answerable from the view and from nothing else.
    const view = blankView();
    let threw = null;
    try { b.when(view); } catch (e) { threw = e.message; }
    if (threw) bad.push(`${at}: its trigger threw on a blank view (${threw})`);
    else if (b.when(view)) bad.push(`${at}: its trigger is true on a blank view, so it would fire the moment the game boots`);
  }

  if (bad.length) throw new Error(`auditStory: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    people: people.length,
    bodies: people.filter((p) => p.body).length,
    over: people.filter((p) => p.over).length,
    beats: beats.length,
    lines: people.reduce((a, p) => a + p.lines.length, 0),
    roles: Object.keys(STORY_ROLES).length,
  };
}

auditStory();
