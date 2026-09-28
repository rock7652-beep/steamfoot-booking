import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import type { Prisma } from "../../../generated/course-client";

export async function getCourseCards(storeId: string, customerId?: string, page?: { where: Prisma.CoursePointCardWhereInput; skip: number; take: number; entries?: boolean }) {
  const cards = await coursePrisma.coursePointCard.findMany({
    where: {
      ...page?.where,
      storeId,
      ...(customerId ? { members: { some: { customerId } } } : {}),
    },
    include: {
      plan: { select: { allowShared: true } },
      members: true,
      bookings: { where: { status: "RESERVED" }, select: { pointCost: true } },
      entries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: page && !page.entries ? 0 : 100 },
    },
    ...(page ? { skip: page.skip, take: page.take } : {}),
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
  });
  const people = await prisma.customer.findMany({
    where: {
      storeId,
      id: {
        in: [
          ...new Set(cards.flatMap((c) => c.members.map((m) => m.customerId))),
        ],
      },
    },
    select: { id: true, name: true, phone: true },
  });
  return cards.map((c) => {
    const held = c.bookings.reduce((sum, b) => sum + b.pointCost, 0);
    const expired = c.expiresAt.getTime() < Date.now();
    return {
      id: c.id,
      name: c.nameSnapshot,
      unit: c.unit,
      musicValidityDays:c.musicValidityDays,
      musicActivatedAt:c.musicActivatedAt?.toISOString()??null,
      templateIds: c.templateIds,
      termSessionIds:c.termSessionIds,
      allowShared: c.plan.allowShared,
      remaining: c.remaining,
      held,
      closed: !!c.closedAt,
      available: expired || c.closedAt ? 0 : Math.max(0, c.remaining - held),
      expired,
      expiresAt: c.expiresAt.toISOString(),
      members: c.members.map((m) => ({
        id: m.customerId,
        name: people.find((p) => p.id === m.customerId)?.name ?? "學員",
        phone: people.find((p) => p.id === m.customerId)?.phone ?? "",
      })),
      entries: c.entries.map((e) => ({
        id: e.id,
        kind: e.kind.startsWith("CORRECT:") ? e.kind : e.kind.split(":")[0],
        points: e.points,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }).sort((a, b) => Number(a.expired || a.closed) - Number(b.expired || b.closed) || a.expiresAt.localeCompare(b.expiresAt));
}

export async function getCourseRoster(storeId: string, sessionId: string) {
  const bookings = await coursePrisma.courseBooking.findMany({
    where: { storeId, sessionId },
    select: {
      id: true,
      customerId: true,
      operatorCustomerId: true,
      operatorName: true,
      customerName: true,
      status: true,
      absenceKind: true,
      cardId: true,
      pointCost: true,
      bookingKind: true,
      session: { select: { template: { select: { classType: true } } } },
      trialPrice: true,
      trialPayments: {orderBy:{createdAt:"desc"}},
      notes: true,
      checkedInAt: true,
      card: { select: { unit: true, nameSnapshot: true, termSessionIds:true, expiresAt: true, remaining: true, plan: { select: { points: true, musicTerms: true } }, members: { select: { customerId: true } }, bookings: { select: { id: true, customerId: true, pointCost: true, status: true, absenceKind: true, session: { select: { startsAt: true } } } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const customers = await prisma.customer.findMany({
    where: { storeId, id: { in: bookings.map((b) => b.customerId) } },
    select: { id: true, phone: true, serviceNote: true, notes: true },
  });
  const leaveCounts = await coursePrisma.courseBooking.groupBy({
    by: ["customerId"],
    where: {storeId, customerId:{in:bookings.map(b=>b.customerId)}, OR:[{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},{status:"NO_SHOW"}]},
    _count: {id:true},
  });
  const absenceHistory = await coursePrisma.courseBooking.findMany({
    where: {storeId,customerId:{in:bookings.map(b=>b.customerId)},OR:[{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},{status:"NO_SHOW"}]},
    select:{customerId:true,status:true,absenceKind:true,session:{select:{startsAt:true}}},
    orderBy:{session:{startsAt:"desc"}},
  });
  return bookings.map(({ card, checkedInAt, ...b }) => {
    const allLessons = (card?.bookings ?? [])
      .filter((item) => item.customerId === b.customerId && (item.status !== "CANCELLED" || item.absenceKind === "GROUP_LEAVE_FORFEITED"))
      .sort((left, right) => left.session.startsAt.getTime() - right.session.startsAt.getTime());
    const lessonPosition = allLessons.findIndex((item) => item.id === b.id);
    const currentPosition = lessonPosition >= 0 ? lessonPosition : b.absenceKind === "STUDENT_LEAVE" ? allLessons.filter((item) => item.session.startsAt < (card?.bookings.find((entry) => entry.id === b.id)?.session.startsAt ?? new Date(0))).length : -1;
    const purchasedLessons = card?.plan.points ?? 0;
    const termSize = card?.plan.musicTerms && purchasedLessons % card.plan.musicTerms === 0
      ? purchasedLessons / card.plan.musicTerms
      : purchasedLessons;
    const termNumber = termSize > 0 && currentPosition >= 0 ? Math.floor(currentPosition / termSize) + 1 : null;
    const periodLessons = termNumber ? allLessons.slice((termNumber - 1) * termSize, termNumber * termSize) : [];
    const previousTermLesson = termNumber && termNumber > 1 ? allLessons[(termNumber - 1) * termSize - 1] : null;
    const privateLeaves = (card?.bookings ?? []).filter((item) => item.customerId === b.customerId && item.absenceKind === "STUDENT_LEAVE" && termNumber !== null && ((!card?.plan.musicTerms || card.plan.musicTerms === 1) || (periodLessons.length > 0 && (!previousTermLesson || item.session.startsAt > previousTermLesson.session.startsAt) && item.session.startsAt <= periodLessons[periodLessons.length - 1].session.startsAt)));
    const termAbsences = periodLessons.filter((item) => item.status === "NO_SHOW" || item.absenceKind === "GROUP_LEAVE_FORFEITED");
    return ({
    ...b,
    checkedInAt: checkedInAt?.toISOString() ?? null,
    trialPayments: b.trialPayments.map(p=>({...p,createdAt:p.createdAt.toISOString(),voidedAt:p.voidedAt?.toISOString()??null})),
    unit: card?.unit ?? "POINT",
    // Private music lessons use the learner’s own card and booked sequence.
    // Group lessons need a separate cohort/enrollment start; never infer that from bookings.
    termIndex: currentPosition >= 0 && termSize > 0 && (card?.termSessionIds.length || (card?.plan.musicTerms && b.session.template.classType === "PRIVATE")) ? currentPosition % termSize + 1 : null,
    termCount: (card?.termSessionIds.length || (card?.plan.musicTerms && b.session.template.classType === "PRIVATE")) ? termSize : 0,
    termNumber,
    termLessons: periodLessons.map((item) => ({date: item.session.startsAt.toISOString(), status: item.status === "ATTENDED" ? "已出席" : item.status === "NO_SHOW" ? "曠課" : item.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假" : "待上課"})),
    termLeaveCount: periodLessons.filter((item) => item.absenceKind === "GROUP_LEAVE_FORFEITED").length + privateLeaves.length,
    termNoShowCount: termAbsences.filter((item) => item.status === "NO_SHOW").length,
    // Private-class leave does not consume a lesson; retain its date in the period's leave history.
    termPrivateLeaves: privateLeaves.map((item) => item.session.startsAt.toISOString()),
    planName: card?.nameSnapshot ?? (b.bookingKind === "TEACHER_MAKEUP" ? "老師曠課免費補課" : "體驗（不使用方案）"),
    sharedCard: (card?.members.length ?? 0) > 1,
    bookingSource: b.operatorCustomerId
      ? b.operatorCustomerId === b.customerId
        ? "本人預約"
        : `${b.operatorName ?? "共卡成員"}代約`
      : "店長建立",
    available: !card || card.expiresAt.getTime() < Date.now() ? 0 : Math.max(0, card.remaining - card.bookings.filter((item) => item.status === "RESERVED").reduce((n, item) => n + item.pointCost, 0)),
    expiresAt: card?.expiresAt.toISOString() ?? null,
    customerPhone: customers.find((c) => c.id === b.customerId)?.phone ?? "",
    absenceCount: leaveCounts.find((item)=>item.customerId===b.customerId)?._count.id??0,
    absenceHistory: absenceHistory.filter(item=>item.customerId===b.customerId).map(item=>({date:item.session.startsAt.toISOString(),status:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(item.absenceKind ?? "") ? "請假" : "曠課"})),
    serviceNote: [customers.find((c) => c.id === b.customerId)?.serviceNote, customers.find((c) => c.id === b.customerId)?.notes].filter(Boolean).join("\n"),
  });
  });
}
