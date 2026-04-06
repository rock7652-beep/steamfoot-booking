import { listCustomers } from "@/server/queries/customer";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { CustomerStage } from "@prisma/client";

const STAGE_LABEL: Record<CustomerStage, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

const STAGE_COLOR: Record<CustomerStage, string> = {
  LEAD: "bg-earth-100 text-earth-700",
  TRIAL: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-primary-100 text-primary-700",
  INACTIVE: "bg-yellow-50 text-yellow-700",
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
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const [{ customers, total, pageSize }, staffOptions] = await Promise.all([
    listCustomers({
      stage: params.stage,
      search: params.search,
      assignedStaffId: params.staff,
      page,
      pageSize: 20,
    }),
    listStaffSelectOptions(),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-earth-900">顧客管理</h1>
        <div className="flex gap-2">
          <a
            href="/api/export/customers"
            className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm font-medium text-earth-700 hover:bg-earth-50 active:bg-earth-100 transition-colors"
          >
            匯出
          </a>
          <Link
            href="/dashboard/customers/new"
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800 transition-colors"
          >
            + 新增
          </Link>
        </div>
      </div>

      {/* Search & filter */}
      <form method="GET" className="mb-4 flex flex-wrap gap-2">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="搜尋姓名 / 電話 / Email"
          className="min-w-0 flex-1 rounded-lg border border-earth-300 bg-white px-3 py-1.5 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        />
        <select
          name="stage"
          defaultValue={params.stage ?? ""}
          className="rounded-lg border border-earth-300 bg-white px-2 py-1.5 text-sm text-earth-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">全部狀態</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          name="staff"
          defaultValue={params.staff ?? ""}
          className="rounded-lg border border-earth-300 bg-white px-2 py-1.5 text-sm text-earth-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">全部店長</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.displayName}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-earth-100 px-3 py-1.5 text-sm font-medium text-earth-700 hover:bg-earth-200 transition-colors"
        >
          搜尋
        </button>
      </form>

      <p className="mb-3 text-xs text-earth-400">共 {total} 位顧客</p>

      {/* Customer table */}
      {customers.length === 0 ? (
        <div className="rounded-xl border border-earth-200 bg-white py-10 text-center">
          <p className="text-sm text-earth-500">{params.search || params.stage || params.staff ? "沒有符合條件的顧客" : "尚無顧客資料"}</p>
          {(params.search || params.stage || params.staff) && (
            <Link href="/dashboard/customers" className="mt-2 inline-block text-xs text-primary-600 hover:text-primary-700">清除篩選 →</Link>
          )}
          {!params.search && !params.stage && !params.staff && (
            <Link href="/dashboard/customers/new" className="mt-2 inline-block text-xs text-primary-600 hover:text-primary-700">新增第一位顧客 →</Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
          {/* Desktop table */}
          <table className="hidden w-full text-sm sm:table">
            <thead className="border-b border-earth-100 bg-earth-50/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-earth-600">姓名</th>
                <th className="px-4 py-3 text-left font-medium text-earth-600">電話</th>
                <th className="px-4 py-3 text-left font-medium text-earth-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-earth-600">直屬店長</th>
                <th className="px-4 py-3 text-center font-medium text-earth-600">狀態</th>
                <th className="px-4 py-3 text-right font-medium text-earth-600">剩餘堂數</th>
                <th className="px-4 py-3 text-right font-medium text-earth-600">最近消費</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-earth-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="font-medium text-primary-700 hover:text-primary-800 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-earth-600">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-earth-500 text-xs">
                    {c.email || c.user?.email || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.assignedStaff ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: c.assignedStaff.colorCode }}
                        />
                        <span className="text-earth-700">{c.assignedStaff.displayName}</span>
                      </span>
                    ) : (
                      <span className="text-earth-400">未指派</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[c.customerStage]}`}>
                      {STAGE_LABEL[c.customerStage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {c.totalRemainingSessions > 0 ? (
                      <span className="text-primary-600">{c.totalRemainingSessions} 堂</span>
                    ) : (
                      <span className="text-earth-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-earth-500">
                    {c.lastVisitAt
                      ? new Date(c.lastVisitAt).toLocaleDateString("zh-TW")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className="divide-y divide-earth-100 sm:hidden">
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className="block px-4 py-3 active:bg-earth-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-earth-900">{c.name}</span>
                    <span className="text-sm text-earth-500">{c.phone || ""}</span>
                  </div>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${STAGE_COLOR[c.customerStage]}`}>
                    {STAGE_LABEL[c.customerStage]}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-earth-500">
                  {c.assignedStaff ? (
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.assignedStaff.colorCode }}
                      />
                      {c.assignedStaff.displayName}
                    </span>
                  ) : (
                    <span className="text-earth-400">未指派</span>
                  )}
                  <span>
                    {c.totalRemainingSessions > 0 ? (
                      <span className="text-primary-600">剩 {c.totalRemainingSessions} 堂</span>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-earth-600">
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
                className="rounded-lg border border-earth-300 px-3 py-1 text-earth-700 hover:bg-earth-50 transition-colors"
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
                className="rounded-lg border border-earth-300 px-3 py-1 text-earth-700 hover:bg-earth-50 transition-colors"
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
