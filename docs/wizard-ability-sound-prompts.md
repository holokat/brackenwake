# Wizard ability sound prompts

These are proposed sound designs for Brackenwake, not generated or integrated audio. The coverage comes from the 18 abilities in the Wizard (`mage`) group in `src/mmo/abilities.js`, plus the shared Meditate and Recall abilities. Arcane mastery and Elemental kin are passive abilities.

## Shared direction

Prepend this to each prompt:

> Create an original sound effect for a fantasy role-playing game. Use tactile material sounds, clear magical energy and a controlled low end. Give the action a distinct onset that remains readable during combat. Keep the recording dry and close, with a short natural decay. No speech, whispered words, music, melody, background ambience, long cinematic reverb, or recognizable sounds from another game. Export a clean isolated file with no clipping or leading silence. For repeated combat cues, make three separate variations with the same timing and similar loudness. Each requested cast, impact, loop or ending is a separate file.

Durations below are sound-design targets. Loop lengths are recording lengths, not promises about how long an ability lasts. Trigger impacts and secondary effects from their own gameplay events instead of baking all stages into one recording. Use quieter loops and secondary hits so several spells can coexist.

## Wizard abilities

### Magic arrow (`magicArrow`)

> Make a small, precise dart of arcane energy. A tight airy flick narrows into a bright glassy zip, then vanishes. Light and quick enough to repeat once a second without becoming piercing. Avoid a heavy boom. Create a 0.25-second launch and a separate 0.3-second impact: a compact crystalline tap with a little fizz. Give the impact three variations.

### Fireball (`fireball`)

> Create a fireball with three separate sounds. Cast: a 0.35-second inward rush of air catching fire. Launch: a 0.4-second flame whoosh with a hot, coarse edge. Impact: a 0.8-second rounded fire burst with a short low thump and scattered ember crackles. Also create a quiet, seamless 2-second burning loop, with no separate explosions inside it, for the lingering burn.

### Ice shard (`iceShard`)

> A needle of ice forms with a brittle crystalline creak and shoots through cold air. Create a 0.35-second cast, a 0.3-second thin cutting launch, and a 0.55-second impact of ice cracking into small hard fragments. Finish the impact with a restrained freezing hiss. Keep the high frequencies smooth enough for frequent use.

### Lightning (`lightning`)

> Create an instantaneous lightning strike: a sharp electrical crack at the very beginning, a dense sizzling body, and a short low thunder knock underneath. Total duration 0.65 seconds. No charging swell or distant thunderstorm. It should sound stronger and heavier than a small arcane bolt, while staying compact in a busy fight.

### Blink (`blink`)

> Create two matching spatial magic sounds. Departure, 0.25 seconds: air sucks tightly inward and closes with a small vacuum snap. Arrival, 0.35 seconds: a soft outward displacement of air with a bright crystalline shimmer. Both begin immediately. Keep them brief enough that they can play at different positions during one teleport.

### Mana shield (`manaShield`)

> Create separate sounds for a translucent magical shield. Activation, 0.7 seconds: a soft rounded energy bloom settles into a clear glass resonance. Absorbing a hit, 0.25 seconds: an elastic glass ripple with a muted electric pulse; make three variations. Ending, 0.45 seconds: the resonance gently collapses into falling sparks. Keep the shield quiet between hits.

### Frost nova (`frostNova`)

> Build an outward ring of freezing magic. Cast, 0.5 seconds: cold pressure gathers with thin ice creaks. Release, 0.9 seconds: a broad low crack expands into an icy rush and many small crystalline fractures. A separate 0.25-second root accent should sound like ice gripping around a foot. The main burst needs more width and weight than Ice shard, without a long ringing tail.

### Chain lightning (`chainLightning`)

> Create a 0.75-second charge of electrical filaments gathering under tension, a separate 0.6-second first strike with a strong crack and controlled bass, and three separate 0.2-second jumping-arc variations. Each arc is a fast snapping electrical bridge with a tiny sizzling tail. Make the arc files individually triggerable and naturally lighter than the first strike; do not bake the chain into a fixed rhythm.

### Meteor (`meteor`)

> Create four isolated stages for a large falling meteor. Cast, 1.35 seconds: stone trembles inside a growing furnace roar. Descent, 1.5 seconds: a heavy burning mass approaches with accelerating air pressure. Impact, 1.8 seconds: a deep stone collision, forceful fiery burst and falling rock fragments, with a controlled bass tail. Aftermath, 1 second: a few hot fragments settle and hiss. Make this the heaviest attack in the set while preserving a clear impact transient.

### Arcane mastery (`arcaneMastery`, passive)

> Create a 0.9-second passive-unlock accent. Several fine glass resonances gather into one stable, warm arcane tone, followed by a small bright sparkle. It should communicate understanding and control without a melody, fanfare or explosive impact.

Use only when the passive is earned. It has no cast or continuous loop.

### Hex (`hex`)

> Create a 0.6-second curse application. A dry twisting rasp folds into a low dissonant magical knot, followed by a small brittle snap as the curse takes hold. Give it an uneasy texture that remains distinct from poison bubbles or electrical attacks. No voices, whispers, chanting or human breath.

### Stone skin (`stoneSkin`)

> Create a 0.35-second cast of gritty mineral grains pulling together. Follow with a separate 0.7-second application: close stone plates slide and lock around a body with several dull stone clicks and a low settling grind. Add a 0.4-second ending of fine grit loosening and falling away. Heavy and protective, with no metallic armour clang.

### Eldritch bolt (`eldritchBolt`)

> Create a 0.3-second launch of twisted arcane energy: a tight pulse with a rough electrical edge and a hollow undertone. Impact, 0.55 seconds: a compact energy crack buckles inward with a brief unstable buzz. Add a separate 0.2-second silence accent, a tightly pinched magical snap with an abrupt dry ending, for the occasional silence effect. More distorted and weighty than Magic arrow.

### Ward (`ward`)

> Create a 0.8-second cast of restrained harmonic energy spreading across stone, then a separate 0.6-second activation in which a circular boundary settles with a soft resonant pulse. Also create a quiet seamless 3-second loop of steady, sheltered magical pressure, without a beat or melody, and a 0.5-second ending that gently releases the pressure.

### Transmute (`transmute`)

> Create a 1-second transmutation cast: close mineral grains rattle, turn and draw together inside a rising crystalline vibration. Create a separate 0.65-second completion where the material condenses with several dense mineral clicks and a clean metallic ping. This is ore changing substance, so avoid coin jingles, cash-register sounds, explosions or a victory jingle.

### Spell plague (`spellPlague`)

> Create a 0.7-second gathering of poisonous magical pressure, with a sticky liquid tremor and a narrow hiss. Application, 0.65 seconds: a compact viscous burst with corroding crackles. Create three separate 0.35-second secondary eruptions, smaller wet pops with a sharp magical edge, to play when later spells trigger the plague on nearby enemies. Keep those repeated eruptions quieter than the application.

### Rift (`rift`)

> Create a 1.2-second opening sound: heavy fabric-like reality tearing under a low twisting pressure, with fine electrical fractures along the tear. Make a separate seamless 2-second loop of inward rushing air and unsettled low resonance, suggesting a pull toward the centre. Ending, 0.6 seconds: a tight implosion closes the tear with a dry snap. No voices, music or oversized sub-bass rumble.

### Elemental kin (`elementalKin`, passive)

> Create a 1.1-second passive-unlock accent. A tiny ember crackle, fine ice chime, soft liquid fizz and restrained electrical tick briefly converge into one calm, warm resonance. Keep the four elements subtle and blended, with no combat impact, melody or triumphant fanfare.

Use only when the passive is earned. It has no cast or continuous loop.

## Shared abilities used by the Wizard

### Meditate (`meditate`)

> Create three separate quiet sounds for seated meditation. Start, 0.7 seconds: a light cloth settling sound followed by a soft rounded arcane resonance. Sustain: a seamless 4-second loop of slow, gentle energy movement with fine airy detail, no melody and no human breathing. End, 0.5 seconds: the energy thins into a soft upward shimmer. Keep the sustain far below combat sounds so waiting for mana remains restful.

The loop should stop on movement, attacks, spellcasting, damage, death or full mana. For interruption, fade it quickly rather than playing the completion shimmer.

### Recall (`recall`)

> Create a 3-second channel of warm spatial magic gathering steadily around a stationary person, with delicate glass resonances and an inward movement of air. Keep the channel interruptible before its ending. Make a separate 0.3-second departure snap and a 0.6-second arrival: a soft outward air bloom with a settled, warm magical shimmer. More deliberate and gentle than Blink, with no celebratory tune.
