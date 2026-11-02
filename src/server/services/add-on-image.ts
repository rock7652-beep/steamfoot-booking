import sharp from 'sharp';
export async function normalizeAddOnImage(input:Uint8Array,x=0.5,y=0.5){
 const decoder=sharp(input,{limitInputPixels:40_000_000,failOn:'warning'});
 const meta=await decoder.metadata();
 if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)!==1)throw new Error('請上傳 JPG、PNG 或 WebP 靜態圖片');
 const normalized=await decoder.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
 const {width=1,height=1}=await sharp(normalized).metadata(),side=Math.min(width,height);
 const left=Math.round((width-side)*Math.max(0,Math.min(1,x))),top=Math.round((height-side)*Math.max(0,Math.min(1,y)));
 const thumbnail=await sharp(normalized).extract({left,top,width:side,height:side}).resize(400,400).webp({quality:78}).toBuffer();
 return {content:new Uint8Array(normalized),thumbnail:new Uint8Array(thumbnail)};
}
