"use server";
import {z} from 'zod';
import {requirePermission} from '@/lib/permissions';
import {beautyManager,beautyTransaction,command,audit} from '@/server/beauty/access';
import {technicianServiceState} from '@/server/beauty/technician-service';
import {AppError,handleActionError} from '@/lib/errors';
export async function saveBeautyTechnicianService(input:unknown){
 try{
 const d=technicianServiceState.extend({id:z.string().min(1),revision:z.number().int().nonnegative(),expectedStoreId:z.string().min(1),requestKey:z.string().uuid()}).parse(input);
 const a=await beautyManager('booking.update',true);await requirePermission('staff.manage');if(a.storeId!==d.expectedStoreId)throw new AppError('FORBIDDEN','門市已切換，請重新開啟');
 return await beautyTransaction(a,tx=>command(tx,a,d.requestKey,{operation:'technician-service',...d},async()=>{
  const booking=await tx.beautyAppointment.findFirst({where:{id:d.id,storeId:a.storeId}});
  if(!booking||booking.revision!==d.revision||booking.technicianId!==d.technicianId)throw new AppError('CONFLICT','預約或技師已更新，請重新核對');
  if(booking.status!=='RESERVED')throw new AppError('CONFLICT','只可調整待服務預約的技師備註與出勤');
  if(d.status!=='SCHEDULED'&&!d.reason.trim())throw new AppError('VALIDATION','請填寫技師請假或缺席原因');
  await audit(tx,a,'TECHNICIAN_SERVICE',JSON.stringify({technicianId:d.technicianId,status:d.status,note:d.note,reason:d.reason}),d.id);
  await tx.beautyAppointment.update({where:{id:d.id},data:{revision:{increment:1}}});
  return {success:true as const,data:{id:d.id,revision:d.revision+1,technicianId:d.technicianId,status:d.status,note:d.note,reason:d.reason}};
 }));
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'尚未儲存':r.error};}
}
