"use client";

import toolbar from "@/components/operations/filter-toolbar.module.css";
import { useState } from "react";
import { toLocalDateStr } from "@/lib/date-utils";
import {BEAUTY_EXPORT_LABELS,BEAUTY_EXPORT_PERIOD_LABELS,BEAUTY_EXPORT_STATUSES} from "@/lib/beauty/data-export";
import { COURSE_EXPORT_LABELS, COURSE_EXPORT_PERIOD_LABELS, COURSE_EXPORT_STATUSES } from "@/lib/course-data-export";
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

export default function DataExportClient({ isAdmin, stores, activeStoreId, canCustomerExport, canReportExport, courseMode = false, serviceMode = false, initialStartDate, initialEndDate, storeName, initialType, initialStatus }: { storeName?:string;initialType?:string;initialStatus?:string;initialStartDate?:string;initialEndDate?:string; isAdmin: boolean; stores: { id: string; name: string }[]; activeStoreId: string | null; canCustomerExport: boolean; canReportExport: boolean; courseMode?: boolean; serviceMode?: boolean }) {
  const today = toLocalDateStr();
  const thisMonth = today.slice(0, 7);
  const currentMonthDates = { startDate: `${thisMonth}-01`, endDate: today };
  const availableTypes = dataExportTypes.filter((value) => value === "customers" ? canCustomerExport : canReportExport);
  const [type, setType] = useState<DataExportType>(availableTypes.find(value=>value===initialType)??availableTypes[0]??"customers");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(initialStartDate&&initialEndDate?"custom":"thisMonth");
  const [startDate, setStartDate] = useState(initialStartDate??currentMonthDates.startDate);
  const [endDate, setEndDate] = useState(initialEndDate??currentMonthDates.endDate);
  const exportStatuses=serviceMode?BEAUTY_EXPORT_STATUSES:courseMode?COURSE_EXPORT_STATUSES:DATA_EXPORT_STATUS_OPTIONS;
  const [status, setStatus] = useState(exportStatuses[type].some(option=>option.value===initialStatus)?initialStatus!:"");
  const initialStoreId = stores.some((store) => store.id === activeStoreId) ? activeStoreId ?? "" : "";
  const [storeId, setStoreId] = useState(initialStoreId);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const labels = serviceMode ? BEAUTY_EXPORT_LABELS : courseMode ? COURSE_EXPORT_LABELS : DATA_EXPORT_TYPE_LABELS;
  const statuses = serviceMode ? BEAUTY_EXPORT_STATUSES : courseMode ? COURSE_EXPORT_STATUSES : DATA_EXPORT_STATUS_OPTIONS;
  const isCustomerExport = type === "customers";

  function persist(patch:Record<string,string>) {
    const url=new URL(window.location.href);
    for(const [key,value] of Object.entries(patch)) { if(value)url.searchParams.set(key,value);else url.searchParams.delete(key); }
    window.history.replaceState(null,"",url);
  }
  const selectedStoreName=isAdmin ? stores.find(store=>store.id===storeId)?.name??"請選擇門市" : storeName??"目前門市";
  const periodLabel=serviceMode ? BEAUTY_EXPORT_PERIOD_LABELS[type] : courseMode ? COURSE_EXPORT_PERIOD_LABELS[type] : isCustomerExport ? "顧客建立日期" : "交易日期";
  const validRange=!!startDate&&!!endDate&&startDate<=endDate;
  function selectPeriod(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === "thisMonth") {
      setStartDate(currentMonthDates.startDate);
      setEndDate(currentMonthDates.endDate);
      persist({dateFrom:currentMonthDates.startDate,dateTo:currentMonthDates.endDate});
    } else if (preset === "lastMonth") {
      const dates = monthDates(previousMonth(thisMonth));
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      persist({dateFrom:dates.startDate,dateTo:dates.endDate});
    }
  }

  async function download() {
    if (loading) return;
    setFeedback("");
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
      link.download = courseMode ? `${labels[type]}_${startDate}_${endDate}.xlsx` : "data-export.xlsx";
      link.click();
      URL.revokeObjectURL(url);
      setFeedback("已產生下載檔案。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "匯出失敗，請重試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`${toolbar.container} @container/export w-full min-w-0`}>
      <h2 className="text-base font-semibold">資料匯出</h2>
      <section className="mt-2 space-y-2 rounded-xl border p-3"><div className={toolbar.toolbar}>
        {isAdmin ? (
          <label className="block text-sm font-medium">門市
            <select className="mt-1 block min-h-11 w-full min-w-0 rounded border p-2" aria-label="門市" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              <option value="">請選擇門市</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}
            </select>
          </label>
        ) : null}

        <label className="block text-sm font-medium">匯出類型
          <select className="mt-1 block min-h-11 w-full min-w-0 rounded border p-2" aria-label="匯出類型" value={type} onChange={(event) => { setType(event.target.value as DataExportType); setStatus(""); persist({exportType:event.target.value,exportStatus:""}); }}>
            {availableTypes.map((value) => <option value={value} key={value}>{labels[value]}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">狀態
          <select className="mt-1 block min-h-11 w-full min-w-0 rounded border p-2" aria-label="狀態" value={status} onChange={(event) => {setStatus(event.target.value);persist({exportStatus:event.target.value});}}>
            <option value="">全部狀態</option>
            {statuses[type].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>

        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">期間</legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {(["thisMonth", "lastMonth", "custom"] as const).map((preset) => <button type="button" key={preset} onClick={() => selectPeriod(preset)} className={`min-h-11 rounded border px-3 py-2 text-sm ${periodPreset === preset ? "border-green-700 bg-green-50 text-green-800" : "border-gray-300"}`}>{({ thisMonth: "本月", lastMonth: "上月", custom: "自訂期間" } as const)[preset]}</button>)}
          </div>
        </fieldset>

        </div>{periodPreset === "custom" ? <div className={toolbar.toolbar}>
          <label className="text-sm font-medium">{isCustomerExport ? "開始建立日期" : "開始日期"}<input className="mt-1 block min-h-11 w-full min-w-0 rounded border p-2" type="date" value={startDate} onChange={(event) => {setStartDate(event.target.value);persist({dateFrom:event.target.value});}} /></label>
          <label className="text-sm font-medium">{isCustomerExport ? "結束建立日期" : "結束日期"}<input className="mt-1 block min-h-11 w-full min-w-0 rounded border p-2" type="date" value={endDate} onChange={(event) => {setEndDate(event.target.value);persist({dateTo:event.target.value});}} /></label>
        </div> : null}

        <div className="flex flex-wrap items-center justify-between gap-2"><p aria-label="匯出範圍" className="min-w-0 text-sm">{selectedStoreName}｜{startDate}～{endDate}｜{labels[type]}{status?`・${statuses[type].find(option=>option.value===status)?.label??status}`:""}<span className="ml-2 text-earth-500">依{periodLabel}</span></p><button className="min-h-11 shrink-0 rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={download} disabled={loading || !validRange || (isAdmin && !storeId)}>{loading ? "匯出中…" : "匯出 Excel"}</button></div>{!validRange&&<p role="alert" className="text-sm text-red-700">請選擇有效期間，結束日期不可早於開始日期。</p>}
        {feedback && <p role="status" className="mt-3 text-sm">{feedback}</p>}
      </section><details className="text-sm text-earth-500"><summary className="min-h-11 cursor-pointer py-3">匯出欄位說明</summary><p>健康評估、內部備註、LINE／Messenger ID 與任何憑證均不會輸出。</p></details>
    </main>
  );
}
