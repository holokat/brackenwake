// Class ownership and tree topology only. Ability effects remain in abilities.js.
// Planned nodes describe future work and MUST be refused by every purchase gate.
// A shared ability keeps one runtime identity even when two classes can learn it.

// Explicit power milestones, independent of how many siblings a tree has.
// Area bursts and capstones must not unlock early just because a path is short.
const LIVE_LEVELS = {
  magicArrow:1, lightning:6, blink:10, eldritchBolt:14, hex:20, manaShield:26,
  chainLightning:42, arcaneMastery:62, rift:82, transmute:50,
  fireball:2, spellPlague:42, meteor:62, iceShard:2, stoneSkin:10,
  frostNova:18, ward:42, elementalKin:62,
  powerStrike:1, rend:6, lunge:14, crushingBlow:42, sweep:26,
  whirlwind:14, battleCry:26, berserk:62, shieldBash:2, disarm:14,
  riposte:26, leapSlam:42,
  dualStrike:1, deepCut:6, poisonBlade:14, kidneyShot:26, finishingStrike:62,
  throwingKnife:2, evasion:14, exposeWeakness:42, hide:1, backstab:6,
  pickPocket:10, shadowstep:26, vanish:42,
  aimedShot:1, doubleShot:6, piercingArrow:26, volley:62,
  snare:2, cripplingShot:14, disengage:26, huntersMark:2, fleetFoot:14, beastCall:42,
  heal:1, cleanse:6, greaterHeal:18, layOnHands:62, bless:10,
  sanctuary:62, consecrateWeapon:6, smite:14, resurrect:42,
  lifeDrain:6, curseOfWeakness:14, fear:26, boneSpear:42,
};
const PLANNED_LEVELS = [10, 18, 26, 34, 42, 50, 62, 74, 82];
const title = id => id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
const nodeId = (classId, specId, id) => `${classId}.${specId}.${id}`;

/** Compact authoring format; the exported catalogue is ordinary serializable data.
 * live: [ability ID, prerequisite ability IDs]; planned: [ID, name, mechanic,
 * prerequisite local IDs]. Prerequisites are all required, each at rank one.
 * Layout has a root and two parallel lanes. Level gates are explicit rather
 * than inferred from visual position. No planned node gates a live ability.
 */
function spec(classId, id, name, description, live, planned) {
  const entries = [
    ...live.map(([abilityId, requires = []], index) => ({
      id: abilityId, abilityId, name: title(abilityId), status: 'live',
      level: classId === 'priest' && abilityId === 'eldritchBolt' ? 1
        : classId === 'priest' && abilityId === 'smite' ? 2 : LIVE_LEVELS[abilityId], requires,
    })),
    ...planned.map(([localId, nodeName, mechanic, requires = []], index) => ({
      id: localId, name: nodeName, description: mechanic, status: 'planned',
      level: mechanic.startsWith('Planned capstone:') ? 82
        : PLANNED_LEVELS[Math.min(index, PLANNED_LEVELS.length - 1)],
      requires, maxRank: 1,
    })),
  ];
  // A node cannot advertise an earlier level than its prerequisite.
  const byLocalId = Object.fromEntries(entries.map(node => [node.id, node]));
  const requiredLevel = node => Math.max(node.level, ...node.requires.map(id => requiredLevel(byLocalId[id])));
  for (const node of entries) node.level = requiredLevel(node);
  return { id, name, description, nodes: entries.map((node, index) => ({
    ...node, id: nodeId(classId, id, node.id),
    requires: node.requires.map(required => nodeId(classId, id, required)),
    row: index ? Math.ceil(index / 2) : 0,
    column: index ? (index % 2 ? 0 : 2) : 1,
  })) };
}

export const CLASS_TREES = [
  { id: 'mage', name: 'Mage', branches: [
    spec('mage', 'arcane', 'Arcane', 'Build a spell sequence, choose when to spend mana, and control where a fight happens.', [
      ['magicArrow'], ['lightning', ['magicArrow']], ['blink', ['magicArrow']],
      ['eldritchBolt', ['lightning']], ['hex', ['blink']],
      ['manaShield', ['blink']], ['chainLightning', ['lightning']],
      ['arcaneMastery', ['eldritchBolt']], ['rift', ['chainLightning', 'hex']],
      ['transmute', ['hex']],
    ], [
      ['arcaneCharges', 'Arcane charges', 'Planned: successive Magic Arrow hits build up to three charges. Lightning consumes them for stronger damage and a higher mana cost; missing or changing targets does not create a charge.', ['magicArrow', 'lightning']],
      ['echoingRift', 'Echoing rift', 'Planned: a Lightning cast into your Rift repeats once at reduced strength on trapped enemies. The repeat spends no charge, cannot trigger itself, and inherits the original caster.', ['rift', 'arcaneCharges']],
    ]),
    spec('mage', 'fire', 'Fire', 'Maintain a burn, gather enemies, and commit to a telegraphed burst.', [
      ['fireball'], ['spellPlague', ['fireball']], ['meteor', ['fireball']],
    ], [
      ['kindling', 'Kindling', 'Planned: Fireball against a target already burning from your Fireball extends that burn up to a fixed duration cap instead of creating overlapping copies.', ['fireball']],
      ['flashover', 'Flashover', 'Planned: consecutive direct fire critical hits prepare an instant Fireball. Damage over time and triggered repeats cannot build the sequence.', ['fireball']],
      ['cinderTrail', 'Cinder trail', 'Planned: moving after a completed Fireball leaves a short burning trail. A target can take one trail tick per interval regardless of overlapping segments.', ['kindling']],
      ['controlledBurn', 'Controlled burn', 'Planned: choose a longer, weaker burn or a shorter, stronger burn for Fireball. The alternatives replace each other and preserve a declared total-damage budget.', ['kindling']],
      ['ashfall', 'Ashfall', 'Planned: Meteor leaves a brief burning area after impact. Leaving the area ends new applications; a missed impact still creates the marked area.', ['meteor']],
      ['spreadingFlame', 'Spreading flame', 'Planned: a burning enemy defeated by you spreads a reduced burn to one nearby enemy. A spread burn cannot spread again.', ['kindling']],
      ['plagueFuel', 'Plague fuel', 'Planned: direct fire damage against your Spell Plague restores a small amount of mana, limited by a per-caster interval. Plague bursts cannot trigger the refund.', ['spellPlague']],
      ['phoenixStep', 'Phoenix step', 'Planned: taking a large direct hit grants one short movement burst and consumes the prepared defense. Periodic damage cannot trigger it.', ['cinderTrail']],
      ['combustion', 'Combustion', 'Planned capstone: consume your remaining Fireball burn for an immediate burst and empower the next Meteor. The consumed burn cannot also finish ticking.', ['controlledBurn', 'ashfall']],
    ]),
    spec('mage', 'frost', 'Frost', 'Control pursuit, prepare a frozen target, and trade movement for protection.', [
      ['iceShard'], ['stoneSkin', ['iceShard']], ['frostNova', ['iceShard']],
      ['ward', ['stoneSkin']], ['elementalKin', ['ward']],
    ], [
      ['shatter', 'Shatter', 'Planned: your next direct Ice Shard against a target rooted by your Frost Nova gains critical chance and consumes that root. Other roots do not qualify.', ['iceShard', 'frostNova']],
      ['deepChill', 'Deep chill', 'Planned: repeated Ice Shard hits build chill stacks that improve its slow up to a cap. Root-immune enemies remain slow-immune where their existing immunity requires it.', ['iceShard']],
      ['iceFloes', 'Ice floes', 'Planned: a successful Frost Nova prepares one cast that can finish while moving. The charge is consumed when that cast starts.', ['frostNova']],
      ['glacialShelter', 'Glacial shelter', 'Planned: while standing in your Ward, being struck grants a limited frost absorb. Leaving the area prevents new absorbs and does not refill an existing one.', ['ward']],
      ['brittleIce', 'Brittle ice', 'Planned: when your own root breaks from damage, it applies a short slow instead of being refreshed. Reapplication cannot create a permanent root loop.', ['shatter']],
      ['coldSnap', 'Cold snap', 'Planned: an active defensive reset refreshes Frost Nova and Stone Skin once, with its own independent cooldown that it cannot reset.', ['stoneSkin', 'frostNova']],
      ['winterHeart', 'Winter heart', 'Planned capstone: consume accumulated chill on nearby enemies to create a brief protective storm. Damage and shielding scale with consumed stacks, with explicit target and absorb caps.', ['deepChill', 'glacialShelter']],
    ]),
  ] },
  { id: 'warrior', name: 'Warrior', branches: [
    spec('warrior', 'arms', 'Arms', 'Choose a weapon approach and time deliberate strikes around wounds and openings.', [
      ['powerStrike'], ['rend', ['powerStrike']], ['lunge', ['powerStrike']],
      ['crushingBlow', ['powerStrike']], ['sweep', ['powerStrike']],
    ], [
      ['openWound', 'Open wound', 'Planned: Power Strike against your own Rend adds a capped amount of bleed duration. It does not duplicate the bleed or reward somebody else’s wound.', ['powerStrike', 'rend']],
      ['measuredReach', 'Measured reach', 'Planned: a Lunge from outside ordinary melee range empowers the next landed melee hit. Repeated point-blank lunges cannot prepare it.', ['lunge']],
      ['weaponDiscipline', 'Weapon discipline', 'Planned: choose blade wounds, mace armor breaking, or polearm reach. Only the selected discipline applies, and only with its matching equipped weapon.', ['powerStrike']],
      ['mortalWound', 'Mortal wound', 'Planned: a new heavy strike applies a short healing-received reduction. It requires an explicit healing modifier reader and immunity handling.', ['openWound']],
      ['sweepingEdge', 'Sweeping edge', 'Planned: Sweep transfers a reduced copy of your Rend to one additional target. Transferred wounds cannot trigger further transfers.', ['rend', 'sweep']],
      ['executionWindow', 'Execution window', 'Planned: a low-health enemy enables a stamina-expensive finishing attack. Target health is checked again when damage resolves.', ['crushingBlow']],
      ['warMastersBlow', 'Warmaster’s blow', 'Planned capstone: strike consumes your active wound or armor-break setup for a different payoff, according to the selected weapon discipline.', ['weaponDiscipline', 'mortalWound']],
    ]),
    spec('warrior', 'fury', 'Fury', 'Sustain pressure and choose how much defense to give up during a burst.', [
      ['whirlwind'], ['battleCry', ['whirlwind']], ['berserk', ['whirlwind']],
    ], [
      ['bloodRush', 'Blood rush', 'Planned: consecutive landed melee hits build a short-lived momentum resource. Misses do not build it, and leaving combat clears it.', ['whirlwind']],
      ['recklessRhythm', 'Reckless rhythm', 'Planned: spending momentum increases attack speed while reducing armor for the same duration. The tradeoff has a fixed stack cap.', ['bloodRush']],
      ['bloodthirst', 'Bloodthirst', 'Planned: a new single-target attack heals from actual damage dealt, up to a per-use cap. Overkill and blocked damage cannot increase the heal.', ['bloodRush']],
      ['cleavingBlows', 'Cleaving blows', 'Planned: Whirlwind prepares a limited number of attacks that splash reduced damage to one nearby target. Splash cannot create more prepared attacks.', ['whirlwind']],
      ['rallyingRoar', 'Rallying roar', 'Planned: Battle Cry briefly supplies temporary health to nearby allies. Expiration removes only remaining temporary health and cannot kill the ally.', ['battleCry']],
      ['battleTrance', 'Battle trance', 'Planned: repeated hits on the same target reduce stamina costs while attacks on another target end the trance.', ['bloodRush']],
      ['lastReserve', 'Last reserve', 'Planned: crossing a low-health threshold restores a capped amount of stamina once per encounter window. Healing across the threshold cannot repeatedly farm it.', ['berserk']],
      ['temperedRage', 'Tempered rage', 'Planned: choose a weaker armor penalty during Berserk or stronger damage with a larger penalty. Both variants retain a visible drawback.', ['berserk']],
      ['unboundFury', 'Unbound fury', 'Planned capstone: spend all momentum to extend the current Berserk, up to a fixed extension cap, while suspending new momentum generation.', ['recklessRhythm', 'temperedRage']],
    ]),
    spec('warrior', 'protection', 'Protection', 'Block a dangerous hit, interrupt its follow-up, and protect an ally’s position.', [
      ['shieldBash'], ['disarm', ['shieldBash']], ['riposte', ['shieldBash']],
      ['leapSlam', ['shieldBash']],
    ], [
      ['shieldBlock', 'Shield block', 'Planned: prepare a limited number of stronger blocks for a short window. Each resolved eligible block consumes one charge.', ['shieldBash']],
      ['revenge', 'Revenge', 'Planned: a successful block or parry enables one counterattack. Spending the opportunity cannot itself generate another opportunity.', ['riposte']],
      ['taunt', 'Taunt', 'Planned: force an eligible hostile target to attack you briefly, then retain only the explicitly assigned threat. Boss immunity and multiplayer authority must be implemented.', ['shieldBash']],
      ['intervene', 'Intervene', 'Planned: move to an ally and intercept one direct attack within a short window. An attack can be intercepted once across the whole party.', ['leapSlam']],
      ['brace', 'Brace', 'Planned: standing still with a shield increases the value of the next block; moving clears the preparation. It never blocks attacks that bypass shields.', ['shieldBlock']],
      ['holdTheLine', 'Hold the line', 'Planned: after a block, nearby allies behind you gain a small defensive benefit. Facing, area membership, and refresh rules must be measured.', ['shieldBlock']],
      ['shieldWall', 'Shield wall', 'Planned: a defensive active reduces incoming damage while reducing your damage dealt for the same window. It cannot be active after the shield is removed.', ['brace']],
      ['unbroken', 'Unbroken', 'Planned capstone: a lethal eligible hit leaves you alive once, consumes the prepared guard, and applies a long lockout. Simultaneous hits share the same consumed state.', ['shieldWall', 'intervene']],
    ]),
  ] },
  { id: 'rogue', name: 'Rogue', branches: [
    spec('rogue', 'assassination', 'Assassination', 'Prepare poison and wounds, then spend the opening on a decisive finish.', [
      ['dualStrike'], ['deepCut', ['dualStrike']], ['poisonBlade', ['dualStrike']],
      ['kidneyShot', ['deepCut']], ['finishingStrike', ['deepCut', 'poisonBlade']],
    ], [
      ['venomCycle', 'Venom cycle', 'Planned: alternate direct dagger hits and poison ticks to build a capped venom resource. Repeated ticks alone cannot fill it.', ['poisonBlade']],
      ['serratedWound', 'Serrated wound', 'Planned: Deep Cut against a poisoned target lengthens its wound up to a cap. Cleansing poison prevents subsequent extensions.', ['deepCut', 'poisonBlade']],
      ['envenom', 'Envenom', 'Planned: spend venom on a direct poison finisher, consuming the accumulated stacks rather than duplicating their future damage.', ['venomCycle']],
      ['nerveStrike', 'Nerve strike', 'Planned: when Kidney Shot ends naturally, its target deals less damage briefly. Repeated stuns do not indefinitely refresh the reduction.', ['kidneyShot']],
      ['potentMixture', 'Potent mixture', 'Planned: choose a slower damaging poison or a weaker poison that impairs healing. The choice replaces the enchant recipe and keeps existing item costs.', ['poisonBlade']],
      ['cutToTheQuick', 'Cut to the quick', 'Planned: Finishing Strike against a target bearing your wound refunds part of its stamina cost once. The refund is based on the amount actually paid.', ['finishingStrike']],
      ['venomousEnd', 'Venomous end', 'Planned capstone: Envenom on a wounded low-health target detonates part of its remaining poison. The damage calculation excludes overkill and removed ticks.', ['envenom', 'serratedWound']],
    ]),
    spec('rogue', 'combat', 'Combat', 'Fight in the open, manage an exposed target, and turn a dodge into pressure.', [
      ['throwingKnife'], ['evasion', ['throwingKnife']], ['exposeWeakness', ['throwingKnife']],
    ], [
      ['bladeTempo', 'Blade tempo', 'Planned: alternating main-hand and off-hand hits builds tempo; using the same hand twice resets the sequence. Tempo has a fixed cap.', ['throwingKnife']],
      ['ripplingSteel', 'Rippling steel', 'Planned: spend tempo to make the next melee hit splash to one additional nearby target. Splash cannot build tempo.', ['bladeTempo']],
      ['kick', 'Kick', 'Planned: a short-range interrupt stops an interruptible cast and briefly locks that spell school. Noncasting targets still consume the action.', ['throwingKnife']],
      ['riposteWindow', 'Riposte window', 'Planned: dodging an attack during Evasion prepares a single counterstrike, with a per-window cap against crowds.', ['evasion']],
      ['relentlessAssault', 'Relentless assault', 'Planned: consecutive attacks on your Expose Weakness target restore a capped amount of stamina; switching targets clears the sequence.', ['exposeWeakness']],
      ['bladeFlurry', 'Blade flurry', 'Planned: temporarily convert part of single-target melee damage into nearby cleave, with a stamina upkeep cost and a target cap.', ['ripplingSteel']],
      ['combatReadiness', 'Combat readiness', 'Planned: repeated direct attacks from the same enemy grant a capped defensive stack against that enemy. Changing attackers does not transfer protection.', ['riposteWindow']],
      ['disarmingCut', 'Disarming cut', 'Planned: a tempo spender disarms an eligible armed enemy briefly. Innate attacks and immune enemies retain their existing attack rules.', ['kick', 'bladeTempo']],
      ['killingSpree', 'Killing spree', 'Planned capstone: spend all tempo on a bounded sequence of strikes against the current target and nearby hostiles. Each step revalidates range, life state, and path.', ['bladeFlurry', 'relentlessAssault']],
    ]),
    spec('rogue', 'subtlety', 'Subtlety', 'Arrange the approach, choose the opening target, and leave before the return hit.', [
      ['hide'], ['backstab', ['hide']], ['pickPocket', ['hide']],
      ['shadowstep', ['backstab']], ['vanish', ['hide']],
    ], [
      ['patientAmbush', 'Patient ambush', 'Planned: remaining hidden without attacking prepares a stronger first Backstab, with a preparation cap and clear reset on detection.', ['hide', 'backstab']],
      ['premeditation', 'Premeditation', 'Planned: mark one enemy while hidden to prepare a resource for your opener. Changing the marked enemy discards the earlier preparation.', ['hide']],
      ['shadowDance', 'Shadow dance', 'Planned: briefly permit attacks that require hiding while remaining visible. This grants ability eligibility and does not itself erase enemy aggro.', ['backstab']],
      ['smokeVeil', 'Smoke veil', 'Planned: place a smoke area that blocks eligible ranged targeting across its boundary. Line-of-sight, projectiles already in flight, and allies need explicit rules.', ['hide']],
      ['shadowRelay', 'Shadow relay', 'Planned: a successful Backstab after Shadowstep prepares one return to the recorded origin. The return expires and must validate collision and world layer.', ['backstab', 'shadowstep']],
      ['cleanEscape', 'Clean escape', 'Planned: Vanish removes a defined set of movement impairments but preserves damage-over-time effects that can reveal you again.', ['vanish']],
      ['masterOfShadows', 'Master of shadows', 'Planned capstone: your prepared opener creates a short window for a second positional attack; it consumes the preparation and cannot refresh its own window.', ['patientAmbush', 'shadowDance']],
    ]),
  ] },
  { id: 'ranger', name: 'Ranger', branches: [
    spec('ranger', 'marksmanship', 'Marksmanship', 'Prepare a firing position and choose precise pressure or a committed area volley.', [
      ['aimedShot'], ['doubleShot', ['aimedShot']], ['piercingArrow', ['aimedShot']],
      ['volley', ['doubleShot']],
    ], [
      ['steadyAim', 'Steady aim', 'Planned: standing still briefly prepares the next Aimed Shot for increased accuracy; movement or starting the shot consumes the preparation.', ['aimedShot']],
      ['carefulAim', 'Careful aim', 'Planned: Aimed Shot gains a bonus against an enemy above a declared health threshold. The threshold is evaluated when damage resolves.', ['aimedShot']],
      ['crossfire', 'Crossfire', 'Planned: Double Shot against two distinct nearby enemies prepares a stronger single-target follow-up. Both arrows still require ammunition.', ['doubleShot']],
      ['puncture', 'Puncture', 'Planned: Piercing Arrow leaves a short armor weakness that your next Aimed Shot consumes. Other players do not consume it.', ['piercingArrow']],
      ['rangedDiscipline', 'Ranged discipline', 'Planned: choose a longer stationary preparation bonus or a smaller bonus maintained during slow movement. The preparation rules replace each other.', ['steadyAim']],
      ['suppression', 'Suppression', 'Planned: Volley slows enemies only while its damage area remains active. Overlapping volleys do not multiply the slow.', ['volley']],
      ['killShot', 'Kill shot', 'Planned: a new ammunition-consuming shot is available below a low-health threshold and resolves eligibility at impact.', ['puncture']],
      ['trueShot', 'True shot', 'Planned capstone: a short precision window makes Aimed Shot, Double Shot, and Piercing Arrow build a three-step sequence with a payoff on completing all three.', ['rangedDiscipline', 'killShot']],
    ]),
    spec('ranger', 'survival', 'Survival', 'Arrange a trap, control pursuit, and make distance useful rather than permanent.', [
      ['snare'], ['cripplingShot', ['snare']], ['disengage', ['snare']],
    ], [
      ['trapcraft', 'Trapcraft', 'Planned: a trap placed out of combat arms faster and lasts longer. Moving an existing trap consumes it before creating the replacement.', ['snare']],
      ['barbedWire', 'Barbed wire', 'Planned: a target leaving your expired Snare receives a short bleed. Destroyed or disarmed traps cannot apply it.', ['snare']],
      ['explosiveTrap', 'Explosive trap', 'Planned: choose an explosive trap instead of the rooting Snare. Both occupy the same trap limit and cannot trigger each other.', ['trapcraft']],
      ['frostTrap', 'Frost trap', 'Planned: choose a persistent slowing field instead of the rooting Snare. It shares the same replacement choice as Explosive Trap.', ['trapcraft']],
      ['harpoon', 'Harpoon', 'Planned: an aimed tether closes distance to an eligible target without pulling bosses. It needs collision checks and a separate weapon requirement.', ['cripplingShot']],
      ['counterPursuit', 'Counter pursuit', 'Planned: Disengage after a close-range enemy hit prepares one trap that can be placed while moving, with a short expiration.', ['disengage']],
      ['lockAndLoad', 'Lock and load', 'Planned: your trap’s first successful trigger prepares a limited number of empowered shots. Each placed trap can grant the benefit once.', ['barbedWire']],
      ['fieldMedicine', 'Field medicine', 'Planned: a completed Bandage after Disengage restores some stamina. The bandage must consume its item and complete its normal interruptible channel.', ['disengage']],
      ['wildfireAmbush', 'Wildfire ambush', 'Planned capstone: triggering your selected trap prepares a shot whose effect matches that trap: bleed, explosion, or chill, with one payoff per trap.', ['lockAndLoad', 'counterPursuit']],
    ]),
    spec('ranger', 'beastmastery', 'Beast mastery', 'Fight beside a called beast and spend attention on its position and survival.', [
      ['huntersMark'], ['fleetFoot', ['huntersMark']], ['beastCall', ['huntersMark']],
    ], [
      ['bondedCompanion', 'Bonded companion', 'Planned: a dedicated companion persists beyond Beast Call’s temporary summon duration. Ownership, dismissal, death, save hydration, and pet limits must all be implemented.', ['beastCall']],
      ['killCommand', 'Kill command', 'Planned: command your owned living companion to use its next attack on the selected enemy. Range and path failure refuse the command without consuming its cost.', ['bondedCompanion']],
      ['mendCompanion', 'Mend companion', 'Planned: a heal over time affects only your owned living beast, with its own cost and recast rule. It cannot heal hostile or another player’s pets.', ['bondedCompanion']],
      ['packTactics', 'Pack tactics', 'Planned: alternating your direct hit and your companion’s hit on the marked target prepares a bounded bonus. Pet damage cannot count as both participants.', ['huntersMark', 'killCommand']],
      ['beastTraining', 'Beast training', 'Planned: choose a durable guardian beast or an aggressive hunting beast. The choice changes a declared pet profile, with a single companion limit.', ['bondedCompanion']],
      ['coordinatedPursuit', 'Coordinated pursuit', 'Planned: moving toward your companion briefly improves movement when both pursue the same marked enemy. Separation and direction are checked each update.', ['fleetFoot', 'packTactics']],
      ['protectiveBond', 'Protective bond', 'Planned: command the companion to intercept a bounded share of one direct hit on you. Interception cannot recursively trigger another interception.', ['beastTraining']],
      ['feralRecovery', 'Feral recovery', 'Planned: when your companion defeats your marked target, reduce the remaining cost of the next Mend Companion through a one-use credit, without generating money or items.', ['mendCompanion', 'huntersMark']],
      ['bestialWrath', 'Bestial wrath', 'Planned capstone: a short coordinated burst empowers you and the companion while limiting defensive commands. The state ends safely on pet death or dismissal.', ['packTactics', 'beastTraining']],
    ]),
  ] },
  { id: 'paladin', name: 'Paladin', branches: [
    spec('paladin', 'holy', 'Holy', 'Deliver direct healing while keeping a chosen ally ready for the next hit.', [
      ['heal'], ['cleanse', ['heal']], ['greaterHeal', ['heal']], ['layOnHands', ['greaterHeal']],
    ], [
      ['holyShock', 'Holy shock', 'Planned: a new instant spell heals an ally or damages an enemy using explicit target-dependent effects and a shared cooldown.', ['heal']],
      ['infusion', 'Infusion', 'Planned: an effective critical heal prepares one faster Greater Heal. Overhealing alone cannot trigger the preparation.', ['greaterHeal']],
      ['beaconOfLight', 'Beacon of light', 'Planned: choose one ally to receive a bounded portion of your effective direct healing on other allies. Copied healing cannot copy itself.', ['heal']],
      ['illuminatedMercy', 'Illuminated mercy', 'Planned: part of a completed direct heal becomes a capped absorb on its target, with replacement and expiry rules rather than unlimited accumulation.', ['greaterHeal']],
      ['cleanHands', 'Clean hands', 'Planned: Cleanse that actually removes an eligible effect restores a small amount of mana. Empty cleanses receive no refund.', ['cleanse']],
      ['steadfastPrayer', 'Steadfast prayer', 'Planned: completing consecutive stationary heals builds limited resistance to damage interruption. Movement clears the preparation.', ['greaterHeal']],
      ['savingGrace', 'Saving grace', 'Planned: healing a low-health ally prepares a limited defensive benefit on that ally. A per-target lockout prevents repeated threshold farming.', ['holyShock']],
      ['avengingMercy', 'Avenging mercy', 'Planned capstone: direct damage and effective direct healing alternate to build a short burst that strengthens Holy Shock. Copied heals and triggered damage do not advance it.', ['holyShock', 'beaconOfLight']],
    ]),
    spec('paladin', 'protection', 'Protection', 'Place a defended area and protect allies through a shield and holy support.', [
      ['shieldBash'], ['bless', ['shieldBash']], ['riposte', ['shieldBash']],
      ['ward', ['bless']], ['sanctuary', ['ward']],
    ], [
      ['righteousDefense', 'Righteous defense', 'Planned: select an ally and briefly redirect one eligible attacker to you. It requires authoritative target and threat changes and cannot redirect every enemy at once.', ['shieldBash']],
      ['holyShield', 'Holy shield', 'Planned: prepare a limited number of shield blocks that deal holy retaliation. Retaliation cannot trigger itself or spend a charge twice.', ['riposte']],
      ['consecratedGround', 'Consecrated ground', 'Planned: a new ground effect damages eligible hostiles and improves your defense while you stand within it. This is distinct from Consecrate Weapon.', ['ward']],
      ['blessingOfFreedom', 'Blessing of freedom', 'Planned: remove declared movement impairments from an ally and briefly prevent their reapplication. Stuns and encounter restrictions remain separate.', ['bless']],
      ['guardiansOath', 'Guardian’s oath', 'Planned: choose one ally to receive a limited damage transfer while close to you. Transfers cannot transfer again and stop on death, distance, or world-layer change.', ['righteousDefense']],
      ['aegisOfFaith', 'Aegis of faith', 'Planned: an effective shield block strengthens your next Ward up to a fixed cap. Recasting Ward consumes the preparation once.', ['holyShield', 'ward']],
      ['ardentDefender', 'Ardent defender', 'Planned capstone: a short defensive vow can prevent one lethal hit and consumes itself. Lethal-hit resolution, healing restrictions, and lockout must be one transaction.', ['guardiansOath', 'aegisOfFaith']],
    ]),
    spec('paladin', 'retribution', 'Retribution', 'Alternate melee commitment and holy attacks to prepare a costly finishing strike.', [
      ['powerStrike'], ['consecrateWeapon', ['powerStrike']], ['smite', ['powerStrike']],
      ['battleCry', ['consecrateWeapon']], ['crushingBlow', ['powerStrike']],
    ], [
      ['zeal', 'Zeal', 'Planned: alternating landed melee attacks and direct holy spell hits builds a capped zeal resource. Repeated use of one category does not build the sequence.', ['consecrateWeapon', 'smite']],
      ['judgment', 'Judgment', 'Planned: a new holy strike marks one enemy; your next qualifying melee hit consumes the mark for a declared benefit.', ['smite']],
      ['crusaderStrike', 'Crusader strike', 'Planned: a new melee attack builds zeal on a landed hit, with explicit mana or stamina cost rather than a new unconsumed resource field.', ['powerStrike']],
      ['divineStorm', 'Divine storm', 'Planned: spend zeal on capped melee area damage, trading single-target finishing power for a group hit.', ['zeal']],
      ['righteousPursuit', 'Righteous pursuit', 'Planned: moving toward your Judgment target grants a bounded speed bonus until the mark is consumed or distance stops closing.', ['judgment']],
      ['hammerOfWrath', 'Hammer of wrath', 'Planned: a ranged holy finisher requires a low-health enemy or an explicit capstone window; eligibility is rechecked at resolution.', ['smite', 'zeal']],
      ['avengingWrath', 'Avenging wrath', 'Planned capstone: spend stored zeal to enter a short holy burst that enables Hammer of Wrath, while suspending normal zeal generation.', ['divineStorm', 'hammerOfWrath']],
    ]),
  ] },
  { id: 'priest', name: 'Priest', branches: [
    spec('priest', 'holy', 'Holy', 'Prepare sustained healing, respond to wounds, and spend attention across allies.', [
      ['heal'], ['cleanse', ['heal']], ['greaterHeal', ['heal']],
      ['resurrect', ['greaterHeal']], ['layOnHands', ['greaterHeal']],
    ], [
      ['renew', 'Renew', 'Planned: a new healing-over-time spell has a fixed duration and refresh rule. Its ticks retain caster ownership and honor healing immunity.', ['heal']],
      ['prayerOfMending', 'Prayer of mending', 'Planned: apply a heal that triggers on a qualifying direct hit, then jumps to an eligible nearby ally for a limited number of charges.', ['heal']],
      ['serendipity', 'Serendipity', 'Planned: effective small direct heals prepare one faster Greater Heal, with a stack cap and a timeout.', ['greaterHeal']],
      ['circleOfHealing', 'Circle of healing', 'Planned: a new area heal selects a bounded number of injured allies using deterministic health and distance ordering.', ['renew']],
      ['lastingPrayer', 'Lasting prayer', 'Planned: Greater Heal on a target with your Renew extends that Renew up to a duration cap. It does not add another heal-over-time instance.', ['renew', 'greaterHeal']],
      ['guardianSpirit', 'Guardian spirit', 'Planned: protect one ally from one lethal eligible hit during a short window, consuming the protection and applying a declared recovery amount.', ['prayerOfMending']],
      ['divineHymn', 'Divine hymn', 'Planned capstone: a stationary interruptible channel heals a bounded nearby party each tick. Cancelled ticks neither spend reserved resources nor heal.', ['circleOfHealing', 'guardianSpirit']],
    ]),
    spec('priest', 'discipline', 'Discipline', 'Prepare mitigation, use a direct holy attack, and decide when offense supports recovery.', [
      ['smite'], ['bless', ['smite']], ['manaShield', ['smite']],
      ['ward', ['bless']], ['sanctuary', ['ward']],
    ], [
      ['powerWordShield', 'Power word: Shield', 'Planned: a new ally-targeted absorb has a fixed capacity, expiry, and per-target reapplication lockout. This is not the existing self-only Mana Shield.', ['bless']],
      ['atonement', 'Atonement', 'Planned: mark a limited number of allies; actual direct Smite damage heals those allies for a bounded share. Reflected, repeated, and transferred damage cannot trigger it.', ['smite']],
      ['penance', 'Penance', 'Planned: a new short channel damages an enemy or heals an ally with separately validated tick effects and one declared resource cost.', ['smite']],
      ['borrowedTime', 'Borrowed time', 'Planned: when your ally absorb is consumed by damage, prepare one faster direct cast. Expiry or replacement cannot trigger it.', ['powerWordShield']],
      ['painSuppression', 'Pain suppression', 'Planned: apply a short damage reduction to one ally, with explicit stacking rules against Ward and other reductions.', ['ward']],
      ['rapture', 'Rapture', 'Planned: an absorb consumed by damage returns a capped amount of mana once per caster interval. A self-inflicted transfer loop cannot farm refunds.', ['powerWordShield']],
      ['evangelism', 'Evangelism', 'Planned capstone: alternate effective healing and direct Smite hits to extend existing Atonement marks within a hard duration cap.', ['atonement', 'penance']],
    ]),
    spec('priest', 'shadow', 'Shadow', 'Sustain a draining target, control dangerous enemies, and choose how much health to risk.', [
      ['eldritchBolt'], ['lifeDrain', ['eldritchBolt']], ['curseOfWeakness', ['lifeDrain']], ['fear', ['lifeDrain']],
      ['boneSpear', ['lifeDrain']], ['spellPlague', ['curseOfWeakness']],
    ], [
      ['shadowWordPain', 'Shadow word: Pain', 'Planned: a new periodic shadow effect deals damage using an explicit supported damage type and refresh policy; no undocumented shadow resistance is assumed.', ['lifeDrain']],
      ['mindFlay', 'Mind flay', 'Planned: a new channel deals periodic damage and slows while channeled. Movement, interruption, death, and line-of-sight loss stop later ticks.', ['lifeDrain']],
      ['devouringPlague', 'Devouring plague', 'Planned: spend a capped resource earned from your own periodic damage on a draining effect. The spender’s ticks cannot build its own resource.', ['shadowWordPain', 'spellPlague']],
      ['vampiricEmbrace', 'Vampiric embrace', 'Planned: a bounded fraction of your actual direct spell damage heals nearby allies during a short window. Leech and copied healing cannot recurse.', ['lifeDrain']],
      ['dispersion', 'Dispersion', 'Planned: a defensive channel reduces incoming damage and restores mana while preventing offensive actions; cancellation ends both effects.', ['fear']],
      ['voidAscendance', 'Void ascendance', 'Planned capstone: consume the periodic-damage resource for a brief damage window that drains your health. It cannot spend the final health point or bypass healing restrictions.', ['devouringPlague', 'dispersion']],
    ]),
  ] },
];

export const CLASS_NODES = Object.fromEntries(CLASS_TREES.flatMap(tree =>
  tree.branches.flatMap(branch => branch.nodes.map(node => [node.id, node]))));
