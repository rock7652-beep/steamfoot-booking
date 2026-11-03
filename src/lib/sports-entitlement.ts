import { z } from "zod";

/** Persisted on the plan, then copied unchanged to the purchase and card. */
export type SportsEntitlementFields = {
  sportsMode?: string;
  sportsSubjectId?: string | null;
  sportsCost?: number | null;
  unit: string;
};

const entitlement = z.discriminatedUnion("sportsMode", [
  z.object({ sportsMode: z.literal("LEGACY"), sportsSubjectId: z.null(), sportsCost: z.null() }),
  z.object({ sportsMode: z.literal("ASSIGNED"), sportsSubjectId: z.string().min(1).max(100), sportsCost: z.number().int().min(1).max(10000) }),
  z.object({ sportsMode: z.literal("OPEN"), sportsSubjectId: z.null(), sportsCost: z.null() }),
]);

export function sportsEntitlementSnapshot(source: SportsEntitlementFields) {
  const snapshot = entitlement.parse({
    sportsMode: source.sportsMode ?? "LEGACY",
    sportsSubjectId: source.sportsSubjectId ?? null,
    sportsCost: source.sportsCost ?? null,
  });
  if (!["POINT", "SESSION"].includes(source.unit)) throw new Error("不支援的課卡單位");
  if (snapshot.sportsMode === "ASSIGNED" && source.unit === "SESSION" && snapshot.sportsCost !== 1)
    throw new Error("堂數方案每次使用 1 堂");
  return snapshot;
}

type Card = SportsEntitlementFields & { planId: string; templateIds: string[]; templateRestricted?: boolean };
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
  const parsed = entitlement.safeParse({
    sportsMode: card.sportsMode ?? "LEGACY",
    sportsSubjectId: card.sportsSubjectId ?? null,
    sportsCost: card.sportsCost ?? null,
  });
  if (!parsed.success || !["POINT", "SESSION"].includes(card.unit))
    return { eligible: false, reason: "課卡權益資料無效，請聯絡店家核對" };
  if (card.templateRestricted && !card.templateIds.includes(lesson.templateId))
    return { eligible: false, reason: "補課權益僅適用原課程" };
  const rights = parsed.data;
  let cost: number;
  if (rights.sportsMode === "LEGACY") {
    // Assigned lesson rights follow its teaching item, not the fee package
    // selected when scheduling. Aliases are verified in the same store by DB.
    if(lesson.enrollment === "ASSIGNED" && lesson.subjectId &&
       card.templateIds.some(id=>lesson.compatibleTemplateIds?.includes(id)))
      return {eligible:true,cost:card.unit === "SESSION"?1:lesson.pointCost};
    if (lesson.enrollment && !lesson.legacyPlanId)
      return { eligible: false, reason: "既有方案尚未設定新選課模式權益，請由店家核對" };
    if (lesson.legacyPlanId && card.planId !== lesson.legacyPlanId)
      return { eligible: false, reason: "此方案不適用本堂收費方式" };
    if (card.templateIds.length && !card.templateIds.includes(lesson.templateId))
      return { eligible: false, reason: "此方案不適用本堂課" };
    cost = card.unit === "SESSION" ? 1 : lesson.pointCost;
  } else if (rights.sportsMode === "ASSIGNED") {
    if (lesson.enrollment !== "ASSIGNED" || lesson.subjectId !== rights.sportsSubjectId)
      return { eligible: false, reason: "請使用本教學項目的指定學員方案" };
    cost = rights.sportsCost;
    if (card.unit === "SESSION" && cost !== 1)
      return { eligible: false, reason: "堂數方案每次使用 1 堂" };
  } else {
    if (lesson.enrollment !== "OPEN")
      return { eligible: false, reason: "通用卡僅適用開放選課" };
    cost = card.unit === "SESSION" ? 1 : lesson.pointCost;
  }
  if (!Number.isSafeInteger(cost) || cost < 1)
    return { eligible: false, reason: "本堂扣抵規則無效，請聯絡店家核對" };
  return { eligible: true, cost };
}
