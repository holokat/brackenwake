import { birthplaceFor } from '../../world/zones.js';

/** Leave the current interior before sampling the destination's ground. */
export function teleportOverworld(ctx, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const world = ctx.get('world');
  const player = ctx.get('player');
  const fight = ctx.get('combat');
  if (world.runtime.inDungeon) world.runtime.leaveDungeon();
  fight.stopAttack?.();
  fight.targeting?.clear?.();
  fight.combat?.forget?.(player.actor);
  player.teleport(x, z);
  ctx.camera?.snap?.(player.pos);
  ctx.state?.setPos?.(x, z);
  fight.monsters?.rescan?.(x, z, world.dayFactor(ctx.frame.worldNow ?? ctx.frame.now) < 0.4);
  if (ctx.has('world_life')) ctx.get('world_life').forage?.update?.(x, z);
  return true;
}

export function recallHome(ctx) {
  const field = ctx.get('world').runtime.field;
  const at = birthplaceFor(field);
  teleportOverworld(ctx, at.x, at.z);
  const town = field?.sculpt?.world === 'island' ? 'Haven' : 'Hearthhome';
  return `The road folds up under you, and you are on the green at ${town}.`;
}
