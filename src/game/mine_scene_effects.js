/** The mine's ambient bloom follows the streamed room, including late loads. */
export function bindMineSceneEffects(scene, runtime) {
    return scene.addEffectSource?.(() => Boolean(
        runtime.inDungeon && runtime.dungeonScene?.widow?.loaded && runtime.dungeonScene.widow.active
    )) || (() => {});
}
