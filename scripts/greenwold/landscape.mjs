// Landforms frame the routes. Absolute heights belong to the quarry benches;
// broad additive shoulders leave the original watershed intact.
export const LANDFORMS = [
  ['chalk-crown','mountain',-615,-1220,185,87],
  ['chalk-west','mountain',-1070,-1085,170,61],
  ['chalk-east','ridge',-480,-1230,95,58,240,1.30],
  ['quarry-backwall','cliff',-582,-995,100,25,0,Math.PI],
  ['quarry-west-buttress','ridge',-720,-1040,50,35,135,2.8],
  ['beech-spine','ridge',-968,80,110,26,350,0.03],
  ['hangar-west-bank','ridge',-1130,-30,85,16,320,0.04],
  ['southern-shoulder','mountain',-907,664,175,35],
  ['coldwake-shelter','ridge',-562,888,100,36,245,1.35],
  ['hollow-overhang','cliff',499,-1057,93,27,0,Math.PI],
  ['north-watch','mountain',670,-1240,195,58],
  ['chapel-west-bluff','mountain',-250,-1070,95,37],
  ['longmeadow-shoulder','mountain',-408,-382,102,18],
  ['east-gate-shoulder','ridge',1138,-948,130,49,240,2.65],
];
// Tree offsets are authored arrangements, reused like any other landscape asset.
// The gap in an edge is an entrance; the crescent holds a clearing. No dice.
export const ARRANGEMENTS = {
  crescent:[[-46,-11,.95],[-43,-24,1.1],[-34,-38,1.2],[-19,-46,1.05],[-2,-50,1.3],[17,-45,1.2],[34,-36,1.1],[45,-22,.9],[49,-5,1.15],[-59,-34,.8],[-42,-54,.9],[-19,-65,1.1],[6,-66,.95],[33,-56,.85],[58,-36,1.1],[-59,5,1],[65,-12,.85],[61,13,1],[-68,-11,.8],[46,25,.9]],
  canopy:[[-44,-34,1],[-26,-42,1.2],[-4,-36,1.3],[20,-43,1.1],[43,-30,.95],[-51,-10,1.15],[-30,-15,1.05],[-10,-10,1.25],[15,-19,1.3],[37,-9,1.1],[53,11,.85],[-47,16,.95],[-24,10,1.2],[2,16,1.15],[27,14,1.05],[-34,36,1.1],[-12,41,.85],[14,37,1.15],[39,33,1],[-57,38,.8],[4,60,.9],[59,-17,.8]],
  edge:[[-61,-8,.8],[-42,-2,1.05],[-20,-9,1.2],[3,1,1.3],[24,-6,1.1],[47,5,.9],[65,-2,.8],[-50,-25,.85],[-29,-31,1.1],[-4,-22,1.2],[20,-29,1],[44,-19,.9],[-16,-48,.85],[10,-45,1.05]],
  bank:[[-48,-4,.9],[-23,2,1.1],[3,-7,1.2],[31,1,.95],[53,-8,.8],[-34,-21,.8],[16,-23,.9]],
  orchard:[[-28,-16,.6],[-9,-16,.65],[10,-16,.6],[29,-16,.65],[-28,5,.65],[-9,5,.6],[10,5,.65],[29,5,.6]],
};
// Each group has a local job: close the back of a clearing, screen a camp,
// frame a river bend, or leave the view from a crest open.
export const GROVES = [
 ['hangar-entry','beech',-1135,-214,'edge',14],['hangar-throat','beech',-1020,-190,'edge',184],
 ['hangar-west-low','beech',-1164,-20,'canopy',22],['hangar-east-low','beech',-930,-53,'canopy',-22],
 ['hangar-west-middle','beech',-1180,135,'canopy',5],['hangar-east-middle','beech',-877,128,'canopy',20],
 ['hangar-west-high','beech',-1143,286,'canopy',-31],['hangar-setts','beech',-1023,339,'crescent',0],
 ['hangar-back','beech',-1096,435,'canopy',-15],['hangar-ridge','beech',-894,428,'crescent',165],
 ['hangar-south','beech',-984,553,'edge',130],['hangar-deep','beech',-1221,416,'canopy',35],
 ['hangar-understorey','birch',-1178,508,'edge',0],['hangar-northern-skirt','beech',-1226,-215,'edge',-26],
 ['mill-copse','oak',-1108,-404,'crescent',-20],['mill-orchard','oak',-1060,-445,'orchard',-8],
 ['quarry-river-bank','willow',-986,-578,'bank',-68],['quarry-road-bank','beech',-879,-637,'edge',145],
 ['quarry-approach','birch',-699,-855,'edge',95],['chalk-valley','beech',-759,-1180,'edge',15],
 ['meadow-oaks','oak',-412,-342,'crescent',180],['meadow-road','oak',-242,-483,'edge',6],
 ['water-west','willow',-768,-63,'bank',-38],['water-bend','willow',-646,1,'bank',-20],
 ['water-east','willow',-338,-17,'bank',20],['cellar-bank','willow',-110,-90,'bank',4],
 ['cellar-hollow','oak',51,-147,'crescent',10],['chapel-shore','willow',-113,-831,'edge',180],
 ['chapel-west','oak',-208,-1003,'crescent',80],['north-wood-west','beech',-58,-1230,'canopy',14],
 ['north-wood-middle','beech',120,-1227,'canopy',-15],['north-wood-east','beech',284,-1199,'edge',5],
 ['hollow-screen','oak',372,-1086,'canopy',20],['hollow-back','oak',501,-1126,'edge',2],
 ['hollow-east','oak',618,-1068,'canopy',-26],['hollow-south','oak',549,-937,'crescent',174],
 ['hollow-hidden-entry','beech',416,-863,'edge',78],['kingsroad-shelter','oak',912,-999,'edge',-34],
 ['eastwood-north','beech',1177,-795,'canopy',15],['eastwood-middle','oak',1208,-624,'canopy',-20],
 ['eastwood-south','beech',1270,-337,'edge',90],['hearthhome-orchard','oak',542,-299,'orchard',12],
 ['coldwake-west','oak',-576,838,'crescent',-22],['coldwake-east','oak',-352,835,'edge',165],
 ['coldwake-orchard','oak',-418,831,'orchard',10],['drovers-rest','oak',-474,461,'crescent',-90],
 ['south-lane','beech',-249,735,'edge',32],['south-stone','oak',219,376,'crescent',120],
 ['hedge-north','beech',257,-747,'edge',14],['hedge-east','oak',799,-392,'edge',100],
 ['hedge-west','oak',-242,-194,'crescent',-90],['pasture-boundary','oak',-643,546,'edge',8],
];
