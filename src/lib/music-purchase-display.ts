/** Purchased snapshot only; remaining quota and the product name can change. */
export function musicPurchasedQuantity(termSizes?: readonly number[] | null) {
  if (!termSizes?.length || termSizes.some(size => !Number.isSafeInteger(size) || size <= 0)) return null;
  return `購買 ${termSizes.length} 期・共 ${termSizes.reduce((total, size) => total + size, 0)} 堂`;
}
