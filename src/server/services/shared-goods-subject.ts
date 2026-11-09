import 'server-only';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import type {AddOnSubject} from './service-add-ons';
/** Every caller holds Store before any reservation locks. A class session is not a party. */
export async function lockSharedGoodsSubject(tx:Prisma.TransactionClient,storeId:string,module:'STEAMFOOT'|'FITNESS'|'MUSIC',bookingId:string,participantId:string):Promise<AddOnSubject>{
 if(module==='STEAMFOOT'){
  const [row]=await tx.$queryRaw<AddOnSubject[]>`SELECT b.id,b.id AS "bookingId",b.id AS "reservationKey",b."customerId",b."bookingStatus"::text AS "bookingStatus",CASE WHEN b."bookingStatus"::text IN ('CANCELLED','NO_SHOW') OR NOT EXISTS(SELECT 1 FROM "BookingParticipant" active WHERE active."groupId"=g.id AND active."storeId"=g."storeId" AND active.status NOT IN ('CANCELLED','NO_SHOW')) THEN 'CANCELLED' ELSE 'ACTIVE' END AS status FROM "Booking" b JOIN "BookingParticipantGroup" g ON g."bookingId"=b.id AND g."storeId"=b."storeId" JOIN "BookingParticipant" p ON p."groupId"=g.id AND p."storeId"=g."storeId" WHERE b.id=${bookingId} AND b."storeId"=${storeId} AND p.id=${participantId} FOR UPDATE OF b`;
  if(!row)throw new AppError('NOT_FOUND','顧客不屬於此預約');return {...row,ownership:'RESERVATION'};
 }
 const rows=await tx.$queryRaw<Array<{id:string;groupKey:string|null;reserverCustomerId:string|null;operatorCustomerId:string|null;operatorUserId:string;customerId:string|null;status:string;bookingStatus:string;serviceId:string|null}>>`SELECT b.id,b."groupKey",b."reserverCustomerId",b."operatorCustomerId",b."operatorUserId",b."customerId",b.status,CASE WHEN s."cancelledAt" IS NOT NULL OR s."teacherAttendance" IN ('LEAVE','NO_SHOW') THEN 'CANCELLED' ELSE 'ACTIVE' END AS "bookingStatus",CASE WHEN a."isActive" THEN a.id ELSE NULL END AS "serviceId" FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" LEFT JOIN "CourseTemplate" t ON t.id=s."templateId" AND t."storeId"=s."storeId" LEFT JOIN "MusicSubject" a ON a.id=t."musicSubjectId" AND a."storeId"=s."storeId" WHERE b."storeId"=${storeId} AND b."sessionId"=${bookingId} AND (b.id=${participantId} OR (b."groupKey" IS NOT NULL AND b."groupKey"<>'' AND b."groupKey"=(SELECT "groupKey" FROM "CourseBooking" WHERE id=${participantId} AND "storeId"=${storeId} AND "sessionId"=${bookingId}))) ORDER BY b.id FOR UPDATE OF b`;
 const anchor=rows.find(r=>r.id===participantId);if(!anchor)throw new AppError('NOT_FOUND','學員不屬於此課次');
 const customers=[...new Set(rows.flatMap(r=>r.reserverCustomerId?[r.reserverCustomerId]:r.operatorCustomerId?[r.operatorCustomerId]:[]))];
 if(customers.length>1)throw new AppError('CONFLICT','同行預約歸屬不一致，請先核對');
 const groupOwner=anchor.groupKey?'group:'+anchor.groupKey:'booking:'+anchor.id;
 // On-site companions can give a previously solo booking a groupKey. Reuse its cart.
 const previous=await tx.$queryRaw<{reservationKey:string}[]>`SELECT "reservationKey" FROM "ServiceAddOnOrder" WHERE "storeId"=${storeId} AND module=${module} AND "bookingId"=${bookingId} AND ownership='RESERVATION' AND ("reservationKey"=${groupOwner} OR "reservationKey" IN (SELECT 'booking:'||value FROM jsonb_array_elements_text(${JSON.stringify(rows.map(r=>r.id))}::jsonb)))`;
 if(previous.length>1)throw new AppError('CONFLICT','同行者已有不同商品單，請先核對，不會自動合併');
 return {id:anchor.id,bookingId,reservationKey:previous[0]?.reservationKey??groupOwner,ownership:'RESERVATION',customerId:customers[0]??(anchor.groupKey?null:anchor.customerId),serviceId:anchor.serviceId,status:rows.every(r=>['CANCELLED','NO_SHOW'].includes(r.status))?'CANCELLED':'ACTIVE',bookingStatus:anchor.bookingStatus};
}
