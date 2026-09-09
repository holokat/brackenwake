/** The mine's ambient bloom follows the streamed room, including late loads. */
export function bindMineSceneEffects(scene, runtime) {
    return scene.addEffectSource?.(() => Boolean(
        runtime.inDungeon && ((runtime.dungeonScene?.widow?.loaded && runtime.dungeonScene.widow.active)
            || runtime.dungeonScene?.descent?.active
          || (runtime.dungeonScene?.entry?.loaded && runtime.dungeonScene.entry.active))
    )) || (() => {});
}
