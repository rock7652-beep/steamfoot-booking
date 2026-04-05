import { listTransactions } from "@/server/queries/transaction";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { TransactionType, PaymentMethod } from "@prisma/client";

const TX_TYPE_LABEL: Record<TransactionType, string> = {
  TRIAL_PURCHASE: "體驗購買",
  SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "套餐購買",
  SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
};

const TX_TYPE_COLOR: Record<TransactionType, string> = {
  TRIAL_PURCHASE: "bg-purple-100 text-purple-700",
  SINGLE_PURCHASE: "bg-blue-100 text-blue-700",
  PACKAGE_PURCHASE: "bg-green-100 text-green-700",
  SESSION_DEDUCTION: "bg-earth-100 text-earth-600",
  SUPPLEMENT: "bg-yellow-100 text-yellow-700",
  REFUND: "bg-red-100 text-red-700",
  ADJUSTMENT: "bg-orange-100 text-orange-700",
};

const PAY_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "現金",
  TRANSFER: "匯款",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
  UNPAID: "未付款",
};

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    transactionType?: TransactionType;
    page?: string;
  }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "transaction.read"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const page = Number(params.page ?? 1);

  const today = new Date().toISOString().slice(0, 10);
  // 預設：本月
  const firstDayOfMonth = today.slice(0, 8) + "01";
  const dateFrom = params.dateFrom ?? firstDayOfMonth;
  const dateTo = params.dateTo ?? today;

  const { transactions, total, pageSize } = await listTransactions({
    dateFrom,
    dateTo,
    transactionType: params.transactionType,
    page,
    pageSize: 30,
  });

  const totalPages = Math.ceil(total / pageSize);

  // 統計本頁收入
  const pageRevenue = transactions
    .filter((t) =>
      ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"].includes(
        t.transactionType
      )
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">
            ← 首頁
          </Link>
          <h1 className="text-xl font-bold text-earth-900">交易紀錄</h1>
        </div>
      </div>

      {/* 篩選列 */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-earth-500">開始日期</label>
          <input
            name="dateFrom"
            type="date"
            defaultValue={dateFrom}
            className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-earth-500">結束日期</label>
          <input
            name="dateTo"
            type="date"
            defaultValue={dateTo}
            className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
          />
        </div>
        <select
          name="transactionType"
          defaultValue={params.transactionType ?? ""}
          className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">所有類型</option>
          {Object.entries(TX_TYPE_LABEL).map(([k, v]) => (
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

      {/* 快速統計 */}
      <div className="mb-4 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800">
        本頁收入合計：
        <strong className="ml-1">NT$ {pageRevenue.toLocaleString()}</strong>
        <span className="ml-3 text-xs text-primary-500">（共 {total} 筆交易）</span>
      </div>

      {/* 交易列表 */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-earth-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-earth-600">日期</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">顧客</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">類型</th>
              <th className="px-4 py-3 text-right font-medium text-earth-600">金額</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">付款方式</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">歸屬店長</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-earth-400">
                  無交易紀錄
                </td>
              </tr>
            )}
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-earth-50">
                <td className="px-4 py-3 text-earth-600">
                  {new Date(t.createdAt).toLocaleDateString("zh-TW")}
                </td>
                <td className="px-4 py-3 text-earth-900">{t.customer.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      TX_TYPE_COLOR[t.transactionType]
                    }`}
                  >
                    {TX_TYPE_LABEL[t.transactionType]}
                  </span>
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    Number(t.amount) < 0 ? "text-red-600" : "text-earth-900"
                  }`}
                >
                  {Number(t.amount) < 0 ? "-" : ""}
                  NT$ {Math.abs(Number(t.amount)).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-earth-600">
                  {PAY_METHOD_LABEL[t.paymentMethod]}
                </td>
                <td className="px-4 py-3 text-earth-600">{t.revenueStaff.displayName}</td>
                <td className="max-w-xs truncate px-4 py-3 text-earth-400">
                  {t.note ?? "—"}
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
                href={`?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                className="rounded border px-3 py-1 hover:bg-earth-50"
              >
                上一頁
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
                className="rounded border px-3 py-1 hover:bg-earth-50"
              >
                下一頁
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
