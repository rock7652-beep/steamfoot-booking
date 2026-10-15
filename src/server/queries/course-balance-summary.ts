import { courseCardActiveExpiryWhere } from "@/lib/course-card-expiry";
import "server-only";
import { musicCardWhere } from "@/server/services/music-plan-scope";
import { courseBalanceTotals, type CourseBalanceTotal } from "@/lib/course-balance-summary";
import { getCourseCards } from "./course-members";

/** Reuse the authoritative card projection, including blocked opening-state checks.
 * No opening reservations are added a second time to materialized RESERVED rows.
 */
export async function getCourseBalanceSummary(storeId: string, customerId: string, music: boolean, dataScope?: string): Promise<CourseBalanceTotal[]> {
  const cards = await getCourseCards(storeId, customerId, {
    where: { AND: [musicCardWhere(storeId, dataScope)], closedAt: null, ...courseCardActiveExpiryWhere(new Date(), true), ...(music ? { unit: "SESSION" } : {}) },
    skip: 0, take: 2_147_483_647, entries: false,
  });
  return courseBalanceTotals(cards);
}
