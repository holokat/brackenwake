// Small authored moves found by walking the saved routes with solid bodies.
// Only the original coordinates match, so reruns preserve later editor work.
const moves=[
 ['hearthhome','stall_b',9.46,-7.38,7.16,-7.38],
 ['chalk_rim','bench',4,2,4,5],
 ['watermeadows','barrel',-13,-20,-13,-17.5],
 ['oldcellars','cart_broken',-6,-3,-11,-8],
 ['hedge_3','boundary_stone',-6.4,-1.13,-6.4,-2.93],
 ['longmeadow','fingerpost',-10,-18,-10,-20],
 ['kingsroad_2','lamp_post_iron',-42.15,88.59,-40.15,88.59],
 ['kingsroad_2','lamp_post_iron',50.26,-88.8,52.26,-88.8],
 ['hedge_6','waystone_village',0,0,.65,0],
];
const trees=[
 ['grove_cellar_bank',-22.8,3.6,-21.85,3.24],
 ['grove_hedge_two_east',-49.16,26.62,-49.98,25.94],
 ['grove_hedge_two_east',-20.32,-9.34,-20.76,-9.7],
];
export function physicalClearances(spaces){
 let changed=0;
 for(const[id,model,x,z,nx,nz]of moves){const p=spaces['greenwold_'+id]?.pieces.find(p=>p.model===model&&Math.hypot(p.x-x,p.z-z)<.05);if(p){p.x=nx;p.z=nz;changed++;}}
 for(const[id,x,z,nx,nz]of trees){const p=spaces['greenwold_'+id]?.trees.find(p=>Math.hypot(p.x-x,p.z-z)<.05);if(p){p.x=nx;p.z=nz;changed++;}}
 return changed;
}
