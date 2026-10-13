"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { addTaiwanDuration, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import { findFixedSeriesConflicts } from "@/lib/course-series";
import { rentalInput,rentalOccupation } from "@/lib/course-rental";
import { courseManager,courseManagerRead,courseTransaction } from "@/server/services/course-access";
import { handleCourseActionError } from "@/server/services/course-resources";
import { rentalConflict,rentalCash,rentalAudit } from "@/server/services/course-rental";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
import { hasStoreFeature,getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
function refresh(){for(const path of ["/dashboard/courses","/dashboard","/dashboard/cashbook","/dashboard/cash-drawer"])revalidatePath(path);}
export async function searchRentalCustomers(query:string) {
  const {storeId}=await courseManagerRead("customer.read");
  const value=query.trim().slice(0,50);if(!value)return [];
  const phone=value.replace(/[\s()+-]/g,"");
  return prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,NOT:{user:{is:{status:"SUSPENDED"}}},OR:[{name:{contains:value}},{phone:{contains:phone}}]},select:{id:true,name:true,phone:true},orderBy:{name:"asc"},take:10});
}
export async function createRentalCustomer(input:unknown) {
  try {
    const {storeId,user}=await courseManager("customer.create");
    const data=z.object({name:z.string().trim().min(1).max(80),phone:z.string().trim().min(5).max(30)}).parse(input);
    data.phone=data.phone.replace(/[\s()+-]/g,"");
    if(!/^\d{5,15}$/.test(data.phone))throw new AppError("VALIDATION","請填正確電話");
    const limits=await getStoreLimitsByStoreId(storeId);
    const customer=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const existing=await tx.customer.findFirst({where:{storeId,phone:data.phone,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true}});
      if(existing)return {...existing,existing:true};
      if(limits.maxCustomers!==null && await tx.customer.count({where:{storeId,mergedIntoCustomerId:null}})>=limits.maxCustomers)throw new AppError("FORBIDDEN","已達顧客額度上限");
      const created=await tx.customer.create({data:{storeId,...data},select:{id:true,name:true,phone:true}});
      await tx.auditLog.create({data:{actorUserId:user.id,storeId,module:"COURSE",summary:"租借新增顧客",targetType:"Customer",targetId:created.id,action:"CREATE_RENTAL_CUSTOMER",afterJson:{storeId,...created}}});
      return {...created,existing:false};
    });refresh();return {success:true as const,customer};
  }catch(error){return {success:false as const,error:handleCourseActionError(error).error??"操作失敗"};}
}
export async function saveCourseRental(input:unknown) {
  try {
    const d=rentalInput.extend({payment:z.object({amount:z.number().int().min(0).max(1000000),paymentMethod:z.enum(["CASH","OTHER"])}).optional()}).parse(input);const {storeId,user}=await courseManager(d.id?"booking.update":"booking.create");
    if(d.payment){
      if(d.id)throw new AppError("VALIDATION","已建立租借請使用收款或更正功能");
      await courseManager("cashbook.create");
      if(!await hasStoreFeature(storeId,FEATURES.CASHBOOK))throw new AppError("FORBIDDEN","尚未開通現金帳");
    }
    if(d.customerId)await courseManager("customer.read");
    const start=parseTaipeiDateTime(d.date,d.time);if(!start)throw new AppError("VALIDATION","日期不正確");
    if(d.repeatWeeks>1){
      if(d.id)throw new AppError("VALIDATION","已建立租借請逐堂修改");
      if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"}}))throw new AppError("FORBIDDEN","連續租借僅適用音樂模組");
    }
    const id=await courseTransaction(storeId,async tx=>{
      if(!d.id){
        const prior=await tx.courseRental.findUnique({where:{storeId_requestKey:{storeId,requestKey:d.requestKey}}});
        if(prior){
          const children=await tx.courseRental.count({where:{storeId,requestKey:{startsWith:`${d.requestKey}:`}}});
          if(children+1!==d.repeatWeeks)throw new AppError("CONFLICT","這次租借已送出，安排週數不同，請重新開啟表單");
        }
      }
      const dates=Array.from({length:d.repeatWeeks},(_,index)=>addTaiwanDuration(d.date,index*7,"DAY"));
      if(dates.length>1){
        const room=await tx.courseRoom.findFirst({where:{id:d.roomId,storeId,isActive:true,rentalEnabled:true}});
        if(!room)throw new AppError("VALIDATION","請選擇本店開放租借的空間");
        const issues:string[]=[];
        for(const [index,date] of dates.entries()){
          const key=index?`${d.requestKey}:${index}`:d.requestKey;
          if(await tx.courseRental.findUnique({where:{storeId_requestKey:{storeId,requestKey:key}}}))continue;
          const start=parseTaipeiDateTime(date,d.time)!;
          const end=new Date(start.getTime()+d.durationMinutes*60000);
          const occupied=rentalOccupation(start,end,room.rentalBufferMinutes);
          try{
            await rentalConflict(tx,storeId,room.id,occupied.occupiedStartsAt,occupied.occupiedEndsAt);
            const rules=await tx.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null,startsAt:{lt:occupied.occupiedEndsAt},OR:[{untilDate:null},{untilDate:{gte:new Date(`${date}T00:00:00Z`)}}]}});
            if(findFixedSeriesConflicts(rules,[{startsAt:occupied.occupiedStartsAt,endsAt:occupied.occupiedEndsAt}],{roomId:room.id,coachId:""}).length)throw new AppError("CONFLICT","空間已有固定課");
            await assertCourseSessionsFitHours(tx,storeId,[{startsAt:start,endsAt:end}]);
          }catch(error){issues.push(`${date} · ${handleCourseActionError(error).error??"空間衝突"}`);}
        }
        if(issues.length)throw new AppError("CONFLICT",issues.join("\n"));
      }
      const base=d;
      async function saveDate(date:string,requestKey:string){
      const d={...base,date,requestKey};
      const start=parseTaipeiDateTime(date,d.time)!;
      const end=new Date(start.getTime()+d.durationMinutes*60000);
      const prior=await tx.courseRental.findUnique({where:{storeId_requestKey:{storeId,requestKey:d.requestKey}}});
      if(!d.id&&prior){
        if(prior.roomId!==d.roomId||prior.startsAt.getTime()!==start.getTime()||prior.endsAt.getTime()!==end.getTime()||prior.amount!==d.amount||prior.customerId!==d.customerId||prior.customerName!==d.customerName||prior.customerPhone!==d.customerPhone||prior.note!==d.note)throw new AppError("CONFLICT","這次租借已送出，請重新開啟表單");
        const receipt=await tx.courseRentalPayment.findUnique({where:{storeId_requestKey:{storeId,requestKey:d.requestKey}}});
        if(d.payment? !receipt||receipt.rentalId!==prior.id||receipt.amount!==d.payment.amount||receipt.paymentMethod!==d.payment.paymentMethod : !!receipt)throw new AppError("CONFLICT","這次收款已送出，請重新開啟表單");
        return prior.id;
      }
      const room=await tx.courseRoom.findFirst({where:{id:d.roomId,storeId,isActive:true,rentalEnabled:true}});
      if(!room)throw new AppError("VALIDATION","請選擇本店開放租借的空間");
      const existing=d.id?await tx.courseRental.findFirst({where:{id:d.id,storeId}}):null;
      if(d.id&&(!existing||existing.revision!==d.revision||existing.cancelledAt))throw new AppError("CONFLICT","租借已有變更，請重新開啟；輸入已保留");
      let name=d.customerName,phone=d.customerPhone;
      if(d.customerId){
        const customers=await tx.$queryRaw<{name:string;phone:string}[]>`SELECT name,phone FROM "Customer" WHERE id=${d.customerId} AND "storeId"=${storeId} AND "mergedIntoCustomerId" IS NULL`;
        if(!customers[0])throw new AppError("VALIDATION","找不到本店顧客");
        name=customers[0].name;phone=customers[0].phone;
      }
      const occupied=rentalOccupation(start,end,room.rentalBufferMinutes);
      await rentalConflict(tx,storeId,room.id,occupied.occupiedStartsAt,occupied.occupiedEndsAt,d.id);
      const fixedRules=await tx.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null,startsAt:{lt:occupied.occupiedEndsAt},OR:[{untilDate:null},{untilDate:{gte:new Date(`${toLocalDateStr(occupied.occupiedStartsAt)}T00:00:00.000Z`)}}]}});
      const fixedConflict=findFixedSeriesConflicts(fixedRules,[{startsAt:occupied.occupiedStartsAt,endsAt:occupied.occupiedEndsAt}],{roomId:room.id,coachId:""})[0];
      if(fixedConflict)throw new AppError("CONFLICT",`${fixedConflict.date} · 空間已有固定課`);
      await assertCourseSessionsFitHours(tx,storeId,[{startsAt:start,endsAt:end}]);
      const fields={roomId:room.id,customerId:d.customerId,customerName:name,customerPhone:phone,startsAt:start,endsAt:end,...occupied,hourlyRateSnapshot:existing && existing.roomId===room.id && existing.startsAt.getTime()===start.getTime() && existing.endsAt.getTime()===end.getTime()?existing.hourlyRateSnapshot:room.rentalHourlyRate,amount:d.amount,note:d.note};
      const record=d.id?await tx.courseRental.update({where:{id:d.id,storeId},data:{...fields,revision:{increment:1}}}):await tx.courseRental.create({data:{...fields,storeId,requestKey:d.requestKey,createdById:user.id}});
      await rentalAudit(tx,storeId,user.id,record.id,d.id?"UPDATE_RENTAL":"CREATE_RENTAL",existing,record);
      if(d.payment){
        const payment=await tx.courseRentalPayment.create({data:{storeId,rentalId:record.id,amount:d.payment.amount,paymentMethod:d.payment.paymentMethod,requestKey:d.requestKey,actorUserId:user.id,note:"收款請求"}});
        await rentalCash(tx,{storeId,userId:user.id,staffId:user.staffId},payment,record.customerId,`空間租借／${record.customerName}／${d.date}／${record.id}`);
        await tx.courseRental.update({where:{id:record.id,storeId},data:{revision:{increment:1}}});
        await rentalAudit(tx,storeId,user.id,record.id,"COLLECT_RENTAL_PAYMENT",null,{payment,automaticBankRefund:false});
      }
      return record.id;
      }
      const ids:string[]=[];
      for(const [index,date] of dates.entries())ids.push(await saveDate(date,index?`${base.requestKey}:${index}`:base.requestKey));
      return ids[0];
    });refresh();return {success:true as const,id};
  }catch(error){return {success:false as const,error:handleCourseActionError(error).error??"操作失敗"};}
}
export async function getCourseRental(id:string) {
  const {storeId}=await courseManagerRead("booking.read");
  const r=await coursePrisma.courseRental.findFirst({where:{id,storeId},include:{payments:{where:{status:"SUCCESS"},take:1}}});
  if(!r)throw new AppError("NOT_FOUND","找不到租借");
  return {...r,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),cancelledAt:r.cancelledAt?.toISOString()??null,payment:r.payments[0]?{id:r.payments[0].id,amount:r.payments[0].amount,paymentMethod:r.payments[0].paymentMethod}:null};
}
export async function cancelCourseRental(input:unknown) {
  try {
    const {storeId,user}=await courseManager("booking.update");
    const d=z.object({id:z.string().min(1),revision:z.number().int()}).parse(input);
    await courseTransaction(storeId,async tx=>{
      const r=await tx.courseRental.findFirst({where:{id:d.id,storeId}});if(!r)throw new AppError("NOT_FOUND","找不到租借");
      if(r.cancelledAt)return;if(r.revision!==d.revision)throw new AppError("CONFLICT","紀錄已更新，請重新開啟");
      await tx.courseRental.update({where:{id:r.id,storeId},data:{cancelledAt:new Date(),revision:{increment:1}}});
      await rentalAudit(tx,storeId,user.id,r.id,"CANCEL_RENTAL",r,{cancelled:true,paymentUnchanged:true});
    });refresh();return {success:true as const};
  }catch(error){return {success:false as const,error:handleCourseActionError(error).error??"操作失敗"};}
}
export async function saveRentalPayment(input:unknown) {
  try {
    const d=z.object({rentalId:z.string().min(1),revision:z.number().int(),requestKey:z.string().uuid(),originalId:z.string().nullable().default(null),voidOnly:z.boolean().default(false),amount:z.number().int().min(0).max(1000000),paymentMethod:z.enum(["CASH","OTHER"]),reason:z.string().trim().max(500).default("")}).parse(input);
    const {storeId,user}=await courseManager("cashbook.create");
    if(d.originalId)await courseManager("transaction.void");
    if(!await hasStoreFeature(storeId,FEATURES.CASHBOOK))throw new AppError("FORBIDDEN","尚未開通現金帳");
    const result=await courseTransaction(storeId,async tx=>{
      const prior=await tx.courseRentalPayment.findUnique({where:{storeId_requestKey:{storeId,requestKey:d.requestKey}}});
      if(prior){if(prior.rentalId!==d.rentalId||prior.amount!==d.amount||prior.paymentMethod!==d.paymentMethod||prior.note!==(d.voidOnly?"作廢請求":d.originalId?"更正請求":"收款請求"))throw new AppError("CONFLICT","收款請求已使用");return prior.id;}
      const r=await tx.courseRental.findFirst({where:{id:d.rentalId,storeId},include:{payments:{where:{status:"SUCCESS"}}}});
      if(!r||r.revision!==d.revision)throw new AppError("CONFLICT","租借已更新，請重新開啟");
      const current=r.payments[0];
      if(r.cancelledAt&&!d.voidOnly)throw new AppError("VALIDATION","已取消租借僅可作廢原收款");
      const actor={storeId,userId:user.id,staffId:user.staffId};
      if(current){
        if(d.originalId!==current.id||!d.reason)throw new AppError("CONFLICT","請核對原收款並填更正原因");
        await tx.courseRentalPayment.update({where:{id:current.id},data:{status:"VOIDED",voidedAt:new Date(),voidReason:d.reason}});
        await rentalCash(tx,actor,current,r.customerId,`租借收款${d.voidOnly?"作廢":"更正沖銷"}／${r.customerName}／${r.id}／${d.reason}`,true);
      }else if(d.originalId||d.voidOnly)throw new AppError("CONFLICT","原收款已更正，請重新開啟");
      const p=await tx.courseRentalPayment.create({data:{storeId,rentalId:r.id,amount:d.amount,paymentMethod:d.paymentMethod,requestKey:d.requestKey,actorUserId:user.id,note:d.voidOnly?"作廢請求":d.originalId?"更正請求":"收款請求",...(d.voidOnly?{status:"VOIDED",voidedAt:new Date(),voidReason:d.reason}:{})}});
      if(!d.voidOnly)await rentalCash(tx,actor,p,r.customerId,`空間租借／${r.customerName}／${r.startsAt.toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"})}／${r.id}`);
      await tx.courseRental.update({where:{id:r.id},data:{revision:{increment:1}}});
      await rentalAudit(tx,storeId,user.id,r.id,d.voidOnly?"VOID_RENTAL_PAYMENT":"COLLECT_RENTAL_PAYMENT",current,{payment:p,automaticBankRefund:false});return p.id;
    });refresh();return {success:true as const,id:result};
  }catch(error){return {success:false as const,error:handleCourseActionError(error).error??"操作失敗"};}
}

export async function listRoomRentals(roomId:string,page=1) {
  const {storeId}=await courseManagerRead("booking.read");
  const current=Number.isInteger(page)&&page>0?page:1;
  const rows=await coursePrisma.courseRental.findMany({where:{storeId,roomId},orderBy:{startsAt:"desc"},skip:(current-1)*10,take:11,select:{id:true,customerName:true,startsAt:true,endsAt:true,cancelledAt:true,payments:{where:{status:"SUCCESS"},take:1,select:{amount:true}}}});
  return {hasMore:rows.length>10,rows:rows.slice(0,10).map(r=>({id:r.id,name:r.customerName,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),cancelled:!!r.cancelledAt,paid:r.payments[0]?.amount??null}))};
}
