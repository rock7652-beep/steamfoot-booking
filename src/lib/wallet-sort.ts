/**
 * Plan wallet 自動選擇排序：FEFO (First Expiring, First Out)
 *
 * 規則（依序）：
 *   1. 有到期日的方案，依 expiryDate ASC（快到期的先用）
 *   2. 沒有到期日的方案排在最後
 *   3. 到期日相同 → createdAt ASC（先買的先用）
 *   4. createdAt 也相同 → id ASC（保證排序穩定）
 *
 * 出現背景：原本 FIFO 會先用「最早購買、無期限」的方案，導致後買、快過期
 * 的方案被晾著作廢。改 FEFO 讓快到期的先消耗，符合店家現場與顧客利益。
 */

export interface SortableWallet {
  id: string;
  expiryDate: Date | string | null;
  createdAt: Date | string;
}

function toTime(d: Date | string): number {
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}

export function compareWalletByFEFO(a: SortableWallet, b: SortableWallet): number {
  const aHasExpiry = a.expiryDate != null;
  const bHasExpiry = b.expiryDate != null;

  if (aHasExpiry && !bHasExpiry) return -1;
  if (!aHasExpiry && bHasExpiry) return 1;

  if (aHasExpiry && bHasExpiry) {
    const diff = toTime(a.expiryDate as Date | string) - toTime(b.expiryDate as Date | string);
    if (diff !== 0) return diff;
  }

  const createdDiff = toTime(a.createdAt) - toTime(b.createdAt);
  if (createdDiff !== 0) return createdDiff;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortWalletsByFEFO<T extends SortableWallet>(wallets: readonly T[]): T[] {
  return [...wallets].sort(compareWalletByFEFO);
}
