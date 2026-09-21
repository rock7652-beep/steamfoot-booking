import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {AppError} from "@/lib/errors";
export async function validateCourseTerm(tx:Pick<Prisma.TransactionClient,"courseSession">,storeId:string,plan:{termSessionIds:string[];templateIds:string[];unit:string;points:number}) {
 if(!plan.termSessionIds.length)return [];
 if(plan.unit!=="SESSION"||new Set(plan.termSessionIds).size!==plan.points||plan.termSessionIds.length!==plan.points)throw new AppError("VALIDATION","期課請使用堂數方案，並選擇與販售堂數相同數量的課次");
 const sessions=await tx.courseSession.findMany({where:{storeId,id:{in:plan.termSessionIds},cancelledAt:null},orderBy:[{startsAt:"asc"},{id:"asc"}]});
 if(sessions.length!==plan.points||sessions.some(s=>s.startsAt<=new Date()||(plan.templateIds.length&&!plan.templateIds.includes(s.templateId))))throw new AppError("VALIDATION","期課課次必須是本店尚未開始、未取消且適用本方案的課程");
 for(let i=1;i<sessions.length;i++)if(sessions[i].startsAt<sessions[i-1].endsAt)throw new AppError("VALIDATION","同一期課程時間不能重疊");
 return sessions.map(s=>s.id);
}
export async function enrollCourseTerm(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;name:string},card:{id:string;termSessionIds:string[]},customerId:string) {
 if(!card.termSessionIds.length)return;
 const [{getStoreLimitsByStoreId},{reserveCourseInTransaction}]=await Promise.all([import("@/lib/feature-gate"),import("./course-booking")]);
 const limits=await getStoreLimitsByStoreId(actor.storeId);
 for(const sessionId of card.termSessionIds)await reserveCourseInTransaction(tx,actor,{sessionId,cardId:card.id,customerId,requestKey:`term:${card.id}:${sessionId}`},limits.maxMonthlyBookings);
}
