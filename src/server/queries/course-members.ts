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
      remaining: c.remaining,
      held,
      available: expired ? 0 : Math.max(0, c.remaining - held),
      expired,
      expiresAt: c.expiresAt.toISOString(),
      members: c.members.map((m) => ({
        id: m.customerId,
        name: people.find((p) => p.id === m.customerId)?.name ?? "學員",
      })),
      entries: c.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        points: e.points,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }).sort((a, b) => Number(a.expired) - Number(b.expired));
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
      notes: true,
      checkedInAt: true,
      card: { select: { nameSnapshot: true, expiresAt: true } },
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
    planName: card.nameSnapshot,
    expiresAt: card.expiresAt.toISOString(),
    serviceNote: customers.find((c) => c.id === b.customerId)?.serviceNote ?? "",
  }));
}
