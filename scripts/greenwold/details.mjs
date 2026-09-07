// Small compositions at decisions and destinations. Every coordinate is local
// to a named clearing, so replacement models inherit the same layout.
export const SIGNS={
 hearthhome:[15,0],millrun:[-14,-18],beechhangar:[-13,17],chalkpits:[-5,22],
 oldcellars:[4,-14],sunkenchapel:[2,9],highwaymanshollow:[-17,-12],
 kingsroad_camp:[-17,19],longmeadow:[-10,-18],watermeadows:[-5,-14],coldwake:[-5,5],
};
export const DETAILS={
 beechhangar:[['rooting_patch',43,24,25],['rooting_patch',56,29,88],['sheep_skeleton',73,-14,40]],
 longmeadow:[['cart_empty',21,14,80],['barrel',19,17,0],['bench',-8,5,95]],
 watermeadows:[['rowing_boat_rotten',-17,-9,65],['bench',-9,-20,180],['barrel',-13,-20,0]],
 chalkpits:[['crate',-24,-18,10],['sack',-26,-18,40],['barrel',21,-20,0]],
 oldcellars:[['crate',16,-7,15],['legion_standard',18,-5,0]],
 coldwake:[['cart_laden',-10,15,75],['barrel',-12,19,0]],
};
export const OUTLOOKS=[
 {id:'chalk_rim',name:'The chalk rim',at:{x:-547,z:-1159},radius:35,
  note:'The switchback ends above the quarry. A bench faces the river valley. A supply sack lies beside the survey stones.',
  pieces:[['fingerpost',-3,6,0],['bench',4,2,200],['boundary_stone',-5,-6,10],['boundary_stone',-3,-8,35],['loot_sack',8,-8,0]],
  rocks:[[-10,-10,2.8,20],[-8,-16,1.6,70],[13,-12,2.2,35]],arrival:{x:0,z:1}},
 {id:'beech_overlook',name:'The beech overlook',at:{x:-983,z:88},radius:30,
  note:'The ridge path opens onto a view down the Mill Run. Two beeches shelter the bench; the valley side is left open.',
  pieces:[['bench',5,-2,130],['boundary_stone',7,2,0],['loot_sack',-7,-5,0]],
  rocks:[[-12,-7,2,25],[-10,-10,1.1,90]],arrival:{x:3,z:0}},
 {id:'drovers_rest',name:'The drovers rest',at:{x:-529,z:470},radius:35,
  note:'A cart and a cold fire stand beside the return path. Coldwake is south; the water meadow bridge is north.',
  pieces:[['cart_empty',9,-4,150],['campfire',10,4,0],['bench',14,4,270],['barrel',12,-1,0],['fingerpost',-4,0,0]],
  rocks:[[-9,7,1.5,0],[-10,4,.8,10]],arrival:{x:2,z:0}},
];
export const BOULDERS={
 beechhangar:[[-27,-5,1.8,25],[-29,-8,1.3,75],[-23,-9,.8,18],[44,31,2.4,20],[48,33,1.5,70]],
 chalkpits:[[-31,-12,2,45],[-28,-15,1.1,65],[31,-3,2.6,10],[33,-7,1.7,40]],
 longmeadow:[[-13,7,1.5,60],[-15,9,.8,20]],
 watermeadows:[[-25,-10,1.2,45],[-27,-12,.9,15],[33,-12,1.4,80]],
 highwaymanshollow:[[-29,-6,2.5,80],[-31,-11,1.9,35],[-26,-13,1.2,0]],
 coldwake:[[-22,33,1.6,0],[-25,32,1,20]],
};
