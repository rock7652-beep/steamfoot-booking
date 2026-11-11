import {purchaseOrder} from "@/lib/item-entitlement";
import "server-only";
import {readSportsTeachingTemplates} from "./sports-teaching-templates";
import type { Prisma } from "../../../generated/course-client";
import { resolveSportsEntitlement } from "@/lib/sports-entitlement";
import {courseChargeSettings} from '@/lib/course-charge-settings';

/** Caller holds the existing store transaction lock before making a booking. */
export async function findSportsCard(tx: Prisma.TransactionClient, storeId: string, customerId: string,
  sessions: Array<{ id?:string; templateId: string; startsAt: Date; pointCost: number;coachId?:string }>,
  rule: { enrollment: string; planId: string | null }, explicitCardId?: string | null, excludeBookingId?:string, ordinaryOnly=false, existingReservation?:{cardId:string;cost:number}) {
  const template = await tx.courseTemplate.findFirst({ where: { id: sessions[0].templateId, storeId }, select: { musicSubjectId: true } });
  const compatibleTemplateIds=await readSportsTeachingTemplates(tx,storeId,template?.musicSubjectId);
  const subjects = new Map([[sessions[0].templateId, template?.musicSubjectId ?? null]]);
  const compatible = new Map([[sessions[0].templateId, compatibleTemplateIds]]);
  for (const id of new Set(sessions.map(s => s.templateId))) {
    if (subjects.has(id)) continue;
    const item = await tx.courseTemplate.findFirst({where:{id,storeId},select:{musicSubjectId:true}});
    subjects.set(id,item?.musicSubjectId??null);
    compatible.set(id,await readSportsTeachingTemplates(tx,storeId,item?.musicSubjectId));
  }
  const now = new Date();
  const last = new Date(Math.max(now.getTime(), ...sessions.map(s => s.startsAt.getTime())));
  const cards = await tx.coursePointCard.findMany({
    where: { storeId, ...(explicitCardId ? { id: explicitCardId } : {}), closedAt: null,
      expiresAt: { gte: last }, members: { some: { customerId } } },
    include: { plan:{select:{chargeSettings:true}},bookings: { where: { status: "RESERVED",...(excludeBookingId?{id:{not:excludeBookingId}}:{}) }, select: { pointCost: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const purchases=await tx.coursePurchase.findMany({where:{storeId,cardId:{in:cards.map(card=>card.id)},status:"CONFIRMED",voidedAt:null},select:{cardId:true,createdAt:true}});
  for (const card of purchaseOrder(cards,purchases)) {
    const charge=courseChargeSettings.safeParse(card.plan?.chargeSettings);
    if(card.plan?.chargeSettings!=null&&(!charge.success||sessions.some(s=>!s.coachId||!charge.data.providerIds.includes(s.coachId))))continue;
    if(ordinaryOnly&&(card.musicOpeningStateRequired||card.requestKey.startsWith('no-show-makeup:')||card.requestKey.startsWith('music-leave-makeup:')))continue;
    if(card.termSessionIds?.length&&sessions.some(s=>!card.termSessionIds.includes(s.id??"")))continue;
    // Only a persisted booking may retain an old unscoped card and its debit
    // snapshot. This option is internal, never accepted from a client request.
    const preserve=existingReservation&&explicitCardId===existingReservation.cardId&&card.id===existingReservation.cardId&&card.sportsMode==='OPEN'&&Number.isSafeInteger(existingReservation.cost)&&existingReservation.cost>0;
    const costs = sessions.map(s => preserve?{eligible:true as const,cost:existingReservation!.cost}:resolveSportsEntitlement({ ...card, templateRestricted: card.requestKey.startsWith("no-show-makeup:") }, {
      templateId: s.templateId, subjectId: subjects.get(s.templateId) ?? null, pointCost: s.pointCost,
      enrollment: rule.enrollment === "ASSIGNED" ? "ASSIGNED" : rule.enrollment === "OPEN" ? "OPEN" : null,
      legacyPlanId: rule.planId,compatibleTemplateIds:compatible.get(s.templateId),
    }));
    if (costs.some(c => !c.eligible)) continue;
    const total = costs.reduce((n, c) => n + (c.eligible ? c.cost : 0), 0);
    if (card.remaining - card.bookings.reduce((n, b) => n + b.pointCost, 0) < total) continue;
    return { card, cost: costs[0].eligible ? costs[0].cost : 0 };
  }
  return null;
}
