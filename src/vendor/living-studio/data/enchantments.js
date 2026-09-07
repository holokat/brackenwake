/** User-supplied enchantment concepts. Descriptions are design metadata, not combat rules. */
export const enchantments = Object.freeze([
  {id:'flame',name:'Flame',color:'#ff7b27',core:'#fff1ab',description:'Fire damage with a small chance to burn over time.',affinity:'Any weapon',visual:'Living flame, rising embers and a fiery impact.'},
  {id:'frost',name:'Frost',color:'#60c8ff',core:'#e9fcff',description:'Frost damage with a small chance to slow movement and attacks.',affinity:'Any weapon',visual:'Ice crystals, cold mist and shattering frost.'},
  {id:'shock',name:'Shock',color:'#667dff',core:'#d6f5ff',description:'Lightning damage with a small chance to arc to a nearby enemy.',affinity:'Any weapon',visual:'Branching lightning and a charged impact.'},
  {id:'venom',name:'Venom',color:'#97e829',core:'#e6ff92',description:'A chance to poison over time, stacking up to three times.',affinity:'Fast weapons',visual:'Liquid poison, falling droplets and an acid splash.'},
  {id:'vampiric',name:'Vampiric',color:'#f32c58',core:'#ffbacb',description:'Restore a small percentage of damage dealt as health.',affinity:'Melee weapons',visual:'Crimson wisps, a blood-red edge and returning siphons.'},
  {id:'keen',name:'Keen',color:'#f4d692',core:'#fffbea',description:'Increased critical-hit chance.',affinity:'Any weapon',visual:'A honed luminous edge and concentrated starburst glints.'},
  {id:'force',name:'Force',color:'#eca750',core:'#fff0c7',description:'Increased physical damage and knockback.',affinity:'Heavy weapons',visual:'Pressure waves, amber arcs and fractured stone.'},
  {id:'holy',name:'Holy',color:'#ffe5a0',core:'#ffffed',description:'Bonus damage against undead and demonic creatures.',affinity:'Any weapon',visual:'Golden radiance, a sun halo and pillars of light.'},
].map(Object.freeze));
export const enchantmentById = new Map(enchantments.map(entry => [entry.id,entry]));
export const visualLevels = Object.freeze([{id:1,name:'I',label:'Subtle'},{id:2,name:'II',label:'Charged'},{id:3,name:'III',label:'Exalted'}].map(Object.freeze));
