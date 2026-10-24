"use server";
import {beautyRosterContext,beautyRosterWhere,beautyRosterVersion,loadBeautyRoster} from '@/server/beauty/roster-read';
import {traceBeautyRead,beautyReadStep} from '@/server/beauty/read-timing';
import {z} from 'zod';
import {changeBeautyAttendance,changeBeautyStatus} from './beauty';
import {beautyCalendar} from '@/server/beauty/queries';
import {attendanceInput} from '@/lib/beauty/contracts';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {beautyPrisma} from '@/lib/beauty-db';
import {dayRange,parseTaipeiDateTime} from '@/lib/date-utils';
import {AppError,handleActionError} from '@/lib/errors';

/** Retained action port for mutations and older consumers; GET readers use the same guarded core. */
export async function readBeautyNativeRoster(input:string){
 try{const ctx=await beautyRosterContext(),where=await beautyRosterWhere(ctx,input),version=await beautyRosterVersion(ctx,where);return await loadBeautyRoster(ctx,where,version);}
 catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'讀取失敗':failure.error};}
}

export async function saveBeautyNativeRosterNote(input:unknown){
 try{
  const d=z.object({sessionId:z.string().min(1).max(200),bookingId:z.string().min(1).max(180),note:z.string().trim().max(1000),expectedNote:z.string().max(1000)}).parse(input);
  const a=await beautyManager('booking.update',true);await beautyManager('customer.read');
  return await beautyTransaction(a,async tx=>{
   const current=await tx.beautyAppointment.findFirst({where:{id:d.bookingId,storeId:a.storeId,status:{not:'CANCELLED'}}});
   if(!current)throw new AppError('NOT_FOUND','找不到本店可修改的預約');
   if(d.sessionId.startsWith('booking:')){const anchor=await tx.beautyAppointment.findFirst({where:{id:d.sessionId.slice(8),storeId:a.storeId},select:{groupId:true}});if(anchor?.groupId!==current.groupId)throw new AppError('FORBIDDEN','此預約不在目前名單');}
   else if(d.sessionId.startsWith('day:')){const date=d.sessionId.slice(4);if(!parseTaipeiDateTime(date,'00:00'))throw new AppError('VALIDATION','日期格式不正確');const range=dayRange(date);if(current.startsAt<range.start||current.startsAt>range.end)throw new AppError('CONFLICT','預約日期已更新，請重新開啟');}
   else throw new AppError('VALIDATION','請從班表開啟預約清單');
   if(current.notes===d.note)return {success:true as const,revision:current.revision};
   if(current.notes!==d.expectedNote)return {success:false as const,error:'本次備註已被更新，請確認最新內容後再儲存',currentValue:current.notes};
   await tx.beautyAppointment.update({where:{id:current.id},data:{notes:d.note,revision:{increment:1}}});
   await audit(tx,a,'BOOKING_NOTE',JSON.stringify({before:current.notes,after:d.note}),current.id);
   return {success:true as const,revision:current.revision+1};
  });
 }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'儲存失敗':failure.error};}
}

/** Refresh only the open roster and affected business day, never the dashboard catalogs. */
export async function readBeautyRosterOperation(input:unknown){
 try{
  const d=z.object({sessionId:z.string().min(1).max(200),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/)}).parse(input);
  const [roster,calendar]=await Promise.all([readBeautyNativeRoster(d.sessionId),beautyCalendar(d.date,'day')]);
  if(!roster.success)return roster;
  return {success:true as const,data:{roster:roster.data,calendar}};
 }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'讀取失敗':failure.error};}
}
export async function updateBeautyRosterAttendance(input:unknown){return (await traceBeautyRead('roster.attendance',()=>updateBeautyRosterAttendanceCore(input))).value;}
async function updateBeautyRosterAttendanceCore(input:unknown){
 const at=performance.now();
 const parsed=z.object({sessionId:z.string().min(1).max(200),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),attendance:attendanceInput}).safeParse(input);
 if(!parsed.success)return {success:false as const,error:'出席資料格式不正確'};
 const d=parsed.data,write=await beautyReadStep('write',()=>changeBeautyAttendance(d.attendance)),written=performance.now();
 if(!write.success)return write;
 const refreshed=await beautyReadStep('synchronize',()=>readBeautyRosterOperation(d));
 return {success:true as const,refresh:refreshed,timing:{writeMs:written-at,readMs:performance.now()-written}};
}
export async function cancelBeautyRosterAppointment(input:unknown){return (await traceBeautyRead('roster.cancel',()=>cancelBeautyRosterAppointmentCore(input))).value;}
async function cancelBeautyRosterAppointmentCore(input:unknown){
 const at=performance.now();
 const parsed=z.object({sessionId:z.string().min(1).max(200),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),id:z.string().min(1),revision:z.number().int(),requestKey:z.string().uuid()}).safeParse(input);
 if(!parsed.success)return {success:false as const,error:'取消資料格式不正確'};
 const d=parsed.data,write=await beautyReadStep('write',()=>changeBeautyStatus('manager',{id:d.id,revision:d.revision,requestKey:d.requestKey,target:'CANCELLED',reason:'後台取消預約'})),written=performance.now();
 if(!write.success)return write;
 const refreshed=await beautyReadStep('synchronize',()=>readBeautyRosterOperation(d));
 return {success:true as const,refresh:refreshed,timing:{writeMs:written-at,readMs:performance.now()-written}};
}

export async function readBeautyMoveResult(id:string){
 try{const a=await beautyManager('booking.read'),row=await beautyPrisma.beautyAppointment.findFirst({where:{id:z.string().min(1).max(180).parse(id),storeId:a.storeId},select:{startsAt:true,endsAt:true,locationId:true,technicianId:true}});if(!row)throw new AppError('NOT_FOUND','找不到本店預約');return {success:true as const,data:{startsAt:row.startsAt.toISOString(),endsAt:row.endsAt.toISOString(),roomId:row.locationId,coachId:row.technicianId}};}
 catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'讀取失敗':failure.error};}
}
