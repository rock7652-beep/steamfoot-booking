import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { resolveSportsEntitlement } from "@/lib/sports-entitlement";

/** Caller holds the existing store transaction lock before making a booking. */
export async function findSportsCard(tx: Prisma.TransactionClient, storeId: string, customerId: string,
  sessions: Array<{ id?:string; templateId: string; startsAt: Date; pointCost: number }>,
  rule: { enrollment: string; planId: string | null }, explicitCardId?: string | null) {
  const template = await tx.courseTemplate.findFirst({ where: { id: sessions[0].templateId, storeId }, select: { musicSubjectId: true } });
  const now = new Date();
  const last = new Date(Math.max(now.getTime(), ...sessions.map(s => s.startsAt.getTime())));
  const cards = await tx.coursePointCard.findMany({
    where: { storeId, ...(explicitCardId ? { id: explicitCardId } : {}), closedAt: null,
      expiresAt: { gte: last }, members: { some: { customerId } } },
    include: { bookings: { where: { status: "RESERVED" }, select: { pointCost: true } } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
  });
  cards.sort((a,b)=>a.expiresAt.getTime()-b.expiresAt.getTime()||(a.id<b.id?-1:a.id>b.id?1:0));
  for (const card of cards) {
    if(card.termSessionIds?.length&&sessions.some(s=>!card.termSessionIds.includes(s.id??"")))continue;
    const costs = sessions.map(s => resolveSportsEntitlement({ ...card, templateRestricted: card.requestKey.startsWith("no-show-makeup:") }, {
      templateId: s.templateId, subjectId: template?.musicSubjectId ?? null, pointCost: s.pointCost,
      enrollment: rule.enrollment === "ASSIGNED" ? "ASSIGNED" : rule.enrollment === "OPEN" ? "OPEN" : null,
      legacyPlanId: rule.planId,
    }));
    if (costs.some(c => !c.eligible)) continue;
    const total = costs.reduce((n, c) => n + (c.eligible ? c.cost : 0), 0);
    if (card.remaining - card.bookings.reduce((n, b) => n + b.pointCost, 0) < total) continue;
    return { card, cost: costs[0].eligible ? costs[0].cost : 0 };
  }
  return null;
}
