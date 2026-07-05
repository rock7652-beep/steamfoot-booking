"use client";

import { useMemo, useState, useTransition } from "react";
import type { StoreSettlementStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  confirmStoreSettlementAction,
  saveStoreSettlementAction,
} from "@/server/actions/store-settlement";
import type { ServiceFeeCalculatorSummary } from "@/server/services/service-fee-calculator";
import type { StoreSettlementRecord } from "@/server/services/store-settlements";

interface CalculatorFormProps {
  summary: ServiceFeeCalculatorSummary;
  currentSettlement: StoreSettlementRecord | null;
  settlements: StoreSettlementRecord[];
  canSave: boolean;
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return `NT$ ${Math.round(value).toLocaleString()}`;
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-");
  return `${year}/${mon}`;
}

function statusLabel(status: StoreSettlementStatus): string {
  return status === "CONFIRMED" ? "已確認" : "草稿";
}

export function ServiceFeeCalculatorForm({
  summary,
  currentSettlement,
  settlements,
  canSave,
}: CalculatorFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fixedMonthlyFee, setFixedMonthlyFee] = useState(
    String(currentSettlement?.fixedMonthlyFee ?? 0),
  );
  const [revenueShareRate, setRevenueShareRate] = useState(
    String(currentSettlement?.revenueShareRate ?? 0),
  );
  const [additionalAmount, setAdditionalAmount] = useState(
    String(currentSettlement?.additionalAmount ?? 0),
  );
  const [deductionAmount, setDeductionAmount] = useState(
    String(currentSettlement?.deductionAmount ?? 0),
  );
  const [note, setNote] = useState(currentSettlement?.note ?? "");
  const [status, setStatus] = useState<StoreSettlementStatus>(
    currentSettlement?.status ?? "DRAFT",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculation = useMemo(() => {
    const fixedFee = parseAmount(fixedMonthlyFee);
    const sharePercent = parseAmount(revenueShareRate);
    const addition = parseAmount(additionalAmount);
    const deduction = parseAmount(deductionAmount);
    const shareAmount = Math.round(summary.netRevenue * (sharePercent / 100));
    const receivable = summary.netRevenue - shareAmount + fixedFee + addition - deduction;
    return {
      fixedFee,
      sharePercent,
      addition,
      deduction,
      shareAmount,
      receivable,
    };
  }, [additionalAmount, deductionAmount, fixedMonthlyFee, revenueShareRate, summary.netRevenue]);

  function buildFormData(nextStatus = status): FormData {
    const formData = new FormData();
    formData.set("month", summary.month);
    formData.set("grossRevenue", String(Math.round(summary.grossRevenue)));
    formData.set("refundAmount", String(Math.round(summary.refundAmount)));
    formData.set("netRevenue", String(Math.round(summary.netRevenue)));
    formData.set(
      "transactionCount",
      String(summary.revenueTransactionCount + summary.refundTransactionCount),
    );
    formData.set("fixedMonthlyFee", fixedMonthlyFee);
    formData.set("revenueShareRate", revenueShareRate);
    formData.set("additionalAmount", additionalAmount);
    formData.set("deductionAmount", deductionAmount);
    formData.set("note", note);
    formData.set("status", nextStatus);
    return formData;
  }

  function saveSettlement() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await saveStoreSettlementAction(buildFormData());
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("月結試算已儲存");
      router.refresh();
    });
  }

  function confirmSettlement(month: string) {
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("month", month);
    startTransition(async () => {
      const result = await confirmStoreSettlementAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("月結紀錄已標記為已確認");
      router.refresh();
    });
  }

  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-3">
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
                id="revenueShareRate"
                label="分潤比例 %"
                value={revenueShareRate}
                onChange={setRevenueShareRate}
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
              <label htmlFor="settlementStatus">
                <span className="text-xs font-medium text-earth-600">狀態</span>
                <select
                  id="settlementStatus"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StoreSettlementStatus)}
                  className="mt-1 h-10 w-full rounded-md border border-earth-200 bg-white px-3 text-sm text-earth-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="DRAFT">草稿</option>
                  <option value="CONFIRMED">已確認</option>
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="text-xs font-medium text-earth-600">備註</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="可記錄本月特殊調整原因。"
                  className="mt-1 w-full resize-none rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-earth-200 bg-white">
            <div className="border-b border-earth-100 px-3 py-2">
              <h2 className="text-sm font-semibold text-earth-800">本月試算</h2>
              <p className="text-[11px] text-earth-400">
                有效營收－分潤金額＋固定月費＋其他加項－其他扣項。
              </p>
            </div>
            <div className="divide-y divide-earth-100 px-3 py-2 text-sm">
              <BreakdownRow label="有效營收" value={formatMoney(summary.netRevenue)} />
              <BreakdownRow
                label={`分潤金額（${calculation.sharePercent || 0}%）`}
                value={`-${formatMoney(calculation.shareAmount)}`}
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
            <div className="border-t border-earth-100 px-3 py-3">
              {!canSave ? (
                <p className="text-xs text-amber-700">
                  請先切換到指定分店，再儲存月結試算。
                </p>
              ) : null}
              {message ? <p className="mb-2 text-xs text-green-700">{message}</p> : null}
              {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
              <button
                type="button"
                onClick={saveSettlement}
                disabled={!canSave || isPending}
                className="h-9 rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-earth-300"
              >
                {isPending ? "儲存中..." : "儲存本月試算"}
              </button>
            </div>
          </section>
        </section>
      </div>

      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-100 px-3 py-2">
          <h2 className="text-sm font-semibold text-earth-800">最近月結紀錄</h2>
          <p className="text-[11px] text-earth-400">
            點月份可載入該月份資料；確認狀態目前不鎖定修改。
          </p>
        </div>
        {settlements.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-earth-500">
            尚無月結紀錄。
          </div>
        ) : (
          <div className="divide-y divide-earth-100">
            {settlements.map((settlement) => (
              <div key={settlement.id} className="px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/dashboard/service-fee-calculator?month=${settlement.month}`}
                      className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                    >
                      {formatMonthLabel(settlement.month)}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-earth-500">
                      {statusLabel(settlement.status)} · {formatMoney(settlement.finalReceivable)}
                    </p>
                  </div>
                  {settlement.status !== "CONFIRMED" ? (
                    <button
                      type="button"
                      onClick={() => confirmSettlement(settlement.month)}
                      disabled={isPending || !canSave}
                      className="h-7 rounded-md border border-earth-200 bg-white px-2 text-[11px] font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:text-earth-300"
                    >
                      標記確認
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-earth-500">
                  <span>有效營收 {formatMoney(settlement.netRevenue)}</span>
                  <span>分潤 {formatMoney(settlement.revenueShareAmount)}</span>
                  <span>固定月費 {formatMoney(settlement.fixedMonthlyFee)}</span>
                  <span>加扣 {formatMoney(settlement.additionalAmount - settlement.deductionAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
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
