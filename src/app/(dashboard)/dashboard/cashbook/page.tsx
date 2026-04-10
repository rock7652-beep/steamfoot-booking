import { listCashbookEntries, getMonthlySummary } from "@/server/queries/cashbook";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getShopPlan } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import { FeatureGate } from "@/components/feature-gate";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { toLocalDateStr } from "@/lib/date-utils";
import type { CashbookEntryType } from "@prisma/client";

const ENTRY_TYPE_LABEL: Record<CashbookEntryType, string> = {
  INCOME: "收入",
  EXPENSE: "支出",
  WITHDRAW: "提領",
  ADJUSTMENT: "調整",
};

const ENTRY_TYPE_COLOR: Record<CashbookEntryType, string> = {
  INCOME: "bg-green-100 text-green-700",
  EXPENSE: "bg-red-100 text-red-700",
  WITHDRAW: "bg-orange-100 text-orange-700",
  ADJUSTMENT: "bg-earth-100 text-earth-600",
};

interface PageProps {
  searchParams: Promise<{
    month?: string;
    type?: CashbookEntryType;
    page?: string;
  }>;
}

export default async function CashbookPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashbook.read"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const page = Number(params.page ?? 1);

  const today = toLocalDateStr();
  const currentMonth = today.slice(0, 7); // "YYYY-MM"
  const month = params.month ?? currentMonth;

  const [year, mon] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;

  const [{ entries, total, pageSize }, summary, shopPlan] = await Promise.all([
    listCashbookEntries({
      dateFrom,
      dateTo,
      type: params.type,
      page,
      pageSize: 30,
    }),
    getMonthlySummary(month),
    getShopPlan(),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <FeatureGate plan={shopPlan} feature={FEATURES.CASHBOOK}>
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-earth-900">現金帳</h1>
        <Link
          href="/dashboard/cashbook/new"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + 新增記帳
        </Link>
      </div>

      {/* 月份選擇 */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-earth-500">月份</label>
          <input
            name="month"
            type="month"
            defaultValue={month}
            className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
          />
        </div>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">所有類型</option>
          {Object.entries(ENTRY_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-earth-100 px-3 py-1.5 text-sm text-earth-700 hover:bg-earth-200"
        >
          查詢
        </button>
      </form>

      {/* 月度統計 */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-green-50 p-4">
          <p className="text-xs text-green-600">收入</p>
          <p className="text-xl font-bold text-green-700">
            NT$ {summary.income.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border bg-red-50 p-4">
          <p className="text-xs text-red-600">支出 + 提領</p>
          <p className="text-xl font-bold text-red-700">
            NT$ {summary.expense.toLocaleString()}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${summary.net >= 0 ? "bg-primary-50" : "bg-orange-50"}`}>
          <p className={`text-xs ${summary.net >= 0 ? "text-primary-600" : "text-orange-600"}`}>
            淨額
          </p>
          <p
            className={`text-xl font-bold ${
              summary.net >= 0 ? "text-primary-700" : "text-orange-700"
            }`}
          >
            NT$ {summary.net.toLocaleString()}
          </p>
        </div>
      </div>

      {/* 明細列表 */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-earth-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-earth-600">日期</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">類型</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">分類</th>
              <th className="px-4 py-3 text-right font-medium text-earth-600">金額</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">歸屬店長</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">備註</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-0">
                  <EmptyState
                    icon="empty"
                    title="尚無現金帳記錄"
                    description="新增第一筆現金帳記錄來開始追蹤"
                  />
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-earth-50">
                <td className="px-4 py-3 text-earth-600">
                  {new Date(e.entryDate).toLocaleDateString("zh-TW")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      ENTRY_TYPE_COLOR[e.type]
                    }`}
                  >
                    {ENTRY_TYPE_LABEL[e.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-earth-600">{e.category ?? "—"}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    e.type === "INCOME" ? "text-green-700" : "text-red-700"
                  }`}
                >
                  NT$ {Number(e.amount).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-earth-600">
                  {e.staff?.displayName ?? "未指定"}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-earth-400">
                  {e.note ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/cashbook/${e.id}/edit`}
                    className="text-primary-600 hover:underline"
                  >
                    編輯
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-earth-600">
          <span>
            共 {total} 筆，第 {page} / {totalPages} 頁
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams(Object.fromEntries(Object.entries({ ...params, page: String(page - 1) }).filter(([, v]) => v != null)))}`}
                className="rounded border px-3 py-1 hover:bg-earth-50"
              >
                上一頁
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams(Object.fromEntries(Object.entries({ ...params, page: String(page + 1) }).filter(([, v]) => v != null)))}`}
                className="rounded border px-3 py-1 hover:bg-earth-50"
              >
                下一頁
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
    </FeatureGate>
  );
}
