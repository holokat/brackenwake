import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorldField } from '../../world/field.js';
import { createTerrainEdits } from '../../world/terrain_edits.js';
import { SPACES } from '../../mmo/spaces/index.js';
import { realmMixAt } from '../sky.js';
import { weatherAt, FRONT_MS } from './climate.js';
import { createWeather } from './runtime.js';

const field = createWorldField(20260908, { homeBiome: 'meadow', homeY: -.3 });
const edits = createTerrainEdits({ baseHeight: (x,z) => field.heightAt(x,z) });
edits.load(JSON.parse(readFileSync(new URL('../../../public/terrain/island.json', import.meta.url))));
field.setTerrainEdits(edits);
const places = Object.values(SPACES).filter(p => p.id.startsWith('island_'));
const atPhase = (p, phase) => FRONT_MS * (phase + (p.x*.7+p.z*.3)/18000);
const query = (p, now, world='island') => {
  const ground=field.sampleAt(p.x,p.z);
  return {x:p.x,z:p.z,height:ground.h,biome:ground.biome,snowLine:field.sculpt.snowLine,
    world,sculpt:true,mix:realmMixAt(p.x,p.z),now,day:1};
};

test('every authored island location receives clear weather, rain and a brief snowfall', () => {
  assert.ok(places.length >= 20);
  for (const place of places) {
    const samples=Array.from({length:470},(_,i)=>weatherAt(query(place.at,atPhase(place.at,i/470))));
    assert.ok(samples.some(w=>w.rain>.5 && w.snow===0), place.id+' gets rain');
    assert.ok(samples.some(w=>w.snow>.5 && w.rain===0), place.id+' gets snow');
    assert.ok(samples.some(w=>w.rain===0 && w.snow===0), place.id+' gets dry weather');
    const snowMinutes=samples.filter(w=>w.snow>.08).length/10;
    assert.ok(snowMinutes>5 && snowMinutes<8, `${place.id}: ${snowMinutes} snowy minutes`);
    assert.ok(samples.filter(w=>w.rain>.18).length > samples.filter(w=>w.snow>.18).length,
      place.id+' remains mostly rainy rather than snowy');
    for (const w of samples) for(const key of ['rain','snow','cloud','mist','wind'])
      assert.ok(Number.isFinite(w[key]) && w[key]>=0 && w[key]<=1, `${place.id}.${key}`);
    for(let i=1;i<samples.length;i++) {
      assert.ok(Math.abs(samples[i].rain-samples[i-1].rain)<.08, place.id+' rain blends');
      assert.ok(Math.abs(samples[i].snow-samples[i-1].snow)<.08, place.id+' snow blends');
    }
  }
  const haven=places.find(p=>p.id==='island_town');
  assert.ok(haven);
  assert.ok(field.sampleAt(haven.at.x,haven.at.z).h < field.sculpt.snowLine-100);
  assert.equal(field.sculpt.snowLine,180,'the permanent terrain snow line is unchanged');
});

test('the island cold spell does not spill into other worlds or create snow on dry climates', () => {
  const p=SPACES.island_town.at;
  for(let i=0;i<470;i++) {
    const q=query(p,atPhase(p,i/470),'greenwold');
    assert.equal(weatherAt(q).snow,0);
    const dry=weatherAt({...q,mix:[['emberwastes',1]]});
    assert.equal(dry.rain,0);assert.equal(dry.snow,0);
  }
});

test('Haven auto weather reaches the actual precipitation batches and clears inside or underwater', () => {
  const p=SPACES.island_town.at, q=query(p,0), eye=new THREE.Vector3(p.x,q.height+2,p.z);
  const sc={scene:new THREE.Scene(),realmMix:realmMixAt(p.x,p.z),clockOffset:0,setWeather(w){this.weather=w;}};
  const w=createWeather(sc,field);
  const draw=(phase,hidden=false)=>{
    w.update(40,atPhase(p,phase),p,1);
    w.draw(.016,eye,1,hidden);
  };
  draw(.44);
  assert.ok(w.particles.rain.visible && !w.particles.flakes.visible);
  draw(.58);
  assert.ok(w.state.snow>.7 && w.state.rain<.01);
  assert.ok(w.particles.flakes.visible && !w.particles.rain.visible);
  assert.ok(w.particles.flakes.material.uniforms.uAmount.value>.5);
  assert.equal(sc.weather,w.state);
  draw(.58,true);
  assert.equal(w.particles.stats.batches,0);
  draw(.58);
  assert.equal(w.particles.stats.batches,1);
  draw(.76);
  assert.ok(w.particles.rain.visible && !w.particles.flakes.visible);
  draw(1.05);
  assert.equal(w.particles.stats.batches,0);
  w.setMode('clear');draw(1.58);
  assert.ok(w.state.snow<.01 && w.state.rain<.01);
  w.setMode('auto');draw(1.58);
  assert.ok(w.state.snow>.7);
  w.dispose();assert.equal(sc.weather,null);assert.equal(sc.scene.children.length,0);
});
