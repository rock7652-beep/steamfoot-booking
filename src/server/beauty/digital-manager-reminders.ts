import 'server-only';
import {prisma} from '@/lib/db';
import {beautyTransaction} from './access';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {addTaiwanDuration,dayRange,parseTaipeiDateTime,toLocalDateStr} from '@/lib/date-utils';
import {recordDigitalManagerNotice} from '@/server/services/digital-manager-notices';
import type {Prisma} from '../../../generated/beauty-client';

/** Insert a bounded batch of previously unseen reminders, so old rows cannot starve later ones. */
export async function recordBeautyIncompleteNotices(tx:Pick<Prisma.TransactionClient,'$executeRaw'>,storeId:string,earliest:Date,due:Date){
 return tx.$executeRaw`INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId")
 SELECT gen_random_uuid()::text,b."storeId",'beauty-incomplete:'||b.id||':'||to_char(b."endsAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'INCOMPLETE_SERVICE_REMINDER',b.id
 FROM public."BeautyAppointment" b
 WHERE b."storeId"=${storeId} AND b.status='RESERVED' AND b."endsAt">=${earliest} AND b."endsAt"<=${due}
 AND NOT EXISTS (SELECT 1 FROM public."DigitalManagerNotice" n WHERE n."storeId"=b."storeId" AND n."eventKey"='beauty-incomplete:'||b.id||':'||to_char(b."endsAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 ORDER BY b."endsAt",b.id LIMIT 100 ON CONFLICT ("storeId","eventKey") DO NOTHING`;
}

/** Separate from LINE workers: no LINE settings, tokens, or delivery are touched. */
export async function runBeautyDigitalManagerReminders(now=new Date()) {
 const result={recorded:0,failed:0};
 if(process.env.BEAUTY_MODULE_ENABLED!=='1')return result;
 const stores=await prisma.store.findMany({where:{industryModule:'BEAUTY',operatingStatus:{in:['ACTIVE','TRIAL']},isDemo:false},select:{id:true}});
 for(const store of stores)try{
  if(!await hasStoreFeature(store.id,FEATURES.BASIC_BOOKING))continue;
  const count=await beautyTransaction({storeId:store.id,userId:null},async tx=>{
   await tx.$executeRaw`INSERT INTO public."DigitalManagerActivation" ("storeId","activatedAt") VALUES (${store.id},${now}) ON CONFLICT ("storeId") DO NOTHING`;
   const activation=await tx.$queryRaw<Array<{activatedAt:Date}>>`SELECT "activatedAt" FROM public."DigitalManagerActivation" WHERE "storeId"=${store.id}`;
   if(!activation[0])throw new Error('門市通知啟用時間未設定');
   const activeAt=activation[0].activatedAt,today=toLocalDateStr(now),yesterday=dayRange(addTaiwanDuration(today,-1,'DAY'));
   const earliest=new Date(Math.max(yesterday.start.getTime(),activeAt.getTime()-60*60_000)),due=new Date(now.getTime()-60*60_000);
   // The store lock serializes booking changes; the insert skips earlier notices.
   let written=Number(await recordBeautyIncompleteNotices(tx,store.id,earliest,due));
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
