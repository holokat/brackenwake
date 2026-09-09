# Achievement unlock feedback

Achievements use the same upper-screen banner and queue as ability unlocks. Each
shows its own atlas artwork, name, unlocked title, permanent reward when present,
and the J shortcut. The full message remains in the game log. The previous small
achievement toast is removed. The shared banner renderer now lives in
`src/game/ui/unlock_banner.js`; its existing public HUD API and timing remain.

A success cue plays once when an achievement banner appears, including when it
waited behind another unlock. It does not sound early while queued or repeat on
each frame. Repeated achievement events do not announce an already earned reward.
The existing bounded banner queue keeps six waiting entries; logs retain every
committed unlock even when a large burst exceeds the presentation queue.

## Audio source

The cue is UI SFX 0.4.0, `dreamy/success`, 1.132 seconds, 9,656 bytes, from
Yuki Capital. Its source recipe uses ascending 0, 4 and 7 semitone notes, with
the dreamy pack's octave echoes. It is shipped unchanged under CC0-1.0 from
commit `9950fe66f993a6660dab9c2651dcbcd899ffd83b`:
https://github.com/romainsimon/uisfx/blob/9950fe66f993a6660dab9c2651dcbcd899ffd83b/packages/uisfx/sounds/dreamy/success.mp3

The asset and its audio dedication are in `public/audio/sfx`. The existing game
audio service plays it at cue gain 0.5, multiplied by the saved sound-effect
volume. Existing mute, gesture unlock and disposal behavior apply. No additional
audio runtime, package, loop or startup sound is added.

SoundCN's Kenney `success-chime` and UI SFX dreamy/cinematic success cues were
retrieved for preview. Asset rights were checked against each official source.
The audio-input tool could not provide audible input to the agent, so selection
uses the verified score, duration and sonic-pack metadata; subjective listening
quality is not claimed as measured evidence.

## Checks

Tests exercise the real achievement tracker through its notification callback,
one reveal cue, repeated-event suppression, all 40 atlas crops, mixed
achievement/ability queues, sprite cleanup and optional audio failures.
`tools/qa/achievements.html?solo` uses an in-memory character and its
“Test achievement unlock” button triggers a real camp achievement event.
