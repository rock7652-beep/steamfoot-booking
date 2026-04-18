/**
 * 顧客潛力自動標記（後台用）
 *
 * 依既有 shareCount / visitCount / totalPoints 判讀，不讀取 DB、不新增 schema。
 * 規則集中此處，UI 各頁共用；前台禁止顯示這些標記。
 *
 * 規則：
 *   - future_owner_watch: 下列至少 2 項成立
 *       · shareCount >= 5
 *       · visitCount >= 2
 *       · totalPoints >= 150
 *   - high_potential:    下列任一成立
 *       · shareCount >= 3
 *       · visitCount >= 1
 *       · totalPoints >= 100
 *   - 同時符合時僅顯示 future_owner_watch（不重複顯示）
 */

export type CustomerPotentialTag = "none" | "high_potential" | "future_owner_watch";

export interface PotentialTagInput {
  shareCount: number;
  visitCount: number;
  totalPoints: number;
}

export function getCustomerPotentialTag(input: PotentialTagInput): CustomerPotentialTag {
  const futureChecks = [
    input.shareCount >= 5,
    input.visitCount >= 2,
    input.totalPoints >= 150,
  ].filter(Boolean).length;

  if (futureChecks >= 2) return "future_owner_watch";

  const isHighPotential =
    input.shareCount >= 3 ||
    input.visitCount >= 1 ||
    input.totalPoints >= 100;

  if (isHighPotential) return "high_potential";
  return "none";
}

export const POTENTIAL_TAG_LABEL: Record<CustomerPotentialTag, string> = {
  none: "",
  high_potential: "高潛力",
  future_owner_watch: "未來店長觀察",
};
