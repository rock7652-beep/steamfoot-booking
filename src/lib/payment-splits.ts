import { z } from "zod";
import { AppError } from "@/lib/errors";

export const paymentMethodValues = ["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"] as const;
export type PaymentMethodValue = (typeof paymentMethodValues)[number];
export type PaymentSplitInput = { paymentMethod: PaymentMethodValue; amount: number };

/**
 * Returns the amount attributable to one payment method without duplicating a
 * mixed-payment transaction. Rows without split details are historical single
 * payments and retain their original transaction-level amount.
 */
export function paymentMethodReportAmount(
  transaction: { paymentMethod: string; amount: number; paymentSplits: Array<{ paymentMethod: string; amount: number }> },
  paymentMethod: string,
): number {
  if (transaction.paymentSplits.length === 0) {
    return transaction.paymentMethod === paymentMethod ? transaction.amount : 0;
  }
  return transaction.paymentSplits.find((split) => split.paymentMethod === paymentMethod)?.amount ?? 0;
}

/** Reset-safe initial state after the total or primary method changes. */
export function createInitialPaymentSplits(primaryMethod: PaymentMethodValue, totalAmount: number): PaymentSplitInput[] {
  const fallback = paymentMethodValues.find((method) => method !== primaryMethod)!;
  return [{ paymentMethod: primaryMethod, amount: totalAmount }, { paymentMethod: fallback, amount: 0 }];
}

export function isValidPaymentSplitSet(splits: PaymentSplitInput[], totalAmount: number): boolean {
  return splits.length >= 2 && splits.length <= 5 &&
    new Set(splits.map((split) => split.paymentMethod)).size === splits.length &&
    splits.every((split) => Number.isInteger(split.amount) && split.amount > 0) &&
    splits.reduce((sum, split) => sum + split.amount, 0) === totalAmount;
}

export const paymentSplitSchema = z.object({
  paymentMethod: z.enum(paymentMethodValues),
  amount: z.number().int().positive("各付款方式金額須大於 0").max(1_000_000),
});

/** Validates a mixed payment before the one-and-only Transaction is created. */
export function normalizePaymentSplits(splits: PaymentSplitInput[] | undefined, totalAmount: number): PaymentSplitInput[] | null {
  if (!splits) return null; // legacy single-payment input
  if (splits.length < 2) throw new AppError("VALIDATION", "混合付款至少需要兩種付款方式");
  const parsed = z.array(paymentSplitSchema).min(2).max(5).parse(splits);
  const totals = new Map<PaymentMethodValue, number>();
  for (const split of parsed) totals.set(split.paymentMethod, (totals.get(split.paymentMethod) ?? 0) + split.amount);
  if (totals.size < 2) throw new AppError("VALIDATION", "混合付款至少需要兩種不同付款方式");
  const normalized = Array.from(totals, ([paymentMethod, amount]) => ({ paymentMethod, amount }));
  const sum = normalized.reduce((total, split) => total + split.amount, 0);
  if (sum !== totalAmount) throw new AppError("VALIDATION", `付款拆分合計（${sum}）必須等於實收總額（${totalAmount}）`);
  return normalized;
}

export function paymentSplitCreateData(splits: PaymentSplitInput[] | null) {
  return splits ? { paymentSplits: { create: splits } } : {};
}
