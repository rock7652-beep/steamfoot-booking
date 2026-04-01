import {
  monthlyStoreSummary,
  customerConsumptionDetail,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import { getCurrentUser } from "@/lib/session";

interface PageProps {
  searchParams: Promise<{ month?: string; customerId?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const month = params.month ?? currentMonth;
  const user = await getCurrentUser();

  const storeSummary = await monthlyStoreSummary(month);
  const revenueByCategory = await monthlyRevenueByCategory(month);

  // If customerId provided, show customer consumption detail
  let consumptionDetail: Awaited<ReturnType<typeof customerConsumptionDetail>> | null = null;
  if (params.customerId) {
    consumptionDetail = await customerConsumptionDetail(params.customerId, month);
  }

  void user;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">報表</h1>
      </div>

      {/* Month selector */}
      <form method="GET" className="mb-6 flex items-center gap-2">
        <label className="text-sm text-gray-600">月份：</label>
        <input
          name="month"
          type="month"
          defaultValue={month}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-700"
        >
          查詢
        </button>
      </form>

      {/* Store overview */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-gray-800">全店月報 — {month}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">課程總收入</p>
            <p className="text-lg font-bold text-gray-900">
              NT$ {storeSummary.totalCourseRevenue.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">退款</p>
            <p className="text-lg font-bold text-red-600">
              NT$ {Math.abs(storeSummary.totalRefund).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">完成服務</p>
            <p className="text-lg font-bold text-gray-900">{storeSummary.completedBookings} 堂</p>
          </div>
          <div className="rounded-xl border bg-indigo-50 p-4 shadow-sm">
            <p className="text-xs text-indigo-600">課程淨收（扣退款）</p>
            <p className="text-lg font-bold text-indigo-700">
              NT$ {storeSummary.netCourseRevenue.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-green-50 p-4">
            <p className="text-xs text-green-600">現金帳收入</p>
            <p className="text-base font-semibold text-green-700">
              NT$ {storeSummary.cashbookIncome.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-red-50 p-4">
            <p className="text-xs text-red-600">現金帳支出</p>
            <p className="text-base font-semibold text-red-700">
              NT$ {storeSummary.cashbookExpense.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-orange-50 p-4">
            <p className="text-xs text-orange-600">空間分租費</p>
            <p className="text-base font-semibold text-orange-700">
              NT$ {storeSummary.totalSpaceFee.toLocaleString()}
            </p>
          </div>
        </div>
      </section>

      {/* Per-staff breakdown */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-gray-800">店長明細 — {month}</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">店長</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">名下顧客</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">有效顧客</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">完成服務</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">課程收入</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">空間分租</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">淨收</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {storeSummary.staffBreakdown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    本月無資料
                  </td>
                </tr>
              )}
              {storeSummary.staffBreakdown.map((r) => (
                <tr key={r.staffId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.staffName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.customerCount}</td>
                  <td className="px-4 py-3 text-right text-green-600">{r.activeCustomerCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.completedBookings} 堂</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    NT$ {r.totalRevenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {r.spaceFee > 0 ? `NT$ ${r.spaceFee.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                    NT$ {r.netRevenue.toLocaleString()}
                  </td>
                </tr>
              ))}
              {/* Total row */}
              {storeSummary.staffBreakdown.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-700">合計</td>
                  <td className="px-4 py-3 text-right">
                    {storeSummary.staffBreakdown.reduce((s, r) => s + r.customerCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {storeSummary.staffBreakdown.reduce((s, r) => s + r.activeCustomerCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {storeSummary.staffBreakdown.reduce((s, r) => s + r.completedBookings, 0)} 堂
                  </td>
                  <td className="px-4 py-3 text-right">
                    NT$ {storeSummary.staffBreakdown.reduce((s, r) => s + r.totalRevenue, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    NT$ {storeSummary.staffBreakdown.reduce((s, r) => s + r.spaceFee, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-indigo-700">
                    NT$ {storeSummary.staffBreakdown.reduce((s, r) => s + r.netRevenue, 0).toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Revenue breakdown by category */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-gray-800">收入類型明細 — {month}</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">店長</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">體驗</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">單次</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">套餐</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">補差額</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">退款</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">淨收</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revenueByCategory.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    本月無資料
                  </td>
                </tr>
              )}
              {revenueByCategory.map((r) => (
                <tr key={r.staffId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.staffName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {r.trialRevenue > 0 ? `NT$ ${r.trialRevenue.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {r.singleRevenue > 0 ? `NT$ ${r.singleRevenue.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {r.packageRevenue > 0 ? `NT$ ${r.packageRevenue.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {r.supplementRevenue > 0 ? `NT$ ${r.supplementRevenue.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {r.refundAmount < 0 ? `NT$ ${r.refundAmount.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                    NT$ {r.netRevenue.toLocaleString()}
                  </td>
                </tr>
              ))}
              {revenueByCategory.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-700">合計</td>
                  <td className="px-4 py-3 text-right">
                    NT$ {revenueByCategory.reduce((s, r) => s + r.trialRevenue, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    NT$ {revenueByCategory.reduce((s, r) => s + r.singleRevenue, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    NT$ {revenueByCategory.reduce((s, r) => s + r.packageRevenue, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    NT$ {revenueByCategory.reduce((s, r) => s + r.supplementRevenue, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    NT$ {revenueByCategory.reduce((s, r) => s + r.refundAmount, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-indigo-700">
                    NT$ {revenueByCategory.reduce((s, r) => s + r.netRevenue, 0).toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Customer consumption detail (if selected) */}
      {consumptionDetail && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            顧客消費明細 — {consumptionDetail.customer.name}（{month}）
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">本期消費</p>
              <p className="text-lg font-bold text-gray-900">
                NT$ {consumptionDetail.summary.totalPurchased.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">本期扣堂</p>
              <p className="text-lg font-bold text-gray-900">
                {consumptionDetail.summary.totalDeductions} 堂
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">剩餘堂數</p>
              <p className="text-lg font-bold text-indigo-700">
                {consumptionDetail.summary.totalRemainingSessions} 堂
              </p>
            </div>
          </div>
          <table className="min-w-full divide-y divide-gray-200 rounded-xl border bg-white text-sm shadow-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">日期</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">類型</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">金額</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {consumptionDetail.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">{new Date(t.createdAt).toLocaleDateString("zh-TW")}</td>
                  <td className="px-4 py-2">{t.transactionType}</td>
                  <td className={`px-4 py-2 text-right font-medium ${Number(t.amount) < 0 ? "text-red-600" : ""}`}>
                    NT$ {Number(t.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-gray-400">{t.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold text-gray-800">顧客消費明細查詢</h2>
        <form method="GET" className="flex gap-2">
          <input type="hidden" name="month" value={month} />
          <input
            name="customerId"
            placeholder="輸入顧客 ID"
            defaultValue={params.customerId ?? ""}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">
            查詢
          </button>
        </form>
        <p className="mt-1 text-xs text-gray-400">
          也可至顧客詳情頁查看完整消費歷史
        </p>
      </section>

      {/* Export buttons */}
      <section className="mb-4 mt-8">
        <h2 className="mb-3 text-base font-semibold text-gray-800">匯出</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/export/store-monthly?month=${month}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            download
          >
            ⬇ 全店月報 CSV
          </a>
          <a
            href={`/api/export/staff-monthly?month=${month}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            download
          >
            ⬇ 店長月報 CSV
          </a>
          {params.customerId && (
            <a
              href={`/api/export/customer-consumption?customerId=${params.customerId}&month=${month}`}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              download
            >
              ⬇ 顧客消費明細 CSV
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
