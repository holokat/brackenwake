// The default id refers to the original body-specific hair geometry.
export const hairstyles=Object.freeze({
 male:Object.freeze([
  {id:'default',label:'Swept'},
  {id:'close_crop',label:'Close crop'},
  {id:'side_part',label:'Side part'},
  {id:'curly_crop',label:'Curly crop'},
  {id:'top_knot',label:'Top knot'},
  {id:'tied_locs',label:'Tied locs'},
 ].map(Object.freeze)),
 female:Object.freeze([
  {id:'default',label:'Tied back'},
  {id:'pixie',label:'Pixie'},
  {id:'bob',label:'Bob'},
  {id:'long_braid',label:'Long braid'},
  {id:'rounded_curls',label:'Rounded curls'},
  {id:'high_bun',label:'High bun'},
 ].map(Object.freeze)),
});

export function resolveHairstyle(bodyType,id){
 return hairstyles[bodyType==='female'?'female':'male'].some(style=>style.id===id)?id:'default';
}
