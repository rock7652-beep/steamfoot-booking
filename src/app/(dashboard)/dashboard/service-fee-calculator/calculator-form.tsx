"use client";

import { useMemo, useState } from "react";

interface CalculatorFormProps {
  netRevenue: number;
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return `NT$ ${Math.round(value).toLocaleString()}`;
}

export function ServiceFeeCalculatorForm({ netRevenue }: CalculatorFormProps) {
  const [fixedMonthlyFee, setFixedMonthlyFee] = useState("0");
  const [revenueSharePercent, setRevenueSharePercent] = useState("0");
  const [additionalAmount, setAdditionalAmount] = useState("0");
  const [deductionAmount, setDeductionAmount] = useState("0");
  const [note, setNote] = useState("");

  const calculation = useMemo(() => {
    const fixedFee = parseAmount(fixedMonthlyFee);
    const sharePercent = parseAmount(revenueSharePercent);
    const addition = parseAmount(additionalAmount);
    const deduction = parseAmount(deductionAmount);
    const shareAmount = Math.round(netRevenue * (sharePercent / 100));
    const receivable = fixedFee + shareAmount + addition - deduction;
    return {
      fixedFee,
      sharePercent,
      addition,
      deduction,
      shareAmount,
      receivable,
    };
  }, [additionalAmount, deductionAmount, fixedMonthlyFee, netRevenue, revenueSharePercent]);

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-100 px-3 py-2">
          <h2 className="text-sm font-semibold text-earth-800">試算條件</h2>
          <p className="text-[11px] text-earth-400">
            輸入固定月費、分潤與加扣項後，右側會立即更新本月應收。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 px-3 py-3 md:grid-cols-2">
          <NumberField
            id="fixedMonthlyFee"
            label="固定月費"
            value={fixedMonthlyFee}
            onChange={setFixedMonthlyFee}
          />
          <NumberField
            id="revenueSharePercent"
            label="分潤比例 %"
            value={revenueSharePercent}
            onChange={setRevenueSharePercent}
            min={0}
            step="0.1"
          />
          <NumberField
            id="additionalAmount"
            label="其他加項"
            value={additionalAmount}
            onChange={setAdditionalAmount}
          />
          <NumberField
            id="deductionAmount"
            label="其他扣項"
            value={deductionAmount}
            onChange={setDeductionAmount}
          />
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-earth-600">備註</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="可記錄本月特殊調整原因；此 MVP 不會儲存備註。"
              className="mt-1 w-full resize-none rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-100 px-3 py-2">
          <h2 className="text-sm font-semibold text-earth-800">本月試算</h2>
          <p className="text-[11px] text-earth-400">
            此為即時試算結果，尚未建立正式月結單。
          </p>
        </div>
        <div className="divide-y divide-earth-100 px-3 py-2 text-sm">
          <BreakdownRow label="有效營收" value={formatMoney(netRevenue)} />
          <BreakdownRow
            label={`分潤金額（${calculation.sharePercent || 0}%）`}
            value={formatMoney(calculation.shareAmount)}
          />
          <BreakdownRow label="固定月費" value={formatMoney(calculation.fixedFee)} />
          <BreakdownRow label="其他加項" value={formatMoney(calculation.addition)} />
          <BreakdownRow label="其他扣項" value={`-${formatMoney(calculation.deduction)}`} />
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-semibold text-earth-800">
              {calculation.receivable >= 0 ? "本月應收" : "本月應付"}
            </span>
            <span className="text-xl font-bold tabular-nums text-primary-700">
              {formatMoney(Math.abs(calculation.receivable))}
            </span>
          </div>
        </div>
      </section>
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  step = "1",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  step?: string;
}) {
  return (
    <label htmlFor={id}>
      <span className="text-xs font-medium text-earth-600">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-earth-200 bg-white px-3 text-sm tabular-nums text-earth-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
    </label>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-earth-500">{label}</span>
      <span className="font-semibold tabular-nums text-earth-900">{value}</span>
    </div>
  );
}
