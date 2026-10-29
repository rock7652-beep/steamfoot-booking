import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { summarizeApplicableBalance, type ApplicableBalanceCard } from "@/lib/applicable-balance";
import { courseCardCoversDate } from "@/lib/course-card-expiry";
import { MUSIC_OPENING_SELECT } from "@/lib/music-opening-runtime";
import { resolveSportsEntitlement } from "@/lib/sports-entitlement";
import { courseChargeSettings } from "@/lib/course-charge-settings";
import { musicItemCards } from "./music-item-cards";
import { readSportsTeachingTemplates } from "./sports-teaching-templates";
import { readSportsSessionRule } from "./sports-staging-schedule";

/** One batch per roster. The module's eligibility policy runs before the shared sum.
 * This read neither reassigns a booking's card nor authorizes attendance.
 */
export async function readCourseApplicableBalances(
  storeId: string, sessionId: string, customerIds: string[], music: boolean,
) {
  const ids = [...new Set(customerIds)];
  const projected = new Map(ids.map(id => [id, [] as ApplicableBalanceCard[]]));
  if (!ids.length) return new Map<string, ReturnType<typeof summarizeApplicableBalance>>();
  const session = await coursePrisma.courseSession.findFirst({
    where: { id: sessionId, storeId },
    include: { template: { select: { musicSubjectId: true } } },
  });
  if (!session) return new Map<string, ReturnType<typeof summarizeApplicableBalance>>();
  if (music) {
    // Use the same native entitlement reader as attendance; do not recreate music policy.
    const cards = await musicItemCards(coursePrisma, storeId, ids, session);
    for (const card of cards) {
      const row: ApplicableBalanceCard = {
        id:card.id,name:card.nameSnapshot,unit:"SESSION",remaining:card.remaining,
        held:card.bookings.reduce((sum,b)=>sum+b.pointCost,0),expiresAt:card.expiresAt?.toISOString()??null,
        ...(card.musicValidityDays&&!card.musicActivatedAt?{expiryLabel: `首次上課起 ${card.musicValidityDays} 天`}:{}),
        shared:card.members.length>1,
      };
      for(const member of card.members)projected.get(member.customerId)?.push(row);
    }
    return new Map([...projected].map(([id,rows])=>[id,summarizeApplicableBalance(rows)]));
  }
  const now = new Date();
  const [cards, rule, compatibleTemplateIds] = await Promise.all([
    coursePrisma.coursePointCard.findMany({
      where: { storeId, closedAt: null, members: { some: { customerId: { in: ids } } } },
      include: {
        members: { select: { customerId: true } },
        musicOpeningState: { select: MUSIC_OPENING_SELECT },
        plan: { select: { chargeSettings: true } },
        bookings: { where: { status: "RESERVED" }, select: { pointCost: true, session: { select: { startsAt: true } } } },
      },
    }),
    readSportsSessionRule(coursePrisma, storeId, sessionId),
    readSportsTeachingTemplates(coursePrisma, storeId, session.template.musicSubjectId),
  ]);
  for (const card of cards) {
    // Makeup coupons remain independent rights and must not inflate ordinary tuition.
    if (/^(no-show-makeup:|music-leave-makeup:|yjy-pilot-makeup:)/.test(card.requestKey)) continue;
    if (!["SESSION", "POINT"].includes(card.unit)) continue;
    if (!courseCardCoversDate(card, storeId, now) || !courseCardCoversDate(card, storeId, session.startsAt)) continue;
    if (card.termSessionIds.length && !card.termSessionIds.includes(sessionId)) continue;
    const charge = courseChargeSettings.safeParse(card.plan.chargeSettings);
    if (charge.success && !charge.data.providerIds.includes(session.coachId)) continue;
    const rights = resolveSportsEntitlement(
        { ...card, templateRestricted: false },
        { templateId: session.templateId, subjectId: session.template.musicSubjectId,
          pointCost: session.pointCost, enrollment: rule?.enrollment === "ASSIGNED" ? "ASSIGNED" : rule?.enrollment === "OPEN" ? "OPEN" : null,
          legacyPlanId: rule?.planId ?? null, compatibleTemplateIds },
      );
    if (!rights.eligible) continue;
    const row: ApplicableBalanceCard = {
      id: card.id, name: card.nameSnapshot, unit: card.unit as "SESSION" | "POINT",
      remaining: card.remaining, held: card.bookings.reduce((sum, b) => sum + b.pointCost, 0),
      expiresAt: card.expiresAt?.toISOString() ?? null,
      shared: card.members.length > 1,
    };
    for (const member of card.members) projected.get(member.customerId)?.push(row);
  }
  return new Map([...projected].map(([id, rows]) => [id, summarizeApplicableBalance(rows)]));
}
