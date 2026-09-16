import { prisma } from "@/lib/db";
import { courseAccount } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { getCourseCards } from "@/server/queries/course-members";
import { CoursePortalClient } from "./course-portal-client";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreContext } from "@/lib/store-context";
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
        staff: { status: "ACTIVE" },
      },
      select: { staffId: true },
    }),
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true },
    }),
    prisma.shopConfig.findUnique({
      where: { storeId },
      select: {
        bankName: true,
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
  ] = await Promise.all([
    memberEnabled
      ? coursePrisma.courseSession.findMany({
          where: {
            storeId,
            cancelledAt: null,
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
            cardId: { in: cards.map((c) => c.id) },
            session: { startsAt: { gte: range.start, lte: range.end } },
          },
          include: {
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
            startsAt: { gte: range.start, lte: range.end },
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
    memberEnabled
      ? coursePrisma.coursePurchase.findMany({
          where: { storeId, customerId: customer.id },
          orderBy: { createdAt: "desc" },
        })
      : [],
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
            cardId: { in: cards.map((c) => c.id) },
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
  ]);
  return {
    month,
    serverNow: now.getTime(),
    customerId: customer.id,
    customerName: customer.name,
    storeName: store.name,
    prefix: context?.storeSlug ? `/s/${context.storeSlug}` : "",
    memberEnabled,
    hasWork: !!link,
    healthEnabled: memberEnabled && healthEnabled,
    config,
    cards,
    plans,
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
      notes: b.notes,
      cost: b.pointCost,
      unit: b.card.unit,
      planName: b.card.nameSnapshot,
      expiresAt: b.card.expiresAt.toISOString(),
    })),
    work: work.map((s) => ({
      id: s.id,
      name: s.nameSnapshot,
      startsAt: s.startsAt.toISOString(),
      room: s.room.name,
      bookings: s.bookings.map((b) => ({
        id: b.id,
        customerId: b.customerId,
        customerName: b.customerName,
        status: b.status,
        notes: b.notes,
        cost: b.pointCost,
        unit: b.card.unit,
        planName: b.card.nameSnapshot,
        expiresAt: b.card.expiresAt.toISOString(),
      })),
    })),
    orders: orders.map((o) => ({
      ...o,
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
export async function CoursePortal({ month }: { month?: string }) {
  return <CoursePortalClient {...await loadCoursePortal(month)} />;
}
