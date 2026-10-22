"use server";
import { memberPartyInput, cardAllowsRecipient } from "@/lib/beauty/member-booking";
import type { BookingPartyInput } from "@/server/beauty/booking";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission,checkPermission } from "@/lib/permissions";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature,hasStoreFeature } from "@/lib/feature-gate";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  serviceInput,
  technicianInput,
  planInput,
  settingsInput,
  partyInput,
  changeInput,
  paymentInput,
  cardInput,
  refundInput,
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
  payFee,
  voidFee,
} from "@/server/beauty/commerce";
import { resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
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
    if (kind === "technician") {
      await requirePermission("teacher.compensation.read");
      await requirePermission("teacher.compensation.manage");
    }
    return beautyTransaction(a, async (tx) => {
      if (kind === "service") {
        const { id, revision, ...d } = serviceInput.parse(input);
        if (id) {
          const prior = await tx.beautyService.findFirst({
            where: { storeId: a.storeId, id, revision },
          });
          if (!prior) throw new AppError("CONFLICT", "服務已更新，請重新開啟");
          if (
            !d.active &&
            (await tx.beautyAppointment.count({
              where: { storeId: a.storeId, serviceId: id, status: "RESERVED" },
            }))
          )
            throw new AppError("CONFLICT", "請先處理未來預約再下架");
          await tx.beautyService.update({
            where: { id },
            data: { ...d, revision: { increment: 1 } },
          });
        } else
          await tx.beautyService.create({ data: { ...d, storeId: a.storeId } });
      } else if (kind === "plan") {
        const { id, revision, ...d } = planInput.parse(input);
        if (
          (await tx.beautyService.count({
            where: { storeId: a.storeId, id: { in: d.serviceIds } },
          })) !== new Set(d.serviceIds).size
        )
          throw new AppError("FORBIDDEN", "方案包含非本店服務");
        if (id) {
          if (
            !(await tx.beautyPlan.findFirst({
              where: { storeId: a.storeId, id, revision },
            }))
          )
            throw new AppError("CONFLICT", "方案已更新");
          await tx.beautyPlan.update({
            where: { id },
            data: { ...d, revision: { increment: 1 } },
          });
        } else
          await tx.beautyPlan.create({ data: { ...d, storeId: a.storeId } });
      } else {
        const { id, revision, ...d } = technicianInput.parse(input);
        if (
          (await tx.beautyService.count({
            where: { storeId: a.storeId, id: { in: d.serviceIds } },
          })) !== new Set(d.serviceIds).size
        )
          throw new AppError("FORBIDDEN", "包含非本店服務");
        if (d.serviceIds.some((id) => !d.rates[id]))
          throw new AppError(
            "VALIDATION",
            "每項可服務項目須設定計酬，無報酬可填固定0元",
          );
        if (
          d.userId &&
          !(await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT c.id FROM "Customer" c WHERE c."storeId"=${a.storeId} AND c."userId"=${d.userId} AND c."mergedIntoCustomerId" IS NULL`.then(
            (r) => r.length,
          ))
        )
          throw new AppError("FORBIDDEN", "請選擇本店已連結會員帳號");
        if (id) {
          if (
            !(await tx.beautyTechnician.findFirst({
              where: { storeId: a.storeId, id, revision },
            }))
          )
            throw new AppError("CONFLICT", "技師設定已更新");
          const future = await tx.beautyAppointment.findMany({
            where: {
              storeId: a.storeId,
              technicianId: id,
              status: "RESERVED",
              occupiedEndsAt: { gt: new Date() },
            },
          });
          const { availableTechnician } =
            await import("@/lib/beauty/allocation");
          if (
            future.some(
              (b) =>
                !d.active ||
                !d.serviceIds.includes(b.serviceId) ||
                (b.preference !== "ANY" && b.preference !== d.gender) ||
                !availableTechnician(
                  { ...d, id },
                  toLocalDateStr(b.startsAt),
                  +b.startsAt,
                  +b.occupiedEndsAt,
                ),
            )
          )
            throw new AppError("CONFLICT", "設定影響既有預約，請先處理班表");
          await tx.beautyTechnician.update({
            where: { id },
            data: { ...d, revision: { increment: 1 } },
          });
        } else
          await tx.beautyTechnician.create({
            data: { ...d, storeId: a.storeId },
          });
      }
      await audit(tx, a, "CATALOG", JSON.stringify({ kind, input }));
      return { saved: true };
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
        })
        .parse(input);
    return beautyTransaction(a, async (tx) => {
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
        await tx.$executeRaw`UPDATE "CourseRoom" SET name=${d.name},"isActive"=${d.active} WHERE id=${d.id} AND "storeId"=${a.storeId}`;
      } else
        await tx.$executeRaw`INSERT INTO "CourseRoom" (id,"storeId",name,capacity,details,category,"isActive","createdAt",equipment,location,"rentalEnabled","rentalHourlyRate","rentalBufferMinutes") VALUES (${crypto.randomUUID()},${a.storeId},${d.name},1,'','',${d.active},NOW(),'','',false,0,0)`;
      await audit(tx, a, "LOCATION", JSON.stringify(d));
      return { saved: true };
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
async function bookingInput(mode:"manager"|"member",input:unknown,a:BeautyActor):Promise<BookingPartyInput>{
  if(mode==='manager')return partyInput.parse(input);
  const d=memberPartyInput.parse(input);
  const person=await prisma.customer.findFirst({where:{storeId:a.storeId,id:a.customerId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true}});
  if(!person||!person.phone)throw new AppError('FORBIDDEN','請重新登入或聯絡店家核對會員資料');
  return {...d,contactName:person.name,phone:person.phone,isTrial:false,people:d.people.map((p,i)=>({...p,preference:'ANY',customerId:i===0?person.id:null,name:i===0?person.name:`同行者 ${i}`,phone:i===0?person.phone:'',pendingIdentity:i>0}))};
}
export async function bookBeautyParty(
  mode: "manager" | "member",
  input: unknown,
) {
  return result(async () => {
    const a = await bookingActor(mode),
      d = await bookingInput(mode,input,a);
    if (d.people.some((p) => p.cardId))
      await requireStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT);
    return beautyTransaction(a, (tx) => reserveParty(tx, a, d));
  });
}
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
      return previous.result as { groupId: string; ids: string[] };
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
    return beautyTransaction(a, (tx) =>
      reserveParty(tx, a, d, entry ? { ...entry, customerId } : undefined),
    );
  });
}
export async function readBeautySlots(
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
    } else a = await bookingActor(mode, false);
    const d=mode==='public'?partyInput.parse(input):await bookingInput(mode,input,a);
    const loaded = await loadAvailability(
      beautyPrisma as unknown as Prisma.TransactionClient,
      a,
      d.date,
    );
    const slots: string[] = [];
    // Public catalog reveals availability only, never names of other customers.
    for (const time of mode==='member'?loaded.memberSlots:loaded.slots) {
      if(mode==='member'&&!/:(00|30)$/.test(time))continue;
      try {
        await findAllocation(
          beautyPrisma as unknown as Prisma.TransactionClient,
          a,
          { ...d, time },
          [],
          undefined,
          loaded,
        );
        slots.push(time);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
      }
    }
    return { slots };
  });
}
export async function changeBeautyStatus(
  mode: "manager" | "member" | "work",
  input: unknown,
) {
  return result(async () => {
    const a =
        mode === "manager"
          ? await beautyManager("booking.update", true)
          : await bookingActor(mode),
      d = changeInput.parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, () => transition(tx, a, d)),
    );
  });
}
export async function moveBeautyAppointment(
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
            status: policy.notifications ? "PENDING" : "SKIPPED",
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
export async function collectBeautyPayment(input: unknown) {
  return result(async () => {
    const a = await beautyManager("transaction.create", true);
    await requireStoreFeature(a.storeId, FEATURES.TRANSACTION_MANAGEMENT);
    return beautyTransaction(a, (tx) =>
      collect(tx, a, paymentInput.parse(input)),
    );
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
export async function payBeautyFee(input: unknown) {
  return result(async () => {
    const a = await beautyManager("teacher.settlement.pay", true);
    await requirePermission("cashbook.create");
    await requireStoreFeature(a.storeId, FEATURES.SERVICE_FEE_CALCULATOR);
    const d = z
      .object({
        requestKey: z.string().uuid(),
        id: key,
        amount: z.number().int().positive(),
        method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
        note: z.string().max(500),
      })
      .parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, () => payFee(tx, a, d)),
    );
  });
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
    return beautyTransaction(a, (tx) =>
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
            snapshot: plan,
            lastFour: d.lastFour,
          },
        });
        await audit(
          tx,
          a,
          "PURCHASE_PENDING",
          JSON.stringify({ orderId: order.id }),
        );
        return { id: order.id };
      }),
    );
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
          { ...snapshot, id: snapshot.id, storeId: a.storeId },
        );
        await tx.beautyPurchase.update({
          where: { id: order.id },
          data: { cardId: receipt.cardId, status: "CONFIRMED" },
        });
        return receipt;
      }),
    );
  });
}

export async function voidBeautyFee(input: unknown) {
  return result(async () => {
    const a = await beautyManager("teacher.settlement.pay", true);
    await requirePermission("cashbook.create");
    await requireStoreFeature(a.storeId, FEATURES.SERVICE_FEE_CALCULATOR);
    const d = refundInput.parse(input);
    return beautyTransaction(a, (tx) =>
      command(tx, a, d.requestKey, d, () => voidFee(tx, a, d)),
    );
  });
}

export async function readBeautyCustomer(input: unknown) {
  return result(async () => {
    const a = await beautyManager("customer.read");
    await requireStoreFeature(a.storeId, FEATURES.CUSTOMER_MANAGEMENT);
    const { id } = z.object({ id: key }).parse(input);
    const customer = await prisma.customer.findFirst({
      where: { id, storeId: a.storeId, mergedIntoCustomerId: null },
      select: { id: true, name: true, phone: true, notes: true },
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
      customer: { ...customer, notes: customer.notes ?? "" },
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
        const b = await ownsItem(tx, a, d.id);
        if (b.revision !== d.revision || b.customerId)
          throw new AppError("CONFLICT", "預約已更新或已有會員身分");
        const [person] = await tx.$queryRaw<
          Array<{ id: string; name:string; phone: string }>
        >`SELECT id,name,phone FROM "Customer" WHERE id=${d.customerId} AND "storeId"=${a.storeId} AND "mergedIntoCustomerId" IS NULL`;
        if (!person) throw new AppError("FORBIDDEN", "顧客不屬於本店");
        if (
          b.isTrial &&
          (await tx.beautyAppointment.count({
            where: {
              storeId: a.storeId,
              serviceId: b.serviceId,
              customerId: person.id,
              isTrial: true,
              status: { not: "CANCELLED" },
              id: { not: b.id },
            },
          }))
        )
          throw new AppError(
            "CONFLICT",
            "此顧客已有同項服務體驗，請先核對紀錄",
          );
        await assertCustomerAvailable(tx,a.storeId,person.id,b.startsAt,b.occupiedEndsAt,b.id);
        if(b.cardId){
          const card=await tx.beautyCard.findFirst({where:{id:b.cardId,storeId:a.storeId}});
          if(!card||!cardAllowsRecipient(card,person.id,b.group.customerId))throw new AppError('FORBIDDEN','此方案未開放共用，請先由店家核對');
        }
        await tx.beautyAppointment.update({
          where: { id: b.id },
          data: { customerId: person.id,personName:person.name,personPhone:person.phone, revision: { increment: 1 } },
        });
        if (!b.group.customerId && b.group.phone === person.phone)
          await tx.beautyGroup.update({
            where: { id: b.groupId },
            data: { customerId: person.id },
          });
        await audit(
          tx,
          a,
          "CUSTOMER_LINK",
          JSON.stringify({ appointmentId: b.id, customerId: person.id }),
        );
        return { id: b.id };
      }),
    );
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
          loaded,
        );
        slots.push(time);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
      }
    }
    return { slots };
  });
}
