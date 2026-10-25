import {assertCoursePlanMode} from "@/server/services/course-scheduling-modes";
import { sportsEntitlementSnapshot } from "@/lib/sports-entitlement";
import { enqueuePlanActivation } from "./plan-activation-enqueue";
import { activationExpiry } from "@/lib/plan-activation-notification";
import { kickPlanActivationNotifications } from "./plan-activation-notification-kick";
import {musicNativeWorkflowEnabled} from "./music-native-workflow";
import {readMusicTuition,receiveMusicTuition} from "./music-tuition";
import {musicReceiptAmount,musicPaymentDate} from "@/lib/music-tuition";
import { lockCashDay } from "./cash-day";
import "server-only";
import { quoteMusicPurchase, validateFitnessPurchase, assertCoursePurchaseUnit } from "./course-purchase-rules";
import {validateCourseTerm,enrollCourseTerm} from "./course-term";
import {courseSaleSnapshot} from "./course-sale-allocation";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { calculateCourseCheckout, COURSE_PAYMENT_LABELS, type CourseCheckoutInput } from "@/lib/course-checkout";

export async function lockCourseCashDay(tx:Prisma.TransactionClient,storeId:string,day:Date) {
  await lockCashDay(tx,storeId,day,{requireOpen:true});
}
/** Caller checks wallet.create, transaction.create and discount permission, and holds the store lock. */
export async function assignCourseWithCheckout(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;music?:boolean},data:CourseCheckoutInput & {planId:string;customerId:string;expiresDate:string;requestKey:string}) {
  const {storeId,userId}=actor;
  if ("musicOpeningState" in data || "musicOpeningStateRequired" in data || "sourceKey" in data || "openingBalance" in data)
    throw new AppError("VALIDATION","期初資料不可經新增購買或收款流程建立");
  const revenueStaffId = actor.music ? null : data.revenueStaffId || null;
  const total=calculateCourseCheckout(data.expectedListPrice,data.discountKind,data.discountValue);
  const ledger=!!actor.music&&musicNativeWorkflowEnabled(storeId);
  if(!ledger&&(data.musicReceived!==undefined||data.musicPaymentDate!==undefined||data.musicDiscountTeacherFee!==undefined))throw new AppError("FORBIDDEN","分次收款目前僅開放測試站");
  const received=ledger?musicReceiptAmount(total.paid,data.musicReceived):total.paid;
  const paidAt=ledger?musicPaymentDate(data.musicPaymentDate):new Date();
  const fingerprint=JSON.stringify({...data,musicReceived:received,musicPaymentDate:toLocalDateStr(paidAt),musicDiscountTeacherFee:data.musicDiscountTeacherFee??false});
  // Legacy CoursePurchase_checkout_valid requires DISCOUNT whenever price is zero.
  // Music receivables distinguish unpaid tuition through due/receipts and the note.
  const method=received===0?"DISCOUNT":data.paymentMethod;
  const lastFour=method==="BANK_TRANSFER"?data.transferLastFour:null;
  if(method==="BANK_TRANSFER"&&!/^\d{4}$/.test(lastFour??"")) throw new AppError("VALIDATION","請填寫轉帳帳號後四碼");
  const previous=await tx.coursePurchase.findUnique({where:{storeId_requestKey:{storeId,requestKey:data.requestKey}}});
  if(previous){
    const card=previous.cardId?await tx.coursePointCard.findFirst({where:{id:previous.cardId,storeId}}):null;
    if (card?.musicOpeningStateRequired) throw new AppError("CONFLICT","期初方案不可重走結帳收款");
    const tuition=(await readMusicTuition(tx,storeId,[previous.id])).get(previous.id);
    if(tuition){if(tuition.checkoutFingerprint!==fingerprint)throw new AppError("CONFLICT","結帳請求已使用，請重新核對");return previous;}
    if((data.musicPurchaseTerms!==undefined && previous.musicTermSizes.length!==data.musicPurchaseTerms)||(data.musicValidityDays!==undefined && previous.validDays!==data.musicValidityDays)||(previous.musicManualBonus??0)!==(data.musicManualBonus??0)||(previous.musicJoinSessionId??null)!==(data.musicJoinSessionId??null)||previous.revenueStaffId!==revenueStaffId||previous.customerId!==data.customerId||previous.planId!==data.planId||previous.listPrice!==data.expectedListPrice||previous.discountKind!==data.discountKind||Number(previous.discountValue)!==data.discountValue||previous.price!==total.paid||previous.paymentMethod!==method||previous.transferLastFour!==lastFour||(!card?.musicValidityDays && card?.expiresAt?.getTime()!==dayRange(data.expiresDate).end.getTime())) throw new AppError("CONFLICT","結帳請求已使用，請重新核對");
    return previous;
  }
  // A key already used by the old grant-only flow must never become a new paid checkout.
  if(await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId,requestKey:data.requestKey}}})) throw new AppError("CONFLICT","方案指派請求已使用");
  const plan=await tx.coursePointPlan.findFirst({where:{id:data.planId,storeId,isActive:true}});
  const customers=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Customer" WHERE id=${data.customerId} AND "storeId"=${storeId} AND "mergedIntoCustomerId" IS NULL`;
  const expiresAt=dayRange(plan?.musicTerms ? "2099-12-31" : data.expiresDate).end;
  if(!plan||!customers.length||expiresAt<new Date()) throw new AppError("VALIDATION","請選擇本店方案、顧客及有效期限");
  await assertCoursePlanMode(tx,storeId,plan.sportsMode);
  if (!actor.music) validateFitnessPurchase(data);
  const musicQuote = actor.music ? await quoteMusicPurchase(tx, storeId, plan, data) : null;
  if((musicQuote?.price??plan.price)!==data.expectedListPrice) throw new AppError("CONFLICT","方案售價已變更，請重新開啟核對");
  if(!actor.music && plan.storeCost!==data.expectedStoreCost) throw new AppError("CONFLICT","店家成本已變更，請重新開啟核對");
  assertCoursePurchaseUnit(!!actor.music, plan.unit, "音樂教室只能購買堂數方案");
  if(actor.music && !plan.musicTerms) throw new AppError("VALIDATION","音樂教室只能購買堂數方案");
  const termSessionIds=await validateCourseTerm(tx,storeId,{...plan,termSessionIds:plan.termSessionIds??[]});
  const allocation=actor.music
    ? {storeCostSnapshot:received,developerProfitSnapshot:0,developerNameSnapshot:null,revenueStaffId:null}
    : await courseSaleSnapshot(tx,storeId,total.paid,plan.storeCost,revenueStaffId);
  const day=new Date(toLocalDateStr()+"T00:00:00Z");
  if(!ledger&&method==="CASH") await lockCourseCashDay(tx,storeId,day);
  const card=await tx.coursePointCard.create({data:{...sportsEntitlementSnapshot(plan),termSessionIds,storeId,planId:plan.id,nameSnapshot:plan.name,unit:plan.unit,templateIds:plan.templateIds,remaining:musicQuote?.points??plan.points,...(musicQuote?{musicTermSizes:musicQuote.musicTermSizes,musicBonusLessons:musicQuote.musicBonusLessons,musicManualBonus:data.musicManualBonus??0,musicJoinSessionId:data.musicJoinSessionId??null}:{}),expiresAt,musicValidityDays:musicQuote?.validDays??(plan.musicTerms ? plan.validDays : null),requestKey:data.requestKey,members:{create:{customerId:data.customerId}},entries:{create:{kind:"GRANT",points:musicQuote?.points??plan.points,actorUserId:userId}}}});
  const note=`店長指派結帳：原價 NT$ ${total.listPrice}／折抵 ${data.discountKind==="PERCENT"?`${data.discountValue}%（NT$ ${total.discount}）`:`NT$ ${total.discount}`}／應收 NT$ ${total.paid}／本次實收 NT$ ${received}／${received===0&&total.paid>0?"本次未收款":COURSE_PAYMENT_LABELS[method]}${lastFour?`（後四碼 ${lastFour}）`:""}`;
  const order=await tx.coursePurchase.create({data:{...sportsEntitlementSnapshot(plan),...allocation,termSessionIds,storeId,customerId:data.customerId,planId:plan.id,name:plan.name,unit:plan.unit,points:musicQuote?.points??plan.points,...(musicQuote?{musicTermSizes:musicQuote.musicTermSizes,musicBonusLessons:musicQuote.musicBonusLessons,musicManualBonus:data.musicManualBonus??0,musicJoinSessionId:data.musicJoinSessionId??null}:{}),price:received,validDays:musicQuote?.validDays??plan.validDays,templateIds:plan.templateIds,status:"CONFIRMED",transferLastFive:"",requestKey:data.requestKey,cardId:card.id,confirmedAt:new Date(),confirmedBy:userId,note,listPrice:total.listPrice,discountKind:data.discountKind,discountValue:data.discountValue,paymentMethod:method,transferLastFour:lastFour}});
  if(!ledger&&total.paid>0) await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt") VALUES (${"course-purchase:"+order.id},${storeId},${day},'INCOME',${method==="CASH"?"CASH":"OTHER"}::"CashbookPaymentMethod",'課程方案',${total.paid},${plan.name+" / "+note},${allocation.revenueStaffId},${userId},NOW())`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CoursePurchase',${order.id},'ASSIGN_CHECKOUT',${JSON.stringify({storeId,cardId:card.id,...total,discountKind:data.discountKind,discountValue:data.discountValue,paymentMethod:method,transferLastFour:lastFour})}::jsonb,NOW())`;
  if(ledger){
    await tx.$executeRaw`INSERT INTO "CourseMusicTuition" ("purchaseId","storeId",due,"discountTeacherFee","checkoutFingerprint") VALUES (${order.id},${storeId},${total.paid},${data.musicDiscountTeacherFee??false},${fingerprint})`;
    if(received>0)await receiveMusicTuition(tx,actor,{purchaseId:order.id,amount:received,paymentDate:toLocalDateStr(paidAt),method:data.paymentMethod,lastFour:data.transferLastFour,requestKey:data.requestKey,expectedReceived:0,initial:true});
  }
  await enrollCourseTerm(tx,{storeId,userId,name:"店長指派期課"},card,data.customerId);
  await enqueuePlanActivation(tx,{storeId,customerId:data.customerId,module:"COURSE",sourceId:order.id,entitlementId:card.id,planName:order.name,quantity:order.points,unit:order.unit==="POINT"?"點":"堂",expiresDate:card.musicValidityDays?`首堂上課起算 ${card.musicValidityDays} 天`:activationExpiry(card.expiresAt)});
  kickPlanActivationNotifications(storeId);
  return ledger?{...order,price:received,storeCostSnapshot:received}:order;
}
