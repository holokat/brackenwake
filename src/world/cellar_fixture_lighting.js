/** Keep authored flame colours below the white-hot spell impact range. */
export function configureCellarGlow(material,level){
 if(!material.emissive?.getHex()||!(material.emissiveIntensity>0))return;
 const original=material.emissiveIntensity;
 const cap=/fire|flame/i.test(material.name) ? .45 : /soul/i.test(material.name) ? .5 : /arcane|rune/i.test(material.name) ? .65 : original;
 material.emissiveIntensity=Math.min(original,cap,level===4?original*.18:original);
 // The spell bloom pass includes a material's lit surface as well as emission.
 // Continuous fixtures retain their emissive colour without washing out the room.
 material.userData.spellBloom=false;material.userData.streamGlow=material.emissiveIntensity;
}

/** Magic owns soul/arcane lights, so the ordinary lamp pool must not double them. */
export function cellarLampProfile(kind){
 if(kind==='soulFlame'||kind==='arcane'||kind==='bell')return null;
 if(kind==='candle')return {power:5.5,range:9};
 if(kind==='fire')return {power:16,range:16};
 if(kind==='lamp')return {power:20,range:23};
 return null;
}
