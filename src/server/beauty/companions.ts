import 'server-only';
import {assertBeautyTrialEligibility} from './trial-eligibility';
import {AppError} from '@/lib/errors';
import {cardAllowsRecipient} from '@/lib/beauty/member-booking';
import {ownsItem,assertCustomerAvailable,type Tx} from './booking';
import {audit,type BeautyActor} from './access';

/** Identity-only update under the same Store lock as reservations. No financial/resource mutation. */
export async function linkCompanion(tx:Tx,a:BeautyActor,d:{id:string;revision:number;customerId:string}){
 const b=await ownsItem(tx,a,d.id);
 if(b.revision!==d.revision||b.customerId)throw new AppError('CONFLICT','預約已更新或已有會員身分');
 const [person]=await tx.$queryRaw<{id:string;name:string;phone:string}[]>`SELECT id,name,phone FROM "Customer" WHERE id=${d.customerId} AND "storeId"=${a.storeId} AND "mergedIntoCustomerId" IS NULL`;
 if(!person)throw new AppError('FORBIDDEN','顧客不屬於本店');
 if(await tx.beautyAppointment.count({where:{storeId:a.storeId,groupId:b.groupId,customerId:person.id,id:{not:b.id}}}))throw new AppError('CONFLICT','同一位顧客不可重複加入本次預約');
 if(b.isTrial&&b.status!=='CANCELLED')await assertBeautyTrialEligibility(tx,a.storeId,{serviceId:b.serviceId,customerId:person.id,phone:person.phone},b.id);
 await assertCustomerAvailable(tx,a.storeId,person.id,b.startsAt,b.occupiedEndsAt,b.id);
 if(b.cardId){const card=await tx.beautyCard.findFirst({where:{id:b.cardId,storeId:a.storeId}});if(!card||!cardAllowsRecipient(card,person.id,b.group.customerId))throw new AppError('FORBIDDEN','此方案未開放共用，請先由店家核對');}
 await tx.beautyAppointment.update({where:{id:b.id},data:{customerId:person.id,personName:person.name,personPhone:person.phone,revision:{increment:1}}});
 if(!b.group.customerId&&b.group.phone===person.phone)await tx.beautyGroup.update({where:{id:b.groupId},data:{customerId:person.id}});
 await audit(tx,a,'CUSTOMER_LINK',JSON.stringify({appointmentId:b.id,customerId:person.id}),b.id);
 return {id:b.id,customerId:person.id,name:person.name};
}
