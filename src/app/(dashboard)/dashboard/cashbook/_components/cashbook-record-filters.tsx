"use client";

import { useId } from "react";
import { usePathname } from "next/navigation";
import { OperationsControls } from "@/components/operations/workspace-frame";
import { InstantFilterForm } from "@/components/instant-filter-form";
import styles from "@/components/admin/commerce-layout.module.css";

type RecordKind = "" | "income" | "retail" | "other" | "expense" | "withdraw" | "adjustment";

export function CashbookRecordFilters({ month, kind, keyword }: { month: string; kind: RecordKind; keyword: string }) {
  const pathname = usePathname(), formId = useId();
  return <InstantFilterForm label="現金帳紀錄篩選" id={formId} action={`${pathname}#cashbook-records`} preserveQuery className={styles.filters}
    transformQuery={(params, data) => {
      const next = String(data.get("kind") ?? "");
      params.delete("kind"); params.delete("type"); params.delete("categoryGroup");
      if (next) params.set("type", next === "retail" || next === "other" ? "INCOME" : next.toUpperCase());
      if (next === "retail" || next === "other") params.set("categoryGroup", next);
      if (data.get("month") !== month) { params.delete("dateFrom"); params.delete("dateTo"); }
      if (params.has("q")) params.set("q", params.get("q")!.slice(0, 60));
    }}>
    <OperationsControls><label className={`${styles.filterField} text-sm text-earth-600`}>月份
      <input form={formId} name="month" type="month" required defaultValue={month} className="mt-1 block min-h-11 rounded-lg border border-earth-300 bg-white px-3 text-sm focus:outline-none" />
    </label></OperationsControls>
    <label className={`${styles.filterField} text-sm text-earth-600`}>收支類型
      <select name="kind" defaultValue={kind} className="mt-1 block min-h-11 rounded-lg border border-earth-300 bg-white px-3 text-sm focus:outline-none">
        <option value="">全部收支</option><option value="income">全部收入</option>
        <option value="retail">零售收入</option><option value="other">其他收入</option>
        <option value="expense">支出</option><option value="withdraw">提領</option><option value="adjustment">調整</option>
      </select>
    </label>
    <label className={`${styles.filterSearch} text-sm text-earth-600`}>搜尋記帳
      <input name="q" defaultValue={keyword} maxLength={60} placeholder="顧客、電話、項目或備註" className="mt-1 block min-h-11 w-full rounded-lg border border-earth-300 bg-white px-3 text-sm focus:outline-none" />
    </label>
  </InstantFilterForm>;
}
