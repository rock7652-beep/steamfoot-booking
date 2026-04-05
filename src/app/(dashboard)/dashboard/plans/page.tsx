import { listPlans } from "@/server/queries/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { PlanCategory } from "@prisma/client";

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "套餐",
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.length === 0 && (
          <p className="text-earth-400">尚無課程方案</p>
        )}
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border bg-white p-5 shadow-sm ${
              !plan.isActive ? "opacity-50" : ""
            }`}
          >
            <div className="mb-2 flex items-start justify-between">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  CATEGORY_COLOR[plan.category]
                }`}
              >
                {CATEGORY_LABEL[plan.category]}
              </span>
              {!plan.isActive && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600">
                  已下架
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-earth-900">{plan.name}</h2>
            <p className="mt-1 text-lg font-semibold text-primary-700">
              NT$ {Number(plan.price).toLocaleString()}
            </p>
            <p className="text-sm text-earth-500">{plan.sessionCount} 堂</p>
            {plan.validityDays && (
              <p className="text-xs text-earth-400">有效 {plan.validityDays} 天</p>
            )}
            {plan.description && (
              <p className="mt-2 text-xs text-earth-500">{plan.description}</p>
            )}
            {isOwner && (
              <div className="mt-3 border-t pt-3">
                <Link
                  href={`/dashboard/plans/${plan.id}/edit`}
                  className="text-sm text-primary-600 hover:underline"
                >
                  編輯
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
