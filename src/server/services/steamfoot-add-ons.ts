import 'server-only';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import type {AddOnSubject} from './service-add-ons';
export {readAddOnOrder,saveAddOnOrder as saveSteamfootAddOnOrder,postAddOnReceipt as postSteamfootAddOnReceipt,addOnCommand,type AddOnActor,type AddOnSubject} from './service-add-ons';
export async function lockAddOnSubject(tx:Prisma.TransactionClient,storeId:string,bookingId:string,participantId:string):Promise<AddOnSubject>{
 const booking=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Booking" WHERE id=${bookingId} AND "storeId"=${storeId} FOR UPDATE`;
 if(!booking.length)throw new AppError('NOT_FOUND','預約不存在或不屬於本店');
 const [person]=await tx.$queryRaw<AddOnSubject[]>`SELECT p.id,g."bookingId",p."customerId",p.status,b."bookingStatus"::text AS "bookingStatus" FROM "BookingParticipant" p JOIN "BookingParticipantGroup" g ON g.id=p."groupId" AND g."storeId"=p."storeId" JOIN "Booking" b ON b.id=g."bookingId" AND b."storeId"=g."storeId" WHERE p.id=${participantId} AND p."storeId"=${storeId} AND g."bookingId"=${bookingId} FOR UPDATE OF p`;
 if(!person)throw new AppError('NOT_FOUND','顧客不屬於此預約');return person;
}
