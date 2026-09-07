// Curated art palettes. Skin choices describe tone and undertone, not ethnicity.
export const skinTones=[
 {id:'porcelain',label:'Porcelain',color:'#f0d6c5'},
 {id:'rose-beige',label:'Rose beige',color:'#e4c1aa'},
 {id:'warm-beige',label:'Warm beige',color:'#d8b28c'},
 {id:'golden-beige',label:'Golden beige',color:'#cda176'},
 {id:'olive-beige',label:'Olive beige',color:'#bf986f'},
 {id:'warm-tan',label:'Warm tan',color:'#bb8964'},
 {id:'amber-brown',label:'Amber brown',color:'#a5764e'},
 {id:'olive-brown',label:'Olive brown',color:'#916f4d'},
 {id:'warm-brown',label:'Warm brown',color:'#845637'},
 {id:'deep-brown',label:'Deep brown',color:'#69422f'},
 {id:'rich-brown',label:'Rich brown',color:'#513328'},
 {id:'deep-ebony',label:'Deep ebony',color:'#38251f'},
];
export const hairColors=[
 {id:'dark-brown',label:'Dark brown',color:'#302315'},
 {id:'black',label:'Black',color:'#171414'},
 {id:'chestnut',label:'Chestnut',color:'#68452e'},
 {id:'auburn',label:'Auburn',color:'#934830'},
 {id:'copper',label:'Copper',color:'#be7047'},
 {id:'blond',label:'Blond',color:'#cdb477'},
 {id:'ash-blond',label:'Ash blond',color:'#b5a589'},
 {id:'silver',label:'Silver',color:'#b8bab9'},
];
export const defaultCharacterColors={hairColor:'dark-brown',skinTone:'warm-tan'};
export const skinToneById=new Map(skinTones.map(t=>[t.id,t]));
export const hairColorById=new Map(hairColors.map(t=>[t.id,t]));
