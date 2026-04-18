import { prisma } from "@/lib/db";
import {
  getCustomerPotentialTag,
  type CustomerPotentialTag,
} from "@/lib/customer-potential-tag";

/**
 * 批次取得多位顧客的潛力標記（後台列表用，避免 N+1）
 *
 * 口徑與 getMyReferralSummary 一致：
 *   - shareCount: ReferralEvent.type = SHARE
 *   - visitCount: distinct customerId of ReferralEvent.type = BOOKING_COMPLETED
 *   - totalPoints: Customer.totalPoints 快取
 */
export async function getPotentialTagsForCustomers(
  customerIds: string[],
  opts?: { storeId?: string | null },
): Promise<Map<string, CustomerPotentialTag>> {
  const result = new Map<string, CustomerPotentialTag>();
  if (customerIds.length === 0) return result;

  const storeId = opts?.storeId ?? null;

  const [customers, events] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, totalPoints: true, storeId: true },
    }),
    prisma.referralEvent.findMany({
      where: {
        referrerId: { in: customerIds },
        type: { in: ["SHARE", "BOOKING_COMPLETED"] },
        ...(storeId ? { storeId } : {}),
      },
      select: { referrerId: true, customerId: true, type: true },
    }),
  ]);

  const shareCounts = new Map<string, number>();
  const visitedSets = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.referrerId) continue;
    if (e.type === "SHARE") {
      shareCounts.set(e.referrerId, (shareCounts.get(e.referrerId) ?? 0) + 1);
    } else if (e.type === "BOOKING_COMPLETED" && e.customerId) {
      let set = visitedSets.get(e.referrerId);
      if (!set) {
        set = new Set();
        visitedSets.set(e.referrerId, set);
      }
      set.add(e.customerId);
    }
  }

  for (const c of customers) {
    if (storeId && c.storeId !== storeId) continue;
    const tag = getCustomerPotentialTag({
      shareCount: shareCounts.get(c.id) ?? 0,
      visitCount: visitedSets.get(c.id)?.size ?? 0,
      totalPoints: c.totalPoints,
    });
    result.set(c.id, tag);
  }

  return result;
}
