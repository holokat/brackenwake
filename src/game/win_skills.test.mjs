// The skill sheet's rules, its art, its bar and the real page it draws.
// Run: node src/game/win_skills.test.mjs
//
// The lock goes through skills.setLock, the ability rows go through
// abilities.meetsRequirements, and the gain step goes through skills.gainStep,
// so what is proved here is that the window asks the right question, not that
// it has its own answer.
//
// SK1 rewrote the page from a table into a grid of cards, so the last section
// builds the REAL panel against a small fake document and reads what a player
// would see: the painting on every card, the width of every bar, which gain
// band is lit, the lock walking up, locked, down, and the filter chips.

// --- a document, small enough to read (the same shim win_abilities.test uses) --
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', type: '', draggable: false, hidden: false,
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

const {
  lockState, nextLock, LOCK_CYCLE, LOCK_GLYPH, LOCK_WORDS,
  thresholdFor, abilitiesOf, standingFor,
  GROUP_COLOUR, SKILL_MARK, skillArt, abilityChipArt, auditSkillArt,
  TICKS, bandIndexAt, stepText, barView,
  FILTERS, inFilter, sheetFor, countText, panel,
} = await import('./win_skills.js');
const {
  SKILLS, SKILL_GROUPS, BANDS, gainStep, lockOf, setLock, LOCKS, TOTAL_CAP, total,
} = await import('../mmo/skills.js');
const { ABILITIES_BY_ID, skillNumber } = await import('../mmo/abilities.js');
const { skillIcon } = await import('./icon_art.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the sheet shows all of them --------------------------------------------
check('there are fifty two skills to draw', SKILLS.length === 52, String(SKILLS.length));
check('in nine groups', SKILL_GROUPS.length === 9);
check('and every skill belongs to one of them', SKILLS.every((s) => SKILL_GROUPS.includes(s.group)));
const drawn = SKILL_GROUPS.flatMap((g) => SKILLS.filter((s) => s.group === g));
check('grouping draws each one exactly once', drawn.length === SKILLS.length && new Set(drawn.map((s) => s.id)).size === 52);

// ---- the lock cycles through all three ----------------------------------------
check('the cycle covers every lock the rules have', LOCK_CYCLE.length === LOCKS.length && LOCKS.every((l) => LOCK_CYCLE.includes(l)), LOCK_CYCLE.join(','));
check('up leads to locked', nextLock('up') === 'locked');
check('locked leads to down', nextLock('locked') === 'down');
check('and down comes back to up', nextLock('down') === 'up');
check('every state has a glyph and a sentence', LOCK_CYCLE.every((l) => LOCK_GLYPH[l] && LOCK_WORDS[l]));

// ---- the state the rules layer wants ------------------------------------------
{
  const c = { skills: { mining: 30 } };
  const st = lockState(c);
  check('lockState gives skills and locks', st.skills === c.skills && st.locks === c.skillLocks);
  check('and it made the locks map the document was missing', typeof c.skillLocks === 'object');
  const r = setLock(st, 'mining', 'down');
  check('setting a lock is accepted', r.ok === true && r.lock === 'down');
  check('and lands in the document, not in a copy', c.skillLocks.mining === 'down');
  check('and reads back', lockOf(st, 'mining') === 'down');
  const bad = setLock(st, 'mining', 'sideways');
  check('a lock nobody has is refused', bad.ok === false);
  check('and it says the three there are', /up, locked, down/.test(bad.reason), bad.reason);
  check('and the old lock is untouched', c.skillLocks.mining === 'down');
  const nope = setLock(st, 'juggling', 'up');
  check('a skill nobody has is refused too', nope.ok === false && /not a skill/.test(nope.reason), nope.reason);
  check('a skill with no lock set reads as up', lockOf(st, 'fishing') === 'up');
}

// ---- which abilities a skill gates ---------------------------------------------
check('Power Strike gates on Swordsmanship 30', thresholdFor(ABILITIES_BY_ID.powerStrike, 'swordsmanship') === 30);
check('and on Macefighting 30 too, being any weapon skill', thresholdFor(ABILITIES_BY_ID.powerStrike, 'macefighting') === 30);
check('and not on Mining at all', thresholdFor(ABILITIES_BY_ID.powerStrike, 'mining') === null);
check('Whirlwind also answers to Tactics, which is its extra requirement', thresholdFor(ABILITIES_BY_ID.whirlwind, 'tactics') === 40);
{
  const rows = abilitiesOf('swordsmanship');
  check('Swordsmanship gates a list of abilities', rows.length > 0, String(rows.length));
  check('and they are cheapest first', rows.every((r, i) => i === 0 || rows[i - 1].at <= r.at), rows.map((r) => r.at).join(','));
  check('a skill nobody wrote abilities for gates none', abilitiesOf('masonry').length === 0);
}

// ---- unlocked and unlocks next, both directions ---------------------------------
{
  const none = standingFor('swordsmanship', {}, {});
  check('at Swordsmanship 0 nothing is unlocked', none.unlocked.length === 0);
  check('and the next thing is named', !!none.next, none.next?.name);
  check('with the rules own reason for the refusal', /needs/.test(none.nextReason || ''), none.nextReason);
  const some = standingFor('swordsmanship', { swordsmanship: 30 }, {});
  check('at 30 Power Strike is unlocked', some.unlocked.some((a) => a.id === 'powerStrike'), some.unlocked.map((a) => a.name).join(','));
  check('and the next one is higher than 30', some.nextAt > 30, String(some.nextAt));
  const most = standingFor('swordsmanship', Object.fromEntries(SKILLS.map((s) => [s.id, 100])), { str: 100, dex: 100, int: 100, con: 100, wis: 100 });
  check('at 100 in everything the row has nothing left to promise', most.next === null, most.next?.name || 'none');
  check('and everything it gates is unlocked', most.unlocked.length === abilitiesOf('swordsmanship').length, `${most.unlocked.length}`);
}

// ---- every skill can say something about itself ------------------------------------
{
  const skills = Object.fromEntries(SKILLS.map((s) => [s.id, 0]));
  const silent = SKILLS.filter((s) => {
    const st = standingFor(s.id, skills, {});
    return st.unlocked.length === 0 && !st.next && !s.description;
  });
  check('no skill card would be blank', silent.length === 0, silent.map((s) => s.id).join(','));
  const t = Object.values(skills).reduce((a, b) => a + b, 0);
  check('and the sheet totals against the 700 cap', TOTAL_CAP === 700 && t === 0);
}

// ---- the art on the card ------------------------------------------------------------
console.log('skills: the art');
{
  const audit = auditSkillArt();
  check('the art audit passes at import and counts what it found',
    audit.skills === 52 && audit.groups === 9, JSON.stringify(audit));
  check('all fifty two are painted today', audit.painted === 52 && SKILLS.every((s) => skillIcon(s.id)),
    `${audit.painted} painted`);
  check('every one of the nine groups has a colour and a mark',
    SKILL_GROUPS.every((g) => GROUP_COLOUR[g] && SKILL_MARK[g]),
    SKILL_GROUPS.filter((g) => !GROUP_COLOUR[g] || !SKILL_MARK[g]).join(',') || 'all nine');
  check('and nothing else does, so a tenth group cannot borrow one',
    Object.keys(GROUP_COLOUR).length === 9 && Object.keys(SKILL_MARK).length === 9);
  const mining = SKILLS.find((s) => s.id === 'mining');
  check('a painted skill draws its own painting at 112 px',
    /<img[^>]*icons\/skills\/mining\.webp[^>]*width="112"/.test(skillArt(mining, 112)), skillArt(mining, 112).slice(0, 90));
  // drive it the other way: an unpainted skill falls back to its group's mark
  const unpainted = { id: 'juggling', name: 'Juggling', group: 'Body', description: 'not a skill yet' };
  const svg = skillArt(unpainted, 112);
  check('an unpainted skill falls back to the drawn mark for its group, in that group s colour',
    svg.startsWith('<svg') && svg.includes(SKILL_MARK.Body) && svg.includes(GROUP_COLOUR.Body), svg.slice(0, 70));
  check('a gated ability draws its own painting at chip size',
    /<img[^>]*icons\/abilities\/powerStrike\.webp[^>]*width="24"/.test(abilityChipArt(ABILITIES_BY_ID.powerStrike, 24)));
}

// ---- the bar, before any of it is drawn ------------------------------------------------
console.log('skills: the bar');
{
  check('there is a tick every ten, and neither end is one',
    TICKS.length === 9 && TICKS[0] === 10 && TICKS[8] === 90 && TICKS.every((t) => t % 10 === 0), TICKS.join(','));
  check('the fill is the value as a percentage of the hundred cap',
    barView(31.4).pct === 31.4 && barView(0).pct === 0 && barView(100).pct === 100 && barView(33.44).pct === 33.44,
    [barView(31.4).pct, barView(33.44).pct].join(' '));
  check('and a number outside the cap cannot draw outside the trough',
    barView(140).pct === 100 && barView(-9).pct === 0 && barView(undefined).pct === 0);

  // the band under the fill, driven across every edge in the table
  check('a value sits in the band the rules put it in',
    BANDS.every((b, i) => bandIndexAt(b.min) === i && bandIndexAt(b.max - 0.01) === i),
    BANDS.map((b, i) => `${b.min}:${bandIndexAt(b.min)}=${i}`).join(' '));
  check('and 100 is shown in the last band, which is where the last point came from',
    bandIndexAt(100) === BANDS.length - 1 && bandIndexAt(-4) === 0);
  check('the step the bar names is the step skills.js would give',
    BANDS.every((b) => barView(b.min).step === gainStep(b.min) && barView(b.max - 0.01).step === gainStep(b.max - 0.01)),
    BANDS.map((b) => `${b.min}:${barView(b.min).step}`).join(' '));
  check('the line beside the bar reads the value and what a success is worth',
    stepText(31.4, 'up') === '31.4, gains 0.2 a success', stepText(31.4, 'up'));
  check('and it changes with the band, not with a guess',
    stepText(10, 'up') === '10.0, gains 0.3 a success'
    && stepText(60, 'up') === '60.0, gains 0.1 a success'
    && stepText(96, 'up') === '96.0, gains 0.01 a success',
    [stepText(10, 'up'), stepText(60, 'up'), stepText(96, 'up')].join(' | '));
  check('a grandmaster is told there is nothing above it, rather than promised 0',
    stepText(100, 'up') === '100.0, grandmaster', stepText(100, 'up'));
  check('a locked skill is not promised a gain rollGain would refuse',
    stepText(31.4, 'locked') === '31.4, locked and will not rise'
    && stepText(31.4, 'down') === '31.4, marked to fall and will not rise',
    [stepText(31.4, 'locked'), stepText(31.4, 'down')].join(' | '));
}

// ---- the filter row and the count line ---------------------------------------------------
console.log('skills: the filters');
{
  check('the filter row is All and then the nine groups, in the document s order',
    FILTERS.length === 10 && FILTERS[0].id === 'all'
    && FILTERS.slice(1).map((f) => f.id).join('|') === SKILL_GROUPS.join('|'),
    FILTERS.map((f) => f.label).join(', '));
  check('inFilter drives both ways',
    inFilter(SKILLS[0], 'all') === true
    && inFilter(SKILLS[0], SKILLS[0].group) === true
    && inFilter(SKILLS[0], 'Magic') === false);
  const all = sheetFor('all');
  check('the sheet shows all nine sections and all fifty two cards',
    all.length === 9 && all.flatMap((s) => s.rows).length === 52,
    `${all.length} sections, ${all.flatMap((s) => s.rows).length} cards`);
  const magicCount = SKILLS.filter((s) => s.group === 'Magic').length;
  const magic = sheetFor('Magic');
  check('a group filter shows that group and nothing else',
    magic.length === 1 && magic[0].rows.length === magicCount && magic[0].rows.every((s) => s.group === 'Magic'),
    `${magic[0].rows.length} of ${magicCount}`);
  check('the count line reads skills, points, and what is placed',
    countText(412.6) === '52 skills, 700 points, 412.6 placed', countText(412.6));
  check('and says how many are shown only when a filter is hiding some',
    countText(412.6, magicCount) === `52 skills, 700 points, 412.6 placed, ${magicCount} shown`
    && countText(412.6, 52) === '52 skills, 700 points, 412.6 placed',
    countText(412.6, magicCount));
  check('an empty sheet reads 0.0 placed rather than nothing at all',
    countText(0) === '52 skills, 700 points, 0.0 placed', countText(0));
}

// ---- the real page, in the fake document ---------------------------------------------------
console.log('skills: the real page');
{
  const character = { skills: { mining: 31.4, swordsmanship: 30, tactics: 100, fishing: 0 }, skillLocks: {}, stats: {} };
  const said = [];
  const marked = [];
  const ctx = {
    character,
    hud: { log: (t, k) => said.push(`${k || ''}:${t}`) },
    onSkillLock: (id, lock) => marked.push(`${id}=${lock}`),
  };
  const host = document.createElement('div');
  panel.build(host, ctx);

  const find = (node, pred, out = []) => {
    if (pred(node)) out.push(node);
    for (const c of node.children) find(c, pred, out);
    return out;
  };
  const cards = () => find(host, (n) => n.classList.contains('bw-card'));
  const cardOf = (id) => cards().find((c) => c.dataset.skill === id);
  const partOf = (card, cls) => find(card, (n) => n.classList.contains(cls));
  const headings = () => find(host, (n) => n.tagName === 'H3');
  const chips = () => find(host, (n) => n.classList.contains('bw-f'));
  const countEl = find(host, (n) => n.classList.contains('bw-count'))[0];

  check('the page draws one card per skill, all fifty two', cards().length === 52, String(cards().length));
  check('under nine group headings, in the document s order',
    headings().length === 9 && headings().map((n) => n.textContent).join('|') === SKILL_GROUPS.join('|'),
    headings().map((n) => n.textContent).join(', '));
  check('with a filter chip for All and each group', chips().length === 10, String(chips().length));

  // 1. every card carries its own painting
  const missingArt = cards().filter((c) => {
    const tile = partOf(c, 'bw-tile')[0];
    return !tile || !new RegExp(`<img[^>]*icons/skills/${c.dataset.skill}\\.webp`).test(tile.innerHTML);
  });
  check('every one of the fifty two cards carries an img of its own skill s painting, at 112 px',
    missingArt.length === 0 && cards().every((c) => /width="112"/.test(partOf(c, 'bw-tile')[0].innerHTML)),
    missingArt.map((c) => c.dataset.skill).join(',') || 'all fifty two');
  check('and the name and the description are the table s own words, not a summary',
    partOf(cardOf('mining'), 'bw-name')[0].textContent === 'Mining'
    && partOf(cardOf('mining'), 'bw-desc')[0].textContent === SKILLS.find((s) => s.id === 'mining').description);

  // 2. the bar width is the value
  const widthOf = (id) => partOf(cardOf(id), 'bw-fill')[0].style.width;
  check('a bar is as wide as its skill is high',
    widthOf('mining') === '31.4%' && widthOf('tactics') === '100%' && widthOf('fishing') === '0%',
    [widthOf('mining'), widthOf('tactics'), widthOf('fishing')].join(' '));
  check('a skill the document has never heard of draws an empty bar and a 0.0',
    widthOf('masonry') === '0%' && partOf(cardOf('masonry'), 'bw-val')[0].textContent === '0.0');
  check('the number beside it is the same value to one decimal',
    partOf(cardOf('mining'), 'bw-val')[0].textContent === '31.4'
    && partOf(cardOf('tactics'), 'bw-val')[0].textContent === '100.0');
  check('every bar carries nine ticks and six band segments',
    cards().every((c) => partOf(c, 'bw-tick').length === 9 && partOf(c, 'bw-band').length === BANDS.length),
    `${partOf(cards()[0], 'bw-tick').length} ticks, ${partOf(cards()[0], 'bw-band').length} bands`);

  // 3. the band the value stands in is the one that is lit
  const litOf = (id) => partOf(cardOf(id), 'bw-band').filter((b) => b.classList.contains('on'));
  check('exactly one band is lit on every card',
    cards().every((c) => partOf(c, 'bw-band').filter((b) => b.classList.contains('on')).length === 1));
  check('and it is the band the value stands in, at 31.4, at 30, at 0 and at 100',
    litOf('mining')[0].dataset.band === String(bandIndexAt(31.4))
    && litOf('swordsmanship')[0].dataset.band === String(bandIndexAt(30))
    && litOf('fishing')[0].dataset.band === '0'
    && litOf('tactics')[0].dataset.band === String(BANDS.length - 1),
    [litOf('mining')[0].dataset.band, litOf('swordsmanship')[0].dataset.band, litOf('fishing')[0].dataset.band, litOf('tactics')[0].dataset.band].join(' '));
  check('the line beside the bar names the value and the step for that band',
    partOf(cardOf('mining'), 'bw-step')[0].textContent === '31.4, gains 0.2 a success',
    partOf(cardOf('mining'), 'bw-step')[0].textContent);
  check('and a grandmaster card says so and is marked',
    partOf(cardOf('tactics'), 'bw-step')[0].textContent === '100.0, grandmaster'
    && cardOf('tactics').classList.contains('gm'),
    partOf(cardOf('tactics'), 'bw-step')[0].textContent);

  // the count line, against the rules layer's own total
  check('the count line is the fifty two, the seven hundred, and the sum of the sheet',
    countEl.textContent === `52 skills, 700 points, ${total(lockState(character)).toFixed(1)} placed`,
    countEl.textContent);

  // 4. the lock cycles up, locked, down, and says so every time
  const lockBtn = () => partOf(cardOf('mining'), 'bw-lock')[0];
  check('a card starts at up, with the up glyph',
    lockBtn().textContent === LOCK_GLYPH.up && lockBtn().classList.contains('up'), lockBtn().textContent);
  lockBtn().fire('click');
  check('one click locks it', character.skillLocks.mining === 'locked'
    && lockBtn().textContent === LOCK_GLYPH.locked && lockBtn().classList.contains('locked'));
  check('and it is said out loud, in the words the sheet uses',
    said[said.length - 1] === `:Mining is ${LOCK_WORDS.locked}`, said[said.length - 1]);
  check('and the save is told', marked[marked.length - 1] === 'mining=locked', marked.join(' '));
  check('a locked card reads muted and its bar no longer promises a gain',
    cardOf('mining').classList.contains('held')
    && partOf(cardOf('mining'), 'bw-step')[0].textContent === '31.4, locked and will not rise',
    partOf(cardOf('mining'), 'bw-step')[0].textContent);
  lockBtn().fire('click');
  check('the second click marks it to fall', character.skillLocks.mining === 'down'
    && lockBtn().textContent === LOCK_GLYPH.down
    && cardOf('mining').classList.contains('falling')
    && partOf(cardOf('mining'), 'bw-step')[0].textContent === '31.4, marked to fall and will not rise');
  lockBtn().fire('click');
  check('and the third brings it back to up, muting nothing',
    character.skillLocks.mining === 'up' && lockBtn().textContent === LOCK_GLYPH.up
    && !cardOf('mining').classList.contains('held') && !cardOf('mining').classList.contains('falling'));
  check('the bar is untouched by the whole cycle', widthOf('mining') === '31.4%', widthOf('mining'));
  check('and the hover words are on the button for all three',
    /Mining rises with use/.test(lockBtn().title), lockBtn().title);
  // windows.js styles every button in a panel as Cormorant 14 in parchment
  // unless it carries .bw-btn, which would put this row and this glyph in a
  // different voice from the ability book's chips. The cycle above rewrites
  // the lock's className, so this is checked after it, not before.
  check('the chips and the lock are real buttons and keep windows.js s bw-btn exemption',
    chips().every((c) => c.tagName === 'BUTTON' && c.classList.contains('bw-btn'))
    && lockBtn().tagName === 'BUTTON' && lockBtn().classList.contains('bw-btn'),
    lockBtn().className);

  // 5. the unlock chips
  const swordChips = partOf(cardOf('swordsmanship'), 'bw-u');
  const swordRows = abilitiesOf('swordsmanship');
  check('the unlocks row holds one chip per ability the skill gates',
    swordChips.length === swordRows.length, `${swordChips.length} of ${swordRows.length}`);
  check('and each chip is that ability s own painting at 24 px',
    swordChips.every((c, i) => new RegExp(`icons/abilities/${swordRows[i].ability.id}\\.webp`).test(c.innerHTML))
    && swordChips.every((c) => /width="24"/.test(c.innerHTML)),
    swordChips[0].innerHTML.slice(0, 80));
  const standing = standingFor('swordsmanship', character.skills, character.stats);
  const lit = swordChips.filter((c) => c.classList.contains('on'));
  const have = swordChips.filter((c) => c.classList.contains('have'));
  check('what is yours is bright and what is not is dim',
    have.length === standing.unlocked.length && have.length > 0,
    `${have.length} of ${swordChips.length}`);
  check('exactly one chip is lit, and it is the next one the rules would open',
    lit.length === 1 && new RegExp(standing.next.name).test(lit[0].title), lit[0]?.title);
  check('and the sentence under the row names it and the mark it wants',
    partOf(cardOf('swordsmanship'), 'bw-next')[0].textContent === `${standing.next.name} at ${standing.nextAt}`,
    partOf(cardOf('swordsmanship'), 'bw-next')[0].textContent);
  // The reason line drives both ways. Rend's own reason is "Rend needs
  // Swordsmanship 45", which is the short line again, so it is not repeated.
  // Tactics 40 is only half of what Whirlwind wants, so the Tactics card would
  // promise an unlock the rules refuse if it stopped at "Whirlwind at 40".
  check('the rules own reason is not repeated when this skill is the whole of it',
    standing.nextReason === `${standing.next.name} needs Swordsmanship ${standing.nextAt}, you are at ${skillNumber(character.skills.swordsmanship)}`
    && standing.otherNeeds.length === 0
    && partOf(cardOf('swordsmanship'), 'bw-why')[0].textContent === ''
    && partOf(cardOf('swordsmanship'), 'bw-why')[0].style.display === 'none',
    standing.nextReason);
  const tac = standingFor('tactics', character.skills, character.stats);
  check('and it is printed when the rules want something the card does not name',
    tac.next.name === 'Whirlwind' && tac.nextAt === 40
    && tac.nextReason === `Whirlwind needs Swordsmanship 50, you are at ${skillNumber(character.skills.swordsmanship)} and Tactics 40`
    && tac.otherNeeds.map((p) => p.id).join(',') === 'swordsmanship'
    && partOf(cardOf('tactics'), 'bw-next')[0].textContent === 'Whirlwind at 40'
    && partOf(cardOf('tactics'), 'bw-why')[0].textContent === tac.nextReason,
    `${partOf(cardOf('tactics'), 'bw-next')[0].textContent} / ${partOf(cardOf('tactics'), 'bw-why')[0].textContent}`);
  check('a skill that gates nothing draws no chips and promises nothing',
    partOf(cardOf('masonry'), 'bw-u').length === 0
    && partOf(cardOf('masonry'), 'bw-next')[0].textContent === ''
    && partOf(cardOf('masonry'), 'bw-next')[0].style.display === 'none');
  const widest = Math.max(...cards().map((c) => partOf(c, 'bw-u').length));
  check('the widest unlock row is a number a card can hold', widest <= 20,
    `widest row ${widest} chips, Tactics has ${partOf(cardOf('tactics'), 'bw-u').length}`);

  // driven the other way: everything at 100 leaves nothing to promise
  for (const s of SKILLS) character.skills[s.id] = 100;
  character.stats = { str: 100, dex: 100, int: 100, con: 100, wis: 100 };
  panel.tick(1);
  check('at 100 in everything no chip is lit and the card says the row is finished',
    partOf(cardOf('swordsmanship'), 'bw-u').every((c) => !c.classList.contains('on'))
    && partOf(cardOf('swordsmanship'), 'bw-u').every((c) => c.classList.contains('have'))
    && partOf(cardOf('swordsmanship'), 'bw-next')[0].textContent === 'everything it opens is yours',
    partOf(cardOf('swordsmanship'), 'bw-next')[0].textContent);
  check('every bar is full and every card is a grandmaster',
    cards().every((c) => partOf(c, 'bw-fill')[0].style.width === '100%' && c.classList.contains('gm')));
  check('and the count line goes gold past the seven hundred',
    countEl.classList.contains('full') && /5200\.0 placed/.test(countEl.textContent), countEl.textContent);

  // put the sheet back somewhere ordinary for the filter checks
  for (const s of SKILLS) delete character.skills[s.id];
  character.skills.mining = 31.4;
  character.skills.magery = 55;
  panel.tick(1);

  // 6. the filter chips filter
  const chipNamed = (label) => chips().find((c) => c.textContent === label);
  chipNamed('Magic').fire('click');
  const magicSkills = SKILLS.filter((s) => s.group === 'Magic');
  check('clicking a group chip leaves only that group s cards',
    cards().length === magicSkills.length && cards().every((c) => magicSkills.some((s) => s.id === c.dataset.skill)),
    `${cards().length} of ${magicSkills.length}`);
  check('and one heading', headings().length === 1 && headings()[0].textContent === 'Magic', headings().map((n) => n.textContent).join(','));
  check('the chip that is on is the one that was clicked',
    chips().filter((c) => c.classList.contains('on')).length === 1
    && chipNamed('Magic').classList.contains('on') && !chipNamed('All').classList.contains('on'));
  check('the count line says how many are shown now',
    countEl.textContent === `52 skills, 700 points, ${total(lockState(character)).toFixed(1)} placed, ${magicSkills.length} shown`,
    countEl.textContent);
  check('and the surviving cards still carry their bars and their paintings',
    widthOf('magery') === '55%'
    && /icons\/skills\/magery\.webp/.test(partOf(cardOf('magery'), 'bw-tile')[0].innerHTML)
    && partOf(cardOf('magery'), 'bw-step')[0].textContent === '55.0, gains 0.1 a success',
    partOf(cardOf('magery'), 'bw-step')[0].textContent);
  check('a skill outside the filter is not drawn at all', cardOf('mining') === undefined);
  chipNamed('All').fire('click');
  check('and All brings all fifty two back', cards().length === 52 && !!cardOf('mining'), String(cards().length));
  check('with the bar it had before the filter', widthOf('mining') === '31.4%', widthOf('mining'));

  // the lock that was set survives a rebuild, because it lives in the document
  character.skillLocks.magery = 'down';
  panel.tick(1);
  check('a lock set before a rebuild is still read after it',
    partOf(cardOf('magery'), 'bw-lock')[0].textContent === LOCK_GLYPH.down
    && cardOf('magery').classList.contains('falling'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
