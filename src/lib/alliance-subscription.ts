/** HQ subscription is separate from each branch subscription. No inherited plan. */
export const ALLIANCE_BASE_MONTHLY = 4990;
export const ALLIANCE_EXTRA_BRANCH_MONTHLY = 1000;
export type OrganizationStore = {
  id: string; name: string; parentStoreId: string | null;
  plan: string; maxStoresOverride: number | null;
};

// Existing maxStoresOverride counts the HQ itself; the UI exposes branch slots only.
export function branchCapacity(store: OrganizationStore): number {
  return Math.max(0, (store.maxStoresOverride ?? (store.plan === "ALLIANCE" ? 2 : 1)) - 1);
}
export function managementMonthlyFee(branchSlots: number): number {
  return ALLIANCE_BASE_MONTHLY + Math.max(0, branchSlots - 1) * ALLIANCE_EXTRA_BRANCH_MONTHLY;
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
  return stores.filter(s => s.plan === "ALLIANCE").map(s => ({
    storeId: s.id, storeName: s.name,
    branchCount: organizationDescendants(stores, s.id).size,
    purchasedBranches: branchCapacity(s),
    monthlyFee: managementMonthlyFee(branchCapacity(s)),
  }));
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
      if (count > branchCapacity(parent)) throw new Error(`${parent.name}的分店串接額度不足，請先由平台管理員確認加購並開通額度`);
    }
    id = parent.parentStoreId;
  }
  if (parentId && !subscribed) throw new Error("請先為所屬總部開通展店版，再串接分店");
}
