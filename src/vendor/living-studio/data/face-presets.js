// Shapes are authored in the shared, unmorphed head space. Skin and hair
// colors are deliberately independent of facial structure.
const preset=(id,label,description,shape={})=>Object.freeze({id,label,description,shape:Object.freeze(shape)});
export const facePresets=Object.freeze({
 male:Object.freeze([
  preset('default','Classic','The original face.'),
  preset('chiseled','Chiseled','Defined cheekbones, a narrow nose and a strong chin.',{jaw:.10,cheeks:-.08,chin:.18,noseWidth:-.18,noseDepth:-.12,eyes:-.16,brow:-.018,mouth:-.06}),
  preset('broad','Broad','A wide jaw, fuller nose and straight brows.',{jaw:.24,cheeks:.10,chin:.18,noseWidth:.30,noseDepth:-.25,eyes:.10,eyeSpacing:.06,brow:.012,mouth:.17}),
  preset('soft','Soft','Rounder cheeks, open eyes and a shorter nose.',{jaw:.06,cheeks:.04,chin:-.03,chinHeight:.035,noseWidth:.05,noseDepth:-.38,noseLift:.018,eyes:.36,brow:.022,mouth:.08,lips:.28}),
  preset('long','Long','A lean jaw, pronounced bridge and narrower lips.',{jaw:-.15,cheeks:-.12,chin:-.12,chinHeight:-.022,noseWidth:-.10,noseDepth:0,eyes:-.10,eyeSpacing:-.045,brow:.008,mouth:-.13}),
 ]),
 female:Object.freeze([
  preset('default','Classic','The original face.'),
  preset('heart','Heart','High cheekbones tapering to a delicate chin.',{jaw:-.11,cheeks:.09,chin:-.23,chinHeight:.018,noseWidth:-.13,noseDepth:-.25,eyes:.28,eyeSpacing:.04,brow:.023,mouth:.09,lips:.23}),
  preset('square','Square','A defined jaw, broad chin and straight brows.',{jaw:.27,cheeks:.035,chin:.32,noseWidth:.12,noseDepth:-.10,eyes:-.08,brow:-.009,mouth:.13}),
  preset('round','Round','Full cheeks, a soft chin and a compact nose.',{jaw:.18,cheeks:.08,chin:.08,chinHeight:.042,noseWidth:.24,noseDepth:-.40,noseLift:.020,eyes:.36,eyeSpacing:.045,brow:.018,mouth:.045,lips:.34}),
  preset('oval','Oval','A longer, tapered face with a slender bridge.',{jaw:-.12,cheeks:-.08,chin:-.12,chinHeight:-.018,noseWidth:-.18,noseDepth:-.06,noseLift:-.010,eyes:.04,eyeSpacing:-.025,brow:.012,mouth:-.08,lips:.10}),
 ]),
});

export function facePreset(bodyType,id){
 const choices=Object.hasOwn(facePresets,bodyType)?facePresets[bodyType]:facePresets.male;
 return choices.find(choice=>choice.id===id)||choices[0];
}
export const resolveFacePreset=(bodyType,id)=>facePreset(bodyType,id).id;
