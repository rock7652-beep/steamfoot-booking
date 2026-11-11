"use server";
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {coursePrisma} from '@/lib/course-db';
import {courseManager} from '@/server/services/course-access';
import {lockCourseStore} from '@/server/services/course-store-lock';
import {cardSubjectRevision,readSubjectReviewCard,confirmCardSubject} from '@/server/services/course-card-subject';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {AppError,handleActionError} from '@/lib/errors';
import {requireSportsStaging} from '@/lib/sports-staging';
const id=z.string().min(1).max(100);
const scope=z.object({cardId:id,customerId:id,expectedStoreId:id});
async function authorize(input:z.infer<typeof scope>){
 const actors=await Promise.all(['plans.edit','wallet.read','customer.read'].map(p=>courseManager(p as 'plans.edit'|'wallet.read'|'customer.read')));
 const a=actors[0];
 if(a.storeId!==input.expectedStoreId||actors.some(b=>b.storeId!==a.storeId||b.user.id!==a.user.id))throw new AppError('CONFLICT','門市已切換，請重新核對');
 if(!['OWNER','ADMIN'].includes(a.user.role))throw new AppError('FORBIDDEN','請由店長核對已購方案科目');
 await requireSportsStaging(a.storeId);
 const person=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(a.user.role,a.user.staffId,a.storeId),id:input.customerId,storeId:a.storeId,mergedIntoCustomerId:null},select:{id:true}});
 if(!person)throw new AppError('NOT_FOUND','找不到可管理的本店學員');
 return a;
}
export async function loadCardSubjectReview(input:unknown){
 try{const d=scope.parse(input),a=await authorize(d);
 return await coursePrisma.$transaction(async tx=>{
  const card=await readSubjectReviewCard(tx,a.storeId,d.cardId);
  if(!card||!card.members.some(m=>m.customerId===d.customerId))throw new AppError('NOT_FOUND','找不到本店學員方案');
  const subjects=await tx.musicSubject.findMany({where:{storeId:a.storeId,isActive:true},select:{id:true,name:true},orderBy:{name:'asc'}});
  return {success:true as const,data:{revision:cardSubjectRevision(card),subjects,name:card.nameSnapshot,remaining:card.remaining,unit:card.unit,reserved:card.bookings.length,shared:card.members.length>1}};
 },{isolationLevel:'RepeatableRead'});
 }catch(e){return handleActionError(e);}
}
export async function confirmCardSubjectAction(input:unknown){
 try{const d=scope.extend({subjectId:id.optional(),subjectIds:z.array(id).min(1).max(200).refine(ids=>new Set(ids).size===ids.length).optional(),cost:z.number().int().min(1).max(10000),expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),requestKey:z.string().uuid(),confirmed:z.literal(true)}).refine(d=>!!d.subjectId!==!!d.subjectIds,"請選擇適用科目").parse(input),a=await authorize(d);
 await coursePrisma.$transaction(async tx=>{await lockCourseStore(tx,a.storeId);await confirmCardSubject(tx,{storeId:a.storeId,userId:a.user.id},d);},{isolationLevel:'Serializable',timeout:15000});
 return {success:true as const};
 }catch(e){return handleActionError(e);}
}
