import {LIVING_BY_MODEL} from './living_catalog.js';
import {effectById} from '../vendor/living-studio/data/effect-catalog.js';
const GATES=new Set(['always','night','day','fair']);
export function livingErrors(space){
 const errors=[];
 for(const type of ['effects','animals','lights'])for(const row of space[type]||[]){
  const at=`${space.id}.${type}`;
  if(!Number.isFinite(row.x)||!Number.isFinite(row.z)||Math.hypot(row.x,row.z)>space.radius)errors.push(`${at}: invalid position`);
  if(row.gate&&!GATES.has(row.gate))errors.push(`${at}: unknown gate`);
  if(row.scale!=null&&(!(row.scale>0)||row.scale>3))errors.push(`${at}: scale outside 0..3`);
  if(type==='effects'&&!effectById.has(row.id))errors.push(`${at}: unknown effect ${row.id}`);
  if(type==='animals'&&!LIVING_BY_MODEL['lw_'+row.id])errors.push(`${at}: unknown animal ${row.id}`);
  if(type==='lights'&&(!(row.power>0)||row.power>50||!(row.range>0)||row.range>30||!Number.isFinite(row.color)))errors.push(`${at}: invalid light`);
 }
 return errors;
}
