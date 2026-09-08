// Generated from the user's game-ready asset library (2026-09-05), 512 px webp,
// filed under the game's own ids so a lookup is a property read. Regenerate by
// re-running the import; do not hand-edit the tables. The functions at the
// bottom are the API the HUD, the bag, the paper doll and the book use.
//
// Coverage is measured, not assumed: icon_art.test.mjs proves every path here
// is a real file under public/, and prints the bases that still have no art.

/** ability id -> path under public/. 84 of 84 abilities. */
export const ABILITY_ICONS = {
  'aimedShot': 'icons/abilities/aimedShot.webp',
  'arcaneMastery': 'icons/abilities/arcaneMastery.webp',
  'backstab': 'icons/abilities/backstab.webp',
  'bandage': 'icons/abilities/bandage.webp',
  'battleCry': 'icons/abilities/battleCry.webp',
  'beastCall': 'icons/abilities/beastCall.webp',
  'berserk': 'icons/abilities/berserk.webp',
  'bless': 'icons/abilities/bless.webp',
  'blink': 'icons/abilities/blink.webp',
  'boneSpear': 'icons/abilities/boneSpear.webp',
  'camp': 'icons/abilities/camp.webp',
  'recall': 'icons/abilities/recall.webp',   // a stand in: Sanctuary's ring until Recall has its own painting
  'chainLightning': 'icons/abilities/chainLightning.webp',
  'cleanse': 'icons/abilities/cleanse.webp',
  'consecrateWeapon': 'icons/abilities/consecrateWeapon.webp',
  'corpseExplosion': 'icons/abilities/corpseExplosion.webp',
  'cripplingShot': 'icons/abilities/cripplingShot.webp',
  'crushingBlow': 'icons/abilities/crushingBlow.webp',
  'curseOfWeakness': 'icons/abilities/curseOfWeakness.webp',
  'disarm': 'icons/abilities/disarm.webp',
  'discord': 'icons/abilities/discord.webp',
  'deepCut': 'icons/items/dagger.webp',
  'disengage': 'icons/abilities/disengage.webp',
  'doubleShot': 'icons/abilities/doubleShot.webp',
  'dualStrike': 'icons/items/dagger.webp',
  'eldritchBolt': 'icons/abilities/eldritchBolt.webp',
  'elementalKin': 'icons/abilities/elementalKin.webp',
  'evasion': 'icons/abilities/evasion.webp',
  'exposeWeakness': 'icons/abilities/exposeWeakness.webp',
  'fear': 'icons/abilities/fear.webp',
  'fireball': 'icons/abilities/fireball.webp',
  'fleetFoot': 'icons/abilities/fleetFoot.webp',
  'finishingStrike': 'icons/items/dagger.webp',
  'frostNova': 'icons/abilities/frostNova.webp',
  'greaterHeal': 'icons/abilities/greaterHeal.webp',
  'heal': 'icons/abilities/heal.webp',
  'hex': 'icons/abilities/hex.webp',
  'hide': 'icons/abilities/hide.webp',
  'huntersMark': 'icons/abilities/huntersMark.webp',
  'iceShard': 'icons/abilities/iceShard.webp',
  'jump': 'icons/abilities/jump.webp',
  'kidneyShot': 'icons/items/dagger.webp',
  'layOnHands': 'icons/abilities/layOnHands.webp',
  'leapSlam': 'icons/abilities/leapSlam.webp',
  'lichForm': 'icons/abilities/lichForm.webp',
  'lifeDrain': 'icons/abilities/lifeDrain.webp',
  'lightning': 'icons/abilities/lightning.webp',
  'lullaby': 'icons/abilities/lullaby.webp',
  'lunge': 'icons/abilities/lunge.webp',
  'magicArrow': 'icons/abilities/magicArrow.webp',
  'manaShield': 'icons/abilities/manaShield.webp',
  'marchingSong': 'icons/abilities/marchingSong.webp',
  'meditate': 'icons/abilities/meditate.webp',
  'meteor': 'icons/abilities/meteor.webp',
  'peace': 'icons/abilities/peace.webp',
  'pickPocket': 'icons/abilities/pickPocket.webp',
  'piercingArrow': 'icons/abilities/piercingArrow.webp',
  'poisonBlade': 'icons/abilities/poisonBlade.webp',
  'powerStrike': 'icons/abilities/powerStrike.webp',
  'provoke': 'icons/abilities/provoke.webp',
  'raiseChampion': 'icons/abilities/raiseChampion.webp',
  'raiseSkeleton': 'icons/abilities/raiseSkeleton.webp',
  'rend': 'icons/abilities/rend.webp',
  'resurrect': 'icons/abilities/resurrect.webp',
  'rift': 'icons/abilities/rift.webp',
  'riposte': 'icons/abilities/riposte.webp',
  'sanctuary': 'icons/abilities/sanctuary.webp',
  'shadowstep': 'icons/abilities/shadowstep.webp',
  'shieldBash': 'icons/abilities/shieldBash.webp',
  'smite': 'icons/abilities/smite.webp',
  'snare': 'icons/abilities/snare.webp',
  'spellPlague': 'icons/abilities/spellPlague.webp',
  'sprint': 'icons/abilities/sprint.webp',
  'stoneSkin': 'icons/abilities/stoneSkin.webp',
  'summonHound': 'icons/abilities/summonHound.webp',
  'summonImp': 'icons/abilities/summonImp.webp',
  'sweep': 'icons/abilities/sweep.webp',
  'transmute': 'icons/abilities/transmute.webp',
  'throwingKnife': 'icons/items/dagger.webp',
  'vanish': 'icons/abilities/vanish.webp',
  'volley': 'icons/abilities/volley.webp',
  'warDrum': 'icons/abilities/warDrum.webp',
  'ward': 'icons/abilities/ward.webp',
  'whirlwind': 'icons/abilities/whirlwind.webp'
};

/** item base id -> path under public/. A single item, or a small stack. */
export const ITEM_ICONS = {
  'antidote': 'icons/items/antidote.webp',
  'apple': 'icons/items/apple.webp',
  'arrow': 'icons/items/arrow-bundle.webp',
  'ash_log': 'icons/items/ash-log.webp',
  'axe': 'icons/items/axe.webp',
  'bandage': 'icons/items/bandage.webp',
  'battleaxe': 'icons/items/battleaxe.webp',
  'bear_meat': 'icons/items/bear-meat.webp',
  'beech_log': 'icons/items/beech-log.webp',
  'berry_preserve': 'icons/items/berry-preserve.webp',
  'birch_log': 'icons/items/birch-log.webp',
  'blackberry': 'icons/items/blackberry.webp',
  'blueberry': 'icons/items/blueberry.webp',
  'boar_meat': 'icons/items/boar-meat.webp',
  'bone_staff': 'icons/items/bone-staff.webp',
  'bramble_jelly': 'icons/items/bramble-jelly.webp',
  'bread': 'icons/items/bread.webp',
  'bronze_ingot': 'icons/items/bronze-ingot.webp',
  'buckler': 'icons/items/buckler.webp',
  'cabbage': 'icons/items/cabbage.webp',
  'cacao': 'icons/items/cacao-pods.webp',
  'cacao_bar': 'icons/items/cacao-bar.webp',
  'cactus_wood': 'icons/items/cactus-wood.webp',
  'carrot': 'icons/items/carrot.webp',
  'chanterelle': 'icons/items/chanterelle.webp',
  'cheese': 'icons/items/cheese.webp',
  'cloth_outfit': 'icons/items/cloth-robe.webp',
  'coldiron_ingot': 'icons/items/coldiron-ingot.webp',
  'coldiron_ore': 'icons/items/coldiron-ore.webp',
  'copper_ingot': 'icons/items/copper-ingot.webp',
  'copper_ore': 'icons/items/copper-ore.webp',
  'crab_meat': 'icons/items/crab-meat.webp',
  'crossbow': 'icons/items/crossbow.webp',
  'dagger': 'icons/items/dagger.webp',
  'dandelion': 'icons/items/dandelion.webp',
  'dandelion_tonic': 'icons/items/dandelion-tonic.webp',
  'deadwood': 'icons/items/deadwood-log.webp',
  'draught_of_vigour': 'icons/items/draught-of-vigour.webp',
  'egg': 'icons/items/egg.webp',
  'elderberry': 'icons/items/elderberry.webp',
  'emberite_ingot': 'icons/items/emberite-ingot.webp',
  'emberite_ore': 'icons/items/emberite-ore.webp',
  'fiddlehead': 'icons/items/fiddlehead-fern.webp',
  'fig': 'icons/items/wild-figs.webp',
  'fig_and_honey': 'icons/items/figs-in-honey.webp',
  'fir_log': 'icons/items/fir-log.webp',
  'fish': 'icons/items/fish.webp',
  'fish_pie': 'icons/items/fish-pie.webp',
  'fists': 'icons/items/fists.webp',
  'fly_agaric': 'icons/items/fly-agaric.webp',
  'forest_broth': 'icons/items/forest-broth.webp',
  'game_meat': 'icons/items/game-meat.webp',
  'gem': 'icons/items/garnet-gem.webp',
  'ginger_broth': 'icons/items/ginger-broth.webp',
  'glaive': 'icons/items/glaive.webp',
  'greatsword': 'icons/items/greatsword.webp',
  'halberd': 'icons/items/halberd.webp',
  'hazelnut': 'icons/items/hazelnut.webp',
  'healing_draught': 'icons/items/healing-draught.webp',
  'heartwood_log': 'icons/items/heartwood-log.webp',
  'hearty_stew': 'icons/items/hearty-stew.webp',
  'herb_salad': 'icons/items/herb-salad.webp',
  'hide': 'icons/items/hide.webp',
  'holy_book': 'icons/items/holy-book.webp',
  'honey': 'icons/items/wild-honey.webp',
  'honey_bread': 'icons/items/honey-bread.webp',
  'honey_cake': 'icons/items/honey-cake.webp',
  'iron_ingot': 'icons/items/iron-ingot.webp',
  'iron_ore': 'icons/items/iron-ore.webp',
  'ironbark_log': 'icons/items/ironbark-log.webp',
  'kite': 'icons/items/kite-shield.webp',
  'leather_outfit': 'icons/items/leather-tunic.webp',
  'lingon_relish': 'icons/items/lingonberry-relish.webp',
  'lingonberry': 'icons/items/lingonberry.webp',
  'lockpick': 'icons/items/lockpick.webp',
  'longbow': 'icons/items/longbow.webp',
  'longsword': 'icons/items/longsword.webp',
  'lute': 'icons/items/lute.webp',
  'mace': 'icons/items/mace.webp',
  'mana_tonic': 'icons/items/mana-tonic.webp',
  'maul': 'icons/items/maul.webp',
  'morel': 'icons/items/morel.webp',
  'mushroom_stew': 'icons/items/mushroom-stew.webp',
  'mutton': 'icons/items/mutton.webp',
  'nettle': 'icons/items/nettle.webp',
  'nightsight_draught': 'icons/items/draught-of-nightsight.webp',
  'nut': 'icons/items/chestnuts.webp',
  'nut_bread': 'icons/items/nut-bread.webp',
  'oak_log': 'icons/items/oak-log.webp',
  'onion': 'icons/items/onion.webp',
  'oyster_grill': 'icons/items/grilled-oyster-mushrooms.webp',
  'oyster_mushroom': 'icons/items/oyster-mushroom.webp',
  'palm_log': 'icons/items/palm-log.webp',
  'pickaxe': 'icons/items/pickaxe.webp',
  'pine_log': 'icons/items/pine-log.webp',
  'porcini': 'icons/items/porcini.webp',
  'potion': 'icons/items/potion.webp',
  'quarterstaff': 'icons/items/quarterstaff.webp',
  'rapier': 'icons/items/rapier.webp',
  'raspberry': 'icons/items/raspberry.webp',
  'rat_meat': 'icons/items/rat-meat.webp',
  'reagent': 'icons/items/reagent.webp',
  'reagent_pouch': 'icons/items/reagent-pouch.webp',
  'rimesteel_ingot': 'icons/items/rimesteel-ingot.webp',
  'rimesteel_ore': 'icons/items/rimesteel-ore.webp',
  'ring_outfit': 'icons/items/ringmail-breastplate.webp',
  'roast_chestnuts': 'icons/items/roast-chestnuts.webp',
  'roast_fowl': 'icons/items/roast-fowl.webp',
  'rosehip': 'icons/items/rosehip.webp',
  'rosehip_tea': 'icons/items/rosehip-tea.webp',
  'sakura_log': 'icons/items/sakura-log.webp',
  'scaled_hide': 'icons/items/scaled-hide.webp',
  'shortbow': 'icons/items/shortbow.webp',
  'shortsword': 'icons/items/shortsword.webp',
  'silver_ingot': 'icons/items/silver-ingot.webp',
  'silver_ore': 'icons/items/silver-ore.webp',
  'skull': 'icons/items/skull.webp',
  'smith_hammer': 'icons/items/smiths-hammer.webp',
  'spear': 'icons/items/spear.webp',
  'spiced_wine': 'icons/items/spiced-wine.webp',
  'spruce_log': 'icons/items/spruce-log.webp',
  'staff': 'icons/items/staff.webp',
  'starfall_ingot': 'icons/items/starfall-ingot.webp',
  'starfall_ore': 'icons/items/starfall-ore.webp',
  'strawberry_tart': 'icons/items/strawberry-tart.webp',
  'studded_outfit': 'icons/items/leather-tunic.webp',
  'thick_hide': 'icons/items/thick-hide.webp',
  'throwing_knives': 'icons/items/throwing-knives.webp',
  'tin_ore': 'icons/items/tin-ore.webp',
  'tongs': 'icons/items/tongs.webp',
  'travellers_ration': 'icons/items/travellers-ration.webp',
  'turnip': 'icons/items/turnip.webp',
  'venison': 'icons/items/venison.webp',
  'verdite_ingot': 'icons/items/verdite-ingot.webp',
  'verdite_ore': 'icons/items/verdite-ore.webp',
  'voidrock_ingot': 'icons/items/voidrock-ingot.webp',
  'voidrock_ore': 'icons/items/voidrock-ore.webp',
  'wand': 'icons/items/wand.webp',
  'warhammer': 'icons/items/warhammer.webp',
  'chain_outfit': 'icons/items/ringmail-breastplate.webp',
  'plate_outfit': 'icons/items/ringmail-breastplate.webp',
  'wild_garlic': 'icons/items/wild-garlic.webp',
  'wild_ginger': 'icons/items/wild-ginger.webp',
  'wild_strawberry': 'icons/items/wild-strawberry.webp',
  'willow_log': 'icons/items/willow-log.webp',
  'wolf_meat': 'icons/items/wolf-meat.webp',
  'woodland_poison': 'icons/items/woodland-poison.webp',
};

/** item base id -> the stacked drawing, shown from STACK_AT of them. */
export const STACK_ICONS = {
  'bronze_ingot': 'icons/items/bronze-ingots.webp',
  'coldiron_ingot': 'icons/items/coldiron-ingots.webp',
  'copper_ingot': 'icons/items/copper-ingots.webp',
  'emberite_ingot': 'icons/items/emberite-ingots.webp',
  'iron_ingot': 'icons/items/iron-ingots.webp',
  'rimesteel_ingot': 'icons/items/rimesteel-ingots.webp',
  'silver_ingot': 'icons/items/silver-ingots.webp',
  'starfall_ingot': 'icons/items/starfall-ingots.webp',
  'verdite_ingot': 'icons/items/verdite-ingots.webp',
  'voidrock_ingot': 'icons/items/voidrock-ingots.webp'
};

/** gem id (ores.js GEMS) -> path, for a gem that carries its material. */
export const GEM_ICONS = {
  'amber': 'icons/items/amber-gem.webp',
  'diamond': 'icons/items/diamond-gem.webp',
  'garnet': 'icons/items/garnet-gem.webp',
  'jade': 'icons/items/jade-gem.webp',
  'ruby': 'icons/items/ruby-gem.webp',
  'sapphire': 'icons/items/sapphire-gem.webp',
  'starstone': 'icons/items/starstone-gem.webp'
};

/** skill id -> path under public/. 0 of 0 skills. */
export const SKILL_ICONS = {
  'alchemy': 'icons/skills/alchemy.webp',
  'anatomy': 'icons/skills/anatomy.webp',
  'animalLore': 'icons/skills/animalLore.webp',
  'animalTaming': 'icons/skills/animalTaming.webp',
  'archery': 'icons/skills/archery.webp',
  'blacksmithing': 'icons/skills/blacksmithing.webp',
  'camping': 'icons/skills/camping.webp',
  'carpentry': 'icons/skills/carpentry.webp',
  'chivalry': 'icons/skills/chivalry.webp',
  'cooking': 'icons/skills/cooking.webp',
  'detectHidden': 'icons/skills/detectHidden.webp',
  'discordance': 'icons/skills/discordance.webp',
  'evaluatingIntelligence': 'icons/skills/evaluatingIntelligence.webp',
  'fencing': 'icons/skills/fencing.webp',
  'fishing': 'icons/skills/fishing.webp',
  'fletching': 'icons/skills/fletching.webp',
  'focus': 'icons/skills/focus.webp',
  'foraging': 'icons/skills/foraging.webp',
  'healing': 'icons/skills/healing.webp',
  'herding': 'icons/skills/herding.webp',
  'hiding': 'icons/skills/hiding.webp',
  'inscription': 'icons/skills/inscription.webp',
  'lockpicking': 'icons/skills/lockpicking.webp',
  'lumberjacking': 'icons/skills/lumberjacking.webp',
  'macefighting': 'icons/skills/macefighting.webp',
  'magery': 'icons/skills/magery.webp',
  'marksmanship': 'icons/skills/marksmanship.webp',
  'masonry': 'icons/skills/masonry.webp',
  'meditation': 'icons/skills/meditation.webp',
  'mining': 'icons/skills/mining.webp',
  'musicianship': 'icons/skills/musicianship.webp',
  'mysticism': 'icons/skills/mysticism.webp',
  'necromancy': 'icons/skills/necromancy.webp',
  'parrying': 'icons/skills/parrying.webp',
  'peacemaking': 'icons/skills/peacemaking.webp',
  'poisoning': 'icons/skills/poisoning.webp',
  'polearms': 'icons/skills/polearms.webp',
  'provocation': 'icons/skills/provocation.webp',
  'removeTrap': 'icons/skills/removeTrap.webp',
  'resistingSpells': 'icons/skills/resistingSpells.webp',
  'skinning': 'icons/skills/skinning.webp',
  'spiritSpeak': 'icons/skills/spiritSpeak.webp',
  'stealing': 'icons/skills/stealing.webp',
  'stealth': 'icons/skills/stealth.webp',
  'swimming': 'icons/skills/swimming.webp',
  'swordsmanship': 'icons/skills/swordsmanship.webp',
  'tactics': 'icons/skills/tactics.webp',
  'tailoring': 'icons/skills/tailoring.webp',
  'tinkering': 'icons/skills/tinkering.webp',
  'tracking': 'icons/skills/tracking.webp',
  'veterinary': 'icons/skills/veterinary.webp',
  'wrestling': 'icons/skills/wrestling.webp'
};

/** Codex tab id -> small flat SVG, drawn in code like the rest of the HUD chrome. */
export const TAB_ICONS = {
  character: '<path d="M12 4 a4 4 0 1 1 0 8 a4 4 0 0 1 0 -8 z M5 21 c.8 -4.7 3.2 -7 7 -7 s6.2 2.3 7 7 z"/>',
  skills: '<path d="M4 5 h7 c1.1 0 2 .9 2 2 v13 c-.6 -.8 -1.3 -1 -2 -1 H4 z M20 5 h-7 c-1.1 0 -2 .9 -2 2 v13 c.6 -.8 1.3 -1 2 -1 h7 z M12 7 v13"/>',
  abilities: '<path d="M12 2 l2.2 7.8 L22 12 l-7.8 2.2 L12 22 l-2.2 -7.8 L2 12 l7.8 -2.2 z"/>',
  crafting: '<path d="M14.5 3 l6.5 6.5 -2.4 2.4 -2 -2 -8.9 8.9 -3.5 .9 .9 -3.5 8.9 -8.9 -2 -2 z M3 21 h18"/>',
  map: '<path d="M3 5 l5 -2 8 3 5 -2 v15 l-5 2 -8 -3 -5 2 z M8 3 v15 M16 6 v15"/>',
};

/** One codex tab icon, as an inline SVG string. */
export function tabIcon(id, colour = 'currentColor', size = 17) {
  const body = TAB_ICONS[id] || TAB_ICONS.map;
  return `<svg class="bw-tab-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${colour}" aria-hidden="true">${body}</svg>`;
}

export function binIcon(colour = 'currentColor', size = 16) {
  return `<svg class="bw-bin-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 7 V5 h8 v2 M5 7 h14 M8 10 v8 M12 10 v8 M16 10 v8 M7 7 l1 14 h8 l1 -14"/>
  </svg>`;
}

/** How many of a thing make the stacked picture. Five ingots is a stack; two is two ingots. */
export const STACK_AT = 5;

/** Where public/ is served from. Vite's base in the browser, the root in node. */
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
export const iconUrl = (path) => (path ? BASE + path : null);

/** The icon for an ability id, or null when the book still draws it. */
export function abilityIcon(id) {
  return iconUrl(ABILITY_ICONS[id] || null);
}

/**
 * The icon for an item: the base (an id or a base record), how many, and the
 * material if the item carries one that has its own picture (a ruby is not a
 * garnet). Null when the theme's drawn glyph should stand in.
 */
export function itemIcon(base, { count = 1, material = null } = {}) {
  const id = typeof base === 'string' ? base : base && base.id;
  if (!id) return null;
  if (id === 'gem' && material && GEM_ICONS[material]) return iconUrl(GEM_ICONS[material]);
  if (count >= STACK_AT && STACK_ICONS[id]) return iconUrl(STACK_ICONS[id]);
  return iconUrl(ITEM_ICONS[id] || null);
}

/** An <img> for an icon path, sized, with no alt text because the name is always beside it. */
export function iconImg(src, size, cls = 'bw-g') {
  return `<img class="${cls} bw-img" src="${src}" width="${size}" height="${size}" alt="" draggable="false">`;
}

/** The icon for a skill id, or null when the sheet still draws its mark. */
export function skillIcon(id) {
  return iconUrl(SKILL_ICONS[id] || null);
}
