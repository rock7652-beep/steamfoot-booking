import {beautyManager} from '@/server/beauty/access';
import {NextResponse} from 'next/server';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {randomUUID} from 'node:crypto';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {requireWritablePermission} from '@/lib/permissions';
import {resolveWriteStoreId} from '@/lib/store';
import {getStoreIndustryModule,requireSteamfootStore} from '@/lib/industry-module-server';
import {requireCourseAddOnModule,requireCourseAddOnMembership} from '@/server/services/course-add-ons';
import {requireMusicFinance} from '@/server/services/music-finance-access';
import {normalizeAddOnImage} from '@/server/services/add-on-image';
import {handleActionError} from '@/lib/errors';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'請從後台操作'},{status:403});

  const user=await requireWritablePermission('add_ons.manage');const storeId=await resolveWriteStoreId(user);const industry=await getStoreIndustryModule(storeId);
  let addOnModule:'STEAMFOOT'|'FITNESS'|'MUSIC'|'BEAUTY';
  if(industry==='course'){if(process.env.COURSE_ADD_ONS_ENABLED!=='1')return NextResponse.json({error:'附加項目尚未開放'},{status:403});addOnModule=await requireCourseAddOnModule(storeId);await requireCourseAddOnMembership(user,storeId);if(addOnModule==='MUSIC')await requireMusicFinance(user,storeId,'add_ons.manage');}
  else if(industry==='beauty'){const actor=await beautyManager('add_ons.manage',true);if(actor.storeId!==storeId)throw new Error('門市已切換');addOnModule='BEAUTY';}
  else{if(process.env.STEAMFOOT_ADD_ONS_ENABLED!=='1'||process.env.BOOKING_PARTICIPANTS_ENABLED!=='true')return NextResponse.json({error:'附加項目尚未開放'},{status:403});await requireSteamfootStore(storeId);addOnModule='STEAMFOOT';}const actor={storeId};
  await requireStoreFeature(actor.storeId,FEATURES.ADD_ONS);
  const max=11*1024*1024,reader=request.body?.getReader();if(!reader)throw new Error('缺少圖片');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();return NextResponse.json({error:'圖片請小於 10 MB'},{status:413});}chunks.push(value);}
  const form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:Buffer.concat(chunks)}).formData();
  if(form.get('storeId')!==actor.storeId)return NextResponse.json({error:'門市已切換，請重新開啟'},{status:409});
  const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>10*1024*1024)return NextResponse.json({error:'請選擇 10 MB 以內圖片'},{status:400});
  const x=Number(form.get('x')??0.5),y=Number(form.get('y')??0.5);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('裁切位置有誤');
  const data=await normalizeAddOnImage(new Uint8Array(await file.arrayBuffer()),x,y),id=randomUUID();
  await prisma.serviceAddOnImage.create({data:{id,storeId:actor.storeId,module:addOnModule,...data}});
  return NextResponse.json({id},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const result=handleActionError(error);return NextResponse.json({error:result.success?'圖片上傳失敗':result.error},{status:400});}
}
