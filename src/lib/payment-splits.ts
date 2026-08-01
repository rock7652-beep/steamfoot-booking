import { z } from "zod";
import { AppError } from "@/lib/errors";

export const paymentMethodValues = ["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"] as const;
export type PaymentMethodValue = (typeof paymentMethodValues)[number];
export type PaymentSplitInput = { paymentMethod: PaymentMethodValue; amount: number };

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
