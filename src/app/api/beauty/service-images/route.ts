import {NextResponse} from 'next/server';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {randomUUID} from 'node:crypto';
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {normalizeBeautyServiceImage} from '@/server/services/beauty-service-image';
import {handleActionError} from '@/lib/errors';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'請從後台操作'},{status:403});
  const actor=await beautyManager('plans.edit',true);
  await requireStoreFeature(actor.storeId,FEATURES.PLAN_MANAGEMENT);
  const max=11*1024*1024,reader=request.body?.getReader();if(!reader)throw new Error('缺少圖片');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();return NextResponse.json({error:'圖片請小於 10 MB'},{status:413});}chunks.push(value);}
  const form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:Buffer.concat(chunks)}).formData();
  if(form.get('storeId')!==actor.storeId)return NextResponse.json({error:'門市已切換，請重新開啟'},{status:409});
  const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>10*1024*1024)return NextResponse.json({error:'請選擇 10 MB 以內圖片'},{status:400});
  const x=Number(form.get('x')??0.5),y=Number(form.get('y')??0.5);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('裁切位置有誤');
  const data=await normalizeBeautyServiceImage(new Uint8Array(await file.arrayBuffer()),x,y),id=randomUUID();
  await beautyTransaction(actor,tx=>tx.beautyServiceImage.create({data:{id,storeId:actor.storeId,...data}}));
  return NextResponse.json({id},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const result=handleActionError(error);return NextResponse.json({error:result.success?'圖片上傳失敗':result.error},{status:400});}
}
