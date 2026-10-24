"use server";
import {z} from 'zod';
import {changeBeautyAttendance,changeBeautyStatus} from './beauty';
import {beautyCalendar} from '@/server/beauty/queries';
import {attendanceInput} from '@/lib/beauty/contracts';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {dayRange,parseTaipeiDateTime} from '@/lib/date-utils';
import {AppError,handleActionError} from '@/lib/errors';
import type {NativeRosterBooking} from '@/app/(dashboard)/dashboard/courses/roster-source';

/** The original roster model, backed only by this store's service records. */
export async function readBeautyNativeRoster(input:string){
 try{
  const target=z.string().min(1).max(200).parse(input),a=await beautyManager('booking.read'),u=await getCurrentUser();
  const can=async(p:Parameters<typeof checkPermission>[2])=>!!u&&await checkPermission(u.role,u.staffId,p);
  const [customerAccess,cardAccess]=await Promise.all([can('customer.read').then(async p=>p&&await hasStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT)),can('wallet.read').then(async p=>p&&await hasStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT))]);
  let where:{startsAt?:{gte:Date;lte:Date};groupId?:string};
  if(target.startsWith('day:')){const date=target.slice(4);if(!parseTaipeiDateTime(date,'00:00'))throw new AppError('VALIDATION','日期格式不正確');const range=dayRange(date);where={startsAt:{gte:range.start,lte:range.end}};}
  else if(target.startsWith('booking:')){const b=await beautyPrisma.beautyAppointment.findFirst({where:{id:target.slice(8),storeId:a.storeId},select:{groupId:true}});if(!b)throw new AppError('NOT_FOUND','找不到本店預約');where={groupId:b.groupId};}
  else throw new AppError('VALIDATION','請從班表開啟預約清單');
  const rows=await beautyPrisma.beautyAppointment.findMany({where:{...where,storeId:a.storeId},orderBy:[{startsAt:'asc'},{createdAt:'asc'},{id:'asc'}],include:{group:{select:{customerId:true,contactName:true}}}});
  const [cards,people,techs,locations]=await Promise.all([
   cardAccess?beautyPrisma.beautyCard.findMany({where:{storeId:a.storeId,id:{in:rows.flatMap(b=>b.cardId?[b.cardId]:[])}}}):Promise.resolve([]),
   customerAccess&&u?prisma.customer.findMany({where:{...getManagerCustomerWhere(u.role,u.staffId,a.storeId),storeId:a.storeId,mergedIntoCustomerId:null,id:{in:rows.flatMap(b=>b.customerId?[b.customerId]:[])}},select:{id:true,phone:true,serviceNote:true,notes:true,assignedStaff:{select:{id:true,displayName:true,storeId:true}}}}):Promise.resolve([]),
   beautyPrisma.beautyTechnician.findMany({where:{storeId:a.storeId,id:{in:rows.map(b=>b.technicianId)}},select:{id:true,name:true}}),
   beautyPrisma.$queryRaw<Array<{id:string;name:string}>>`SELECT id,name FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND id=ANY(${rows.map(b=>b.locationId)}::text[])`,
  ]);
  const held=cardAccess?await beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId:a.storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}):[];
  const roster:NativeRosterBooking[]=rows.map(b=>{
   const c=cards.find(c=>c.id===b.cardId),person=people.find(p=>p.id===b.customerId),expired=c?c.expiresAt.getTime()<Date.now():false;
   const available=c?c.closedAt||expired?0:Math.max(0,c.remaining-(held.find(h=>h.cardId===c.id)?._count.id??0)):0;
   return {id:b.id,customerId:person?.id??null,customerName:b.personName,customerPhone:customerAccess?person?.phone??b.personPhone:'',companionIndex:null,reserverName:null,reserverCustomerId:null,operatorCustomerId:null,operatorName:'',createdAt:b.createdAt.toISOString(),status:b.status==='COMPLETED'?'ATTENDED':b.status,absenceKind:null,checkedInAt:null,cardId:c?.id??null,pointCost:c?1:0,bookingKind:b.cardId?'CARD':b.isTrial?'TRIAL':'SINGLE',trialPrice:b.price,trialPayments:[],notes:customerAccess?b.notes:'',requestKey:'',session:{templateId:b.serviceId,requestKey:'',requestIndex:0,template:{classType:'PRIVATE',musicTermLessons:null}},unit:'SESSION',groupCohortProgress:null,termIndex:null,termCount:0,termNumber:null,bonusPeriod:false,bonusLessons:0,nextPaidLessons:null,termPayment:null,nextTerm:null,termLessons:[],termLeaveCount:0,termNoShowCount:0,termPrivateLeaves:[],termMakeups:[],sportsFixed:false,planName:c?.name??(b.isTrial?'體驗服務':'單次服務'),sharedCard:!!c&&c.memberIds.length>1,canAddCompanion:false,bookingSource:'',available,cardRemaining:c?.remaining??null,assignedCoachId:person?.assignedStaff?.storeId===a.storeId?person.assignedStaff.id:null,assignedCoachName:person?.assignedStaff?.storeId===a.storeId?person.assignedStaff.displayName:'',expiresAt:c?.expiresAt.toISOString()??null,absenceCount:0,absenceHistory:[],serviceNote:person?[person.serviceNote,person.notes].filter(Boolean).join('\n'):'',service:{revision:b.revision,startsAt:b.startsAt.toISOString(),endsAt:b.endsAt.toISOString(),occupiedEndsAt:b.occupiedEndsAt.toISOString(),serviceName:b.serviceName,technicianName:techs.find(t=>t.id===b.technicianId)?.name??'店家安排',locationName:locations.find(l=>l.id===b.locationId)?.name??'未指定',price:b.price,debit:b.debit,available:c?available:null}};
  });
  return {success:true as const,data:{roster,sharedCardState:'ENABLED' as const,canPurchase:false,pendingMakeups:[],waitlist:[],trial:null,session:{startsAt:rows[0]?.startsAt.toISOString()??'',pointCost:1,teacherNote:'',teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',teacherMakeupForSessionId:null,waitlistEnabled:false,waitlistStopMinutes:0},cards:[]}};
 }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'讀取失敗':failure.error};}
}

export async function saveBeautyNativeRosterNote(input:unknown){
 try{
  const d=z.object({sessionId:z.string().min(1).max(200),bookingId:z.string().min(1).max(180),note:z.string().trim().max(1000),expectedNote:z.string().max(1000)}).parse(input);
  const a=await beautyManager('booking.update',true);await beautyManager('customer.read');
  return await beautyTransaction(a,async tx=>{
   const current=await tx.beautyAppointment.findFirst({where:{id:d.bookingId,storeId:a.storeId,status:{not:'CANCELLED'}}});
   if(!current)throw new AppError('NOT_FOUND','找不到本店可修改的預約');
   if(d.sessionId.startsWith('booking:')){const anchor=await tx.beautyAppointment.findFirst({where:{id:d.sessionId.slice(8),storeId:a.storeId},select:{groupId:true}});if(anchor?.groupId!==current.groupId)throw new AppError('FORBIDDEN','此預約不在目前名單');}
   else if(d.sessionId.startsWith('day:')){const date=d.sessionId.slice(4);if(!parseTaipeiDateTime(date,'00:00'))throw new AppError('VALIDATION','日期格式不正確');const range=dayRange(date);if(current.startsAt<range.start||current.startsAt>range.end)throw new AppError('CONFLICT','預約日期已更新，請重新開啟');}
   else throw new AppError('VALIDATION','請從班表開啟預約清單');
   if(current.notes===d.note)return {success:true as const,revision:current.revision};
   if(current.notes!==d.expectedNote)return {success:false as const,error:'本次備註已被更新，請確認最新內容後再儲存',currentValue:current.notes};
   await tx.beautyAppointment.update({where:{id:current.id},data:{notes:d.note,revision:{increment:1}}});
   await audit(tx,a,'BOOKING_NOTE',JSON.stringify({before:current.notes,after:d.note}),current.id);
   return {success:true as const,revision:current.revision+1};
  });
 }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'儲存失敗':failure.error};}
}

/** Refresh only the open roster and affected business day, never the dashboard catalogs. */
export async function readBeautyRosterOperation(input:unknown){
 try{
  const d=z.object({sessionId:z.string().min(1).max(200),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/)}).parse(input);
  const [roster,calendar]=await Promise.all([readBeautyNativeRoster(d.sessionId),beautyCalendar(d.date,'day')]);
  if(!roster.success)return roster;
  return {success:true as const,data:{roster:roster.data,calendar}};
 }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'讀取失敗':failure.error};}
}
export async function updateBeautyRosterAttendance(input:unknown){
 const at=performance.now();
 const parsed=z.object({sessionId:z.string().min(1).max(200),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),attendance:attendanceInput}).safeParse(input);
 if(!parsed.success)return {success:false as const,error:'出席資料格式不正確'};
 const d=parsed.data,write=await changeBeautyAttendance(d.attendance),written=performance.now();
 if(!write.success)return write;
 const refreshed=await readBeautyRosterOperation(d);
 return {success:true as const,refresh:refreshed,timing:{writeMs:written-at,readMs:performance.now()-written}};
}
export async function cancelBeautyRosterAppointment(input:unknown){
 const at=performance.now();
 const parsed=z.object({sessionId:z.string().min(1).max(200),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),id:z.string().min(1),revision:z.number().int(),requestKey:z.string().uuid()}).safeParse(input);
 if(!parsed.success)return {success:false as const,error:'取消資料格式不正確'};
 const d=parsed.data,write=await changeBeautyStatus('manager',{id:d.id,revision:d.revision,requestKey:d.requestKey,target:'CANCELLED',reason:'後台取消預約'}),written=performance.now();
 if(!write.success)return write;
 const refreshed=await readBeautyRosterOperation(d);
 return {success:true as const,refresh:refreshed,timing:{writeMs:written-at,readMs:performance.now()-written}};
}

export async function readBeautyMoveResult(id:string){
 try{const a=await beautyManager('booking.read'),row=await beautyPrisma.beautyAppointment.findFirst({where:{id:z.string().min(1).max(180).parse(id),storeId:a.storeId},select:{startsAt:true,endsAt:true,locationId:true,technicianId:true}});if(!row)throw new AppError('NOT_FOUND','找不到本店預約');return {success:true as const,data:{startsAt:row.startsAt.toISOString(),endsAt:row.endsAt.toISOString(),roomId:row.locationId,coachId:row.technicianId}};}
 catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'讀取失敗':failure.error};}
}
