"use client";

import { useState } from "react";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  DATA_EXPORT_STATUS_OPTIONS,
  DATA_EXPORT_TYPE_LABELS,
  dataExportTypes,
  type DataExportType,
} from "@/lib/data-export-labels";

type PeriodPreset = "thisMonth" | "lastMonth" | "custom";

function monthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

export default function DataExportClient({ isAdmin, stores, canCustomerExport, canReportExport }: { isAdmin: boolean; stores: { id: string; name: string }[]; canCustomerExport: boolean; canReportExport: boolean }) {
  const today = toLocalDateStr();
  const thisMonth = today.slice(0, 7);
  const currentMonthDates = { startDate: `${thisMonth}-01`, endDate: today };
  const availableTypes = dataExportTypes.filter((value) => value === "customers" ? canCustomerExport : canReportExport);
  const [type, setType] = useState<DataExportType>(availableTypes[0] ?? "customers");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("thisMonth");
  const [startDate, setStartDate] = useState(currentMonthDates.startDate);
  const [endDate, setEndDate] = useState(currentMonthDates.endDate);
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const isCustomerExport = type === "customers";

  function selectPeriod(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === "thisMonth") {
      setStartDate(currentMonthDates.startDate);
      setEndDate(currentMonthDates.endDate);
    } else if (preset === "lastMonth") {
      const dates = monthDates(previousMonth(thisMonth));
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  }

  async function download() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, startDate, endDate });
      if (status) params.set("status", status);
      if (isAdmin && storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/data-export?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "data-export.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "匯出失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">資料匯出</h1>
      <p className="mt-2 text-sm text-gray-600">依目前可存取的店別匯出；健康評估、內部備註、LINE／Messenger ID 與任何憑證均不會輸出。</p>
      <section className="mt-6 rounded-xl border p-5">
        {isAdmin ? (
          <label className="block text-sm font-medium">店別（選填，總部可選擇）
            <select className="mt-1 block w-full rounded border p-2" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}
            </select>
          </label>
        ) : <p className="text-sm text-gray-600">店別：您的目前門市</p>}

        <label className="mt-4 block text-sm font-medium">匯出類型（必填）
          <select className="mt-1 block w-full rounded border p-2" value={type} onChange={(event) => { setType(event.target.value as DataExportType); setStatus(""); }}>
            {availableTypes.map((value) => <option value={value} key={value}>{DATA_EXPORT_TYPE_LABELS[value]}</option>)}
          </select>
        </label>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">{isCustomerExport ? "顧客建立期間（預設本月）" : "期間（預設本月）"}</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["thisMonth", "lastMonth", "custom"] as const).map((preset) => <button type="button" key={preset} onClick={() => selectPeriod(preset)} className={`rounded border px-3 py-2 text-sm ${periodPreset === preset ? "border-green-700 bg-green-50 text-green-800" : "border-gray-300"}`}>{({ thisMonth: "本月", lastMonth: "上月", custom: "自訂期間" } as const)[preset]}</button>)}
          </div>
        </fieldset>

        {periodPreset === "custom" ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">{isCustomerExport ? "開始建立日期（必填）" : "開始日期（必填）"}<input className="mt-1 block w-full rounded border p-2" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-sm font-medium">{isCustomerExport ? "結束建立日期（必填）" : "結束日期（必填）"}<input className="mt-1 block w-full rounded border p-2" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div> : null}

        <label className="mt-4 block text-sm font-medium">狀態（選填）
          <select className="mt-1 block w-full rounded border p-2" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部狀態</option>
            {DATA_EXPORT_STATUS_OPTIONS[type].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="mt-5 rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={download} disabled={loading || (isAdmin && !storeId)}>{loading ? "匯出中…" : "匯出 Excel"}</button>
      </section>
    </main>
  );
}
