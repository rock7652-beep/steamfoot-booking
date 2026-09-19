import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";

export async function getCourseCards(storeId: string, customerId?: string) {
  const cards = await coursePrisma.coursePointCard.findMany({
    where: {
      storeId,
      ...(customerId ? { members: { some: { customerId } } } : {}),
    },
    include: {
      members: true,
      bookings: { where: { status: "RESERVED" }, select: { pointCost: true } },
      entries: { orderBy: { createdAt: "desc" }, take: 100 },
    },
    orderBy: { createdAt: "desc" },
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
    select: { id: true, name: true },
  });
  return cards.map((c) => {
    const held = c.bookings.reduce((sum, b) => sum + b.pointCost, 0);
    const expired = c.expiresAt.getTime() < Date.now();
    return {
      id: c.id,
      name: c.nameSnapshot,
      unit: c.unit,
      templateIds: c.templateIds,
      remaining: c.remaining,
      held,
      closed: !!c.closedAt,
      available: expired || c.closedAt ? 0 : Math.max(0, c.remaining - held),
      expired,
      expiresAt: c.expiresAt.toISOString(),
      members: c.members.map((m) => ({
        id: m.customerId,
        name: people.find((p) => p.id === m.customerId)?.name ?? "學員",
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
      pointCost: true,
      bookingKind: true,
      trialPrice: true,
      trialPayments: {orderBy:{createdAt:"desc"}},
      notes: true,
      checkedInAt: true,
      card: { select: { unit: true, nameSnapshot: true, expiresAt: true, remaining: true, bookings: { where: { status: "RESERVED" }, select: { pointCost: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const customers = await prisma.customer.findMany({
    where: { storeId, id: { in: bookings.map((b) => b.customerId) } },
    select: { id: true, serviceNote: true },
  });
  return bookings.map(({ card, checkedInAt, ...b }) => ({
    ...b,
    checkedInAt: checkedInAt?.toISOString() ?? null,
    trialPayments: b.trialPayments.map(p=>({...p,createdAt:p.createdAt.toISOString(),voidedAt:p.voidedAt?.toISOString()??null})),
    unit: card?.unit ?? "POINT",
    planName: card?.nameSnapshot ?? "體驗（不使用方案）",
    available: !card || card.expiresAt.getTime() < Date.now() ? 0 : Math.max(0, card.remaining - card.bookings.reduce((n, b) => n + b.pointCost, 0)),
    expiresAt: card?.expiresAt.toISOString() ?? null,
    serviceNote: customers.find((c) => c.id === b.customerId)?.serviceNote ?? "",
  }));
}
