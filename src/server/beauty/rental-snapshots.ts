import 'server-only';
import {coursePrisma} from '@/lib/course-db';
import type {RentalDetail} from '@/lib/course-rental';
/** Called only after the calendar has authorized booking/customer access for this store.
 * One bounded batch, using the same shared rental connection as getCourseRental. */
export async function beautyRentalSnapshots(storeId:string,ids:string[]):Promise<Record<string,RentalDetail>|undefined>{
 if(!ids.length)return {};
 try{const rows=await coursePrisma.courseRental.findMany({where:{storeId,id:{in:ids}},include:{payments:{where:{status:'SUCCESS'},take:1}}});
 return Object.fromEntries(rows.map(r=>[r.id,{id:r.id,roomId:r.roomId,customerId:r.customerId,customerName:r.customerName,customerPhone:r.customerPhone,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),amount:r.amount,note:r.note,revision:r.revision,cancelledAt:r.cancelledAt?.toISOString()??null,hourlyRateSnapshot:r.hourlyRateSnapshot,payment:r.payments[0]?{id:r.payments[0].id,amount:r.payments[0].amount,paymentMethod:r.payments[0].paymentMethod}:null}]));
 }catch{console.warn('[BEAUTY_RENTAL_READ] prepared detail unavailable');return undefined;}
}
