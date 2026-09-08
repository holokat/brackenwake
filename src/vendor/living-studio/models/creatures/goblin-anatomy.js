/** Squat goblin bodies, authored directly in Z-up space, facing -Y. */
function joints(warrior){
 const b=warrior?1:0;
 return {
  hips:[0,.10,1.64+b*.18],spine:[0,.08,2.16+b*.20],chest:[0,.03,2.82+b*.25],
  neck:[0,-.20,3.32+b*.23],head:[0,-.38,3.89+b*.19],
  upperArmL:[-.88-b*.24,.01,3.00+b*.25],upperArmR:[.88+b*.24,.01,3.00+b*.25],
  forearmL:[-1.18-b*.25,-.11,2.16+b*.08],forearmR:[1.18+b*.25,-.11,2.16+b*.08],
  handL:[-1.33-b*.27,-.31,1.43],handR:[1.33+b*.27,-.31,1.43],
  thighL:[-.43-b*.10,.08,1.57+b*.18],thighR:[.43+b*.10,.08,1.57+b*.18],
  shinL:[-.64-b*.12,-.14,.87+b*.07],shinR:[.64+b*.12,-.14,.87+b*.07],
  footL:[-.76-b*.12,-.12,.23],footR:[.76+b*.12,-.12,.23],
 };
}
export const goblinAnatomies={goblinScout:{joints:joints(false)},goblinWarrior:{joints:joints(true)}};
