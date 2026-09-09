import { baseFor } from '../../mmo/items.js';
import { SKILLS } from '../../mmo/skills.js';
import { bindAchievementEvents } from './events.js';
import { achievementState, addMetric, observeMetric, distinctMetric, unlockAchievements,
  personallyCrafted, selectAchievementTitle } from './progress.js';

export function createAchievementTracker({ character, state, actor, combat, enabled = () => true,
  notify = () => {}, recompute = () => {}, now = Date.now, landmarks = [] }) {
  const doc = achievementState(character);
  if (!doc.owner) doc.owner = globalThis.crypto?.randomUUID?.() || `settler-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fights = new Map();
  const dead = new WeakSet();
  let previous = null;
  let changed = false;
  const add = (metric, value = 1) => { changed = addMetric(doc, metric, value) || changed; };
  const observe = (metric, value) => { changed = observeMetric(doc, metric, value) || changed; };
  const distinct = (metric, key) => { changed = distinctMetric(doc, metric, key) || changed; };
  const eligible = () => enabled() && !actor?.godMode;
  function flush() {
    const unlocked = unlockAchievements(doc, now());
    if (unlocked.length) { recompute(actor); notify(unlocked); changed = true; }
    if (changed) { changed = false; state?.touch?.('achievements'); }
    return unlocked;
  }
  function observeCharacter() {
    if (!eligible()) return;
    const skills = SKILLS.map(s => character.skills?.[s.id] || 0);
    observe('skillMax', Math.max(0, ...skills));
    observe('skillTotal', skills.reduce((sum, value) => sum + value, 0));
    observe('skillsAt50', skills.filter(value => value >= 50).length);
    observe('ownArmorEquipped', Object.values(character.equipment || {}).filter(item =>
      baseFor(item)?.kind === 'armour' && personallyCrafted(character, item)).length);
    flush();
  }
  function record(event) {
    if (!eligible()) return false;
    const { type, item, recipe } = event;
    if (type === 'craftPrepared') { item.achievementMaker = doc.owner; return true; }
    if (type === 'craft') {
      distinct('recipes', recipe.id);
      if (recipe.skill === 'blacksmithing') { add('smithCrafts'); distinct('smithRecipes', recipe.id); }
      const base = baseFor(item);
      const equipment = ['weapon', 'armour', 'shield', 'tool'].includes(base?.kind);
      if (equipment) { add('equipmentCrafts', item.count || 1); if (event.exceptional) add('exceptionalCrafts'); }
      if (item.base === 'axe') add('craftedAxe');
      if (item.base === 'pickaxe') add('craftedPickaxe');
      if (base?.range && base?.skill === 'archery') add('craftedBow');
      if (item.base === 'arrow') add('arrows', item.count || 1);
      if (item.base === 'leather_outfit') add('leatherOutfit');
      if (recipe.skill === 'cooking') add('food', item.count || 1);
      if (item.base === 'healing_draught') add('tonics', item.count || 1);
    } else if (type === 'gather') {
      add(event.kind === 'wood' ? 'wood' : 'mining', event.count);
      if (personallyCrafted(character, event.tool)) add(event.kind === 'wood' ? 'ownAxeWood' : 'ownPickMining', event.count);
    } else if (type === 'forage') {
      distinct('forageKinds', event.id);
      if (event.id === 'dandelion') add('herbs', event.count);
    } else if (type === 'skin') add('skinned');
    else if (type === 'mark') distinct('markedSpecies', event.species);
    else if (type === 'summon') add('summons');
    else if (type === 'camp') add('campfire');
    else if (type === 'chest') distinct('chests', event.key);
    else if (type === 'trade') add('trade');
    else if (type === 'raidKill') add('kills');
    observeCharacter();
    return true;
  }
  function resolved({ attacker, defender, damage = 0, healthBefore = 0, kind, parried = false }) {
    if (!eligible()) { fights.clear(); return; }
    if (defender === actor) {
      if (damage > 0) for (const fight of fights.values()) fight.clean = false;
      if (parried && attacker?.faction === 'hostile') { add('blocks'); flush(); }
    }
    if (attacker !== actor || defender?.faction !== 'hostile' || damage <= 0) return;
    let fight = fights.get(defender);
    if (!fight || now() - fight.at > 60000 || healthBefore >= defender.maxHealth) {
      fight = { damage: 0, clean: healthBefore >= defender.maxHealth && actor.health >= actor.maxHealth, own: true };
      fights.set(defender, fight);
    }
    fight.at = now();
    fight.damage += Math.min(damage, healthBefore);
    fight.kind = kind === 'melee' ? (actor.weapon?.ranged ? 'ranged' : 'melee') : 'spell';
    fight.own &&= kind === 'melee' && personallyCrafted(character, character.equipment?.mainHand);
    if (fights.size > 128) fights.delete(fights.keys().next().value);
  }
  function killed(who, killer) {
    const fight = fights.get(who);
    fights.delete(who);
    if (!eligible() || dead.has(who) || killer !== actor || who.faction !== 'hostile' || !fight || fight.damage < Math.max(1, who.maxHealth * .1)) return;
    dead.add(who);
    add('kills');
    if (who.monsterId === 'giantRat' || who.id === 'giantRat') add('ratKills');
    if (fight.kind !== 'spell') add(fight.kind === 'ranged' ? 'rangedKills' : 'meleeKills');
    if (fight.own) add('craftedKills');
    if (fight.clean && fight.damage >= who.maxHealth) add('cleanKill');
    flush();
  }
  function position({ x, z, dungeon = null, night = false }) {
    if (!eligible()) { previous = null; fights.clear(); return; }
    if (dungeon) {
      distinct('dungeonFloors', `${dungeon.siteId}:${dungeon.level}`);
      previous = null;
    } else if (Number.isFinite(x) && Number.isFinite(z)) {
      if (previous && Math.hypot(x - previous.x, z - previous.z) < 16 && (x !== previous.x || z !== previous.z)) distinct('outdoorTiles', `${Math.floor(x / 4)},${Math.floor(z / 4)}`);
      previous = { x, z };
      for (const place of landmarks) if (Math.hypot(x - place.x, z - place.z) <= place.radius) {
        distinct('discoveries', place.id); distinct('landmarks', place.id);
        if (night) distinct('nightLandmarks', place.id);
      }
    }
    observeCharacter();
  }
  const off = [bindAchievementEvents(character, record), combat?.onResolved?.(resolved), combat?.onDeath?.(killed)];
  observeCharacter();
  return { record, position, observeCharacter, resolved, killed,
    selectTitle(id) { if (!selectAchievementTitle(character, id)) return false; state?.touch?.('achievements'); return true; },
    dispose() { off.forEach(fn => fn?.()); fights.clear(); },
  };
}
