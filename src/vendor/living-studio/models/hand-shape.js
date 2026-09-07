/**
 * Shared fist anatomy in the bind pose: -Z runs from wrist to knuckles,
 * +/-X is the thumb opening (mirrored by hand), and +Y is the palm.
 * Keep the thumb and folded fingers opposite the dorsal glove panels.
 */
export function blockHandDetails(x,y,z,side,{armored=false,bulk=0}={}){
 return {
  thumb:{
   center:[x-side*(armored?.155:.15),y+(armored?.065:.045)+bulk*.2,z-.20],
   size:[(armored?.17:.135)+bulk*.35,(armored?.20:.18)+bulk*.30,.24],
  },
  // One connected pad reads as curled fingers without separate finger meshes.
  curl:{
   center:[x+side*.015,y+(armored?.065:.045)+bulk*.2,z-.335],
   size:[(armored?.30:.265)+bulk*.40,(armored?.13:.12)+bulk*.20,.22],
  },
 };
}
