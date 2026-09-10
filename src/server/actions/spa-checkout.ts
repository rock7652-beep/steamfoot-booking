"use server";
import type {Prisma} from "../../../generated/spa-client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
import { assertNoPriorSpaSettlement, deductSpaCredit, readSpaCreditOptions } from "../spa-checkout-credit";
const inputSchema=z.object({bookingId:z.string().min(1),expectedUpdatedAt:z.string().datetime(),expectedAmount:z.number().int().nonnegative(),paymentMethod:z.enum(["CASH","CARD","STORED_VALUE","ENTITLEMENT"]),sourceId:z.string().min(1).optional()}).superRefine((d,ctx)=>{
 const credit=d.paymentMethod==="STORED_VALUE"||d.paymentMethod==="ENTITLEMENT";
 if(credit!==Boolean(d.sourceId))ctx.addIssue({code:"custom",message:"請選擇有效的付款來源"});
});
export async function getSpaCheckoutOptions(bookingId:string){
 try{
  await requirePermission("transaction.create");
  const storeId=await spaResourceStore("booking.update");
  const booking=await spaPrisma.spaBooking.findFirst({where:{id:z.string().min(1).parse(bookingId),storeId}});
  if(!booking)throw new AppError("NOT_FOUND","找不到本店預約");
  const options=await readSpaCreditOptions(spaPrisma,booking);
  const members=booking.partyGroupId?await spaPrisma.spaBooking.findMany({where:{storeId,partyGroupId:booking.partyGroupId},orderBy:{guestIndex:"asc"}}):[];
  return{success:true as const,...options,groupMembers:members.map(b=>({id:b.id,guestIndex:b.guestIndex,status:b.status,serviceName:b.serviceNameSnapshot,totalPrice:Number(b.totalPriceSnapshot),updatedAt:b.updatedAt.toISOString(),bookingDate:b.bookingDate.toISOString().slice(0,10),startTime:b.startTime}))};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"讀取失敗":r.error};}
}
export async function completeSpaBooking(input:z.infer<typeof inputSchema>){
 try{
  const user=await requirePermission("transaction.create");
  const storeId=await spaResourceStore("booking.update");
  const installation=await prisma.storeModuleInstallation.findUnique({where:{storeId},select:{status:true}});
  if(installation?.status!=="ACTIVE")throw new AppError("FORBIDDEN","此店尚未完成服務模組設定");
  const d=inputSchema.parse(input);
  const receipt=await spaPrisma.$transaction(async tx=>{
   return settleSpaBooking(tx,storeId,user.id,d);
  },{timeout:15000});
  revalidatePath("/dashboard/spa-schedule");revalidatePath("/dashboard/spa-staff");
  return{success:true as const,receiptId:receipt.id};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"結帳失敗":r.error};}
}

async function settleSpaBooking(tx:Prisma.TransactionClient,storeId:string,userId:string,d:z.infer<typeof inputSchema>){
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   const booking=await tx.spaBooking.findFirst({where:{id:d.bookingId,storeId}});
   if(!booking)throw new AppError("NOT_FOUND","找不到本店預約");
   const existing=await tx.spaReceipt.findUnique({where:{bookingId_storeId:{storeId,bookingId:d.bookingId}}});
   if(existing){
    if(booking.status!=="COMPLETED"||Number(existing.amount)!==d.expectedAmount||existing.paymentMethod!==d.paymentMethod||(existing.sourceId??undefined)!==d.sourceId)throw new AppError("CONFLICT","此預約已有收款紀錄，請重新開啟核對");
    return existing;
   }
   if(!["PENDING","CONFIRMED"].includes(booking.status))throw new AppError("CONFLICT","此預約已完成或取消，無法再次結帳");
   if(booking.updatedAt.toISOString()!==d.expectedUpdatedAt||Number(booking.totalPriceSnapshot)!==d.expectedAmount)throw new AppError("CONFLICT","預約內容或金額已變更，請重新開啟結帳");
   await assertNoPriorSpaSettlement(tx,booking);
   const credit=d.paymentMethod==="STORED_VALUE"||d.paymentMethod==="ENTITLEMENT"
     ?{sourceId:d.sourceId!,...await deductSpaCredit(tx,booking,d.paymentMethod,d.sourceId!,Number(booking.totalPriceSnapshot))}:{};
   const created=await tx.spaReceipt.create({data:{storeId,bookingId:booking.id,amount:booking.totalPriceSnapshot,paymentMethod:d.paymentMethod,recordedByUserId:userId,...credit}});
   await tx.spaBooking.update({where:{id_storeId:{id:booking.id,storeId}},data:{status:"COMPLETED"}});
   return created;

}

const groupCheckoutSchema=z.object({groupId:z.string().min(1),bookings:z.array(inputSchema).min(1).max(3)}).refine(d=>new Set(d.bookings.map(b=>b.bookingId)).size===d.bookings.length,"預約不可重複").refine(d=>d.bookings.every(b=>b.paymentMethod===d.bookings[0].paymentMethod&&['CASH','CARD'].includes(b.paymentMethod)),"整組付款請選同一種現金或刷卡方式");
export async function completeSpaBookingGroup(input:z.infer<typeof groupCheckoutSchema>){try{
 const user=await requirePermission("transaction.create"),storeId=await spaResourceStore("booking.update"),d=groupCheckoutSchema.parse(input);
 if((await prisma.storeModuleInstallation.findUnique({where:{storeId},select:{status:true}}))?.status!=="ACTIVE")throw new AppError("FORBIDDEN","此店尚未完成設定");
 const ids=await spaPrisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`},0))`;
  const group=await tx.spaBookingGroup.findFirst({where:{id:d.groupId,storeId}});
  if(!group)throw new AppError("NOT_FOUND","找不到本店同行預約組別");
  const members=await tx.spaBooking.findMany({where:{storeId,partyGroupId:group.id}});
  if(d.bookings.some(b=>!members.some(m=>m.id===b.bookingId&&m.customerId===group.customerId))||members.some(m=>['PENDING','CONFIRMED'].includes(m.status)&&!d.bookings.some(b=>b.bookingId===m.id)))throw new AppError("CONFLICT","同行預約內容已變更，請重新開啟整組結帳");
  const receipts=[];for(const b of d.bookings)receipts.push((await settleSpaBooking(tx,storeId,user.id,b)).id);
  return receipts;
 },{timeout:25000});revalidatePath("/dashboard/spa-schedule");revalidatePath("/dashboard/customers");return{success:true as const,receiptIds:ids};
}catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"整組結帳失敗":r.error};}}
