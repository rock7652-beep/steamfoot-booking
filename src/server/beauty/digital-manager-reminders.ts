import 'server-only';
import {prisma} from '@/lib/db';
import {beautyTransaction} from './access';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {addTaiwanDuration,dayRange,parseTaipeiDateTime,toLocalDateStr} from '@/lib/date-utils';
import {recordDigitalManagerNotice} from '@/server/services/digital-manager-notices';

/** Separate from LINE workers: no LINE settings, tokens, or delivery are touched. */
export async function runBeautyDigitalManagerReminders(now=new Date()) {
 const result={recorded:0,failed:0};
 if(process.env.BEAUTY_MODULE_ENABLED!=='1')return result;
 const stores=await prisma.store.findMany({where:{industryModule:'BEAUTY',operatingStatus:'ACTIVE',isDemo:false},select:{id:true}});
 for(const store of stores)try{
  if(!await hasStoreFeature(store.id,FEATURES.BASIC_BOOKING))continue;
  const count=await beautyTransaction({storeId:store.id,userId:null},async tx=>{
   await tx.$executeRaw`INSERT INTO public."DigitalManagerActivation" ("storeId","activatedAt") VALUES (${store.id},${now}) ON CONFLICT ("storeId") DO NOTHING`;
   const activation=await tx.$queryRaw<Array<{activatedAt:Date}>>`SELECT "activatedAt" FROM public."DigitalManagerActivation" WHERE "storeId"=${store.id}`;
   if(!activation[0])throw new Error('門市通知啟用時間未設定');
   const activeAt=activation[0].activatedAt,today=toLocalDateStr(now),yesterday=dayRange(addTaiwanDuration(today,-1,'DAY'));
   const earliest=new Date(Math.max(yesterday.start.getTime(),activeAt.getTime()-60*60_000)),due=new Date(now.getTime()-60*60_000);
   const candidates=await tx.beautyAppointment.findMany({where:{storeId:store.id,status:'RESERVED',endsAt:{gte:earliest,lte:due}},orderBy:{endsAt:'asc'},take:100});
   let written=0;
   for(const b of candidates){
    // Store lock serializes with Beauty booking changes and settings updates.
    const changed=await recordDigitalManagerNotice(tx,{storeId:store.id,eventKey:`beauty-incomplete:${b.id}:${b.endsAt.toISOString()}`,eventType:'INCOMPLETE_SERVICE_REMINDER',targetId:b.id});
    written+=Number(changed);
   }
   const nine=parseTaipeiDateTime(today,'09:00')!;
   if(now>=nine&&now.getTime()-nine.getTime()<15*60_000&&nine>=activeAt){
    const [pending,incomplete]=await Promise.all([tx.beautyPurchase.count({where:{storeId:store.id,status:'PENDING'}}),tx.beautyAppointment.count({where:{storeId:store.id,status:'RESERVED',endsAt:{gte:yesterday.start,lte:yesterday.end}}})]);
    if(pending+incomplete>0)written+=Number(await recordDigitalManagerNotice(tx,{storeId:store.id,eventKey:`beauty-digest:${store.id}:${today}`,eventType:'DAILY_ACTION_DIGEST',targetId:store.id}));
   }
   return written;
  });
  result.recorded+=count;
 }catch(error){result.failed++;console.error('[Beauty digital manager] reminder failed',{storeId:store.id,error:error instanceof Error?error.message:'unknown'});}
 return result;
}
