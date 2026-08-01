"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentSplitInput, PaymentMethodValue } from "@/lib/payment-splits";

const METHODS: Array<{ value: PaymentMethodValue; label: string }> = [
  { value: "CASH", label: "現金" }, { value: "TRANSFER", label: "轉帳" },
  { value: "LINE_PAY", label: "LINE Pay" }, { value: "CREDIT_CARD", label: "信用卡" }, { value: "OTHER", label: "其他" },
];

/** Optional two-or-more-method editor; callers keep the legacy primary method. */
export function PaymentSplitFields({ totalAmount, primaryMethod, disabled, onChange }: {
  totalAmount: number; primaryMethod: PaymentMethodValue; disabled?: boolean;
  onChange: (splits: PaymentSplitInput[] | undefined) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [splits, setSplits] = useState<PaymentSplitInput[]>([]);
  useEffect(() => { if (!enabled) onChange(undefined); }, [enabled, onChange]);
  const sum = useMemo(() => splits.reduce((n, s) => n + (Number.isFinite(s.amount) ? s.amount : 0), 0), [splits]);
  function enable(next: boolean) {
    setEnabled(next);
    if (next) {
      const second = METHODS.find((m) => m.value !== primaryMethod)!.value;
      const nextSplits = [{ paymentMethod: primaryMethod, amount: totalAmount }, { paymentMethod: second, amount: 0 }];
      setSplits(nextSplits); onChange(nextSplits);
    }
  }
  function update(index: number, patch: Partial<PaymentSplitInput>) {
    const next = splits.map((s, i) => i === index ? { ...s, ...patch } : s);
    setSplits(next); onChange(next);
  }
  return <div className="mb-4 rounded-lg border border-earth-200 p-3 text-sm">
    <label className="flex items-center gap-2 font-medium text-earth-800"><input type="checkbox" checked={enabled} disabled={disabled} onChange={(e) => enable(e.target.checked)} />混合付款</label>
    {enabled && <div className="mt-3 space-y-2">
      {splits.map((split, i) => <div key={i} className="flex gap-2"><select value={split.paymentMethod} disabled={disabled} onChange={(e) => update(i, { paymentMethod: e.target.value as PaymentMethodValue })} className="rounded border border-earth-300 px-2 py-1">{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select><input type="number" min="1" value={split.amount || ""} disabled={disabled} onChange={(e) => update(i, { amount: Math.round(Number(e.target.value)) })} className="min-w-0 flex-1 rounded border border-earth-300 px-2 py-1" /></div>)}
      <p className={sum === totalAmount && splits.every((s) => s.amount > 0) ? "text-xs text-green-700" : "text-xs text-red-600"}>拆分合計 NT$ {sum.toLocaleString()}／實收 NT$ {totalAmount.toLocaleString()}（必須相等）</p>
    </div>}
  </div>;
}
