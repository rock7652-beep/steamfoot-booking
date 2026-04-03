import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";

// 快捷按鈕的日期區間計算
function getDateRange(preset: string): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (preset) {
    case "today":
      return { startDate: today, endDate: today, label: `${today}` };
    case "week": {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(y, m, d + mondayOffset);
      const sunday = new Date(y, m, d + mondayOffset + 6);
      return {
        startDate: monday.toISOString().slice(0, 10),
        endDate: sunday.toISOString().slice(0, 10),
        label: `本週`,
      };
    }
    case "month": {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return {
        startDate: first.toISOString().slice(0, 10),
        endDate: last.toISOString().slice(0, 10),
        label: `${y}/${String(m + 1).padStart(2, "0")}`,
      };
    }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const first = new Date(y, qStart, 1);
      const last = new Date(y, qStart + 3, 0);
      return {
        startDate: first.toISOString().slice(0, 10),
        endDate: last.toISOString().slice(0, 10),
        label: `${y} Q${Math.floor(m / 3) + 1}`,
      };
    }
    default:
      return { startDate: today, endDate: today, label: today };
  }
}

interface PageProps {
  searchParams: Promise<{
    preset?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  void user;

  // 計算日期區間
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  let startDate: string;
  let endDate: string;
  let activePreset = params.preset || "month";
  let displayLabel: string;

  if (params.startDate && params.endDate) {
    // 自訂區間
    startDate = params.startDate;
    endDate = params.endDate;
    activePreset = "custom";
    displayLabel = `${startDate} ~ ${endDate}`;
  } else if (params.preset) {
    const range = getDateRange(params.preset);
    startDate = range.startDate;
    endDate = range.endDate;
    displayLabel = range.label;
  } else {
    // 預設本月
    const range = getDateRange("month");
    startDate = range.startDate;
    endDate = range.endDate;
    displayLabel = range.label;
  }

  // 目前後端仍以 month 為單位查詢，用 startDate 取月份
  const month = startDate.slice(0, 7);

  const storeSummary = await monthlyStoreSummary(month);
  const revenueByCategory = await monthlyRevenueByCategory(month);

  const presets = [
    { key: "today", label: "今日" },
    { key: "week", label: "本週" },
    { key: "month", label: "本月" },
    { key: "quarter", label: "本季" },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">報表</h1>
      </div>

      {/* 快捷按鈕列 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <Link
            key={p.key}
            href={`?preset=${p.key}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activePreset === p.key
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* 自訂區間 */}
      <form method="GET" className="mb-5 flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500">起始</label>
          <input
            name="startDate"
            type="date"
            defaultValue={activePreset === "custom" ? startDate : ""}
            className="mt-0.5 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500">結束</label>
          <input
            name="endDate"
            type="date"
            defaultValue={activePreset === "custom" ? endDate : ""}
            className="mt-0.5 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          查詢
        </button>
      </form>

      {/* 區間顯示 */}
      <p className="mb-4 text-sm text-gray-500">
        {displayLabel} 營收摘要
      </p>

      {/* 摘要卡片 */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">課程總收入</p>
          <p className="text-lg font-bold text-gray-900">
            ${storeSummary.totalCourseRevenue.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">退款</p>
          <p className="text-lg font-bold text-red-600">
            ${Math.abs(storeSummary.totalRefund).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">完成服務</p>
          <p className="text-lg font-bold text-gray-900">{storeSummary.completedBookings} 堂</p>
        </div>
        <div className="rounded-xl border bg-indigo-50 p-3.5 shadow-sm">
          <p className="text-xs text-indigo-600">淨收入</p>
          <p className="text-lg font-bold text-indigo-700">
            ${storeSummary.netCourseRevenue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* 店長明細 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">店長明細</h2>
        <div className="space-y-2">
          {storeSummary.staffBreakdown.length === 0 ? (
            <div className="rounded-xl border bg-white py-8 text-center text-sm text-gray-400">
              本期無資料
            </div>
          ) : (
            storeSummary.staffBreakdown.map((r) => (
              <div key={r.staffId} className="rounded-xl border bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{r.staffName}</span>
                  <span className="text-sm font-semibold text-indigo-700">
                    ${r.netRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>顧客 {r.customerCount}</span>
                  <span>有效 {r.activeCustomerCount}</span>
                  <span>服務 {r.completedBookings} 堂</span>
                  {r.spaceFee > 0 && (
                    <span className="text-red-500">空間費 ${r.spaceFee.toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 收入類型 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">收入類型</h2>
        {revenueByCategory.length === 0 ? (
          <div className="rounded-xl border bg-white py-8 text-center text-sm text-gray-400">
            本期無資料
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">店長</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">體驗</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">單次</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">套餐</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">淨收</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {revenueByCategory.map((r) => (
                  <tr key={r.staffId}>
                    <td className="px-3 py-2 font-medium">{r.staffName}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {r.trialRevenue > 0 ? `$${r.trialRevenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {r.singleRevenue > 0 ? `$${r.singleRevenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {r.packageRevenue > 0 ? `$${r.packageRevenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-indigo-700">
                      ${r.netRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 匯出 */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">匯出</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/export/store-monthly?month=${month}`}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            download
          >
            全店月報 CSV
          </a>
          <a
            href={`/api/export/staff-monthly?month=${month}`}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            download
          >
            店長月報 CSV
          </a>
        </div>
      </section>
    </div>
  );
}
