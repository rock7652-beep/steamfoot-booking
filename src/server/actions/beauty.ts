"use server";
import {beautyChargeRulesEnabled,readCatalogCharge} from '@/server/beauty/charge-runtime';
import {withReadRequestMemo} from "@/server/services/read-request-memo";
import {traceBeautyRead,beautyReadStep} from "@/server/beauty/read-timing";
import {resolveBeautyBookingInput,beautySlotsForActor} from "@/server/beauty/availability";
import {persistBeautyCatalog} from '@/server/beauty/catalog';
import {recordBeautyStoreNotice} from "@/server/beauty/store-notices";
import {beautyNotificationDeliveryBlocked} from "@/lib/beauty/notification-policy";
import {notifyBeautyBookingManagers,notifyBeautyPurchaseManagers} from "@/server/beauty/manager-notifications";
import { cardAllowsRecipient } from "@/lib/beauty/member-booking";
import {serviceCharges} from "@/server/beauty/service-charges";
import {linkCompanion} from "@/server/beauty/companions";
import {createCustomerSchema} from "@/lib/validators/customer";
import {getStoreLimitsByStoreId} from "@/lib/feature-gate";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission,checkPermission } from "@/lib/permissions";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature,hasStoreFeature } from "@/lib/feature-gate";
import {updateCustomerSchema} from "@/lib/validators/customer";
import {
  planInput,
  settingsInput,
  partyInput,
  changeInput,
  paymentInput,
  cardInput,
  refundInput,attendanceInput,
  moveInput,
  key,
} from "@/lib/beauty/contracts";
import {
  beautyManager,
  beautyMember,
  beautyWorker,
  beautyTransaction,
  command,
  audit,
  requireBeauty,
} from "@/server/beauty/access";
import type { BeautyActor } from "@/server/beauty/access";
import {
  reserveParty,
  transition,
  findAllocation,
  loadAvailability,
  ownsItem,
  settings,
  assertCustomerAvailable,
} from "@/server/beauty/booking";
import {
  collect,
  issueCard,
  refund,
  settlement,
} from "@/server/beauty/commerce";
import { resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
import { finalizeBeautyBookingLine } from "@/server/services/beauty-booking-line-finalization";
import type { Prisma } from "../../../generated/beauty-client";
async function result<T>(work: () => Promise<T>) {
  try {
    return { success: true as const, data: await work() };
  } catch (e) {
    const r = handleActionError(e);
    return { success: false as const, error: r.success ? "操作失敗" : r.error };
  }
}
export async function saveBeautyCatalog(
  kind: "service" | "technician" | "plan",
  input: unknown,
) {
  return result(async () => {
    kind = z.enum(["service", "technician", "plan"]).parse(kind);
    const a = await beautyManager(
      kind === "technician" ? "staff.manage" : "plans.edit",
      true,
    );
    await requireStoreFeature(
      a.storeId,
      kind === "technician"
        ? FEATURES.STAFF_MANAGEMENT
        : FEATURES.PLAN_MANAGEMENT,
    );
    if(kind==="service"&&typeof input==="object"&&input!==null&&"defaultRate" in input&&input.defaultRate!==undefined){await requirePermission("teacher.compensation.manage");await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);}
    if (kind === "technician") {
      await requirePermission("teacher.compensation.read");
      await requirePermission("teacher.compensation.manage");
    }
    return beautyTransaction(a, async (tx) => {
      const saved=await persistBeautyCatalog(tx,a,kind,input);
      if(kind==="service"&&!(typeof input==="object"&&input!==null&&"defaultRate" in input&&input.defaultRate!==undefined))return {...saved,record:{...saved.record as object,defaultRate:undefined}};
      return saved;
    });
  });
}
export async function saveBeautySettings(input: unknown) {
  return result(async () => {
    const a = await beautyManager("business_hours.manage", true),
      d = settingsInput.parse(input);
    return beautyTransaction(a, async (tx) => {
      const current = await settings(tx, a.storeId);
      if (current.revision !== d.revision)
        throw new AppError("CONFLICT", "設定已更新");
      await tx.beautySetting.upsert({
        where: { storeId: a.storeId },
        create: { ...d, storeId: a.storeId, revision: 1 },
        update: { ...d, revision: { increment: 1 } },
      });
      await audit(tx, a, "SETTINGS", JSON.stringify(d));
      return { saved: true };
    });
  });
}
export async function saveBeautyLocation(input: unknown) {
  return result(async () => {
    const a = await beautyManager("business_hours.manage", true),
      d = z
        .object({
          id: key.optional(),
          name: z.string().trim().min(1).max(100),
          active: z.boolean(),
          capacity:z.number().int().min(1).max(500).optional(),rentalEnabled:z.boolean().optional(),rentalHourlyRate:z.number().int().min(0).max(1000000).optional(),rentalBufferMinutes:z.number().int().min(0).max(120).optional(),
          category:z.string().max(100).optional(),details:z.string().max(1000).optional(),equipment:z.string().max(500).optional(),location:z.string().max(300).optional(),
        })
        .parse(input);
    return beautyTransaction(a, async (tx) => {
      const savedId=d.id??crypto.randomUUID();
      if (d.id) {
        const r = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "CourseRoom" WHERE id=${d.id} AND "storeId"=${a.storeId}`;
        if (!r.length) throw new AppError("FORBIDDEN", "位置不屬於本店");
        if (
          !d.active &&
          (await tx.beautyAppointment.count({
            where: {
              storeId: a.storeId,
              locationId: d.id,
              status: "RESERVED",
              occupiedEndsAt: { gt: new Date() },
            },
          }))
        )
          throw new AppError("CONFLICT", "請先處理此位置的預約");
        if (!d.active || d.rentalEnabled === false) {
          const rentals=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseRental" WHERE "storeId"=${a.storeId} AND "roomId"=${d.id} AND "cancelledAt" IS NULL AND "occupiedEndsAt">NOW() LIMIT 1`;
          if(rentals.length)throw new AppError("CONFLICT","請先處理此位置的租借");
        }
        await tx.$executeRaw`UPDATE "CourseRoom" SET name=${d.name},"isActive"=${d.active},capacity=COALESCE(${d.capacity??null},capacity),"rentalEnabled"=COALESCE(${d.rentalEnabled??null},"rentalEnabled"),"rentalHourlyRate"=COALESCE(${d.rentalHourlyRate??null},"rentalHourlyRate"),"rentalBufferMinutes"=COALESCE(${d.rentalBufferMinutes??null},"rentalBufferMinutes"),category=COALESCE(${d.category??null},category),details=COALESCE(${d.details??null},details),equipment=COALESCE(${d.equipment??null},equipment),location=COALESCE(${d.location??null},location) WHERE id=${d.id} AND "storeId"=${a.storeId}`;
      } else
        await tx.$executeRaw`INSERT INTO "CourseRoom" (id,"storeId",name,capacity,details,category,"isActive","createdAt",equipment,location,"rentalEnabled","rentalHourlyRate","rentalBufferMinutes") VALUES (${savedId},${a.storeId},${d.name},${d.capacity??1},${d.details??''},${d.category??''},${d.active},NOW(),${d.equipment??''},${d.location??''},${d.rentalEnabled??false},${d.rentalHourlyRate??0},${d.rentalBufferMinutes??0})`;
      await audit(tx, a, "LOCATION", JSON.stringify(d));
      const records=await tx.$queryRaw<Array<{id:string;name:string;isActive:boolean;category:string;details:string;equipment:string;location:string;capacity:number|null;rentalEnabled:boolean;rentalHourlyRate:number;rentalBufferMinutes:number}>>`SELECT id,name,"isActive",category,details,equipment,location,capacity,"rentalEnabled","rentalHourlyRate","rentalBufferMinutes" FROM "CourseRoom" WHERE id=${savedId} AND "storeId"=${a.storeId}`;
      return { saved: true, record:records[0] };
    });
  });
}
async function bookingActor(mode: "manager" | "member" | "work", write = true) {
  return mode === "manager"
    ? beautyManager("booking.create", write)
    : mode === "work"
      ? beautyWorker(write)
      : beautyMember(write);
}
async function bookBeautyPartyCore(
  mode: "manager" | "member",
  input: unknown,
) {
  return result(async () => {
    const a = await beautyReadStep('authorization',()=>bookingActor(mode)),
      d = await beautyReadStep('booking-input',()=>resolveBeautyBookingInput(mode,input,a));
    if (d.people.some((p) => p.cardId))
      await requireStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT);
    const booked=await beautyReadStep('booking-transaction',()=>beautyTransaction(a, (tx) => reserveParty(tx, a, d)));
    if(mode==="member")await notifyBeautyBookingManagers(a.storeId,booked.groupId);
    return booked;
  });
}
export async function bookBeautyParty(mode:'manager'|'member',input:unknown){return (await traceBeautyRead('booking.submit',()=>bookBeautyPartyCore(mode,input))).value;}
export async function submitBeautyTrial(
  slug: string,
  input: unknown,
  entryToken?: string,
) {
  return result(async () => {
    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!store) throw new AppError("NOT_FOUND", "找不到店家");
    await requireBeauty(store.id, true);
    const d = partyInput.parse(input);
    if (!d.isTrial || d.people.some((p) => p.customerId || p.cardId))
      throw new AppError("FORBIDDEN", "公開表單僅供體驗預約，不授予會員權益");
    const actorKey = entryToken
      ? "entry:" + createHash("sha256").update(entryToken).digest("hex")
      : "public";
    const previous = await beautyPrisma.beautyCommand.findUnique({
      where: {
        storeId_requestKey: { storeId: store.id, requestKey: d.requestKey },
      },
    });
    if (previous) {
      if (
        previous.actorKey !== actorKey ||
        previous.intent !== JSON.stringify(d)
      )
        throw new AppError("CONFLICT", "預約請求已使用");
      const booked = previous.result as { groupId: string; ids: string[] };
      return { ...booked, notificationSetup: await finalizeBeautyBookingLine({ storeId: store.id, groupId: booked.groupId, requestKey: d.requestKey, entryToken }) };
    }
    const entry = entryToken
      ? await resolveTrialBookingChatLink(entryToken)
      : null;
    if (entryToken && (!entry || entry.storeId !== store.id))
      throw new AppError("FORBIDDEN", "預約連結已失效或不適用本店");
    const linked =
      entry?.channel === "LINE"
        ? await prisma.customer.findFirst({
            where: {
              storeId: store.id,
              lineUserId: entry.chatIdentity,
              mergedIntoCustomerId: null,
            },
            select: { id: true, lineLinkStatus: true },
          })
        : null;
    if (linked?.lineLinkStatus === "BLOCKED")
      throw new AppError("FORBIDDEN", "LINE 身分已停用，請店家協助核對");
    if (
      entry?.channel === "LINE" &&
      !linked &&
      (await prisma.customer.count({
        where: { storeId: store.id, phone: d.phone },
      }))
    )
      throw new AppError(
        "FORBIDDEN",
        "此手機已有顧客資料，請先由店家核對並連結 LINE",
      );
    const customerId = linked?.id;
    const a: BeautyActor = { storeId: store.id, userId: null, actorKey };
    const booked=await beautyTransaction(a, (tx) =>
      reserveParty(tx, a, d, entry ? { ...entry, customerId } : undefined),
    );
    await notifyBeautyBookingManagers(a.storeId,booked.groupId);
    return { ...booked, notificationSetup: await finalizeBeautyBookingLine({ storeId: store.id, groupId: booked.groupId, requestKey: d.requestKey, entryToken }) };
  });
}
async function readBeautySlotsCore(
  mode: "manager" | "member" | "public",
  slug: string,
  input: unknown,
) {
  return result(async () => {
    let a: BeautyActor;
    if (mode === "public") {
      const s = await prisma.store.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!s) throw new AppError("NOT_FOUND", "找不到店家");
      await requireBeauty(s.id);
      a = { storeId: s.id, userId: null };
    } else a = await beautyReadStep('authorization',()=>bookingActor(mode, false));
    return beautySlotsForActor(mode,input,a);
  });
}
export async function readBeautySlots(mode:'manager'|'member'|'public',slug:string,input:unknown){return (await traceBeautyRead('booking.availability',()=>withReadRequestMemo(()=>readBeautySlotsCore(mode,slug,input)))).value;}
export async function changeBeautyStatus(
  mode: "manager" | "member" | "work",
  input: unknown,
) {
  return result(async () => {
    const a =
        mode === "manager"
          ? await beautyManager("booking.update", true)
          : await bookingActor(mode),
      raw = z.object({target:z.string()}).passthrough().parse(input),
      d = changeInput.parse(mode==="member"&&raw.target==="CANCELLED"?{...raw,reason:"顧客自行取消"}:mode!=="member"&&raw.target==="COMPLETED"?{...raw,reason:mode==="work"?"技師確認服務完成":"後台確認服務完成"}:input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, () => transition(tx, a, d)),
    );
  });
}
/** Explicit back-office attendance choices use the same store lock, revision and ledger transition. */
export async function changeBeautyAttendance(input:unknown){
 return result(async()=>{
  const a=await beautyManager('booking.update',true),d=attendanceInput.parse(input);
  const target=d.choice==='ATTENDED'?'COMPLETED':d.choice==='PENDING'?'RESERVED':'NO_SHOW';
  const reason={ATTENDED:'後台標記出席',NO_SHOW_DEDUCT:'後台標記未出席扣次',NO_SHOW_KEEP:'後台標記未出席不扣次',PENDING:'後台恢復待服務'}[d.choice];
  const intent={id:d.id,revision:d.revision,target,reason,...(target==='NO_SHOW'?{noShowDeduct:d.choice==='NO_SHOW_DEDUCT'}:{})};
  return beautyTransaction(a,tx=>command(tx,a,d.requestKey,intent,()=>transition(tx,a,intent)));
 });
}
export async function moveBeautyAppointment(mode:"manager"|"member"|"work",input:unknown){return (await traceBeautyRead('roster.move',()=>moveBeautyAppointmentCore(mode,input))).value;}
async function moveBeautyAppointmentCore(
  mode: "manager" | "member" | "work",
  input: unknown,
) {
  return result(async () => {
    const a =
        mode === "manager"
          ? await beautyManager("booking.update", true)
          : await bookingActor(mode),
      d = moveInput.parse(input);
    if(mode==='member'&&!/:(00|30)$/.test(d.time))throw new AppError("VALIDATION","請選擇半小時的預約時段");
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, async () => {
        const b = await ownsItem(tx, a, d.id),
          policy = await settings(tx, a.storeId);
        if (b.revision !== d.revision || b.status !== "RESERVED")
          throw new AppError("CONFLICT", "預約已更新或已結算");
        if (!a.manager) {
          if (a.technicianId) {
            const t = await tx.beautyTechnician.findFirstOrThrow({
              where: { storeId: a.storeId, id: a.technicianId },
            });
            if (!t.grants.includes("reschedule"))
              throw new AppError("FORBIDDEN", "未開放技師改期");
          } else if (
            !policy.selfReschedule ||
            +b.startsAt <= Date.now() + policy.cancelLeadMinutes * 60000
          )
            throw new AppError("FORBIDDEN", "已超過自行改期期限");
        }
        if (!a.manager && (d.technicianId || d.locationId))
          throw new AppError("FORBIDDEN", "換人或位置請聯絡店家");
        const people = [
          {
            serviceId: b.serviceId,
            preference: b.preference as "ANY" | "FEMALE" | "MALE",
            specifiedTechnicianId:
              a.technicianId ?? d.technicianId ?? b.specifiedTechnicianId,
          },
        ] as z.infer<typeof partyInput>["people"];
        const allocation = await findAllocation(
            tx,
            a,
            { date: d.date, time: d.time, people },
            [b.id],
            d.locationId ?? undefined,
            undefined,false,{serviceId:b.serviceId,duration:b.duration,buffer:b.buffer},
          ),
          next = allocation.result[0];
        await assertCustomerAvailable(tx, a.storeId, b.customerId,
          allocation.startsAt, next.occupiedEndsAt, b.id);
        if (b.cardId) {
          const { assertCard } = await import("@/server/beauty/booking");
          await assertCard(
            tx,
            a,
            b.cardId,
            b.customerId!,
            b.serviceId,
            allocation.startsAt,
            b.id,
            b.group.customerId,
          );
        }
        // Keep historical duration/buffer. Catalog edits cannot silently alter a reservation.
        if (
          next.endsAt.getTime() - allocation.startsAt.getTime() !==
            b.duration * 60000 ||
          next.occupiedEndsAt.getTime() - next.endsAt.getTime() !==
            b.buffer * 60000
        )
          throw new AppError(
            "CONFLICT",
            "服務時長已變更，請由店家核對後重新預約",
          );
        await tx.beautyAppointment.update({
          where: { id: b.id },
          data: {
            technicianId: next.technicianId,
            specifiedTechnicianId: d.technicianId ?? b.specifiedTechnicianId,
            locationId: next.locationId,
            startsAt: allocation.startsAt,
            endsAt: next.endsAt,
            occupiedEndsAt: next.occupiedEndsAt,
            ...(next.technicianId !== b.technicianId
              ? { rate: next.rate }
              : {}),
            revision: { increment: 1 },
          },
        });
        await recordBeautyStoreNotice(tx,a,policy.backendNoticesEnabled,{...b,technicianId:next.technicianId,startsAt:allocation.startsAt},"MOVE",{startsAt:b.startsAt,technicianId:b.technicianId});
        await tx.beautyEvent.updateMany({
          where: {
            storeId: a.storeId,
            appointmentId: b.id,
            status: { in: ["PENDING", "FAILED"] },
            kind: { in: ["BOOKED", "MOVED", "REMINDER", "RESERVED"] },
          },
          data: { status: "SKIPPED" },
        });
        await tx.beautyEvent.create({
          data: {
            storeId: a.storeId,
            kind: "MOVED",
            status: policy.notifications && !beautyNotificationDeliveryBlocked() ? "PENDING" : "SKIPPED",
            appointmentId: b.id,
            customerId: b.customerId ?? b.group.customerId,
            body: `${b.serviceName}｜${d.date} ${d.time}｜預約改期`,
          },
        });
        await audit(
          tx,
          a,
          "MOVE",
          JSON.stringify({
            before: b.startsAt,
            after: allocation.startsAt,
            reason: d.reason,
          }),
          b.id,
        );
        return { id: b.id };
      }),
    );
  });
}
export async function collectBeautyPayment(input:unknown){return (await traceBeautyRead('collection.write',()=>collectBeautyPaymentCore(input))).value;}
async function collectBeautyPaymentCore(input: unknown) {
  return result(async () => {
    const a = await beautyManager("transaction.create", true);
    await requireStoreFeature(a.storeId, FEATURES.TRANSACTION_MANAGEMENT);
    const d=paymentInput.parse(input),canDiscount=!!d.quotes?.some(q=>q.discount);
    if(canDiscount)await requirePermission("transaction.discount");
    return beautyTransaction(a, (tx) => collect(tx,a,d,{canDiscount}));
  });
}
export async function readBeautyCollection(ids:unknown){return (await traceBeautyRead('collection.read',()=>readBeautyCollectionCore(ids))).value;}
async function readBeautyCollectionCore(ids:unknown){
 return result(async()=>{
  const a=await beautyManager("transaction.create");await requirePermission("booking.read");await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
  const wanted=z.array(key).min(1).max(12).refine(a=>new Set(a).size===a.length).parse(ids);
  return beautyTransaction(a,async tx=>{
   const rows=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,id:{in:wanted}}});
   if(rows.length!==wanted.length||rows.some(b=>b.cardId||b.status==='CANCELLED'))throw new AppError('CONFLICT','服務已更新或不適用收款，請重新開啟');
   return serviceCharges(tx,a.storeId,wanted.map(id=>rows.find(b=>b.id===id)!));
  });
 });
}
export async function purchaseBeautyPlan(input: unknown) {
  return result(async () => {
    const a = await beautyManager("wallet.create", true);
    await requireStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT);
    await requirePermission("transaction.create");
    const d = cardInput.parse(input);
    const p = await beautyPrisma.beautyPlan.findFirst({
      where: { id: d.planId, storeId: a.storeId },
    });
    if (p && d.paid !== p.price)
      await requirePermission("transaction.discount");
    return beautyTransaction(a, (tx) => issueCard(tx, a, d));
  });
}
export async function refundBeautyPayment(input: unknown) {
  return result(async () => {
    const a = await beautyManager("transaction.refund", true);
    await requireStoreFeature(a.storeId, FEATURES.TRANSACTION_MANAGEMENT);
    return beautyTransaction(a, (tx) =>
      refund(tx, a, refundInput.parse(input)),
    );
  });
}
export async function confirmBeautySettlement(input: unknown) {
  return result(async () => {
    const a = await beautyManager("teacher.settlement.confirm", true);
    await requireStoreFeature(a.storeId, FEATURES.SERVICE_FEE_CALCULATOR);
    const d = z
      .object({
        requestKey: z.string().uuid(),
        month: z.string(),
        fingerprint: z.string(),
      })
      .parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, async () => {
        const report = await settlement(tx, a.storeId, d.month);
        if (report.fingerprint !== d.fingerprint)
          throw new AppError("CONFLICT", "月結已變更，請重新核對");
        await tx.beautySettlement.create({
          data: {
            storeId: a.storeId,
            month: d.month,
            fingerprint: report.fingerprint,
            lines: report.lines,
            actorUserId: a.userId!,
          },
        });
        return { confirmed: true };
      }),
    );
  });
}
/** Retired endpoint: keep old clients from creating new technician payment records. */
export async function payBeautyFee(input: unknown) {
  void input;
  return {success:false as const,error:'技師付款由店家自行處理；系統僅提供拆帳明細。'};
}
export async function saveBeautyCustomer(input: unknown) {
  return result(async () => {
    const a = await beautyManager("customer.create", true),
      d = z
        .object({
          name: z.string().trim().min(1).max(80),
          phone: z.string().regex(/^09\d{8}$/),
          notes: z.string().max(1000).default(""),
        })
        .parse(input);
    await requireStoreFeature(a.storeId, FEATURES.CUSTOMER_MANAGEMENT);
    return beautyTransaction(a, async (tx) => {
      const id = crypto.randomUUID();
      await tx.$executeRaw`INSERT INTO "Customer" (id,"storeId",name,phone,notes,"authSource","customerStage","selfBookingEnabled","createdAt","updatedAt") VALUES (${id},${a.storeId},${d.name},${d.phone},${d.notes},'MANUAL','LEAD',false,NOW(),NOW())`;
      await audit(tx, a, "CUSTOMER", JSON.stringify({ id }));
      return { id };
    });
  });
}

export async function requestBeautyPlan(input: unknown) {
  return result(async () => {
    const a = await beautyMember(true),
      d = z
        .object({
          requestKey: z.string().uuid(),
          planId: key,
          lastFour: z.string().regex(/^\d{4}$/, "請填轉帳後四碼"),
        })
        .parse(input);
    await requireStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT);
    const bank = await prisma.shopConfig.findUnique({
      where: { storeId: a.storeId },
      select: { bankName: true, bankAccountNumber: true },
    });
    if (!bank?.bankName || !bank.bankAccountNumber)
      throw new AppError("VALIDATION", "店家尚未設定銀行資料，請洽店家購買");
    const purchased=await beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, async () => {
        const plan = await tx.beautyPlan.findFirst({
          where: {
            id: d.planId,
            storeId: a.storeId,
            active: true,
            customerPurchasable: true,
          },
        });
        if (!plan) throw new AppError("NOT_FOUND", "此方案目前不開放購買");
        const order = await tx.beautyPurchase.create({
          data: {
            storeId: a.storeId,
            customerId: a.customerId!,
            planId: plan.id,
            snapshot: beautyChargeRulesEnabled(a.storeId)?await (async()=>{const charge=await readCatalogCharge(tx,a.storeId,'plan',plan.id,true);return {...plan,chargeRuleSnapshot:charge.snapshot,storeCost:charge.storeCost};})():plan,
            lastFour: d.lastFour,
          },
        });
        await audit(
          tx,
          a,
          "PURCHASE_PENDING",
          JSON.stringify({ orderId: order.id, managerNoticeEligible: !beautyNotificationDeliveryBlocked() && (await settings(tx,a.storeId)).notifications }),
        );
        return { id: order.id };
      }),
    );
    await notifyBeautyPurchaseManagers(a.storeId,purchased.id);
    return purchased;
  });
}
export async function confirmBeautyPurchase(input: unknown) {
  return result(async () => {
    const a = await beautyManager("wallet.create", true);
    await requireStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT);
    await requirePermission("transaction.create");
    const d = z.object({ requestKey: z.string().uuid(), id: key }).parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, async () => {
        const order = await tx.beautyPurchase.findFirst({
          where: { storeId: a.storeId, id: d.id },
        });
        if (!order) throw new AppError("NOT_FOUND", "找不到訂單");
        if (order.status === "CONFIRMED") return { cardId: order.cardId! };
        if (order.status !== "PENDING")
          throw new AppError("CONFLICT", "訂單狀態已變更");
        const snapshot = planInput.parse(order.snapshot);
        if (!snapshot.id) throw new AppError("VALIDATION", "購入快照待核對");
        const receipt = await issueCard(
          tx,
          a,
          {
            requestKey: d.requestKey + ":issue",
            planId: order.planId,
            customerId: order.customerId,
            memberIds: [order.customerId],
            paid: snapshot.price,
            method: "BANK_TRANSFER",
          },
          { ...snapshot, id: snapshot.id, storeId: a.storeId,storeCost:order.snapshot&&typeof order.snapshot==='object'&&!Array.isArray(order.snapshot)&&'storeCost' in order.snapshot&&typeof order.snapshot.storeCost==='number'?order.snapshot.storeCost:null,chargeRuleSnapshot:order.snapshot&&typeof order.snapshot==='object'&&!Array.isArray(order.snapshot)&&'chargeRuleSnapshot' in order.snapshot?order.snapshot.chargeRuleSnapshot:null },
        );
        await tx.beautyPurchase.update({
          where: { id: order.id },
          data: { cardId: receipt.cardId, status: "CONFIRMED" },
        });
        const corrected=await tx.beautyTransactionRevision.findFirst({where:{storeId:a.storeId,transactionId:order.id},orderBy:{revision:'desc'}});
        if(corrected){
          const payment=await tx.beautyPayment.findFirstOrThrow({where:{storeId:a.storeId,cardId:receipt.cardId,kind:'SALE'}});
          await tx.beautyTransactionRevision.create({data:{storeId:a.storeId,transactionId:payment.id,revision:1,note:corrected.note,revenueStaffId:corrected.revenueStaffId,actorUserId:a.userId!}});
        }
        return receipt;
      }),
    );
  });
}

export async function voidBeautyFee(input: unknown) {
  void input;
  return {success:false as const,error:'技師付款與收回由店家自行處理；既有紀錄保留。'};
}

export async function readBeautyCustomer(input: unknown) {
  return result(async () => {
    const a = await beautyManager("customer.read");
    await requireStoreFeature(a.storeId, FEATURES.CUSTOMER_MANAGEMENT);
    const { id } = z.object({ id: key }).parse(input);
    const customer = await prisma.customer.findFirst({
      where: { id, storeId: a.storeId, mergedIntoCustomerId: null },
      select: { id: true, name: true, phone: true, notes: true,updatedAt:true,email:true,gender:true,birthday:true,serviceNote:true,address:true,emergencyContactName:true,emergencyContactPhone:true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到顧客");
    const items = await beautyPrisma.beautyAppointment.findMany({
      where: { storeId: a.storeId, customerId: id },
      orderBy: { startsAt: "desc" },
      take: 200,
    });
    const viewer=await requirePermission("customer.read");
    const canTransactions=!!viewer&&await checkPermission(viewer.role,viewer.staffId,'transaction.read')&&await hasStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
    const ownedCards=canTransactions?await beautyPrisma.beautyCard.findMany({where:{storeId:a.storeId,customerId:id},select:{id:true}}):[];
    const payments=canTransactions?await beautyPrisma.beautyPayment.findMany({where:{storeId:a.storeId,kind:{in:['SALE','REFUND']},OR:[{appointmentId:{in:items.map(b=>b.id)}},{cardId:{in:ownedCards.map(c=>c.id)}}]},select:{id:true,kind:true,amount:true,method:true,note:true,createdAt:true},orderBy:{createdAt:'desc'},take:200}):[];
    return {
      canTransactions,
      payments:payments.map(p=>({...p,createdAt:p.createdAt.toISOString()})),
      customer: { ...customer, notes: customer.notes ?? "",updatedAt:customer.updatedAt.toISOString(),birthday:customer.birthday?.toISOString().slice(0,10)??"" },
      items: items.map((b) => ({
        id: b.id,
        serviceName: b.serviceName,
        startsAt: b.startsAt.toISOString(),
        status: b.status,
        notes: b.notes,
      })),
    };
  });
}
export async function saveBeautyCustomerProfile(input:unknown){
 return result(async()=>{
  const a=await beautyManager("customer.update",true);
  await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  const d=updateCustomerSchema.pick({name:true,phone:true,email:true,gender:true,birthday:true}).extend({id:key,expectedUpdatedAt:z.string().datetime(),address:z.string().trim().max(300),emergencyContactName:z.string().trim().max(100),emergencyContactPhone:z.string().trim().max(30)}).parse(input);
  return beautyTransaction(a,async tx=>{
   const n=await tx.$executeRaw`UPDATE "Customer" SET name=${d.name},phone=${d.phone},email=${d.email||null},gender=${d.gender||null},birthday=${d.birthday||null}::date,address=${d.address||null},"emergencyContactName"=${d.emergencyContactName||null},"emergencyContactPhone"=${d.emergencyContactPhone||null},"updatedAt"=NOW() WHERE id=${d.id} AND "storeId"=${a.storeId} AND "mergedIntoCustomerId" IS NULL AND "updatedAt"=${new Date(d.expectedUpdatedAt)}`;
   if(n!==1)throw new AppError("CONFLICT","顧客資料已更新，請重新開啟核對；輸入已保留");
   await audit(tx,a,"CUSTOMER_PROFILE",JSON.stringify({id:d.id}));
   return {id:d.id};
  });
 });
}
export async function updateBeautyCustomer(input: unknown) {
  return result(async () => {
    const a = await beautyManager("customer.update", true);
    await requireStoreFeature(a.storeId, FEATURES.CUSTOMER_MANAGEMENT);
    const fields = z.object({
      name: z.string().trim().min(1).max(80),
      phone: z.string().regex(/^09\d{8}$/),
      notes: z.string().max(1000),
    });
    const d = z
      .object({ id: key, expected: fields, values: fields })
      .parse(input);
    return beautyTransaction(a, async (tx) => {
      const n =
        await tx.$executeRaw`UPDATE "Customer" SET name=${d.values.name},phone=${d.values.phone},notes=${d.values.notes},"updatedAt"=NOW() WHERE id=${d.id} AND "storeId"=${a.storeId} AND "mergedIntoCustomerId" IS NULL AND name=${d.expected.name} AND phone=${d.expected.phone} AND COALESCE(notes,'')=${d.expected.notes}`;
      if (n !== 1)
        throw new AppError("CONFLICT", "顧客資料已更新，請重新載入核對");
      await audit(tx, a, "CUSTOMER_UPDATE", JSON.stringify(d));
      return { id: d.id };
    });
  });
}
export async function updateBeautyCardMembers(input: unknown) {
  return result(async () => {
    const a = await beautyManager("wallet.adjust", true);
    await requirePermission("customer.read");
    await requireStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT);
    const d = z
      .object({
        id: key,
        expected: z.array(key),
        memberIds: z.array(key).min(1).max(20),
        requestKey: z.string().uuid(),
      })
      .parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, async () => {
        const c = await tx.beautyCard.findFirst({
          where: { id: d.id, storeId: a.storeId, closedAt: null },
        });
        if (!c || !c.allowShared)
          throw new AppError("FORBIDDEN", "此方案不開放共用");
        if ([...c.memberIds].sort().join() !== [...d.expected].sort().join())
          throw new AppError("CONFLICT", "成員已更新，請重新載入");
        const members = [...new Set([c.customerId, ...d.memberIds])];
        const people = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Customer" WHERE "storeId"=${a.storeId} AND id=ANY(${members}::text[]) AND "mergedIntoCustomerId" IS NULL`;
        if (people.length !== members.length)
          throw new AppError("FORBIDDEN", "包含非本店有效顧客");
        const reservations=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,cardId:c.id,status:'RESERVED'},select:{customerId:true,group:{select:{customerId:true}}}});
        if(reservations.some(b=>!cardAllowsRecipient({...c,memberIds:members},b.customerId,b.group.customerId)))
          throw new AppError("CONFLICT", "被移除成員尚有方案預約，請先處理");
        await tx.beautyCard.update({
          where: { id: c.id },
          data: { memberIds: members },
        });
        await audit(
          tx,
          a,
          "CARD_MEMBERS",
          JSON.stringify({ before: c.memberIds, after: members, cardId: c.id }),
        );
        return { id: c.id };
      }),
    );
  });
}
export async function linkBeautyCustomer(input: unknown) {
  return result(async () => {
    const a = await beautyManager("booking.update", true);
    await requirePermission("customer.read");
    const d = z
      .object({
        id: key,
        customerId: key,
        revision: z.number().int().nonnegative(),
        requestKey: z.string().uuid(),
      })
      .parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, async () => {
        return linkCompanion(tx,a,d);
      }),
    );
  });
}
/** Ports for the existing Steamfoot companion identity editor. */
export async function findBeautyCompanionByPhone(input:unknown){
 return result(async()=>{
  const a=await beautyManager("booking.update");await requirePermission("customer.read");await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  const d=z.object({bookingId:key,phone:createCustomerSchema.shape.phone}).parse(input);
  await ownsItem(beautyPrisma as unknown as Prisma.TransactionClient,a,d.bookingId);
  const people=await prisma.customer.findMany({where:{storeId:a.storeId,phone:d.phone,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true},take:10});
  return people.map(p=>({id:p.id,name:p.name,phoneMasked:p.phone.slice(0,4)+"***"+p.phone.slice(-3)}));
 });
}
function companionRequest(input:unknown){
 const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export async function attachBeautyCompanion(input:unknown){
 return result(async()=>{
  const a=await beautyManager("booking.update",true);await requirePermission("customer.read");await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  const d=z.object({bookingId:key,revision:z.number().int().nonnegative(),customerId:key}).parse(input);
  return beautyTransaction(a,tx=>command(tx,a,companionRequest({kind:'attach',...d}),d,()=>linkCompanion(tx,a,{id:d.bookingId,revision:d.revision,customerId:d.customerId})));
 });
}
export async function createBeautyCompanion(input:unknown){
 return result(async()=>{
  const a=await beautyManager("booking.update",true);await requirePermission("customer.read");await requirePermission("customer.create");await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  const d=z.object({bookingId:key,revision:z.number().int().nonnegative(),name:createCustomerSchema.shape.name,phone:createCustomerSchema.shape.phone}).parse(input);
  const limits=await getStoreLimitsByStoreId(a.storeId);
  return beautyTransaction(a,tx=>command(tx,a,companionRequest({kind:'create',...d}),d,async()=>{
   const b=await ownsItem(tx,a,d.bookingId);if(b.revision!==d.revision||b.customerId)throw new AppError('CONFLICT','預約已更新或已有會員身分');
   const duplicate=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Customer" WHERE "storeId"=${a.storeId} AND phone=${d.phone} AND "mergedIntoCustomerId" IS NULL`;
   if(duplicate.length)throw new AppError('CONFLICT','此手機已在本店建檔，請核對後使用既有顧客');
   if(limits.maxCustomers!==null){const [count]=await tx.$queryRaw<{total:bigint}[]>`SELECT COUNT(*) AS total FROM "Customer" WHERE "storeId"=${a.storeId} AND "mergedIntoCustomerId" IS NULL`;if(Number(count.total)>=limits.maxCustomers)throw new AppError('FORBIDDEN','已達顧客額度上限');}
   const id=crypto.randomUUID();
   await tx.$executeRaw`INSERT INTO "Customer" (id,"storeId",name,phone,"authSource","customerStage","selfBookingEnabled","createdAt","updatedAt") VALUES (${id},${a.storeId},${d.name},${d.phone},'MANUAL','LEAD',false,NOW(),NOW())`;
   await audit(tx,a,'COMPANION_CUSTOMER_CREATE',JSON.stringify({appointmentId:b.id,customerId:id}),b.id);
   return linkCompanion(tx,a,{id:b.id,revision:b.revision,customerId:id});
  }));
 });
}
export async function readBeautyMoveSlots(
  mode: "member" | "work",
  input: unknown,
) {
  return result(async () => {
    const a = await bookingActor(mode, false),
      d = z
        .object({ id: key, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .parse(input);
    const tx = beautyPrisma as unknown as Prisma.TransactionClient,
      b = await ownsItem(tx, a, d.id);
    const loaded = await loadAvailability(tx, a, d.date, [b.id]),
      slots: string[] = [];
    for (const time of mode==='member'?loaded.memberSlots:loaded.slots) {
      if(mode==='member'&&!/:(00|30)$/.test(time))continue;
      try {
        await findAllocation(
          tx,
          a,
          {
            date: d.date,
            time,
            people: [
              {
                serviceId: b.serviceId,
                preference: b.preference as "ANY" | "FEMALE" | "MALE",
                specifiedTechnicianId:
                  a.technicianId ?? b.specifiedTechnicianId,
              },
            ] as z.infer<typeof partyInput>["people"],
          },
          [b.id],
          undefined,
          loaded,false,{serviceId:b.serviceId,duration:b.duration,buffer:b.buffer},
        );
        slots.push(time);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
      }
    }
    return { slots };
  });
}
