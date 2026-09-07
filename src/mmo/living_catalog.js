// Metre-scale source metadata shared by the editor, saved pieces and renderer.
import {dressingCatalog} from '../vendor/living-studio/data/dressing-catalog.js';
export const CHICKEN={id:'chicken',name:'Chicken',type:'animal',size:[.55,.28,.44],description:'A hen walks and pecks beside the coop.'};
export const LIVING_DRESSING=[...dressingCatalog.filter(e=>e.type!=='vfx'&&e.size),CHICKEN];
export const LIVING_BY_MODEL=Object.fromEntries(LIVING_DRESSING.map(e=>['lw_'+e.id,e]));
export const LIVING_FOOTPRINTS=Object.fromEntries(LIVING_DRESSING.map(e=>['lw_'+e.id,[e.size[0],e.size[1],Math.max(.04,e.size[2])]]));
