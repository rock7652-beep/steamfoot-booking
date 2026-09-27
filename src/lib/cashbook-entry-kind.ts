/** Keep the existing category prefix so historical cashbook rows retain their report classification. */
export type CashbookEntryKind = "RETAIL" | "OTHER" | "EXPENSE";

export function isRetailCashbookCategory(category: string | null | undefined) {
  return category?.startsWith("零售-") ?? false;
}

export function cashbookCategoryForKind(kind: CashbookEntryKind | null, item: string) {
  const name = item.trim();
  if (kind === "RETAIL") return `零售-${name.replace(/^零售-/, "") || "其他商品"}`;
  if (kind === "OTHER") {
    // Explicit "other" must not become retail when the item happens to start with the legacy prefix.
    return name.startsWith("零售-") ? `其他收入：${name}` : name || "其他收入";
  }
  return name;
}
