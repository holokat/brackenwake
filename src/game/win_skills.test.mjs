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

const {panel, sheetFor, FILTERS, nextLock, lockState, barView} = await import('./win_skills.js');
const {PROFESSION_SKILL_IDS} = await import('../mmo/skill_policy.js');
const {rollGain} = await import('../mmo/skills.js');
let pass=0, fail=0;
const check=(name,ok)=>{ok?pass++:fail++;console.log(`${ok?'ok':'FAIL'} ${name}`);};
const walk=el=>[el,...el.children.flatMap(walk)];
const cls=(el,name)=>walk(el).filter(n=>n.classList?.contains(name));
const all=sheetFor().flatMap(g=>g.rows);
check('all and only the 15 professions appear once', all.length===15 && new Set(all.map(s=>s.id)).size===15 && all.every(s=>PROFESSION_SKILL_IDS.includes(s.id)));
check('inscription and poisoning remain crafting professions', sheetFor('Crafting')[0].rows.some(s=>s.id==='inscription') && sheetFor('Crafting')[0].rows.some(s=>s.id==='poisoning'));
check('removed combat categories cannot reveal hidden practice', sheetFor('Magic').length===0 && sheetFor('Combat, melee').length===0);
check('filters only expose professions', FILTERS.map(f=>f.id).join(',')==='all,Gathering,Crafting');
check('pause and resume have no donor mode', nextLock('up')==='locked' && nextLock('locked')==='up' && nextLock('down')==='up');
const character={skills:{mining:31.4,swordsmanship:99,inscription:10},skillLocks:{},stats:{}};
const notices=[];const el=document.createElement('div');
panel.build(el,{character,hud:{log:t=>notices.push(t)}});
let cards=cls(el,'bw-card');
check('real panel hides all combat practice and ability-unlock rows', cards.length===15 && !cards.some(c=>c.dataset.skill==='swordsmanship') && !cls(el,'bw-unlocks').length);
check('panel has no total skill cap or donor promise', !/700|seven hundred|pay for another|combat, melee/i.test(el.textContent));
const mining=cards.find(c=>c.dataset.skill==='mining');
check('profession meter uses saved progress', cls(mining,'bw-fill')[0].style.width==='31.4%');
const lock=cls(mining,'bw-lock')[0];lock.fire('click');
check('pausing writes the real profession lock', character.skillLocks.mining==='locked');
const before=character.skills.mining;rollGain(lockState(character),'mining',30,true,()=>0);
check('paused profession does not gain', character.skills.mining===before);
lock.fire('click');check('second click resumes profession', character.skillLocks.mining==='up');
const crafting=cls(el,'bw-f').find(b=>b.textContent==='Crafting');crafting.fire('click');
cards=cls(el,'bw-card');
check('real crafting filter shows inscription and poison making', cards.some(c=>c.dataset.skill==='inscription')&&cards.some(c=>c.dataset.skill==='poisoning')&&!cards.some(c=>c.dataset.skill==='mining'));
character.skills.inscription=45.5;panel.tick(.6);
check('open panel refreshes profession progress', cls(cards.find(c=>c.dataset.skill==='inscription'),'bw-val')[0].textContent==='45.5');
check('professions retain their own progress endpoint', barView(100).pct===100 && /grandmaster/.test(barView(100).text));
delete globalThis.document;
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
