"use client";

import { useEffect, useMemo, useState } from "react";
import { createInitialPaymentSplits, isValidPaymentSplitSet, type PaymentSplitInput, type PaymentMethodValue } from "@/lib/payment-splits";

const METHODS: Array<{ value: PaymentMethodValue; label: string }> = [
  { value: "CASH", label: "現金" }, { value: "TRANSFER", label: "轉帳" },
  { value: "LINE_PAY", label: "LINE Pay" }, { value: "CREDIT_CARD", label: "信用卡" }, { value: "OTHER", label: "其他" },
];

/** Controlled-safe mixed-payment editor (2–5 distinct methods). */
export function PaymentSplitFields({ totalAmount, primaryMethod, disabled, onChange, onValidityChange, allowedMethods }: {
  allowedMethods?:readonly PaymentMethodValue[];
  totalAmount: number; primaryMethod: PaymentMethodValue; disabled?: boolean;
  onChange: (splits: PaymentSplitInput[] | undefined) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const methods=allowedMethods?METHODS.filter(m=>allowedMethods.includes(m.value)):METHODS;
  const initialSplits=()=>{const fallback=methods.find(m=>m.value!==primaryMethod)?.value;return fallback?[{paymentMethod:primaryMethod,amount:totalAmount},{paymentMethod:fallback,amount:0}]:createInitialPaymentSplits(primaryMethod,totalAmount);};
  const [enabled, setEnabled] = useState(false);
  const [splits, setSplits] = useState<PaymentSplitInput[]>([]);
  const [splitSource, setSplitSource] = useState(`${primaryMethod}:${totalAmount}`);
  const source = `${primaryMethod}:${totalAmount}`;
  // A changed total or primary method deliberately makes the previous rows stale.
  // Render a reset draft immediately, but do not write state from an effect.
  const needsRedistribution = enabled && splitSource !== source;
  const displayedSplits = needsRedistribution
    ? initialSplits()
    : splits;
  const sum = useMemo(() => displayedSplits.reduce((n, split) => n + (Number.isFinite(split.amount) ? split.amount : 0), 0), [displayedSplits]);
  const valid = enabled && !needsRedistribution && isValidPaymentSplitSet(displayedSplits, totalAmount);

  useEffect(() => { onValidityChange?.(!enabled || valid); }, [enabled, valid, onValidityChange]);
  useEffect(() => { if (!enabled) onChange(undefined); }, [enabled, onChange]);
  function enable(next: boolean) {
    setEnabled(next);
    if (next) { const reset = initialSplits(); setSplits(reset); setSplitSource(source); onChange(reset); }
  }
  function update(index: number, patch: Partial<PaymentSplitInput>) {
    const next = displayedSplits.map((split, i) => i === index ? { ...split, ...patch } : split);
    setSplits(next); setSplitSource(source); onChange(next);
  }
  function add() {
    const method = methods.find((candidate) => !displayedSplits.some((split) => split.paymentMethod === candidate.value));
    if (!method) return;
    const next = [...displayedSplits, { paymentMethod: method.value, amount: 0 }];
    setSplits(next); setSplitSource(source); onChange(next);
  }
  function remove(index: number) {
    const next = displayedSplits.filter((_, i) => i !== index);
    setSplits(next); setSplitSource(source); onChange(next);
  }

  return <div className="mb-4 rounded-lg border border-earth-200 p-3 text-sm">
    <label className="flex min-h-11 items-center gap-2 font-medium text-earth-800"><input className="h-5 w-5 shrink-0 appearance-auto accent-primary-700" type="checkbox" checked={enabled} disabled={disabled} onChange={(e) => enable(e.target.checked)} />混合付款</label>
    {enabled && <div className="mt-3 space-y-2">
      {displayedSplits.map((split, index) => <div key={`${index}-${split.paymentMethod}`} className="flex flex-wrap gap-2">
        <select aria-label={`付款方式 ${index+1}`} value={split.paymentMethod} disabled={disabled} onChange={(e) => update(index, { paymentMethod: e.target.value as PaymentMethodValue })} className="min-h-11 rounded border border-earth-300 px-2 py-1 text-base">
          {methods.map((method) => <option key={method.value} value={method.value} disabled={method.value !== split.paymentMethod && displayedSplits.some((item) => item.paymentMethod === method.value)}>{method.label}</option>)}
        </select>
        <input type="number" min="1" value={split.amount || ""} disabled={disabled} onChange={(e) => update(index, { amount: Math.round(Number(e.target.value)) })} aria-label={`付款金額 ${index+1}`} className="min-h-11 min-w-0 flex-1 rounded border border-earth-300 px-2 py-1" />
        <button type="button" disabled={disabled || displayedSplits.length <= 2} onClick={() => remove(index)} className="min-h-11 rounded border border-earth-300 px-2 text-sm text-earth-600 disabled:opacity-40">刪除</button>
      </div>)}
      <button type="button" disabled={disabled || displayedSplits.length >= 5 || displayedSplits.length >= methods.length} onClick={add} className="min-h-11 rounded border border-earth-300 px-2 py-1 text-sm text-earth-700 disabled:opacity-40">＋ 新增付款方式</button>
      {needsRedistribution && <p className="text-xs text-amber-700">實收金額或主要付款方式已變更，請重新分配各付款金額。</p>}
      <p className={valid ? "text-xs text-green-700" : "text-xs text-red-600"}>拆分合計 NT$ {sum.toLocaleString()}／實收 NT$ {totalAmount.toLocaleString()}（必須相等；最多 {methods.length} 種）</p>
    </div>}
  </div>;
}
