import "server-only";
import {validateCourseTerm,enrollCourseTerm} from "./course-term";
import {courseSaleSnapshot} from "./course-sale-allocation";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { calculateCourseCheckout, COURSE_PAYMENT_LABELS, type CourseCheckoutInput } from "@/lib/course-checkout";

export async function lockCourseCashDay(tx:Prisma.TransactionClient,storeId:string,day:Date) {
  const rows=await tx.$queryRaw<Array<{id:string;status:string}>>`SELECT id,status::text FROM "CashDrawerSession" WHERE "storeId"=${storeId} AND "businessDate"=${day} FOR UPDATE`;
  if(!rows[0] || rows[0].status!=="OPEN") throw new AppError("BUSINESS_RULE","現金收支需先開啟該日現金抽屜；已結帳請依既有流程處理。");
  await tx.$executeRaw`UPDATE "CashDrawerSession" SET "updatedAt"=GREATEST(clock_timestamp(),"updatedAt"+interval '1 millisecond') WHERE id=${rows[0].id} AND "storeId"=${storeId}`;
}
/** Caller checks wallet.create, transaction.create and discount permission, and holds the store lock. */
export async function assignCourseWithCheckout(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string},data:CourseCheckoutInput & {planId:string;customerId:string;expiresDate:string;requestKey:string}) {
  const {storeId,userId}=actor;
  const total=calculateCourseCheckout(data.expectedListPrice,data.discountKind,data.discountValue);
  const method=total.paid===0?"DISCOUNT":data.paymentMethod;
  const lastFour=method==="BANK_TRANSFER"?data.transferLastFour:null;
  if(method==="BANK_TRANSFER"&&!/^\d{4}$/.test(lastFour??"")) throw new AppError("VALIDATION","請填寫轉帳帳號後四碼");
  const previous=await tx.coursePurchase.findUnique({where:{storeId_requestKey:{storeId,requestKey:data.requestKey}}});
  if(previous){
    const card=previous.cardId?await tx.coursePointCard.findFirst({where:{id:previous.cardId,storeId}}):null;
    if(previous.revenueStaffId!==(data.revenueStaffId||null)||previous.customerId!==data.customerId||previous.planId!==data.planId||previous.listPrice!==data.expectedListPrice||previous.discountKind!==data.discountKind||Number(previous.discountValue)!==data.discountValue||previous.price!==total.paid||previous.paymentMethod!==method||previous.transferLastFour!==lastFour||(!card?.musicValidityDays && card?.expiresAt.getTime()!==dayRange(data.expiresDate).end.getTime())) throw new AppError("CONFLICT","結帳請求已使用，請重新核對");
    return previous;
  }
  // A key already used by the old grant-only flow must never become a new paid checkout.
  if(await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId,requestKey:data.requestKey}}})) throw new AppError("CONFLICT","方案指派請求已使用");
  const plan=await tx.coursePointPlan.findFirst({where:{id:data.planId,storeId,isActive:true}});
  const customers=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Customer" WHERE id=${data.customerId} AND "storeId"=${storeId} AND "mergedIntoCustomerId" IS NULL`;
  const expiresAt=dayRange(plan?.musicTerms ? "2099-12-31" : data.expiresDate).end;
  if(!plan||!customers.length||expiresAt<new Date()) throw new AppError("VALIDATION","請選擇本店方案、顧客及有效期限");
  if(plan.price!==data.expectedListPrice) throw new AppError("CONFLICT","方案售價已變更，請重新開啟核對");
  if(plan.storeCost!==data.expectedStoreCost) throw new AppError("CONFLICT","店家成本已變更，請重新開啟核對");
  const termSessionIds=await validateCourseTerm(tx,storeId,{...plan,termSessionIds:plan.termSessionIds??[]});
  const allocation=await courseSaleSnapshot(tx,storeId,total.paid,plan.storeCost,data.revenueStaffId||null);
  const day=new Date(toLocalDateStr()+"T00:00:00Z");
  if(method==="CASH") await lockCourseCashDay(tx,storeId,day);
  const card=await tx.coursePointCard.create({data:{termSessionIds,storeId,planId:plan.id,nameSnapshot:plan.name,unit:plan.unit,templateIds:plan.templateIds,remaining:plan.points,expiresAt,musicValidityDays:plan.musicTerms ? plan.validDays : null,requestKey:data.requestKey,members:{create:{customerId:data.customerId}},entries:{create:{kind:"GRANT",points:plan.points,actorUserId:userId}}}});
  const note=`店長指派結帳：原價 NT$ ${total.listPrice}／折抵 ${data.discountKind==="PERCENT"?`${data.discountValue}%（NT$ ${total.discount}）`:`NT$ ${total.discount}`}／實收 NT$ ${total.paid}／${COURSE_PAYMENT_LABELS[method]}${lastFour?`（後四碼 ${lastFour}）`:""}`;
  const order=await tx.coursePurchase.create({data:{...allocation,termSessionIds,storeId,customerId:data.customerId,planId:plan.id,name:plan.name,unit:plan.unit,points:plan.points,price:total.paid,validDays:plan.validDays,templateIds:plan.templateIds,status:"CONFIRMED",transferLastFive:"",requestKey:data.requestKey,cardId:card.id,confirmedAt:new Date(),confirmedBy:userId,note,listPrice:total.listPrice,discountKind:data.discountKind,discountValue:data.discountValue,paymentMethod:method,transferLastFour:lastFour}});
  if(total.paid>0) await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt") VALUES (${"course-purchase:"+order.id},${storeId},${day},'INCOME',${method==="CASH"?"CASH":"OTHER"}::"CashbookPaymentMethod",'課程方案',${total.paid},${plan.name+" / "+note},${allocation.revenueStaffId},${userId},NOW())`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CoursePurchase',${order.id},'ASSIGN_CHECKOUT',${JSON.stringify({storeId,cardId:card.id,...total,discountKind:data.discountKind,discountValue:data.discountValue,paymentMethod:method,transferLastFour:lastFour})}::jsonb,NOW())`;
  await enrollCourseTerm(tx,{storeId,userId,name:"店長指派期課"},card,data.customerId);
  return order;
}
