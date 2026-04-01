import { listCustomers } from "@/server/queries/customer";
import { listStaff } from "@/server/queries/staff";
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
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const user = await getCurrentUser();

  const [{ customers, total, pageSize }, staffList] = await Promise.all([
    listCustomers({
      stage: params.stage,
      search: params.search,
      page,
      pageSize: 20,
    }),
    user?.role === "OWNER" ? listStaff() : Promise.resolve({ staff: [] }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">顧客管理</h1>
        <Link
          href="/dashboard/customers/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + 新增顧客
        </Link>
      </div>

      {/* 篩選列 */}
      <form method="GET" className="mb-4 flex flex-wrap gap-2">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="搜尋姓名 / 電話"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          name="stage"
          defaultValue={params.stage ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">所有狀態</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
        >
          搜尋
        </button>
      </form>

      {/* 顧客列表 */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">姓名</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">電話</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">狀態</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">直屬店長</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">有效預約</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">有效方案</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  尚無顧客資料
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      STAGE_COLOR[c.customerStage]
                    }`}
                  >
                    {STAGE_LABEL[c.customerStage]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.assignedStaff.displayName}</td>
                <td className="px-4 py-3 text-gray-600">
                  {c._count.bookings}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {c._count.planWallets}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/customers/${c.id}`}
                    className="text-indigo-600 hover:underline"
                  >
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            共 {total} 筆，第 {page} / {totalPages} 頁
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                上一頁
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
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
