import {afterEach,describe,expect,it,vi} from 'vitest';
import {compressImageUpload,imageUploadFilename} from '@/lib/image-upload';
afterEach(()=>vi.unstubAllGlobals());
function setup({transparent=false,encode}:{transparent?:boolean;encode:(width:number,type:string,quality?:number)=>Blob|null}){
 const make=(width:number,height:number)=>({
  width,height,
  toBlob(this:{width:number},callback:(blob:Blob|null)=>void,type:string,quality?:number){callback(encode(this.width,type,quality));},
  getContext:()=>({drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([100,100,100,transparent?0:255])})}),
 }) as unknown as HTMLCanvasElement;
 vi.stubGlobal('document',{createElement:()=>make(0,0)});return make(1600,1600);
}
const blob=(size:number,type:string)=>new Blob([new Uint8Array(size)],{type});
describe('automatic image upload compression',()=>{
 it('keeps a supported WebP when it already meets the limit',async()=>{
  const encode=vi.fn(()=>blob(100,'image/webp'));const result=await compressImageUpload(setup({encode}),1024);expect(result.type).toBe('image/webp');expect(encode).toHaveBeenCalledTimes(1);
 });
 it('detects silent PNG fallback and uses JPEG for opaque photos',async()=>{
  const result=await compressImageUpload(setup({encode:(_w,type)=>blob(type==='image/webp'?2000:300,type==='image/webp'?'image/png':type)}),1024);
  expect(result.type).toBe('image/jpeg');expect(imageUploadFilename(result)).toBe('service.jpg');
 });
 it('reduces quality before resizing an oversized WebP',async()=>{
  const calls:number[]=[];const result=await compressImageUpload(setup({encode:(w,type,q)=>{calls.push(w);return blob(q===.72?500:2000,type);}}),1024);
  expect(result.size).toBe(500);expect(calls).toEqual([1600,1600]);
 });
 it('shrinks dimensions when lowering quality still exceeds the limit',async()=>{
  const widths:number[]=[];const result=await compressImageUpload(setup({encode:(w,type)=>{widths.push(w);return blob(w<=1024?500:2000,type);}}),1024);
  expect(result.size).toBe(500);expect(widths).toContain(1280);expect(widths.at(-1)).toBe(1024);
 });
 it('preserves transparency with PNG when WebP is unavailable',async()=>{
  const types:string[]=[];const result=await compressImageUpload(setup({transparent:true,encode:(w,type)=>{types.push(type);return blob(w<=1024?500:2000,'image/png');}}),1024);
  expect(result.type).toBe('image/png');expect(types).not.toContain('image/jpeg');expect(imageUploadFilename(result)).toBe('service.png');
 });
 it('rejects a failed encoder instead of uploading an empty file',async()=>{
  await expect(compressImageUpload(setup({encode:()=>null}))).rejects.toThrow('圖片自動壓縮未完成');
 });
});
