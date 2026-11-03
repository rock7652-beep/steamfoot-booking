/** Purchased snapshot only; remaining quota and the product name can change. */
export function musicPurchasedQuantity(termSizes?: readonly number[] | null) {
  if (!termSizes?.length || termSizes.some(size => !Number.isSafeInteger(size) || size <= 0)) return null;
  return `購買 ${termSizes.length} 期・共 ${termSizes.reduce((total, size) => total + size, 0)} 堂`;
}

/** A product's nominal period count must not contradict the purchased snapshot. */
export function musicPurchasedTitle(name: string, termSizes?: readonly number[] | null) {
  if (!musicPurchasedQuantity(termSizes)) return name;
  return name.replace(/(?:[・·\s]*)(?:第\s*)?\d+\s*期\s*$/, "").trim() || name;
}
