"use client";

/**
 * cashbook 新增 / 編輯表單的「基本資料 + 付款方式」可互動區塊。
 *
 * 收入分類原則：系統不猜備註文字。手動收入明確選「零售商品」或「其他收入」；
 * 零售再選常用方案。支出仍保留自由分類，避免破壞既有記帳習慣。
 */

import { useState } from "react";
import { FormSection, FormGrid } from "@/components/desktop";

type CashbookEntryType = "INCOME" | "EXPENSE" | "WITHDRAW" | "ADJUSTMENT";
type PaymentMethod = "CASH" | "OTHER";

const TYPE_LABEL: Record<CashbookEntryType, string> = {
  INCOME: "收入",
  EXPENSE: "支出",
  WITHDRAW: "提領",
  ADJUSTMENT: "調整",
};

const ALL_TYPES: CashbookEntryType[] = ["INCOME", "EXPENSE", "WITHDRAW", "ADJUSTMENT"];
const RETAIL_CATEGORIES = [
  ["零售-A計畫", "A 計畫"],
  ["零售-B計畫", "B 計畫"],
  ["零售-喝水計畫", "喝水計畫"],
  ["零售-蒸足VIP", "蒸足 VIP"],
  ["零售-其他商品", "其他商品"],
] as const;

interface Props {
  closedDates: string[];
  defaultEntryDate: string;
  defaultType: CashbookEntryType;
  defaultCategory: string;
  defaultAmount: string;
  defaultPaymentMethod: PaymentMethod | null;
  allowedTypes?: CashbookEntryType[];
}

const inputCls =
  "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

const methodCardCls =
  "rounded-xl border-2 border-earth-200 bg-white px-4 py-2.5 text-center transition hover:border-earth-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:ring-2 peer-checked:ring-primary-200 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300";

function initialIncomeKind(category: string): "RETAIL" | "OTHER" {
  return category.startsWith("零售-") ? "RETAIL" : "OTHER";
}

export function CashbookFormFields({
  closedDates,
  defaultEntryDate,
  defaultType,
  defaultCategory,
  defaultAmount,
  defaultPaymentMethod,
  allowedTypes = ALL_TYPES,
}: Props) {
  const [entryDate, setEntryDate] = useState(defaultEntryDate);
  const [entryType, setEntryType] = useState<CashbookEntryType>(defaultType);
  const [method, setMethod] = useState<PaymentMethod | null>(defaultPaymentMethod);
  const [incomeKind, setIncomeKind] = useState<"RETAIL" | "OTHER">(
    initialIncomeKind(defaultCategory),
  );
  const [retailCategory, setRetailCategory] = useState(
    defaultCategory.startsWith("零售-") ? defaultCategory : "零售-A計畫",
  );

  const closedSet = new Set(closedDates);
  const isClosed = closedSet.has(entryDate);
  const involvesCash = method === "CASH" || defaultPaymentMethod === "CASH";
  const needsCashConfirm = isClosed && involvesCash;

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
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as CashbookEntryType)}
              className={`mt-1 ${inputCls}`}
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </FormGrid>

        <FormGrid>
          <div>
            {entryType === "INCOME" ? (
              <>
                <label className={labelCls}>收入分類</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="cursor-pointer rounded-lg border border-earth-200 px-3 py-2 text-sm">
                    <input
                      type="radio"
                      className="mr-2"
                      checked={incomeKind === "RETAIL"}
                      onChange={() => setIncomeKind("RETAIL")}
                    />
                    零售商品
                  </label>
                  <label className="cursor-pointer rounded-lg border border-earth-200 px-3 py-2 text-sm">
                    <input
                      type="radio"
                      className="mr-2"
                      checked={incomeKind === "OTHER"}
                      onChange={() => setIncomeKind("OTHER")}
                    />
                    其他收入
                  </label>
                </div>
                {incomeKind === "RETAIL" ? (
                  <select
                    name="category"
                    value={retailCategory}
                    onChange={(e) => setRetailCategory(e.target.value)}
                    className={`mt-2 ${inputCls}`}
                  >
                    {RETAIL_CATEGORIES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                ) : (
                  <input type="hidden" name="category" value="其他收入" />
                )}
                <p className="mt-1 text-xs text-earth-500">
                  系統會用這個分類計算零售趨勢，不會從備註文字猜測。
                </p>
              </>
            ) : (
              <>
                <label className={labelCls}>
                  分類
                  <span className="ml-1 text-xs text-earth-400">（選填）</span>
                </label>
                <input
                  type="text"
                  name="category"
                  defaultValue={defaultCategory}
                  className={`mt-1 ${inputCls}`}
                  placeholder="例：房租、水費、材料、雜支"
                />
              </>
            )}
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
              <div className="mt-1 text-xs text-earth-500">實際收付現金，會影響抽屜</div>
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
              <div className="mt-1 text-xs text-earth-500">匯款 / 轉帳 / 非現金，不影響抽屜</div>
            </div>
          </label>
        </div>

        {!isClosed && (
          <p className="text-xs text-earth-500">
            選「現金」會影響今日現金抽屜；選「其他」只會留下紀錄，不影響抽屜。
          </p>
        )}

        {isClosed && (
          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <p className="font-medium">這一天已經結帳了。</p>
            <p>現在新增或修改，只是補紀錄，不會改變當天的結帳金額。</p>
          </div>
        )}

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
