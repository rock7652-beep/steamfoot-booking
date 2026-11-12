import { z } from "zod";
import { courseChargeSettings } from "./course-charge-settings";
const fixedRoster = z.object({ students: z.array(z.object({ customerId: z.string() })) });

/** Open seats keep open-card rights. Only a persisted scheduling reservation
 * for a named fixed learner uses assigned rights in a mixed class. Rejoining
 * through self booking (including after leave) remains an open reservation. */
export function sportsBookingEnrollment(
  rule: { enrollment: string; payload?: unknown },
  booking: { customerId?: string | null; companionIndex?: number | null; requestKey: string; session: { id: string; requestKey: string; requestIndex: number } },
): "ASSIGNED" | "OPEN" | null {
  if (rule.enrollment === "ASSIGNED") return "ASSIGNED";
  if (rule.enrollment !== "OPEN") return null;
  const roster = fixedRoster.safeParse(rule.payload);
  if (!booking.companionIndex && booking.customerId && roster.success && roster.data.students.some(row => row.customerId === booking.customerId) &&
      (booking.requestKey === `sports-fixed:${booking.session.id}:${booking.customerId}` ||
       booking.requestKey === `${booking.session.requestKey}:${booking.session.requestIndex}:${booking.customerId}`)) return "ASSIGNED";
  return "OPEN";
}

/** Persisted on the plan, then copied unchanged to the purchase and card. */
export type SportsEntitlementFields = {
  sportsMode?: string;
  sportsSubjectId?: string | null;
  sportsSubjectIds?: string[];
  sportsCost?: number | null;
  unit: string;
};

const entitlement = z.discriminatedUnion("sportsMode", [
  z.object({ sportsMode: z.literal("LEGACY"), sportsSubjectId: z.null(), sportsCost: z.null() }),
  z.object({ sportsMode: z.literal("ASSIGNED"), sportsSubjectId: z.string().min(1).max(100), sportsCost: z.number().int().min(1).max(10000) }),
  z.object({ sportsMode: z.literal("OPEN"), sportsSubjectId: z.null(), sportsCost: z.null() }),
  z.object({ sportsMode: z.literal("SUBJECTS"), sportsSubjectId: z.null(), sportsCost: z.number().int().min(1).max(10000), sportsSubjectIds: z.array(z.string().min(1).max(100)).min(1).max(200).refine(ids=>new Set(ids).size===ids.length,"適用科目不可重複") }),
]);

function parseRights(source:SportsEntitlementFields) {
  if(source.sportsMode!=="SUBJECTS"&&source.sportsSubjectIds?.length)throw new Error("單科目或既有方案不可混入多科目權益");
  return entitlement.parse({sportsMode:source.sportsMode??"LEGACY",sportsSubjectId:source.sportsSubjectId??null,sportsCost:source.sportsCost??null,...(source.sportsMode==="SUBJECTS"?{sportsSubjectIds:source.sportsSubjectIds}:{} )});
}

export function sportsEntitlementSnapshot(source: SportsEntitlementFields) {
  const snapshot = parseRights(source);
  if (!["POINT", "SESSION"].includes(source.unit)) throw new Error("不支援的課卡單位");
  if ((snapshot.sportsMode === "ASSIGNED"||snapshot.sportsMode==="SUBJECTS") && source.unit === "SESSION" && snapshot.sportsCost !== 1)
    throw new Error("堂數方案每次使用 1 堂");
  return snapshot;
}

type OpenScopeCard = SportsEntitlementFields & {
  storeId?: string;
  plan?: { storeId: string; templateIds: string[]; chargeSettings: unknown } | null;
};

/** Old OPEN lesson cards have no subject snapshot. A configured fee's explicit
 * teaching items supply their scope; never infer universal access from an empty
 * list. Other purchased rights, quantities, costs and expiry remain snapshots.
 * The plan relation must be read from the card in the same store, including
 * inside the booking transaction. This projection may also be sent to the UI.
 */
export function sportsOpenPlanTemplateIds(card: OpenScopeCard): string[] {
  if (card.sportsMode !== "OPEN" || card.unit !== "SESSION" ||
      !card.storeId || card.plan?.storeId !== card.storeId) return [];
  const charge = courseChargeSettings.safeParse(card.plan.chargeSettings);
  return charge.success && charge.data.kind === "plan" ? card.plan.templateIds : [];
}

type Card = OpenScopeCard & { planId: string; templateIds: string[]; templateRestricted?: boolean; openScopeTemplateIds?: string[] };
type Lesson = {
  templateId: string;
  subjectId: string | null;
  pointCost: number;
  enrollment: "ASSIGNED" | "OPEN" | null;
  legacyPlanId: string | null;
  compatibleTemplateIds?: string[];
};

/** Pure policy shared by transaction entry points and eligibility displays.
 * Membership, expiry, balances and capacity remain authoritative transaction checks.
 * Legacy rights keep their original plan/template restrictions.
 */
export function resolveSportsEntitlement(card: Card, lesson: Lesson):
  { eligible: true; cost: number } | { eligible: false; reason: string } {
  const parsed = (()=>{try{return {success:true as const,data:parseRights(card)};}catch{return {success:false as const};}})();
  if (!parsed.success || !["POINT", "SESSION"].includes(card.unit))
    return { eligible: false, reason: "課卡權益資料無效，請聯絡店家核對" };
  if (card.templateRestricted && !card.templateIds.includes(lesson.templateId))
    return { eligible: false, reason: "補課權益僅適用原課程" };
  const rights = parsed.data;
  let cost: number;
  if (rights.sportsMode === "LEGACY") {
    // Assigned lesson rights follow its teaching item, not the fee package
    // selected when scheduling. Aliases are verified in the same store by DB.
    if(lesson.subjectId &&
       card.templateIds.some(id=>lesson.compatibleTemplateIds?.includes(id)))
      return {eligible:true,cost:card.unit === "SESSION"?1:lesson.pointCost};
    if (lesson.enrollment && !lesson.legacyPlanId)
      return { eligible: false, reason: "既有方案尚未設定新選課模式權益，請由店家核對" };
    if (lesson.legacyPlanId && card.planId !== lesson.legacyPlanId)
      return { eligible: false, reason: "此方案不適用本堂收費方式" };
    if (card.templateIds.length && !card.templateIds.includes(lesson.templateId))
      return { eligible: false, reason: "此方案不適用本堂課" };
    cost = card.unit === "SESSION" ? 1 : lesson.pointCost;
  } else if (rights.sportsMode === "ASSIGNED"||rights.sportsMode==="SUBJECTS") {
    // ASSIGNED is the persisted subject/cost snapshot, not an enrollment gate.
    if (!lesson.subjectId || !(rights.sportsMode==="SUBJECTS"?rights.sportsSubjectIds.includes(lesson.subjectId):lesson.subjectId === rights.sportsSubjectId))
      return { eligible: false, reason: "方案科目不符" };
    cost = rights.sportsCost;
    if (card.unit === "SESSION" && cost !== 1)
      return { eligible: false, reason: "堂數方案每次使用 1 堂" };
  } else {
    const templateIds = card.openScopeTemplateIds ?? sportsOpenPlanTemplateIds(card);
    if (card.unit !== "SESSION" || !templateIds.length)
      return { eligible: false, reason: "方案科目待核對，請由店家確認" };
    if (!templateIds.includes(lesson.templateId) &&
        !(lesson.subjectId && templateIds.some(id => lesson.compatibleTemplateIds?.includes(id))))
      return { eligible: false, reason: "方案科目不符" };
    cost = 1;
  }
  if (!Number.isSafeInteger(cost) || cost < 1)
    return { eligible: false, reason: "本堂扣抵規則無效，請聯絡店家核對" };
  return { eligible: true, cost };
}
