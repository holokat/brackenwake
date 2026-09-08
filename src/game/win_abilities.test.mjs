// The book, the bar, and what goes on it. Run: node src/game/win_abilities.test.mjs
//
// The page used to list only what you had already bought, so there was nothing
// to count: whatever it drew was right by definition. Now it draws all seventy
// eight rows whatever your skills are, which is a claim with a number in it,
// and the last section builds the REAL panel against a small fake document and
// reads what a player would see.

// --- a document, small enough to read (the same shim hud.test.mjs uses) ------
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', draggable: false, hidden: false,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join(' ') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev || {}); },
      get firstChild() { return node.children[0] || null; },
      get lastChild() { return node.children[node.children.length - 1] || null; },
      querySelector() { return null; },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
}
globalThis.document = makeDom();

const mod = await import('./win_abilities.js');
const { barHand } = mod;
const {
  setBarSlot, barOf, abilityLines, BAR_SLOTS, BAR_KEYS,
  GROUP_LABEL, GROUP_COLOUR, ART, ART_ORDER, artFor, artSvg, auditArt,
  requirementParts, requirementView, chipsFor, weaponLine, skillNumber,
  FILTERS, inFilter, bookFor, panel,
} = mod;
const { ABILITIES, ABILITIES_BY_ID, GROUPS, EFFECT_KINDS, unlockedFor } = await import('../mmo/abilities.js');
const { SKILLS } = await import('../mmo/skills.js');
const { OPENINGS_BY_ID } = await import('../mmo/openings.js');
const { makeItem } = await import('../mmo/items.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the bar has as many keys as it has slots --------------------------------
check('the bar has twelve slots', BAR_SLOTS === 12);
check('and twelve keys, one each', BAR_KEYS.length === BAR_SLOTS && new Set(BAR_KEYS).size === BAR_SLOTS, BAR_KEYS.join(''));
check('which are 1 to 0 and minus and equals', BAR_KEYS.join('') === '1234567890-=');

// ---- the document s bar is repaired, not trusted -------------------------------
{
  const c = {};
  const bar = barOf(c);
  check('a document with no bar gets twelve empty slots', bar.length === 12 && bar.every((x) => x === null));
  const short = { bar: ['powerStrike'] };
  barOf(short);
  check('a short bar is filled out', short.bar.length === 12 && short.bar[0] === 'powerStrike' && short.bar[11] === null);
}

// ---- putting one on ------------------------------------------------------------
{
  const c = {};
  const r = setBarSlot(c, 0, 'powerStrike');
  check('an ability goes on the bar', r.ok === true && c.bar[0] === 'powerStrike');
  check('and the words name the slot and the key', /slot 1/.test(r.reason) && /key 1/.test(r.reason), r.reason);
  const moved = setBarSlot(c, 4, 'powerStrike');
  check('putting the same one elsewhere moves it', moved.ok && c.bar[4] === 'powerStrike' && c.bar[0] === null);
  check('and says it left the old slot', /leaves slot 1/.test(moved.reason), moved.reason);
  setBarSlot(c, 4, 'whirlwind');
  check('a second ability displaces the first', c.bar[4] === 'whirlwind');
  check('and only one thing is on the bar', c.bar.filter(Boolean).length === 1, c.bar.join(','));
}

// ---- taking one off --------------------------------------------------------------
{
  const c = { bar: ['powerStrike'] };
  barOf(c);
  const r = setBarSlot(c, 0, null);
  check('null clears a slot', r.ok === true && c.bar[0] === null);
  check('and says what came off', /Power Strike/.test(r.reason), r.reason);
  const again = setBarSlot(c, 0, null);
  check('clearing an empty slot is refused, not silent', again.ok === false && /already empty/.test(again.reason), again.reason);
}

// ---- the refusals ------------------------------------------------------------------
{
  const c = {};
  const passive = ABILITIES.find((a) => a.passive);
  const r = setBarSlot(c, 0, passive.id);
  check('a passive is refused', r.ok === false, r.reason);
  check('and told it is already working', /passive/.test(r.reason), r.reason);
  check('and the slot stays empty', c.bar[0] === null);
  const nope = setBarSlot(c, 0, 'dragonpunch');
  check('an ability nobody wrote is refused', nope.ok === false && /no ability called/.test(nope.reason), nope.reason);
  const off = setBarSlot(c, 12, 'powerStrike');
  check('slot thirteen is refused', off.ok === false && /12 slots/.test(off.reason), off.reason);
  const under = setBarSlot(c, -1, 'powerStrike');
  check('and so is slot minus one', under.ok === false);
  check('nothing landed on the bar', c.bar.every((x) => x === null));
}

// ---- what a player can actually put there --------------------------------------------
{
  const none = unlockedFor({}, {});
  check('a character with no skills has some abilities anyway', none.length > 0, String(none.length));
  check('and they are the ones that gate on nothing, or open at nothing',
    none.every((a) => a.skill === null || a.openAt === 0), none.map((a) => a.name).join(','));
  check('thirteen of them are first rungs held open below their own mark',
    none.filter((a) => a.openAt < a.minSkill).length === 13,
    none.filter((a) => a.openAt < a.minSkill).map((a) => a.name).join(','));
  const all = Object.fromEntries(SKILLS.map((s) => [s.id, 100]));
  const master = unlockedFor(all, { str: 100, dex: 100, int: 100, con: 100, wis: 100 });
  check('a grandmaster of everything has all seventy eight', master.length === ABILITIES.length, `${master.length} of ${ABILITIES.length}`);
  const bar = master.filter((a) => !a.passive);
  check('and more of them than the bar can hold, which is the point of choosing', bar.length > BAR_SLOTS, `${bar.length} for ${BAR_SLOTS} slots`);
}

// ---- the tooltip ------------------------------------------------------------------
{
  const lines = abilityLines(ABILITIES_BY_ID.powerStrike, { skills: {}, stats: {} });
  check('the tooltip names it first', lines[0] === 'Power Strike');
  check('and gives its cost', lines.some((l) => /15 stamina/.test(l)), lines.join(' | '));
  check('and its cooldown', lines.some((l) => /6 s cooldown/.test(l)), lines.join(' | '));
  check('and the sentence from the table', lines[lines.length - 1] === ABILITIES_BY_ID.powerStrike.description);
  const spell = ABILITIES.find((a) => a.cost && 'mana' in a.cost);
  const cheap = abilityLines(spell, { lowerManaCost: 0.5 });
  const full = abilityLines(spell, {});
  check('a mana cost is the one this character pays', cheap.find((l) => /mana/.test(l)) !== full.find((l) => /mana/.test(l)), `${full.find((l) => /mana/.test(l))} vs ${cheap.find((l) => /mana/.test(l))}`);
  check('nothing at all gives no lines', abilityLines(null).length === 0);
}

// ---- the art ------------------------------------------------------------------------
console.log('abilities: the art');
{
  check('the audit runs at import and counts every row', auditArt() === ABILITIES.length, String(auditArt()));
  const drawn = new Set(ART_ORDER.map(([k]) => k));
  const wanted = EFFECT_KINDS.filter((k) => k !== 'combo');
  check('every effect kind the rules layer can write has a mark',
    wanted.every((k) => drawn.has(k)), `${wanted.filter((k) => !drawn.has(k)).join(',') || 'none missing'} of ${wanted.length}`);
  check('and every mark names a drawing that exists', ART_ORDER.every(([, g]) => !!ART[g]));
  check('no row falls through to nothing', ABILITIES.every((a) => artFor(a).kind !== null),
    ABILITIES.filter((a) => artFor(a).kind === null).map((a) => a.id).join(',') || 'all drawn');
  check('a swing gets a blade', artFor(ABILITIES_BY_ID.powerStrike).glyph === 'blade', artFor(ABILITIES_BY_ID.powerStrike).glyph);
  check('a spell roll gets a bolt', artFor(ABILITIES_BY_ID.fireball).glyph === 'bolt');
  check('a heal gets a heart', artFor(ABILITIES_BY_ID.heal).glyph === 'heart', artFor(ABILITIES_BY_ID.heal).glyph);
  check('an absorb gets a shield', artFor(ABILITIES_BY_ID.manaShield).glyph === 'shield', artFor(ABILITIES_BY_ID.manaShield).glyph);
  check('a summon gets a skull', artFor(ABILITIES_BY_ID.raiseSkeleton).glyph === 'skull', artFor(ABILITIES_BY_ID.raiseSkeleton).glyph);
  check('the mark takes the archetype s colour, not the ability s',
    artFor(ABILITIES_BY_ID.fireball).colour === GROUP_COLOUR.mage
    && artFor(ABILITIES_BY_ID.powerStrike).colour === GROUP_COLOUR.warrior,
    `${artFor(ABILITIES_BY_ID.fireball).colour} and ${artFor(ABILITIES_BY_ID.powerStrike).colour}`);
  check('a fire spell carries its damage type for the wash behind it',
    artFor(ABILITIES_BY_ID.fireball).damageType === 'fire' && !!artFor(ABILITIES_BY_ID.fireball).tint);
  check('and a shout carries none', artFor(ABILITIES_BY_ID.battleCry).damageType === null,
    String(artFor(ABILITIES_BY_ID.battleCry).damageType));
  check('every archetype has a heading and a colour',
    GROUPS.every((g) => GROUP_LABEL[g] && GROUP_COLOUR[g]), GROUPS.map((g) => GROUP_LABEL[g]).join(','));
  check('artSvg draws at the size it is asked for', /width="64"/.test(artSvg(ABILITIES_BY_ID.fireball, 64)));
  check('and it is the painted fireball from the library, not the drawn bolt', /icons\/abilities\/fireball\.webp/.test(artSvg(ABILITIES_BY_ID.fireball, 64)));
  check('an ability nobody has painted still gets the drawn mark', /<svg/.test(artSvg({ id: 'notPaintedYet', effect: { kind: 'heal' }, group: 'healer' }, 40)));
}

// ---- what it takes, and what you have -------------------------------------------------
console.log('abilities: the requirement line');
{
  const w = ABILITIES_BY_ID.whirlwind;
  const v = requirementView(w, { swordsmanship: 33.4 }, {});
  check('Whirlwind is not yours at Swordsmanship 33.4', v.met === false);
  check('the requirement reads as the table writes it', v.text === 'Swordsmanship 50 and Tactics 40', v.text);
  check('and the locked line opens with the skill and your own number',
    v.short.startsWith('Needs Swordsmanship 50, you are at 33.4'), v.short);
  check('and it is cut into spans so the card can paint the missing clause red',
    v.spans.length === 4 && v.spans[0].text === 'Needs ' && v.spans[1].met === false && v.spans[3].met === false,
    JSON.stringify(v.spans));
  check('it names the second clause too', /Tactics 40, you are at 0/.test(v.short), v.short);
  check('the number is live: 33.4 and 49.9 read differently',
    requirementView(w, { swordsmanship: 49.9 }, {}).short !== v.short,
    requirementView(w, { swordsmanship: 49.9 }, {}).short);
  check('a skillAny row names the weapon skill you are best at, not "a weapon skill"',
    requirementView(w, { macefighting: 41 }, {}).short.startsWith('Needs Macefighting 50, you are at 41'),
    requirementView(w, { macefighting: 41 }, {}).short);
  const met = requirementView(w, { swordsmanship: 50, tactics: 40 }, {});
  check('and once you have it there is nothing left to say', met.met === true && met.short === '', `"${met.short}"`);

  check('a stat clause is named by its own word',
    requirementView(ABILITIES_BY_ID.leapSlam, { swordsmanship: 60 }, { str: 20 }).short === 'Needs Swordsmanship 60 and STR 50, you are at 20',
    requirementView(ABILITIES_BY_ID.leapSlam, { swordsmanship: 60 }, { str: 20 }).short);
  check('an ability that gates on nothing says so',
    requirementView(ABILITIES_BY_ID.jump, {}, {}).text === 'nothing at all' && requirementView(ABILITIES_BY_ID.jump, {}, {}).met);
  check('a two branch row shows both doors, joined with "or"',
    requirementView(ABILITIES_BY_ID.resurrect, { healing: 70, anatomy: 75, chivalry: 10 }, {}).short
    === 'Needs Healing 80, you are at 70 and Anatomy 80, you are at 75, or Chivalry 85, you are at 10',
    requirementView(ABILITIES_BY_ID.resurrect, { healing: 70, anatomy: 75, chivalry: 10 }, {}).short);
  check('and the paladin\'s door is in the line whichever road you are on',
    /Chivalry 85/.test(requirementView(ABILITIES_BY_ID.resurrect, { chivalry: 80 }, {}).short),
    requirementView(ABILITIES_BY_ID.resurrect, { chivalry: 80 }, {}).short);
  const allSkills = Object.fromEntries(SKILLS.map((s) => [s.id, 100]));
  const allStats = { str: 100, dex: 100, int: 100, con: 100, wis: 100 };
  const free = new Set(unlockedFor({}, {}).map((a) => a.id));
  check('requirementView agrees with meetsRequirements on all seventy eight, driven both ways',
    ABILITIES.every((a) => requirementView(a, allSkills, allStats).met === true
      && requirementView(a, {}, {}).met === free.has(a.id)),
    `${ABILITIES.filter((a) => requirementView(a, {}, {}).met !== free.has(a.id)).map((a) => a.id).join(',') || 'all agree'}`);
  check('a number is printed the way a skill reads',
    skillNumber(33.44) === '33.4' && skillNumber(50) === '50' && skillNumber(0) === '0' && skillNumber(undefined) === '0',
    [skillNumber(33.44), skillNumber(50), skillNumber(0), skillNumber(undefined)].join(' '));
  check('every locked part carries its own have and need',
    requirementParts(w, { swordsmanship: 33.4 }, {}).length === 2
    && requirementParts(w, { swordsmanship: 33.4 }, {})[0].have === 33.4);
}

// ---- the chips ------------------------------------------------------------------------
{
  const fire = chipsFor(ABILITIES_BY_ID.fireball, {});
  check('a spell shows cost, cooldown, cast and range',
    fire.map((c) => c.id).join(',') === 'cost,cooldown,cast,range', fire.map((c) => c.text).join(' | '));
  check('a rooted cast says it is rooted', chipsFor(ABILITIES_BY_ID.bandage, {}).some((c) => /rooted/.test(c.text)),
    chipsFor(ABILITIES_BY_ID.bandage, {}).map((c) => c.text).join(' | '));
  check('and a cast you can carry at a run does not', !/rooted/.test(fire[2].text), fire[2].text);
  check('a passive says only that', chipsFor(ABILITIES_BY_ID.riposte, {}).length === 1
    && chipsFor(ABILITIES_BY_ID.riposte, {})[0].text === 'passive');
  check('an ability that costs nothing says free, and Meditate is the only one',
    chipsFor(ABILITIES_BY_ID.meditate, {})[0].text === 'free'
    && ABILITIES.filter((a) => !a.passive && chipsFor(a, {})[0].text === 'free').length === 1,
    ABILITIES.filter((a) => !a.passive && chipsFor(a, {})[0].text === 'free').map((a) => a.name).join(','));
  check('and Jump, which is free of cooldown but not of breath, says its stamina',
    chipsFor(ABILITIES_BY_ID.jump, {})[0].text === '5 stamina', chipsFor(ABILITIES_BY_ID.jump, {})[0].text);
  check('a mana chip is the mana this character pays',
    chipsFor(ABILITIES_BY_ID.fireball, { lowerManaCost: 0.5 })[0].text === '5 mana',
    chipsFor(ABILITIES_BY_ID.fireball, { lowerManaCost: 0.5 })[0].text);
}

// ---- what has to be in your hands -------------------------------------------------------
{
  const bare = { equipment: {}, pack: { items: [] } };
  check('an unlocked melee ability with empty hands says what it wants',
    /wants a weapon in your hand/.test(weaponLine(ABILITIES_BY_ID.powerStrike, bare)),
    weaponLine(ABILITIES_BY_ID.powerStrike, bare));
  const armed = { equipment: { mainHand: makeItem({ base: 'longsword' }) }, pack: { items: [] } };
  check('and says nothing once the sword is in it', weaponLine(ABILITIES_BY_ID.powerStrike, armed) === '',
    `"${weaponLine(ABILITIES_BY_ID.powerStrike, armed)}"`);
  // W7 changed the rule under this line: a spell wants a wand or a staff now,
  // so the book says so with empty hands AND with a longsword in them, and
  // goes quiet the moment a wand is in the hand.
  const wanded = { equipment: { mainHand: makeItem({ base: 'wand' }) }, pack: { items: [] } };
  check('a spell says what it wants when there is no focus in the hand',
    /wants a wand or a staff in your hand/.test(weaponLine(ABILITIES_BY_ID.fireball, bare))
    && /wants a wand or a staff in your hand/.test(weaponLine(ABILITIES_BY_ID.fireball, armed)),
    weaponLine(ABILITIES_BY_ID.fireball, armed));
  check('and never says a word once the wand is in it',
    weaponLine(ABILITIES_BY_ID.fireball, wanded) === '',
    `"${weaponLine(ABILITIES_BY_ID.fireball, wanded)}"`);
  check('a document with no paper doll is not told its hands are empty',
    weaponLine(ABILITIES_BY_ID.powerStrike, {}) === '');
}

// ---- the filters and the book ------------------------------------------------------------
console.log('abilities: the book');
{
  check('the filter row is all, unlocked, then one per archetype',
    FILTERS.length === 2 + GROUPS.length && FILTERS[0].id === 'all' && FILTERS[1].id === 'unlocked',
    FILTERS.map((f) => f.label).join(', '));
  const warrior = OPENINGS_BY_ID.warrior;
  const open = unlockedFor(warrior.skills, warrior.stats);
  const book = bookFor(warrior.skills, warrior.stats, 'all');
  const rows = book.flatMap((s) => s.rows);
  check('the book shows all seventy eight rows whatever your skills are',
    rows.length === ABILITIES.length, `${rows.length} of ${ABILITIES.length}`);
  check('and every archetype has a section', book.length === GROUPS.length, book.map((s) => s.label).join(','));
  check('a fresh warrior has twenty four of them (Recall among them), thirteen of which are first rungs held open',
    open.length === 24 && open.filter((a) => a.openAt < a.minSkill).length === 13,
    `${open.length}: ${open.map((a) => a.name).join(', ')}`);
  check('so the locked count is exactly seventy eight minus what unlockedFor says',
    rows.filter((r) => !r.unlocked).length === ABILITIES.length - open.length,
    `${rows.filter((r) => !r.unlocked).length} locked, ${ABILITIES.length - open.length} expected`);
  const onlyOpen = bookFor(warrior.skills, warrior.stats, 'unlocked').flatMap((s) => s.rows);
  check('the unlocked filter shows exactly those ten', onlyOpen.length === open.length && onlyOpen.every((r) => r.unlocked),
    String(onlyOpen.length));
  const mageOnly = bookFor(warrior.skills, warrior.stats, 'mage').flatMap((s) => s.rows);
  check('an archetype filter shows that archetype, locked ones included',
    mageOnly.length === ABILITIES.filter((a) => a.group === 'mage').length && mageOnly.every((r) => r.ability.group === 'mage'),
    String(mageOnly.length));
  check('and drives both ways: no mage row is in the warrior filter',
    !bookFor(warrior.skills, warrior.stats, 'warrior').flatMap((s) => s.rows).some((r) => r.ability.group === 'mage'));
  check('inside a section what you have comes first',
    book.find((s) => s.group === 'warrior').rows[0].unlocked === true,
    book.find((s) => s.group === 'warrior').rows.map((r) => (r.unlocked ? '+' : '-')).join(''));
  check('and the locked tail climbs by the skill mark it unlocks at',
    (() => {
      const tail = book.find((s) => s.group === 'mage').rows.filter((r) => !r.unlocked).map((r) => r.ability.minSkill);
      return tail.every((v, i) => i === 0 || v >= tail[i - 1]);
    })(), book.find((s) => s.group === 'mage').rows.filter((r) => !r.unlocked).map((r) => r.ability.minSkill).join(','));
  check('inFilter drives both ways', inFilter(ABILITIES_BY_ID.fireball, 'mage', false) === true
    && inFilter(ABILITIES_BY_ID.fireball, 'warrior', false) === false
    && inFilter(ABILITIES_BY_ID.fireball, 'unlocked', false) === false
    && inFilter(ABILITIES_BY_ID.fireball, 'unlocked', true) === true
    && inFilter(ABILITIES_BY_ID.fireball, 'all', false) === true);
}

// ---- the real panel, in the fake document --------------------------------------------------
console.log('abilities: the real panel');
{
  const warrior = OPENINGS_BY_ID.warrior;
  const character = { skills: { ...warrior.skills }, stats: { ...warrior.stats }, equipment: {}, pack: { items: [] } };
  const said = [];
  const ctx = { character, hud: { log: (t, k) => said.push(`${k || ''}:${t}`) }, onBarChange: () => {} };
  const host = document.createElement('div');
  panel.build(host, ctx);

  const find = (node, pred, out = []) => {
    if (pred(node)) out.push(node);
    for (const c of node.children) find(c, pred, out);
    return out;
  };
  const cards = () => find(host, (n) => n.classList.contains('bw-card'));

  check('the page draws one card per ability, all seventy eight',
    cards().length === ABILITIES.length, String(cards().length));
  check('the page draws no bar strip of its own any more; the real bar is the drop target',
    find(host, (n) => n.classList.contains('bw-bar-strip')).length === 0);

  const locked = cards().filter((c) => c.classList.contains('locked'));
  check('fifty five of the cards are dimmed and locked',
    locked.length === ABILITIES.length - 24, `${locked.length} locked`);   // 24 since Recall (everyone, no floor)
  check('a locked card carries the sentence with your own number in it',
    locked.some((c) => /Needs .+you are at /.test(c.textContent)),
    locked[0].textContent.slice(0, 100));

  const named = (name) => cards().find((c) => find(c, (n) => n.classList.contains('bw-name'))[0].textContent === name);
  const powerStrike = named('Power Strike');
  const fireball = named('Fireball');
  check('Power Strike is bright for a warrior', !powerStrike.classList.contains('locked'));
  check('Fireball is not', fireball.classList.contains('locked'));
  check('and Fireball says what would change that, in Magery s own number',
    new RegExp(`Magery ${ABILITIES_BY_ID.fireball.minSkill}, you are at 0`).test(fireball.textContent),
    fireball.textContent.slice(0, 140));
  check('the gate is drawn above the description, which is what the player asked for',
    (() => {
      const kids = find(fireball, (n) => n.className === 'bw-req' || n.className === 'bw-desc');
      return kids.length === 2 && kids[0].className === 'bw-req';
    })(), find(fireball, (n) => /bw-(req|desc)/.test(n.className || '')).map((n) => n.className).join(' then '));
  check('and the missing clause is the piece painted red, not the whole line',
    find(fireball, (n) => n.classList.contains('bw-miss'))
      .map((n) => n.textContent).join('|') === `Magery ${ABILITIES_BY_ID.fireball.minSkill}, you are at 0`,
    find(fireball, (n) => n.classList.contains('bw-miss')).map((n) => n.textContent).join('|') || 'nothing red');
  check('the word "Needs" is not painted red, because it is not the missing thing',
    find(fireball, (n) => n.classList.contains('bw-miss')).every((n) => !/Needs/.test(n.textContent)));
  check('the art tile holds a drawing, not an empty square',
    /<img[^>]*icons\/abilities\/powerStrike\.webp/.test(find(powerStrike, (n) => n.classList.contains('bw-tile'))[0].innerHTML));
  check('a locked card wears a padlock and an unlocked one does not',
    find(fireball, (n) => n.classList.contains('bw-lock'))[0].style.display !== 'none'
    && find(powerStrike, (n) => n.classList.contains('bw-lock'))[0].style.display === 'none');
  check('the name is the ability, at eighteen point Cinzel by the sheet',
    find(powerStrike, (n) => n.classList.contains('bw-name'))[0].textContent === 'Power Strike');
  check('and the description is the sentence from the table, not a summary of it',
    find(powerStrike, (n) => n.classList.contains('bw-desc'))[0].textContent === ABILITIES_BY_ID.powerStrike.description);

  // the drag payload: unlocked, non passive, and nothing else
  const dragOf = (card) => {
    let payload = null, prevented = false;
    card.fire('dragstart', {
      dataTransfer: { setData: (mime, s) => { payload = s; }, effectAllowed: '' },
      preventDefault: () => { prevented = true; },
    });
    return { payload, prevented };
  };
  const good = dragOf(powerStrike);
  check('an unlocked card hands over { ability } and nothing else',
    good.payload === JSON.stringify({ ability: 'powerStrike' }), String(good.payload));
  const bad = dragOf(fireball);
  check('a locked card hands over nothing at all', bad.payload === null && bad.prevented === true,
    `${bad.payload} / prevented ${bad.prevented}`);
  const riposte = named('Riposte');
  check('and neither does a passive, even one whose skill you have',
    dragOf(riposte).payload === null, String(dragOf(riposte).payload));

  // the hand: a click on a card, then a click on a real bar cell, which the
  // abilities system turns into barHand.place(slot)
  check('nothing is in hand to start with', barHand.id === null && barHand.place(2) === null);
  powerStrike.fire('click');
  check('clicking an unlocked card puts it in hand and says so',
    barHand.id === 'powerStrike' && said.some((l) => /Power Strike in hand/.test(l)), `${barHand.id} / ${said[said.length - 1]}`);
  const placedRes = barHand.place(2);
  check('placing it on slot three writes the bar and empties the hand',
    placedRes && placedRes.ok && character.bar[2] === 'powerStrike' && barHand.id === null, JSON.stringify(placedRes));
  check('and it is said out loud', said.some((l) => /Power Strike goes on slot 3/.test(l)), said[said.length - 1]);
  check('a right click on the real bar is setBarSlot with null, the same words either way',
    setBarSlot(character, 2, null).ok && character.bar[2] === null);
  powerStrike.fire('click');
  panel.close();
  check('closing the page drops what was in hand', barHand.id === null);

  // dragging a cell onto another on the HUD's own bar
  setBarSlot(character, 0, 'powerStrike'); setBarSlot(character, 1, 'rend'); setBarSlot(character, 5, null);
  const sw = mod.swapBarSlots(character, 0, 1);
  check('two filled slots swap places and say so', sw.ok && sw.swapped && character.bar[0] === 'rend' && character.bar[1] === 'powerStrike' && /Power Strike and Rend swap places/.test(sw.reason), sw.reason);
  const mv = mod.swapBarSlots(character, 1, 5);
  check('a filled slot dragged onto an empty one moves', mv.ok && !mv.swapped && character.bar[5] === 'powerStrike' && character.bar[1] === null && /moves to slot 6/.test(mv.reason), mv.reason);
  check('an empty slot dragged anywhere is refused with words', mod.swapBarSlots(character, 1, 0).ok === false && /nothing to move/.test(mod.swapBarSlots(character, 1, 0).reason));
  check('a slot dragged onto itself is refused', mod.swapBarSlots(character, 0, 0).ok === false);
  check('and a slot off the bar is refused', mod.swapBarSlots(character, 0, 12).ok === false);

  // a locked card clicked says the requirement rather than nothing
  said.length = 0;
  fireball.fire('click');
  check('clicking a locked card says what it would take, and marks it a refusal',
    said.length === 1 && /^bad:Fireball needs Magery \d+, you are at 0$/.test(said[0]), said[0] || 'nothing said');

  // and the number is live: raise Magery and let the page tick
  character.skills.magery = 35;
  panel.tick(1);
  check('raising Magery to 35 unbolts Fireball where you are looking at it',
    !fireball.classList.contains('locked'), fireball.textContent.slice(0, 80));
  check('and the card becomes a drag source the moment it does',
    dragOf(fireball).payload === JSON.stringify({ ability: 'fireball' }), String(dragOf(fireball).payload));

  // the filter row
  const filters = find(host, (n) => n.classList.contains('bw-f'));
  check('the filter row is drawn', filters.length === FILTERS.length, String(filters.length));
  filters[1].fire('click');
  const after = cards();
  check('clicking Unlocked draws only what you have',
    after.length === unlockedFor(character.skills, character.stats).length, `${after.length} cards`);
  check('and none of them is locked', after.every((c) => !c.classList.contains('locked')));
  filters[0].fire('click');
  check('and All brings the whole book back', cards().length === ABILITIES.length, String(cards().length));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
