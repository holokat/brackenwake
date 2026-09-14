// Isolated progression harness only. Exercises the real panel and runtime.
export async function verifyLiveTalents(b, report) {
  const {CLASS_TREES,CLASS_NODES}=await import('/src/mmo/class_trees.js');
  const {MAX_XP,nodeRank,availablePoints}=await import('/src/mmo/talents.js');
  const {ABILITIES_BY_ID}=await import('/src/mmo/abilities.js');
  const {abilityPreview}=await import('/src/mmo/effective_ability.js');
  const {hydrate}=await import('/src/game/state.js');
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const c=b.state.character;
  b.levels.award(MAX_XP);b.windows.open('abilities');await pause(650);
  const node=CLASS_NODES['mage.arcane.copperThread'];
  const root=document.querySelector('.bw-talents');
  const button=root.querySelector(`[data-node-id="${node.id}"] .talent-icon`);
  assert(button,'Original modifier is absent from live tree');
  assert(!root.textContent.includes('Planned')&&!root.querySelector('.talent-roadmap-toggle'),'Planned nodes still appear');
  const count=CLASS_TREES.find(t=>t.id==='mage').branches.flatMap(t=>t.nodes).length;
  assert(root.querySelectorAll('.talent-node').length===count,'Live tree omitted class nodes');
  const before=abilityPreview(c,ABILITIES_BY_ID.magicArrow,{actor:b.actor});
  const points=availablePoints(c);
  button.click();
  for(let rank=1;rank<=3;rank++){
    const learn=root.querySelector('.talent-detail-learn');assert(!learn.disabled,`Modifier rank ${rank} is not purchasable`);learn.click();
    assert(nodeRank(c,node)===rank,`Modifier rank ${rank} did not apply`);
  }
  const after=abilityPreview(c,ABILITIES_BY_ID.magicArrow,{actor:b.actor});
  assert(after.damage.min>before.damage.min,'Damage talent did not change evaluated damage');
  assert(availablePoints(c)===points-3,'Modifier purchase spent the wrong point count');
  assert(nodeRank(hydrate(JSON.parse(JSON.stringify(c))),node)===3,'Modifier rank was lost on save hydration');
  button.dispatchEvent(new PointerEvent('pointerenter',{clientX:200,clientY:200}));
  const hover=document.querySelector('#bw-tip');
  assert(hover&&!hover.hidden&&hover.textContent.includes('9% damage'),'Hover does not show the current modifier value');
  button.dispatchEvent(new PointerEvent('pointerleave'));
  const deadline=performance.now()+9000;
  while(b.combat.inCombat(b.actor)&&performance.now()<deadline)await pause(100);
  const mana=b.actor.mana,health=b.actor.health;
  root.querySelector('.talent-reset').click();
  assert(nodeRank(c,node)===0,'Reset button did not refund modifier allocations');
  assert(b.actor.health<=health+.01&&b.actor.mana<=mana+.01,'Reset granted free resources');
  const final=abilityPreview(c,ABILITIES_BY_ID.magicArrow,{actor:b.actor});
  assert(final.damage.min===before.damage.min,'Reset retained an unlearned damage modifier');
  assert(root.querySelectorAll('.talent-node').length===count,'Reset removed tree nodes from presentation');
  await report({stage:'live-talents-verified',classNodes:count,totalNodes:Object.keys(CLASS_NODES).length,modifierRankBeforeReset:3,damageBefore:before.damage,damageAfter:after.damage,damageAfterReset:final.damage,hover:true,persistence:true,respec:true});
}
