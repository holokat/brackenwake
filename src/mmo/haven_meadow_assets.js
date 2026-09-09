/** Metres, authored origin preserved through GLB loading. */
export const MEADOW_FOOTPRINTS={
 meadow_windmill:[10,5.5,11.7],meadow_arbor:[7.4,5,3.7],meadow_fishing_awning:[6.6,5,4],
 meadow_cart:[2.8,4.1,1.5],meadow_skiff:[2.05,5.3,1.71],meadow_wall:[4.36,.87,1],
 meadow_kite:[4,3.5,10],meadow_lavender:[7.4,5.5,1.2],meadow_daisies:[7.4,5.5,.9],
 meadow_buttercups:[7.4,5.5,.9],meadow_grasses:[5.8,4.2,1.3],meadow_chalk:[5.4,3.4,2.6],
};
export const isMeadowProp=id=>Object.hasOwn(MEADOW_FOOTPRINTS,id);
export const isMeadowFoliage=id=>/^meadow_(lavender|daisies|buttercups|grasses)$/.test(id);
/** x, z, width, depth, height, bottom. Shelters remain open underneath. */
export function meadowSolidParts(id){
 if(isMeadowFoliage(id))return[];
 if(id==='meadow_kite')return[[0,0,.18,.18,7.5,-.4]];
 if(id==='meadow_windmill')return[[0,0,4.5,4.5,7,-.4]];
 if(id==='meadow_arbor'||id==='meadow_fishing_awning'){
  const w=id==='meadow_arbor'?6.8:6,h=id==='meadow_arbor'?3.4:3.65;
  return[-1,1].flatMap(a=>[-1,1].map(b=>[a*w/2,b*2.25,.2,.2,h+.3,-.5]))
   .concat([[0,0,2.6,1.25,1,-.2],[0,1.15,2.7,.4,.65,-.1],[0,-1.15,2.7,.4,.65,-.1],[0,0,w,4.5,.7,h-.48]]);
 }
 if(id==='meadow_wall')return[[0,0,4.3,.85,1,0]];
 if(id==='meadow_cart')return[[0,0,2.65,1.4,1.4,0]];
 if(id==='meadow_chalk')return[[0,0,3.2,2.3,2.35,-.2],[1.8,-.5,1.8,1.4,1.4,-.2]];
 return null;
}
