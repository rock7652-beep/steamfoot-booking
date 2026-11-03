import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '../../../generated/beauty-client';
import {AppError} from '@/lib/errors';
import {parseTaipeiDateTime} from '@/lib/date-utils';
import {beautyNativeScheduleInput} from '@/lib/beauty/native-schedule';
import {partyInput} from '@/lib/beauty/contracts';
import {command,type BeautyActor} from './access';
import {reserveParty,settings} from './booking';

/** Runs under the same Beauty store lock as booking, card holds and edits. */
export async function reserveNativeBeautySchedule(tx:Prisma.TransactionClient,a:BeautyActor,input:unknown){
 const d=beautyNativeScheduleInput.parse(input),p=d.payload;
 if(!a.manager)throw new AppError('FORBIDDEN','僅供店家安排服務');
 if(p.kind==='每週固定'||p.kind==='隔週固定')throw new AppError('BUSINESS_RULE','目前尚未支援固定週期安排，本次未建立任何預約。');
 if(p.mode==='開放選課'||p.waitlistLimit)throw new AppError('BUSINESS_RULE','目前尚未支援開放選課與候補，本次未建立任何預約。');
 if(p.kind==='空間出租')throw new AppError('VALIDATION','空間出租須使用共用租借核心');
 if(!p.students.length||new Set(p.students).size!==p.students.length||p.capacity!==p.students.length)throw new AppError('VALIDATION','請核對指定顧客與人數');
 return command(tx,a,p.requestKey,d,async()=>{
  const service=await tx.beautyService.findFirst({where:{id:p.subject,storeId:a.storeId,active:true}});
  if(!service||service.revision!==d.expectedServiceRevision)throw new AppError('CONFLICT','服務項目已更新，請重新開啟排課');
  if(p.duration!==service.duration)throw new AppError('VALIDATION','本店服務時長須與服務項目設定相同，本次未建立預約。');
  const trial=p.kind==='體驗';
  if(trial&&(service.trialPrice==null||p.price!==service.trialPrice))throw new AppError('CONFLICT','體驗費須符合目前服務設定，請核對金額後重試');
  const technician=await tx.beautyTechnician.findFirst({where:{id:p.coachId,storeId:a.storeId,active:true,serviceIds:{has:service.id}}});
  if(!technician)throw new AppError('FORBIDDEN','請選擇本店可服務的技師');
  const locations=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND name=${p.room} AND "isActive"=true`;
  if(locations.length!==1)throw new AppError('VALIDATION','位置不存在或名稱重複，請先核對位置設定');
  const customers=await tx.$queryRaw<Array<{id:string;name:string;phone:string}>>`SELECT c.id,c.name,c.phone FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId" WHERE c."storeId"=${a.storeId} AND c.id=ANY(${p.students}::text[]) AND c."mergedIntoCustomerId" IS NULL AND (c."userId" IS NULL OR u.status::text='ACTIVE')`;
  if(customers.length!==p.students.length)throw new AppError('FORBIDDEN','選取資料包含非本店、停用或已合併顧客');
  const startsAt=parseTaipeiDateTime(p.date,p.time)!;
  const cards=trial?[]:await tx.beautyCard.findMany({where:{storeId:a.storeId,closedAt:null,expiresAt:{gt:startsAt},serviceIds:{has:service.id},remaining:{gt:0},memberIds:{hasSome:p.students}},orderBy:[{expiresAt:'asc'},{id:'asc'}]});
  const holds=cards.length?await tx.beautyAppointment.groupBy({by:['cardId'],where:{storeId:a.storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}):[];
  const selected=new Map<string,number>();
  const people=p.students.map(id=>{
   const person=customers.find(c=>c.id===id)!;
   const card=cards.find(c=>c.memberIds.includes(id)&&c.remaining-(holds.find(h=>h.cardId===c.id)?._count.id??0)-(selected.get(c.id)??0)>0);
   if(!trial&&!card)throw new AppError('BUSINESS_RULE',`${person.name} 沒有可用方案；本批未建立預約。`);
   if(card)selected.set(card.id,(selected.get(card.id)??0)+1);
   return {name:person.name,phone:person.phone,customerId:id,serviceId:service.id,serviceRevision:service.revision,preference:'ANY' as const,specifiedTechnicianId:technician.id,specifiedLocationId:locations[0].id,cardId:card?.id??null,notes:''};
  });
  const policy=await settings(tx,a.storeId);
  // Separate the original native intent receipt from the existing booking receipt.
  const hash=createHash('sha256').update(`native-beauty:${p.requestKey}`).digest('hex');
  const requestKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const intent=partyInput.parse({requestKey,policyRevision:policy.revision,date:p.date,time:p.time,contactName:people[0].name,phone:people[0].phone,isTrial:trial,people});
  return reserveParty(tx,a,intent);
 });
}
