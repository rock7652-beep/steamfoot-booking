import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { summarizeApplicableBalance, type ApplicableBalanceCard } from "@/lib/applicable-balance";
import { courseCardCoversDate } from "@/lib/course-card-expiry";
import { MUSIC_OPENING_SELECT } from "@/lib/music-opening-runtime";
import { resolveSportsEntitlement } from "@/lib/sports-entitlement";
import { courseChargeSettings } from "@/lib/course-charge-settings";
import { musicItemTemplateIds } from "./music-item-compatibility";
import { readSportsTeachingTemplates } from "./sports-teaching-templates";
import { readSportsSessionRule } from "./sports-staging-schedule";
import { musicCourseExpiry } from "@/lib/music-course-products";

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
    music ? null : readSportsSessionRule(coursePrisma, storeId, sessionId),
    music ? musicItemTemplateIds(coursePrisma, storeId, session.templateId)
      : readSportsTeachingTemplates(coursePrisma, storeId, session.template.musicSubjectId),
  ]);
  const joinIds = [...new Set(cards.flatMap(card => card.musicJoinSessionId ? [card.musicJoinSessionId] : []))];
  const joins = joinIds.length ? await coursePrisma.courseSession.findMany({
    where: { storeId, id: { in: joinIds } }, select: { id: true, startsAt: true },
  }) : [];
  for (const card of cards) {
    // Makeup coupons remain independent rights and must not inflate ordinary tuition.
    if (/^(no-show-makeup:|music-leave-makeup:|yjy-pilot-makeup:)/.test(card.requestKey)) continue;
    if (!["SESSION", "POINT"].includes(card.unit) || (music && card.unit !== "SESSION")) continue;
    if (!courseCardCoversDate(card, storeId, now) || !courseCardCoversDate(card, storeId, session.startsAt)) continue;
    if (card.termSessionIds.length && !card.termSessionIds.includes(sessionId)) continue;
    const charge = courseChargeSettings.safeParse(card.plan.chargeSettings);
    if (charge.success && !charge.data.providerIds.includes(session.coachId)) continue;
    if (music) {
      if (card.templateIds.length && !card.templateIds.some(id => compatibleTemplateIds.includes(id))) continue;
      if (card.musicJoinSessionId) {
        const first = joins.find(row => row.id === card.musicJoinSessionId);
        if (!first || first.startsAt > session.startsAt) continue;
      }
      if (card.musicValidityDays && !card.musicActivatedAt) {
        const dates = [session.startsAt, ...card.bookings.map(b => b.session.startsAt)];
        const first = new Date(Math.min(...dates.map(date => +date)));
        if (Math.max(...dates.map(date => +date)) > +musicCourseExpiry(first, card.musicValidityDays)) continue;
      }
    } else {
      const rights = resolveSportsEntitlement(
        { ...card, templateRestricted: false },
        { templateId: session.templateId, subjectId: session.template.musicSubjectId,
          pointCost: session.pointCost, enrollment: rule?.enrollment === "ASSIGNED" ? "ASSIGNED" : rule?.enrollment === "OPEN" ? "OPEN" : null,
          legacyPlanId: rule?.planId ?? null, compatibleTemplateIds },
      );
      if (!rights.eligible) continue;
    }
    const row: ApplicableBalanceCard = {
      id: card.id, name: card.nameSnapshot, unit: card.unit as "SESSION" | "POINT",
      remaining: card.remaining, held: card.bookings.reduce((sum, b) => sum + b.pointCost, 0),
      expiresAt: card.expiresAt?.toISOString() ?? null,
      ...(music && card.musicValidityDays && !card.musicActivatedAt ? {expiryLabel: `首次上課起 ${card.musicValidityDays} 天`} : {}), shared: card.members.length > 1,
    };
    for (const member of card.members) projected.get(member.customerId)?.push(row);
  }
  return new Map([...projected].map(([id, rows]) => [id, summarizeApplicableBalance(rows)]));
}
