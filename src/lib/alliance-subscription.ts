/** HQ subscription is separate from each branch subscription. No inherited plan. */
export const ALLIANCE_BASE_MONTHLY = 4990;
export const ALLIANCE_STANDARD_BRANCH_LIMIT = 15;
export const ALLIANCE_BRANCH_PRICING_COPY = "首間免串接費，第 2～5 間每間 $500／月，第 6～15 間每間 $300／月，分段計算。各分店系統月費另計，16 間起另行報價。";
export type OrganizationStore = {
  id: string; name: string; parentStoreId: string | null;
  plan: string; maxStoresOverride: number | null;
};

// Existing maxStoresOverride counts the HQ itself; the UI exposes branch slots only.
export function branchCapacity(store: OrganizationStore): number {
  return Math.max(0, (store.maxStoresOverride ?? (store.plan === "ALLIANCE" ? 2 : 1)) - 1);
}
/** null means a custom quote is required; never extrapolate beyond 15 branches. */
export function branchConnectionMonthlyFee(branchCount: number): number | null {
  if (!Number.isSafeInteger(branchCount) || branchCount < 0) throw new Error("請輸入有效的分店間數");
  if (branchCount > ALLIANCE_STANDARD_BRANCH_LIMIT) return null;
  return Math.max(0, Math.min(branchCount, 5) - 1) * 500 + Math.max(0, branchCount - 5) * 300;
}
export function managementMonthlyFee(branchCount: number): number | null {
  const fee = branchConnectionMonthlyFee(branchCount);
  return fee === null ? null : ALLIANCE_BASE_MONTHLY + fee;
}
export function organizationDescendants(stores: OrganizationStore[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const store of stores) if (store.parentStoreId) {
    children.set(store.parentStoreId, [...(children.get(store.parentStoreId) ?? []), store.id]);
  }
  const seen = new Set<string>();
  const queue = [...(children.get(rootId) ?? [])];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === rootId || seen.has(id)) throw new Error("店舖組織不可形成循環關係");
    seen.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return seen;
}
export function organizationSubscriptionRows(stores: OrganizationStore[]) {
  return stores.filter(s => s.plan === "ALLIANCE").map(s => {
    const branchCount = organizationDescendants(stores, s.id).size;
    return {
    storeId: s.id, storeName: s.name,
    branchCount,
    purchasedBranches: branchCapacity(s),
    monthlyFee: managementMonthlyFee(branchCount),
    connectionFee: branchConnectionMonthlyFee(branchCount),
    };
  });
}
/** Validate only receiving ancestors; unrelated organizations never consume capacity. */
export function assertOrganizationCapacity(stores: OrganizationStore[], parentId: string | null): void {
  const byId = new Map(stores.map(s => [s.id, s]));
  const visited = new Set<string>();
  let id = parentId;
  let subscribed = false;
  while (id) {
    if (visited.has(id)) throw new Error("店舖組織不可形成循環關係");
    visited.add(id);
    const parent = byId.get(id);
    if (!parent) throw new Error("上層店舖不存在");
    if (parent.plan === "ALLIANCE") {
      subscribed = true;
      const count = organizationDescendants(stores, id).size;
      if (count > branchCapacity(parent)) throw new Error(`${parent.name}的分店串接額度不足，請聯絡平台管理員確認費用並開通；16 間起另行報價`);
    }
    id = parent.parentStoreId;
  }
  if (parentId && !subscribed) throw new Error("請先為所屬總部開通展店版，再串接分店");
}
