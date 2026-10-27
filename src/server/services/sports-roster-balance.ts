import {sumItemBalances,type ItemBalance} from "@/lib/item-entitlement";
import 'server-only';
import {readSportsTeachingTemplates} from './sports-teaching-templates';
import {coursePrisma} from '@/lib/course-db';
import {resolveSportsEntitlement} from '@/lib/sports-entitlement';
import {readSportsSessionRule} from './sports-staging-schedule';
import type {Prisma} from '../../../generated/course-client';

/** Read-only preview; check-in still selects and debits under the store lock.
 * One batch for every unlinked learner, including shared-card reservations. */
export async function readSportsRosterBalances(storeId:string,sessionId:string,customerIds:string[],reader:Prisma.TransactionClient=coursePrisma){
 const ids=[...new Set(customerIds)];
 const balances=new Map<string,ItemBalance & {byUnit:ItemBalance[]}>();
 const entries=new Map<string,Array<ItemBalance & {id:string}>>();
 if(!ids.length)return balances;
 const session=await reader.courseSession.findFirst({where:{id:sessionId,storeId},select:{id:true,templateId:true,startsAt:true,pointCost:true,template:{select:{musicSubjectId:true}}}});
 if(!session)return balances;
 const [rule,cards,compatibleTemplateIds]=await Promise.all([
  readSportsSessionRule(reader,storeId,sessionId),
  reader.coursePointCard.findMany({where:{storeId,closedAt:null,expiresAt:{gte:new Date(Math.max(Date.now(),session.startsAt.getTime()))},members:{some:{customerId:{in:ids}}}},include:{members:{select:{customerId:true}},bookings:{where:{status:'RESERVED'},select:{pointCost:true}}},orderBy:[{expiresAt:'asc'},{id:'asc'}]}),
  readSportsTeachingTemplates(reader,storeId,session.template.musicSubjectId),
 ]);
 if(!rule)return balances;
 for(const card of cards){
  if(card.termSessionIds.length&&!card.termSessionIds.includes(session.id))continue;
  const rights=resolveSportsEntitlement({...card,templateRestricted:card.requestKey.startsWith('no-show-makeup:')},{templateId:session.templateId,subjectId:session.template.musicSubjectId,pointCost:session.pointCost,enrollment:rule.enrollment==='ASSIGNED'?'ASSIGNED':rule.enrollment==='OPEN'?'OPEN':null,legacyPlanId:rule.planId,compatibleTemplateIds});
  if(!rights.eligible)continue;
  const available=Math.max(0,card.remaining-card.bookings.reduce((n,b)=>n+b.pointCost,0));
  const balance={id:card.id,remaining:card.remaining,available,cost:rights.cost,unit:card.unit,planName:card.nameSnapshot};
  for(const member of card.members){
   if(!member.customerId||!ids.includes(member.customerId))continue;
   entries.set(member.customerId,[...(entries.get(member.customerId)??[]),balance]);
  }
 }
 for(const [customerId,rows] of entries){const byUnit=sumItemBalances(rows);if(byUnit.length)balances.set(customerId,{...(byUnit.find(row=>row.unit==='SESSION')??byUnit[0]),byUnit});}
 return balances;
}
