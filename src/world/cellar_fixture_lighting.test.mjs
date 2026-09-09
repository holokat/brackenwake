import assert from 'node:assert/strict';
import * as T from 'three';
import {configureCellarGlow, cellarLampProfile} from './cellar_fixture_lighting.js';
for (const [name, strength, cap] of [['Cellar fire',3,.45],['Cellar soul',2.4,.5],['Cellar arcane',2.5,.65]]) {
 const m = new T.MeshStandardMaterial({name,emissive:0xffffff,emissiveIntensity:strength});
 configureCellarGlow(m,2); assert.equal(m.emissiveIntensity,cap); assert.equal(m.userData.streamGlow,cap); assert.equal(m.userData.spellBloom,false);
 configureCellarGlow(m,2); assert.equal(m.emissiveIntensity,cap); m.dispose();
}
const water=new T.MeshStandardMaterial({name:'water',emissive:0x123456,emissiveIntensity:.008});
configureCellarGlow(water,2);assert.equal(water.emissiveIntensity,.008);water.dispose();
for(const kind of ['soulFlame','arcane','bell'])assert.equal(cellarLampProfile(kind),null,'magic fixtures cannot occupy both light pools');
assert(cellarLampProfile('candle').power < cellarLampProfile('lamp').power);
assert(cellarLampProfile('fire').range < 23);
console.log('Cellar lighting: emitter caps, streaming values, water and nonduplicated magic pools passed.');
