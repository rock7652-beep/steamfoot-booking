"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
const inputSchema=z.object({bookingId:z.string().min(1),expectedUpdatedAt:z.string().datetime(),expectedAmount:z.number().int().nonnegative(),paymentMethod:z.enum(["CASH","CARD"])});
export async function completeSpaBooking(input:z.infer<typeof inputSchema>){
 try{
  const user=await requirePermission("transaction.create");
  const storeId=await spaResourceStore("booking.update");
  const installation=await prisma.storeModuleInstallation.findUnique({where:{storeId},select:{status:true}});
  if(installation?.status!=="ACTIVE")throw new AppError("FORBIDDEN","此店尚未完成服務模組設定");
  const d=inputSchema.parse(input);
  const receipt=await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   const booking=await tx.spaBooking.findFirst({where:{id:d.bookingId,storeId}});
   if(!booking)throw new AppError("NOT_FOUND","找不到本店預約");
   const existing=await tx.spaReceipt.findUnique({where:{bookingId_storeId:{storeId,bookingId:d.bookingId}}});
   if(existing){
    if(booking.status!=="COMPLETED"||Number(existing.amount)!==d.expectedAmount||existing.paymentMethod!==d.paymentMethod)throw new AppError("CONFLICT","此預約已有收款紀錄，請重新開啟核對");
    return existing;
   }
   if(!["PENDING","CONFIRMED"].includes(booking.status))throw new AppError("CONFLICT","此預約已完成或取消，無法再次結帳");
   if(booking.updatedAt.toISOString()!==d.expectedUpdatedAt||Number(booking.totalPriceSnapshot)!==d.expectedAmount)throw new AppError("CONFLICT","預約內容或金額已變更，請重新開啟結帳");
   const created=await tx.spaReceipt.create({data:{storeId,bookingId:booking.id,amount:booking.totalPriceSnapshot,paymentMethod:d.paymentMethod,recordedByUserId:user.id}});
   await tx.spaBooking.update({where:{id_storeId:{id:booking.id,storeId}},data:{status:"COMPLETED"}});
   return created;
  },{timeout:15000});
  revalidatePath("/dashboard/spa-schedule");revalidatePath("/dashboard/spa-staff");
  return{success:true as const,receiptId:receipt.id};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"結帳失敗":r.error};}
}
