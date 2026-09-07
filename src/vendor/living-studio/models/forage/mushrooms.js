import {THREE,kit,TAU} from '../dressing/shared.js';

export const mushroomIds=new Set(['chanterelle','oyster_mushroom','porcini','morel','fly_agaric']);

function cap(k,name,p,r,h,color,funnel=false) {
  const points=(funnel?[[0,.16],[.18,.12],[.38,.22],[.65,.52],[1,.64],[.94,.78],[.66,.64],[.38,.39],[.14,.24],[0,.24]]:[[0,0],[.6,.02],[1,.14],[.94,.46],[.72,.79],[.36,.96],[0,1]]).map(([x,y])=>new THREE.Vector2(x*r,y*h));
  const o=k.mesh(name,new THREE.LatheGeometry(points,16),color);o.position.set(...p);return o;
}

function gills(k,p,r,h,color,count=14) {
  for(let i=0;i<count;i++){
    const a=i/count*TAU;
    k.beam(`Radial gill ${i}`,[p[0]+Math.cos(a)*r*.18,p[1]-h*.3,p[2]+Math.sin(a)*r*.18],[p[0]+Math.cos(a)*r*.94,p[1]+h*.09,p[2]+Math.sin(a)*r*.94],r*.025,r*.035,color);
  }
}

export function buildMushrooms(id) {
  const root=new THREE.Group();root.name=`${id} botanical master`;const k=kit(root);
  if(id==='chanterelle'){
    for(let i=0;i<4;i++){
      const a=i/4*TAU,x=Math.cos(a)*.05,z=Math.sin(a)*.037,s=.8+i*.08;
      k.cylinder(`Chanterelle ${i+1} tapered stem`,[x,.028*s,z],.009*s,.005*s,.057*s,'#cf9b2e',7);
      cap(k,`Chanterelle ${i+1} flared funnel`,[x,.043*s,z],.03*s,.025*s,'#edbd45',true);
      for(let j=0;j<14;j++){
        const a=j/14*TAU,points=[[x+Math.cos(a)*.006*s,.034*s,z+Math.sin(a)*.006*s],[x+Math.cos(a)*.007*s,.047*s,z+Math.sin(a)*.007*s],[x+Math.cos(a)*.016*s,.054*s,z+Math.sin(a)*.016*s],[x+Math.cos(a)*.028*s,.059*s,z+Math.sin(a)*.028*s]];
        const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));k.mesh(`Chanterelle ${i+1} decurrent gill ${j}`,new THREE.TubeGeometry(curve,6,.0008*s,3,false),'#b99239');
      }
    }
  } else if(id==='porcini'){
    for(let i=0;i<2;i++){
      const x=(i-.5)*.09,s=i?.8:1;
      k.sphere(`Porcini ${i+1} bulbous stem`,[x,.052*s,0],[.027*s,.059*s,.025*s],'#ded1ad',1);
      cap(k,`Porcini ${i+1} brown cushion cap`,[x,.09*s,0],.063*s,.045*s,'#865233');
      k.cylinder(`Porcini ${i+1} pale pore surface`,[x,.091*s,0],.056*s,.044*s,.008*s,'#c8bb82',16);
    }
  } else if(id==='fly_agaric'){
    k.sphere('White swollen volva',[0,.018,0],[.02,.021,.018],'whitewash',0);
    k.cylinder('White mushroom stipe',[0,.06,0],.009,.013,.095,'whitewash',9);
    k.cylinder('White drooping stem skirt',[0,.075,0],.009,.021,.017,'plaster',12);
    cap(k,'Red agaric cap',[0,.092,0],.06,.03,'#b84332');
    gills(k,[0,.094,0],.052,.014,'plaster',16);
    for(let i=0;i<19;i++){
      const a=i*2.399,r=.012+.039*Math.sqrt(i/19),y=.092+.03*Math.sqrt(1-(r/.06)**2);
      k.sphere(`White cap fleck ${i}`,[Math.cos(a)*r,y,Math.sin(a)*r],[.004,.002,.0035],'whitewash',0);
    }
  } else if(id==='morel'){
    for(let n=0;n<2;n++){
      const x=(n-.5)*.053,s=n?.8:1;
      k.cylinder(`Morel ${n+1} hollow pale stem`,[x,.022*s,0],.009*s,.013*s,.044*s,'plaster',8);
      k.sphere(`Morel ${n+1} dark cap recesses`,[x,.066*s,0],[.021*s,.04*s,.021*s],'#514330',1);
      for(let row=0;row<5;row++)for(let j=0;j<7;j++){
        const a=j/7*TAU+(row%2)*.3,yy=.038+row*.013,rr=.018*Math.sin((row+1)/6*Math.PI)+.002;
        const cell=k.torus(`Morel ${n+1} honeycomb cell ${row} ${j}`,[x+Math.cos(a)*rr*s,yy*s,Math.sin(a)*rr*s],.0065*s,.0018*s,'#aa8852',[0,Math.PI/2-a,0],6);cell.scale.y=1.25;
      }
    }
  } else if(id==='oyster_mushroom'){
    // Bark attachment is intentionally shallow, preserving the 20 cm fan span.
    k.rock('Weathered bark attachment',[0,.06,-.018],[.066,.071,.018],'woodDark',1);
    for(let i=0;i<4;i++){
      const x=(i%2-.5)*.045,y=.025+Math.floor(i/2)*.045;
      const g=new THREE.CylinderGeometry(.065,.05,.012,16,1,false,Math.PI*.1,Math.PI*1.8);
      const fan=k.mesh(`Oyster shelf ${i+1} pale fan`,g,i%2?'#bdbeb5':'#d1cfc1');fan.position.set(x,y,.025);fan.scale.z=.7;
      for(let j=0;j<11;j++){
        const a=.2+j/10*Math.PI;
        k.beam(`Oyster shelf ${i+1} underside gill ${j}`,[x,y-.008,-.01],[x+Math.cos(a)*.06,y-.008,Math.sin(a)*.044],.0015,.0015,'#90978e');
      }
    }
  }
  return root;
}
