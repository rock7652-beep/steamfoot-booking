/** Validate a cashier's explicit amount before any transaction is written.
 * Creation-time price defaults may be clamped; actual money received must not be.
 */
export function trialCollectionAmountError(
  amount: number | undefined,
  people: number,
  settings: {
    trialAllowPriceEdit: boolean;
    trialDefaultPrice: number;
    trialMinPrice: number;
    trialMaxPrice: number;
  },
): string | null {
  if (amount === undefined) return null;
  const count = Math.max(1, Math.floor(people || 1));
  if (!Number.isSafeInteger(amount) || amount < 0) return "請輸入有效的整數收款金額";
  if (!settings.trialAllowPriceEdit) {
    const expected = settings.trialDefaultPrice * count;
    return amount === expected ? null : `體驗費固定為 NT$${expected}，請確認收款金額；購買方案請另外結帳。`;
  }
  const min = Math.min(settings.trialMinPrice, settings.trialMaxPrice) * count;
  const max = Math.max(settings.trialMinPrice, settings.trialMaxPrice) * count;
  return amount >= min && amount <= max ? null
    : `體驗收款須介於 NT$${min}–${max}，尚未儲存；購買方案請另外結帳。`;
}
