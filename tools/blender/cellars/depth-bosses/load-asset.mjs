/** Node image adapter with actual PNG inflation and scanline decoding for GLB tests. */
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export const decodedImages=[];
export function decodePng(bytes){
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let offset=8,width=0,height=0,channels=0;const chunks=[];
  while(offset<bytes.length){
    const n=bytes.readUInt32BE(offset),name=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+n);
    if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);channels=data[9]===6?4:data[9]===2?3:0;assert(channels);assert.equal(data[12],0);}
    if(name==='IDAT')chunks.push(data);offset+=n+12;
  }
  assert(width>0&&height>0&&width<=2048&&height<=2048);
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,out=new Uint8Array(stride*height);
  assert.equal(raw.length,(stride+1)*height);
  function paeth(a,b,c){const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;}
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];assert(filter<=4);
    for(let x=0;x<stride;x++){
      const a=x>=channels?out[y*stride+x-channels]:0,b=y?out[(y-1)*stride+x]:0,c=y&&x>=channels?out[(y-1)*stride+x-channels]:0;
      out[y*stride+x]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  let min=255,max=0;for(let i=0;i<out.length;i+=channels){min=Math.min(min,out[i]);max=Math.max(max,out[i]);}
  assert(max-min>=4,'Packed albedo contains visible surface variation');
  return {width,height,data:out,min,max,close(){}};
}
export function installNodeImages(){
  globalThis.self ||= globalThis;
  globalThis.ProgressEvent ||= class {constructor(type,props){this.type=type;Object.assign(this,props);}};
  globalThis.createImageBitmap ||= async blob=>{const image=decodePng(Buffer.from(await blob.arrayBuffer()));decodedImages.push({width:image.width,height:image.height,min:image.min,max:image.max});return image;};
}
export async function parseAsset(bytes){installNodeImages();return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
