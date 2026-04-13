"use client";

import { useState, useCallback, useEffect } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportButton } from "./ExportButton";

// ============================================================
// Types
// ============================================================

interface StoreOption { id: string; name: string }
interface CoachOption { id: string; name: string; role: string }

interface KpiData {
  totalRevenue: number;
  refundAmount: number;
  netRevenue: number;
  txCount: number;
  customerCount: number;
  avgPerCustomer: number;
  newCustomerRevenue?: number;
  existingCustomerRevenue?: number;
}

interface StoreSummaryRow {
  storeId: string;
  storeName: string;
  totalRevenue: number;
  refundAmount: number;
  netRevenue: number;
  txCount: number;
  customerCount: number;
  avgPerCustomer: number;
  trialRevenue: number;
  packageRevenue: number;
  singleRevenue: number;
  otherRevenue: number;
}

interface CoachSummaryRow {
  coachId: string;
  coachName: string;
  coachRole: string;
  storeName: string;
  totalRevenue: number;
  refundAmount: number;
  netRevenue: number;
  txCount: number;
  customerCount: number;
  avgPerTx: number;
  newCustomerRevenue: number;
  existingCustomerRevenue: number;
  trialRevenue: number;
  packageRevenue: number;
  singleRevenue: number;
  otherRevenue: number;
}

interface DetailRow {
  id: string;
  transactionNo: string | null;
  transactionDate: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  coachName: string | null;
  coachRole: string | null;
  planName: string | null;
  planType: string | null;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentMethod: string;
  status: string;
  isFirstPurchase: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

type ReportMode = "store" | "coach";

interface Props {
  mode: ReportMode;
  stores: StoreOption[];
  coaches: CoachOption[];
  isAdmin: boolean;
  defaultStartDate: string;
  defaultEndDate: string;
}

// ============================================================
// Helper formatters
// ============================================================

function fmtMoney(n: number): string {
  return n.toLocaleString("zh-TW");
}

function fmtPlanType(t: string | null): string {
  if (!t) return "-";
  const m: Record<string, string> = { TRIAL: "體驗", SINGLE: "單次", PACKAGE: "套餐" };
  return m[t] ?? t;
}

function fmtPayment(m: string): string {
  const map: Record<string, string> = {
    CASH: "現金", TRANSFER: "轉帳", LINE_PAY: "LINE Pay",
    CREDIT_CARD: "信用卡", OTHER: "其他", UNPAID: "未付款",
  };
  return map[m] ?? m;
}

function fmtStatus(s: string): string {
  const map: Record<string, string> = { SUCCESS: "成功", CANCELLED: "已取消", REFUNDED: "已退款" };
  return map[s] ?? s;
}

function fmtRole(r: string | null): string {
  if (!r) return "-";
  const map: Record<string, string> = { ADMIN: "總部", OWNER: "店長", PARTNER: "合作店長" };
  return map[r] ?? r;
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

// ============================================================
// Main Component
// ============================================================

export function RevenueReportClient({
  mode,
  stores,
  coaches,
  isAdmin,
  defaultStartDate,
  defaultEndDate,
}: Props) {
  // Filters
  const [periodType, setPeriodType] = useState<"today" | "month" | "custom">("month");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [storeId, setStoreId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [coachRole, setCoachRole] = useState("");
  const [planType, setPlanType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [keyword, setKeyword] = useState("");

  // Data
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [storeSummary, setStoreSummary] = useState<StoreSummaryRow[]>([]);
  const [coachSummary, setCoachSummary] = useState<CoachSummaryRow[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "details">("summary");
  const [dateError, setDateError] = useState<string | null>(null);

  const pageSize = 50;

  // Build query string
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("startDate", startDate);
    p.set("endDate", endDate);
    if (storeId) p.set("storeId", storeId);
    if (coachId) p.set("coachId", coachId);
    if (coachRole) p.set("coachRole", coachRole);
    if (planType) p.set("planType", planType);
    if (paymentMethod) p.set("paymentMethod", paymentMethod);
    if (keyword) p.set("keyword", keyword);
    return p;
  }, [startDate, endDate, storeId, coachId, coachRole, planType, paymentMethod, keyword]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return;
    if (endDate < startDate) {
      setDateError("結束日期不能早於起始日期");
      return;
    }
    setDateError(null);
    setLoading(true);

    try {
      const apiBase = mode === "store"
        ? "/api/reports/store-revenue"
        : "/api/reports/coach-revenue";

      const params = buildParams();

      // Fetch summary + KPI
      params.set("level", "summary");
      const summaryRes = await fetch(`${apiBase}?${params.toString()}`);
      if (!summaryRes.ok) throw new Error("查詢失敗");
      const summaryData = await summaryRes.json();

      setKpi(summaryData.kpi);
      if (mode === "store") {
        setStoreSummary(summaryData.summary);
      } else {
        setCoachSummary(summaryData.summary);
      }

      // Fetch details page 1
      params.set("level", "details");
      params.set("page", "1");
      params.set("pageSize", String(pageSize));
      const detailRes = await fetch(`${apiBase}?${params.toString()}`);
      if (!detailRes.ok) throw new Error("查詢失敗");
      const detailData = await detailRes.json();

      setDetails(detailData.data);
      setDetailTotal(detailData.total);
      setDetailPage(1);
    } catch (e) {
      console.error(e);
      alert("查詢失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }, [mode, buildParams, startDate, endDate]);

  // Fetch details page
  const fetchDetailsPage = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const apiBase = mode === "store"
        ? "/api/reports/store-revenue"
        : "/api/reports/coach-revenue";

      const params = buildParams();
      params.set("level", "details");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`${apiBase}?${params.toString()}`);
      if (!res.ok) throw new Error("查詢失敗");
      const data = await res.json();

      setDetails(data.data);
      setDetailTotal(data.total);
      setDetailPage(page);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [mode, buildParams]);

  // Period type handlers
  function handlePeriodChange(type: "today" | "month" | "custom") {
    setPeriodType(type);
    const now = new Date();
    if (type === "today") {
      const today = now.toISOString().slice(0, 10);
      setStartDate(today);
      // endDate = tomorrow for the range
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setEndDate(tomorrow.toISOString().slice(0, 10));
    } else if (type === "month") {
      const y = now.getFullYear();
      const m = now.getMonth();
      setStartDate(`${y}-${String(m + 1).padStart(2, "0")}-01`);
      const lastDay = new Date(y, m + 1, 0);
      setEndDate(`${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`);
    }
  }

  // Auto-fetch on mount
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Export URL builder
  const buildExportUrl = useCallback(() => {
    const params = buildParams();
    params.set("reportType", mode);
    params.set("level", "all");
    params.set("periodType", periodType);
    const storeName = stores.find(s => s.id === storeId)?.name ?? "全部";
    const coachName = coaches.find(c => c.id === coachId)?.name ?? "全部";
    params.set("storeName", storeName);
    params.set("coachName", coachName);
    return `/api/reports/export?${params.toString()}`;
  }, [buildParams, mode, periodType, storeId, coachId, stores, coaches]);

  const totalPages = Math.ceil(detailTotal / pageSize);

  return (
    <div className="space-y-6">
      {/* ===== Filters ===== */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-earth-200 space-y-3">
        {/* Period pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "month", "custom"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handlePeriodChange(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                periodType === t
                  ? "bg-primary-600 text-white shadow-sm"
                  : "bg-earth-100 text-earth-700 hover:bg-earth-200"
              }`}
            >
              {t === "today" ? "日報" : t === "month" ? "月報" : "自訂區間"}
            </button>
          ))}
        </div>

        {/* Date + Filters */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-earth-500 mb-0.5">開始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPeriodType("custom"); setDateError(null); }}
              className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs text-earth-500 mb-0.5">結束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPeriodType("custom"); setDateError(null); }}
              className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          {isAdmin && stores.length > 1 && (
            <div>
              <label className="block text-xs text-earth-500 mb-0.5">分店</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">全部</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {mode === "coach" && coaches.length > 0 && (
            <>
              <div>
                <label className="block text-xs text-earth-500 mb-0.5">教練</label>
                <select
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option value="">全部</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-earth-500 mb-0.5">教練角色</label>
                <select
                  value={coachRole}
                  onChange={(e) => setCoachRole(e.target.value)}
                  className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option value="">全部</option>
                  <option value="OWNER">店長</option>
                  <option value="PARTNER">合作店長</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-earth-500 mb-0.5">方案類型</label>
            <select
              value={planType}
              onChange={(e) => setPlanType(e.target.value)}
              className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="">全部</option>
              <option value="TRIAL">體驗</option>
              <option value="SINGLE">單次</option>
              <option value="PACKAGE">套餐</option>
            </select>
          </div>

          {mode === "store" && (
            <div>
              <label className="block text-xs text-earth-500 mb-0.5">收款方式</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="block rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">全部</option>
                <option value="CASH">現金</option>
                <option value="TRANSFER">轉帳</option>
                <option value="LINE_PAY">LINE Pay</option>
                <option value="CREDIT_CARD">信用卡</option>
                <option value="OTHER">其他</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-earth-500 mb-0.5">關鍵字</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="客戶/方案/單號"
              className="block w-32 rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "查詢中..." : "查詢"}
          </button>

          <ExportButton buildUrl={buildExportUrl} disabled={loading} />
        </div>

        {dateError && <p className="text-xs text-red-500">{dateError}</p>}
      </div>

      {/* ===== KPI Cards ===== */}
      {kpi && (
        <div className={`grid gap-3 ${mode === "coach" ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
          <KpiCard label="總營收" value={fmtMoney(kpi.totalRevenue)} color="primary" />
          <KpiCard label="退款金額" value={fmtMoney(kpi.refundAmount)} color="red" />
          <KpiCard label="淨營收" value={fmtMoney(kpi.netRevenue)} color="green" />
          <KpiCard label="交易筆數" value={kpi.txCount} color="blue" />
          <KpiCard label="客戶數" value={kpi.customerCount} color="amber" />
          <KpiCard label="平均客單價" value={fmtMoney(kpi.avgPerCustomer)} color="earth" />
          {mode === "coach" && kpi.newCustomerRevenue != null && (
            <>
              <KpiCard label="新客收入" value={fmtMoney(kpi.newCustomerRevenue)} color="green" />
              <KpiCard label="舊客續購" value={fmtMoney(kpi.existingCustomerRevenue ?? 0)} color="blue" />
            </>
          )}
        </div>
      )}

      {/* ===== Tabs ===== */}
      <div className="flex gap-1 border-b border-earth-200">
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "summary"
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-earth-500 hover:text-earth-700"
          }`}
        >
          {mode === "store" ? "店營收總表" : "教練營收總表"}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "details"
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-earth-500 hover:text-earth-700"
          }`}
        >
          {mode === "store" ? "店營收明細" : "教練營收明細"}
        </button>
      </div>

      {/* ===== Loading ===== */}
      {loading && (
        <div className="flex justify-center py-12">
          <svg className="h-8 w-8 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* ===== Summary Tab ===== */}
      {!loading && activeTab === "summary" && (
        <>
          {mode === "store" && storeSummary.length === 0 && (
            <EmptyState title="無資料" description="所選條件下無店營收資料" />
          )}
          {mode === "store" && storeSummary.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-earth-50">
                  <tr>
                    {["分店名稱", "總營收", "退款金額", "淨營收", "交易筆數", "客戶數", "平均客單價", "體驗方案", "正式方案", "票券", "商品"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-earth-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100">
                  {storeSummary.map((s) => (
                    <tr key={s.storeId} className="hover:bg-earth-50">
                      <td className="px-3 py-2 font-medium">{s.storeName}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.totalRevenue)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{fmtMoney(s.refundAmount)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">{fmtMoney(s.netRevenue)}</td>
                      <td className="px-3 py-2 text-right">{s.txCount}</td>
                      <td className="px-3 py-2 text-right">{s.customerCount}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.avgPerCustomer)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.trialRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.packageRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.singleRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.otherRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mode === "coach" && coachSummary.length === 0 && (
            <EmptyState title="無資料" description="所選條件下無教練營收資料" />
          )}
          {mode === "coach" && coachSummary.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-earth-50">
                  <tr>
                    {["教練姓名", "教練角色", "分店", "歸屬總收入", "退款", "淨收入", "筆數", "客戶數", "平均單筆", "新客收入", "舊客收入", "體驗", "正式方案", "票券", "商品"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-earth-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100">
                  {coachSummary.map((c) => (
                    <tr key={c.coachId} className="hover:bg-earth-50">
                      <td className="px-3 py-2 font-medium">{c.coachName}</td>
                      <td className="px-3 py-2">{fmtRole(c.coachRole)}</td>
                      <td className="px-3 py-2">{c.storeName}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.totalRevenue)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{fmtMoney(c.refundAmount)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">{fmtMoney(c.netRevenue)}</td>
                      <td className="px-3 py-2 text-right">{c.txCount}</td>
                      <td className="px-3 py-2 text-right">{c.customerCount}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.avgPerTx)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.newCustomerRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.existingCustomerRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.trialRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.packageRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.singleRevenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.otherRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== Details Tab ===== */}
      {!loading && activeTab === "details" && (
        <>
          {details.length === 0 && (
            <EmptyState title="無明細" description="所選條件下無交易明細" />
          )}
          {details.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-earth-50">
                    <tr>
                      {(mode === "store"
                        ? ["交易日期", "交易單號", "分店", "客戶", "電話", "方案", "類型", "原價", "折扣", "實收", "收款方式", "狀態", "備註", "建立人員", "建立時間"]
                        : ["交易日期", "交易單號", "分店", "教練", "角色", "客戶", "電話", "方案", "類型", "實收", "收款方式", "狀態", "新客", "備註", "建立時間"]
                      ).map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-earth-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-earth-100">
                    {details.map((d) => (
                      <tr key={d.id} className="hover:bg-earth-50">
                        {mode === "store" ? (
                          <>
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.transactionDate)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-earth-500">{d.transactionNo ?? "-"}</td>
                            <td className="px-3 py-2">{d.storeName}</td>
                            <td className="px-3 py-2">{d.customerName}</td>
                            <td className="px-3 py-2 text-xs">{d.customerPhone}</td>
                            <td className="px-3 py-2">{d.planName ?? "-"}</td>
                            <td className="px-3 py-2">{fmtPlanType(d.planType)}</td>
                            <td className="px-3 py-2 text-right">{fmtMoney(d.grossAmount)}</td>
                            <td className="px-3 py-2 text-right">{fmtMoney(d.discountAmount)}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtMoney(d.netAmount)}</td>
                            <td className="px-3 py-2">{fmtPayment(d.paymentMethod)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                d.status === "SUCCESS" ? "bg-green-100 text-green-700" :
                                d.status === "REFUNDED" ? "bg-red-100 text-red-700" :
                                "bg-earth-100 text-earth-600"
                              }`}>{fmtStatus(d.status)}</span>
                            </td>
                            <td className="px-3 py-2 text-xs text-earth-500 max-w-[120px] truncate">{d.note ?? "-"}</td>
                            <td className="px-3 py-2 text-xs">{d.createdByName ?? "-"}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-earth-500">{fmtDate(d.createdAt)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.transactionDate)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-earth-500">{d.transactionNo ?? "-"}</td>
                            <td className="px-3 py-2">{d.storeName}</td>
                            <td className="px-3 py-2">{d.coachName ?? "-"}</td>
                            <td className="px-3 py-2">{fmtRole(d.coachRole)}</td>
                            <td className="px-3 py-2">{d.customerName}</td>
                            <td className="px-3 py-2 text-xs">{d.customerPhone}</td>
                            <td className="px-3 py-2">{d.planName ?? "-"}</td>
                            <td className="px-3 py-2">{fmtPlanType(d.planType)}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtMoney(d.netAmount)}</td>
                            <td className="px-3 py-2">{fmtPayment(d.paymentMethod)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                d.status === "SUCCESS" ? "bg-green-100 text-green-700" :
                                d.status === "REFUNDED" ? "bg-red-100 text-red-700" :
                                "bg-earth-100 text-earth-600"
                              }`}>{fmtStatus(d.status)}</span>
                            </td>
                            <td className="px-3 py-2 text-center">{d.isFirstPurchase ? "✓" : ""}</td>
                            <td className="px-3 py-2 text-xs text-earth-500 max-w-[120px] truncate">{d.note ?? "-"}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-earth-500">{fmtDate(d.createdAt)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-earth-500">
                    共 {detailTotal} 筆，第 {detailPage} / {totalPages} 頁
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => fetchDetailsPage(detailPage - 1)}
                      disabled={detailPage <= 1 || loading}
                      className="rounded-lg border border-earth-300 px-3 py-1 text-sm disabled:opacity-50"
                    >
                      上一頁
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchDetailsPage(detailPage + 1)}
                      disabled={detailPage >= totalPages || loading}
                      className="rounded-lg border border-earth-300 px-3 py-1 text-sm disabled:opacity-50"
                    >
                      下一頁
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
