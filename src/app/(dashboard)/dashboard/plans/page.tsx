import { listPlans } from "@/server/queries/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { PlanCategory } from "@prisma/client";

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

const CATEGORY_COLOR: Record<PlanCategory, string> = {
  TRIAL: "bg-purple-100 text-purple-700",
  SINGLE: "bg-blue-100 text-blue-700",
  PACKAGE: "bg-green-100 text-green-700",
};

interface PageProps {
  searchParams: Promise<{ showAll?: string }>;
}

export default async function PlansPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const showAll = params.showAll === "1";
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "wallet.read"))) {
    redirect("/dashboard");
  }
  const isOwner = user.role === "OWNER";

  const plans = await listPlans(showAll);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">
            ← 首頁
          </Link>
          <h1 className="text-xl font-bold text-earth-900">課程方案</h1>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <Link
              href="/dashboard/plans/new"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              + 新增方案
            </Link>
          )}
        </div>
      </div>

      {/* 顯示篩選 */}
      <div className="mb-4 flex gap-2">
        <Link
          href="?showAll=0"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            !showAll
              ? "bg-primary-600 text-white"
              : "bg-earth-100 text-earth-700 hover:bg-earth-200"
          }`}
        >
          上架中
        </Link>
        <Link
          href="?showAll=1"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            showAll
              ? "bg-primary-600 text-white"
              : "bg-earth-100 text-earth-700 hover:bg-earth-200"
          }`}
        >
          全部（含下架）
        </Link>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-earth-200 bg-white py-12 text-center shadow-sm">
          <p className="text-sm text-earth-400">尚無課程方案</p>
        </div>
      ) : (
        <div className="rounded-xl border border-earth-200 bg-white shadow-sm overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-200 bg-earth-50">
                  <th className="px-4 py-3 text-left font-medium text-earth-500">類別</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-500">方案名稱</th>
                  <th className="px-4 py-3 text-right font-medium text-earth-500">價格</th>
                  <th className="px-4 py-3 text-right font-medium text-earth-500">堂數</th>
                  <th className="px-4 py-3 text-right font-medium text-earth-500">單堂均價</th>
                  <th className="px-4 py-3 text-right font-medium text-earth-500">有效天數</th>
                  <th className="px-4 py-3 text-center font-medium text-earth-500">狀態</th>
                  {isOwner && (
                    <th className="px-4 py-3 text-center font-medium text-earth-500">操作</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {plans.map((plan) => {
                  const price = Number(plan.price);
                  const avgPrice = plan.sessionCount > 0 ? Math.round(price / plan.sessionCount) : 0;
                  return (
                    <tr
                      key={plan.id}
                      className={`transition-colors hover:bg-earth-50 ${!plan.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_COLOR[plan.category]}`}>
                          {CATEGORY_LABEL[plan.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-earth-900">{plan.name}</span>
                          {plan.description && (
                            <p className="mt-0.5 text-xs text-earth-400 line-clamp-1">{plan.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-700">
                        ${price.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-earth-700">
                        {plan.sessionCount} 堂
                      </td>
                      <td className="px-4 py-3 text-right text-earth-500">
                        ${avgPrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-earth-500">
                        {plan.validityDays ? `${plan.validityDays} 天` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {plan.isActive ? (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">上架</span>
                        ) : (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">下架</span>
                        )}
                      </td>
                      {isOwner && (
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/dashboard/plans/${plan.id}/edit`}
                            className="text-sm text-primary-600 hover:underline"
                          >
                            編輯
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden divide-y divide-earth-100">
            {plans.map((plan) => {
              const price = Number(plan.price);
              const avgPrice = plan.sessionCount > 0 ? Math.round(price / plan.sessionCount) : 0;
              return (
                <div
                  key={plan.id}
                  className={`px-4 py-3 ${!plan.isActive ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_COLOR[plan.category]}`}>
                        {CATEGORY_LABEL[plan.category]}
                      </span>
                      <span className="font-medium text-earth-900">{plan.name}</span>
                    </div>
                    {!plan.isActive && (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600">下架</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <div className="flex gap-3 text-earth-500">
                      <span className="font-semibold text-primary-700">${price.toLocaleString()}</span>
                      <span>{plan.sessionCount} 堂</span>
                      <span>均 ${avgPrice.toLocaleString()}/堂</span>
                      {plan.validityDays && <span>{plan.validityDays} 天</span>}
                    </div>
                    {isOwner && (
                      <Link
                        href={`/dashboard/plans/${plan.id}/edit`}
                        className="text-primary-600 hover:underline"
                      >
                        編輯
                      </Link>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-1 text-xs text-earth-400 line-clamp-1">{plan.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
