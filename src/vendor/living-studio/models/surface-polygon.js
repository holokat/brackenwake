const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function clipProjectedPolygon(polygon,triangle){
 let result=polygon;const winding=Math.sign(cross(...triangle));
 for(let edge=0;edge<3;edge++){
  const a=triangle[edge],b=triangle[(edge+1)%3],input=result;result=[];
  for(let i=0;i<input.length;i++){
   const p=input[i],q=input[(i+1)%input.length],dp=cross(a,b,p)*winding,dq=cross(a,b,q)*winding;
   if(dp>=-1e-9)result.push(p);
   if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);result.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
  if(result.length<3)return [];
 }
 return result;
}

