import { getReferralShareContext } from "@/server/queries/referral-share-context";
import { prisma } from "@/lib/db";
import { resolveCustomerBookingWindow } from "@/lib/shop-config";
import { courseAccount } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { getCourseCards } from "@/server/queries/course-members";
import { CoursePortalClient } from "./course-portal-client";
import { monthRange, toLocalMonthStr, parseTaipeiDateTime, dayRange, toLocalDateStr, addTaiwanDuration } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreContext } from "@/lib/store-context";
import { coursePointEffect, type CourseConsumptionRow } from "@/lib/course-consumption";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "轉帳",
  BANK_TRANSFER: "轉帳",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  CARD: "信用卡",
  OTHER: "其他非現金",
  STORED_VALUE: "儲值金",
};

const paymentLabel = (value: string | null | undefined) =>
  value ? (PAYMENT_LABELS[value] ?? "其他") : "未註明";

export async function loadCoursePortal(requestedMonth?: string) {
  const month =
    requestedMonth && /^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : toLocalMonthStr();
  const range = monthRange(month),
    now = new Date();
  const { user, storeId, customer } = await courseAccount();
  const [
    identity,
    link,
    store,
    config,
    context,
    hours,
    special,
    healthEnabled,
    emergencyContact,
  ] = await Promise.all([
    prisma.staffMemberLink.findUnique({
      where: { uq_staff_member_link_user_store: { userId: user.id, storeId } },
      select: { courseMemberEnabled: true },
    }),
    prisma.staffMemberLink.findFirst({
      where: {
        userId: user.id,
        storeId,
        revokedAt: null,
        staff: { status: "ACTIVE", courseCoachEnabled:true },
      },
      select: { staffId: true },
    }),
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true, slug: true },
    }),
    prisma.shopConfig.findUnique({
      where: { storeId },
      select: {
        bankName: true,
        bookableUntilDate: true, bookingOpensAt: true, bookingWindowDays: true,
        bankCode: true,
        bankAccountNumber: true,
        lineOfficialUrl: true,
        address: true,
        mapUrl: true,
      },
    }),
    getStoreContext(),
    prisma.businessHours.findMany({
      where: { storeId },
      select: { dayOfWeek: true, isOpen: true },
    }),
    prisma.specialBusinessDay.findMany({
      where: { storeId, date: { gte: range.start, lte: range.end } },
      select: { date: true, type: true },
    }),
    hasStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY).catch(() => false),
    prisma.customer.findFirst({ where: { id: customer.id, storeId, mergedIntoCustomerId: null }, select: { emergencyContactName: true, emergencyContactPhone: true } }),
  ]);
  const memberEnabled = identity?.courseMemberEnabled !== false;
  const cards = memberEnabled ? await getCourseCards(storeId, customer.id) : [];
  const sessionInclude = {
    room: { select: { name: true } },
    template: { select: { precautions: true } },
    _count: {
      select: { bookings: { where: { status: { not: "CANCELLED" } } } },
    },
  } as const;
  const workInclude = {
    room: { select: { name: true } },
    bookings: {
      orderBy: { createdAt: "asc" },
      include: {
        trialPayments: {where:{status:"SUCCESS"},select:{amount:true}},
        card: { select: { nameSnapshot: true, expiresAt: true, unit: true } },
      },
    },
  } as const;
  const [
    sessions,
    bookings,
    work,
    plans,
    orders,
    templates,
    health,
    healthCount,
    nextBooking,
    nextWork,
    pointEntries,
    trialPayments,
    retailEntries,
  ] = await Promise.all([
    memberEnabled
      ? coursePrisma.courseSession.findMany({
          where: {
            storeId,
            cancelledAt: null,
            template: {isActive:true,visibility:"PUBLIC"},
            startsAt: { gte: range.start, lte: range.end },
          },
          include: sessionInclude,
          orderBy: { startsAt: "asc" },
        })
      : [],
    memberEnabled
      ? coursePrisma.courseBooking.findMany({
          where: {
            storeId,
            OR: [{cardId: { in: cards.map((c) => c.id) }},{bookingKind:"TRIAL",customerId:customer.id}],
            session: { startsAt: { gte: range.start, lte: range.end } },
          },
          include: {
            trialPayments: {where:{status:"SUCCESS"},select:{amount:true}},
            session: {
              select: {
                nameSnapshot: true,
                startsAt: true,
                room: { select: { name: true } },
              },
            },
            card: {
              select: { nameSnapshot: true, expiresAt: true, unit: true },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [],
    link
      ? coursePrisma.courseSession.findMany({
          where: {
            storeId,
            coachId: link.staffId,
            cancelledAt: null,
            OR: [
              { startsAt: { gte: dayRange(addTaiwanDuration(toLocalDateStr(range.start), -6, "DAY")).start, lte: dayRange(addTaiwanDuration(toLocalDateStr(range.end), 6, "DAY")).end } },
              { endsAt: { lte: now }, bookings: { some: { status: "RESERVED" } } },
              { startsAt: { gte: dayRange(toLocalDateStr(now)).start, lte: dayRange(toLocalDateStr(now)).end } },
            ],
          },
          include: workInclude,
          orderBy: { startsAt: "asc" },
        })
      : [],
    memberEnabled
      ? coursePrisma.coursePointPlan.findMany({
          where: { storeId, isActive: true },
          orderBy: { price: "asc" },
        })
      : [],
    coursePrisma.coursePurchase.findMany({
      where: { storeId, customerId: customer.id },
      include: { refunds: { where: {storeId}, select:{id:true,amount:true,method:true,createdAt:true}, orderBy:{createdAt:"asc"} } },
      orderBy: { createdAt: "desc" },
    }),
    coursePrisma.courseTemplate.findMany({
      where: { storeId },
      select: { id: true, name: true },
    }),
    memberEnabled && healthEnabled
      ? prisma.customerHealthRecord.findMany({
          where: { storeId, customerId: customer.id },
          orderBy: { measuredAt: "desc" },
          take: 100,
        })
      : [],
    memberEnabled && healthEnabled
      ? prisma.customerHealthRecord.count({
          where: { storeId, customerId: customer.id },
        })
      : 0,
    memberEnabled
      ? coursePrisma.courseBooking.findFirst({
          where: {
            storeId,
            OR: [{cardId: { in: cards.map((c) => c.id) }},{bookingKind:"TRIAL",customerId:customer.id}],
            status: "RESERVED",
            session: { cancelledAt: null, startsAt: { gte: now } },
          },
          include: {
            session: {
              select: {
                nameSnapshot: true,
                startsAt: true,
                room: { select: { name: true } },
              },
            },
          },
          orderBy: { session: { startsAt: "asc" } },
        })
      : null,
    link
      ? coursePrisma.courseSession.findFirst({
          where: {
            storeId,
            coachId: link.staffId,
            cancelledAt: null,
            startsAt: { gte: now },
          },
          select: {
            id: true,
            nameSnapshot: true,
            startsAt: true,
            room: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
        })
      : null,
    coursePrisma.coursePointEntry.findMany({
      where: {
        storeId,
        createdAt: { gte: range.start, lte: range.end },
        booking: { customerId: customer.id },
      },
      select: {
        id: true,
        kind: true,
        points: true,
        createdAt: true,
        card: { select: { nameSnapshot: true, unit: true, termSessionIds: true } },
        booking: {
          select: {
            session: { select: { nameSnapshot: true, startsAt: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    coursePrisma.courseTrialPayment.findMany({
      where: {
        storeId,
        createdAt: { gte: range.start, lte: range.end },
        booking: { customerId: customer.id },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        booking: { select: { session: { select: { nameSnapshot: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.cashbookEntry.findMany({
      where: {
        storeId,
        customerId: customer.id,
        entryDate: { gte: range.start, lte: range.end },
        NOT: [
          { id: { startsWith: "course-purchase:" } },
          { id: { startsWith: "course-refund:" } },
          { id: { startsWith: "course-void:" } },
          { id: { startsWith: "course-trial:" } },
          { id: { startsWith: "course-trial-void:" } },
          { id: { startsWith: "course-fee:" } },
          { id: { startsWith: "course-fee-void:" } },
        ],
      },
      select: { id: true, entryDate: true, type: true, category: true, amount: true, paymentMethod: true, note: true },
      orderBy: { entryDate: "desc" },
      take: 100,
    }),
  ]);
  const inSelectedMonth = (date: Date) => date >= range.start && date <= range.end;
  const consumption: CourseConsumptionRow[] = [];

  for (const order of orders) {
    if (inSelectedMonth(order.createdAt)) {
      consumption.push({
        id: `purchase:${order.id}`,
        date: order.createdAt.toISOString(),
        type: "PAYMENT",
        title: order.name,
        detail: `${order.points} ${order.unit === "SESSION" ? "堂" : "點"}方案 · ${paymentLabel(order.paymentMethod ?? "BANK_TRANSFER")}`,
        status: order.status === "CONFIRMED" ? "已付款並啟用" : order.status === "PENDING" ? "待核帳（尚未取得額度）" : order.status === "REFUNDED" ? "已退款" : "已作廢",
        planName: order.name,
        amount: order.price,
        quantity: null,
        unit: null,
      });
    }
    for (const refund of order.refunds) {
      if (!inSelectedMonth(refund.createdAt)) continue;
      consumption.push({
        id: `purchase-refund:${refund.id}`,
        date: refund.createdAt.toISOString(),
        type: "REFUND",
        title: `${order.name}退款`,
        detail: COURSE_REFUND_METHOD_LABELS[refund.method] ?? "其他非現金",
        status: "已登錄退款",
        planName: order.name,
        amount: -refund.amount,
        quantity: null,
        unit: null,
      });
    }
  }

  for (const entry of pointEntries) {
    if (!entry.booking) continue;
    const effect = coursePointEffect(entry.kind, entry.points, entry.card.termSessionIds.length > 0);
    if (!effect) continue;
    consumption.push({
      id: `point:${entry.id}`,
      date: entry.createdAt.toISOString(),
      type: effect.type,
      title: entry.booking.session.nameSnapshot,
      detail: `上課日 ${toLocalDateStr(entry.booking.session.startsAt)}`,
      status: effect.status,
      planName: entry.card.nameSnapshot,
      amount: null,
      quantity: effect.quantity,
      unit: entry.card.unit === "SESSION" ? "堂" : "點",
    });
  }

  for (const receipt of trialPayments) {
    const voided = receipt.status === "VOIDED";
    consumption.push({
      id: `trial:${receipt.id}`,
      date: receipt.createdAt.toISOString(),
      type: voided ? "REFUND" : "PAYMENT",
      title: receipt.booking.session.nameSnapshot,
      detail: `體驗課程 · ${paymentLabel(receipt.paymentMethod)}`,
      status: voided ? "收款已作廢" : "已付款",
      planName: null,
      amount: voided ? -receipt.amount : receipt.amount,
      quantity: null,
      unit: null,
    });
  }

  for (const entry of retailEntries) {
    const refund = entry.type === "EXPENSE";
    consumption.push({
      id: `retail:${entry.id}`,
      date: entry.entryDate.toISOString(),
      type: refund ? "REFUND" : "PAYMENT",
      title: entry.category?.replace(/^零售-/, "") || "店內消費",
      detail: `${paymentLabel(entry.paymentMethod)}${entry.note ? ` · ${entry.note}` : ""}`,
      status: refund ? "退款／沖銷" : "已付款",
      planName: null,
      amount: refund ? -Number(entry.amount) : Number(entry.amount),
      quantity: null,
      unit: null,
    });
  }

  consumption.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const referralShare = memberEnabled ? await getReferralShareContext({ customerId: customer.id, storeId, storeSlug: store.slug }) : null;
  // Only customers on this authorized coach's own sessions are read.
  const workCustomers = work.length ? await prisma.customer.findMany({
    where: {storeId, id:{in:[...new Set(work.flatMap(s=>s.bookings.map(b=>b.customerId)))]}},
    select:{id:true, serviceNote:true, notes:true},
  }) : [];
  return {
    referralShare: referralShare?.available ? referralShare : null,
    month,
    serverNow: now.getTime(),
    customerId: customer.id,
    customerName: customer.name,
    emergencyContact: memberEnabled ? emergencyContact : null,
    storeName: store.name,
    prefix: context?.storeSlug ? `/s/${context.storeSlug}` : "",
    memberEnabled,
    hasWork: !!link,
    consumption,
    healthEnabled: memberEnabled && healthEnabled,
    config,
    cards,
    bookingWindow: {closesAt:resolveCustomerBookingWindow(config,now).closesAt.toISOString(),opensAt:config?.bookingOpensAt?.toISOString()??null},
    plans:plans.map(p=>({id:p.id,name:p.name,points:p.points,price:p.price,unit:p.unit,validDays:p.validDays,templateIds:p.templateIds,termSessionIds:p.termSessionIds})),
    templates,
    hours,
    special: special.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      type: s.type,
    })),
    nextBooking: nextBooking
      ? {
          name: nextBooking.session.nameSnapshot,
          startsAt: nextBooking.session.startsAt.toISOString(),
          customerName: nextBooking.customerName,
          room: nextBooking.session.room.name,
        }
      : null,
    nextWork: nextWork
      ? {
          id: nextWork.id,
          name: nextWork.nameSnapshot,
          startsAt: nextWork.startsAt.toISOString(),
          room: nextWork.room.name,
        }
      : null,
    sessions: sessions.map((s) => ({
      id: s.id,
      templateId: s.templateId,
      name: s.nameSnapshot,
      startsAt: s.startsAt.toISOString(),
      room: s.room.name,
      cost: s.pointCost,
      capacity: s.capacity,
      occupied: s._count.bookings,
      precautions: s.template.precautions,
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      sessionId: b.sessionId,
      name: b.session.nameSnapshot,
      startsAt: b.session.startsAt.toISOString(),
      room: b.session.room.name,
      customerName: b.customerName,
      customerId: b.customerId,
      operatorName: b.operatorName,
      status: b.status,
      notes: "",
      cost: b.pointCost,
      trialPaid: b.trialPayments[0]?.amount ?? null,
      trialPrice: b.trialPrice,
      unit: b.card?.unit ?? "TRIAL",
      planName: b.card?.nameSnapshot ?? "體驗（不使用方案）",
      expiresAt: b.card?.expiresAt.toISOString() ?? null,
    })),
    work: work.map((s) => ({
      id: s.id,
      name: s.nameSnapshot,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      room: s.room.name,
      bookings: s.bookings.map((b) => ({
        id: b.id,
        customerId: b.customerId,
        customerName: b.customerName,
        status: b.status,
        checkedIn: !!b.checkedInAt,
        updatedAt: b.updatedAt.toISOString(),
        notes: b.notes,
        serviceNote: workCustomers.filter(c=>c.id===b.customerId).flatMap(c=>[c.serviceNote,c.notes]).filter(Boolean).join("\n"),
        cost: b.pointCost,
        unit: b.card?.unit ?? "TRIAL",
        planName: b.card?.nameSnapshot ?? "體驗（不使用方案）",
        expiresAt: b.card?.expiresAt.toISOString() ?? null,
      })),
    })),
    orders: orders.map((o) => ({
      id:o.id,name:o.name,price:o.price,status:o.status,transferLastFive:o.transferLastFive,
      refunds: (o.refunds??[]).map(r=>({...r,createdAt:r.createdAt.toISOString()})),
      createdAt: o.createdAt.toISOString(),
      confirmedAt: o.confirmedAt?.toISOString() ?? null,
    })),
    healthCount,
    health: health.map((h) => ({
      id: h.id,
      measuredAt: h.measuredAt.toISOString().slice(0, 10),
      weight: h.weight,
      bodyFat: h.bodyFat,
      bmi: h.bmi,
      muscleMass: h.muscleMass,
      boneMass: h.boneMass,
      visceralFat: h.visceralFat,
      bmr: h.bmr,
      bodyWater: h.bodyWater,
      metabolicAge: h.metabolicAge,
    })),
  };
}
export type CoursePortalData = Awaited<ReturnType<typeof loadCoursePortal>>;
export async function CoursePortal({ month, date, view }: { month?: string; date?: string; view?: string }) {
  const selectedDate = date && /^20\d{2}-\d{2}-\d{2}$/.test(date) && parseTaipeiDateTime(date, "00:00") ? date : undefined;
  return <CoursePortalClient {...await loadCoursePortal(selectedDate?.slice(0,7) ?? month)} initialDate={selectedDate} initialView={view === "bookings" ? "bookings" : view === "plans" ? "plans" : "home"} />;
}
