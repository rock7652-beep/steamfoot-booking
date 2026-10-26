import 'server-only';
import {after} from 'next/server';
import {beautyNotificationDeliveryBlocked} from '@/lib/beauty/notification-policy';
import {technicianNoticeSettingId,type TechnicianNoticeBody} from '@/lib/beauty/technician-notifications';
import type {Tx} from './booking';
import type {BeautyActor} from './access';

/** Transactional outbox; no LINE I/O and no historical scanning on activation. */
export async function queueTechnicianChange(tx:Tx,a:BeautyActor,b:{id:string;technicianId:string;startsAt:Date},action:string,previous?:{technicianId:string;startsAt:Date}) {
 if(beautyNotificationDeliveryBlocked()||!['BOOKING','MOVE','CANCEL','RESTORE'].includes(action))return;
 const enabled=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "MessageTemplate" WHERE id=${technicianNoticeSettingId(a.storeId,'TECH_CHANGE')} AND "storeId"=${a.storeId} AND body='enabled' AND EXISTS(SELECT 1 FROM "BeautySetting" WHERE "storeId"=${a.storeId} AND notifications=true)`;
 if(!enabled?.length)return;
 const technicians=await tx.beautyTechnician.findMany({where:{storeId:a.storeId,active:true,id:{in:[b.technicianId,previous?.technicianId??b.technicianId]},userId:{not:null}},select:{id:true,userId:true}});
 for(const t of technicians)await tx.beautyEvent.create({data:{storeId:a.storeId,kind:'TECH_CHANGE',userId:t.userId,appointmentId:b.id,body:JSON.stringify({technicianId:t.id,action,startsAt:b.startsAt.toISOString(),...(previous?{previousStartsAt:previous.startsAt.toISOString()}:{} )} satisfies TechnicianNoticeBody)}});
 if(technicians.length)try{after(async()=>{try{const {runBeautyNotifications}=await import('./notifications');await runBeautyNotifications(new Date(),a.storeId);}catch{console.error('[beauty-technician] notification deferred',{storeId:a.storeId});}});}catch{/* Cron recovers persisted events. */}
}
