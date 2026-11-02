import {it,expect} from 'vitest';
import sharp from 'sharp';
import {normalizeBeautyServiceImage} from '@/server/services/beauty-service-image';
it('生成獨立完整圖與方形縮圖，不放大原圖',async()=>{
 const source=await sharp({create:{width:800,height:1200,channels:3,background:'#ff6600'}}).jpeg().toBuffer();
 const result=await normalizeBeautyServiceImage(source,0,1);
 const full=await sharp(result.content).metadata(),thumb=await sharp(result.thumbnail).metadata();
 expect([full.width,full.height]).toEqual([800,1200]);expect([thumb.width,thumb.height]).toEqual([400,400]);expect(full.format).toBe('webp');expect(full.exif).toBeUndefined();
});
it('拒絕 SVG 與損壞圖片',async()=>{
 await expect(normalizeBeautyServiceImage(Buffer.from('<svg/>'))).rejects.toThrow();
 await expect(normalizeBeautyServiceImage(new Uint8Array([1,2,3]))).rejects.toThrow();
});
