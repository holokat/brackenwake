const gait = Object.freeze({
  walk: {stride:.45, knee:.60, lift:.09, lean:0, elbow:-.12},
  run: {stride:.82, knee:1.25, lift:.10, lean:-.14, elbow:-.62},
});

/** Periodic gait curves keep their pose and velocity through the loop seam. */
export function applyLocomotion(rig, move, phase) {
  const profile = gait[move];
  if (!profile) return false;
  const joints = rig.joints, angle = phase * Math.PI * 2, stride = Math.sin(angle);
  joints.thighL.rotation.set(stride * profile.stride, 0, 0);
  joints.thighR.rotation.set(-stride * profile.stride, 0, 0);
  // Squared swing flexion has zero velocity where the planted leg straightens.
  joints.shinL.rotation.set(Math.max(0, -stride) ** 2 * profile.knee, 0, 0);
  joints.shinR.rotation.set(Math.max(0, stride) ** 2 * profile.knee, 0, 0);
  joints.upperArmL.rotation.set(-stride * profile.stride * .75, 0, .03);
  joints.upperArmR.rotation.set(stride * profile.stride * .75, 0, -.03);
  joints.forearmL.rotation.set(profile.elbow, 0, 0);
  joints.forearmR.rotation.set(profile.elbow, 0, 0);
  // Smooth two-step rise replaces the sharp reversals of absolute cosine.
  joints.hips.position.z += (1 + Math.cos(angle * 2)) * .5 * profile.lift;
  joints.chest.rotation.set(profile.lean, 0, stride * .045);
  joints.chest.scale.set(1, 1, 1);
  joints.head.rotation.set(0, 0, -.045 - stride * .025);
  return true;
}
