/** Timing-only build transform. The regular game build never imports this. */
export function transitionProbe() {
 return {name:'performance-transition-spans',transform(code,id){
  if(!id.endsWith('/src/game/world_runtime.js'))return;
  const changes=[
   ["function openLevel(site, level, arriveAt = 'entrance') {", "function openLevel(site, level, arriveAt = 'entrance') {\n globalThis.__bwTransitionMark?.('begin');"],
   ['      const built = cavern', "      globalThis.__bwTransitionMark?.('layout and previous disposal');\n      const built = cavern"],
   ['      if(isShoulder(site))furnishShoulder(built,layout);', "      globalThis.__bwTransitionMark?.('basic dungeon scene');\n      if(isShoulder(site))furnishShoulder(built,layout);"],
   ['      scene.add(built.group);', "      globalThis.__bwTransitionMark?.('furnishings');\n      scene.add(built.group);"],
   ['      fire({\n        site, level, inside: true', "      globalThis.__bwTransitionMark?.('placement and streaming');\n      fire({\n        site, level, inside: true"],
   ['        exits: exitPositions(built),\n      });', "        exits: exitPositions(built),\n      });\n      globalThis.__bwTransitionMark?.('arrival listeners');"],
  ];
  for(const [from,to] of changes){if(!code.includes(from))throw Error('Transition probe source changed: '+from);code=code.replace(from,to);}
  return {code,map:null};
 }};
}
