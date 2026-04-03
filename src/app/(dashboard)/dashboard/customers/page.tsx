import { listCustomers } from "@/server/queries/customer";
import { updateCustomerStage } from "@/server/actions/customer";
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

  const { customers, total, pageSize } = await listCustomers({
    stage: params.stage,
    search: params.search,
    page,
    pageSize: 20,
  });

  const totalPages = Math.ceil(total / pageSize);

  // 共用：更新狀態 Server Action（讀取 hidden customerId）
  async function handleStageUpdate(formData: FormData) {
    "use server";
    const customerId = formData.get("customerId") as string;
    const stage = formData.get("stage") as "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE";
    await updateCustomerStage(customerId, stage);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← 首頁
          </Link>
          <h1 className="text-xl font-bold text-gray-900">顧客管理</h1>
        </div>
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
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
        >
          搜尋
        </button>
        <span className="ml-1 self-center text-xs text-gray-400">共 {total} 位顧客</span>
      </form>

      {/* 顧客卡片列表 */}
      {customers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-400">
          尚無顧客資料
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <div
              key={c.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* 顧客資訊 */}
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    <p className="text-sm text-gray-500">{c.phone}</p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[c.customerStage]}`}>
                    {STAGE_LABEL[c.customerStage]}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.assignedStaff.colorCode }}
                    />
                    {c.assignedStaff.displayName}
                  </span>
                  <span>有效方案 {c._count.planWallets} 份</span>
                  <span>預約 {c._count.bookings} 筆</span>
                </div>

                {/* 更新狀態 */}
                <form action={handleStageUpdate} className="mt-3 flex items-center gap-1.5">
                  <input type="hidden" name="customerId" value={c.id} />
                  <select
                    name="stage"
                    defaultValue={c.customerStage}
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {Object.entries(STAGE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                  >
                    更新狀態
                  </button>
                </form>
              </div>

              {/* 操作按鈕列 */}
              <div className="flex items-center gap-0 border-t border-gray-100">
                <Link
                  href={`/dashboard/customers/${c.id}#booking`}
                  className="flex-1 py-2.5 text-center text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  建立預約
                </Link>
                <span className="h-4 w-px bg-gray-200" />
                <Link
                  href={`/dashboard/customers/${c.id}#plan`}
                  className="flex-1 py-2.5 text-center text-xs font-medium text-green-600 hover:bg-green-50"
                >
                  指派方案
                </Link>
                <span className="h-4 w-px bg-gray-200" />
                <Link
                  href={`/dashboard/customers/${c.id}`}
                  className="flex-1 py-2.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  查看詳情
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>共 {total} 筆，第 {page} / {totalPages} 頁</span>
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
