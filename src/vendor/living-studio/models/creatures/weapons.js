/** Hand-bone attachments in the native player's Z-up bind coordinates. */
export function buildWeapons(s,look){
 const kind=look.weapon;if(['none','claws'].includes(kind))return;
 s.bone='handR';const x=1.64,y=-.36,z=3.83;
 if(kind==='bow'){
  const points=[[x,y+.70,5.37],[x,y+.27,5.02],[x,y+.03,4.47],[x,y,z],[x,y+.16,3.12],[x,y+.45,2.60],[x,y+.70,2.35]];
  s.tube('Carved bow limbs',points,[.03,.055,.061,.065,.06,.045,.027],'#765337',8);
  s.tube('Bow leather grip',[[x,y,z+.16],[x,y,z-.18]],.081,'#302b22',8);
  s.tube('Bowstring',[[x,y+.70,5.37],[x,y+.64,z],[x,y+.70,2.35]],.012,'#c8bd96',5);
  s.tube('Nocked arrow shaft',[[x,y+.70,z+.10],[x,y-2,z+.10]],.018,'#b9a474',6);
  s.mesh('Nocked arrow steel tip',[[x-.08,y-1.88,z+.10],[x+.08,y-1.88,z+.10],[x,y-2.22,z+.1]],[[0,1,2]],'steel');
  s.bone='chest';s.tube('Leather back quiver',[[.66,.48,4.92],[.56,.73,6.04],[.49,.79,6.68]],[[.20,.18],[.20,.18],[.22,.2]],'#574331',10);
  s.tube('Quiver upper binding',[[.51,.78,6.54],[.49,.79,6.69]],.235,'#a38a59',8);
  for(let i=0;i<6;i++){const px=.40+(i%3)*.095,py=.73+Math.floor(i/3)*.1;s.tube('Quiver arrow '+i,[[px,py,6.3],[px-.06,py+.04,7.02+(i%2)*.15]],.019,'#af9566',5);s.mesh('Arrow feather '+i,[[px-.12,py+.04,6.8],[px-.13,py+.04,7.14],[px+.005,py+.04,7.05],[px,py+.04,6.84]],[[0,1,2,3]],'#b9b7a1');}
  return;
 }
 const axe=kind==='axe',rapier=kind==='rapier',dagger=kind==='dagger',long=kind==='longsword';
 s.tube('Weapon wrapped grip',[[x,y,z-.23],[x,y,z+.13]],.085,'#493729',8);
 for(let i=0;i<5;i++)s.ring('Grip wrap '+i,[x,y,z-.19+i*.063],.087,.009,'#917553','z');
 s.ico('Weapon pommel',[x,y,z-.28],[.12,.10,.11],'steel',1);
 if(axe){
  s.tube('Raider axe haft',[[x,y,z-.50],[x,y,z+1.7]],[.065,.085],'wood_light');
  s.mesh('Raider bearded axe blade',[[x-.02,y-.08,z+1.60],[x+.59,y-.06,z+1.78],[x+.65,y-.07,z+.93],[x+.31,y-.06,z+.8],[x+.28,y-.06,z+1.17],[x-.02,y-.08,z+1.17],[x-.02,y+.06,z+1.60],[x+.59,y+.03,z+1.78],[x+.65,y+.03,z+.93],[x+.31,y+.04,z+.8],[x+.28,y+.04,z+1.17],[x-.02,y+.06,z+1.17]],[[0,1,2,3,4,5],[6,11,10,9,8,7],[0,6,7,1],[1,7,8,2],[2,8,9,3],[3,9,10,4],[4,10,11,5],[5,11,6,0]],'steel');
  s.tube('Axe polished cutting edge',[[x+.59,y-.06,z+1.78],[x+.65,y-.065,z+.93],[x+.31,y-.06,z+.80]],.023,'steel_edge',5);return;
 }
 s.tube('Sword crossguard',[[x-.32,y,z+.18],[x,y-.02,z+.22],[x+.32,y,z+.18]],.055,look.trim??'steel',6);
 const length=dagger?.75:rapier?2.40:long?2.65:1.60,width=rapier?.06:dagger?.12:.145;
 s.mesh('Forged blade',[[x-width,y,z+.25],[x,y-.042,z+.25],[x+width,y,z+.25],[x,y+.042,z+.25],[x-width*.75,y,z+.25+length*.76],[x,y-.035,z+.25+length*.76],[x+width*.75,y,z+.25+length*.76],[x,y+.035,z+.25+length*.76],[x,y,z+.25+length]],[[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0],[4,8,5],[5,8,6],[6,8,7],[7,8,4]],'steel_edge');
 if(rapier)s.ring('Rapier swept finger guard',[x,y,z+.10],.24,.024,look.trim,'y');
 if(kind==='shield'||kind==='buckler'){
  s.bone='handL';const sx=-1.66,sy=-.52,sz=4.0;
  if(kind==='shield'){
   s.cube('Legion square shield body',[sx,sy,sz],[1.42,.15,1.91],'#202b2b',.08);
   for(const side of[-1,1])s.cube('Square shield side rim '+side,[sx+side*.69,sy-.035,sz],[.065,.13,1.85],'steel');
   for(const side of[-1,1])s.cube('Square shield end rim '+side,[sx,sy-.035,sz+side*.90],[1.42,.13,.065],'steel');
   s.cube('Shield vertical reinforcement',[sx,sy-.12,sz],[.10,.04,1.76],look.trim);s.cube('Shield horizontal reinforcement',[sx,sy-.12,sz],[1.27,.04,.09],look.trim);
   s.ico('Shield square boss',[sx,sy-.19,sz],[.24,.14,.25],'steel');
   for(const side of[-1,1])for(const height of[-1,1])s.ico('Shield rivet '+side+height,[sx+side*.57,sy-.13,sz+height*.77],[.04,.035,.04],look.trim,1);
  }else{
   s.ico('Round wooden buckler',[sx,sy,sz],[.56,.12,.56],'#64513a');s.ring('Buckler iron rim',[sx,sy-.035,sz],.54,.045,'steel_dark','y');s.ico('Buckler central boss',[sx,sy-.14,sz],[.18,.12,.18],'steel');
  }
 }
}
