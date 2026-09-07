/** Original closed-helmet knight. Native editable geometry, Z up, front -Y. */
import * as THREE from 'three';
const {sin,cos,PI:pi}=Math;
const len=v=>v.length, list=v=>[...v], tuple=list, reversed=v=>[...v].reverse();
const sum=v=>v.reduce((a,b)=>a+b,0);
const range=(start,end,step=1)=>{if(end===undefined){end=start;start=0;}const out=[];for(let v=start;step>0?v<end:v>end;v+=step)out.push(v);return out;};
const zip=(a,b)=>a.slice(0,b.length).map((v,i)=>[v,b[i]]), enumerate=v=>v.map((v,i)=>[i,v]);

const knightMaterial=(name,color,metalness=.55,roughness=.48,extra={})=>new THREE.MeshStandardMaterial({
  name,color,metalness,roughness,flatShading:true,vertexColors:true,side:THREE.DoubleSide,...extra,
});
const knightPalette={
  steel:knightMaterial('Knight gunmetal','#34454d',.68,.43),
  steel_dark:knightMaterial('Knight obsidian','#17262d',.62,.47),
  steel_edge:knightMaterial('Knight ivory steel','#c9cec7',.60,.36),
  leather:knightMaterial('Knight dark leather','#3b2b27',.0,.88),
  leather_dark:knightMaterial('Knight black leather','#201c1c',.0,.90),
  leather_light:knightMaterial('Knight leather bindings','#70534a',.0,.84),
  red:knightMaterial('Knight crimson cloth','#952f3d',.0,.86),
  red_dark:knightMaterial('Knight oxblood cloth','#4b1724',.0,.92),
  gold:knightMaterial('Knight aged gold','#bc9960',.66,.43),
  cloth_dark:knightMaterial('Knight charcoal weave','#25262b',.0,.94),
  visor:knightMaterial('Knight amber visor','#ffdc91',.15,.22,
    {emissive:'#ffb949',emissiveIntensity:2.8,toneMapped:false}),
};
function _knightGeometry(base) {
  const materialIndex={mesh:3,loft:2,tube:3,ico:3,cube:3,ribbon:3};
  return new Proxy(base,{
    get(target,key) {
      if(!(key in materialIndex))return Reflect.get(target,key);
      return(...args)=>{
        const index=materialIndex[key];
        if(/red upper sleeve/.test(args[0]))args[index]='cloth_dark';
        args[index]=knightPalette[args[index]]||args[index];
        if(key!=='ribbon')args[index+1]={...(args[index+1]||{}),variation:.022};
        return target[key](...args);
      };
    },
    set(target,key,value){target[key]=value;return true;},
  });
}

// Editable armor assembled from fitted shells, overlapping plates and real trim.
function _triangulated_panel(h,name,outline,material,center=null,thickness=0.045) {
  let area,faces,n,vertices;
  // A closed plate with an intentional faceted face and a solid rear wall.
  outline = list(outline);
  area = sum(zip(outline,outline.slice(1,undefined).concat(outline.slice(undefined,1))).map(([a,b])=>((a[0]*b[2])-(b[0]*a[2]))));
  if (((area*thickness)<0)) {
    outline.reverse();
  }
  n = len(outline);
  if ((center===null)) {
    center = tuple(range(3).map((i)=>(sum(outline.map((v)=>v[i]))/n)));
    center = [center[0],(center[1]-0.035),center[2]];
  }
  vertices = list(outline).concat([center]);
  vertices.push(...outline.map(([x,y,z])=>[x,(y+thickness),z]));
  faces = range(n).map((i)=>[i,((i+1)%n),n]);
  faces.push(...range(n).map((i)=>[((n+1)+i),((n+1)+((i+1)%n)),((i+1)%n),i]));
  faces.push(tuple(reversed(range((n+1),((2*n)+1)))));
  return h.mesh(name,vertices,faces,material,{variation:0.055});
}

function _edge(h,name,points,material="steel_edge",radius=0.023,close=false) {
  let path;
  path = list(points);
  if (close) {
    path.push(path[0]);
  }
  return h.tube(name,path,Array(len(path)).fill(radius),material,{sides:4,variation:0.025});
}

function _waist_band(h,name,bottom,top,rx,ry,material,cx=0,cy=0,n=12) {
  return h.loft(name,[[cx,cy,bottom,rx,ry],[cx,cy,top,rx,ry]],material,{n:n,caps:false,variation:0.035});
}

function _buckle(h,name,x,y,z,width,height,material="gold") {
  let bar,cx,cz,ht,suffix,w;
  // Open square buckle with beveled bars and a visible tongue.
  bar = 0.065;
  for ([suffix,cx,cz,w,ht] of [["left",(x-(width/2)),z,bar,(height+bar)],["right",(x+(width/2)),z,bar,(height+bar)],["top",x,(z+(height/2)),width,bar],["bottom",x,(z-(height/2)),width,bar]]) {
    h.cube(`${name} ${suffix}`,[cx,y,cz],[w,0.075,ht],material,{bevel:0.009});
  }
  h.cube(`${name} tongue`,[(x+0.026),(y-0.035),z],[(width*0.66),0.055,0.038],material,{bevel:0.006});
}

function _openCollar(h) {
  const vertices=[], faces=[], n=12;
  // A standing collar opens into a V at the front and rises behind the neck.
  for (let ring=0;ring<4;ring++) {
    const inner=ring>=2, upper=ring%2===1;
    for (let k=0;k<n;k++) {
      const a=k*pi*2/n, front=Math.max(0,cos(a));
      const rise=1-front*front;
      vertices.push([sin(a)*(inner?.322:.356),
        .025-cos(a)*(inner?.276:.31),
        upper?6.69+.20*rise:6.45+.12*rise]);
    }
  }
  for (let k=0;k<n;k++) {
    const next=(k+1)%n;
    faces.push([k,next,n+next,n+k],
      [2*n+next,2*n+k,3*n+k,3*n+next],
      [n+k,n+next,3*n+next,3*n+k],
      [next,k,2*n+k,2*n+next]);
  }
  h.mesh("Warrior open standing red collar",vertices,faces,"red_dark",{variation:.07});
}

function _frontTabard(h) {
  const vertices=[[-.43,-.49,4.23],[-.10,-.52,4.25],[.20,-.50,4.25],[.43,-.48,4.21],
    [-.51,-.54,3.38],[-.26,-.665,3.42],[.14,-.705,3.36],[.515,-.555,3.37],
    [-.47,-.61,2.82],[0,-.68,2.62],[.46,-.60,2.82]];
  const faces=[[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],
    [4,8,5],[5,8,9],[5,9,6],[6,9,10],[6,10,7]];
  const outline=[vertices[0],vertices[3],vertices[7],vertices[10],vertices[9],vertices[8],vertices[4]];
  _triangulated_panel(h,"Warrior pointed front tabard lining",outline,"red_dark",[0,-.62,3.44],.028);
  h.mesh("Warrior pointed red front tabard",vertices,faces,"red",{variation:.10});
  const border=[vertices[0],vertices[4],vertices[8],vertices[9],vertices[10],vertices[7],vertices[3]]
    .map(([x,y,z])=>[x,y-.022,z]);
  h.ribbon("Warrior front tabard flat gold hem",border,.070,"gold");
}

function _bootStraps(h,s,label) {
  // The oblique straps sit on the calf facets and pass around the shaft sides.
  for (const [index,z,x,rx,ry] of [[1,1.66,.737,.393,.385],[2,1.08,.805,.350,.395]]) {
    const vertices=[],faces=[], n=8;
    for (const dz of [-.071,.071]) {
      for (let k=0;k<n;k++) {
        const a=k*pi*2/n;
        vertices.push([s*x+sin(a)*rx,.028-cos(a)*ry,
          z+dz+sin(a)*.072]);
      }
    }
    for(let k=0;k<n;k++)faces.push([k,(k+1)%n,(k+1)%n+n,k+n]);
    h.mesh(`${label} angled leather calf wrap ${index}`,vertices,faces,"leather_dark",{variation:.055});
    h.cube(`${label} calf wrap brass keeper ${index}`,[s*(x+.18),-.283,z+.03],
      [.083,.055,.145],"leather_light");
  }
}

function _torso(h) {
  let faces,front_outline,label,s,vertices,y,z;
  h.loft("Warrior red under-tunic",[[0,0.01,3.88,0.81,0.44],[0,0,4.28,0.72,0.39],[0,0,4.63,0.665,0.39],[0,0,5.1,0.77,0.45],[0,0,5.72,0.92,0.49],[0,0.015,6.13,1.015,0.39],[0,0.015,6.37,0.61,0.32],[0,0.01,6.48,0.31,0.27]],"red_dark",{n:12});
  _openCollar(h);
  for ([s,label] of [[-1,"Left"],[1,"Right"]]) {
    _triangulated_panel(h,`${label} collar folded lapel`,[[(s*0.065),-0.303,6.60],[(s*0.31),-0.24,6.88],[(s*0.4),-0.20,6.71],[(s*0.26),-0.405,6.48]],"red_dark",null,0.025);
    h.loft(`${label} red upper sleeve`,[[(s*1.31),-0.008,5.48,0.32,0.34],[(s*1.2),-0.008,5.78,0.385,0.385],[(s*1.02),0.015,6.13,0.39,0.38]],"red",{n:8});
    h.loft(`${label} sleeve leather hem`,[[(s*1.32),-0.008,5.44,0.327,0.35],[(s*1.292),-0.008,5.53,0.337,0.353]],"leather_dark",{n:8,caps:false});
  }
  h.loft("Warrior leather arming vest",[[0,0,4.72,0.66,0.408],[0,0.01,5.18,0.795,0.476],[0,0.01,5.82,0.955,0.51],[0,0.015,6.15,0.925,0.435],[0,0.015,6.32,0.6,0.32]],"leather_dark",{n:12});
  front_outline = [[-0.38,-0.365,6.31],[0.38,-0.365,6.31],[0.77,-0.405,6.18],[0.84,-0.48,5.84],[0.78,-0.46,5.37],[0.54,-0.42,4.96],[0,-0.46,4.81],[-0.54,-0.42,4.96],[-0.78,-0.46,5.37],[-0.84,-0.48,5.84],[-0.77,-0.405,6.18]];
  _triangulated_panel(h,"Breastplate dark rolled rim",front_outline,"steel_dark",[0,-0.59,5.68],0.1);
  vertices = [[-0.36,-0.394,6.26],[0,-0.455,6.26],[0.36,-0.394,6.26],[-0.725,-0.45,6.14],[0,-0.645,6.06],[0.725,-0.45,6.14],[-0.789,-0.512,5.83],[-0.41,-0.676,5.8],[0,-0.742,5.83],[0.41,-0.676,5.8],[0.789,-0.512,5.83],[-0.721,-0.5,5.38],[0,-0.665,5.39],[0.721,-0.5,5.38],[-0.505,-0.454,5.005],[0,-0.56,4.88],[0.505,-0.454,5.005]];
  faces = [[0,3,4],[0,4,1],[1,4,2],[2,4,5],[3,6,7],[3,7,4],[4,7,8],[4,8,9],[4,9,5],[5,9,10],[6,11,7],[7,11,12],[7,12,8],[8,12,9],[9,12,13],[9,13,10],[11,14,12],[12,14,15],[12,15,16],[12,16,13]];
  h.mesh("Breastplate angular steel face",vertices,faces,"steel",{variation:0.12});
  _edge(h,"Breastplate collar rolled steel",[[-0.735,-0.458,6.15],[-0.36,-0.411,6.275],[0,-0.474,6.27],[0.36,-0.411,6.275],[0.735,-0.458,6.15]],"steel_edge",0.021);
  _edge(h,"Breastplate lower rolled steel",[[-0.724,-0.505,5.36],[-0.508,-0.478,4.985],[0,-0.55,4.848],[0.508,-0.478,4.985],[0.724,-0.505,5.36]],"steel_edge",0.023);
  _edge(h,"Breastplate articulated pectoral seam",[[-0.762,-0.53,5.73],[-0.41,-0.665,5.66],[0,-0.735,5.69],[0.41,-0.665,5.66],[0.762,-0.53,5.73]],"steel_dark",0.012);
  h.loft("Warrior shaped back armor",[[0,0.075,4.92,0.64,0.4],[0,0.075,5.42,0.81,0.45],[0,0.065,5.91,0.91,0.44],[0,0.04,6.21,0.72,0.36]],"steel_dark",{n:10});
  for ([s,label] of [[-1,"Left"],[1,"Right"]]) {
    h.ribbon(`${label} chest shoulder suspension strap`,[[(s*0.63),-0.405,6.03],[(s*0.62),-0.38,6.3],[(s*0.57),-0.23,6.45],[(s*0.58),0.18,6.44],[(s*0.62),0.405,6.15],[(s*0.62),0.473,5.79]],0.145,"leather");
    for ([z,y] of [[6.16,-0.451],[6.37,-0.315]]) {
      h.ico(`${label} suspension brass rivet ${z}`,[(s*0.63),(y-0.015),z],[0.041,0.021,0.041],"gold",{sub:1});
    }
  }
}

function _shoulder(h,s,label) {
  let x,y,z;
  // Three overlapping curved angular shells, solid around front and back.
  function shell(name,rows,material,rear_offset=0.035) {
    let a,angle,b,boundary,c,d,faces,i,j,k,layer,n,outside,rdepth,rev,rheight,side,verts,x,z;
    verts = [];
    for ([x,z,rdepth,rheight] of rows) {
      for (angle of [-100,-70,-38,0,38,70,100]) {
        a = ((angle*pi)/180);
        verts.push([(s*x),(sin(a)*rdepth),(z+(cos(a)*rheight))]);
      }
    }
    n = 7;
    outside = len(verts);
    verts.push(...verts.map(([x,y,z])=>[x,y,(z-rear_offset)]));
    faces = [];
    for ([layer,rev] of [[0,false],[outside,true]]) {
      for (j of range((len(rows)-1))) {
        for (k of range((n-1))) {
          a = ((layer+(j*n))+k);
          b = (a+1);
          c = (a+n);
          d = (c+1);
          if (!(rev)) {
            faces.push(...[[a,c,b],[b,c,d]]);
          } else {
            faces.push(...[[a,b,c],[b,d,c]]);
          }
        }
      }
    }
    boundary = list(range(n));
    boundary.push(...range(1,len(rows)).map((j)=>(((j*n)+n)-1)));
    boundary.push(...list(range(((((len(rows)-1)*n)+n)-2),(((len(rows)-1)*n)-1),-1)));
    boundary.push(...range((len(rows)-2),0,-1).map((j)=>(j*n)));
    for ([i,a] of enumerate(boundary)) {
      b = boundary[((i+1)%len(boundary))];
      faces.push([a,b,(b+outside),(a+outside)]);
    }
    if ((s<0)) {
      faces = faces.map((f)=>tuple(reversed(f)));
    }
    h.mesh(name,verts,faces,material,{variation:0.08});
    for ([k,side] of [[0,"front"],[6,"back"]]) {
      _edge(h,`${name} ${side} rim`,range(len(rows)).map((j)=>verts[((j*n)+k)]),"steel_edge",0.023);
    }
    _edge(h,`${name} outside rim`,verts.slice(((len(rows)-1)*n),(len(rows)*n)),"steel_edge",0.027);
  }

  shell(`${label} pauldron lower articulated plate`,[[0.93,6.04,0.425,0.23],[1.30,5.96,0.46,0.22],[1.64,5.76,0.44,0.12]],"steel_dark");
  shell(`${label} pauldron broad shoulder crown`,[[0.76,6.38,0.35,0.20],[1.02,6.38,0.43,0.27],[1.37,6.30,0.48,0.24],[1.67,6.08,0.46,0.18]],"steel");
  _edge(h,`${label} pauldron inner reinforced arch`,[[(s*0.82),-0.355,6.355],[(s*0.83),-0.29,6.555],[(s*0.84),0,6.635],[(s*0.83),0.29,6.555],[(s*0.82),0.355,6.355]],"steel_edge",0.046);
  const face = [[s*.79,-.356,6.43],[s*1.14,-.452,6.40],
    [s*1.44,-.494,6.26],[s*1.69,-.490,6.00],
    [s*1.21,-.50,6.03],[s*.87,-.392,6.15]];
  _triangulated_panel(h,`${label} broad angular pauldron face`,face,"steel",[s*1.20,-.565,6.22],.045);
  _edge(h,`${label} pauldron front flared border`,[face[5],face[4],face[3]],"steel_edge",.025);
  for ([x,y,z] of [[1.02,-0.455,6.32],[1.45,-0.495,6.15]]) {
    h.ico(`${label} pauldron steel rivet ${x}`,[(s*x),(y-0.025),z],[0.031,0.023,0.031],"steel_edge",{sub:1});
  }
}

function _belt_and_tabard(h) {
  let back,label,outline,s,side,x;
  _waist_band(h,"Warrior broad leather waist belt",4.25,4.7,0.727,0.447,"leather");
  _waist_band(h,"Warrior belt upper piping",4.65,4.71,0.741,0.46,"leather_dark");
  _waist_band(h,"Warrior belt lower piping",4.24,4.3,0.741,0.46,"leather_dark");
  _waist_band(h,"Warrior layered narrow belt",4.43,4.55,0.752,0.478,"leather_light");
  h.cube("Warrior buckle leather backing",[0,-0.485,4.48],[0.51,0.105,0.43],"leather_dark",{bevel:0.025});
  _buckle(h,"Warrior square brass waist buckle",0,-0.562,4.48,0.36,0.33);
  _triangulated_panel(h,"Warrior buckle silver shield insert",[[-0.105,-0.57,4.59],[0.075,-0.57,4.59],[0.122,-0.579,4.44],[0,-0.59,4.35],[-0.117,-0.572,4.44]],"steel_dark",[0,-0.599,4.47],0.015);
  for (x of [-0.54,-0.36,0.38,0.55]) {
    h.cube(`Warrior belt keeper ${x}`,[x,-0.465,4.47],[0.063,0.078,0.33],"leather_dark",{bevel:0.01});
  }
  for ([s,label] of [[-1,"Left"],[1,"Right"]]) {
    h.ribbon(`${label} slanting hip suspension belt`,[[(s*0.22),-0.49,4.3],[(s*0.61),-0.405,4.12],[(s*0.81),-0.24,3.87],[(s*0.86),0.03,3.82]],0.145,"leather");
    _edge(h,`${label} hip strap stitched edge`,[[(s*0.22),-0.504,4.365],[(s*0.635),-0.421,4.172],[(s*0.852),-0.259,3.935]],"leather_light",0.01);
    _triangulated_panel(h,`${label} leather hip skirt`,[[(s*0.4),-0.403,4.23],[(s*0.76),-0.29,4.15],[(s*0.99),-0.24,3.04],[(s*0.73),-0.4,2.88],[(s*0.46),-0.452,3.13]],"leather_dark",[(s*0.73),-0.45,3.69]);
    side = [[(s*0.49),-0.46,4.17],[(s*0.73),-0.355,4.08],[(s*0.927),-0.3,3.08],[(s*0.736),-0.46,2.976],[(s*0.553),-0.5,3.16]];
    _triangulated_panel(h,`${label} red side tabard`,side,"red_dark",[(s*0.694),-0.487,3.62]);
    _edge(h,`${label} side tabard gold hem`,side.slice(1,undefined),"gold",0.027);
  }
  _frontTabard(h);
  for ([s,label] of [[-1,"Left"],[1,"Right"]]) {
    const overlapOffset=s<0?.012:0;
    back = [[(s*-0.040),0.480+overlapOffset,4.18],[(s*0.6),0.430+overlapOffset,4.13],
      [(s*0.67),0.570+overlapOffset,2.92],[(s*-0.025),0.610+overlapOffset,2.75]];
    _triangulated_panel(h,`${label} rear red tabard`,back,"red_dark",[(s*0.35),0.645+overlapOffset,3.38],-0.035);
    _edge(h,`${label} rear tabard gold hem`,[back[1],back[2],back[3]],"gold",0.027);
  }
  h.ribbon("Warrior diagonal waist leather fastening",[[0.25,-0.557,4.84],[0.57,-0.451,4.98],[0.72,-0.26,5.03],[0.77,0.07,4.95]],0.145,"leather");
  h.ico("Warrior brass waist fastening",[0.57,-0.489,4.96],[0.14,0.05,0.13],"gold",{sub:1});
}

function _legs_and_boots(h) {
  let a,ankle,b,c,center,d,faces,footprint,inner,j,k,knee,label,r,row,s,sole_faces,sole_verts,vertices,x,z;
  h.loft("Warrior dark fitted trousers hips",[[0,0.005,3.67,0.73,0.395],[0,0.005,4.25,0.735,0.395]],"cloth_dark",{n:12});
  for ([s,label] of [[-1,"Left"],[1,"Right"]]) {
    h.loft(`${label} dark folded trouser leg`,[
      [s*.72,.01,1.98,.25,.24],[s*.69,-.025,2.24,.30,.28],
      [s*.685,-.045,2.52,.34,.34],[s*.645,.025,2.72,.385,.34],
      [s*.57,.052,3.12,.385,.405],[s*.515,.04,3.57,.425,.43],
      [s*.52,.015,3.96,.39,.405]],"cloth_dark",{n:8,variation:.13});
    h.loft(`${label} tall faceted leather boot shaft`,[
      [s*.87,.02,.40,.24,.27],[s*.87,.015,.68,.255,.29],
      [s*.82,.055,.91,.255,.28],[s*.795,.065,1.14,.32,.345],
      [s*.75,.04,1.57,.365,.36],[s*.71,.02,2.04,.325,.31]],
      "leather",{n:8,variation:.13});
    h.loft(`${label} folded boot top`,[[(s*0.725),0.025,1.87,0.370,0.350],
      [(s*0.7),0.025,2.14,0.360,0.355]],"leather_dark",{n:8,caps:false});
    footprint = [[-0.285,-0.68],[0.285,-0.68],[0.315,-0.48],[0.265,0.15],[0.175,0.27],[-0.175,0.27],[-0.265,0.15],[-0.315,-0.48]];
    vertices = [];
    for ([z,k] of [[0.045,1.04],[0.15,1.045],[0.31,0.95]]) {
      vertices.push(...footprint.map(([dx,dy])=>[((s*0.87)+(dx*k)),dy,z]));
    }
    vertices.push(...[[((s*0.87)-0.2),-0.29,0.5],[((s*0.87)+0.2),-0.29,0.5],[((s*0.87)+0.225),0.15,0.51],[((s*0.87)-0.225),0.15,0.51]]);
    faces = [tuple(range(7,-1,-1))];
    for (row of range(2)) {
      for (j of range(8)) {
        a = ((row*8)+j);
        b = ((row*8)+((j+1)%8));
        c = (a+8);
        d = (b+8);
        faces.push(...[[a,b,c],[b,d,c]]);
      }
    }
    faces.push(...[[16,17,24],[17,25,24],[17,18,25],[18,19,26],[18,26,25],[19,20,26],[20,21,26],[21,27,26],[21,22,27],[22,23,24],[22,24,27],[23,16,24],[24,25,26],[24,26,27]]);
    h.mesh(`${label} faceted leather boot foot`,vertices,faces,"leather",{variation:0.085});
    sole_verts = footprint.map(([dx,dy])=>[((s*0.87)+(dx*1.055)),dy,0.045]);
    sole_verts.push(...footprint.map(([dx,dy])=>[((s*0.87)+(dx*1.055)),dy,0.135]));
    sole_faces = [tuple(range(7,-1,-1)),tuple(range(8,16))];
    sole_faces.push(...range(8).map((j)=>[j,((j+1)%8),(((j+1)%8)+8),(j+8)]));
    h.mesh(`${label} solid dark boot sole`,sole_verts,sole_faces,"leather_dark",{variation:0.02});
    _edge(h,`${label} toe cap leather seam`,[[((s*0.87)-0.29),-0.47,0.322],[((s*0.87)-0.17),-0.53,0.335],[((s*0.87)+0.17),-0.53,0.335],[((s*0.87)+0.29),-0.47,0.322]],"leather_dark",0.018);
    _triangulated_panel(h,`${label} shaped leather shin guard`,[[((s*0.72)-0.21),-0.254,1.98],[((s*0.72)+0.21),-0.254,1.98],[((s*0.85)+0.16),-0.224,0.64],[(s*0.85),-0.304,0.53],[((s*0.85)-0.16),-0.224,0.64]],"leather_dark",[(s*0.79),-0.39,1.3],0.037);
    _edge(h,`${label} shin leather central seam`,[[(s*0.72),-0.321,1.91],[(s*0.78),-0.403,1.38],[(s*0.85),-0.309,0.65]],"leather_light",0.014);
    for ([z,x,r] of [[0.63,0.853,0.30]]) {
      h.loft(`${label} boot wrap at ${z}`,[[(s*x),0.018,(z-0.065),r,0.33],
        [(s*x),0.018,(z+0.065),r,0.33]],"leather_dark",{n:8,caps:false});
    }
    _bootStraps(h,s,label);
    knee = [[((s*0.677)-0.3),-0.221,2.54],[((s*0.677)+0.22),-0.225,2.48],[((s*0.695)+0.36),-0.252,2.17],[((s*0.7)+0.22),-0.284,1.93],[(s*0.7),-0.405,1.84],[((s*0.7)-0.29),-0.29,2.02],[((s*0.677)-0.37),-0.222,2.33]];
    _triangulated_panel(h,`${label} knee shield dark backing`,knee,"steel_dark",[(s*0.697),-0.495,2.2],0.075);
    center = [(s*0.697),-0.502,2.2];
    inner = knee.map(([x,y,z])=>[(center[0]+((x-center[0])*0.87)),(y-0.024),(center[2]+((z-center[2])*0.87))]);
    _triangulated_panel(h,`${label} angular steel knee shield`,inner,"steel",center,0.024);
    _edge(h,`${label} knee steel edge`,knee,"steel_edge",0.026,true);
    _edge(h,`${label} knee central ridge`,[[(s*0.677),-0.28,2.49],[(s*0.697),-0.526,2.2],[(s*0.7),-0.43,1.9]],"steel_dark",0.012);
    ankle = [[((s*0.85)-0.272),-0.181,0.76],[(s*0.85),-0.322,0.64],[((s*0.85)+0.272),-0.181,0.76],[((s*0.85)+0.264),-0.209,0.58],[(s*0.85),-0.36,0.46],[((s*0.85)-0.264),-0.209,0.58]];
    _triangulated_panel(h,`${label} steel ankle chevron`,ankle,"steel",[(s*0.85),-0.368,0.615],0.04);
    _edge(h,`${label} ankle upper edge`,ankle.slice(undefined,3),"steel_edge",0.018);
  }
}

function _forearm(h,s,label) {
  let inner,outline,rx,ry,x,y,z;
  h.loft(`${label} fitted leather vambrace`,[[(s*1.6),-0.204,4.02,0.195,0.207],[(s*1.565),-0.157,4.24,0.213,0.237],[(s*1.51),-0.085,4.59,0.268,0.278],[(s*1.445),-0.05,4.91,0.273,0.268]],"leather",{n:8,variation:0.055});
  outline = [[(s*(1.425-0.23)),-0.267,4.98],[(s*(1.425+0.22)),-0.259,4.97],[(s*(1.56+0.19)),-0.343,4.17],[(s*1.61),-0.454,4.04],[(s*(1.56-0.19)),-0.343,4.17]];
  _triangulated_panel(h,`${label} forearm steel side plate`,outline,"steel_dark",[(s*1.515),-0.397,4.54],0.052);
  inner = [[(s*(1.44-0.145)),-0.306,4.88],[(s*(1.44+0.145)),-0.304,4.88],[(s*(1.568+0.125)),-0.387,4.23],[(s*1.605),-0.461,4.14],[(s*(1.568-0.125)),-0.387,4.23]];
  _triangulated_panel(h,`${label} vambrace inset leather panel`,inner,"leather",[(s*1.518),-0.423,4.56],0.026);
  _edge(h,`${label} forearm outer steel rail`,[outline[1],outline[2],outline[3]],"steel_edge",0.035);
  for ([z,x,y,rx,ry] of [[4.91,1.45,-0.053,0.288,0.294],[4.2,1.572,-0.169,0.228,0.255]]) {
    h.loft(`${label} steel vambrace binding ${z}`,[[(s*x),y,(z-0.06),rx,ry],[(s*x),y,(z+0.06),rx,ry]],"steel",{n:8,caps:false});
  }
  h.loft(`${label} armored glove cuff`,[[(s*1.63),-0.227,3.83,0.226,0.16],[(s*1.6),-0.208,4.06,0.2,0.213]],"leather_dark",{n:8,caps:false});
  _triangulated_panel(h,`${label} glove knuckle guard`,[[(s*(1.615-0.19)),-0.356,4.025],[(s*(1.615+0.19)),-0.356,4.025],[(s*(1.64+0.205)),-0.36,3.81],[(s*1.65),-0.423,3.77],[(s*(1.64-0.205)),-0.36,3.81]],"steel_dark",[(s*1.63),-0.431,3.92],0.037);
}

function _sword(h) {
  let axis,end,i,j,start,t,top,transverse;
  // Closed tapered scabbard, rim, chape, crossguard, wrapped grip, and pommel.
  top = [1.01,0.145,4.16];
  axis = [0.313,0,-0.95];
  transverse = [0.95,0,0.313];
  function pt(t,u=0,v=0) {
    return [((top[0]+(axis[0]*t))+(transverse[0]*u)),(top[1]+v),((top[2]+(axis[2]*t))+(transverse[2]*u))];
  }

  function section(name,rings,material) {
    let a,b,d,faces,j,row,shape,t,vertices,w;
    rings = [...rings].sort((a,b)=>a[0]-b[0]);
    vertices = [];
    shape = [[-1,-0.58],[-0.7,-1],[0.7,-1],[1,-0.58],[1,0.58],[0.7,1],[-0.7,1],[-1,0.58]];
    for ([t,w,d] of rings) {
      vertices.push(...shape.map(([u,v])=>pt(t,(u*w),(v*d))));
    }
    faces = [tuple(range(7,-1,-1))];
    for (row of range((len(rings)-1))) {
      for (j of range(8)) {
        a = ((row*8)+j);
        b = ((row*8)+((j+1)%8));
        faces.push(...[[a,b,(a+8)],[b,(b+8),(a+8)]]);
      }
    }
    faces.push(tuple(range(((len(rings)-1)*8),(len(rings)*8))));
    return h.mesh(name,vertices,faces.map((f)=>tuple(reversed(f))),material,{variation:0.055});
  }

  section("Warrior long leather sword scabbard",[[0,0.143,0.088],[0.26,0.145,0.088],[2.6,0.11,0.071],[2.88,0.026,0.05]],"leather_dark");
  section("Warrior brass scabbard mouth",[[-0.025,0.16,0.105],[0.1,0.157,0.1]],"gold");
  section("Warrior angular brass scabbard chape",[[2.57,0.122,0.081],[2.84,0.096,0.071],[2.95,0.012,0.037]],"gold");
  _edge(h,"Warrior scabbard raised stitched seam",[pt(0.13,-0.118,-0.096),pt(1.3,-0.113,-0.085),pt(2.63,-0.085,-0.078)],"leather_light",0.014);
  h.tube("Warrior gold sword crossguard",[pt(-0.08,-0.38,0),pt(-0.12,-0.3,0),pt(-0.155,0,0),pt(-0.12,0.3,0),pt(-0.08,0.38,0)],[[0.064,0.067],[0.078,0.08],[0.075,0.078],[0.078,0.08],[0.064,0.067]],"gold",{sides:6,variation:0.045});
  section("Warrior sword grip leather core",[[-0.23,0.078,0.072],[-0.61,0.066,0.065]],"leather");
  for (j of range(6)) {
    t = (-0.25-(j*0.055));
    section(`Warrior sword grip wrap ${(j+1)}`,[[t,(0.081-(j*0.0018)),(0.076-(j*0.001))],[(t-0.022),(0.081-(j*0.0018)),(0.076-(j*0.001))]],"leather_light");
  }
  section("Warrior sword brass grip collar",[[-0.205,0.096,0.088],[-0.27,0.094,0.085]],"gold");
  h.ico("Warrior faceted gold sword pommel",pt(-0.68),[0.118,0.111,0.126],"gold",{sub:1});
  for ([i,[start,t]] of enumerate([[[0.69,-0.12,4.54],0.11],[[0.74,0.29,4.43],0.47]])) {
    end = pt(t,-0.1,0);
    h.ribbon(`Warrior sword belt hanger ${(i+1)}`,[start,[((start[0]+end[0])*0.5),(start[1]-0.055),((start[2]+end[2])*0.5)],end],0.105,"leather");
    h.ico(`Warrior sword hanger brass stud ${(i+1)}`,[end[0],(end[1]-0.105),end[2]],[0.032,0.022,0.032],"gold",{sub:1});
  }
}

function _closedHelmet(h) {
  const oldPart=h.part,first=h.root.children.length;
  h.part='head';
  h.loft('Knight closed angular helmet shell',[
    [0,.035,6.99,.245,.255],[0,.025,7.18,.39,.32],
    [0,.03,7.52,.49,.40],[0,.045,7.93,.47,.405],
    [0,.045,8.17,.33,.325],[0,.065,8.31,.125,.17],
  ],'steel_dark',{n:12});
  _triangulated_panel(h,'Knight sloped forehead armor',[
    [-.28,-.292,8.20],[0,-.255,8.30],[.28,-.292,8.20],
    [.32,-.425,8.00],[0,-.54,7.97],[-.32,-.425,8.00]],
    'steel',[0,-.415,8.125],.043);
  const brow=[[-.445,-.37,7.86],[-.27,-.487,7.91],[0,-.53,7.97],
    [.27,-.487,7.91],[.445,-.37,7.86],[.39,-.475,7.70],
    [0,-.622,7.67],[-.39,-.475,7.70]];
  _triangulated_panel(h,'Knight angular brow armor',brow,'steel',
    [0,-.595,7.83],.050);
  _edge(h,'Knight ivory brow ridge',[
    [-.43,-.405,7.80],[-.30,-.50,7.78],[0,-.636,7.74],
    [.30,-.50,7.78],[.43,-.405,7.80]],'steel_edge',.031);
  _triangulated_panel(h,'Knight dark recessed visor cavity',[
    [-.38,-.475,7.71],[0,-.63,7.68],[.38,-.475,7.71],
    [.34,-.49,7.52],[0,-.625,7.50],[-.34,-.49,7.52],
  ],'leather_dark',[0,-.632,7.605],.035);
  for(const [s,label]of[[-1,'Left'],[1,'Right']]) {
    const slit=[[s*.338,-.510,7.653],[s*.064,-.645,7.612],
      [s*.058,-.648,7.573],[s*.302,-.529,7.602]];
    _triangulated_panel(h,`${label} warm amber visor slit`,slit,'visor',
      [s*.195,-.586,7.611],.008);
    const cheek=[[s*.405,-.405,7.55],[s*.385,-.425,7.26],
      [s*.25,-.405,7.08],[0,-.538,7.005],[0,-.637,7.535],
      [s*.325,-.503,7.535]];
    _triangulated_panel(h,`${label} helmet angled cheek guard`,cheek,
      'steel',[s*.23,-.574,7.285],.047);
    _edge(h,`${label} ivory jaw reinforcement`,[
      [s*.38,-.45,7.29],[s*.25,-.438,7.10],[0,-.566,7.025]],
      'steel_edge',.025);
    h.tube(`${label} helmet temple rail`,[
      [s*.36,-.29,8.08],[s*.48,-.12,7.78],[s*.45,.16,7.38]],
      [.035,.037,.027],'steel_edge',{sides:4});
    h.ico(`${label} helmet gold hinge`,[s*.455,-.135,7.49],
      [.050,.044,.050],'gold',{sub:1});
    for(let i=0;i<3;i++) {
      const z=7.30-i*.062;
      h.ribbon(`${label} cheek ventilation slit ${i+1}`,
        [[s*.13,-.584,z+.022],[s*.28,-.533,z]],.016,'leather_dark');
    }
  }
  _triangulated_panel(h,'Knight central nose bridge',[
    [-.044,-.645,7.72],[.044,-.645,7.72],[.055,-.663,7.43],
    [0,-.68,7.34],[-.055,-.663,7.43],
  ],'steel_dark',[0,-.692,7.52],.04);
  _triangulated_panel(h,'Knight forehead gold crest',[
    [0,-.399,8.15],[.075,-.49,8.015],[0,-.559,7.945],[-.075,-.49,8.015],
  ],'gold',[0,-.528,8.035],.019);
  // A solid dorsal fin emphasizes the helmet silhouette without a plume.
  const profile=[[-.24,8.20],[-.105,8.40],[.19,8.38],[.405,8.12],[.39,7.94],[.22,8.10]];
  const verts=profile.map(([y,z])=>[-.055,y,z]).concat(profile.map(([y,z])=>[.055,y,z]));
  const n=profile.length,faces=[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>n+i)];
  for(let i=0;i<n;i++)faces.push([i,(i+1)%n,(i+1)%n+n,i+n]);
  h.mesh('Knight crimson dorsal helmet crest',verts,faces,'red_dark');
  _edge(h,'Knight helmet crest silver edge',[[0,-.105,8.40],[0,.19,8.38],[0,.405,8.12]],'steel_edge',.025);
  for(let i=0;i<3;i++) {
    const z=7.12+i*.15, width=.32+i*.042;
    _triangulated_panel(h,`Knight rear helmet overlapping plate ${i+1}`,[
      [-width,.355,z+.17],[width,.355,z+.17],[width*.9,.408,z],
      [0,.462,z-.045],[-width*.9,.408,z]],'steel',
      [0,.475,z+.07],-.035);
  }
  for(const mesh of h.root.children.slice(first)) {
    mesh.userData.slot='headwear';
    // Seat the jaw inside the gorget instead of exposing a long neck column.
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)-.11);
    p.needsUpdate=true;
    mesh.geometry.computeVertexNormals();
  }
  h.part=oldPart;
}

function _heroArmor(h) {
  // The gorget fills the neck-to-helmet transition with a substantial collar.
  h.loft('Knight armored gorget',[
    [0,.02,6.40,.72,.50],[0,.015,6.60,.63,.48],
    [0,.02,6.83,.48,.40],[0,.025,7.07,.39,.33],
  ],'steel',{n:12});
  h.loft('Knight gorget silver lip',[
    [0,.025,7.01,.404,.343],[0,.025,7.075,.395,.338]],'steel_edge',{n:12,caps:false});
  _triangulated_panel(h,'Knight flared front bevor',[
    [-.58,-.49,6.55],[-.35,-.445,6.97],[0,-.43,7.065],
    [.35,-.445,6.97],[.58,-.49,6.55],[0,-.595,6.43]],
    'steel',[0,-.585,6.77],.055);
  _edge(h,'Knight bevor upper rim',[[-.35,-.468,6.97],[0,-.456,7.065],[.35,-.468,6.97]],
    'steel_edge',.025);
  // Three overlapping, ridged lower cuirass plates sit above the leather belt.
  for(let i=0;i<3;i++) {
    const z=5.17+i*.18,w=.48+i*.075;
    _triangulated_panel(h,`Knight cuirass abdominal lame ${i+1}`,[
      [-w,-.512,z+.19],[0,-.714,z+.22],[w,-.512,z+.19],
      [w*.90,-.536,z+.025],[0,-.697,z-.045],[-w*.90,-.536,z+.025],
    ],'steel',[0,-.73,z+.09],.048);
    _edge(h,`Knight cuirass lame ivory edge ${i+1}`,[
      [-w*.90,-.557,z+.025],[0,-.719,z-.045],[w*.90,-.557,z+.025]],
      'steel_edge',.016);
  }
  _edge(h,'Knight chest ceremonial silver chevron',[
    [-.66,-.565,6.38],[-.38,-.712,6.23],[0,-.786,6.13],
    [.38,-.712,6.23],[.66,-.565,6.38]],'steel_edge',.037);
  _triangulated_panel(h,'Knight small gold chest seal',[
    [0,-.795,6.245],[.083,-.786,6.14],[0,-.805,6.015],[-.083,-.786,6.14]],
    'gold',[0,-.823,6.135],.023);
  for(const [s,label]of[[-1,'Left'],[1,'Right']]) {
    const shoulder=new THREE.Vector3(s*1.03,0,6.13),elbow=new THREE.Vector3(s*1.45,-.015,5.05),wrist=new THREE.Vector3(s*1.61,-.22,4.03);
    const armPoints=[shoulder.clone().add(new THREE.Vector3(-s*.33,0,.09)),shoulder,
      shoulder.clone().lerp(elbow,.28),shoulder.clone().lerp(elbow,.59),
      shoulder.clone().lerp(elbow,.82),elbow,elbow.clone().lerp(wrist,.25),
      elbow.clone().lerp(wrist,.55),elbow.clone().lerp(wrist,.8),wrist];
    const armRadii=[[.23,.24],[.37,.36],[.34,.34],[.29,.32],[.25,.27],
      [.215,.225],[.27,.25],[.245,.22],[.175,.17],[.14,.13]].map(r=>r.map(v=>v*1.10));
    h.tube(`${label} continuous padded arming sleeve`,armPoints.map(v=>v.toArray()),
      armRadii,'cloth_dark',{sides:10});
    h.loft(`${label} pauldron fitted underpad`,[
      [s*.99,.025,6.25,.34,.385],[s*.99,.025,6.56,.355,.355],
      [s*.96,.025,6.82,.25,.275]],'cloth_dark',{n:10});
    h.tube(`${label} padded inner shoulder bridge`,[
      [s*.40,.02,6.64],[s*.68,.02,6.63],[s*.99,.015,6.55]],
      [.18,.23,.28],'cloth_dark',{sides:8});
    _triangulated_panel(h,`${label} knight articulated elbow shield`,[
      [s*(1.45-.205),-.205,5.24],[s*(1.45+.23),-.205,5.20],
      [s*(1.49+.29),-.225,4.99],[s*1.48,-.375,4.87],
      [s*(1.45-.23),-.255,4.98]],'steel_dark',[s*1.46,-.387,5.07],.05);
    const x=s*1.61,y=-.22,z=4.03;
    h.loft(`${label} knight complete glove palm`,[
      [x+s*.02,y-.02,z-.37,.19,.125],
      [x+s*.03,y-.015,z-.14,.22,.15],
      [x,y,z+.045,.17,.133]],'leather_dark',{n:10});
    // Long reinforced greaves connect the knee plates to the ankle cuffs.
    const legX=s*.87;
    const shin=[[legX-s*.235,-.247,1.95],[legX+s*.235,-.247,1.95],
      [s*1.0+s*.195,-.248,.85],[s*1.0,-.385,.68],
      [s*1.0-s*.195,-.248,.85]];
    _triangulated_panel(h,`${label} knight raised steel greave`,shin,'steel',
      [s*.94,-.432,1.32],.07);
    _edge(h,`${label} greave ivory outer edge`,[shin[1],shin[2],shin[3]],'steel_edge',.026);
    _edge(h,`${label} greave angular center rib`,[
      [legX,-.30,1.91],[s*.94,-.456,1.32],[s*1.0,-.412,.73]],'steel_dark',.022);
    h.ico(`${label} greave gold fastening`,[s*.98,-.381,1.78],
      [.055,.035,.055],'gold',{sub:1});
    _sabatons(h,s,label);
  }
}

function _sabatons(h,s,label) {
  const angle=s*.18,center=s*.99;
  const point=(x,y,z)=>[center+x*cos(angle)-y*sin(angle),x*sin(angle)+y*cos(angle),z];
  const rows=[[-.735,.34,.34,.405],[-.47,.35,.40,.55],[-.18,.28,.49,.65],[.14,.235,.50,.67]];
  const verts=[];
  for(const[y,w,edge,crest]of rows)verts.push(point(-w,y,edge),point(0,y,crest),point(w,y,edge));
  const outer=verts.length;
  verts.push(...verts.map(([x,y,z])=>[x,y,z-.06]));
  const faces=[];
  for(let j=0;j<rows.length-1;j++)for(let k=0;k<2;k++) {
    const a=j*3+k,b=a+1,c=a+3,d=c+1;
    faces.push([a,b,d],[a,d,c],[a+outer,d+outer,b+outer],[a+outer,c+outer,d+outer]);
  }
  const edge=[0,1,2,5,8,11,10,9,6,3];
  for(let i=0;i<edge.length;i++) {
    const a=edge[i],b=edge[(i+1)%edge.length];faces.push([b,a,a+outer,b+outer]);
  }
  h.mesh(`${label} sculpted steel boot sabaton`,verts,faces,'steel');
  for(const index of [1,2]) {
    const[y,w,edge,crest]=rows[index];
    _edge(h,`${label} sabaton articulated seam ${index}`,
      [point(-w,y,edge+.012),point(0,y,crest+.012),point(w,y,edge+.012)],
      'steel_dark',.023);
  }
  _edge(h,`${label} sabaton ivory toe lip`,
    [point(-.34,-.75,.34),point(0,-.75,.405),point(.34,-.75,.34)],
    'steel_edge',.022);
}

export function buildWarrior(base) {
  const h=_knightGeometry(base);
  let label,s;
  const firstMesh=h.root.children.length;
  for(const mesh of h.root.children) {
    if(mesh.userData.part==='skin'&&/^(Arm|Hand palm|Finger|Thumb|Neck)/.test(mesh.name)) {
      mesh.visible=false;
      mesh.userData.underArmor=true;
    }
  }
  // Build the complete warrior outfit into the driver's active collection.
  _torso(h);
  for ([s,label] of [[-1,"Left"],[1,"Right"]]) {
    _shoulder(h,s,label);
    _forearm(h,s,label);
  }
  _belt_and_tabard(h);
  _legs_and_boots(h);
  _sword(h);
  const objects=h.root.children.slice(firstMesh);
  _applyHeroProportions(objects);
  for (const object of objects) {
    object.userData.slot=/sword|scabbard/i.test(object.name)?"weapon":"outfit";
    if(object.userData.slot==="weapon")object.userData.equipment="sheathedSword";
  }
  _heroArmor(h);
  _closedHelmet(h);
  const gearMaterials=new Map();
  for(const object of h.root.children.slice(firstMesh)) {
    const name=object.name.toLowerCase(),surface=object.material.name.toLowerCase();
    object.userData.slot=object.userData.part==='head'?'headwear':
      /sword|scabbard/.test(name)?'weapon':
      /boot|greave|ankle|knee|shin|calf|sabaton/.test(name)?'boots':
      /glove|gauntlet|vambrace|forearm/.test(name)?'gloves':
      /belt|waist|buckle/.test(name)?'belt':'armor';
    object.userData.tintRole=/visor/.test(surface)?'emissive':
      /ivory/.test(surface)?'trim':/gold/.test(surface)?'accent':
      /cloth|weave/.test(surface)?'cloth':/leather/.test(surface)?'leather':'metal';
    // A helmet recolor must not mutate the material used by boots or armor.
    const materialKey=object.userData.slot+':'+object.material.uuid;
    if(!gearMaterials.has(materialKey))gearMaterials.set(materialKey,object.material.clone());
    object.material=gearMaterials.get(materialKey);
    object.userData.baseColor=object.material.color.getHex();
  }
  return h.root;
}

function _applyHeroProportions(objects) {
  // A broad protective silhouette with a compact waist and outward boot stance.
  const clamp=value=>Math.min(1,Math.max(0,value));
  for(const object of objects) {
    const name=object.name.toLowerCase(), positions=object.geometry.attributes.position;
    const pauldron=name.includes("pauldron");
    const shoulder=name.includes("left")&&pauldron;
    const chest=name.includes("breastplate");
    const upperTorso=/breastplate|back armor|arming vest|under-tunic|suspension strap|suspension brass rivet/.test(name);
    const sleeve=name.includes("red upper sleeve");
    const backArmor=name.includes("shaped back armor");
    const backStrap=name.includes("chest shoulder suspension strap");
    const belt=/waist|buckle|belt/.test(name)&&!name.includes("sword");
    const skirt=/tabard|hip skirt|hip strap/.test(name);
    const leg=/trouser leg|boot|knee|ankle|shin|calf/.test(name);
    const foot=/boot foot|boot sole|toe cap/.test(name);
    const sheath=/scabbard/.test(name);
    const hanger=name.includes("sword belt hanger");
    if(!pauldron&&!upperTorso&&!sleeve&&!belt&&!skirt&&!leg&&!sheath&&!hanger)continue;
    for(let i=0;i<positions.count;i++) {
      let x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      if(shoulder) {
        const reach=Math.max(0,Math.abs(x)-.76);
        x=-.76-reach*.80;
        z-=.04*clamp(reach/.90);
      }
      if(chest)z+=.34-.21*clamp((z-5.15)/1.16);
      if(pauldron)z+=name.includes("lower articulated")?.23:.32;
      if(upperTorso)z+=.18*clamp((z-5.05)/1.40);
      if(backArmor)y+=.11;
      if(backStrap)y+=.11*clamp((y-.12)/.25);
      if(sleeve)z+=.16*clamp((z-5.48)/.65);
      if(belt)z+=.34;
      if(skirt)z+=.24+.10*clamp((z-2.90)/1.35);
      if(foot) {
        const side=Math.sign(x), angle=side*.18, center=side*.87, dx=x-center;
        const nextX=center+dx*cos(angle)-y*sin(angle);
        y=dx*sin(angle)+y*cos(angle);
        x=nextX;
      }
      if(leg)x+=Math.sign(x)*.12*(1-clamp((z-.60)/2.80));
      if(sheath) {
        x=1.01+(x-1.01)*.92;
        z=4.16+(z-4.16)*.92;
      }
      if(hanger)z+=.34*clamp((z-4.04)/.50);
      positions.setXYZ(i,x,y,z);
    }
    positions.needsUpdate=true;
    object.geometry.computeVertexNormals();
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  }
}
