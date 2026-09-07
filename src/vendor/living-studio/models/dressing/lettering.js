// Small original pixel letterforms for source-supplied prop inscriptions.
// Geometry keeps text available in native glTF without font downloads or canvas.
const glyphs={
 B:['11110','10001','10001','11110','10001','10001','11110'],
 A:['01110','10001','10001','11111','10001','10001','10001'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 a:['00000','00000','01110','00001','01111','10001','01111'],
 b:['10000','10000','10110','11001','10001','10001','11110'],
 c:['00000','00000','01110','10000','10000','10000','01110'],
 e:['00000','00000','01110','10001','11111','10000','01110'],
 g:['00000','01111','10001','10001','01111','00001','01110'],
 i:['00100','00000','01100','00100','00100','00100','01110'],
 k:['10000','10000','10010','10100','11000','10100','10010'],
 m:['00000','00000','11010','10101','10101','10101','10101'],
 n:['00000','00000','11110','10001','10001','10001','10001'],
 o:['00000','00000','01110','10001','10001','10001','01110'],
 r:['00000','00000','10110','11001','10000','10000','10000'],
 s:['00000','00000','01111','10000','01110','00001','11110'],
 ' ':['00000','00000','00000','00000','00000','00000','00000']
};

export function lettering(k,text,position,width,material='brass') {
 const pixel=width/(text.length*6-1),height=pixel*7;
 for(const [index,char] of [...text].entries()){
  const glyph=glyphs[char];if(!glyph)throw new Error(`No authored glyph for ${char}`);
  glyph.forEach((row,y)=>[...row].forEach((value,x)=>{
   if(value==='1')k.box(`${text} letter ${index} pixel ${x} ${y}`,[position[0]-width/2+(index*6+x+.5)*pixel,position[1]+height/2-(y+.5)*pixel,position[2]],[pixel*.9,pixel*.9,.0015],material,0);
  }));
 }
 return {width,height};
}
