const MAX_UPLOAD_BYTES=3*1024*1024;
const acceptedTypes=new Set(['image/webp','image/jpeg','image/png']);
function encode(canvas:HTMLCanvasElement,type:string,quality?:number):Promise<Blob|null>{
 return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
function hasTransparency(canvas:HTMLCanvasElement){
 const context=canvas.getContext('2d');if(!context)throw Error('此裝置暫時無法處理圖片');
 const {data}=context.getImageData(0,0,canvas.width,canvas.height);
 for(let i=3;i<data.length;i+=4)if(data[i]!==255)return true;
 return false;
}
/** Resize an already-cropped canvas; unsupported WebP encoders may silently return PNG. */
export async function compressImageUpload(source:HTMLCanvasElement,maxBytes=MAX_UPLOAD_BYTES):Promise<Blob>{
 const probe=await encode(source,'image/webp',.82);
 const type=probe?.type==='image/webp'?'image/webp':hasTransparency(source)?'image/png':'image/jpeg';
 if(probe?.type===type&&probe.size>0&&probe.size<=maxBytes)return probe;
 const resized=document.createElement('canvas');
 try{
  for(const scale of [1,.8,.64,.5,.4]){
   let canvas=source;
   if(scale!==1){
    resized.width=Math.max(1,Math.round(source.width*scale));resized.height=Math.max(1,Math.round(source.height*scale));
    const context=resized.getContext('2d');if(!context)throw Error('此裝置暫時無法處理圖片');
    context.drawImage(source,0,0,resized.width,resized.height);canvas=resized;
   }
   for(const quality of type==='image/png'?[undefined]:[.82,.72,.62]){
    const blob=scale===1&&(quality===.82||type==='image/png')&&probe?.type===type?probe:await encode(canvas,type,quality);
    if(blob&&blob.size>0&&blob.size<=maxBytes&&acceptedTypes.has(blob.type))return blob;
   }
  }
 }finally{resized.width=0;resized.height=0;}
 throw Error('圖片自動壓縮未完成，請重試或改用 JPG、PNG 圖片');
}
export function imageUploadFilename(blob:Blob){return blob.type==='image/jpeg'?'service.jpg':blob.type==='image/png'?'service.png':'service.webp';}
