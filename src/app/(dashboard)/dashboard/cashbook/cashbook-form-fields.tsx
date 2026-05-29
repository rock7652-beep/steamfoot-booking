"use client";

/**
 * PR-4：cashbook 新增 / 編輯表單的「基本資料 + 付款方式」可互動區塊。
 *
 * 為什麼是 client component：
 *   閉店日防呆提示需要對「使用者當下選的日期 + 付款方式」即時反應，
 *   原本的 server component + 純 CSS radio 無法做到。其餘欄位（登錄人 / 備註 / 送出）
 *   仍由 server page 在同一個 <form> 內渲染，server action 照名稱讀 FormData。
 *
 * 防呆原則（與後端 guard 對齊；後端才是權威）：
 *   - 選到「已閉店」日期 → 顯示不恐嚇的說明（修改不會回頭重算抽屜快照）。
 *   - 已閉店 + 付款方式=現金 → 額外要求勾選確認（checkbox 為 required，
 *     送不出去；後端再用 confirmClosedCashbookChange 做權威把關）。
 *   - 已閉店 + 其他（非現金）→ 只提示、不擋（不影響抽屜）。
 */

import { useState } from "react";
import { FormSection, FormGrid } from "@/components/desktop";

type CashbookEntryType = "INCOME" | "EXPENSE" | "WITHDRAW" | "ADJUSTMENT";
type PaymentMethod = "CASH" | "OTHER";

interface Props {
  /** 此店在參考區間內已閉店的營業日（"YYYY-MM-DD"）。 */
  closedDates: string[];
  defaultEntryDate: string;
  defaultType: CashbookEntryType;
  defaultCategory: string;
  /** 金額預設值；新增時為空字串。 */
  defaultAmount: string;
  /** 預設付款方式；新增時為 null（不預選）。 */
  defaultPaymentMethod: PaymentMethod | null;
}

const inputCls =
  "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

const methodCardCls =
  "rounded-xl border-2 border-earth-200 bg-white px-4 py-4 text-center transition hover:border-earth-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:ring-2 peer-checked:ring-primary-200 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300";

export function CashbookFormFields({
  closedDates,
  defaultEntryDate,
  defaultType,
  defaultCategory,
  defaultAmount,
  defaultPaymentMethod,
}: Props) {
  const [entryDate, setEntryDate] = useState(defaultEntryDate);
  const [method, setMethod] = useState<PaymentMethod | null>(defaultPaymentMethod);

  const closedSet = new Set(closedDates);
  const isClosed = closedSet.has(entryDate);
  const needsCashConfirm = isClosed && method === "CASH";

  return (
    <>
      <FormSection title="基本資料" description="日期、類型、金額為必填">
        <FormGrid>
          <div>
            <label className={labelCls}>日期</label>
            <input
              type="date"
              name="entryDate"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label className={labelCls}>類型</label>
            <select
              name="type"
              required
              defaultValue={defaultType}
              className={`mt-1 ${inputCls}`}
            >
              <option value="INCOME">收入</option>
              <option value="EXPENSE">支出</option>
              <option value="WITHDRAW">提領</option>
              <option value="ADJUSTMENT">調整</option>
            </select>
          </div>
        </FormGrid>

        <FormGrid>
          <div>
            <label className={labelCls}>
              分類
              <span className="ml-1 text-xs text-earth-400">（選填）</span>
            </label>
            <input
              type="text"
              name="category"
              defaultValue={defaultCategory}
              className={`mt-1 ${inputCls}`}
              placeholder="例：房租、水費、銷售收入等"
            />
          </div>
          <div>
            <label className={labelCls}>金額（元）</label>
            <input
              type="number"
              name="amount"
              required
              min="0.01"
              step="0.01"
              defaultValue={defaultAmount}
              className={`mt-1 ${inputCls}`}
              placeholder="輸入金額"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="付款方式" description="請選擇此筆現金帳的收付方式（必選）">
        <div className="grid grid-cols-2 gap-3">
          <label className="cursor-pointer">
            <input
              type="radio"
              name="paymentMethod"
              value="CASH"
              required
              checked={method === "CASH"}
              onChange={() => setMethod("CASH")}
              className="peer sr-only"
            />
            <div className={methodCardCls}>
              <div className="text-base font-semibold text-earth-800">現金</div>
              <div className="mt-1 text-xs text-earth-500">實際收付現金</div>
            </div>
          </label>
          <label className="cursor-pointer">
            <input
              type="radio"
              name="paymentMethod"
              value="OTHER"
              required
              checked={method === "OTHER"}
              onChange={() => setMethod("OTHER")}
              className="peer sr-only"
            />
            <div className={methodCardCls}>
              <div className="text-base font-semibold text-earth-800">其他</div>
              <div className="mt-1 text-xs text-earth-500">匯款 / 轉帳 / 非現金</div>
            </div>
          </label>
        </div>

        {/* 未結帳日：說明現金 / 其他對今日抽屜的影響。已結帳日不顯示此句（避免誤會） */}
        {!isClosed && (
          <p className="text-xs text-earth-500">
            選「現金」會影響今日現金抽屜；選「其他」只會留下紀錄，不影響抽屜。
          </p>
        )}

        {/* 已結帳日提示：白話、不恐嚇（不提「現金會影響抽屜」） */}
        {isClosed && (
          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <p className="font-medium">這一天已經結帳了。</p>
            <p>現在新增或修改，只是補紀錄，不會改變當天的結帳金額。</p>
          </div>
        )}

        {/* 已結帳日 + 現金：要求明確確認（checkbox required，且後端再次把關） */}
        {needsCashConfirm && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-xs text-earth-700">
            <input
              type="checkbox"
              name="confirmClosedCashbookChange"
              value="on"
              required
              className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-300"
            />
            <span>我知道這只是補紀錄。</span>
          </label>
        )}
      </FormSection>
    </>
  );
}
