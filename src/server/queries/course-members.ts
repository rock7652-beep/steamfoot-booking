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
      trialPrice: true,
      trialPayments: {orderBy:{createdAt:"desc"}},
      notes: true,
      checkedInAt: true,
      card: { select: { unit: true, nameSnapshot: true, termSessionIds:true, expiresAt: true, remaining: true, members: { select: { customerId: true } }, bookings: { where: { status: "RESERVED" }, select: { pointCost: true } } } },
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
  return bookings.map(({ card, checkedInAt, ...b }) => ({
    ...b,
    checkedInAt: checkedInAt?.toISOString() ?? null,
    trialPayments: b.trialPayments.map(p=>({...p,createdAt:p.createdAt.toISOString(),voidedAt:p.voidedAt?.toISOString()??null})),
    unit: card?.unit ?? "POINT",
    termIndex:(card?.termSessionIds?.indexOf(sessionId) ?? -1)>=0 ? card!.termSessionIds.indexOf(sessionId)+1 : null,
    termCount:card?.termSessionIds?.length??0,
    planName: card?.nameSnapshot ?? (b.bookingKind === "TEACHER_MAKEUP" ? "老師曠課免費補課" : "體驗（不使用方案）"),
    sharedCard: (card?.members.length ?? 0) > 1,
    bookingSource: b.operatorCustomerId
      ? b.operatorCustomerId === b.customerId
        ? "本人預約"
        : `${b.operatorName ?? "共卡成員"}代約`
      : "店長建立",
    available: !card || card.expiresAt.getTime() < Date.now() ? 0 : Math.max(0, card.remaining - card.bookings.reduce((n, b) => n + b.pointCost, 0)),
    expiresAt: card?.expiresAt.toISOString() ?? null,
    customerPhone: customers.find((c) => c.id === b.customerId)?.phone ?? "",
    absenceCount: leaveCounts.find((item)=>item.customerId===b.customerId)?._count.id??0,
    absenceHistory: absenceHistory.filter(item=>item.customerId===b.customerId).map(item=>({date:item.session.startsAt.toISOString(),status:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(item.absenceKind ?? "") ? "請假" : "曠課"})),
    serviceNote: [customers.find((c) => c.id === b.customerId)?.serviceNote, customers.find((c) => c.id === b.customerId)?.notes].filter(Boolean).join("\n"),
  }));
}
