import {spawnSync} from 'node:child_process';
const checks=[
 'src/world/cellar_art.test.mjs','src/world/old_cellars.test.mjs',
 'src/game/cellar_blender_boss.test.mjs','src/game/cellar_oram_model.test.mjs',
 'src/game/cellar_raid_client.test.mjs','src/game/cellar_raid_effects.test.mjs',
 'src/world/collision/shapes.test.mjs','src/world/collision/dungeon.test.mjs',
 'src/game/combat.test.mjs','src/game/net.test.mjs','src/game/scene.test.mjs',
 'server/room_logic.test.mjs','server/cellar_raid.test.mjs',
];
for(const file of checks){
 const result=spawnSync(process.execPath,[file],{encoding:'utf8',maxBuffer:8*1024*1024});
 if(result.status!==0){process.stderr.write((result.stdout||'')+(result.stderr||''));throw Error('Cellar regression failed: '+file);}
 console.log('PASS '+file);
}
console.log('CELLAR_INTEGRATION_VERIFIED '+checks.length+' suites');
