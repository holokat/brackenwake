import { weatherAt, WEATHER_MODES } from './climate.js';
import { createPrecipitation } from './precipitation.js';

const FIELDS=['cloud','rain','snow','dust','mist','wind','windX','windZ'];
export function createWeather(sc,field) {
 const particles=createPrecipitation(sc.scene,field),state={},target={};
 let mode='auto',sampleAt=-Infinity,started=false;
 const query={};
 const api={state,particles,
  get mode(){return mode;},
  setMode(value){if(!WEATHER_MODES.includes(value))return false;mode=value;sampleAt=-Infinity;return true;},
  // Climate and precipitation use world time. Weather darkens illumination,
  // never the day factor consumed by nocturnal creatures and story gates.
  update(dt,now,position,day){
   if(now-sampleAt>=200||now<sampleAt||sampleAt===-Infinity){
    sampleAt=now;const ground=field.sampleAt(position.x,position.z);
    Object.assign(query,{x:position.x,z:position.z,height:ground.h,biome:ground.biome,snowLine:field.sculpt?.snowLine??64,now:now+(sc.clockOffset||0),day,mix:sc.realmMix,sculpt:!!field.sculpt,mode});
    weatherAt(query,target);
   }
   const a=started?1-Math.exp(-Math.max(0,dt)/4):1;
   for(const key of FIELDS)state[key]=started?state[key]+(target[key]-state[key])*a:target[key];
   state.label=target.label;state.mode=mode;started=true;sc.setWeather(state);
   return state;
  },
  draw(dt,eye,day,hidden){particles.update(dt,eye,state,day,hidden);},
  dispose(){particles.dispose();sc.setWeather(null);},
 };
 return api;
}
