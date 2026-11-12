import {cardChargeSettings,courseChargeAllowsProvider} from "@/lib/course-charge-settings";
import {courseCalendarRead} from './course-calendar-read-scope';
import {sumItemBalances,type ItemBalance} from "@/lib/item-entitlement";
import 'server-only';
import {readSportsTeachingTemplates} from './sports-teaching-templates';
import {coursePrisma} from '@/lib/course-db';
import {readCourseSessionDetail} from '@/server/queries/course-session-detail';
import {resolveSportsEntitlement,sportsBookingEnrollment} from '@/lib/sports-entitlement';
import {readSportsSessionRule} from './sports-staging-schedule';
import type {Prisma} from '../../../generated/course-client';
import {courseChargeSettings} from '@/lib/course-charge-settings';

/** Read-only preview; check-in still selects and debits under the store lock.
 * One batch for every unlinked learner, including shared-card reservations. */
export async function readSportsRosterBalances(storeId:string,sessionId:string,customerIds:string[],reader:Prisma.TransactionClient=coursePrisma,calendarCustomerIds?:string[],rosterBookings?:Parameters<typeof sportsBookingEnrollment>[1][]){
 const ids=[...new Set(customerIds)];
 const balances=new Map<string,ItemBalance & {byUnit:ItemBalance[];reviewRequired?:boolean}>();
 const reviewRequired=new Set<string>();
 const entries=new Map<string,Array<ItemBalance & {id:string}>>();
 if(!ids.length)return balances;
 const session=reader===coursePrisma?await readCourseSessionDetail(storeId,sessionId):await reader.courseSession.findFirst({where:{id:sessionId,storeId},select:{id:true,templateId:true,coachId:true,startsAt:true,pointCost:true,template:{select:{musicSubjectId:true}}}});
 if(!session)return balances;
 const calendar=calendarCustomerIds?courseCalendarRead(reader,storeId,sessionId):undefined;
 const threshold=new Date(Math.max(Date.now(),session.startsAt.getTime()));
 const readCards=()=>reader.coursePointCard.findMany({...(reader===coursePrisma?{relationLoadStrategy:"join" as const}:{}),where:{storeId,closedAt:null,expiresAt:{gte:calendar?new Date():threshold},members:{some:{customerId:{in:calendar?[...new Set(calendarCustomerIds)]:ids}}}},include:{plan:{select:{chargeSettings:true,storeId:true,templateIds:true}},members:{select:{customerId:true}},bookings:{where:{status:'RESERVED'},select:{pointCost:true}}},orderBy:[{expiresAt:'asc' as const},{id:'asc' as const}]});
 const [rule,readRows,compatibleTemplateIds]=await Promise.all([
  readSportsSessionRule(reader,storeId,sessionId),
  calendar?calendar.once("sports-balance-cards",readCards):readCards(),
  readSportsTeachingTemplates(reader,storeId,session.template.musicSubjectId),
 ]);
 if(!rule)return balances;
 const defaultEnrollment=rule.enrollment==='ASSIGNED'?'ASSIGNED':rule.enrollment==='OPEN'?'OPEN':null;
 const enrollmentByCustomer=new Map(ids.map(customerId=>{
  const booking=rosterBookings?.find(row=>row.customerId===customerId&&!row.companionIndex);
  return [customerId,booking?sportsBookingEnrollment(rule,booking):defaultEnrollment] as const;
 }));
 const cards=calendar?readRows.filter(card=>!!card.expiresAt&&card.expiresAt>=threshold&&card.members.some(member=>!!member.customerId&&ids.includes(member.customerId))):readRows;
 for(const card of cards){
  const charge=courseChargeSettings.safeParse(cardChargeSettings(card));
  if(cardChargeSettings(card)!=null&&(!charge.success||!courseChargeAllowsProvider(charge.data,session.coachId)))continue;
  if(card.termSessionIds.length&&!card.termSessionIds.includes(session.id))continue;
  const available=Math.max(0,card.remaining-card.bookings.reduce((n,b)=>n+b.pointCost,0));
  for(const member of card.members){
   if(!member.customerId||!ids.includes(member.customerId))continue;
   const enrollment=enrollmentByCustomer.get(member.customerId)??null;
   const rights=resolveSportsEntitlement({...card,templateRestricted:card.requestKey.startsWith('no-show-makeup:')},{templateId:session.templateId,subjectId:session.template.musicSubjectId,pointCost:session.pointCost,enrollment,legacyPlanId:rule.planId,compatibleTemplateIds});
   if(!rights.eligible){if(rights.reason.startsWith('方案科目待核對'))reviewRequired.add(member.customerId);continue;}
   const balance={id:card.id,remaining:card.remaining,available,cost:rights.cost,unit:card.unit,planName:card.nameSnapshot};
   entries.set(member.customerId,[...(entries.get(member.customerId)??[]),balance]);
  }
 }
 for(const [customerId,rows] of entries){const byUnit=sumItemBalances(rows);if(byUnit.length)balances.set(customerId,{...(byUnit.find(row=>row.unit==='SESSION')??byUnit[0]),byUnit});}
 for(const customerId of reviewRequired)if(!balances.has(customerId))balances.set(customerId,{remaining:0,available:0,cost:0,unit:'SESSION',planName:'方案科目待核對',byUnit:[],reviewRequired:true});
 return balances;
}
