"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requirePermission } from "@/lib/permissions";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import type { Prisma } from "../../../generated/spa-client";

function failed(e:unknown){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
async function activeStore(permission:"wallet.create"|"transaction.create"|"transaction.refund"|"customer.read"){
 const storeId=await spaResourceStore(permission);
 if((await prisma.storeModuleInstallation.findUnique({where:{storeId},select:{status:true}}))?.status!=="ACTIVE")throw new AppError("FORBIDDEN","此店尚未啟用服務模組");
 return storeId;
}
const packageSchema=z.object({id:z.string().optional(),treatmentId:z.string().min(1),name:z.string().trim().min(1).max(80),price:z.number().int().min(0).max(9999999),uses:z.number().int().min(1).max(999),validityDays:z.number().int().min(1).max(3650),isActive:z.boolean()});
export async function saveSpaPackage(input:z.infer<typeof packageSchema>){try{
 const storeId=await activeStore("wallet.create"),d=packageSchema.parse(input);
 await spaPrisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`},0))`;
  if(!await tx.spaTreatment.findFirst({where:{id:d.treatmentId,storeId,isActive:true}}))throw new AppError("VALIDATION","請選擇本店啟用的服務");
  if(d.id){if(!await tx.spaPackage.findFirst({where:{id:d.id,storeId}}))throw new AppError("NOT_FOUND","找不到方案");await tx.spaPackage.update({where:{id:d.id},data:d});}
  else await tx.spaPackage.create({data:{...d,storeId}});
 });revalidatePath("/dashboard/plans");return{success:true as const};
}catch(e){return failed(e);}}

export async function getSpaCustomerAccount(customerId:string){try{
 await requirePermission("wallet.read");await requirePermission("transaction.read");
 const storeId=await activeStore("customer.read");
 const customer=await prisma.customer.findFirst({where:{id:customerId,storeId},select:{id:true,name:true,phone:true}});
 if(!customer)throw new AppError("NOT_FOUND","找不到本店顧客");
 const [packages,wallets,entitlements,sales,receipts,refunds,entries]=await Promise.all([
  spaPrisma.spaPackage.findMany({where:{storeId,isActive:true},orderBy:{name:"asc"}}),
  spaPrisma.$queryRaw<{id:string;balance:Prisma.Decimal;status:string}[]>`SELECT id,balance,status FROM "SpaStoredValueWallet" WHERE "storeId"=${storeId} AND "customerId"=${customerId}`,
  spaPrisma.$queryRaw<{id:string;name:string;remaining:number;total:number;reserved:number;status:string;expiryDate:Date|null}[]>`SELECT e.id,e."nameSnapshot" AS name,e."remainingUses" AS remaining,e."totalUses" AS total,e.status::text,e."expiryDate",COALESCE((SELECT SUM(u.uses)::int FROM "SpaEntitlementUse" u WHERE u."entitlementId"=e.id AND u."storeId"=e."storeId" AND u.status='RESERVED'),0) AS reserved FROM "SpaEntitlement" e WHERE e."storeId"=${storeId} AND e."customerId"=${customerId} ORDER BY e."createdAt" DESC`,
  spaPrisma.spaCreditSale.findMany({where:{storeId,customerId},orderBy:{createdAt:"desc"},take:100}),
  spaPrisma.spaReceipt.findMany({where:{storeId,booking:{customerId}},include:{booking:{select:{serviceNameSnapshot:true}}},orderBy:{paidAt:"desc"},take:100}),
  spaPrisma.spaRefund.findMany({where:{storeId,customerId},orderBy:{createdAt:"desc"}}),
  spaPrisma.$queryRaw<{id:string;entryType:string;amount:Prisma.Decimal;balanceAfter:Prisma.Decimal;createdAt:Date}[]>`SELECT id,"entryType"::text,amount,"balanceAfter","createdAt" FROM "SpaStoredValueEntry" WHERE "storeId"=${storeId} AND "customerId"=${customerId} ORDER BY "createdAt" DESC LIMIT 100`,
 ]);
 return{success:true as const,customer,packages:packages.map(p=>({...p,price:Number(p.price),updatedAt:p.updatedAt.toISOString()})),wallet:wallets[0]?{...wallets[0],balance:Number(wallets[0].balance)}:null,
 entitlements:entitlements.map(e=>({...e,expiryDate:e.expiryDate?.toISOString().slice(0,10)??null})),
 sales:sales.map(s=>({...s,amount:Number(s.amount),createdAt:s.createdAt.toISOString(),refunded:refunds.some(r=>r.saleId===s.id)})),
 receipts:receipts.map(r=>({id:r.id,name:r.booking.serviceNameSnapshot,amount:Number(r.amount),paymentMethod:r.paymentMethod,uses:r.uses,createdAt:r.paidAt.toISOString(),refunded:refunds.some(f=>f.receiptId===r.id)})),
 refunds:refunds.map(r=>({...r,amount:Number(r.amount),createdAt:r.createdAt.toISOString()})),
 entries:entries.map(e=>({...e,amount:Number(e.amount),balanceAfter:Number(e.balanceAfter),createdAt:e.createdAt.toISOString()}))};
}catch(e){return failed(e);}}

const saleSchema=z.object({customerId:z.string().min(1),kind:z.enum(["PACKAGE","TOPUP"]),packageId:z.string().optional(),expectedPackageUpdatedAt:z.string().datetime().optional(),amount:z.number().int().min(0).max(9999999),paymentMethod:z.enum(["CASH","CARD"]),requestKey:z.string().uuid()});
export async function purchaseSpaCredit(input:z.infer<typeof saleSchema>){try{
 const user=await requirePermission("transaction.create"),storeId=await activeStore("wallet.create"),d=saleSchema.parse(input);
 const fingerprint=JSON.stringify(d);
 const sale=await spaPrisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`},0))`;
  const previous=await tx.spaCreditSale.findUnique({where:{storeId_requestKey:{storeId,requestKey:d.requestKey}}});
  if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("CONFLICT","這筆送出內容已變更，請重新開啟");return previous;}
  if(!await prisma.customer.findFirst({where:{id:d.customerId,storeId},select:{id:true}}))throw new AppError("NOT_FOUND","找不到本店顧客");
  const saleId=randomUUID();let sourceId:string;let name:string;
  if(d.kind==="PACKAGE"){
   const p=await tx.spaPackage.findFirst({where:{id:d.packageId??"",storeId,isActive:true}});
   if(!p||p.updatedAt.toISOString()!==d.expectedPackageUpdatedAt||Number(p.price)!==d.amount)throw new AppError("CONFLICT","方案內容或價格已變更，請重新選擇");
   if(!await tx.spaTreatment.findFirst({where:{id:p.treatmentId,storeId,isActive:true}}))throw new AppError("CONFLICT","方案服務已停用");
   sourceId=randomUUID();name=p.name;
   const start=parseTaiwanDateToDbDate(toLocalDateStr()),expiry=new Date(start);expiry.setUTCDate(expiry.getUTCDate()+p.validityDays-1);
   await tx.$executeRaw`INSERT INTO "SpaEntitlement" (id,"storeId","customerId","treatmentId","nameSnapshot","purchasedPrice","totalUses","remainingUses","startDate","expiryDate",status,"sourceReference","updatedAt") VALUES(${sourceId},${storeId},${d.customerId},${p.treatmentId},${p.name},${p.price},${p.uses},${p.uses},${start},${expiry},'ACTIVE',${saleId},CURRENT_TIMESTAMP)`;
  }else{
   if(d.amount<=0)throw new AppError("VALIDATION","儲值金額必須大於零");
   name="儲值加值";
   const wallets=await tx.$queryRaw<{id:string;balance:Prisma.Decimal}[]>`INSERT INTO "SpaStoredValueWallet" (id,"storeId","customerId",balance,"updatedAt") VALUES(${randomUUID()},${storeId},${d.customerId},${d.amount},CURRENT_TIMESTAMP) ON CONFLICT ("storeId","customerId") DO UPDATE SET balance="SpaStoredValueWallet".balance+EXCLUDED.balance,"updatedAt"=CURRENT_TIMESTAMP WHERE "SpaStoredValueWallet".status='ACTIVE' RETURNING id,balance`;
   if(!wallets[0])throw new AppError("CONFLICT","儲值帳戶已停用");sourceId=wallets[0].id;
   await tx.$executeRaw`INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","entryType",amount,"balanceAfter",note) VALUES(${saleId},${sourceId},${storeId},${d.customerId},'CREDIT',${d.amount},${wallets[0].balance},'儲值加值')`;
  }
  return tx.spaCreditSale.create({data:{id:saleId,storeId,customerId:d.customerId,requestKey:d.requestKey,fingerprint,kind:d.kind,name,amount:d.amount,paymentMethod:d.paymentMethod,sourceId,recordedByUserId:user.id}});
 },{timeout:15000});revalidatePath("/dashboard/customers");return{success:true as const,saleId:sale.id};
}catch(e){return failed(e);}}

const refundSchema=z.object({kind:z.enum(["SALE","RECEIPT"]),id:z.string().min(1),reason:z.string().trim().min(1,"請填退款原因").max(300)});
export async function refundSpaPayment(input:z.infer<typeof refundSchema>){try{
 const user=await requirePermission("transaction.refund"),storeId=await activeStore("transaction.refund"),d=refundSchema.parse(input);
 const refund=await spaPrisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`},0))`;
  const previous=await tx.spaRefund.findFirst({where:{storeId,...(d.kind==="SALE"?{saleId:d.id}:{receiptId:d.id})}});
  if(previous)return previous;
  const id=randomUUID();let customerId:string,amount:Prisma.Decimal,paymentMethod:string,uses:number|null=null;
  if(d.kind==="SALE"){
   const sale=await tx.spaCreditSale.findFirst({where:{id:d.id,storeId}});
   if(!sale)throw new AppError("NOT_FOUND","找不到本店收款紀錄");
   customerId=sale.customerId;amount=sale.amount;paymentMethod=sale.paymentMethod;
   if(sale.kind==="PACKAGE"){
    const rows=await tx.$queryRaw<{id:string}[]>`UPDATE "SpaEntitlement" e SET status='VOIDED',"updatedAt"=CURRENT_TIMESTAMP WHERE e.id=${sale.sourceId} AND e."storeId"=${storeId} AND e."customerId"=${customerId} AND e."sourceReference"=${sale.id} AND e.status<>'VOIDED' AND e."remainingUses"=e."totalUses" AND NOT EXISTS(SELECT 1 FROM "SpaEntitlementUse" u WHERE u."entitlementId"=e.id AND u."storeId"=e."storeId" AND u.status IN ('RESERVED','COMPLETED')) RETURNING e.id`;
    if(!rows[0])throw new AppError("CONFLICT","此方案已有使用或保留堂數，不能全額退購；請先核對相關預約");
   }else{
    const rows=await tx.$queryRaw<{balance:Prisma.Decimal}[]>`UPDATE "SpaStoredValueWallet" SET balance=balance-${amount},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${sale.sourceId} AND "storeId"=${storeId} AND "customerId"=${customerId} AND balance>=${amount} RETURNING balance`;
    if(!rows[0])throw new AppError("CONFLICT","目前儲值餘額不足以退回這筆加值");
    await tx.$executeRaw`INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","entryType",amount,"balanceAfter",note) VALUES(${id},${sale.sourceId},${storeId},${customerId},'VOID',${-Number(amount)},${rows[0].balance},${`加值退款：${d.reason}`})`;
   }
  }else{
   const receipt=await tx.spaReceipt.findFirst({where:{id:d.id,storeId},include:{booking:true}});
   if(!receipt)throw new AppError("NOT_FOUND","找不到本店結帳紀錄");
   customerId=receipt.booking.customerId;amount=receipt.amount;paymentMethod=receipt.paymentMethod;uses=receipt.uses;
   if(paymentMethod==="STORED_VALUE"){
    const rows=await tx.$queryRaw<{balance:Prisma.Decimal}[]>`UPDATE "SpaStoredValueWallet" w SET balance=balance+${amount},"updatedAt"=CURRENT_TIMESTAMP WHERE w.id=${receipt.sourceId} AND w."storeId"=${storeId} AND w."customerId"=${customerId} AND EXISTS(SELECT 1 FROM "SpaStoredValueEntry" e WHERE e."walletId"=w.id AND e."storeId"=${storeId} AND e."bookingId"=${receipt.bookingId} AND e."entryType"='DEBIT' AND e.amount=${-Number(amount)}) RETURNING balance`;
    if(!rows[0])throw new AppError("CONFLICT","原儲值扣款紀錄不一致，尚未退款");
    await tx.$executeRaw`INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","bookingId","entryType",amount,"balanceAfter",note) VALUES(${id},${receipt.sourceId},${storeId},${customerId},${receipt.bookingId},'REFUND',${amount},${rows[0].balance},${d.reason})`;
   }else if(paymentMethod==="ENTITLEMENT"){
    const usage=await tx.$queryRaw<{id:string;uses:number}[]>`UPDATE "SpaEntitlementUse" SET status='RELEASED',"releasedAt"=CURRENT_TIMESTAMP WHERE "entitlementId"=${receipt.sourceId} AND "storeId"=${storeId} AND "bookingId"=${receipt.bookingId} AND status='COMPLETED' AND uses=${uses} RETURNING id,uses`;
    if(!usage[0])throw new AppError("CONFLICT","原方案扣次紀錄不一致，尚未退回");
    const today=toLocalDateStr();
    const restored=await tx.$queryRaw<{id:string}[]>`UPDATE "SpaEntitlement" SET "remainingUses"="remainingUses"+${usage[0].uses},status=CASE WHEN "expiryDate"<${today}::date THEN 'EXPIRED'::"SpaEntitlementStatus" ELSE 'ACTIVE'::"SpaEntitlementStatus" END,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${receipt.sourceId} AND "storeId"=${storeId} AND "customerId"=${customerId} AND status<>'VOIDED' AND "remainingUses"+${usage[0].uses}<= "totalUses" RETURNING id`;
    if(!restored[0])throw new AppError("CONFLICT","原方案已作廢或堂數不一致，尚未退回");
   }
  }
  return tx.spaRefund.create({data:{id,storeId,customerId,...(d.kind==="SALE"?{saleId:d.id}:{receiptId:d.id}),amount,paymentMethod,uses,reason:d.reason,recordedByUserId:user.id}});
 },{timeout:15000});revalidatePath("/dashboard/customers");revalidatePath("/dashboard/spa-schedule");return{success:true as const,refundId:refund.id};
}catch(e){return failed(e);}}
