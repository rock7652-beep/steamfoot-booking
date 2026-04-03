import { listCustomers } from "@/server/queries/customer";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";
import type { CustomerStage } from "@prisma/client";

const STAGE_LABEL: Record<CustomerStage, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

const STAGE_COLOR: Record<CustomerStage, string> = {
  LEAD: "bg-gray-100 text-gray-700",
  TRIAL: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-yellow-100 text-yellow-700",
};

interface PageProps {
  searchParams: Promise<{
    stage?: CustomerStage;
    search?: string;
    staff?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const user = await getCurrentUser();

  const { customers, total, pageSize } = await listCustomers({
    stage: params.stage,
    search: params.search,
    assignedStaffId: params.staff,
    page,
    pageSize: 20,
  });

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">顧客管理</h1>
        <div className="flex gap-2">
          <a
            href="/api/export/customers"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            匯出
          </a>
          <Link
            href="/dashboard/customers/new"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 active:bg-indigo-800"
          >
            + 新增
          </Link>
        </div>
      </div>

      {/* 搜尋與篩選列 */}
      <form method="GET" className="mb-4 flex flex-wrap gap-2">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="搜尋姓名 / 電話 / Email"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          name="stage"
          defaultValue={params.stage ?? ""}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
        >
          <option value="">全部狀態</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          搜尋
        </button>
      </form>

      <p className="mb-3 text-xs text-gray-400">共 {total} 位顧客</p>

      {/* 顧客表格 */}
      {customers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-400">
          尚無顧客資料
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Desktop 表格 */}
          <table className="hidden w-full text-sm sm:table">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">姓名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">電話</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">直屬店長</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">狀態</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">剩餘堂數</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">最近消費</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.email || c.user?.email || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.assignedStaff ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: c.assignedStaff.colorCode }}
                        />
                        <span className="text-gray-700">{c.assignedStaff.displayName}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">未指派</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[c.customerStage]}`}>
                      {STAGE_LABEL[c.customerStage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {c.totalRemainingSessions > 0 ? (
                      <span className="text-green-600">{c.totalRemainingSessions} 堂</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    {c.lastVisitAt
                      ? new Date(c.lastVisitAt).toLocaleDateString("zh-TW")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile 兩行式列表 */}
          <div className="divide-y divide-gray-50 sm:hidden">
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className="block px-4 py-3 active:bg-gray-50"
              >
                {/* 第一行：姓名、電話、狀態 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="text-sm text-gray-500">{c.phone || ""}</span>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STAGE_COLOR[c.customerStage]}`}>
                    {STAGE_LABEL[c.customerStage]}
                  </span>
                </div>
                {/* 第二行：店長、剩餘堂數、最近消費 */}
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  {c.assignedStaff ? (
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.assignedStaff.colorCode }}
                      />
                      {c.assignedStaff.displayName}
                    </span>
                  ) : (
                    <span className="text-gray-400">未指派</span>
                  )}
                  <span>
                    {c.totalRemainingSessions > 0 ? (
                      <span className="text-green-600">剩 {c.totalRemainingSessions} 堂</span>
                    ) : (
                      "剩 0 堂"
                    )}
                  </span>
                  <span>
                    {c.lastVisitAt
                      ? new Date(c.lastVisitAt).toLocaleDateString("zh-TW")
                      : "—"}
                  </span>
                  {(c.email || c.user?.email) && (
                    <span className="truncate max-w-[120px]">
                      {c.email || c.user?.email}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>第 {page} / {totalPages} 頁</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({
                  ...(params.search ? { search: params.search } : {}),
                  ...(params.stage ? { stage: params.stage } : {}),
                  ...(params.staff ? { staff: params.staff } : {}),
                  page: String(page - 1),
                })}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                上一頁
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams({
                  ...(params.search ? { search: params.search } : {}),
                  ...(params.stage ? { stage: params.stage } : {}),
                  ...(params.staff ? { staff: params.staff } : {}),
                  page: String(page + 1),
                })}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
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
