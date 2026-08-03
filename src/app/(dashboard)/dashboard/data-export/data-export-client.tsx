"use client";

import { useState } from "react";
import { toLocalDateStr } from "@/lib/date-utils";

const items = [
  ["customers", "顧客資料"], ["transactions", "營收與交易明細"], ["bookings", "預約與服務紀錄"], ["wallets", "方案與堂數明細"],
] as const;

export default function DataExportClient({ isAdmin, stores, canCustomerExport, canReportExport }: { isAdmin: boolean; stores: { id: string; name: string }[]; canCustomerExport: boolean; canReportExport: boolean }) {
  const today = toLocalDateStr();
  const [type, setType] = useState<(typeof items)[number][0]>(canCustomerExport ? "customers" : "transactions");
  const [startDate, setStartDate] = useState(today.slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  async function download() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, startDate, endDate }); if (status) params.set("status", status); if (isAdmin && storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/data-export?${params}`); if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "data-export.xlsx"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { alert(error instanceof Error ? error.message : "匯出失敗"); } finally { setLoading(false); }
  }
  const availableItems = items.filter(([value]) => value === "customers" ? canCustomerExport : canReportExport);
  return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">資料匯出</h1><p className="mt-2 text-sm text-gray-600">匯出資料依目前可存取店別限制；健康評估、內部備註、LINE／Messenger ID 與任何憑證均不會輸出。</p><section className="mt-6 rounded-xl border p-5">{isAdmin && <label className="block text-sm font-medium">店別<select className="mt-1 block w-full rounded border p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)}>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>}<label className="mt-4 block text-sm font-medium">匯出類型<select className="mt-1 block w-full rounded border p-2" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{availableItems.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">開始日期<input className="mt-1 block w-full rounded border p-2" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label className="text-sm font-medium">結束日期<input className="mt-1 block w-full rounded border p-2" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div><label className="mt-4 block text-sm font-medium">狀態（選填）<input className="mt-1 block w-full rounded border p-2" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="例如 SUCCESS、COMPLETED、ACTIVE" /></label><button className="mt-5 rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={download} disabled={loading || (isAdmin && !storeId)}>{loading ? "匯出中…" : "匯出 Excel"}</button></section></main>;
}
