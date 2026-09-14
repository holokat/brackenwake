// Browser geometry assertions against the actual character panel and theme.
// Node DOM fixtures cannot detect inherited slot widths or canvas stretching.
export function watchCharacterLayout(report) {
  let pending;
  const measure = () => {
    const root=document.querySelector('.bw-sheet'),body=root?.parentElement;
    if(!root)return;
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const slots=[...root.querySelectorAll('.bw-doll-slot')].map(el=>{
      const label=el.querySelector('.bw-doll-label');
      return {id:el.dataset.slot,...rect(el),label:rect(label),labelFits:label.scrollWidth<=label.clientWidth+1};
    });
    const canvas=root.querySelector('canvas'),stage=root.querySelector('.bw-doll-stage'),pack=root.querySelector('.bw-pack-panel'),stats=root.querySelector('.bw-left-panel'),bag=root.querySelector('.bw-bag-grid');
    const failures=[];
    if(slots.length!==12)failures.push('All twelve equipment slots must render');
    for(const slot of slots){
      if(slot.width<64)failures.push(`${slot.id} inherits a narrow inventory width`);
      if(!slot.labelFits||slot.label.height>20)failures.push(`${slot.id} label wraps or clips`);
      if(slot.label.right>slot.right+1||slot.label.bottom>slot.bottom+1)failures.push(`${slot.id} label escapes its slot`);
    }
    if(canvas&&getComputedStyle(canvas).objectFit!=='contain')failures.push('Portrait stretches its intrinsic aspect ratio');
    if(body.scrollWidth>body.clientWidth+1)failures.push('Character page overflows horizontally');
    if(rect(body).width>innerWidth+1||rect(body).right>innerWidth+1)failures.push('Character body expands its frame beyond the screen');
    if(innerWidth>1150&&innerHeight>680){
      if(rect(root).bottom>rect(body).bottom+1)failures.push('Inventory stretches the whole sheet beyond its viewport');
      if(rect(stage).right>rect(pack).x+1||rect(stats).right>rect(stage).x+1)failures.push('Columns overlap');
      if(bag.scrollHeight<=bag.clientHeight)failures.push('Full inventory should scroll within its own panel');
    }
    report({stage:failures.length?'character-layout-failed':'character-layout-verified',viewport:[innerWidth,innerHeight],failures,slots,portrait:canvas?{...rect(canvas),bitmap:[canvas.width,canvas.height],fit:getComputedStyle(canvas).objectFit}:null,panels:{stats:rect(stats),stage:rect(stage),pack:rect(pack)}});
  };
  const schedule=()=>{clearTimeout(pending);pending=setTimeout(measure,180);};
  addEventListener('resize',schedule);
  measure();
  return ()=>{removeEventListener('resize',schedule);clearTimeout(pending);};
}
