import 'server-only';
import {coursePrisma} from '@/lib/course-db';
import type {CoursePurchaseRosterSnapshot} from '@/lib/course-purchase-roster';

/** Runs after commit. Projection failure cannot turn a paid purchase into failure. */
export async function readPurchasedCourseRoster(storeId:string,customerId:string,bookingId?:string):Promise<CoursePurchaseRosterSnapshot|null>{
 if(!bookingId)return null;
 try{
  const anchor=await coursePrisma.courseBooking.findFirst({where:{id:bookingId,storeId,customerId,status:{not:'CANCELLED'}},select:{sessionId:true}});
  if(!anchor?.sessionId)return null;
  const {loadCourseRosterQuick}=await import('@/server/actions/course-members');
  const result=await loadCourseRosterQuick(anchor.sessionId);
  return result.success?{sessionId:anchor.sessionId,data:result.data}:null;
 }catch{return null;}
}

export async function readPurchasedCourseCards(customerId:string):Promise<import('@/lib/course-purchase-roster').CoursePurchaseCardsSnapshot|null>{
 try{const {readCourseCards}=await import('./course-card-browser');const result=await readCourseCards({customerId},false,undefined,true);return result.success?{customerId,result}:null;}catch{return null;}
}

/** Post-commit projection. The independent booking.read guard still runs; a
 * failed projection never converts a committed attendance write into failure. */
export async function readCommittedCourseRoster(storeId:string,sessionId:string):Promise<CoursePurchaseRosterSnapshot|null>{
 try{
  const anchor=await coursePrisma.courseSession.findFirst({where:{id:sessionId,storeId,cancelledAt:null},select:{id:true}});
  if(!anchor)return null;
  const {loadCourseRosterQuick}=await import('@/server/actions/course-members');
  const result=await loadCourseRosterQuick(anchor.id);
  return result.success?{sessionId:anchor.id,data:result.data}:null;
 }catch{return null;}
}
