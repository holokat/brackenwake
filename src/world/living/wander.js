// Movement is chosen within an authored home, with pauses and a collision-safe
// straight approach. It never changes where a settlement or habitat is placed.
const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export function createWander({id,x,y=0,z,range=3,speed=.65,pause=5,radius=.32,attention=3.5}){
 const home={x,y,z},pos={x,y,z};let serial=hash(id),target=null,rest=(serial%37)/7,phase=0,yaw=0,mode='idle',distance=0;
 const unit=()=>{serial=(Math.imul(serial,1664525)+1013904223)>>>0;return serial/4294967296;};
 return{home,pos,get mode(){return mode;},get phase(){return phase;},get yaw(){return yaw;},get distance(){return distance;},
  update(dt,{field,physical,observer,others=[],held=false}={}){
   dt=Math.max(0,Math.min(.1,dt||0));mode='idle';
   if(held||(observer&&Math.hypot(observer.x-pos.x,observer.z-pos.z)<attention)){rest=Math.max(rest,1.2);return pos;}
   if(rest>0){rest-=dt;return pos;}
   const safe=(from,to)=>{const q=field?.sampleAt?.(to.x,to.z);if(q?.water)return false;to.y=q?.h??field?.heightAt?.(to.x,to.z)??pos.y;
    if(Math.abs(to.y-from.y)>Math.max(.3,Math.hypot(to.x-from.x,to.z-from.z)*.6))return false;
    if(physical&&!physical.canMove(from,to,radius,1.7))return false;
    return !others.some(o=>o!==pos&&Math.hypot(o.x-to.x,o.z-to.z)<radius*2+.22);
   };
   if(!target){for(let i=0;i<8;i++){const a=unit()*Math.PI*2,r=range*(.25+.75*Math.sqrt(unit())),q={x:home.x+Math.sin(a)*r,y:pos.y,z:home.z+Math.cos(a)*r};if(safe(pos,q)){target=q;break;}}if(!target){rest=1.5;return pos;}}
   const dx=target.x-pos.x,dz=target.z-pos.z,d=Math.hypot(dx,dz);
   if(d<.1){target=null;rest=pause*(.6+unit());return pos;}
   const step=Math.min(d,speed*dt),to={x:pos.x+dx/d*step,y:pos.y,z:pos.z+dz/d*step};
   if(!safe(pos,to)){target=null;rest=.7+unit();return pos;}
   Object.assign(pos,to);yaw=Math.atan2(dx,dz);mode='walk';phase+=step/1.4*Math.PI*2;distance+=step;return pos;
  },
 };
}
