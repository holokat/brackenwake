import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { weatherAt,CLIMATES,GREENWOLD_AIR,FRONT_MS,auditClimates } from './climate.js';
import { weatherPalette,weatherLighting } from './atmosphere.js';
import { createWeather } from './runtime.js';
import { createPrecipitation,RAIN_COUNT,FLAKE_COUNT,WEATHER_RADIUS } from './precipitation.js';
import { roofEnvelope,roofHeightAt } from '../../world/weather_shelter.js';
import { SPACES } from '../../mmo/spaces/index.js';
import { REALM_ZONES } from '../../world/zones.js';
import { createSky,skyColours,skyLighting,phaseFromClock,sunDirectionAt } from '../sky.js';
import { dayFactorAt,DAY_CYCLE_MS } from '../dayclock.js';

test('every climate handles the whole front, including dry and frozen climates',()=>{
 assert.equal(auditClimates(),REALM_ZONES.length);
 assert.throws(()=>auditClimates(CLIMATES,[...REALM_ZONES,{id:'missing'}]));
 for(const id of Object.keys(CLIMATES)) {
  const samples=Array.from({length:471},(_,i)=>weatherAt({now:FRONT_MS*i/470,mix:[[id,1]],height:5}));
  for(const w of samples)for(const key of ['cloud','rain','snow','dust','mist','wind'])assert.ok(w[key]>=0&&w[key]<=1,`${id}.${key}`);
  if(CLIMATES[id].wet===0){assert.ok(samples.every(w=>w.rain===0&&w.snow===0));assert.ok(samples.some(w=>w.dust>.2));}
  else if(id==='frostreach'){assert.ok(samples.every(w=>w.rain===0));assert.ok(samples.some(w=>w.snow>.6));}
  else {assert.ok(samples.some(w=>w.rain===0));assert.ok(samples.some(w=>w.rain>.5));assert.ok(samples.every(w=>w.snow===0));}
 }
 const alpine=weatherAt({mix:[['stormpeaks',1]],height:190,snowLine:180,now:FRONT_MS*.5});
 assert.ok(alpine.snow>.5&&alpine.rain===0);
 const cold=SPACES.greenwold_coldwake;
 assert.equal(weatherAt({x:cold.at.x,z:cold.at.z,sculpt:true,height:20,snowLine:180,now:FRONT_MS*.5}).snow,0);
});

test('the authored areas and occult tower have air, river mist increases at night and blends at boundaries',()=>{
 assert.equal(Object.keys(GREENWOLD_AIR).length,13);
 for(const id of Object.keys(GREENWOLD_AIR))assert.ok(SPACES[`greenwold_${id}`]);
 const mist=(id,day)=>{const p=SPACES[`greenwold_${id}`].at;return weatherAt({...p,sculpt:true,day}).mist;};
 assert.ok(mist('watermeadows',0)>mist('hearthhome',0));
 assert.ok(mist('sunkenchapel',0)>mist('sunkenchapel',1));
 let prev=weatherAt({x:-1300,sculpt:true,day:0});
 for(let x=-1299;x<1300;x++){
  const next=weatherAt({x,sculpt:true,day:0});
  assert.ok(Math.abs(next.cloud-prev.cloud)<.03&&Math.abs(next.mist-prev.mist)<.03);prev=next;
 }
 const before=weatherAt({now:FRONT_MS-1}),after=weatherAt({now:FRONT_MS+1});
 assert.ok(Math.abs(before.cloud-after.cloud)<.001&&Math.abs(before.rain-after.rain)<.001);
});

test('weather reaches the real sky uniforms, reflection palette and lighting without changing night gates',()=>{
 const scene=new THREE.Scene(),sc={scene,realmMix:[['greenwold',1]],clockOffset:0};
 const sky=createSky(sc),clear=weatherAt({mode:'clear'}),rain=weatherAt({mode:'rain'});
 sc.weather=clear;sky.update(1,new THREE.Vector3(),.016,DAY_CYCLE_MS*.88);
 const bright=sky.uniforms.uSunUp.value,fairFog=sky.palette.fogFar;
 sc.weather=rain;sky.update(1,new THREE.Vector3(),.016,DAY_CYCLE_MS*.88);
 assert.equal(sky.uniforms.uCloud.value,rain.cloud);
 assert.ok(sky.uniforms.uSunUp.value<bright*.3&&sky.palette.fogFar<fairFog);
 assert.equal(sky.palette.day,1);
 assert.ok(skyLighting(1,{weather:rain}).sunI<skyLighting(1,{weather:clear}).sunI);
 sc.dayScale=0;sky.update(0,new THREE.Vector3(),.016,DAY_CYCLE_MS*.88);
 assert.ok(sky.sunDir.y<0&&sky.moonDir.y>0);
 sky.dispose();assert.equal(scene.children.length,0);
});

test('one full day has 20 minutes with the sun above the horizon and 5 below, with light and phase agreeing',()=>{
 let above=0,below=0;
 for(let second=0;second<DAY_CYCLE_MS/1000;second++){
  const now=(second+.5)*1000,day=dayFactorAt(now),sun=sunDirectionAt(phaseFromClock(now));
  if(sun.y>0)above++;else below++;
  assert.equal(day>.5,sun.y>0);
 }
 assert.equal(above,1200);assert.equal(below,300);
 assert.ok(dayFactorAt(.38*DAY_CYCLE_MS)<.4);
 assert.ok(dayFactorAt(.88*DAY_CYCLE_MS)>.4);
});

test('precipitation has fixed capacities, clips to terrain, water and roofs, hides underground, and disposes',()=>{
 const scene=new THREE.Scene(),field={terrainEdits:{version:0},sampleAt:(x,z)=>({h:x>0?4:0,water:z>0,waterLevel:3})};
 const roof=roofEnvelope('inn',0,0,0,14,9,9,Math.PI/2);
 assert.equal(roofHeightAt([roof],0,0,0),9);
 assert.equal(roofHeightAt([roof],7,0,0),-Infinity);
 assert.equal(roofEnvelope('chapel_sunken',0,0,0,7,12,10,0),null);
 assert.equal(roofEnvelope('bench',0,0,0,2,1,1,0),null);
 const plan=new THREE.Group();plan.userData.weatherRoofs=[roof];scene.add(plan);
 const p=createPrecipitation(scene,field),eye=new THREE.Vector3(0,2,0),w=weatherAt({mode:'rain'});
 p.update(.05,eye,w,1);
 assert.equal(p.rain.geometry.attributes.position.count,RAIN_COUNT*4);
 assert.equal(p.rain.geometry.index.count,RAIN_COUNT*6);
 assert.equal(p.flakes.geometry.attributes.position.count,FLAKE_COUNT);
 assert.ok(WEATHER_RADIUS<=24);
 assert.equal(p.stats.batches,1);assert.equal(p.stats.roofCount,1);
 assert.ok(p.cover.image.data.includes(9));assert.ok(p.cover.image.data.includes(4));assert.ok(p.cover.image.data.includes(3));
 const builds=p.stats.coverBuilds;p.update(.05,eye,w,1);assert.equal(p.stats.coverBuilds,builds);
 field.terrainEdits.version++;p.update(.05,eye,w,1);assert.equal(p.stats.coverBuilds,builds+1);
 p.update(.05,eye,w,1,true);assert.equal(p.stats.batches,0);
 p.update(.05,eye,weatherAt({mode:'snow'}),0);assert.ok(p.flakes.visible&&!p.rain.visible);
 p.update(.05,eye,weatherAt({mode:'clear'}),1);assert.equal(p.stats.batches,0);
 let disposed=0;for(const r of[p.cover,p.rain.geometry,p.rain.material,p.flakes.geometry,p.flakes.material])r.addEventListener('dispose',()=>disposed++);
 p.dispose();assert.equal(disposed,5);assert.deepEqual(scene.children,[plan]);
});

test('the live controller smooths fronts, respects frozen world time and recovers from previews',()=>{
 const sc={scene:new THREE.Scene(),realmMix:[['greenwold',1]],clockOffset:0,setWeather(w){this.weather=w;}};
 const field={sculpt:{snowLine:180},sampleAt:()=>({h:10,biome:'meadow'})};
 const weather=createWeather(sc,field),pos=new THREE.Vector3();
 weather.update(.05,0,pos,1);const clear=weather.state.rain;
 assert.equal(weather.setMode('invalid'),false);assert.ok(weather.setMode('rain'));
 weather.update(0,0,pos,1);assert.equal(weather.state.rain,clear);
 for(let i=1;i<=400;i++)weather.update(.05,i*50,pos,1);
 assert.ok(weather.state.rain>.8);assert.equal(sc.weather,weather.state);
 weather.setMode('auto');for(let i=401;i<1000;i++)weather.update(.05,i*50,pos,1);
 assert.ok(weather.state.rain<.01);
 weather.dispose();assert.equal(sc.weather,null);
});
