import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getFrontendPlans } from "@/server/queries/plan";
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

export default async function ShopPage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeId = storeCtx?.storeId;
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";

  const plans = storeId ? await getFrontendPlans(storeId) : [];

  const prefix = `/s/${storeSlug}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-earth-900">購買方案</h1>
        <p className="mt-1 text-sm text-earth-500">
          選擇您需要的方案，透過銀行轉帳購買
        </p>
      </div>

      {/* Plan list */}
      {plans.length === 0 ? (
        <div className="rounded-xl border border-earth-200 bg-white py-12 text-center">
          <p className="text-sm text-earth-500">目前沒有可購買的方案</p>
          <p className="mt-1 text-xs text-earth-400">請聯絡店長了解優惠方案</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const price = Number(plan.price);
            const avgPerSession = plan.sessionCount > 0 ? Math.round(price / plan.sessionCount) : 0;
            return (
              <Link
                key={plan.id}
                href={`${prefix}/book/shop/${plan.id}/checkout`}
                className="block rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_COLOR[plan.category]}`}>
                        {CATEGORY_LABEL[plan.category]}
                      </span>
                      <h3 className="font-semibold text-earth-900">{plan.name}</h3>
                    </div>
                    {plan.description && (
                      <p className="mt-1.5 text-sm text-earth-500">{plan.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-earth-500">
                      <span>{plan.sessionCount} 堂</span>
                      {avgPerSession > 0 && plan.sessionCount > 1 && (
                        <span>均 NT$ {avgPerSession.toLocaleString()}/堂</span>
                      )}
                      {plan.validityDays && <span>{plan.validityDays} 天有效</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-primary-700">
                      NT$ {price.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-earth-400">點擊購買 →</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Back link */}
      <div className="mt-6 text-center">
        <Link
          href={`${prefix}/book`}
          className="text-sm text-earth-500 hover:text-earth-700"
        >
          ← 返回首頁
        </Link>
      </div>
    </div>
  );
}
