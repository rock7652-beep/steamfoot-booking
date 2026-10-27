import 'server-only';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {beautyManager} from './access';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {dayRange,parseTaipeiDateTime} from '@/lib/date-utils';
import {AppError} from '@/lib/errors';
import {beautyReadStep} from './read-timing';
import {serviceCharges,servicePaymentLabel} from './service-charges';
import type {NativeRosterBooking} from '@/app/(dashboard)/dashboard/courses/roster-source';
export async function beautyRosterContext(){
 const [a,u]=await beautyReadStep('authorization',()=>Promise.all([beautyManager('booking.read'),getCurrentUser()]));
 const can=async(p:Parameters<typeof checkPermission>[2])=>!!u&&await checkPermission(u.role,u.staffId,p);
 const [customerAccess,cardAccess]=await beautyReadStep('permissions',()=>Promise.all([can('customer.read').then(async p=>p&&await hasStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT)),can('wallet.read').then(async p=>p&&await hasStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT))]));
 const financeAccess=(await can('transaction.read')||await can('transaction.create'))&&await hasStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
 return {a,u,customerAccess,cardAccess,financeAccess};
}
export type BeautyRosterContext=Awaited<ReturnType<typeof beautyRosterContext>>;
export async function beautyRosterWhere(ctx:BeautyRosterContext,input:string):Promise<{startsAt?:{gte:Date;lte:Date};groupId?:string}>{
 const target=z.string().min(1).max(200).parse(input),{a}=ctx;
 if(target.startsWith('day:')){const date=target.slice(4);if(!parseTaipeiDateTime(date,'00:00'))throw new AppError('VALIDATION','日期格式不正確');const range=dayRange(date);return {startsAt:{gte:range.start,lte:range.end}};}
 if(target.startsWith('booking:')){const b=await beautyPrisma.beautyAppointment.findFirst({where:{id:target.slice(8),storeId:a.storeId},select:{groupId:true}});if(!b)throw new AppError('NOT_FOUND','找不到本店預約');return {groupId:b.groupId};}
 throw new AppError('VALIDATION','請從班表開啟預約清單');
}
export async function loadBeautyRoster(ctx:BeautyRosterContext,where:Awaited<ReturnType<typeof beautyRosterWhere>>,readVersion?:string){
 const {a,u,customerAccess,cardAccess}=ctx;
  const rows=await beautyReadStep('bookings',()=>beautyPrisma.beautyAppointment.findMany({where:{...where,storeId:a.storeId},orderBy:[{startsAt:'asc'},{createdAt:'asc'},{id:'asc'}],include:{group:{select:{customerId:true,contactName:true}}}}));
  const [cards,people,techs,locations]=await beautyReadStep('metadata',()=>Promise.all([
   cardAccess?beautyPrisma.beautyCard.findMany({where:{storeId:a.storeId,OR:[{id:{in:rows.flatMap(b=>b.cardId?[b.cardId]:[])}},{memberIds:{hasSome:rows.flatMap(b=>b.customerId?[b.customerId]:[])}}]}}):Promise.resolve([]),
   customerAccess&&u?prisma.customer.findMany({where:{...getManagerCustomerWhere(u.role,u.staffId,a.storeId),storeId:a.storeId,mergedIntoCustomerId:null,id:{in:rows.flatMap(b=>b.customerId?[b.customerId]:[])}},select:{id:true,name:true,phone:true,serviceNote:true,notes:true,assignedStaff:{select:{id:true,displayName:true,storeId:true}}}}):Promise.resolve([]),
   beautyPrisma.beautyTechnician.findMany({where:{storeId:a.storeId,id:{in:rows.map(b=>b.technicianId)}},select:{id:true,name:true}}),
   beautyPrisma.$queryRaw<Array<{id:string;name:string}>>`SELECT id,name FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND id=ANY(${rows.map(b=>b.locationId)}::text[])`,
  ]));
  const held=cardAccess?await beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId:a.storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}):[];
  const charges=ctx.financeAccess?await serviceCharges(beautyPrisma as unknown as Parameters<typeof serviceCharges>[0],a.storeId,rows.filter(b=>!b.cardId)):[];
  const roster:NativeRosterBooking[]=rows.map(b=>{
   const c=cards.find(c=>c.id===b.cardId),person=people.find(p=>p.id===b.customerId),expired=c?c.expiresAt.getTime()<Date.now():false;
   const charge=charges.find(c=>c.id===b.id),payment=charge?{reduction:charge.reduction,netPrice:charge.netPrice,collected:charge.collected,due:charge.due,status:servicePaymentLabel(charge)}:undefined;
   const available=c?c.closedAt||expired?0:Math.max(0,c.remaining-(held.find(h=>h.cardId===c.id)?._count.id??0)):0;
   const itemCards=cards.filter(card=>!!b.customerId&&card.memberIds.includes(b.customerId)&&card.serviceIds.includes(b.serviceId)&&!card.closedAt&&+card.expiresAt>=Math.max(Date.now(),+b.startsAt));
   const itemRemaining=itemCards.reduce((n,card)=>n+Math.max(0,card.remaining),0);
   const itemAvailable=itemCards.reduce((n,card)=>n+Math.max(0,card.remaining-(held.find(h=>h.cardId===card.id)?._count.id??0)),0);

   return {openingIssue:null,openingImported:false,openingTuition:null,termUnscheduledOrdinals:[],termClosedBeforeCutoff:0,id:b.id,customerId:person?.id??null,customerName:person?.name??b.personName,customerPhone:customerAccess?person?.phone??b.personPhone:'',companionIndex:null,reserverName:null,reserverCustomerId:null,operatorCustomerId:null,operatorName:'',createdAt:b.createdAt.toISOString(),status:b.status==='COMPLETED'?'ATTENDED':b.status,absenceKind:null,checkedInAt:null,cardId:c?.id??null,pointCost:c?1:0,bookingKind:b.cardId?'CARD':b.isTrial?'TRIAL':'SINGLE',trialPrice:b.price,trialPayments:[],notes:customerAccess?b.notes:'',requestKey:'',session:{startsAt:b.startsAt,templateId:b.serviceId,requestKey:'',requestIndex:0,template:{classType:'PRIVATE',musicTermLessons:null}},unit:'SESSION',groupCohortProgress:null,termIndex:null,termCount:0,termNumber:null,bonusPeriod:false,bonusLessons:0,nextPaidLessons:null,termPayment:null,nextTerm:null,termLessons:[],termLeaveCount:0,termNoShowCount:0,termPrivateLeaves:[],termMakeups:[],sportsFixed:false,...(cardAccess&&!b.isTrial?{sportsBalance:{remaining:itemRemaining,available:itemAvailable,cost:1,unit:"SESSION",planName:"同項目方案合計",byUnit:[{remaining:itemRemaining,available:itemAvailable,cost:1,unit:"SESSION",planName:"同項目方案合計"}]}}:{}),planName:c?.name??(b.isTrial?'體驗服務':'單次服務'),sharedCard:!!c&&c.memberIds.length>1,canAddCompanion:false,bookingSource:'',available,cardRemaining:c?.remaining??null,assignedCoachId:person?.assignedStaff?.storeId===a.storeId?person.assignedStaff.id:null,assignedCoachName:person?.assignedStaff?.storeId===a.storeId?person.assignedStaff.displayName:'',expiresAt:c?.expiresAt.toISOString()??null,absenceCount:0,absenceHistory:[],serviceNote:person?[person.serviceNote,person.notes].filter(Boolean).join('\n'):'',service:{revision:b.revision,startsAt:b.startsAt.toISOString(),endsAt:b.endsAt.toISOString(),occupiedEndsAt:b.occupiedEndsAt.toISOString(),serviceName:b.serviceName,technicianName:techs.find(t=>t.id===b.technicianId)?.name??'店家安排',locationName:locations.find(l=>l.id===b.locationId)?.name??'未指定',price:b.price,payment,debit:b.debit,available:cardAccess&&!b.isTrial?itemAvailable:null}};
  });
  return {success:true as const,data:{...(readVersion?{readVersion}:{}),roster,sharedCardState:'ENABLED' as const,canPurchase:false,pendingMakeups:[],waitlist:[],trial:null,session:{templateId:"",compatibleTemplateIds:[],startsAt:rows[0]?.startsAt.toISOString()??'',pointCost:1,teacherNote:'',teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',teacherMakeupForSessionId:null,waitlistEnabled:false,waitlistStopMinutes:0},cards:[]}};
}
/** Fingerprint only related records. Hashes cross-store-independent, authorized scope metadata;
 * no row contents are transferred to the browser by an unchanged check. */
export async function beautyRosterVersion(ctx:BeautyRosterContext,where:Awaited<ReturnType<typeof beautyRosterWhere>>){
 const store=ctx.a.storeId,group=where.groupId??null,from=where.startsAt?.gte??null,to=where.startsAt?.lte??null;
 const parts=await beautyReadStep('version',()=>beautyPrisma.$queryRaw<Record<string,string|null>[]>`
 WITH selected AS (
  SELECT id,revision,"customerId","cardId","technicianId","locationId" FROM "BeautyAppointment"
  WHERE "storeId"=${store} AND ((${group}::text IS NOT NULL AND "groupId"=${group}) OR (${from}::timestamp IS NOT NULL AND "startsAt" BETWEEN ${from} AND ${to}))
 )
 SELECT
 (SELECT md5(COALESCE(string_agg(ROW(id,revision)::text,',' ORDER BY id),'')) FROM selected) AS bookings,
 (SELECT md5(COALESCE(string_agg(ROW(c.id,c."updatedAt",c."assignedStaffId")::text,',' ORDER BY c.id),'')) FROM "Customer" c WHERE ${ctx.customerAccess} AND c."storeId"=${store} AND c.id IN (SELECT "customerId" FROM selected)) AS customers,
 (SELECT md5(COALESCE(string_agg(ROW(c.id,c.name,c.remaining,c."closedAt",c."expiresAt",c."memberIds",c."expiresAt"<CURRENT_TIMESTAMP)::text,',' ORDER BY c.id),'')) FROM "BeautyCard" c WHERE ${ctx.cardAccess} AND c."storeId"=${store} AND (c.id IN (SELECT "cardId" FROM selected) OR c."memberIds" && ARRAY(SELECT "customerId" FROM selected WHERE "customerId" IS NOT NULL))) AS cards,
 (SELECT md5(COALESCE(string_agg(ROW(b.id,b.revision)::text,',' ORDER BY b.id),'')) FROM "BeautyAppointment" b WHERE ${ctx.cardAccess} AND b."storeId"=${store} AND b.status='RESERVED' AND b."cardId" IN (SELECT c.id FROM "BeautyCard" c WHERE c."storeId"=${store} AND (c.id IN (SELECT "cardId" FROM selected) OR c."memberIds" && ARRAY(SELECT "customerId" FROM selected WHERE "customerId" IS NOT NULL)))) AS holds,
 (SELECT md5(COALESCE(string_agg(ROW(t.id,t.name)::text,',' ORDER BY t.id),'')) FROM "BeautyTechnician" t WHERE t."storeId"=${store} AND t.id IN (SELECT "technicianId" FROM selected)) AS technicians,
 (SELECT md5(COALESCE(string_agg(ROW(r.id,r.name)::text,',' ORDER BY r.id),'')) FROM "CourseRoom" r WHERE r."storeId"=${store} AND r.id IN (SELECT "locationId" FROM selected)) AS locations,
 (SELECT md5(COALESCE(string_agg(ROW(p.id,p.amount,p.kind)::text,',' ORDER BY p.id),'')) FROM "BeautyPayment" p WHERE ${ctx.financeAccess??false} AND p."storeId"=${store} AND p."appointmentId" IN (SELECT id FROM selected)) AS payments,
 (SELECT md5(COALESCE(string_agg(ROW(e.id,e.kind)::text,',' ORDER BY e.id),'')) FROM "BeautyEvent" e WHERE ${ctx.financeAccess??false} AND e."storeId"=${store} AND e."appointmentId" IN (SELECT id FROM selected)) AS financial_events,
 (SELECT md5(COALESCE(string_agg(ROW(s.id,s."displayName",s.status)::text,',' ORDER BY s.id),'')) FROM "Staff" s WHERE ${ctx.customerAccess} AND s."storeId"=${store} AND s.id IN (SELECT c."assignedStaffId" FROM "Customer" c WHERE ${ctx.customerAccess} AND c."storeId"=${store} AND c.id IN (SELECT "customerId" FROM selected))) AS staff
 `);
 return createHash('sha256').update(JSON.stringify({store,user:ctx.a.userId,role:ctx.u?.role,staff:ctx.u?.staffId,customer:ctx.customerAccess,card:ctx.cardAccess,finance:ctx.financeAccess,parts:parts[0]})).digest('hex');
}
