// Exercises the real creation, roster, persistence and entry paths on a fresh
// localhost origin. Refuses to write over an existing player's roster.
const key='brackenwake-localhost-qa';
const report=async value=>{document.title=`Local entry QA: ${value.stage}`; await fetch('http://127.0.0.1:5318/report',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});};
const ownKeys=()=>Object.keys(localStorage).filter(k=>k.startsWith('brackenwake-'));
const wait=async test=>{const end=performance.now()+150000;while(!test()){if(performance.now()>end)throw Error('Entry test timed out');await new Promise(r=>setTimeout(r,100));}};
const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
try{
 const resuming=sessionStorage.getItem(key)==='created';
 if(!resuming && ownKeys().some(k=>!k.includes('creation-draft')))throw Error('Existing character data present; test refuses to modify it');
 if(!resuming)sessionStorage.setItem(key+'-backup',JSON.stringify(Object.fromEntries(ownKeys().map(k=>[k,localStorage.getItem(k)]))));
 await import('/src/game/main.js');
 await wait(()=>window.__bw?.creating||window.__bw?.roster||window.__bw?.loadingError);
 if(window.__bw?.loadingError)throw Error('World failed to load');
 if(!resuming){
  if(!window.__bw.creating)throw Error('Expected fresh character creation');
  const name=document.querySelector('input[placeholder="a name"]');name.value='Local QA';name.dispatchEvent(new Event('input',{bubbles:true}));
  [...document.querySelectorAll('button')].find(b=>/create character/i.test(b.textContent)).click();
  await wait(()=>window.__bw?.player);const b=window.__bw;
  b.state.save();
  await report({stage:'created',character:b.state.character?.name||b.character?.name,roster:b.state.roster().map(r=>({id:r.id,name:r.name})),errors});
  sessionStorage.setItem(key,'created');location.reload();
 }else{
  if(!window.__bw.roster)throw Error('Saved character missing after reload');
  [...document.querySelectorAll('button')].find(b=>b.classList.contains('bw-ro-hero-play')).click();
  await wait(()=>window.__bw?.player);const b=window.__bw;
  const before={...b.player.pos};
  b.sc.render();
  await report({stage:'passed',savedRosterResumed:true,position:before,shaders:b.sc.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,errors});
  // Leave no test character behind. A normal /play load sees the original data.
  const backup=JSON.parse(sessionStorage.getItem(key+'-backup')||'{}');
  for(const k of ownKeys())localStorage.removeItem(k);for(const[k,v]of Object.entries(backup))localStorage.setItem(k,v);
  sessionStorage.removeItem(key);sessionStorage.removeItem(key+'-backup');
  const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(!String(k).startsWith('brackenwake-'))return set.call(this,k,v);};
  location.href='/play';
 }
}catch(error){await report({stage:'failed',error:String(error),errors});}
