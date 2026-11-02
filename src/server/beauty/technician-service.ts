import 'server-only';
import {z} from 'zod';
import {AppError} from '@/lib/errors';
import type {Prisma} from '../../../generated/beauty-client';
export const technicianServiceState=z.object({technicianId:z.string().min(1),status:z.enum(['SCHEDULED','LEAVE','NO_SHOW']),note:z.string().max(1000),reason:z.string().max(500)});
export type TechnicianServiceState=z.infer<typeof technicianServiceState>;
export async function readTechnicianServices(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,storeId:string,ids:string[]){
 if(!ids.length)return new Map<string,TechnicianServiceState>();
 const rows=await tx.$queryRaw<{appointmentId:string;kind:string;body:string}[]>`SELECT DISTINCT ON ("appointmentId") "appointmentId",kind,body FROM "BeautyEvent" WHERE "storeId"=${storeId} AND kind='TECHNICIAN_SERVICE' AND "appointmentId"=ANY(${ids}::text[]) ORDER BY "appointmentId","createdAt" DESC,id DESC`;
 const states=new Map<string,TechnicianServiceState>();
 for(const row of rows){if(row.kind!=='TECHNICIAN_SERVICE')continue;try{states.set(row.appointmentId,technicianServiceState.parse(JSON.parse(row.body)));}catch{throw new AppError('CONFLICT','技師出勤資料待核對，請聯絡管理員');}}
 return states;
}
export async function assertTechnicianCanComplete(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,storeId:string,booking:{id:string;technicianId:string}){
 const state=(await readTechnicianServices(tx,storeId,[booking.id])).get(booking.id);
 if(state?.technicianId===booking.technicianId&&state.status!=='SCHEDULED')throw new AppError('CONFLICT','技師請假或缺席，請先改派技師或恢復正常服務，再完成服務；目前尚未扣次或計酬。');
}
