"use server";
import {z} from 'zod';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyMember,beautyWorker} from '@/server/beauty/access';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
import {monthRange,toLocalMonthStr} from '@/lib/date-utils';
import {publicReceipt} from '@/server/beauty/booking';
async function read<T>(run:()=>Promise<T>){try{return {success:true as const,data:await run()};}catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?'讀取失敗':r.error};}}
async function actor(work:boolean){const a=work?await beautyWorker():await beautyMember();await requireStoreFeature(a.storeId,FEATURES.MEMBER_PORTAL);return a;}
export async function readBeautyCardHistory(cardId:string){return read(async()=>{
 const a=await actor(false);z.string().min(1).max(100).parse(cardId);
 const card=await beautyPrisma.beautyCard.findFirst({where:{id:cardId,storeId:a.storeId,memberIds:{has:a.customerId!}},select:{id:true}});
 if(!card)throw new AppError('FORBIDDEN','無法查看此方案');
 const rows=await beautyPrisma.beautyLedger.findMany({where:{storeId:a.storeId,cardId:card.id},select:{id:true,kind:true,delta:true,createdAt:true},orderBy:{createdAt:'desc'},take:100});
 return rows.map(l=>({...l,createdAt:l.createdAt.toISOString()}));
});}
export async function readBeautyOwnIncome(month=toLocalMonthStr()){return read(async()=>{
 const a=await actor(true);z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).parse(month);
 if(!a.grants?.includes('income'))throw new AppError('FORBIDDEN','本人收入尚未開放，請洽店長。');
 const versions=await beautyPrisma.beautySettlement.findMany({where:{storeId:a.storeId,month},orderBy:{createdAt:'desc'},take:1});
 return {confirmed:versions.length>0,lines:versions.flatMap(s=>(s.lines as Array<{id:string;technicianId:string;serviceName:string;date:string;fee:number}>).filter(l=>l.technicianId===a.technicianId).map(l=>({id:l.id,serviceName:l.serviceName,date:l.date,fee:l.fee})))};
});}
export async function readBeautyWorkRecords(input:unknown){return read(async()=>{
 const a=await actor(true),d=z.object({month:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),pending:z.boolean(),search:z.string().max(100),page:z.number().int().min(0).max(10000)}).parse(input),range=monthRange(d.month),now=new Date();
 const rows=await beautyPrisma.beautyAppointment.findMany({where:{storeId:a.storeId,technicianId:a.technicianId,startsAt:{gte:range.start,lte:range.end},...(d.pending?{status:'RESERVED',endsAt:{lt:now}}:{OR:[{status:{not:'RESERVED'}},{endsAt:{lt:now}}]}),...(d.search.trim()?{personName:{contains:d.search.trim(),mode:'insensitive' as const}}:{})},orderBy:[{startsAt:d.pending?'asc':'desc'},{id:'asc'}],skip:d.page*50,take:51});
 return {hasMore:rows.length>50,items:rows.slice(0,50).map(b=>({...publicReceipt(b),customerId:b.customerId,revision:b.revision,groupId:b.groupId,technicianId:b.technicianId,locationId:b.locationId,cardId:b.cardId,notes:b.notes}))};
});}
