/** Amounts are whole NT dollars. Never allocate money that was not received. */
export function calculateCourseSaleAllocation(paid: number, storeCost: number) {
  if (![paid, storeCost].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("實收與店家成本必須是非負整數");
  return { storeAmount: Math.min(paid, storeCost), developerAmount: Math.max(0, paid - storeCost), shortfall: Math.max(0, storeCost - paid) };
}
/** Cumulative reversal avoids rounding drift across multiple refunds. */
export function courseAllocationAfterRefund(paid:number, storeAmount:number, refunded:number) {
  if (![paid,storeAmount,refunded].every(v=>Number.isSafeInteger(v)&&v>=0)||storeAmount>paid||refunded>paid) throw new Error("分配或退款金額不正確");
  const reversedStore=paid===0?0:Math.round(storeAmount*refunded/paid);
  return {storeAmount:storeAmount-reversedStore,developerAmount:paid-storeAmount-(refunded-reversedStore)};
}
