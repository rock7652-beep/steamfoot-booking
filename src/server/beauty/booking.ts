import "server-only";
import { cardAllowsRecipient,halfHourRule } from "@/lib/beauty/member-booking";
import { AppError } from "@/lib/errors";
import {
  dayRange,
  parseTaipeiDateTime,
  toLocalDateStr,
  addTaiwanDuration,
} from "@/lib/date-utils";
import {
  resolvedCourseHours,
  type Hour,
  type Special,
} from "@/lib/course-business-hours";
import { serviceDayRule } from "@/server/services/service-hours-state";
import {
  applySlotOverrides,
  type SlotOverrideRow,
} from "@/lib/business-hours-resolver";
import { allocateParty, serviceFee } from "@/lib/beauty/allocation";
import type { PartyInput } from "@/lib/beauty/contracts";
import type {
  Prisma,
  BeautyAppointment,
} from "../../../generated/beauty-client";
import { command, audit, type BeautyActor } from "./access";
export type Tx = Prisma.TransactionClient;
export type BookingPartyInput=Omit<PartyInput,'people'>&{people:(PartyInput['people'][number]&{pendingIdentity?:boolean})[]};
/** Same customer occupancy rule as the exclusion constraint, under the Store lock. */
export async function assertCustomerAvailable(
  tx: Tx,
  storeId: string,
  customerId: string | null,
  startsAt: Date,
  occupiedEndsAt: Date,
  excludeId?: string,
) {
  if (!customerId) return;
  if (await tx.beautyAppointment.count({
    where: {
      storeId,
      customerId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { not: "CANCELLED" },
      startsAt: { lt: occupiedEndsAt },
      occupiedEndsAt: { gt: startsAt },
    },
  })) throw new AppError("CONFLICT", "服務者已有重疊預約，請改選其他時間");
}
export async function settings(tx: Tx, storeId: string) {
  return (
    (await tx.beautySetting.findUnique({ where: { storeId } })) ?? {
      storeId,
      revision: 0,
      notifications: false,
      selfBooking: true,
      selfCancel: true,
      selfReschedule: true,
      cancelDeduct: false,
      noShowDeduct: false,
      leadMinutes: 0,
      cancelLeadMinutes: 240,
      bookableDays: 30,
    }
  );
}
export async function loadAvailability(
  tx: Tx,
  a: BeautyActor,
  date: string,
  excludeIds: string[] = [],
) {
  const range = dayRange(date);
  const [
    services,
    technicians,
    locations,
    occupied,
    hours,
    specials,
    policy,
    overrides,
  ] = await Promise.all([
    tx.beautyService.findMany({
      where: { storeId: a.storeId, active: true },
    }),
    tx.beautyTechnician.findMany({
      where: { storeId: a.storeId, active: true },
    }),
    tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND "isActive"=true`,
    tx.beautyAppointment.findMany({
      where: {
        storeId: a.storeId,
        id: { notIn: excludeIds },
        status: { not: "CANCELLED" },
        startsAt: { lt: range.end },
        occupiedEndsAt: { gt: range.start },
      },
    }),
    tx.$queryRaw<
      Hour[]
    >`SELECT * FROM "BusinessHours" WHERE "storeId"=${a.storeId}`,
    tx.$queryRaw<
      Special[]
    >`SELECT * FROM "SpecialBusinessDay" WHERE "storeId"=${a.storeId} AND date=${new Date(date + "T00:00:00Z")}::date`,
    settings(tx, a.storeId),
    tx.$queryRaw<
      SlotOverrideRow[]
    >`SELECT date,"startTime",type,capacity,reason FROM "SlotOverride" WHERE "storeId"=${a.storeId} AND date=${new Date(date + "T00:00:00Z")}::date`,
  ]);
  const rule=serviceDayRule({hours,specials:specials.map((s,i)=>({...s,id:String(i)})),overrides},date);
  const memberSlots=applySlotOverrides(halfHourRule(rule),overrides).filter(s=>s.isEnabled&&s.inRange&&s.capacity>0&&/:(00|30)$/.test(s.startTime)).map(s=>s.startTime);
  return {
    services,
    technicians,
    locations,
    occupied,
    hours,
    specials,
    policy,
    memberSlots,
    slots: applySlotOverrides(
      serviceDayRule(
        {
          hours,
          specials: specials.map((s, i) => ({ ...s, id: String(i) })),
          overrides,
        },
        date,
      ),
      overrides,
    )
      .filter((s) => s.isEnabled && s.inRange && s.capacity > 0)
      .map((s) => s.startTime),
  };
}
export async function findAllocation(
  tx: Tx,
  a: BeautyActor,
  d: Pick<PartyInput, "date" | "time" | "people">,
  excludeIds: string[] = [],
  onlyLocation?: string,
  loaded?: Awaited<ReturnType<typeof loadAvailability>>,
  allowPast = false,
) {
  const startsAt = parseTaipeiDateTime(d.date, d.time);
  if (!startsAt) throw new AppError("VALIDATION", "日期時間無效");
  const {
    services,
    technicians,
    locations,
    occupied,
    hours,
    specials,
    policy,
    slots,
    memberSlots,
  } = loaded ?? (await loadAvailability(tx, a, d.date, excludeIds));
  if (
    !allowPast &&
    (startsAt.getTime() <= Date.now() + policy.leadMinutes * 60000 ||
      d.date > addTaiwanDuration(toLocalDateStr(), policy.bookableDays, "DAY"))
  )
    throw new AppError("VALIDATION", "此時間尚未開放或已超過預約截止");
  if (!allowPast && !slots.includes(d.time) && !memberSlots.includes(d.time))
    throw new AppError("VALIDATION", "此開始時間未開放，請依營業預約單位選擇");
  const result = allocateParty({
    date: d.date,
    startsAt,
    people: d.people,
    services,
    technicians,
    locationIds: locations
      .filter((l) => !onlyLocation || l.id === onlyLocation)
      .map((l) => l.id),
    occupied: occupied.map((o) => ({
      start: +o.startsAt,
      end: +o.occupiedEndsAt,
      technicianId: o.technicianId,
      locationId: o.locationId,
      duration: o.duration,
      status: o.status,
    })),
    hours: resolvedCourseHours(d.date, hours, specials).periods.map((p) => ({
      start: p.openTime,
      end: p.closeTime,
    })),
  });
  if (!result)
    throw new AppError("CONFLICT", "這個時段無法安排全部同行者，請重新選擇");
  return { startsAt, services, policy, result };
}
export async function assertCard(
  tx: Tx,
  a: BeautyActor,
  cardId: string,
  customerId: string | null,
  serviceId: string,
  startsAt: Date,
  excludeId?: string,
  sponsorId?: string | null,
) {
  const card = await tx.beautyCard.findFirst({
    where: { id: cardId, storeId: a.storeId, closedAt: null },
  });
  if (
    !card ||
    card.expiresAt <= startsAt ||
    !card.serviceIds.includes(serviceId) ||
    !cardAllowsRecipient(card,customerId,sponsorId)
  )
    throw new AppError("FORBIDDEN", "此方案不適用或未授權此服務者");
  if (!a.manager && (!a.customerId || !card.memberIds.includes(a.customerId)))
    throw new AppError("FORBIDDEN", "無權使用此共用方案");
  const held = await tx.beautyAppointment.count({
    where: {
      storeId: a.storeId,
      cardId,
      status: "RESERVED",
      id: { not: excludeId },
    },
  });
  if (card.remaining - held < 1)
    throw new AppError("CONFLICT", "方案可用次數不足");
  return card;
}
export async function reserveParty(
  tx: Tx,
  a: BeautyActor,
  d: BookingPartyInput,
  entry?: {
    linkId: string;
    chatIdentity: string;
    channel: string;
    customerId?: string;
  },
) {
  return command(tx, a, d.requestKey, d, async () => {
    let groupCustomerId = a.customerId ?? null;
    if (entry?.channel === "LINE") {
      groupCustomerId = entry.customerId ?? crypto.randomUUID();
      if (!entry.customerId)
        await tx.$executeRaw`INSERT INTO "Customer" (id,"storeId",name,phone,"authSource","customerStage","selfBookingEnabled","lineUserId","lineLinkStatus","lineLinkedAt","createdAt","updatedAt") VALUES (${groupCustomerId},${a.storeId},${d.contactName},${d.phone},'MANUAL','LEAD',false,${entry.chatIdentity},'LINKED',NOW(),NOW(),NOW())`;
      const contact = d.people.find((p) => p.phone === d.phone);
      if (contact) contact.customerId = groupCustomerId;
    }
    const { startsAt, services, policy, result } = await findAllocation(
      tx,
      a,
      d,
    );
    if (
      d.policyRevision !== policy.revision ||
      d.people.some(
        (p) =>
          services.find((s) => s.id === p.serviceId)?.revision !==
          p.serviceRevision,
      )
    )
      throw new AppError(
        "CONFLICT",
        "服務價格或預約規則已更新，請重新載入核對後預約",
      );
    if (!a.manager && !policy.selfBooking)
      throw new AppError("FORBIDDEN", "店家已關閉自行預約");
    if (!a.manager && !a.customerId && !d.isTrial)
      throw new AppError("FORBIDDEN", "請先登入會員");
    if (d.people.some((p) => p.cardId) && d.isTrial)
      throw new AppError("VALIDATION", "體驗不使用一般方案");
    const partyKeys = new Set<string>();
    for (const p of d.people) {
      if(p.pendingIdentity){
        if(a.manager||!a.customerId||d.isTrial||p.customerId||p.phone)throw new AppError("FORBIDDEN","同行者資料待店家補齊");
        continue;
      }
      if (
        !a.manager &&
        p.customerId &&
        p.customerId !== a.customerId &&
        p.customerId !== groupCustomerId
      ) {
        if (!p.cardId)
          throw new AppError("FORBIDDEN", "代約會員須有具名共用方案授權");
        await assertCard(tx, a, p.cardId, p.customerId, p.serviceId, startsAt);
      }
      if (p.customerId) {
        const rows = await tx.$queryRaw<
          Array<{ id: string; name: string; phone: string }>
        >`SELECT id,name,phone FROM "Customer" WHERE id=${p.customerId} AND "storeId"=${a.storeId} AND "mergedIntoCustomerId" IS NULL`;
        if (!rows.length) throw new AppError("FORBIDDEN", "服務者不屬於本店");
        p.name = rows[0].name;
        p.phone = rows[0].phone;
      } else {
        if (p.cardId)
          throw new AppError("FORBIDDEN", "使用方案須選擇具名授權成員");
        const exists = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Customer" WHERE "storeId"=${a.storeId} AND phone=${p.phone}`;
        if (!exists.length) {
          p.customerId = crypto.randomUUID();
          await tx.$executeRaw`INSERT INTO "Customer" (id,"storeId",name,phone,"authSource","customerStage","selfBookingEnabled","createdAt","updatedAt") VALUES (${p.customerId},${a.storeId},${p.name},${p.phone},'MANUAL','LEAD',false,NOW(),NOW())`;
          // This is a new unlinked lead, never a member found solely by phone.
          if (!groupCustomerId && p.phone === d.phone)
            groupCustomerId = p.customerId;
        }
      }
      // A guest's phone can restrict promotional eligibility, never authorize CRM/card reads.
      const identity = p.customerId ?? p.phone,
        partyKey = identity + ":" + p.serviceId;
      const phoneKey = p.phone + ":" + p.serviceId;
      if (partyKeys.has(partyKey) || partyKeys.has(phoneKey))
        throw new AppError("VALIDATION", "同一位服務者不可重複預約相同服務");
      partyKeys.add(partyKey);
      partyKeys.add(phoneKey);
      if (d.isTrial) {
        const s = services.find((s) => s.id === p.serviceId);
        if (s?.trialPrice == null)
          throw new AppError("VALIDATION", "此服務未開放體驗");
        const prior = await tx.beautyAppointment.count({
          where: {
            storeId: a.storeId,
            serviceId: p.serviceId,
            isTrial: true,
            status: { not: "CANCELLED" },
            OR: [
              { personPhone: p.phone },
              ...(p.customerId ? [{ customerId: p.customerId }] : []),
            ],
          },
        });
        if (prior)
          throw new AppError(
            "BUSINESS_RULE",
            "每人每項服務限體驗一次，請改選一般服務",
          );
      }
      await assertCustomerAvailable(tx, a.storeId, p.customerId, startsAt,
        result[d.people.indexOf(p)].occupiedEndsAt);
    }
    const group = await tx.beautyGroup.create({
      data: {
        storeId: a.storeId,
        customerId: groupCustomerId,
        contactName: d.contactName,
        phone: d.phone,
        startsAt,
      },
    });
    const ids: string[] = [];
    for (const [i, p] of d.people.entries()) {
      const s = services.find((s) => s.id === p.serviceId)!,
        allocation = result[i];
      if (p.cardId) {
        await assertCard(tx, a, p.cardId, p.customerId, p.serviceId, startsAt, undefined, p.pendingIdentity?a.customerId:undefined);
      }
      const item = await tx.beautyAppointment.create({
        data: {
          storeId: a.storeId,
          groupId: group.id,
          customerId: p.customerId,
          personName: p.name,
          personPhone: p.phone,
          serviceId: s.id,
          serviceName: s.name,
          technicianId: allocation.technicianId,
          locationId: allocation.locationId,
          preference: p.preference,
          specifiedTechnicianId: p.specifiedTechnicianId,
          startsAt,
          endsAt: allocation.endsAt,
          occupiedEndsAt: allocation.occupiedEndsAt,
          duration: s.duration,
          buffer: s.buffer,
          price: d.isTrial ? s.trialPrice! : s.price,
          isTrial: d.isTrial,
          cardId: p.cardId,
          rate: allocation.rate,
          cancelDeduct: policy.cancelDeduct,
          noShowDeduct: policy.noShowDeduct,
          notes: p.notes,
        },
      });
      ids.push(item.id);
      if (p.cardId)
        await tx.beautyLedger.create({
          data: {
            storeId: a.storeId,
            cardId: p.cardId,
            appointmentId: item.id,
            kind: "RESERVE",
            delta: 0,
            actorUserId: a.userId,
          },
        });
      await tx.beautyEvent.create({
        data: {
          storeId: a.storeId,
          kind: "BOOKED",
          status: policy.notifications ? "PENDING" : "SKIPPED",
          appointmentId: item.id,
          customerId: p.customerId ?? groupCustomerId,
          body: `${s.name}｜${d.date} ${d.time}｜預約成功`,
        },
      });
    }
    if (entry) {
      const n =
        await tx.$executeRaw`UPDATE "TrialBookingLink" SET "consumedAt"=NOW() WHERE id=${entry.linkId} AND "storeId"=${a.storeId} AND "consumedAt" IS NULL AND "expiresAt">NOW()`;
      if (n !== 1) throw new AppError("CONFLICT", "預約連結已失效");
    }
    await audit(
      tx,
      a,
      "BOOK_GROUP",
      JSON.stringify({ groupId: group.id, ids }),
    );
    return { groupId: group.id, ids };
  });
}
export async function ownsItem(tx: Tx, a: BeautyActor, id: string) {
  const b = await tx.beautyAppointment.findFirst({
    where: { storeId: a.storeId, id },
    include: { group: true },
  });
  if (!b) throw new AppError("NOT_FOUND", "找不到本店預約");
  if (a.technicianId) {
    const current = await tx.beautyTechnician.findFirst({
      where: {
        id: a.technicianId,
        storeId: a.storeId,
        userId: a.userId,
        active: true,
      },
    });
    if (!current || b.technicianId !== current.id)
      throw new AppError("FORBIDDEN", "只能處理自己的服務");
  } else if (
    !a.manager &&
    b.customerId !== a.customerId &&
    b.group.customerId !== a.customerId
  )
    throw new AppError("FORBIDDEN", "無權操作此預約");
  return b;
}
export async function transition(
  tx: Tx,
  a: BeautyActor,
  input: { id: string; revision: number; target: string; reason: string },
) {
  const b = await ownsItem(tx, a, input.id);
  if (b.revision !== input.revision)
    throw new AppError("CONFLICT", "預約已更新，請重新核對");
  const policy = await settings(tx, a.storeId);
  if (a.technicianId) {
    const t = await tx.beautyTechnician.findFirstOrThrow({
      where: { storeId: a.storeId, id: a.technicianId },
    });
    if (
      !t.grants.includes(input.target === "CANCELLED" ? "cancel" : "complete")
    )
      throw new AppError("FORBIDDEN", "未授權此工作操作");
  } else if (!a.manager) {
    if (
      input.target !== "CANCELLED" ||
      !policy.selfCancel ||
      b.status !== "RESERVED" ||
      +b.startsAt <= Date.now() + policy.cancelLeadMinutes * 60000
    )
      throw new AppError("FORBIDDEN", "此預約請聯絡店家處理");
  }
  if (input.target === b.status) return { id: b.id };
  if (input.target === "RESERVED") {
    await assertCustomerAvailable(tx, a.storeId, b.customerId, b.startsAt,
      b.occupiedEndsAt, b.id);
    const date = toLocalDateStr(b.startsAt),
      time = b.startsAt.toLocaleTimeString("en-GB", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
      });
    await findAllocation(
      tx,
      a,
      {
        date,
        time,
        people: [
          {
            serviceId: b.serviceId,
            preference: b.preference as "ANY" | "FEMALE" | "MALE",
            specifiedTechnicianId: b.technicianId,
          } as PartyInput["people"][number],
        ],
      },
      [b.id],
      b.locationId,
      undefined,
      !!a.manager,
    );
  }
  const debit =
    input.target === "COMPLETED" ||
    (input.target === "CANCELLED" && b.cancelDeduct) ||
    (input.target === "NO_SHOW" && b.noShowDeduct);
  let card: null | Awaited<ReturnType<typeof assertCard>> = null;
  if (b.cardId) {
    if (debit && !b.debit)
      card = await assertCard(
        tx,
        { ...a, manager: a.manager || !!a.technicianId },
        b.cardId,
        b.customerId!,
        b.serviceId,
        b.startsAt,
        b.id,
        b.group.customerId,
      );
    else
      card = await tx.beautyCard.findFirst({
        where: { storeId: a.storeId, id: b.cardId },
      });
    if(input.target==='RESERVED'&&card&&!cardAllowsRecipient(card,b.customerId,b.group.customerId))throw new AppError("FORBIDDEN","此方案已無共用授權，請先由店家核對");
    if (!card || card.closedAt)
      throw new AppError("CONFLICT", "方案已結清，請先核對退款與更正");
    if (input.target === "RESERVED") {
      const held = await tx.beautyAppointment.count({
        where: {
          storeId: a.storeId,
          cardId: card.id,
          status: "RESERVED",
          id: { not: b.id },
        },
      });
      if (
        card.expiresAt < b.startsAt ||
        card.remaining + Number(b.debit) - held < 1
      )
        throw new AppError("CONFLICT", "方案不足或已過期，無法恢復預約");
    }
    const delta = Number(b.debit) - Number(debit);
    if (delta) {
      await tx.beautyCard.update({
        where: { id: card.id },
        data: { remaining: { increment: delta } },
      });
      await tx.beautyLedger.create({
        data: {
          storeId: a.storeId,
          cardId: card.id,
          appointmentId: b.id,
          kind: "CORRECTION",
          delta,
          actorUserId: a.userId,
        },
      });
    }
  }
  const payments = await tx.beautyPayment.findMany({
    where: {
      storeId: a.storeId,
      appointmentId: b.id,
      kind: { in: ["SALE", "REFUND"] },
    },
  });
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const fee =
    input.target === "COMPLETED"
      ? serviceFee(
          b.rate,
          card?.listPrice ?? b.price,
          card?.paid ?? paid,
          card?.sessions ?? 1,
          b.duration,
        )
      : 0;
  const feePayments = await tx.beautyPayment.aggregate({
    where: {
      storeId: a.storeId,
      appointmentId: b.id,
      kind: { in: ["FEE", "FEE_VOID"] },
    },
    _sum: { amount: true },
  });
  if ((feePayments._sum.amount ?? 0) && fee !== b.fee)
    throw new AppError("CONFLICT", "已有技師付款，請先核對付款更正");
  await tx.beautyAppointment.update({
    where: { id: b.id },
    data: { status: input.target, debit, fee, revision: { increment: 1 } },
  });
  await audit(
    tx,
    a,
    "STATUS",
    JSON.stringify({
      before: b.status,
      after: input.target,
      reason: input.reason,
      fee,
    }),
    b.id,
  );
  await tx.beautyEvent.create({
    data: {
      storeId: a.storeId,
      kind: input.target,
      status: policy.notifications ? "PENDING" : "SKIPPED",
      appointmentId: b.id,
      customerId: b.customerId ?? b.group.customerId,
      body: `${b.serviceName}｜${toLocalDateStr(b.startsAt)}｜${({ COMPLETED: "服務完成", CANCELLED: "預約取消", NO_SHOW: "未到紀錄", RESERVED: "恢復預約" } as Record<string, string>)[input.target]}`,
    },
  });
  return { id: b.id };
}
export function publicReceipt(b: BeautyAppointment) {
  return {
    id: b.id,
    serviceName: b.serviceName,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    status: b.status,
    price: b.price,
    personName: b.personName,
    preference: b.preference,
    cancelDeduct: b.cancelDeduct,
    noShowDeduct: b.noShowDeduct,
    isTrial: b.isTrial,
  };
}
