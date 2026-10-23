import 'server-only';
import type {Prisma,BeautyAppointment} from '../../../generated/beauty-client';
import type {BeautyActor} from './access';
import type {StoreNoticeItem} from '@/lib/store-notices';
/** Same notice table and presentation as courses. Never queues LINE delivery. */
export async function recordBeautyStoreNotice(tx:Prisma.TransactionClient,a:BeautyActor,enabled:boolean|undefined,b:Pick<BeautyAppointment,'id'|'personName'|'serviceName'|'technicianId'|'startsAt'>,kind:StoreNoticeItem['kind'],previous?:{startsAt:Date;technicianId:string}){
 if(enabled!==true)return;
 const techs=await tx.beautyTechnician.findMany({where:{storeId:a.storeId,id:{in:[b.technicianId,previous?.technicianId??b.technicianId]}},select:{id:true,name:true}});
 const name=techs.find(t=>t.id===b.technicianId)?.name??'未指派',oldName=previous?techs.find(t=>t.id===previous.technicianId)?.name??'未指派':null;
 // Preserve the original rule: a move needs review; manager-created bookings are history.
 const pending=kind==='MOVE'||(kind!=='BOOKING'&&!a.manager),now=new Date(),id=crypto.randomUUID(),subject='beauty:'+b.id;
 await tx.$executeRaw`INSERT INTO "CourseStoreNotice" (id,"storeId","subjectKey",kind,"customerName","courseName","coachName","previousCoachName","startsAt","previousStartsAt","affectedCount",details,"handledAt","handledById","handledByName",revision,"createdAt","updatedAt") VALUES (${id},${a.storeId},${subject},${kind},${b.personName},${b.serviceName},${name},${oldName},${b.startsAt},${previous?.startsAt??null},1,'{}'::jsonb,${pending?null:now},${pending?null:a.userId},${pending?null:a.name??'系統'},0,${now},${now}) ON CONFLICT ("storeId","subjectKey") DO UPDATE SET kind=EXCLUDED.kind,"customerName"=EXCLUDED."customerName","courseName"=EXCLUDED."courseName","coachName"=EXCLUDED."coachName","previousCoachName"=COALESCE("CourseStoreNotice"."previousCoachName",EXCLUDED."previousCoachName"),"previousStartsAt"=CASE WHEN "CourseStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN COALESCE("CourseStoreNotice"."previousStartsAt",EXCLUDED."previousStartsAt") ELSE EXCLUDED."previousStartsAt" END,"startsAt"=EXCLUDED."startsAt","handledAt"=EXCLUDED."handledAt","handledById"=EXCLUDED."handledById","handledByName"=EXCLUDED."handledByName",revision="CourseStoreNotice".revision+1,"updatedAt"=EXCLUDED."updatedAt"`;
}
