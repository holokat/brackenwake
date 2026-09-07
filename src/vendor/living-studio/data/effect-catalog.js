const source='https://kaldera-codex.cogentgene.workers.dev/dressing.html';
const rows=[
 ['butterflies','Butterflies','Ambient life','White and orange butterflies wander above a flower patch by day.',8,2.5,'butterfly','#f4c97d'],
 ['fireflies','Fireflies','Ambient life','Warm points blink and drift above the water meadows at night.',8,3,'motes','#c9ef8c'],
 ['chimney_smoke','Chimney smoke','Weather and atmosphere','Soft smoke rises from a chimney socket and disperses downwind.',6,2.4,'smoke','#b9b9ad'],
 ['pollen_motes','Pollen motes','Weather and atmosphere','Fine pollen drifts through a narrow shaft of woodland light.',10,2.8,'pollen','#f4d991'],
 ['mist_bank','Night mist','Weather and atmosphere','A low mist moves in overlapping veils across the mere.',12,4,'mist','#91acb6'],
 ['crow_flock','Crow flock','Ambient life','Six crows lift from the field, climb and bank together.',5,3.5,'crows','#252831'],
 ['rain_shower','Rain shower','Weather and atmosphere','Slanted rain streaks fall into expanding shallow puddle rings.',4,3,'rain','#a6bdc9'],
 ['waterfall_spray','Waterfall spray','Water','White droplets arc away from a water impact with a soft spray veil.',3,2.2,'spray','#d3edf1'],
 ['falling_leaves','Falling leaves','Foliage','Ochre leaves tumble and settle in a light woodland breeze.',8,3,'leaves','#cb9959'],
 ['drifting_petals','Drifting petals','Foliage','Pale pink petals turn and drift beneath a flowering tree.',10,2.5,'petals','#dfb2ad'],
 ['floating_seeds','Floating seeds','Foliage','Fine dandelion seeds lift from meadow grass in a gentle breeze.',12,2.5,'seeds','#e9e3cf'],
 ['creek_ripples','Creek ripples','Water','Thin silver ripples widen around pebbles in a shallow current.',5,2.5,'creek','#abc9c8'],
 ['marsh_bubbles','Marsh bubbles','Water','Small bubbles rise and break across still marsh water.',6,2,'bubbles','#a4b9a2'],
 ['chimney_embers','Chimney embers','Fire and smoke','A sparse trail of red and amber embers rises from a chimney socket.',5,2,'embers','#eb9a59'],
 ['dust_gust','Dust gust','Weather and atmosphere','Low ribbons of pale dust move across a dry lane and disperse.',7,3,'gust','#bfaa89'],
 ['mushroom_spores','Mushroom spores','Foliage','Fine warm spores lift and wander above a damp mushroom cluster.',8,1.5,'spores','#c5c597'],
 ['roof_drips','Roof drips','Water','Intermittent drops fall from three eave points and ripple on the ground.',4,1.8,'drips','#b0ced6'],
 ['snow_flurries','Snow flurries','Weather and atmosphere','Uneven snowflakes tumble through a slow crosswind.',10,3,'snow','#e5e9e7'],
 ['watch_fire','Watch fire','Fire and smoke','A restrained orange flame, smoke and occasional embers for a roadside brazier.',4,1.5,'flame','#eca565'],
 ['woodland_shafts','Woodland light shafts','Weather and atmosphere','Slender, oblique shafts of warm light reveal drifting woodland dust.',12,3,'shafts','#e2d3ad'],
 ['cave_dust','Cave dust','Weather and atmosphere','Pale stone grains settle through a cool shaft of light below a mine roof.',9,2,'cave','#bbbdba'],
 ['pond_foam','Pond foam','Water','Loose pale foam rings circle slowly at a pond inlet.',7,2.5,'foam','#d6dfcd'],
];
export const effectCatalog=rows.map(([id,name,category,description,duration,radius,style,color],i)=>Object.freeze({id,name,category,description,duration,radius,style,color,type:'vfx',source:i<6?source:null,authored:i>=6,loop:style!=='crows'}));
export const effectById=new Map(effectCatalog.map(e=>[e.id,e]));
