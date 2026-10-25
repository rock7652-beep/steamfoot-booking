import {readBeautyServiceCost} from './charge-finance';
import {beautySaleAllocation} from '@/lib/beauty/sale-allocation';
import {beautyServiceCollectionAllocation} from '@/lib/beauty/receipt-allocation';
import {beautyChargeRulesEnabled,readCatalogCharge,writeCardCharge} from './charge-runtime';
import { enqueuePlanActivation } from "../services/plan-activation-enqueue";
import { activationExpiry } from "@/lib/plan-activation-notification";
import { kickPlanActivationNotifications } from "../services/plan-activation-notification-kick";
import {snapshotStoredChargeRule} from '@/lib/beauty/charge-rule-storage';
import "server-only";
import {serviceCharges} from "./service-charges";
import {calculateCourseCheckout} from "@/lib/course-checkout";
import {beautyPaymentVisibility,beautySaleAllocations} from "./transaction-revisions";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import {
  toLocalDateStr,
  dayRange,
  addTaiwanDuration,
  monthRange,
} from "@/lib/date-utils";
import { serviceFee } from "@/lib/beauty/allocation";
import { audit, command, type BeautyActor } from "./access";
import type { BeautyPlan } from "../../../generated/beauty-client";
import type { Tx } from "./booking";
import type { z } from "zod";
import type {
  paymentInput,
  cardInput,
  refundInput,
} from "@/lib/beauty/contracts";
async function cash(
  tx: Tx,
  a: BeautyActor,
  method: string,
  amount: number,
  paymentId: string,
  note: string,
) {
  if (amount === 0) return;
  if (method === "CASH") {
    const date = new Date(toLocalDateStr() + "T00:00:00Z");
    const drawers = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "CashDrawerSession" WHERE "storeId"=${a.storeId} AND "businessDate"=${date} AND status::text='OPEN' FOR UPDATE`;
    if (!drawers.length)
      throw new AppError("BUSINESS_RULE", "請先開啟今日現金抽屜");
    await tx.$executeRaw`UPDATE "CashDrawerSession" SET "updatedAt"=GREATEST(clock_timestamp(),"updatedAt"+interval '1 millisecond') WHERE id=${drawers[0].id}`;
  }
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") VALUES (${`beauty:${paymentId}`},${a.storeId},${new Date(toLocalDateStr() + "T00:00:00Z")},${amount > 0 ? "INCOME" : "EXPENSE"}::"CashbookEntryType",${method === "CASH" ? "CASH" : "OTHER"}::"CashbookPaymentMethod",'美業',${Math.abs(amount)},${note},${a.userId},NOW())`;
}
export async function collect(
  tx: Tx,
  a: BeautyActor,
  d: z.infer<typeof paymentInput>,
  options:{canDiscount:boolean}={canDiscount:false},
) {
  return command(tx, a, d.requestKey, d, async () => {
    for (const [i, id] of d.ids.entries()) {
      const b = await tx.beautyAppointment.findFirst({
        where: { id, storeId: a.storeId },
      });
      if (!b || b.cardId || b.status === "CANCELLED")
        throw new AppError("VALIDATION", "此服務不適用單次收款");
      const existing = await tx.beautyPayment.findMany({
        where: {
          storeId: a.storeId,
          appointmentId: id,
          kind: { in: ["SALE", "REFUND"] },
          ...(await beautyPaymentVisibility(tx,a.storeId)),
        },
      });
      const [current]=await serviceCharges(tx,a.storeId,[b],existing.map(p=>({...p,appointmentId:id})));
      const expected=d.quotes?.[i];
      if(expected&&(expected.revision!==b.revision||expected.price!==b.price||expected.collected!==current.collected))throw new AppError("CONFLICT","應收或收款已更新，請重新開啟核對");
      const offer=expected?.discount;
      if(offer&&!options.canDiscount)throw new AppError("FORBIDDEN","沒有調整優惠的權限");
      let quote;try{quote=calculateCourseCheckout(b.price,(offer??current.discount).kind,(offer??current.discount).value);}catch{throw new AppError("VALIDATION","請核對有效折扣或折抵金額");}
      if(current.collected+d.amounts[i]>quote.paid)throw new AppError("CONFLICT","收款超過本次應收");
      const discountChanged=!!offer&&(offer.kind!==current.discount.kind||offer.value!==current.discount.value);
      if(d.amounts[i]===0&&!discountChanged)continue;
      if(discountChanged)await audit(tx,a,"SERVICE_DISCOUNT",JSON.stringify({...offer,price:b.price,before:current.discount,netPrice:quote.paid,revision:b.revision+1}),b.id);
      const p = await tx.beautyPayment.create({
        data: {
          storeId: a.storeId,
          appointmentId: id,
          kind: "SALE",
          amount: d.amounts[i],
          method: d.method,
          note: d.note,
          actorUserId: a.userId!,
        },
      });
      if(beautyChargeRulesEnabled(a.storeId)){
        const storeCost=await readBeautyServiceCost(tx,a.storeId,b.id);
        const frozen=await beautySaleAllocations(tx,a.storeId,existing.filter(row=>row.kind==='SALE').map(row=>row.id));
        const allocation=beautyServiceCollectionAllocation(p.amount,storeCost,existing,frozen);
        const [owner]=b.customerId?await tx.$queryRaw<{assignedStaffId:string|null}[]>`SELECT s.id AS "assignedStaffId" FROM "Customer" c LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId" WHERE c.id=${b.customerId} AND c."storeId"=${a.storeId}`:[];
        await audit(tx,a,'SERVICE_SALE_ATTRIBUTION',JSON.stringify({paymentId:p.id,revenueStaffId:owner?.assignedStaffId??null,allocation}),b.id);
      }
      await cash(
        tx,
        a,
        d.method,
        p.amount,
        p.id,
        `服務收款：${b.serviceName} / ${d.note}`,
      );
      if (b.status === "COMPLETED") {
        if (
          (
            await tx.beautyPayment.aggregate({
              where: {
                storeId: a.storeId,
                appointmentId: id,
                kind: { in: ["FEE", "FEE_VOID"] },
              },
              _sum: { amount: true },
            })
          )._sum.amount
        )
          throw new AppError("CONFLICT", "已有技師付款，請先核對");
        await tx.beautyAppointment.update({
          where: { id },
          data: {
            fee: serviceFee(
              b.rate,
              b.price,
              existing.reduce((s, p) => s + p.amount, 0) + p.amount,
              1,
              b.duration,
            ),
            revision: { increment: 1 },
          },
        });
      }else await tx.beautyAppointment.update({where:{id},data:{revision:{increment:1}}});
    }
    await audit(tx, a, "COLLECT", JSON.stringify(d));
    return { ids: d.ids };
  });
}
export async function issueCard(
  tx: Tx,
  a: BeautyActor,
  d: z.infer<typeof cardInput>,
  frozen?: Pick<BeautyPlan,'id'|'storeId'|'name'|'sessions'|'price'|'validDays'|'serviceIds'|'allowShared'|'revision'> & {chargeRuleSnapshot?:unknown;storeCost?:number|null},
  options?: {expiresDate:string;expectedListPrice:number;expectedStoreCost?:number|null;transferLastFour?:string},
) {
  return command(tx, a, d.requestKey, options?{...d,options}:d, async () => {
    const p =
      frozen ??
      (await tx.beautyPlan.findFirst({
        where: { id: d.planId, storeId: a.storeId, active: true },
      }));
    if (!p) throw new AppError("NOT_FOUND", "找不到有效方案");
    const currentCharge=beautyChargeRulesEnabled(a.storeId)&&!frozen?await readCatalogCharge(tx,a.storeId,'plan',p.id,true):null;
    const chargeSnapshot=beautyChargeRulesEnabled(a.storeId)?frozen?snapshotStoredChargeRule(frozen.chargeRuleSnapshot===undefined?null:frozen.chargeRuleSnapshot,{storeId:a.storeId,chargeId:`plan:${p.id}`,revision:p.revision,serviceIds:p.serviceIds},a.storeId,'snapshot'):currentCharge!.snapshot:null;
    const storeCost=frozen?frozen.storeCost??null:currentCharge?.storeCost??null;
    if(storeCost!==null&&(!Number.isSafeInteger(storeCost)||storeCost<0))throw new AppError('VALIDATION','方案店家固定費用待核對');
    if(options){
      if(!a.manager)throw new AppError("FORBIDDEN","此到期日設定僅供後台使用");
      if(options.expectedStoreCost!==undefined&&options.expectedStoreCost!==storeCost)throw new AppError('CONFLICT','店家固定費用已更新，請重新開啟結帳');
      if(options.expectedListPrice!==p.price)throw new AppError("CONFLICT","方案售價已更新，請重新核對");
      const expiry=dayRange(options.expiresDate);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(options.expiresDate)||Number.isNaN(expiry.end.getTime())||toLocalDateStr(expiry.start)!==options.expiresDate||options.expiresDate<toLocalDateStr()||options.expiresDate>addTaiwanDuration(toLocalDateStr(),3650,"DAY"))throw new AppError("VALIDATION","請選擇有效到期日");
      if(options.transferLastFour&&!/^\d{4}$/.test(options.transferLastFour))throw new AppError("VALIDATION","轉帳末四碼格式不正確");
    }
    if (d.paid > p.price) throw new AppError("VALIDATION", "實收不能超過原價");
    const members = [...new Set([d.customerId, ...d.memberIds])];
    if (!p.allowShared && members.length !== 1)
      throw new AppError("VALIDATION", "此方案不允許共用");
    const cs = await tx.$queryRaw<
      Array<{ id: string; assignedStaffId: string | null }>
    >`SELECT c.id,s.id AS "assignedStaffId" FROM "Customer" c LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId" WHERE c."storeId"=${a.storeId} AND c.id=ANY(${members}::text[]) AND c."mergedIntoCustomerId" IS NULL`;
    if (cs.length !== members.length)
      throw new AppError("FORBIDDEN", "共用成員包含非本店顧客");
    const card = await tx.beautyCard.create({
      data: {
        storeId: a.storeId,
        customerId: d.customerId,
        memberIds: members,
        planId: p.id,
        name: p.name,
        sessions: p.sessions,
        remaining: p.sessions,
        listPrice: p.price,
        paid: d.paid,
        serviceIds: p.serviceIds,
        allowShared: p.allowShared,
        expiresAt: dayRange(options?.expiresDate??addTaiwanDuration(toLocalDateStr(), p.validDays, "DAY")).end,
      },
    });
    if(chargeSnapshot)await writeCardCharge(tx,a.storeId,card.id,chargeSnapshot);
    await tx.beautyLedger.create({
      data: {
        storeId: a.storeId,
        cardId: card.id,
        kind: "GRANT",
        delta: p.sessions,
        actorUserId: a.userId,
      },
    });
    const receipt = await tx.beautyPayment.create({
      data: {
        storeId: a.storeId,
        cardId: card.id,
        kind: "SALE",
        amount: d.paid,
        method: d.method,
        note: `方案：${p.name}${options?.transferLastFour?` · 轉帳末四碼 ${options.transferLastFour}`:""}`,
        actorUserId: a.userId!,
      },
    });
    await cash(tx, a, d.method, d.paid, receipt.id, receipt.note);
    const allocation=beautySaleAllocation(d.paid,storeCost);
    // Immutable sale attribution: later customer reassignment must not move revenue.
    await audit(tx, a, "ISSUE_CARD", JSON.stringify({ allocation,paymentId:receipt.id,cardId: card.id, ...d, ...(options?{checkout:options}:{}), revenueStaffId:cs.find(c=>c.id===d.customerId)?.assignedStaffId??null }));
    await enqueuePlanActivation(tx,{storeId:a.storeId,customerId:d.customerId,module:"BEAUTY",sourceId:receipt.id,entitlementId:card.id,planName:card.name,quantity:card.sessions,unit:"次",expiresDate:activationExpiry(card.expiresAt)});
    kickPlanActivationNotifications(a.storeId,true);
    return { cardId: card.id };
  });
}
export async function refund(
  tx: Tx,
  a: BeautyActor,
  d: z.infer<typeof refundInput>,
  expected?:{remaining:number|null;refundedAmount:number},
) {
  return command(tx, a, d.requestKey, expected?{...d,expected}:d, async () => {
    const p = await tx.beautyPayment.findFirst({
      where: { id: d.paymentId, storeId: a.storeId, kind: "SALE",...(await beautyPaymentVisibility(tx,a.storeId)) },
    });
    if (!p) throw new AppError("NOT_FOUND", "找不到原收款");
    const refunds = await tx.beautyPayment.aggregate({
      where: { storeId: a.storeId, originalPaymentId: p.id, kind: "REFUND" },
      _sum: { amount: true },
    });
    if(expected&&(!a.manager||expected.refundedAmount!==-(refunds._sum.amount??0)))throw new AppError("CONFLICT","退款紀錄已更新，請重新核對");
    if (d.amount > p.amount + (refunds._sum.amount ?? 0))
      throw new AppError("CONFLICT", "退款超過尚可退金額");
    if (p.cardId) {
      if (
        await tx.beautyAppointment.count({
          where: { storeId: a.storeId, cardId: p.cardId, status: "RESERVED" },
        })
      )
        throw new AppError("BUSINESS_RULE", "請先處理方案預約占用再退款");
      const card = await tx.beautyCard.findFirstOrThrow({
        where: { id: p.cardId, storeId: a.storeId },
      });
      if(expected&&expected.remaining!==card.remaining)throw new AppError("CONFLICT","方案額度已更新，請重新核對");
      if (!card.closedAt) {
        await tx.beautyCard.update({
          where: { id: card.id },
          data: { remaining: 0, closedAt: new Date() },
        });
        await tx.beautyLedger.create({
          data: {
            storeId: a.storeId,
            cardId: card.id,
            kind: "REFUND",
            delta: -card.remaining,
            actorUserId: a.userId,
          },
        });
      }
    }
    if (p.appointmentId) {
      const b = await tx.beautyAppointment.findFirstOrThrow({
        where: { storeId: a.storeId, id: p.appointmentId },
      });
      if (b.status !== "CANCELLED")
        throw new AppError("BUSINESS_RULE", "請先取消服務並核對拆帳再退款");
    }
    const r = await tx.beautyPayment.create({
      data: {
        storeId: a.storeId,
        appointmentId: p.appointmentId,
        cardId: p.cardId,
        originalPaymentId: p.id,
        kind: "REFUND",
        amount: -d.amount,
        method: d.method,
        note: d.reason,
        actorUserId: a.userId!,
      },
    });
    await cash(tx, a, d.method, r.amount, r.id, `退款登錄：${d.reason}`);
    await audit(tx, a, "REFUND", JSON.stringify({ id: r.id, ...d }));
    return { id: r.id };
  });
}
export async function settlement(tx: Tx, storeId: string, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new AppError("VALIDATION", "月份無效");
  const range = monthRange(month);
  const rows = await tx.beautyAppointment.findMany({
    where: {
      storeId,
      startsAt: { gte: range.start, lte: range.end },
      status: "COMPLETED",
    },
    orderBy: { id: "asc" },
  });
  const payments = await tx.beautyPayment.findMany({
    where: {
      storeId,
      kind: { in: ["FEE", "FEE_VOID"] },
      appointmentId: { in: rows.map((r) => r.id) },
    },
    orderBy: { id: "asc" },
  });
  const lines = rows.map((r) => ({
    id: r.id,
    technicianId: r.technicianId,
    personName: r.personName,
    serviceName: r.serviceName,
    date: r.startsAt.toISOString(),
    fee: r.fee,
    paid: payments
      .filter((p) => p.appointmentId === r.id)
      .reduce((n, p) => n + p.amount, 0),
    revision: r.revision,
  }));
  return {
    lines,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(lines))
      .digest("hex"),
  };
}
export async function payFee(
  tx: Tx,
  a: BeautyActor,
  d: { id: string; amount: number; method: string; note: string },
) {
  const b = await tx.beautyAppointment.findFirst({
    where: { storeId: a.storeId, id: d.id, status: "COMPLETED" },
  });
  if (!b) throw new AppError("NOT_FOUND", "找不到已完成服務");
  const confirmed = await tx.beautySettlement.findFirst({
    where: {
      storeId: a.storeId,
      month: toLocalDateStr(b.startsAt).slice(0, 7),
    },
    orderBy: { createdAt: "desc" },
  });
  const line = (
    confirmed?.lines as
      { id: string; fee: number; revision: number }[] | undefined
  )?.find((l) => l.id === b.id);
  if (!line || line.fee !== b.fee || line.revision !== b.revision)
    throw new AppError("BUSINESS_RULE", "請先確認最新月結");
  const paid = await tx.beautyPayment.aggregate({
    where: {
      storeId: a.storeId,
      appointmentId: b.id,
      kind: { in: ["FEE", "FEE_VOID"] },
    },
    _sum: { amount: true },
  });
  if (d.amount <= 0 || d.amount > b.fee - (paid._sum.amount ?? 0))
    throw new AppError("CONFLICT", "付款超過尚未支付的拆帳");
  const p = await tx.beautyPayment.create({
    data: {
      storeId: a.storeId,
      appointmentId: b.id,
      technicianId: b.technicianId,
      kind: "FEE",
      amount: d.amount,
      method: d.method,
      note: d.note,
      actorUserId: a.userId!,
    },
  });
  await cash(tx, a, d.method, -d.amount, p.id, `技師拆帳：${d.note}`);
  return { id: p.id };
}

/** Append a receipt reversal after the store has actually recovered the payment. */
export async function voidFee(
  tx: Tx,
  a: BeautyActor,
  d: { paymentId: string; amount: number; method: string; reason: string },
) {
  const p = await tx.beautyPayment.findFirst({
    where: { id: d.paymentId, storeId: a.storeId, kind: "FEE" },
  });
  if (!p) throw new AppError("NOT_FOUND", "找不到原拆帳付款");
  const reversed = await tx.beautyPayment.aggregate({
    where: { storeId: a.storeId, originalPaymentId: p.id, kind: "FEE_VOID" },
    _sum: { amount: true },
  });
  if (d.amount <= 0 || d.amount > p.amount + (reversed._sum.amount ?? 0))
    throw new AppError("CONFLICT", "沖回超過原付款餘額");
  const r = await tx.beautyPayment.create({
    data: {
      storeId: a.storeId,
      appointmentId: p.appointmentId,
      technicianId: p.technicianId,
      originalPaymentId: p.id,
      kind: "FEE_VOID",
      amount: -d.amount,
      method: d.method,
      note: d.reason,
      actorUserId: a.userId!,
    },
  });
  await cash(tx, a, d.method, d.amount, r.id, `技師拆帳收回：${d.reason}`);
  await audit(
    tx,
    a,
    "FEE_VOID",
    JSON.stringify({ original: p.id, id: r.id, reason: d.reason }),
    p.appointmentId ?? undefined,
  );
  return { id: r.id };
}
