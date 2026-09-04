// The people: the fourteen roles of `docs/mmo/05-WORLD-CONTENT.md`, what they
// sell, buy and teach, what a lesson costs, and the two rules in
// `docs/mmo/06-ECONOMY-UI.md` that stop a town being milked. Pure data and pure
// functions: no THREE, no DOM, no imports.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// Skill ids.
//
// SOURCE OF TRUTH: `src/mmo/skills.js` and `docs/mmo/01-STATS-SKILLS.md`.
// Hardcoded here so this module imports nothing. `npcs.test.mjs` reads the
// markdown to prove every name is in it, and compares this list against the
// copy in `recipes.js` so the two cannot drift apart unnoticed.
export const SKILL_DOC = {
  swordsmanship: 'Swordsmanship', macefighting: 'Macefighting', fencing: 'Fencing',
  wrestling: 'Wrestling', polearms: 'Polearms', tactics: 'Tactics', anatomy: 'Anatomy',
  parrying: 'Parrying', archery: 'Archery', marksmanship: 'Marksmanship', tracking: 'Tracking',
  magery: 'Magery', evaluatingIntelligence: 'Evaluating Intelligence', meditation: 'Meditation',
  resistingSpells: 'Resisting Spells', necromancy: 'Necromancy', spiritSpeak: 'Spirit Speak',
  chivalry: 'Chivalry', mysticism: 'Mysticism', inscription: 'Inscription',
  healing: 'Healing', veterinary: 'Veterinary', poisoning: 'Poisoning',
  musicianship: 'Musicianship', provocation: 'Provocation', peacemaking: 'Peacemaking',
  discordance: 'Discordance', mining: 'Mining', lumberjacking: 'Lumberjacking',
  foraging: 'Foraging', fishing: 'Fishing', skinning: 'Skinning',
  blacksmithing: 'Blacksmithing', tailoring: 'Tailoring', carpentry: 'Carpentry',
  tinkering: 'Tinkering', alchemy: 'Alchemy', cooking: 'Cooking', fletching: 'Fletching',
  masonry: 'Masonry', stealth: 'Stealth', hiding: 'Hiding', lockpicking: 'Lockpicking',
  detectHidden: 'Detect Hidden', stealing: 'Stealing', removeTrap: 'Remove Trap',
  animalTaming: 'Animal Taming', animalLore: 'Animal Lore', herding: 'Herding',
  camping: 'Camping', swimming: 'Swimming', focus: 'Focus',
};
export const SKILL_IDS = Object.keys(SKILL_DOC);

// What an NPC can stand in front of.
export const SETTLEMENT_KINDS = ['town', 'hamlet', 'ruin'];
// The things a talk panel can offer beyond buying and selling.
export const SERVICES = ['heal', 'cure', 'resurrect', 'repair', 'rest', 'rumour', 'tame'];

// Goods, as base kinds or as the category a stall carries. Checked against
// 03-ITEMS-LOOT.md and 05-WORLD-CONTENT.md by `npcs.test.mjs`.
export const GOODS = [
  'weapons', 'armour', 'shields', 'cloth', 'leather', 'bags', 'bows', 'arrows',
  'potions', 'reagents', 'bandages', 'food', 'torches', 'tools', 'scrolls',
  'staves', 'robes', 'ore', 'ingots', 'hide', 'herbs', 'pelts', 'feed', 'bone',
  'anything',
];

// "Training: a trainer raises a skill to 40 at 1 gold per 0.1 point above what
// you have, in one sitting. Beyond 40 nobody can teach you; you practise."
export const TRAIN_CAP = 40;
export const GOLD_PER_TENTH = 1;

/** What a trainer charges to move a skill from `from` to `to`. Never past 40. */
export function trainCost(from, to) {
  const start = clamp(from, 0, 100);
  const end = clamp(Math.min(to, TRAIN_CAP), 0, TRAIN_CAP);
  if (end <= start) return 0;
  return Math.round((end - start) * 10 * GOLD_PER_TENTH);
}

// "Healers resurrect at the shrine or in their house for 50 gold below skill
// 30, free after."
export const RESURRECT_COST = 50;
export const RESURRECT_FREE_AT = 30;
export const resurrectCost = (healing) => (healing >= RESURRECT_FREE_AT ? 0 : RESURRECT_COST);

// "repairs: 1 gold per point of durability, at a smith"
export const repairCost = (points) => Math.max(0, Math.round(points));

// "prices are the catalog price times a town multiplier (0.9 to 1.2 by hash)"
export const TOWN_MULT = [0.9, 1.2];
export function townMultiplier(hash) {
  const h = Math.abs(Math.floor(hash)) % 1000;
  return TOWN_MULT[0] + (h / 999) * (TOWN_MULT[1] - TOWN_MULT[0]);
}

// ---------------------------------------------------------------------------
// The fourteen roles.
//
// `lines` are what the talk panel shows: three to five short lines in the
// character's own voice. No em dashes, and each one names the thing it is
// about in its first breath.
const R = (r) => r;
export const NPC_LIST = [
  R({
    id: 'blacksmith', name: 'Blacksmith', appearsIn: ['town', 'hamlet'],
    sells: ['weapons', 'armour', 'shields'], buys: ['ore', 'ingots', 'weapons', 'armour'],
    teaches: ['blacksmithing', 'mining'], services: ['repair'],
    sellsToTier: 3,
    lines: [
      'The forge is hot and the iron is honest. What do you need?',
      'Bring me ore and I will pay for it, though not what you think it is worth.',
      'I can put an edge back on that. A gold a point, and no arguing.',
      'Blacksmithing I can teach you to forty. After that the anvil teaches you.',
    ],
  }),
  R({
    id: 'tailor', name: 'Tailor', appearsIn: ['town'],
    sells: ['cloth', 'leather', 'bags'], buys: ['hide', 'cloth'],
    teaches: ['tailoring'], services: [],
    sellsToTier: 3,
    lines: [
      'Cloth and leather, cut to fit, and bags to carry what you find.',
      'Hides I will take, clean or not, at a fair enough price.',
      'A bigger bag is the cheapest strength you will ever buy.',
    ],
  }),
  R({
    id: 'bowyer', name: 'Bowyer', appearsIn: ['town'],
    sells: ['bows', 'arrows'], buys: ['bows', 'arrows'],
    teaches: ['archery', 'fletching'], services: [],
    lines: [
      'Bows here, and arrows by the score, which you will want more of than you think.',
      'A shortbow is quick, a longbow reaches. Pick the one your arm can hold.',
      'Fletching I can start you on. Straight shafts, then straight shooting.',
    ],
  }),
  R({
    id: 'alchemist', name: 'Alchemist', appearsIn: ['town'],
    sells: ['potions', 'reagents'], buys: ['herbs', 'reagents'],
    teaches: ['alchemy', 'foraging'], services: [],
    lines: [
      'Potions, and the reagents to make your own if you would rather.',
      'Bring me herbs. Nightshade and mandrake go furthest, but I will take garlic.',
      'Healing first, then mana. Everything else is a luxury until it is not.',
    ],
  }),
  R({
    id: 'healer', name: 'Healer', appearsIn: ['town', 'hamlet'],
    sells: ['bandages'], buys: ['herbs'],
    teaches: ['healing', 'anatomy'], services: ['heal', 'cure', 'resurrect'],
    lines: [
      'Sit down. I will close that, and it will cost you less than dying does.',
      'Poison I can draw out. Come sooner next time.',
      'Bandages, by the bundle. Learn to use them and you will need me less.',
      'I can raise the fallen. Fifty gold, unless you know the work yourself.',
    ],
  }),
  R({
    id: 'mage', name: 'Mage', appearsIn: ['town'],
    sells: ['scrolls', 'reagents', 'staves', 'robes'], buys: ['scrolls', 'reagents'],
    teaches: ['magery', 'evaluatingIntelligence', 'meditation', 'inscription'], services: [],
    lines: [
      'Scrolls, reagents, a staff that will not fight you when you cast.',
      'A robe leaves your mana alone. Plate does not. That is the whole argument.',
      'Magery to forty I will teach. The circles above that you will have to earn.',
    ],
  }),
  R({
    id: 'provisioner', name: 'Provisioner', appearsIn: ['town', 'hamlet'],
    sells: ['food', 'torches', 'tools'], buys: ['anything'],
    teaches: [], services: [],
    paysRate: 0.15,
    lines: [
      'Food, torches, tools, and a kit to sleep rough with. The road needs all four.',
      'I will buy anything off you. I will not pay well for it, and I will not pretend otherwise.',
      'Take a torch. The dark down there is not the dark up here.',
    ],
  }),
  R({
    id: 'stablemaster', name: 'Stablemaster', appearsIn: ['town'],
    sells: ['feed'], buys: ['feed'],
    teaches: ['animalTaming', 'animalLore', 'veterinary'], services: ['tame'],
    lines: [
      'Feed for whatever follows you, and a pen for it while you drink.',
      'If the beast will not come to you, I will bring it in. For a price.',
      'Animal Lore is what makes a pet worth keeping. Taming only starts it.',
    ],
  }),
  R({
    id: 'weaponsmaster', name: 'Weaponsmaster', appearsIn: ['town'],
    sells: [], buys: [],
    teaches: ['swordsmanship', 'macefighting', 'fencing', 'polearms', 'tactics', 'parrying', 'wrestling'], services: [],
    lines: [
      'Blade, mace, spear or pole. Tell me which and stand where I put you.',
      'Tactics is worth more than any of them. It multiplies everything you already do.',
      'To forty I will drill you. Past that you learn it from things that hit back.',
    ],
  }),
  R({
    id: 'ranger', name: 'Ranger', appearsIn: ['hamlet'], needs: 'forestEdge',
    sells: [], buys: ['pelts', 'hide'],
    teaches: ['tracking', 'camping', 'archery'], services: ['rumour'],
    lines: [
      'Tracking tells you what is out there before it tells you.',
      'Pelts I will buy, if they are taken clean.',
      'Learn to camp and the woods stop being somewhere you pass through.',
    ],
  }),
  R({
    id: 'bard', name: 'Bard', appearsIn: ['town'],
    sells: [], buys: [],
    teaches: ['musicianship', 'provocation', 'peacemaking', 'discordance'], services: ['rumour'],
    lines: [
      'Sit, buy nothing, listen. I know where the nearest dungeon is and I will tell you.',
      'Provocation sets two of them on each other. It is the laziest good idea in the world.',
      'Musicianship first. Without it the rest is noise and nothing listens.',
    ],
  }),
  R({
    id: 'necromancer', name: 'Necromancer', appearsIn: ['ruin'], nightOnly: true,
    sells: ['bone', 'reagents'], buys: ['bone', 'reagents'],
    teaches: ['necromancy', 'spiritSpeak'], services: [],
    lines: [
      'You found the stall. Nobody finds the stall by accident.',
      'Bone, and the reagents that go with it. Do not ask where the bone came from.',
      'Necromancy to forty. Spirit Speak with it, or the dead will not stay to talk.',
      'Come at night. By day there is nothing here but the stones.',
    ],
  }),
  R({
    id: 'thief', name: 'Thief', appearsIn: ['town'],
    sells: [], buys: ['anything'],
    teaches: ['stealth', 'hiding', 'lockpicking', 'stealing'], services: [],
    lines: [
      'Down here nobody writes anything down. Bring me what you have.',
      'Hiding keeps you still and unseen. Stealth lets you walk. Learn both.',
      'A lock is a question. Lockpicking is knowing it was never a very good one.',
    ],
  }),
  R({
    id: 'innkeeper', name: 'Innkeeper', appearsIn: ['town'],
    sells: ['food'], buys: ['food'],
    teaches: [], services: ['rest'],
    lines: [
      'A bed, a fire, and you wake whole. That is the whole trade.',
      'Rest here and you carry the good of it out the door with you.',
      'Food I will buy off you if it is fresh, and sell you some if it is not.',
    ],
  }),
];

export const NPCS = Object.fromEntries(NPC_LIST.map((n) => [n.id, n]));

// ---------------------------------------------------------------------------
// Vendor arithmetic, from 06-ECONOMY-UI.md.
//
//   "Sell to a vendor at 30% of the buy price; the Provisioner pays 15%.
//    A vendor pays 10% less for each unit of the same thing you sold there in
//    the last hour, floor 5%. Buy prices rise 5% per unit bought in the hour."
//
// NOTE, an inconsistency in the documents: 05-WORLD-CONTENT.md says prices
// "rise 10% for each of the same thing you sold there this hour", which folds
// buying and selling into one rule and uses a different number. 06 is the
// specific one and the one implemented here.
export const BUY_RISE_PER_UNIT = 0.05;
export const SELL_FALL_PER_UNIT = 0.10;
export const SELL_RATE = 0.30;
export const PROVISIONER_SELL_RATE = 0.15;
export const SELL_RATE_FLOOR = 0.05;
export const RESTOCK_S = 30 * 60;      // "Vendor stock is finite and restocks every 30 minutes"

/** The multiplier on a buy price after `bought` of the same thing this hour. */
export const vendorPriceMult = (bought = 0) => Math.pow(1 + BUY_RISE_PER_UNIT, Math.max(0, bought));

/** What a vendor charges. `base` is the catalog price. */
export function vendorPrice(base, townMult = 1, boughtThisHour = 0) {
  return Math.max(1, Math.round(base * townMult * vendorPriceMult(boughtThisHour)));
}

/** The fraction of the buy price a vendor pays, after `sold` this hour. */
export function vendorPayRate(soldThisHour = 0, isProvisioner = false) {
  const start = isProvisioner ? PROVISIONER_SELL_RATE : SELL_RATE;
  return Math.max(SELL_RATE_FLOOR, start * Math.pow(1 - SELL_FALL_PER_UNIT, Math.max(0, soldThisHour)));
}

/** What a vendor pays you. `base` is the catalog buy price of the same thing. */
export function vendorPays(base, soldThisHour = 0, isProvisioner = false) {
  return Math.max(1, Math.round(base * vendorPayRate(soldThisHour, isProvisioner)));
}

// ---------------------------------------------------------------------------
// Who stands in a settlement.
//
// "a town gets 6 to 9, a hamlet 2 to 4, always a Provisioner, a Healer if a
// hamlet has more than 2; a Necromancer only at a ruin."
export const TOWN_NPCS = [6, 9];
export const HAMLET_NPCS = [2, 4];

const pickInt = (rng, lo, hi) => lo + Math.min(hi - lo, Math.max(0, Math.floor(rng() * (hi - lo + 1))));

/**
 * The people of one settlement, in a stable order.
 *
 * @param {{kind: string, forestEdge?: boolean}|string} settlement
 * @param {function} rng
 */
export function npcsFor(settlement, rng = Math.random) {
  const s = typeof settlement === 'string' ? { kind: settlement } : (settlement || {});
  const kind = s.kind;
  if (!SETTLEMENT_KINDS.includes(kind)) return [];

  // A ruin is not a settlement with people in it. It has one stall, and only
  // the Necromancer keeps it.
  if (kind === 'ruin') return [NPCS.necromancer];

  const pool = NPC_LIST.filter((n) => (
    n.appearsIn.includes(kind)
    && n.id !== 'necromancer'
    && (!n.needs || (n.needs === 'forestEdge' && !!s.forestEdge))
  ));

  const [lo, hi] = kind === 'town' ? TOWN_NPCS : HAMLET_NPCS;
  const want = Math.min(pool.length, pickInt(rng, lo, hi));

  const out = [NPCS.provisioner];                       // always
  // "a Healer if a hamlet has more than 2"
  if (kind === 'hamlet' && want > 2) out.push(NPCS.healer);
  if (kind === 'town') out.push(NPCS.healer);           // a town is never without one

  const rest = pool.filter((n) => !out.includes(n));
  // Fisher-Yates on a copy, so the same rng gives the same street every time.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  while (out.length < want && rest.length) out.push(rest.shift());

  // Order the street the way the roles are listed, not the way they were drawn.
  return NPC_LIST.filter((n) => out.includes(n));
}

// ---------------------------------------------------------------------------
export const DOC_REFS = {
  skills: SKILL_DOC,
  npcs: Object.fromEntries(NPC_LIST.map((n) => [n.id, n.name])),
  services: {
    heal: 'heals', cure: 'cures', resurrect: 'resurrect', repair: 'repairs',
    rest: 'rest', rumour: 'rumours', tame: 'tames',
  },
};

/** Every structural claim this table makes, checked at load. */
export function auditNpcs() {
  const bad = [];
  const seen = new Set();
  const skills = new Set(SKILL_IDS);
  const services = new Set(SERVICES);
  const goods = new Set(GOODS);

  if (NPC_LIST.length !== 14) bad.push(`there should be fourteen roles, there are ${NPC_LIST.length}`);

  for (const n of NPC_LIST) {
    const at = `npc ${n.id}`;
    if (seen.has(n.id)) bad.push(`${at}: duplicate id`);
    seen.add(n.id);
    if (!n.name) bad.push(`${at}: no name`);
    if (!Array.isArray(n.appearsIn) || n.appearsIn.length === 0) bad.push(`${at}: appears nowhere`);
    else for (const k of n.appearsIn) if (!SETTLEMENT_KINDS.includes(k)) bad.push(`${at}: appearsIn "${k}"`);
    for (const g of [...n.sells, ...n.buys]) if (!goods.has(g)) bad.push(`${at}: trades in "${g}", which is not a good this game has`);
    for (const t of n.teaches) if (!skills.has(t)) bad.push(`${at}: teaches "${t}", which is not a skill`);
    for (const sv of n.services) if (!services.has(sv)) bad.push(`${at}: offers "${sv}", which is not a service`);
    if (n.sells.length === 0 && n.buys.length === 0 && n.teaches.length === 0 && n.services.length === 0) {
      bad.push(`${at}: offers nothing at all`);
    }
    if (!Array.isArray(n.lines) || n.lines.length < 3 || n.lines.length > 5) bad.push(`${at}: ${n.lines ? n.lines.length : 0} lines, wanted 3 to 5`);
    for (const l of n.lines || []) {
      if (typeof l !== 'string' || l.trim().length === 0) bad.push(`${at}: an empty line`);
      else {
        if (l.includes('—')) bad.push(`${at}: em dash in "${l.slice(0, 30)}"`);
        if (l.length > 110) bad.push(`${at}: a line of ${l.length} characters is not short`);
      }
    }
  }

  // The role rules the document states in words.
  const nec = NPCS.necromancer;
  if (!nec) bad.push('there is no Necromancer');
  else {
    if (nec.appearsIn.length !== 1 || nec.appearsIn[0] !== 'ruin') bad.push('the Necromancer belongs at a ruin and nowhere else');
    if (!nec.nightOnly) bad.push('the Necromancer is only there at night');
  }
  if (!NPCS.provisioner.appearsIn.includes('town') || !NPCS.provisioner.appearsIn.includes('hamlet')) bad.push('the Provisioner stands in both a town and a hamlet');
  if (NPCS.provisioner.paysRate !== PROVISIONER_SELL_RATE) bad.push('the Provisioner pays 15%');
  if (!NPCS.healer.appearsIn.includes('hamlet')) bad.push('the Healer stands in a hamlet too');
  for (const id of ['town', 'hamlet']) {
    const n = NPC_LIST.filter((x) => x.appearsIn.includes(id)).length;
    const want = id === 'town' ? TOWN_NPCS[1] : HAMLET_NPCS[1];
    if (n < want) bad.push(`only ${n} roles can stand in a ${id}, but one can hold ${want}`);
  }
  // Every skill somebody teaches has to be a skill, and every trainer capped at 40.
  if (TRAIN_CAP !== 40) bad.push('TRAIN_CAP should be 40');
  if (trainCost(0, 100) !== 400) bad.push(`training from nothing should cost 400 gold, it costs ${trainCost(0, 100)}`);

  if (bad.length) throw new Error(`auditNpcs: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    npcs: NPC_LIST.length,
    teachable: new Set(NPC_LIST.flatMap((n) => n.teaches)).size,
    lines: NPC_LIST.reduce((a, n) => a + n.lines.length, 0),
  };
}

auditNpcs();
