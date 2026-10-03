import { authorizeFrontendPreview, type FrontendPreviewSelection } from "@/server/services/frontend-preview";
import { cookies } from "next/headers";
import { coursePortalRoleCookie, resolveCoursePortalRole } from "@/lib/course-portal-role";
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
import { personalIncomeAccess } from "@/server/services/course-personal-income";
export async function loadCoursePortal(requestedMonth?: string, preview?: FrontendPreviewSelection) {
  const month =
    requestedMonth && /^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : toLocalMonthStr();
  const range = monthRange(month),
    now = new Date();
  const access = preview ? await authorizeFrontendPreview(preview) : null;
  if (access && access.moduleId !== "course") throw new Error("課程模組不符");
  const { user, storeId, customer } = access
    ? { user: { id: access.personUserId ?? "" }, storeId: access.storeId, customer: { id: access.role === "member" ? access.personId : "", name: access.name } }
    : await courseAccount();
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
    incomeAccess,
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
    access ? Promise.resolve({ storeSlug: (await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { slug: true } })).slug }) : getStoreContext(),
    prisma.businessHours.findMany({
      where: { storeId },
      select: { dayOfWeek: true, isOpen: true },
    }),
    prisma.specialBusinessDay.findMany({
      where: { storeId, date: { gte: range.start, lte: range.end } },
      select: { date: true, type: true },
    }),
    access ? Promise.resolve(false) : hasStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY).catch(() => false),
    prisma.customer.findFirst({ where: { id: customer.id, storeId, mergedIntoCustomerId: null }, select: { emergencyContactName: true, emergencyContactPhone: true } }),
    access ? Promise.resolve(null) : personalIncomeAccess(user.id, storeId),
  ]);
  const memberEnabled = access ? access.role === "member" : identity?.courseMemberEnabled !== false;
  const workLink = access ? (access.role === "work" ? { staffId: access.personId } : null) : link;
  const musicStore = !!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
  const waitlistFeature = await hasStoreFeature(storeId, FEATURES.COURSE_WAITLIST);
  const waitlistSetting = waitlistFeature
    ? await coursePrisma.courseWaitlistSetting.findUnique({ where: { storeId } })
    : null;
  const waitlistEnabled = waitlistFeature && (waitlistSetting?.enabled ?? false);
  const cards = memberEnabled ? (await getCourseCards(storeId, customer.id)).filter(card => !musicStore || card.unit === "SESSION") : [];
  const sessionInclude = {
    room: { select: { name: true } },
    template: { select: { precautions: true, waitlistEnabled: true, waitlistLimit: true, waitlistStopMinutes: true } },
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
        card: { select: { nameSnapshot: true, expiresAt: true, unit: true, remaining: true, closedAt: true, termSessionIds: true, plan: {select: {allowShared: true}}, bookings: { where: { storeId, status: "RESERVED" }, select: { pointCost: true } } } },
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
    bookingRule,
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
            OR: [{cardId: { in: cards.map((c) => c.id) }},{bookingKind:"TRIAL",customerId:customer.id},{reserverCustomerId:customer.id}],
            session: { startsAt: { gte: range.start, lte: range.end } },
          },
          include: {
            trialPayments: {where:{status:"SUCCESS"},select:{amount:true}},
            session: {
              select: {
                nameSnapshot: true,
                startsAt: true,
                coachId: true,
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
    workLink
      ? coursePrisma.courseSession.findMany({
          where: {
            storeId,
            coachId: workLink!.staffId,
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
          where: { storeId, isActive: true, customerPurchasable: true, ...(musicStore ? {unit:"SESSION" as const} : {}) },
          orderBy: { price: "asc" },
        })
      : [],
    memberEnabled
      ? coursePrisma.coursePurchase.findMany({
          where: { storeId, customerId: customer.id },
          include: { refunds: { where: {storeId}, select:{id:true,amount:true,method:true,createdAt:true}, orderBy:{createdAt:"asc"} } },
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
            OR: [{cardId: { in: cards.map((c) => c.id) }},{bookingKind:"TRIAL",customerId:customer.id},{reserverCustomerId:customer.id}],
            status: "RESERVED",
            session: { cancelledAt: null, startsAt: { gte: now } },
          },
          include: {
            session: {
              select: {
                nameSnapshot: true,
                startsAt: true,
                coachId: true,
                room: { select: { name: true } },
              },
            },
          },
          orderBy: { session: { startsAt: "asc" } },
        })
      : null,
    workLink
      ? coursePrisma.courseSession.findFirst({
          where: {
            storeId,
            coachId: workLink!.staffId,
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
    memberEnabled
      ? coursePrisma.courseBookingRule.findUnique({
          where: { storeId },
          select: { cancellationLeadMinutes: true },
        })
      : null,
  ]);
  const waitlistRows = waitlistEnabled && sessions.length
    ? await coursePrisma.courseWaitlistEntry.findMany({
        where: { storeId, sessionId: { in: sessions.map(session => session.id) }, status: "WAITING" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, sessionId: true, customerId: true, operatorCustomerId: true, groupKey: true, createdAt: true },
      })
    : [];
  const waitlistMeta = new Map<string, { count: number; ownPosition: number | null }>();
  for (const session of sessions) {
    const rows = waitlistRows.filter(row => row.sessionId === session.id);
    const groups = new Map<string, typeof rows>();
    for (const row of rows) groups.set(row.groupKey, [...(groups.get(row.groupKey) ?? []), row]);
    const ordered = [...groups.values()].sort((a, b) =>
      a[0].createdAt.getTime() - b[0].createdAt.getTime() || a[0].id.localeCompare(b[0].id),
    );
    const ownIndex = ordered.findIndex(group => group.some(row => row.operatorCustomerId === customer.id || row.customerId === customer.id));
    waitlistMeta.set(session.id, { count: rows.length, ownPosition: ownIndex >= 0 ? ownIndex + 1 : null });
  }

  const coachIds = [...new Set([
    ...sessions.map((session) => session.coachId),
    ...bookings.map((booking) => booking.session.coachId),
    ...(nextBooking ? [nextBooking.session.coachId] : []),
  ])];
  const [coaches, nextParticipants] = await Promise.all([
    coachIds.length
      ? prisma.staff.findMany({
          where: { storeId, id: { in: coachIds } },
          select: { id: true, displayName: true },
        })
      : [],
    nextBooking
      ? coursePrisma.courseBooking.findMany({
          where: {
            storeId,
            sessionId: nextBooking.sessionId,
            status: "RESERVED",
            OR: [
              { cardId: { in: cards.map((card) => card.id) } },
              { bookingKind: "TRIAL", customerId: customer.id },
              { reserverCustomerId: customer.id },
            ],
          },
          select: { id: true, customerId: true, customerName: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  const coachNames = new Map(coaches.map((coach) => [coach.id, coach.displayName]));
  const referralShare = memberEnabled && !access ? await getReferralShareContext({ customerId: customer.id, storeId, storeSlug: store.slug }) : null;
  // Only customers on this authorized coach's own sessions are read.
  const workCustomers = work.length ? await prisma.customer.findMany({
    where: {storeId, id:{in:[...new Set(work.flatMap(s=>s.bookings.map(b=>b.customerId).filter((id): id is string => !!id)))]}},
    select:{id:true, serviceNote:true, notes:true},
  }) : [];
  const rolePreferenceKey = coursePortalRoleCookie(user.id, storeId);
  const initialRole = access ? (access.role === "work" ? "coach" as const : "member" as const) : resolveCoursePortalRole((await cookies()).get(rolePreferenceKey)?.value, memberEnabled, !!link);
  return {
    rolePreferenceKey,
    initialRole,
    referralShare: referralShare?.available ? referralShare : null,
    month,
    serverNow: now.getTime(),
    customerId: customer.id,
    customerName: customer.name,
    emergencyContact: memberEnabled ? emergencyContact : null,
    storeName: store.name,
    prefix: context?.storeSlug ? `/s/${context.storeSlug}` : "",
    memberEnabled,
    hasWork: !!workLink,
    incomeAvailable: !!incomeAccess,
    healthEnabled: memberEnabled && healthEnabled,
    cancellationLeadMinutes: bookingRule?.cancellationLeadMinutes ?? 0,
    waitlistEnabled,
    companionBookingEnabled: !musicStore,
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
          coach: coachNames.get(nextBooking.session.coachId) ?? "教練待確認",
          room: nextBooking.session.room.name,
          participants: [...new Map(nextParticipants.map((participant) => [participant.id, {
            id: participant.id,
            name: participant.customerName,
          }])).values()],
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
      coach: coachNames.get(s.coachId) ?? "教練待確認",
      room: s.room.name,
      cost: s.pointCost,
      capacity: s.capacity,
      occupied: s._count.bookings,
      precautions: s.template.precautions,
      waitlistAllowed: waitlistEnabled && s.template.waitlistEnabled,
      waitlistCount: waitlistMeta.get(s.id)?.count ?? 0,
      waitlistPosition: waitlistMeta.get(s.id)?.ownPosition ?? null,
      waitlistRemaining: Math.max(0, (s.template.waitlistLimit || waitlistSetting?.defaultLimit || 5) - (waitlistMeta.get(s.id)?.count ?? 0)),
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      sessionId: b.sessionId,
      name: b.session.nameSnapshot,
      startsAt: b.session.startsAt.toISOString(),
      coach: coachNames.get(b.session.coachId) ?? "教練待確認",
      room: b.session.room.name,
      customerName: b.customerName,
      customerId: b.customerId,
      operatorName: b.operatorName,
      reserverCustomerId: b.reserverCustomerId,
      status: b.status,
      notes: "",
      cost: b.pointCost,
      trialPaid: b.trialPayments.at(0)?.amount ?? null,
      trialPrice: b.trialPrice,
      unit: b.card?.unit ?? "TRIAL",
      planName: b.card?.nameSnapshot ?? "體驗（不使用方案）",
      expiresAt: b.card?.expiresAt.toISOString() ?? null,
    })),
    work: work.map((s) => ({
      id: s.id,
      name: s.nameSnapshot,
      cost: s.pointCost,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      room: s.room.name,
      bookings: s.bookings.map((b) => ({
        id: b.id,
        customerId: b.customerId,
        cardId: b.cardId,
        companionIndex: b.companionIndex,
        reserverName: b.reserverName,
        canAddCompanion: !musicStore && !b.companionIndex && !!b.customerId && !!b.card && !b.card.termSessionIds.length && b.card.plan.allowShared,
        customerName: b.customerName,
        status: b.status,
        checkedIn: !!b.checkedInAt,
        updatedAt: b.updatedAt.toISOString(),
        notes: b.notes,
        serviceNote: workCustomers.filter(c=>c.id===b.customerId).flatMap(c=>[c.serviceNote,c.notes]).filter(Boolean).join("\n"),
        available: b.card ? (b.card.closedAt || b.card.expiresAt < now ? 0 : Math.max(0, b.card.remaining - b.card.bookings.reduce((sum, booking) => sum + booking.pointCost, 0))) : null,
        cost: b.pointCost,
        unit: b.card?.unit ?? "TRIAL",
        planName: b.card?.nameSnapshot ?? "體驗（不使用方案）",
        expiresAt: b.card?.expiresAt.toISOString() ?? null,
      })),
    })),
    orders: orders.map((o) => ({
      id:o.id,name:o.name,price:o.price,status:o.status,transferLastFive:o.transferLastFive,
      points:o.points,unit:o.unit,termSizes:o.musicTermSizes,bonus:o.musicBonusLessons,listPrice:o.listPrice,
      paymentMethod:o.paymentMethod,transferLastFour:o.transferLastFour,voidReason:o.voidReason,
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
  const data = await loadCoursePortal(selectedDate?.slice(0,7) ?? month);
  return <CoursePortalClient key={data.rolePreferenceKey} {...data} initialDate={selectedDate} initialCoach={view === "work"} initialView={view === "work" ? "schedule" : view === "bookings" ? "bookings" : view === "plans" ? "plans" : "home"} />;
}
